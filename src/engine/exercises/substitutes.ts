// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import type { ExerciseInfo, Muscle } from '../types';

function weights(ex: ExerciseInfo): Map<Muscle, number> {
  const m = new Map<Muscle, number>();
  for (const p of ex.primary) m.set(p, 1);
  for (const s of ex.secondary) if (!m.has(s)) m.set(s, ex.secondaryCredit);
  return m;
}

/** Weighted Jaccard overlap of two exercises' muscles, 0–1. */
export function muscleOverlap(a: ExerciseInfo, b: ExerciseInfo): number {
  const wa = weights(a);
  const wb = weights(b);
  let inter = 0;
  let union = 0;
  for (const m of new Set([...wa.keys(), ...wb.keys()])) {
    const x = wa.get(m) ?? 0;
    const y = wb.get(m) ?? 0;
    inter += Math.min(x, y);
    union += Math.max(x, y);
  }
  return union === 0 ? 0 : inter / union;
}

export interface Substitute {
  exercise: ExerciseInfo;
  score: number;
  reason: string;
}

/** Swaps ranked by muscle overlap; same equipment and logging mode break ties. */
export function rankSubstitutes(target: ExerciseInfo, pool: ExerciseInfo[], limit = 20): Substitute[] {
  return pool
    .filter((e) => e.id !== target.id)
    .map((e) => {
      const overlap = muscleOverlap(target, e);
      const sameEquip = e.equipment === target.equipment ? 0.05 : 0;
      const sameMode = e.mode === target.mode ? 0.05 : 0;
      return {
        exercise: e,
        score: overlap + (overlap > 0 ? sameEquip + sameMode : 0),
        reason: `${Math.round(overlap * 100)}% muscle overlap${sameEquip ? ', same equipment' : ''}`,
      };
    })
    .filter((s) => s.score > 0.2)
    .sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name))
    .slice(0, limit);
}
