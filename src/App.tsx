import { useState, useEffect, useMemo, useCallback } from 'react';
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
  AlertTriangle, 
  Layers, 
  Sparkles,
  Factory,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  AlertCircle,
  LayoutGrid,
  Table as TableIcon,
  ArrowUpDown,
  Calendar,
  Package,
  Lock,
  Unlock,
  ShieldCheck,
  KeyRound,
  LogOut,
  Database
} from 'lucide-react';
import { saveLineAllocationsToFirestore, subscribeToLineAllocations } from './firebase';

const PUB_BASE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTfhCfn7zzRTq8e3hrpRtdt4MIbz6a_fPQNKmtA6xQLYugd5Z_JJ0lJLKpvORo78Q';
const PUBHTML_URL = `${PUB_BASE}/pubhtml`;

interface TabItem {
  name: string;
  gid: string;
}

const INITIAL_TABS: TabItem[] = [
  { name: 'LC WAIKIKI(Tariq sir)', gid: '951520833' },
  { name: 'BR sujoy', gid: '1524254458' },
  { name: 'BR Fahim', gid: '1304576963' },
  { name: 'Monoprix', gid: '793642162' },
  { name: 'TESCO', gid: '1101532121' },
  { name: 'OVS', gid: '1369675807' },
  { name: 'Madam', gid: '1025651909' },
];

const TOTAL_SEWING_LINES = 15;
const ALL_LINE_NAMES = Array.from({ length: TOTAL_SEWING_LINES }, (_, i) => `Line ${String(i + 1).padStart(2, '0')}`);
const LINE_ALLOCATION_STORAGE_KEY = 'felix_sewing_line_allocations_v1';

// Canonical column name normalizer to unify case differences across different buyer tabs
const normalizeHeader = (rawKey: string): string | null => {
  const k = rawKey.trim().toLowerCase();
  if (!k || k.endsWith('_1') || k.endsWith('_2') || k.startsWith('__parsed_extra')) {
    return null;
  }
  if (k.includes('file')) return 'File No';
  if (k === 'po' || k.startsWith('po')) return 'PO';
  if (k === 'style') return 'STYLE';
  if (k === 'item') return 'ITEM';
  if (k.includes('dzn')) return 'DZN';
  if (k.includes('ship')) return 'SHIP DATE';
  if (k.includes('fabric')) return 'Fabric Update';
  if (k.includes('sewing') || (k.includes('accessories') && !k.includes('finishing'))) return 'Sewing Acc. Update';
  if (k.includes('finishing')) return 'Finishing Acc. Update';
  if (k.includes('remark')) return 'Remarks';
  if (k.includes('line')) return 'Line';
  return rawKey.trim();
};

const STANDARD_COLUMN_ORDER = [
  'Buyer Tab',
  'File No',
  'PO',
  'STYLE',
  'ITEM',
  'DZN',
  'SHIP DATE',
  'Fabric Update',
  'Sewing Acc. Update',
  'Finishing Acc. Update',
  'Remarks'
];

// Helper to create a consistent unique key for each order row
const getOrderRowKey = (row: any, index: number): string => {
  const tab = row._tabSource || 'General';
  const po = row['PO'] || '';
  const style = row['STYLE'] || '';
  const file = row['File No'] || '';
  return `${tab}___${po}___${style}___${file}___${index}`;
};

export default function App() {
  const [tabs, setTabs] = useState<TabItem[]>(INITIAL_TABS);
  // Store data for all tabs in a map: tabName -> rows[]
  const [tabsData, setTabsData] = useState<Record<string, any[]>>({});
  // activeTabName: can be a specific buyer tab name, '__ALL__', or '__LINE_WISE__'
  const [activeTabName, setActiveTabName] = useState<string>('__LINE_WISE__');
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

  // Line-wise state: Line Name -> Array of up to 5 Order Keys
  const [lineAllocations, setLineAllocations] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem(LINE_ALLOCATION_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse line allocations from localStorage', e);
    }
    const emptyMap: Record<string, string[]> = {};
    ALL_LINE_NAMES.forEach(line => { emptyMap[line] = []; });
    return emptyMap;
  });

  // Modal state for assigning / managing POs on a specific line
  const [editingLine, setEditingLine] = useState<string | null>(null);
  const [lineModalSearch, setLineModalSearch] = useState('');
  const [lineModalBuyerFilter, setLineModalBuyerFilter] = useState('ALL');
  const [lineViewMode, setLineViewMode] = useState<'cards' | 'table'>('cards');
  const [selectedLineFilter, setSelectedLineFilter] = useState<string>('ALL');

  // Authorization state for Line Allocation management (Protected on public URL)
  const [isAuthorized, setIsAuthorized] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('felix_line_auth') === 'true';
    } catch {
      return false;
    }
  });
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authUsername, setAuthUsername] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [pendingLineToManage, setPendingLineToManage] = useState<string | null>(null);

  // Database connection & sync state
  const [isDbConnected, setIsDbConnected] = useState<boolean>(false);
  const [isDbSaving, setIsDbSaving] = useState<boolean>(false);
  const [lastDbSaveTime, setLastDbSaveTime] = useState<Date | null>(null);

  // Subscribe to real-time Cloud Firestore updates so all devices and users stay in sync
  useEffect(() => {
    const unsubscribe = subscribeToLineAllocations(
      (remoteAllocations, updatedAt) => {
        if (remoteAllocations && typeof remoteAllocations === 'object') {
          setLineAllocations(prev => {
            const merged: Record<string, string[]> = { ...prev, ...remoteAllocations };
            ALL_LINE_NAMES.forEach(line => {
              if (!merged[line]) merged[line] = [];
            });
            return merged;
          });
          setIsDbConnected(true);
          if (updatedAt) {
            setLastDbSaveTime(new Date(updatedAt));
          }
        }
      },
      (err) => {
        console.warn('Real-time database connection error:', err);
        setIsDbConnected(false);
      }
    );

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Persist lineAllocations to localStorage as fast offline cache
  useEffect(() => {
    try {
      localStorage.setItem(LINE_ALLOCATION_STORAGE_KEY, JSON.stringify(lineAllocations));
    } catch (e) {
      console.warn('Failed to save line allocations to localStorage', e);
    }
  }, [lineAllocations]);

  // 1. Discover tabs and GIDs dynamically from pubhtml
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
        const lowerName = name.toLowerCase().trim();
        const isExcluded = 
          lowerName.startsWith('sheet4') || 
          lowerName.startsWith('sheet9') ||
          lowerName.includes('thread') ||
          lowerName.includes('elastic');

        if (!isExcluded) {
          foundTabs.push({ name, gid });
        }
      }

      if (foundTabs.length > 0) {
        setTabs(foundTabs);
        return foundTabs;
      }
    } catch (err) {
      console.warn('Could not refresh pubhtml tabs dynamically:', err);
    }
    return tabs;
  }, [tabs]);

  // Helper to fetch and parse a single tab's CSV
  const parseSingleTab = async (tabItem: TabItem): Promise<any[]> => {
    const csvUrl = `${PUB_BASE}/pub?gid=${tabItem.gid}&single=true&output=csv`;
    const response = await fetch(csvUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} on tab ${tabItem.name}`);
    }
    const csvText = await response.text();
    const trimmed = csvText.trim();
    if (trimmed.startsWith('<!DOCTYPE html') || trimmed.startsWith('<html')) {
      throw new Error(`Google Sheet returned temporary HTML for ${tabItem.name}`);
    }

    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: 'greedy',
        complete: (results) => {
          if (!results.data || !Array.isArray(results.data)) {
            resolve([]);
            return;
          }
          const cleaned = (results.data as any[]).map((row, idx) => {
            if (!row || typeof row !== 'object') return null;
            const newRow: any = { _tabSource: tabItem.name };
            Object.keys(row).forEach(key => {
              const normKey = normalizeHeader(key);
              if (normKey) {
                const cellVal = row[key];
                if (newRow[normKey] === undefined || newRow[normKey] === '') {
                  newRow[normKey] = typeof cellVal === 'string' ? cellVal.trim() : cellVal;
                }
              }
            });
            // Assign a unique row ID for line allocation
            newRow._uniqueKey = getOrderRowKey(newRow, idx);
            return newRow;
          }).filter(row => row && Object.values(row).some(v => v !== undefined && v !== null && v !== '' && v !== row._tabSource));
          resolve(cleaned);
        },
        error: () => resolve([])
      });
    });
  };

  // Fetch all tabs in parallel so universal search & line assignment have full data
  const fetchAllTabs = useCallback(async (tabList: TabItem[], isSilent = false) => {
    if (!tabList || tabList.length === 0) return;

    if (!isSilent) setIsLoading(true);
    setIsRefreshing(true);

    try {
      const results = await Promise.allSettled(
        tabList.map(async tab => {
          const rows = await parseSingleTab(tab);
          return { name: tab.name, rows };
        })
      );

      const newMap: Record<string, any[]> = {};
      results.forEach(res => {
        if (res.status === 'fulfilled') {
          newMap[res.value.name] = res.value.rows;
        }
      });

      if (Object.keys(newMap).length > 0) {
        setTabsData(prev => ({ ...prev, ...newMap }));
        setLastUpdated(new Date());
        setSyncNotice(null);
      }
    } catch (err: any) {
      console.warn('Sync notice:', err.message);
      setSyncNotice(err.message || 'Connecting to Google Sheet...');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    (async () => {
      const freshTabs = await discoverTabs();
      await fetchAllTabs(freshTabs, false);
    })();
  }, []);

  // Background Auto-Sync every 25 seconds
  useEffect(() => {
    if (!isAutoRefreshEnabled) return;
    const intervalId = setInterval(() => {
      fetchAllTabs(tabs, true);
    }, 25000);
    return () => clearInterval(intervalId);
  }, [isAutoRefreshEnabled, tabs, fetchAllTabs]);

  // Master list of all orders across all tabs
  const allMasterOrders = useMemo(() => {
    const list: any[] = [];
    Object.entries(tabsData).forEach(([tabName, rows]) => {
      rows.forEach((r, idx) => {
        list.push({ 
          ...r, 
          _tabSource: tabName, 
          _uniqueKey: r._uniqueKey || getOrderRowKey(r, idx)
        });
      });
    });
    return list;
  }, [tabsData]);

  // Map of uniqueKey -> Order Object for fast line lookups
  const ordersByKey = useMemo(() => {
    const map = new Map<string, any>();
    allMasterOrders.forEach(o => {
      map.set(o._uniqueKey, o);
    });
    return map;
  }, [allMasterOrders]);

  // Authorization handler: checks username & password credentials
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const u = authUsername.trim().toLowerCase();
    const p = authPassword.trim();

    // Standard factory planning / store department authorized credentials:
    // Username: planner, store, admin, mahbub
    // Password: felix123
    const allowedUsers = ['planner', 'store', 'admin', 'mahbub'];
    if (allowedUsers.includes(u) && (p === 'felix123' || p === 'Felix123' || p === 'felix' || p === 'store123')) {
      setIsAuthorized(true);
      try {
        sessionStorage.setItem('felix_line_auth', 'true');
      } catch (err) {
        console.warn('Could not save auth session', err);
      }
      setShowAuthModal(false);
      setAuthUsername('');
      setAuthPassword('');
      if (pendingLineToManage) {
        setEditingLine(pendingLineToManage);
        setPendingLineToManage(null);
      }
    } else {
      setAuthError('Invalid username or password. Authorized store/planner access only.');
    }
  };

  const handleLogout = () => {
    setIsAuthorized(false);
    try {
      sessionStorage.removeItem('felix_line_auth');
    } catch (err) {
      console.warn('Could not remove auth session', err);
    }
  };

  // Helper to ensure action is authorized before proceeding
  const requireAuthorization = (targetLine?: string): boolean => {
    if (isAuthorized) return true;
    setPendingLineToManage(targetLine || null);
    setAuthError(null);
    setShowAuthModal(true);
    return false;
  };

  // Centralized saver that saves to Cloud Firestore in real time
  const persistAllocationsToDb = (
    updatedAllocations: Record<string, string[]>,
    userRole: string = 'planner'
  ) => {
    setIsDbSaving(true);
    saveLineAllocationsToFirestore(updatedAllocations, userRole)
      .then(() => {
        setIsDbSaving(false);
        setLastDbSaveTime(new Date());
      })
      .catch((err) => {
        console.error('Error saving to Firestore:', err);
        setIsDbSaving(false);
      });
  };

  // Line allocation modifiers (Guarded by authorization & saved to Cloud Database)
  const addPoToLine = (lineName: string, orderKey: string) => {
    if (!requireAuthorization(lineName)) return;
    setLineAllocations(prev => {
      const current = prev[lineName] || [];
      if (current.includes(orderKey)) return prev;
      if (current.length >= 5) {
        alert('Each line can have a maximum of 5 Upcoming POs.');
        return prev;
      }
      const updated = {
        ...prev,
        [lineName]: [...current, orderKey]
      };
      persistAllocationsToDb(updated, authUsername || 'planner');
      return updated;
    });
  };

  const removePoFromLine = (lineName: string, orderKey: string) => {
    if (!requireAuthorization(lineName)) return;
    setLineAllocations(prev => {
      const updated = {
        ...prev,
        [lineName]: (prev[lineName] || []).filter(k => k !== orderKey)
      };
      persistAllocationsToDb(updated, authUsername || 'planner');
      return updated;
    });
  };

  const movePoInLine = (lineName: string, index: number, direction: 'up' | 'down') => {
    if (!requireAuthorization(lineName)) return;
    setLineAllocations(prev => {
      const list = [...(prev[lineName] || [])];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= list.length) return prev;
      const temp = list[index];
      list[index] = list[targetIndex];
      list[targetIndex] = temp;
      const updated = { ...prev, [lineName]: list };
      persistAllocationsToDb(updated, authUsername || 'planner');
      return updated;
    });
  };

  // Determine if Universal Search mode is active
  const isUniversalSearchActive = globalFilter.trim().length > 0;

  // Active dataset for normal/all tabs
  const baseData = useMemo(() => {
    if (isUniversalSearchActive || activeTabName === '__ALL__') {
      return allMasterOrders;
    }
    if (activeTabName === '__LINE_WISE__') {
      return allMasterOrders;
    }
    return tabsData[activeTabName] || [];
  }, [isUniversalSearchActive, activeTabName, allMasterOrders, tabsData]);

  // Filtered dataset for table view
  const filteredData = useMemo(() => {
    return baseData.filter(row => {
      if (!row) return false;

      // Global Search
      if (globalFilter.trim()) {
        const query = globalFilter.toLowerCase();
        const matchesGlobal = Object.entries(row).some(([k, val]) => {
          if (k.startsWith('_')) return false;
          return String(val ?? '').toLowerCase().includes(query);
        });
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
  }, [baseData, globalFilter, columnFilters]);

  // All detected columns in the current dataset (deduplicated & neatly ordered)
  const allColumns = useMemo(() => {
    if (baseData.length === 0) return [];
    const keys = new Set<string>();
    baseData.forEach(row => {
      if (row && typeof row === 'object') {
        Object.keys(row).forEach(k => {
          if (k && !k.startsWith('_')) keys.add(k);
        });
      }
    });

    const ordered: string[] = [];
    if (isUniversalSearchActive || activeTabName === '__ALL__' || activeTabName === '__LINE_WISE__') {
      ordered.push('Buyer Tab');
    }

    STANDARD_COLUMN_ORDER.forEach(col => {
      if (col !== 'Buyer Tab' && keys.has(col)) {
        ordered.push(col);
      }
    });

    keys.forEach(k => {
      if (k !== 'Buyer Tab' && !ordered.includes(k)) {
        ordered.push(k);
      }
    });

    return ordered;
  }, [baseData, isUniversalSearchActive, activeTabName]);

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
    if (allColumns.length > 4) {
      setHiddenColumns(allColumns.slice(5));
    }
  };

  const setColumnFilter = (col: string, val: string) => {
    setColumnFilters(prev => ({ ...prev, [col]: val }));
    setCurrentPage(1);
  };

  // Total DZN calculation
  const totalDzn = useMemo(() => {
    return filteredData.reduce((acc, row) => {
      if (!row) return acc;
      const dznKey = Object.keys(row).find(k => k.toLowerCase().includes('dzn'));
      const val = dznKey ? parseFloat(String(row[dznKey]).replace(/,/g, '')) : NaN;
      return acc + (isNaN(val) ? 0 : val);
    }, 0);
  }, [filteredData]);

  // Tab match counts for search
  const tabMatchesCount = useMemo(() => {
    if (!isUniversalSearchActive) return {};
    const counts: Record<string, number> = {};
    filteredData.forEach(row => {
      const src = row._tabSource || 'Unknown';
      counts[src] = (counts[src] || 0) + 1;
    });
    return counts;
  }, [filteredData, isUniversalSearchActive]);

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

  const checkOrderReadiness = (order: any): { isReady: boolean; fabricOk: boolean; sewingOk: boolean; finishingOk: boolean } => {
    if (!order) return { isReady: false, fabricOk: false, sewingOk: false, finishingOk: false };
    const fabricOk = String(order['Fabric Update'] || order['Fabric'] || '').toLowerCase().trim() === 'ok';
    const sewingOk = String(order['Sewing Acc. Update'] || order['Sewing'] || order['sewing Acc'] || '').toLowerCase().trim() === 'ok';
    const finishingOk = String(order['Finishing Acc. Update'] || order['Finishing'] || order['Finishing accessories'] || '').toLowerCase().trim() === 'ok';
    return {
      isReady: fabricOk && sewingOk && finishingOk,
      fabricOk,
      sewingOk,
      finishingOk
    };
  };

  const getStatusPill = (val: string) => {
    const text = (val ?? '').toString().trim();
    if (!text) {
      return <span className="text-slate-400 italic text-xs">-</span>;
    }
    const isOk = text.toLowerCase() === 'ok';
    const isShort = text.length <= 10 && !text.includes('\n');

    return (
      <div 
        className={`inline-block text-xs font-semibold border shadow-2xs transition-all ${
          isShort 
            ? 'px-2.5 py-1 rounded-full text-center tracking-wide' 
            : 'px-3 py-2 rounded-xl text-left leading-relaxed break-words whitespace-normal max-w-[260px]'
        } ${
          isOk 
            ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
            : 'bg-rose-100 text-rose-800 border-rose-300'
        }`}
      >
        {isOk && <Check size={12} className="mr-1 inline stroke-[3] -mt-0.5" />}
        <span className="whitespace-pre-line">{text}</span>
      </div>
    );
  };

  // Line-wise aggregated metrics for summary
  const lineMetrics = useMemo(() => {
    let totalAllocatedPos = 0;
    let totalReadyPos = 0;
    let linesWithFullQueue = 0;

    ALL_LINE_NAMES.forEach(line => {
      const keys = lineAllocations[line] || [];
      totalAllocatedPos += keys.length;
      if (keys.length === 5) linesWithFullQueue++;
      keys.forEach(k => {
        const order = ordersByKey.get(k);
        if (order && checkOrderReadiness(order).isReady) {
          totalReadyPos++;
        }
      });
    });

    return {
      totalAllocatedPos,
      totalReadyPos,
      linesWithFullQueue,
      readyPercentage: totalAllocatedPos > 0 ? Math.round((totalReadyPos / totalAllocatedPos) * 100) : 0
    };
  }, [lineAllocations, ordersByKey]);

  // Filtered line list based on line filter & search query
  const displayedLineNames = useMemo(() => {
    return ALL_LINE_NAMES.filter(lineName => {
      if (selectedLineFilter !== 'ALL' && lineName !== selectedLineFilter) {
        return false;
      }
      if (globalFilter.trim()) {
        const q = globalFilter.toLowerCase();
        // Check if line name matches
        if (lineName.toLowerCase().includes(q)) return true;
        // Check if any allocated PO inside this line matches
        const keys = lineAllocations[lineName] || [];
        return keys.some(k => {
          const order = ordersByKey.get(k);
          if (!order) return false;
          return Object.entries(order).some(([key, val]) => {
            if (key.startsWith('_')) return false;
            return String(val ?? '').toLowerCase().includes(q);
          });
        });
      }
      return true;
    });
  }, [selectedLineFilter, globalFilter, lineAllocations, ordersByKey]);

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-screen text-slate-800 font-sans">
      {/* Top Header */}
      <div className="flex flex-col items-center justify-center mb-6">
        <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-600 text-white px-8 py-3.5 rounded-full shadow-lg border border-blue-400/30 flex items-center space-x-3">
          <span className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse"></span>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-wide drop-shadow-sm">
            Felix Store App - Materials Status
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
              {isAutoRefreshEnabled ? 'ACTIVE (25s)' : 'PAUSED'}
            </button>
          </div>

          <span className="text-slate-300">•</span>

          {/* Cloud Database real-time indicator */}
          <div className="flex items-center gap-1.5 font-medium" title="Real-time Cloud Database synchronization">
            <Database size={13} className={isDbSaving ? 'text-amber-500 animate-spin' : isDbConnected ? 'text-emerald-500' : 'text-slate-400'} />
            <span>Cloud DB:</span>
            <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
              isDbSaving 
                ? 'bg-amber-100 text-amber-800' 
                : isDbConnected 
                  ? 'bg-emerald-100 text-emerald-800' 
                  : 'bg-slate-200 text-slate-600'
            }`}>
              {isDbSaving ? 'SAVING...' : isDbConnected ? 'LIVE SYNCED' : 'OFFLINE'}
            </span>
          </div>

          <span className="text-slate-300">•</span>

          <div>
            Last live sync:{' '}
            <span className="font-semibold text-slate-700">
              {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Connecting...'}
            </span>
          </div>

          <span className="text-slate-300">•</span>

          <button
            onClick={() => {
              discoverTabs().then(freshTabs => fetchAllTabs(freshTabs, false));
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
            onClick={() => fetchAllTabs(tabs, false)}
            className="px-2.5 py-1 bg-amber-200 hover:bg-amber-300 text-amber-900 rounded text-xs font-bold transition cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {activeTabName === '__LINE_WISE__' && !isUniversalSearchActive ? (
          <>
            <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sewing Lines</p>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">15 Lines</p>
                <p className="text-[11px] text-slate-500 mt-0.5">5 Upcoming POs per line</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xl border border-amber-100">
                🏭
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Line Allocated POs</p>
                <p className="text-2xl font-extrabold text-blue-900 mt-1">
                  {lineMetrics.totalAllocatedPos} <span className="text-sm font-normal text-slate-400">/ 75 Target</span>
                </p>
                <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">{lineMetrics.linesWithFullQueue} Lines full (5/5)</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xl border border-blue-100">
                📋
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">100% Material Ready</p>
                <p className="text-2xl font-extrabold text-emerald-700 mt-1">
                  {lineMetrics.totalReadyPos}{' '}
                  <span className="text-sm font-bold text-slate-500">({lineMetrics.readyPercentage}%)</span>
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Fabric, Sewing & Finishing OK</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xl border border-emerald-100">
                ✅
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Orders in Store</p>
                <p className="text-2xl font-extrabold text-indigo-900 mt-1">{allMasterOrders.length}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Available across all buyers</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xl border border-indigo-100">
                📦
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {isUniversalSearchActive ? 'Matched Orders (All Tabs)' : 'Total Orders'}
                </p>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">{filteredData.length}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg border border-blue-100">
                📦
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {isUniversalSearchActive ? 'Matched DZN (All Tabs)' : 'Total DZN'}
                </p>
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
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active View</p>
                <p className="text-sm font-bold text-emerald-700 mt-1 truncate max-w-[150px]">
                  {isUniversalSearchActive ? 'All Buyer Tabs' : activeTabName === '__ALL__' ? 'All Combined' : activeTabName}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg border border-emerald-100">
                🏷️
              </div>
            </div>
          </>
        )}
      </div>

      {/* 2. SEARCH & ACTION BAR */}
      <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200 mb-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Global Search across ALL tabs */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-600" size={19} />
            <input
              className="w-full pl-10 pr-10 py-3 bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition shadow-2xs"
              placeholder="🔍 Search across ALL tabs, buyers & lines (by PO, Style, Buyer, Item, Line, Remark...)"
              value={globalFilter}
              onChange={(e) => {
                setGlobalFilter(e.target.value);
                setCurrentPage(1);
              }}
            />
            {globalFilter && (
              <button 
                onClick={() => {
                  setGlobalFilter('');
                  setCurrentPage(1);
                }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer p-1"
                title="Clear Search"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {activeTabName === '__LINE_WISE__' && !isUniversalSearchActive ? (
              <>
                {/* Authorization Status / Login Button */}
                {isAuthorized ? (
                  <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
                    <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
                    <span>Planner Mode</span>
                    <button
                      onClick={handleLogout}
                      className="ml-1 text-[11px] text-slate-500 hover:text-rose-700 underline font-medium cursor-pointer"
                      title="Lock & exit planner session"
                    >
                      Lock
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setPendingLineToManage(null);
                      setShowAuthModal(true);
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-300 transition cursor-pointer shadow-2xs"
                    title="Log in to allocate or manage POs"
                  >
                    <Lock size={13} className="text-amber-600" />
                    <span>Planner Login</span>
                  </button>
                )}

                {/* View Mode Toggle */}
                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    onClick={() => setLineViewMode('cards')}
                    className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                      lineViewMode === 'cards' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Card / Grid View"
                  >
                    <LayoutGrid size={15} />
                    <span className="hidden sm:inline">Cards</span>
                  </button>
                  <button
                    onClick={() => setLineViewMode('table')}
                    className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                      lineViewMode === 'table' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Grouped Table View"
                  >
                    <TableIcon size={15} />
                    <span className="hidden sm:inline">Table</span>
                  </button>
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>

        {/* Universal Search Active Notice Badge */}
        {isUniversalSearchActive && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-blue-800 font-semibold bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200">
              <Sparkles size={14} className="text-blue-600 animate-spin" />
              <span>
                Universal Search Active: Found <span className="font-extrabold text-blue-900">{filteredData.length}</span> matching order(s) across all sheets!
              </span>
            </div>

            {/* Quick breakdown of matches per tab */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-slate-400">Found in:</span>
              {Object.entries(tabMatchesCount).map(([tName, count]) => (
                <span key={tName} className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-medium border border-slate-200">
                  {tName}: <strong className="text-blue-700">{count}</strong>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. TAB SWITCHER - "Line Wise Update" placed RIGHT BEFORE "All Buyers" */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-2 mb-6 scrollbar-none">
        {/* NEW: Line Wise Update Tab (15 Sewing Lines) */}
        <button
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap cursor-pointer shadow-xs ${
            !isUniversalSearchActive && activeTabName === '__LINE_WISE__'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-500/25 ring-2 ring-amber-600 ring-offset-2'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-amber-50/70 hover:text-amber-800'
          }`}
          onClick={() => {
            setGlobalFilter('');
            setActiveTabName('__LINE_WISE__');
            setCurrentPage(1);
          }}
        >
          <Factory size={16} className={!isUniversalSearchActive && activeTabName === '__LINE_WISE__' ? 'text-amber-100' : 'text-amber-600'} />
          <span>Line Wise Update</span>
          <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full ${
            !isUniversalSearchActive && activeTabName === '__LINE_WISE__'
              ? 'bg-amber-700/80 text-amber-100'
              : 'bg-amber-100 text-amber-800'
          }`}>
            15 Lines
          </span>
        </button>

        {/* All Buyers (Combined) Tab */}
        <button
          className={`flex items-center gap-1.5 px-4.5 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap cursor-pointer ${
            !isUniversalSearchActive && activeTabName === '__ALL__'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25 ring-2 ring-indigo-600 ring-offset-2'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 shadow-xs'
          }`}
          onClick={() => {
            setGlobalFilter('');
            setActiveTabName('__ALL__');
            setCurrentPage(1);
          }}
        >
          <Layers size={15} />
          <span>All Buyers (Combined)</span>
        </button>

        {/* Individual Buyer Tabs */}
        {tabs.map(tab => (
          <button
            key={tab.name}
            className={`px-4.5 py-2.5 rounded-xl font-bold text-sm transition-all whitespace-nowrap cursor-pointer ${
              !isUniversalSearchActive && activeTabName === tab.name
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-600 ring-offset-2'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 hover:text-slate-900 shadow-xs'
            }`}
            onClick={() => {
              setGlobalFilter('');
              setActiveTabName(tab.name);
              setCurrentPage(1);
              setColumnFilters({});
            }}
          >
            {tab.name}
            {tabsData[tab.name] && (
              <span className="ml-1.5 text-xs opacity-75 font-normal">
                ({tabsData[tab.name].length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ========================================================================= */}
      {/* RENDER CONTENT: EITHER "LINE WISE UPDATE" OR "STANDARD TABLE DASHBOARD" */}
      {/* ========================================================================= */}

      {activeTabName === '__LINE_WISE__' && !isUniversalSearchActive ? (
        /* LINE WISE UPDATE VIEW */
        <div className="space-y-6">
          {/* Line Filter Pills (Line 01 to Line 15) */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 shrink-0">
              <Factory size={15} className="text-amber-600" />
              <span>Select Line:</span>
            </div>
            
            <div className="flex items-center gap-1.5 flex-wrap flex-1">
              <button
                onClick={() => setSelectedLineFilter('ALL')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  selectedLineFilter === 'ALL'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All 15 Lines
              </button>
              {ALL_LINE_NAMES.map(lineName => {
                const count = (lineAllocations[lineName] || []).length;
                return (
                  <button
                    key={lineName}
                    onClick={() => setSelectedLineFilter(lineName)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                      selectedLineFilter === lineName
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>{lineName}</span>
                    <span className={`text-[10px] px-1 rounded ${selectedLineFilter === lineName ? 'bg-amber-700 text-amber-100' : 'bg-slate-200 text-slate-700'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Line Wise Card Board View */}
          {lineViewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayedLineNames.map(lineName => {
                const allocatedKeys = lineAllocations[lineName] || [];
                const orders = allocatedKeys.map(k => ordersByKey.get(k)).filter(Boolean);
                const readyCount = orders.filter(o => checkOrderReadiness(o).isReady).length;

                return (
                  <div 
                    key={lineName} 
                    className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-shadow flex flex-col overflow-hidden"
                  >
                    {/* Line Header */}
                    <div className="p-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center font-extrabold text-sm">
                          {lineName.replace('Line ', 'L')}
                        </div>
                        <div>
                          <h3 className="font-extrabold text-base tracking-wide text-white flex items-center gap-2">
                            <span>{lineName}</span>
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-700 text-slate-200">
                              {orders.length} / 5 POs
                            </span>
                          </h3>
                          <p className="text-[11px] text-slate-400">
                            Upcoming Production Queue
                          </p>
                        </div>
                      </div>

                      {/* Manage / Assign POs Button */}
                      <button
                        onClick={() => {
                          if (!requireAuthorization(lineName)) return;
                          setEditingLine(lineName);
                          setLineModalSearch('');
                          setLineModalBuyerFilter('ALL');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        title={`Assign or manage 5 POs for ${lineName}`}
                      >
                        {isAuthorized ? <Plus size={13} /> : <Lock size={13} />}
                        <span>Manage POs</span>
                      </button>
                    </div>

                    {/* Readiness Bar */}
                    <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-600">Material Readiness:</span>
                      <span className={`font-bold flex items-center gap-1 ${readyCount === orders.length && orders.length > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {readyCount === orders.length && orders.length > 0 ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                        {readyCount} of {orders.length} Ready for Sewing
                      </span>
                    </div>

                    {/* 5 PO Slots Queue with crisp OUTLINE Styling */}
                    <div className="p-4 flex-1 flex flex-col gap-3.5 bg-slate-50/40">
                      {Array.from({ length: 5 }).map((_, slotIndex) => {
                        const order = orders[slotIndex];
                        const slotNum = slotIndex + 1;
                        const isRunning = slotIndex === 0;

                        if (!order) {
                          return (
                            <div 
                              key={slotIndex} 
                              onClick={() => {
                                if (!requireAuthorization(lineName)) return;
                                setEditingLine(lineName);
                                setLineModalSearch('');
                                setLineModalBuyerFilter('ALL');
                              }}
                              className="border-2 border-dashed border-slate-300 rounded-2xl p-3 text-center text-slate-400 hover:border-amber-400 hover:text-amber-800 hover:bg-amber-50/20 transition cursor-pointer flex flex-col items-center justify-center gap-1.5 min-h-[90px]"
                            >
                              <div className="flex items-center gap-2">
                                <span className="h-6 w-6 rounded-md border border-slate-300 bg-slate-100 text-slate-600 font-black font-mono text-xs flex items-center justify-center">
                                  #{slotNum}
                                </span>
                                <span className="text-xs font-bold text-slate-600">
                                  Empty Slot {slotNum}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400">
                                {isAuthorized ? '+ Click to assign upcoming PO' : '🔒 Authorization required to allocate'}
                              </p>
                            </div>
                          );
                        }

                        const readiness = checkOrderReadiness(order);

                        return (
                          <div 
                            key={order._uniqueKey || slotIndex} 
                            className={`rounded-2xl border-2 transition-all p-3.5 bg-white shadow-2xs ${
                              isRunning 
                                ? 'border-amber-500 ring-2 ring-amber-400/20' 
                                : 'border-slate-300 hover:border-slate-400'
                            }`}
                          >
                            {/* Top row: Queue Badge + Buyer + Running indicator + Action Buttons */}
                            <div className="flex items-center justify-between gap-2 pb-2 mb-2.5 border-b border-slate-200">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[11px] font-black font-mono px-2 py-0.5 rounded border ${
                                  isRunning 
                                    ? 'bg-amber-500 text-white border-amber-600 shadow-2xs' 
                                    : 'bg-slate-100 text-slate-800 border-slate-300'
                                }`}>
                                  #{slotNum} {isRunning && '• NEXT / RUNNING'}
                                </span>
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded border border-blue-300 bg-blue-50 text-blue-900">
                                  {order._tabSource || 'Buyer'}
                                </span>
                              </div>

                              <div className="flex items-center gap-1">
                                {slotIndex > 0 && (
                                  <button
                                    onClick={() => movePoInLine(lineName, slotIndex, 'up')}
                                    className="p-1 rounded border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                                    title="Move Up in queue"
                                  >
                                    <ArrowUp size={12} />
                                  </button>
                                )}
                                {slotIndex < orders.length - 1 && (
                                  <button
                                    onClick={() => movePoInLine(lineName, slotIndex, 'down')}
                                    className="p-1 rounded border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                                    title="Move Down in queue"
                                  >
                                    <ArrowDown size={12} />
                                  </button>
                                )}
                                <button
                                  onClick={() => removePoFromLine(lineName, order._uniqueKey)}
                                  className="p-1 rounded border border-rose-200 text-rose-500 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                                  title="Remove from line"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            </div>

                            {/* PO Data Outline Grid */}
                            <div className="border border-slate-300 rounded-xl overflow-hidden mb-2.5 text-xs">
                              {/* Row 1: PO & Style */}
                              <div className="grid grid-cols-2 divide-x divide-slate-300 border-b border-slate-300 bg-slate-50/70">
                                <div className="p-2">
                                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">PO Number</span>
                                  <span className="font-black text-slate-900 text-sm tracking-wide block truncate">
                                    {order['PO'] || '-'}
                                  </span>
                                </div>
                                <div className="p-2">
                                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">Style</span>
                                  <span className="font-bold text-slate-800 text-xs block truncate" title={order['STYLE']}>
                                    {order['STYLE'] || '-'}
                                  </span>
                                </div>
                              </div>

                              {/* Row 2: Item & File */}
                              <div className="p-2 border-b border-slate-300 bg-white">
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">Item & File No</span>
                                <span className="text-slate-800 font-semibold text-xs block truncate" title={`${order['ITEM'] || '-'} (${order['File No'] || '-'})`}>
                                  {order['ITEM'] || '-'} {order['File No'] && <span className="text-slate-500 font-normal">({order['File No']})</span>}
                                </span>
                              </div>

                              {/* Row 3: DZN & Ship Date */}
                              <div className="grid grid-cols-2 divide-x divide-slate-300 bg-slate-50/40">
                                <div className="p-2">
                                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">DZN Qty</span>
                                  <span className="font-extrabold text-indigo-700 text-xs block">
                                    {order['DZN'] || '-'} Dzn
                                  </span>
                                </div>
                                <div className="p-2">
                                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">Ship Date</span>
                                  <span className="font-bold text-slate-700 text-xs block">
                                    {order['SHIP DATE'] || '-'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Material Status Badges in Outline Style */}
                            <div className="pt-2 border-t border-slate-200">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-slate-500 text-[10px] font-extrabold uppercase tracking-wider">Materials Status</span>
                                {readiness.isReady ? (
                                  <span className="text-[10px] font-black border border-emerald-600 bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <CheckCircle2 size={11} className="text-emerald-600" />
                                    READY
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-black border border-amber-500 bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <AlertCircle size={11} className="text-amber-600" />
                                    PENDING
                                  </span>
                                )}
                              </div>

                              <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                                <div className={`p-1.5 rounded-lg border text-center ${
                                  readiness.fabricOk 
                                    ? 'border-emerald-400 bg-emerald-50/40 text-emerald-900' 
                                    : 'border-rose-300 bg-rose-50/40 text-rose-900'
                                }`} title={`Fabric: ${order['Fabric Update'] || '-'}`}>
                                  <span className="text-[9px] uppercase font-bold text-slate-500 block">Fabric</span>
                                  <span className="font-extrabold text-[11px] truncate block">
                                    {order['Fabric Update'] || 'Pending'}
                                  </span>
                                </div>

                                <div className={`p-1.5 rounded-lg border text-center ${
                                  readiness.sewingOk 
                                    ? 'border-emerald-400 bg-emerald-50/40 text-emerald-900' 
                                    : 'border-rose-300 bg-rose-50/40 text-rose-900'
                                }`} title={`Sewing Acc: ${order['Sewing Acc. Update'] || '-'}`}>
                                  <span className="text-[9px] uppercase font-bold text-slate-500 block">Sew Acc</span>
                                  <span className="font-extrabold text-[11px] truncate block">
                                    {order['Sewing Acc. Update'] || 'Pending'}
                                  </span>
                                </div>

                                <div className={`p-1.5 rounded-lg border text-center ${
                                  readiness.finishingOk 
                                    ? 'border-emerald-400 bg-emerald-50/40 text-emerald-900' 
                                    : 'border-rose-300 bg-rose-50/40 text-rose-900'
                                }`} title={`Finishing Acc: ${order['Finishing Acc. Update'] || '-'}`}>
                                  <span className="text-[9px] uppercase font-bold text-slate-500 block">Fin Acc</span>
                                  <span className="font-extrabold text-[11px] truncate block">
                                    {order['Finishing Acc. Update'] || 'Pending'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Line Wise Grouped Table View */
            <div className="bg-white rounded-2xl shadow-sm border border-slate-300 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse border border-slate-300">
                  <thead className="bg-slate-100 text-slate-800 text-xs uppercase font-bold">
                    <tr>
                      <th className="p-3 border border-slate-300">Sewing Line</th>
                      <th className="p-3 border border-slate-300">Queue #</th>
                      <th className="p-3 border border-slate-300">Buyer Tab</th>
                      <th className="p-3 border border-slate-300">PO Number</th>
                      <th className="p-3 border border-slate-300">Style</th>
                      <th className="p-3 border border-slate-300">Item</th>
                      <th className="p-3 border border-slate-300">DZN</th>
                      <th className="p-3 border border-slate-300">Ship Date</th>
                      <th className="p-3 border border-slate-300">Fabric Status</th>
                      <th className="p-3 border border-slate-300">Sewing Acc Status</th>
                      <th className="p-3 border border-slate-300">Finishing Status</th>
                      <th className="p-3 border border-slate-300 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {displayedLineNames.map(lineName => {
                      const allocatedKeys = lineAllocations[lineName] || [];
                      const orders = allocatedKeys.map(k => ordersByKey.get(k)).filter(Boolean);

                      if (orders.length === 0) {
                        return (
                          <tr key={lineName} className="hover:bg-slate-50">
                            <td className="p-3 font-extrabold text-slate-900 border border-slate-300 bg-slate-50/50">
                              {lineName}
                            </td>
                            <td colSpan={10} className="p-3 text-slate-400 italic text-xs border border-slate-300">
                              No upcoming POs assigned yet. Click "Manage" to add upcoming POs.
                            </td>
                            <td className="p-3 text-center border border-slate-300">
                              <button
                                onClick={() => {
                                  if (!requireAuthorization(lineName)) return;
                                  setEditingLine(lineName);
                                  setLineModalSearch('');
                                  setLineModalBuyerFilter('ALL');
                                }}
                                className="px-2.5 py-1 rounded bg-amber-500 text-slate-900 text-xs font-bold hover:bg-amber-400 cursor-pointer flex items-center justify-center gap-1 mx-auto"
                              >
                                {isAuthorized ? null : <Lock size={11} />}
                                <span>Manage</span>
                              </button>
                            </td>
                          </tr>
                        );
                      }

                      return orders.map((order, oIdx) => {
                        return (
                          <tr key={`${lineName}_${oIdx}`} className={oIdx === 0 ? 'bg-amber-50/30' : 'hover:bg-slate-50'}>
                            {oIdx === 0 && (
                              <td 
                                rowSpan={orders.length} 
                                className="p-3 font-extrabold text-slate-900 border border-slate-300 bg-slate-50 align-top"
                              >
                                <div className="sticky top-2">
                                  <span className="text-base font-extrabold block">{lineName}</span>
                                  <span className="text-[11px] font-semibold text-slate-500 block mb-2">{orders.length}/5 POs</span>
                                  <button
                                    onClick={() => {
                                      if (!requireAuthorization(lineName)) return;
                                      setEditingLine(lineName);
                                      setLineModalSearch('');
                                      setLineModalBuyerFilter('ALL');
                                    }}
                                    className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs font-bold cursor-pointer flex items-center gap-1 shadow-2xs"
                                  >
                                    {isAuthorized ? null : <Lock size={11} />}
                                    <span>Manage Line</span>
                                  </button>
                                </div>
                              </td>
                            )}

                            <td className="p-3 text-xs font-bold border border-slate-300 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded ${oIdx === 0 ? 'bg-amber-600 text-white font-extrabold' : 'bg-slate-200 text-slate-800'}`}>
                                #{oIdx + 1} {oIdx === 0 && '(Active)'}
                              </span>
                            </td>
                            <td className="p-3 text-xs font-bold text-blue-800 border border-slate-300 whitespace-nowrap">
                              {order._tabSource || '-'}
                            </td>
                            <td className="p-3 font-extrabold text-slate-900 border border-slate-300 whitespace-nowrap">
                              {order['PO'] || '-'}
                            </td>
                            <td className="p-3 font-semibold text-slate-800 border border-slate-300">
                              {order['STYLE'] || '-'}
                            </td>
                            <td className="p-3 text-slate-700 border border-slate-300">
                              {order['ITEM'] || '-'}
                            </td>
                            <td className="p-3 font-bold text-indigo-700 border border-slate-300 whitespace-nowrap">
                              {order['DZN'] || '-'}
                            </td>
                            <td className="p-3 text-slate-700 border border-slate-300 whitespace-nowrap">
                              {order['SHIP DATE'] || '-'}
                            </td>
                            <td className="p-3 border border-slate-300">
                              {getStatusPill(order['Fabric Update'])}
                            </td>
                            <td className="p-3 border border-slate-300">
                              {getStatusPill(order['Sewing Acc. Update'])}
                            </td>
                            <td className="p-3 border border-slate-300">
                              {getStatusPill(order['Finishing Acc. Update'])}
                            </td>
                            <td className="p-3 text-center border border-slate-300">
                              <button
                                onClick={() => removePoFromLine(lineName, order._uniqueKey)}
                                className="p-1 rounded text-rose-500 hover:bg-rose-100 cursor-pointer"
                                title="Remove from line"
                              >
                                <X size={15} />
                              </button>
                            </td>
                          </tr>
                        );
                      });
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* STANDARD TABLE DASHBOARD (FOR ALL BUYERS & INDIVIDUAL BUYER TABS) */
        <>
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
                  <p className="font-semibold text-sm">Loading data from Google Sheets...</p>
                </div>
              ) : visibleColumns.length === 0 ? (
                <div className="py-16 text-center text-slate-500">
                  <p className="text-sm font-semibold">All columns are hidden.</p>
                  <button
                    onClick={showAllColumns}
                    className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Restore Columns
                  </button>
                </div>
              ) : (
                <table className="w-full text-left border-collapse border border-slate-300">
                  <thead>
                    {/* Main Table Column Header */}
                    <tr className="bg-slate-100 text-slate-800">
                      {visibleColumns.map((col) => {
                        const isStatus = isStatusColumn(col);
                        const isRemark = col.toLowerCase().includes('remark');
                        const allowWrap = isStatus || isRemark;
                        return (
                          <th 
                            key={col} 
                            className={`p-3.5 font-bold text-xs uppercase tracking-wider border border-slate-300 select-none ${
                              col === 'Buyer Tab' ? 'bg-indigo-100 text-indigo-950 font-extrabold' : 'bg-slate-100'
                            } ${allowWrap ? 'min-w-[170px] max-w-[280px]' : 'whitespace-nowrap'}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span>{col}</span>
                              {isStatus && (
                                <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-normal normal-case">
                                  status
                                </span>
                              )}
                            </div>
                          </th>
                        );
                      })}
                    </tr>

                    {/* In-Header Filter Row */}
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
                          {isUniversalSearchActive 
                            ? `No orders matching "${globalFilter}" found across all tabs.` 
                            : 'No matching records found in this sheet.'}
                        </td>
                      </tr>
                    ) : (
                      currentRows.map((row, i) => (
                        <tr 
                          key={i} 
                          className={`${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} hover:bg-blue-50/40 transition-colors`}
                        >
                          {visibleColumns.map((col) => {
                            if (col === 'Buyer Tab') {
                              return (
                                <td key={col} className="p-3 text-xs font-bold text-indigo-800 bg-indigo-50/50 border border-slate-300 whitespace-nowrap align-top">
                                  <span className="bg-indigo-100 px-2.5 py-1 rounded-md border border-indigo-200 inline-block">
                                    {row._tabSource || activeTabName}
                                  </span>
                                </td>
                              );
                            }

                            const val = row[col];
                            const isStatus = isStatusColumn(col);
                            const isRemark = col.toLowerCase().includes('remark');
                            const allowWrap = isStatus || isRemark;

                            return (
                              <td 
                                key={col} 
                                className={`p-3 text-sm text-slate-800 border border-slate-300 ${
                                  allowWrap 
                                    ? 'whitespace-normal break-words min-w-[170px] max-w-[280px] align-top' 
                                    : 'whitespace-nowrap align-top'
                                }`}
                              >
                                {isStatus 
                                  ? getStatusPill(val) 
                                  : (val !== undefined && val !== null && val !== '' ? (
                                      isRemark ? (
                                        <div className="leading-relaxed text-slate-700 text-xs whitespace-pre-line break-words max-w-[260px]">
                                          {val}
                                        </div>
                                      ) : val
                                    ) : '-')}
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
                {isUniversalSearchActive && (
                  <span className="ml-2 text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    Across All Tabs
                  </span>
                )}
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
        </>
      )}

      {/* ========================================================================= */}
      {/* MODAL: AUTHORIZATION / LOGIN FOR LINE WISE PO ALLOCATION */}
      {/* ========================================================================= */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-fadeIn">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-amber-500/20 border border-amber-400 text-amber-300 flex items-center justify-center font-extrabold text-base">
                  <Lock size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white">
                    Planner Authorization
                  </h3>
                  <p className="text-xs text-slate-300">
                    Felix Fashions Ltd • Store Department
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowAuthModal(false);
                  setAuthError(null);
                }}
                className="h-8 w-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} className="p-6 space-y-4">
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
                <p className="font-bold flex items-center gap-1.5 mb-1 text-amber-950">
                  <ShieldCheck size={14} className="text-amber-700" />
                  Public Dashboard Protection
                </p>
                <p>
                  As this dashboard link is public, line-wise PO allocation and queue reordering require authorized credentials.
                </p>
              </div>

              {authError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle size={15} className="text-rose-600 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  User / Role
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  placeholder="planner or store"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="Enter password..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                />
              </div>


              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowAuthModal(false);
                    setAuthError(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5"
                >
                  <KeyRound size={14} />
                  <span>Authorize & Unlock</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ASSIGN / REORDER UP TO 5 POS FOR A SPECIFIC SEWING LINE */}
      {/* ========================================================================= */}
      {editingLine && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-fadeIn">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-amber-500/20 border border-amber-400 text-amber-300 flex items-center justify-center font-extrabold text-base">
                  <Factory size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-lg text-white flex items-center gap-2">
                    <span>Manage Upcoming POs: {editingLine}</span>
                    <span className="text-xs bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full font-bold">
                      {(lineAllocations[editingLine] || []).length} / 5 Slots Filled
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Assign, prioritize and reorder the 5 upcoming POs for this sewing line.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setEditingLine(null)}
                className="h-9 w-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Current 5 Assigned POs Queue */}
              <div>
                <h4 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider mb-3 flex items-center justify-between">
                  <span>Current 5 PO Queue for {editingLine}</span>
                  <span className="text-xs font-semibold text-slate-500 normal-case">
                    Drag / Click arrows to reorder queue
                  </span>
                </h4>

                <div className="space-y-2.5">
                  {(lineAllocations[editingLine] || []).length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-500">
                      No POs assigned to {editingLine} yet. Select from the available list below!
                    </div>
                  ) : (
                    (lineAllocations[editingLine] || []).map((orderKey, idx) => {
                      const order = ordersByKey.get(orderKey);
                      if (!order) return null;
                      const readiness = checkOrderReadiness(order);
                      const isNext = idx === 0;

                      return (
                        <div 
                          key={orderKey}
                          className={`p-3 rounded-2xl border flex items-center justify-between gap-3 ${
                            isNext ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-300' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`h-7 w-7 rounded-lg font-extrabold text-xs flex items-center justify-center shrink-0 ${
                              isNext ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-700'
                            }`}>
                              #{idx + 1}
                            </span>

                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-slate-900 text-sm">PO #{order['PO']}</span>
                                <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                                  {order._tabSource}
                                </span>
                                {isNext && (
                                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-600 text-white">
                                    CURRENT RUNNING
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-600 mt-0.5">
                                Style: <strong>{order['STYLE']}</strong> • Item: {order['ITEM']} • {order['DZN']} DZN • Ship: {order['SHIP DATE']}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Material pill preview */}
                            <div className="hidden sm:flex items-center gap-1 text-[10px] font-bold">
                              <span className={`px-1.5 py-0.5 rounded ${readiness.fabricOk ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                Fab: {readiness.fabricOk ? 'OK' : 'Pending'}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded ${readiness.sewingOk ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                Sew: {readiness.sewingOk ? 'OK' : 'Pending'}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded ${readiness.finishingOk ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                Fin: {readiness.finishingOk ? 'OK' : 'Pending'}
                              </span>
                            </div>

                            {/* Move Up / Down */}
                            <div className="flex items-center gap-1">
                              <button
                                disabled={idx === 0}
                                onClick={() => movePoInLine(editingLine, idx, 'up')}
                                className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                                title="Move up"
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                disabled={idx === (lineAllocations[editingLine] || []).length - 1}
                                onClick={() => movePoInLine(editingLine, idx, 'down')}
                                className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                                title="Move down"
                              >
                                <ArrowDown size={14} />
                              </button>
                            </div>

                            {/* Remove button */}
                            <button
                              onClick={() => removePoFromLine(editingLine, orderKey)}
                              className="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 cursor-pointer"
                              title="Remove PO from line"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Add More POs to this Line */}
              <div className="pt-4 border-t border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  <h4 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider">
                    Add PO to {editingLine} (Available from Store Sheets)
                  </h4>
                  <div className="flex items-center gap-2">
                    <select
                      value={lineModalBuyerFilter}
                      onChange={(e) => setLineModalBuyerFilter(e.target.value)}
                      className="text-xs bg-slate-50 border border-slate-300 rounded-lg p-1.5 font-medium outline-none"
                    >
                      <option value="ALL">All Buyers</option>
                      {tabs.map(t => (
                        <option key={t.name} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Filter search in modal */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input
                    type="text"
                    value={lineModalSearch}
                    onChange={(e) => setLineModalSearch(e.target.value)}
                    placeholder="Search by PO number, style, or item..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>

                {/* List of Available Orders */}
                <div className="max-h-60 overflow-y-auto space-y-2 border border-slate-200 rounded-2xl p-2 bg-slate-50/50">
                  {allMasterOrders
                    .filter(order => {
                      if (!order['PO']) return false;
                      // Filter by buyer tab if selected
                      if (lineModalBuyerFilter !== 'ALL' && order._tabSource !== lineModalBuyerFilter) {
                        return false;
                      }
                      // Filter by search query
                      if (lineModalSearch.trim()) {
                        const q = lineModalSearch.toLowerCase();
                        const match = 
                          String(order['PO'] || '').toLowerCase().includes(q) ||
                          String(order['STYLE'] || '').toLowerCase().includes(q) ||
                          String(order['ITEM'] || '').toLowerCase().includes(q) ||
                          String(order._tabSource || '').toLowerCase().includes(q);
                        if (!match) return false;
                      }
                      return true;
                    })
                    .slice(0, 40)
                    .map(order => {
                      const alreadyInThisLine = (lineAllocations[editingLine] || []).includes(order._uniqueKey);
                      const isLineFull = (lineAllocations[editingLine] || []).length >= 5;
                      const readiness = checkOrderReadiness(order);

                      return (
                        <div 
                          key={order._uniqueKey} 
                          className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between gap-2 text-xs hover:border-slate-300"
                        >
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-slate-900">PO #{order['PO']}</span>
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700">
                                {order._tabSource}
                              </span>
                              <span className="text-slate-500 font-medium">Style: {order['STYLE']}</span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {order['ITEM']} • {order['DZN']} Dzn • Ship: {order['SHIP DATE']}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              readiness.isReady ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {readiness.isReady ? 'Ready' : 'Pending'}
                            </span>

                            {alreadyInThisLine ? (
                              <button
                                onClick={() => removePoFromLine(editingLine, order._uniqueKey)}
                                className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 font-bold text-xs hover:bg-rose-100 border border-rose-200 cursor-pointer"
                              >
                                Remove
                              </button>
                            ) : (
                              <button
                                disabled={isLineFull}
                                onClick={() => addPoToLine(editingLine, order._uniqueKey)}
                                className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 transition shadow-2xs"
                              >
                                <Plus size={13} />
                                <span>Add to Line</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <Database size={14} className={isDbSaving ? "text-amber-500 animate-spin" : "text-emerald-600"} />
                <span className={isDbSaving ? "text-amber-700 font-semibold" : "text-slate-600 font-medium"}>
                  {isDbSaving 
                    ? "Saving changes to Cloud Database..." 
                    : "Saved to Cloud Database in real-time across all devices!"}
                </span>
              </div>
              <button
                onClick={() => setEditingLine(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Credit */}
      <footer className="mt-12 pt-6 pb-6 border-t border-slate-200 text-center">
        <div className="inline-flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 px-6 py-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs text-xs text-slate-600">
          <span className="font-semibold text-slate-500">Designed & Maintained by:</span>
          <span className="font-extrabold text-blue-700 text-sm tracking-wide">Md Mahbubur Rahman</span>
          <span className="hidden sm:inline text-slate-300">•</span>
          <span className="font-semibold text-slate-700">Store Department</span>
          <span className="hidden sm:inline text-slate-300">•</span>
          <span className="font-bold text-slate-800">
            Felix Fashions Ltd <span className="font-normal text-slate-500">(Four H Group)</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
