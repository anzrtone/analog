// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { makeSet } from '../testing/fixtures';
import { adherence, averageDurationMs, buildWrapped, calendarDays, e1rmTrend, plannedSessions, tonnageComparison, weekStreak } from './stats';

const day = (y: number, m: number, d: number, h = 18) => new Date(y, m - 1, d, h).getTime();
const w = (id: string, start: number, mins = 60) => ({ id, startedAt: start, endedAt: start + mins * 60000 });

describe('stats', () => {
  it('plans only fully elapsed weeks', () => {
    expect(plannedSessions(day(2026, 10, 1), day(2026, 10, 28), 4)).toBe(12);
    expect(plannedSessions(day(2026, 10, 26), day(2026, 10, 28), 4)).toBe(0);
  });
  it('ignores sessions left open for a day in the average', () => {
    expect(averageDurationMs([w('a', day(2026, 10, 1), 60), w('b', day(2026, 10, 2), 1440)])).toBe(3600000);
  });
  it('streaks beyond a year', () => {
    const ws = Array.from({ length: 70 }, (_, i) => w(String(i), day(2026, 10, 28) - i * 7 * 86400000));
    expect(weekStreak(ws, day(2026, 10, 28))).toBe(70);
  });
  it('counts week streaks, forgiving an empty current week', () => {
    const ws = [w('a', day(2026, 10, 12)), w('b', day(2026, 10, 19)), w('c', day(2026, 10, 21))];
    expect(weekStreak(ws, day(2026, 10, 28))).toBe(2);
    expect(weekStreak(ws, day(2026, 11, 9))).toBe(0);
  });
  it('builds calendar days', () => {
    expect(calendarDays([w('a', day(2026, 10, 28)), w('b', day(2026, 10, 28, 7))]).get('2026-10-28')).toBe(2);
  });
  it('averages durations', () => {
    expect(averageDurationMs([w('a', 0, 60), w('b', 0, 30)])).toBe(45 * 60000);
    expect(averageDurationMs([])).toBeNull();
  });
  it('tracks best e1RM per workout', () => {
    const t = e1rmTrend([
      makeSet({ workoutId: 'w1', weightG: 100000, reps: 5, rir: 0, completedAt: 1 }),
      makeSet({ workoutId: 'w1', weightG: 90000, reps: 5, rir: 0, completedAt: 2 }),
      makeSet({ workoutId: 'w2', weightG: 102500, reps: 5, rir: 0, completedAt: 3 }),
      makeSet({ workoutId: 'w2', type: 'warmup', weightG: 200000, reps: 5, completedAt: 3 }),
    ]);
    expect(t).toHaveLength(2);
    expect(t[1]!.value).toBeGreaterThan(t[0]!.value);
  });
  it('computes adherence', () => {
    expect(adherence(16, 14)).toBeCloseTo(0.875);
    expect(adherence(0, 3)).toBeNull();
  });
  it('compares tonnage to big things', () => {
    expect(tonnageComparison(450000)).toBe('3 blue whales');
    expect(tonnageComparison(6000)).toBe('1 African elephant');
    expect(tonnageComparison(100)).toBe('0.3 grand pianos');
  });
  it('wraps up a year', () => {
    const r = buildWrapped({ workouts: [w('a', day(2026, 10, 26), 90)], tonnageG: 151000000, topLift: null, muscleSets: { chest: 40, quads: 60 }, now: day(2026, 10, 28) });
    expect(r).toMatchObject({ workouts: 1, hours: 1.5, tonnageKg: 151000, comparison: '1 blue whale', mostTrained: 'quads', streak: 1 });
  });
});
