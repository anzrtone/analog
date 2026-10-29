// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { getExercises, toInfo } from '@/db/exercises';
import { clearPrsForWorkout, recordPrs } from '@/db/repos';
import type { AnalogDB } from '@/db/schema';
import { exerciseHistory, finishWorkout, getWorkout, prBaseline, toLoggedSet, type FullWorkout, type WorkoutSet } from '@/db/workouts';
import { formatClock, formatSet } from '@/engine/math/units';
import { detectPrs, type PrRecord } from '@/engine/prs/detect';
import type { SessionResult } from '@/engine/progression/types';
import { setTypeInfo } from '@/engine/setTypes';
import { nextAfter, type SequenceExercise, type SequenceGroup, type SetPointer } from '@/engine/timer/rest';
import type { WeightUnit } from '@/engine/types';
import { countVolume, volumeLoadG } from '@/engine/volume/count';

/** Sequence view of a workout for group-aware rest (skipped exercises drop out). */
export function sequenceOf(full: FullWorkout, defaultRestMs: number, exRest: Map<string, number>): { seq: SequenceExercise[]; groups: Map<string, SequenceGroup> } {
  const live = full.exercises.filter((e) => !e.skipped);
  const seq = live.map((e) => ({ key: e.id, groupId: e.groupId, setCount: e.sets.length, restMs: e.restMs ?? exRest.get(e.exerciseId) ?? defaultRestMs }));
  const groups = new Map(full.groups.map((g) => [g.id, { id: g.id, kind: g.kind, restMs: g.restMs, transitionMs: g.transitionMs }]));
  return { seq, groups };
}

export interface AfterSet {
  restMs: number;
  next: { workoutExerciseId: string; setId: string } | null;
  /** "next 27.5 × 10" or "next: Lat pulldown 60 × 10". */
  label: string;
}

/** What comes after ticking a set: how long to rest and which row is next. */
export async function afterSet(d: AnalogDB, full: FullWorkout, setId: string, unit: WeightUnit, defaultRestMs: number): Promise<AfterSet> {
  const live = full.exercises.filter((e) => !e.skipped);
  const exIdx = live.findIndex((e) => e.sets.some((s) => s.id === setId));
  if (exIdx < 0) return { restMs: 0, next: null, label: '' };
  const setIdx = live[exIdx]!.sets.findIndex((s) => s.id === setId);
  const infos = await getExercises(d, live.map((e) => e.exerciseId));
  const exRest = new Map([...infos.values()].map((e) => [e.id, e.defaultRestMs]));
  const { seq, groups } = sequenceOf(full, defaultRestMs, exRest);
  let step = nextAfter(seq, groups, { exerciseIndex: exIdx, setIndex: setIdx });
  // Skip forward past rows that are already ticked.
  let guard = 0;
  while (step.next && live[step.next.exerciseIndex]?.sets[step.next.setIndex]?.completedAt != null && guard++ < 200) {
    const s = nextAfter(seq, groups, step.next as SetPointer);
    step = { ...s, restMs: step.restMs };
  }
  if (!step.next) return { restMs: step.restMs, next: null, label: 'Last set done' };
  const ex = live[step.next.exerciseIndex]!;
  const set = ex.sets[step.next.setIndex]!;
  const w = set.weightG ?? set.targetWeightG;
  const r = set.reps ?? set.targetReps;
  const t = set.timeMs ?? set.targetTimeMs;
  const what = setTypeInfo(set.type).timed ? (t ? formatClock(t) : 'hold') : formatSet(w, r, unit);
  const sameEx = step.next.exerciseIndex === exIdx;
  const name = infos.get(ex.exerciseId)?.name ?? 'next exercise';
  return { restMs: step.restMs, next: { workoutExerciseId: ex.id, setId: set.id }, label: sameEx ? `next ${what}` : `next: ${name} ${what}` };
}

/** Past sessions of an exercise as engine input, oldest first. */
export async function sessionsFor(d: AnalogDB, exerciseId: string, excludeWorkoutId?: string, limit = 8): Promise<SessionResult[]> {
  const sets = await exerciseHistory(d, exerciseId, excludeWorkoutId);
  const byWorkout = new Map<string, WorkoutSet[]>();
  for (const s of sets) {
    const l = byWorkout.get(s.workoutId);
    if (l) l.push(s);
    else byWorkout.set(s.workoutId, [s]);
  }
  return [...byWorkout.values()]
    .map((list) => ({
      date: list[0]!.completedAt!,
      sets: list.sort((a, b) => a.order - b.order).map((s) => ({ type: s.type, weightG: s.weightG, reps: s.reps, rir: s.rir ?? (s.rpe != null ? 10 - s.rpe : null), timeMs: s.timeMs })),
    }))
    .sort((a, b) => a.date - b.date)
    .slice(-limit);
}

/** PRs this workout has set so far for one exercise (live, as sets are ticked). */
export async function livePrs(d: AnalogDB, full: FullWorkout, exerciseId: string, unit: WeightUnit): Promise<PrRecord[]> {
  // Runs on every tick: the collapsed baseline, not every set ever logged.
  const history = await prBaseline(d, exerciseId, full.workout.id);
  const current = full.exercises.flatMap((e) => e.sets).filter((s) => s.exerciseId === exerciseId && s.completedAt != null).map(toLoggedSet);
  return detectPrs(history, current, unit);
}

export interface WorkoutSummary {
  durationMs: number;
  sets: number;
  volumeG: number;
  prs: PrRecord[];
  muscles: ReturnType<typeof countVolume>;
}

/** Finish: drop unticked sets, record PRs, and summarise. */
export async function finish(d: AnalogDB, workoutId: string, unit: WeightUnit, now = Date.now()): Promise<WorkoutSummary> {
  await finishWorkout(d, workoutId, now);
  return summarise(d, workoutId, unit, true);
}

export async function summarise(d: AnalogDB, workoutId: string, unit: WeightUnit, record = false): Promise<WorkoutSummary> {
  const full = await getWorkout(d, workoutId);
  if (!full) return { durationMs: 0, sets: 0, volumeG: 0, prs: [], muscles: {} };
  const sets = full.exercises.flatMap((e) => e.sets).filter((s) => s.completedAt != null);
  const exIds = [...new Set(sets.map((s) => s.exerciseId))];
  const prs = (await Promise.all(exIds.map((id) => livePrs(d, full, id, unit)))).flat();
  if (record) {
    await clearPrsForWorkout(d, workoutId);
    await recordPrs(d, workoutId, prs);
  }
  const infos = await getExercises(d, exIds);
  const muscles = countVolume(sets.map(toLoggedSet), new Map([...infos.values()].map((e) => [e.id, toInfo(e)])));
  return { durationMs: (full.workout.endedAt ?? Date.now()) - full.workout.startedAt, sets: sets.length, volumeG: volumeLoadG(sets.map(toLoggedSet)), prs, muscles };
}
