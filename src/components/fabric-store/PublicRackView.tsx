import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Boxes,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  PackageCheck,
  Search,
  Settings,
  Warehouse,
  X,
} from 'lucide-react';
import {
  FabricDelivery,
  FabricRack,
  FabricReceiving,
  FabricUser,
  bootstrapFabricStoreDefaults,
  hashPassword,
  logFabricAudit,
  subscribeToFabricDeliveries,
  subscribeToFabricRacks,
  subscribeToFabricReceivings,
  subscribeToFabricUsers,
} from '../../firebase';
import {
  computeEnrichedReceivings,
  computeRackSummaries,
  formatKg,
  getZoneColorPalette,
} from './rackZoneTheme';

const SESSION_STORAGE_KEY = 'felix_fabric_store_session_v1';

interface PublicRackViewProps {
  rackCode: string;
  onExitPublicView: () => void;
  onSelectOtherRack: (rackCode: string) => void;
  onEnterManageMode: (rackId: string) => void;
}

export function PublicRackView({
  rackCode,
  onExitPublicView,
  onSelectOtherRack,
  onEnterManageMode,
}: PublicRackViewProps) {
  const [racks, setRacks] = useState<FabricRack[]>([]);
  const [receivings, setReceivings] = useState<FabricReceiving[]>([]);
  const [deliveries, setDeliveries] = useState<FabricDelivery[]>([]);
  const [users, setUsers] = useState<FabricUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [lotSearch, setLotSearch] = useState('');
  const [showExhausted, setShowExhausted] = useState(false);

  // Manage Auth Modal state
  const [showManageLogin, setShowManageLogin] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    let active = true;
    bootstrapFabricStoreDefaults().catch(() => {});

    let gotRacks = false;
    const unsubRacks = subscribeToFabricRacks((list) => {
      if (!active) return;
      setRacks(list);
      gotRacks = true;
      setIsLoading(false);
    });
    const unsubRec = subscribeToFabricReceivings((list) => {
      if (active) setReceivings(list);
    });
    const unsubDel = subscribeToFabricDeliveries((list) => {
      if (active) setDeliveries(list);
    });
    const unsubUsers = subscribeToFabricUsers((list) => {
      if (active) setUsers(list);
    });

    const fallbackTimer = setTimeout(() => {
      if (active && !gotRacks) setIsLoading(false);
    }, 5000);

    return () => {
      active = false;
      clearTimeout(fallbackTimer);
      unsubRacks();
      unsubRec();
      unsubDel();
      unsubUsers();
    };
  }, []);

  const enrichedReceivings = useMemo(
    () => computeEnrichedReceivings(receivings, deliveries),
    [receivings, deliveries]
  );

  const rackSummaries = useMemo(
    () => computeRackSummaries(racks, enrichedReceivings),
    [racks, enrichedReceivings]
  );

  const targetSummary = useMemo(() => {
    const norm = rackCode.trim().toUpperCase();
    return (
      rackSummaries.find(
        (s) =>
          s.rack.code.trim().toUpperCase() === norm ||
          s.rack.id.trim().toUpperCase() === norm
      ) || null
    );
  }, [rackSummaries, rackCode]);

  const palette = useMemo(
    () => getZoneColorPalette(targetSummary?.rack.zone || ''),
    [targetSummary?.rack.zone]
  );

  const displayedLots = useMemo(() => {
    if (!targetSummary) return [];
    const base = showExhausted
      ? targetSummary.rackBatches
      : targetSummary.activeBatches;
    const q = lotSearch.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (b) =>
        b.po.toLowerCase().includes(q) ||
        b.buyer.toLowerCase().includes(q) ||
        (b.style || '').toLowerCase().includes(q) ||
        b.fabricType.toLowerCase().includes(q) ||
        b.color.toLowerCase().includes(q) ||
        b.lotNo.toLowerCase().includes(q) ||
        b.challanNo.toLowerCase().includes(q) ||
        b.supplier.toLowerCase().includes(q)
    );
  }, [targetSummary, showExhausted, lotSearch]);

  const hasActiveSession = useMemo(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Boolean(parsed?.userId);
    } catch {
      return false;
    }
  }, [showManageLogin]);

  const handleManageClick = () => {
    if (!targetSummary) return;
    try {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.userId) {
          onEnterManageMode(targetSummary.rack.id);
          return;
        }
      }
    } catch {
      // ignore
    }
    setAuthError(null);
    setShowManageLogin(true);
  };

  const handleStaffSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetSummary) return;
    setAuthError(null);
    const uname = username.trim().toLowerCase();
    const pwd = password;
    if (!uname || !pwd) {
      setAuthError('Enter both User ID and Password.');
      return;
    }

    setIsVerifying(true);
    try {
      const pwdHash = await hashPassword(pwd);
      const matched = users.find((u) => u.username.toLowerCase() === uname);

      if (matched) {
        if (!matched.isActive) {
          setAuthError('Account is disabled. Contact the Master Admin.');
          setIsVerifying(false);
          return;
        }
        if (matched.passwordHash !== pwdHash) {
          setAuthError('Invalid User ID or Password.');
          setIsVerifying(false);
          return;
        }
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ userId: matched.id }));
        await logFabricAudit({
          action: 'QR Manage Sign In',
          module: 'Auth',
          details: `@${matched.username} signed in from QR view of Rack ${targetSummary.rack.code}.`,
          actorUsername: matched.username,
          actorRole: matched.role,
        });
        setShowManageLogin(false);
        onEnterManageMode(targetSummary.rack.id);
      } else if (users.length === 0 && (uname === 'admin' || uname === 'master') && pwd === 'felix123') {
        const tempAdmin: FabricUser = {
          id: 'user_admin',
          username: 'admin',
          fullName: 'Store Master Admin',
          passwordHash: pwdHash,
          role: 'master_admin',
          isActive: true,
          department: 'Store Department',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        sessionStorage.setItem(
          SESSION_STORAGE_KEY,
          JSON.stringify({ userId: tempAdmin.id, fallbackUser: tempAdmin })
        );
        setShowManageLogin(false);
        onEnterManageMode(targetSummary.rack.id);
      } else {
        setAuthError('Invalid User ID or Password.');
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Verification failed. Please retry.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-8">
      {/* Compact Sticky Mobile App Bar (<=56px height, respects 15% sticky cap) */}
      <header className="sticky top-0 z-30 h-14 bg-white/95 backdrop-blur-md border-b border-slate-300 px-3 sm:px-6 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onExitPublicView}
          className="min-h-[44px] px-2.5 sm:px-3 rounded-xl hover:bg-slate-100 text-slate-800 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Main Dashboard</span>
          <span className="sm:hidden">Home</span>
        </button>

        <div className="min-w-0 text-center">
          <p className="text-sm sm:text-base font-extrabold font-mono text-slate-900 truncate">
            {targetSummary ? `Rack ${targetSummary.rack.code}` : `Rack ${rackCode}`}
          </p>
          <p className="text-[11px] font-semibold text-slate-500 truncate">
            Public Rack Live View
          </p>
        </div>

        <button
          type="button"
          onClick={handleManageClick}
          disabled={!targetSummary}
          className={`min-h-[44px] px-3.5 sm:px-4 rounded-xl ${
            targetSummary ? `${palette.headerBg} hover:opacity-95` : 'bg-slate-900'
          } text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40`}
        >
          {hasActiveSession ? <Settings size={15} /> : <Lock size={14} />}
          <span>Manage</span>
        </button>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-6 pt-4 sm:pt-6 space-y-4 sm:space-y-5">
        {isLoading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 space-y-4">
            <div className="h-8 w-48 bg-slate-200 rounded-lg animate-pulse" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="h-20 bg-slate-100 rounded-xl animate-pulse" />
              <div className="h-20 bg-slate-100 rounded-xl animate-pulse" />
              <div className="h-20 bg-slate-100 rounded-xl animate-pulse" />
              <div className="h-20 bg-slate-100 rounded-xl animate-pulse" />
            </div>
          </div>
        ) : !targetSummary ? (
          <div className="bg-white rounded-2xl border border-slate-300 p-6 sm:p-8 text-center space-y-4">
            <div className="h-12 w-12 rounded-2xl bg-amber-50 border border-amber-300 text-amber-700 flex items-center justify-center mx-auto">
              <Warehouse size={24} />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-slate-900">
                Rack "{rackCode}" was not found
              </h1>
              <p className="text-xs text-slate-600 mt-1">
                Select one of the active warehouse racks below to view its live stock.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {rackSummaries.map((s) => {
                const zp = getZoneColorPalette(s.rack.zone);
                return (
                  <button
                    key={s.rack.id}
                    type="button"
                    onClick={() => onSelectOtherRack(s.rack.code)}
                    className={`min-h-[44px] px-4 py-2 rounded-xl border ${zp.cardBorder} ${zp.surfaceBg} ${zp.accentText} font-mono font-extrabold text-xs cursor-pointer`}
                  >
                    Rack {s.rack.code}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            {/* Zone-Colored Rack Hero Card */}
            <section className={`rounded-2xl border ${palette.cardBorder} bg-white overflow-hidden`}>
              <div className={`${palette.headerBg} ${palette.headerText} px-4 sm:px-6 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
                <div>
                  <p className={`text-xs font-bold ${palette.headerSubtext}`}>
                    {targetSummary.rack.zone} · Felix Store Live Stock
                  </p>
                  <div className="flex items-baseline gap-3 mt-1 flex-wrap">
                    <h1 className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight">
                      RACK {targetSummary.rack.code}
                    </h1>
                    <span className="text-xs font-bold opacity-90">
                      {targetSummary.utilizationPct >= 90
                        ? 'Near Full'
                        : targetSummary.currentKg > 0.009
                        ? 'Active Stock'
                        : 'Empty Rack'}
                    </span>
                  </div>
                  {targetSummary.rack.description && (
                    <p className={`text-xs mt-1 ${palette.headerSubtext}`}>
                      {targetSummary.rack.description}
                    </p>
                  )}
                </div>

                {/* Big Stock Readout */}
                <div className="flex items-center justify-between sm:justify-end gap-4 bg-black/15 rounded-xl px-4 py-3 border border-white/15">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider opacity-85 block">
                      Available In Rack
                    </span>
                    <span className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums">
                      {formatKg(targetSummary.currentKg)} <span className="text-sm font-bold">kg</span>
                    </span>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <span className="text-[11px] font-bold uppercase tracking-wider opacity-85 block">
                      Fill
                    </span>
                    <span className="text-xl font-extrabold">{targetSummary.utilizationPct}%</span>
                  </div>
                </div>
              </div>

              {/* Capacity Progress & Breakdown */}
              <div className="p-4 sm:p-5 space-y-4">
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1.5 font-mono tabular-nums">
                    <span>Occupied: {formatKg(targetSummary.currentKg)} kg</span>
                    <span>Capacity: {formatKg(targetSummary.rack.capacityKg)} kg</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        targetSummary.utilizationPct >= 90
                          ? 'bg-rose-600'
                          : targetSummary.utilizationPct >= 65
                          ? 'bg-amber-500'
                          : palette.progressBg
                      }`}
                      style={{ width: `${targetSummary.utilizationPct}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className={`p-3 rounded-xl border ${palette.surfaceBorder} ${palette.surfaceBg}`}>
                    <span className="text-slate-600 font-semibold block">Free Space</span>
                    <span className="text-base font-extrabold font-mono tabular-nums text-emerald-800 mt-0.5 block">
                      {formatKg(targetSummary.freeCapacityKg)} kg
                    </span>
                  </div>
                  <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                    <span className="text-slate-600 font-semibold block">Active Lots</span>
                    <span className="text-base font-extrabold font-mono tabular-nums text-slate-900 mt-0.5 block">
                      {targetSummary.activeBatches.length} Lots
                    </span>
                  </div>
                  <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                    <span className="text-slate-600 font-semibold block">Active POs</span>
                    <span className="text-base font-extrabold font-mono tabular-nums text-slate-900 mt-0.5 block">
                      {targetSummary.pos.length} POs
                    </span>
                  </div>
                  <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                    <span className="text-slate-600 font-semibold block">Delivered Out</span>
                    <span className="text-base font-extrabold font-mono tabular-nums text-blue-800 mt-0.5 block">
                      {formatKg(targetSummary.deliveredKg)} kg
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* Search & Filter Bar */}
            <section className="bg-white rounded-2xl border border-slate-300 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  value={lotSearch}
                  onChange={(e) => setLotSearch(e.target.value)}
                  placeholder="Search PO, Buyer, Style, Fabric, Color, Lot..."
                  className="w-full min-h-[44px] pl-10 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm sm:text-xs font-medium focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 flex-wrap">
                <label className="min-h-[44px] flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer px-2">
                  <input
                    type="checkbox"
                    checked={showExhausted}
                    onChange={(e) => setShowExhausted(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span>Show 0 kg history</span>
                </label>

                <button
                  type="button"
                  onClick={handleManageClick}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Settings size={15} />
                  <span>Manage Rack {targetSummary.rack.code}</span>
                </button>
              </div>
            </section>

            {/* Lots List: Mobile Card Layout (< md) + Desktop Table (>= md) */}
            {displayedLots.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-300 p-8 sm:p-10 text-center space-y-2">
                <PackageCheck size={28} className="mx-auto text-slate-400" />
                <p className="text-sm font-bold text-slate-800">
                  {lotSearch.trim()
                    ? `No fabric lots in Rack ${targetSummary.rack.code} match "${lotSearch}".`
                    : `Rack ${targetSummary.rack.code} currently has no active fabric stock.`}
                </p>
                <p className="text-xs text-slate-500">
                  Authorized staff can tap "Manage" above to receive or transfer fabric into this rack.
                </p>
              </div>
            ) : (
              <>
                {/* Mobile Card Stack */}
                <div className="grid grid-cols-1 gap-3 md:hidden">
                  {displayedLots.map((b) => (
                    <div
                      key={b.id}
                      className={`bg-white rounded-2xl border ${palette.surfaceBorder} p-4 space-y-3`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-extrabold font-mono text-slate-900">
                            PO {b.po}
                          </p>
                          <p className="text-xs font-semibold text-slate-700 truncate">
                            {b.buyer} · {b.style || '-'}
                          </p>
                        </div>
                        <span
                          className={`text-xs font-extrabold font-mono shrink-0 ${
                            b.availableKg <= 0.009
                              ? 'text-slate-400'
                              : 'text-emerald-700'
                          }`}
                        >
                          {b.status}
                        </span>
                      </div>

                      <div className="text-xs text-slate-700 space-y-1">
                        <p className="font-bold text-slate-900">
                          {b.fabricType} · {b.color}
                          {b.gsm ? ` · ${b.gsm} GSM` : ''}
                        </p>
                        <p className="font-mono text-slate-600">
                          Lot {b.lotNo} · Ch {b.challanNo} · {b.receiveDate}
                        </p>
                        {b.supplier && (
                          <p className="text-slate-500">Supplier: {b.supplier}</p>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-slate-100 text-xs font-mono tabular-nums">
                        <div>
                          <span className="text-[11px] font-sans text-slate-500 block">Received</span>
                          <span className="font-bold text-slate-900">{formatKg(b.weightKg)}</span>
                        </div>
                        <div>
                          <span className="text-[11px] font-sans text-slate-500 block">Delivered</span>
                          <span className="font-bold text-blue-700">{formatKg(b.deliveredKg)}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[11px] font-sans text-slate-500 block">In Stock</span>
                          <span className="font-extrabold text-emerald-700 text-sm">
                            {formatKg(b.availableKg)} kg
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block bg-white rounded-2xl border border-slate-300 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-100 text-slate-700 uppercase font-extrabold">
                        <tr>
                          <th className="p-3.5 border-b border-slate-200">PO / Buyer / Style</th>
                          <th className="p-3.5 border-b border-slate-200">Fabric / Color / GSM</th>
                          <th className="p-3.5 border-b border-slate-200">Lot / Challan / Supplier</th>
                          <th className="p-3.5 border-b border-slate-200 text-right">Received</th>
                          <th className="p-3.5 border-b border-slate-200 text-right">Delivered</th>
                          <th className="p-3.5 border-b border-slate-200 text-right">In Stock Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {displayedLots.map((b) => (
                          <tr key={b.id} className="hover:bg-slate-50">
                            <td className="p-3.5">
                              <div className="font-extrabold text-slate-900 font-mono">PO {b.po}</div>
                              <div className="text-slate-700 font-semibold">
                                {b.buyer} · {b.style || '-'}
                              </div>
                              {b.shipDate && (
                                <div className="text-slate-400">Ship: {b.shipDate}</div>
                              )}
                            </td>
                            <td className="p-3.5">
                              <div className="font-bold text-slate-900">{b.fabricType}</div>
                              <div className="text-slate-600">
                                {b.color}
                                {b.gsm ? ` · ${b.gsm}` : ''}
                              </div>
                            </td>
                            <td className="p-3.5 font-mono">
                              <div className="font-bold text-slate-800">Lot {b.lotNo}</div>
                              <div className="text-slate-500">
                                Ch {b.challanNo} · {b.receiveDate}
                              </div>
                              <div className="text-slate-500 font-sans">{b.supplier}</div>
                            </td>
                            <td className="p-3.5 text-right font-mono tabular-nums">
                              {formatKg(b.weightKg)} kg
                            </td>
                            <td className="p-3.5 text-right font-mono tabular-nums text-blue-700 font-semibold">
                              {formatKg(b.deliveredKg)} kg
                            </td>
                            <td className="p-3.5 text-right font-mono tabular-nums font-extrabold text-emerald-700">
                              {formatKg(b.availableKg)} kg
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* Quick Rack Switcher */}
            {rackSummaries.length > 1 && (
              <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-extrabold text-slate-700">
                  <Boxes size={15} className="text-slate-500" />
                  <span>Jump to Another Rack</span>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {rackSummaries.map((s) => {
                    const zp = getZoneColorPalette(s.rack.zone);
                    const isCurrent = s.rack.id === targetSummary.rack.id;
                    return (
                      <button
                        key={s.rack.id}
                        type="button"
                        onClick={() => onSelectOtherRack(s.rack.code)}
                        className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-xs font-mono font-bold whitespace-nowrap shrink-0 cursor-pointer transition ${
                          isCurrent
                            ? `${zp.headerBg} ${zp.headerText} ${zp.headerBorder}`
                            : `bg-white ${zp.cardBorder} ${zp.accentText} hover:bg-slate-50`
                        }`}
                      >
                        {s.rack.code} ({formatKg(s.currentKg)} kg)
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {/* Staff Manage Login Modal */}
      {showManageLogin && targetSummary && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full border border-slate-300 shadow-2xl overflow-hidden">
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto my-2.5 sm:hidden" />

            <div className={`${palette.headerBg} ${palette.headerText} px-5 py-4 flex items-center justify-between gap-3`}>
              <div className="flex items-center gap-2.5">
                <Lock size={18} />
                <div>
                  <h2 className="text-sm font-extrabold">
                    Manage Rack {targetSummary.rack.code}
                  </h2>
                  <p className={`text-xs ${palette.headerSubtext}`}>
                    Sign in with your Store User ID to update stock
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowManageLogin(false)}
                className="min-h-[44px] min-w-[44px] rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center cursor-pointer"
                aria-label="Close login modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleStaffSignIn} className="p-5 space-y-4">
              {authError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="text-rose-600 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  User ID / Username
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your Store User ID"
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full min-h-[44px] px-3.5 py-2.5 pr-11 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer"
                    aria-label="Toggle password visibility"
                  >
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowManageLogin(false)}
                  className="min-h-[44px] px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isVerifying}
                  className="min-h-[44px] px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <KeyRound size={15} />
                  <span>{isVerifying ? 'Signing In...' : 'Sign In & Manage'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
