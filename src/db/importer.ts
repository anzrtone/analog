// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import type { ImportResult } from '@/engine/import/normalize';
import { groupKindFor } from '@/engine/timer/rest';
import { addAlias, createExercise } from './exercises';
import { newId, type AnalogDB, type WorkoutSetRow } from './schema';
import { setRow, workoutExerciseRow, workoutRow } from './workouts';

/** For each imported name: an existing exercise id, or create a custom exercise with that name. */
export type NameMapping = Record<string, { exerciseId: string } | { create: true }>;

export interface CommitSummary {
  workouts: number;
  sets: number;
  skippedDuplicates: number;
  createdExercises: number;
}

/**
 * Write an import into history, in one transaction. Workouts already imported (same source, start time and title)
 * are skipped, so importing the same file twice is safe. Chosen mappings are saved as aliases for next time.
 */
export async function commitImport(d: AnalogDB, result: ImportResult, mapping: NameMapping, gymId: string | null): Promise<CommitSummary> {
  const summary: CommitSummary = { workouts: 0, sets: 0, skippedDuplicates: 0, createdExercises: 0 };
  await d.transaction('rw', [d.exercises, d.exerciseOverrides, d.workouts, d.workoutGroups, d.workoutExercises, d.workoutSets], async () => {
    const ids = new Map<string, string>();
    for (const name of result.exerciseNames) {
      const m = mapping[name];
      if (!m) continue;
      if ('create' in m) {
        ids.set(name, await createExercise(d, { name, aliases: [], primary: [], secondary: [], equipment: 'other', mode: 'weightReps' }));
        summary.createdExercises++;
      } else {
        ids.set(name, m.exerciseId);
        await addAlias(d, m.exerciseId, name);
      }
    }

    for (const w of result.workouts) {
      const importKey = `${result.source}:${w.startedAt}:${w.title}`;
      if ((await d.workouts.where('importKey').equals(importKey).count()) > 0) {
        summary.skippedDuplicates++;
        continue;
      }
      const workoutId = newId();
      await d.workouts.add(workoutRow({ id: workoutId, title: w.title, startedAt: w.startedAt, endedAt: w.endedAt ?? w.startedAt, notes: w.notes, importKey, gymId }));
      summary.workouts++;

      const groupIds = new Map<string, string>();
      for (const key of new Set(w.exercises.map((e) => e.groupKey).filter((k): k is string => k != null))) {
        const size = w.exercises.filter((e) => e.groupKey === key).length;
        if (size < 2) continue;
        const gid = newId();
        groupIds.set(key, gid);
        await d.workoutGroups.add({ id: gid, workoutId, kind: groupKindFor(size), restMs: 90000, transitionMs: 0 });
      }

      const sets: WorkoutSetRow[] = [];
      for (const [order, e] of w.exercises.entries()) {
        const exerciseId = ids.get(e.name);
        if (!exerciseId) continue;
        const weId = newId();
        await d.workoutExercises.add(workoutExerciseRow({ id: weId, workoutId, exerciseId, order, note: e.notes, groupId: e.groupKey ? (groupIds.get(e.groupKey) ?? null) : null }));
        e.sets.forEach((s, i) => {
          sets.push(setRow({ id: newId(), workoutId, workoutExerciseId: weId, exerciseId, order: i, type: s.type, weightG: s.weightG, reps: s.reps, rpe: s.rpe, rir: s.rpe != null ? Math.max(0, 10 - s.rpe) : null, timeMs: s.timeMs, distanceM: s.distanceM, note: s.note, completedAt: w.startedAt + i }));
          summary.sets++;
        });
      }
      await d.workoutSets.bulkAdd(sets);
    }
  });
  return summary;
}
