// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import type { Muscle } from '../types';
import type { Landmarks } from './types';

// Starting volume landmarks in hard sets per week. Editable per muscle, and learned from past mesos.
// Muscles that get plenty of indirect work (front delts, abs) start at an MEV of 0.
export const DEFAULT_LANDMARKS: Record<Muscle, Landmarks> = {
  chest: { mev: 8, mav: 14, mrv: 20 },
  frontDelts: { mev: 0, mav: 8, mrv: 12 },
  sideDelts: { mev: 8, mav: 16, mrv: 24 },
  rearDelts: { mev: 6, mav: 14, mrv: 22 },
  triceps: { mev: 6, mav: 12, mrv: 18 },
  biceps: { mev: 8, mav: 14, mrv: 20 },
  forearmFlexors: { mev: 2, mav: 8, mrv: 16 },
  forearmExtensors: { mev: 2, mav: 6, mrv: 12 },
  upperBack: { mev: 10, mav: 16, mrv: 24 },
  traps: { mev: 4, mav: 12, mrv: 20 },
  lowerBack: { mev: 2, mav: 6, mrv: 10 },
  abs: { mev: 0, mav: 12, mrv: 20 },
  obliques: { mev: 0, mav: 6, mrv: 12 },
  glutes: { mev: 4, mav: 10, mrv: 16 },
  quads: { mev: 8, mav: 14, mrv: 20 },
  hamstrings: { mev: 6, mav: 12, mrv: 18 },
  adductors: { mev: 2, mav: 8, mrv: 14 },
  abductors: { mev: 2, mav: 8, mrv: 14 },
  calves: { mev: 8, mav: 12, mrv: 18 },
  neckFlexors: { mev: 0, mav: 6, mrv: 12 },
  neckExtensors: { mev: 0, mav: 6, mrv: 12 },
};

/** RIR walks down across the meso: 4 weeks → 3, 2, 1, 0. The deload week is RIR 4. */
export function rirForWeek(week: number, weeks: number, deload: boolean): number {
  if (deload || week > weeks) return 4;
  if (weeks <= 1) return 2;
  return Math.round(3 - (3 * (week - 1)) / (weeks - 1));
}

export interface MesoMuscleRecord {
  /** Weekly sets for each training week, in order. */
  weeklySets: number[];
  /** Adaptive score for each week (null when every prompt was skipped). */
  scores: (number | null)[];
}

export interface LearnedLandmarks {
  landmarks: Landmarks;
  nextStartSets: number;
  explanation: string;
}

/**
 * Update a muscle's landmarks from a finished meso.
 * - Hit "too much" (score ≤ −3) at N sets → MRV moves halfway toward N.
 * - Reached MRV and still recovered (score ≥ 0) → MRV +1.
 * - Next meso starts at the average of this meso's first two weeks (where you were clearly recovering), never under MEV.
 */
export function learnLandmarks(current: Landmarks, rec: MesoMuscleRecord): LearnedLandmarks {
  let { mev, mav, mrv } = current;
  const notes: string[] = [];
  const tooMuch = rec.weeklySets.filter((_, i) => (rec.scores[i] ?? 0) <= -3);
  if (tooMuch.length) {
    const at = Math.min(...tooMuch);
    const next = Math.round((mrv + at) / 2);
    if (next !== mrv) notes.push(`MRV ${mrv} → ${next}: ${at} sets felt like too much`);
    mrv = next;
  } else {
    const peak = Math.max(0, ...rec.weeklySets);
    const lastScore = rec.scores[rec.scores.length - 1] ?? null;
    if (peak >= mrv && lastScore != null && lastScore >= 0) {
      notes.push(`MRV ${mrv} → ${mrv + 1}: recovered fine at ${peak} sets`);
      mrv += 1;
    }
  }
  mav = Math.min(mav, mrv - 1);
  mev = Math.min(mev, mav);
  const firstTwo = rec.weeklySets.slice(0, 2);
  const start = firstTwo.length ? Math.round(firstTwo.reduce((a, b) => a + b, 0) / firstTwo.length) : mev;
  const nextStartSets = Math.max(mev, Math.min(mrv, start));
  return {
    landmarks: { mev, mav, mrv },
    nextStartSets,
    explanation: notes.length ? notes.join('; ') : 'Landmarks unchanged.',
  };
}
