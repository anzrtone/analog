// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import seedFile from '@/assets/seed.json';
import type { SeedExercise } from '@/db/exercises';
import { recentPrs } from '@/db/repos';
import { db as userDb } from '@/db/schema';
import { readDb, sampleShown, showDatabase } from '@/db/shown';
import { testDb } from '@/db/testing';
import { getWorkout, historyPage, setsBetween, startWorkout } from '@/db/workouts';
import { buildSample } from './sample';
import { fill, TOURS, type TourScreen } from './script';
import { endTour, makeStep, nextStep, prevStep, setTourHost, skipUnreachable, startTour, tourSnapshot, type TourHost } from './store';

const steps = TOURS.main!.steps;
const indexOf = (pred: (s: (typeof steps)[number]) => boolean) => steps.findIndex(pred);
const MAKE_PROGRAM = indexOf((s) => s.make === 'program');
const MAKE_DAY = indexOf((s) => s.make === 'day');
const FIRST_HISTORY = indexOf((s) => s.screen === 'history');
const FIRST_WORKOUT = indexOf((s) => s.screen === 'workout');
const exercises = (seedFile as unknown as { exercises: SeedExercise[] }).exercises;

function fakeHost() {
  const log = { screens: [] as TourScreen[], sample: [] as boolean[], programs: [] as string[], days: [] as [string, string][], ended: [] as string[], discarded: 0 };
  let n = 0;
  const host: TourHost = {
    go: (s) => log.screens.push(s),
    prepareSample: () => {},
    showSample: (on) => log.sample.push(on),
    discardSample: () => log.discarded++,
    makeProgram: async (name) => {
      log.programs.push(name);
      return { id: `p${++n}`, name };
    },
    makeDay: async (programId, name) => {
      log.days.push([programId, name]);
      return { id: `d${++n}`, name };
    },
    suggestion: () => ['Strength block', 'Squat day'],
    userName: () => 'Sam',
    onEnd: (id) => log.ended.push(id),
  };
  setTourHost(host);
  return log;
}

const view = () => tourSnapshot()!;
const goTo = (i: number) => {
  while (view().index < i) nextStep();
};

afterEach(() => endTour());

describe('guided tour', () => {
  test('steps that point at something never made are skipped', async () => {
    fakeHost();
    await startTour('main');
    goTo(MAKE_PROGRAM);
    expect(view().step.make).toBe('program');
    nextStep(); // "Not now"
    expect(view().index).toBe(FIRST_HISTORY);
  });

  test('makes the program, then the day inside it, and fills the placeholders', async () => {
    const log = fakeHost();
    await startTour('main');
    goTo(MAKE_PROGRAM);
    expect(view().suggestion).toBe('Strength block');
    await makeStep('  School  ');
    expect(view().index).toBe(MAKE_DAY);
    expect(view().text).toContain('“School”');
    expect(view().target).toBe('program-p1');
    await makeStep(''); // an empty name keeps the suggestion
    expect(log.programs).toEqual(['School']);
    expect(log.days).toEqual([['p1', 'Squat day']]);
    expect(view().text).toContain('“Squat day”');
  });

  test('Back passes over make steps that are done, so nothing is made twice', async () => {
    const log = fakeHost();
    await startTour('main');
    goTo(MAKE_PROGRAM);
    await makeStep('School');
    await makeStep('Day A');
    prevStep();
    expect(view().index).toBe(MAKE_PROGRAM - 1);
    nextStep();
    expect(view().index).toBe(MAKE_DAY + 1);
    expect(log.programs).toHaveLength(1);
    expect(log.days).toHaveLength(1);
  });

  test('backing up past the start turns around; an unreachable target skips the way the user was going', async () => {
    fakeHost();
    await startTour('main');
    prevStep();
    expect(view()).toMatchObject({ index: 0, dir: 1 });
    nextStep();
    skipUnreachable();
    expect(view().index).toBe(2);
    prevStep();
    skipUnreachable();
    expect(view().index).toBe(0);
  });

  test('sample data shows only on the workout, History and Stats pages, and is thrown away at the end', async () => {
    const log = fakeHost();
    await startTour('main');
    goTo(FIRST_WORKOUT - 1);
    expect(log.sample).toEqual([]);
    nextStep();
    expect(log.screens.at(-1)).toBe('workout');
    expect(log.sample).toEqual([true]);
    goTo(MAKE_PROGRAM);
    expect(log.sample).toEqual([true, false]);
    nextStep(); // "Not now" goes straight on to History
    expect(view().index).toBe(FIRST_HISTORY);
    expect(log.sample).toEqual([true, false, true]);
    goTo(steps.length - 1);
    expect(log.sample).toEqual([true, false, true, false]);
    expect(view().text).toBe('That’s the tour, Sam. Everything stays on this device; back it up from More whenever you like.');
    nextStep();
    expect(tourSnapshot()).toBeNull();
    expect(log.discarded).toBe(1);
    expect(log.ended).toEqual(['main']);
  });

  test('without a name the last line still reads well', () => {
    expect(fill('That’s the tour, {name}. Bye.', '', {})).toBe('That’s the tour. Bye.');
  });

  test('the sample fills History and Stats, and the real database is untouched', async () => {
    const real = testDb();
    await startWorkout(real, { title: 'Mine' }, Date.now() - 1000);
    const sample = testDb();
    const now = new Date(2026, 9, 29, 12).getTime();
    const { workoutId } = await buildSample(sample, exercises, now);

    expect(await historyPage(sample, null, 40)).toHaveLength(12);
    // The workout pages show one under way: three sets ticked, a back-off next, a second exercise to come.
    const live = (await getWorkout(sample, workoutId))!;
    expect(live.workout.endedAt).toBeNull();
    expect(live.exercises.map((e) => e.sets.filter((x) => x.completedAt != null).length)).toEqual([3, 0]);
    expect(live.exercises[0]!.sets[3]).toMatchObject({ type: 'backoff', completedAt: null, targetReps: 8 });
    expect((await recentPrs(sample)).length).toBeGreaterThan(0);
    const monday = new Date(2026, 9, 26).getTime();
    expect((await setsBetween(sample, monday, now + 1)).length).toBeGreaterThan(0);
    // Same day, same sample.
    const again = testDb();
    await buildSample(again, exercises, now);
    expect((await historyPage(again, null, 40)).map((w) => [w.title, w.sets])).toEqual((await historyPage(sample, null, 40)).map((w) => [w.title, w.sets]));

    expect((await real.workouts.toArray()).map((w) => w.title)).toEqual(['Mine']);
  }, 60_000);

  test('while the sample is shown the app reads it, and writes still go to the user’s own database', async () => {
    const sample = testDb();
    await userDb.workouts.clear();
    await startWorkout(userDb, { title: 'Mine' }, 1000);
    await startWorkout(sample, { title: 'Sample' }, 1000);
    const titles = async () => (await readDb().workouts.toArray()).map((w) => w.title);

    showDatabase(sample);
    expect(sampleShown()).toBe(true);
    expect(await titles()).toEqual(['Sample']);
    // Writes always go to the user's database by name.
    await startWorkout(userDb, { title: 'Written during the tour' }, 2000);
    expect(await titles()).toEqual(['Sample']);
    showDatabase(null);
    expect(sampleShown()).toBe(false);
    expect((await titles()).sort()).toEqual(['Mine', 'Written during the tour']);
    await userDb.workouts.clear();
  });
});
