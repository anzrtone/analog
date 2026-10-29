// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { readFileSync } from 'fs';
import { join } from 'path';
import { exportCsv } from '../export/csv';
import { detectCsv, parseCsvExport, parseHevy, parseStrong } from './csv';
import { matchExercise, normalizeName, similarity } from './mapping';
import { parseDate, parseDurationText } from './normalize';

// Fixtures follow the publicly described export layouts. They are not real user exports yet.
const fx = (f: string) => readFileSync(join(__dirname, 'fixtures', f), 'utf8');

describe('dates and durations', () => {
  it('parses each export date style as local time', () => {
    expect(parseDate('2024-03-04 18:02:11')).toBe(new Date(2024, 2, 4, 18, 2, 11).getTime());
    expect(parseDate('15 Jan 2024, 08:30')).toBe(new Date(2024, 0, 15, 8, 30).getTime());
    expect(parseDate('Jan 15, 2024, 8:30 PM')).toBe(new Date(2024, 0, 15, 20, 30).getTime());
    expect(parseDate('nonsense')).toBeNull();
  });
  it('parses durations', () => {
    expect(parseDurationText('1h 5m')).toBe(65 * 60000);
    expect(parseDurationText('48m')).toBe(48 * 60000);
    expect(parseDurationText('1:05:00')).toBe(65 * 60000);
    expect(parseDurationText('90')).toBe(90000);
  });
});

describe('Strong', () => {
  it('detects the format', () => {
    expect(detectCsv(fx('strong.csv'))).toBe('strong');
    expect(detectCsv(fx('hevy.csv'))).toBe('hevy');
    expect(detectCsv('a,b,c\n1,2,3')).toBe('unknown');
  });
  it('groups rows into workouts and exercises', () => {
    const r = parseStrong(fx('strong.csv'), 'kg');
    expect(r.workouts).toHaveLength(2);
    const push = r.workouts[0]!;
    expect(push.title).toBe('Push A');
    expect(push.endedAt! - push.startedAt).toBe(65 * 60000);
    expect(push.notes).toBe('Felt good');
    expect(push.exercises.map((e) => e.name)).toEqual(['Bench Press (Barbell)', 'Triceps Pushdown (Cable - Straight Bar)', 'Plank']);
    expect(push.exercises[0]!.sets.map((s) => [s.type, s.weightG, s.reps, s.rpe])).toEqual([
      ['warmup', 40000, 10, null],
      ['working', 80000, 5, 8],
      ['working', 80000, 5, 8.5],
    ]);
    expect(push.exercises[2]!.sets[0]).toMatchObject({ timeMs: 75000, weightG: null });
    expect(r.workouts[1]!.exercises[0]!.sets[1]!.type).toBe('drop');
    expect(r.exerciseNames).toHaveLength(4);
  });
  it('reads the older semicolon layout with units', () => {
    const r = parseStrong(fx('strong-semicolon.csv'), 'kg');
    const dl = r.workouts[0]!.exercises[0]!.sets[0]!;
    expect(dl.weightG).toBe(Math.round(225 * 453.59237));
    expect(r.workouts[0]!.exercises[1]!.sets[0]).toMatchObject({ distanceM: 5000, timeMs: 1500000 });
  });
  it('uses the default unit when the file has none', () => {
    expect(parseStrong(fx('strong.csv'), 'lb').workouts[0]!.exercises[0]!.sets[1]!.weightG).toBe(Math.round(80 * 453.59237));
  });
  it('explains a wrong file', () => {
    expect(parseCsvExport('x,y\n1,2', 'kg').warnings[0]).toContain('Strong and Hevy');
  });
});

describe('Hevy', () => {
  it('parses sets, supersets and timed sets', () => {
    const r = parseHevy(fx('hevy.csv'));
    const w = r.workouts[0]!;
    expect(w.endedAt! - w.startedAt).toBe(70 * 60000);
    expect(w.exercises.map((e) => e.groupKey)).toEqual(['0', '0', null, null]);
    expect(w.exercises[0]!.sets.map((s) => s.type)).toEqual(['warmup', 'working']);
    expect(w.exercises[2]!.sets[0]!.type).toBe('drop');
    expect(w.exercises[3]!.sets[0]).toMatchObject({ timeMs: 62000, weightG: null });
  });
});

describe('exercise mapping', () => {
  const lib = [
    { id: 'Barbell_Bench_Press_-_Medium_Grip', name: 'Barbell Bench Press - Medium Grip', aliases: [] },
    { id: 'Barbell_Squat', name: 'Barbell Squat', aliases: ['Back squat'] },
    { id: 'Wide-Grip_Lat_Pulldown', name: 'Wide-Grip Lat Pulldown', aliases: [] },
    { id: 'Triceps_Pushdown', name: 'Triceps Pushdown', aliases: [] },
    { id: 'Dumbbell_Bicep_Curl', name: 'Dumbbell Bicep Curl', aliases: [] },
    { id: 'Plank', name: 'Plank', aliases: [] },
  ];
  it('normalizes equipment in parentheses', () => {
    expect(normalizeName('Bench Press (Barbell)')).toBe('barbell bench press');
    expect(normalizeName('DB Curls')).toBe('dumbbell curl');
  });
  it.each([
    ['Bench Press (Barbell)', 'Barbell_Bench_Press_-_Medium_Grip'],
    ['Squat (Barbell)', 'Barbell_Squat'],
    ['Back squat', 'Barbell_Squat'],
    ['Lat Pulldown (Cable)', 'Wide-Grip_Lat_Pulldown'],
    ['Triceps Pushdown (Cable - Straight Bar)', 'Triceps_Pushdown'],
    ['Bicep Curl (Dumbbell)', 'Dumbbell_Bicep_Curl'],
    ['Plank', 'Plank'],
  ])('maps %s', (name, id) => {
    expect(matchExercise(name, lib)[0]!.id).toBe(id);
  });
  it('scores identical names 1', () => {
    expect(similarity('Plank', 'plank')).toBe(1);
  });
});

it('exports CSV that Analog can read back as a Strong file', () => {
  const csv = exportCsv(
    [
      { workoutStartedAt: new Date(2026, 9, 28, 18, 0).getTime(), workoutEndedAt: new Date(2026, 9, 28, 19, 0).getTime(), workoutName: 'Push A', workoutNotes: null, exerciseName: 'Bench, "paused"', group: null, setOrder: 1, type: 'top', weightG: 82500, reps: 5, rir: 1, rpe: null, partials: null, timeMs: null, distanceM: null, side: null, note: null },
    ],
    'kg',
  );
  expect(csv.split('\n')[0]).toContain('Date,Workout Name,Duration,Exercise Name,Set Order,Weight');
  const back = parseCsvExport(csv, 'kg');
  expect(back.workouts[0]!.exercises[0]!.name).toBe('Bench, "paused"');
  expect(back.workouts[0]!.exercises[0]!.sets[0]).toMatchObject({ weightG: 82500, reps: 5, rpe: 9 });
});
