import React, { useMemo, useState } from 'react';
import {
  BookmarkCheck,
  CheckCircle2,
  Download,
  Edit3,
  Search,
  Trash2,
} from 'lucide-react';
import { FabricRequirement } from '../../firebase';
import { formatKg } from './rackZoneTheme';

export interface EnrichedBookingRequirement extends FabricRequirement {
  receivedKg: number;
  pendingKg: number;
  pct: number;
  isComplete: boolean;
}

export interface BookingOrderContext {
  buyer: string;
  po: string;
  style: string;
  itemName: string;
  fileNo: string;
  shipDate: string;
  orderDzn: string;
}

interface FabricBookingSectionProps {
  canBook: boolean;
  canDeleteRecords: boolean;
  canExport: boolean;
  sheetBuyerNames: string[];
  reqPoSearch: string;
  onReqPoSearchChange: (val: string) => void;
  reqBuyerFilter: string;
  onReqBuyerFilterChange: (val: string) => void;
  reqMatchingSheetOrders: any[];
  selectedOrderForReq: BookingOrderContext | null;
  onSelectOrderForReq: (ctx: BookingOrderContext) => void;
  reqForm: {
    fabricType: string;
    color: string;
    gsm: string;
    requiredQtyKg: string;
    supplier: string;
    remark: string;
  };
  onReqFormChange: React.Dispatch<
    React.SetStateAction<{
      fabricType: string;
      color: string;
      gsm: string;
      requiredQtyKg: string;
      supplier: string;
      remark: string;
    }>
  >;
  isSavingReq: boolean;
  onSubmitRequirement: (e: React.FormEvent) => void;
  fabricTypeSuggestions: string[];
  enrichedRequirements: EnrichedBookingRequirement[];
  reqTableSearch: string;
  onReqTableSearchChange: (val: string) => void;
  onExportCsv: (rows: EnrichedBookingRequirement[]) => void;
  onEditReqQty: (req: EnrichedBookingRequirement) => void;
  onDeleteReq: (req: EnrichedBookingRequirement) => void;
}

export function FabricBookingSection({
  canBook,
  canDeleteRecords,
  canExport,
  sheetBuyerNames,
  reqPoSearch,
  onReqPoSearchChange,
  reqBuyerFilter,
  onReqBuyerFilterChange,
  reqMatchingSheetOrders,
  selectedOrderForReq,
  onSelectOrderForReq,
  reqForm,
  onReqFormChange,
  isSavingReq,
  onSubmitRequirement,
  fabricTypeSuggestions,
  enrichedRequirements,
  reqTableSearch,
  onReqTableSearchChange,
  onExportCsv,
  onEditReqQty,
  onDeleteReq,
}: FabricBookingSectionProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'complete'>('all');

  const summary = useMemo(() => {
    const totalReq = enrichedRequirements.reduce((s, r) => s + r.requiredQtyKg, 0);
    const totalRecv = enrichedRequirements.reduce((s, r) => s + r.receivedKg, 0);
    const totalPending = enrichedRequirements.reduce((s, r) => s + r.pendingKg, 0);
    const completeCount = enrichedRequirements.filter((r) => r.isComplete).length;
    const pct = totalReq > 0 ? Math.min(100, Math.round((totalRecv / totalReq) * 100)) : 0;
    return {
      totalCount: enrichedRequirements.length,
      completeCount,
      pendingCount: enrichedRequirements.length - completeCount,
      totalReq,
      totalRecv,
      totalPending,
      pct,
    };
  }, [enrichedRequirements]);

  const filteredTable = useMemo(() => {
    const q = reqTableSearch.trim().toLowerCase();
    return enrichedRequirements.filter((r) => {
      if (statusFilter === 'pending' && r.isComplete) return false;
      if (statusFilter === 'complete' && !r.isComplete) return false;
      if (!q) return true;
      return (
        r.po.toLowerCase().includes(q) ||
        r.buyer.toLowerCase().includes(q) ||
        (r.style || '').toLowerCase().includes(q) ||
        r.fabricType.toLowerCase().includes(q) ||
        r.color.toLowerCase().includes(q) ||
        (r.supplier || '').toLowerCase().includes(q)
      );
    });
  }, [enrichedRequirements, reqTableSearch, statusFilter]);

  return (
    <div className="space-y-5">
      {/* Booking KPI Overview Hero Strip */}
      <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-4 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          <div className="lg:col-span-5 space-y-2">
            <p className="text-xs font-semibold text-teal-300">
              Pre-Receiving Fabric Booking · {summary.totalCount} Booked Line(s)
            </p>
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <span className="text-3xl sm:text-4xl font-extrabold font-mono tabular-nums tracking-tight">
                {formatKg(summary.totalReq)}
              </span>
              <span className="text-sm font-semibold text-slate-300">kg total booked</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mt-2">
              <div
                className="h-full bg-teal-400 rounded-full transition-all"
                style={{ width: `${summary.pct}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 font-mono tabular-nums">
              Fulfillment: <span className="text-teal-300 font-bold">{summary.pct}%</span> ·{' '}
              {summary.completeCount} Completed · {summary.pendingCount} Pending
            </p>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700">
              <span className="text-xs font-semibold text-slate-400 block">Received Against Booking</span>
              <span className="text-xl font-extrabold font-mono tabular-nums text-emerald-400 mt-1 block">
                {formatKg(summary.totalRecv)} kg
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700">
              <span className="text-xs font-semibold text-slate-400 block">Pending To Arrive</span>
              <span className="text-xl font-extrabold font-mono tabular-nums text-amber-400 mt-1 block">
                {formatKg(summary.totalPending)} kg
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700">
              <span className="text-xs font-semibold text-slate-400 block">Booking Status</span>
              <span className="text-xl font-extrabold font-mono tabular-nums text-white mt-1 block">
                {summary.completeCount} / {summary.totalCount}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Step 1 & Step 2 Booking Workspace */}
      {canBook && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Step 1: Pick PO from All Buyers */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-indigo-300 overflow-hidden">
            <div className="bg-indigo-800 text-white px-4 py-3.5 border-b border-indigo-900">
              <h3 className="text-sm font-extrabold">1. Select Buyer PO (All Buyers)</h3>
              <p className="text-xs text-indigo-100 mt-0.5">
                Pick a PO to pre-book fabric type, color, GSM & required kg
              </p>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <Search
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    size={15}
                  />
                  <input
                    type="text"
                    value={reqPoSearch}
                    onChange={(e) => onReqPoSearchChange(e.target.value)}
                    placeholder="Search PO, Style, File, Buyer..."
                    className="w-full min-h-[44px] pl-10 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm sm:text-xs font-medium outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <select
                  value={reqBuyerFilter}
                  onChange={(e) => onReqBuyerFilterChange(e.target.value)}
                  className="min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 sm:max-w-[150px] outline-none"
                >
                  <option value="ALL">All Buyers</option>
                  {sheetBuyerNames.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-200 border border-slate-200 rounded-xl">
                {reqMatchingSheetOrders.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No POs match "{reqPoSearch}".
                  </div>
                ) : (
                  reqMatchingSheetOrders.map((order, idx) => {
                    const poStr = String(order['PO'] || '').trim();
                    const buyerStr = String(order._tabSource || '').trim();
                    const isSelected =
                      selectedOrderForReq?.po === poStr &&
                      selectedOrderForReq?.buyer === buyerStr &&
                      selectedOrderForReq?.style === String(order['STYLE'] || '').trim();
                    const existingReqCount = enrichedRequirements.filter(
                      (r) => r.po === poStr && r.buyer === buyerStr
                    ).length;

                    return (
                      <button
                        key={`req_pick_${order._uniqueKey || idx}`}
                        type="button"
                        onClick={() =>
                          onSelectOrderForReq({
                            buyer: buyerStr,
                            po: poStr,
                            style: String(order['STYLE'] || '').trim(),
                            itemName: String(order['ITEM'] || '').trim(),
                            fileNo: String(order['File No'] || '').trim(),
                            shipDate: String(order['SHIP DATE'] || '').trim(),
                            orderDzn: String(order['DZN'] || '').trim(),
                          })
                        }
                        className={`w-full min-h-[56px] text-left p-3 transition cursor-pointer flex items-start justify-between gap-2 ${
                          isSelected ? 'bg-indigo-50' : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-xs flex-wrap">
                            <span className="font-extrabold text-slate-900 font-mono">
                              PO {poStr}
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="font-bold text-indigo-800">{buyerStr}</span>
                            {existingReqCount > 0 && (
                              <span className="text-[11px] font-bold text-emerald-700">
                                · {existingReqCount} booked
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
                          <CheckCircle2 size={17} className="text-indigo-700 shrink-0 mt-0.5" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Step 2: Enter Fabric Requirement Form */}
          <form
            onSubmit={onSubmitRequirement}
            className="lg:col-span-7 bg-white rounded-2xl border border-teal-300 overflow-hidden"
          >
            <div className="bg-teal-800 text-white px-4 sm:px-5 py-3.5 border-b border-teal-900">
              <h3 className="text-sm font-extrabold">
                2. Enter Required Fabric Specs & Quantity
              </h3>
              <p className="text-xs text-teal-100 mt-0.5">
                Auto-loads during Receiving when this PO is selected on a Challan
              </p>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              {selectedOrderForReq ? (
                <div className="p-3.5 rounded-xl bg-teal-50/70 border border-teal-200 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block">Buyer</span>
                    <span className="font-bold text-slate-900">{selectedOrderForReq.buyer}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">PO Number</span>
                    <span className="font-extrabold text-teal-900 font-mono">
                      {selectedOrderForReq.po}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Ship Date</span>
                    <span className="font-bold font-mono text-slate-800">
                      {selectedOrderForReq.shipDate || '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Style</span>
                    <span className="font-bold text-slate-800">
                      {selectedOrderForReq.style || '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Item</span>
                    <span className="font-bold text-slate-800">
                      {selectedOrderForReq.itemName || '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">File No / DZN</span>
                    <span className="font-mono font-bold text-slate-800">
                      {selectedOrderForReq.fileNo || '-'} · {selectedOrderForReq.orderDzn || '-'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-slate-300 text-xs text-slate-500 text-center bg-slate-50">
                  Select a Buyer PO from Step 1 to attach fabric requirements.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Fabric Type *
                  </label>
                  <input
                    type="text"
                    required
                    list="req-fabric-types"
                    value={reqForm.fabricType}
                    onChange={(e) =>
                      onReqFormChange((p) => ({ ...p, fabricType: e.target.value }))
                    }
                    placeholder="e.g. Single Jersey"
                    className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm sm:text-xs outline-none focus:bg-white focus:ring-2 focus:ring-teal-500"
                  />
                  <datalist id="req-fabric-types">
                    {fabricTypeSuggestions.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Color *
                  </label>
                  <input
                    type="text"
                    required
                    value={reqForm.color}
                    onChange={(e) => onReqFormChange((p) => ({ ...p, color: e.target.value }))}
                    placeholder="e.g. Navy / Black"
                    className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm sm:text-xs outline-none focus:bg-white focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">GSM</label>
                  <input
                    type="text"
                    value={reqForm.gsm}
                    onChange={(e) => onReqFormChange((p) => ({ ...p, gsm: e.target.value }))}
                    placeholder="e.g. 160 GSM"
                    className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm sm:text-xs font-mono outline-none focus:bg-white focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Required Qty (kg) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={reqForm.requiredQtyKg}
                    onChange={(e) =>
                      onReqFormChange((p) => ({ ...p, requiredQtyKg: e.target.value }))
                    }
                    placeholder="e.g. 1250.00"
                    className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm sm:text-xs font-mono font-bold outline-none focus:bg-white focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Expected Supplier
                  </label>
                  <input
                    type="text"
                    value={reqForm.supplier}
                    onChange={(e) =>
                      onReqFormChange((p) => ({ ...p, supplier: e.target.value }))
                    }
                    placeholder="Optional"
                    className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm sm:text-xs outline-none focus:bg-white focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    Note / Remark
                  </label>
                  <input
                    type="text"
                    value={reqForm.remark}
                    onChange={(e) => onReqFormChange((p) => ({ ...p, remark: e.target.value }))}
                    placeholder="Body / Neck / Rib note"
                    className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm sm:text-xs outline-none focus:bg-white focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={isSavingReq}
                  className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-teal-800 hover:bg-teal-900 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                >
                  <BookmarkCheck size={16} />
                  <span>{isSavingReq ? 'Saving Booking...' : 'Save Fabric Requirement'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Booked Fabric Requirements Tracker */}
      <div className="bg-white rounded-2xl border border-slate-300 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-300 bg-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              PO Fabric Booking & Fulfillment Tracker
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              {filteredTable.length} requirement entry(ies) shown
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-wrap">
            {/* Status Segmented Filter */}
            <div className="flex items-center bg-white p-1 rounded-xl border border-slate-300 overflow-x-auto">
              {(
                [
                  { id: 'all', label: `All (${summary.totalCount})` },
                  { id: 'pending', label: `Pending (${summary.pendingCount})` },
                  { id: 'complete', label: `Done (${summary.completeCount})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-56">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={15}
                />
                <input
                  type="text"
                  value={reqTableSearch}
                  onChange={(e) => onReqTableSearchChange(e.target.value)}
                  placeholder="Search PO, Buyer, Color..."
                  className="w-full min-h-[44px] pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-sm sm:text-xs outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {canExport && (
                <button
                  type="button"
                  onClick={() => onExportCsv(filteredTable)}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-800 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download size={14} />
                  <span>CSV</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Cards (< md) */}
        <div className="md:hidden divide-y divide-slate-200">
          {filteredTable.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No fabric requirements match your current filter.
            </div>
          ) : (
            filteredTable.map((r) => (
              <div key={r.id} className="p-4 space-y-3 bg-white">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono font-extrabold text-sm text-slate-900">
                      PO {r.po}
                    </div>
                    <div className="text-xs font-bold text-indigo-800 truncate">
                      {r.buyer} · {r.style || '-'}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500">
                      Ship: {r.shipDate || '-'} {r.supplier ? `· ${r.supplier}` : ''}
                    </div>
                  </div>
                  <span
                    className={`text-xs font-mono font-extrabold shrink-0 ${
                      r.isComplete ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {r.pct}% {r.isComplete ? 'Done' : 'Pending'}
                  </span>
                </div>

                <div className="text-xs font-bold text-slate-900">
                  {r.fabricType} · {r.color} {r.gsm ? `· ${r.gsm}` : ''}
                </div>

                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      r.isComplete ? 'bg-emerald-600' : 'bg-teal-600'
                    }`}
                    style={{ width: `${r.pct}%` }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 text-xs font-mono tabular-nums">
                  <div>
                    <span className="font-sans text-[11px] text-slate-500 block">Required</span>
                    <strong className="text-slate-900">{formatKg(r.requiredQtyKg)}</strong>
                  </div>
                  <div>
                    <span className="font-sans text-[11px] text-slate-500 block">Received</span>
                    <strong className="text-emerald-700">{formatKg(r.receivedKg)}</strong>
                  </div>
                  <div className="text-right">
                    <span className="font-sans text-[11px] text-slate-500 block">Pending</span>
                    <strong className="text-amber-700">{formatKg(r.pendingKg)}</strong>
                  </div>
                </div>

                {(canBook || canDeleteRecords) && (
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    {canBook && (
                      <button
                        type="button"
                        onClick={() => onEditReqQty(r)}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 size={13} />
                        <span>Edit Qty</span>
                      </button>
                    )}
                    {canDeleteRecords && (
                      <button
                        type="button"
                        onClick={() => onDeleteReq(r)}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 size={13} />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Desktop Table (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead className="bg-slate-100 text-slate-800 uppercase text-xs font-extrabold">
              <tr>
                <th className="p-3.5 border-b border-r border-slate-300">Buyer / PO / Style</th>
                <th className="p-3.5 border-b border-r border-slate-300">
                  Fabric Type / Color / GSM
                </th>
                <th className="p-3.5 border-b border-r border-slate-300">Supplier</th>
                <th className="p-3.5 border-b border-r border-slate-300 text-right">Required</th>
                <th className="p-3.5 border-b border-r border-slate-300 text-right">Received</th>
                <th className="p-3.5 border-b border-r border-slate-300 text-right">Pending</th>
                <th className="p-3.5 border-b border-r border-slate-300">Progress</th>
                <th className="p-3.5 border-b border-slate-300 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredTable.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500">
                    No fabric requirements match your current filter.
                  </td>
                </tr>
              ) : (
                filteredTable.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="p-3 border-r border-slate-200">
                      <div className="font-extrabold text-slate-900 font-mono">PO {r.po}</div>
                      <div className="text-slate-700 font-semibold">
                        {r.buyer} · {r.style || '-'}
                      </div>
                      <div className="text-xs text-slate-400">Ship: {r.shipDate || '-'}</div>
                    </td>
                    <td className="p-3 border-r border-slate-200">
                      <div className="font-bold text-slate-900">{r.fabricType}</div>
                      <div className="text-slate-600">
                        {r.color} {r.gsm ? `· ${r.gsm}` : ''}
                      </div>
                    </td>
                    <td className="p-3 border-r border-slate-200 text-slate-700">
                      {r.supplier || '-'}
                    </td>
                    <td className="p-3 border-r border-slate-200 text-right font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                      {formatKg(r.requiredQtyKg)} kg
                    </td>
                    <td className="p-3 border-r border-slate-200 text-right font-mono tabular-nums font-bold text-emerald-700 whitespace-nowrap">
                      {formatKg(r.receivedKg)} kg
                    </td>
                    <td className="p-3 border-r border-slate-200 text-right font-mono tabular-nums font-extrabold text-amber-700 whitespace-nowrap">
                      {formatKg(r.pendingKg)} kg
                    </td>
                    <td className="p-3 border-r border-slate-200 min-w-[120px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              r.isComplete ? 'bg-emerald-600' : 'bg-teal-600'
                            }`}
                            style={{ width: `${r.pct}%` }}
                          />
                        </div>
                        <span className="font-mono font-bold text-slate-700 text-xs">
                          {r.pct}%
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        {canBook && (
                          <button
                            type="button"
                            onClick={() => onEditReqQty(r)}
                            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
                            title="Edit required qty"
                          >
                            <Edit3 size={14} />
                          </button>
                        )}
                        {canDeleteRecords && (
                          <button
                            type="button"
                            onClick={() => onDeleteReq(r)}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer"
                            title="Delete booking"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
