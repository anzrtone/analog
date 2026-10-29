// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { setVolumeCredit } from '../setTypes';
import type { ExerciseInfo, LoggedSet, Muscle } from '../types';

export type MuscleVolume = Partial<Record<Muscle, number>>;

/**
 * Hard sets per muscle. Primary muscles get the set's full credit,
 * secondary muscles get credit × the exercise's secondary credit (0.5 by default).
 * A unilateral exercise logged as separate L and R sets counts each pair once.
 */
export function countVolume(sets: LoggedSet[], exercises: Map<string, ExerciseInfo>): MuscleVolume {
  const out: MuscleVolume = {};
  for (const s of sets) {
    if (s.completedAt == null) continue;
    const ex = exercises.get(s.exerciseId);
    if (!ex) continue;
    // Segments are logged after the main set, unless the main set was left blank and the segments are the whole set.
    const parts = s.reps != null || s.timeMs != null ? s.segments.length + 1 : s.segments.length;
    let credit = setVolumeCredit(s.type, parts);
    if (credit === 0) continue;
    if (ex.unilateral && s.side != null) credit /= 2;
    for (const m of ex.primary) out[m] = (out[m] ?? 0) + credit;
    for (const m of ex.secondary) {
      if (ex.primary.includes(m)) continue;
      out[m] = (out[m] ?? 0) + credit * ex.secondaryCredit;
    }
  }
  for (const k of Object.keys(out) as Muscle[]) out[k] = round2(out[k]!);
  return out;
}

/** Tonnage (the main set plus any segments) in grams·reps. Warm-ups excluded. */
export function volumeLoadG(sets: LoggedSet[]): number {
  let total = 0;
  for (const s of sets) {
    if (s.completedAt == null || s.type === 'warmup' || s.type === 'feeder') continue;
    const w = s.weightG ?? 0;
    total += w * (s.reps ?? 0);
    for (const seg of s.segments) total += (seg.weightG ?? w) * (seg.reps ?? 0);
  }
  return total;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** ISO-8601 week key ("2026-W44") in local time, for weekly volume. */
export function isoWeekKey(ts: number): string {
  const d = new Date(ts);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + 3);
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  const week = 1 + Math.round(((thursday.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
  return `${thursday.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Weekly sets per muscle across many workouts. */
export function weeklyVolume(sets: LoggedSet[], exercises: Map<string, ExerciseInfo>): Map<string, MuscleVolume> {
  const byWeek = new Map<string, LoggedSet[]>();
  for (const s of sets) {
    if (s.completedAt == null) continue;
    const k = isoWeekKey(s.completedAt);
    const list = byWeek.get(k);
    if (list) list.push(s);
    else byWeek.set(k, [s]);
  }
  const out = new Map<string, MuscleVolume>();
  for (const [k, list] of [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b))) out.set(k, countVolume(list, exercises));
  return out;
}
