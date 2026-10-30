// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { db as userDb, newId, tables, type AnalogDB } from '@/db/schema';
import { createExercise, getExercises } from '@/db/exercises';
import { addFeedback, addMeasurement, activeRun, ensureDefaultGym, saveGym, saveProgram, setMachineSetting, startRun } from '@/db/repos';
import { patchSettings, saveSettings, settings } from '@/db/settings';
import { skipSyncStamping } from '@/sync/stamp';
import { addExercise, completeSet, getWorkout, startWorkout, updateSet, updateWorkout, type NewSet } from '@/db/workouts';
import type { SetType } from '@/engine/setTypes';
import type { Segment } from '@/engine/types';
type DB = AnalogDB;
const db = userDb;
import { engineSettings, rounder } from '@/features/gym';
import { applyFinishedWorkout, sorenessQuestions, startProgramDay } from '@/services/programFlow';
import { TEMPLATES } from '@/services/templates';
import { finish } from '@/services/workoutFlow';

// Dev-only admin tools: wipe the app back to first run, or load the history of someone who has used it for months.
// Only reachable from the Admin screen, which exists in development builds only.

const DAY = 86_400_000;
const MIN = 60_000;
const kg = (n: number) => Math.round(n * 1000);

/** Wipe everything the user created. The bundled exercise library stays, like on a fresh install. */
export async function resetAll(d: DB = db): Promise<void> {
  const seedVersion = settings().seedVersion;
  await d.transaction('rw', [...tables(d), d.photoFiles, d.tombstones], async () => {
    skipSyncStamping();
    for (const t of [...tables(d), d.photoFiles, d.tombstones]) if (t.name !== 'exercises') await t.clear();
    await d.exercises.where('source').equals('custom').delete();
    await d.exercises.toCollection().modify({ hidden: false });
  });
  await saveSettings(d, { seedVersion });
  const gym = await ensureDefaultGym(d, settings().unit);
  await patchSettings({ defaultGymId: gym.id });
}

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where each lift starts the first time the engine has no history to go on. */
const START_KG: Record<string, number> = {
  Barbell_Squat: 70,
  'Barbell_Bench_Press_-_Medium_Grip': 52.5,
  Bent_Over_Barbell_Row: 50,
  Standing_Military_Press: 35,
  Barbell_Deadlift: 90,
  Seated_Cable_Rows: 45,
  Seated_Dumbbell_Press: 18,
  Barbell_Curl: 30,
  Triceps_Pushdown: 25,
  Romanian_Deadlift: 70,
  Leg_Extensions: 40,
  Standing_Calf_Raises: 60,
  Incline_Dumbbell_Press: 22,
  'Wide-Grip_Lat_Pulldown': 50,
  Side_Lateral_Raise: 8,
  Face_Pull: 20,
  Hammer_Curls: 12,
  'EZ-Bar_Skullcrusher': 25,
  Leg_Press: 120,
  Seated_Leg_Curl: 35,
  Barbell_Hip_Thrust: 80,
  'One-Arm_Dumbbell_Row': 24,
  Dumbbell_Bicep_Curl: 14,
};

interface RunPlan {
  templateKey: string;
  /** Days after the start of each week's first session. */
  offsets: number[];
  sessions: number;
  startDaysAgo: number;
}

/** Plays a program through the real engine: plan the day, log it with small ups and downs, finish, answer feedback. */
async function playRun(d: DB, rand: () => number, plan: RunPlan, now: number, bodyweightKg: (daysAgo: number) => number): Promise<void> {
  const template = TEMPLATES.find((t) => t.key === plan.templateKey)!;
  const start = startOfDay(now - plan.startDaysAgo * DAY);
  const program = template.build();
  await saveProgram(d, program, start);
  await startRun(d, program.id, start);
  const gymId = settings().defaultGymId;
  const unit = settings().unit;
  const roundFor = await rounder(d);

  for (let i = 0; i < plan.sessions; i++) {
    const week = Math.floor(i / plan.offsets.length);
    const t0 = start + (week * 7 + plan.offsets[i % plan.offsets.length]!) * DAY + 17.5 * 60 * MIN;
    const run = (await activeRun(d))!;
    const id = await startProgramDay(d, run, engineSettings(), roundFor, gymId, t0);
    if (!id) break;
    const full = (await getWorkout(d, id))!;
    const infos = await getExercises(d, full.exercises.map((e) => e.exerciseId));
    let clock = t0;
    for (const e of full.exercises) {
      const info = infos.get(e.exerciseId);
      for (const s of e.sets) {
        clock += (info?.defaultRestMs ?? 120000) * (0.6 + rand() * 0.3) + 40_000;
        if (info?.mode === 'time' || s.targetTimeMs != null) {
          await completeSet(d, s.id, { timeMs: (s.targetTimeMs ?? 30000) + Math.round(rand() * 9000), weightG: null }, clock);
          continue;
        }
        const bodyweight = info?.mode === 'bodyweight';
        const weightG = bodyweight ? null : (s.targetWeightG ?? kg(START_KG[e.exerciseId] ?? 20));
        const lo = s.targetReps ?? 8;
        const hi = s.targetRepsMax ?? lo;
        let reps = lo + Math.floor(rand() * (hi - lo + 1));
        if (s.type === 'amrap') reps += 2 + Math.floor(rand() * 3);
        else if (rand() < 0.1) reps = Math.max(1, reps - 1);
        await completeSet(d, s.id, { weightG, reps, rir: s.type === 'failure' ? 0 : (s.targetRir ?? 2) }, clock);
      }
    }
    const daysAgo = Math.round((now - t0) / DAY);
    await updateWorkout(d, id, { bodyweightG: kg(bodyweightKg(daysAgo)), sessionRpe: 7 + Math.round(rand() * 2) });
    const end = clock + 3 * MIN;
    await finish(d, id, unit, end);

    const after = (await getWorkout(d, id))!;
    if (run.program.blocks[run.state.blockIndex]?.adaptive) {
      for (const e of after.exercises) {
        await addFeedback(d, { workoutId: id, runId: run.id, muscle: null, exerciseId: e.exerciseId, slotId: e.slotId, kind: 'pump', value: String(1 + Math.floor(rand() * 3)) }, end);
        await addFeedback(d, { workoutId: id, runId: run.id, muscle: null, exerciseId: e.exerciseId, slotId: e.slotId, kind: 'pain', value: rand() < 0.07 ? 'some' : 'none' }, end);
      }
      const muscles = [...new Set([...(await getExercises(d, after.exercises.map((e) => e.exerciseId))).values()].flatMap((x) => x.primary))];
      for (const m of muscles) await addFeedback(d, { workoutId: id, runId: run.id, muscle: m, exerciseId: null, slotId: null, kind: 'workload', value: rand() < 0.75 ? 'right' : 'pushed' }, end);
      for (const m of await sorenessQuestions(d, id)) await addFeedback(d, { workoutId: id, runId: run.id, muscle: m, exerciseId: null, slotId: null, kind: 'soreness', value: rand() < 0.7 ? 'justInTime' : 'early' }, end);
    }
    await applyFinishedWorkout(d, id, engineSettings(), roundFor);
  }
}

function startOfDay(ms: number): number {
  const x = new Date(ms);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

interface SetSpec {
  type?: SetType;
  kg?: number;
  reps?: number;
  rir?: number;
  /** Segments as [reps, kg]; kg omitted means the set's own weight. */
  segs?: [number, number?][];
  seconds?: number;
  side?: 'L' | 'R';
}

/** A freestyle session (no program) that shows off set types. Returns the workout id. */
async function freeform(d: DB, daysAgo: number, now: number, title: string, lifts: { id: string; sets: SetSpec[] }[], bodyweightKg: number): Promise<string> {
  const t0 = startOfDay(now - daysAgo * DAY) + 18 * 60 * MIN;
  const id = await startWorkout(d, { title, gymId: settings().defaultGymId }, t0);
  let clock = t0;
  for (const lift of lifts) {
    const weId = await addExercise(d, id, lift.id, { sets: lift.sets.map((s): NewSet => ({ type: s.type ?? 'working', side: s.side })) });
    const row = (await getWorkout(d, id))!.exercises.find((e) => e.id === weId)!;
    for (const [i, set] of row.sets.entries()) {
      const spec = lift.sets[i]!;
      clock += 2.5 * MIN;
      const w = spec.kg != null ? kg(spec.kg) : null;
      const segments: Segment[] = (spec.segs ?? []).map(([reps, sw]) => ({ reps, weightG: sw != null ? kg(sw) : w, restMs: null }));
      const reps = segments.length ? segments.reduce((a, s) => a + (s.reps ?? 0), 0) : (spec.reps ?? null);
      await updateSet(d, set.id, { segments });
      await completeSet(d, set.id, { weightG: w, reps, rir: spec.type === 'failure' ? 0 : (spec.rir ?? null), timeMs: spec.seconds != null ? spec.seconds * 1000 : null }, clock);
    }
  }
  await updateWorkout(d, id, { bodyweightG: kg(bodyweightKg), sessionRpe: 8 });
  await finish(d, id, settings().unit, clock + 2 * MIN);
  return id;
}

/** Wipe, then load a lifter with ~4 months of history: three programs, every set type, PRs, feedback, measurements. */
export async function loadDemo(d: DB = db): Promise<void> {
  await resetAll(d);
  await patchSettings({ disclaimerAccepted: true, onboarded: true, onboardingVersion: 1 });
  const now = Date.now();
  const rand = rng(20260529);
  const bw = (daysAgo: number) => 78 + (115 - daysAgo) * 0.025 + Math.sin(daysAgo / 3) * 0.3;

  // Gyms and kit notes.
  const defaultGym = await ensureDefaultGym(d, settings().unit);
  await saveGym(d, { id: newId(), name: 'Home garage', unit: 'kg', barG: 20000, plates: [20000, 10000, 5000, 2500, 1250].map((w) => ({ weightG: w, count: 4 })), dumbbellsG: [], kettlebellsG: [], machineStepG: 5000, equipment: [], isDefault: false });
  await setMachineSetting(d, 'Leg_Press', defaultGym.id, 'Seat 4, back 3, feet mid-high', now - 100 * DAY);
  await setMachineSetting(d, 'Seated_Leg_Curl', defaultGym.id, 'Pad on 5, seat back 2', now - 100 * DAY);
  await createExercise(d, { name: 'Kneeling cable crunch (my version)', primary: ['abs'], equipment: 'cable' }, now - 60 * DAY);

  // 1. Beginner linear: 8 weeks, three a week.
  await playRun(d, rand, { templateKey: 'fullbody-3-linear', offsets: [0, 2, 4], sessions: 24, startDaysAgo: 115 }, now, bw);
  // 2. A full hypertrophy mesocycle with a deload: adaptive volume, feedback, an end-of-meso report.
  await playRun(d, rand, { templateKey: 'upper-lower-4-adaptive', offsets: [0, 1, 3, 4], sessions: 20, startDaysAgo: 58 }, now, bw);
  // 3. Powerbuilding, still running: the Log tab shows what's next.
  await playRun(d, rand, { templateKey: 'powerbuilding-topset', offsets: [0, 1, 3, 4], sessions: 12, startDaysAgo: 20 }, now, bw);

  // Freestyle sessions between program days: every set type has a home.
  await freeform(d, 15, now, 'Arms: intensity techniques', [
    { id: 'Dumbbell_Bicep_Curl', sets: [{ type: 'warmup', kg: 8, reps: 12 }, { kg: 14, reps: 10, rir: 2 }, { type: 'drop', kg: 14, segs: [[10], [8, 10], [8, 6]] }] },
    { id: 'Triceps_Pushdown', sets: [{ type: 'warmup', kg: 15, reps: 12 }, { type: 'myo', kg: 30, segs: [[15], [5], [4], [4]] }, { type: 'myoMatch', kg: 25, segs: [[12], [12], [12]] }] },
    { id: 'Hammer_Curls', sets: [{ type: 'restPause', kg: 16, segs: [[10], [4], [3]] }, { type: 'failure', kg: 12, reps: 14 }] },
    { id: 'Side_Lateral_Raise', sets: [{ type: 'mechDrop', kg: 10, segs: [[12], [10, 8], [8, 5]] }, { type: 'technique', kg: 4, reps: 15 }] },
  ], bw(15));
  await freeform(d, 11, now, 'Heavy bench', [
    { id: 'Barbell_Bench_Press_-_Medium_Grip', sets: [{ type: 'warmup', kg: 40, reps: 8 }, { type: 'warmup', kg: 60, reps: 5 }, { type: 'feeder', kg: 85, reps: 1 }, { type: 'top', kg: 100, reps: 3, rir: 1 }, { type: 'backoff', kg: 85, reps: 6, rir: 2 }, { type: 'backoff', kg: 85, reps: 6, rir: 1 }, { type: 'amrap', kg: 75, reps: 14 }] },
    { id: 'One-Arm_Dumbbell_Row', sets: [{ kg: 30, reps: 10, side: 'L' }, { kg: 30, reps: 10, side: 'R' }, { kg: 30, reps: 9, side: 'L' }, { kg: 30, reps: 9, side: 'R' }] },
  ], bw(11));
  await freeform(d, 8, now, 'Legs: pyramids and waves', [
    { id: 'Barbell_Squat', sets: [{ type: 'pyramid', kg: 80, reps: 10 }, { type: 'pyramid', kg: 95, reps: 6 }, { type: 'pyramid', kg: 110, reps: 3 }, { type: 'cluster', kg: 100, segs: [[2], [2], [2], [2]] }] },
    { id: 'Leg_Press', sets: [{ type: 'reversePyramid', kg: 200, reps: 6 }, { type: 'reversePyramid', kg: 170, reps: 9 }, { type: 'reversePyramid', kg: 140, reps: 12 }] },
    { id: 'Barbell_Deadlift', sets: [{ type: 'wave', kg: 120, segs: [[3], [2], [1]] }, { type: 'wave', kg: 125, segs: [[3], [2], [1]] }] },
    { id: 'Leg_Extensions', sets: [{ type: 'failure', kg: 55, reps: 15 }, { type: 'drop', kg: 55, segs: [[12], [10, 40], [10, 25]] }] },
  ], bw(8));
  await freeform(d, 4, now, 'Core, hangs and tempo', [
    { id: 'Plank', sets: [{ type: 'isometric', seconds: 60 }, { type: 'amtap', seconds: 95 }] },
    { id: 'Pullups', sets: [{ type: 'negative', reps: 5 }, { type: 'emom', segs: [[3], [3], [3], [3], [2]] }, { type: 'amrap', reps: 11 }] },
    { id: 'Hanging_Leg_Raise', sets: [{ reps: 12, rir: 2 }, { reps: 11, rir: 1 }, { type: 'failure', reps: 9 }] },
  ], bw(4));

  // Body measurements, weekly, trending slowly.
  for (let w = 16; w >= 0; w--) {
    const date = now - w * 7 * DAY;
    await addMeasurement(d, 'bodyweight', kg(bw(w * 7)), date);
    await addMeasurement(d, 'waist', Math.round(840 - (16 - w) * 1.5 + rand() * 4), date);
    if (w % 4 === 0) {
      await addMeasurement(d, 'arm', Math.round(335 + (16 - w) * 1.2), date);
      await addMeasurement(d, 'chest', Math.round(1005 + (16 - w) * 1.5), date);
      await addMeasurement(d, 'thigh', Math.round(585 + (16 - w) * 1.4), date);
    }
  }
}

/** Counts for the Admin screen. */
export async function dataCounts(d: DB = db): Promise<{ workouts: number; sets: number; programs: number; prs: number }> {
  return { workouts: await d.workouts.count(), sets: await d.workoutSets.count(), programs: await d.programs.count(), prs: await d.prs.count() };
}
