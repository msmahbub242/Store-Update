import React, { useMemo, useState } from 'react';
import {
  Filter,
  Layers,
  LayoutGrid,
  Package,
  RotateCcw,
  Search,
  Table as TableIcon,
  X,
} from 'lucide-react';

export interface BrFabricUpdateRow {
  _tabSource: string;
  _uniqueKey: string;
  _isFabricUpdateRow?: boolean;
  _isTotalRow?: boolean;
  _isCrossRow?: boolean;
  _blockKey?: string;
  'File No': string;
  PO: string;
  STYLE: string;
  COLOR: string;
  SIZE: string;
  DIA: string;
  'FILE REQ': string;
  'OVER CON': string;
  'Need Additional/ Replace': string;
  'TOTAL REQ QTY': string;
  'STORE RCVD': string;
  'RCVD BALANCE': string;
  'CUTTING SUPPLY': string;
  'STORE IN HAND': string;
  'REQ-SUP BALANCE': string;
  REMARKS: string;
  _fileReqNum?: number;
  _overConNum?: number;
  _addReplaceNum?: number;
  _totalReqNum?: number;
  _storeRcvdNum?: number;
  _rcvdBalNum?: number;
  _cuttingSupplyNum?: number;
  _storeInHandNum?: number;
  _reqSupBalNum?: number;
}

interface BrFabricUpdateViewProps {
  rows: BrFabricUpdateRow[];
  globalFilter: string;
  isLoading: boolean;
  onRefresh: () => void;
}

interface ColorSection {
  color: string;
  detailRows: BrFabricUpdateRow[];
  totalRows: BrFabricUpdateRow[];
  crossRows: BrFabricUpdateRow[];
}

interface PoBlock {
  blockKey: string;
  fileNo: string;
  po: string;
  style: string;
  colorSections: ColorSection[];
}

interface ColorTheme {
  swatchHex: string;
  swatchRing: string;
  outerBorder: string;
  headerBg: string;
  headerText: string;
  headerMuted: string;
  rowEvenBg: string;
  rowOddBg: string;
  totalBg: string;
  flatCellBg: string;
  flatBorderTop: string;
}

const FALLBACK_THEMES: ColorTheme[] = [
  {
    swatchHex: '#1d4ed8',
    swatchRing: 'ring-blue-300',
    outerBorder: 'border-blue-400',
    headerBg: 'bg-blue-900',
    headerText: 'text-white',
    headerMuted: 'text-blue-200',
    rowEvenBg: 'bg-white',
    rowOddBg: 'bg-blue-50/40',
    totalBg: 'bg-blue-100/80',
    flatCellBg: 'bg-blue-50 text-blue-950',
    flatBorderTop: 'border-t-2 border-t-blue-500',
  },
  {
    swatchHex: '#0f766e',
    swatchRing: 'ring-teal-300',
    outerBorder: 'border-teal-400',
    headerBg: 'bg-teal-900',
    headerText: 'text-white',
    headerMuted: 'text-teal-200',
    rowEvenBg: 'bg-white',
    rowOddBg: 'bg-teal-50/40',
    totalBg: 'bg-teal-100/80',
    flatCellBg: 'bg-teal-50 text-teal-950',
    flatBorderTop: 'border-t-2 border-t-teal-500',
  },
  {
    swatchHex: '#7c2d12',
    swatchRing: 'ring-orange-300',
    outerBorder: 'border-orange-400',
    headerBg: 'bg-orange-900',
    headerText: 'text-white',
    headerMuted: 'text-orange-200',
    rowEvenBg: 'bg-white',
    rowOddBg: 'bg-orange-50/40',
    totalBg: 'bg-orange-100/80',
    flatCellBg: 'bg-orange-50 text-orange-950',
    flatBorderTop: 'border-t-2 border-t-orange-500',
  },
  {
    swatchHex: '#6d28d9',
    swatchRing: 'ring-violet-300',
    outerBorder: 'border-violet-400',
    headerBg: 'bg-violet-900',
    headerText: 'text-white',
    headerMuted: 'text-violet-200',
    rowEvenBg: 'bg-white',
    rowOddBg: 'bg-violet-50/40',
    totalBg: 'bg-violet-100/80',
    flatCellBg: 'bg-violet-50 text-violet-950',
    flatBorderTop: 'border-t-2 border-t-violet-500',
  },
];

const getColorTheme = (colorName: string, index: number): ColorTheme => {
  const c = colorName.trim().toUpperCase();

  if (c.includes('BLACK') || c.includes('CHARCOAL') || c.includes('JET')) {
    return {
      swatchHex: '#0f172a',
      swatchRing: 'ring-slate-400',
      outerBorder: 'border-slate-700',
      headerBg: 'bg-slate-900',
      headerText: 'text-white',
      headerMuted: 'text-slate-300',
      rowEvenBg: 'bg-white',
      rowOddBg: 'bg-slate-100/70',
      totalBg: 'bg-slate-200/80',
      flatCellBg: 'bg-slate-900 text-white',
      flatBorderTop: 'border-t-2 border-t-slate-800',
    };
  }

  if (c.includes('GREY') || c.includes('GRAY') || c.includes('ASH') || c.includes('MELANGE') || c.includes('SILVER')) {
    return {
      swatchHex: '#64748b',
      swatchRing: 'ring-zinc-300',
      outerBorder: 'border-zinc-400',
      headerBg: 'bg-zinc-700',
      headerText: 'text-white',
      headerMuted: 'text-zinc-200',
      rowEvenBg: 'bg-white',
      rowOddBg: 'bg-zinc-100/80',
      totalBg: 'bg-zinc-200/80',
      flatCellBg: 'bg-zinc-200 text-zinc-950',
      flatBorderTop: 'border-t-2 border-t-zinc-600',
    };
  }

  if (c.includes('WHITE') || c.includes('IVORY') || c.includes('CREAM') || c.includes('OPTIC')) {
    return {
      swatchHex: '#f8fafc',
      swatchRing: 'ring-sky-400',
      outerBorder: 'border-sky-400',
      headerBg: 'bg-sky-800',
      headerText: 'text-white',
      headerMuted: 'text-sky-100',
      rowEvenBg: 'bg-white',
      rowOddBg: 'bg-sky-50/50',
      totalBg: 'bg-sky-100/80',
      flatCellBg: 'bg-sky-50 text-sky-950',
      flatBorderTop: 'border-t-2 border-t-sky-600',
    };
  }

  if (c.includes('NAVY') || c.includes('ROYAL') || c.includes('BLUE') || c.includes('DENIM')) {
    return FALLBACK_THEMES[0];
  }

  if (c.includes('GREEN') || c.includes('OLIVE') || c.includes('KHAKI') || c.includes('TEAL')) {
    return FALLBACK_THEMES[1];
  }

  if (c.includes('RED') || c.includes('MAROON') || c.includes('BURGUNDY') || c.includes('ORANGE') || c.includes('RUST')) {
    return FALLBACK_THEMES[2];
  }

  return FALLBACK_THEMES[Math.abs(index) % FALLBACK_THEMES.length];
};

const fmtKg = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const BrFabricUpdateView: React.FC<BrFabricUpdateViewProps> = ({
  rows,
  globalFilter,
  isLoading,
  onRefresh,
}) => {
  const [localSearch, setLocalSearch] = useState('');
  const [selectedColor, setSelectedColor] = useState<string>('ALL');
  const [selectedFileNo, setSelectedFileNo] = useState<string>('ALL');
  const [selectedPo, setSelectedPo] = useState<string>('ALL');
  const [selectedStyle, setSelectedStyle] = useState<string>('ALL');
  const [selectedSize, setSelectedSize] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');

  const effectiveQuery = (globalFilter || localSearch).trim().toLowerCase();

  // Extract unique filter options from all rows in sheet order
  const filterOptions = useMemo(() => {
    const colorMap = new Map<string, number>();
    const files = new Set<string>();
    const pos = new Set<string>();
    const styles = new Set<string>();
    const sizes = new Set<string>();

    rows.forEach((r) => {
      if (r['File No'] && r['File No'] !== '-') files.add(r['File No']);
      if (r.PO && r.PO !== '-') pos.add(r.PO);
      if (r.STYLE && r.STYLE !== '-') styles.add(r.STYLE);
      if (r.COLOR && r.COLOR !== '-' && r.COLOR !== 'TOTAL') {
        if (!r._isTotalRow) {
          colorMap.set(r.COLOR, (colorMap.get(r.COLOR) || 0) + 1);
        } else if (!colorMap.has(r.COLOR)) {
          colorMap.set(r.COLOR, 0);
        }
      }
      if (r.SIZE && r.SIZE !== '-' && !r._isTotalRow) {
        sizes.add(r.SIZE);
      }
    });

    return {
      colors: Array.from(colorMap.entries()).map(([name, count], idx) => ({
        name,
        count,
        theme: getColorTheme(name, idx),
      })),
      files: Array.from(files),
      pos: Array.from(pos),
      styles: Array.from(styles),
      sizes: Array.from(sizes),
    };
  }, [rows]);

  // Color theme lookup preserving consistent sheet order index
  const colorThemeLookup = useMemo(() => {
    const map = new Map<string, ColorTheme>();
    filterOptions.colors.forEach((c) => {
      map.set(c.name, c.theme);
    });
    return map;
  }, [filterOptions.colors]);

  const hasRowNarrowFilter =
    Boolean(effectiveQuery) ||
    selectedSize !== 'ALL' ||
    statusFilter !== 'ALL';

  const hasAnyActiveFilter =
    Boolean(localSearch.trim()) ||
    selectedColor !== 'ALL' ||
    selectedFileNo !== 'ALL' ||
    selectedPo !== 'ALL' ||
    selectedStyle !== 'ALL' ||
    selectedSize !== 'ALL' ||
    statusFilter !== 'ALL';

  const resetAllFilters = () => {
    setLocalSearch('');
    setSelectedColor('ALL');
    setSelectedFileNo('ALL');
    setSelectedPo('ALL');
    setSelectedStyle('ALL');
    setSelectedSize('ALL');
    setStatusFilter('ALL');
  };

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (selectedColor !== 'ALL' && r.COLOR !== selectedColor) return false;
      if (selectedFileNo !== 'ALL' && r['File No'] !== selectedFileNo) return false;
      if (selectedPo !== 'ALL' && r.PO !== selectedPo) return false;
      if (selectedStyle !== 'ALL' && r.STYLE !== selectedStyle) return false;

      if (selectedSize !== 'ALL') {
        if (r._isTotalRow) return false;
        if (r.SIZE !== selectedSize) return false;
      }

      if (statusFilter !== 'ALL') {
        if (r._isTotalRow) return false;
        if (statusFilter === 'PENDING_RCV' && (r._rcvdBalNum ?? 0) >= 0) return false;
        if (statusFilter === 'HAS_RCVD' && (r._storeRcvdNum ?? 0) <= 0) return false;
        if (statusFilter === 'HAS_IN_HAND' && (r._storeInHandNum ?? 0) <= 0) return false;
        if (statusFilter === 'HAS_SUPPLY' && (r._cuttingSupplyNum ?? 0) <= 0) return false;
        if (statusFilter === 'HAS_ADD_REP' && (r._addReplaceNum ?? 0) <= 0) return false;
        if (statusFilter === 'HAS_REMARKS' && !r.REMARKS.trim()) return false;
      }

      if (effectiveQuery) {
        const hay = [
          r['File No'],
          r.PO,
          r.STYLE,
          r.COLOR,
          r.SIZE,
          r.DIA,
          r['TOTAL REQ QTY'],
          r['STORE RCVD'],
          r['RCVD BALANCE'],
          r['CUTTING SUPPLY'],
          r['STORE IN HAND'],
          r['REQ-SUP BALANCE'],
          r.REMARKS,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(effectiveQuery)) return false;
      }

      return true;
    });
  }, [
    rows,
    selectedColor,
    selectedFileNo,
    selectedPo,
    selectedStyle,
    selectedSize,
    statusFilter,
    effectiveQuery,
  ]);

  // Group filtered rows into PO Blocks -> Color Sections
  const blocks = useMemo<PoBlock[]>(() => {
    const blockMap = new Map<
      string,
      {
        blockKey: string;
        fileNo: string;
        po: string;
        style: string;
        colorMap: Map<string, ColorSection>;
      }
    >();

    filteredRows.forEach((r) => {
      const bKey = r._blockKey || `${r['File No']}___${r.PO}___${r.STYLE}`;
      if (!blockMap.has(bKey)) {
        blockMap.set(bKey, {
          blockKey: bKey,
          fileNo: r['File No'] || '-',
          po: r.PO || '-',
          style: r.STYLE || '-',
          colorMap: new Map<string, ColorSection>(),
        });
      }
      const block = blockMap.get(bKey)!;
      const colorName = r.COLOR || '-';
      if (!block.colorMap.has(colorName)) {
        block.colorMap.set(colorName, {
          color: colorName,
          detailRows: [],
          totalRows: [],
          crossRows: [],
        });
      }
      const cSec = block.colorMap.get(colorName)!;
      if (r._isTotalRow) {
        cSec.totalRows.push(r);
      } else if (r._isCrossRow || /^cross$/i.test(r.SIZE)) {
        cSec.crossRows.push(r);
      } else {
        cSec.detailRows.push(r);
      }
    });

    return Array.from(blockMap.values()).map((b) => ({
      blockKey: b.blockKey,
      fileNo: b.fileNo,
      po: b.po,
      style: b.style,
      colorSections: Array.from(b.colorMap.values()),
    }));
  }, [filteredRows]);

  const summarizeColorSection = (sec: ColorSection) => {
    const sourceRows =
      !hasRowNarrowFilter && sec.totalRows.length > 0
        ? [...sec.totalRows, ...sec.crossRows]
        : [...sec.detailRows, ...sec.crossRows];
    let totalReq = 0;
    let storeRcvd = 0;
    let rcvdBal = 0;
    let cuttingSupply = 0;
    let storeInHand = 0;
    let reqSupBal = 0;
    let addReplace = 0;

    sourceRows.forEach((r) => {
      totalReq += r._totalReqNum || 0;
      storeRcvd += r._storeRcvdNum || 0;
      rcvdBal += r._rcvdBalNum || 0;
      cuttingSupply += r._cuttingSupplyNum || 0;
      storeInHand += r._storeInHandNum || 0;
      reqSupBal += r._reqSupBalNum || 0;
      addReplace += r._addReplaceNum || 0;
    });

    return {
      totalReq,
      storeRcvd,
      rcvdBal,
      cuttingSupply,
      storeInHand,
      reqSupBal,
      addReplace,
    };
  };

  // Aggregate KPI totals across visible color sections
  const totals = useMemo(() => {
    let totalReq = 0;
    let storeRcvd = 0;
    let rcvdBal = 0;
    let cuttingSupply = 0;
    let storeInHand = 0;
    let reqSupBal = 0;
    let colorCount = 0;
    let detailRowCount = 0;

    blocks.forEach((b) => {
      b.colorSections.forEach((sec) => {
        colorCount += 1;
        detailRowCount += sec.detailRows.length + sec.crossRows.length;
        const s = summarizeColorSection(sec);
        totalReq += s.totalReq;
        storeRcvd += s.storeRcvd;
        rcvdBal += s.rcvdBal;
        cuttingSupply += s.cuttingSupply;
        storeInHand += s.storeInHand;
        reqSupBal += s.reqSupBal;
      });
    });

    return {
      blockCount: blocks.length,
      colorCount,
      detailRowCount,
      totalReq,
      storeRcvd,
      rcvdBal,
      cuttingSupply,
      storeInHand,
      reqSupBal,
    };
  }, [blocks, hasRowNarrowFilter]);

  const renderMetricCell = (
    valStr: string,
    numVal?: number,
    emphasis?: 'req' | 'rcvd' | 'bal' | 'hand',
    isTotal = false
  ) => {
    const num = numVal ?? 0;
    let toneClass = 'text-slate-700 font-bold';
    if (num < 0) {
      toneClass = 'text-rose-900 font-extrabold bg-rose-100/80';
    } else if (num > 0) {
      if (emphasis === 'req') toneClass = 'text-blue-950 font-extrabold bg-blue-100/70';
      else if (emphasis === 'rcvd') toneClass = 'text-emerald-950 font-extrabold bg-emerald-100/70';
      else if (emphasis === 'hand') toneClass = 'text-indigo-950 font-extrabold bg-indigo-100/70';
      else if (emphasis === 'bal') toneClass = 'text-amber-950 font-extrabold bg-amber-100/80';
      else toneClass = 'text-slate-950 font-extrabold';
    }
    return (
      <td
        className={`px-3.5 py-3 ${
          isTotal ? 'text-[15px]' : 'text-sm'
        } font-mono tabular-nums text-center border border-slate-300 whitespace-nowrap ${toneClass}`}
      >
        {valStr || '-'}
      </td>
    );
  };

  if (isLoading && rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-300 py-20 text-center text-slate-600">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-900 border-t-transparent mb-3" />
        <p className="font-bold text-sm">Loading BR FABRIC UPDATE from Google Sheets...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-300 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">PO Blocks / Colors</p>
            <p className="text-2xl md:text-3xl font-extrabold text-slate-900 font-mono tabular-nums mt-1">
              {totals.blockCount}{' '}
              <span className="text-sm font-bold text-slate-500">PO</span> · {totals.colorCount}{' '}
              <span className="text-sm font-bold text-slate-500">Colors</span>
            </p>
            <p className="text-xs font-semibold text-slate-600 mt-1">
              {totals.detailRowCount} size rows shown
            </p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-700 border border-blue-300 flex items-center justify-center shrink-0">
            <Layers size={22} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-300 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Req Qty</p>
            <p className="text-2xl md:text-3xl font-extrabold text-blue-900 font-mono tabular-nums mt-1">
              {fmtKg(totals.totalReq)} <span className="text-sm font-bold text-slate-500">Kg</span>
            </p>
            <p className="text-xs font-semibold text-slate-600 mt-1">
              Across {totals.colorCount} active color group(s)
            </p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-300 flex items-center justify-center shrink-0">
            <Package size={22} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-300 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Store Received</p>
            <p className="text-2xl md:text-3xl font-extrabold text-emerald-800 font-mono tabular-nums mt-1">
              {fmtKg(totals.storeRcvd)} <span className="text-sm font-bold text-slate-500">Kg</span>
            </p>
            <p className="text-xs font-semibold text-slate-600 mt-1">
              Rcvd Balance:{' '}
              <span
                className={`font-mono font-bold ${
                  totals.rcvdBal < 0 ? 'text-rose-700' : 'text-slate-800'
                }`}
              >
                {fmtKg(totals.rcvdBal)} Kg
              </span>
            </p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-300 flex items-center justify-center shrink-0">
            <Package size={22} />
          </div>
        </div>

        <div className="bg-slate-900 text-white p-5 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cutting Supply / In Hand</p>
            <p className="text-xl md:text-2xl font-extrabold text-emerald-400 font-mono tabular-nums mt-1">
              {fmtKg(totals.cuttingSupply)} <span className="text-xs text-slate-400">Kg</span> ·{' '}
              {fmtKg(totals.storeInHand)} <span className="text-xs text-slate-400">Kg</span>
            </p>
            <p className="text-xs font-semibold text-slate-300 mt-1">
              Req-Sup Bal: <span className="font-mono font-bold text-amber-300">{fmtKg(totals.reqSupBal)} Kg</span>
            </p>
          </div>
        </div>
      </div>

      {/* Search Box + Multi-Field Filtering System Directly Underneath */}
      <div className="bg-white p-4 rounded-xl border border-slate-300 space-y-4">
        {/* Top Row: Search Box & View Mode Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search BR FABRIC UPDATE by File No, PO, Style, Color, Size, Dia, Remarks..."
              className="w-full pl-10 pr-10 py-2.5 bg-slate-50 focus:bg-white border border-slate-300 rounded-lg text-xs sm:text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none"
            />
            {localSearch && (
              <button
                onClick={() => setLocalSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-800 cursor-pointer p-1"
                title="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-300">
              <button
                onClick={() => setViewMode('grouped')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                  viewMode === 'grouped' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <LayoutGrid size={14} />
                <span>Color Sections ({totals.colorCount})</span>
              </button>
              <button
                onClick={() => setViewMode('flat')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 ${
                  viewMode === 'flat' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <TableIcon size={14} />
                <span>Sheet Table ({filteredRows.length})</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filtering System Under Search Box */}
        <div className="pt-3 border-t border-slate-200 space-y-3">
          {/* Color Quick-Filter Strip */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-600 mr-1">
              <Filter size={13} className="text-blue-700" />
              Color Filter:
            </span>

            <button
              onClick={() => setSelectedColor('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer whitespace-nowrap shrink-0 ${
                selectedColor === 'ALL'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100'
              }`}
            >
              All Colors ({filterOptions.colors.length})
            </button>

            {filterOptions.colors.map(({ name, count, theme }) => {
              const active = selectedColor === name;
              return (
                <button
                  key={name}
                  onClick={() => setSelectedColor(active ? 'ALL' : name)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer whitespace-nowrap shrink-0 ${
                    active
                      ? `${theme.headerBg} ${theme.headerText} ${theme.outerBorder}`
                      : 'bg-white text-slate-800 border-slate-300 hover:border-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <span
                    className={`h-3 w-3 rounded-sm border border-slate-400/70 shrink-0 ${
                      active ? 'ring-1 ring-white' : ''
                    }`}
                    style={{ backgroundColor: theme.swatchHex }}
                    aria-hidden="true"
                  />
                  <span>{name}</span>
                  <span className={`font-mono text-[11px] ${active ? theme.headerMuted : 'text-slate-500'}`}>
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Dropdown Filters Grid (File No / PO / Style / Size / Stock Status / Reset) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 items-end">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                File No
              </label>
              <select
                value={selectedFileNo}
                onChange={(e) => setSelectedFileNo(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 outline-none"
              >
                <option value="ALL">All Files ({filterOptions.files.length})</option>
                {filterOptions.files.map((f) => (
                  <option key={f} value={f}>
                    File {f}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                PO Number
              </label>
              <select
                value={selectedPo}
                onChange={(e) => setSelectedPo(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 outline-none"
              >
                <option value="ALL">All POs ({filterOptions.pos.length})</option>
                {filterOptions.pos.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Style
              </label>
              <select
                value={selectedStyle}
                onChange={(e) => setSelectedStyle(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 outline-none"
              >
                <option value="ALL">All Styles ({filterOptions.styles.length})</option>
                {filterOptions.styles.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Size
              </label>
              <select
                value={selectedSize}
                onChange={(e) => setSelectedSize(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 outline-none"
              >
                <option value="ALL">All Sizes</option>
                {filterOptions.sizes.map((sz) => (
                  <option key={sz} value={sz}>
                    {sz}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Stock / Balance
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 outline-none"
              >
                <option value="ALL">All Stock Status</option>
                <option value="PENDING_RCV">Pending Receive (Bal &lt; 0)</option>
                <option value="HAS_RCVD">Store Received (&gt; 0 Kg)</option>
                <option value="HAS_IN_HAND">Store In Hand (&gt; 0 Kg)</option>
                <option value="HAS_SUPPLY">Cutting Supply (&gt; 0 Kg)</option>
                <option value="HAS_ADD_REP">Need Add / Replace (&gt; 0)</option>
                <option value="HAS_REMARKS">Has Remarks</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={resetAllFilters}
                disabled={!hasAnyActiveFilter}
                className={`w-full px-3 py-2 rounded-lg text-xs font-bold border flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                  hasAnyActiveFilter
                    ? 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
                    : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                }`}
              >
                <RotateCcw size={13} />
                <span>Reset Filters</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content Display */}
      {blocks.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-300 py-16 px-4 text-center space-y-3">
          <p className="text-sm font-bold text-slate-700">
            {rows.length === 0
              ? 'No fabric update rows synced yet from BR FABRIC UPDATE.'
              : 'No matching fabric update rows found for your current filters.'}
          </p>
          {rows.length === 0 ? (
            <button
              onClick={onRefresh}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer"
            >
              Sync Sheet Now
            </button>
          ) : (
            <button
              onClick={resetAllFilters}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer"
            >
              Reset All Filters
            </button>
          )}
        </div>
      ) : viewMode === 'grouped' ? (
        <div className="space-y-6">
          {blocks.map((block) => (
            <section
              key={block.blockKey}
              className="bg-white rounded-xl border border-slate-300 overflow-hidden"
            >
              {/* PO / File Header Strip */}
              <div className="bg-slate-900 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                  <div>
                    <span className="text-slate-400 font-bold uppercase text-xs mr-1.5">File No:</span>
                    <span className="font-mono font-extrabold text-amber-300 text-base">{block.fileNo}</span>
                  </div>
                  <span className="text-slate-600" aria-hidden="true">/</span>
                  <div>
                    <span className="text-slate-400 font-bold uppercase text-xs mr-1.5">PO:</span>
                    <span className="font-mono font-extrabold text-white text-base">{block.po}</span>
                  </div>
                  <span className="text-slate-600" aria-hidden="true">/</span>
                  <div>
                    <span className="text-slate-400 font-bold uppercase text-xs mr-1.5">Style:</span>
                    <span className="font-extrabold text-emerald-300 text-base">{block.style}</span>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-slate-300">
                  {block.colorSections.length} Color Section(s)
                </span>
              </div>

              {/* Separate Color-Highlighted Sub-Sections */}
              <div className="p-4 space-y-5 bg-slate-100/70">
                {block.colorSections.map((sec, secIdx) => {
                  const theme = colorThemeLookup.get(sec.color) || getColorTheme(sec.color, secIdx);
                  const summary = summarizeColorSection(sec);

                  return (
                    <div
                      key={`${block.blockKey}___${sec.color}`}
                      className={`rounded-xl border-2 ${theme.outerBorder} overflow-hidden bg-white shadow-xs`}
                    >
                      {/* Distinct Color Header Strip */}
                      <div
                        className={`${theme.headerBg} ${theme.headerText} px-4 py-3 flex flex-wrap items-center justify-between gap-3`}
                      >
                        <div className="flex items-center gap-3 flex-wrap">
                          <span
                            className={`h-5 w-5 rounded border border-white/70 ring-2 ${theme.swatchRing} shrink-0`}
                            style={{ backgroundColor: theme.swatchHex }}
                            aria-hidden="true"
                          />
                          <h3 className="text-base font-extrabold tracking-wide uppercase">
                            {sec.color}
                          </h3>
                          {sec.crossRows.length > 0 && (
                            <span className={`text-xs sm:text-sm font-mono font-extrabold ${theme.headerMuted}`}>
                              · CROSS: {sec.crossRows.map((c) => c.DIA).filter(Boolean).join(', ')}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs sm:text-sm font-mono tabular-nums">
                          <span>
                            <span className={theme.headerMuted}>Req:</span>{' '}
                            <strong className="font-extrabold">{fmtKg(summary.totalReq)} Kg</strong>
                          </span>
                          <span>
                            <span className={theme.headerMuted}>Rcvd:</span>{' '}
                            <strong className="font-extrabold">{fmtKg(summary.storeRcvd)} Kg</strong>
                          </span>
                          <span>
                            <span className={theme.headerMuted}>Bal:</span>{' '}
                            <strong className={`font-extrabold ${summary.rcvdBal < 0 ? 'text-rose-200' : ''}`}>
                              {fmtKg(summary.rcvdBal)} Kg
                            </strong>
                          </span>
                          {summary.addReplace > 0 && (
                            <span>
                              <span className={theme.headerMuted}>Add/Rep:</span>{' '}
                              <strong className="font-extrabold text-amber-200">{fmtKg(summary.addReplace)}</strong>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Color Size Matrix Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-center border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-slate-950">
                              <th className="px-3.5 py-3 text-xs font-extrabold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">
                                Color
                              </th>
                              <th className="px-3.5 py-3 text-xs font-extrabold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">
                                Size
                              </th>
                              <th className="px-3.5 py-3 text-xs font-extrabold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">
                                Dia
                              </th>
                              <th className="px-3.5 py-3 text-xs font-extrabold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">
                                File Req
                              </th>
                              <th className="px-3.5 py-3 text-xs font-extrabold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">
                                Over Con
                              </th>
                              <th className="px-3.5 py-3 text-xs font-extrabold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap bg-amber-50 text-amber-950">
                                Need Add / Rep
                              </th>
                              <th className="px-3.5 py-3 text-xs font-extrabold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap bg-blue-100/80 text-blue-950">
                                Total Req Qty
                              </th>
                              <th className="px-3.5 py-3 text-xs font-extrabold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap bg-emerald-100/80 text-emerald-950">
                                Store Rcvd
                              </th>
                              <th className="px-3.5 py-3 text-xs font-extrabold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap bg-rose-50 text-rose-950">
                                Rcvd Balance
                              </th>
                              <th className="px-3.5 py-3 text-xs font-extrabold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">
                                Cutting Supply
                              </th>
                              <th className="px-3.5 py-3 text-xs font-extrabold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap bg-indigo-100/80 text-indigo-950">
                                Store In Hand
                              </th>
                              <th className="px-3.5 py-3 text-xs font-extrabold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap bg-amber-50 text-amber-950">
                                Req-Sup Bal
                              </th>
                              <th className="px-3.5 py-3 text-xs font-extrabold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">
                                Remarks
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {sec.detailRows.map((row, idx) => (
                              <tr
                                key={row._uniqueKey || idx}
                                className={`${idx % 2 === 0 ? theme.rowEvenBg : theme.rowOddBg} hover:bg-blue-50/50 transition-colors`}
                              >
                                <td className="px-3.5 py-3 text-sm font-extrabold text-slate-950 border border-slate-300 text-center whitespace-nowrap">
                                  <span className="inline-flex items-center justify-center gap-2">
                                    <span
                                      className="h-3 w-3 rounded-xs border border-slate-500 shrink-0"
                                      style={{ backgroundColor: theme.swatchHex }}
                                      aria-hidden="true"
                                    />
                                    <span>{row.COLOR}</span>
                                  </span>
                                </td>
                                <td className="px-3.5 py-3 text-sm font-extrabold text-slate-950 border border-slate-300 text-center whitespace-nowrap">
                                  {row.SIZE}
                                </td>
                                <td className="px-3.5 py-3 text-sm font-mono tabular-nums text-center font-extrabold text-slate-800 border border-slate-300 whitespace-nowrap">
                                  {row.DIA}
                                </td>
                                {renderMetricCell(row['FILE REQ'], row._fileReqNum)}
                                {renderMetricCell(row['OVER CON'], row._overConNum)}
                                {renderMetricCell(row['Need Additional/ Replace'], row._addReplaceNum, 'bal')}
                                {renderMetricCell(row['TOTAL REQ QTY'], row._totalReqNum, 'req')}
                                {renderMetricCell(row['STORE RCVD'], row._storeRcvdNum, 'rcvd')}
                                {renderMetricCell(row['RCVD BALANCE'], row._rcvdBalNum, 'bal')}
                                {renderMetricCell(row['CUTTING SUPPLY'], row._cuttingSupplyNum)}
                                {renderMetricCell(row['STORE IN HAND'], row._storeInHandNum, 'hand')}
                                {renderMetricCell(row['REQ-SUP BALANCE'], row._reqSupBalNum, 'bal')}
                                <td className="px-3.5 py-3 text-sm font-semibold text-slate-800 border border-slate-300 text-center min-w-[120px] max-w-[240px] break-words">
                                  {row.REMARKS || '-'}
                                </td>
                              </tr>
                            ))}

                            {sec.totalRows.map((totRow, tIdx) => (
                              <tr
                                key={totRow._uniqueKey || `tot-${tIdx}`}
                                className={`${theme.totalBg} font-extrabold text-slate-950 border-t-2 border-slate-400`}
                              >
                                <td
                                  colSpan={3}
                                  className="px-3.5 py-3.5 text-sm font-extrabold uppercase tracking-wider text-slate-950 border border-slate-300 text-center"
                                >
                                  {sec.color} Total
                                </td>
                                {renderMetricCell(totRow['FILE REQ'], totRow._fileReqNum, undefined, true)}
                                {renderMetricCell(totRow['OVER CON'], totRow._overConNum, undefined, true)}
                                {renderMetricCell(totRow['Need Additional/ Replace'], totRow._addReplaceNum, 'bal', true)}
                                {renderMetricCell(totRow['TOTAL REQ QTY'], totRow._totalReqNum, 'req', true)}
                                {renderMetricCell(totRow['STORE RCVD'], totRow._storeRcvdNum, 'rcvd', true)}
                                {renderMetricCell(totRow['RCVD BALANCE'], totRow._rcvdBalNum, 'bal', true)}
                                {renderMetricCell(totRow['CUTTING SUPPLY'], totRow._cuttingSupplyNum, undefined, true)}
                                {renderMetricCell(totRow['STORE IN HAND'], totRow._storeInHandNum, 'hand', true)}
                                {renderMetricCell(totRow['REQ-SUP BALANCE'], totRow._reqSupBalNum, 'bal', true)}
                                <td className="px-3.5 py-3.5 text-sm font-bold text-slate-900 border border-slate-300 text-center">
                                  {totRow.REMARKS || '-'}
                                </td>
                              </tr>
                            ))}

                            {sec.crossRows.map((crRow, cIdx) => (
                              <tr
                                key={crRow._uniqueKey || `cross-${cIdx}`}
                                className="bg-amber-50/40 hover:bg-amber-50/70 text-slate-950 border-t border-slate-300 transition-colors"
                              >
                                <td className="px-3.5 py-3 text-sm font-extrabold text-slate-950 border border-slate-300 text-center whitespace-nowrap">
                                  <span className="inline-flex items-center justify-center gap-2">
                                    <span
                                      className="h-3 w-3 rounded-xs border border-slate-500 shrink-0"
                                      style={{ backgroundColor: theme.swatchHex }}
                                      aria-hidden="true"
                                    />
                                    <span>{crRow.COLOR}</span>
                                  </span>
                                </td>
                                <td className="px-3.5 py-3 text-sm font-extrabold uppercase text-slate-950 border border-slate-300 text-center whitespace-nowrap">
                                  {crRow.SIZE}
                                </td>
                                <td className="px-3.5 py-3 text-sm font-mono tabular-nums text-center font-extrabold text-slate-800 border border-slate-300 whitespace-nowrap">
                                  {crRow.DIA}
                                </td>
                                {renderMetricCell(crRow['FILE REQ'], crRow._fileReqNum)}
                                {renderMetricCell(crRow['OVER CON'], crRow._overConNum)}
                                {renderMetricCell(crRow['Need Additional/ Replace'], crRow._addReplaceNum, 'bal')}
                                {renderMetricCell(crRow['TOTAL REQ QTY'], crRow._totalReqNum, 'req')}
                                {renderMetricCell(crRow['STORE RCVD'], crRow._storeRcvdNum, 'rcvd')}
                                {renderMetricCell(crRow['RCVD BALANCE'], crRow._rcvdBalNum, 'bal')}
                                {renderMetricCell(crRow['CUTTING SUPPLY'], crRow._cuttingSupplyNum)}
                                {renderMetricCell(crRow['STORE IN HAND'], crRow._storeInHandNum, 'hand')}
                                {renderMetricCell(crRow['REQ-SUP BALANCE'], crRow._reqSupBalNum, 'bal')}
                                <td className="px-3.5 py-3 text-sm font-semibold text-slate-800 border border-slate-300 text-center min-w-[120px] max-w-[240px] break-words">
                                  {crRow.REMARKS || '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        /* Flat Sheet Table Mode with Color-Wise Highlighting */
        <div className="bg-white rounded-xl border border-slate-300 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-center border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100 text-slate-950">
                  {[
                    'File No',
                    'PO',
                    'STYLE',
                    'COLOR',
                    'SIZE',
                    'DIA',
                    'FILE REQ',
                    'OVER CON',
                    'Need Add / Rep',
                    'TOTAL REQ QTY',
                    'STORE RCVD',
                    'RCVD BALANCE',
                    'CUTTING SUPPLY',
                    'STORE IN HAND',
                    'REQ-SUP BALANCE',
                    'REMARKS',
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3.5 py-3 text-xs font-extrabold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, idx) => {
                  const prevRow = idx > 0 ? filteredRows[idx - 1] : null;
                  const isNewColorGroup = !prevRow || prevRow.COLOR !== row.COLOR;
                  const theme = colorThemeLookup.get(row.COLOR) || getColorTheme(row.COLOR, idx);

                  return (
                    <tr
                      key={row._uniqueKey || idx}
                      className={`${
                        row._isTotalRow
                          ? `${theme.totalBg} font-extrabold text-slate-950`
                          : idx % 2 === 0
                            ? theme.rowEvenBg
                            : theme.rowOddBg
                      } ${isNewColorGroup && idx > 0 ? theme.flatBorderTop : ''} hover:bg-blue-50/50 transition-colors`}
                    >
                      <td className="px-3.5 py-3 text-sm font-mono font-extrabold text-slate-950 border border-slate-300 text-center whitespace-nowrap">
                        {row['File No'] || '-'}
                      </td>
                      <td className="px-3.5 py-3 text-sm font-mono font-extrabold text-slate-950 border border-slate-300 text-center whitespace-nowrap">
                        {row.PO || '-'}
                      </td>
                      <td className="px-3.5 py-3 text-sm font-extrabold text-slate-950 border border-slate-300 text-center whitespace-nowrap">
                        {row.STYLE || '-'}
                      </td>
                      <td
                        className={`px-3.5 py-3 text-sm font-extrabold border border-slate-300 text-center whitespace-nowrap ${theme.flatCellBg}`}
                      >
                        <span className="inline-flex items-center justify-center gap-2">
                          <span
                            className="h-3 w-3 rounded-xs border border-slate-400 shrink-0"
                            style={{ backgroundColor: theme.swatchHex }}
                            aria-hidden="true"
                          />
                          <span>{row.COLOR}</span>
                        </span>
                      </td>
                      <td className="px-3.5 py-3 text-sm font-extrabold text-slate-950 border border-slate-300 text-center whitespace-nowrap">
                        {row.SIZE}
                      </td>
                      <td className="px-3.5 py-3 text-sm font-mono tabular-nums text-center font-extrabold text-slate-800 border border-slate-300 whitespace-nowrap">
                        {row.DIA}
                      </td>
                      {renderMetricCell(row['FILE REQ'], row._fileReqNum, undefined, Boolean(row._isTotalRow))}
                      {renderMetricCell(row['OVER CON'], row._overConNum, undefined, Boolean(row._isTotalRow))}
                      {renderMetricCell(row['Need Additional/ Replace'], row._addReplaceNum, 'bal', Boolean(row._isTotalRow))}
                      {renderMetricCell(row['TOTAL REQ QTY'], row._totalReqNum, 'req', Boolean(row._isTotalRow))}
                      {renderMetricCell(row['STORE RCVD'], row._storeRcvdNum, 'rcvd', Boolean(row._isTotalRow))}
                      {renderMetricCell(row['RCVD BALANCE'], row._rcvdBalNum, 'bal', Boolean(row._isTotalRow))}
                      {renderMetricCell(row['CUTTING SUPPLY'], row._cuttingSupplyNum, undefined, Boolean(row._isTotalRow))}
                      {renderMetricCell(row['STORE IN HAND'], row._storeInHandNum, 'hand', Boolean(row._isTotalRow))}
                      {renderMetricCell(row['REQ-SUP BALANCE'], row._reqSupBalNum, 'bal', Boolean(row._isTotalRow))}
                      <td className="px-3.5 py-3 text-sm font-semibold text-slate-800 border border-slate-300 text-center min-w-[120px] max-w-[240px] break-words">
                        {row.REMARKS || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
