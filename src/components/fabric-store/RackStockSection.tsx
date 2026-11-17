import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Download,
  Layers,
  LayoutGrid,
  Plus,
  QrCode,
  Search,
  Table as TableIcon,
} from 'lucide-react';
import {
  RackSummaryItem,
  formatKg,
  getZoneColorPalette,
} from './rackZoneTheme';

interface ZoneStat {
  zone: string;
  racksCount: number;
  capacityKg: number;
  stockKg: number;
  pct: number;
}

interface OverallTotals {
  totalReceivedKg: number;
  totalDeliveredKg: number;
  availableStockKg: number;
  activeLots: number;
  activePoCount: number;
  totalRacks: number;
  totalCapacityKg: number;
  totalFreeKg: number;
  warehouseFillPct: number;
}

interface RackStockSectionProps {
  overallTotals: OverallTotals;
  zoneStats: ZoneStat[];
  rackZones: string[];
  totalRacksCount: number;
  filteredRackSummaries: RackSummaryItem[];
  rackSearch: string;
  onRackSearchChange: (val: string) => void;
  rackZoneFilter: string;
  onRackZoneFilterChange: (val: string) => void;
  canExport: boolean;
  canManageRacks: boolean;
  onExportCsv: () => void;
  onAddRack: () => void;
  onSelectRack: (rackId: string) => void;
  onOpenRackQr: (item: RackSummaryItem) => void;
  onOpenBulkQrPrint: () => void;
}

export function RackStockSection({
  overallTotals,
  zoneStats,
  rackZones,
  totalRacksCount,
  filteredRackSummaries,
  rackSearch,
  onRackSearchChange,
  rackZoneFilter,
  onRackZoneFilterChange,
  canExport,
  canManageRacks,
  onExportCsv,
  onAddRack,
  onSelectRack,
  onOpenRackQr,
  onOpenBulkQrPrint,
}: RackStockSectionProps) {
  const [viewMode, setViewMode] = useState<'zoned' | 'grid' | 'table'>('zoned');

  // Group filtered racks by zone preserving zoneStats order
  const groupedByZone = useMemo(() => {
    const map = new Map<string, RackSummaryItem[]>();
    filteredRackSummaries.forEach((item) => {
      const z = item.rack.zone || 'General Store';
      const arr = map.get(z) || [];
      arr.push(item);
      map.set(z, arr);
    });
    return Array.from(map.entries()).map(([zone, items]) => {
      const totalCap = items.reduce((s, i) => s + (i.rack.capacityKg || 0), 0);
      const totalStock = items.reduce((s, i) => s + i.currentKg, 0);
      const totalFree = Math.max(0, totalCap - totalStock);
      const pct = totalCap > 0 ? Math.min(100, Math.round((totalStock / totalCap) * 100)) : 0;
      return {
        zone,
        items,
        totalCap,
        totalStock,
        totalFree,
        pct,
      };
    });
  }, [filteredRackSummaries]);

  const renderRackCard = (item: RackSummaryItem, zoneIndexHint?: number) => {
    const palette = getZoneColorPalette(item.rack.zone, zoneIndexHint);
    const hasStock = item.currentKg > 0.009;
    const isNearFull = item.utilizationPct >= 90;
    const isMedium = item.utilizationPct >= 65 && item.utilizationPct < 90;
    const ringColor = isNearFull
      ? '#fb7185'
      : isMedium
      ? '#fbbf24'
      : hasStock
      ? '#6ee7b7'
      : 'rgba(255,255,255,0.45)';
    const radius = 17;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference - (item.utilizationPct / 100) * circumference;

    return (
      <div
        key={item.rack.id}
        className={`rounded-2xl border ${palette.cardBorder} ${palette.cardHoverBorder} bg-white overflow-hidden flex flex-col justify-between transition`}
      >
        <div>
          {/* Zone-Colored Card Header */}
          <div
            className={`${palette.headerBg} ${palette.headerText} px-4 py-3.5 flex items-center justify-between gap-2 border-b ${palette.headerBorder}`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold font-mono tracking-tight">
                  Rack {item.rack.code}
                </span>
                <span className={`text-[11px] font-bold ${palette.headerSubtext}`}>
                  · {isNearFull ? 'Near Full' : hasStock ? 'Active' : 'Empty'}
                </span>
              </div>
              <p className={`text-xs truncate mt-0.5 ${palette.headerSubtext}`}>
                {item.rack.zone}
              </p>
            </div>

            {/* Circular Capacity Gauge */}
            <div className="relative h-11 w-11 shrink-0 flex items-center justify-center">
              <svg className="h-11 w-11 -rotate-90" viewBox="0 0 42 42">
                <circle
                  cx="21"
                  cy="21"
                  r={radius}
                  fill="none"
                  stroke="rgba(255,255,255,0.22)"
                  strokeWidth="4"
                />
                <circle
                  cx="21"
                  cy="21"
                  r={radius}
                  fill="none"
                  stroke={ringColor}
                  strokeWidth="4"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute text-[10px] font-mono font-extrabold tabular-nums text-white">
                {item.utilizationPct}%
              </span>
            </div>
          </div>

          {/* Metric Grid */}
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-2 pb-3 border-b border-slate-100 text-xs">
              <div>
                <span className="text-slate-500 block">In Stock</span>
                <span className="text-sm font-extrabold text-slate-900 font-mono tabular-nums">
                  {formatKg(item.currentKg)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Free Cap.</span>
                <span
                  className={`text-sm font-bold font-mono tabular-nums ${
                    item.freeCapacityKg < 300 && hasStock
                      ? 'text-rose-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {formatKg(item.freeCapacityKg)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block">Lots</span>
                <span className="text-sm font-extrabold text-slate-900 font-mono tabular-nums">
                  {item.activeBatches.length}
                </span>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2 text-slate-600">
                <span className="text-slate-500 shrink-0">Buyers:</span>
                <span className="font-bold text-slate-900 truncate text-right">
                  {item.buyers.length > 0 ? item.buyers.join(', ') : '-'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-slate-600">
                <span className="text-slate-500 shrink-0">POs:</span>
                <span className="font-mono font-bold text-slate-800 truncate text-right">
                  {item.pos.length > 0
                    ? `${item.pos.slice(0, 2).join(', ')}${
                        item.pos.length > 2 ? ` +${item.pos.length - 2}` : ''
                      }`
                    : 'Empty'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Ergonomic Dual Action Footer (44px+ Mobile Touch Targets) */}
        <div className={`px-3 py-2.5 ${palette.surfaceBg} border-t ${palette.surfaceBorder} flex items-center gap-2`}>
          <button
            type="button"
            onClick={() => onOpenRackQr(item)}
            className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            title={`Show Fixed QR Code for Rack ${item.rack.code}`}
          >
            <QrCode size={15} />
            <span>QR Code</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectRack(item.rack.id)}
            className={`flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-white hover:bg-slate-900 hover:text-white border ${palette.cardBorder} ${palette.accentText} text-xs font-extrabold flex items-center justify-between gap-1.5 cursor-pointer transition`}
          >
            <span className="truncate">Manage / Details</span>
            <ArrowRight size={15} className="shrink-0" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Warehouse Architectural Hero Strip */}
      <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-4 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-center">
          <div className="lg:col-span-5 space-y-2">
            <p className="text-xs font-semibold text-slate-400">
              Warehouse Live Overview · {overallTotals.totalRacks} Active Racks
            </p>
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <span className="text-3xl sm:text-4xl font-extrabold font-mono tabular-nums tracking-tight text-white">
                {formatKg(overallTotals.availableStockKg)}
              </span>
              <span className="text-sm font-semibold text-slate-300">kg in stock</span>
            </div>
            <p className="text-xs text-slate-400 font-mono tabular-nums">
              Free:{' '}
              <span className="text-emerald-400 font-bold">
                {formatKg(overallTotals.totalFreeKg)} kg
              </span>
              <span className="mx-1.5 text-slate-600">/</span>
              Cap:{' '}
              <span className="text-slate-200">{formatKg(overallTotals.totalCapacityKg)} kg</span>{' '}
              ({overallTotals.warehouseFillPct}%)
            </p>

            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-800 text-xs">
              <div>
                <span className="text-slate-400 block">Received</span>
                <span className="font-mono tabular-nums font-bold text-emerald-400 text-sm">
                  {formatKg(overallTotals.totalReceivedKg)} kg
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Delivered</span>
                <span className="font-mono tabular-nums font-bold text-sky-400 text-sm">
                  {formatKg(overallTotals.totalDeliveredKg)} kg
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Lots / POs</span>
                <span className="font-mono tabular-nums font-bold text-white text-sm">
                  {overallTotals.activeLots} / {overallTotals.activePoCount}
                </span>
              </div>
            </div>
          </div>

          {/* Zone-Wise Colored Quick Filter Cards */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {zoneStats.map((zs, idx) => {
              const palette = getZoneColorPalette(zs.zone, idx);
              const isSelected = rackZoneFilter === zs.zone;
              return (
                <button
                  key={zs.zone}
                  type="button"
                  onClick={() =>
                    onRackZoneFilterChange(rackZoneFilter === zs.zone ? 'ALL' : zs.zone)
                  }
                  className={`min-h-[44px] text-left rounded-xl border transition cursor-pointer overflow-hidden ${
                    isSelected
                      ? 'bg-slate-800 border-white ring-2 ring-white/40'
                      : 'bg-slate-800/70 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <div className={`h-1.5 w-full ${palette.dotBg}`} />
                  <div className="p-3.5">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${palette.dotBg}`} />
                        <span className="text-xs font-extrabold text-white truncate">
                          {zs.zone}
                        </span>
                      </div>
                      <span className="text-xs font-mono tabular-nums font-bold text-emerald-400 shrink-0">
                        {zs.pct}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden mb-2">
                      <div
                        className={`h-full rounded-full ${
                          zs.pct >= 90 ? 'bg-rose-500' : palette.dotBg
                        }`}
                        style={{ width: `${zs.pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-300">
                      <span>{formatKg(zs.stockKg)} kg</span>
                      <span className="text-slate-400">{zs.racksCount} racks</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Search, Zone Filter, View Toggle & QR / Rack Actions Toolbar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-300 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={rackSearch}
              onChange={(e) => onRackSearchChange(e.target.value)}
              placeholder="Search rack code, PO, buyer, style, color, or lot..."
              className="w-full min-h-[44px] pl-10 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm sm:text-xs font-medium focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <select
            value={rackZoneFilter}
            onChange={(e) => onRackZoneFilterChange(e.target.value)}
            className="min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 outline-none"
          >
            <option value="ALL">All Zones ({totalRacksCount})</option>
            {rackZones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-300 overflow-x-auto">
            <button
              type="button"
              onClick={() => setViewMode('zoned')}
              className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'zoned' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
              }`}
            >
              <Layers size={13} />
              <span>By Zone</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'grid' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
              }`}
            >
              <LayoutGrid size={13} />
              <span>All Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
              }`}
            >
              <TableIcon size={13} />
              <span>Table</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenBulkQrPrint}
            className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-900 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <QrCode size={15} />
            <span>Print All QRs</span>
          </button>

          {canExport && (
            <button
              type="button"
              onClick={onExportCsv}
              className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download size={14} />
              <span>CSV</span>
            </button>
          )}

          {canManageRacks && (
            <button
              type="button"
              onClick={onAddRack}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus size={14} />
              <span>Add Rack</span>
            </button>
          )}
        </div>
      </div>

      {/* Rack Displays */}
      {filteredRackSummaries.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-300 p-10 text-center text-slate-500 text-sm">
          No racks match your current filter.
        </div>
      ) : viewMode === 'zoned' ? (
        <div className="space-y-6">
          {groupedByZone.map((group, gIdx) => {
            const palette = getZoneColorPalette(group.zone, gIdx);
            return (
              <section
                key={group.zone}
                className={`rounded-2xl border ${palette.cardBorder} bg-white overflow-hidden`}
              >
                {/* Zone Section Header */}
                <div
                  className={`${palette.surfaceBg} border-b ${palette.surfaceBorder} px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`h-3 w-3 rounded-full shrink-0 ${palette.dotBg}`} />
                    <h3 className={`text-sm sm:text-base font-extrabold truncate ${palette.accentText}`}>
                      {group.zone}
                    </h3>
                    <span className="text-xs font-mono font-bold text-slate-600 shrink-0">
                      ({group.items.length} racks)
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono tabular-nums text-slate-700 flex-wrap">
                    <span>
                      Stock:{' '}
                      <strong className={palette.accentText}>
                        {formatKg(group.totalStock)} kg
                      </strong>
                    </span>
                    <span>
                      Free: <strong className="text-emerald-700">{formatKg(group.totalFree)} kg</strong>
                    </span>
                    <span>
                      Fill: <strong>{group.pct}%</strong>
                    </span>
                  </div>
                </div>

                {/* Zone Racks Grid */}
                <div className="p-3.5 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 bg-slate-50/40">
                  {group.items.map((item) => renderRackCard(item, gIdx))}
                </div>
              </section>
            );
          })}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredRackSummaries.map((item) => renderRackCard(item))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-300 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100 text-slate-700 uppercase font-bold">
                <tr>
                  <th className="p-3 border-b border-slate-200">Rack</th>
                  <th className="p-3 border-b border-slate-200">Zone</th>
                  <th className="p-3 border-b border-slate-200 text-right">Lots</th>
                  <th className="p-3 border-b border-slate-200 text-right">In Stock (kg)</th>
                  <th className="p-3 border-b border-slate-200 text-right">Free Cap (kg)</th>
                  <th className="p-3 border-b border-slate-200 text-right">Fill %</th>
                  <th className="p-3 border-b border-slate-200">Buyers / POs</th>
                  <th className="p-3 border-b border-slate-200 text-center">QR & Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredRackSummaries.map((item) => {
                  const palette = getZoneColorPalette(item.rack.zone);
                  return (
                    <tr key={item.rack.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-extrabold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${palette.dotBg}`} />
                          <span>Rack {item.rack.code}</span>
                        </div>
                      </td>
                      <td className={`p-3 font-bold ${palette.accentText}`}>
                        {item.rack.zone}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums font-bold">
                        {item.activeBatches.length}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums font-extrabold text-slate-900">
                        {formatKg(item.currentKg)}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                        {formatKg(item.freeCapacityKg)}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums font-bold">
                        {item.utilizationPct}%
                      </td>
                      <td className="p-3 text-slate-700 truncate max-w-[220px]">
                        {item.pos.length > 0
                          ? `${item.buyers.join(', ')} · ${item.pos.join(', ')}`
                          : 'Empty'}
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenRackQr(item)}
                            className="min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <QrCode size={13} />
                            <span>QR</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectRack(item.rack.id)}
                            className={`min-h-[36px] px-3 py-1 rounded-lg ${palette.headerBg} text-white font-bold cursor-pointer`}
                          >
                            Manage →
                          </button>
                        </div>
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
}
