// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { syncSeed } from './exercises';
import { seedHistory, testDb } from './testing';
import { historyPage, previousPerformance, startWorkout } from './workouts';

// The performance gate from the rebuild prompt: 20,800 finished workouts and 416,000 ticked sets (anaLOG 0.1.0's
// STATUS.md quotes these numbers; its own test seeded 1,040 workouts and 20,800 sets, so this one is 20× bigger).
// The two reads that run on every History visit and every exercise added to a workout must each stay under 500 ms.

const WORKOUTS = 20_800;
const FIVE_YEARS = 5 * 365 * 86_400_000;

describe('five years of history', () => {
  it(
    'pages history and finds last time in under 500 ms each',
    async () => {
      const db = testDb();
      await syncSeed(db, [{ id: 'Barbell_Squat', name: 'Barbell Squat', primary: ['quads'], equipment: 'barbell' }]);
      await seedHistory(db, 'Barbell_Squat', WORKOUTS, 20, 2000, Math.floor(FIVE_YEARS / WORKOUTS));
      expect(await db.workouts.count()).toBe(20_800);
      expect(await db.workoutSets.count()).toBe(416_000);
      const open = await startWorkout(db, { title: 'Today' });

      let t0 = performance.now();
      const page = await historyPage(db, null, 30);
      const pageMs = performance.now() - t0;

      t0 = performance.now();
      const prev = await previousPerformance(db, 'Barbell_Squat', open);
      const prevMs = performance.now() - t0;

      // Second page, keyset-paged from the first.
      t0 = performance.now();
      const page2 = await historyPage(db, page[page.length - 1]!.startedAt, 30);
      const page2Ms = performance.now() - t0;

      console.info(`[perf] history page ${pageMs.toFixed(0)} ms, next page ${page2Ms.toFixed(0)} ms, previous performance ${prevMs.toFixed(0)} ms`);
      expect(page).toHaveLength(30);
      expect(page2).toHaveLength(30);
      expect(page2[0]!.startedAt).toBeLessThan(page[29]!.startedAt);
      expect(prev).toHaveLength(20);
      expect(pageMs).toBeLessThan(500);
      expect(page2Ms).toBeLessThan(500);
      expect(prevMs).toBeLessThan(500);
    },
    1_200_000,
  );
});
