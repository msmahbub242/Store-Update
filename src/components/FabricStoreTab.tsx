import React, { useState, useEffect, useMemo } from 'react';
import {
  Lock,
  LogOut,
  Users,
  PackagePlus,
  Truck,
  ClipboardList,
  Search,
  X,
  Plus,
  Trash2,
  Download,
  Printer,
  CheckCircle2,
  AlertCircle,
  ArrowRightLeft,
  Eye,
  EyeOff,
  KeyRound,
  History,
  Edit3,
  UserPlus,
  Warehouse,
  BookmarkCheck,
  Split,
  LayoutGrid,
  Table as TableIcon,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  FabricRole,
  FabricUser,
  FabricRack,
  FabricRequirement,
  FabricReceiving,
  FabricDelivery,
  FabricAuditLog,
  bootstrapFabricStoreDefaults,
  subscribeToFabricUsers,
  subscribeToFabricRacks,
  subscribeToFabricRequirements,
  subscribeToFabricReceivings,
  subscribeToFabricDeliveries,
  subscribeToFabricAuditLogs,
  hashPassword,
  createFabricUser,
  updateFabricUser,
  deleteFabricUser,
  saveFabricRack,
  deleteFabricRack,
  createFabricRequirement,
  updateFabricRequirement,
  deleteFabricRequirement,
  createFabricReceivingBatch,
  splitFabricReceivingToRack,
  deleteFabricReceiving,
  createFabricDelivery,
  deleteFabricDelivery,
  logFabricAudit,
} from '../firebase';

interface FabricStoreTabProps {
  allMasterOrders: any[];
  lineNames: string[];
}

type FabricSubTab = 'racks' | 'requirements' | 'receiving' | 'delivery' | 'ledger' | 'users';

const ROLE_META: Record<
  FabricRole,
  {
    label: string;
    badgeClass: string;
    canReceive: boolean;
    canDeliver: boolean;
    canManageRacks: boolean;
    canDeleteRecords: boolean;
    canManageUsers: boolean;
    canViewAudit: boolean;
    summary: string;
  }
> = {
  master_admin: {
    label: 'Master Admin',
    badgeClass: 'bg-slate-900 text-white border-slate-900',
    canReceive: true,
    canDeliver: true,
    canManageRacks: true,
    canDeleteRecords: true,
    canManageUsers: true,
    canViewAudit: true,
    summary: 'Full system control: users, roles, racks, booking, receiving, delivery & audit',
  },
  store_manager: {
    label: 'Store In-Charge',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-300',
    canReceive: true,
    canDeliver: true,
    canManageRacks: true,
    canDeleteRecords: true,
    canManageUsers: false,
    canViewAudit: true,
    summary: 'Manage racks, fabric booking, challan receiving, delivery & shared rack transfers',
  },
  receiver: {
    label: 'Fabric Receiver',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    canReceive: true,
    canDeliver: false,
    canManageRacks: false,
    canDeleteRecords: false,
    canManageUsers: false,
    canViewAudit: false,
    summary: 'Enter PO fabric requirements & record challan-wise receiving',
  },
  issuer: {
    label: 'Delivery Officer',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
    canReceive: false,
    canDeliver: true,
    canManageRacks: false,
    canDeleteRecords: false,
    canManageUsers: false,
    canViewAudit: false,
    summary: 'View stock & issue Full/Partial fabric deliveries by PO',
  },
  viewer: {
    label: 'Viewer / Auditor',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    canReceive: false,
    canDeliver: false,
    canManageRacks: false,
    canDeleteRecords: false,
    canManageUsers: false,
    canViewAudit: false,
    summary: 'Read-only access to Rack Stock Summary, Bookings & Ledgers',
  },
};

const FABRIC_TYPE_SUGGESTIONS = [
  'Single Jersey',
  '1x1 Rib',
  '2x1 Rib',
  'Interlock',
  'Pique',
  'French Terry',
  'Brush Fleece',
  'Cotton Lycra',
  'Polyester Mesh',
  'Twill',
  'Canvas',
  'Denim',
  'AOP Jersey',
];

const SESSION_STORAGE_KEY = 'felix_fabric_store_session_v1';
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

interface SelectedOrderContext {
  buyer: string;
  po: string;
  style: string;
  itemName: string;
  fileNo: string;
  shipDate: string;
  orderDzn: string;
}

interface RackAllocationSplit {
  rackId: string;
  weightKg: string;
  rollCount: string;
}

interface ChallanDraftLine {
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

export default function FabricStoreTab({ allMasterOrders, lineNames }: FabricStoreTabProps) {
  // Firestore Live Collections
  const [users, setUsers] = useState<FabricUser[]>([]);
  const [racks, setRacks] = useState<FabricRack[]>([]);
  const [requirements, setRequirements] = useState<FabricRequirement[]>([]);
  const [receivings, setReceivings] = useState<FabricReceiving[]>([]);
  const [deliveries, setDeliveries] = useState<FabricDelivery[]>([]);
  const [auditLogs, setAuditLogs] = useState<FabricAuditLog[]>([]);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  // Auth Session State
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed?.userId || null;
      }
    } catch {
      // ignore
    }
    return null;
  });
  const [fallbackAdminSession, setFallbackAdminSession] = useState<FabricUser | null>(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed?.fallbackUser || null;
      }
    } catch {
      // ignore
    }
    return null;
  });

  // Login Form State (Master admin username & password hidden)
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPwd, setShowLoginPwd] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Navigation & Toast
  const [activeSubTab, setActiveSubTab] = useState<FabricSubTab>('racks');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  useEffect(() => {
    let active = true;
    bootstrapFabricStoreDefaults().finally(() => {
      if (active) setIsBootstrapping(false);
    });

    const unsubUsers = subscribeToFabricUsers((list) => setUsers(list));
    const unsubRacks = subscribeToFabricRacks((list) => setRacks(list));
    const unsubReq = subscribeToFabricRequirements((list) => setRequirements(list));
    const unsubRec = subscribeToFabricReceivings((list) => setReceivings(list));
    const unsubDel = subscribeToFabricDeliveries((list) => setDeliveries(list));
    const unsubAudit = subscribeToFabricAuditLogs((list) => setAuditLogs(list));

    return () => {
      active = false;
      unsubUsers();
      unsubRacks();
      unsubReq();
      unsubRec();
      unsubDel();
      unsubAudit();
    };
  }, []);

  const currentUser: FabricUser | null = useMemo(() => {
    if (!currentUserId) return null;
    const live = users.find((u) => u.id === currentUserId);
    if (live) return live.isActive ? live : null;
    if (fallbackAdminSession && fallbackAdminSession.id === currentUserId) return fallbackAdminSession;
    return null;
  }, [currentUserId, users, fallbackAdminSession]);

  const rolePerms = currentUser ? ROLE_META[currentUser.role] || ROLE_META.viewer : null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    const uname = loginUsername.trim().toLowerCase();
    const pwd = loginPassword;
    if (!uname || !pwd) {
      setLoginError('Please enter both username and password.');
      return;
    }

    setIsLoggingIn(true);
    try {
      const pwdHash = await hashPassword(pwd);
      const matched = users.find((u) => u.username.toLowerCase() === uname);

      if (matched) {
        if (!matched.isActive) {
          setLoginError('This account is disabled. Contact the Master Admin.');
          setIsLoggingIn(false);
          return;
        }
        if (matched.passwordHash !== pwdHash) {
          setLoginError('Invalid username or password.');
          setIsLoggingIn(false);
          return;
        }
        setCurrentUserId(matched.id);
        setFallbackAdminSession(null);
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ userId: matched.id }));
        setLoginUsername('');
        setLoginPassword('');
        await logFabricAudit({
          action: 'User Sign In',
          module: 'Auth',
          details: `${matched.fullName} (@${matched.username}, ${ROLE_META[matched.role].label}) signed in.`,
          actorUsername: matched.username,
          actorRole: matched.role,
        });
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
        setCurrentUserId(tempAdmin.id);
        setFallbackAdminSession(tempAdmin);
        sessionStorage.setItem(
          SESSION_STORAGE_KEY,
          JSON.stringify({ userId: tempAdmin.id, fallbackUser: tempAdmin })
        );
        setLoginUsername('');
        setLoginPassword('');
      } else {
        setLoginError('Invalid username or password.');
      }
    } catch (err: any) {
      setLoginError(err?.message || 'Sign in failed. Please check connection.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignOut = () => {
    setCurrentUserId(null);
    setFallbackAdminSession(null);
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setActiveSubTab('racks');
  };

  // ============================================================================
  // STOCK & REQUIREMENT FULFILLMENT COMPUTATIONS
  // ============================================================================

  const deliveredByReceivingId = useMemo(() => {
    const map = new Map<string, { deliveredKg: number; deliveredRolls: number; count: number }>();
    deliveries.forEach((d) => {
      const prev = map.get(d.receivingId) || { deliveredKg: 0, deliveredRolls: 0, count: 0 };
      prev.deliveredKg += Number(d.weightKg) || 0;
      prev.deliveredRolls += Number(d.rollCount) || 0;
      prev.count += 1;
      map.set(d.receivingId, prev);
    });
    return map;
  }, [deliveries]);

  const enrichedReceivings = useMemo(() => {
    return receivings.map((rec) => {
      const del = deliveredByReceivingId.get(rec.id) || { deliveredKg: 0, deliveredRolls: 0, count: 0 };
      const availableKg = Math.max(0, Number((rec.weightKg - del.deliveredKg).toFixed(2)));
      const availableRolls = Math.max(0, (rec.rollCount || 0) - del.deliveredRolls);
      const status: 'Available' | 'Partial' | 'Exhausted' =
        availableKg <= 0.009 ? 'Exhausted' : del.deliveredKg > 0 ? 'Partial' : 'Available';
      return {
        ...rec,
        deliveredKg: Number(del.deliveredKg.toFixed(2)),
        availableKg,
        availableRolls,
        deliveryCount: del.count,
        status,
      };
    });
  }, [receivings, deliveredByReceivingId]);

  // Compute received weight against each pre-entered FabricRequirement
  const enrichedRequirements = useMemo(() => {
    return requirements.map((req) => {
      const matchedRecs = enrichedReceivings.filter((rec) => {
        if (rec.requirementId && rec.requirementId === req.id) return true;
        return (
          rec.po.trim().toLowerCase() === req.po.trim().toLowerCase() &&
          rec.buyer.trim().toLowerCase() === req.buyer.trim().toLowerCase() &&
          rec.fabricType.trim().toLowerCase() === req.fabricType.trim().toLowerCase() &&
          rec.color.trim().toLowerCase() === req.color.trim().toLowerCase()
        );
      });
      const receivedKg = Number(matchedRecs.reduce((s, r) => s + r.weightKg, 0).toFixed(2));
      const pendingKg = Math.max(0, Number((req.requiredQtyKg - receivedKg).toFixed(2)));
      const pct = req.requiredQtyKg > 0 ? Math.min(100, Math.round((receivedKg / req.requiredQtyKg) * 100)) : 0;
      return {
        ...req,
        receivedKg,
        pendingKg,
        pct,
        isComplete: receivedKg >= req.requiredQtyKg - 0.01,
      };
    });
  }, [requirements, enrichedReceivings]);

  // Rack-Wise Stock Summary
  const rackSummaries = useMemo(() => {
    return racks.map((rack) => {
      const rackBatches = enrichedReceivings.filter(
        (r) => r.rackId === rack.id || r.rackCode === rack.code
      );
      const activeBatches = rackBatches.filter((b) => b.availableKg > 0.009);
      const receivedKg = rackBatches.reduce((s, b) => s + b.weightKg, 0);
      const deliveredKg = rackBatches.reduce((s, b) => s + b.deliveredKg, 0);
      const currentKg = rackBatches.reduce((s, b) => s + b.availableKg, 0);
      const freeCapacityKg = Math.max(0, rack.capacityKg - currentKg);
      const totalRolls = activeBatches.reduce((s, b) => s + (b.availableRolls || 0), 0);
      const buyers = Array.from(new Set(activeBatches.map((b) => b.buyer))).filter(Boolean);
      const pos = Array.from(new Set(activeBatches.map((b) => b.po))).filter(Boolean);
      const utilizationPct =
        rack.capacityKg > 0 ? Math.min(100, Math.round((currentKg / rack.capacityKg) * 100)) : 0;

      return {
        rack,
        rackBatches,
        activeBatches,
        receivedKg,
        deliveredKg,
        currentKg,
        freeCapacityKg,
        totalRolls,
        buyers,
        pos,
        utilizationPct,
      };
    });
  }, [racks, enrichedReceivings]);

  const overallTotals = useMemo(() => {
    let totalReceivedKg = 0;
    let totalDeliveredKg = 0;
    let availableStockKg = 0;
    let activeLots = 0;
    const uniquePos = new Set<string>();

    enrichedReceivings.forEach((r) => {
      totalReceivedKg += r.weightKg;
      totalDeliveredKg += r.deliveredKg;
      availableStockKg += r.availableKg;
      if (r.availableKg > 0.009) {
        activeLots += 1;
        uniquePos.add(`${r.buyer}::${r.po}`);
      }
    });

    const totalCapacityKg = racks
      .filter((rk) => rk.isActive)
      .reduce((s, rk) => s + (rk.capacityKg || 0), 0);
    const totalFreeKg = Math.max(0, totalCapacityKg - availableStockKg);
    const warehouseFillPct =
      totalCapacityKg > 0 ? Math.min(100, Math.round((availableStockKg / totalCapacityKg) * 100)) : 0;

    return {
      totalReceivedKg,
      totalDeliveredKg,
      availableStockKg,
      activeLots,
      activePoCount: uniquePos.size,
      totalRacks: racks.filter((rk) => rk.isActive).length,
      totalCapacityKg,
      totalFreeKg,
      warehouseFillPct,
    };
  }, [enrichedReceivings, racks]);

  // Zone-wise utilization summary for modern Rack home page
  const zoneStats = useMemo(() => {
    const map = new Map<string, { zone: string; racksCount: number; capacityKg: number; stockKg: number }>();
    rackSummaries.forEach((s) => {
      if (!s.rack.isActive) return;
      const prev = map.get(s.rack.zone) || {
        zone: s.rack.zone,
        racksCount: 0,
        capacityKg: 0,
        stockKg: 0,
      };
      prev.racksCount += 1;
      prev.capacityKg += s.rack.capacityKg || 0;
      prev.stockKg += s.currentKg;
      map.set(s.rack.zone, prev);
    });
    return Array.from(map.values()).map((z) => ({
      ...z,
      pct: z.capacityKg > 0 ? Math.min(100, Math.round((z.stockKg / z.capacityKg) * 100)) : 0,
    }));
  }, [rackSummaries]);

  // PO-Wise Balance Summary (combining Requirements, Receivings, and Deliveries)
  const poLedgerList = useMemo(() => {
    const map = new Map<
      string,
      {
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
    >();

    enrichedRequirements.forEach((req) => {
      const key = `${req.buyer}___${req.po}`;
      const entry = map.get(key) || {
        key,
        buyer: req.buyer,
        po: req.po,
        style: req.style || '-',
        itemName: req.itemName || '-',
        fileNo: req.fileNo || '-',
        shipDate: req.shipDate || '-',
        requiredKg: 0,
        receivedKg: 0,
        deliveredKg: 0,
        availableKg: 0,
        lotCount: 0,
        activeLots: 0,
        racks: new Set<string>(),
      };
      entry.requiredKg += req.requiredQtyKg;
      map.set(key, entry);
    });

    enrichedReceivings.forEach((r) => {
      const key = `${r.buyer}___${r.po}`;
      const entry = map.get(key) || {
        key,
        buyer: r.buyer,
        po: r.po,
        style: r.style || '-',
        itemName: r.itemName || '-',
        fileNo: r.fileNo || '-',
        shipDate: r.shipDate || '-',
        requiredKg: 0,
        receivedKg: 0,
        deliveredKg: 0,
        availableKg: 0,
        lotCount: 0,
        activeLots: 0,
        racks: new Set<string>(),
      };
      entry.receivedKg += r.weightKg;
      entry.deliveredKg += r.deliveredKg;
      entry.availableKg += r.availableKg;
      entry.lotCount += 1;
      if (r.availableKg > 0.009) {
        entry.activeLots += 1;
        entry.racks.add(r.rackCode);
      }
      map.set(key, entry);
    });

    return Array.from(map.values()).sort((a, b) => b.availableKg - a.availableKg || b.requiredKg - a.requiredKg);
  }, [enrichedRequirements, enrichedReceivings]);

  // ============================================================================
  // RACK STOCK VIEW STATE & SHARED RACK SPLIT HANDLER
  // ============================================================================
  const [rackSearch, setRackSearch] = useState('');
  const [rackZoneFilter, setRackZoneFilter] = useState('ALL');
  const [rackViewMode, setRackViewMode] = useState<'grid' | 'table'>('grid');
  const [selectedRackId, setSelectedRackId] = useState<string | null>(null);
  const [rackDetailShowExhausted, setRackDetailShowExhausted] = useState(false);
  const [showRackFormModal, setShowRackFormModal] = useState(false);
  const [rackForm, setRackForm] = useState({
    id: '',
    code: '',
    zone: 'Zone A (Knit Jersey)',
    capacityKg: '2500',
    description: '',
  });
  const [transferBatchId, setTransferBatchId] = useState<string | null>(null);
  const [transferTargetRackId, setTransferTargetRackId] = useState<string>('');
  const [transferSplitKg, setTransferSplitKg] = useState<string>('');

  const rackZones = useMemo(() => Array.from(new Set(racks.map((r) => r.zone))).filter(Boolean), [racks]);

  const filteredRackSummaries = useMemo(() => {
    const q = rackSearch.trim().toLowerCase();
    return rackSummaries.filter((item) => {
      if (rackZoneFilter !== 'ALL' && item.rack.zone !== rackZoneFilter) return false;
      if (!q) return true;
      if (item.rack.code.toLowerCase().includes(q) || item.rack.zone.toLowerCase().includes(q)) return true;
      return item.rackBatches.some(
        (b) =>
          b.po.toLowerCase().includes(q) ||
          b.buyer.toLowerCase().includes(q) ||
          (b.style || '').toLowerCase().includes(q) ||
          b.color.toLowerCase().includes(q) ||
          b.lotNo.toLowerCase().includes(q) ||
          b.fabricType.toLowerCase().includes(q)
      );
    });
  }, [rackSummaries, rackSearch, rackZoneFilter]);

  const selectedRackSummary = useMemo(
    () => rackSummaries.find((s) => s.rack.id === selectedRackId) || null,
    [rackSummaries, selectedRackId]
  );

  const handleSaveRack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rolePerms?.canManageRacks) return;
    if (!rackForm.code.trim()) {
      showToast('error', 'Rack code is required.');
      return;
    }
    try {
      const existing = racks.find((r) => r.id === rackForm.id);
      await saveFabricRack({
        id: rackForm.id || undefined,
        code: rackForm.code.trim(),
        zone: rackForm.zone.trim() || 'Main Fabric Store',
        capacityKg: Number(rackForm.capacityKg) || 2500,
        description: rackForm.description.trim(),
        createdAt: existing?.createdAt,
      });
      await logFabricAudit({
        action: rackForm.id ? 'Updated Rack' : 'Created Rack',
        module: 'Racks',
        details: `Rack ${rackForm.code.toUpperCase()} (${rackForm.zone}, ${rackForm.capacityKg} kg)`,
        actorUsername: currentUser!.username,
        actorRole: currentUser!.role,
      });
      setShowRackFormModal(false);
      showToast('success', `Rack ${rackForm.code.toUpperCase()} saved.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to save rack.');
    }
  };

  const handleSplitOrMoveRack = async (batch: (typeof enrichedReceivings)[0]) => {
    if (!rolePerms?.canManageRacks || !transferTargetRackId || !currentUser) return;
    const targetRack = racks.find((r) => r.id === transferTargetRackId);
    if (!targetRack || targetRack.id === batch.rackId) return;

    const splitKg = parseFloat(transferSplitKg);
    if (!Number.isFinite(splitKg) || splitKg <= 0) {
      showToast('error', 'Enter a valid positive weight (kg) to transfer or share.');
      return;
    }
    if (splitKg > batch.availableKg + 0.009) {
      showToast('error', `Cannot move ${splitKg.toFixed(2)} kg. Available balance is ${batch.availableKg.toFixed(2)} kg.`);
      return;
    }
    if (batch.deliveredKg > 0 && Math.abs(splitKg - batch.availableKg) <= 0.01 && batch.weightKg > batch.availableKg) {
      // Partial balance transfer from a partially delivered lot -> split only availableKg so past delivery history stays linked cleanly!
    }

    try {
      await splitFabricReceivingToRack(batch, splitKg, targetRack.id, targetRack.code, currentUser.username);
      const isFullMove = splitKg >= batch.weightKg - 0.01;
      await logFabricAudit({
        action: isFullMove ? 'Moved Rack Stock' : 'Shared Fabric Across Racks',
        module: 'Racks',
        details: `${isFullMove ? 'Moved' : 'Shared'} ${splitKg.toFixed(2)} kg of PO ${batch.po} Lot ${batch.lotNo} from Rack ${batch.rackCode} to Rack ${targetRack.code}`,
        actorUsername: currentUser.username,
        actorRole: currentUser.role,
      });
      setTransferBatchId(null);
      setTransferTargetRackId('');
      setTransferSplitKg('');
      showToast(
        'success',
        `${splitKg.toFixed(2)} kg of Lot ${batch.lotNo} placed in Rack ${targetRack.code}.`
      );
    } catch (err: any) {
      showToast('error', err?.message || 'Rack split/transfer failed.');
    }
  };

  // ============================================================================
  // PRE-RECEIVING PO FABRIC REQUIREMENTS STATE & HANDLERS
  // ============================================================================
  const [reqPoSearch, setReqPoSearch] = useState('');
  const [reqBuyerFilter, setReqBuyerFilter] = useState('ALL');
  const [selectedOrderForReq, setSelectedOrderForReq] = useState<SelectedOrderContext | null>(null);
  const [reqForm, setReqForm] = useState({
    fabricType: '',
    color: '',
    gsm: '',
    requiredQtyKg: '',
    supplier: '',
    remark: '',
  });
  const [isSavingReq, setIsSavingReq] = useState(false);
  const [reqTableSearch, setReqTableSearch] = useState('');
  const [editingReq, setEditingReq] = useState<FabricRequirement | null>(null);
  const [editReqQty, setEditReqQty] = useState('');

  const sheetBuyerNames = useMemo(() => {
    const s = new Set<string>();
    allMasterOrders.forEach((o) => {
      if (o._tabSource) s.add(o._tabSource);
    });
    return Array.from(s);
  }, [allMasterOrders]);

  const filterSheetOrders = (queryText: string, buyerFilter: string) => {
    const q = queryText.trim().toLowerCase();
    return allMasterOrders
      .filter((o) => {
        if (!o || !o['PO']) return false;
        if (buyerFilter !== 'ALL' && o._tabSource !== buyerFilter) return false;
        if (!q) return true;
        return (
          String(o['PO'] || '').toLowerCase().includes(q) ||
          String(o['STYLE'] || '').toLowerCase().includes(q) ||
          String(o['ITEM'] || '').toLowerCase().includes(q) ||
          String(o['File No'] || '').toLowerCase().includes(q) ||
          String(o._tabSource || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 50);
  };

  const reqMatchingSheetOrders = useMemo(
    () => filterSheetOrders(reqPoSearch, reqBuyerFilter),
    [allMasterOrders, reqPoSearch, reqBuyerFilter]
  );

  const handleCreateRequirement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rolePerms?.canReceive || !currentUser) return;
    if (!selectedOrderForReq) {
      showToast('error', 'Select a PO from All Buyers first.');
      return;
    }
    const qty = parseFloat(reqForm.requiredQtyKg);
    if (!Number.isFinite(qty) || qty <= 0) {
      showToast('error', 'Enter a valid Required Qty (kg).');
      return;
    }
    if (!reqForm.fabricType.trim() || !reqForm.color.trim()) {
      showToast('error', 'Fabric Type and Color are required.');
      return;
    }

    setIsSavingReq(true);
    try {
      await createFabricRequirement({
        buyer: selectedOrderForReq.buyer,
        po: selectedOrderForReq.po,
        style: selectedOrderForReq.style,
        itemName: selectedOrderForReq.itemName,
        fileNo: selectedOrderForReq.fileNo,
        shipDate: selectedOrderForReq.shipDate,
        orderDzn: selectedOrderForReq.orderDzn,
        fabricType: reqForm.fabricType.trim(),
        color: reqForm.color.trim(),
        gsm: reqForm.gsm.trim(),
        requiredQtyKg: Number(qty.toFixed(2)),
        supplier: reqForm.supplier.trim(),
        remark: reqForm.remark.trim(),
        createdBy: currentUser.username,
      });

      await logFabricAudit({
        action: 'Booked Fabric Requirement',
        module: 'Requirements',
        details: `PO ${selectedOrderForReq.po} (${selectedOrderForReq.buyer}): ${reqForm.fabricType} · ${reqForm.color} — Required ${qty.toFixed(2)} kg`,
        actorUsername: currentUser.username,
        actorRole: currentUser.role,
      });

      setReqForm((p) => ({
        ...p,
        fabricType: '',
        color: '',
        gsm: '',
        requiredQtyKg: '',
        remark: '',
      }));
      showToast('success', `Saved fabric requirement (${qty.toFixed(2)} kg) for PO ${selectedOrderForReq.po}.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to save requirement.');
    } finally {
      setIsSavingReq(false);
    }
  };

  const filteredRequirementsTable = useMemo(() => {
    const q = reqTableSearch.trim().toLowerCase();
    if (!q) return enrichedRequirements;
    return enrichedRequirements.filter(
      (r) =>
        r.po.toLowerCase().includes(q) ||
        r.buyer.toLowerCase().includes(q) ||
        (r.style || '').toLowerCase().includes(q) ||
        r.fabricType.toLowerCase().includes(q) ||
        r.color.toLowerCase().includes(q) ||
        (r.supplier || '').toLowerCase().includes(q)
    );
  }, [enrichedRequirements, reqTableSearch]);

  // ============================================================================
  // CHALLAN-WISE MULTI-PO BULK RECEIVING + SHARED RACK ALLOCATION
  // ============================================================================
  const [recPoSearch, setRecPoSearch] = useState('');
  const [recBuyerFilter, setRecBuyerFilter] = useState('ALL');
  const [selectedOrderForRec, setSelectedOrderForRec] = useState<SelectedOrderContext | null>(null);
  const [isManualPoMode, setIsManualPoMode] = useState(false);
  const [manualPoForm, setManualPoForm] = useState<SelectedOrderContext>({
    buyer: '',
    po: '',
    style: '',
    itemName: '',
    fileNo: '',
    shipDate: '',
    orderDzn: '',
  });

  // Shared Challan Header
  const [challanHeader, setChallanHeader] = useState({
    challanNo: '',
    receiveDate: todayISO(),
    supplier: '',
    remark: '',
  });

  // Bulk PO Lines queued inside current Challan
  const [challanLines, setChallanLines] = useState<ChallanDraftLine[]>([]);
  const [isSubmittingChallan, setIsSubmittingChallan] = useState(false);

  // Receiving Register View State
  const [recRegisterView, setRecRegisterView] = useState<'challan' | 'items'>('challan');
  const [recLedgerSearch, setRecLedgerSearch] = useState('');
  const [expandedChallans, setExpandedChallans] = useState<Record<string, boolean>>({});

  const defaultRackId = racks.find((r) => r.isActive)?.id || racks[0]?.id || '';

  const recMatchingSheetOrders = useMemo(
    () => filterSheetOrders(recPoSearch, recBuyerFilter),
    [allMasterOrders, recPoSearch, recBuyerFilter]
  );

  // Requirements matching the currently selected PO in Receiving
  const selectedPoRequirements = useMemo(() => {
    const activePo = isManualPoMode ? manualPoForm.po : selectedOrderForRec?.po;
    const activeBuyer = isManualPoMode ? manualPoForm.buyer : selectedOrderForRec?.buyer;
    if (!activePo) return [];
    return enrichedRequirements.filter(
      (req) =>
        req.po.trim().toLowerCase() === activePo.trim().toLowerCase() &&
        (!activeBuyer || req.buyer.trim().toLowerCase() === activeBuyer.trim().toLowerCase())
    );
  }, [enrichedRequirements, selectedOrderForRec, isManualPoMode, manualPoForm]);

  const handleSelectSheetOrderForRec = (order: any) => {
    setIsManualPoMode(false);
    setSelectedOrderForRec({
      buyer: String(order._tabSource || 'Unknown').trim(),
      po: String(order['PO'] || '').trim(),
      style: String(order['STYLE'] || '').trim(),
      itemName: String(order['ITEM'] || '').trim(),
      fileNo: String(order['File No'] || '').trim(),
      shipDate: String(order['SHIP DATE'] || '').trim(),
      orderDzn: String(order['DZN'] || '').trim(),
    });
  };

  const addRequirementToChallan = (req: (typeof enrichedRequirements)[0]) => {
    const poCtx = isManualPoMode ? manualPoForm : selectedOrderForRec;
    if (!poCtx) return;
    if (!challanHeader.supplier && req.supplier) {
      setChallanHeader((prev) => ({ ...prev, supplier: req.supplier || prev.supplier }));
    }
    const suggestedQty = req.pendingKg > 0 ? String(req.pendingKg) : '';
    const line: ChallanDraftLine = {
      localId: `cl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      buyer: req.buyer,
      po: req.po,
      style: req.style || poCtx.style,
      itemName: req.itemName || poCtx.itemName,
      fileNo: req.fileNo || poCtx.fileNo,
      shipDate: req.shipDate || poCtx.shipDate,
      orderDzn: req.orderDzn || poCtx.orderDzn,
      requirementId: req.id,
      requiredQtyKg: req.requiredQtyKg,
      alreadyReceivedKg: req.receivedKg,
      fabricType: req.fabricType,
      color: req.color,
      gsm: req.gsm || '',
      weightKg: suggestedQty,
      rollCount: '',
      lotNo: '',
      rackId: defaultRackId,
      isSplitRack: false,
      rackSplits: [
        { rackId: defaultRackId, weightKg: suggestedQty, rollCount: '' },
        { rackId: racks[1]?.id || defaultRackId, weightKg: '', rollCount: '' },
      ],
      remark: '',
    };
    setChallanLines((prev) => [...prev, line]);
  };

  const addAllPendingReqsForPoToChallan = () => {
    const pending = selectedPoRequirements.filter((r) => r.pendingKg > 0.009);
    const source = pending.length > 0 ? pending : selectedPoRequirements;
    if (source.length === 0) return;
    source.forEach((req) => addRequirementToChallan(req));
    showToast('success', `Added ${source.length} booked fabric line(s) for PO ${source[0].po} to Challan.`);
  };

  const addCustomPoLineToChallan = () => {
    const poCtx = isManualPoMode ? manualPoForm : selectedOrderForRec;
    if (!poCtx || !poCtx.po.trim() || !poCtx.buyer.trim()) {
      showToast('error', 'Select a PO first before adding a line to the challan.');
      return;
    }
    const line: ChallanDraftLine = {
      localId: `cl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      buyer: poCtx.buyer.trim(),
      po: poCtx.po.trim(),
      style: poCtx.style.trim(),
      itemName: poCtx.itemName.trim(),
      fileNo: poCtx.fileNo.trim(),
      shipDate: poCtx.shipDate.trim(),
      orderDzn: poCtx.orderDzn.trim(),
      requirementId: '',
      requiredQtyKg: 0,
      alreadyReceivedKg: 0,
      fabricType: '',
      color: '',
      gsm: '',
      weightKg: '',
      rollCount: '',
      lotNo: '',
      rackId: defaultRackId,
      isSplitRack: false,
      rackSplits: [
        { rackId: defaultRackId, weightKg: '', rollCount: '' },
        { rackId: racks[1]?.id || defaultRackId, weightKg: '', rollCount: '' },
      ],
      remark: '',
    };
    setChallanLines((prev) => [...prev, line]);
  };

  const updateChallanLine = (localId: string, patch: Partial<ChallanDraftLine>) => {
    setChallanLines((prev) => prev.map((l) => (l.localId === localId ? { ...l, ...patch } : l)));
  };

  const updateChallanLineSplit = (
    localId: string,
    splitIdx: number,
    patch: Partial<RackAllocationSplit>
  ) => {
    setChallanLines((prev) =>
      prev.map((l) => {
        if (l.localId !== localId) return l;
        const nextSplits = l.rackSplits.map((sp, i) => (i === splitIdx ? { ...sp, ...patch } : sp));
        return { ...l, rackSplits: nextSplits };
      })
    );
  };

  const handleSaveFullChallan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rolePerms?.canReceive || !currentUser) return;
    if (!challanHeader.challanNo.trim() || !challanHeader.supplier.trim()) {
      showToast('error', 'Challan No and Supplier are required in the Challan Header.');
      return;
    }
    if (challanLines.length === 0) {
      showToast('error', 'Add at least one PO fabric line into the Challan table.');
      return;
    }

    const batchItems: Array<Omit<FabricReceiving, 'id' | 'createdAt' | 'updatedAt'>> = [];
    const challanGroupId = `chg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    for (let i = 0; i < challanLines.length; i++) {
      const line = challanLines[i];
      const rowLabel = `Line #${i + 1} (PO ${line.po})`;
      if (!line.fabricType.trim() || !line.color.trim() || !line.lotNo.trim()) {
        showToast('error', `${rowLabel}: Fabric Type, Color, and Lot No are required.`);
        return;
      }

      if (!line.isSplitRack) {
        const w = parseFloat(line.weightKg);
        if (!Number.isFinite(w) || w <= 0) {
          showToast('error', `${rowLabel}: Enter a valid positive Receiving Qty (kg).`);
          return;
        }
        const rack = racks.find((r) => r.id === line.rackId) || racks[0];
        if (!rack) {
          showToast('error', `${rowLabel}: Select a storage rack.`);
          return;
        }
        batchItems.push({
          buyer: line.buyer,
          po: line.po,
          style: line.style,
          itemName: line.itemName,
          fileNo: line.fileNo,
          shipDate: line.shipDate,
          orderDzn: line.orderDzn,
          requirementId: line.requirementId,
          requiredQtyKg: line.requiredQtyKg,
          challanGroupId,
          rackId: rack.id,
          rackCode: rack.code,
          fabricType: line.fabricType.trim(),
          color: line.color.trim(),
          gsm: line.gsm.trim(),
          weightKg: Number(w.toFixed(2)),
          rollCount: parseInt(line.rollCount || '0', 10) || 0,
          lotNo: line.lotNo.trim(),
          challanNo: challanHeader.challanNo.trim(),
          receiveDate: challanHeader.receiveDate || todayISO(),
          supplier: challanHeader.supplier.trim(),
          remark: (line.remark.trim() || challanHeader.remark.trim()),
          createdBy: currentUser.username,
        });
      } else {
        // Shared Multi-Rack Split validation
        const totalLineWeight = parseFloat(line.weightKg);
        if (!Number.isFinite(totalLineWeight) || totalLineWeight <= 0) {
          showToast('error', `${rowLabel}: Enter total Receiving Qty (kg) before splitting racks.`);
          return;
        }
        const validSplits = line.rackSplits.filter((sp) => parseFloat(sp.weightKg) > 0);
        if (validSplits.length < 1) {
          showToast('error', `${rowLabel}: Enter positive kg in at least one shared rack.`);
          return;
        }
        const splitSum = validSplits.reduce((s, sp) => s + (parseFloat(sp.weightKg) || 0), 0);
        if (Math.abs(splitSum - totalLineWeight) > 0.05) {
          showToast(
            'error',
            `${rowLabel}: Shared rack sum (${splitSum.toFixed(2)} kg) must equal total Receiving Qty (${totalLineWeight.toFixed(2)} kg).`
          );
          return;
        }
        for (const sp of validSplits) {
          const rack = racks.find((r) => r.id === sp.rackId) || racks[0];
          const spWeight = parseFloat(sp.weightKg);
          batchItems.push({
            buyer: line.buyer,
            po: line.po,
            style: line.style,
            itemName: line.itemName,
            fileNo: line.fileNo,
            shipDate: line.shipDate,
            orderDzn: line.orderDzn,
            requirementId: line.requirementId,
            requiredQtyKg: line.requiredQtyKg,
            challanGroupId,
            rackId: rack.id,
            rackCode: rack.code,
            fabricType: line.fabricType.trim(),
            color: line.color.trim(),
            gsm: line.gsm.trim(),
            weightKg: Number(spWeight.toFixed(2)),
            rollCount: parseInt(sp.rollCount || '0', 10) || 0,
            lotNo: line.lotNo.trim(),
            challanNo: challanHeader.challanNo.trim(),
            receiveDate: challanHeader.receiveDate || todayISO(),
            supplier: challanHeader.supplier.trim(),
            remark: `${line.remark.trim() || challanHeader.remark.trim()}${validSplits.length > 1 ? ` [Shared Rack ${validSplits.length}-way]` : ''}`.trim(),
            createdBy: currentUser.username,
          });
        }
      }
    }

    setIsSubmittingChallan(true);
    try {
      await createFabricReceivingBatch(batchItems);
      const totalSavedKg = batchItems.reduce((s, item) => s + item.weightKg, 0);
      const uniquePos = Array.from(new Set(batchItems.map((b) => b.po)));
      await logFabricAudit({
        action: 'Challan Bulk Received',
        module: 'Receiving',
        details: `Challan ${challanHeader.challanNo} (${challanHeader.supplier}): ${totalSavedKg.toFixed(2)} kg across ${uniquePos.length} PO(s) (${batchItems.length} rack batch entries)`,
        actorUsername: currentUser.username,
        actorRole: currentUser.role,
      });

      setChallanLines([]);
      setChallanHeader((prev) => ({ ...prev, challanNo: '', remark: '' }));
      showToast(
        'success',
        `Saved Challan ${challanHeader.challanNo} (${fmtKg(totalSavedKg)} kg across ${uniquePos.length} POs).`
      );
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to save bulk challan.');
    } finally {
      setIsSubmittingChallan(false);
    }
  };

  const handleDeleteReceivingRecord = async (rec: (typeof enrichedReceivings)[0]) => {
    if (!rolePerms?.canDeleteRecords || !currentUser) return;
    if (rec.deliveryCount > 0) {
      showToast('error', 'Cannot delete a receiving entry that already has deliveries. Delete deliveries first.');
      return;
    }
    try {
      await deleteFabricReceiving(rec.id);
      await logFabricAudit({
        action: 'Deleted Receiving',
        module: 'Receiving',
        details: `Removed receiving ${rec.weightKg} kg PO ${rec.po} Lot ${rec.lotNo} (Rack ${rec.rackCode})`,
        actorUsername: currentUser.username,
        actorRole: currentUser.role,
      });
      showToast('success', `Receiving entry for PO ${rec.po} removed.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Delete failed.');
    }
  };

  const filteredReceivingsLedger = useMemo(() => {
    const q = recLedgerSearch.trim().toLowerCase();
    if (!q) return enrichedReceivings;
    return enrichedReceivings.filter(
      (r) =>
        r.po.toLowerCase().includes(q) ||
        r.buyer.toLowerCase().includes(q) ||
        (r.style || '').toLowerCase().includes(q) ||
        r.fabricType.toLowerCase().includes(q) ||
        r.color.toLowerCase().includes(q) ||
        r.lotNo.toLowerCase().includes(q) ||
        r.challanNo.toLowerCase().includes(q) ||
        r.supplier.toLowerCase().includes(q) ||
        r.rackCode.toLowerCase().includes(q)
    );
  }, [enrichedReceivings, recLedgerSearch]);

  // Group receivings by Challan No + Receive Date + Supplier for "By Challan" Register View
  const challanGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        groupKey: string;
        challanNo: string;
        receiveDate: string;
        supplier: string;
        totalWeightKg: number;
        totalBalanceKg: number;
        pos: Set<string>;
        buyers: Set<string>;
        racks: Set<string>;
        items: typeof enrichedReceivings;
      }
    >();

    filteredReceivingsLedger.forEach((r) => {
      const groupKey = r.challanGroupId || `${r.challanNo}__${r.receiveDate}__${r.supplier}`;
      const existing = map.get(groupKey) || {
        groupKey,
        challanNo: r.challanNo,
        receiveDate: r.receiveDate,
        supplier: r.supplier,
        totalWeightKg: 0,
        totalBalanceKg: 0,
        pos: new Set<string>(),
        buyers: new Set<string>(),
        racks: new Set<string>(),
        items: [],
      };
      existing.totalWeightKg += r.weightKg;
      existing.totalBalanceKg += r.availableKg;
      existing.pos.add(r.po);
      existing.buyers.add(r.buyer);
      existing.racks.add(r.rackCode);
      existing.items.push(r);
      map.set(groupKey, existing);
    });

    return Array.from(map.values());
  }, [filteredReceivingsLedger]);

  // ============================================================================
  // DELIVERY / SUPPLY STATE & HANDLERS (Call by PO Search, Full or Partial)
  // ============================================================================
  const [delPoSearch, setDelPoSearch] = useState('');
  const [delShowExhausted, setDelShowExhausted] = useState(false);
  const [selectedBatchIdForDelivery, setSelectedBatchIdForDelivery] = useState<string | null>(null);
  const [deliveryMode, setDeliveryMode] = useState<'Full' | 'Partial'>('Partial');
  const [delForm, setDelForm] = useState({
    supplyNo: '',
    weightKg: '',
    rollCount: '',
    issuedTo: 'Cutting Floor',
    receiverName: '',
    deliveryDate: todayISO(),
    remark: '',
  });
  const [isSubmittingDel, setIsSubmittingDel] = useState(false);
  const [delHistorySearch, setDelHistorySearch] = useState('');
  const [printSlipDelivery, setPrintSlipDelivery] = useState<FabricDelivery | null>(null);

  const suggestSupplyNo = () => {
    const datePart = todayISO().replace(/-/g, '').slice(2);
    const seq = String(deliveries.length + 1).padStart(3, '0');
    return `SUP-${datePart}-${seq}`;
  };

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
        r.color.toLowerCase().includes(q)
      );
    });
  }, [enrichedReceivings, delPoSearch, delShowExhausted]);

  const selectedDeliveryBatch = useMemo(
    () => enrichedReceivings.find((r) => r.id === selectedBatchIdForDelivery) || null,
    [enrichedReceivings, selectedBatchIdForDelivery]
  );

  const selectBatchForDelivery = (batch: (typeof enrichedReceivings)[0], mode: 'Full' | 'Partial' = 'Partial') => {
    setSelectedBatchIdForDelivery(batch.id);
    setDeliveryMode(mode);
    setDelForm({
      supplyNo: suggestSupplyNo(),
      weightKg: mode === 'Full' ? String(batch.availableKg) : '',
      rollCount: mode === 'Full' && batch.availableRolls > 0 ? String(batch.availableRolls) : '',
      issuedTo: 'Cutting Floor',
      receiverName: '',
      deliveryDate: todayISO(),
      remark: '',
    });
  };

  const handleToggleDeliveryMode = (mode: 'Full' | 'Partial') => {
    setDeliveryMode(mode);
    if (selectedDeliveryBatch && mode === 'Full') {
      setDelForm((prev) => ({
        ...prev,
        weightKg: String(selectedDeliveryBatch.availableKg),
        rollCount: selectedDeliveryBatch.availableRolls > 0 ? String(selectedDeliveryBatch.availableRolls) : prev.rollCount,
      }));
    }
  };

  const handleCreateDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rolePerms?.canDeliver || !currentUser || !selectedDeliveryBatch) return;

    const weight = parseFloat(delForm.weightKg);
    if (!Number.isFinite(weight) || weight <= 0) {
      showToast('error', 'Enter a valid positive delivery weight (kg).');
      return;
    }
    if (weight > selectedDeliveryBatch.availableKg + 0.009) {
      showToast(
        'error',
        `Cannot deliver ${weight.toFixed(2)} kg. Available balance is ${selectedDeliveryBatch.availableKg.toFixed(2)} kg.`
      );
      return;
    }
    if (!delForm.supplyNo.trim() || !delForm.issuedTo.trim()) {
      showToast('error', 'Supply No and Issued To destination are required.');
      return;
    }

    const effectiveType: 'Full' | 'Partial' =
      weight >= selectedDeliveryBatch.availableKg - 0.01 ? 'Full' : deliveryMode;

    setIsSubmittingDel(true);
    try {
      await createFabricDelivery({
        receivingId: selectedDeliveryBatch.id,
        supplyNo: delForm.supplyNo.trim(),
        buyer: selectedDeliveryBatch.buyer,
        po: selectedDeliveryBatch.po,
        style: selectedDeliveryBatch.style || '',
        itemName: selectedDeliveryBatch.itemName || '',
        fileNo: selectedDeliveryBatch.fileNo || '',
        shipDate: selectedDeliveryBatch.shipDate || '',
        rackCode: selectedDeliveryBatch.rackCode,
        fabricType: selectedDeliveryBatch.fabricType,
        color: selectedDeliveryBatch.color,
        gsm: selectedDeliveryBatch.gsm || '',
        lotNo: selectedDeliveryBatch.lotNo,
        deliveryType: effectiveType,
        weightKg: Number(weight.toFixed(2)),
        rollCount: parseInt(delForm.rollCount || '0', 10) || 0,
        issuedTo: delForm.issuedTo.trim(),
        receiverName: delForm.receiverName.trim(),
        deliveryDate: delForm.deliveryDate || todayISO(),
        remark: delForm.remark.trim(),
        createdBy: currentUser.username,
      });

      await logFabricAudit({
        action: `Fabric ${effectiveType} Delivery`,
        module: 'Delivery',
        details: `Supply ${delForm.supplyNo}: ${weight.toFixed(2)} kg (${effectiveType}) for PO ${selectedDeliveryBatch.po} Lot ${selectedDeliveryBatch.lotNo} to ${delForm.issuedTo}`,
        actorUsername: currentUser.username,
        actorRole: currentUser.role,
      });

      showToast(
        'success',
        `${effectiveType} delivery ${delForm.supplyNo} (${weight.toFixed(2)} kg) recorded for PO ${selectedDeliveryBatch.po}.`
      );
      setSelectedBatchIdForDelivery(null);
      setDelForm((prev) => ({
        ...prev,
        supplyNo: '',
        weightKg: '',
        rollCount: '',
        receiverName: '',
        remark: '',
      }));
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to record fabric delivery.');
    } finally {
      setIsSubmittingDel(false);
    }
  };

  const handleDeleteDeliveryRecord = async (del: FabricDelivery) => {
    if (!rolePerms?.canDeleteRecords || !currentUser) return;
    try {
      await deleteFabricDelivery(del.id);
      await logFabricAudit({
        action: 'Deleted Delivery',
        module: 'Delivery',
        details: `Reversed supply ${del.supplyNo} (${del.weightKg} kg) for PO ${del.po}`,
        actorUsername: currentUser.username,
        actorRole: currentUser.role,
      });
      showToast('success', `Supply ${del.supplyNo} removed and stock restored.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Delete failed.');
    }
  };

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
        d.issuedTo.toLowerCase().includes(q) ||
        (d.receiverName || '').toLowerCase().includes(q)
    );
  }, [deliveries, delHistorySearch]);

  // ============================================================================
  // PO LEDGER FILTER
  // ============================================================================
  const [ledgerSearch, setLedgerSearch] = useState('');
  const filteredPoLedger = useMemo(() => {
    const q = ledgerSearch.trim().toLowerCase();
    if (!q) return poLedgerList;
    return poLedgerList.filter(
      (p) =>
        p.po.toLowerCase().includes(q) ||
        p.buyer.toLowerCase().includes(q) ||
        p.style.toLowerCase().includes(q) ||
        p.itemName.toLowerCase().includes(q) ||
        p.fileNo.toLowerCase().includes(q)
    );
  }, [poLedgerList, ledgerSearch]);

  // ============================================================================
  // MASTER ADMIN USER & ROLE MANAGEMENT STATE
  // ============================================================================
  const [newUserForm, setNewUserForm] = useState({
    username: '',
    fullName: '',
    password: '',
    role: 'receiver' as FabricRole,
    department: 'Fabric Store',
  });
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [resetPwdUser, setResetPwdUser] = useState<FabricUser | null>(null);
  const [resetPwdValue, setResetPwdValue] = useState('');

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rolePerms?.canManageUsers || !currentUser) return;
    if (!newUserForm.username.trim() || !newUserForm.fullName.trim() || newUserForm.password.length < 4) {
      showToast('error', 'Username, Full Name, and Password (min 4 chars) are required.');
      return;
    }
    setIsCreatingUser(true);
    try {
      await createFabricUser({
        username: newUserForm.username.trim(),
        fullName: newUserForm.fullName.trim(),
        password: newUserForm.password,
        role: newUserForm.role,
        department: newUserForm.department.trim(),
        createdBy: currentUser.username,
      });
      await logFabricAudit({
        action: 'Created User Account',
        module: 'Users',
        details: `Created @${newUserForm.username.toLowerCase()} with role ${ROLE_META[newUserForm.role].label}`,
        actorUsername: currentUser.username,
        actorRole: currentUser.role,
      });
      setNewUserForm({
        username: '',
        fullName: '',
        password: '',
        role: 'receiver',
        department: 'Fabric Store',
      });
      showToast('success', 'User account created successfully.');
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to create user.');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleChangeUserRole = async (targetUser: FabricUser, newRole: FabricRole) => {
    if (!rolePerms?.canManageUsers || !currentUser) return;
    if (
      targetUser.role === 'master_admin' &&
      newRole !== 'master_admin' &&
      users.filter((u) => u.role === 'master_admin' && u.isActive).length <= 1
    ) {
      showToast('error', 'At least one active Master Admin must remain.');
      return;
    }
    try {
      await updateFabricUser(targetUser.id, { role: newRole }, targetUser);
      await logFabricAudit({
        action: 'Updated User Role',
        module: 'Users',
        details: `Changed @${targetUser.username} role from ${ROLE_META[targetUser.role].label} to ${ROLE_META[newRole].label}`,
        actorUsername: currentUser.username,
        actorRole: currentUser.role,
      });
      showToast('success', `Updated @${targetUser.username} to ${ROLE_META[newRole].label}.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Role update failed.');
    }
  };

  const handleToggleUserActive = async (targetUser: FabricUser) => {
    if (!rolePerms?.canManageUsers || !currentUser) return;
    if (targetUser.id === currentUser.id) {
      showToast('error', 'You cannot disable your own active Master Admin account.');
      return;
    }
    try {
      await updateFabricUser(targetUser.id, { isActive: !targetUser.isActive }, targetUser);
      await logFabricAudit({
        action: targetUser.isActive ? 'Disabled User' : 'Enabled User',
        module: 'Users',
        details: `${targetUser.isActive ? 'Suspended' : 'Activated'} @${targetUser.username}`,
        actorUsername: currentUser.username,
        actorRole: currentUser.role,
      });
      showToast('success', `User @${targetUser.username} ${targetUser.isActive ? 'disabled' : 'enabled'}.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to toggle user status.');
    }
  };

  const handleResetUserPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rolePerms?.canManageUsers || !currentUser || !resetPwdUser) return;
    if (resetPwdValue.trim().length < 4) {
      showToast('error', 'Password must be at least 4 characters.');
      return;
    }
    try {
      await updateFabricUser(resetPwdUser.id, { newPassword: resetPwdValue.trim() }, resetPwdUser);
      await logFabricAudit({
        action: 'Reset Password',
        module: 'Users',
        details: `Master Admin reset password for @${resetPwdUser.username}`,
        actorUsername: currentUser.username,
        actorRole: currentUser.role,
      });
      showToast('success', `Password updated for @${resetPwdUser.username}.`);
      setResetPwdUser(null);
      setResetPwdValue('');
    } catch (err: any) {
      showToast('error', err?.message || 'Password reset failed.');
    }
  };

  const handleDeleteUser = async (targetUser: FabricUser) => {
    if (!rolePerms?.canManageUsers || !currentUser) return;
    if (targetUser.id === currentUser.id) {
      showToast('error', 'You cannot delete your own account.');
      return;
    }
    if (
      targetUser.role === 'master_admin' &&
      users.filter((u) => u.role === 'master_admin' && u.isActive).length <= 1
    ) {
      showToast('error', 'Cannot delete the last active Master Admin.');
      return;
    }
    try {
      await deleteFabricUser(targetUser.id);
      await logFabricAudit({
        action: 'Deleted User',
        module: 'Users',
        details: `Deleted account @${targetUser.username}`,
        actorUsername: currentUser.username,
        actorRole: currentUser.role,
      });
      showToast('success', `Account @${targetUser.username} deleted.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Delete failed.');
    }
  };

  // ============================================================================
  // UNAUTHENTICATED VIEW (Master Admin username/password strictly hidden)
  // ============================================================================
  if (!currentUser) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 md:p-10">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-11 w-11 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Lock size={20} />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
                Fabric Receiving & Supply Management
              </h2>
              <p className="text-xs text-slate-500">
                Authorized Store & Inventory Control · Felix Fashions Ltd
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 mb-5 leading-relaxed">
            Sign in with your assigned Fabric Store credentials to access rack inventory, fabric booking, challan receiving, and supply operations.
          </div>

          {loginError && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="text-rose-600 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Username</label>
              <input
                type="text"
                required
                autoFocus
                autoComplete="username"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="Enter your username"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showLoginPwd ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-3.5 py-2.5 pr-10 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  aria-label="Toggle password visibility"
                >
                  {showLoginPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn || isBootstrapping}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-xl transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <KeyRound size={16} />
              <span>{isLoggingIn ? 'Verifying...' : 'Sign In to Fabric Store'}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ============================================================================
  // AUTHENTICATED FABRIC STORE WORKSPACE
  // ============================================================================
  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl border shadow-lg text-xs font-bold flex items-center gap-2 ${
            toast.type === 'success'
              ? 'bg-emerald-900 text-white border-emerald-700'
              : 'bg-rose-900 text-white border-rose-700'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Top Store Workspace Header & Sub-Navigation */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
              Fabric Receiving & Supply Management
            </h2>
            <span className="text-xs text-slate-400">·</span>
            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md border ${rolePerms?.badgeClass}`}>
              {rolePerms?.label}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Signed in as <span className="font-bold text-slate-800">{currentUser.fullName}</span> (@{currentUser.username}) · {rolePerms?.summary}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 overflow-x-auto">
            <button
              onClick={() => setActiveSubTab('racks')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'racks'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Warehouse size={14} />
              <span>Rack Stock</span>
            </button>

            <button
              onClick={() => setActiveSubTab('requirements')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'requirements'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookmarkCheck size={14} />
              <span>Fabric Booking</span>
            </button>

            <button
              onClick={() => setActiveSubTab('receiving')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'receiving'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PackagePlus size={14} />
              <span>Receiving (Challan)</span>
            </button>

            <button
              onClick={() => setActiveSubTab('delivery')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'delivery'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Truck size={14} />
              <span>Delivery</span>
            </button>

            <button
              onClick={() => setActiveSubTab('ledger')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'ledger'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardList size={14} />
              <span>PO Balance</span>
            </button>

            {rolePerms?.canManageUsers && (
              <button
                onClick={() => setActiveSubTab('users')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer flex items-center gap-1.5 ${
                  activeSubTab === 'users'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <Users size={14} />
                <span>Users & Roles</span>
              </button>
            )}
          </div>

          <button
            onClick={handleSignOut}
            className="px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 text-slate-700 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
            title="Lock Fabric Store session"
          >
            <LogOut size={14} />
            <span>Lock</span>
          </button>
        </div>
      </div>

      {/* ======================================================================== */}
      {/* SUB-TAB 1: MODERN RACK-WISE FABRIC STOCK SUMMARY (Home Rack Page)        */}
      {/* ======================================================================== */}
      {activeSubTab === 'racks' && (
        <div className="space-y-5">
          {/* Warehouse Architectural Hero Strip */}
          <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-5 md:p-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-5 space-y-2">
                <p className="text-xs font-semibold text-slate-400">
                  Warehouse Live Overview · {overallTotals.totalRacks} Active Racks
                </p>
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl md:text-4xl font-extrabold font-mono tabular-nums tracking-tight text-white">
                    {fmtKg(overallTotals.availableStockKg)}
                  </span>
                  <span className="text-sm font-semibold text-slate-300">
                    kg in stock
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono tabular-nums">
                  Free Space: <span className="text-emerald-400 font-bold">{fmtKg(overallTotals.totalFreeKg)} kg</span>
                  <span className="mx-2 text-slate-600">/</span>
                  Total Capacity: <span className="text-slate-200">{fmtKg(overallTotals.totalCapacityKg)} kg</span> ({overallTotals.warehouseFillPct}% occupied)
                </p>

                <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-400 block">Received</span>
                    <span className="font-mono tabular-nums font-bold text-emerald-400 text-sm">
                      {fmtKg(overallTotals.totalReceivedKg)} kg
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Delivered</span>
                    <span className="font-mono tabular-nums font-bold text-sky-400 text-sm">
                      {fmtKg(overallTotals.totalDeliveredKg)} kg
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Active Lots / POs</span>
                    <span className="font-mono tabular-nums font-bold text-white text-sm">
                      {overallTotals.activeLots} / {overallTotals.activePoCount}
                    </span>
                  </div>
                </div>
              </div>

              {/* Zone-by-Zone Capacity Bars */}
              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {zoneStats.map((zs) => {
                  const isSelected = rackZoneFilter === zs.zone;
                  return (
                    <button
                      key={zs.zone}
                      type="button"
                      onClick={() =>
                        setRackZoneFilter((prev) => (prev === zs.zone ? 'ALL' : zs.zone))
                      }
                      className={`text-left p-3.5 rounded-xl border transition cursor-pointer ${
                        isSelected
                          ? 'bg-slate-800 border-emerald-400'
                          : 'bg-slate-800/50 border-slate-700/80 hover:border-slate-500'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-bold text-white truncate">{zs.zone}</span>
                        <span className="text-xs font-mono tabular-nums font-bold text-emerald-400 shrink-0">
                          {zs.pct}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden mb-2">
                        <div
                          className={`h-full rounded-full ${
                            zs.pct >= 90 ? 'bg-rose-500' : zs.pct >= 65 ? 'bg-amber-400' : 'bg-emerald-400'
                          }`}
                          style={{ width: `${zs.pct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-300">
                        <span>{fmtKg(zs.stockKg)} kg</span>
                        <span className="text-slate-400">{zs.racksCount} racks</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Search, Zone Filter, View Toggle & Add Rack Toolbar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-2.5 flex-wrap">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  value={rackSearch}
                  onChange={(e) => setRackSearch(e.target.value)}
                  placeholder="Search rack code, PO, buyer, style, color, or lot..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <select
                value={rackZoneFilter}
                onChange={(e) => setRackZoneFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 outline-none"
              >
                <option value="ALL">All Zones ({racks.length})</option>
                {rackZones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  onClick={() => setRackViewMode('grid')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer ${
                    rackViewMode === 'grid' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  <LayoutGrid size={13} />
                  <span>Grid</span>
                </button>
                <button
                  onClick={() => setRackViewMode('table')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer ${
                    rackViewMode === 'table' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  <TableIcon size={13} />
                  <span>Table</span>
                </button>
              </div>

              <button
                onClick={() =>
                  exportCsvFile(
                    `rack_stock_summary_${todayISO()}.csv`,
                    ['Rack Code', 'Zone', 'Capacity (kg)', 'Current Stock (kg)', 'Free Space (kg)', 'Fill %', 'Active Lots', 'Received (kg)', 'Delivered (kg)', 'Buyers', 'POs'],
                    filteredRackSummaries.map((s) => [
                      s.rack.code,
                      s.rack.zone,
                      s.rack.capacityKg,
                      s.currentKg.toFixed(2),
                      s.freeCapacityKg.toFixed(2),
                      `${s.utilizationPct}%`,
                      s.activeBatches.length,
                      s.receivedKg.toFixed(2),
                      s.deliveredKg.toFixed(2),
                      s.buyers.join(' | '),
                      s.pos.join(' | '),
                    ])
                  )
                }
                className="px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Download size={14} />
                <span>CSV</span>
              </button>

              {rolePerms?.canManageRacks && (
                <button
                  onClick={() => {
                    setRackForm({
                      id: '',
                      code: '',
                      zone: rackZones[0] || 'Zone A (Knit Jersey)',
                      capacityKg: '2500',
                      description: '',
                    });
                    setShowRackFormModal(true);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Add Rack</span>
                </button>
              )}
            </div>
          </div>

          {/* Rack Cards or Compact Matrix Table */}
          {filteredRackSummaries.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 text-sm">
              No racks match your current filter.
            </div>
          ) : rackViewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredRackSummaries.map((item) => {
                const hasStock = item.currentKg > 0.009;
                const isNearFull = item.utilizationPct >= 90;
                const isMedium = item.utilizationPct >= 65 && item.utilizationPct < 90;
                const ringColor = isNearFull
                  ? '#e11d48'
                  : isMedium
                  ? '#d97706'
                  : hasStock
                  ? '#059669'
                  : '#cbd5e1';
                const radius = 18;
                const circumference = 2 * Math.PI * radius;
                const dashOffset = circumference - (item.utilizationPct / 100) * circumference;

                return (
                  <button
                    key={item.rack.id}
                    type="button"
                    onClick={() => {
                      setSelectedRackId(item.rack.id);
                      setRackDetailShowExhausted(false);
                      setTransferBatchId(null);
                    }}
                    className={`group text-left bg-white rounded-2xl border transition cursor-pointer overflow-hidden flex flex-col justify-between ${
                      hasStock
                        ? 'border-slate-300 hover:border-slate-900 hover:shadow-md'
                        : 'border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    <div>
                      {/* Card Top Strip */}
                      <div
                        className={`px-4 py-3.5 flex items-center justify-between gap-2 border-b ${
                          hasStock
                            ? 'bg-slate-900 text-white border-slate-800'
                            : 'bg-slate-50 text-slate-800 border-slate-200'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-base font-extrabold font-mono tracking-tight">
                              Rack {item.rack.code}
                            </span>
                            <span
                              className={`text-[11px] font-bold ${
                                isNearFull
                                  ? 'text-rose-300'
                                  : hasStock
                                  ? 'text-emerald-300'
                                  : 'text-slate-400'
                              }`}
                            >
                              {isNearFull ? 'Near Full' : hasStock ? 'Active' : 'Empty'}
                            </span>
                          </div>
                          <p
                            className={`text-xs truncate mt-0.5 ${
                              hasStock ? 'text-slate-300' : 'text-slate-500'
                            }`}
                          >
                            {item.rack.zone}
                          </p>
                        </div>

                        {/* Circular Capacity Gauge */}
                        <div className="relative h-11 w-11 shrink-0 flex items-center justify-center">
                          <svg className="h-11 w-11 -rotate-90" viewBox="0 0 44 44">
                            <circle
                              cx="22"
                              cy="22"
                              r={radius}
                              fill="none"
                              stroke={hasStock ? '#334155' : '#e2e8f0'}
                              strokeWidth="4"
                            />
                            <circle
                              cx="22"
                              cy="22"
                              r={radius}
                              fill="none"
                              stroke={ringColor}
                              strokeWidth="4"
                              strokeDasharray={circumference}
                              strokeDashoffset={dashOffset}
                              strokeLinecap="round"
                            />
                          </svg>
                          <span
                            className={`absolute text-[10px] font-mono font-extrabold tabular-nums ${
                              hasStock ? 'text-white' : 'text-slate-500'
                            }`}
                          >
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
                              {fmtKg(item.currentKg)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Free Cap.</span>
                            <span
                              className={`text-sm font-bold font-mono tabular-nums ${
                                item.freeCapacityKg < 300 && hasStock ? 'text-rose-700' : 'text-emerald-700'
                              }`}
                            >
                              {fmtKg(item.freeCapacityKg)}
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
                          <div className="flex items-center justify-between text-slate-600">
                            <span className="text-slate-500">Buyers:</span>
                            <span className="font-bold text-slate-800 truncate max-w-[160px]">
                              {item.buyers.length > 0 ? item.buyers.join(', ') : '-'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-slate-600">
                            <span className="text-slate-500">POs:</span>
                            <span className="font-mono font-bold text-slate-800 truncate max-w-[160px]">
                              {item.pos.length > 0
                                ? `${item.pos.slice(0, 2).join(', ')}${item.pos.length > 2 ? ` +${item.pos.length - 2}` : ''}`
                                : 'None'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-700 group-hover:text-blue-700">
                      <span>Open Stock Details & Split</span>
                      <span>→</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 text-slate-700 uppercase font-bold">
                    <tr>
                      <th className="p-3 border-b border-slate-200">Rack</th>
                      <th className="p-3 border-b border-slate-200">Zone</th>
                      <th className="p-3 border-b border-slate-200 text-right">Active Lots</th>
                      <th className="p-3 border-b border-slate-200 text-right">In Stock (kg)</th>
                      <th className="p-3 border-b border-slate-200 text-right">Free Cap (kg)</th>
                      <th className="p-3 border-b border-slate-200 text-right">Fill %</th>
                      <th className="p-3 border-b border-slate-200">Buyers / POs</th>
                      <th className="p-3 border-b border-slate-200 text-center">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredRackSummaries.map((item) => (
                      <tr
                        key={item.rack.id}
                        onClick={() => {
                          setSelectedRackId(item.rack.id);
                          setRackDetailShowExhausted(false);
                          setTransferBatchId(null);
                        }}
                        className="hover:bg-slate-50 cursor-pointer"
                      >
                        <td className="p-3 font-mono font-extrabold text-slate-900">
                          Rack {item.rack.code}
                        </td>
                        <td className="p-3 text-slate-600">{item.rack.zone}</td>
                        <td className="p-3 text-right font-mono tabular-nums font-bold">
                          {item.activeBatches.length}
                        </td>
                        <td className="p-3 text-right font-mono tabular-nums font-extrabold text-slate-900">
                          {fmtKg(item.currentKg)}
                        </td>
                        <td className="p-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                          {fmtKg(item.freeCapacityKg)}
                        </td>
                        <td className="p-3 text-right font-mono tabular-nums font-bold">
                          {item.utilizationPct}%
                        </td>
                        <td className="p-3 text-slate-700 truncate max-w-[240px]">
                          {item.pos.length > 0 ? `${item.buyers.join(', ')} · ${item.pos.join(', ')}` : 'Empty'}
                        </td>
                        <td className="p-3 text-center font-bold text-blue-700">View →</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================================== */}
      {/* SUB-TAB 2: FABRIC BOOKING / REQUIREMENTS (Before Receiving)              */}
      {/* ======================================================================== */}
      {activeSubTab === 'requirements' && (
        <div className="space-y-6">
          {rolePerms?.canReceive ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Pick PO from All Buyers */}
              <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <div className="pb-2.5 border-b border-slate-200">
                  <h3 className="text-sm font-extrabold text-slate-900">
                    1. Select Buyer PO (from All Buyers)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Book required fabric type, color, GSM & kg before fabric arrives
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                    <input
                      type="text"
                      value={reqPoSearch}
                      onChange={(e) => setReqPoSearch(e.target.value)}
                      placeholder="Search PO, Style, File, Buyer..."
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <select
                    value={reqBuyerFilter}
                    onChange={(e) => setReqBuyerFilter(e.target.value)}
                    className="px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 max-w-[140px] outline-none"
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
                    <div className="p-6 text-center text-xs text-slate-500">No POs match "{reqPoSearch}".</div>
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
                            setSelectedOrderForReq({
                              buyer: buyerStr,
                              po: poStr,
                              style: String(order['STYLE'] || '').trim(),
                              itemName: String(order['ITEM'] || '').trim(),
                              fileNo: String(order['File No'] || '').trim(),
                              shipDate: String(order['SHIP DATE'] || '').trim(),
                              orderDzn: String(order['DZN'] || '').trim(),
                            })
                          }
                          className={`w-full text-left p-3 transition cursor-pointer flex items-start justify-between gap-2 ${
                            isSelected ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-extrabold text-slate-900 font-mono">PO {poStr}</span>
                              <span className="text-slate-400">·</span>
                              <span className="font-bold text-blue-800">{buyerStr}</span>
                              {existingReqCount > 0 && (
                                <span className="text-[11px] font-bold text-emerald-700">
                                  ({existingReqCount} booked)
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
                          {isSelected && <CheckCircle2 size={16} className="text-blue-600 shrink-0 mt-0.5" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Add Fabric Requirement Form */}
              <form
                onSubmit={handleCreateRequirement}
                className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 space-y-4"
              >
                <div className="pb-2.5 border-b border-slate-200">
                  <h3 className="text-sm font-extrabold text-slate-900">
                    2. Enter Required Fabric Specs & Quantity
                  </h3>
                  <p className="text-xs text-slate-500">
                    These specs appear automatically at Receiving time when this PO is selected
                  </p>
                </div>

                {selectedOrderForReq ? (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 block">Buyer</span>
                      <span className="font-bold text-slate-900">{selectedOrderForReq.buyer}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">PO Number</span>
                      <span className="font-extrabold text-blue-800 font-mono">{selectedOrderForReq.po}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Ship Date</span>
                      <span className="font-bold font-mono text-slate-800">{selectedOrderForReq.shipDate || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Style</span>
                      <span className="font-bold text-slate-800">{selectedOrderForReq.style || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Item</span>
                      <span className="font-bold text-slate-800">{selectedOrderForReq.itemName || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">File No / DZN</span>
                      <span className="font-mono font-bold text-slate-800">
                        {selectedOrderForReq.fileNo || '-'} · {selectedOrderForReq.orderDzn || '-'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl border border-dashed border-slate-300 text-xs text-slate-500 text-center">
                    Select a Buyer PO from the left list first.
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Fabric Type *</label>
                    <input
                      type="text"
                      required
                      list="req-fabric-types"
                      value={reqForm.fabricType}
                      onChange={(e) => setReqForm((p) => ({ ...p, fabricType: e.target.value }))}
                      placeholder="e.g. Single Jersey"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                    />
                    <datalist id="req-fabric-types">
                      {FABRIC_TYPE_SUGGESTIONS.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Color *</label>
                    <input
                      type="text"
                      required
                      value={reqForm.color}
                      onChange={(e) => setReqForm((p) => ({ ...p, color: e.target.value }))}
                      placeholder="e.g. Navy / Black"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">GSM</label>
                    <input
                      type="text"
                      value={reqForm.gsm}
                      onChange={(e) => setReqForm((p) => ({ ...p, gsm: e.target.value }))}
                      placeholder="e.g. 160 GSM"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Required Qty (kg) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={reqForm.requiredQtyKg}
                      onChange={(e) => setReqForm((p) => ({ ...p, requiredQtyKg: e.target.value }))}
                      placeholder="e.g. 1250.00"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Expected Supplier</label>
                    <input
                      type="text"
                      value={reqForm.supplier}
                      onChange={(e) => setReqForm((p) => ({ ...p, supplier: e.target.value }))}
                      placeholder="Optional"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Note / Remark</label>
                    <input
                      type="text"
                      value={reqForm.remark}
                      onChange={(e) => setReqForm((p) => ({ ...p, remark: e.target.value }))}
                      placeholder="Body / Neck / Rib note"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={isSavingReq}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50 flex items-center gap-2"
                  >
                    <BookmarkCheck size={15} />
                    <span>{isSavingReq ? 'Saving Booking...' : 'Save Fabric Requirement'}</span>
                  </button>
                </div>
              </form>
            </div>
          ) : null}

          {/* Booked Fabric Requirements List */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">PO Fabric Booking & Fulfillment Tracker</h3>
                <p className="text-xs text-slate-500">{filteredRequirementsTable.length} requirement entry(ies)</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    type="text"
                    value={reqTableSearch}
                    onChange={(e) => setReqTableSearch(e.target.value)}
                    placeholder="Search PO, Buyer, Color..."
                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={() =>
                    exportCsvFile(
                      `fabric_requirements_${todayISO()}.csv`,
                      ['Buyer', 'PO', 'Style', 'Item', 'Ship Date', 'Fabric Type', 'Color', 'GSM', 'Required (kg)', 'Received (kg)', 'Pending (kg)', 'Supplier'],
                      filteredRequirementsTable.map((r) => [
                        r.buyer,
                        r.po,
                        r.style || '',
                        r.itemName || '',
                        r.shipDate || '',
                        r.fabricType,
                        r.color,
                        r.gsm || '',
                        r.requiredQtyKg.toFixed(2),
                        r.receivedKg.toFixed(2),
                        r.pendingKg.toFixed(2),
                        r.supplier || '',
                      ])
                    )
                  }
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer"
                >
                  <Download size={13} />
                  <span>CSV</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 text-slate-700 uppercase font-bold">
                  <tr>
                    <th className="p-3 border-b border-slate-200">Buyer / PO / Style</th>
                    <th className="p-3 border-b border-slate-200">Fabric Type / Color / GSM</th>
                    <th className="p-3 border-b border-slate-200">Supplier</th>
                    <th className="p-3 border-b border-slate-200 text-right">Required</th>
                    <th className="p-3 border-b border-slate-200 text-right">Received</th>
                    <th className="p-3 border-b border-slate-200 text-right">Pending</th>
                    <th className="p-3 border-b border-slate-200">Progress</th>
                    <th className="p-3 border-b border-slate-200 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredRequirementsTable.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-500">
                        No fabric requirements booked yet. Select a PO above to enter required qty before receiving.
                      </td>
                    </tr>
                  ) : (
                    filteredRequirementsTable.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="p-3">
                          <div className="font-extrabold text-slate-900 font-mono">PO {r.po}</div>
                          <div className="text-slate-600">{r.buyer} · {r.style || '-'}</div>
                          <div className="text-slate-400">Ship: {r.shipDate || '-'}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-800">{r.fabricType}</div>
                          <div className="text-slate-600">{r.color} {r.gsm ? `· ${r.gsm}` : ''}</div>
                        </td>
                        <td className="p-3 text-slate-700">{r.supplier || '-'}</td>
                        <td className="p-3 text-right font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                          {fmtKg(r.requiredQtyKg)} kg
                        </td>
                        <td className="p-3 text-right font-mono tabular-nums font-bold text-emerald-700 whitespace-nowrap">
                          {fmtKg(r.receivedKg)} kg
                        </td>
                        <td className="p-3 text-right font-mono tabular-nums font-extrabold text-amber-700 whitespace-nowrap">
                          {fmtKg(r.pendingKg)} kg
                        </td>
                        <td className="p-3 min-w-[110px]">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${r.isComplete ? 'bg-emerald-600' : 'bg-blue-600'}`}
                                style={{ width: `${r.pct}%` }}
                              />
                            </div>
                            <span className="font-mono font-bold text-slate-600">{r.pct}%</span>
                          </div>
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            {rolePerms?.canReceive && (
                              <button
                                onClick={() => {
                                  setEditingReq(r);
                                  setEditReqQty(String(r.requiredQtyKg));
                                }}
                                className="p-1 rounded text-slate-600 hover:bg-slate-100 cursor-pointer"
                                title="Edit required qty"
                              >
                                <Edit3 size={13} />
                              </button>
                            )}
                            {rolePerms?.canDeleteRecords && (
                              <button
                                onClick={async () => {
                                  await deleteFabricRequirement(r.id);
                                  showToast('success', `Requirement for PO ${r.po} deleted.`);
                                }}
                                className="p-1 rounded text-rose-500 hover:bg-rose-50 cursor-pointer"
                                title="Delete booking"
                              >
                                <Trash2 size={13} />
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
      )}

      {/* ======================================================================== */}
      {/* SUB-TAB 3: CHALLAN-WISE MULTI-PO BULK RECEIVING & SHARED RACK SPLIT      */}
      {/* ======================================================================== */}
      {activeSubTab === 'receiving' && (
        <div className="space-y-6">
          {rolePerms?.canReceive ? (
            <form onSubmit={handleSaveFullChallan} className="space-y-5">
              {/* Step 1: Challan Master Header */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                <div className="pb-2.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">
                      1. Challan Header (Multi-PO Bulk Receiving)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Enter challan details once, then add one or several Buyer POs below
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-lg">
                    {challanLines.length} Line(s) · Total{' '}
                    {fmtKg(challanLines.reduce((s, l) => s + (parseFloat(l.weightKg) || 0), 0))} kg
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Challan No *</label>
                    <input
                      type="text"
                      required
                      value={challanHeader.challanNo}
                      onChange={(e) => setChallanHeader((p) => ({ ...p, challanNo: e.target.value }))}
                      placeholder="e.g. CH-2026-8821"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Receiving Date *</label>
                    <input
                      type="date"
                      required
                      value={challanHeader.receiveDate}
                      onChange={(e) => setChallanHeader((p) => ({ ...p, receiveDate: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Supplier *</label>
                    <input
                      type="text"
                      required
                      value={challanHeader.supplier}
                      onChange={(e) => setChallanHeader((p) => ({ ...p, supplier: e.target.value }))}
                      placeholder="e.g. Four H Dyeing / Knit Asia"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Challan Remark</label>
                    <input
                      type="text"
                      value={challanHeader.remark}
                      onChange={(e) => setChallanHeader((p) => ({ ...p, remark: e.target.value }))}
                      placeholder="General note across challan"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Step 2: Pick PO(s) & Load Pre-Booked Required Qty Lines */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Left: Searchable PO Picker */}
                <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200">
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900">
                        2. Search & Select PO (All Buyers)
                      </h3>
                      <p className="text-xs text-slate-500">Pick multiple POs for this single challan</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsManualPoMode((v) => !v);
                        setSelectedOrderForRec(null);
                      }}
                      className="text-xs font-bold text-blue-700 hover:underline cursor-pointer shrink-0"
                    >
                      {isManualPoMode ? 'Pick from Sheet' : 'Manual PO'}
                    </button>
                  </div>

                  {!isManualPoMode ? (
                    <>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                          <input
                            type="text"
                            value={recPoSearch}
                            onChange={(e) => setRecPoSearch(e.target.value)}
                            placeholder="Search PO, Style, File, Buyer..."
                            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <select
                          value={recBuyerFilter}
                          onChange={(e) => setRecBuyerFilter(e.target.value)}
                          className="px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 max-w-[130px] outline-none"
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
                            No orders found matching "{recPoSearch}".
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
                                onClick={() => handleSelectSheetOrderForRec(order)}
                                className={`w-full text-left p-3 transition cursor-pointer flex items-start justify-between gap-2 ${
                                  isSelected ? 'bg-blue-50' : 'hover:bg-slate-50 bg-white'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="font-extrabold text-slate-900 font-mono">PO {poStr}</span>
                                    <span className="text-slate-400">·</span>
                                    <span className="font-bold text-blue-800 truncate">{buyerStr}</span>
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
                                {isSelected && <CheckCircle2 size={16} className="text-blue-600 shrink-0 mt-0.5" />}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Buyer *</label>
                        <input
                          type="text"
                          value={manualPoForm.buyer}
                          onChange={(e) => setManualPoForm((p) => ({ ...p, buyer: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">PO Number *</label>
                        <input
                          type="text"
                          value={manualPoForm.po}
                          onChange={(e) => setManualPoForm((p) => ({ ...p, po: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Style</label>
                        <input
                          type="text"
                          value={manualPoForm.style}
                          onChange={(e) => setManualPoForm((p) => ({ ...p, style: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Ship Date</label>
                        <input
                          type="text"
                          value={manualPoForm.shipDate}
                          onChange={(e) => setManualPoForm((p) => ({ ...p, shipDate: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Selected PO Booked Requirements + Add to Challan */}
                <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200">
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900">
                        3. Pre-Booked Fabric & Required Qty for Selected PO
                      </h3>
                      <p className="text-xs text-slate-500">
                        Click a booked item to add it to this challan, or add a custom fabric row
                      </p>
                    </div>
                    {(selectedOrderForRec || (isManualPoMode && manualPoForm.po)) && (
                      <div className="flex items-center gap-2">
                        {selectedPoRequirements.length > 0 && (
                          <button
                            type="button"
                            onClick={addAllPendingReqsForPoToChallan}
                            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                          >
                            + Add All ({selectedPoRequirements.length})
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={addCustomPoLineToChallan}
                          className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold cursor-pointer"
                        >
                          + Custom Line
                        </button>
                      </div>
                    )}
                  </div>

                  {!(selectedOrderForRec || (isManualPoMode && manualPoForm.po)) ? (
                    <div className="p-8 rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-500">
                      Select a PO on the left to inspect its required fabric list and add items to this challan.
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
                            <span className="font-bold text-blue-800">{selectedOrderForRec.buyer}</span>
                            <span className="text-slate-400 mx-1.5">·</span>
                            <span className="font-semibold text-slate-700">{selectedOrderForRec.style}</span>
                          </div>
                          <span className="font-mono text-slate-500">
                            Ship {selectedOrderForRec.shipDate || '-'}
                          </span>
                        </div>
                      )}

                      {selectedPoRequirements.length === 0 ? (
                        <div className="p-5 rounded-xl border border-dashed border-slate-300 text-center space-y-2">
                          <p className="text-xs text-slate-600">
                            No pre-entered fabric booking found for this PO yet.
                          </p>
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={addCustomPoLineToChallan}
                              className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
                            >
                              + Add Custom Fabric Line to Challan
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOrderForReq(selectedOrderForRec);
                                setActiveSubTab('requirements');
                              }}
                              className="px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold cursor-pointer"
                            >
                              Book Required Qty First
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl max-h-60 overflow-y-auto">
                          {selectedPoRequirements.map((req) => (
                            <div
                              key={req.id}
                              className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50 text-xs"
                            >
                              <div>
                                <div className="font-bold text-slate-900">
                                  {req.fabricType} · {req.color} {req.gsm ? `(${req.gsm})` : ''}
                                </div>
                                <div className="font-mono text-slate-600 mt-0.5">
                                  Required: <strong>{fmtKg(req.requiredQtyKg)} kg</strong> · Received:{' '}
                                  <strong className="text-emerald-700">{fmtKg(req.receivedKg)} kg</strong> · Pending:{' '}
                                  <strong className="text-amber-700">{fmtKg(req.pendingKg)} kg</strong>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => addRequirementToChallan(req)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold cursor-pointer shrink-0"
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

              {/* Step 4: Active Challan Bulk Staging List (with Shared Multi-Rack Split per line) */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">
                      4. Challan Bulk Entry Queue ({challanLines.length} PO Line{challanLines.length === 1 ? '' : 's'})
                    </h3>
                    <p className="text-xs text-slate-500">
                      Enter receiving qty & lot no. Use <strong>Split Racks</strong> on any line when rack capacity requires sharing fabric across multiple racks.
                    </p>
                  </div>
                  {challanLines.length > 0 && (
                    <button
                      type="submit"
                      disabled={isSubmittingChallan}
                      className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50 flex items-center gap-2 shrink-0"
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
                    No PO lines added to this challan yet. Search a PO above and click <strong>+ Add to Challan</strong>.
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
                        <div key={line.localId} className="p-4 space-y-3 bg-white">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-xs">
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
                                  <span className="font-mono text-emerald-700 font-bold">
                                    Req: {fmtKg(line.requiredQtyKg)} kg (Pending:{' '}
                                    {fmtKg(Math.max(0, line.requiredQtyKg - line.alreadyReceivedKg))} kg)
                                  </span>
                                </>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  updateChallanLine(line.localId, {
                                    isSplitRack: !line.isSplitRack,
                                    rackSplits: !line.isSplitRack
                                      ? [
                                          { rackId: line.rackId || defaultRackId, weightKg: line.weightKg, rollCount: line.rollCount },
                                          { rackId: racks[1]?.id || defaultRackId, weightKg: '', rollCount: '' },
                                        ]
                                      : line.rackSplits,
                                  })
                                }
                                className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1 cursor-pointer ${
                                  line.isSplitRack
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                                }`}
                                title="Share this fabric across multiple racks due to capacity limit"
                              >
                                <Split size={12} />
                                <span>{line.isSplitRack ? 'Shared Racks Active' : 'Split Across Racks'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  setChallanLines((prev) => prev.filter((l) => l.localId !== line.localId))
                                }
                                className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer"
                                title="Remove line from challan"
                              >
                                <X size={15} />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-xs">
                            <div>
                              <label className="block font-bold text-slate-600 mb-1">Fabric Type *</label>
                              <input
                                type="text"
                                required
                                list="fabric-type-options"
                                value={line.fabricType}
                                onChange={(e) =>
                                  updateChallanLine(line.localId, { fabricType: e.target.value })
                                }
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block font-bold text-slate-600 mb-1">Color *</label>
                              <input
                                type="text"
                                required
                                value={line.color}
                                onChange={(e) =>
                                  updateChallanLine(line.localId, { color: e.target.value })
                                }
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block font-bold text-slate-600 mb-1">GSM</label>
                              <input
                                type="text"
                                value={line.gsm}
                                onChange={(e) =>
                                  updateChallanLine(line.localId, { gsm: e.target.value })
                                }
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block font-bold text-slate-600 mb-1">Recv Qty (kg) *</label>
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                required
                                value={line.weightKg}
                                onChange={(e) =>
                                  updateChallanLine(line.localId, { weightKg: e.target.value })
                                }
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block font-bold text-slate-600 mb-1">Rolls</label>
                              <input
                                type="number"
                                min="0"
                                value={line.rollCount}
                                onChange={(e) =>
                                  updateChallanLine(line.localId, { rollCount: e.target.value })
                                }
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block font-bold text-slate-600 mb-1">Lot No *</label>
                              <input
                                type="text"
                                required
                                value={line.lotNo}
                                onChange={(e) =>
                                  updateChallanLine(line.localId, { lotNo: e.target.value })
                                }
                                placeholder="LOT-..."
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            {!line.isSplitRack ? (
                              <div>
                                <label className="block font-bold text-slate-600 mb-1">Storage Rack *</label>
                                <select
                                  value={line.rackId}
                                  onChange={(e) =>
                                    updateChallanLine(line.localId, { rackId: e.target.value })
                                  }
                                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-bold outline-none focus:bg-white"
                                >
                                  {rackSummaries
                                    .filter((rs) => rs.rack.isActive)
                                    .map((rs) => (
                                      <option key={rs.rack.id} value={rs.rack.id}>
                                        {rs.rack.code} (Free: {Math.round(rs.freeCapacityKg)} kg)
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
                                    updateChallanLine(line.localId, { remark: e.target.value })
                                  }
                                  placeholder="Note..."
                                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:bg-white"
                                />
                              </div>
                            )}
                          </div>

                          {/* Shared Multi-Rack Split Panel */}
                          {line.isSplitRack && (
                            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-bold text-slate-800">
                                  Shared Rack Allocation (Capacity Split)
                                </span>
                                <span
                                  className={`font-mono font-bold ${
                                    splitMatches && targetWeight > 0 ? 'text-emerald-700' : 'text-amber-700'
                                  }`}
                                >
                                  Allocated: {fmtKg(splitSum)} / {fmtKg(targetWeight)} kg
                                </span>
                              </div>

                              <div className="space-y-2">
                                {line.rackSplits.map((sp, spIdx) => (
                                  <div key={spIdx} className="grid grid-cols-12 gap-2 items-center">
                                    <div className="col-span-5">
                                      <select
                                        value={sp.rackId}
                                        onChange={(e) =>
                                          updateChallanLineSplit(line.localId, spIdx, {
                                            rackId: e.target.value,
                                          })
                                        }
                                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-bold outline-none"
                                      >
                                        {rackSummaries
                                          .filter((rs) => rs.rack.isActive)
                                          .map((rs) => (
                                            <option key={rs.rack.id} value={rs.rack.id}>
                                              Rack {rs.rack.code} · Free {fmtKg(rs.freeCapacityKg)} kg
                                            </option>
                                          ))}
                                      </select>
                                    </div>
                                    <div className="col-span-3">
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={sp.weightKg}
                                        onChange={(e) =>
                                          updateChallanLineSplit(line.localId, spIdx, {
                                            weightKg: e.target.value,
                                          })
                                        }
                                        placeholder="Weight kg"
                                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold outline-none"
                                      />
                                    </div>
                                    <div className="col-span-3">
                                      <input
                                        type="number"
                                        min="0"
                                        value={sp.rollCount}
                                        onChange={(e) =>
                                          updateChallanLineSplit(line.localId, spIdx, {
                                            rollCount: e.target.value,
                                          })
                                        }
                                        placeholder="Rolls"
                                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono outline-none"
                                      />
                                    </div>
                                    <div className="col-span-1 text-right">
                                      {line.rackSplits.length > 2 && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateChallanLine(line.localId, {
                                              rackSplits: line.rackSplits.filter((_, i) => i !== spIdx),
                                            })
                                          }
                                          className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer"
                                        >
                                          <X size={14} />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  updateChallanLine(line.localId, {
                                    rackSplits: [
                                      ...line.rackSplits,
                                      { rackId: defaultRackId, weightKg: '', rollCount: '' },
                                    ],
                                  })
                                }
                                className="text-xs font-bold text-blue-700 hover:underline cursor-pointer"
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
                  {FABRIC_TYPE_SUGGESTIONS.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
            </form>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900">
              Your role ({rolePerms?.label}) has view-only access to the Receiving Register.
            </div>
          )}

          {/* Receiving Register (Grouped By Challan OR Flat Line Items) */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Fabric Receiving Register</h3>
                <p className="text-xs text-slate-500">
                  {challanGroups.length} Challan(s) · {filteredReceivingsLedger.length} Rack Batch Entry(ies)
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    onClick={() => setRecRegisterView('challan')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1 ${
                      recRegisterView === 'challan'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600'
                    }`}
                  >
                    <Layers size={12} />
                    <span>By Challan</span>
                  </button>
                  <button
                    onClick={() => setRecRegisterView('items')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1 ${
                      recRegisterView === 'items'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600'
                    }`}
                  >
                    <TableIcon size={12} />
                    <span>All Lots</span>
                  </button>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    type="text"
                    value={recLedgerSearch}
                    onChange={(e) => setRecLedgerSearch(e.target.value)}
                    placeholder="Filter challan, PO, lot..."
                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <button
                  onClick={() =>
                    exportCsvFile(
                      `fabric_receiving_register_${todayISO()}.csv`,
                      ['Date', 'Challan', 'Supplier', 'Rack', 'Buyer', 'PO', 'Style', 'Ship Date', 'Fabric Type', 'Color', 'GSM', 'Lot', 'Required (kg)', 'Received (kg)', 'Delivered (kg)', 'Balance (kg)', 'Remark'],
                      filteredReceivingsLedger.map((r) => [
                        r.receiveDate,
                        r.challanNo,
                        r.supplier,
                        r.rackCode,
                        r.buyer,
                        r.po,
                        r.style || '',
                        r.shipDate || '',
                        r.fabricType,
                        r.color,
                        r.gsm || '',
                        r.lotNo,
                        (r.requiredQtyKg || 0).toFixed(2),
                        r.weightKg.toFixed(2),
                        r.deliveredKg.toFixed(2),
                        r.availableKg.toFixed(2),
                        r.remark || '',
                      ])
                    )
                  }
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer"
                >
                  <Download size={13} />
                  <span>CSV</span>
                </button>
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
                          onClick={() =>
                            setExpandedChallans((prev) => ({
                              ...prev,
                              [grp.groupKey]: !isExpanded,
                            }))
                          }
                          className="w-full p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50 text-left cursor-pointer"
                        >
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-mono font-extrabold text-sm text-slate-900">
                              Challan {grp.challanNo}
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="text-xs font-mono text-slate-600">{grp.receiveDate}</span>
                            <span className="text-slate-400">·</span>
                            <span className="text-xs font-bold text-slate-800">{grp.supplier}</span>
                            <span className="text-slate-400">·</span>
                            <span className="text-xs text-blue-800 font-semibold">
                              {grp.pos.size} PO(s): {Array.from(grp.pos).slice(0, 4).join(', ')}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs font-mono shrink-0">
                            <span>
                              Recv: <strong className="text-slate-900">{fmtKg(grp.totalWeightKg)} kg</strong>
                            </span>
                            <span>
                              Bal: <strong className="text-emerald-700">{fmtKg(grp.totalBalanceKg)} kg</strong>
                            </span>
                            <span className="text-slate-500">
                              Racks: {Array.from(grp.racks).join(', ')}
                            </span>
                            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="overflow-x-auto border-t border-slate-100 bg-slate-50/50">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead className="bg-slate-100/80 text-slate-600 uppercase font-bold">
                                <tr>
                                  <th className="p-2.5 border-b border-slate-200">Rack</th>
                                  <th className="p-2.5 border-b border-slate-200">Buyer / PO / Style</th>
                                  <th className="p-2.5 border-b border-slate-200">Fabric / Color / Lot</th>
                                  <th className="p-2.5 border-b border-slate-200 text-right">Required</th>
                                  <th className="p-2.5 border-b border-slate-200 text-right">Received</th>
                                  <th className="p-2.5 border-b border-slate-200 text-right">Balance</th>
                                  <th className="p-2.5 border-b border-slate-200 text-center">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 bg-white">
                                {grp.items.map((r) => (
                                  <tr key={r.id} className="hover:bg-slate-50">
                                    <td className="p-2.5 font-mono font-bold text-slate-900">
                                      Rack {r.rackCode}
                                    </td>
                                    <td className="p-2.5">
                                      <span className="font-mono font-extrabold text-slate-900">PO {r.po}</span>
                                      <span className="text-slate-400 mx-1">·</span>
                                      <span className="text-blue-800 font-semibold">{r.buyer}</span>
                                      {r.style && <div className="text-slate-500">{r.style}</div>}
                                    </td>
                                    <td className="p-2.5">
                                      <span className="font-bold text-slate-800">{r.fabricType}</span> · {r.color}
                                      <div className="font-mono text-slate-500">
                                        Lot {r.lotNo} {r.gsm ? `· ${r.gsm}` : ''}
                                      </div>
                                    </td>
                                    <td className="p-2.5 text-right font-mono tabular-nums text-slate-600">
                                      {r.requiredQtyKg ? `${fmtKg(r.requiredQtyKg)} kg` : '-'}
                                    </td>
                                    <td className="p-2.5 text-right font-mono tabular-nums font-bold text-slate-900">
                                      {fmtKg(r.weightKg)} kg
                                    </td>
                                    <td className="p-2.5 text-right font-mono tabular-nums font-extrabold text-emerald-700">
                                      {fmtKg(r.availableKg)} kg
                                    </td>
                                    <td className="p-2.5 text-center whitespace-nowrap">
                                      <div className="flex items-center justify-center gap-1.5">
                                        {rolePerms?.canDeliver && r.availableKg > 0.009 && (
                                          <button
                                            onClick={() => {
                                              selectBatchForDelivery(r, 'Partial');
                                              setActiveSubTab('delivery');
                                            }}
                                            className="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold cursor-pointer"
                                          >
                                            Deliver
                                          </button>
                                        )}
                                        {rolePerms?.canDeleteRecords && (
                                          <button
                                            onClick={() => handleDeleteReceivingRecord(r)}
                                            className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer"
                                            title="Delete batch"
                                          >
                                            <Trash2 size={13} />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 text-slate-700 uppercase font-bold">
                    <tr>
                      <th className="p-3 border-b border-slate-200">Date / Challan</th>
                      <th className="p-3 border-b border-slate-200">Rack</th>
                      <th className="p-3 border-b border-slate-200">Buyer / PO / Style</th>
                      <th className="p-3 border-b border-slate-200">Fabric / Color / Lot</th>
                      <th className="p-3 border-b border-slate-200 text-right">Received</th>
                      <th className="p-3 border-b border-slate-200 text-right">Balance</th>
                      <th className="p-3 border-b border-slate-200 text-center">Actions</th>
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
                      filteredReceivingsLedger.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="p-3 font-mono whitespace-nowrap">
                            <div className="font-bold text-slate-900">{r.challanNo}</div>
                            <div className="text-slate-500">{r.receiveDate}</div>
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {r.rackCode}
                          </td>
                          <td className="p-3">
                            <div className="font-extrabold text-slate-900 font-mono">PO {r.po}</div>
                            <div className="text-slate-600">{r.buyer} · {r.style || '-'}</div>
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-slate-800">{r.fabricType} · {r.color}</div>
                            <div className="font-mono text-slate-500">Lot {r.lotNo}</div>
                          </td>
                          <td className="p-3 text-right font-mono tabular-nums font-bold text-slate-800 whitespace-nowrap">
                            {fmtKg(r.weightKg)} kg
                          </td>
                          <td className="p-3 text-right font-mono tabular-nums font-extrabold text-emerald-700 whitespace-nowrap">
                            {fmtKg(r.availableKg)} kg
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              {rolePerms?.canDeliver && r.availableKg > 0.009 && (
                                <button
                                  onClick={() => {
                                    selectBatchForDelivery(r, 'Partial');
                                    setActiveSubTab('delivery');
                                  }}
                                  className="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold cursor-pointer"
                                >
                                  Deliver
                                </button>
                              )}
                              {rolePerms?.canDeleteRecords && (
                                <button
                                  onClick={() => handleDeleteReceivingRecord(r)}
                                  className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer"
                                  title="Delete receiving entry"
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
            )}
          </div>
        </div>
      )}

      {/* ======================================================================== */}
      {/* SUB-TAB 4: FABRIC DELIVERY / SUPPLY (Call by PO Search, Full or Partial) */}
      {/* ======================================================================== */}
      {activeSubTab === 'delivery' && (
        <div className="space-y-6">
          {rolePerms?.canDeliver ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">
                      1. Search Stock by PO / Lot
                    </h3>
                    <p className="text-xs text-slate-500">
                      Call received fabric batches for full or partial delivery
                    </p>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={delShowExhausted}
                      onChange={(e) => setDelShowExhausted(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <span>Show 0 kg lots</span>
                  </label>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input
                    type="text"
                    value={delPoSearch}
                    onChange={(e) => setDelPoSearch(e.target.value)}
                    placeholder="Search by PO Number, Buyer, Style, Lot No, Color, Challan..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="max-h-96 overflow-y-auto divide-y divide-slate-200 border border-slate-200 rounded-xl">
                  {deliveryCandidateBatches.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      No available received fabric lots match "{delPoSearch}". Record receiving first.
                    </div>
                  ) : (
                    deliveryCandidateBatches.map((batch) => {
                      const isSelected = batch.id === selectedBatchIdForDelivery;
                      return (
                        <div
                          key={batch.id}
                          className={`p-3 transition ${isSelected ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-xs">
                                <span className="font-extrabold text-slate-900 font-mono">PO {batch.po}</span>
                                <span className="text-slate-400">·</span>
                                <span className="font-bold text-blue-800">{batch.buyer}</span>
                                <span className="text-slate-400">·</span>
                                <span className="font-mono font-bold text-slate-700">Rack {batch.rackCode}</span>
                              </div>
                              <p className="text-xs font-semibold text-slate-800 mt-0.5">
                                {batch.fabricType} · {batch.color} {batch.gsm ? `· ${batch.gsm}` : ''}
                              </p>
                              <p className="text-xs text-slate-500 font-mono mt-0.5">
                                Lot {batch.lotNo} · Ch {batch.challanNo} · Bal:{' '}
                                <strong className="text-emerald-700">{fmtKg(batch.availableKg)} kg</strong> /{' '}
                                {fmtKg(batch.weightKg)} kg
                              </p>
                            </div>

                            {batch.availableKg > 0.009 ? (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => selectBatchForDelivery(batch, 'Partial')}
                                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold cursor-pointer"
                                >
                                  Partial
                                </button>
                                <button
                                  type="button"
                                  onClick={() => selectBatchForDelivery(batch, 'Full')}
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                                >
                                  Full
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs font-bold text-slate-400 shrink-0">Exhausted</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <form
                onSubmit={handleCreateDelivery}
                className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-5 space-y-4"
              >
                <div className="pb-2.5 border-b border-slate-200">
                  <h3 className="text-sm font-extrabold text-slate-900">
                    2. Issue Fabric Delivery
                  </h3>
                  <p className="text-xs text-slate-500">
                    Assign Supply No, Full/Partial weight & cutting/line destination
                  </p>
                </div>

                {!selectedDeliveryBatch ? (
                  <div className="p-8 rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-500">
                    Search a PO on the left and click <strong>Partial</strong> or <strong>Full</strong> to prepare a fabric delivery slip.
                  </div>
                ) : (
                  <>
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                      <div>
                        <span className="text-slate-500 block">PO / Buyer</span>
                        <span className="font-extrabold text-slate-900 font-mono">
                          {selectedDeliveryBatch.po} · {selectedDeliveryBatch.buyer}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Fabric / Color</span>
                        <span className="font-bold text-slate-800">
                          {selectedDeliveryBatch.fabricType} · {selectedDeliveryBatch.color}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Available Balance</span>
                        <span className="font-extrabold text-emerald-700 font-mono">
                          {fmtKg(selectedDeliveryBatch.availableKg)} kg
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Rack / Lot</span>
                        <span className="font-mono font-bold text-slate-800">
                          {selectedDeliveryBatch.rackCode} · {selectedDeliveryBatch.lotNo}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Style</span>
                        <span className="font-bold text-slate-800 truncate block">
                          {selectedDeliveryBatch.style || '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Ship Date</span>
                        <span className="font-mono font-bold text-slate-800">
                          {selectedDeliveryBatch.shipDate || '-'}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Delivery Type</label>
                      <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
                        <button
                          type="button"
                          onClick={() => handleToggleDeliveryMode('Partial')}
                          className={`py-2 rounded-lg text-xs font-bold cursor-pointer transition ${
                            deliveryMode === 'Partial'
                              ? 'bg-white text-amber-800 shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Partial Delivery
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleDeliveryMode('Full')}
                          className={`py-2 rounded-lg text-xs font-bold cursor-pointer transition ${
                            deliveryMode === 'Full'
                              ? 'bg-white text-emerald-800 shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Full Delivery ({fmtKg(selectedDeliveryBatch.availableKg)} kg)
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Supply / Issue No *</label>
                        <input
                          type="text"
                          required
                          value={delForm.supplyNo}
                          onChange={(e) => setDelForm((p) => ({ ...p, supplyNo: e.target.value }))}
                          placeholder="e.g. SUP-261117-001"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Delivery Date *</label>
                        <input
                          type="date"
                          required
                          value={delForm.deliveryDate}
                          onChange={(e) => setDelForm((p) => ({ ...p, deliveryDate: e.target.value }))}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Delivery Weight (kg) *{' '}
                          <span className="font-normal text-slate-500">
                            (Max {fmtKg(selectedDeliveryBatch.availableKg)})
                          </span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max={selectedDeliveryBatch.availableKg}
                          required
                          value={delForm.weightKg}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDelForm((p) => ({ ...p, weightKg: val }));
                            const num = parseFloat(val);
                            if (
                              Number.isFinite(num) &&
                              Math.abs(num - selectedDeliveryBatch.availableKg) <= 0.01
                            ) {
                              setDeliveryMode('Full');
                            } else {
                              setDeliveryMode('Partial');
                            }
                          }}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        {delForm.weightKg && Number.isFinite(parseFloat(delForm.weightKg)) && (
                          <p className="text-[11px] text-slate-500 font-mono mt-1">
                            Remaining after issue:{' '}
                            <strong className="text-slate-800">
                              {fmtKg(Math.max(0, selectedDeliveryBatch.availableKg - parseFloat(delForm.weightKg)))} kg
                            </strong>
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Rolls Issued</label>
                        <input
                          type="number"
                          min="0"
                          value={delForm.rollCount}
                          onChange={(e) => setDelForm((p) => ({ ...p, rollCount: e.target.value }))}
                          placeholder="e.g. 8"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Issued To (Section / Line) *
                        </label>
                        <input
                          type="text"
                          required
                          list="issue-destination-options"
                          value={delForm.issuedTo}
                          onChange={(e) => setDelForm((p) => ({ ...p, issuedTo: e.target.value }))}
                          placeholder="Cutting Floor / Line 05..."
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <datalist id="issue-destination-options">
                          <option value="Cutting Floor" />
                          <option value="Sample Section" />
                          <option value="Finishing / Rib Cutting" />
                          {lineNames.map((l) => (
                            <option key={l} value={l} />
                          ))}
                        </datalist>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Receiver Name</label>
                        <input
                          type="text"
                          value={delForm.receiverName}
                          onChange={(e) => setDelForm((p) => ({ ...p, receiverName: e.target.value }))}
                          placeholder="Cutting supervisor / floor bearer"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-slate-700 mb-1">Delivery Remark</label>
                        <input
                          type="text"
                          value={delForm.remark}
                          onChange={(e) => setDelForm((p) => ({ ...p, remark: e.target.value }))}
                          placeholder="Requisition ref, body/rib split note, etc."
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedBatchIdForDelivery(null)}
                        className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingDel}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
                      >
                        <Truck size={15} />
                        <span>
                          {isSubmittingDel ? 'Issuing Supply...' : `Confirm ${deliveryMode} Delivery`}
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </form>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900">
              Your role ({rolePerms?.label}) has view-only access to the Delivery Register.
            </div>
          )}

          {/* Delivery Register Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Fabric Delivery / Supply Register</h3>
                <p className="text-xs text-slate-500">{filteredDeliveriesHistory.length} supply transaction(s)</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    type="text"
                    value={delHistorySearch}
                    onChange={(e) => setDelHistorySearch(e.target.value)}
                    placeholder="Search Supply No, PO, Buyer..."
                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={() =>
                    exportCsvFile(
                      `fabric_delivery_register_${todayISO()}.csv`,
                      ['Supply No', 'Date', 'Type', 'Buyer', 'PO', 'Style', 'Rack', 'Fabric', 'Color', 'Lot', 'Weight (kg)', 'Issued To', 'Receiver', 'Issued By', 'Remark'],
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
                        d.issuedTo,
                        d.receiverName || '',
                        d.createdBy,
                        d.remark || '',
                      ])
                    )
                  }
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer"
                >
                  <Download size={13} />
                  <span>CSV</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 text-slate-700 uppercase font-bold">
                  <tr>
                    <th className="p-3 border-b border-slate-200">Supply No / Date</th>
                    <th className="p-3 border-b border-slate-200">Type</th>
                    <th className="p-3 border-b border-slate-200">Buyer / PO / Style</th>
                    <th className="p-3 border-b border-slate-200">Fabric / Color / Lot</th>
                    <th className="p-3 border-b border-slate-200">Issued To</th>
                    <th className="p-3 border-b border-slate-200 text-right">Delivered</th>
                    <th className="p-3 border-b border-slate-200 text-center">Actions</th>
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
                    filteredDeliveriesHistory.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono whitespace-nowrap">
                          <div className="font-extrabold text-slate-900">{d.supplyNo}</div>
                          <div className="text-slate-500">{d.deliveryDate}</div>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span
                            className={`font-bold ${
                              d.deliveryType === 'Full' ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {d.deliveryType}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="font-extrabold text-slate-900 font-mono">PO {d.po}</div>
                          <div className="text-slate-600">{d.buyer} · {d.style || '-'}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-800">{d.fabricType || '-'} · {d.color || '-'}</div>
                          <div className="text-slate-500 font-mono">Rack {d.rackCode || '-'} · Lot {d.lotNo || '-'}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-800">{d.issuedTo}</div>
                          {d.receiverName && <div className="text-slate-500">Recv: {d.receiverName}</div>}
                        </td>
                        <td className="p-3 text-right font-mono tabular-nums font-extrabold text-blue-800 whitespace-nowrap">
                          {fmtKg(d.weightKg)} kg
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setPrintSlipDelivery(d)}
                              className="px-2 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold flex items-center gap-1 cursor-pointer"
                              title="Print Supply Challan Slip"
                            >
                              <Printer size={12} />
                              <span>Slip</span>
                            </button>
                            {rolePerms?.canDeleteRecords && (
                              <button
                                onClick={() => handleDeleteDeliveryRecord(d)}
                                className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer"
                                title="Delete delivery & restore stock"
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
      )}

      {/* ======================================================================== */}
      {/* SUB-TAB 5: PO-WISE FABRIC BALANCE LEDGER                                 */}
      {/* ======================================================================== */}
      {activeSubTab === 'ledger' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">PO-Wise Fabric Balance Ledger</h3>
              <p className="text-xs text-slate-500">
                Aggregated required, received, delivered, and store balance per PO
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  placeholder="Search PO, Buyer, Style..."
                  className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={() =>
                  exportCsvFile(
                    `po_fabric_balance_${todayISO()}.csv`,
                    ['Buyer', 'PO', 'Style', 'Item', 'File No', 'Ship Date', 'Required (kg)', 'Received (kg)', 'Delivered (kg)', 'Balance (kg)', 'Racks'],
                    filteredPoLedger.map((p) => [
                      p.buyer,
                      p.po,
                      p.style,
                      p.itemName,
                      p.fileNo,
                      p.shipDate,
                      p.requiredKg.toFixed(2),
                      p.receivedKg.toFixed(2),
                      p.deliveredKg.toFixed(2),
                      p.availableKg.toFixed(2),
                      Array.from(p.racks).join(' | '),
                    ])
                  )
                }
                className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer"
              >
                <Download size={13} />
                <span>CSV</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100 text-slate-700 uppercase font-bold">
                <tr>
                  <th className="p-3 border-b border-slate-200">Buyer / PO</th>
                  <th className="p-3 border-b border-slate-200">Style / Item / File</th>
                  <th className="p-3 border-b border-slate-200">Ship Date</th>
                  <th className="p-3 border-b border-slate-200">Racks</th>
                  <th className="p-3 border-b border-slate-200 text-right">Required</th>
                  <th className="p-3 border-b border-slate-200 text-right">Received</th>
                  <th className="p-3 border-b border-slate-200 text-right">Delivered</th>
                  <th className="p-3 border-b border-slate-200 text-right">Store Balance</th>
                  <th className="p-3 border-b border-slate-200 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredPoLedger.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-500">
                      No PO stock ledger entries yet.
                    </td>
                  </tr>
                ) : (
                  filteredPoLedger.map((p) => (
                    <tr key={p.key} className="hover:bg-slate-50">
                      <td className="p-3 whitespace-nowrap">
                        <div className="font-mono font-extrabold text-slate-900">PO {p.po}</div>
                        <div className="font-bold text-blue-800">{p.buyer}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-slate-800">{p.style}</div>
                        <div className="text-slate-500">{p.itemName} {p.fileNo !== '-' ? `· File ${p.fileNo}` : ''}</div>
                      </td>
                      <td className="p-3 font-mono whitespace-nowrap">{p.shipDate}</td>
                      <td className="p-3 font-mono text-slate-700">
                        {p.racks.size > 0 ? Array.from(p.racks).join(', ') : '-'}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums font-semibold text-slate-700 whitespace-nowrap">
                        {p.requiredKg > 0 ? `${fmtKg(p.requiredKg)} kg` : '-'}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums font-bold text-slate-800 whitespace-nowrap">
                        {fmtKg(p.receivedKg)} kg
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums font-bold text-blue-700 whitespace-nowrap">
                        {fmtKg(p.deliveredKg)} kg
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums font-extrabold text-emerald-700 whitespace-nowrap">
                        {fmtKg(p.availableKg)} kg
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        {p.availableKg > 0.009 && rolePerms?.canDeliver && (
                          <button
                            onClick={() => {
                              setDelPoSearch(p.po);
                              setActiveSubTab('delivery');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer"
                          >
                            Deliver
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================================== */}
      {/* SUB-TAB 6: MASTER ADMIN USER & ROLE CONTROL + AUDIT LOG                  */}
      {/* ======================================================================== */}
      {activeSubTab === 'users' && rolePerms?.canManageUsers && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <form
              onSubmit={handleCreateUser}
              className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-5 space-y-3.5"
            >
              <div className="pb-2.5 border-b border-slate-200">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <UserPlus size={16} />
                  <span>Create Store User</span>
                </h3>
                <p className="text-xs text-slate-500">Add staff accounts and assign exact access roles</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Username *</label>
                <input
                  type="text"
                  required
                  value={newUserForm.username}
                  onChange={(e) => setNewUserForm((p) => ({ ...p, username: e.target.value }))}
                  placeholder="e.g. rahim_store"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={newUserForm.fullName}
                  onChange={(e) => setNewUserForm((p) => ({ ...p, fullName: e.target.value }))}
                  placeholder="e.g. Md Rahim Uddin"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Password *</label>
                <input
                  type="password"
                  required
                  minLength={4}
                  value={newUserForm.password}
                  onChange={(e) => setNewUserForm((p) => ({ ...p, password: e.target.value }))}
                  placeholder="Min 4 characters"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Role *</label>
                <select
                  value={newUserForm.role}
                  onChange={(e) => setNewUserForm((p) => ({ ...p, role: e.target.value as FabricRole }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 outline-none"
                >
                  {(Object.keys(ROLE_META) as FabricRole[]).map((roleKey) => (
                    <option key={roleKey} value={roleKey}>
                      {ROLE_META[roleKey].label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">{ROLE_META[newUserForm.role].summary}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Department</label>
                <input
                  type="text"
                  value={newUserForm.department}
                  onChange={(e) => setNewUserForm((p) => ({ ...p, department: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isCreatingUser}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                {isCreatingUser ? 'Creating User...' : 'Create User Account'}
              </button>
            </form>

            <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-200">
                <h3 className="text-sm font-extrabold text-slate-900">User & Role Directory</h3>
                <p className="text-xs text-slate-500">
                  Change user roles, reset passwords, suspend or delete accounts in real time
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 text-slate-700 uppercase font-bold">
                    <tr>
                      <th className="p-3 border-b border-slate-200">User</th>
                      <th className="p-3 border-b border-slate-200">Role</th>
                      <th className="p-3 border-b border-slate-200">Status</th>
                      <th className="p-3 border-b border-slate-200 text-right">Manage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="p-3">
                          <div className="font-bold text-slate-900">{u.fullName}</div>
                          <div className="font-mono text-slate-500">
                            @{u.username} · {u.department || 'Fabric Store'}
                          </div>
                        </td>
                        <td className="p-3">
                          <select
                            value={u.role}
                            onChange={(e) => handleChangeUserRole(u, e.target.value as FabricRole)}
                            className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 outline-none cursor-pointer"
                          >
                            {(Object.keys(ROLE_META) as FabricRole[]).map((rk) => (
                              <option key={rk} value={rk}>
                                {ROLE_META[rk].label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => handleToggleUserActive(u)}
                            className={`text-xs font-bold px-2.5 py-1 rounded-lg border cursor-pointer ${
                              u.isActive
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            {u.isActive ? 'Active' : 'Disabled'}
                          </button>
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setResetPwdUser(u);
                                setResetPwdValue('');
                              }}
                              className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold cursor-pointer"
                            >
                              Reset Pwd
                            </button>
                            {u.id !== currentUser.id && (
                              <button
                                onClick={() => handleDeleteUser(u)}
                                className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer"
                                title="Delete user"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Activity Audit Log */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center gap-2">
              <History size={16} className="text-slate-600" />
              <h3 className="text-sm font-extrabold text-slate-900">Store Activity Audit Trail</h3>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-200 text-xs">
              {auditLogs.length === 0 ? (
                <div className="p-6 text-center text-slate-500">No audit entries logged yet.</div>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-slate-900">{log.action}</span>
                      <span className="text-slate-400 mx-1.5">·</span>
                      <span className="text-slate-700">{log.details}</span>
                    </div>
                    <div className="font-mono text-slate-500 shrink-0">
                      @{log.actorUsername} · {new Date(log.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================== */}
      {/* MODAL: RACK STOCK DETAILS & SHARED RACK SPLIT / TRANSFER                 */}
      {/* ======================================================================== */}
      {selectedRackSummary && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-extrabold font-mono">
                  Rack {selectedRackSummary.rack.code} — Stock Details
                </h3>
                <p className="text-xs text-slate-300 mt-0.5 font-mono">
                  {selectedRackSummary.rack.zone} · Stock: {fmtKg(selectedRackSummary.currentKg)} kg · Free:{' '}
                  {fmtKg(selectedRackSummary.freeCapacityKg)} kg / {fmtKg(selectedRackSummary.rack.capacityKg)} kg
                </p>
              </div>
              <div className="flex items-center gap-2">
                {rolePerms?.canManageRacks && (
                  <button
                    onClick={() => {
                      setRackForm({
                        id: selectedRackSummary.rack.id,
                        code: selectedRackSummary.rack.code,
                        zone: selectedRackSummary.rack.zone,
                        capacityKg: String(selectedRackSummary.rack.capacityKg),
                        description: selectedRackSummary.rack.description || '',
                      });
                      setShowRackFormModal(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 size={13} />
                    <span>Edit Rack</span>
                  </button>
                )}
                <button
                  onClick={() => setSelectedRackId(null)}
                  className="h-8 w-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-4 font-mono">
                <span>
                  Received: <strong>{fmtKg(selectedRackSummary.receivedKg)} kg</strong>
                </span>
                <span>
                  Delivered: <strong>{fmtKg(selectedRackSummary.deliveredKg)} kg</strong>
                </span>
                <span className="text-emerald-700">
                  Balance: <strong>{fmtKg(selectedRackSummary.currentKg)} kg</strong>
                </span>
              </div>

              <label className="flex items-center gap-1.5 font-semibold text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rackDetailShowExhausted}
                  onChange={(e) => setRackDetailShowExhausted(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>Include fully delivered (0 kg) history</span>
              </label>
            </div>

            <div className="overflow-auto flex-1">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 text-slate-700 uppercase font-bold sticky top-0">
                  <tr>
                    <th className="p-3 border-b border-slate-200">Buyer / PO / Style</th>
                    <th className="p-3 border-b border-slate-200">Fabric / Color / GSM</th>
                    <th className="p-3 border-b border-slate-200">Lot / Challan / Date</th>
                    <th className="p-3 border-b border-slate-200 text-right">Received</th>
                    <th className="p-3 border-b border-slate-200 text-right">Delivered</th>
                    <th className="p-3 border-b border-slate-200 text-right">Balance</th>
                    <th className="p-3 border-b border-slate-200 text-center">Actions (Deliver / Share Rack)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(rackDetailShowExhausted
                    ? selectedRackSummary.rackBatches
                    : selectedRackSummary.activeBatches
                  ).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        No fabric lots in Rack {selectedRackSummary.rack.code}.
                      </td>
                    </tr>
                  ) : (
                    (rackDetailShowExhausted
                      ? selectedRackSummary.rackBatches
                      : selectedRackSummary.activeBatches
                    ).map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50">
                        <td className="p-3">
                          <div className="font-extrabold text-slate-900 font-mono">PO {b.po}</div>
                          <div className="text-slate-600">{b.buyer} · {b.style || '-'}</div>
                          <div className="text-slate-400">Ship: {b.shipDate || '-'}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-800">{b.fabricType}</div>
                          <div className="text-slate-600">{b.color} {b.gsm ? `· ${b.gsm}` : ''}</div>
                        </td>
                        <td className="p-3 font-mono">
                          <div className="font-bold text-slate-800">Lot {b.lotNo}</div>
                          <div className="text-slate-500">Ch {b.challanNo} · {b.receiveDate}</div>
                        </td>
                        <td className="p-3 text-right font-mono tabular-nums">{fmtKg(b.weightKg)} kg</td>
                        <td className="p-3 text-right font-mono tabular-nums text-blue-700">
                          {fmtKg(b.deliveredKg)} kg
                        </td>
                        <td className="p-3 text-right font-mono tabular-nums font-extrabold text-emerald-700">
                          {fmtKg(b.availableKg)} kg
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <div className="flex flex-col items-center gap-1.5">
                            <div className="flex items-center gap-1.5">
                              {rolePerms?.canDeliver && b.availableKg > 0.009 && (
                                <button
                                  onClick={() => {
                                    setSelectedRackId(null);
                                    selectBatchForDelivery(b, 'Partial');
                                    setActiveSubTab('delivery');
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
                                >
                                  Deliver
                                </button>
                              )}
                              {rolePerms?.canManageRacks && b.availableKg > 0.009 && (
                                <button
                                  onClick={() => {
                                    if (transferBatchId === b.id) {
                                      setTransferBatchId(null);
                                    } else {
                                      setTransferBatchId(b.id);
                                      const otherRack = racks.find((rk) => rk.id !== b.rackId && rk.isActive);
                                      setTransferTargetRackId(otherRack?.id || '');
                                      setTransferSplitKg(String(b.availableKg));
                                    }
                                  }}
                                  className="px-2 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold cursor-pointer flex items-center gap-1"
                                  title="Split partial kg or move full lot to a shared rack"
                                >
                                  <ArrowRightLeft size={11} />
                                  <span>Share / Move</span>
                                </button>
                              )}
                            </div>

                            {transferBatchId === b.id && (
                              <div className="flex items-center gap-1.5 p-1.5 bg-slate-100 rounded-lg border border-slate-300 mt-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  max={b.availableKg}
                                  value={transferSplitKg}
                                  onChange={(e) => setTransferSplitKg(e.target.value)}
                                  className="w-20 px-1.5 py-1 bg-white border border-slate-300 rounded font-mono text-[11px]"
                                  title="Weight (kg) to share/move"
                                />
                                <select
                                  value={transferTargetRackId}
                                  onChange={(e) => setTransferTargetRackId(e.target.value)}
                                  className="px-1.5 py-1 bg-white border border-slate-300 rounded text-[11px] font-bold"
                                >
                                  {racks
                                    .filter((rk) => rk.id !== b.rackId && rk.isActive)
                                    .map((rk) => (
                                      <option key={rk.id} value={rk.id}>
                                        Rack {rk.code}
                                      </option>
                                    ))}
                                </select>
                                <button
                                  onClick={() => handleSplitOrMoveRack(b)}
                                  className="px-2 py-1 bg-slate-900 text-white rounded text-[11px] font-bold cursor-pointer"
                                >
                                  Apply
                                </button>
                              </div>
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
      )}

      {/* ======================================================================== */}
      {/* MODAL: EDIT REQUIREMENT QTY                                              */}
      {/* ======================================================================== */}
      {editingReq && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const qty = parseFloat(editReqQty);
              if (!Number.isFinite(qty) || qty <= 0) return;
              await updateFabricRequirement(editingReq.id, { requiredQtyKg: qty }, editingReq);
              setEditingReq(null);
              showToast('success', `Updated required qty for PO ${editingReq.po} to ${qty.toFixed(2)} kg.`);
            }}
            className="bg-white rounded-2xl max-w-sm w-full p-5 border border-slate-200 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
              <h3 className="text-sm font-extrabold text-slate-900">
                Edit Required Qty (PO {editingReq.po})
              </h3>
              <button
                type="button"
                onClick={() => setEditingReq(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <div className="text-xs text-slate-600">
              {editingReq.fabricType} · {editingReq.color}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Required Qty (kg) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                autoFocus
                value={editReqQty}
                onChange={(e) => setEditReqQty(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingReq(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Save Qty
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ======================================================================== */}
      {/* MODAL: ADD / EDIT RACK                                                   */}
      {/* ======================================================================== */}
      {showRackFormModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveRack}
            className="bg-white rounded-2xl max-w-md w-full p-5 border border-slate-200 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
              <h3 className="text-sm font-extrabold text-slate-900">
                {rackForm.id ? `Edit Rack ${rackForm.code}` : 'Add Warehouse Rack'}
              </h3>
              <button
                type="button"
                onClick={() => setShowRackFormModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Rack Code *</label>
                <input
                  type="text"
                  required
                  value={rackForm.code}
                  onChange={(e) => setRackForm((p) => ({ ...p, code: e.target.value }))}
                  placeholder="e.g. D-01"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono uppercase outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Zone *</label>
                <input
                  type="text"
                  required
                  value={rackForm.zone}
                  onChange={(e) => setRackForm((p) => ({ ...p, zone: e.target.value }))}
                  placeholder="e.g. Zone A (Knit Jersey)"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Capacity (kg)</label>
                <input
                  type="number"
                  min="0"
                  value={rackForm.capacityKg}
                  onChange={(e) => setRackForm((p) => ({ ...p, capacityKg: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  value={rackForm.description}
                  onChange={(e) => setRackForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              {rackForm.id && selectedRackSummary?.rackBatches.length === 0 ? (
                <button
                  type="button"
                  onClick={async () => {
                    await deleteFabricRack(rackForm.id);
                    setShowRackFormModal(false);
                    setSelectedRackId(null);
                    showToast('success', 'Empty rack deleted.');
                  }}
                  className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
                >
                  Delete Rack
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowRackFormModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer"
                >
                  Save Rack
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ======================================================================== */}
      {/* MODAL: RESET PASSWORD (MASTER ADMIN)                                     */}
      {/* ======================================================================== */}
      {resetPwdUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleResetUserPassword}
            className="bg-white rounded-2xl max-w-sm w-full p-5 border border-slate-200 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
              <h3 className="text-sm font-extrabold text-slate-900">
                Reset Password: @{resetPwdUser.username}
              </h3>
              <button
                type="button"
                onClick={() => setResetPwdUser(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">New Password *</label>
              <input
                type="password"
                required
                minLength={4}
                autoFocus
                value={resetPwdValue}
                onChange={(e) => setResetPwdValue(e.target.value)}
                placeholder="Min 4 characters"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetPwdUser(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Update Password
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ======================================================================== */}
      {/* MODAL: PRINTABLE FABRIC SUPPLY / ISSUE SLIP                              */}
      {/* ======================================================================== */}
      {printSlipDelivery && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 border border-slate-200 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Felix Fashions Ltd — Fabric Supply Slip
                </h3>
                <p className="text-xs text-slate-500">Store Department · Four H Group</p>
              </div>
              <button
                onClick={() => setPrintSlipDelivery(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer print:hidden"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs border border-slate-300 rounded-xl p-4">
              <div>
                <span className="text-slate-500 block">Supply No</span>
                <span className="font-mono font-extrabold text-slate-900 text-sm">
                  {printSlipDelivery.supplyNo}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Delivery Date & Type</span>
                <span className="font-mono font-bold text-slate-900">
                  {printSlipDelivery.deliveryDate} ({printSlipDelivery.deliveryType})
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Buyer</span>
                <span className="font-bold text-slate-900">{printSlipDelivery.buyer}</span>
              </div>
              <div>
                <span className="text-slate-500 block">PO Number</span>
                <span className="font-mono font-extrabold text-slate-900">{printSlipDelivery.po}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Style / Item</span>
                <span className="font-semibold text-slate-800">
                  {printSlipDelivery.style || '-'} · {printSlipDelivery.itemName || '-'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Rack / Lot No</span>
                <span className="font-mono font-bold text-slate-800">
                  {printSlipDelivery.rackCode || '-'} · {printSlipDelivery.lotNo || '-'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Fabric / Color / GSM</span>
                <span className="font-semibold text-slate-800">
                  {printSlipDelivery.fabricType || '-'} · {printSlipDelivery.color || '-'}{' '}
                  {printSlipDelivery.gsm ? `(${printSlipDelivery.gsm})` : ''}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Issued Weight & Rolls</span>
                <span className="font-mono font-extrabold text-blue-800 text-sm">
                  {fmtKg(printSlipDelivery.weightKg)} kg{' '}
                  {printSlipDelivery.rollCount ? `(${printSlipDelivery.rollCount} Rolls)` : ''}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Issued To</span>
                <span className="font-bold text-slate-900">{printSlipDelivery.issuedTo}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Receiver / Store Officer</span>
                <span className="font-semibold text-slate-800">
                  {printSlipDelivery.receiverName || '-'} / @{printSlipDelivery.createdBy}
                </span>
              </div>
              {printSlipDelivery.remark && (
                <div className="col-span-2 pt-2 border-t border-slate-200">
                  <span className="text-slate-500 block">Remark</span>
                  <span className="text-slate-800">{printSlipDelivery.remark}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-6 pt-6 text-center text-xs text-slate-500">
              <div className="border-t border-slate-300 pt-1.5">Issued By</div>
              <div className="border-t border-slate-300 pt-1.5">Received By</div>
              <div className="border-t border-slate-300 pt-1.5">Store In-Charge</div>
            </div>

            <div className="flex justify-end gap-2 pt-2 print:hidden">
              <button
                onClick={() => setPrintSlipDelivery(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5"
              >
                <Printer size={14} />
                <span>Print Slip</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
