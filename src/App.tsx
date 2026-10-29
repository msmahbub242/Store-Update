import { useState, useEffect, useMemo } from 'react';
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
  X
} from 'lucide-react';

const TABS = [
  { name: 'LCW Tarek', link: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTfhCfn7zzRTq8e3hrpRtdt4MIbz6a_fPQNKmtA6xQLYugd5Z_JJ0lJLKpvORo78Q/pub?gid=657204573&single=true&output=csv' },
  { name: 'LCW Rausan', link: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTfhCfn7zzRTq8e3hrpRtdt4MIbz6a_fPQNKmtA6xQLYugd5Z_JJ0lJLKpvORo78Q/pub?gid=2147335208&single=true&output=csv' },
  { name: 'BR Fahim', link: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTfhCfn7zzRTq8e3hrpRtdt4MIbz6a_fPQNKmtA6xQLYugd5Z_JJ0lJLKpvORo78Q/pub?gid=2037206968&single=true&output=csv' },
  { name: 'Monoprix', link: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTfhCfn7zzRTq8e3hrpRtdt4MIbz6a_fPQNKmtA6xQLYugd5Z_JJ0lJLKpvORo78Q/pub?gid=1171317696&single=true&output=csv' },
  { name: 'Tesco', link: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTfhCfn7zzRTq8e3hrpRtdt4MIbz6a_fPQNKmtA6xQLYugd5Z_JJ0lJLKpvORo78Q/pub?gid=881919278&single=true&output=csv' },
  { name: 'Ovs', link: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTfhCfn7zzRTq8e3hrpRtdt4MIbz6a_fPQNKmtA6xQLYugd5Z_JJ0lJLKpvORo78Q/pub?gid=2005771256&single=true&output=csv' },
];

export default function App() {
  const [rawData, setRawData] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState(TABS[0].name);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [isColumnPanelOpen, setIsColumnPanelOpen] = useState(false);
  const [showHeaderFilterRow, setShowHeaderFilterRow] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const rowsPerPage = 12;

  const fetchCsvData = async (link: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(link);
      const csvText = await response.text();
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          // Clean data: eliminate trailing metadata columns like _1, _2
          const cleanedData = (results.data as any[]).map(row => {
            const newRow: any = {};
            Object.keys(row).forEach(key => {
              const trimmedKey = key.trim();
              if (trimmedKey && !trimmedKey.endsWith('_1') && !trimmedKey.endsWith('_2')) {
                newRow[trimmedKey] = typeof row[key] === 'string' ? row[key].trim() : row[key];
              }
            });
            return newRow;
          }).filter(row => Object.values(row).some(v => v !== undefined && v !== ''));
          setRawData(cleanedData);
        }
      });
    } catch (err) {
      console.error('Error fetching CSV:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const tab = TABS.find(t => t.name === activeTab);
    if (tab) fetchCsvData(tab.link);
    setCurrentPage(1);
    setColumnFilters({});
  }, [activeTab]);

  // All detected columns in the current data
  const allColumns = useMemo(() => {
    if (rawData.length === 0) return [];
    const keys = new Set<string>();
    rawData.forEach(row => Object.keys(row).forEach(k => keys.add(k)));
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
    // Keep at least the first column visible
    if (allColumns.length > 0) {
      setHiddenColumns(allColumns.slice(1));
    }
  };

  const setColumnFilter = (col: string, val: string) => {
    setColumnFilters(prev => ({ ...prev, [col]: val }));
    setCurrentPage(1);
  };

  // Filtered dataset combining global filter and header column filters
  const filteredData = useMemo(() => {
    return rawData.filter(row => {
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

  // Total DZN calculation
  const totalDzn = useMemo(() => {
    return filteredData.reduce((acc, row) => {
      // Find DZN key in case of case variation (DZN, Dzn, dzn)
      const dznKey = Object.keys(row).find(k => k.toLowerCase() === 'dzn');
      const val = dznKey ? parseFloat(String(row[dznKey]).replace(/,/g, '')) : NaN;
      return acc + (isNaN(val) ? 0 : val);
    }, 0);
  }, [filteredData]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredData.length / rowsPerPage));
  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = filteredData.slice(indexOfFirstRow, indexOfLastRow);

  const getStatusPill = (val: string) => {
    const text = (val ?? '').toString().trim();
    if (!text) {
      return <span className="text-gray-400 italic text-xs">-</span>;
    }
    const isOk = text.toLowerCase() === 'ok';
    return (
      <span 
        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border shadow-xs tracking-wide ${
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

  const isStatusColumn = (colName: string) => {
    const lower = colName.toLowerCase();
    return lower.includes('update') || lower.includes('fabric') || lower.includes('sewing') || lower.includes('finishing');
  };

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-screen text-slate-800 font-sans">
      {/* Top Header */}
      <div className="flex justify-center mb-8">
        <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-600 text-white px-8 py-3.5 rounded-full shadow-lg border border-blue-400/30 flex items-center space-x-3">
          <span className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse"></span>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-wide drop-shadow-sm">
            Felix Store - Materials Status
          </h1>
        </div>
      </div>
      
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
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Buyer Tab</p>
            <p className="text-lg font-bold text-emerald-700 mt-1 truncate max-w-[140px]">{activeTab}</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg border border-emerald-100">
            🏷️
          </div>
        </div>
      </div>

      {/* Buyer Tabs */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-2 mb-6 scrollbar-none">
        {TABS.map(tab => (
          <button
            key={tab.name}
            className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap cursor-pointer ${
              activeTab === tab.name
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-600 ring-offset-2'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 hover:text-slate-900 shadow-xs'
            }`}
            onClick={() => setActiveTab(tab.name)}
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
            placeholder="Search by Buyer, PO, Style, Item or Remark..."
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
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-blue-200 mb-6 transition-all animate-fadeIn">
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

      {/* Table Container with FULL CELL BORDERS */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-300 overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="py-20 text-center text-slate-500">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mb-3"></div>
              <p className="font-semibold text-sm">Loading data from Google Sheet...</p>
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
