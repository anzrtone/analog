// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { estimate1rm } from '../math/e1rm';
import { formatClock, formatSet, formatWeight } from '../math/units';
import { setTypeInfo } from '../setTypes';
import type { LoggedSet, Side, WeightUnit } from '../types';

export type PrKind = 'weight' | 'reps' | 'e1rm' | 'volume' | 'hold';

export interface PrRecord {
  kind: PrKind;
  exerciseId: string;
  setId: string;
  value: number;
  previous: number | null;
  /** For rep PRs and holds: the load it was done at. */
  atWeightG?: number | null;
  side?: Side | null;
  message: string;
}

function eligible(s: LoggedSet): boolean {
  return s.completedAt != null && setTypeInfo(s.type).prEligible;
}

function e1rmOf(s: LoggedSet): number {
  if (!s.weightG || !s.reps) return 0;
  return estimate1rm(s.weightG, s.reps, s.rir ?? (s.rpe != null ? 10 - s.rpe : null)).e1rm;
}

function setVolume(s: LoggedSet): number {
  return (s.weightG ?? 0) * (s.reps ?? 0);
}

/**
 * PRs set by `current` (one workout's sets for one exercise) against everything before it.
 * Only the best of each kind in the session is reported, so three heavier sets give one weight PR.
 * A first-ever session sets no PRs: there is nothing to beat yet.
 */
export function detectPrs(history: LoggedSet[], current: LoggedSet[], unit: WeightUnit): PrRecord[] {
  const prior = history.filter(eligible);
  const now = current.filter(eligible);
  if (prior.length === 0 || now.length === 0) return [];
  const exerciseId = now[0]!.exerciseId;
  const out: PrRecord[] = [];
  const u = (g: number) => `${formatWeight(g, unit)} ${unit}`;

  const weighted = (list: LoggedSet[]) => list.filter((s) => (s.weightG ?? 0) > 0 && (s.reps ?? 0) > 0);
  const pw = weighted(prior);
  const nw = weighted(now);

  // Heaviest weight lifted for at least one rep.
  if (pw.length && nw.length) {
    const prev = Math.max(...pw.map((s) => s.weightG!));
    const best = maxBy(nw, (s) => s.weightG!);
    if (best.weightG! > prev) {
      out.push({ kind: 'weight', exerciseId, setId: best.id, value: best.weightG!, previous: prev, message: `New PR: ${u(best.weightG!)} (prev ${u(prev)})` });
    }

    // Most reps at this weight or heavier.
    let repPr: PrRecord | null = null;
    for (const s of nw) {
      const prevReps = Math.max(0, ...pw.filter((p) => p.weightG! >= s.weightG!).map((p) => p.reps!));
      if (prevReps > 0 && s.reps! > prevReps && (!repPr || s.weightG! > (repPr.atWeightG ?? 0))) {
        repPr = {
          kind: 'reps',
          exerciseId,
          setId: s.id,
          value: s.reps!,
          previous: prevReps,
          atWeightG: s.weightG,
          message: `New PR: ${formatSet(s.weightG, s.reps, unit)} (prev ${formatSet(s.weightG, prevReps, unit)})`,
        };
      }
    }
    if (repPr) out.push(repPr);

    const prevE = Math.max(...pw.map(e1rmOf));
    const bestE = maxBy(nw, e1rmOf);
    if (e1rmOf(bestE) > prevE * 1.0001) {
      // Estimates read to the nearest 0.5 kg / 1 lb; more decimals would claim precision they don't have.
      const r = (g: number) => (unit === 'kg' ? Math.round(g / 500) * 500 : Math.round(g / 453.59237) * 453.59237);
      out.push({ kind: 'e1rm', exerciseId, setId: bestE.id, value: e1rmOf(bestE), previous: prevE, message: `New e1RM: ${u(r(e1rmOf(bestE)))} (prev ${u(r(prevE))})` });
    }

    const prevV = Math.max(...pw.map(setVolume));
    const bestV = maxBy(nw, setVolume);
    if (setVolume(bestV) > prevV) {
      out.push({ kind: 'volume', exerciseId, setId: bestV.id, value: setVolume(bestV), previous: prevV, message: `Best set volume: ${formatSet(bestV.weightG, bestV.reps, unit)}` });
    }
  }

  // Longest hold, compared per side and at the same or heavier load.
  const timed = (list: LoggedSet[]) => list.filter((s) => (s.timeMs ?? 0) > 0);
  const pt = timed(prior);
  for (const side of [null, 'L', 'R'] as const) {
    const ns = timed(now).filter((s) => s.side === side);
    if (!ns.length) continue;
    const best = maxBy(ns, (s) => s.timeMs!);
    const load = best.weightG ?? 0;
    const comparable = pt.filter((p) => p.side === side && (p.weightG ?? 0) >= load);
    if (!comparable.length) continue;
    const prev = Math.max(...comparable.map((p) => p.timeMs!));
    if (best.timeMs! > prev) {
      const sideText = side ? ` (${side})` : '';
      out.push({ kind: 'hold', exerciseId, setId: best.id, value: best.timeMs!, previous: prev, atWeightG: best.weightG, side, message: `Longest hold${sideText}: ${formatClock(best.timeMs!)} (prev ${formatClock(prev)})` });
    }
  }
  return out;
}

function maxBy<T>(list: T[], f: (t: T) => number): T {
  let best = list[0]!;
  for (const x of list) if (f(x) > f(best)) best = x as NonNullable<T>;
  return best;
}

/** Best weight for each rep count 1–20 (a set of 8 also counts for 1–7). */
export function repMaxTable(sets: LoggedSet[]): (number | null)[] {
  const table: (number | null)[] = new Array(20).fill(null);
  for (const s of sets) {
    if (!eligible(s) || !s.weightG || !s.reps) continue;
    for (let r = 1; r <= Math.min(20, s.reps); r++) {
      if ((table[r - 1] ?? 0) < s.weightG) table[r - 1] = s.weightG;
    }
  }
  return table;
}
