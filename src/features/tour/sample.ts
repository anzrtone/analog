// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { syncSeed, type SeedExercise } from '@/db/exercises';
import { addMeasurement } from '@/db/repos';
import type { AnalogDB } from '@/db/schema';
import { addExercise, completeSet, getWorkout, startWorkout, updateWorkout, type NewSet } from '@/db/workouts';
import type { SetType } from '@/engine/setTypes';
import { finish } from '@/services/workoutFlow';

// Four weeks of believable training for the tour's History and Stats pages. It goes into a throwaway database,
// never the user's. Built from today's date alone, so the same day always gives the same sample.

const DAY = 86_400_000;
const MIN = 60_000;
const kg = (n: number) => Math.round(n * 1000);

interface Lift {
  id: string;
  /** Working weight in week 1 (kg); 0 for bodyweight. */
  base: number;
  sets: { type?: SetType; pct?: number; reps: number; rir?: number }[];
}

const work = (n: number, reps: number, rir = 2) => Array.from({ length: n }, () => ({ reps, rir }));

const SESSIONS: { title: string; lifts: Lift[] }[] = [
  {
    title: 'Push',
    lifts: [
      { id: 'Barbell_Bench_Press_-_Medium_Grip', base: 70, sets: [{ type: 'warmup', pct: 0.5, reps: 10 }, { type: 'top', reps: 5, rir: 1 }, { type: 'backoff', pct: 0.85, reps: 8 }, { type: 'backoff', pct: 0.85, reps: 8 }] },
      { id: 'Incline_Dumbbell_Press', base: 24, sets: work(3, 10) },
      { id: 'Side_Lateral_Raise', base: 10, sets: [...work(2, 15), { type: 'drop', reps: 12, rir: 0 }] },
      { id: 'Triceps_Pushdown', base: 30, sets: work(3, 12) },
    ],
  },
  {
    title: 'Pull',
    lifts: [
      { id: 'Barbell_Deadlift', base: 120, sets: [{ type: 'warmup', pct: 0.5, reps: 5 }, ...work(3, 5)] },
      { id: 'Pullups', base: 0, sets: [...work(2, 8), { type: 'amrap', reps: 10 }] },
      { id: 'Seated_Cable_Rows', base: 55, sets: work(3, 10) },
      { id: 'Barbell_Curl', base: 30, sets: work(3, 10) },
    ],
  },
  {
    title: 'Legs',
    lifts: [
      { id: 'Barbell_Squat', base: 95, sets: [{ type: 'warmup', pct: 0.5, reps: 8 }, ...work(3, 6)] },
      { id: 'Romanian_Deadlift', base: 80, sets: work(3, 8) },
      { id: 'Leg_Press', base: 160, sets: work(3, 12) },
      { id: 'Standing_Calf_Raises', base: 70, sets: work(3, 15) },
    ],
  },
];

export const SAMPLE_EXERCISE_IDS = [...new Set(SESSIONS.flatMap((s) => s.lifts.map((l) => l.id)))];

/** Days ago of each session: three a week for four weeks, with one today so this week has numbers. */
const DAYS_AGO = [25, 23, 21, 18, 16, 14, 11, 9, 7, 4, 2, 0];

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (x: number, step = 2.5) => Math.round(x / step) * step;

/** Fill an empty, migrated database with the sample. `exercises` must include SAMPLE_EXERCISE_IDS. Returns the workout in progress. */
export async function buildSample(db: AnalogDB, exercises: SeedExercise[], now = Date.now()): Promise<{ workoutId: string }> {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const rand = rng(today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate());
  await syncSeed(db, exercises.filter((e) => SAMPLE_EXERCISE_IDS.includes(e.id)), now);

  for (const [k, daysAgo] of DAYS_AGO.entries()) {
    const week = Math.floor(k / 3);
    const session = SESSIONS[k % 3]!;
    // Today's session started a couple of hours ago; earlier ones in the evening.
    const t0 = daysAgo === 0 ? now - 2 * 60 * MIN : today.getTime() - daysAgo * DAY + (17 + Math.floor(rand() * 3)) * 60 * MIN;
    const id = await startWorkout(db, { title: session.title }, t0);
    let clock = t0;
    for (const lift of session.lifts) {
      // Weights creep up week to week, so the later sessions set PRs.
      const w = lift.base ? round(lift.base * (1 + week * 0.03)) : 0;
      const weId = await addExercise(db, id, lift.id, { sets: lift.sets.map((s): NewSet => ({ type: s.type ?? 'working' })) });
      const rows = (await getWorkout(db, id))!.exercises.find((e) => e.id === weId)!.sets;
      for (const [i, row] of rows.entries()) {
        const spec = lift.sets[i]!;
        clock += (2 + rand() * 1.5) * MIN;
        const reps = Math.max(1, spec.reps + (spec.type === 'amrap' ? week : 0) - (rand() < 0.15 ? 1 : 0));
        const weightG = w ? kg(round(w * (spec.pct ?? 1), lift.base < 40 ? 1 : 2.5)) : null;
        await completeSet(db, row.id, { weightG, reps, rir: spec.type === 'drop' || spec.type === 'amrap' ? 0 : (spec.rir ?? null) }, clock);
      }
    }
    await updateWorkout(db, id, { sessionRpe: 7 + Math.round(rand() * 2) });
    await finish(db, id, 'kg', clock + 3 * MIN);
  }

  for (let w = 6; w >= 0; w--) await addMeasurement(db, 'bodyweight', kg(78.4 + (6 - w) * 0.15 + rand() * 0.4), today.getTime() - w * 7 * DAY);
  return { workoutId: await inProgress(db, now) };
}

/**
 * A workout half done, for the tour's workout pages: a warm-up, a top set and a back-off ticked, the next back-off
 * waiting with the engine's target, and a second exercise still to come.
 */
async function inProgress(db: AnalogDB, now: number): Promise<string> {
  const t0 = now - 25 * MIN;
  const id = await startWorkout(db, { title: 'Upper body' }, t0);
  const bench = await addExercise(db, id, 'Barbell_Bench_Press_-_Medium_Grip', {
    explanation: '+2.5 kg · hit 5 reps at 1 RIR last time',
    sets: [
      { type: 'warmup', targetWeightG: kg(40), targetReps: 10 },
      { type: 'top', targetWeightG: kg(82.5), targetReps: 5, targetRir: 1 },
      { type: 'backoff', targetWeightG: kg(70), targetReps: 8, targetRir: 2 },
      { type: 'backoff', targetWeightG: kg(70), targetReps: 8, targetRir: 2 },
    ],
  });
  await addExercise(db, id, 'Seated_Cable_Rows', { explanation: 'same weight · aim for 12 reps', sets: Array.from({ length: 3 }, () => ({ targetWeightG: kg(60), targetReps: 10, targetRepsMax: 12, targetRir: 2 })) });
  const sets = (await getWorkout(db, id))!.exercises.find((e) => e.id === bench)!.sets;
  const logged: [number, number, number | null][] = [
    [40, 10, null],
    [82.5, 5, 1],
    [70, 8, 2],
  ];
  for (const [i, [w, reps, rir]] of logged.entries()) await completeSet(db, sets[i]!.id, { weightG: kg(w), reps, rir }, t0 + (4 + i * 4) * MIN);
  return id;
}
