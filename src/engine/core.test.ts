// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { rankSubstitutes, muscleOverlap } from './exercises/substitutes';
import { detectPrs, repMaxTable } from './prs/detect';
import { prEligibleTypes, registerCustomSetTypes, SET_TYPE_INFO, setTypeInfo, SET_TYPES, setVolumeCredit } from './setTypes';
import { makeExercise, makeSet } from './testing/fixtures';
import { adjustRest, groupLabels, isRestOver, nextAfter, pulseSecond, remainingMs, ringFraction, startRest, type SequenceGroup } from './timer/rest';
import { cuesCrossed, elapsedMs, sideImbalance, startStopwatch, stopStopwatch, targetLine, tick } from './timer/stopwatch';
import { countVolume, isoWeekKey, volumeLoadG, weeklyVolume } from './volume/count';

describe('set types', () => {
  it('has 20+ types, each with a non-colour cue (letter, glyph or set number)', () => {
    expect(SET_TYPES.length).toBeGreaterThanOrEqual(20);
    for (const t of SET_TYPES) {
      const i = setTypeInfo(t);
      expect(i.letter !== null || i.glyph !== undefined || i.ring === 'ink').toBe(true);
    }
  });
  it('follows the BRAND colour map', () => {
    expect(SET_TYPE_INFO.top.ring).toBe('red');
    expect(SET_TYPE_INFO.amtap.ring).toBe('red');
    expect(SET_TYPE_INFO.backoff.ring).toBe('blue');
    expect(SET_TYPE_INFO.myo.ring).toBe('yellow');
    expect(SET_TYPE_INFO.warmup.ring).toBe('white');
    expect(SET_TYPE_INFO.working.ring).toBe('ink');
  });
  it('red types never share a cue with each other', () => {
    const red = SET_TYPES.filter((t) => setTypeInfo(t).ring === 'red').map((t) => setTypeInfo(t).letter ?? setTypeInfo(t).glyph);
    expect(new Set(red).size).toBe(red.length);
  });
  it('credits volume', () => {
    expect(setVolumeCredit('warmup', 0)).toBe(0);
    expect(setVolumeCredit('working', 0)).toBe(1);
    expect(setVolumeCredit('drop', 3)).toBe(1);
    expect(setVolumeCredit('myo', 4)).toBe(1.99);
  });
});

describe('volume', () => {
  const ex = new Map([
    ['bench', makeExercise()],
    ['curl', makeExercise({ id: 'curl', primary: ['biceps'], secondary: ['forearmFlexors'], secondaryCredit: 0.25, unilateral: true })],
  ]);
  it('gives primary 1 and secondary 0.5', () => {
    const v = countVolume([makeSet(), makeSet(), makeSet({ type: 'warmup' })], ex);
    expect(v).toEqual({ chest: 2, triceps: 1, frontDelts: 1 });
  });
  it('honours per-exercise secondary credit and unilateral pairs', () => {
    const v = countVolume([makeSet({ exerciseId: 'curl', side: 'L' }), makeSet({ exerciseId: 'curl', side: 'R' })], ex);
    expect(v).toEqual({ biceps: 1, forearmFlexors: 0.25 });
  });
  it('skips sets that are not ticked', () => {
    expect(countVolume([makeSet({ completedAt: null })], ex)).toEqual({});
  });
  it('sums tonnage including segments', () => {
    const drop = makeSet({ type: 'drop', weightG: 50000, reps: null, segments: [{ weightG: 50000, reps: 10, restMs: 0 }, { weightG: 35000, reps: 8, restMs: 0 }] });
    expect(volumeLoadG([makeSet({ weightG: 100000, reps: 5 }), drop, makeSet({ type: 'warmup' })])).toBe(500000 + 500000 + 280000);
  });
  it('adds the main set to its segments in tonnage and myo credit', () => {
    const myo = makeSet({ type: 'myo', weightG: 20000, reps: 12, segments: [{ weightG: null, reps: 4, restMs: null }, { weightG: null, reps: 4, restMs: null }] });
    expect(volumeLoadG([myo])).toBe(20000 * 20);
    expect(countVolume([myo], ex).chest).toBeCloseTo(1.66);
  });
  it('keys ISO weeks', () => {
    expect(isoWeekKey(new Date(2026, 0, 1).getTime())).toBe('2026-W01');
    expect(isoWeekKey(new Date(2026, 9, 28).getTime())).toBe('2026-W44');
    expect(isoWeekKey(new Date(2027, 0, 1).getTime())).toBe('2026-W53');
  });
  it('groups by week', () => {
    const w = weeklyVolume([makeSet({ completedAt: new Date(2026, 9, 26).getTime() }), makeSet({ completedAt: new Date(2026, 10, 3).getTime() })], ex);
    expect([...w.keys()]).toEqual(['2026-W44', '2026-W45']);
  });
});

describe('PR detection', () => {
  const hist = [makeSet({ weightG: 30000, reps: 8, rir: 1 }), makeSet({ weightG: 32500, reps: 5, rir: 1 })];
  it('reports nothing on a first session', () => {
    expect(detectPrs([], [makeSet()], 'kg')).toEqual([]);
  });
  it('finds a rep PR at weight with the BRAND message', () => {
    const prs = detectPrs(hist, [makeSet({ weightG: 30000, reps: 10, rir: 1 })], 'kg');
    const rep = prs.find((p) => p.kind === 'reps');
    expect(rep?.message).toBe('New PR: 30 × 10 (prev 30 × 8)');
  });
  it('finds weight and e1RM PRs once per session', () => {
    const prs = detectPrs(hist, [makeSet({ weightG: 35000, reps: 3, rir: 1 }), makeSet({ weightG: 35000, reps: 2, rir: 1 })], 'kg');
    expect(prs.filter((p) => p.kind === 'weight')).toHaveLength(1);
    expect(prs.find((p) => p.kind === 'weight')?.message).toBe('New PR: 35 kg (prev 32.5 kg)');
  });
  it('ignores warm-ups', () => {
    expect(detectPrs(hist, [makeSet({ type: 'warmup', weightG: 50000, reps: 5 })], 'kg')).toEqual([]);
  });
  it('tracks longest holds per side and load', () => {
    const h = [makeSet({ type: 'amtap', weightG: 0, reps: null, timeMs: 72000, side: 'L' })];
    const prs = detectPrs(h, [makeSet({ type: 'amtap', weightG: 0, reps: null, timeMs: 80000, side: 'L' })], 'kg');
    expect(prs.map((p) => p.message)).toEqual(['Longest hold (L): 1:20 (prev 1:12)']);
    expect(detectPrs(h, [makeSet({ type: 'amtap', weightG: 0, reps: null, timeMs: 80000, side: 'R' })], 'kg')).toEqual([]);
  });
  it('builds a rep-max table', () => {
    const t = repMaxTable([makeSet({ weightG: 100000, reps: 3 }), makeSet({ weightG: 80000, reps: 8 })]);
    expect(t.slice(0, 9)).toEqual([100000, 100000, 100000, 80000, 80000, 80000, 80000, 80000, null]);
  });
});

describe('rest timer', () => {
  it('counts from timestamps', () => {
    const r = startRest(1000, 90000);
    expect(remainingMs(r, 31000)).toBe(60000);
    expect(ringFraction(r, 46000)).toBeCloseTo(0.5);
    expect(isRestOver(r, 91000)).toBe(true);
  });
  it('adjusts by ±15 s without going negative', () => {
    const r = startRest(0, 30000);
    expect(adjustRest(r, 15000, 0).endsAt).toBe(45000);
    expect(adjustRest(r, -60000, 10000).endsAt).toBe(10000);
  });
  it('pulses in the last 3 seconds', () => {
    const r = startRest(0, 10000);
    expect(pulseSecond(r, 7500)).toBe(3);
    expect(pulseSecond(r, 5000)).toBeNull();
  });

  const exs = [
    { key: 'squat', groupId: null, setCount: 2, restMs: 180000 },
    { key: 'a1', groupId: 'g', setCount: 3, restMs: 90000 },
    { key: 'a2', groupId: 'g', setCount: 2, restMs: 90000 },
    { key: 'curl', groupId: null, setCount: 1, restMs: 60000 },
  ];
  const groups = new Map<string, SequenceGroup>([['g', { id: 'g', kind: 'superset', restMs: 120000, transitionMs: 0 }]]);
  it('rests between straight sets', () => {
    expect(nextAfter(exs, groups, { exerciseIndex: 0, setIndex: 0 })).toMatchObject({ next: { exerciseIndex: 0, setIndex: 1 }, restMs: 180000 });
    expect(nextAfter(exs, groups, { exerciseIndex: 0, setIndex: 1 })).toMatchObject({ next: { exerciseIndex: 1, setIndex: 0 } });
  });
  it('goes A1 → A2 with no rest, then rests after the group', () => {
    expect(nextAfter(exs, groups, { exerciseIndex: 1, setIndex: 0 })).toMatchObject({ next: { exerciseIndex: 2, setIndex: 0 }, restMs: 0 });
    expect(nextAfter(exs, groups, { exerciseIndex: 2, setIndex: 0 })).toMatchObject({ next: { exerciseIndex: 1, setIndex: 1 }, restMs: 120000 });
  });
  it('lets the exercise with more sets finish alone', () => {
    expect(nextAfter(exs, groups, { exerciseIndex: 2, setIndex: 1 })).toMatchObject({ next: { exerciseIndex: 1, setIndex: 2 } });
    expect(nextAfter(exs, groups, { exerciseIndex: 1, setIndex: 2 })).toMatchObject({ next: { exerciseIndex: 3, setIndex: 0 }, restMs: 120000 });
  });
  it('ends after the last set', () => {
    expect(nextAfter(exs, groups, { exerciseIndex: 3, setIndex: 0 })).toMatchObject({ next: null, restMs: 0 });
  });
  it('labels groups A1/A2', () => {
    expect(groupLabels(exs)).toEqual([null, 'A1', 'A2', null]);
  });
});

describe('AMTAP stopwatch', () => {
  it('runs a 3-2-1 countdown then counts up', () => {
    let s = startStopwatch(0, true);
    expect(s.phase).toBe('countdown');
    s = tick(s, 3000);
    expect(s.phase).toBe('running');
    s = stopStopwatch(s, 65000);
    expect(elapsedMs(s, 99999)).toBe(62000);
  });
  it('cancels during the countdown', () => {
    expect(stopStopwatch(startStopwatch(0, true), 1000).phase).toBe('idle');
  });
  it('fires each cue once when crossed', () => {
    expect(cuesCrossed(74000, 75100, 75000, 80000)).toEqual(['target']);
    expect(cuesCrossed(75100, 81000, 75000, 80000)).toEqual(['best']);
    expect(cuesCrossed(81000, 82000, 75000, 80000)).toEqual([]);
  });
  it('prints the target line', () => {
    expect(targetLine(72000, 80000, 75000)).toBe('Last: 1:12 · Best: 1:20 · Target: 1:15+');
  });
  it('flags side imbalance over 15%', () => {
    expect(sideImbalance(60000, 50000)).toMatchObject({ flagged: true, weakerSide: 'R' });
    expect(sideImbalance(60000, 55000).flagged).toBe(false);
  });
});

describe('substitutes', () => {
  const bench = makeExercise();
  const db = makeExercise({ id: 'db', name: 'Dumbbell bench press', equipment: 'dumbbell' });
  const fly = makeExercise({ id: 'fly', name: 'Cable fly', secondary: ['frontDelts'], equipment: 'cable' });
  const squat = makeExercise({ id: 'squat', name: 'Squat', primary: ['quads'], secondary: ['glutes'] });
  it('ranks by muscle overlap', () => {
    expect(muscleOverlap(bench, db)).toBe(1);
    expect(rankSubstitutes(bench, [squat, fly, db, bench]).map((s) => s.exercise.id)).toEqual(['db', 'fly']);
  });
});

describe('custom set types', () => {
  it('registers, counts and unregisters', () => {
    registerCustomSetTypes([{ id: 'custom:x', label: 'Mine', hint: '', letter: 'z', glyph: null, ring: 'blue', countsAsVolume: false, prEligible: true, timed: false }]);
    expect(setTypeInfo('custom:x').label).toBe('Mine');
    expect(setVolumeCredit('custom:x', 1)).toBe(0);
    expect(prEligibleTypes()).toContain('custom:x');
    registerCustomSetTypes([]);
    expect(prEligibleTypes()).not.toContain('custom:x');
    expect(setTypeInfo('custom:x').label).toBe('Custom');
  });
});
