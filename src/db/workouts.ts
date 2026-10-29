// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import Dexie from 'dexie';
import { prEligibleTypes, type SetType } from '@/engine/setTypes';
import type { LoggedSet } from '@/engine/types';
import type { GroupKind } from '@/engine/timer/rest';
import { newId, type AnalogDB, type WorkoutExerciseRow, type WorkoutGroupRow, type WorkoutRow, type WorkoutSetRow } from './schema';

export type Workout = WorkoutRow;
export type WorkoutExercise = WorkoutExerciseRow;
export type WorkoutSet = WorkoutSetRow;
export type WorkoutGroup = WorkoutGroupRow;
export type SetPatch = Partial<Omit<WorkoutSet, 'id' | 'workoutId' | 'workoutExerciseId' | 'exerciseId'>>;

export interface FullWorkout {
  workout: Workout;
  exercises: (WorkoutExercise & { sets: WorkoutSet[] })[];
  groups: WorkoutGroup[];
}

export function toLoggedSet(s: WorkoutSet): LoggedSet {
  return {
    id: s.id,
    workoutId: s.workoutId,
    exerciseId: s.exerciseId,
    type: s.type,
    order: s.order,
    weightG: s.weightG,
    reps: s.reps,
    rir: s.rir,
    rpe: s.rpe,
    partials: s.partials,
    forced: s.forced,
    timeMs: s.timeMs,
    distanceM: s.distanceM,
    side: s.side,
    segments: s.segments,
    completedAt: s.completedAt,
  };
}

/** A full workout row with 0.1.0's defaults (null) for anything not given. */
export function workoutRow(w: Partial<WorkoutRow> & { id: string; title: string; startedAt: number }): WorkoutRow {
  const row: WorkoutRow = {
    id: w.id,
    title: w.title,
    runId: w.runId ?? null,
    programId: w.programId ?? null,
    dayId: w.dayId ?? null,
    blockIndex: w.blockIndex ?? null,
    weekIndex: w.weekIndex ?? null,
    gymId: w.gymId ?? null,
    startedAt: w.startedAt,
    endedAt: w.endedAt ?? null,
    bodyweightG: w.bodyweightG ?? null,
    sessionRpe: w.sessionRpe ?? null,
    sleep: w.sleep ?? null,
    stress: w.stress ?? null,
    notes: w.notes ?? null,
    importKey: w.importKey ?? null,
    healthConnectId: w.healthConnectId ?? null,
  };
  if (row.endedAt == null) row.open = 1;
  return row;
}

export function setRow(s: Partial<WorkoutSetRow> & Pick<WorkoutSetRow, 'id' | 'workoutId' | 'workoutExerciseId' | 'exerciseId' | 'order'>): WorkoutSetRow {
  return {
    id: s.id,
    workoutId: s.workoutId,
    workoutExerciseId: s.workoutExerciseId,
    exerciseId: s.exerciseId,
    order: s.order,
    type: s.type ?? 'working',
    weightG: s.weightG ?? null,
    reps: s.reps ?? null,
    rir: s.rir ?? null,
    rpe: s.rpe ?? null,
    partials: s.partials ?? null,
    forced: s.forced ?? null,
    tempo: s.tempo ?? null,
    side: s.side ?? null,
    timeMs: s.timeMs ?? null,
    distanceM: s.distanceM ?? null,
    band: s.band ?? null,
    restMs: s.restMs ?? null,
    pain: s.pain ?? null,
    note: s.note ?? null,
    segments: s.segments ?? [],
    parentSetId: s.parentSetId ?? null,
    targetWeightG: s.targetWeightG ?? null,
    targetReps: s.targetReps ?? null,
    targetRepsMax: s.targetRepsMax ?? null,
    targetRir: s.targetRir ?? null,
    targetTimeMs: s.targetTimeMs ?? null,
    completedAt: s.completedAt ?? null,
  };
}

export function workoutExerciseRow(e: Partial<WorkoutExerciseRow> & Pick<WorkoutExerciseRow, 'id' | 'workoutId' | 'exerciseId' | 'order'>): WorkoutExerciseRow {
  return {
    id: e.id,
    workoutId: e.workoutId,
    exerciseId: e.exerciseId,
    order: e.order,
    groupId: e.groupId ?? null,
    restMs: e.restMs ?? null,
    note: e.note ?? null,
    slotId: e.slotId ?? null,
    explanation: e.explanation ?? null,
    explanationDetail: e.explanationDetail ?? null,
    skipped: e.skipped ?? false,
  };
}

export async function startWorkout(d: AnalogDB, init: Partial<WorkoutRow> & { title: string }, now = Date.now()): Promise<string> {
  const id = newId();
  await d.workouts.add(workoutRow({ ...init, id, startedAt: init.startedAt ?? now, endedAt: null }));
  return id;
}

/** The unfinished workout, if the app was closed mid-session (newest first). */
export async function activeWorkout(d: AnalogDB): Promise<Workout | null> {
  const open = await d.workouts.where('open').equals(1).toArray();
  return open.sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
}

export async function getWorkout(d: AnalogDB, id: string): Promise<FullWorkout | null> {
  return d.transaction('r', d.workouts, d.workoutExercises, d.workoutSets, d.workoutGroups, async () => {
    const workout = await d.workouts.get(id);
    if (!workout) return null;
    const [exs, sets, groups] = await Promise.all([d.workoutExercises.where('workoutId').equals(id).toArray(), d.workoutSets.where('workoutId').equals(id).toArray(), d.workoutGroups.where('workoutId').equals(id).toArray()]);
    exs.sort((a, b) => a.order - b.order);
    sets.sort((a, b) => a.order - b.order);
    const byEx = new Map<string, WorkoutSet[]>();
    for (const s of sets) {
      const l = byEx.get(s.workoutExerciseId);
      if (l) l.push(s);
      else byEx.set(s.workoutExerciseId, [s]);
    }
    return { workout, exercises: exs.map((e) => ({ ...e, sets: byEx.get(e.id) ?? [] })), groups };
  });
}

export async function updateWorkout(d: AnalogDB, id: string, patch: Partial<WorkoutRow>): Promise<void> {
  await d.workouts.update(id, patch);
}

export async function finishWorkout(d: AnalogDB, id: string, now = Date.now()): Promise<void> {
  await d.transaction('rw', d.workouts, d.workoutSets, async () => {
    // Sets you never ticked don't belong in history.
    const unticked = await d.workoutSets.where('workoutId').equals(id).filter((s) => s.completedAt == null).primaryKeys();
    await d.workoutSets.bulkDelete(unticked);
    await d.workouts.update(id, { endedAt: now, open: undefined });
  });
}

export async function deleteWorkout(d: AnalogDB, id: string): Promise<void> {
  await d.transaction('rw', d.workouts, d.workoutSets, d.workoutExercises, d.workoutGroups, async () => {
    await d.workoutSets.where('workoutId').equals(id).delete();
    await d.workoutExercises.where('workoutId').equals(id).delete();
    await d.workoutGroups.where('workoutId').equals(id).delete();
    await d.workouts.delete(id);
  });
}

export interface NewSet {
  type?: SetType;
  weightG?: number | null;
  reps?: number | null;
  rir?: number | null;
  timeMs?: number | null;
  side?: 'L' | 'R' | null;
  targetWeightG?: number | null;
  targetReps?: number | null;
  targetRepsMax?: number | null;
  targetRir?: number | null;
  targetTimeMs?: number | null;
  parentSetId?: string | null;
}

export async function addExercise(
  d: AnalogDB,
  workoutId: string,
  exerciseId: string,
  opts: { restMs?: number | null; slotId?: string | null; explanation?: string | null; explanationDetail?: string | null; note?: string | null; sets?: NewSet[]; groupId?: string | null } = {},
): Promise<string> {
  const id = newId();
  await d.transaction('rw', d.workoutExercises, d.workoutSets, async () => {
    const existing = await d.workoutExercises.where('workoutId').equals(workoutId).toArray();
    const order = existing.reduce((m, e) => Math.max(m, e.order), -1) + 1;
    await d.workoutExercises.add(workoutExerciseRow({ id, workoutId, exerciseId, order, restMs: opts.restMs, slotId: opts.slotId, explanation: opts.explanation, explanationDetail: opts.explanationDetail, note: opts.note, groupId: opts.groupId }));
    await d.workoutSets.bulkAdd((opts.sets ?? []).map((s, i) => newSetRow(workoutId, id, exerciseId, i, s)));
  });
  return id;
}

function newSetRow(workoutId: string, workoutExerciseId: string, exerciseId: string, order: number, s: NewSet): WorkoutSetRow {
  return setRow({ id: newId(), workoutId, workoutExerciseId, exerciseId, order, ...s });
}

export async function addSet(d: AnalogDB, workoutExerciseId: string, s: NewSet = {}, atIndex?: number): Promise<string> {
  return d.transaction('rw', d.workoutExercises, d.workoutSets, async () => {
    const we = await d.workoutExercises.get(workoutExerciseId);
    if (!we) throw new Error('Exercise not in workout');
    const sets = (await d.workoutSets.where('workoutExerciseId').equals(workoutExerciseId).toArray()).sort((a, b) => a.order - b.order);
    const index = atIndex ?? sets.length;
    for (const x of sets) if (x.order >= index) await d.workoutSets.update(x.id, { order: x.order + 1 });
    const row = newSetRow(we.workoutId, we.id, we.exerciseId, index, s);
    await d.workoutSets.add(row);
    return row.id;
  });
}

/** Write a set change straight to disk, in its own transaction. Called on every edit, so a crash loses nothing. */
export async function updateSet(d: AnalogDB, id: string, patch: SetPatch): Promise<void> {
  await d.workoutSets.update(id, patch);
}

/** Move every logged set of one type to another, e.g. when a custom set type is deleted. */
export async function retypeSets(d: AnalogDB, from: SetType, to: SetType): Promise<void> {
  await d.workoutSets.filter((s) => s.type === from).modify({ type: to });
}

/** Tick a set: one write, at once, never batched. */
export async function completeSet(d: AnalogDB, id: string, patch: SetPatch, now = Date.now()): Promise<void> {
  await d.workoutSets.update(id, { ...patch, completedAt: now });
}

export async function uncompleteSet(d: AnalogDB, id: string): Promise<void> {
  await d.workoutSets.update(id, { completedAt: null });
}

export async function deleteSet(d: AnalogDB, id: string): Promise<void> {
  await d.workoutSets.delete(id);
}

export async function removeExercise(d: AnalogDB, workoutExerciseId: string): Promise<void> {
  await d.transaction('rw', d.workoutSets, d.workoutExercises, async () => {
    await d.workoutSets.where('workoutExerciseId').equals(workoutExerciseId).delete();
    await d.workoutExercises.delete(workoutExerciseId);
  });
}

export async function setExerciseSkipped(d: AnalogDB, workoutExerciseId: string, skipped: boolean): Promise<void> {
  await d.workoutExercises.update(workoutExerciseId, { skipped });
}

/** Swap mid-workout: unticked sets move to the new exercise; ticked ones stay with the old. */
export async function swapExercise(d: AnalogDB, workoutExerciseId: string, newExerciseId: string): Promise<void> {
  await d.transaction('rw', d.workoutExercises, d.workoutSets, async () => {
    await d.workoutExercises.update(workoutExerciseId, { exerciseId: newExerciseId, explanation: null, explanationDetail: null });
    await d.workoutSets
      .where('workoutExerciseId')
      .equals(workoutExerciseId)
      .filter((s) => s.completedAt == null)
      .modify({ exerciseId: newExerciseId, weightG: null, targetWeightG: null });
  });
}

export async function reorderExercises(d: AnalogDB, workoutId: string, orderedIds: string[]): Promise<void> {
  await d.transaction('rw', d.workoutExercises, async () => {
    for (const [i, id] of orderedIds.entries()) {
      const e = await d.workoutExercises.get(id);
      if (e?.workoutId === workoutId) await d.workoutExercises.update(id, { order: i });
    }
  });
}

/** Group consecutive exercises into a superset, tri-set, giant set or circuit. */
export async function groupExercises(d: AnalogDB, workoutId: string, workoutExerciseIds: string[], kind: GroupKind, restMs: number): Promise<string> {
  const id = newId();
  await d.transaction('rw', d.workoutGroups, d.workoutExercises, async () => {
    await d.workoutGroups.add({ id, workoutId, kind, restMs, transitionMs: 0 });
    await d.workoutExercises.where('id').anyOf(workoutExerciseIds).modify({ groupId: id });
  });
  return id;
}

export async function ungroup(d: AnalogDB, groupId: string): Promise<void> {
  await d.transaction('rw', d.workoutGroups, d.workoutExercises, async () => {
    await d.workoutExercises.filter((e) => e.groupId === groupId).modify({ groupId: null });
    await d.workoutGroups.delete(groupId);
  });
}

export async function setExerciseRest(d: AnalogDB, workoutExerciseId: string, restMs: number | null): Promise<void> {
  await d.workoutExercises.update(workoutExerciseId, { restMs });
}

export async function setExerciseNote(d: AnalogDB, workoutExerciseId: string, note: string | null): Promise<void> {
  await d.workoutExercises.update(workoutExerciseId, { note });
}

/** Last finished session's sets for an exercise, shown in pencil next to today's rows. */
export async function previousPerformance(d: AnalogDB, exerciseId: string, beforeWorkoutId: string | null): Promise<WorkoutSet[]> {
  return d.transaction('r', d.workoutSets, d.workouts, async () => {
    // Walk the index backwards a few sessions at a time and stop at the first finished one other than this.
    const seen = new Set<string>(beforeWorkoutId ? [beforeWorkoutId] : []);
    let upper: unknown = Dexie.maxKey;
    let lastWorkoutId: string | null = null;
    while (!lastWorkoutId) {
      const batch: string[] = [];
      let oldest: number | null = null;
      await d.workoutSets
        .where('[exerciseId+completedAt]')
        .between([exerciseId, Dexie.minKey], [exerciseId, upper], true, true)
        .reverse()
        .until(() => batch.length >= 3)
        .each((s) => {
          oldest = s.completedAt;
          if (seen.has(s.workoutId)) return;
          seen.add(s.workoutId);
          batch.push(s.workoutId);
        });
      if (!batch.length) return [];
      const rows = await d.workouts.bulkGet(batch);
      lastWorkoutId = batch.find((_, i) => rows[i]?.endedAt != null) ?? null;
      upper = oldest;
    }
    const sets = await d.workoutSets
      .where('workoutId')
      .equals(lastWorkoutId)
      .filter((s) => s.exerciseId === exerciseId && s.completedAt != null)
      .toArray();
    return sets.sort((a, b) => a.order - b.order);
  });
}

/** Every completed set of an exercise, oldest first (uses the exercise + completedAt index). */
export async function exerciseHistory(d: AnalogDB, exerciseId: string, excludeWorkoutId?: string): Promise<WorkoutSet[]> {
  const sets = await d.workoutSets.where('[exerciseId+completedAt]').between([exerciseId, Dexie.minKey], [exerciseId, Dexie.maxKey]).toArray();
  return excludeWorkoutId ? sets.filter((s) => s.workoutId !== excludeWorkoutId) : sets;
}

/**
 * What PR detection needs from an exercise's past: one row per distinct result (load, reps, effort, time, side),
 * PR-eligible types only. PRs compare values, never which past set held them, so this gives the same PRs as
 * the full history while staying a few hundred rows after years of the same lift.
 */
export async function prBaseline(d: AnalogDB, exerciseId: string, excludeWorkoutId?: string): Promise<LoggedSet[]> {
  const eligible = new Set(prEligibleTypes());
  const groups = new Map<string, LoggedSet>();
  await d.workoutSets
    .where('[exerciseId+completedAt]')
    .between([exerciseId, Dexie.minKey], [exerciseId, Dexie.maxKey])
    .each((s) => {
      if (!eligible.has(s.type) || s.workoutId === excludeWorkoutId) return;
      const key = `${s.type}|${s.weightG}|${s.reps}|${s.rir}|${s.rpe}|${s.timeMs}|${s.side}`;
      const g = groups.get(key);
      if (!g) groups.set(key, { id: s.id, workoutId: '', exerciseId, type: s.type, order: 0, weightG: s.weightG, reps: s.reps, rir: s.rir, rpe: s.rpe, partials: null, forced: null, timeMs: s.timeMs, distanceM: null, side: s.side, segments: [], completedAt: s.completedAt });
      else {
        // Same as SQL's min(id) and max(completedAt) per group.
        if (s.id < g.id) g.id = s.id;
        if ((s.completedAt ?? 0) > (g.completedAt ?? 0)) g.completedAt = s.completedAt;
      }
    });
  return [...groups.values()];
}

export async function setsBetween(d: AnalogDB, from: number, to: number): Promise<WorkoutSet[]> {
  return d.workoutSets.where('completedAt').between(from, to, true, false).toArray();
}

export interface HistoryItem {
  id: string;
  title: string;
  startedAt: number;
  endedAt: number | null;
  sets: number;
  volumeG: number;
  exercises: number;
}

/** One page of finished workouts, newest first. Keyset paging on startedAt keeps it fast with years of data. */
export async function historyPage(d: AnalogDB, beforeStartedAt: number | null, limit = 30): Promise<HistoryItem[]> {
  return d.transaction('r', d.workouts, d.workoutSets, async () => {
    // Pick the page first (startedAt index), then total only those workouts' sets.
    const range = beforeStartedAt != null ? d.workouts.where('startedAt').below(beforeStartedAt) : d.workouts.orderBy('startedAt');
    const page = await range
      .reverse()
      .filter((w) => w.endedAt != null)
      .limit(limit)
      .toArray();
    const sets = await Promise.all(page.map((w) => d.workoutSets.where('workoutId').equals(w.id).toArray()));
    return page.map((w, i) => {
      const done = sets[i]!.filter((s) => s.completedAt != null);
      const volumeG = done.reduce((sum, s) => (s.type === 'warmup' || s.type === 'feeder' ? sum : sum + (s.weightG ?? 0) * (s.reps ?? 0)), 0);
      return { id: w.id, title: w.title, startedAt: w.startedAt, endedAt: w.endedAt, sets: done.length, volumeG, exercises: new Set(done.map((s) => s.exerciseId)).size };
    });
  });
}

/** Whether any workout has been finished: stops at the first one, for empty states. */
export async function hasHistory(d: AnalogDB): Promise<boolean> {
  return (await d.workouts.filter((w) => w.endedAt != null).first()) != null;
}

/** Finished workouts of one program run, oldest first (uses the runId index). */
export async function workoutsForRun(d: AnalogDB, runId: string): Promise<Workout[]> {
  const rows = await d.workouts.where('runId').equals(runId).filter((w) => w.endedAt != null).toArray();
  return rows.sort((a, b) => a.startedAt - b.startedAt);
}

/** Start time of the user's earliest finished workout, or null before the first one. */
export async function firstWorkoutAt(d: AnalogDB): Promise<number | null> {
  return (await d.workouts.orderBy('startedAt').filter((w) => w.endedAt != null).first())?.startedAt ?? null;
}

export async function finishedWorkouts(d: AnalogDB, from = 0, to = Number.MAX_SAFE_INTEGER): Promise<Workout[]> {
  return d.workouts
    .where('startedAt')
    .between(from, to, true, false)
    .filter((w) => w.endedAt != null)
    .toArray();
}
