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
  Factory,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  AlertCircle,
  LayoutGrid,
  Table as TableIcon,
  Lock,
  ShieldCheck,
  KeyRound,
  Database,
  Warehouse,
  ClipboardList,
  PackageCheck,
  Boxes,
  Columns3,
  Tag,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { saveLineAllocationsToFirestore, subscribeToLineAllocations, testFirestoreConnection } from './firebase';
import FabricStoreTab from './components/FabricStoreTab';
import { PublicRackView } from './components/fabric-store/PublicRackView';
import { BrFabricUpdateView, BrFabricUpdateRow } from './components/BrFabricUpdateView';

const GOOGLE_SPREADSHEET_ID = '13JOa8EhpNDESBd7aEVpyu8PUjfh_-Fgk';
const SHEET_BASE = `https://docs.google.com/spreadsheets/d/${GOOGLE_SPREADSHEET_ID}`;
const DISCOVERY_URL = `${SHEET_BASE}/htmlview`;

interface TabItem {
  name: string;
  gid: string;
}

const INITIAL_TABS: TabItem[] = [
  { name: 'LC WAIKIKI(Tariq sir)', gid: '1010418228' },
  { name: 'Madam', gid: '1241943445' },
  { name: 'BR Fahim Sujoy', gid: '1104604649' },
  { name: 'BR FABRIC UPDATE', gid: '847751726' },
  { name: 'Monoprix', gid: '1867240217' },
  { name: 'TESCO', gid: '1231388255' },
  { name: 'OVS', gid: '184665161' },
];

const isBrFabricUpdateTab = (name: string) =>
  name.trim().toUpperCase() === 'BR FABRIC UPDATE';

const TOTAL_SEWING_LINES = 15;
const ALL_LINE_NAMES = Array.from({ length: TOTAL_SEWING_LINES }, (_, i) => `Line ${String(i + 1).padStart(2, '0')}`);
const LINE_ALLOCATION_STORAGE_KEY = 'felix_sewing_line_allocations_v1';
const TABS_DATA_CACHE_KEY = 'felix_tabs_data_cache_v8';
const TABS_LIST_CACHE_KEY = 'felix_tabs_list_cache_v8';
const LAST_SYNC_CACHE_KEY = 'felix_last_sync_time_v8';

// Canonical column name normalizer to unify case differences across different buyer tabs
const normalizeHeader = (rawKey: string): string | null => {
  const k = rawKey.trim().toLowerCase();
  if (!k || /^_\d+$/.test(k) || k.startsWith('__parsed_extra')) {
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
  const [tabs, setTabs] = useState<TabItem[]>(() => {
    try {
      const cached = localStorage.getItem(TABS_LIST_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse cached tabs list', e);
    }
    return INITIAL_TABS;
  });

  // Store data for all tabs in a map: tabName -> rows[]
  // Instantly hydrated from localStorage so user never waits with 0 orders or hidden columns!
  const [tabsData, setTabsData] = useState<Record<string, any[]>>(() => {
    try {
      const cached = localStorage.getItem(TABS_DATA_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to parse cached tabs data', e);
    }
    return {};
  });

  // Public QR Rack landing state (?rack=A-01) & Manage handoff
  const [publicRackCode, setPublicRackCode] = useState<string | null>(() => {
    try {
      const param = new URLSearchParams(window.location.search).get('rack');
      return param && param.trim() ? param.trim().toUpperCase() : null;
    } catch {
      return null;
    }
  });
  const [pendingManageRackId, setPendingManageRackId] = useState<string | null>(null);

  const syncRackUrlParam = useCallback((code: string | null) => {
    try {
      const url = new URL(window.location.href);
      if (code && code.trim()) {
        url.searchParams.set('rack', code.trim().toUpperCase());
      } else {
        url.searchParams.delete('rack');
      }
      window.history.replaceState({}, '', url.toString());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      try {
        const param = new URLSearchParams(window.location.search).get('rack');
        setPublicRackCode(param && param.trim() ? param.trim().toUpperCase() : null);
      } catch {
        setPublicRackCode(null);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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
  const [lastUpdated, setLastUpdated] = useState<Date | null>(() => {
    try {
      const cached = localStorage.getItem(LAST_SYNC_CACHE_KEY);
      if (cached) {
        const d = new Date(cached);
        if (!isNaN(d.getTime())) return d;
      }
    } catch (e) {
      console.warn('Failed to parse last sync time', e);
    }
    return null;
  });
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
  const [expandedReadiness, setExpandedReadiness] = useState<{
    slotKey: string;
    field: 'fabric' | 'sewing' | 'finishing';
  } | null>(null);

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
  const [dbError, setDbError] = useState<string | null>(null);
  const [lastDbSaveTime, setLastDbSaveTime] = useState<Date | null>(null);

  // Subscribe to real-time Cloud Firestore updates so all devices and users stay in sync
  useEffect(() => {
    // Check initial connection
    testFirestoreConnection().then(ok => {
      if (ok) setIsDbConnected(true);
    });

    const unsubscribe = subscribeToLineAllocations(
      (remoteAllocations, updatedAt) => {
        setIsDbConnected(true);
        if (remoteAllocations && typeof remoteAllocations === 'object') {
          setLineAllocations(prev => {
            const merged: Record<string, string[]> = { ...prev, ...remoteAllocations };
            ALL_LINE_NAMES.forEach(line => {
              if (!merged[line]) merged[line] = [];
            });
            return merged;
          });
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

  // Persist tabsData to localStorage for instant 0ms startup
  useEffect(() => {
    try {
      if (tabsData && Object.keys(tabsData).length > 0) {
        localStorage.setItem(TABS_DATA_CACHE_KEY, JSON.stringify(tabsData));
      }
    } catch (e) {
      console.warn('Failed to cache tabsData', e);
    }
  }, [tabsData]);

  // Persist tab list
  useEffect(() => {
    try {
      if (tabs && tabs.length > 0) {
        localStorage.setItem(TABS_LIST_CACHE_KEY, JSON.stringify(tabs));
      }
    } catch (e) {
      console.warn('Failed to cache tabs list', e);
    }
  }, [tabs]);

  // Persist last sync time
  useEffect(() => {
    try {
      if (lastUpdated) {
        localStorage.setItem(LAST_SYNC_CACHE_KEY, lastUpdated.toISOString());
      }
    } catch (e) {
      console.warn('Failed to cache last sync time', e);
    }
  }, [lastUpdated]);

  // 1. Discover tabs and GIDs dynamically from htmlview (with cache-busting & non-blocking timeout)
  const discoverTabs = useCallback(async (): Promise<TabItem[]> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);
      const bustUrl = `${DISCOVERY_URL}?_cb=${Date.now()}`;
      const res = await fetch(bustUrl, {
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeoutId);
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
        // Ensure BR FABRIC UPDATE stays positioned immediately after BR Fahim Sujoy
        const brFabricIdx = foundTabs.findIndex(t => isBrFabricUpdateTab(t.name));
        const brSujoyIdx = foundTabs.findIndex(t => t.name.toLowerCase().includes('br fahim'));
        if (brFabricIdx !== -1 && brSujoyIdx !== -1 && brFabricIdx !== brSujoyIdx + 1) {
          const [brFabTab] = foundTabs.splice(brFabricIdx, 1);
          const updatedSujoyIdx = foundTabs.findIndex(t => t.name.toLowerCase().includes('br fahim'));
          foundTabs.splice(updatedSujoyIdx + 1, 0, brFabTab);
        }
        setTabs(foundTabs);
        return foundTabs;
      }
    } catch (err) {
      console.warn('Could not refresh tabs dynamically from htmlview:', err);
    }
    return tabs;
  }, [tabs]);

  // Multi-block parser tailored for "BR FABRIC UPDATE" (FILE NO / PO / STYLE blocks + COLOR/SIZE rows + unit columns)
  const parseBrFabricUpdateRows = (rawRows: string[][], tabName: string): BrFabricUpdateRow[] => {
    let currentFileNo = '';
    let currentPo = '';
    let currentStyle = '';
    let currentColor = '';

    let colMap = {
      color: 0,
      size: 1,
      dia: 2,
      fileReq: 3,
      overCon: 5,
      addReplace: 6,
      totalReq: 7,
      storeRcvd: 9,
      rcvdBal: 11,
      cuttingSupply: 13,
      storeInHand: 15,
      reqSupBal: 17,
      remarks: 19,
    };

    const parsedRows: BrFabricUpdateRow[] = [];

    for (let rIdx = 0; rIdx < rawRows.length; rIdx++) {
      const cells = rawRows[rIdx];
      if (!Array.isArray(cells)) continue;
      const row = cells.map((c) => String(c ?? '').trim());
      if (!row.some(Boolean)) continue;

      const upperRow = row.map((c) => c.toUpperCase());

      // Detect PO/File block header row (e.g. FILE NO | 108 | PO | 4500042685 | STYLE | RDMP271CPT903)
      const hasFileNoLabel = upperRow.some((c) => c === 'FILE NO' || c === 'FILE');
      const hasPoLabel = upperRow.some((c) => c === 'PO' || c === 'PO NO');
      if (hasFileNoLabel || (hasPoLabel && upperRow.some((c) => c === 'STYLE'))) {
        const readNextVal = (startIdx: number) => {
          for (let j = startIdx + 1; j < row.length; j++) {
            const u = upperRow[j];
            if (u === 'FILE NO' || u === 'FILE' || u === 'PO' || u === 'PO NO' || u === 'STYLE') break;
            if (row[j]) return row[j];
          }
          return '';
        };
        const fileIdx = upperRow.findIndex((c) => c === 'FILE NO' || c === 'FILE');
        const poIdx = upperRow.findIndex((c) => c === 'PO' || c === 'PO NO');
        const styleIdx = upperRow.findIndex((c) => c === 'STYLE');

        if (fileIdx !== -1) currentFileNo = readNextVal(fileIdx) || currentFileNo;
        if (poIdx !== -1) currentPo = readNextVal(poIdx) || currentPo;
        if (styleIdx !== -1) currentStyle = readNextVal(styleIdx) || currentStyle;
        currentColor = '';
        continue;
      }

      // Detect column header row (COLOR | SIZE | DIA | FILE REQ ...)
      if (upperRow.includes('COLOR') && upperRow.includes('SIZE')) {
        const nextMap = { ...colMap };
        upperRow.forEach((h, c) => {
          if (h === 'COLOR') nextMap.color = c;
          else if (h === 'SIZE') nextMap.size = c;
          else if (h === 'DIA') nextMap.dia = c;
          else if (h.includes('FILE REQ')) nextMap.fileReq = c;
          else if (h.includes('OVER CON')) nextMap.overCon = c;
          else if (
            h.includes('ADDITIONAL') ||
            h.includes('ADD/') ||
            h.includes('NEED ADD') ||
            h.includes('REPLACE')
          ) nextMap.addReplace = c;
          else if (h.includes('TOTAL REQ')) nextMap.totalReq = c;
          else if (h.includes('STORE RCVD')) nextMap.storeRcvd = c;
          else if (h.includes('RCVD BALANCE')) nextMap.rcvdBal = c;
          else if (h.includes('CUTTING SUPPLY')) nextMap.cuttingSupply = c;
          else if (h.includes('STORE IN HAND')) nextMap.storeInHand = c;
          else if (h.includes('REQ-SUP') || h.includes('REQ SUP')) nextMap.reqSupBal = c;
          else if (h.includes('REMARK')) nextMap.remarks = c;
        });
        colMap = nextMap;
        continue;
      }

      const rawColor = row[colMap.color] || '';
      if (rawColor && !/^total$/i.test(rawColor)) {
        currentColor = rawColor;
      }

      const sizeVal = row[colMap.size] || '';
      const diaVal = row[colMap.dia] || '';
      const isCrossRow = /^cross$/i.test(sizeVal);
      const isTotalRow =
        !isCrossRow &&
        ((!sizeVal && !diaVal) ||
          /^total$/i.test(rawColor) ||
          /^total$/i.test(sizeVal));

      const parseNum = (idx: number) => {
        const clean = (row[idx] || '').replace(/,/g, '');
        const n = parseFloat(clean);
        return isNaN(n) ? 0 : n;
      };

      const fmtWithUnit = (idx: number, hasUnitCol = true) => {
        const v = row[idx] || '';
        if (!v) return '-';
        const u = hasUnitCol ? (row[idx + 1] || '') : '';
        return u ? `${v} ${u}` : v;
      };

      const blockKey = `${currentFileNo || 'FILE'}___${currentPo || 'PO'}___${currentStyle || 'STYLE'}`;
      parsedRows.push({
        _tabSource: tabName,
        _uniqueKey: `${tabName}___${blockKey}___${rIdx}`,
        _isFabricUpdateRow: true,
        _isTotalRow: isTotalRow,
        _isCrossRow: isCrossRow,
        _blockKey: blockKey,
        'File No': currentFileNo || '-',
        PO: currentPo || '-',
        STYLE: currentStyle || '-',
        COLOR: /^total$/i.test(rawColor) ? 'TOTAL' : (currentColor || '-'),
        SIZE: isTotalRow ? 'TOTAL' : (sizeVal || '-'),
        DIA: diaVal || '-',
        'FILE REQ': fmtWithUnit(colMap.fileReq, true),
        'OVER CON': row[colMap.overCon] || '-',
        'Need Additional/ Replace': row[colMap.addReplace] || '-',
        'TOTAL REQ QTY': fmtWithUnit(colMap.totalReq, true),
        'STORE RCVD': fmtWithUnit(colMap.storeRcvd, true),
        'RCVD BALANCE': fmtWithUnit(colMap.rcvdBal, true),
        'CUTTING SUPPLY': fmtWithUnit(colMap.cuttingSupply, true),
        'STORE IN HAND': fmtWithUnit(colMap.storeInHand, true),
        'REQ-SUP BALANCE': fmtWithUnit(colMap.reqSupBal, true),
        REMARKS: row[colMap.remarks] || '',
        _fileReqNum: parseNum(colMap.fileReq),
        _overConNum: parseNum(colMap.overCon),
        _addReplaceNum: parseNum(colMap.addReplace),
        _totalReqNum: parseNum(colMap.totalReq),
        _storeRcvdNum: parseNum(colMap.storeRcvd),
        _rcvdBalNum: parseNum(colMap.rcvdBal),
        _cuttingSupplyNum: parseNum(colMap.cuttingSupply),
        _storeInHandNum: parseNum(colMap.storeInHand),
        _reqSupBalNum: parseNum(colMap.reqSupBal),
      });
    }

    return parsedRows;
  };

  // Helper to fetch and parse a single tab's CSV with cache-busting & fast timeout protection
  const parseSingleTab = async (tabItem: TabItem): Promise<any[]> => {
    const isFabricUpdateSheet =
      tabItem.gid === '1394969873' ||
      tabItem.gid === '1755552135' ||
      isBrFabricUpdateTab(tabItem.name);

    // For BR FABRIC UPDATE, export?format=csv preserves all text headers/labels (gviz strips text headers in numeric columns).
    // Standard buyer PO tabs continue using direct gviz CSV endpoint.
    const primaryUrl = isFabricUpdateSheet
      ? `${SHEET_BASE}/export?format=csv&gid=${tabItem.gid}&_cb=${Date.now()}`
      : `${SHEET_BASE}/gviz/tq?tqx=out:csv&gid=${tabItem.gid}&_cb=${Date.now()}`;
    const fallbackUrl = `${SHEET_BASE}/gviz/tq?tqx=out:csv&gid=${tabItem.gid}&_cb=${Date.now()}`;

    const fetchCsvText = async (url: string): Promise<string> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8500);
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          cache: 'no-store',
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} on tab ${tabItem.name}`);
        }
        const csvText = await response.text();
        const trimmed = csvText.trim();
        if (trimmed.startsWith('<!DOCTYPE html') || trimmed.startsWith('<html')) {
          throw new Error(`Google Sheet returned temporary HTML for ${tabItem.name}`);
        }
        return csvText;
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }
    };

    let csvText: string;
    try {
      csvText = await fetchCsvText(primaryUrl);
    } catch (primaryErr) {
      if (isFabricUpdateSheet) {
        csvText = await fetchCsvText(fallbackUrl);
      } else {
        throw primaryErr;
      }
    }

    return new Promise((resolve) => {
      // Parse with header: false to avoid PapaParse "Duplicate headers found and renamed." warnings
      // on Google Sheets that contain blank or repeated column headers
      Papa.parse<string[]>(csvText, {
        header: false,
        skipEmptyLines: 'greedy',
        complete: (results) => {
          const rawRows = results.data;
          if (!Array.isArray(rawRows) || rawRows.length < 2) {
            resolve([]);
            return;
          }

          if (isFabricUpdateSheet) {
            resolve(parseBrFabricUpdateRows(rawRows, tabItem.name));
            return;
          }

          const headerRow = rawRows[0] || [];
          const colNormKeys = headerRow.map((rawHeader) =>
            normalizeHeader(String(rawHeader ?? ''))
          );

          const cleaned = rawRows
            .slice(1)
            .map((cells, idx) => {
              if (!Array.isArray(cells)) return null;
              const newRow: any = { _tabSource: tabItem.name };
              for (let c = 0; c < cells.length; c++) {
                const normKey = colNormKeys[c];
                if (!normKey) continue;
                const rawVal = cells[c];
                const cellStr = typeof rawVal === 'string' ? rawVal.trim() : rawVal;
                if (
                  cellStr !== undefined &&
                  cellStr !== null &&
                  cellStr !== '' &&
                  (newRow[normKey] === undefined || newRow[normKey] === '')
                ) {
                  newRow[normKey] = cellStr;
                }
              }
              // Skip repeated header rows embedded mid-sheet
              if (
                String(newRow['PO'] || '').trim().toUpperCase() === 'PO' &&
                String(newRow['STYLE'] || '').trim().toUpperCase() === 'STYLE'
              ) {
                return null;
              }
              // Assign a unique row ID for line allocation
              newRow._uniqueKey = getOrderRowKey(newRow, idx);
              return newRow;
            })
            .filter(
              (row) =>
                row &&
                Object.values(row).some(
                  (v) =>
                    v !== undefined &&
                    v !== null &&
                    v !== '' &&
                    v !== row._tabSource &&
                    v !== row._uniqueKey
                )
            );
          resolve(cleaned);
        },
        error: () => resolve([])
      });
    });
  };

  // Fetch all tabs in parallel with Stale-While-Revalidate and automatic self-healing:
  // If Google changes worksheet GIDs, automatically re-discovers and re-fetches!
  const fetchAllTabs = useCallback(async (tabList: TabItem[], isSilent = false) => {
    if (!tabList || tabList.length === 0) return;

    // Only display full loading screen if we literally have zero cached rows
    setIsLoading(prevLoading => {
      const hasAnyRows = Object.keys(tabsData).length > 0;
      if (!hasAnyRows && !isSilent) return true;
      return false;
    });

    setIsRefreshing(true);

    try {
      let activeTabList = tabList;
      let results = await Promise.allSettled(
        activeTabList.map(async tab => {
          const rows = await parseSingleTab(tab);
          return { name: tab.name, rows };
        })
      );

      // Self-healing: If all or most tabs failed (e.g. user re-uploaded sheet with new GIDs), discover fresh GIDs
      const failedCount = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && (!r.value.rows || r.value.rows.length === 0))).length;
      if (failedCount > 0) {
        console.warn(`Detected ${failedCount} failing tabs, checking pubhtml for updated GIDs...`);
        const freshTabs = await discoverTabs();
        const hasGidChanges = freshTabs.some(ft => {
          const old = activeTabList.find(t => t.name === ft.name);
          return !old || old.gid !== ft.gid;
        });

        if (hasGidChanges) {
          activeTabList = freshTabs;
          results = await Promise.allSettled(
            activeTabList.map(async tab => {
              const rows = await parseSingleTab(tab);
              return { name: tab.name, rows };
            })
          );
        }
      }

      const successfulMap: Record<string, any[]> = {};
      results.forEach(res => {
        if (res.status === 'fulfilled' && res.value.rows && res.value.rows.length > 0) {
          successfulMap[res.value.name] = res.value.rows;
        }
      });

      // Update tabsData with fresh data
      if (Object.keys(successfulMap).length > 0) {
        setTabsData(prev => ({ ...prev, ...successfulMap }));
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
  }, [tabsData, discoverTabs]);

  // Unified sync function that always queries live pubhtml and fetches live sheets
  const syncAllData = useCallback(async (isSilent = true) => {
    setIsRefreshing(true);
    try {
      const liveTabs = await discoverTabs();
      const listToFetch = liveTabs && liveTabs.length > 0 ? liveTabs : tabs;
      await fetchAllTabs(listToFetch, isSilent);
    } catch (err: any) {
      console.warn('Sync error:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [discoverTabs, fetchAllTabs, tabs]);

  // Initial load: Instant cached view + immediate parallel background revalidation
  useEffect(() => {
    syncAllData(true);
  }, []);

  // Background Auto-Sync every 25 seconds (always runs unified sync)
  useEffect(() => {
    if (!isAutoRefreshEnabled) return;
    const intervalId = setInterval(() => {
      syncAllData(true);
    }, 25000);
    return () => clearInterval(intervalId);
  }, [isAutoRefreshEnabled, syncAllData]);

  // Master list of all buyer PO orders across buyer tabs (excludes fabric-tracking sub-sheet BR FABRIC UPDATE)
  const allMasterOrders = useMemo(() => {
    const list: any[] = [];
    const seenKeys = new Set<string>();
    Object.entries(tabsData).forEach(([tabName, rows]) => {
      if (isBrFabricUpdateTab(tabName)) return;
      rows.forEach((r, idx) => {
        let key = getOrderRowKey({ ...r, _tabSource: tabName }, idx);
        if (seenKeys.has(key)) {
          let suffix = 1;
          while (seenKeys.has(`${key}__${suffix}`)) suffix++;
          key = `${key}__${suffix}`;
        }
        seenKeys.add(key);
        list.push({
          ...r,
          _tabSource: tabName,
          _uniqueKey: key,
        });
      });
    });
    return list;
  }, [tabsData]);

  // Map of uniqueKey -> Order Object for fast line lookups with resilient PO and Tab fallback
  const ordersByKey = useMemo(() => {
    const map = new Map<string, any>();
    allMasterOrders.forEach(o => {
      map.set(o._uniqueKey, o);
      if (o['PO']) {
        const poStr = String(o['PO']).trim();
        if (!map.has(`PO_${poStr}`)) map.set(`PO_${poStr}`, o);
        const poTabStr = `${o._tabSource}___${poStr}`;
        if (!map.has(poTabStr)) map.set(poTabStr, o);
      }
    });
    return map;
  }, [allMasterOrders]);

  // Resilient order finder: matches exact uniqueKey, or falls back to tab+PO or PO alone
  const getOrderFromKey = useCallback((orderKey: string) => {
    if (!orderKey) return null;
    if (ordersByKey.has(orderKey)) return ordersByKey.get(orderKey);
    const parts = orderKey.split('___');
    if (parts.length >= 2) {
      const tab = parts[0];
      const po = parts[1]?.trim();
      if (po) {
        if (ordersByKey.has(`${tab}___${po}`)) return ordersByKey.get(`${tab}___${po}`);
        if (ordersByKey.has(`PO_${po}`)) return ordersByKey.get(`PO_${po}`);
      }
    }
    return null;
  }, [ordersByKey]);

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
    setDbError(null);

    // Timeout guard so the UI never hangs in saving state
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Save request timed out. Please check network.')), 8000)
    );

    Promise.race([
      saveLineAllocationsToFirestore(updatedAllocations, userRole),
      timeoutPromise
    ])
      .then(() => {
        setIsDbSaving(false);
        setIsDbConnected(true);
        setLastDbSaveTime(new Date());
        setDbError(null);
      })
      .catch((err: any) => {
        console.error('Error saving to Firestore:', err);
        setIsDbSaving(false);
        setDbError(err?.message || 'Cloud sync failed');
      });
  };

  // Line allocation modifiers (Guarded by authorization & saved to Cloud Database)
  const addPoToLine = (lineName: string, orderKey: string) => {
    if (!requireAuthorization(lineName)) return;
    const targetOrder = getOrderFromKey(orderKey);
    setLineAllocations(prev => {
      const current = prev[lineName] || [];
      if (current.includes(orderKey)) return prev;
      if (
        targetOrder &&
        current.some(k => getOrderFromKey(k)?._uniqueKey === targetOrder._uniqueKey)
      ) {
        return prev;
      }
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
        [lineName]: (prev[lineName] || []).filter(
          k => k !== orderKey && getOrderFromKey(k)?._uniqueKey !== orderKey
        )
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

  // Determine if Universal Search mode is active (when on BR FABRIC UPDATE, search stays scoped to BR FABRIC UPDATE)
  const isUniversalSearchActive =
    globalFilter.trim().length > 0 && !isBrFabricUpdateTab(activeTabName);

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

  const checkOrderReadiness = (order: any): { 
    isReady: boolean; 
    isReadyForSewing: boolean; 
    isFullMaterialReady: boolean; 
    fabricOk: boolean; 
    sewingOk: boolean; 
    finishingOk: boolean 
  } => {
    if (!order) return { isReady: false, isReadyForSewing: false, isFullMaterialReady: false, fabricOk: false, sewingOk: false, finishingOk: false };
    const isValOk = (val: any) => {
      const s = String(val || '').toLowerCase().trim();
      return s === 'ok' || s === 'ok.' || s === 'done' || s === 'yes' || s === 'received' || s.startsWith('ok ');
    };
    const fabricOk = isValOk(order['Fabric Update'] || order['Fabric']);
    const sewingOk = isValOk(order['Sewing Acc. Update'] || order['Sewing'] || order['sewing Acc']);
    const finishingOk = isValOk(order['Finishing Acc. Update'] || order['Finishing'] || order['Finishing accessories']);
    
    // For Sewing planning: Fabric + Sewing Accessories OK means Ready for Sewing!
    const isReadyForSewing = fabricOk && sewingOk;
    return {
      isReady: isReadyForSewing,
      isReadyForSewing,
      isFullMaterialReady: fabricOk && sewingOk && finishingOk,
      fabricOk,
      sewingOk,
      finishingOk
    };
  };

  const getStatusPill = (val: string) => {
    const text = (val ?? '').toString().trim();
    if (!text) {
      return <span className="text-slate-400 text-xs font-medium">-</span>;
    }
    const isOk = text.toLowerCase() === 'ok';
    const isShort = text.length <= 10 && !text.includes('\n');

    return (
      <div 
        className={`inline-flex items-center gap-1 text-xs font-bold border transition-colors ${
          isShort 
            ? 'px-2.5 py-1 rounded-md text-center tracking-wide' 
            : 'px-3 py-1.5 rounded-lg text-left leading-relaxed break-words whitespace-normal max-w-[260px]'
        } ${
          isOk 
            ? 'bg-emerald-50 text-emerald-900 border-emerald-400' 
            : 'bg-rose-50 text-rose-900 border-rose-300'
        }`}
      >
        {isOk && <Check size={13} className="shrink-0 stroke-[2.75] text-emerald-700" />}
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
        const order = getOrderFromKey(k);
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
  }, [lineAllocations, getOrderFromKey]);

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
          const order = getOrderFromKey(k);
          if (!order) return false;
          return Object.entries(order).some(([key, val]) => {
            if (key.startsWith('_')) return false;
            return String(val ?? '').toLowerCase().includes(q);
          });
        });
      }
      return true;
    });
  }, [selectedLineFilter, globalFilter, lineAllocations, getOrderFromKey]);

  if (publicRackCode) {
    return (
      <PublicRackView
        rackCode={publicRackCode}
        onExitPublicView={() => {
          syncRackUrlParam(null);
          setPublicRackCode(null);
        }}
        onSelectOtherRack={(newCode) => {
          const clean = newCode.trim().toUpperCase();
          syncRackUrlParam(clean);
          setPublicRackCode(clean);
        }}
        onEnterManageMode={(rackId) => {
          syncRackUrlParam(null);
          setPublicRackCode(null);
          setGlobalFilter('');
          setActiveTabName('__FABRIC_STORE__');
          setPendingManageRackId(rackId);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-5 md:py-7 space-y-6">
        {/* Top Brand & Live Sync Bar */}
        <header className="bg-white rounded-xl border border-slate-300 px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Warehouse size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 truncate">
                Felix Store App
              </h1>
              <p className="text-xs font-semibold text-slate-500">
                Materials Status · 15 Sewing Line Queue · Fabric Store Control
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <button
              onClick={() => setIsAutoRefreshEnabled(!isAutoRefreshEnabled)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold cursor-pointer transition ${
                isAutoRefreshEnabled
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                  : 'bg-slate-100 text-slate-700 border-slate-300'
              }`}
              title="Toggle 25-second background sheet synchronization"
            >
              <Radio size={14} className={isAutoRefreshEnabled ? 'text-emerald-700' : 'text-slate-500'} />
              <span>Auto-Sync: {isAutoRefreshEnabled ? 'ON (25s)' : 'PAUSED'}</span>
            </button>

            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold ${
                isDbSaving
                  ? 'bg-amber-50 text-amber-900 border-amber-300'
                  : dbError
                    ? 'bg-rose-50 text-rose-900 border-rose-300'
                    : isDbConnected
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                      : 'bg-slate-100 text-slate-700 border-slate-300'
              }`}
              title="Real-time Cloud Database synchronization"
            >
              <Database size={14} className={isDbSaving ? 'animate-spin' : ''} />
              <span>
                Cloud DB: {isDbSaving ? 'Saving...' : dbError ? 'Retry Sync' : isDbConnected ? 'Synced' : 'Connecting...'}
              </span>
            </div>

            <div className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-700 font-semibold font-mono">
              {isRefreshing ? 'Syncing Sheet...' : `Sync: ${lastUpdated ? lastUpdated.toLocaleTimeString() : 'Connecting...'}`}
            </div>

            <button
              onClick={() => syncAllData(false)}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold transition cursor-pointer disabled:opacity-50"
              title="Update all buyer orders from Google Sheets immediately"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              <span>{isRefreshing ? 'Syncing...' : 'Refresh Now'}</span>
            </button>
          </div>
        </header>

        {/* Sync Notice Banner if any */}
        {syncNotice && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-400 text-amber-950 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-sm font-semibold">
              <AlertTriangle className="text-amber-700 shrink-0" size={18} />
              <span>{syncNotice}</span>
            </div>
            <button
              onClick={() => syncAllData(false)}
              className="px-3.5 py-1.5 bg-amber-200 hover:bg-amber-300 text-amber-950 rounded-lg text-xs font-bold border border-amber-400 transition cursor-pointer"
            >
              Retry Sync
            </button>
          </div>
        )}

        {/* Summary KPI Cards (Hidden inside Fabric Receiving & Supply and BR FABRIC UPDATE which have their own Store KPIs) */}
        {((activeTabName !== '__FABRIC_STORE__' && !isBrFabricUpdateTab(activeTabName)) || isUniversalSearchActive) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {activeTabName === '__LINE_WISE__' && !isUniversalSearchActive ? (
              <>
                <div className="bg-white p-5 rounded-xl border border-slate-300 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sewing Lines</p>
                    <p className="text-2xl md:text-3xl font-extrabold text-slate-900 font-mono tabular-nums mt-1">15 Lines</p>
                    <p className="text-xs font-semibold text-slate-600 mt-1">Up to 5 POs per line</p>
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-amber-50 text-amber-700 border border-amber-300 flex items-center justify-center shrink-0">
                    <Factory size={22} />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-300 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Line Allocated POs</p>
                    <p className="text-2xl md:text-3xl font-extrabold text-blue-900 font-mono tabular-nums mt-1">
                      {lineMetrics.totalAllocatedPos}{' '}
                      <span className="text-sm font-semibold text-slate-400">/ 75</span>
                    </p>
                    <p className="text-xs font-bold text-emerald-700 mt-1">{lineMetrics.linesWithFullQueue} Lines full (5/5)</p>
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-700 border border-blue-300 flex items-center justify-center shrink-0">
                    <ClipboardList size={22} />
                  </div>
                </div>

                <div className="bg-emerald-50/70 p-5 rounded-xl border border-emerald-400 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Ready for Sewing</p>
                    <p className="text-2xl md:text-3xl font-extrabold text-emerald-900 font-mono tabular-nums mt-1">
                      {lineMetrics.totalReadyPos}{' '}
                      <span className="text-sm font-bold text-emerald-700">({lineMetrics.readyPercentage}%)</span>
                    </p>
                    <p className="text-xs font-semibold text-emerald-800 mt-1">Fabric & Sewing Acc. OK</p>
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-emerald-600 text-white border border-emerald-700 flex items-center justify-center shrink-0">
                    <PackageCheck size={22} />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-300 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Orders in Store</p>
                    <p className="text-2xl md:text-3xl font-extrabold text-slate-900 font-mono tabular-nums mt-1">
                      {allMasterOrders.length}
                    </p>
                    <p className="text-xs font-semibold text-slate-600 mt-1">Synced across all buyers</p>
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-slate-100 text-slate-800 border border-slate-300 flex items-center justify-center shrink-0">
                    <Boxes size={22} />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="bg-white p-5 rounded-xl border border-slate-300 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {isUniversalSearchActive ? 'Matched Orders (All Tabs)' : 'Total Orders'}
                    </p>
                    <p className="text-2xl md:text-3xl font-extrabold text-slate-900 font-mono tabular-nums mt-1">
                      {filteredData.length}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-700 border border-blue-300 flex items-center justify-center shrink-0">
                    <Boxes size={22} />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-300 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {isUniversalSearchActive ? 'Matched DZN' : 'Total DZN'}
                    </p>
                    <p className="text-2xl md:text-3xl font-extrabold text-indigo-900 font-mono tabular-nums mt-1">
                      {totalDzn.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-300 flex items-center justify-center shrink-0">
                    <ClipboardList size={22} />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-300 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Visible Columns</p>
                    <p className="text-2xl md:text-3xl font-extrabold text-slate-900 font-mono tabular-nums mt-1">
                      {visibleColumns.length} <span className="text-sm font-semibold text-slate-400">/ {allColumns.length}</span>
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-amber-50 text-amber-700 border border-amber-300 flex items-center justify-center shrink-0">
                    <Columns3 size={22} />
                  </div>
                </div>

                <div className="bg-slate-900 text-white p-5 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active View</p>
                    <p className="text-base font-extrabold text-emerald-400 mt-1.5 truncate">
                      {isUniversalSearchActive ? 'All Buyer Tabs' : activeTabName === '__ALL__' ? 'All Combined' : activeTabName}
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-slate-800 text-emerald-400 border border-slate-700 flex items-center justify-center shrink-0">
                    <Tag size={20} />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Search & Action Bar */}
        <div className="bg-white p-4 rounded-xl border border-slate-300">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input
                className="w-full pl-10 pr-10 py-2.5 bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none transition"
                placeholder="Search across all buyer tabs & lines by PO, Style, Buyer, Item, Line, Remark..."
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900 cursor-pointer p-1"
                  title="Clear Search"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {!( (activeTabName === '__FABRIC_STORE__' || isBrFabricUpdateTab(activeTabName)) && !isUniversalSearchActive) && (
              <div className="flex items-center gap-2.5 flex-wrap">
                {activeTabName === '__LINE_WISE__' && !isUniversalSearchActive ? (
                  <>
                    {isAuthorized ? (
                      <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-900 border border-emerald-400">
                        <ShieldCheck size={15} className="text-emerald-700 shrink-0" />
                        <span>Planner Mode Active</span>
                        <button
                          onClick={handleLogout}
                          className="ml-1 px-2 py-0.5 rounded bg-white border border-emerald-300 text-slate-700 hover:text-rose-700 font-bold cursor-pointer"
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
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-950 hover:bg-amber-200 border border-amber-400 transition cursor-pointer"
                        title="Log in to allocate or manage POs"
                      >
                        <Lock size={14} className="text-amber-800" />
                        <span>Planner Login</span>
                      </button>
                    )}

                    <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-300">
                      <button
                        onClick={() => setLineViewMode('cards')}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                          lineViewMode === 'cards' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:text-slate-900'
                        }`}
                        title="Card / Grid View"
                      >
                        <LayoutGrid size={14} />
                        <span>Cards</span>
                      </button>
                      <button
                        onClick={() => setLineViewMode('table')}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                          lineViewMode === 'table' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:text-slate-900'
                        }`}
                        title="Grouped Table View"
                      >
                        <TableIcon size={14} />
                        <span>Table</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setShowHeaderFilterRow(prev => !prev)}
                      className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                        showHeaderFilterRow || Object.values(columnFilters).some(Boolean)
                          ? 'bg-indigo-600 text-white border-indigo-700'
                          : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                      }`}
                      title="Toggle individual column header filters"
                    >
                      <Filter size={15} />
                      <span>Column Filters</span>
                      {Object.values(columnFilters).filter(Boolean).length > 0 && (
                        <span className="bg-white text-indigo-800 rounded px-1.5 py-0.5 text-[11px] font-extrabold">
                          {Object.values(columnFilters).filter(Boolean).length}
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => setIsColumnPanelOpen(prev => !prev)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                        isColumnPanelOpen
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <SlidersHorizontal size={15} />
                      <span>Columns ({visibleColumns.length}/{allColumns.length})</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {isUniversalSearchActive && (
            <div className="mt-3 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-blue-950 font-bold bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-300">
                <span>
                  Universal Search: Found <strong className="font-mono">{filteredData.length}</strong> matching order(s) across all sheets
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-slate-500 font-semibold">Found in:</span>
                {Object.entries(tabMatchesCount).map(([tName, count]) => (
                  <span key={tName} className="bg-slate-100 text-slate-800 px-2.5 py-1 rounded-md font-semibold border border-slate-300">
                    {tName}: <strong className="text-blue-800 font-mono">{count}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Navigation Tab Switcher */}
        <nav className="flex items-center gap-2 overflow-x-auto pb-3 border-b border-slate-300 scrollbar-none">
          <button
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm transition whitespace-nowrap shrink-0 cursor-pointer border ${
              !isUniversalSearchActive && activeTabName === '__LINE_WISE__'
                ? 'bg-amber-600 text-white border-amber-700'
                : 'bg-white text-slate-800 border-slate-300 hover:border-amber-500 hover:bg-amber-50/60'
            }`}
            onClick={() => {
              setGlobalFilter('');
              setActiveTabName('__LINE_WISE__');
              setCurrentPage(1);
            }}
          >
            <Factory size={16} />
            <span>Line Wise Update (15)</span>
          </button>

          <button
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm transition whitespace-nowrap shrink-0 cursor-pointer border ${
              !isUniversalSearchActive && activeTabName === '__FABRIC_STORE__'
                ? 'bg-emerald-700 text-white border-emerald-800'
                : 'bg-white text-slate-800 border-slate-300 hover:border-emerald-600 hover:bg-emerald-50/60'
            }`}
            onClick={() => {
              setGlobalFilter('');
              setActiveTabName('__FABRIC_STORE__');
              setCurrentPage(1);
            }}
          >
            <Warehouse size={16} />
            <span>Fabric Receiving & Supply</span>
          </button>

          <button
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg font-bold text-sm transition whitespace-nowrap shrink-0 cursor-pointer border ${
              !isUniversalSearchActive && activeTabName === '__ALL__'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-800 border-slate-300 hover:border-slate-500 hover:bg-slate-50'
            }`}
            onClick={() => {
              setGlobalFilter('');
              setActiveTabName('__ALL__');
              setCurrentPage(1);
            }}
          >
            <Layers size={15} />
            <span>All Buyers ({allMasterOrders.length})</span>
          </button>

          {tabs.map(tab => (
            <button
              key={tab.name}
              className={`px-4 py-2.5 rounded-lg font-bold text-sm transition whitespace-nowrap shrink-0 cursor-pointer border ${
                !isUniversalSearchActive && activeTabName === tab.name
                  ? 'bg-blue-700 text-white border-blue-800'
                  : 'bg-white text-slate-800 border-slate-300 hover:border-blue-500 hover:bg-slate-50'
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
                <span className="ml-1.5 text-xs font-mono opacity-80">
                  ({tabsData[tab.name].length})
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* RENDER CONTENT: FABRIC STORE, BR FABRIC UPDATE, LINE WISE UPDATE, OR STANDARD TABLE */}
        {activeTabName === '__FABRIC_STORE__' && !isUniversalSearchActive ? (
          <FabricStoreTab
            allMasterOrders={allMasterOrders}
            lineNames={ALL_LINE_NAMES}
            initialRackId={pendingManageRackId}
            onConsumeInitialRackId={() => setPendingManageRackId(null)}
            onPreviewPublicRack={(code) => {
              const clean = code.trim().toUpperCase();
              syncRackUrlParam(clean);
              setPublicRackCode(clean);
            }}
          />
        ) : isBrFabricUpdateTab(activeTabName) && !isUniversalSearchActive ? (
          <BrFabricUpdateView
            rows={(tabsData[activeTabName] || []) as BrFabricUpdateRow[]}
            globalFilter={globalFilter}
            isLoading={isLoading || isRefreshing}
            onRefresh={() => syncAllData(false)}
          />
        ) : activeTabName === '__LINE_WISE__' && !isUniversalSearchActive ? (
          /* LINE WISE UPDATE VIEW */
          <div className="space-y-5">
            {/* Line Filter Bar (Line 01 to Line 15) */}
            <div className="bg-white p-4 rounded-xl border border-slate-300 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-700 shrink-0">
                <Factory size={16} className="text-amber-600" />
                <span>Filter Line:</span>
              </div>
              
              <div className="flex items-center gap-1.5 flex-wrap flex-1">
                <button
                  onClick={() => setSelectedLineFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                    selectedLineFilter === 'ALL'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                        selectedLineFilter === lineName
                          ? 'bg-amber-600 text-white border-amber-700'
                          : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span>{lineName}</span>
                      <span className={`text-[11px] font-mono px-1.5 rounded ${selectedLineFilter === lineName ? 'bg-amber-800 text-white' : 'bg-slate-100 text-slate-700 border border-slate-300'}`}>
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
                const orders = allocatedKeys.map(k => getOrderFromKey(k)).filter(Boolean);
                const readyCount = orders.filter(o => checkOrderReadiness(o).isReady).length;

                return (
                  <div
                    key={lineName}
                    className="bg-white rounded-xl border border-slate-300 flex flex-col overflow-hidden"
                  >
                    {/* Line Header */}
                    <div className="px-4 py-3.5 bg-slate-900 text-white border-b border-slate-800 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-extrabold font-mono text-sm">
                          {lineName.replace('Line ', 'L')}
                        </div>
                        <div>
                          <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                            <span>{lineName}</span>
                            <span className="text-xs font-mono font-bold text-amber-300">
                              {orders.length}/5 POs
                            </span>
                          </h3>
                          <p className="text-xs text-slate-400">Production Queue</p>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          if (!requireAuthorization(lineName)) return;
                          setEditingLine(lineName);
                          setLineModalSearch('');
                          setLineModalBuyerFilter('ALL');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer"
                        title={`Assign or manage 5 POs for ${lineName}`}
                      >
                        {isAuthorized ? <Plus size={14} /> : <Lock size={13} />}
                        <span>Manage POs</span>
                      </button>
                    </div>

                    {/* Readiness Summary Bar */}
                    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-300 flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-600 uppercase tracking-wider">Readiness</span>
                      <span
                        className={`font-extrabold flex items-center gap-1.5 px-2.5 py-0.5 rounded border ${
                          readyCount === orders.length && orders.length > 0
                            ? 'bg-emerald-50 text-emerald-900 border-emerald-400'
                            : 'bg-amber-50 text-amber-900 border-amber-300'
                        }`}
                      >
                        {readyCount === orders.length && orders.length > 0 ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                        {readyCount} of {orders.length} Ready
                      </span>
                    </div>

                    {/* 5 PO Slots */}
                    <div className="p-4 flex-1 flex flex-col gap-3.5 bg-slate-50/50">
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
                              className="border border-dashed border-slate-300 bg-white rounded-xl p-3 text-center text-slate-500 hover:border-amber-500 hover:bg-amber-50/30 transition cursor-pointer flex items-center justify-between gap-2"
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="h-7 w-7 rounded-md border border-slate-300 bg-slate-100 text-slate-700 font-extrabold font-mono text-xs flex items-center justify-center">
                                  #{slotNum}
                                </span>
                                <span className="text-xs font-bold text-slate-600">Empty Slot {slotNum}</span>
                              </div>
                              <span className="text-xs font-semibold text-slate-500">
                                {isAuthorized ? '+ Assign PO' : 'Locked'}
                              </span>
                            </div>
                          );
                        }

                        const readiness = checkOrderReadiness(order);

                        return (
                          <div
                            key={`slot_${lineName}_${slotIndex}_${allocatedKeys[slotIndex] || order._uniqueKey}`}
                            className={`rounded-xl border p-3.5 bg-white ${
                              isRunning ? 'border-2 border-amber-500' : 'border-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-200">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`text-xs font-extrabold font-mono px-2 py-0.5 rounded border ${
                                    isRunning
                                      ? 'bg-amber-500 text-slate-950 border-amber-600'
                                      : 'bg-slate-100 text-slate-800 border-slate-300'
                                  }`}
                                >
                                  #{slotNum} {isRunning && '· RUNNING'}
                                </span>
                                <span className="text-xs font-bold text-blue-900 bg-blue-50 border border-blue-300 px-2 py-0.5 rounded">
                                  {order._tabSource || 'Buyer'}
                                </span>
                              </div>

                              <div className="flex items-center gap-1">
                                {slotIndex > 0 && (
                                  <button
                                    onClick={() => movePoInLine(lineName, slotIndex, 'up')}
                                    className="p-1 rounded border border-slate-300 text-slate-600 hover:text-slate-950 hover:bg-slate-100 cursor-pointer"
                                    title="Move Up"
                                  >
                                    <ArrowUp size={13} />
                                  </button>
                                )}
                                {slotIndex < orders.length - 1 && (
                                  <button
                                    onClick={() => movePoInLine(lineName, slotIndex, 'down')}
                                    className="p-1 rounded border border-slate-300 text-slate-600 hover:text-slate-950 hover:bg-slate-100 cursor-pointer"
                                    title="Move Down"
                                  >
                                    <ArrowDown size={13} />
                                  </button>
                                )}
                                <button
                                  onClick={() => removePoFromLine(lineName, order._uniqueKey)}
                                  className="p-1 rounded border border-rose-300 text-rose-600 hover:bg-rose-50 cursor-pointer"
                                  title="Remove from line"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            </div>

                            {/* Crisp Bordered Order Grid */}
                            <div className="border border-slate-300 rounded-lg overflow-hidden mb-2.5 text-xs">
                              <div className="grid grid-cols-2 divide-x divide-slate-300 border-b border-slate-300 bg-slate-50">
                                <div className="p-2">
                                  <span className="text-[11px] font-bold uppercase text-slate-500 block">PO Number</span>
                                  <span className="font-extrabold font-mono text-slate-950 text-sm block truncate">
                                    {order['PO'] || '-'}
                                  </span>
                                </div>
                                <div className="p-2">
                                  <span className="text-[11px] font-bold uppercase text-slate-500 block">Style</span>
                                  <span className="font-bold text-slate-900 text-xs block truncate" title={order['STYLE']}>
                                    {order['STYLE'] || '-'}
                                  </span>
                                </div>
                              </div>

                              <div className="p-2 border-b border-slate-300 bg-white">
                                <span className="text-[11px] font-bold uppercase text-slate-500 block">Item & File No</span>
                                <span className="text-slate-900 font-bold text-xs block truncate">
                                  {order['ITEM'] || '-'}{' '}
                                  {order['File No'] && <span className="text-slate-600 font-mono">({order['File No']})</span>}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 divide-x divide-slate-300 bg-slate-50/70">
                                <div className="p-2">
                                  <span className="text-[11px] font-bold uppercase text-slate-500 block">Order Qty</span>
                                  <span className="font-extrabold font-mono text-indigo-800 text-xs block">
                                    {order['DZN'] || '-'} DZN
                                  </span>
                                </div>
                                <div className="p-2">
                                  <span className="text-[11px] font-bold uppercase text-slate-500 block">Ship Date</span>
                                  <span className="font-bold font-mono text-slate-800 text-xs block">
                                    {order['SHIP DATE'] || '-'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-600 text-[11px] font-bold uppercase">Sewing Readiness</span>
                                {readiness.isReady ? (
                                  <span className="text-xs font-extrabold border border-emerald-500 bg-emerald-100 text-emerald-950 px-2.5 py-0.5 rounded flex items-center gap-1">
                                    <CheckCircle2 size={12} className="text-emerald-700" />
                                    READY FOR SEWING
                                  </span>
                                ) : (
                                  <span className="text-xs font-bold border border-amber-400 bg-amber-50 text-amber-950 px-2.5 py-0.5 rounded flex items-center gap-1">
                                    <AlertCircle size={12} className="text-amber-700" />
                                    PENDING
                                  </span>
                                )}
                              </div>

                              <div className="grid grid-cols-3 gap-1.5 text-xs">
                                {(() => {
                                  const slotKey = `${lineName}__${slotIndex}`;
                                  const isCardExpanded = expandedReadiness?.slotKey === slotKey;
                                  const toggleField = (field: 'fabric' | 'sewing' | 'finishing') => {
                                    setExpandedReadiness((prev) =>
                                      prev?.slotKey === slotKey && prev.field === field
                                        ? null
                                        : { slotKey, field }
                                    );
                                  };
                                  const fabricText = String(order['Fabric Update'] || 'Pending');
                                  const sewingText = String(order['Sewing Acc. Update'] || 'Pending');
                                  const finishingText = String(order['Finishing Acc. Update'] || 'Pending');

                                  return (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => toggleField('fabric')}
                                        title="Click to read full Fabric details"
                                        className={`p-1.5 rounded-md border text-center cursor-pointer transition min-w-0 ${
                                          readiness.fabricOk
                                            ? 'border-emerald-400 bg-emerald-50 hover:bg-emerald-100/80 text-emerald-950'
                                            : 'border-rose-300 bg-rose-50 hover:bg-rose-100/80 text-rose-950'
                                        } ${
                                          isCardExpanded && expandedReadiness?.field === 'fabric'
                                            ? 'ring-2 ring-slate-900 ring-offset-1'
                                            : ''
                                        }`}
                                      >
                                        <span className="text-[10px] uppercase font-bold text-slate-600 flex items-center justify-center gap-0.5">
                                          <span>Fabric</span>
                                          {isCardExpanded && expandedReadiness?.field === 'fabric' ? (
                                            <ChevronUp size={10} />
                                          ) : (
                                            <ChevronDown size={10} className="opacity-60" />
                                          )}
                                        </span>
                                        <span className="font-extrabold truncate block">{fabricText}</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => toggleField('sewing')}
                                        title="Click to read full Sewing Accessories details"
                                        className={`p-1.5 rounded-md border text-center cursor-pointer transition min-w-0 ${
                                          readiness.sewingOk
                                            ? 'border-emerald-400 bg-emerald-50 hover:bg-emerald-100/80 text-emerald-950'
                                            : 'border-rose-300 bg-rose-50 hover:bg-rose-100/80 text-rose-950'
                                        } ${
                                          isCardExpanded && expandedReadiness?.field === 'sewing'
                                            ? 'ring-2 ring-slate-900 ring-offset-1'
                                            : ''
                                        }`}
                                      >
                                        <span className="text-[10px] uppercase font-bold text-slate-600 flex items-center justify-center gap-0.5">
                                          <span>Sew Acc</span>
                                          {isCardExpanded && expandedReadiness?.field === 'sewing' ? (
                                            <ChevronUp size={10} />
                                          ) : (
                                            <ChevronDown size={10} className="opacity-60" />
                                          )}
                                        </span>
                                        <span className="font-extrabold truncate block">{sewingText}</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => toggleField('finishing')}
                                        title="Click to read full Finishing Accessories details"
                                        className={`p-1.5 rounded-md border text-center cursor-pointer transition min-w-0 ${
                                          readiness.finishingOk
                                            ? 'border-emerald-400 bg-emerald-50 hover:bg-emerald-100/80 text-emerald-950'
                                            : 'border-rose-300 bg-rose-50 hover:bg-rose-100/80 text-rose-950'
                                        } ${
                                          isCardExpanded && expandedReadiness?.field === 'finishing'
                                            ? 'ring-2 ring-slate-900 ring-offset-1'
                                            : ''
                                        }`}
                                      >
                                        <span className="text-[10px] uppercase font-bold text-slate-600 flex items-center justify-center gap-0.5">
                                          <span>Fin Acc</span>
                                          {isCardExpanded && expandedReadiness?.field === 'finishing' ? (
                                            <ChevronUp size={10} />
                                          ) : (
                                            <ChevronDown size={10} className="opacity-60" />
                                          )}
                                        </span>
                                        <span className="font-extrabold truncate block">{finishingText}</span>
                                      </button>

                                      {isCardExpanded && (
                                        <div className="col-span-3 mt-1 rounded-lg border border-slate-300 bg-slate-50 p-2.5 space-y-2 text-left">
                                          <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-200">
                                            <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700">
                                              Full Accessories &amp; Fabric Details
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => setExpandedReadiness(null)}
                                              className="p-0.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200 cursor-pointer"
                                              title="Close details"
                                            >
                                              <X size={13} />
                                            </button>
                                          </div>

                                          <div className="space-y-1.5 text-xs">
                                            <div
                                              className={`p-2 rounded border ${
                                                expandedReadiness?.field === 'fabric'
                                                  ? 'bg-white border-slate-400 shadow-2xs'
                                                  : 'bg-white/70 border-slate-200'
                                              }`}
                                            >
                                              <span className="text-[10px] font-bold uppercase text-slate-500 block">
                                                Fabric Update
                                              </span>
                                              <span
                                                className={`font-bold whitespace-normal break-words block ${
                                                  readiness.fabricOk ? 'text-emerald-800' : 'text-rose-800'
                                                }`}
                                              >
                                                {fabricText}
                                              </span>
                                            </div>

                                            <div
                                              className={`p-2 rounded border ${
                                                expandedReadiness?.field === 'sewing'
                                                  ? 'bg-white border-slate-400 shadow-2xs'
                                                  : 'bg-white/70 border-slate-200'
                                              }`}
                                            >
                                              <span className="text-[10px] font-bold uppercase text-slate-500 block">
                                                Sewing Acc. Update
                                              </span>
                                              <span
                                                className={`font-bold whitespace-normal break-words block ${
                                                  readiness.sewingOk ? 'text-emerald-800' : 'text-rose-800'
                                                }`}
                                              >
                                                {sewingText}
                                              </span>
                                            </div>

                                            <div
                                              className={`p-2 rounded border ${
                                                expandedReadiness?.field === 'finishing'
                                                  ? 'bg-white border-slate-400 shadow-2xs'
                                                  : 'bg-white/70 border-slate-200'
                                              }`}
                                            >
                                              <span className="text-[10px] font-bold uppercase text-slate-500 block">
                                                Finishing Acc. Update
                                              </span>
                                              <span
                                                className={`font-bold whitespace-normal break-words block ${
                                                  readiness.finishingOk ? 'text-emerald-800' : 'text-rose-800'
                                                }`}
                                              >
                                                {finishingText}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
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
            <div className="bg-white rounded-xl border border-slate-300 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse border border-slate-300">
                  <thead className="bg-slate-100 text-slate-800 text-xs uppercase font-extrabold">
                    <tr>
                      <th className="p-3.5 border border-slate-300">Sewing Line</th>
                      <th className="p-3.5 border border-slate-300">Queue & Status</th>
                      <th className="p-3.5 border border-slate-300">Buyer</th>
                      <th className="p-3.5 border border-slate-300">PO Number</th>
                      <th className="p-3.5 border border-slate-300">Style & File No</th>
                      <th className="p-3.5 border border-slate-300">Item</th>
                      <th className="p-3.5 border border-slate-300 text-right">DZN</th>
                      <th className="p-3.5 border border-slate-300">Ship Date</th>
                      <th className="p-3.5 border border-slate-300">Fabric</th>
                      <th className="p-3.5 border border-slate-300">Sewing Acc</th>
                      <th className="p-3.5 border border-slate-300">Finishing Acc</th>
                      <th className="p-3.5 border border-slate-300 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300 text-[13px]">
                    {displayedLineNames.map(lineName => {
                      const allocatedKeys = lineAllocations[lineName] || [];
                      const orders = allocatedKeys.map(k => getOrderFromKey(k)).filter(Boolean);

                      if (orders.length === 0) {
                        return (
                          <tr key={lineName} className="hover:bg-slate-50">
                            <td className="p-3.5 font-extrabold text-slate-900 border border-slate-300 bg-slate-50">
                              {lineName}
                            </td>
                            <td colSpan={10} className="p-3.5 text-slate-500 text-xs border border-slate-300">
                              No upcoming POs assigned yet.
                            </td>
                            <td className="p-3.5 text-center border border-slate-300">
                              <button
                                onClick={() => {
                                  if (!requireAuthorization(lineName)) return;
                                  setEditingLine(lineName);
                                  setLineModalSearch('');
                                  setLineModalBuyerFilter('ALL');
                                }}
                                className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-extrabold hover:bg-amber-400 cursor-pointer inline-flex items-center gap-1 border border-amber-600"
                              >
                                {isAuthorized ? null : <Lock size={11} />}
                                <span>Manage</span>
                              </button>
                            </td>
                          </tr>
                        );
                      }

                      return orders.map((order, oIdx) => {
                        const readiness = checkOrderReadiness(order);
                        return (
                          <tr key={`${lineName}_${oIdx}`} className={oIdx === 0 ? 'bg-amber-50/40' : 'hover:bg-slate-50'}>
                            {oIdx === 0 && (
                              <td
                                rowSpan={orders.length}
                                className="p-3.5 font-extrabold text-slate-900 border border-slate-300 bg-slate-50 align-top"
                              >
                                <div className="sticky top-2">
                                  <span className="text-base font-extrabold block">{lineName}</span>
                                  <span className="text-xs font-mono font-bold text-slate-600 block mb-2.5">{orders.length}/5 POs</span>
                                  <button
                                    onClick={() => {
                                      if (!requireAuthorization(lineName)) return;
                                      setEditingLine(lineName);
                                      setLineModalSearch('');
                                      setLineModalBuyerFilter('ALL');
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold cursor-pointer inline-flex items-center gap-1 border border-amber-600"
                                  >
                                    {isAuthorized ? null : <Lock size={11} />}
                                    <span>Manage</span>
                                  </button>
                                </div>
                              </td>
                            )}

                            <td className="p-3.5 text-xs font-bold border border-slate-300 whitespace-nowrap">
                              <div className="flex flex-col gap-1.5 items-start">
                                <span className={`px-2 py-0.5 rounded font-mono border ${oIdx === 0 ? 'bg-amber-500 text-slate-950 border-amber-600 font-extrabold' : 'bg-slate-100 text-slate-800 border-slate-300'}`}>
                                  #{oIdx + 1} {oIdx === 0 && '(Active)'}
                                </span>
                                {readiness.isReady ? (
                                  <span className="text-xs font-extrabold text-emerald-950 bg-emerald-100 border border-emerald-400 px-2 py-0.5 rounded whitespace-nowrap flex items-center gap-1">
                                    <CheckCircle2 size={11} className="text-emerald-700 shrink-0" />
                                    Ready for Sewing
                                  </span>
                                ) : (
                                  <span className="text-xs font-bold text-amber-950 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded whitespace-nowrap flex items-center gap-1">
                                    <AlertCircle size={11} className="text-amber-700 shrink-0" />
                                    Pending
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3.5 text-xs font-extrabold text-blue-900 border border-slate-300 whitespace-nowrap">
                              {order._tabSource || '-'}
                            </td>
                            <td className="p-3.5 font-extrabold font-mono text-slate-950 border border-slate-300 whitespace-nowrap">
                              {order['PO'] || '-'}
                            </td>
                            <td className="p-3.5 border border-slate-300">
                              <div className="font-bold text-slate-900 leading-tight">{order['STYLE'] || '-'}</div>
                              {order['File No'] && (
                                <div className="text-xs font-bold text-slate-700 mt-1 bg-slate-100 px-2 py-0.5 rounded border border-slate-300 w-fit font-mono">
                                  File: {order['File No']}
                                </div>
                              )}
                            </td>
                            <td className="p-3.5 font-medium text-slate-800 border border-slate-300">{order['ITEM'] || '-'}</td>
                            <td className="p-3.5 text-right font-extrabold font-mono text-indigo-800 border border-slate-300 whitespace-nowrap">
                              {order['DZN'] || '-'}
                            </td>
                            <td className="p-3.5 font-mono font-semibold text-slate-800 border border-slate-300 whitespace-nowrap">
                              {order['SHIP DATE'] || '-'}
                            </td>
                            <td className="p-3.5 border border-slate-300">{getStatusPill(order['Fabric Update'])}</td>
                            <td className="p-3.5 border border-slate-300">{getStatusPill(order['Sewing Acc. Update'])}</td>
                            <td className="p-3.5 border border-slate-300">{getStatusPill(order['Finishing Acc. Update'])}</td>
                            <td className="p-3.5 text-center border border-slate-300">
                              <button
                                onClick={() => removePoFromLine(lineName, order._uniqueKey)}
                                className="p-1.5 rounded-lg border border-rose-300 text-rose-600 hover:bg-rose-50 cursor-pointer"
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
          {isColumnPanelOpen && (
            <div className="bg-white p-5 rounded-xl border border-slate-300 transition-all">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-2 mb-4">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                    <SlidersHorizontal size={16} className="text-blue-700" />
                    Column Visibility Manager
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">Toggle checkmarks to show or hide columns below.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={showAllColumns}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 border border-slate-300 text-slate-800 hover:bg-slate-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Eye size={13} />
                    Show All
                  </button>
                  <button
                    onClick={hideAllColumns}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 border border-slate-300 text-slate-800 hover:bg-slate-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <EyeOff size={13} />
                    Hide Extra
                  </button>
                  <button
                    onClick={() => setHiddenColumns([])}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg border border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100 flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw size={13} />
                    Reset
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                {allColumns.map(col => {
                  const isVisible = !hiddenColumns.includes(col);
                  return (
                    <label
                      key={col}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-bold cursor-pointer select-none ${
                        isVisible
                          ? 'bg-blue-50 border-blue-400 text-blue-950'
                          : 'bg-slate-50 border-slate-300 text-slate-500 hover:border-slate-400'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isVisible}
                        onChange={() => toggleColumnVisibility(col)}
                        className="rounded text-blue-600 h-4 w-4 border-slate-300"
                      />
                      <span className="truncate" title={col}>{col}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Table Container with FULL CRISP CELL BORDERS */}
          <div className="bg-white rounded-xl border border-slate-300 overflow-hidden">
            <div className="overflow-x-auto">
              {isLoading && baseData.length === 0 ? (
                <div className="py-20 text-center text-slate-600">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-900 border-t-transparent mb-3"></div>
                  <p className="font-bold text-sm">Loading data from Google Sheets...</p>
                </div>
              ) : allColumns.length === 0 && baseData.length === 0 ? (
                <div className="py-20 text-center text-slate-600">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-900 border-t-transparent mb-3"></div>
                  <p className="font-bold text-sm">Syncing orders for {activeTabName === '__ALL__' ? 'All Combined' : activeTabName}...</p>
                </div>
              ) : allColumns.length > 0 && visibleColumns.length === 0 ? (
                <div className="py-16 text-center text-slate-600">
                  <p className="text-sm font-bold">All columns are hidden by column filter.</p>
                  <button
                    onClick={showAllColumns}
                    className="mt-3 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer"
                  >
                    Restore Columns
                  </button>
                </div>
              ) : (
                <table className="w-full text-left border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 text-slate-900">
                      {visibleColumns.map((col) => {
                        const isStatus = isStatusColumn(col);
                        const isRemark = col.toLowerCase().includes('remark');
                        const allowWrap = isStatus || isRemark;
                        return (
                          <th
                            key={col}
                            className={`px-3.5 py-3 font-extrabold text-xs uppercase tracking-wider border border-slate-300 select-none ${
                              col === 'Buyer Tab' ? 'bg-blue-100 text-blue-950' : 'bg-slate-100'
                            } ${allowWrap ? 'min-w-[170px] max-w-[280px]' : 'whitespace-nowrap'}`}
                          >
                            <span>{col}</span>
                          </th>
                        );
                      })}
                    </tr>

                    {showHeaderFilterRow && (
                      <tr className="bg-slate-50 border-b border-slate-300">
                        {visibleColumns.map((col) => (
                          <th key={`filter-${col}`} className="p-2 border border-slate-300 bg-slate-50">
                            <input
                              type="text"
                              placeholder={`Filter ${col}...`}
                              value={columnFilters[col] || ''}
                              onChange={(e) => setColumnFilter(col, e.target.value)}
                              className="w-full text-xs font-medium px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </th>
                        ))}
                      </tr>
                    )}
                  </thead>

                  <tbody>
                    {currentRows.length === 0 ? (
                      <tr>
                        <td colSpan={visibleColumns.length} className="py-12 text-center text-slate-500 font-semibold border border-slate-300">
                          {isUniversalSearchActive
                            ? `No orders matching "${globalFilter}" found across all tabs.`
                            : 'No matching records found in this sheet.'}
                        </td>
                      </tr>
                    ) : (
                      currentRows.map((row, i) => (
                        <tr key={i} className={`${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'} hover:bg-blue-50/50 transition-colors`}>
                          {visibleColumns.map((col) => {
                            if (col === 'Buyer Tab') {
                              return (
                                <td key={col} className="px-3.5 py-3 text-xs font-extrabold text-blue-950 bg-blue-50/50 border border-slate-300 whitespace-nowrap align-top">
                                  <span className="bg-blue-100 px-2.5 py-1 rounded border border-blue-300 inline-block">
                                    {row._tabSource || activeTabName}
                                  </span>
                                </td>
                              );
                            }

                            const val = row[col];
                            const isStatus = isStatusColumn(col);
                            const isRemark = col.toLowerCase().includes('remark');
                            const isKeyId = col === 'PO' || col === 'File No';
                            const isDzn = col === 'DZN';
                            const allowWrap = isStatus || isRemark;

                            return (
                              <td
                                key={col}
                                className={`px-3.5 py-3 text-[13px] border border-slate-300 ${
                                  isKeyId
                                    ? 'font-extrabold font-mono text-slate-950'
                                    : isDzn
                                      ? 'font-bold font-mono text-indigo-900 text-right'
                                      : col === 'STYLE'
                                        ? 'font-bold text-slate-900'
                                        : 'font-medium text-slate-800'
                                } ${allowWrap ? 'whitespace-normal break-words min-w-[170px] max-w-[280px] align-top' : 'whitespace-nowrap align-top'}`}
                              >
                                {isStatus
                                  ? getStatusPill(val)
                                  : val !== undefined && val !== null && val !== ''
                                    ? isRemark
                                      ? <div className="leading-relaxed text-slate-700 text-xs whitespace-pre-line break-words max-w-[260px]">{val}</div>
                                      : val
                                    : '-'}
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
              <p className="text-xs text-slate-700 font-semibold">
                Showing <span className="font-extrabold font-mono text-slate-950">{filteredData.length > 0 ? indexOfFirstRow + 1 : 0}</span> to{' '}
                <span className="font-extrabold font-mono text-slate-950">{Math.min(indexOfLastRow, filteredData.length)}</span> of{' '}
                <span className="font-extrabold font-mono text-slate-950">{filteredData.length}</span> rows
              </p>

              <div className="flex items-center space-x-2">
                <button
                  className="flex items-center px-3.5 py-1.5 border border-slate-300 bg-white text-slate-800 text-xs font-bold rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft size={15} className="mr-1" />
                  Previous
                </button>

                <span className="text-xs font-extrabold font-mono text-slate-800 px-3 py-1.5 bg-white border border-slate-300 rounded-lg">
                  {currentPage} / {totalPages}
                </span>

                <button
                  className="flex items-center px-3.5 py-1.5 border border-slate-300 bg-white text-slate-800 text-xs font-bold rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
                      const order = getOrderFromKey(orderKey);
                      if (!order) return null;
                      const readiness = checkOrderReadiness(order);
                      const isNext = idx === 0;

                      return (
                        <div 
                          key={`queue_${editingLine}_${idx}_${orderKey}`}
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
                      {tabs
                        .filter(t => !isBrFabricUpdateTab(t.name))
                        .map(t => (
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
                          String(order['File No'] || '').toLowerCase().includes(q) ||
                          String(order['ITEM'] || '').toLowerCase().includes(q) ||
                          String(order._tabSource || '').toLowerCase().includes(q);
                        if (!match) return false;
                      }
                      return true;
                    })
                    .slice(0, 40)
                    .map((order, idx) => {
                      const alreadyInThisLine = (lineAllocations[editingLine] || []).some(
                        k => k === order._uniqueKey || getOrderFromKey(k)?._uniqueKey === order._uniqueKey
                      );
                      const isLineFull = (lineAllocations[editingLine] || []).length >= 5;
                      const readiness = checkOrderReadiness(order);

                      return (
                        <div 
                          key={`avail_${order._uniqueKey}_${idx}`} 
                          className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between gap-2 text-xs hover:border-slate-300"
                        >
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-extrabold text-slate-900">PO #{order['PO']}</span>
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700">
                                {order._tabSource}
                              </span>
                              <span className="text-slate-800 font-bold">Style: {order['STYLE']}</span>
                              {order['File No'] && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-semibold border border-slate-200">
                                  File: {order['File No']}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {order['ITEM']} • {order['DZN']} Dzn • Ship: {order['SHIP DATE']}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                              readiness.isReady ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {readiness.isReady ? 'Ready for Sewing' : 'Pending'}
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
      <footer className="mt-10 pt-5 pb-4 border-t border-slate-300 text-center">
        <div className="inline-flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 px-5 py-2.5 rounded-xl bg-white border border-slate-300 text-xs text-slate-700">
          <span className="font-semibold text-slate-500">Designed & Maintained by:</span>
          <span className="font-extrabold text-slate-950 text-sm">Md Mahbubur Rahman</span>
          <span className="hidden sm:inline text-slate-300">·</span>
          <span className="font-semibold text-slate-700">Store Department</span>
          <span className="hidden sm:inline text-slate-300">·</span>
          <span className="font-bold text-slate-900">
            Felix Fashions Ltd <span className="font-normal text-slate-500">(Four H Group)</span>
          </span>
        </div>
      </footer>
      </div>
    </div>
  );
}
