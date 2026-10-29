// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import type { Equipment, WeightUnit } from '../types';
import { formatWeight } from './units';

export interface PlateStock {
  weightG: number;
  /** Total plates owned (both sides). */
  count: number;
}

export interface GymProfile {
  id: string;
  name: string;
  unit: WeightUnit;
  barG: number;
  plates: PlateStock[];
  /** Every dumbbell weight available, grams. */
  dumbbellsG: number[];
  kettlebellsG: number[];
  /** Machine and cable stack step, grams. */
  machineStepG: number;
}

export type RoundMode = 'nearest' | 'down' | 'up';

export const DEFAULT_KG_GYM: GymProfile = {
  id: 'default',
  name: 'My gym',
  unit: 'kg',
  barG: 20000,
  plates: [25000, 20000, 15000, 10000, 5000, 2500, 1250].map((w) => ({ weightG: w, count: w >= 5000 ? 8 : 4 })),
  dumbbellsG: [...range(2000, 10000, 1000), ...range(12500, 50000, 2500)],
  kettlebellsG: [8000, 12000, 16000, 20000, 24000, 28000, 32000],
  machineStepG: 5000,
};

export const DEFAULT_LB_GYM: GymProfile = {
  id: 'default-lb',
  name: 'My gym (lb)',
  unit: 'lb',
  barG: 20412, // 45 lb
  plates: [45, 35, 25, 10, 5, 2.5].map((lb) => ({ weightG: Math.round(lb * 453.59237), count: lb >= 10 ? 8 : 4 })),
  dumbbellsG: range(5, 120, 5).map((lb) => Math.round(lb * 453.59237)),
  kettlebellsG: [18, 26, 35, 44, 53, 62, 70].map((lb) => Math.round(lb * 453.59237)),
  machineStepG: Math.round(10 * 453.59237),
};

function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let v = from; v <= to; v += step) out.push(v);
  return out;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function heavierFirst(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return false;
}

interface SideTable {
  unit: number;
  /** lists[i] = fewest plates (heaviest first) making i·unit per side, or null if impossible. */
  lists: (number[] | null)[];
}

const tableCache = new Map<string, SideTable>();

/** Every per-side load you can build from the stock, with the fewest plates for each. */
function sideTable(plates: PlateStock[]): SideTable {
  const key = plates.map((p) => `${p.weightG}x${p.count}`).join(',');
  const cached = tableCache.get(key);
  if (cached) return cached;

  const items: number[] = [];
  for (const p of [...plates].sort((a, b) => b.weightG - a.weightG)) {
    for (let i = 0; i < Math.floor(p.count / 2); i++) items.push(p.weightG);
  }
  const unit = items.reduce((g, w) => gcd(g, w), 0) || 1;
  const cap = items.reduce((s, w) => s + w / unit, 0);
  // 0/1 knapsack over individual plates, heaviest first, keeping the fewest plates per sum.
  // On a tie in plate count, prefer the combination with heavier plates first (25 + 15 over 20 + 20).
  const lists: (number[] | null)[] = new Array(cap + 1).fill(null);
  lists[0] = [];
  for (const w of items) {
    const u = w / unit;
    for (let s = cap; s >= u; s--) {
      const prev = lists[s - u];
      if (prev == null) continue;
      const cur = lists[s];
      const cand = [...prev, w].sort((a, b) => b - a);
      if (cur == null || cand.length < cur.length || (cand.length === cur.length && heavierFirst(cand, cur))) lists[s] = cand;
    }
  }
  const table: SideTable = { unit, lists };
  tableCache.set(key, table);
  return table;
}

export interface BarLoad {
  totalG: number;
  /** Plates for one side, heaviest first. */
  perSide: number[];
  diffG: number;
  explanation: string;
}

/** Closest loadable barbell weight to `targetG`, and the plates per side. */
export function loadBarbell(targetG: number, barG: number, plates: PlateStock[], mode: RoundMode = 'nearest', unit: WeightUnit = 'kg'): BarLoad {
  if (targetG <= barG) {
    return { totalG: barG, perSide: [], diffG: barG - targetG, explanation: `Empty bar (${formatWeight(barG, unit)} ${unit}).` };
  }
  const t = sideTable(plates);
  const wantSide = (targetG - barG) / 2;
  let best = -1;
  let bestDist = Infinity;
  for (let s = 0; s < t.lists.length; s++) {
    if (t.lists[s] == null) continue;
    const side = s * t.unit;
    if (mode === 'down' && side > wantSide) continue;
    if (mode === 'up' && side < wantSide) continue;
    const d = Math.abs(side - wantSide);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  if (best < 0) {
    // Asked to round up past everything you own: load the most you can.
    best = 0;
    if (mode === 'up') for (let s = t.lists.length - 1; s >= 0; s--) if (t.lists[s] != null) { best = s; break; }
  }
  const perSide = [...(t.lists[best] ?? [])].sort((a, b) => b - a);
  const totalG = barG + 2 * best * t.unit;
  const diffG = totalG - targetG;
  const plateText = perSide.length ? perSide.map((p) => formatWeight(p, unit)).join(' + ') : 'no plates';
  const note = diffG === 0 ? '' : ` (${diffG > 0 ? '+' : '−'}${formatWeight(Math.abs(diffG), unit)} ${unit} from target: closest you can load)`;
  return { totalG, perSide, diffG, explanation: `Each side: ${plateText}${note}.` };
}

/**
 * Closest loadable weight on a dip belt: plates hang from a chain, so any subset of your stock works
 * (no pairing, no bar). The belt itself is counted as zero. `perSide` holds all the plates, heaviest first.
 */
export function loadDipBelt(targetG: number, plates: PlateStock[], mode: RoundMode = 'nearest', unit: WeightUnit = 'kg'): BarLoad {
  // sideTable pairs plates, so doubling every count makes each plate individually available.
  const t = sideTable(plates.map((p) => ({ ...p, count: p.count * 2 })));
  let best = 0;
  let bestDist = Infinity;
  for (let s = 0; s < t.lists.length; s++) {
    if (t.lists[s] == null) continue;
    const w = s * t.unit;
    if (mode === 'down' && w > targetG) continue;
    if (mode === 'up' && w < targetG) continue;
    const d = Math.abs(w - targetG);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  if (bestDist === Infinity && mode === 'up') for (let s = t.lists.length - 1; s >= 0; s--) if (t.lists[s] != null) { best = s; break; }
  const onBelt = [...(t.lists[best] ?? [])].sort((a, b) => b - a);
  const totalG = best * t.unit;
  const diffG = totalG - targetG;
  const plateText = onBelt.length ? onBelt.map((p) => formatWeight(p, unit)).join(' + ') : 'no plates';
  const note = diffG === 0 ? '' : ` (${diffG > 0 ? '+' : '−'}${formatWeight(Math.abs(diffG), unit)} ${unit} from target: closest you can load)`;
  return { totalG, perSide: onBelt, diffG, explanation: `On the belt: ${plateText}${note}.` };
}

function closestIn(list: number[], targetG: number, mode: RoundMode): number | null {
  let best: number | null = null;
  for (const w of list) {
    if (mode === 'down' && w > targetG) continue;
    if (mode === 'up' && w < targetG) continue;
    if (best == null || Math.abs(w - targetG) < Math.abs(best - targetG)) best = w;
  }
  return best;
}

function stepRound(targetG: number, stepG: number, mode: RoundMode): number {
  const f = mode === 'down' ? Math.floor : mode === 'up' ? Math.ceil : Math.round;
  return f(targetG / stepG) * stepG;
}

/** Round a target load to what this gym can actually give you for that equipment. */
export function roundToGym(targetG: number, equipment: Equipment, gym: GymProfile, mode: RoundMode = 'nearest', incrementG?: number): number {
  if (targetG <= 0) return 0;
  switch (equipment) {
    case 'barbell':
    case 'ezBar':
    case 'smith':
      return loadBarbell(targetG, gym.barG, gym.plates, mode, gym.unit).totalG;
    case 'dipBelt':
      return loadDipBelt(targetG, gym.plates, mode, gym.unit).totalG;
    case 'dumbbell':
      return closestIn(gym.dumbbellsG, targetG, mode) ?? stepRound(targetG, incrementG ?? 2500, mode);
    case 'kettlebell':
      return closestIn(gym.kettlebellsG, targetG, mode) ?? stepRound(targetG, incrementG ?? 4000, mode);
    case 'machine':
    case 'cable':
      return stepRound(targetG, incrementG ?? gym.machineStepG, mode);
    default:
      return stepRound(targetG, incrementG ?? 1250, mode);
  }
}
