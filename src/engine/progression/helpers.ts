// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { formatSet, formatWeight } from '../math/units';
import { setTypeInfo } from '../setTypes';
import type { EngineSettings, PerformedSet, SessionResult, SetTarget } from './types';

export function lastSession(history: SessionResult[]): SessionResult | null {
  return history.length ? history[history.length - 1]! : null;
}

/** Sets that count for progression: completed, not warm-ups or feeders. */
export function workSets(s: SessionResult | null): PerformedSet[] {
  if (!s) return [];
  return s.sets.filter((x) => setTypeInfo(x.type).volumeCredit > 0);
}

export function kg(g: number, settings: EngineSettings): string {
  return `${formatWeight(g, settings.unit)} ${settings.unit}`;
}

export function setText(sets: PerformedSet[], settings: EngineSettings): string {
  if (!sets.length) return 'nothing logged';
  const w = sets[0]!.weightG;
  const reps = sets.map((s) => s.reps ?? 0);
  const same = sets.every((s) => s.weightG === w);
  if (same && reps.every((r) => r === reps[0])) return `${sets.length} × ${reps[0]} at ${kg(w ?? 0, settings)}`;
  return sets.map((s) => formatSet(s.weightG, s.reps, settings.unit)).join(', ');
}

/** Apply the weekly jump cap, then round to plates. */
export function capAndRound(next: number, prev: number | null, settings: EngineSettings): number {
  let v = next;
  if (prev != null && prev > 0 && settings.maxJumpPct > 0) {
    const cap = prev * (1 + settings.maxJumpPct);
    if (v > cap) v = Math.floor(cap);
  }
  return settings.round(v);
}

export function repeat(n: number, t: SetTarget): SetTarget[] {
  return Array.from({ length: Math.max(0, n) }, () => ({ ...t }));
}

export function rirText(rir: number | null): string {
  return rir == null ? '' : ` at ${rir} RIR`;
}

export function heaviest(sets: PerformedSet[]): number | null {
  const ws = sets.map((s) => s.weightG ?? 0).filter((w) => w > 0);
  return ws.length ? Math.max(...ws) : null;
}
