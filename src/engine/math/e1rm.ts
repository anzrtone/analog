// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
// Estimated one-rep max.
// Inside the common chart range (1–12 reps, RPE 6.5–10) we use the widely published RPE percentage chart.
// Outside it we fall back to Epley on reps + reps in reserve.

// Percent of 1RM indexed by half-RPE steps: index = 2·(reps−1) + 2·(10−RPE).
// Each row of the chart is the RPE-10 row shifted, so one sequence covers it.
const CHART = [
  100, 97.8, 95.5, 93.9, 92.2, 90.7, 89.2, 87.8, 86.3, 85.0, 83.7, 82.4, 81.1, 79.9, 78.6, 77.4, 76.2, 75.1, 73.9,
  72.3, 70.7, 69.4, 68.0, 66.7, 65.3, 64.0, 62.6, 61.3, 59.9, 58.6,
];

/** Fraction of 1RM a set of `reps` at `rpe` represents, or null outside the chart. */
export function chartPercent(reps: number, rpe: number): number | null {
  if (!Number.isInteger(reps) || reps < 1 || reps > 12) return null;
  if (rpe < 6.5 || rpe > 10 || (rpe * 2) % 1 !== 0) return null;
  const idx = 2 * (reps - 1) + Math.round(2 * (10 - rpe));
  const v = CHART[idx];
  return v == null ? null : v / 100;
}

export function epley(weight: number, reps: number): number {
  if (reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export interface E1rmResult {
  e1rm: number;
  method: 'chart' | 'epley' | 'single';
  explanation: string;
}

/**
 * e1RM from a set. `rir` defaults to 0 (failure) when unknown, which under-estimates rather than over-estimates.
 * Weights are in whatever unit you pass in; the result uses the same unit.
 */
export function estimate1rm(weight: number, reps: number, rir: number | null = null): E1rmResult {
  const r = rir ?? 0;
  if (reps <= 0 || weight <= 0) return { e1rm: 0, method: 'single', explanation: 'No reps, no estimate.' };
  if (reps === 1 && r === 0) return { e1rm: weight, method: 'single', explanation: 'A true single at 0 RIR is your 1RM.' };
  const pct = chartPercent(reps, 10 - r);
  if (pct != null) {
    return {
      e1rm: weight / pct,
      method: 'chart',
      explanation: `${reps} reps at ${r} RIR is about ${(pct * 100).toFixed(1)}% of a max.`,
    };
  }
  return {
    e1rm: epley(weight, reps + r),
    method: 'epley',
    explanation: `Epley formula on ${reps + r} reps (${reps} done + ${r} in reserve).`,
  };
}

/** Load that should give `reps` at `rir` for a lifter with this e1RM. */
export function loadFor(e1rm: number, reps: number, rir: number): number {
  const pct = chartPercent(reps, 10 - rir);
  if (pct != null) return e1rm * pct;
  const total = reps + rir;
  return total <= 1 ? e1rm : e1rm / (1 + total / 30);
}
