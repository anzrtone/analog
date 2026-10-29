// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { checkBackup, exportAll, restoreAll, type BackupFile } from './backup';
import { getExercise, listExercises } from './exercises';
import { activeRun, listGyms, listMeasurements, listPrograms, loadLandmarks, prsForWorkout } from './repos';
import { TABLE_NAMES } from './schema';
import { loadSettings, saveSettings } from './settings';
import { testDb } from './testing';
import { activeWorkout, getWorkout, historyPage, previousPerformance } from './workouts';
import { DEFAULT_MESO, emptyRunState, type Program } from '@/engine/programs/types';

// Moving from Analog 0.1.0: a backup written by 0.1.0's exportAll (Drizzle rows from SQLite, camelCase fields,
// JSON columns already parsed, booleans as booleans, nulls kept) must come across row for row.

const T0 = Date.UTC(2026, 9, 20, 17, 30);
const MIN = 60_000;

const program: Program = {
  id: 'prog-1',
  name: 'Upper/Lower 4-day hypertrophy',
  notes: 'Answer the quick questions after each session.',
  schedule: 'rotation',
  groups: { g1: { kind: 'superset', restMs: 90000, transitionMs: 0 } },
  meso: DEFAULT_MESO,
  blocks: [
    {
      id: 'block-1',
      name: 'Mesocycle 1',
      goal: 'hypertrophy',
      weeks: 4,
      deloadWeek: true,
      adaptive: true,
      overrides: {},
      days: [
        {
          id: 'day-1',
          name: 'Upper A',
          weekday: null,
          slots: [
            { id: 'slot-1', exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', groupId: null, sets: [{ type: 'working', reps: 6, repsMax: 10, rir: 3, pct: null, timeMs: null }], rule: { type: 'meso', repsMin: 6, repsMax: 10 }, restMs: 150000, note: null },
            { id: 'slot-2', exerciseId: 'custom-cable-y-raise', groupId: 'g1', sets: [{ type: 'working', reps: 12, repsMax: 20, rir: 3, pct: null, timeMs: null }], rule: { type: 'meso', repsMin: 12, repsMax: 20 }, restMs: 60000, note: 'slow negatives' },
          ],
        },
      ],
    },
  ],
};

/** Every table filled, shaped exactly as 0.1.0 exported it. */
function backup010(): BackupFile {
  const set = (o: Record<string, unknown>) => ({
    weightG: null, reps: null, rir: null, rpe: null, partials: null, forced: null, tempo: null, side: null, timeMs: null, distanceM: null, band: null, restMs: null, pain: null, note: null, segments: [], parentSetId: null,
    targetWeightG: null, targetReps: null, targetRepsMax: null, targetRir: null, targetTimeMs: null, completedAt: null, ...o,
  });
  const workout = (o: Record<string, unknown>) => ({ runId: null, programId: null, dayId: null, blockIndex: null, weekIndex: null, gymId: 'gym-1', endedAt: null, bodyweightG: null, sessionRpe: null, sleep: null, stress: null, notes: null, importKey: null, healthConnectId: null, ...o });
  return {
    app: 'analog',
    format: 1,
    exportedAt: T0 + 10 * 86_400_000,
    tables: {
      exercises: [
        { id: 'Barbell_Bench_Press_-_Medium_Grip', name: 'Barbell Bench Press - Medium Grip', aliases: ['Bench Press (Barbell)'], primary: ['chest'], secondary: ['triceps', 'frontDelts'], secondaryCredit: 0.5, equipment: 'barbell', mode: 'weightReps', unilateral: false, incrementG: 2500, barG: null, defaultRestMs: 180000, repsMin: null, repsMax: null, link: null, notes: null, instructions: ['Lie on the bench.', 'Lower to the chest.'], image: 'Barbell_Bench_Press_-_Medium_Grip/0.jpg', category: 'strength', source: 'seed', hidden: false, createdAt: T0 - 86_400_000, updatedAt: T0 - 86_400_000 },
        { id: 'Plank', name: 'Plank', aliases: [], primary: ['abs'], secondary: ['obliques'], secondaryCredit: 0.5, equipment: 'bodyweight', mode: 'time', unilateral: false, incrementG: 2500, barG: null, defaultRestMs: 60000, repsMin: null, repsMax: null, link: null, notes: null, instructions: [], image: null, category: 'strength', source: 'seed', hidden: false, createdAt: T0 - 86_400_000, updatedAt: T0 - 86_400_000 },
        { id: 'custom-cable-y-raise', name: 'Cable Y raise', aliases: ['Y raise'], primary: ['sideDelts'], secondary: ['traps'], secondaryCredit: 0.25, equipment: 'cable', mode: 'weightReps', unilateral: true, incrementG: 1250, barG: null, defaultRestMs: 60000, repsMin: 12, repsMax: 20, link: 'https://example.test/y-raise', notes: 'thumbs up', instructions: [], image: null, category: null, source: 'custom', hidden: false, createdAt: T0, updatedAt: T0 },
      ],
      exerciseOverrides: [{ exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', fields: { name: 'Bench press (comp grip)', defaultRestMs: 150000 }, hidden: null, stickyNote: 'elbows tucked', updatedAt: T0 }],
      machineSettings: [{ exerciseId: 'custom-cable-y-raise', gymId: 'gym-1', text: 'pulley at notch 3', updatedAt: T0 }],
      gyms: [
        { id: 'gym-1', name: 'My gym', unit: 'kg', barG: 20000, plates: [{ weightG: 25000, count: 4 }, { weightG: 20000, count: 4 }, { weightG: 1250, count: 2 }], dumbbellsG: [10000, 12500, 15000], kettlebellsG: [16000], machineStepG: 5000, equipment: ['barbell', 'cable'], isDefault: true, createdAt: T0 - 86_400_000 },
        { id: 'gym-2', name: 'Hotel gym', unit: 'lb', barG: 20412, plates: [{ weightG: 20412, count: 2 }], dumbbellsG: [], kettlebellsG: [], machineStepG: 4536, equipment: [], isDefault: false, createdAt: T0 },
      ],
      workouts: [
        workout({ id: 'w-1', title: 'Upper A', runId: 'run-1', programId: 'prog-1', dayId: 'day-1', blockIndex: 0, weekIndex: 0, startedAt: T0, endedAt: T0 + 60 * MIN, bodyweightG: 80500, sessionRpe: 8, sleep: 4, stress: 2, notes: 'felt strong' }),
        workout({ id: 'w-imported', title: 'Push Day', startedAt: T0 - 7 * 86_400_000, endedAt: T0 - 7 * 86_400_000 + 45 * MIN, importKey: 'strong:1760000000000:Push Day', gymId: null }),
        workout({ id: 'w-open', title: 'Workout', startedAt: T0 + 2 * 86_400_000 }),
      ],
      workoutGroups: [{ id: 'wg-1', workoutId: 'w-1', kind: 'superset', restMs: 90000, transitionMs: 0 }],
      workoutExercises: [
        { id: 'we-1', workoutId: 'w-1', exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', order: 0, groupId: null, restMs: 150000, note: null, slotId: 'slot-1', explanation: '+2.5 kg · hit 3 × 10 at 2 RIR last week', explanationDetail: 'Double progression: all sets at the top of the range.', skipped: false },
        { id: 'we-2', workoutId: 'w-1', exerciseId: 'custom-cable-y-raise', order: 1, groupId: 'wg-1', restMs: 60000, note: 'slow negatives', slotId: 'slot-2', explanation: null, explanationDetail: null, skipped: false },
        { id: 'we-3', workoutId: 'w-1', exerciseId: 'Plank', order: 2, groupId: null, restMs: null, note: null, slotId: null, explanation: null, explanationDetail: null, skipped: true },
        { id: 'we-imp', workoutId: 'w-imported', exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', order: 0, groupId: null, restMs: null, note: null, slotId: null, explanation: null, explanationDetail: null, skipped: false },
        { id: 'we-open', workoutId: 'w-open', exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', order: 0, groupId: null, restMs: null, note: null, slotId: null, explanation: null, explanationDetail: null, skipped: false },
      ],
      workoutSets: [
        set({ id: 's-1', workoutId: 'w-1', workoutExerciseId: 'we-1', exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', order: 0, type: 'warmup', weightG: 40000, reps: 10, targetWeightG: 40000, targetReps: 10, completedAt: T0 + 5 * MIN }),
        set({ id: 's-2', workoutId: 'w-1', workoutExerciseId: 'we-1', exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', order: 1, type: 'top', weightG: 82500, reps: 6, rir: 1, tempo: '3-1-1-0', restMs: 180000, targetWeightG: 82500, targetReps: 6, targetRepsMax: 10, targetRir: 1, completedAt: T0 + 10 * MIN }),
        set({ id: 's-3', workoutId: 'w-1', workoutExerciseId: 'we-1', exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', order: 2, type: 'backoff', weightG: 70000, reps: 8, rir: 2, parentSetId: 's-2', partials: 3, forced: 1, completedAt: T0 + 15 * MIN }),
        set({ id: 's-4', workoutId: 'w-1', workoutExerciseId: 'we-1', exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', order: 3, type: 'drop', weightG: 60000, reps: 10, rir: 0, segments: [{ reps: 8, weightG: 50000, restMs: null }, { reps: 6, weightG: 40000, restMs: null }], note: 'burned', completedAt: T0 + 18 * MIN }),
        set({ id: 's-5', workoutId: 'w-1', workoutExerciseId: 'we-2', exerciseId: 'custom-cable-y-raise', order: 0, type: 'working', weightG: 5000, reps: 15, rpe: 8, rir: 2, side: 'L', pain: 1, band: 'red', completedAt: T0 + 25 * MIN }),
        set({ id: 's-6', workoutId: 'w-1', workoutExerciseId: 'we-2', exerciseId: 'custom-cable-y-raise', order: 1, type: 'working', weightG: 5000, reps: 14, rir: 2, side: 'R', completedAt: T0 + 26 * MIN }),
        set({ id: 's-imp', workoutId: 'w-imported', workoutExerciseId: 'we-imp', exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', order: 0, type: 'working', weightG: 80000, reps: 8, rpe: 8, rir: 2, completedAt: T0 - 7 * 86_400_000 }),
        set({ id: 's-open-1', workoutId: 'w-open', workoutExerciseId: 'we-open', exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', order: 0, type: 'working', weightG: 85000, reps: 5, rir: 2, completedAt: T0 + 2 * 86_400_000 + 5 * MIN }),
        set({ id: 's-open-2', workoutId: 'w-open', workoutExerciseId: 'we-open', exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', order: 1, type: 'amtap', timeMs: 72000, distanceM: 0, targetTimeMs: 75000 }),
      ],
      feedback: [
        { id: 'f-1', workoutId: 'w-1', runId: 'run-1', muscle: null, exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', slotId: 'slot-1', kind: 'pump', value: '2', createdAt: T0 + 61 * MIN },
        { id: 'f-2', workoutId: 'w-1', runId: 'run-1', muscle: 'chest', exerciseId: null, slotId: null, kind: 'workload', value: 'right', createdAt: T0 + 62 * MIN },
      ],
      landmarks: [{ muscle: 'quads', mev: 6, mav: 12, mrv: 17, learnedFrom: ['run-0'], updatedAt: T0 - 86_400_000 }],
      programs: [{ id: 'prog-1', name: program.name, data: program, createdAt: T0 - 86_400_000, updatedAt: T0, archived: false }],
      programRuns: [{ id: 'run-1', programId: 'prog-1', program, state: { ...emptyRunState(), dayIndex: 1, slots: { 'slot-1': { loadG: 82500, fails: 0 } }, slotSets: { 'slot-1': 4 } }, startedAt: T0 - 60 * MIN, endedAt: null, active: true }],
      prs: [{ id: 'pr-1', exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', setId: 's-2', workoutId: 'w-1', kind: 'weight', value: 82500, previous: 80000, atWeightG: null, side: null, message: 'New PR: 82.5 × 6 (prev 80 × 8)', createdAt: T0 + 60 * MIN }],
      measurements: [
        { id: 'm-1', date: T0 - 86_400_000, kind: 'bodyweight', value: 80500, note: null },
        { id: 'm-2', date: T0, kind: 'waist', value: 82, note: 'morning' },
      ],
      photos: [{ id: 'ph-1', date: T0, uri: 'file:///data/user/0/app.analoglog/files/photos/ph-1.jpg', note: 'front' }],
      settings: [
        { key: 'unit', value: 'kg' },
        { key: 'effort', value: 'rpe' },
        { key: 'theme', value: 'paper' },
        { key: 'defaultGymId', value: 'gym-1' },
        { key: 'seedVersion', value: 3 },
        { key: 'onboarded', value: true },
        { key: 'onboardingVersion', value: 1 },
        { key: 'profile', value: { name: 'Sam' } },
        { key: 'customSetTypes', value: [{ id: 'custom:tempo', label: 'Tempo', hint: 'Slow eccentric', letter: 'tp', glyph: null, ring: 'yellow', countsAsVolume: true, prEligible: false, timed: false }] },
        { key: 'warmupRamp', value: [{ pct: 0.5, reps: 8 }, { pct: 0.75, reps: 3 }] },
        { key: 'lastBackupAt', value: T0 },
        { key: 'toursSeen', value: ['main'] },
      ],
    },
  };
}

describe('restoring an Analog 0.1.0 backup', () => {
  it('passes the check and reports what it holds', () => {
    const check = checkBackup(JSON.stringify(backup010()));
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.counts).toMatchObject({ workouts: 3, workoutSets: 9, programs: 1, exercises: 3, settings: 12 });
    for (const name of TABLE_NAMES) expect(check.counts[name]).toBeGreaterThan(0);
  });

  it('brings every table across row for row', async () => {
    const file = backup010();
    const db = testDb();
    await restoreAll(db, file);
    const back = await exportAll(db, file.exportedAt);
    for (const name of TABLE_NAMES) {
      const key = (r: unknown) => { const o = r as Record<string, string>; return o.id ?? o.key ?? o.muscle ?? `${o.exerciseId}|${o.gymId ?? ''}`; };
      const sortById = (rows: unknown[]) => [...rows].sort((a, b) => key(a).localeCompare(key(b)));
      expect({ name, rows: sortById(back.tables[name]) }).toEqual({ name, rows: sortById(file.tables[name]) });
    }
  });

  it('the app reads the restored data as 0.1.0 showed it', async () => {
    const db = testDb();
    await restoreAll(db, backup010());

    // Settings, including a custom set type.
    const s = await loadSettings(db);
    expect(s).toMatchObject({ unit: 'kg', effort: 'rpe', theme: 'paper', defaultGymId: 'gym-1', onboarded: true, profile: { name: 'Sam' }, toursSeen: ['main'], lastBackupAt: T0 });
    expect(s.customSetTypes[0]!.id).toBe('custom:tempo');

    // Exercises: the override layer, the sticky note, the custom exercise.
    const bench = (await getExercise(db, 'Barbell_Bench_Press_-_Medium_Grip'))!;
    expect(bench).toMatchObject({ name: 'Bench press (comp grip)', defaultRestMs: 150000, stickyNote: 'elbows tucked', edited: true });
    expect((await listExercises(db)).map((e) => e.name)).toContain('Cable Y raise');

    // History, the open workout resuming, last time, PRs, the running program.
    expect((await historyPage(db, null)).map((w) => [w.id, w.sets])).toEqual([
      ['w-1', 6],
      ['w-imported', 1],
    ]);
    expect((await activeWorkout(db))!.id).toBe('w-open');
    const open = (await getWorkout(db, 'w-open'))!;
    expect(open.exercises[0]!.sets.map((x) => [x.type, x.completedAt != null])).toEqual([
      ['working', true],
      ['amtap', false],
    ]);
    expect((await previousPerformance(db, 'Barbell_Bench_Press_-_Medium_Grip', 'w-open')).map((x) => x.id)).toEqual(['s-1', 's-2', 's-3', 's-4']);
    const w1 = (await getWorkout(db, 'w-1'))!;
    expect(w1.groups[0]!.id).toBe('wg-1');
    expect(w1.exercises.find((e) => e.id === 'we-2')!.sets.map((x) => x.side)).toEqual(['L', 'R']);
    expect(w1.exercises[0]!.sets[3]!.segments).toHaveLength(2);
    expect((await prsForWorkout(db, 'w-1'))[0]!.message).toBe('New PR: 82.5 × 6 (prev 80 × 8)');
    expect((await activeRun(db))!.state).toMatchObject({ dayIndex: 1, slotSets: { 'slot-1': 4 } });
    expect((await listPrograms(db))[0]!.data.blocks[0]!.days[0]!.slots).toHaveLength(2);

    // Gyms, landmarks, measurements, machine settings.
    expect((await listGyms(db)).map((g) => g.name)).toEqual(['My gym', 'Hotel gym']);
    expect((await loadLandmarks(db)).quads).toEqual({ mev: 6, mav: 12, mrv: 17 });
    expect((await listMeasurements(db, 'waist'))[0]!.value).toBe(82);
    expect((await db.machineSettings.get(['custom-cable-y-raise', 'gym-1']))!.text).toBe('pulley at notch 3');
  });

  it("keeps this device's own settings and replaces everything else", async () => {
    const db = testDb();
    await saveSettings(db, { installId: 'this-device', surveySentAt: 7, lastSeenVersion: '0.2.0', theme: 'carbon' });
    await db.workouts.add({ id: 'mine', title: 'Mine', runId: null, programId: null, dayId: null, blockIndex: null, weekIndex: null, gymId: null, startedAt: 1, endedAt: 2, bodyweightG: null, sessionRpe: null, sleep: null, stress: null, notes: null, importKey: null, healthConnectId: null });
    const file = backup010();
    // A file that carries device-only keys anyway (hand-edited, say) doesn't overwrite them.
    file.tables.settings.push({ key: 'installId', value: 'other-device' });
    await restoreAll(db, file);
    const s = await loadSettings(db);
    expect(s).toMatchObject({ installId: 'this-device', surveySentAt: 7, lastSeenVersion: '0.2.0', theme: 'paper' });
    expect(await db.workouts.get('mine')).toBeUndefined();
  });

  it('a 0.2.0 backup is the same file again: 0.1.0 can read it', async () => {
    const db = testDb();
    await restoreAll(db, backup010());
    const file = await exportAll(db, 1);
    expect(Object.keys(file)).toEqual(['app', 'format', 'exportedAt', 'tables']);
    expect(file).toMatchObject({ app: 'analog', format: 1 });
    expect(Object.keys(file.tables)).toEqual(TABLE_NAMES);
    // No 0.2.0-only fields leak into rows.
    expect(JSON.stringify(file.tables.workouts)).not.toContain('"open"');
  });
});
