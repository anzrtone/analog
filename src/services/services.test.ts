// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import seedFile from '@/assets/seed.json';
import { syncSeed, type SeedExercise } from '@/db/exercises';
import { activeRun, addFeedback, deleteProgram, getRun, listPrograms, loadLandmarks, prsForWorkout, saveProgram, startRun } from '@/db/repos';
import type { AnalogDB } from '@/db/schema';
import { testDb } from '@/db/testing';
import { activeWorkout, addExercise, addSet, completeSet, getWorkout, startWorkout, groupExercises, tidyEditedWorkout, updateSet } from '@/db/workouts';
import type { EngineSettings } from '@/engine/progression';
import { applyFinishedWorkout, planDay, sorenessQuestions, startProgramDay } from './programFlow';
import { TEMPLATES } from './templates';
import { canUndoFinish, reopenFinished, snapshotBeforeFinish } from './undoFinish';
import { afterSet, finish, summarise } from './workoutFlow';

const seed = (seedFile as unknown as { exercises: (SeedExercise & { checked: boolean })[] }).exercises.map(({ checked: _c, ...e }) => e);
const settings: Omit<EngineSettings, 'incrementG' | 'mesoRir'> = { unit: 'kg', round: (g) => Math.round(g / 2500) * 2500, maxJumpPct: 0.1 };
const round = (g: number) => Math.round(g / 2500) * 2500;

async function db(): Promise<AnalogDB> {
  const d = testDb();
  await syncSeed(d, seed);
  return d;
}

/** Tick every set at its target (or `fallbackG` when there's no target yet). */
async function doWorkout(d: AnalogDB, workoutId: string, at: number, fallbackG = 50000, repsDelta = 0) {
  const full = (await getWorkout(d, workoutId))!;
  let t = at;
  for (const e of full.exercises) for (const s of e.sets) await completeSet(d, s.id, { weightG: s.targetWeightG ?? fallbackG, reps: (s.targetReps ?? 8) + repsDelta, rir: s.targetRir ?? 2, timeMs: s.targetTimeMs }, (t += 60000));
  await finish(d, workoutId, 'kg', t + 60000);
}

describe('editing a finished workout', () => {
  const BENCH = 'Barbell_Bench_Press_-_Medium_Grip';
  const DAY = 86_400_000;
  async function bench(d: AnalogDB, day: number, kgs: number): Promise<string> {
    const id = await startWorkout(d, { title: `Bench ${day}` }, day * DAY);
    await addExercise(d, id, BENCH, { sets: [{ type: 'working' as const, targetWeightG: kgs * 1000, targetReps: 5 }] });
    const full = (await getWorkout(d, id))!;
    for (const st of full.exercises[0]!.sets) await completeSet(d, st.id, { weightG: st.targetWeightG, reps: st.targetReps, rir: 2 }, day * DAY + 60_000);
    await finish(d, id, 'kg', day * DAY + 3_600_000);
    return id;
  }

  it("keeps an older workout's PRs when a later one lifted more", async () => {
    const d = await db();
    await bench(d, 5, 90);
    const mid = await bench(d, 10, 100);
    await bench(d, 20, 120);
    await summarise(d, mid, 'kg', true);
    expect((await prsForWorkout(d, mid)).length).toBeGreaterThan(0);
  });

  it('removes unticked sets and exercises left empty when editing is done, and takes a changed weight', async () => {
    const d = await db();
    const id = await bench(d, 10, 100);
    const full = (await getWorkout(d, id))!;
    const we = full.exercises[0]!;
    await updateSet(d, we.sets[0]!.id, { weightG: 110000 });
    const extra = await addSet(d, we.id, { weightG: 90000, reps: 8 });
    await tidyEditedWorkout(d, id);
    const after = (await getWorkout(d, id))!;
    expect(after.exercises[0]!.sets.map((x) => x.weightG)).toEqual([110000]);
    expect(after.exercises[0]!.sets.some((x) => x.id === extra)).toBe(false);

    const lone = await addExercise(d, id, 'Plank', { sets: [{ type: 'working' as const }] });
    await tidyEditedWorkout(d, id);
    expect((await getWorkout(d, id))!.exercises.some((e) => e.id === lone)).toBe(false);
  });
});

describe('undoing Finish', () => {
  async function finishedProgramDay(d: AnalogDB, t: number) {
    const p = TEMPLATES[0]!.build();
    await saveProgram(d, p);
    await startRun(d, p.id);
    const run = (await activeRun(d))!;
    const id = (await startProgramDay(d, run, settings, round, null, t))!;
    const full = (await getWorkout(d, id))!;
    // Tick everything but the last set of the first exercise.
    const sets = full.exercises.flatMap((e) => e.sets);
    const skipped = sets[sets.length - 1]!;
    for (const st of sets) if (st.id !== skipped.id) await completeSet(d, st.id, { weightG: st.targetWeightG ?? 60000, reps: st.targetReps ?? 5, rir: 2 }, t + 60000);
    const before = JSON.stringify((await activeRun(d))!.state);
    await snapshotBeforeFinish(d, id);
    await finish(d, id, 'kg', t + 3_600_000);
    await applyFinishedWorkout(d, id, settings, round);
    return { id, skipped, before };
  }

  it('reopens the workout with its unticked set and the run where it was', async () => {
    const d = await db();
    const { id, skipped, before } = await finishedProgramDay(d, Date.UTC(2026, 0, 5, 18));
    expect(JSON.stringify((await activeRun(d))!.state)).not.toBe(before);
    expect((await getWorkout(d, id))!.exercises.flatMap((e) => e.sets).some((x) => x.id === skipped.id)).toBe(false);
    expect(await canUndoFinish(d, id)).toBe(true);

    expect(await reopenFinished(d, id)).toBe(true);
    const back = (await getWorkout(d, id))!;
    expect(back.workout.endedAt).toBeNull();
    expect((await activeWorkout(d))?.id).toBe(id);
    expect(back.exercises.flatMap((e) => e.sets).some((x) => x.id === skipped.id && x.completedAt == null)).toBe(true);
    expect(JSON.stringify((await activeRun(d))!.state)).toBe(before);
    expect((await prsForWorkout(d, id)).length).toBe(0);
    // It can be finished again the normal way, and the snapshot is gone.
    expect(await canUndoFinish(d, id)).toBe(false);
  });

  it('stays finished once another workout has been logged', async () => {
    const d = await db();
    const { id } = await finishedProgramDay(d, Date.UTC(2026, 0, 5, 18));
    await startWorkout(d, { title: 'Later' }, Date.UTC(2026, 0, 7, 18));
    expect(await canUndoFinish(d, id)).toBe(false);
    expect(await reopenFinished(d, id)).toBe(false);
  });
});

describe('deleting a program', () => {
  it('hides it from the list, ends its run, and leaves finished workouts alone', async () => {
    const d = await db();
    const p = TEMPLATES[0]!.build();
    await saveProgram(d, p);
    await startRun(d, p.id);
    const other = TEMPLATES[1]!.build();
    await saveProgram(d, other);
    expect(await listPrograms(d)).toHaveLength(2);
    await deleteProgram(d, p.id);
    expect((await listPrograms(d)).map((x) => x.id)).toEqual([other.id]);
    expect(await activeRun(d)).toBeNull();
    await deleteProgram(d, other.id);
    expect(await listPrograms(d)).toHaveLength(0);
  });
});

describe('templates', () => {
  it('only reference exercises that exist in the library', () => {
    const ids = new Set(seed.map((e) => e.id));
    for (const t of TEMPLATES) for (const b of t.build().blocks) for (const dd of b.days) for (const s of dd.slots) expect(ids.has(s.exerciseId)).toBe(true);
  });
  it('never use branded program names', () => {
    for (const t of TEMPLATES) expect(t.name).not.toMatch(/5\/3\/1|RP|Nippard|Starting Strength|StrongLifts|PPL|GZCL/i);
  });
});

describe('linear program run', () => {
  it('adds weight session to session and explains why', async () => {
    const d = await db();
    const p = TEMPLATES[0]!.build();
    await saveProgram(d, p);
    await startRun(d, p.id);
    let t = Date.UTC(2026, 0, 5, 18);
    const squatLoads: (number | null)[] = [];
    for (let i = 0; i < 4; i++) {
      const run = (await activeRun(d))!;
      const id = (await startProgramDay(d, run, settings, round, null, t))!;
      const squat = (await getWorkout(d, id))!.exercises[0]!;
      squatLoads.push(squat.sets[0]!.targetWeightG);
      if (i > 0) expect(squat.explanation).toBe('+2.5 kg · hit 3 × 5 last time');
      await doWorkout(d, id, t, 60000);
      await applyFinishedWorkout(d, id, settings, round);
      t += 2 * 86400000;
    }
    expect(squatLoads).toEqual([null, 62500, 65000, 67500]);
  });
});

describe('adaptive mesocycle run', () => {
  it('runs 4 weeks + deload, adapts sets from feedback and writes the meso report', async () => {
    const d = await db();
    const p = TEMPLATES[1]!.build();
    await saveProgram(d, p);
    await startRun(d, p.id);
    let t = Date.UTC(2026, 0, 5, 18);
    const metas: string[] = [];
    let report = null as Awaited<ReturnType<typeof applyFinishedWorkout>> | null;
    let firstWeekCards: string[] = [];
    for (let week = 0; week < 5; week++) {
      for (let dayIdx = 0; dayIdx < 4; dayIdx++) {
        const run = (await activeRun(d))!;
        metas.push((await planDay(d, run, settings, round))!.meta);
        const id = (await startProgramDay(d, run, settings, round, null, t))!;
        if (week > 0 && dayIdx === 0) expect((await sorenessQuestions(d, id)).length).toBeGreaterThan(0);
        await doWorkout(d, id, t);
        // Good recovery all meso: pump 2, no pain, workload just right, healed early.
        const full = (await getWorkout(d, id))!;
        for (const e of full.exercises) {
          await addFeedback(d, { workoutId: id, runId: run.id, muscle: null, exerciseId: e.exerciseId, slotId: e.slotId, kind: 'pump', value: '2' }, t + 1);
          await addFeedback(d, { workoutId: id, runId: run.id, muscle: null, exerciseId: e.exerciseId, slotId: e.slotId, kind: 'pain', value: 'none' }, t + 1);
        }
        for (const m of ['chest', 'upperBack', 'quads', 'hamstrings', 'biceps', 'triceps', 'sideDelts', 'rearDelts', 'frontDelts', 'calves', 'glutes', 'abs'] as const) {
          await addFeedback(d, { workoutId: id, runId: run.id, muscle: m, exerciseId: null, slotId: null, kind: 'workload', value: 'right' }, t + 2);
          await addFeedback(d, { workoutId: id, runId: run.id, muscle: m, exerciseId: null, slotId: null, kind: 'soreness', value: 'early' }, t + 2);
        }
        const out = (await applyFinishedWorkout(d, id, settings, round))!;
        if (week === 0 && dayIdx === 3) firstWeekCards = out.cards;
        if (out.mesoReport) report = out;
        t += 86400000;
      }
      t += 3 * 86400000;
    }
    expect(metas[0]).toBe('UPPER A — W1/5 — 3 RIR');
    expect(metas[4]).toBe('UPPER A — W2/5 — 2 RIR');
    expect(metas[12]).toBe('UPPER A — W4/5 — 0 RIR');
    expect(metas[16]).toBe('UPPER A — W5/5 — DELOAD');
    expect(firstWeekCards.length).toBeGreaterThan(0);
    expect(firstWeekCards.some((c) => /\+\d sets? \(/.test(c))).toBe(true);
    expect(report?.mesoReport?.headline).toMatch(/^4 weeks done\./);
    expect((await getRun(d, (await activeRun(d))!.id))!.state).toMatchObject({ weekIndex: 0, dayIndex: 0, mesosDone: 1 });
    expect(Object.keys(await loadLandmarks(d))).toHaveLength(21);
  }, 120_000);
});

describe('group-aware rest', () => {
  it('goes A1 → A2 without rest, then rests', async () => {
    const d = await db();
    const w = await startWorkout(d, { title: 'x' });
    const a = await addExercise(d, w, 'Barbell_Curl', { sets: [{ targetWeightG: 30000, targetReps: 10 }, { targetWeightG: 30000, targetReps: 10 }] });
    const b = await addExercise(d, w, 'Triceps_Pushdown', { sets: [{ targetWeightG: 25000, targetReps: 12 }, { targetWeightG: 25000, targetReps: 12 }] });
    await groupExercises(d, w, [a, b], 'superset', 90000);
    const full = (await getWorkout(d, w))!;
    const first = await afterSet(d, full, full.exercises[0]!.sets[0]!.id, 'kg', 120000);
    expect(first).toMatchObject({ restMs: 0, label: 'next: Triceps Pushdown 25 × 12' });
    const second = await afterSet(d, full, full.exercises[1]!.sets[0]!.id, 'kg', 120000);
    expect(second).toMatchObject({ restMs: 90000, label: 'next: Barbell Curl 30 × 10' });
  });
});
