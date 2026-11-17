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
  Sliders,
  QrCode,
} from 'lucide-react';
import {
  FabricRole,
  FabricUser,
  FabricRack,
  FabricRequirement,
  FabricReceiving,
  FabricDelivery,
  FabricAuditLog,
  FabricPermissionMap,
  FabricRolePermissionConfig,
  DEFAULT_ROLE_PERMISSIONS,
  bootstrapFabricStoreDefaults,
  subscribeToFabricUsers,
  subscribeToFabricRolePermissions,
  saveFabricRolePermissionConfig,
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
  createFabricDeliveryBatch,
  deleteFabricDelivery,
  logFabricAudit,
} from '../firebase';
import {
  RolePermissionsMatrixCard,
  UserCustomPermissionModal,
  ALL_FABRIC_ROLES,
  ROLE_BADGE_CLASSES,
  resolveEffectivePermissions,
} from './fabric-store/RolePermissionsPanel';
import {
  MultiPoDeliverySection,
  DeliveryQueueLine,
  EnrichedReceivingBatch,
} from './fabric-store/MultiPoDeliverySection';
import { RackStockSection } from './fabric-store/RackStockSection';
import { FabricBookingSection } from './fabric-store/FabricBookingSection';
import { FabricReceivingSection } from './fabric-store/FabricReceivingSection';
import { PoBalanceSection } from './fabric-store/PoBalanceSection';
import { BulkRackQrPrintModal, RackQrModal } from './fabric-store/RackQrModal';
import { RackSummaryItem, getZoneColorPalette } from './fabric-store/rackZoneTheme';

interface FabricStoreTabProps {
  allMasterOrders: any[];
  lineNames: string[];
  initialRackId?: string | null;
  onConsumeInitialRackId?: () => void;
  onPreviewPublicRack?: (rackCode: string) => void;
}

type FabricSubTab = 'racks' | 'requirements' | 'receiving' | 'delivery' | 'ledger' | 'users';

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

export default function FabricStoreTab({
  allMasterOrders,
  lineNames,
  initialRackId,
  onConsumeInitialRackId,
  onPreviewPublicRack,
}: FabricStoreTabProps) {
  // Firestore Live Collections
  const [users, setUsers] = useState<FabricUser[]>([]);
  const [roleConfigs, setRoleConfigs] = useState<Record<FabricRole, FabricRolePermissionConfig>>(() => {
    const init = {} as Record<FabricRole, FabricRolePermissionConfig>;
    ALL_FABRIC_ROLES.forEach((rk) => {
      init[rk] = {
        id: rk,
        role: rk,
        label: DEFAULT_ROLE_PERMISSIONS[rk].label,
        description: DEFAULT_ROLE_PERMISSIONS[rk].description,
        permissions: { ...DEFAULT_ROLE_PERMISSIONS[rk].permissions },
        updatedAt: '',
        updatedBy: 'default',
      };
    });
    return init;
  });
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
  const [qrModalRack, setQrModalRack] = useState<RackSummaryItem | null>(null);
  const [showBulkQrModal, setShowBulkQrModal] = useState(false);
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
    const unsubRolePerms = subscribeToFabricRolePermissions((cfg) => setRoleConfigs(cfg));
    const unsubRacks = subscribeToFabricRacks((list) => setRacks(list));
    const unsubReq = subscribeToFabricRequirements((list) => setRequirements(list));
    const unsubRec = subscribeToFabricReceivings((list) => setReceivings(list));
    const unsubDel = subscribeToFabricDeliveries((list) => setDeliveries(list));
    const unsubAudit = subscribeToFabricAuditLogs((list) => setAuditLogs(list));

    return () => {
      active = false;
      unsubUsers();
      unsubRolePerms();
      unsubRacks();
      unsubReq();
      unsubRec();
      unsubDel();
      unsubAudit();
    };
  }, []);

  // Handoff from Public QR Rack View -> Manage Rack
  useEffect(() => {
    if (!initialRackId) return;
    try {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.userId && !currentUserId) {
          setCurrentUserId(parsed.userId);
          if (parsed.fallbackUser) setFallbackAdminSession(parsed.fallbackUser);
        }
      }
    } catch {
      // ignore
    }
    setActiveSubTab('racks');
    setSelectedRackId(initialRackId);
    setRackDetailShowExhausted(false);
    setTransferBatchId(null);
    if (onConsumeInitialRackId) onConsumeInitialRackId();
  }, [initialRackId, currentUserId, onConsumeInitialRackId]);

  const currentUser: FabricUser | null = useMemo(() => {
    if (!currentUserId) return null;
    const live = users.find((u) => u.id === currentUserId);
    if (live) return live.isActive ? live : null;
    if (fallbackAdminSession && fallbackAdminSession.id === currentUserId) return fallbackAdminSession;
    return null;
  }, [currentUserId, users, fallbackAdminSession]);

  const effectivePerms = useMemo(
    () => resolveEffectivePermissions(currentUser, roleConfigs),
    [currentUser, roleConfigs]
  );

  const rolePerms = useMemo(() => {
    if (!currentUser) return null;
    const roleCfg = roleConfigs[currentUser.role] || DEFAULT_ROLE_PERMISSIONS.viewer;
    const hasCustom =
      currentUser.customPermissions && Object.keys(currentUser.customPermissions).length > 0;
    return {
      label: roleCfg.label,
      badgeClass: ROLE_BADGE_CLASSES[currentUser.role] || ROLE_BADGE_CLASSES.viewer,
      summary: roleCfg.description,
      hasCustomOverrides: Boolean(hasCustom),
      canViewRacks: effectivePerms.viewRacks,
      canBook: effectivePerms.bookFabric,
      canReceive: effectivePerms.receiveFabric,
      canDeliver: effectivePerms.deliverFabric,
      canManageRacks: effectivePerms.manageRacks,
      canDeleteRecords: effectivePerms.deleteRecords,
      canManageUsers: effectivePerms.manageUsers,
      canViewAudit: effectivePerms.viewAudit,
      canExport: effectivePerms.exportData,
    };
  }, [currentUser, roleConfigs, effectivePerms]);

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
          details: `${matched.fullName} (@${matched.username}, ${roleConfigs[matched.role]?.label || matched.role}) signed in.`,
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

  const rackZoneByCode = useMemo(() => {
    const map: Record<string, string> = {};
    racks.forEach((r) => {
      if (r.code) map[r.code] = r.zone || 'General Store';
    });
    return map;
  }, [racks]);

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
    if (!rolePerms?.canBook || !currentUser) return;
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
  // MULTI-PO & MULTI-RACK DELIVERY / SUPPLY QUEUE & HANDLERS
  // ============================================================================
  const [delPoSearch, setDelPoSearch] = useState('');
  const [deliveryQueue, setDeliveryQueue] = useState<DeliveryQueueLine[]>([]);

  const selectBatchForDelivery = (
    batch: EnrichedReceivingBatch,
    mode: 'Full' | 'Partial' = 'Partial'
  ) => {
    if (batch.availableKg <= 0.009) return;
    setDeliveryQueue((prev) => {
      if (prev.some((q) => q.batchId === batch.id)) return prev;
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

  const handleSubmitDeliveryBatch = async (params: {
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
  }): Promise<boolean> => {
    if (!rolePerms?.canDeliver || !currentUser || params.lines.length === 0) return false;

    const supplyGroupId = `sup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const payloadItems: Array<Omit<FabricDelivery, 'id' | 'createdAt'>> = params.lines.map(
      ({ batch, mode, weightKg, rollCount }) => ({
        receivingId: batch.id,
        supplyNo: params.supplyNo,
        supplyGroupId,
        buyer: batch.buyer,
        po: batch.po,
        style: batch.style || '',
        itemName: batch.itemName || '',
        fileNo: batch.fileNo || '',
        shipDate: batch.shipDate || '',
        rackCode: batch.rackCode,
        fabricType: batch.fabricType,
        color: batch.color,
        gsm: batch.gsm || '',
        lotNo: batch.lotNo,
        deliveryType: mode,
        weightKg,
        rollCount,
        issuedTo: params.issuedTo,
        receiverName: params.receiverName,
        deliveryDate: params.deliveryDate,
        remark: params.remark,
        createdBy: currentUser.username,
      })
    );

    try {
      await createFabricDeliveryBatch(payloadItems);
      const totalKg = payloadItems.reduce((s, item) => s + item.weightKg, 0);
      const uniquePos = Array.from(new Set(payloadItems.map((i) => i.po)));
      const uniqueRacks = Array.from(new Set(payloadItems.map((i) => i.rackCode)));

      await logFabricAudit({
        action: 'Issued Multi-PO Supply',
        module: 'Delivery',
        details: `Supply ${params.supplyNo}: ${totalKg.toFixed(2)} kg across ${uniquePos.length} PO(s) [${uniquePos.join(', ')}] & Racks [${uniqueRacks.join(', ')}] to ${params.issuedTo}`,
        actorUsername: currentUser.username,
        actorRole: currentUser.role,
      });

      showToast(
        'success',
        `Issued Supply ${params.supplyNo}: ${fmtKg(totalKg)} kg across ${uniquePos.length} PO(s) & ${uniqueRacks.length} Rack(s).`
      );
      return true;
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to record fabric delivery batch.');
      return false;
    }
  };

  const handleDeleteDeliveryRecord = async (del: FabricDelivery) => {
    if (!rolePerms?.canDeleteRecords || !currentUser) return;
    try {
      await deleteFabricDelivery(del.id);
      await logFabricAudit({
        action: 'Deleted Delivery',
        module: 'Delivery',
        details: `Reversed supply ${del.supplyNo} (${del.weightKg} kg) for PO ${del.po} Rack ${del.rackCode || '-'}`,
        actorUsername: currentUser.username,
        actorRole: currentUser.role,
      });
      showToast('success', `Supply ${del.supplyNo} line removed and stock restored.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Delete failed.');
    }
  };

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
  const [permModalUser, setPermModalUser] = useState<FabricUser | null>(null);

  const handleSaveRolePermissions = async (
    role: FabricRole,
    permissions: FabricPermissionMap
  ) => {
    if (!rolePerms?.canManageUsers || !currentUser) return;
    const cfg = roleConfigs[role] || DEFAULT_ROLE_PERMISSIONS[role];
    try {
      await saveFabricRolePermissionConfig(
        role,
        cfg.label,
        cfg.description,
        permissions,
        currentUser.username
      );
      await logFabricAudit({
        action: 'Updated Role Permissions',
        module: 'Permissions',
        details: `Admin updated access permissions for role ${cfg.label}`,
        actorUsername: currentUser.username,
        actorRole: currentUser.role,
      });
      showToast('success', `Updated permissions for ${cfg.label}.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to update role permissions.');
    }
  };

  const handleResetRoleDefaults = async (role: FabricRole) => {
    if (!rolePerms?.canManageUsers || !currentUser) return;
    const def = DEFAULT_ROLE_PERMISSIONS[role];
    try {
      await saveFabricRolePermissionConfig(
        role,
        def.label,
        def.description,
        def.permissions,
        currentUser.username
      );
      await logFabricAudit({
        action: 'Reset Role Permissions',
        module: 'Permissions',
        details: `Restored default permissions for role ${def.label}`,
        actorUsername: currentUser.username,
        actorRole: currentUser.role,
      });
      showToast('success', `Restored defaults for ${def.label}.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to reset permissions.');
    }
  };

  const handleSaveUserCustomPermissions = async (
    targetUser: FabricUser,
    customPermissions: Partial<FabricPermissionMap>
  ) => {
    if (!rolePerms?.canManageUsers || !currentUser) return;
    try {
      await updateFabricUser(targetUser.id, { customPermissions }, targetUser);
      await logFabricAudit({
        action: 'Updated User Permissions',
        module: 'Permissions',
        details: `Updated custom permission overrides for @${targetUser.username} (${Object.keys(customPermissions).length} override(s))`,
        actorUsername: currentUser.username,
        actorRole: currentUser.role,
      });
      showToast('success', `Saved custom permissions for @${targetUser.username}.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to update user permissions.');
    }
  };

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
        details: `Created @${newUserForm.username.toLowerCase()} with role ${roleConfigs[newUserForm.role]?.label || newUserForm.role}`,
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
        details: `Changed @${targetUser.username} role from ${roleConfigs[targetUser.role]?.label || targetUser.role} to ${roleConfigs[newRole]?.label || newRole}`,
        actorUsername: currentUser.username,
        actorRole: currentUser.role,
      });
      showToast('success', `Updated @${targetUser.username} to ${roleConfigs[newRole]?.label || newRole}.`);
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
      <div className="bg-white rounded-2xl border border-slate-300 shadow-xs p-4 sm:p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
              Fabric Receiving & Supply Management
            </h2>
            <span className="text-xs text-slate-400">·</span>
            <span className={`text-xs font-extrabold px-2.5 py-0.5 rounded-md border ${rolePerms?.badgeClass}`}>
              {rolePerms?.label}
            </span>
            {rolePerms?.hasCustomOverrides && (
              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-md border border-blue-300 bg-blue-50 text-blue-800">
                Custom Permissions
              </span>
            )}
          </div>
          <p className="text-xs sm:text-[13px] text-slate-600 mt-1">
            Signed in as <span className="font-extrabold text-slate-900">{currentUser.fullName}</span> (@{currentUser.username}) · {rolePerms?.summary}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 w-full xl:w-auto">
          <div className="flex-1 xl:flex-initial flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-300 overflow-x-auto scrollbar-none">
            {rolePerms?.canViewRacks && (
              <button
                onClick={() => setActiveSubTab('racks')}
                className={`min-h-[40px] px-3 py-2 rounded-lg text-xs sm:text-[13px] font-bold whitespace-nowrap shrink-0 transition cursor-pointer flex items-center gap-1.5 ${
                  activeSubTab === 'racks'
                    ? 'bg-white text-slate-900 shadow-2xs border border-slate-300'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Warehouse size={15} />
                <span>Rack Stock</span>
              </button>
            )}

            <button
              onClick={() => setActiveSubTab('requirements')}
              className={`min-h-[40px] px-3 py-2 rounded-lg text-xs sm:text-[13px] font-bold whitespace-nowrap shrink-0 transition cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'requirements'
                  ? 'bg-white text-slate-900 shadow-2xs border border-slate-300'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookmarkCheck size={15} />
              <span>Fabric Booking</span>
            </button>

            <button
              onClick={() => setActiveSubTab('receiving')}
              className={`min-h-[40px] px-3 py-2 rounded-lg text-xs sm:text-[13px] font-bold whitespace-nowrap shrink-0 transition cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'receiving'
                  ? 'bg-white text-slate-900 shadow-2xs border border-slate-300'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PackagePlus size={15} />
              <span>Receiving (Challan)</span>
            </button>

            <button
              onClick={() => setActiveSubTab('delivery')}
              className={`min-h-[40px] px-3 py-2 rounded-lg text-xs sm:text-[13px] font-bold whitespace-nowrap shrink-0 transition cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'delivery'
                  ? 'bg-white text-slate-900 shadow-2xs border border-slate-300'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Truck size={15} />
              <span>Delivery</span>
            </button>

            <button
              onClick={() => setActiveSubTab('ledger')}
              className={`min-h-[40px] px-3 py-2 rounded-lg text-xs sm:text-[13px] font-bold whitespace-nowrap shrink-0 transition cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'ledger'
                  ? 'bg-white text-slate-900 shadow-2xs border border-slate-300'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardList size={15} />
              <span>PO Balance</span>
            </button>

            {rolePerms?.canManageUsers && (
              <button
                onClick={() => setActiveSubTab('users')}
                className={`min-h-[40px] px-3 py-2 rounded-lg text-xs sm:text-[13px] font-bold whitespace-nowrap shrink-0 transition cursor-pointer flex items-center gap-1.5 ${
                  activeSubTab === 'users'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <Users size={15} />
                <span>Admin & Permissions</span>
              </button>
            )}
          </div>

          <button
            onClick={handleSignOut}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 text-slate-800 text-xs sm:text-[13px] font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
            title="Lock Fabric Store session"
          >
            <LogOut size={15} />
            <span>Lock</span>
          </button>
        </div>
      </div>

      {/* ======================================================================== */}
      {/* SUB-TAB 1: MODERN RACK-WISE FABRIC STOCK SUMMARY (Home Rack Page)        */}
      {/* ======================================================================== */}
      {activeSubTab === 'racks' && !rolePerms?.canViewRacks && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5 text-[13px] font-semibold text-amber-900">
          Your role ({rolePerms?.label}) does not have permission to view Rack Stock Summary. Use the tabs above to access your permitted sections.
        </div>
      )}

      {activeSubTab === 'racks' && rolePerms?.canViewRacks && (
        <RackStockSection
          overallTotals={overallTotals}
          zoneStats={zoneStats}
          rackZones={rackZones}
          totalRacksCount={racks.length}
          filteredRackSummaries={filteredRackSummaries}
          rackSearch={rackSearch}
          onRackSearchChange={setRackSearch}
          rackZoneFilter={rackZoneFilter}
          onRackZoneFilterChange={setRackZoneFilter}
          canExport={Boolean(rolePerms?.canExport)}
          canManageRacks={Boolean(rolePerms?.canManageRacks)}
          onExportCsv={() =>
            exportCsvFile(
              `rack_stock_summary_${todayISO()}.csv`,
              [
                'Rack Code',
                'Zone',
                'Capacity (kg)',
                'Current Stock (kg)',
                'Free Space (kg)',
                'Fill %',
                'Active Lots',
                'Received (kg)',
                'Delivered (kg)',
                'Buyers',
                'POs',
              ],
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
          onAddRack={() => {
            setRackForm({
              id: '',
              code: '',
              zone: rackZones[0] || 'Zone A (Knit Jersey)',
              capacityKg: '2500',
              description: '',
            });
            setShowRackFormModal(true);
          }}
          onSelectRack={(rackId) => {
            setSelectedRackId(rackId);
            setRackDetailShowExhausted(false);
            setTransferBatchId(null);
          }}
          onOpenRackQr={(item) => setQrModalRack(item)}
          onOpenBulkQrPrint={() => setShowBulkQrModal(true)}
        />
      )}

      {/* ======================================================================== */}
      {/* SUB-TAB 2: FABRIC BOOKING / REQUIREMENTS (Before Receiving)              */}
      {/* ======================================================================== */}
      {activeSubTab === 'requirements' && (
        <FabricBookingSection
          canBook={Boolean(rolePerms?.canBook)}
          canDeleteRecords={Boolean(rolePerms?.canDeleteRecords)}
          canExport={Boolean(rolePerms?.canExport)}
          sheetBuyerNames={sheetBuyerNames}
          reqPoSearch={reqPoSearch}
          onReqPoSearchChange={setReqPoSearch}
          reqBuyerFilter={reqBuyerFilter}
          onReqBuyerFilterChange={setReqBuyerFilter}
          reqMatchingSheetOrders={reqMatchingSheetOrders}
          selectedOrderForReq={selectedOrderForReq}
          onSelectOrderForReq={setSelectedOrderForReq}
          reqForm={reqForm}
          onReqFormChange={setReqForm}
          isSavingReq={isSavingReq}
          onSubmitRequirement={handleCreateRequirement}
          fabricTypeSuggestions={FABRIC_TYPE_SUGGESTIONS}
          enrichedRequirements={enrichedRequirements}
          reqTableSearch={reqTableSearch}
          onReqTableSearchChange={setReqTableSearch}
          onExportCsv={(rows) =>
            exportCsvFile(
              `fabric_requirements_${todayISO()}.csv`,
              ['Buyer', 'PO', 'Style', 'Item', 'Ship Date', 'Fabric Type', 'Color', 'GSM', 'Required (kg)', 'Received (kg)', 'Pending (kg)', 'Supplier'],
              rows.map((r) => [
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
          onEditReqQty={(r) => {
            setEditingReq(r);
            setEditReqQty(String(r.requiredQtyKg));
          }}
          onDeleteReq={async (r) => {
            await deleteFabricRequirement(r.id);
            showToast('success', `Requirement for PO ${r.po} deleted.`);
          }}
        />
      )}

      {/* ======================================================================== */}
      {/* SUB-TAB 3: CHALLAN-WISE MULTI-PO BULK RECEIVING & SHARED RACK SPLIT      */}
      {/* ======================================================================== */}
      {activeSubTab === 'receiving' && (
        <FabricReceivingSection
          canReceive={Boolean(rolePerms?.canReceive)}
          canDeliver={Boolean(rolePerms?.canDeliver)}
          canDeleteRecords={Boolean(rolePerms?.canDeleteRecords)}
          canExport={Boolean(rolePerms?.canExport)}
          roleLabel={rolePerms?.label || 'Viewer'}
          challanHeader={challanHeader}
          onChallanHeaderChange={setChallanHeader}
          challanLines={challanLines}
          onRemoveChallanLine={(localId) =>
            setChallanLines((prev) => prev.filter((l) => l.localId !== localId))
          }
          onUpdateChallanLine={updateChallanLine}
          onUpdateChallanLineSplit={updateChallanLineSplit}
          isSubmittingChallan={isSubmittingChallan}
          onSaveFullChallan={handleSaveFullChallan}
          isManualPoMode={isManualPoMode}
          onToggleManualPoMode={() => {
            setIsManualPoMode((v) => !v);
            setSelectedOrderForRec(null);
          }}
          manualPoForm={manualPoForm}
          onManualPoFormChange={setManualPoForm}
          recPoSearch={recPoSearch}
          onRecPoSearchChange={setRecPoSearch}
          recBuyerFilter={recBuyerFilter}
          onRecBuyerFilterChange={setRecBuyerFilter}
          sheetBuyerNames={sheetBuyerNames}
          recMatchingSheetOrders={recMatchingSheetOrders}
          selectedOrderForRec={selectedOrderForRec}
          onSelectSheetOrderForRec={handleSelectSheetOrderForRec}
          enrichedRequirements={enrichedRequirements}
          selectedPoRequirements={selectedPoRequirements}
          onAddAllPendingReqsForPo={addAllPendingReqsForPoToChallan}
          onAddCustomPoLine={addCustomPoLineToChallan}
          onAddRequirementToChallan={addRequirementToChallan}
          onBookRequiredQtyFirst={() => {
            setSelectedOrderForReq(selectedOrderForRec);
            setActiveSubTab('requirements');
          }}
          rackSummaries={rackSummaries}
          rackZoneByCode={rackZoneByCode}
          defaultRackId={defaultRackId}
          secondRackId={racks[1]?.id || defaultRackId}
          fabricTypeSuggestions={FABRIC_TYPE_SUGGESTIONS}
          recRegisterView={recRegisterView}
          onRecRegisterViewChange={setRecRegisterView}
          recLedgerSearch={recLedgerSearch}
          onRecLedgerSearchChange={setRecLedgerSearch}
          challanGroups={challanGroups}
          filteredReceivingsLedger={filteredReceivingsLedger}
          expandedChallans={expandedChallans}
          onToggleExpandChallan={(groupKey) =>
            setExpandedChallans((prev) => ({
              ...prev,
              [groupKey]: !(prev[groupKey] ?? true),
            }))
          }
          onExportCsv={() =>
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
          onDeliverBatch={(r) => {
            selectBatchForDelivery(r, 'Partial');
            setActiveSubTab('delivery');
          }}
          onDeleteReceivingRecord={handleDeleteReceivingRecord}
        />
      )}

      {/* ======================================================================== */}
      {/* SUB-TAB 4: MULTI-PO & MULTI-RACK FABRIC DELIVERY / SUPPLY                */}
      {/* ======================================================================== */}
      {activeSubTab === 'delivery' && (
        <MultiPoDeliverySection
          enrichedReceivings={enrichedReceivings}
          deliveries={deliveries}
          lineNames={lineNames}
          canDeliver={Boolean(rolePerms?.canDeliver)}
          canDeleteRecords={Boolean(rolePerms?.canDeleteRecords)}
          canExportData={Boolean(rolePerms?.canExport)}
          roleLabel={rolePerms?.label || 'Viewer'}
          deliveryQueue={deliveryQueue}
          setDeliveryQueue={setDeliveryQueue}
          delPoSearch={delPoSearch}
          setDelPoSearch={setDelPoSearch}
          onSubmitDeliveryBatch={handleSubmitDeliveryBatch}
          onDeleteDeliveryRecord={handleDeleteDeliveryRecord}
          onShowToast={showToast}
          rackZoneByCode={rackZoneByCode}
        />
      )}

      {/* ======================================================================== */}
      {/* SUB-TAB 5: PO-WISE FABRIC BALANCE LEDGER                                 */}
      {/* ======================================================================== */}
      {activeSubTab === 'ledger' && (
        <PoBalanceSection
          poLedgerList={poLedgerList}
          ledgerSearch={ledgerSearch}
          onLedgerSearchChange={setLedgerSearch}
          rackZoneByCode={rackZoneByCode}
          canDeliver={Boolean(rolePerms?.canDeliver)}
          canExport={Boolean(rolePerms?.canExport)}
          onExportCsv={(rows) =>
            exportCsvFile(
              `po_fabric_balance_${todayISO()}.csv`,
              ['Buyer', 'PO', 'Style', 'Item', 'File No', 'Ship Date', 'Required (kg)', 'Received (kg)', 'Delivered (kg)', 'Balance (kg)', 'Racks'],
              rows.map((p) => [
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
          onDeliverPo={(po) => {
            setDelPoSearch(po);
            setActiveSubTab('delivery');
          }}
        />
      )}

      {/* ======================================================================== */}
      {/* SUB-TAB 6: MASTER ADMIN ROLE PERMISSIONS, USERS & AUDIT LOG              */}
      {/* ======================================================================== */}
      {activeSubTab === 'users' && rolePerms?.canManageUsers && (
        <div className="space-y-6">
          {/* Dynamic Admin Role Permission Giving Matrix */}
          <RolePermissionsMatrixCard
            roleConfigs={roleConfigs}
            onSaveRolePermissions={handleSaveRolePermissions}
            onResetRoleDefaults={handleResetRoleDefaults}
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <form
              onSubmit={handleCreateUser}
              className="lg:col-span-4 bg-white rounded-2xl border border-slate-300 shadow-xs p-5 space-y-3.5"
            >
              <div className="pb-3 border-b border-slate-300">
                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <UserPlus size={17} />
                  <span>Create Store User</span>
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">Add staff accounts and assign access roles</p>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1">Username *</label>
                <input
                  type="text"
                  required
                  value={newUserForm.username}
                  onChange={(e) => setNewUserForm((p) => ({ ...p, username: e.target.value }))}
                  placeholder="e.g. rahim_store"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-[13px] font-mono outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={newUserForm.fullName}
                  onChange={(e) => setNewUserForm((p) => ({ ...p, fullName: e.target.value }))}
                  placeholder="e.g. Md Rahim Uddin"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-[13px] outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1">Password *</label>
                <input
                  type="password"
                  required
                  minLength={4}
                  value={newUserForm.password}
                  onChange={(e) => setNewUserForm((p) => ({ ...p, password: e.target.value }))}
                  placeholder="Min 4 characters"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-[13px] outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1">Role *</label>
                <select
                  value={newUserForm.role}
                  onChange={(e) => setNewUserForm((p) => ({ ...p, role: e.target.value as FabricRole }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-[13px] font-bold text-slate-900 outline-none"
                >
                  {ALL_FABRIC_ROLES.map((roleKey) => (
                    <option key={roleKey} value={roleKey}>
                      {roleConfigs[roleKey]?.label || roleKey}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-600 mt-1">
                  {roleConfigs[newUserForm.role]?.description}
                </p>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1">Department</label>
                <input
                  type="text"
                  value={newUserForm.department}
                  onChange={(e) => setNewUserForm((p) => ({ ...p, department: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-[13px] outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isCreatingUser}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-[13px] font-bold rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                {isCreatingUser ? 'Creating User...' : 'Create User Account'}
              </button>
            </form>

            <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-300 shadow-xs overflow-hidden">
              <div className="p-4 md:p-5 border-b border-slate-300 bg-slate-50">
                <h3 className="text-base font-extrabold text-slate-900">User & Role Directory</h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Change user roles, grant custom permissions per user, reset passwords, or suspend accounts
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[13px]">
                  <thead className="bg-slate-100 text-slate-800 uppercase text-xs font-extrabold">
                    <tr>
                      <th className="p-3 border-b border-r border-slate-300">User</th>
                      <th className="p-3 border-b border-r border-slate-300">Role</th>
                      <th className="p-3 border-b border-r border-slate-300">Status</th>
                      <th className="p-3 border-b border-slate-300 text-right">Manage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {users.map((u) => {
                      const customCount = u.customPermissions
                        ? Object.keys(u.customPermissions).length
                        : 0;
                      return (
                        <tr key={u.id} className="hover:bg-slate-50">
                          <td className="p-3 border-r border-slate-200">
                            <div className="font-extrabold text-slate-900">{u.fullName}</div>
                            <div className="text-xs font-mono text-slate-600">
                              @{u.username} · {u.department || 'Fabric Store'}
                            </div>
                          </td>
                          <td className="p-3 border-r border-slate-200">
                            <select
                              value={u.role}
                              onChange={(e) => handleChangeUserRole(u, e.target.value as FabricRole)}
                              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 outline-none cursor-pointer"
                            >
                              {ALL_FABRIC_ROLES.map((rk) => (
                                <option key={rk} value={rk}>
                                  {roleConfigs[rk]?.label || rk}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-3 border-r border-slate-200">
                            <button
                              onClick={() => handleToggleUserActive(u)}
                              className={`text-xs font-extrabold px-2.5 py-1 rounded-lg border cursor-pointer ${
                                u.isActive
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : 'bg-rose-50 text-rose-700 border-rose-300'
                              }`}
                            >
                              {u.isActive ? 'Active' : 'Disabled'}
                            </button>
                          </td>
                          <td className="p-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setPermModalUser(u)}
                                className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1 cursor-pointer ${
                                  customCount > 0
                                    ? 'border-blue-400 bg-blue-50 text-blue-800 hover:bg-blue-100'
                                    : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-800'
                                }`}
                                title="Grant or restrict specific permissions for this user"
                              >
                                <Sliders size={12} />
                                <span>
                                  Permissions{customCount > 0 ? ` (${customCount})` : ''}
                                </span>
                              </button>
                              <button
                                onClick={() => {
                                  setResetPwdUser(u);
                                  setResetPwdValue('');
                                }}
                                className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold cursor-pointer"
                              >
                                Reset Pwd
                              </button>
                              {u.id !== currentUser.id && (
                                <button
                                  onClick={() => handleDeleteUser(u)}
                                  className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                                  title="Delete user"
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
            </div>
          </div>

          {/* Activity Audit Log */}
          {rolePerms?.canViewAudit && (
            <div className="bg-white rounded-2xl border border-slate-300 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-300 bg-slate-50 flex items-center gap-2">
                <History size={16} className="text-slate-700" />
                <h3 className="text-base font-extrabold text-slate-900">Store Activity Audit Trail</h3>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-200 text-[13px]">
                {auditLogs.length === 0 ? (
                  <div className="p-6 text-center text-slate-500">No audit entries logged yet.</div>
                ) : (
                  auditLogs.map((log) => (
                    <div key={log.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <span className="font-extrabold text-slate-900">{log.action}</span>
                        <span className="text-slate-400 mx-1.5">·</span>
                        <span className="text-slate-700">{log.details}</span>
                      </div>
                      <div className="text-xs font-mono text-slate-500 shrink-0">
                        @{log.actorUsername} · {new Date(log.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================================== */}
      {/* MODAL: RACK STOCK DETAILS & SHARED RACK SPLIT / TRANSFER                 */}
      {/* ======================================================================== */}
      {selectedRackSummary && (() => {
        const rackPalette = getZoneColorPalette(selectedRackSummary.rack.zone);
        const modalLots = rackDetailShowExhausted
          ? selectedRackSummary.rackBatches
          : selectedRackSummary.activeBatches;

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
              <div className={`p-4 sm:p-5 ${rackPalette.headerBg} ${rackPalette.headerText} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold font-mono">
                    Rack {selectedRackSummary.rack.code} — Stock & Management
                  </h3>
                  <p className={`text-xs mt-0.5 font-mono ${rackPalette.headerSubtext}`}>
                    {selectedRackSummary.rack.zone} · Stock: {fmtKg(selectedRackSummary.currentKg)} kg · Free:{' '}
                    {fmtKg(selectedRackSummary.freeCapacityKg)} kg / {fmtKg(selectedRackSummary.rack.capacityKg)} kg
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setQrModalRack(selectedRackSummary)}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-bold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <QrCode size={14} />
                    <span>Fixed QR</span>
                  </button>
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
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-bold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Edit3 size={13} />
                      <span>Edit Rack</span>
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedRackId(null)}
                    className="min-h-[40px] min-w-[40px] rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer"
                    aria-label="Close rack modal"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className={`p-3.5 sm:p-4 border-b ${rackPalette.surfaceBorder} ${rackPalette.surfaceBg} flex flex-wrap items-center justify-between gap-3 text-xs`}>
                <div className="flex items-center gap-4 font-mono flex-wrap">
                  <span>
                    Received: <strong>{fmtKg(selectedRackSummary.receivedKg)} kg</strong>
                  </span>
                  <span>
                    Delivered: <strong>{fmtKg(selectedRackSummary.deliveredKg)} kg</strong>
                  </span>
                  <span className="text-emerald-800">
                    Balance: <strong>{fmtKg(selectedRackSummary.currentKg)} kg</strong>
                  </span>
                </div>

                <label className="min-h-[36px] flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rackDetailShowExhausted}
                    onChange={(e) => setRackDetailShowExhausted(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span>Include fully delivered (0 kg) history</span>
                </label>
              </div>

              <div className="overflow-auto flex-1">
                {modalLots.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    No fabric lots in Rack {selectedRackSummary.rack.code}.
                  </div>
                ) : (
                  <>
                    {/* Mobile Cards inside Rack Detail Modal */}
                    <div className="md:hidden p-3 space-y-3 bg-slate-50">
                      {modalLots.map((b) => (
                        <div
                          key={b.id}
                          className="bg-white rounded-2xl border border-slate-200 p-3.5 space-y-2.5 text-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-extrabold text-slate-900 font-mono text-sm">
                                PO {b.po}
                              </div>
                              <div className="text-slate-600 font-semibold">
                                {b.buyer} · {b.style || '-'}
                              </div>
                            </div>
                            <span className="font-mono font-extrabold text-emerald-700 text-sm">
                              {fmtKg(b.availableKg)} kg
                            </span>
                          </div>

                          <div className="text-slate-700">
                            <span className="font-bold">{b.fabricType}</span> · {b.color}{' '}
                            {b.gsm ? `· ${b.gsm}` : ''}
                            <div className="font-mono text-slate-500 mt-0.5">
                              Lot {b.lotNo} · Ch {b.challanNo} · {b.receiveDate}
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-2 border-t border-slate-100">
                            <span>Recv: {fmtKg(b.weightKg)} kg</span>
                            <span>Deliv: {fmtKg(b.deliveredKg)} kg</span>
                          </div>

                          {b.availableKg > 0.009 && (rolePerms?.canDeliver || rolePerms?.canManageRacks) && (
                            <div className="flex items-center gap-2 pt-1">
                              {rolePerms?.canDeliver && (
                                <button
                                  onClick={() => {
                                    setSelectedRackId(null);
                                    selectBatchForDelivery(b, 'Partial');
                                    setActiveSubTab('delivery');
                                  }}
                                  className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
                                >
                                  Deliver
                                </button>
                              )}
                              {rolePerms?.canManageRacks && (
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
                                  className="flex-1 min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-bold cursor-pointer flex items-center justify-center gap-1"
                                >
                                  <ArrowRightLeft size={13} />
                                  <span>Share / Move</span>
                                </button>
                              )}
                            </div>
                          )}

                          {transferBatchId === b.id && (
                            <div className="flex flex-wrap items-center gap-2 p-2 bg-slate-100 rounded-xl border border-slate-300">
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                max={b.availableKg}
                                value={transferSplitKg}
                                onChange={(e) => setTransferSplitKg(e.target.value)}
                                className="min-h-[40px] w-24 px-2 py-1 bg-white border border-slate-300 rounded-lg font-mono text-xs"
                              />
                              <select
                                value={transferTargetRackId}
                                onChange={(e) => setTransferTargetRackId(e.target.value)}
                                className="min-h-[40px] flex-1 px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold"
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
                                className="min-h-[40px] px-3 py-1 bg-slate-900 text-white rounded-lg text-xs font-bold cursor-pointer"
                              >
                                Apply
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Desktop Table inside Rack Detail Modal */}
                    <table className="hidden md:table w-full text-left border-collapse text-xs">
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
                        {modalLots.map((b) => (
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
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

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
      {/* MODAL: USER CUSTOM PERMISSIONS OVERRIDES                                 */}
      {/* ======================================================================== */}
      {permModalUser && (
        <UserCustomPermissionModal
          user={permModalUser}
          roleConfigs={roleConfigs}
          onClose={() => setPermModalUser(null)}
          onSaveUserPermissions={handleSaveUserCustomPermissions}
        />
      )}

      {/* ======================================================================== */}
      {/* MODAL: SINGLE RACK FIXED QR TAG                                          */}
      {/* ======================================================================== */}
      {qrModalRack && (
        <RackQrModal
          rackSummary={qrModalRack}
          onClose={() => setQrModalRack(null)}
          onPreviewPublicView={(rackCode) => {
            setQrModalRack(null);
            setSelectedRackId(null);
            if (onPreviewPublicRack) onPreviewPublicRack(rackCode);
          }}
        />
      )}

      {/* ======================================================================== */}
      {/* MODAL: BULK PRINT ALL RACK QR LABELS                                     */}
      {/* ======================================================================== */}
      {showBulkQrModal && (
        <BulkRackQrPrintModal
          rackSummaries={rackSummaries}
          onClose={() => setShowBulkQrModal(false)}
        />
      )}
    </div>
  );
}
