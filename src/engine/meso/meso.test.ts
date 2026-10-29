// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { buildMesoReport, DEFAULT_LANDMARKS, deltaForScore, learnLandmarks, planWeek, rirForWeek, scoreMuscle, type PlanSlot, type WeekPlanInput } from './index';

describe('scoring (SPEC §6.3)', () => {
  it('scores each answer', () => {
    expect(scoreMuscle('quads', { soreness: 'early', workload: 'easy', pumps: [2], performance: 'held' })).toMatchObject({ score: 2, reasons: ['healed early', 'easy workload', 'good pump', 'performance held'] });
    expect(scoreMuscle('quads', { soreness: 'still', workload: 'tooMuch', pumps: [3], performance: 'dropped' }).score).toBe(-5);
    expect(scoreMuscle('quads', { soreness: null, workload: null, pumps: [0], performance: null }).score).toBe(1);
    expect(scoreMuscle('quads', undefined).empty).toBe(true);
  });
  it('maps scores to set changes', () => {
    expect([3, 2, 1, 0.5, 0, -1, -2, -3, -5].map(deltaForScore)).toEqual([2, 2, 1, 0, 0, 0, 0, -1, -1]);
  });
});

it('walks RIR down across the meso', () => {
  expect([1, 2, 3, 4].map((w) => rirForWeek(w, 4, false))).toEqual([3, 2, 1, 0]);
  expect([1, 2, 3, 4, 5].map((w) => rirForWeek(w, 5, false))).toEqual([3, 2, 2, 1, 0]);
  expect(rirForWeek(5, 4, true)).toBe(4);
});

const slot = (over: Partial<PlanSlot>): PlanSlot => ({
  slotId: 's',
  exerciseId: 'e',
  exerciseName: 'Leg extension',
  dayId: 'mon',
  dayName: 'Mon',
  primary: ['quads'],
  sets: 3,
  pump: 2,
  pain: 'none',
  somePainCount: 0,
  ...over,
});

const base = (over: Partial<WeekPlanInput>): WeekPlanInput => ({
  week: 2,
  slots: [slot({ slotId: 'squat', exerciseName: 'Squat', pump: 2, sets: 4 }), slot({ slotId: 'ext', dayId: 'wed', dayName: 'Wed', pump: 3, sets: 4 })],
  feedback: {},
  history: {},
  landmarks: DEFAULT_LANDMARKS,
  sessionCap: 25,
  momentum: false,
  deloadScope: 'muscle',
  ...over,
});

describe('week planning', () => {
  it('adds a set to the best-pump slot and explains it', () => {
    const plan = planWeek(base({ feedback: { quads: { soreness: 'early', workload: 'right', pumps: [2], performance: 'held' } } }));
    expect(plan.slotChanges).toEqual([{ slotId: 'ext', delta: 1, muscle: 'quads' }]);
    expect(plan.cards).toEqual(['Quads +1 set (Wed leg extension): healed early + workload just right + good pump + performance held.']);
  });
  it('spreads +2 across days', () => {
    const plan = planWeek(base({ feedback: { quads: { soreness: 'early', workload: 'easy', pumps: [2], performance: 'held' } } }));
    expect(plan.slotChanges.map((c) => c.slotId).sort()).toEqual(['ext', 'squat']);
    expect(plan.muscles[0]).toMatchObject({ from: 8, to: 10, delta: 2 });
  });
  it('holds on a skipped week', () => {
    const plan = planWeek(base({}));
    expect(plan.slotChanges).toEqual([]);
    expect(plan.muscles[0]!.explanation).toBe('Quads holds at 8 sets: no feedback this week.');
  });
  it('climbs toward MEV when under it and recovering', () => {
    const fb = { quads: { soreness: 'justInTime' as const, workload: 'right' as const, pumps: [2 as const], performance: 'held' as const } };
    const plan = planWeek(base({ feedback: fb, slots: [slot({ sets: 3 }), slot({ slotId: 'b', sets: 2 })] }));
    expect(plan.muscles[0]).toMatchObject({ from: 5, to: 7 });
    expect(plan.muscles[0]!.explanation).toContain("you're under MEV (8)");
  });
  it('removes a set and flags MRV on a bad week, but never under MEV', () => {
    const fb = { quads: { soreness: 'still' as const, workload: 'tooMuch' as const, pumps: [2 as const], performance: 'dropped' as const } };
    const plan = planWeek(base({ feedback: fb, slots: [slot({ sets: 6 }), slot({ slotId: 'b', sets: 6 })] }));
    expect(plan.muscles[0]).toMatchObject({ delta: -1, flag: 'approachingMrv' });
    const atMev = planWeek(base({ feedback: fb, slots: [slot({ sets: 4 }), slot({ slotId: 'b', sets: 4 })] }));
    expect(atMev.muscles[0]!.delta).toBe(0);
  });
  it('clamps to MRV', () => {
    const plan = planWeek(base({ feedback: { quads: { soreness: 'never', workload: 'easy', pumps: [0], performance: 'held' } }, slots: [slot({ sets: 10 }), slot({ slotId: 'b', sets: 9 })] }));
    expect(plan.muscles[0]).toMatchObject({ from: 19, to: 20, flag: 'atMrv' });
  });
  it('keeps momentum in week 2 at MEV when asked', () => {
    const fb = { quads: { soreness: 'justInTime' as const, workload: 'right' as const, pumps: [2 as const], performance: 'held' as const } };
    const s = [slot({ sets: 4 }), slot({ slotId: 'b', sets: 4 })];
    expect(planWeek(base({ feedback: fb, slots: s, momentum: true })).muscles[0]!.delta).toBe(1);
    expect(planWeek(base({ feedback: fb, slots: s, momentum: false })).muscles[0]!.delta).toBe(0);
  });
  it('overflows past the session cap', () => {
    const plan = planWeek(base({ sessionCap: 4, feedback: { quads: { soreness: 'early', workload: 'easy', pumps: [2], performance: 'held' } } }));
    expect(plan.overflow[0]!.explanation).toContain('session cap');
  });
  it('triggers an early deload after two very bad weeks', () => {
    const fb = { quads: { soreness: 'still' as const, workload: 'tooMuch' as const, pumps: [2 as const], performance: null } };
    const plan = planWeek(base({ feedback: fb, history: { quads: { scores: [-4], stillSoreCount: 1 } } }));
    expect(plan.deload.muscles).toEqual(['quads']);
    expect(plan.deload.explanation).toBe('quads is not recovering between sessions. Deload those muscles this week.');
  });
  it('suggests swaps for joint pain', () => {
    const plan = planWeek(base({ slots: [slot({ pain: 'lot', exerciseName: 'Lunge' }), slot({ slotId: 'b', somePainCount: 2, exerciseName: 'Squat' })] }));
    expect(plan.swaps.map((s) => s.exerciseName)).toEqual(['Lunge', 'Squat']);
  });
  it('never places sets on a painful slot', () => {
    const plan = planWeek(base({ slots: [slot({ slotId: 'bad', pain: 'lot', pump: 3, sets: 4 }), slot({ slotId: 'ok', pump: 1, sets: 4 })], feedback: { quads: { soreness: 'early', workload: 'right', pumps: [2], performance: 'held' } } }));
    expect(plan.slotChanges).toEqual([{ slotId: 'ok', delta: 1, muscle: 'quads' }]);
  });
});

describe('learning landmarks', () => {
  it('pulls MRV toward where it got too much', () => {
    const l = learnLandmarks({ mev: 8, mav: 14, mrv: 20 }, { weeklySets: [8, 10, 12, 14], scores: [2, 1, 0, -3] });
    expect(l.landmarks.mrv).toBe(17);
    expect(l.nextStartSets).toBe(9);
    expect(l.explanation).toBe('MRV 20 → 17: 14 sets felt like too much');
  });
  it('raises MRV when you reached it and recovered', () => {
    expect(learnLandmarks({ mev: 8, mav: 14, mrv: 16 }, { weeklySets: [10, 12, 14, 16], scores: [2, 2, 1, 0] }).landmarks.mrv).toBe(17);
  });
});

it('builds an end-of-meso report', () => {
  const r = buildMesoReport(
    4,
    { quads: { weeklySets: [8, 10, 12, 13], scores: [2, 1, 1, 0] } },
    [
      { exerciseId: 'sq', name: 'Squat', e1rmStart: 140000, e1rmEnd: 147000, pumps: [2, 2], pains: ['none'] },
      { exerciseId: 'lunge', name: 'Lunge', e1rmStart: null, e1rmEnd: null, pumps: [3], pains: ['some', 'some'] },
    ],
    DEFAULT_LANDMARKS,
  );
  expect(r.headline).toBe('4 weeks done. 1 of 2 lifts went up.');
  expect(r.lifts[0]!.changePct).toBeCloseTo(0.05);
  expect(r.bestPump[0]!.name).toBe('Lunge');
  expect(r.painFlags.map((p) => p.name)).toEqual(['Lunge']);
});
