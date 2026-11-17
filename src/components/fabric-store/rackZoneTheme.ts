import { FabricDelivery, FabricRack, FabricReceiving } from '../../firebase';

export const SHARED_APP_ORIGIN =
  'https://ais-pre-tndtvyuyik5ikp2tkbcsep-987702153681.asia-southeast1.run.app';

export interface ZoneColorPalette {
  id: string;
  shortLabel: string;
  headerBg: string;
  headerText: string;
  headerSubtext: string;
  headerBorder: string;
  cardBorder: string;
  cardHoverBorder: string;
  surfaceBg: string;
  surfaceBorder: string;
  accentText: string;
  progressBg: string;
  dotBg: string;
  hexPrimary: string;
  hexLight: string;
  hexBorder: string;
}

const ZONE_PALETTES: ZoneColorPalette[] = [
  {
    id: 'teal',
    shortLabel: 'Zone A',
    headerBg: 'bg-teal-800',
    headerText: 'text-white',
    headerSubtext: 'text-teal-100',
    headerBorder: 'border-teal-900',
    cardBorder: 'border-teal-300',
    cardHoverBorder: 'hover:border-teal-700',
    surfaceBg: 'bg-teal-50/70',
    surfaceBorder: 'border-teal-200',
    accentText: 'text-teal-800',
    progressBg: 'bg-teal-600',
    dotBg: 'bg-teal-500',
    hexPrimary: '#115e59',
    hexLight: '#f0fdfa',
    hexBorder: '#5eead4',
  },
  {
    id: 'indigo',
    shortLabel: 'Zone B',
    headerBg: 'bg-indigo-800',
    headerText: 'text-white',
    headerSubtext: 'text-indigo-100',
    headerBorder: 'border-indigo-900',
    cardBorder: 'border-indigo-300',
    cardHoverBorder: 'hover:border-indigo-700',
    surfaceBg: 'bg-indigo-50/70',
    surfaceBorder: 'border-indigo-200',
    accentText: 'text-indigo-800',
    progressBg: 'bg-indigo-600',
    dotBg: 'bg-indigo-500',
    hexPrimary: '#3730a3',
    hexLight: '#eef2ff',
    hexBorder: '#a5b4fc',
  },
  {
    id: 'amber',
    shortLabel: 'Zone C',
    headerBg: 'bg-amber-700',
    headerText: 'text-white',
    headerSubtext: 'text-amber-100',
    headerBorder: 'border-amber-800',
    cardBorder: 'border-amber-300',
    cardHoverBorder: 'hover:border-amber-700',
    surfaceBg: 'bg-amber-50/70',
    surfaceBorder: 'border-amber-200',
    accentText: 'text-amber-900',
    progressBg: 'bg-amber-600',
    dotBg: 'bg-amber-500',
    hexPrimary: '#b45309',
    hexLight: '#fffbeb',
    hexBorder: '#fcd34d',
  },
  {
    id: 'violet',
    shortLabel: 'Zone D',
    headerBg: 'bg-violet-800',
    headerText: 'text-white',
    headerSubtext: 'text-violet-100',
    headerBorder: 'border-violet-900',
    cardBorder: 'border-violet-300',
    cardHoverBorder: 'hover:border-violet-700',
    surfaceBg: 'bg-violet-50/70',
    surfaceBorder: 'border-violet-200',
    accentText: 'text-violet-800',
    progressBg: 'bg-violet-600',
    dotBg: 'bg-violet-500',
    hexPrimary: '#5b21b6',
    hexLight: '#f5f3ff',
    hexBorder: '#c4b5fd',
  },
  {
    id: 'sky',
    shortLabel: 'Zone E',
    headerBg: 'bg-sky-800',
    headerText: 'text-white',
    headerSubtext: 'text-sky-100',
    headerBorder: 'border-sky-900',
    cardBorder: 'border-sky-300',
    cardHoverBorder: 'hover:border-sky-700',
    surfaceBg: 'bg-sky-50/70',
    surfaceBorder: 'border-sky-200',
    accentText: 'text-sky-800',
    progressBg: 'bg-sky-600',
    dotBg: 'bg-sky-500',
    hexPrimary: '#075985',
    hexLight: '#f0f9ff',
    hexBorder: '#7dd3fc',
  },
  {
    id: 'rose',
    shortLabel: 'Zone F',
    headerBg: 'bg-rose-800',
    headerText: 'text-white',
    headerSubtext: 'text-rose-100',
    headerBorder: 'border-rose-900',
    cardBorder: 'border-rose-300',
    cardHoverBorder: 'hover:border-rose-700',
    surfaceBg: 'bg-rose-50/70',
    surfaceBorder: 'border-rose-200',
    accentText: 'text-rose-800',
    progressBg: 'bg-rose-600',
    dotBg: 'bg-rose-500',
    hexPrimary: '#9f1239',
    hexLight: '#fff1f2',
    hexBorder: '#fda4af',
  },
];

export function getZoneColorPalette(zoneName: string, zoneIndexHint?: number): ZoneColorPalette {
  const z = (zoneName || '').trim().toLowerCase();
  if (z.startsWith('zone a') || z.includes('knit jersey') || z.includes('zone-a')) {
    return ZONE_PALETTES[0];
  }
  if (z.startsWith('zone b') || z.includes('fleece') || z.includes('zone-b')) {
    return ZONE_PALETTES[1];
  }
  if (z.startsWith('zone c') || z.includes('inspection') || z.includes('fast track') || z.includes('zone-c')) {
    return ZONE_PALETTES[2];
  }
  if (z.startsWith('zone d') || z.includes('woven') || z.includes('zone-d')) {
    return ZONE_PALETTES[3];
  }
  if (z.startsWith('zone e') || z.includes('zone-e')) {
    return ZONE_PALETTES[4];
  }
  if (z.startsWith('zone f') || z.includes('zone-f')) {
    return ZONE_PALETTES[5];
  }
  if (typeof zoneIndexHint === 'number' && zoneIndexHint >= 0) {
    return ZONE_PALETTES[zoneIndexHint % ZONE_PALETTES.length];
  }
  // Deterministic hash fallback
  let hash = 0;
  for (let i = 0; i < z.length; i++) {
    hash = (hash * 31 + z.charCodeAt(i)) >>> 0;
  }
  return ZONE_PALETTES[hash % ZONE_PALETTES.length];
}

/**
 * Generates the FIXED QR URL for a rack.
 * Defaults to the permanent Shared App URL so physical printed rack stickers never break.
 */
export function getFixedRackQrUrl(rackCode: string, useCurrentOrigin = false): string {
  const cleanCode = rackCode.trim().toUpperCase();
  let origin = SHARED_APP_ORIGIN;
  if (useCurrentOrigin && typeof window !== 'undefined' && window.location?.origin) {
    origin = window.location.origin;
  } else if (
    typeof window !== 'undefined' &&
    window.location?.hostname &&
    !window.location.hostname.includes('ais-dev-') &&
    !window.location.hostname.includes('localhost') &&
    !window.location.hostname.includes('127.0.0.1')
  ) {
    origin = window.location.origin;
  }
  return `${origin.replace(/\/$/, '')}/?rack=${encodeURIComponent(cleanCode)}`;
}

export interface EnrichedReceivingLot extends FabricReceiving {
  deliveredKg: number;
  availableKg: number;
  availableRolls: number;
  deliveryCount: number;
  status: 'Available' | 'Partial' | 'Exhausted';
}

export interface RackSummaryItem {
  rack: FabricRack;
  rackBatches: EnrichedReceivingLot[];
  activeBatches: EnrichedReceivingLot[];
  receivedKg: number;
  deliveredKg: number;
  currentKg: number;
  freeCapacityKg: number;
  totalRolls: number;
  buyers: string[];
  pos: string[];
  utilizationPct: number;
}

export function computeEnrichedReceivings(
  receivings: FabricReceiving[],
  deliveries: FabricDelivery[]
): EnrichedReceivingLot[] {
  const deliveredMap = new Map<string, { deliveredKg: number; deliveredRolls: number; count: number }>();
  deliveries.forEach((d) => {
    const prev = deliveredMap.get(d.receivingId) || { deliveredKg: 0, deliveredRolls: 0, count: 0 };
    prev.deliveredKg += Number(d.weightKg) || 0;
    prev.deliveredRolls += Number(d.rollCount) || 0;
    prev.count += 1;
    deliveredMap.set(d.receivingId, prev);
  });

  return receivings.map((rec) => {
    const del = deliveredMap.get(rec.id) || { deliveredKg: 0, deliveredRolls: 0, count: 0 };
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
}

export function computeRackSummaries(
  racks: FabricRack[],
  enrichedReceivings: EnrichedReceivingLot[]
): RackSummaryItem[] {
  return racks.map((rack) => {
    const rackBatches = enrichedReceivings.filter(
      (r) => r.rackId === rack.id || r.rackCode.toUpperCase() === rack.code.toUpperCase()
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
}

export const formatKg = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
