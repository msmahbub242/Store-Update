import React, { useMemo, useState } from 'react';
import { Download, Search, Truck } from 'lucide-react';
import { formatKg, getZoneColorPalette } from './rackZoneTheme';

export interface PoLedgerRow {
  key: string;
  buyer: string;
  po: string;
  style: string;
  itemName: string;
  fileNo: string;
  shipDate: string;
  requiredKg: number;
  receivedKg: number;
  deliveredKg: number;
  availableKg: number;
  lotCount: number;
  activeLots: number;
  racks: Set<string>;
}

interface PoBalanceSectionProps {
  poLedgerList: PoLedgerRow[];
  ledgerSearch: string;
  onLedgerSearchChange: (val: string) => void;
  rackZoneByCode: Record<string, string>;
  canDeliver: boolean;
  canExport: boolean;
  onExportCsv: (rows: PoLedgerRow[]) => void;
  onDeliverPo: (po: string) => void;
}

export function PoBalanceSection({
  poLedgerList,
  ledgerSearch,
  onLedgerSearchChange,
  rackZoneByCode,
  canDeliver,
  canExport,
  onExportCsv,
  onDeliverPo,
}: PoBalanceSectionProps) {
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'in_stock' | 'delivered_out'>('all');

  const totals = useMemo(() => {
    const totalReq = poLedgerList.reduce((s, p) => s + p.requiredKg, 0);
    const totalRecv = poLedgerList.reduce((s, p) => s + p.receivedKg, 0);
    const totalDel = poLedgerList.reduce((s, p) => s + p.deliveredKg, 0);
    const totalAvail = poLedgerList.reduce((s, p) => s + p.availableKg, 0);
    const inStockCount = poLedgerList.filter((p) => p.availableKg > 0.009).length;
    return {
      totalCount: poLedgerList.length,
      inStockCount,
      deliveredOutCount: poLedgerList.length - inStockCount,
      totalReq,
      totalRecv,
      totalDel,
      totalAvail,
    };
  }, [poLedgerList]);

  const filtered = useMemo(() => {
    const q = ledgerSearch.trim().toLowerCase();
    return poLedgerList.filter((p) => {
      if (balanceFilter === 'in_stock' && p.availableKg <= 0.009) return false;
      if (balanceFilter === 'delivered_out' && p.availableKg > 0.009) return false;
      if (!q) return true;
      return (
        p.po.toLowerCase().includes(q) ||
        p.buyer.toLowerCase().includes(q) ||
        p.style.toLowerCase().includes(q) ||
        p.itemName.toLowerCase().includes(q) ||
        p.fileNo.toLowerCase().includes(q)
      );
    });
  }, [poLedgerList, ledgerSearch, balanceFilter]);

  return (
    <div className="space-y-5">
      {/* PO Balance Overview Hero Strip */}
      <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-4 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          <div className="lg:col-span-4 space-y-1.5">
            <p className="text-xs font-semibold text-emerald-300">
              PO-Wise Store Ledger · {totals.totalCount} Tracked PO(s)
            </p>
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <span className="text-3xl sm:text-4xl font-extrabold font-mono tabular-nums tracking-tight">
                {formatKg(totals.totalAvail)}
              </span>
              <span className="text-sm font-semibold text-slate-300">kg on hand</span>
            </div>
            <p className="text-xs text-slate-400 font-mono tabular-nums">
              {totals.inStockCount} POs in racks · {totals.deliveredOutCount} cleared/pending
            </p>
          </div>

          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700">
              <span className="text-xs font-semibold text-slate-400 block">Total Required</span>
              <span className="text-xl font-extrabold font-mono tabular-nums text-white mt-1 block">
                {formatKg(totals.totalReq)} kg
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700">
              <span className="text-xs font-semibold text-slate-400 block">Total Received</span>
              <span className="text-xl font-extrabold font-mono tabular-nums text-emerald-400 mt-1 block">
                {formatKg(totals.totalRecv)} kg
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700">
              <span className="text-xs font-semibold text-slate-400 block">Total Delivered</span>
              <span className="text-xl font-extrabold font-mono tabular-nums text-sky-400 mt-1 block">
                {formatKg(totals.totalDel)} kg
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Ledger Card */}
      <div className="bg-white rounded-2xl border border-slate-300 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-300 bg-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              PO-Wise Fabric Balance Ledger
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Aggregated required, received, delivered & rack store balance per PO
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-wrap">
            <div className="flex items-center bg-white p-1 rounded-xl border border-slate-300 overflow-x-auto">
              {(
                [
                  { id: 'all', label: `All (${totals.totalCount})` },
                  { id: 'in_stock', label: `In Stock (${totals.inStockCount})` },
                  { id: 'delivered_out', label: `0 kg (${totals.deliveredOutCount})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setBalanceFilter(tab.id)}
                  className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer ${
                    balanceFilter === tab.id
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
                  value={ledgerSearch}
                  onChange={(e) => onLedgerSearchChange(e.target.value)}
                  placeholder="Search PO, Buyer, Style..."
                  className="w-full min-h-[44px] pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-sm sm:text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              {canExport && (
                <button
                  type="button"
                  onClick={() => onExportCsv(filtered)}
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
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No PO stock ledger entries match your filter.
            </div>
          ) : (
            filtered.map((p) => {
              const rackList = Array.from(p.racks);
              return (
                <div key={p.key} className="p-4 space-y-3 bg-white">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono font-extrabold text-sm text-slate-900">
                        PO {p.po}
                      </div>
                      <div className="text-xs font-bold text-indigo-800">{p.buyer}</div>
                      <div className="text-xs text-slate-600 truncate mt-0.5">
                        {p.style} · {p.itemName}
                        {p.fileNo !== '-' ? ` · File ${p.fileNo}` : ''}
                      </div>
                    </div>
                    <div className="text-right font-mono shrink-0">
                      <span className="text-[11px] font-sans text-slate-500 block">Ship</span>
                      <span className="text-xs font-bold text-slate-800">{p.shipDate}</span>
                    </div>
                  </div>

                  {rackList.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
                      <span className="text-slate-500 font-sans">Racks:</span>
                      {rackList.map((code) => {
                        const zp = getZoneColorPalette(rackZoneByCode[code] || '');
                        return (
                          <span
                            key={code}
                            className={`inline-flex items-center gap-1 font-extrabold ${zp.accentText}`}
                          >
                            <span className={`h-2 w-2 rounded-full ${zp.dotBg}`} />
                            {code}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-xs font-mono tabular-nums">
                    <div>
                      <span className="font-sans text-[11px] text-slate-500 block">Req.</span>
                      <strong className="text-slate-700">
                        {p.requiredKg > 0 ? formatKg(p.requiredKg) : '-'}
                      </strong>
                    </div>
                    <div>
                      <span className="font-sans text-[11px] text-slate-500 block">Recv.</span>
                      <strong className="text-slate-900">{formatKg(p.receivedKg)}</strong>
                    </div>
                    <div>
                      <span className="font-sans text-[11px] text-slate-500 block">Deliv.</span>
                      <strong className="text-blue-700">{formatKg(p.deliveredKg)}</strong>
                    </div>
                    <div className="text-right">
                      <span className="font-sans text-[11px] text-slate-500 block">Bal.</span>
                      <strong className="text-emerald-700">{formatKg(p.availableKg)}</strong>
                    </div>
                  </div>

                  {p.availableKg > 0.009 && canDeliver && (
                    <button
                      type="button"
                      onClick={() => onDeliverPo(p.po)}
                      className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Truck size={14} />
                      <span>Deliver PO {p.po}</span>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead className="bg-slate-100 text-slate-800 uppercase text-xs font-extrabold">
              <tr>
                <th className="p-3.5 border-b border-r border-slate-300">Buyer / PO</th>
                <th className="p-3.5 border-b border-r border-slate-300">Style / Item / File</th>
                <th className="p-3.5 border-b border-r border-slate-300">Ship Date</th>
                <th className="p-3.5 border-b border-r border-slate-300">Racks</th>
                <th className="p-3.5 border-b border-r border-slate-300 text-right">Required</th>
                <th className="p-3.5 border-b border-r border-slate-300 text-right">Received</th>
                <th className="p-3.5 border-b border-r border-slate-300 text-right">Delivered</th>
                <th className="p-3.5 border-b border-r border-slate-300 text-right">
                  Store Balance
                </th>
                <th className="p-3.5 border-b border-slate-300 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500">
                    No PO stock ledger entries match your filter.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const rackList = Array.from(p.racks);
                  return (
                    <tr key={p.key} className="hover:bg-slate-50">
                      <td className="p-3 border-r border-slate-200 whitespace-nowrap">
                        <div className="font-mono font-extrabold text-slate-900">PO {p.po}</div>
                        <div className="text-xs font-bold text-indigo-800">{p.buyer}</div>
                      </td>
                      <td className="p-3 border-r border-slate-200">
                        <div className="font-bold text-slate-900">{p.style}</div>
                        <div className="text-xs text-slate-600">
                          {p.itemName} {p.fileNo !== '-' ? `· File ${p.fileNo}` : ''}
                        </div>
                      </td>
                      <td className="p-3 border-r border-slate-200 font-mono whitespace-nowrap">
                        {p.shipDate}
                      </td>
                      <td className="p-3 border-r border-slate-200 font-mono font-bold text-slate-800">
                        {rackList.length > 0 ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            {rackList.map((code) => {
                              const zp = getZoneColorPalette(rackZoneByCode[code] || '');
                              return (
                                <span
                                  key={code}
                                  className={`inline-flex items-center gap-1 ${zp.accentText}`}
                                >
                                  <span className={`h-2 w-2 rounded-full ${zp.dotBg}`} />
                                  {code}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="p-3 border-r border-slate-200 text-right font-mono tabular-nums font-bold text-slate-700 whitespace-nowrap">
                        {p.requiredKg > 0 ? `${formatKg(p.requiredKg)} kg` : '-'}
                      </td>
                      <td className="p-3 border-r border-slate-200 text-right font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                        {formatKg(p.receivedKg)} kg
                      </td>
                      <td className="p-3 border-r border-slate-200 text-right font-mono tabular-nums font-bold text-blue-700 whitespace-nowrap">
                        {formatKg(p.deliveredKg)} kg
                      </td>
                      <td className="p-3 border-r border-slate-200 text-right font-mono tabular-nums font-extrabold text-emerald-700 whitespace-nowrap">
                        {formatKg(p.availableKg)} kg
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        {p.availableKg > 0.009 && canDeliver && (
                          <button
                            type="button"
                            onClick={() => onDeliverPo(p.po)}
                            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                          >
                            Deliver
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
