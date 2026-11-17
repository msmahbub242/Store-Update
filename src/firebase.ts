import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  getDocFromServer,
  collection,
  query,
  orderBy,
  limit,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase with the explicit database ID provisioned for this applet
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app, (firebaseConfig as { firestoreDatabaseId: string }).firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on startup
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    return true;
  }
}
testConnection();

const ALLOCATIONS_DOC_PATH = 'line_allocations';
const ALLOCATIONS_DOC_ID = 'current';

export const testFirestoreConnection = async (): Promise<boolean> => {
  try {
    const docRef = doc(db, ALLOCATIONS_DOC_PATH, ALLOCATIONS_DOC_ID);
    await getDocFromServer(docRef);
    return true;
  } catch (error: unknown) {
    console.warn('Firestore connection check:', error instanceof Error ? error.message : error);
    return false;
  }
};

export const saveLineAllocationsToFirestore = async (
  allocations: Record<string, string[]>,
  updatedBy: string = 'planner'
): Promise<void> => {
  const path = `${ALLOCATIONS_DOC_PATH}/${ALLOCATIONS_DOC_ID}`;
  try {
    const docRef = doc(db, ALLOCATIONS_DOC_PATH, ALLOCATIONS_DOC_ID);
    await setDoc(
      docRef,
      {
        allocations,
        updatedAt: new Date().toISOString(),
        updatedBy: String(updatedBy || 'planner').slice(0, 64),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const subscribeToLineAllocations = (
  onUpdate: (allocations: Record<string, string[]> | null, updatedAt?: string, updatedBy?: string) => void,
  onError?: (error: Error) => void
) => {
  const path = `${ALLOCATIONS_DOC_PATH}/${ALLOCATIONS_DOC_ID}`;
  const docRef = doc(db, ALLOCATIONS_DOC_PATH, ALLOCATIONS_DOC_ID);
  return onSnapshot(
    docRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && data.allocations) {
          onUpdate(data.allocations, data.updatedAt, data.updatedBy);
        } else {
          onUpdate(null);
        }
      } else {
        onUpdate(null);
      }
    },
    (err) => {
      console.warn('Firestore snapshot error for line allocations:', err);
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.GET, path);
    }
  );
};

export const fetchLineAllocationsFromFirestore = async (): Promise<Record<string, string[]> | null> => {
  const path = `${ALLOCATIONS_DOC_PATH}/${ALLOCATIONS_DOC_ID}`;
  try {
    const docRef = doc(db, ALLOCATIONS_DOC_PATH, ALLOCATIONS_DOC_ID);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return (data?.allocations as Record<string, string[]>) || null;
    }
    return null;
  } catch (error) {
    console.warn('Error fetching line allocations from Firestore:', error);
    return null;
  }
};

// ============================================================================
// FABRIC RECEIVING & SUPPLY MANAGEMENT FIRESTORE LAYER
// ============================================================================

export type FabricRole = 'master_admin' | 'store_manager' | 'receiver' | 'issuer' | 'viewer';

export interface FabricUser {
  id: string;
  username: string;
  fullName: string;
  passwordHash: string;
  role: FabricRole;
  isActive: boolean;
  department?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface FabricRack {
  id: string;
  code: string;
  zone: string;
  capacityKg: number;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FabricRequirement {
  id: string;
  buyer: string;
  po: string;
  style?: string;
  itemName?: string;
  fileNo?: string;
  shipDate?: string;
  orderDzn?: string;
  fabricType: string;
  color: string;
  gsm?: string;
  requiredQtyKg: number;
  supplier?: string;
  remark?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FabricReceiving {
  id: string;
  buyer: string;
  po: string;
  style?: string;
  itemName?: string;
  fileNo?: string;
  shipDate?: string;
  orderDzn?: string;
  requirementId?: string;
  requiredQtyKg?: number;
  challanGroupId?: string;
  rackId: string;
  rackCode: string;
  fabricType: string;
  color: string;
  gsm?: string;
  weightKg: number;
  rollCount?: number;
  lotNo: string;
  challanNo: string;
  receiveDate: string;
  supplier: string;
  remark?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FabricDelivery {
  id: string;
  receivingId: string;
  supplyNo: string;
  buyer: string;
  po: string;
  style?: string;
  itemName?: string;
  fileNo?: string;
  shipDate?: string;
  rackCode?: string;
  fabricType?: string;
  color?: string;
  gsm?: string;
  lotNo?: string;
  deliveryType: 'Full' | 'Partial';
  weightKg: number;
  rollCount?: number;
  issuedTo: string;
  receiverName?: string;
  deliveryDate: string;
  remark?: string;
  createdBy: string;
  createdAt: string;
}

export interface FabricAuditLog {
  id: string;
  action: string;
  module: string;
  details: string;
  actorUsername: string;
  actorRole: string;
  createdAt: string;
}

const cleanStr = (val: unknown, maxLen: number): string =>
  String(val ?? '').trim().slice(0, maxLen);

export const makeDocId = (prefix: string): string => {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
};

export async function hashPassword(password: string): Promise<string> {
  const normalized = `felix_fabric_v1:${password}`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(normalized);
    const buf = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback deterministic hash if SubtleCrypto is unavailable
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}${(h1 ^ h2 >>> 0).toString(16).padStart(8, '0')}`;
}

const DEFAULT_RACKS: Array<{ id: string; code: string; zone: string; capacityKg: number; description: string }> = [
  { id: 'rack_A01', code: 'A-01', zone: 'Zone A (Knit Jersey)', capacityKg: 2500, description: 'Single Jersey & Cotton Knit Bay 1' },
  { id: 'rack_A02', code: 'A-02', zone: 'Zone A (Knit Jersey)', capacityKg: 2500, description: 'Single Jersey & Cotton Knit Bay 2' },
  { id: 'rack_A03', code: 'A-03', zone: 'Zone A (Knit Jersey)', capacityKg: 2500, description: 'Rib & Interlock Bay 3' },
  { id: 'rack_A04', code: 'A-04', zone: 'Zone A (Knit Jersey)', capacityKg: 2500, description: 'Pique & Elastane Knit Bay 4' },
  { id: 'rack_B01', code: 'B-01', zone: 'Zone B (Fleece & Heavy)', capacityKg: 3000, description: 'Fleece & French Terry Bay 1' },
  { id: 'rack_B02', code: 'B-02', zone: 'Zone B (Fleece & Heavy)', capacityKg: 3000, description: 'Fleece & French Terry Bay 2' },
  { id: 'rack_B03', code: 'B-03', zone: 'Zone B (Fleece & Heavy)', capacityKg: 3000, description: 'Heavyweight & Hoodies Bay 3' },
  { id: 'rack_B04', code: 'B-04', zone: 'Zone B (Fleece & Heavy)', capacityKg: 3000, description: 'AOP & Dyed Lot Reserve Bay 4' },
  { id: 'rack_C01', code: 'C-01', zone: 'Zone C (Inspection & Fast Track)', capacityKg: 2000, description: 'Fast Track Cutting Ready Bay 1' },
  { id: 'rack_C02', code: 'C-02', zone: 'Zone C (Inspection & Fast Track)', capacityKg: 2000, description: 'Hold / QC Inspection Bay 2' },
];

export async function bootstrapFabricStoreDefaults(): Promise<void> {
  try {
    const now = new Date().toISOString();
    // 1. Seed default Master Admin if no users exist yet
    const usersSnap = await getDocs(query(collection(db, 'fabric_users'), limit(1)));
    if (usersSnap.empty) {
      const defaultAdminHash = await hashPassword('felix123');
      await setDoc(doc(db, 'fabric_users', 'user_admin'), {
        username: 'admin',
        fullName: 'Md Mahbubur Rahman (Master Admin)',
        passwordHash: defaultAdminHash,
        role: 'master_admin',
        isActive: true,
        department: 'Store Department',
        createdAt: now,
        updatedAt: now,
        createdBy: 'system',
      });
    }

    // 2. Seed default racks if no racks exist yet
    const racksSnap = await getDocs(query(collection(db, 'fabric_racks'), limit(1)));
    if (racksSnap.empty) {
      await Promise.all(
        DEFAULT_RACKS.map((rack) =>
          setDoc(doc(db, 'fabric_racks', rack.id), {
            code: rack.code,
            zone: rack.zone,
            capacityKg: rack.capacityKg,
            description: rack.description,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          })
        )
      );
    }
  } catch (err) {
    console.warn('Bootstrap notice:', err);
  }
}

// Subscriptions
export function subscribeToFabricUsers(
  onUpdate: (users: FabricUser[]) => void,
  onError?: (err: Error) => void
) {
  const path = 'fabric_users';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list: FabricUser[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<FabricUser, 'id'>),
      }));
      list.sort((a, b) => a.username.localeCompare(b.username));
      onUpdate(list);
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export function subscribeToFabricRacks(
  onUpdate: (racks: FabricRack[]) => void,
  onError?: (err: Error) => void
) {
  const path = 'fabric_racks';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list: FabricRack[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<FabricRack, 'id'>),
      }));
      list.sort((a, b) => a.code.localeCompare(b.code));
      onUpdate(list);
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export function subscribeToFabricRequirements(
  onUpdate: (rows: FabricRequirement[]) => void,
  onError?: (err: Error) => void
) {
  const path = 'fabric_requirements';
  return onSnapshot(
    query(collection(db, path), orderBy('createdAt', 'desc')),
    (snapshot) => {
      const list: FabricRequirement[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<FabricRequirement, 'id'>),
      }));
      onUpdate(list);
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export function subscribeToFabricReceivings(
  onUpdate: (rows: FabricReceiving[]) => void,
  onError?: (err: Error) => void
) {
  const path = 'fabric_receivings';
  return onSnapshot(
    query(collection(db, path), orderBy('createdAt', 'desc')),
    (snapshot) => {
      const list: FabricReceiving[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<FabricReceiving, 'id'>),
      }));
      onUpdate(list);
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export function subscribeToFabricDeliveries(
  onUpdate: (rows: FabricDelivery[]) => void,
  onError?: (err: Error) => void
) {
  const path = 'fabric_deliveries';
  return onSnapshot(
    query(collection(db, path), orderBy('createdAt', 'desc')),
    (snapshot) => {
      const list: FabricDelivery[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<FabricDelivery, 'id'>),
      }));
      onUpdate(list);
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export function subscribeToFabricAuditLogs(
  onUpdate: (logs: FabricAuditLog[]) => void,
  onError?: (err: Error) => void
) {
  const path = 'fabric_audit_logs';
  return onSnapshot(
    query(collection(db, path), orderBy('createdAt', 'desc'), limit(100)),
    (snapshot) => {
      const list: FabricAuditLog[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<FabricAuditLog, 'id'>),
      }));
      onUpdate(list);
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

// Audit Logger
export async function logFabricAudit(params: {
  action: string;
  module: string;
  details: string;
  actorUsername: string;
  actorRole: string;
}): Promise<void> {
  const id = makeDocId('log');
  const path = `fabric_audit_logs/${id}`;
  try {
    await setDoc(doc(db, 'fabric_audit_logs', id), {
      action: cleanStr(params.action, 80) || 'Action',
      module: cleanStr(params.module, 60) || 'FabricStore',
      details: cleanStr(params.details, 500) || '-',
      actorUsername: cleanStr(params.actorUsername, 64) || 'system',
      actorRole: cleanStr(params.actorRole, 40) || 'viewer',
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('Audit log write warning:', error);
  }
}

// User CRUD
export async function createFabricUser(input: {
  username: string;
  fullName: string;
  password: string;
  role: FabricRole;
  department?: string;
  createdBy: string;
}): Promise<string> {
  const usernameClean = input.username.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  if (usernameClean.length < 2) throw new Error('Username must be at least 2 alphanumeric characters.');
  const id = `user_${usernameClean.replace(/\./g, '_')}`.slice(0, 64);
  const path = `fabric_users/${id}`;
  try {
    const existingSnap = await getDoc(doc(db, 'fabric_users', id));
    if (existingSnap.exists()) {
      throw new Error(`Username "${usernameClean}" already exists.`);
    }
    const now = new Date().toISOString();
    const passwordHash = await hashPassword(input.password);
    await setDoc(doc(db, 'fabric_users', id), {
      username: cleanStr(usernameClean, 40),
      fullName: cleanStr(input.fullName, 100),
      passwordHash,
      role: input.role,
      isActive: true,
      department: cleanStr(input.department || 'Fabric Store', 80),
      createdAt: now,
      updatedAt: now,
      createdBy: cleanStr(input.createdBy, 64),
    });
    return id;
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) throw error;
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateFabricUser(
  userId: string,
  updates: {
    fullName?: string;
    role?: FabricRole;
    isActive?: boolean;
    department?: string;
    newPassword?: string;
  },
  existingUser: FabricUser
): Promise<void> {
  const path = `fabric_users/${userId}`;
  try {
    const passwordHash =
      updates.newPassword && updates.newPassword.trim().length > 0
        ? await hashPassword(updates.newPassword.trim())
        : existingUser.passwordHash;
    await updateDoc(doc(db, 'fabric_users', userId), {
      username: existingUser.username,
      fullName: cleanStr(updates.fullName ?? existingUser.fullName, 100),
      passwordHash,
      role: updates.role ?? existingUser.role,
      isActive: updates.isActive ?? existingUser.isActive,
      department: cleanStr(updates.department ?? existingUser.department ?? 'Fabric Store', 80),
      createdAt: existingUser.createdAt,
      updatedAt: new Date().toISOString(),
      createdBy: cleanStr(existingUser.createdBy || 'admin', 64),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteFabricUser(userId: string): Promise<void> {
  const path = `fabric_users/${userId}`;
  try {
    await deleteDoc(doc(db, 'fabric_users', userId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Rack CRUD
export async function saveFabricRack(input: {
  id?: string;
  code: string;
  zone: string;
  capacityKg: number;
  description?: string;
  isActive?: boolean;
  createdAt?: string;
}): Promise<string> {
  const codeClean = cleanStr(input.code, 32).toUpperCase();
  const id = input.id || `rack_${codeClean.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now().toString().slice(-4)}`;
  const path = `fabric_racks/${id}`;
  const now = new Date().toISOString();
  try {
    await setDoc(doc(db, 'fabric_racks', id), {
      code: codeClean,
      zone: cleanStr(input.zone || 'Main Fabric Store', 64),
      capacityKg: Math.max(0, Math.min(10000000, Number(input.capacityKg) || 0)),
      description: cleanStr(input.description || '', 200),
      isActive: input.isActive ?? true,
      createdAt: input.createdAt || now,
      updatedAt: now,
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, input.id ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteFabricRack(rackId: string): Promise<void> {
  const path = `fabric_racks/${rackId}`;
  try {
    await deleteDoc(doc(db, 'fabric_racks', rackId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Requirement (Pre-Receiving PO Fabric Booking) CRUD
export async function createFabricRequirement(
  input: Omit<FabricRequirement, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const id = makeDocId('req');
  const path = `fabric_requirements/${id}`;
  const now = new Date().toISOString();
  try {
    await setDoc(doc(db, 'fabric_requirements', id), {
      buyer: cleanStr(input.buyer, 120),
      po: cleanStr(input.po, 100),
      style: cleanStr(input.style, 160),
      itemName: cleanStr(input.itemName, 200),
      fileNo: cleanStr(input.fileNo, 64),
      shipDate: cleanStr(input.shipDate, 64),
      orderDzn: cleanStr(input.orderDzn, 40),
      fabricType: cleanStr(input.fabricType, 120),
      color: cleanStr(input.color, 120),
      gsm: cleanStr(input.gsm, 40),
      requiredQtyKg: Math.max(0.01, Math.min(1000000, Number(input.requiredQtyKg))),
      supplier: cleanStr(input.supplier, 120),
      remark: cleanStr(input.remark, 400),
      createdBy: cleanStr(input.createdBy, 64),
      createdAt: now,
      updatedAt: now,
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateFabricRequirement(
  reqId: string,
  updates: {
    fabricType?: string;
    color?: string;
    gsm?: string;
    requiredQtyKg?: number;
    supplier?: string;
    remark?: string;
  },
  existingReq: FabricRequirement
): Promise<void> {
  const path = `fabric_requirements/${reqId}`;
  try {
    await updateDoc(doc(db, 'fabric_requirements', reqId), {
      buyer: existingReq.buyer,
      po: existingReq.po,
      style: cleanStr(existingReq.style, 160),
      itemName: cleanStr(existingReq.itemName, 200),
      fileNo: cleanStr(existingReq.fileNo, 64),
      shipDate: cleanStr(existingReq.shipDate, 64),
      orderDzn: cleanStr(existingReq.orderDzn, 40),
      fabricType: cleanStr(updates.fabricType ?? existingReq.fabricType, 120),
      color: cleanStr(updates.color ?? existingReq.color, 120),
      gsm: cleanStr(updates.gsm ?? existingReq.gsm, 40),
      requiredQtyKg: Math.max(0.01, Math.min(1000000, Number(updates.requiredQtyKg ?? existingReq.requiredQtyKg))),
      supplier: cleanStr(updates.supplier ?? existingReq.supplier, 120),
      remark: cleanStr(updates.remark ?? existingReq.remark, 400),
      createdBy: existingReq.createdBy,
      createdAt: existingReq.createdAt,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteFabricRequirement(reqId: string): Promise<void> {
  const path = `fabric_requirements/${reqId}`;
  try {
    await deleteDoc(doc(db, 'fabric_requirements', reqId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Receiving CRUD (Single & Multi-PO Challan Bulk Batch)
const buildReceivingPayload = (
  input: Omit<FabricReceiving, 'id' | 'createdAt' | 'updatedAt'>,
  now: string
) => ({
  buyer: cleanStr(input.buyer, 120),
  po: cleanStr(input.po, 100),
  style: cleanStr(input.style, 160),
  itemName: cleanStr(input.itemName, 200),
  fileNo: cleanStr(input.fileNo, 64),
  shipDate: cleanStr(input.shipDate, 64),
  orderDzn: cleanStr(input.orderDzn, 40),
  requirementId: cleanStr(input.requirementId, 128),
  requiredQtyKg: Math.max(0, Math.min(1000000, Number(input.requiredQtyKg) || 0)),
  challanGroupId: cleanStr(input.challanGroupId, 128),
  rackId: cleanStr(input.rackId, 64),
  rackCode: cleanStr(input.rackCode, 32),
  fabricType: cleanStr(input.fabricType, 120),
  color: cleanStr(input.color, 120),
  gsm: cleanStr(input.gsm, 40),
  weightKg: Math.max(0.01, Math.min(1000000, Number(input.weightKg))),
  rollCount: Math.max(0, Math.min(100000, Number(input.rollCount) || 0)),
  lotNo: cleanStr(input.lotNo, 80),
  challanNo: cleanStr(input.challanNo, 80),
  receiveDate: cleanStr(input.receiveDate, 32),
  supplier: cleanStr(input.supplier, 120),
  remark: cleanStr(input.remark, 400),
  createdBy: cleanStr(input.createdBy, 64),
  createdAt: now,
  updatedAt: now,
});

export async function createFabricReceiving(
  input: Omit<FabricReceiving, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const id = makeDocId('rec');
  const path = `fabric_receivings/${id}`;
  const now = new Date().toISOString();
  try {
    await setDoc(doc(db, 'fabric_receivings', id), buildReceivingPayload(input, now));
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function createFabricReceivingBatch(
  items: Array<Omit<FabricReceiving, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<string[]> {
  if (items.length === 0) return [];
  const path = 'fabric_receivings';
  try {
    const batch = writeBatch(db);
    const ids: string[] = [];
    const baseMs = Date.now();
    items.forEach((item, idx) => {
      const rand = Math.random().toString(36).slice(2, 8);
      const id = `rec_${baseMs}_${idx}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
      const now = new Date(baseMs + idx).toISOString();
      ids.push(id);
      batch.set(doc(db, 'fabric_receivings', id), buildReceivingPayload(item, now));
    });
    await batch.commit();
    return ids;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateFabricReceivingRack(
  receiving: FabricReceiving,
  newRackId: string,
  newRackCode: string
): Promise<void> {
  const path = `fabric_receivings/${receiving.id}`;
  try {
    await updateDoc(doc(db, 'fabric_receivings', receiving.id), {
      rackId: cleanStr(newRackId, 64),
      rackCode: cleanStr(newRackCode, 32),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function splitFabricReceivingToRack(
  receiving: FabricReceiving,
  splitWeightKg: number,
  targetRackId: string,
  targetRackCode: string,
  actorUsername: string
): Promise<void> {
  const path = `fabric_receivings/${receiving.id}`;
  const now = new Date().toISOString();
  const roundedSplit = Number(splitWeightKg.toFixed(2));
  const remainingOriginal = Number((receiving.weightKg - roundedSplit).toFixed(2));

  try {
    if (remainingOriginal <= 0.009) {
      await updateFabricReceivingRack(receiving, targetRackId, targetRackCode);
      return;
    }

    const batch = writeBatch(db);
    batch.update(doc(db, 'fabric_receivings', receiving.id), {
      weightKg: remainingOriginal,
      updatedAt: now,
    });

    const newId = makeDocId('rec_split');
    batch.set(
      doc(db, 'fabric_receivings', newId),
      buildReceivingPayload(
        {
          buyer: receiving.buyer,
          po: receiving.po,
          style: receiving.style || '',
          itemName: receiving.itemName || '',
          fileNo: receiving.fileNo || '',
          shipDate: receiving.shipDate || '',
          orderDzn: receiving.orderDzn || '',
          requirementId: receiving.requirementId || '',
          requiredQtyKg: receiving.requiredQtyKg || 0,
          challanGroupId: receiving.challanGroupId || '',
          rackId: targetRackId,
          rackCode: targetRackCode,
          fabricType: receiving.fabricType,
          color: receiving.color,
          gsm: receiving.gsm || '',
          weightKg: roundedSplit,
          rollCount: 0,
          lotNo: receiving.lotNo,
          challanNo: receiving.challanNo,
          receiveDate: receiving.receiveDate,
          supplier: receiving.supplier,
          remark: `${receiving.remark ? `${receiving.remark} | ` : ''}Shared from Rack ${receiving.rackCode} by @${actorUsername}`.slice(0, 400),
          createdBy: receiving.createdBy,
        },
        now
      )
    );
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteFabricReceiving(receivingId: string): Promise<void> {
  const path = `fabric_receivings/${receivingId}`;
  try {
    await deleteDoc(doc(db, 'fabric_receivings', receivingId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Delivery CRUD
export async function createFabricDelivery(
  input: Omit<FabricDelivery, 'id' | 'createdAt'>
): Promise<string> {
  const id = makeDocId('del');
  const path = `fabric_deliveries/${id}`;
  const now = new Date().toISOString();
  try {
    await setDoc(doc(db, 'fabric_deliveries', id), {
      receivingId: cleanStr(input.receivingId, 128),
      supplyNo: cleanStr(input.supplyNo, 80),
      buyer: cleanStr(input.buyer, 120),
      po: cleanStr(input.po, 100),
      style: cleanStr(input.style, 160),
      itemName: cleanStr(input.itemName, 200),
      fileNo: cleanStr(input.fileNo, 64),
      shipDate: cleanStr(input.shipDate, 64),
      rackCode: cleanStr(input.rackCode, 32),
      fabricType: cleanStr(input.fabricType, 120),
      color: cleanStr(input.color, 120),
      gsm: cleanStr(input.gsm, 40),
      lotNo: cleanStr(input.lotNo, 80),
      deliveryType: input.deliveryType === 'Full' ? 'Full' : 'Partial',
      weightKg: Math.max(0.01, Math.min(1000000, Number(input.weightKg))),
      rollCount: Math.max(0, Math.min(100000, Number(input.rollCount) || 0)),
      issuedTo: cleanStr(input.issuedTo, 100),
      receiverName: cleanStr(input.receiverName, 100),
      deliveryDate: cleanStr(input.deliveryDate, 32),
      remark: cleanStr(input.remark, 400),
      createdBy: cleanStr(input.createdBy, 64),
      createdAt: now,
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteFabricDelivery(deliveryId: string): Promise<void> {
  const path = `fabric_deliveries/${deliveryId}`;
  try {
    await deleteDoc(doc(db, 'fabric_deliveries', deliveryId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
