import React, { useMemo } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Layers,
  PackagePlus,
  Search,
  Split,
  Table as TableIcon,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { EnrichedReceivingBatch } from './MultiPoDeliverySection';
import { EnrichedBookingRequirement } from './FabricBookingSection';
import { RackSummaryItem, formatKg, getZoneColorPalette } from './rackZoneTheme';

export interface ReceivingOrderContext {
  buyer: string;
  po: string;
  style: string;
  itemName: string;
  fileNo: string;
  shipDate: string;
  orderDzn: string;
}

export interface RackAllocationSplit {
  rackId: string;
  weightKg: string;
  rollCount: string;
}

export interface ChallanDraftLine {
  localId: string;
  buyer: string;
  po: string;
  style: string;
  itemName: string;
  fileNo: string;
  shipDate: string;
  orderDzn: string;
  requirementId: string;
  requiredQtyKg: number;
  alreadyReceivedKg: number;
  fabricType: string;
  color: string;
  gsm: string;
  weightKg: string;
  rollCount: string;
  lotNo: string;
  rackId: string;
  isSplitRack: boolean;
  rackSplits: RackAllocationSplit[];
  remark: string;
}

export interface ChallanRegisterGroup {
  groupKey: string;
  challanNo: string;
  receiveDate: string;
  supplier: string;
  totalWeightKg: number;
  totalBalanceKg: number;
  pos: Set<string>;
  buyers: Set<string>;
  racks: Set<string>;
  items: EnrichedReceivingBatch[];
}

interface FabricReceivingSectionProps {
  canReceive: boolean;
  canDeliver: boolean;
  canDeleteRecords: boolean;
  canExport: boolean;
  roleLabel: string;
  challanHeader: {
    challanNo: string;
    receiveDate: string;
    supplier: string;
    remark: string;
  };
  onChallanHeaderChange: React.Dispatch<
    React.SetStateAction<{
      challanNo: string;
      receiveDate: string;
      supplier: string;
      remark: string;
    }>
  >;
  challanLines: ChallanDraftLine[];
  onRemoveChallanLine: (localId: string) => void;
  onUpdateChallanLine: (localId: string, patch: Partial<ChallanDraftLine>) => void;
  onUpdateChallanLineSplit: (
    localId: string,
    splitIdx: number,
    patch: Partial<RackAllocationSplit>
  ) => void;
  isSubmittingChallan: boolean;
  onSaveFullChallan: (e: React.FormEvent) => void;
  isManualPoMode: boolean;
  onToggleManualPoMode: () => void;
  manualPoForm: ReceivingOrderContext;
  onManualPoFormChange: React.Dispatch<React.SetStateAction<ReceivingOrderContext>>;
  recPoSearch: string;
  onRecPoSearchChange: (val: string) => void;
  recBuyerFilter: string;
  onRecBuyerFilterChange: (val: string) => void;
  sheetBuyerNames: string[];
  recMatchingSheetOrders: any[];
  selectedOrderForRec: ReceivingOrderContext | null;
  onSelectSheetOrderForRec: (order: any) => void;
  enrichedRequirements: EnrichedBookingRequirement[];
  selectedPoRequirements: EnrichedBookingRequirement[];
  onAddAllPendingReqsForPo: () => void;
  onAddCustomPoLine: () => void;
  onAddRequirementToChallan: (req: EnrichedBookingRequirement) => void;
  onBookRequiredQtyFirst: () => void;
  rackSummaries: RackSummaryItem[];
  rackZoneByCode: Record<string, string>;
  defaultRackId: string;
  secondRackId: string;
  fabricTypeSuggestions: string[];
  recRegisterView: 'challan' | 'items';
  onRecRegisterViewChange: (view: 'challan' | 'items') => void;
  recLedgerSearch: string;
  onRecLedgerSearchChange: (val: string) => void;
  challanGroups: ChallanRegisterGroup[];
  filteredReceivingsLedger: EnrichedReceivingBatch[];
  expandedChallans: Record<string, boolean>;
  onToggleExpandChallan: (groupKey: string) => void;
  onExportCsv: () => void;
  onDeliverBatch: (batch: EnrichedReceivingBatch) => void;
  onDeleteReceivingRecord: (batch: EnrichedReceivingBatch) => void;
}

export function FabricReceivingSection({
  canReceive,
  canDeliver,
  canDeleteRecords,
  canExport,
  roleLabel,
  challanHeader,
  onChallanHeaderChange,
  challanLines,
  onRemoveChallanLine,
  onUpdateChallanLine,
  onUpdateChallanLineSplit,
  isSubmittingChallan,
  onSaveFullChallan,
  isManualPoMode,
  onToggleManualPoMode,
  manualPoForm,
  onManualPoFormChange,
  recPoSearch,
  onRecPoSearchChange,
  recBuyerFilter,
  onRecBuyerFilterChange,
  sheetBuyerNames,
  recMatchingSheetOrders,
  selectedOrderForRec,
  onSelectSheetOrderForRec,
  enrichedRequirements,
  selectedPoRequirements,
  onAddAllPendingReqsForPo,
  onAddCustomPoLine,
  onAddRequirementToChallan,
  onBookRequiredQtyFirst,
  rackSummaries,
  rackZoneByCode,
  defaultRackId,
  secondRackId,
  fabricTypeSuggestions,
  recRegisterView,
  onRecRegisterViewChange,
  recLedgerSearch,
  onRecLedgerSearchChange,
  challanGroups,
  filteredReceivingsLedger,
  expandedChallans,
  onToggleExpandChallan,
  onExportCsv,
  onDeliverBatch,
  onDeleteReceivingRecord,
}: FabricReceivingSectionProps) {
  const kpi = useMemo(() => {
    const totalReceivedKg = filteredReceivingsLedger.reduce((s, r) => s + r.weightKg, 0);
    const totalAvailableKg = filteredReceivingsLedger.reduce((s, r) => s + r.availableKg, 0);
    const activeBatches = filteredReceivingsLedger.filter((r) => r.availableKg > 0.009).length;
    const draftTotalKg = challanLines.reduce((s, l) => s + (parseFloat(l.weightKg) || 0), 0);
    return {
      challanCount: challanGroups.length,
      batchCount: filteredReceivingsLedger.length,
      activeBatches,
      totalReceivedKg,
      totalAvailableKg,
      draftTotalKg,
    };
  }, [challanGroups.length, filteredReceivingsLedger, challanLines]);

  const activeRackSummaries = useMemo(
    () => rackSummaries.filter((rs) => rs.rack.isActive),
    [rackSummaries]
  );

  return (
    <div className="space-y-5">
      {/* Receiving Hero KPI Overview Strip */}
      <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-4 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          <div className="lg:col-span-5 space-y-1.5">
            <p className="text-xs font-semibold text-emerald-300">
              Challan-Wise Multi-PO Bulk Receiving · {kpi.challanCount} Challan Group(s)
            </p>
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <span className="text-3xl sm:text-4xl font-extrabold font-mono tabular-nums tracking-tight">
                {formatKg(kpi.totalReceivedKg)}
              </span>
              <span className="text-sm font-semibold text-slate-300">kg total received</span>
            </div>
            <p className="text-xs text-slate-400 font-mono tabular-nums">
              {kpi.batchCount} Rack Batch(es) · {kpi.activeBatches} Active in Racks
            </p>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700">
              <span className="text-xs font-semibold text-slate-400 block">Available In Store</span>
              <span className="text-xl font-extrabold font-mono tabular-nums text-emerald-400 mt-1 block">
                {formatKg(kpi.totalAvailableKg)} kg
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700">
              <span className="text-xs font-semibold text-slate-400 block">Challan Groups</span>
              <span className="text-xl font-extrabold font-mono tabular-nums text-white mt-1 block">
                {kpi.challanCount}
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700">
              <span className="text-xs font-semibold text-slate-400 block">Current Draft Queue</span>
              <span className="text-xl font-extrabold font-mono tabular-nums text-amber-400 mt-1 block">
                {challanLines.length} Line · {formatKg(kpi.draftTotalKg)} kg
              </span>
            </div>
          </div>
        </div>
      </div>

      {canReceive ? (
        <form onSubmit={onSaveFullChallan} className="space-y-5">
          {/* Step 1: Challan Header */}
          <div className="bg-white rounded-2xl border border-slate-300 overflow-hidden">
            <div className="bg-emerald-800 text-white px-4 py-3.5 border-b border-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold">
                  1. Challan Header (Multi-PO Bulk Receiving)
                </h3>
                <p className="text-xs text-emerald-100 mt-0.5">
                  Enter challan details once, then add one or several Buyer POs below
                </p>
              </div>
              <span className="text-xs font-mono font-bold bg-emerald-950/60 text-emerald-100 px-3 py-1.5 rounded-lg shrink-0">
                {challanLines.length} Line(s) · {formatKg(kpi.draftTotalKg)} kg
              </span>
            </div>

            <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Challan No *</label>
                <input
                  type="text"
                  required
                  value={challanHeader.challanNo}
                  onChange={(e) =>
                    onChallanHeaderChange((p) => ({ ...p, challanNo: e.target.value }))
                  }
                  placeholder="e.g. CH-2026-8821"
                  className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-[13px] font-mono font-bold outline-none focus:bg-white focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Receiving Date *
                </label>
                <input
                  type="date"
                  required
                  value={challanHeader.receiveDate}
                  onChange={(e) =>
                    onChallanHeaderChange((p) => ({ ...p, receiveDate: e.target.value }))
                  }
                  className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-[13px] font-mono outline-none focus:bg-white focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Supplier *</label>
                <input
                  type="text"
                  required
                  value={challanHeader.supplier}
                  onChange={(e) =>
                    onChallanHeaderChange((p) => ({ ...p, supplier: e.target.value }))
                  }
                  placeholder="e.g. Four H Dyeing / Knit Asia"
                  className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-[13px] outline-none focus:bg-white focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Challan Remark</label>
                <input
                  type="text"
                  value={challanHeader.remark}
                  onChange={(e) =>
                    onChallanHeaderChange((p) => ({ ...p, remark: e.target.value }))
                  }
                  placeholder="General note across challan"
                  className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-[13px] outline-none focus:bg-white focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>
          </div>

          {/* Step 2 & Step 3: PO Search Picker + Pre-Booked Specs */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Step 2: Searchable PO Picker */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-300 overflow-hidden">
              <div className="bg-slate-800 text-white px-4 py-3.5 border-b border-slate-900 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold">
                    2. Search & Select PO (All Buyers)
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Pick multiple POs for this single challan
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onToggleManualPoMode}
                  className="min-h-[36px] px-3 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-bold text-white cursor-pointer whitespace-nowrap shrink-0"
                >
                  {isManualPoMode ? 'Pick from Sheet' : 'Manual PO'}
                </button>
              </div>

              <div className="p-4 space-y-3">
                {!isManualPoMode ? (
                  <>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="relative flex-1">
                        <Search
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                          size={15}
                        />
                        <input
                          type="text"
                          value={recPoSearch}
                          onChange={(e) => onRecPoSearchChange(e.target.value)}
                          placeholder="Search PO, Style, File, Buyer..."
                          className="w-full min-h-[44px] pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-[13px] outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <select
                        value={recBuyerFilter}
                        onChange={(e) => onRecBuyerFilterChange(e.target.value)}
                        className="min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 sm:max-w-[140px] outline-none"
                      >
                        <option value="ALL">All Buyers</option>
                        {sheetBuyerNames.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-200 border border-slate-200 rounded-xl">
                      {recMatchingSheetOrders.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500">
                          No orders found matching &quot;{recPoSearch}&quot;.
                        </div>
                      ) : (
                        recMatchingSheetOrders.map((order, idx) => {
                          const poStr = String(order['PO'] || '').trim();
                          const buyerStr = String(order._tabSource || '').trim();
                          const isSelected =
                            selectedOrderForRec?.po === poStr &&
                            selectedOrderForRec?.buyer === buyerStr &&
                            selectedOrderForRec?.style === String(order['STYLE'] || '').trim();
                          const bookedCount = enrichedRequirements.filter(
                            (r) => r.po === poStr && r.buyer === buyerStr
                          ).length;

                          return (
                            <button
                              key={`rec_po_${order._uniqueKey || 'row'}_${idx}`}
                              type="button"
                              onClick={() => onSelectSheetOrderForRec(order)}
                              className={`w-full min-h-[48px] text-left p-3 transition cursor-pointer flex items-start justify-between gap-2 ${
                                isSelected ? 'bg-blue-50' : 'hover:bg-slate-50 bg-white'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 text-xs flex-wrap">
                                  <span className="font-extrabold text-slate-900 font-mono">
                                    PO {poStr}
                                  </span>
                                  <span className="text-slate-400">·</span>
                                  <span className="font-bold text-blue-800 truncate">
                                    {buyerStr}
                                  </span>
                                  {bookedCount > 0 && (
                                    <span className="text-[11px] font-bold text-emerald-700">
                                      · {bookedCount} booked
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs font-semibold text-slate-800 truncate mt-0.5">
                                  {order['STYLE'] || '-'} — {order['ITEM'] || '-'}
                                </p>
                                <p className="text-xs text-slate-500 font-mono mt-0.5">
                                  File {order['File No'] || '-'} · Ship {order['SHIP DATE'] || '-'}
                                </p>
                              </div>
                              {isSelected && (
                                <CheckCircle2 size={16} className="text-blue-600 shrink-0 mt-0.5" />
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Buyer *</label>
                      <input
                        type="text"
                        value={manualPoForm.buyer}
                        onChange={(e) =>
                          onManualPoFormChange((p) => ({ ...p, buyer: e.target.value }))
                        }
                        placeholder="Buyer name"
                        className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-xl text-xs bg-slate-50 focus:bg-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        PO Number *
                      </label>
                      <input
                        type="text"
                        value={manualPoForm.po}
                        onChange={(e) =>
                          onManualPoFormChange((p) => ({ ...p, po: e.target.value }))
                        }
                        placeholder="PO number"
                        className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono bg-slate-50 focus:bg-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Style</label>
                      <input
                        type="text"
                        value={manualPoForm.style}
                        onChange={(e) =>
                          onManualPoFormChange((p) => ({ ...p, style: e.target.value }))
                        }
                        className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-xl text-xs bg-slate-50 focus:bg-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Ship Date</label>
                      <input
                        type="text"
                        value={manualPoForm.shipDate}
                        onChange={(e) =>
                          onManualPoFormChange((p) => ({ ...p, shipDate: e.target.value }))
                        }
                        className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono bg-slate-50 focus:bg-white outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Step 3: Pre-Booked Fabric Specs */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-300 overflow-hidden">
              <div className="bg-teal-800 text-white px-4 py-3.5 border-b border-teal-900 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold">
                    3. Pre-Booked Fabric & Required Qty
                  </h3>
                  <p className="text-xs text-teal-100 mt-0.5">
                    Click a booked item to load specs, or add a custom fabric line
                  </p>
                </div>
                {(selectedOrderForRec || (isManualPoMode && manualPoForm.po)) && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedPoRequirements.length > 0 && (
                      <button
                        type="button"
                        onClick={onAddAllPendingReqsForPo}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-950 text-white text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
                      >
                        + Add All ({selectedPoRequirements.length})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onAddCustomPoLine}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white hover:bg-teal-50 text-teal-900 text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
                    >
                      + Custom Line
                    </button>
                  </div>
                )}
              </div>

              <div className="p-4 space-y-3">
                {!(selectedOrderForRec || (isManualPoMode && manualPoForm.po)) ? (
                  <div className="p-8 rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-500">
                    Select a PO on the left to inspect its pre-booked fabric list and add rows to
                    this challan.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedOrderForRec && (
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div>
                          <span className="font-extrabold text-slate-900 font-mono">
                            PO {selectedOrderForRec.po}
                          </span>
                          <span className="text-slate-400 mx-1.5">·</span>
                          <span className="font-bold text-blue-800">
                            {selectedOrderForRec.buyer}
                          </span>
                          <span className="text-slate-400 mx-1.5">·</span>
                          <span className="font-semibold text-slate-700">
                            {selectedOrderForRec.style}
                          </span>
                        </div>
                        <span className="font-mono text-slate-500">
                          Ship {selectedOrderForRec.shipDate || '-'}
                        </span>
                      </div>
                    )}

                    {selectedPoRequirements.length === 0 ? (
                      <div className="p-5 rounded-xl border border-dashed border-slate-300 text-center space-y-3">
                        <p className="text-xs text-slate-600">
                          No pre-entered fabric booking found for this PO yet.
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={onAddCustomPoLine}
                            className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
                          >
                            + Add Custom Fabric Line to Challan
                          </button>
                          <button
                            type="button"
                            onClick={onBookRequiredQtyFirst}
                            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
                          >
                            Book Required Qty First
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl max-h-64 overflow-y-auto">
                        {selectedPoRequirements.map((req) => (
                          <div
                            key={req.id}
                            className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 text-xs"
                          >
                            <div>
                              <div className="font-bold text-slate-900">
                                {req.fabricType} · {req.color} {req.gsm ? `(${req.gsm})` : ''}
                              </div>
                              <div className="font-mono tabular-nums text-slate-600 mt-1">
                                Req: <strong>{formatKg(req.requiredQtyKg)} kg</strong> · Recv:{' '}
                                <strong className="text-emerald-700">
                                  {formatKg(req.receivedKg)} kg
                                </strong>{' '}
                                · Pending:{' '}
                                <strong className="text-amber-700">
                                  {formatKg(req.pendingKg)} kg
                                </strong>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => onAddRequirementToChallan(req)}
                              className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold cursor-pointer whitespace-nowrap shrink-0"
                            >
                              + Add to Challan
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Step 4: Challan Bulk Staging Queue */}
          <div className="bg-white rounded-2xl border border-slate-300 overflow-hidden">
            <div className="bg-emerald-900 text-white px-4 py-3.5 border-b border-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold">
                  4. Challan Bulk Entry Queue ({challanLines.length} PO Line
                  {challanLines.length === 1 ? '' : 's'})
                </h3>
                <p className="text-xs text-emerald-100 mt-0.5">
                  Enter receiving weight & lot no. Use <strong>Split Across Racks</strong> when a
                  batch shares rack capacity.
                </p>
              </div>
              {challanLines.length > 0 && (
                <button
                  type="submit"
                  disabled={isSubmittingChallan}
                  className="min-h-[44px] px-5 py-2.5 bg-white hover:bg-emerald-50 text-emerald-950 text-xs font-extrabold rounded-xl transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                >
                  <PackagePlus size={15} />
                  <span>
                    {isSubmittingChallan
                      ? 'Saving Challan...'
                      : `Save Full Challan (${challanLines.length} Line${challanLines.length === 1 ? '' : 's'})`}
                  </span>
                </button>
              )}
            </div>

            {challanLines.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No PO lines added to this challan yet. Search a PO above and click{' '}
                <strong>+ Add to Challan</strong>.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {challanLines.map((line, idx) => {
                  const splitSum = line.rackSplits.reduce(
                    (s, sp) => s + (parseFloat(sp.weightKg) || 0),
                    0
                  );
                  const targetWeight = parseFloat(line.weightKg) || 0;
                  const splitMatches = Math.abs(splitSum - targetWeight) <= 0.05;

                  return (
                    <div key={line.localId} className="p-4 sm:p-5 space-y-3.5 bg-white">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs flex-wrap">
                          <span className="font-mono font-extrabold bg-slate-900 text-white px-2 py-0.5 rounded">
                            #{idx + 1}
                          </span>
                          <span className="font-extrabold font-mono text-slate-900">
                            PO {line.po}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="font-bold text-blue-800">{line.buyer}</span>
                          {line.style && (
                            <>
                              <span className="text-slate-400">·</span>
                              <span className="text-slate-700 font-semibold">{line.style}</span>
                            </>
                          )}
                          {line.requiredQtyKg > 0 && (
                            <>
                              <span className="text-slate-400">·</span>
                              <span className="font-mono tabular-nums text-emerald-700 font-bold">
                                Req: {formatKg(line.requiredQtyKg)} kg (Pending:{' '}
                                {formatKg(Math.max(0, line.requiredQtyKg - line.alreadyReceivedKg))}{' '}
                                kg)
                              </span>
                            </>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateChallanLine(line.localId, {
                                isSplitRack: !line.isSplitRack,
                                rackSplits: !line.isSplitRack
                                  ? [
                                      {
                                        rackId: line.rackId || defaultRackId,
                                        weightKg: line.weightKg,
                                        rollCount: line.rollCount,
                                      },
                                      {
                                        rackId: secondRackId || defaultRackId,
                                        weightKg: '',
                                        rollCount: '',
                                      },
                                    ]
                                  : line.rackSplits,
                              })
                            }
                            className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                              line.isSplitRack
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                            }`}
                            title="Share this fabric across multiple racks due to capacity limit"
                          >
                            <Split size={13} />
                            <span>
                              {line.isSplitRack ? 'Shared Racks Active' : 'Split Across Racks'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onRemoveChallanLine(line.localId)}
                            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-rose-500 hover:bg-rose-50 cursor-pointer"
                            title="Remove line from challan"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3 text-xs">
                        <div>
                          <label className="block font-bold text-slate-600 mb-1">
                            Fabric Type *
                          </label>
                          <input
                            type="text"
                            required
                            list="fabric-type-options"
                            value={line.fabricType}
                            onChange={(e) =>
                              onUpdateChallanLine(line.localId, { fabricType: e.target.value })
                            }
                            className="w-full min-h-[42px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-600 mb-1">Color *</label>
                          <input
                            type="text"
                            required
                            value={line.color}
                            onChange={(e) =>
                              onUpdateChallanLine(line.localId, { color: e.target.value })
                            }
                            className="w-full min-h-[42px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-600 mb-1">GSM</label>
                          <input
                            type="text"
                            value={line.gsm}
                            onChange={(e) =>
                              onUpdateChallanLine(line.localId, { gsm: e.target.value })
                            }
                            className="w-full min-h-[42px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-600 mb-1">
                            Recv Qty (kg) *
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            required
                            value={line.weightKg}
                            onChange={(e) =>
                              onUpdateChallanLine(line.localId, { weightKg: e.target.value })
                            }
                            className="w-full min-h-[42px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-600 mb-1">Rolls</label>
                          <input
                            type="number"
                            min="0"
                            value={line.rollCount}
                            onChange={(e) =>
                              onUpdateChallanLine(line.localId, { rollCount: e.target.value })
                            }
                            className="w-full min-h-[42px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-600 mb-1">Lot No *</label>
                          <input
                            type="text"
                            required
                            value={line.lotNo}
                            onChange={(e) =>
                              onUpdateChallanLine(line.localId, { lotNo: e.target.value })
                            }
                            placeholder="LOT-..."
                            className="w-full min-h-[42px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        {!line.isSplitRack ? (
                          <div>
                            <label className="block font-bold text-slate-600 mb-1">
                              Storage Rack *
                            </label>
                            <select
                              value={line.rackId}
                              onChange={(e) =>
                                onUpdateChallanLine(line.localId, { rackId: e.target.value })
                              }
                              className="w-full min-h-[42px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold outline-none focus:bg-white"
                            >
                              {activeRackSummaries.map((rs) => (
                                <option key={rs.rack.id} value={rs.rack.id}>
                                  {rs.rack.code} · {rs.rack.zone} (Free:{' '}
                                  {Math.round(rs.freeCapacityKg)} kg)
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div>
                            <label className="block font-bold text-slate-600 mb-1">Line Remark</label>
                            <input
                              type="text"
                              value={line.remark}
                              onChange={(e) =>
                                onUpdateChallanLine(line.localId, { remark: e.target.value })
                              }
                              placeholder="Note..."
                              className="w-full min-h-[42px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:bg-white"
                            />
                          </div>
                        )}
                      </div>

                      {line.isSplitRack && (
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-slate-800">
                              Shared Rack Allocation (Capacity Split)
                            </span>
                            <span
                              className={`font-mono font-extrabold ${
                                splitMatches && targetWeight > 0
                                  ? 'text-emerald-700'
                                  : 'text-amber-700'
                              }`}
                            >
                              Allocated: {formatKg(splitSum)} / {formatKg(targetWeight)} kg
                            </span>
                          </div>

                          <div className="space-y-2">
                            {line.rackSplits.map((sp, spIdx) => (
                              <div
                                key={spIdx}
                                className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                              >
                                <div className="sm:col-span-5">
                                  <select
                                    value={sp.rackId}
                                    onChange={(e) =>
                                      onUpdateChallanLineSplit(line.localId, spIdx, {
                                        rackId: e.target.value,
                                      })
                                    }
                                    className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl font-bold outline-none"
                                  >
                                    {activeRackSummaries.map((rs) => (
                                      <option key={rs.rack.id} value={rs.rack.id}>
                                        Rack {rs.rack.code} ({rs.rack.zone}) · Free{' '}
                                        {formatKg(rs.freeCapacityKg)} kg
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="sm:col-span-3">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={sp.weightKg}
                                    onChange={(e) =>
                                      onUpdateChallanLineSplit(line.localId, spIdx, {
                                        weightKg: e.target.value,
                                      })
                                    }
                                    placeholder="Weight kg"
                                    className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl font-mono font-bold outline-none"
                                  />
                                </div>
                                <div className="sm:col-span-3">
                                  <input
                                    type="number"
                                    min="0"
                                    value={sp.rollCount}
                                    onChange={(e) =>
                                      onUpdateChallanLineSplit(line.localId, spIdx, {
                                        rollCount: e.target.value,
                                      })
                                    }
                                    placeholder="Rolls"
                                    className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl font-mono outline-none"
                                  />
                                </div>
                                <div className="sm:col-span-1 text-right">
                                  {line.rackSplits.length > 2 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onUpdateChallanLine(line.localId, {
                                          rackSplits: line.rackSplits.filter((_, i) => i !== spIdx),
                                        })
                                      }
                                      className="p-2 text-rose-500 hover:text-rose-700 cursor-pointer"
                                    >
                                      <X size={15} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              onUpdateChallanLine(line.localId, {
                                rackSplits: [
                                  ...line.rackSplits,
                                  { rackId: defaultRackId, weightKg: '', rollCount: '' },
                                ],
                              })
                            }
                            className="min-h-[36px] text-xs font-bold text-blue-700 hover:underline cursor-pointer"
                          >
                            + Add Another Rack Share
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <datalist id="fabric-type-options">
              {fabricTypeSuggestions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
        </form>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900">
          Your role ({roleLabel}) has view-only access to the Receiving Register.
        </div>
      )}

      {/* Fabric Receiving Register */}
      <div className="bg-white rounded-2xl border border-slate-300 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-300 bg-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Fabric Receiving Register</h3>
            <p className="text-xs text-slate-600 mt-0.5">
              {challanGroups.length} Challan(s) · {filteredReceivingsLedger.length} Rack Batch
              Entry(ies)
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-wrap">
            <div className="flex items-center bg-white p-1 rounded-xl border border-slate-300">
              <button
                type="button"
                onClick={() => onRecRegisterViewChange('challan')}
                className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  recRegisterView === 'challan'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers size={13} />
                <span>By Challan</span>
              </button>
              <button
                type="button"
                onClick={() => onRecRegisterViewChange('items')}
                className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  recRegisterView === 'items'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <TableIcon size={13} />
                <span>All Lots</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-56">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={15}
                />
                <input
                  type="text"
                  value={recLedgerSearch}
                  onChange={(e) => onRecLedgerSearchChange(e.target.value)}
                  placeholder="Filter challan, PO, lot..."
                  className="w-full min-h-[42px] pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-[13px] outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {canExport && (
                <button
                  type="button"
                  onClick={onExportCsv}
                  className="min-h-[42px] px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Download size={14} />
                  <span>CSV</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {recRegisterView === 'challan' ? (
          <div className="divide-y divide-slate-200">
            {challanGroups.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No challan entries recorded yet.
              </div>
            ) : (
              challanGroups.map((grp) => {
                const isExpanded = expandedChallans[grp.groupKey] ?? true;
                return (
                  <div key={grp.groupKey} className="bg-white">
                    <button
                      type="button"
                      onClick={() => onToggleExpandChallan(grp.groupKey)}
                      className="w-full p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-50 text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-mono font-extrabold text-sm text-slate-900 bg-slate-100 border border-slate-300 px-2.5 py-1 rounded-lg">
                          Challan {grp.challanNo}
                        </span>
                        <span className="text-xs font-mono text-slate-600">{grp.receiveDate}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-xs font-bold text-slate-800">{grp.supplier}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-xs text-blue-800 font-semibold">
                          {grp.pos.size} PO(s): {Array.from(grp.pos).slice(0, 4).join(', ')}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-xs font-mono tabular-nums shrink-0">
                        <span>
                          Recv:{' '}
                          <strong className="text-slate-900">{formatKg(grp.totalWeightKg)} kg</strong>
                        </span>
                        <span>
                          Bal:{' '}
                          <strong className="text-emerald-700">
                            {formatKg(grp.totalBalanceKg)} kg
                          </strong>
                        </span>
                        <span className="text-slate-500 hidden sm:inline">
                          Racks: {Array.from(grp.racks).join(', ')}
                        </span>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </button>

                    {isExpanded && (
                      <>
                        {/* Mobile Cards inside Challan */}
                        <div className="md:hidden divide-y divide-slate-200 border-t border-slate-200 bg-slate-50/40">
                          {grp.items.map((r) => {
                            const palette = getZoneColorPalette(rackZoneByCode[r.rackCode] || r.rackCode);
                            return (
                              <div key={r.id} className="p-4 space-y-2.5 bg-white">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="inline-flex items-center gap-1.5 font-mono text-xs font-extrabold text-slate-900">
                                        <span className={`h-2 w-2 rounded-full ${palette.dotBg}`} />
                                        Rack {r.rackCode}
                                      </span>
                                      <span className="text-slate-400">·</span>
                                      <span className="font-mono font-extrabold text-sm text-slate-900">
                                        PO {r.po}
                                      </span>
                                    </div>
                                    <p className="text-xs font-bold text-blue-800 mt-0.5">
                                      {r.buyer} {r.style ? `· ${r.style}` : ''}
                                    </p>
                                  </div>
                                  <span className="font-mono tabular-nums text-sm font-extrabold text-emerald-700 shrink-0">
                                    {formatKg(r.availableKg)} kg
                                  </span>
                                </div>

                                <div className="text-xs text-slate-700">
                                  <span className="font-bold text-slate-900">{r.fabricType}</span> ·{' '}
                                  {r.color} ·{' '}
                                  <span className="font-mono text-slate-500">
                                    Lot {r.lotNo} {r.gsm ? `· ${r.gsm}` : ''}
                                  </span>
                                </div>

                                <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono tabular-nums">
                                  <div>
                                    <span className="text-[11px] text-slate-500 block">Req</span>
                                    <span className="font-bold text-slate-800">
                                      {r.requiredQtyKg ? `${formatKg(r.requiredQtyKg)} kg` : '-'}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[11px] text-slate-500 block">Recv</span>
                                    <span className="font-bold text-slate-900">
                                      {formatKg(r.weightKg)} kg
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[11px] text-slate-500 block">Balance</span>
                                    <span className="font-extrabold text-emerald-700">
                                      {formatKg(r.availableKg)} kg
                                    </span>
                                  </div>
                                </div>

                                {(canDeliver || canDeleteRecords) && (
                                  <div className="flex items-center gap-2 pt-0.5">
                                    {canDeliver && r.availableKg > 0.009 && (
                                      <button
                                        type="button"
                                        onClick={() => onDeliverBatch(r)}
                                        className="flex-1 min-h-[42px] px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                                      >
                                        <Truck size={14} />
                                        <span>Deliver</span>
                                      </button>
                                    )}
                                    {canDeleteRecords && (
                                      <button
                                        type="button"
                                        onClick={() => onDeleteReceivingRecord(r)}
                                        className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl border border-slate-200 text-rose-500 hover:bg-rose-50 cursor-pointer"
                                        title="Delete batch"
                                      >
                                        <Trash2 size={15} />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Desktop Table inside Challan */}
                        <div className="hidden md:block overflow-x-auto border-t border-slate-200 bg-slate-50/40">
                          <table className="w-full text-left border-collapse text-[13px]">
                            <thead className="bg-slate-100/90 text-slate-700 uppercase text-xs font-extrabold">
                              <tr>
                                <th className="p-3 border-b border-r border-slate-200">Rack</th>
                                <th className="p-3 border-b border-r border-slate-200">
                                  Buyer / PO / Style
                                </th>
                                <th className="p-3 border-b border-r border-slate-200">
                                  Fabric / Color / Lot
                                </th>
                                <th className="p-3 border-b border-r border-slate-200 text-right">
                                  Required
                                </th>
                                <th className="p-3 border-b border-r border-slate-200 text-right">
                                  Received
                                </th>
                                <th className="p-3 border-b border-r border-slate-200 text-right">
                                  Balance
                                </th>
                                <th className="p-3 border-b border-slate-200 text-center">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 bg-white">
                              {grp.items.map((r) => {
                                const palette = getZoneColorPalette(
                                  rackZoneByCode[r.rackCode] || r.rackCode
                                );
                                return (
                                  <tr key={r.id} className="hover:bg-slate-50">
                                    <td className="p-3 border-r border-slate-200 font-mono font-bold text-slate-900 whitespace-nowrap">
                                      <span className="inline-flex items-center gap-1.5">
                                        <span className={`h-2 w-2 rounded-full ${palette.dotBg}`} />
                                        Rack {r.rackCode}
                                      </span>
                                    </td>
                                    <td className="p-3 border-r border-slate-200">
                                      <span className="font-mono font-extrabold text-slate-900">
                                        PO {r.po}
                                      </span>
                                      <span className="text-slate-400 mx-1">·</span>
                                      <span className="text-blue-800 font-semibold">{r.buyer}</span>
                                      {r.style && <div className="text-xs text-slate-500">{r.style}</div>}
                                    </td>
                                    <td className="p-3 border-r border-slate-200">
                                      <span className="font-bold text-slate-800">
                                        {r.fabricType}
                                      </span>{' '}
                                      · {r.color}
                                      <div className="text-xs font-mono text-slate-500">
                                        Lot {r.lotNo} {r.gsm ? `· ${r.gsm}` : ''}
                                      </div>
                                    </td>
                                    <td className="p-3 border-r border-slate-200 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                                      {r.requiredQtyKg ? `${formatKg(r.requiredQtyKg)} kg` : '-'}
                                    </td>
                                    <td className="p-3 border-r border-slate-200 text-right font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                                      {formatKg(r.weightKg)} kg
                                    </td>
                                    <td className="p-3 border-r border-slate-200 text-right font-mono tabular-nums font-extrabold text-emerald-700 whitespace-nowrap">
                                      {formatKg(r.availableKg)} kg
                                    </td>
                                    <td className="p-3 text-center whitespace-nowrap">
                                      <div className="flex items-center justify-center gap-1.5">
                                        {canDeliver && r.availableKg > 0.009 && (
                                          <button
                                            type="button"
                                            onClick={() => onDeliverBatch(r)}
                                            className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold cursor-pointer"
                                          >
                                            Deliver
                                          </button>
                                        )}
                                        {canDeleteRecords && (
                                          <button
                                            type="button"
                                            onClick={() => onDeleteReceivingRecord(r)}
                                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer"
                                            title="Delete batch"
                                          >
                                            <Trash2 size={14} />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <>
            {/* Mobile Cards for All Lots */}
            <div className="md:hidden divide-y divide-slate-200">
              {filteredReceivingsLedger.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No fabric receiving records yet.
                </div>
              ) : (
                filteredReceivingsLedger.map((r) => {
                  const palette = getZoneColorPalette(rackZoneByCode[r.rackCode] || r.rackCode);
                  return (
                    <div key={r.id} className="p-4 space-y-2.5 bg-white">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-mono font-extrabold text-sm text-slate-900">
                            {r.challanNo} · PO {r.po}
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">
                            <span className="font-bold text-blue-800">{r.buyer}</span> ·{' '}
                            {r.style || '-'} · <span className="font-mono">{r.receiveDate}</span>
                          </div>
                        </div>
                        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-extrabold text-slate-900 shrink-0">
                          <span className={`h-2 w-2 rounded-full ${palette.dotBg}`} />
                          {r.rackCode}
                        </span>
                      </div>

                      <div className="text-xs text-slate-700">
                        <span className="font-bold text-slate-900">{r.fabricType}</span> · {r.color}{' '}
                        · <span className="font-mono text-slate-500">Lot {r.lotNo}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono tabular-nums">
                        <div>
                          <span className="text-[11px] text-slate-500 block">Received</span>
                          <span className="font-bold text-slate-900">{formatKg(r.weightKg)} kg</span>
                        </div>
                        <div>
                          <span className="text-[11px] text-slate-500 block">Balance</span>
                          <span className="font-extrabold text-emerald-700">
                            {formatKg(r.availableKg)} kg
                          </span>
                        </div>
                      </div>

                      {(canDeliver || canDeleteRecords) && (
                        <div className="flex items-center gap-2 pt-0.5">
                          {canDeliver && r.availableKg > 0.009 && (
                            <button
                              type="button"
                              onClick={() => onDeliverBatch(r)}
                              className="flex-1 min-h-[42px] px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Truck size={14} />
                              <span>Deliver</span>
                            </button>
                          )}
                          {canDeleteRecords && (
                            <button
                              type="button"
                              onClick={() => onDeleteReceivingRecord(r)}
                              className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl border border-slate-200 text-rose-500 hover:bg-rose-50 cursor-pointer"
                              title="Delete receiving entry"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Desktop Table for All Lots */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13px]">
                <thead className="bg-slate-100 text-slate-800 uppercase text-xs font-extrabold">
                  <tr>
                    <th className="p-3.5 border-b border-r border-slate-300">Date / Challan</th>
                    <th className="p-3.5 border-b border-r border-slate-300">Rack</th>
                    <th className="p-3.5 border-b border-r border-slate-300">Buyer / PO / Style</th>
                    <th className="p-3.5 border-b border-r border-slate-300">
                      Fabric / Color / Lot
                    </th>
                    <th className="p-3.5 border-b border-r border-slate-300 text-right">
                      Received
                    </th>
                    <th className="p-3.5 border-b border-r border-slate-300 text-right">Balance</th>
                    <th className="p-3.5 border-b border-slate-300 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredReceivingsLedger.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        No fabric receiving records yet.
                      </td>
                    </tr>
                  ) : (
                    filteredReceivingsLedger.map((r) => {
                      const palette = getZoneColorPalette(
                        rackZoneByCode[r.rackCode] || r.rackCode
                      );
                      return (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="p-3 border-r border-slate-200 font-mono whitespace-nowrap">
                            <div className="font-bold text-slate-900">{r.challanNo}</div>
                            <div className="text-xs text-slate-500">{r.receiveDate}</div>
                          </td>
                          <td className="p-3 border-r border-slate-200 font-mono font-bold text-slate-900 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5">
                              <span className={`h-2 w-2 rounded-full ${palette.dotBg}`} />
                              {r.rackCode}
                            </span>
                          </td>
                          <td className="p-3 border-r border-slate-200">
                            <div className="font-extrabold text-slate-900 font-mono">PO {r.po}</div>
                            <div className="text-xs text-slate-600">
                              {r.buyer} · {r.style || '-'}
                            </div>
                          </td>
                          <td className="p-3 border-r border-slate-200">
                            <div className="font-bold text-slate-800">
                              {r.fabricType} · {r.color}
                            </div>
                            <div className="text-xs font-mono text-slate-500">Lot {r.lotNo}</div>
                          </td>
                          <td className="p-3 border-r border-slate-200 text-right font-mono tabular-nums font-bold text-slate-800 whitespace-nowrap">
                            {formatKg(r.weightKg)} kg
                          </td>
                          <td className="p-3 border-r border-slate-200 text-right font-mono tabular-nums font-extrabold text-emerald-700 whitespace-nowrap">
                            {formatKg(r.availableKg)} kg
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              {canDeliver && r.availableKg > 0.009 && (
                                <button
                                  type="button"
                                  onClick={() => onDeliverBatch(r)}
                                  className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold cursor-pointer"
                                >
                                  Deliver
                                </button>
                              )}
                              {canDeleteRecords && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteReceivingRecord(r)}
                                  className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer"
                                  title="Delete receiving entry"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
