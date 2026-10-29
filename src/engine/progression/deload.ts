// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { estimate1rm } from '../math/e1rm';
import { workSets } from './helpers';
import type { EngineSettings, SessionResult, SetTarget } from './types';

export type DeloadStyle = 'volume' | 'intensity' | 'both';

export interface DeloadResult {
  targets: SetTarget[];
  explanation: string;
}

/**
 * Default (volume): half the sets (rounded up), same weights, RIR 4+.
 * Intensity: same sets, −`intensityPct` load, RIR +3. Both: both.
 */
export function applyDeload(targets: SetTarget[], style: DeloadStyle, settings: EngineSettings, intensityPct = 0.1): DeloadResult {
  const work = targets.filter((t) => t.type !== 'warmup' && t.type !== 'feeder');
  const keep = style === 'intensity' ? work.length : Math.max(1, Math.ceil(work.length / 2));
  const lighter = style !== 'volume';
  const out = work.slice(0, keep).map((t) => ({
    ...t,
    type: t.type === 'amrap' || t.type === 'failure' || t.type === 'amtap' ? ('working' as const) : t.type,
    weightG: lighter && t.weightG ? settings.round(t.weightG * (1 - intensityPct)) : t.weightG,
    rir: style === 'volume' ? Math.max(4, t.rir ?? 4) : (t.rir ?? 1) + 3,
  }));
  const explanation =
    style === 'volume'
      ? 'Deload week. Half the sets, same weights. You’ve earned it.'
      : style === 'intensity'
        ? `Deload week. Same sets, ${Math.round(intensityPct * 100)}% lighter, 3 more reps in reserve.`
        : `Deload week. Half the sets, ${Math.round(intensityPct * 100)}% lighter.`;
  return { targets: out, explanation };
}

/** Reactive deload: e1RM down by `pct` or more for two sessions in a row vs the best before them. */
export function performanceDrop(history: SessionResult[], pct = 0.05): { triggered: boolean; explanation: string | null } {
  const best = (s: SessionResult) =>
    Math.max(0, ...workSets(s).filter((x) => x.weightG && x.reps).map((x) => estimate1rm(x.weightG!, x.reps!, x.rir).e1rm));
  if (history.length < 3) return { triggered: false, explanation: null };
  const recent = history.slice(-2).map(best);
  const before = Math.max(...history.slice(0, -2).map(best));
  if (before <= 0) return { triggered: false, explanation: null };
  const dropped = recent.every((r) => r > 0 && r <= before * (1 - pct));
  return dropped
    ? { triggered: true, explanation: `Estimated max down ${Math.round((1 - Math.max(...recent) / before) * 100)}% for two sessions. Time for a lighter week.` }
    : { triggered: false, explanation: null };
}
