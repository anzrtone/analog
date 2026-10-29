// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { estimate1rm } from '../math/e1rm';
import { isoWeekKey } from '../volume/count';
import type { LoggedSet, Muscle } from '../types';
import { setTypeInfo } from '../setTypes';

export interface WorkoutSummary {
  id: string;
  startedAt: number;
  endedAt: number | null;
}

/** Consecutive weeks (ending this week or last week) with at least one workout. Never shaming: just a count. */
export function weekStreak(workouts: WorkoutSummary[], now: number): number {
  const weeks = new Set(workouts.map((w) => isoWeekKey(w.startedAt)));
  let streak = 0;
  const back = (ts: number) => {
    const d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7, 12).getTime();
  };
  let cursor = now;
  // A streak still counts if this week hasn't had a workout yet.
  if (!weeks.has(isoWeekKey(cursor))) cursor = back(cursor);
  while (weeks.has(isoWeekKey(cursor))) {
    streak++;
    cursor = back(cursor);
  }
  return streak;
}

/** Days with workouts, as "YYYY-MM-DD" → count, for the calendar. */
export function calendarDays(workouts: WorkoutSummary[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const w of workouts) {
    const d = new Date(w.startedAt);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export function averageDurationMs(workouts: WorkoutSummary[]): number | null {
  // A session left open overnight isn't a real duration.
  const done = workouts.filter((w) => w.endedAt != null && w.endedAt > w.startedAt && w.endedAt - w.startedAt <= 6 * 3600000);
  if (!done.length) return null;
  return done.reduce((a, w) => a + (w.endedAt! - w.startedAt), 0) / done.length;
}

export interface TrendPoint {
  date: number;
  value: number;
  setId: string;
}

/** Best e1RM per workout for one exercise, oldest first. */
export function e1rmTrend(sets: LoggedSet[]): TrendPoint[] {
  const best = new Map<string, TrendPoint>();
  for (const s of sets) {
    if (s.completedAt == null || !setTypeInfo(s.type).prEligible || !s.weightG || !s.reps) continue;
    const v = estimate1rm(s.weightG, s.reps, s.rir ?? (s.rpe != null ? 10 - s.rpe : null)).e1rm;
    const cur = best.get(s.workoutId);
    if (!cur || v > cur.value) best.set(s.workoutId, { date: s.completedAt, value: v, setId: s.id });
  }
  return [...best.values()].sort((a, b) => a.date - b.date);
}

/**
 * Sessions the program has asked for so far: every fully elapsed week since the run started,
 * times the days in a week of the current block. The week in progress isn't counted against you.
 */
export function plannedSessions(startedAt: number, now: number, daysPerWeek: number): number {
  const weeks = Math.floor(Math.max(0, now - startedAt) / (7 * 86400000));
  return weeks * Math.max(0, daysPerWeek);
}

/** Planned sessions done, as a fraction. */
export function adherence(planned: number, done: number): number | null {
  return planned > 0 ? Math.min(1, done / planned) : null;
}

// ---- Wrapped ----

const COMPARISONS: { name: string; plural: string; kg: number }[] = [
  { name: 'blue whale', plural: 'blue whales', kg: 150000 },
  { name: 'loaded semi truck', plural: 'loaded semi trucks', kg: 36000 },
  { name: 'school bus', plural: 'school buses', kg: 11000 },
  { name: 'African elephant', plural: 'African elephants', kg: 6000 },
  { name: 'car', plural: 'cars', kg: 1500 },
  { name: 'grand piano', plural: 'grand pianos', kg: 400 },
];

/** "you lifted 3 blue whales": the largest comparison that gives at least 1. */
export function tonnageComparison(totalKg: number): string {
  const c = COMPARISONS.find((x) => totalKg >= x.kg) ?? COMPARISONS[COMPARISONS.length - 1]!;
  const n = totalKg / c.kg;
  const shown = n >= 10 ? Math.round(n).toLocaleString('en-US') : (Math.round(n * 10) / 10).toString();
  return `${shown} ${n >= 0.95 && n < 1.05 ? c.name : c.plural}`;
}

export interface WrappedInput {
  workouts: WorkoutSummary[];
  tonnageG: number;
  topLift: { name: string; e1rmG: number } | null;
  muscleSets: Partial<Record<Muscle, number>>;
  now: number;
}

export interface Wrapped {
  workouts: number;
  hours: number;
  tonnageKg: number;
  comparison: string;
  topLift: WrappedInput['topLift'];
  mostTrained: Muscle | null;
  streak: number;
}

export function buildWrapped(i: WrappedInput): Wrapped {
  const ms = i.workouts.reduce((a, w) => a + (w.endedAt && w.endedAt > w.startedAt ? w.endedAt - w.startedAt : 0), 0);
  const tonnageKg = Math.round(i.tonnageG / 1000);
  const most = (Object.entries(i.muscleSets) as [Muscle, number][]).sort((a, b) => b[1] - a[1])[0];
  return {
    workouts: i.workouts.length,
    hours: Math.round(ms / 360000) / 10,
    tonnageKg,
    comparison: tonnageComparison(tonnageKg),
    topLift: i.topLift,
    mostTrained: most ? most[0] : null,
    streak: weekStreak(i.workouts, i.now),
  };
}
