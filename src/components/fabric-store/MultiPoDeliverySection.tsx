import React, { useMemo, useState } from 'react';
import {
  Search,
  Truck,
  Layers,
  Table as TableIcon,
  Download,
  Printer,
  Trash2,
  X,
  Plus,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Warehouse,
} from 'lucide-react';
import { FabricDelivery, FabricReceiving } from '../../firebase';
import { getZoneColorPalette } from './rackZoneTheme';

export type EnrichedReceivingBatch = FabricReceiving & {
  deliveredKg: number;
  availableKg: number;
  availableRolls: number;
  deliveryCount: number;
  status: 'Available' | 'Partial' | 'Exhausted';
};

export interface DeliveryQueueLine {
  localId: string;
  batchId: string;
  mode: 'Full' | 'Partial';
  weightKg: string;
  rollCount: string;
}

interface MultiPoDeliverySectionProps {
  enrichedReceivings: EnrichedReceivingBatch[];
  deliveries: FabricDelivery[];
  lineNames: string[];
  canDeliver: boolean;
  canDeleteRecords: boolean;
  canExportData: boolean;
  roleLabel: string;
  deliveryQueue: DeliveryQueueLine[];
  setDeliveryQueue: React.Dispatch<React.SetStateAction<DeliveryQueueLine[]>>;
  delPoSearch: string;
  setDelPoSearch: React.Dispatch<React.SetStateAction<string>>;
  onSubmitDeliveryBatch: (params: {
    supplyNo: string;
    deliveryDate: string;
    issuedTo: string;
    receiverName: string;
    remark: string;
    lines: Array<{
      batch: EnrichedReceivingBatch;
      mode: 'Full' | 'Partial';
      weightKg: number;
      rollCount: number;
    }>;
  }) => Promise<boolean>;
  onDeleteDeliveryRecord: (del: FabricDelivery) => Promise<void>;
  onShowToast: (type: 'success' | 'error', text: string) => void;
  rackZoneByCode?: Record<string, string>;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const fmtKg = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const exportCsvFile = (filename: string, headers: string[], rows: (string | number)[][]) => {
  const escapeCell = (val: string | number) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csv = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const MultiPoDeliverySection: React.FC<MultiPoDeliverySectionProps> = ({
  enrichedReceivings,
  deliveries,
  lineNames,
  canDeliver,
  canDeleteRecords,
  canExportData,
  roleLabel,
  deliveryQueue,
  setDeliveryQueue,
  delPoSearch,
  setDelPoSearch,
  onSubmitDeliveryBatch,
  onDeleteDeliveryRecord,
  onShowToast,
  rackZoneByCode = {},
}) => {
  const [delShowExhausted, setDelShowExhausted] = useState(false);
  const [pickerViewMode, setPickerViewMode] = useState<'by_po' | 'by_lot'>('by_po');
  const [supplyHeader, setSupplyHeader] = useState({
    supplyNo: '',
    deliveryDate: todayISO(),
    issuedTo: 'Cutting Floor',
    receiverName: '',
    remark: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Register state
  const [registerView, setRegisterView] = useState<'slip' | 'lines'>('slip');
  const [delHistorySearch, setDelHistorySearch] = useState('');
  const [expandedSlips, setExpandedSlips] = useState<Record<string, boolean>>({});
  const [printSlipItems, setPrintSlipItems] = useState<FabricDelivery[] | null>(null);

  const suggestSupplyNo = () => {
    const datePart = todayISO().replace(/-/g, '').slice(2);
    const seq = String(deliveries.length + 1).padStart(3, '0');
    return `SUP-${datePart}-${seq}`;
  };

  const batchById = useMemo(() => {
    const m = new Map<string, EnrichedReceivingBatch>();
    enrichedReceivings.forEach((b) => m.set(b.id, b));
    return m;
  }, [enrichedReceivings]);

  const queuedBatchIds = useMemo(
    () => new Set(deliveryQueue.map((q) => q.batchId)),
    [deliveryQueue]
  );

  const deliveryCandidateBatches = useMemo(() => {
    const q = delPoSearch.trim().toLowerCase();
    return enrichedReceivings.filter((r) => {
      if (!delShowExhausted && r.availableKg <= 0.009) return false;
      if (!q) return true;
      return (
        r.po.toLowerCase().includes(q) ||
        r.buyer.toLowerCase().includes(q) ||
        (r.style || '').toLowerCase().includes(q) ||
        (r.fileNo || '').toLowerCase().includes(q) ||
        r.lotNo.toLowerCase().includes(q) ||
        r.challanNo.toLowerCase().includes(q) ||
        r.color.toLowerCase().includes(q) ||
        r.rackCode.toLowerCase().includes(q) ||
        r.fabricType.toLowerCase().includes(q)
      );
    });
  }, [enrichedReceivings, delPoSearch, delShowExhausted]);

  // Group candidate batches by PO so multi-rack selection for a single PO is effortless
  const groupedPoCandidates = useMemo(() => {
    const map = new Map<
      string,
      {
        poKey: string;
        buyer: string;
        po: string;
        style: string;
        itemName: string;
        shipDate: string;
        totalAvailableKg: number;
        racks: Set<string>;
        batches: EnrichedReceivingBatch[];
      }
    >();

    deliveryCandidateBatches.forEach((b) => {
      const poKey = `${b.buyer}:::${b.po}`;
      const existing = map.get(poKey) || {
        poKey,
        buyer: b.buyer,
        po: b.po,
        style: b.style || '-',
        itemName: b.itemName || '-',
        shipDate: b.shipDate || '-',
        totalAvailableKg: 0,
        racks: new Set<string>(),
        batches: [],
      };
      existing.totalAvailableKg += b.availableKg;
      if (b.availableKg > 0.009) existing.racks.add(b.rackCode);
      existing.batches.push(b);
      map.set(poKey, existing);
    });

    return Array.from(map.values());
  }, [deliveryCandidateBatches]);

  const ensureSupplyNoPopulated = () => {
    if (!supplyHeader.supplyNo.trim()) {
      setSupplyHeader((prev) => ({
        ...prev,
        supplyNo: suggestSupplyNo(),
      }));
    }
  };

  const addBatchToQueue = (batch: EnrichedReceivingBatch, mode: 'Full' | 'Partial') => {
    if (batch.availableKg <= 0.009) return;
    ensureSupplyNoPopulated();
    setDeliveryQueue((prev) => {
      const existingIdx = prev.findIndex((item) => item.batchId === batch.id);
      if (existingIdx >= 0) {
        return prev.map((item, idx) =>
          idx === existingIdx
            ? {
                ...item,
                mode,
                weightKg: mode === 'Full' ? String(batch.availableKg) : item.weightKg,
                rollCount:
                  mode === 'Full' && batch.availableRolls > 0
                    ? String(batch.availableRolls)
                    : item.rollCount,
              }
            : item
        );
      }
      return [
        ...prev,
        {
          localId: `dq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          batchId: batch.id,
          mode,
          weightKg: mode === 'Full' ? String(batch.availableKg) : '',
          rollCount:
            mode === 'Full' && batch.availableRolls > 0 ? String(batch.availableRolls) : '',
        },
      ];
    });
  };

  const addAllRacksForPo = (
    batches: EnrichedReceivingBatch[],
    mode: 'Full' | 'Partial'
  ) => {
    const available = batches.filter((b) => b.availableKg > 0.009);
    if (available.length === 0) return;
    ensureSupplyNoPopulated();
    setDeliveryQueue((prev) => {
      const existingMap = new Map(prev.map((p) => [p.batchId, p]));
      available.forEach((batch) => {
        if (!existingMap.has(batch.id)) {
          existingMap.set(batch.id, {
            localId: `dq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${batch.rackCode}`,
            batchId: batch.id,
            mode,
            weightKg: mode === 'Full' ? String(batch.availableKg) : '',
            rollCount:
              mode === 'Full' && batch.availableRolls > 0 ? String(batch.availableRolls) : '',
          });
        } else if (mode === 'Full') {
          const cur = existingMap.get(batch.id)!;
          existingMap.set(batch.id, {
            ...cur,
            mode: 'Full',
            weightKg: String(batch.availableKg),
            rollCount: batch.availableRolls > 0 ? String(batch.availableRolls) : cur.rollCount,
          });
        }
      });
      return Array.from(existingMap.values());
    });
    onShowToast(
      'success',
      `Added ${available.length} rack lot(s) for PO ${available[0].po} to Supply Queue.`
    );
  };

  const updateQueueLine = (localId: string, patch: Partial<DeliveryQueueLine>) => {
    setDeliveryQueue((prev) => prev.map((q) => (q.localId === localId ? { ...q, ...patch } : q)));
  };

  const queueTotals = useMemo(() => {
    const pos = new Set<string>();
    const racks = new Set<string>();
    let totalWeightKg = 0;
    let totalRolls = 0;

    deliveryQueue.forEach((line) => {
      const b = batchById.get(line.batchId);
      if (b) {
        pos.add(b.po);
        racks.add(b.rackCode);
      }
      totalWeightKg += parseFloat(line.weightKg) || 0;
      totalRolls += parseInt(line.rollCount || '0', 10) || 0;
    });

    return {
      lineCount: deliveryQueue.length,
      poCount: pos.size,
      rackCount: racks.size,
      totalWeightKg,
      totalRolls,
    };
  }, [deliveryQueue, batchById]);

  const handleSubmitQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canDeliver) return;
    if (!supplyHeader.supplyNo.trim() || !supplyHeader.issuedTo.trim()) {
      onShowToast('error', 'Supply / Issue No and Issued To destination are required.');
      return;
    }
    if (deliveryQueue.length === 0) {
      onShowToast('error', 'Add at least one PO / Rack lot to the Supply Queue first.');
      return;
    }

    const preparedLines: Array<{
      batch: EnrichedReceivingBatch;
      mode: 'Full' | 'Partial';
      weightKg: number;
      rollCount: number;
    }> = [];

    for (let i = 0; i < deliveryQueue.length; i++) {
      const qLine = deliveryQueue[i];
      const batch = batchById.get(qLine.batchId);
      if (!batch) {
        onShowToast('error', `Line #${i + 1}: Stock batch is no longer available.`);
        return;
      }
      const w = parseFloat(qLine.weightKg);
      if (!Number.isFinite(w) || w <= 0) {
        onShowToast(
          'error',
          `Line #${i + 1} (PO ${batch.po} · Rack ${batch.rackCode}): Enter a positive delivery weight (kg).`
        );
        return;
      }
      if (w > batch.availableKg + 0.009) {
        onShowToast(
          'error',
          `Line #${i + 1} (PO ${batch.po} · Rack ${batch.rackCode}): ${w.toFixed(
            2
          )} kg exceeds balance ${batch.availableKg.toFixed(2)} kg.`
        );
        return;
      }
      const effectiveMode: 'Full' | 'Partial' =
        w >= batch.availableKg - 0.01 ? 'Full' : qLine.mode;
      preparedLines.push({
        batch,
        mode: effectiveMode,
        weightKg: Number(w.toFixed(2)),
        rollCount: parseInt(qLine.rollCount || '0', 10) || 0,
      });
    }

    setIsSubmitting(true);
    try {
      const ok = await onSubmitDeliveryBatch({
        supplyNo: supplyHeader.supplyNo.trim(),
        deliveryDate: supplyHeader.deliveryDate || todayISO(),
        issuedTo: supplyHeader.issuedTo.trim(),
        receiverName: supplyHeader.receiverName.trim(),
        remark: supplyHeader.remark.trim(),
        lines: preparedLines,
      });
      if (ok) {
        setDeliveryQueue([]);
        setSupplyHeader((prev) => ({
          ...prev,
          supplyNo: '',
          receiverName: '',
          remark: '',
        }));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delivery Register filtering & grouping by Supply Slip
  const filteredDeliveriesHistory = useMemo(() => {
    const q = delHistorySearch.trim().toLowerCase();
    if (!q) return deliveries;
    return deliveries.filter(
      (d) =>
        d.supplyNo.toLowerCase().includes(q) ||
        d.po.toLowerCase().includes(q) ||
        d.buyer.toLowerCase().includes(q) ||
        (d.style || '').toLowerCase().includes(q) ||
        (d.lotNo || '').toLowerCase().includes(q) ||
        (d.rackCode || '').toLowerCase().includes(q) ||
        d.issuedTo.toLowerCase().includes(q) ||
        (d.receiverName || '').toLowerCase().includes(q)
    );
  }, [deliveries, delHistorySearch]);

  const supplySlipGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        groupKey: string;
        supplyNo: string;
        deliveryDate: string;
        issuedTo: string;
        receiverName: string;
        createdBy: string;
        remark: string;
        totalWeightKg: number;
        totalRolls: number;
        pos: Set<string>;
        buyers: Set<string>;
        racks: Set<string>;
        items: FabricDelivery[];
      }
    >();

    filteredDeliveriesHistory.forEach((d) => {
      const groupKey = d.supplyGroupId || `${d.supplyNo}__${d.deliveryDate}__${d.issuedTo}`;
      const existing = map.get(groupKey) || {
        groupKey,
        supplyNo: d.supplyNo,
        deliveryDate: d.deliveryDate,
        issuedTo: d.issuedTo,
        receiverName: d.receiverName || '',
        createdBy: d.createdBy,
        remark: d.remark || '',
        totalWeightKg: 0,
        totalRolls: 0,
        pos: new Set<string>(),
        buyers: new Set<string>(),
        racks: new Set<string>(),
        items: [],
      };
      existing.totalWeightKg += Number(d.weightKg) || 0;
      existing.totalRolls += Number(d.rollCount) || 0;
      existing.pos.add(d.po);
      existing.buyers.add(d.buyer);
      if (d.rackCode) existing.racks.add(d.rackCode);
      existing.items.push(d);
      map.set(groupKey, existing);
    });

    return Array.from(map.values());
  }, [filteredDeliveriesHistory]);

  const kpi = useMemo(() => {
    const totalIssuedKg = deliveries.reduce((s, d) => s + (Number(d.weightKg) || 0), 0);
    const availableReadyKg = enrichedReceivings.reduce((s, r) => s + r.availableKg, 0);
    const readyLotsCount = enrichedReceivings.filter((r) => r.availableKg > 0.009).length;
    const allSlipsCount = new Set(
      deliveries.map((d) => d.supplyGroupId || `${d.supplyNo}__${d.deliveryDate}__${d.issuedTo}`)
    ).size;
    return {
      allSlipsCount,
      totalIssuedKg,
      availableReadyKg,
      readyLotsCount,
    };
  }, [deliveries, enrichedReceivings]);

  return (
    <div className="space-y-5">
      {/* Delivery Hero KPI Overview Strip */}
      <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-4 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          <div className="lg:col-span-5 space-y-1.5">
            <p className="text-xs font-semibold text-sky-300">
              Multi-PO & Multi-Rack Fabric Delivery · {kpi.allSlipsCount} Supply Slip(s)
            </p>
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <span className="text-3xl sm:text-4xl font-extrabold font-mono tabular-nums tracking-tight">
                {fmtKg(kpi.totalIssuedKg)}
              </span>
              <span className="text-sm font-semibold text-slate-300">kg total issued</span>
            </div>
            <p className="text-xs text-slate-400 font-mono tabular-nums">
              {deliveries.length} Issued Line(s) · {kpi.readyLotsCount} Rack Lot(s) Ready for Issue
            </p>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700">
              <span className="text-xs font-semibold text-slate-400 block">
                Stock Ready In Racks
              </span>
              <span className="text-xl font-extrabold font-mono tabular-nums text-emerald-400 mt-1 block">
                {fmtKg(kpi.availableReadyKg)} kg
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700">
              <span className="text-xs font-semibold text-slate-400 block">Supply Slips</span>
              <span className="text-xl font-extrabold font-mono tabular-nums text-white mt-1 block">
                {kpi.allSlipsCount}
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700">
              <span className="text-xs font-semibold text-slate-400 block">Active Issue Queue</span>
              <span className="text-xl font-extrabold font-mono tabular-nums text-sky-400 mt-1 block">
                {queueTotals.lineCount} · {fmtKg(queueTotals.totalWeightKg)} kg
              </span>
            </div>
          </div>
        </div>
      </div>

      {canDeliver ? (
        <form onSubmit={handleSubmitQueue} className="space-y-5">
          {/* Step 1: Shared Supply Dispatch Header */}
          <div className="bg-white rounded-2xl border border-slate-300 overflow-hidden">
            <div className="bg-blue-800 text-white px-4 py-3.5 border-b border-blue-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold">
                  1. Supply Dispatch Header (Multi-PO & Multi-Rack Delivery)
                </h3>
                <p className="text-xs text-blue-100 mt-0.5">
                  Select multiple POs and multiple racks for the same PO under a single Supply No
                </p>
              </div>
              <span className="text-xs font-mono font-extrabold bg-blue-950/60 text-blue-100 px-3 py-1.5 rounded-xl shrink-0">
                {queueTotals.poCount} PO · {queueTotals.rackCount} Rack · {queueTotals.lineCount} Line ·{' '}
                <span className="text-white">{fmtKg(queueTotals.totalWeightKg)} kg</span>
              </span>
            </div>

            <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                  Supply / Issue No *
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    required
                    value={supplyHeader.supplyNo}
                    onChange={(e) => setSupplyHeader((p) => ({ ...p, supplyNo: e.target.value }))}
                    placeholder="e.g. SUP-261117-001"
                    className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-[13px] font-mono font-bold focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setSupplyHeader((p) => ({ ...p, supplyNo: suggestSupplyNo() }))
                    }
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 shrink-0 cursor-pointer"
                    title="Auto-generate Supply No"
                  >
                    Auto
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                  Delivery Date *
                </label>
                <input
                  type="date"
                  required
                  value={supplyHeader.deliveryDate}
                  onChange={(e) =>
                    setSupplyHeader((p) => ({ ...p, deliveryDate: e.target.value }))
                  }
                  className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-[13px] font-mono focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                  Issued To (Floor / Line) *
                </label>
                <input
                  type="text"
                  required
                  list="multi-issue-destination-options"
                  value={supplyHeader.issuedTo}
                  onChange={(e) => setSupplyHeader((p) => ({ ...p, issuedTo: e.target.value }))}
                  placeholder="Cutting Floor / Line 05..."
                  className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-[13px] font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <datalist id="multi-issue-destination-options">
                  <option value="Cutting Floor" />
                  <option value="Sample Section" />
                  <option value="Finishing / Rib Cutting" />
                  {lineNames.map((l) => (
                    <option key={l} value={l} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                  Receiver Name
                </label>
                <input
                  type="text"
                  value={supplyHeader.receiverName}
                  onChange={(e) =>
                    setSupplyHeader((p) => ({ ...p, receiverName: e.target.value }))
                  }
                  placeholder="Cutting supervisor"
                  className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-[13px] focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                  Delivery Remark
                </label>
                <input
                  type="text"
                  value={supplyHeader.remark}
                  onChange={(e) => setSupplyHeader((p) => ({ ...p, remark: e.target.value }))}
                  placeholder="Requisition / batch note"
                  className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-[13px] focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Step 2 & Step 3: Picker (Left) + Multi-PO/Multi-Rack Queue (Right) */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
            {/* Left: Stock Picker (Grouped by PO for Multi-Rack, or All Lots) */}
            <div className="xl:col-span-5 bg-white rounded-2xl border border-slate-300 overflow-hidden">
              <div className="bg-slate-800 text-white px-4 py-3.5 border-b border-slate-900 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold">
                    2. Select POs & Racks to Issue
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Add multiple POs or all racks sharing one PO
                  </p>
                </div>

                <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setPickerViewMode('by_po')}
                    className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap shrink-0 ${
                      pickerViewMode === 'by_po'
                        ? 'bg-white text-slate-900'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    By PO
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickerViewMode('by_lot')}
                    className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap shrink-0 ${
                      pickerViewMode === 'by_lot'
                        ? 'bg-white text-slate-900'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    All Lots
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-3.5">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      size={15}
                    />
                    <input
                      type="text"
                      value={delPoSearch}
                      onChange={(e) => setDelPoSearch(e.target.value)}
                      placeholder="Search PO, Buyer, Rack, Lot, Color..."
                      className="w-full min-h-[44px] pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-[13px] font-medium focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <label className="min-h-[44px] px-2.5 flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer shrink-0 border border-slate-200 rounded-xl bg-slate-50">
                    <input
                      type="checkbox"
                      checked={delShowExhausted}
                      onChange={(e) => setDelShowExhausted(e.target.checked)}
                      className="rounded border-slate-400"
                    />
                    <span>0 kg</span>
                  </label>
                </div>

                <div className="max-h-[540px] overflow-y-auto space-y-2.5 pr-1">
                  {deliveryCandidateBatches.length === 0 ? (
                    <div className="p-8 rounded-xl border border-dashed border-slate-300 text-center text-[13px] text-slate-500">
                      No available fabric lots match &quot;{delPoSearch}&quot;.
                    </div>
                  ) : pickerViewMode === 'by_po' ? (
                    groupedPoCandidates.map((poGroup) => {
                      const activeBatches = poGroup.batches.filter((b) => b.availableKg > 0.009);
                      return (
                        <div
                          key={poGroup.poKey}
                          className="rounded-xl border border-slate-300 overflow-hidden bg-white"
                        >
                          <div className="px-3.5 py-2.5 bg-slate-100 border-b border-slate-300 flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono font-extrabold text-sm text-slate-900">
                                  PO {poGroup.po}
                                </span>
                                <span className="text-xs font-extrabold text-blue-800">
                                  {poGroup.buyer}
                                </span>
                                <span className="text-xs font-mono font-bold text-emerald-800">
                                  ({fmtKg(poGroup.totalAvailableKg)} kg across {poGroup.racks.size}{' '}
                                  rack{poGroup.racks.size === 1 ? '' : 's'})
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 truncate mt-0.5">
                                {poGroup.style} · {poGroup.itemName}
                              </p>
                            </div>

                            {activeBatches.length > 0 && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => addAllRacksForPo(activeBatches, 'Partial')}
                                  className="min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-400 bg-white hover:bg-slate-50 text-slate-800 text-xs font-extrabold cursor-pointer flex items-center gap-1 whitespace-nowrap"
                                  title="Stage all racks of this PO for Partial entry"
                                >
                                  <Plus size={12} />
                                  <span>Add All ({activeBatches.length})</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => addAllRacksForPo(activeBatches, 'Full')}
                                  className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold cursor-pointer whitespace-nowrap"
                                  title="Stage all racks of this PO with Full balance"
                                >
                                  Full All
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="divide-y divide-slate-200">
                            {poGroup.batches.map((batch) => {
                              const isQueued = queuedBatchIds.has(batch.id);
                              const palette = getZoneColorPalette(
                                rackZoneByCode[batch.rackCode] || batch.rackCode
                              );
                              return (
                                <div
                                  key={batch.id}
                                  className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                                    isQueued ? 'bg-blue-50/70' : 'bg-white hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 text-xs flex-wrap">
                                      <span className="inline-flex items-center gap-1.5 font-mono font-extrabold px-2 py-0.5 rounded bg-slate-900 text-white">
                                        <span className={`h-2 w-2 rounded-full ${palette.dotBg}`} />
                                        Rack {batch.rackCode}
                                      </span>
                                      <span className="font-bold text-slate-900">
                                        {batch.fabricType} · {batch.color}
                                      </span>
                                      {isQueued && (
                                        <span className="text-[11px] font-extrabold text-blue-700 flex items-center gap-0.5">
                                          <CheckCircle2 size={12} /> Queued
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs font-mono text-slate-600 mt-1">
                                      Lot <strong>{batch.lotNo}</strong> · Ch {batch.challanNo} ·
                                      Bal:{' '}
                                      <strong className="text-emerald-700 text-[13px]">
                                        {fmtKg(batch.availableKg)} kg
                                      </strong>
                                    </p>
                                  </div>

                                  {batch.availableKg > 0.009 ? (
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => addBatchToQueue(batch, 'Partial')}
                                        className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold cursor-pointer whitespace-nowrap"
                                      >
                                        + Partial
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => addBatchToQueue(batch, 'Full')}
                                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                                      >
                                        + Full
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-xs font-bold text-slate-400">
                                      Exhausted
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="divide-y divide-slate-200 border border-slate-300 rounded-xl overflow-hidden">
                      {deliveryCandidateBatches.map((batch) => {
                        const isQueued = queuedBatchIds.has(batch.id);
                        const palette = getZoneColorPalette(
                          rackZoneByCode[batch.rackCode] || batch.rackCode
                        );
                        return (
                          <div
                            key={batch.id}
                            className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                              isQueued ? 'bg-blue-50/70' : 'bg-white hover:bg-slate-50'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-xs flex-wrap">
                                <span className="font-extrabold text-slate-900 font-mono text-[13px]">
                                  PO {batch.po}
                                </span>
                                <span className="font-bold text-blue-800">{batch.buyer}</span>
                                <span className="inline-flex items-center gap-1.5 font-mono font-extrabold px-2 py-0.5 rounded bg-slate-900 text-white">
                                  <span className={`h-2 w-2 rounded-full ${palette.dotBg}`} />
                                  Rack {batch.rackCode}
                                </span>
                                {isQueued && (
                                  <span className="text-[11px] font-extrabold text-blue-700 flex items-center gap-0.5">
                                    <CheckCircle2 size={12} /> Queued
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-semibold text-slate-800 mt-1">
                                {batch.fabricType} · {batch.color}{' '}
                                {batch.gsm ? `· ${batch.gsm}` : ''}
                              </p>
                              <p className="text-xs text-slate-600 font-mono mt-0.5">
                                Lot {batch.lotNo} · Bal:{' '}
                                <strong className="text-emerald-700">
                                  {fmtKg(batch.availableKg)} kg
                                </strong>
                              </p>
                            </div>

                            {batch.availableKg > 0.009 ? (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => addBatchToQueue(batch, 'Partial')}
                                  className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold cursor-pointer whitespace-nowrap"
                                >
                                  + Partial
                                </button>
                                <button
                                  type="button"
                                  onClick={() => addBatchToQueue(batch, 'Full')}
                                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                                >
                                  + Full
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs font-bold text-slate-400">Exhausted</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Active Multi-PO & Multi-Rack Delivery Queue */}
            <div className="xl:col-span-7 bg-white rounded-2xl border border-slate-300 overflow-hidden">
              <div className="bg-indigo-800 text-white px-4 py-3.5 border-b border-indigo-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold">
                    3. Active Supply Queue ({deliveryQueue.length} Item
                    {deliveryQueue.length === 1 ? '' : 's'})
                  </h3>
                  <p className="text-xs text-indigo-100 mt-0.5">
                    Adjust Partial or Full weight per PO & Rack row, then issue together
                  </p>
                </div>

                {deliveryQueue.length > 0 && (
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setDeliveryQueue([])}
                      className="min-h-[42px] px-3.5 py-2 rounded-xl border border-indigo-400/50 bg-indigo-900/50 hover:bg-rose-600 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                    >
                      Clear Queue
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="min-h-[42px] px-5 py-2 bg-white hover:bg-indigo-50 text-indigo-950 text-xs font-extrabold rounded-xl transition cursor-pointer disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                    >
                      <Truck size={15} />
                      <span>
                        {isSubmitting
                          ? 'Issuing Supply...'
                          : `Confirm Supply (${fmtKg(queueTotals.totalWeightKg)} kg)`}
                      </span>
                    </button>
                  </div>
                )}
              </div>

              {deliveryQueue.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <Warehouse size={28} className="mx-auto text-slate-400" />
                  <p className="text-sm font-bold text-slate-700">Supply queue is empty</p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Select one or more POs on the left. For a PO stored across shared racks, click{' '}
                    <strong>Add All</strong> or select individual rack lots.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-300">
                  {deliveryQueue.map((line, idx) => {
                    const batch = batchById.get(line.batchId);
                    if (!batch) return null;
                    const palette = getZoneColorPalette(
                      rackZoneByCode[batch.rackCode] || batch.rackCode
                    );
                    const enteredWeight = parseFloat(line.weightKg);
                    const remainingAfter = Number.isFinite(enteredWeight)
                      ? Math.max(0, batch.availableKg - enteredWeight)
                      : batch.availableKg;
                    const exceeds =
                      Number.isFinite(enteredWeight) && enteredWeight > batch.availableKg + 0.009;

                    return (
                      <div key={line.localId} className="p-4 space-y-3 bg-white">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap text-xs">
                            <span className="font-mono font-extrabold bg-slate-900 text-white px-2 py-0.5 rounded">
                              #{idx + 1}
                            </span>
                            <span className="font-mono font-extrabold text-sm text-slate-900">
                              PO {batch.po}
                            </span>
                            <span className="font-extrabold text-blue-800">{batch.buyer}</span>
                            <span className="inline-flex items-center gap-1.5 font-mono font-extrabold px-2 py-0.5 rounded bg-slate-100 text-slate-900 border border-slate-300">
                              <span className={`h-2 w-2 rounded-full ${palette.dotBg}`} />
                              Rack {batch.rackCode}
                            </span>
                            <span className="font-mono text-slate-600">
                              Lot <strong>{batch.lotNo}</strong>
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-300 text-xs font-bold">
                              <button
                                type="button"
                                onClick={() =>
                                  updateQueueLine(line.localId, { mode: 'Partial' })
                                }
                                className={`min-h-[34px] px-2.5 py-1 rounded-md cursor-pointer ${
                                  line.mode === 'Partial'
                                    ? 'bg-white text-amber-800 shadow-2xs'
                                    : 'text-slate-600'
                                }`}
                              >
                                Partial
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateQueueLine(line.localId, {
                                    mode: 'Full',
                                    weightKg: String(batch.availableKg),
                                    rollCount:
                                      batch.availableRolls > 0
                                        ? String(batch.availableRolls)
                                        : line.rollCount,
                                  })
                                }
                                className={`min-h-[34px] px-2.5 py-1 rounded-md cursor-pointer whitespace-nowrap ${
                                  line.mode === 'Full'
                                    ? 'bg-emerald-700 text-white shadow-2xs'
                                    : 'text-slate-600'
                                }`}
                              >
                                Full ({fmtKg(batch.availableKg)} kg)
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                setDeliveryQueue((prev) =>
                                  prev.filter((q) => q.localId !== line.localId)
                                )
                              }
                              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                              title="Remove from supply queue"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end text-xs">
                          <div className="sm:col-span-5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                            <div className="font-bold text-slate-900">
                              {batch.fabricType} · {batch.color} {batch.gsm ? `(${batch.gsm})` : ''}
                            </div>
                            <div className="font-mono text-slate-600 mt-0.5">
                              Style: {batch.style || '-'} · Avail:{' '}
                              <strong className="text-emerald-700">
                                {fmtKg(batch.availableKg)} kg
                              </strong>
                            </div>
                          </div>

                          <div className="sm:col-span-4">
                            <label className="block font-extrabold text-slate-700 mb-1">
                              Issue Weight (kg) *
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              max={batch.availableKg}
                              required
                              value={line.weightKg}
                              onChange={(e) => {
                                const val = e.target.value;
                                const num = parseFloat(val);
                                const nextMode: 'Full' | 'Partial' =
                                  Number.isFinite(num) && Math.abs(num - batch.availableKg) <= 0.01
                                    ? 'Full'
                                    : 'Partial';
                                updateQueueLine(line.localId, {
                                  weightKg: val,
                                  mode: nextMode,
                                });
                              }}
                              placeholder={`Max ${fmtKg(batch.availableKg)}`}
                              className={`w-full min-h-[42px] px-3 py-2 border rounded-xl text-[13px] font-mono font-extrabold outline-none ${
                                exceeds
                                  ? 'bg-rose-50 border-rose-500 text-rose-800'
                                  : 'bg-slate-50 border-slate-300 focus:bg-white focus:ring-2 focus:ring-blue-500'
                              }`}
                            />
                            <p className="text-[11px] font-mono mt-1 text-slate-600">
                              Bal after issue:{' '}
                              <strong className={exceeds ? 'text-rose-700' : 'text-slate-900'}>
                                {exceeds ? 'Exceeds stock!' : `${fmtKg(remainingAfter)} kg`}
                              </strong>
                            </p>
                          </div>

                          <div className="sm:col-span-3">
                            <label className="block font-extrabold text-slate-700 mb-1">
                              Rolls Issued
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={line.rollCount}
                              onChange={(e) =>
                                updateQueueLine(line.localId, { rollCount: e.target.value })
                              }
                              placeholder="0"
                              className="w-full min-h-[42px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-[13px] font-mono focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </form>
      ) : (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-[13px] font-semibold text-amber-900">
          Your role ({roleLabel}) has view-only access to the Delivery Register.
        </div>
      )}

      {/* Delivery / Supply Register */}
      <div className="bg-white rounded-2xl border border-slate-300 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-300 bg-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              Fabric Delivery / Supply Register
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              {supplySlipGroups.length} Supply Slip(s) · {filteredDeliveriesHistory.length} Line
              Transaction(s)
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-wrap">
            <div className="flex items-center bg-white p-1 rounded-xl border border-slate-300">
              <button
                type="button"
                onClick={() => setRegisterView('slip')}
                className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  registerView === 'slip'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers size={13} />
                <span>By Supply Slip</span>
              </button>
              <button
                type="button"
                onClick={() => setRegisterView('lines')}
                className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  registerView === 'lines'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <TableIcon size={13} />
                <span>All Issued Lots</span>
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
                  value={delHistorySearch}
                  onChange={(e) => setDelHistorySearch(e.target.value)}
                  placeholder="Search Supply No, PO, Rack..."
                  className="w-full min-h-[42px] pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-[13px] outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {canExportData && (
                <button
                  type="button"
                  onClick={() =>
                    exportCsvFile(
                      `fabric_delivery_register_${todayISO()}.csv`,
                      [
                        'Supply No',
                        'Date',
                        'Type',
                        'Buyer',
                        'PO',
                        'Style',
                        'Rack',
                        'Fabric',
                        'Color',
                        'Lot',
                        'Weight (kg)',
                        'Rolls',
                        'Issued To',
                        'Receiver',
                        'Issued By',
                        'Remark',
                      ],
                      filteredDeliveriesHistory.map((d) => [
                        d.supplyNo,
                        d.deliveryDate,
                        d.deliveryType,
                        d.buyer,
                        d.po,
                        d.style || '',
                        d.rackCode || '',
                        d.fabricType || '',
                        d.color || '',
                        d.lotNo || '',
                        d.weightKg.toFixed(2),
                        d.rollCount || 0,
                        d.issuedTo,
                        d.receiverName || '',
                        d.createdBy,
                        d.remark || '',
                      ])
                    )
                  }
                  className="min-h-[42px] px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Download size={14} />
                  <span>CSV</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {registerView === 'slip' ? (
          <div className="divide-y divide-slate-300">
            {supplySlipGroups.length === 0 ? (
              <div className="p-8 text-center text-[13px] text-slate-500">
                No fabric delivery records yet.
              </div>
            ) : (
              supplySlipGroups.map((grp) => {
                const isExpanded = expandedSlips[grp.groupKey] ?? true;
                return (
                  <div key={grp.groupKey} className="bg-white">
                    <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-slate-50">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedSlips((prev) => ({
                            ...prev,
                            [grp.groupKey]: !isExpanded,
                          }))
                        }
                        className="flex items-center gap-3 flex-wrap text-left cursor-pointer flex-1"
                      >
                        <span className="font-mono font-extrabold text-sm text-slate-900 bg-slate-100 border border-slate-300 px-2.5 py-1 rounded-lg">
                          {grp.supplyNo}
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-600">
                          {grp.deliveryDate}
                        </span>
                        <span className="text-xs font-extrabold text-blue-800">
                          To: {grp.issuedTo}
                        </span>
                        <span className="text-xs font-bold text-slate-700">
                          {grp.pos.size} PO ({Array.from(grp.pos).slice(0, 4).join(', ')}
                          {grp.pos.size > 4 ? '...' : ''}) · Racks:{' '}
                          <span className="font-mono">{Array.from(grp.racks).join(', ')}</span>
                        </span>
                      </button>

                      <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
                        <span className="font-mono tabular-nums text-sm font-extrabold text-blue-800">
                          {fmtKg(grp.totalWeightKg)} kg
                        </span>
                        <button
                          type="button"
                          onClick={() => setPrintSlipItems(grp.items)}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-900 hover:text-white text-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap"
                        >
                          <Printer size={13} />
                          <span>Print Supply Slip</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSlips((prev) => ({
                              ...prev,
                              [grp.groupKey]: !isExpanded,
                            }))
                          }
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 cursor-pointer"
                        >
                          {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <>
                        {/* Mobile Cards inside Supply Slip */}
                        <div className="md:hidden divide-y divide-slate-200 border-t border-slate-200">
                          {grp.items.map((item) => {
                            const palette = getZoneColorPalette(
                              rackZoneByCode[item.rackCode || ''] || item.rackCode || ''
                            );
                            return (
                              <div key={item.id} className="p-4 space-y-2 bg-white">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="inline-flex items-center gap-1.5 font-mono text-xs font-extrabold text-slate-900">
                                        <span className={`h-2 w-2 rounded-full ${palette.dotBg}`} />
                                        Rack {item.rackCode || '-'}
                                      </span>
                                      <span className="text-slate-400">·</span>
                                      <span className="font-mono font-extrabold text-sm text-slate-900">
                                        PO {item.po}
                                      </span>
                                    </div>
                                    <p className="text-xs font-bold text-blue-800 mt-0.5">
                                      {item.buyer} {item.style ? `· ${item.style}` : ''}
                                    </p>
                                  </div>

                                  <div className="text-right shrink-0">
                                    <span className="font-mono tabular-nums text-sm font-extrabold text-blue-800 block">
                                      {fmtKg(item.weightKg)} kg
                                    </span>
                                    <span
                                      className={`text-[11px] font-extrabold ${
                                        item.deliveryType === 'Full'
                                          ? 'text-emerald-700'
                                          : 'text-amber-700'
                                      }`}
                                    >
                                      {item.deliveryType}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between gap-2 text-xs text-slate-700">
                                  <div>
                                    <span className="font-bold text-slate-900">
                                      {item.fabricType || '-'} · {item.color || '-'}
                                    </span>
                                    <div className="font-mono text-slate-500">
                                      Lot {item.lotNo || '-'}
                                    </div>
                                  </div>

                                  {canDeleteRecords && (
                                    <button
                                      type="button"
                                      onClick={() => onDeleteDeliveryRecord(item)}
                                      className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-slate-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
                                      title="Delete delivery line & restore stock"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Desktop Table inside Supply Slip */}
                        <div className="hidden md:block overflow-x-auto border-t border-slate-200">
                          <table className="w-full text-left border-collapse text-[13px]">
                            <thead className="bg-slate-100 text-slate-700 uppercase text-xs font-extrabold">
                              <tr>
                                <th className="p-3 border-b border-r border-slate-300">Rack</th>
                                <th className="p-3 border-b border-r border-slate-300">
                                  Buyer / PO / Style
                                </th>
                                <th className="p-3 border-b border-r border-slate-300">
                                  Fabric / Color / Lot
                                </th>
                                <th className="p-3 border-b border-r border-slate-300">Type</th>
                                <th className="p-3 border-b border-r border-slate-300 text-right">
                                  Delivered
                                </th>
                                {canDeleteRecords && (
                                  <th className="p-3 border-b border-slate-300 text-center">Del</th>
                                )}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {grp.items.map((item) => {
                                const palette = getZoneColorPalette(
                                  rackZoneByCode[item.rackCode || ''] || item.rackCode || ''
                                );
                                return (
                                  <tr key={item.id} className="hover:bg-slate-50">
                                    <td className="p-3 border-r border-slate-200 font-mono font-extrabold text-slate-900 whitespace-nowrap">
                                      <span className="inline-flex items-center gap-1.5">
                                        <span className={`h-2 w-2 rounded-full ${palette.dotBg}`} />
                                        Rack {item.rackCode || '-'}
                                      </span>
                                    </td>
                                    <td className="p-3 border-r border-slate-200">
                                      <span className="font-mono font-extrabold text-slate-900">
                                        PO {item.po}
                                      </span>
                                      <span className="text-slate-400 mx-1.5">·</span>
                                      <span className="font-bold text-blue-800">{item.buyer}</span>
                                      {item.style && (
                                        <div className="text-xs text-slate-600">{item.style}</div>
                                      )}
                                    </td>
                                    <td className="p-3 border-r border-slate-200">
                                      <span className="font-bold text-slate-900">
                                        {item.fabricType || '-'} · {item.color || '-'}
                                      </span>
                                      <div className="text-xs font-mono text-slate-600">
                                        Lot {item.lotNo || '-'}
                                      </div>
                                    </td>
                                    <td className="p-3 border-r border-slate-200">
                                      <span
                                        className={`text-xs font-extrabold ${
                                          item.deliveryType === 'Full'
                                            ? 'text-emerald-700'
                                            : 'text-amber-700'
                                        }`}
                                      >
                                        {item.deliveryType}
                                      </span>
                                    </td>
                                    <td className="p-3 border-r border-slate-200 text-right font-mono tabular-nums font-extrabold text-blue-800 whitespace-nowrap">
                                      {fmtKg(item.weightKg)} kg
                                    </td>
                                    {canDeleteRecords && (
                                      <td className="p-3 text-center">
                                        <button
                                          type="button"
                                          onClick={() => onDeleteDeliveryRecord(item)}
                                          className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                                          title="Delete delivery line & restore stock"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </td>
                                    )}
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
            {/* Mobile Cards for All Issued Lots */}
            <div className="md:hidden divide-y divide-slate-200">
              {filteredDeliveriesHistory.length === 0 ? (
                <div className="p-8 text-center text-[13px] text-slate-500">
                  No fabric delivery records yet.
                </div>
              ) : (
                filteredDeliveriesHistory.map((d) => {
                  const palette = getZoneColorPalette(
                    rackZoneByCode[d.rackCode || ''] || d.rackCode || ''
                  );
                  return (
                    <div key={d.id} className="p-4 space-y-2.5 bg-white">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-mono font-extrabold text-sm text-slate-900">
                            {d.supplyNo} · PO {d.po}
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">
                            <span className="font-bold text-blue-800">{d.buyer}</span> ·{' '}
                            {d.style || '-'} · <span className="font-mono">{d.deliveryDate}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-mono tabular-nums text-sm font-extrabold text-blue-800 block">
                            {fmtKg(d.weightKg)} kg
                          </span>
                          <span
                            className={`text-[11px] font-extrabold ${
                              d.deliveryType === 'Full' ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {d.deliveryType}
                          </span>
                        </div>
                      </div>

                      <div className="text-xs text-slate-700 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 font-mono font-bold text-slate-900">
                            <span className={`h-2 w-2 rounded-full ${palette.dotBg}`} />
                            Rack {d.rackCode || '-'}
                          </span>
                          <span>·</span>
                          <span className="font-bold">
                            {d.fabricType || '-'} · {d.color || '-'}
                          </span>
                        </div>
                        <div className="text-slate-500">
                          Lot <span className="font-mono">{d.lotNo || '-'}</span> · To:{' '}
                          <strong className="text-slate-800">{d.issuedTo}</strong>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setPrintSlipItems([d])}
                          className="flex-1 min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Printer size={13} />
                          <span>Print Slip</span>
                        </button>
                        {canDeleteRecords && (
                          <button
                            type="button"
                            onClick={() => onDeleteDeliveryRecord(d)}
                            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
                            title="Delete delivery & restore stock"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Desktop Table for All Issued Lots */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13px]">
                <thead className="bg-slate-100 text-slate-800 uppercase text-xs font-extrabold">
                  <tr>
                    <th className="p-3 border-b border-r border-slate-300">Supply No / Date</th>
                    <th className="p-3 border-b border-r border-slate-300">Type</th>
                    <th className="p-3 border-b border-r border-slate-300">Buyer / PO / Style</th>
                    <th className="p-3 border-b border-r border-slate-300">
                      Rack / Fabric / Color / Lot
                    </th>
                    <th className="p-3 border-b border-r border-slate-300">Issued To</th>
                    <th className="p-3 border-b border-r border-slate-300 text-right">Delivered</th>
                    <th className="p-3 border-b border-slate-300 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredDeliveriesHistory.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        No fabric delivery records yet.
                      </td>
                    </tr>
                  ) : (
                    filteredDeliveriesHistory.map((d) => {
                      const palette = getZoneColorPalette(
                        rackZoneByCode[d.rackCode || ''] || d.rackCode || ''
                      );
                      return (
                        <tr key={d.id} className="hover:bg-slate-50">
                          <td className="p-3 border-r border-slate-200 font-mono whitespace-nowrap">
                            <div className="font-extrabold text-slate-900">{d.supplyNo}</div>
                            <div className="text-xs text-slate-500">{d.deliveryDate}</div>
                          </td>
                          <td className="p-3 border-r border-slate-200 whitespace-nowrap">
                            <span
                              className={`font-extrabold ${
                                d.deliveryType === 'Full' ? 'text-emerald-700' : 'text-amber-700'
                              }`}
                            >
                              {d.deliveryType}
                            </span>
                          </td>
                          <td className="p-3 border-r border-slate-200">
                            <div className="font-extrabold text-slate-900 font-mono">PO {d.po}</div>
                            <div className="text-xs text-slate-700">
                              {d.buyer} · {d.style || '-'}
                            </div>
                          </td>
                          <td className="p-3 border-r border-slate-200">
                            <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 font-mono">
                                <span className={`h-2 w-2 rounded-full ${palette.dotBg}`} />
                                Rack {d.rackCode || '-'}
                              </span>
                              <span>·</span>
                              <span>
                                {d.fabricType || '-'} · {d.color || '-'}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 font-mono">
                              Lot {d.lotNo || '-'}
                            </div>
                          </td>
                          <td className="p-3 border-r border-slate-200">
                            <div className="font-bold text-slate-900">{d.issuedTo}</div>
                            {d.receiverName && (
                              <div className="text-xs text-slate-500">Recv: {d.receiverName}</div>
                            )}
                          </td>
                          <td className="p-3 border-r border-slate-200 text-right font-mono tabular-nums font-extrabold text-blue-800 whitespace-nowrap">
                            {fmtKg(d.weightKg)} kg
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setPrintSlipItems([d])}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <Printer size={12} />
                                <span>Slip</span>
                              </button>
                              {canDeleteRecords && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteDeliveryRecord(d)}
                                  className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                                  title="Delete delivery & restore stock"
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

      {/* Unified Multi-PO / Multi-Rack Printable Supply Slip Modal */}
      {printSlipItems && printSlipItems.length > 0 && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            id="supply-slip-print-area"
            className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto p-6 border border-slate-300 shadow-2xl space-y-5"
          >
            <div className="flex items-start justify-between border-b border-slate-300 pb-3">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  Felix Fashions Ltd — Fabric Supply Slip
                </h3>
                <p className="text-xs font-semibold text-slate-600">
                  Store Department · Four H Group
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPrintSlipItems(null)}
                className="text-slate-500 hover:text-slate-900 cursor-pointer no-print"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border border-slate-300 rounded-xl p-4 bg-slate-50">
              <div>
                <span className="text-slate-500 block">Supply No</span>
                <span className="font-mono font-extrabold text-slate-900 text-sm">
                  {printSlipItems[0].supplyNo}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Delivery Date</span>
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {printSlipItems[0].deliveryDate}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Issued To</span>
                <span className="font-extrabold text-slate-900 text-sm">
                  {printSlipItems[0].issuedTo}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Receiver / Store Officer</span>
                <span className="font-bold text-slate-800">
                  {printSlipItems[0].receiverName || '-'} / @{printSlipItems[0].createdBy}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-300 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 text-slate-800 uppercase font-extrabold">
                  <tr>
                    <th className="p-2.5 border-b border-r border-slate-300">#</th>
                    <th className="p-2.5 border-b border-r border-slate-300">Buyer / PO / Style</th>
                    <th className="p-2.5 border-b border-r border-slate-300">Rack</th>
                    <th className="p-2.5 border-b border-r border-slate-300">
                      Fabric / Color / Lot
                    </th>
                    <th className="p-2.5 border-b border-r border-slate-300">Type</th>
                    <th className="p-2.5 border-b border-slate-300 text-right">Weight / Rolls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {printSlipItems.map((line, i) => (
                    <tr key={line.id}>
                      <td className="p-2.5 border-r border-slate-200 font-mono font-bold">
                        {i + 1}
                      </td>
                      <td className="p-2.5 border-r border-slate-200">
                        <div className="font-mono font-extrabold text-slate-900">
                          PO {line.po} ({line.buyer})
                        </div>
                        <div className="text-slate-600">{line.style || '-'}</div>
                      </td>
                      <td className="p-2.5 border-r border-slate-200 font-mono font-extrabold text-slate-900">
                        {line.rackCode || '-'}
                      </td>
                      <td className="p-2.5 border-r border-slate-200">
                        <div className="font-bold text-slate-800">
                          {line.fabricType || '-'} · {line.color || '-'}
                        </div>
                        <div className="font-mono text-slate-600">
                          Lot {line.lotNo || '-'} {line.gsm ? `· ${line.gsm}` : ''}
                        </div>
                      </td>
                      <td className="p-2.5 border-r border-slate-200 font-bold">
                        {line.deliveryType}
                      </td>
                      <td className="p-2.5 text-right font-mono tabular-nums font-extrabold text-slate-900 whitespace-nowrap">
                        {fmtKg(line.weightKg)} kg
                        {line.rollCount ? ` (${line.rollCount}R)` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-100 font-extrabold text-slate-900">
                  <tr>
                    <td colSpan={5} className="p-2.5 border-t border-r border-slate-300 text-right">
                      TOTAL ISSUED WEIGHT ({printSlipItems.length} LINE
                      {printSlipItems.length === 1 ? '' : 'S'})
                    </td>
                    <td className="p-2.5 border-t border-slate-300 text-right font-mono text-sm text-blue-800">
                      {fmtKg(printSlipItems.reduce((s, l) => s + l.weightKg, 0))} kg
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {printSlipItems[0].remark && (
              <div className="text-xs border border-slate-300 rounded-xl p-3 bg-slate-50">
                <strong className="text-slate-700">Remark:</strong> {printSlipItems[0].remark}
              </div>
            )}

            <div className="grid grid-cols-3 gap-6 pt-8 text-center text-xs font-bold text-slate-600">
              <div className="border-t border-slate-400 pt-2">Issued By</div>
              <div className="border-t border-slate-400 pt-2">Received By</div>
              <div className="border-t border-slate-400 pt-2">Store In-Charge</div>
            </div>

            <div className="flex justify-end gap-2 pt-2 no-print">
              <button
                type="button"
                onClick={() => setPrintSlipItems(null)}
                className="min-h-[42px] px-4 py-2 text-xs font-bold border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="min-h-[42px] px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5"
              >
                <Printer size={14} />
                <span>Print Supply Slip</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
