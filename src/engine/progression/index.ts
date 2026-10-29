// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { double, linear, manual, meso, rpe, time, tm, topBackoff, triple } from './rules';
import type { RuleInput, RuleOutput, RuleParams, RuleType } from './types';

export * from './types';
export { applyDeload, performanceDrop, type DeloadStyle } from './deload';

/** Runs whichever rule the slot uses. */
export function nextTargets(input: RuleInput): RuleOutput {
  const p = input.params;
  switch (p.type) {
    case 'linear':
      return linear({ ...input, params: p });
    case 'double':
      return double({ ...input, params: p });
    case 'triple':
      return triple({ ...input, params: p });
    case 'rpe':
      return rpe({ ...input, params: p });
    case 'tm':
      return tm({ ...input, params: p });
    case 'time':
      return time({ ...input, params: p });
    case 'topBackoff':
      return topBackoff({ ...input, params: p });
    case 'meso':
      return meso({ ...input, params: p });
    case 'manual':
      return manual({ ...input, params: p });
  }
}

export const RULE_LABEL: Record<RuleType, string> = {
  linear: 'Linear',
  double: 'Double progression',
  triple: 'Triple progression',
  rpe: 'RIR / RPE based',
  tm: '% of training max',
  time: 'Time (holds)',
  topBackoff: 'Top set + back-offs',
  meso: 'Mesocycle (adaptive)',
  manual: 'Manual',
};

/** Sensible defaults when a rule is first attached to a slot. */
export function defaultParams(type: RuleType): RuleParams {
  switch (type) {
    case 'linear':
      return { type, sets: 3, reps: 5, rir: 2, failThreshold: 3, deloadPct: 0.1 };
    case 'double':
      return { type, sets: 3, repsMin: 8, repsMax: 12, rir: 2 };
    case 'triple':
      return { type, setsMin: 2, setsMax: 4, repsMin: 8, repsMax: 12, rir: 2 };
    case 'rpe':
      return { type, sets: 3, reps: 6, rir: 2, lookback: 2 };
    case 'tm':
      return {
        type,
        weeks: [
          [{ pct: 0.7, reps: 6 }, { pct: 0.75, reps: 6 }, { pct: 0.8, reps: 6, amrap: true }],
          [{ pct: 0.75, reps: 4 }, { pct: 0.8, reps: 4 }, { pct: 0.85, reps: 4, amrap: true }],
          [{ pct: 0.8, reps: 2 }, { pct: 0.85, reps: 2 }, { pct: 0.9, reps: 2, amrap: true }],
        ],
        tmIncrementG: 2500,
        amrapExtra: 2,
        dropPct: 0.1,
      };
    case 'time':
      return { type, sets: 3, timeMinMs: 30000, timeMaxMs: 60000, stepMs: 5000, loadStepG: 5000, ladder: [], failThreshold: 3 };
    case 'topBackoff':
      return { type, topReps: 5, topRir: 1, backoffSets: 3, backoffReps: 8, backoffPct: 0.12 };
    case 'meso':
      return { type, repsMin: 8, repsMax: 12 };
    case 'manual':
      return { type };
  }
}
