// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { clearPrsForWorkout } from '@/db/repos';
import type { AnalogDB, RunRow } from '@/db/schema';
import { getSetting, saveSettings, type UndoSnapshot } from '@/db/settings';
import { getWorkout } from '@/db/workouts';

// Finish is not a flag. It deletes the sets you never ticked, writes PR stamps, and rolls the program run forward
// (new training loads, the next day, at the end of a week the adaptive plan). To undo a mis-tap on Finish without losing
// any of that, what finishing is about to change is kept first, and putting it back is the same few writes in reverse.

/** Call right before the workout is finished. Replaces any earlier snapshot: only the latest finish can be undone. */
export async function snapshotBeforeFinish(d: AnalogDB, workoutId: string): Promise<void> {
  const full = await getWorkout(d, workoutId);
  if (!full) return;
  const run = full.workout.runId ? await d.programRuns.get(full.workout.runId) : undefined;
  const snap: UndoSnapshot = {
    workoutId,
    sets: full.exercises.flatMap((e) => e.sets).filter((s) => s.completedAt == null),
    run: run ? { id: run.id, state: JSON.parse(JSON.stringify(run.state)) as RunRow['state'], active: run.active, endedAt: run.endedAt } : null,
    landmarks: await d.landmarks.toArray(),
  };
  await saveSettings(d, { undoFinish: snap });
}

/**
 * Can this workout be reopened? Only the most recent finish, and only while nothing has been logged since: a later
 * workout would have been planned from the state that undoing puts back.
 */
export async function canUndoFinish(d: AnalogDB, workoutId: string): Promise<boolean> {
  const snap = await getSetting(d, 'undoFinish');
  if (!snap || snap.workoutId !== workoutId) return false;
  const w = await d.workouts.get(workoutId);
  if (!w || w.endedAt == null) return false;
  if ((await d.workouts.where('open').equals(1).count()) > 0) return false;
  return (await d.workouts.where('startedAt').above(w.startedAt).count()) === 0;
}

/** Open the workout again with the sets it had, the program where it was, and no PR stamps from the finish. */
export async function reopenFinished(d: AnalogDB, workoutId: string): Promise<boolean> {
  if (!(await canUndoFinish(d, workoutId))) return false;
  const snap = (await getSetting(d, 'undoFinish'))!;
  await d.transaction('rw', [d.workouts, d.workoutSets, d.programRuns, d.landmarks, d.prs, d.settings], async () => {
    await d.workoutSets.bulkPut(snap.sets);
    await d.workouts.update(workoutId, { endedAt: null, open: 1 });
    if (snap.run) await d.programRuns.update(snap.run.id, { state: snap.run.state, active: snap.run.active, endedAt: snap.run.endedAt });
    await d.landmarks.clear();
    await d.landmarks.bulkAdd(snap.landmarks);
    await clearPrsForWorkout(d, workoutId);
    await saveSettings(d, { undoFinish: null });
  });
  return true;
}
