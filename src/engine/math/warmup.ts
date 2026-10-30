// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import type { Equipment } from '../types';
import { roundToGym, type GymProfile } from './plates';
import { formatWeight } from './units';

export interface WarmupStep {
  /** Fraction of the working weight. */
  pct: number;
  reps: number;
}

/** Warm-up presets. `bar` opens with the empty bar on barbell lifts when the working weight is well above it. */
export const WARMUP_PRESETS = {
  light: { label: 'Light', ramp: [{ pct: 0.6, reps: 4 }], bar: false },
  standard: { label: 'Standard', ramp: [{ pct: 0.5, reps: 5 }, { pct: 0.75, reps: 2 }], bar: false },
  thorough: { label: 'Thorough', ramp: [{ pct: 0.4, reps: 8 }, { pct: 0.6, reps: 5 }, { pct: 0.8, reps: 3 }], bar: true },
} as const satisfies Record<string, { label: string; ramp: WarmupStep[]; bar: boolean }>;

export const DEFAULT_RAMP: WarmupStep[] = [...WARMUP_PRESETS.standard.ramp];

export interface WarmupSet {
  weightG: number;
  reps: number;
}

export interface WarmupPlan {
  sets: WarmupSet[];
  explanation: string;
}

/**
 * Warm-up ramp from the first working weight.
 * With `openWithBar`, barbell lifts start with the empty bar when the working weight is well above it.
 * Steps that round to the same load, or reach the working weight, are dropped.
 */
export function generateWarmups(workingG: number, equipment: Equipment, gym: GymProfile, ramp: WarmupStep[] = DEFAULT_RAMP, openWithBar = false): WarmupPlan {
  const unit = gym.unit;
  if (workingG <= 0) return { sets: [], explanation: 'No working weight yet, so no warm-ups.' };
  const barbell = equipment === 'barbell' || equipment === 'ezBar' || equipment === 'smith';
  const sets: WarmupSet[] = [];
  if (openWithBar && barbell && workingG >= gym.barG * 2) sets.push({ weightG: gym.barG, reps: 10 });

  for (const step of ramp) {
    const w = roundToGym(workingG * step.pct, equipment, gym, 'nearest');
    if (w <= 0 || w >= workingG) continue;
    if (barbell && w < gym.barG) continue;
    const last = sets[sets.length - 1];
    if (last && last.weightG >= w) continue;
    sets.push({ weightG: w, reps: step.reps });
  }
  const pcts = ramp.map((s) => `${Math.round(s.pct * 100)}%`).join('/');
  return {
    sets,
    explanation: sets.length
      ? `${pcts} of ${formatWeight(workingG, unit)} ${unit}, rounded to your plates.`
      : 'Working weight is light enough to start straight away.',
  };
}
