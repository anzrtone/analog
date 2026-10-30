// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { getExercise, getExercises } from '@/db/exercises';
import { activeRun } from '@/db/repos';
import { db } from '@/db/schema';
import { settings } from '@/db/settings';
import { editDb, sampleShown } from '@/db/shown';
import { activeWorkout, addExercise, addSet, completeSet, deleteWorkout, getWorkout, previousPerformance, startWorkout, uncompleteSet, updateSet, updateWorkout, type FullWorkout, type WorkoutSet } from '@/db/workouts';
import { formatSet } from '@/engine/math/units';
import { generateWarmups } from '@/engine/math/warmup';
import { setTypeInfo } from '@/engine/setTypes';
import { platform } from '@/platform';
import { applyFinishedWorkout, startProgramDay, type RunUpdate } from '@/services/programFlow';
import { afterSet, finish, livePrs, type WorkoutSummary } from '@/services/workoutFlow';
import { runAutoBackup } from '../autoBackup';
import { currentGym, engineSettings, rounder } from '../gym';
import { back, navigate, replace } from '../nav';
import { sensory } from '../sensory';
import { createStore } from '../store';
import { restTimer } from './timers';

/** Set ids that earned a PR stamp in this session (shown on the row). */
export const prStamps = createStore<Record<string, string>>({});

/** Results to show on the summary screen after finishing. */
export const lastFinish = createStore<{ summary: WorkoutSummary | null; run: RunUpdate | null }>({ summary: null, run: null });

/** Android asks for notification permission when the first workout starts, never at launch. */
async function askForNotificationsOnce() {
  try {
    await platform().requestNotificationPermission();
  } catch {
    /* the workout goes on without a lock-screen timer */
  }
}

export async function startEmptyWorkout(): Promise<void> {
  const existing = await activeWorkout(db);
  if (existing) return navigate({ name: 'workout', id: existing.id });
  const id = await startWorkout(db, { title: 'Workout', gymId: settings().defaultGymId });
  prStamps.set({});
  void askForNotificationsOnce();
  navigate({ name: 'workout', id });
}

export async function startNextProgramDay(): Promise<void> {
  const existing = await activeWorkout(db);
  if (existing) return navigate({ name: 'workout', id: existing.id });
  const run = await activeRun(db);
  if (!run) return;
  const id = await startProgramDay(db, run, engineSettings(), await rounder(db), settings().defaultGymId);
  if (!id) return;
  prStamps.set({});
  void askForNotificationsOnce();
  navigate({ name: 'workout', id });
}

/** Add an exercise to the open workout, pre-filled from last time (sets, weights as ghost targets). */
export async function addExerciseToWorkout(workoutId: string, exerciseId: string): Promise<void> {
  const prev = (await previousPerformance(db, exerciseId, workoutId)).filter((s) => setTypeInfo(s.type).volumeCredit > 0 || s.type === 'warmup');
  const sets = prev.length
    ? prev.map((s) => ({ type: s.type, targetWeightG: s.weightG, targetReps: s.reps, targetRir: s.rir, targetTimeMs: s.timeMs, side: s.side }))
    : [{ type: 'working' as const }, { type: 'working' as const }, { type: 'working' as const }];
  await addExercise(db, workoutId, exerciseId, { sets });
}

export async function addWarmups(workoutExerciseId: string, exerciseId: string, workingG: number): Promise<string> {
  const ex = await getExercise(db, exerciseId);
  const plan = generateWarmups(workingG, ex?.equipment ?? 'other', await currentGym(db), settings().warmupRamp, settings().warmupBar);
  for (const [i, w] of plan.sets.entries()) await addSet(db, workoutExerciseId, { type: 'warmup', targetWeightG: w.weightG, targetReps: w.reps }, i);
  return plan.explanation;
}

/**
 * Tick a set: accept the target values if nothing was typed, write to disk at once (its own transaction),
 * check for PRs, then start group-aware rest and update the lock-screen notification.
 */
export async function toggleSet(workoutId: string, set: WorkoutSet): Promise<void> {
  const d = editDb();
  const s = settings();
  if (set.completedAt != null) {
    await uncompleteSet(d, set.id);
    return;
  }
  await completeSet(d, set.id, {
    weightG: set.weightG ?? set.targetWeightG,
    reps: set.reps ?? set.targetReps,
    rir: set.rir ?? (set.type === 'failure' ? 0 : set.targetRir),
    timeMs: set.timeMs ?? set.targetTimeMs,
  });
  sensory.setCompleted();
  let full = await getWorkout(d, workoutId);
  if (!full) return;
  // Like a paper log: later empty rows of this exercise pick up what you just did as their target.
  const done = full.exercises.flatMap((e) => e.sets).find((x) => x.id === set.id);
  const later = full.exercises.find((e) => e.id === set.workoutExerciseId)?.sets.filter((x) => x.order > set.order && x.completedAt == null) ?? [];
  const empty = later.filter((x) => x.weightG == null && x.targetWeightG == null && x.reps == null && x.targetReps == null && x.timeMs == null && x.targetTimeMs == null && x.type === set.type);
  if (done && empty.length) {
    for (const x of empty) await updateSet(d, x.id, { targetWeightG: done.weightG, targetReps: done.reps, targetRir: done.rir, targetTimeMs: done.timeMs });
    full = (await getWorkout(d, workoutId))!;
  }
  const prs = (await livePrs(d, full, set.exerciseId, s.unit)).filter((p) => p.setId === set.id);
  if (prs.length) {
    prStamps.set((x) => ({ ...x, [set.id]: prs[0]!.message }));
    sensory.pr();
  }
  const after = await afterSet(d, full, set.id, s.unit, s.defaultRestMs);
  if (after.next) restTimer.start(after.restMs, after.label);
  else restTimer.skip();
  void updateWorkoutNotification(workoutId, full);
}

/** The quiet "workout in progress" note: current exercise and next set. Never for the tour's sample. */
export async function updateWorkoutNotification(workoutId: string, loaded?: FullWorkout | null): Promise<void> {
  if (sampleShown()) return;
  const p = platform();
  if (p.kind !== 'android') return;
  const full = loaded ?? (await getWorkout(db, workoutId));
  if (!full) return;
  const names = await getExercises(db, full.exercises.map((e) => e.exerciseId));
  for (const e of full.exercises) {
    const next = e.sets.find((x) => x.completedAt == null);
    if (!next || e.skipped) continue;
    const done = e.sets.filter((x) => x.completedAt != null).length;
    p.showWorkout(`${names.get(e.exerciseId)?.name ?? 'Exercise'} · set ${done + 1} of ${e.sets.length}`, `Next: ${formatSet(next.weightG ?? next.targetWeightG, next.reps ?? next.targetReps, settings().unit)}`);
    return;
  }
  p.cancelWorkout();
}

/** Finish now, or at `endedAt` when the session really ended earlier (forgot to tap Finish). */
export async function finishActiveWorkout(workoutId: string, endedAt = Date.now()): Promise<void> {
  const s = settings();
  const summary = await finish(db, workoutId, s.unit, endedAt);
  const run = await applyFinishedWorkout(db, workoutId, engineSettings(), await rounder(db));
  lastFinish.set({ summary, run });
  restTimer.skip();
  platform().cancelWorkout();
  replace({ name: 'summary', id: workoutId });
  // A full backup after every finished workout (one file a day, newest 7 kept).
  void runAutoBackup(db, platform(), 'workout').then((r) => {
    if (r.status === 'failed') console.warn('[auto backup]', r.error);
  });
}

/** Move the start, which is what the elapsed counter counts from. */
export async function setWorkoutStart(workoutId: string, startedAt: number): Promise<void> {
  await updateWorkout(db, workoutId, { startedAt });
}

export async function discardWorkout(workoutId: string): Promise<void> {
  await deleteWorkout(db, workoutId);
  restTimer.skip();
  platform().cancelWorkout();
  back();
}

