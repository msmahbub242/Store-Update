import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Papa from 'papaparse';
import { 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  SlidersHorizontal, 
  Check, 
  RotateCcw,
  Eye,
  EyeOff,
  Filter,
  X,
  RefreshCw,
  Radio,
  AlertTriangle
} from 'lucide-react';

const PUB_BASE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTfhCfn7zzRTq8e3hrpRtdt4MIbz6a_fPQNKmtA6xQLYugd5Z_JJ0lJLKpvORo78Q';
const PUBHTML_URL = `${PUB_BASE}/pubhtml`;

interface TabItem {
  name: string;
  gid: string;
}

// Initial fallback tabs if pubhtml is loading
const INITIAL_TABS: TabItem[] = [
  { name: 'LC WAIKIKI(Tariq sir)', gid: '951520833' },
  { name: 'BR sujoy', gid: '1524254458' },
  { name: 'BR Fahim', gid: '1304576963' },
  { name: 'Monoprix', gid: '793642162' },
  { name: 'TESCO', gid: '1101532121' },
  { name: 'OVS', gid: '1369675807' },
  { name: 'Madam', gid: '1025651909' },
  { name: 'Thread 56-91', gid: '653850102' },
  { name: 'Elastic 56-91', gid: '365846287' },
  { name: 'T-ELASTIC', gid: '1319035009' },
];

export default function App() {
  const [tabs, setTabs] = useState<TabItem[]>(INITIAL_TABS);
  const [rawData, setRawData] = useState<any[]>([]);
  const [activeTabName, setActiveTabName] = useState<string>(INITIAL_TABS[0].name);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [isColumnPanelOpen, setIsColumnPanelOpen] = useState(false);
  const [showHeaderFilterRow, setShowHeaderFilterRow] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const rowsPerPage = 12;

  // 1. Dynamic Discovery of current Sheet Tabs and their GIDs directly from Google's pubhtml
  // This completely solves the HTTP 400 error when Excel (.xlsx) files regenerate GIDs upon re-upload!
  const discoverTabs = useCallback(async (): Promise<TabItem[]> => {
    try {
      const res = await fetch(PUBHTML_URL);
      if (!res.ok) return tabs;
      const html = await res.text();
      
      const regex = /items\.push\(\{name:\s*"([^"]+)",\s*pageUrl:[^}]+gid:\s*"([^"]+)"/g;
      const foundTabs: TabItem[] = [];
      let match;
      while ((match = regex.exec(html)) !== null) {
        const name = match[1];
        const gid = match[2];
        // Filter out generic empty Sheet names unless they are the only ones
        if (!name.startsWith('Sheet4') && !name.startsWith('Sheet9')) {
          foundTabs.push({ name, gid });
        }
      }

      if (foundTabs.length > 0) {
        setTabs(foundTabs);
        return foundTabs;
      }
    } catch (err) {
      console.warn('Could not refresh pubhtml tabs dynamically, using existing tabs:', err);
    }
    return tabs;
  }, [tabs]);

  // Current active tab item
  const currentTab = useMemo(() => {
    return tabs.find(t => t.name === activeTabName) || tabs[0] || INITIAL_TABS[0];
  }, [tabs, activeTabName]);

  // Fetch CSV for the selected tab
  const fetchTabData = useCallback(async (tabToFetch: TabItem, isSilent = false) => {
    if (!tabToFetch || !tabToFetch.gid) return;

    if (!isSilent) setIsLoading(true);
    setIsRefreshing(true);

    try {
      const csvUrl = `${PUB_BASE}/pub?gid=${tabToFetch.gid}&single=true&output=csv`;
      let response = await fetch(csvUrl);

      // If Google returns 400, the GID changed in Google Drive! Re-discover live GIDs from pubhtml immediately!
      if (!response.ok && response.status === 400) {
        console.warn('GID changed on Google Drive. Re-discovering live tabs...');
        const updatedTabs = await discoverTabs();
        const freshTab = updatedTabs.find(t => t.name === tabToFetch.name) || updatedTabs[0];
        if (freshTab && freshTab.gid !== tabToFetch.gid) {
          const freshCsvUrl = `${PUB_BASE}/pub?gid=${freshTab.gid}&single=true&output=csv`;
          response = await fetch(freshCsvUrl);
        }
      }

      if (!response.ok) {
        throw new Error(`Google Sheets responded with HTTP status ${response.status}`);
      }

      const csvText = await response.text();
      const trimmed = csvText.trim();

      if (trimmed.startsWith('<!DOCTYPE html') || trimmed.startsWith('<html')) {
        throw new Error('Google is updating the published sheet. Preserving current view.');
      }

      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: 'greedy',
        complete: (results) => {
          if (!results.data || !Array.isArray(results.data) || results.data.length === 0) {
            setSyncNotice('Waiting for spreadsheet rows to load...');
            return;
          }

          const cleanedData = (results.data as any[]).map(row => {
            if (!row || typeof row !== 'object') return {};
            const newRow: any = {};
            Object.keys(row).forEach(key => {
              const trimmedKey = key.trim();
              if (
                trimmedKey && 
                !trimmedKey.endsWith('_1') && 
                !trimmedKey.endsWith('_2') && 
                !trimmedKey.startsWith('__parsed_extra')
              ) {
                const cellVal = row[key];
                newRow[trimmedKey] = typeof cellVal === 'string' ? cellVal.trim() : cellVal;
              }
            });
            return newRow;
          }).filter(row => Object.values(row).some(v => v !== undefined && v !== null && v !== ''));

          if (cleanedData.length > 0) {
            setRawData(cleanedData);
            setSyncNotice(null);
            setLastUpdated(new Date());
          }
        },
        error: (err) => {
          console.error('CSV Parsing error:', err);
          setSyncNotice(`Parsing notice: ${err.message}`);
        }
      });
    } catch (err: any) {
      console.warn('Sync notice:', err.message);
      setSyncNotice(err.message || 'Connecting to Google Sheet...');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [discoverTabs]);

  // Initial load: discover tabs and fetch first tab
  useEffect(() => {
    (async () => {
      const freshTabs = await discoverTabs();
      const initialTab = freshTabs.find(t => t.name === activeTabName) || freshTabs[0];
      if (initialTab) {
        fetchTabData(initialTab, false);
      }
    })();
  }, []);

  // When tab selection changes
  const handleTabChange = (name: string) => {
    setActiveTabName(name);
    setCurrentPage(1);
    setColumnFilters({});
    const target = tabs.find(t => t.name === name);
    if (target) {
      fetchTabData(target, false);
    }
  };

  // Background Auto-Sync (Every 20 seconds, re-validates latest data and GIDs)
  useEffect(() => {
    if (!isAutoRefreshEnabled) return;

    const intervalId = setInterval(async () => {
      // Re-fetch current tab
      if (currentTab) {
        fetchTabData(currentTab, true);
      }
    }, 20000);

    return () => clearInterval(intervalId);
  }, [isAutoRefreshEnabled, currentTab, fetchTabData]);

  // All detected columns in the current data
  const allColumns = useMemo(() => {
    if (rawData.length === 0) return [];
    const keys = new Set<string>();
    rawData.forEach(row => {
      if (row && typeof row === 'object') {
        Object.keys(row).forEach(k => {
          if (k) keys.add(k);
        });
      }
    });
    return Array.from(keys);
  }, [rawData]);

  // Columns currently visible
  const visibleColumns = useMemo(() => {
    return allColumns.filter(col => !hiddenColumns.includes(col));
  }, [allColumns, hiddenColumns]);

  const toggleColumnVisibility = (columnName: string) => {
    setHiddenColumns(prev => 
      prev.includes(columnName)
        ? prev.filter(c => c !== columnName)
        : [...prev, columnName]
    );
  };

  const showAllColumns = () => setHiddenColumns([]);
  
  const hideAllColumns = () => {
    if (allColumns.length > 3) {
      setHiddenColumns(allColumns.slice(4));
    }
  };

  const setColumnFilter = (col: string, val: string) => {
    setColumnFilters(prev => ({ ...prev, [col]: val }));
    setCurrentPage(1);
  };

  // Filtered dataset combining global filter and header column filters
  const filteredData = useMemo(() => {
    return rawData.filter(row => {
      if (!row) return false;

      // Global Search
      if (globalFilter.trim()) {
        const query = globalFilter.toLowerCase();
        const matchesGlobal = Object.values(row).some(val => 
          String(val ?? '').toLowerCase().includes(query)
        );
        if (!matchesGlobal) return false;
      }

      // Column-Specific Header Filters
      for (const [col, colFilterVal] of Object.entries(columnFilters)) {
        if (!colFilterVal || !colFilterVal.trim()) continue;
        const cellValue = String(row[col] ?? '').toLowerCase();
        if (!cellValue.includes(colFilterVal.toLowerCase().trim())) {
          return false;
        }
      }

      return true;
    });
  }, [rawData, globalFilter, columnFilters]);

  // Total DZN calculation (checks DZN or DZN QTY in various tabs)
  const totalDzn = useMemo(() => {
    return filteredData.reduce((acc, row) => {
      if (!row) return acc;
      const dznKey = Object.keys(row).find(k => k.toLowerCase().includes('dzn'));
      const val = dznKey ? parseFloat(String(row[dznKey]).replace(/,/g, '')) : NaN;
      return acc + (isNaN(val) ? 0 : val);
    }, 0);
  }, [filteredData]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredData.length / rowsPerPage));
  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = filteredData.slice(indexOfFirstRow, indexOfLastRow);

  const isStatusColumn = (colName: string) => {
    const lower = colName.toLowerCase();
    return (
      lower.includes('update') || 
      lower.includes('fabric') || 
      lower.includes('sewing') || 
      lower.includes('finishing') || 
      lower.includes('accessories')
    );
  };

  const getStatusPill = (val: string) => {
    const text = (val ?? '').toString().trim();
    if (!text) {
      return <span className="text-slate-400 italic text-xs">-</span>;
    }
    const isOk = text.toLowerCase() === 'ok';
    return (
      <span 
        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border shadow-2xs tracking-wide ${
          isOk 
            ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
            : 'bg-rose-100 text-rose-800 border-rose-300'
        }`}
      >
        {isOk && <Check size={12} className="mr-1 inline stroke-[3]" />}
        {text}
      </span>
    );
  };

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-screen text-slate-800 font-sans">
      {/* Top Header */}
      <div className="flex flex-col items-center justify-center mb-6">
        <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-600 text-white px-8 py-3.5 rounded-full shadow-lg border border-blue-400/30 flex items-center space-x-3">
          <span className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse"></span>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-wide drop-shadow-sm">
            Felix Store - Materials Status
          </h1>
        </div>

        {/* Live sync status banner */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-3 text-xs text-slate-500">
          <div className="flex items-center gap-1.5 font-medium">
            <Radio size={14} className={isAutoRefreshEnabled ? 'text-emerald-500 animate-pulse' : 'text-slate-400'} />
            <span>Auto-Sync:</span>
            <button
              onClick={() => setIsAutoRefreshEnabled(!isAutoRefreshEnabled)}
              className={`font-bold px-2 py-0.5 rounded cursor-pointer transition ${
                isAutoRefreshEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {isAutoRefreshEnabled ? 'ACTIVE (20s)' : 'PAUSED'}
            </button>
          </div>

          <span className="text-slate-300">•</span>

          <div>
            Last sync:{' '}
            <span className="font-semibold text-slate-700">
              {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Connecting...'}
            </span>
          </div>

          <span className="text-slate-300">•</span>

          <button
            onClick={() => {
              discoverTabs().then(freshTabs => {
                const target = freshTabs.find(t => t.name === activeTabName) || freshTabs[0];
                if (target) fetchTabData(target, false);
              });
            }}
            disabled={isRefreshing}
            className="flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-md transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
            <span>{isRefreshing ? 'Syncing...' : 'Refresh Now'}</span>
          </button>
        </div>
      </div>

      {/* Sync Notice Banner if any */}
      {syncNotice && (
        <div className="max-w-4xl mx-auto mb-6 p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2 text-xs">
            <AlertTriangle className="text-amber-600 shrink-0" size={16} />
            <span>{syncNotice}</span>
          </div>
          <button
            onClick={() => fetchTabData(currentTab, false)}
            className="px-2.5 py-1 bg-amber-200 hover:bg-amber-300 text-amber-900 rounded text-xs font-bold transition cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Orders</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">{filteredData.length}</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg border border-blue-100">
            📦
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total DZN</p>
            <p className="text-2xl font-extrabold text-indigo-900 mt-1">
              {totalDzn.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg border border-indigo-100">
            📊
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Visible Columns</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">
              {visibleColumns.length} <span className="text-sm font-normal text-slate-400">/ {allColumns.length}</span>
            </p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-lg border border-amber-100">
            👀
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Tab</p>
            <p className="text-base font-bold text-emerald-700 mt-1 truncate max-w-[150px]" title={activeTabName}>
              {activeTabName}
            </p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg border border-emerald-100">
            🏷️
          </div>
        </div>
      </div>

      {/* Buyer Tabs (Dynamically Discovered & Updated) */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-2 mb-6 scrollbar-none">
        {tabs.map(tab => (
          <button
            key={tab.name}
            className={`px-4.5 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap cursor-pointer ${
              activeTabName === tab.name
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-600 ring-offset-2'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 hover:text-slate-900 shadow-xs'
            }`}
            onClick={() => handleTabChange(tab.name)}
          >
            {tab.name}
          </button>
        ))}
      </div>

      {/* Action Bar (Search + Column Visibility + Filter Toggle) */}
      <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200 mb-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Global Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            placeholder="Search by Buyer, PO, Style, Item, Remark, etc..."
            value={globalFilter}
            onChange={(e) => {
              setGlobalFilter(e.target.value);
              setCurrentPage(1);
            }}
          />
          {globalFilter && (
            <button 
              onClick={() => setGlobalFilter('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Header Filters Toggle */}
          <button
            onClick={() => setShowHeaderFilterRow(prev => !prev)}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              showHeaderFilterRow || Object.values(columnFilters).some(Boolean)
                ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
            title="Toggle individual column header filters"
          >
            <Filter size={15} />
            <span>Column Filters</span>
            {Object.values(columnFilters).filter(Boolean).length > 0 && (
              <span className="bg-indigo-600 text-white rounded-full px-1.5 py-0.2 text-[10px] font-bold">
                {Object.values(columnFilters).filter(Boolean).length}
              </span>
            )}
          </button>

          {/* Column Visibility Control Button */}
          <button
            onClick={() => setIsColumnPanelOpen(prev => !prev)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              isColumnPanelOpen
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal size={15} />
            <span>Customize Columns</span>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
              isColumnPanelOpen ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              {visibleColumns.length}
            </span>
          </button>
        </div>
      </div>

      {/* Column Visibility Panel (Expandable) */}
      {isColumnPanelOpen && (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-blue-200 mb-6 transition-all">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-2 mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-blue-600" />
                Column Visibility Manager
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Toggle checkmarks to show or hide specific columns in the table below.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={showAllColumns}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center gap-1.5 transition cursor-pointer"
              >
                <Eye size={13} />
                Show All
              </button>
              <button
                onClick={hideAllColumns}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center gap-1.5 transition cursor-pointer"
              >
                <EyeOff size={13} />
                Hide Extra
              </button>
              <button
                onClick={() => setHiddenColumns([])}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg text-blue-600 hover:bg-blue-50 flex items-center gap-1.5 transition cursor-pointer"
              >
                <RotateCcw size={13} />
                Reset
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
            {allColumns.map(col => {
              const isVisible = !hiddenColumns.includes(col);
              const isStatus = isStatusColumn(col);
              return (
                <label
                  key={col}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium cursor-pointer transition select-none ${
                    isVisible
                      ? 'bg-blue-50/70 border-blue-300 text-blue-900 font-semibold'
                      : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isVisible}
                    onChange={() => toggleColumnVisibility(col)}
                    className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 border-slate-300"
                  />
                  <span className="truncate" title={col}>
                    {col}
                  </span>
                  {isStatus && (
                    <span className="ml-auto w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Status Column" />
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Table Container with FULL COMPLETE CELL BORDERS */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-300 overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="py-20 text-center text-slate-500">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mb-3"></div>
              <p className="font-semibold text-sm">Loading latest data from Google Sheet...</p>
            </div>
          ) : visibleColumns.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <p className="text-sm font-semibold">All columns are hidden.</p>
              <button
                onClick={showAllColumns}
                className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold"
              >
                Restore Columns
              </button>
            </div>
          ) : (
            <table className="w-full text-left border-collapse border border-slate-300">
              <thead>
                {/* Main Table Column Header */}
                <tr className="bg-slate-100 text-slate-800">
                  {visibleColumns.map((col) => (
                    <th 
                      key={col} 
                      className="p-3.5 font-bold text-xs uppercase tracking-wider border border-slate-300 bg-slate-100 whitespace-nowrap select-none"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>{col}</span>
                        {isStatusColumn(col) && (
                          <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-normal normal-case">
                            status
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>

                {/* Optional In-Header Filter Row */}
                {showHeaderFilterRow && (
                  <tr className="bg-slate-50 border-b border-slate-300">
                    {visibleColumns.map((col) => (
                      <th key={`filter-${col}`} className="p-1.5 border border-slate-300 bg-slate-50">
                        <input
                          type="text"
                          placeholder={`Filter ${col}...`}
                          value={columnFilters[col] || ''}
                          onChange={(e) => setColumnFilter(col, e.target.value)}
                          className="w-full text-xs font-normal px-2 py-1 bg-white border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none placeholder:text-slate-400"
                        />
                      </th>
                    ))}
                  </tr>
                )}
              </thead>

              <tbody>
                {currentRows.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length} className="py-12 text-center text-slate-400 border border-slate-300">
                      No matching records found.
                    </td>
                  </tr>
                ) : (
                  currentRows.map((row, i) => (
                    <tr 
                      key={i} 
                      className={`${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-blue-50/40 transition-colors`}
                    >
                      {visibleColumns.map((col) => {
                        const val = row[col];
                        const isStatus = isStatusColumn(col);
                        return (
                          <td 
                            key={col} 
                            className="p-3 text-sm text-slate-800 border border-slate-300 whitespace-nowrap"
                          >
                            {isStatus ? getStatusPill(val) : (val !== undefined && val !== null && val !== '' ? val : '-')}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
        
        {/* Pagination & Row Counter */}
        <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-slate-50 border-t border-slate-300 gap-3">
          <p className="text-xs text-slate-600 font-medium">
            Showing <span className="font-bold text-slate-900">{filteredData.length > 0 ? indexOfFirstRow + 1 : 0}</span> to{' '}
            <span className="font-bold text-slate-900">{Math.min(indexOfLastRow, filteredData.length)}</span> of{' '}
            <span className="font-bold text-slate-900">{filteredData.length}</span> rows
          </p>

          <div className="flex items-center space-x-2">
            <button 
              className="flex items-center px-3.5 py-1.5 border border-slate-300 bg-white text-slate-700 text-xs font-bold rounded-lg shadow-2xs hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} 
              disabled={currentPage === 1}
            >
              <ChevronLeft size={15} className="mr-1" />
              Previous
            </button>

            <span className="text-xs font-semibold text-slate-700 px-3 py-1 bg-white border border-slate-300 rounded-lg">
              {currentPage} / {totalPages}
            </span>

            <button 
              className="flex items-center px-3.5 py-1.5 border border-slate-300 bg-white text-slate-700 text-xs font-bold rounded-lg shadow-2xs hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} 
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight size={15} className="ml-1" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
