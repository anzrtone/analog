// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { readFileSync } from 'node:fs';
import { parseStrong } from '@/engine/import/csv';
import { checkBackup, exportAll, restoreAll } from './backup';
import { createExercise, getExercise, listExercises, searchExercises, sessionCounts, setHidden, setStickyNote, syncSeed, updateExercise, type SeedExercise } from './exercises';
import { commitImport } from './importer';
import { activeRun, ensureDefaultGym, getProgram, loadLandmarks, recordPrs, saveLandmark, saveProgram, startRun, saveRunState } from './repos';
import { loadSettings, saveSetting } from './settings';
import { countSetReads, seedHistory, testDb } from './testing';
import { activeWorkout, addExercise, addSet, completeSet, exerciseHistory, finishWorkout, getWorkout, groupExercises, hasHistory, historyPage, prBaseline, previousPerformance, setsBetween, startWorkout, swapExercise, toLoggedSet, updateSet } from './workouts';
import { DEFAULT_MESO, emptyRunState } from '@/engine/programs/types';
import { detectPrs } from '@/engine/prs/detect';
import type { SetType } from '@/engine/setTypes';

const seed: SeedExercise[] = [
  { id: 'Barbell_Bench_Press', name: 'Barbell Bench Press', aliases: [], primary: ['chest'], secondary: ['triceps'], equipment: 'barbell', mode: 'weightReps', unilateral: false, instructions: [], image: null, category: 'strength' },
  { id: 'Barbell_Squat', name: 'Barbell Squat', aliases: [], primary: ['quads'], secondary: ['glutes'], equipment: 'barbell', mode: 'weightReps', unilateral: false, instructions: [], image: null, category: 'strength' },
];

describe('exercises', () => {
  it('seeds, overrides and hides without losing edits on re-seed', async () => {
    const db = testDb();
    expect(await syncSeed(db, seed)).toBe(2);
    await updateExercise(db, 'Barbell_Bench_Press', { name: 'Bench (comp grip)', secondaryCredit: 0.25 });
    await setStickyNote(db, 'Barbell_Bench_Press', 'elbows tucked');
    await syncSeed(db, [{ ...seed[0]!, name: 'Barbell Bench Press v2' }, seed[1]!]);
    const e = (await getExercise(db, 'Barbell_Bench_Press'))!;
    expect(e).toMatchObject({ name: 'Bench (comp grip)', secondaryCredit: 0.25, stickyNote: 'elbows tucked', edited: true });
    await setHidden(db, 'Barbell_Squat', true);
    expect((await listExercises(db)).map((x) => x.id)).toEqual(['Barbell_Bench_Press']);
    expect(await listExercises(db, { includeHidden: true })).toHaveLength(2);
  });
  it('creates unlimited custom exercises and searches them', async () => {
    const db = testDb();
    await syncSeed(db, seed);
    for (let i = 0; i < 50; i++) await createExercise(db, { name: `Custom move ${i}`, primary: ['neckFlexors'], equipment: 'other', mode: 'reps' });
    const all = await listExercises(db);
    expect(all).toHaveLength(52);
    expect(searchExercises(all, 'bench')[0]!.id).toBe('Barbell_Bench_Press');
    expect(searchExercises(all, 'move 4').length).toBeGreaterThan(0);
  });
});

describe('workout logging', () => {
  it('writes each set the moment it is ticked and resumes an interrupted workout', async () => {
    const db = testDb();
    await syncSeed(db, seed);
    const w = await startWorkout(db, { title: 'Push A' }, 1000);
    const we = await addExercise(db, w, 'Barbell_Bench_Press', { sets: [{ targetWeightG: 80000, targetReps: 5 }, { targetWeightG: 80000, targetReps: 5 }] });
    const sets = (await getWorkout(db, w))!.exercises[0]!.sets;
    await completeSet(db, sets[0]!.id, { weightG: 80000, reps: 5, rir: 2 }, 2000);
    await updateSet(db, sets[1]!.id, { weightG: 82500 });

    // "Crash": close the database and open it again from disk; everything is there.
    db.close();
    await db.open();
    expect((await activeWorkout(db))!.id).toBe(w);
    const again = (await getWorkout(db, w))!;
    expect(again.exercises[0]!.sets.map((s) => [s.weightG, s.completedAt])).toEqual([
      [80000, 2000],
      [82500, null],
    ]);
    await addSet(db, we, { type: 'warmup', weightG: 40000 }, 0);
    expect((await getWorkout(db, w))!.exercises[0]!.sets.map((s) => s.type)).toEqual(['warmup', 'working', 'working']);

    await finishWorkout(db, w, 5000);
    expect(await activeWorkout(db)).toBeNull();
    expect((await getWorkout(db, w))!.exercises[0]!.sets).toHaveLength(1);
  });

  it('shows previous performance from the last finished session', async () => {
    const db = testDb();
    await syncSeed(db, seed);
    for (const [i, kg] of [
      [1, 80],
      [2, 82.5],
    ] as const) {
      const w = await startWorkout(db, { title: 'Push' }, i * 100000);
      await addExercise(db, w, 'Barbell_Bench_Press', { sets: [{}] });
      await completeSet(db, (await getWorkout(db, w))!.exercises[0]!.sets[0]!.id, { weightG: kg * 1000, reps: 8 }, i * 100000 + 1);
      await finishWorkout(db, w, i * 100000 + 2);
    }
    const now = await startWorkout(db, { title: 'Push' }, 300000);
    expect((await previousPerformance(db, 'Barbell_Bench_Press', now)).map((s) => s.weightG)).toEqual([82500]);
    expect(await exerciseHistory(db, 'Barbell_Bench_Press')).toHaveLength(2);
    const page = await historyPage(db, null);
    expect(page.map((p) => p.sets)).toEqual([1, 1]);
    expect(page[0]!.volumeG).toBe(82500 * 8);
  });

  it('skips the open workout when looking for last time', async () => {
    const db = testDb();
    await syncSeed(db, seed);
    const old = await startWorkout(db, { title: 'Old' }, 1000);
    const oldEx = await addExercise(db, old, 'Barbell_Squat', { sets: [{}] });
    await completeSet(db, (await getWorkout(db, old))!.exercises[0]!.sets[0]!.id, { weightG: 100000, reps: 5 }, 1100);
    await finishWorkout(db, old, 1200);
    // An abandoned, never-finished workout with newer sets must not count as "last time".
    const abandoned = await startWorkout(db, { title: 'Abandoned' }, 2000);
    await addExercise(db, abandoned, 'Barbell_Squat', { sets: [{}, {}, {}, {}] });
    for (const s of (await getWorkout(db, abandoned))!.exercises[0]!.sets) await completeSet(db, s.id, { weightG: 120000, reps: 1 }, 2100);
    const today = await startWorkout(db, { title: 'Today' }, 3000);
    const prev = await previousPerformance(db, 'Barbell_Squat', today);
    expect(prev.map((s) => [s.workoutExerciseId, s.weightG])).toEqual([[oldEx, 100000]]);
  });

  it('groups and swaps exercises', async () => {
    const db = testDb();
    await syncSeed(db, seed);
    const w = await startWorkout(db, { title: 'x' });
    const a = await addExercise(db, w, 'Barbell_Bench_Press', { sets: [{}, {}] });
    const b = await addExercise(db, w, 'Barbell_Squat', { sets: [{}] });
    const g = await groupExercises(db, w, [a, b], 'superset', 120000);
    await completeSet(db, (await getWorkout(db, w))!.exercises[0]!.sets[0]!.id, { weightG: 60000, reps: 10 });
    await swapExercise(db, a, 'Barbell_Squat');
    const full = (await getWorkout(db, w))!;
    expect(full.groups[0]!.id).toBe(g);
    expect(full.exercises.every((e) => e.groupId === g)).toBe(true);
    expect(full.exercises[0]!.sets.map((s) => s.exerciseId)).toEqual(['Barbell_Bench_Press', 'Barbell_Squat']);
  });

  it('finds the same PRs from the collapsed baseline as from the full history', async () => {
    const db = testDb();
    await syncSeed(db, seed);
    let n = 7;
    const rand = (k: number) => ((n = (n * 1103515245 + 12345) % 2147483648), Math.floor(n / 65536) % k);
    const types: SetType[] = ['working', 'warmup', 'top', 'failure', 'amtap'];
    let last = '';
    for (let i = 0; i < 120; i++) {
      const w = await startWorkout(db, { title: `W${i}` }, i * 1000);
      const we = await addExercise(db, w, 'Barbell_Squat');
      for (let s = 0; s < 4; s++) {
        const timed = rand(5) === 0;
        const id = await addSet(db, we, { type: types[rand(types.length)] });
        await completeSet(
          db,
          id,
          timed ? { timeMs: 10000 + rand(6) * 5000, weightG: rand(3) * 10000, side: (['L', 'R', null] as const)[rand(3)] } : { weightG: 60000 + rand(12) * 2500, reps: 1 + rand(10), rir: rand(3) === 0 ? null : rand(4), rpe: rand(4) === 0 ? 8 : null },
          i * 1000 + s,
        );
      }
      if (i < 119) await finishWorkout(db, w, i * 1000 + 500);
      last = w;
    }
    const current = (await getWorkout(db, last))!.exercises[0]!.sets.map(toLoggedSet);
    const full = (await exerciseHistory(db, 'Barbell_Squat', last)).map(toLoggedSet);
    const baseline = await prBaseline(db, 'Barbell_Squat', last);
    expect(baseline.length).toBeLessThan(full.length);
    const strip = (prs: ReturnType<typeof detectPrs>) => prs.map(({ kind, value, previous, setId, message }) => ({ kind, value, previous, setId, message }));
    for (const unit of ['kg', 'lb'] as const) expect(strip(detectPrs(baseline, current, unit))).toEqual(strip(detectPrs(full, current, unit)));
    // Many random new sets, so every kind of PR (and no PR) gets compared.
    const kinds = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const timed = rand(4) === 0;
      const s = { ...current[0]!, id: `n${i}`, type: 'working' as const, weightG: timed ? rand(3) * 10000 : 60000 + rand(16) * 2500, reps: timed ? null : 1 + rand(14), rir: rand(4), rpe: null, timeMs: timed ? 10000 + rand(9) * 5000 : null, side: timed ? (['L', 'R', null] as const)[rand(3)]! : null };
      const want = strip(detectPrs(full, [s], 'kg'));
      want.forEach((p) => kinds.add(p.kind));
      expect(strip(detectPrs(baseline, [s], 'kg'))).toEqual(want);
    }
    expect([...kinds].sort()).toEqual(['e1rm', 'hold', 'reps', 'volume', 'weight']);
  });

  it('reads only the rows each screen needs (no full scans)', async () => {
    const db = testDb();
    // Registered before the database opens, as Dexie middleware must be.
    const counter = countSetReads(db);
    await syncSeed(db, seed);
    // 200 sessions × 20 sets of one lift: 4,000 sets in the big table.
    const DAY = 86400000;
    await seedHistory(db, 'Barbell_Squat', 200, 20);
    const measure = async (run: () => Promise<unknown>) => {
      counter.reset();
      await run();
      return counter.reads();
    };
    // History totals only its page of 40 workouts.
    expect(await measure(() => historyPage(db, null, 40))).toBeLessThanOrEqual(40 * 20);
    expect(await measure(() => hasHistory(db))).toBe(0);
    // A week's sets: only the rows in range.
    expect(await measure(() => setsBetween(db, 100 * DAY, 107 * DAY))).toBe(7 * 20);
    // Previous performance stops at the latest session instead of walking every set.
    expect(await measure(() => previousPerformance(db, 'Barbell_Squat', null))).toBeLessThanOrEqual(5 * 20);
  });
});

describe('settings, gyms, programs, landmarks', () => {
  it('stores settings with defaults', async () => {
    const db = testDb();
    expect((await loadSettings(db)).effort).toBe('rir');
    await saveSetting(db, 'effort', 'rpe');
    await saveSetting(db, 'effort', 'rir');
    expect(await loadSettings(db)).toMatchObject({ effort: 'rir', theme: 'carbon', restSound: true, otherSounds: false, haptics: true });
  });
  it('always has a default gym', async () => {
    const db = testDb();
    const g = await ensureDefaultGym(db, 'kg');
    expect((await ensureDefaultGym(db, 'kg')).id).toBe(g.id);
    expect(g.barG).toBe(20000);
  });
  it('restarting a program carries ending loads over', async () => {
    const db = testDb();
    await saveProgram(db, { id: 'p', name: 'P', notes: '', schedule: 'rotation', groups: {}, meso: DEFAULT_MESO, blocks: [] });
    const r1 = await startRun(db, 'p', 1000);
    await saveRunState(db, r1, { ...emptyRunState(), slots: { s1: { loadG: 100000, fails: 2 } } });
    const r2 = await startRun(db, 'p', 2000);
    expect((await activeRun(db))!.id).toBe(r2);
    expect((await activeRun(db))!.state.slots.s1).toMatchObject({ loadG: 100000, fails: 0 });
    expect((await getProgram(db, 'p'))!.name).toBe('P');
  });
  it('merges learned landmarks over defaults', async () => {
    const db = testDb();
    await saveLandmark(db, 'quads', { mev: 6, mav: 12, mrv: 17 }, 'meso-1');
    expect((await loadLandmarks(db)).quads).toEqual({ mev: 6, mav: 12, mrv: 17 });
    expect((await loadLandmarks(db)).chest.mrv).toBe(20);
  });
});

describe('import and backup', () => {
  it('commits a Strong import once, even if imported twice', async () => {
    const db = testDb();
    await syncSeed(db, seed);
    const r = parseStrong(readFileSync(new URL('../engine/import/fixtures/strong.csv', import.meta.url), 'utf8'), 'kg');
    const mapping = Object.fromEntries(r.exerciseNames.map((n) => [n, n.startsWith('Bench') ? { exerciseId: 'Barbell_Bench_Press' } : n.startsWith('Squat') ? { exerciseId: 'Barbell_Squat' } : { create: true as const }]));
    const first = await commitImport(db, r, mapping, null);
    expect(first).toEqual({ workouts: 2, sets: 7, skippedDuplicates: 0, createdExercises: 2 });
    expect((await commitImport(db, r, { 'Bench Press (Barbell)': { exerciseId: 'Barbell_Bench_Press' } }, null)).skippedDuplicates).toBe(2);
    expect((await getExercise(db, 'Barbell_Bench_Press'))!.aliases).toContain('Bench Press (Barbell)');
    // Imported history counts toward how often an exercise is used (the library orders by it).
    const counts = await sessionCounts(db);
    expect(counts.get('Barbell_Bench_Press')).toBeGreaterThan(0);
  });
  it('round-trips a full JSON backup', async () => {
    const db = testDb();
    await syncSeed(db, seed);
    const w = await startWorkout(db, { title: 'x' }, 1);
    await addExercise(db, w, 'Barbell_Squat', { sets: [{ weightG: 1 }] });
    await recordPrs(db, w, [{ kind: 'weight', exerciseId: 'Barbell_Squat', setId: 's', value: 1, previous: 0, message: 'm' }]);
    const file = await exportAll(db);
    const check = checkBackup(JSON.stringify(file));
    expect(check.ok).toBe(true);
    const db2 = testDb();
    await restoreAll(db2, file);
    expect(await exportAll(db2, file.exportedAt)).toEqual(file);
    // The open workout is still open after a restore.
    expect((await activeWorkout(db2))!.id).toBe(w);
  });
  it('rejects files that are not backups', () => {
    expect(checkBackup('{"x":1}')).toEqual({ ok: false, error: "This isn't an Analog backup." });
    expect(checkBackup('nope')).toEqual({ ok: false, error: "This file isn't valid JSON." });
  });
});
