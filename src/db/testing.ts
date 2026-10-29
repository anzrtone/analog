// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { AnalogDB, type WorkoutExerciseRow, type WorkoutRow, type WorkoutSetRow } from './schema';
import { setRow, workoutExerciseRow, workoutRow } from './workouts';

let n = 0;

/** A fresh, empty database for a test (fake-indexeddb in Vitest). */
export function testDb(): AnalogDB {
  return new AnalogDB(`analog-test-${++n}-${Math.random().toString(36).slice(2)}`);
}

/**
 * Years of training straight into the tables with bulk writes (the repo calls are far too slow for 400,000 sets
 * under fake-indexeddb). `sessions` finished workouts, one every spacingMs (a day by default), each with `sets` ticked sets of one exercise.
 */
export async function seedHistory(d: AnalogDB, exerciseId: string, sessions: number, sets: number, chunk = 500, spacingMs = 86_400_000): Promise<void> {
  const step = spacingMs;
  for (let from = 0; from < sessions; from += chunk) {
    const workouts: WorkoutRow[] = [];
    const exercises: WorkoutExerciseRow[] = [];
    const rows: WorkoutSetRow[] = [];
    for (let i = from; i < Math.min(sessions, from + chunk); i++) {
      const id = `w${i}`;
      workouts.push(workoutRow({ id, title: `W${i}`, startedAt: i * step, endedAt: i * step + 3_600_000 }));
      exercises.push(workoutExerciseRow({ id: `we${i}`, workoutId: id, exerciseId, order: 0 }));
      for (let s = 0; s < sets; s++) rows.push(setRow({ id: `s${i}-${s}`, workoutId: id, workoutExerciseId: `we${i}`, exerciseId, order: s, weightG: 100000, reps: 5, completedAt: i * step + s }));
    }
    await d.transaction('rw', d.workouts, d.workoutExercises, d.workoutSets, async () => {
      await d.workouts.bulkAdd(workouts);
      await d.workoutExercises.bulkAdd(exercises);
      await d.workoutSets.bulkAdd(rows);
    });
  }
}

/**
 * Count the workoutSets rows a piece of code reads, through Dexie's middleware. The IndexedDB version of 0.1.0's
 * "no full scans" query-plan test: every set ever logged is the big table, so hot paths must read only a few.
 */
export function countSetReads(d: AnalogDB): { reads: () => number; reset: () => void } {
  let reads = 0;
  d.use({
    stack: 'dbcore',
    name: 'count-set-reads',
    create: (down) => ({
      ...down,
      table: (name) => {
        const t = down.table(name);
        if (name !== 'workoutSets') return t;
        return {
          ...t,
          get: (req) => {
            reads++;
            return t.get(req);
          },
          getMany: (req) => {
            reads += req.keys.length;
            return t.getMany(req);
          },
          query: async (req) => {
            const r = await t.query(req);
            reads += r.result.length;
            return r;
          },
          openCursor: async (req) => {
            const c = await t.openCursor(req);
            if (!c) return c;
            const start = c.start.bind(c);
            c.start = (onNext) =>
              start(() => {
                reads++;
                onNext();
              });
            return c;
          },
        };
      },
    }),
  });
  return { reads: () => reads, reset: () => void (reads = 0) };
}
