// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { chartPercent, estimate1rm, loadFor } from './e1rm';
import { DEFAULT_KG_GYM, DEFAULT_LB_GYM, loadBarbell, loadDipBelt, roundToGym } from './plates';
import { formatClock, formatDuration, formatSet, formatWeight, fromGrams, parseWeightInput, toGrams } from './units';
import { generateWarmups } from './warmup';

describe('units', () => {
  it('round-trips kg and lb through grams', () => {
    expect(toGrams(32.5, 'kg')).toBe(32500);
    expect(toGrams(45, 'lb')).toBe(20412);
    expect(fromGrams(20412, 'lb')).toBeCloseTo(45, 2);
  });
  it('formats weights without trailing zeros', () => {
    expect(formatWeight(32500, 'kg')).toBe('32.5');
    expect(formatWeight(100000, 'kg')).toBe('100');
    expect(formatWeight(1250, 'kg')).toBe('1.25');
    expect(formatWeight(20412, 'lb')).toBe('45');
  });
  it('formats sets with a real multiplication sign', () => {
    expect(formatSet(32500, 8, 'kg')).toBe('32.5 × 8');
    expect(formatSet(null, 12, 'kg')).toBe('12');
  });
  it('formats clocks and durations', () => {
    expect(formatClock(84000)).toBe('1:24');
    expect(formatClock(3725000)).toBe('1:02:05');
    expect(formatClock(5430, true)).toBe('0:05.43');
    expect(formatDuration(72 * 60000)).toBe('1 h 12 m');
    expect(formatDuration(45 * 60000)).toBe('45 m');
    expect(formatDuration(30000)).toBe('30 s');
  });
  it('parses comma decimals', () => {
    expect(parseWeightInput('82,5', 'kg')).toBe(82500);
    expect(parseWeightInput('', 'kg')).toBeNull();
    expect(parseWeightInput('abc', 'kg')).toBeNull();
  });
});

describe('e1RM', () => {
  it('reads the RPE chart', () => {
    expect(chartPercent(1, 10)).toBe(1);
    expect(chartPercent(5, 8)).toBeCloseTo(0.811);
    expect(chartPercent(12, 6.5)).toBeCloseTo(0.586);
    expect(chartPercent(13, 10)).toBeNull();
    expect(chartPercent(5, 6)).toBeNull();
  });
  it('a true single is the max', () => {
    expect(estimate1rm(140, 1, 0)).toMatchObject({ e1rm: 140, method: 'single' });
  });
  it('uses the chart inside its range', () => {
    const r = estimate1rm(100, 5, 2);
    expect(r.method).toBe('chart');
    expect(r.e1rm).toBeCloseTo(100 / 0.811, 3);
    expect(r.explanation).toContain('5 reps at 2 RIR');
  });
  it('falls back to Epley past 12 reps', () => {
    const r = estimate1rm(60, 15, 0);
    expect(r.method).toBe('epley');
    expect(r.e1rm).toBeCloseTo(60 * 1.5);
  });
  it('loadFor inverts estimate1rm', () => {
    const e = estimate1rm(100, 8, 2).e1rm;
    expect(loadFor(e, 8, 2)).toBeCloseTo(100, 6);
  });
});

describe('plates', () => {
  const plates = DEFAULT_KG_GYM.plates;
  it('loads exact weights with the fewest plates', () => {
    const r = loadBarbell(100000, 20000, plates);
    expect(r.totalG).toBe(100000);
    expect(r.perSide).toEqual([25000, 15000]);
    expect(r.explanation).toBe('Each side: 25 + 15.');
  });
  it('finds the closest loadable weight', () => {
    const r = loadBarbell(101000, 20000, plates);
    expect(r.totalG).toBe(100000);
    expect(r.explanation).toContain('closest you can load');
    expect(loadBarbell(101000, 20000, plates, 'up').totalG).toBe(102500);
  });
  it('returns the empty bar below bar weight', () => {
    expect(loadBarbell(15000, 20000, plates).perSide).toEqual([]);
  });
  it('respects limited plate counts', () => {
    const r = loadBarbell(70000, 20000, [{ weightG: 20000, count: 2 }, { weightG: 5000, count: 2 }]);
    expect(r.totalG).toBe(70000);
    expect(loadBarbell(120000, 20000, [{ weightG: 20000, count: 2 }]).totalG).toBe(60000);
  });
  it('rounds per equipment', () => {
    expect(roundToGym(23000, 'dumbbell', DEFAULT_KG_GYM)).toBe(22500);
    expect(roundToGym(57000, 'machine', DEFAULT_KG_GYM)).toBe(55000);
    expect(roundToGym(57000, 'machine', DEFAULT_KG_GYM, 'up')).toBe(60000);
    expect(roundToGym(14000, 'kettlebell', DEFAULT_KG_GYM)).toBe(12000);
  });
  it('works in pounds', () => {
    const r = loadBarbell(toGrams(225, 'lb'), DEFAULT_LB_GYM.barG, DEFAULT_LB_GYM.plates, 'nearest', 'lb');
    expect(r.perSide.map((g) => Math.round(fromGrams(g, 'lb')))).toEqual([45, 45]);
  });
});

describe('warm-ups', () => {
  it('ramps 40/60/80% from the empty bar', () => {
    const p = generateWarmups(100000, 'barbell', DEFAULT_KG_GYM);
    expect(p.sets).toEqual([
      { weightG: 20000, reps: 10 },
      { weightG: 40000, reps: 8 },
      { weightG: 60000, reps: 5 },
      { weightG: 80000, reps: 3 },
    ]);
    expect(p.explanation).toBe('40%/60%/80% of 100 kg, rounded to your plates.');
  });
  it('drops steps that round to the same weight or below the bar', () => {
    const p = generateWarmups(30000, 'barbell', DEFAULT_KG_GYM);
    // 40% and 60% are under the bar, so the bar stands in once; 80% (24 kg) rounds to 25.
    expect(p.sets.map((s) => s.weightG)).toEqual([20000, 25000]);
  });
  it('uses the dumbbell rack', () => {
    const p = generateWarmups(30000, 'dumbbell', DEFAULT_KG_GYM);
    expect(p.sets.map((s) => s.weightG)).toEqual([12500, 17500, 25000]);
  });
  it('explains an empty plan', () => {
    expect(generateWarmups(0, 'barbell', DEFAULT_KG_GYM).sets).toEqual([]);
  });
});

describe('dip belt', () => {
  it('loads plates with no bar and no pairing', () => {
    const r = loadDipBelt(25000, DEFAULT_KG_GYM.plates);
    expect(r.totalG).toBe(25000);
    expect(r.perSide.reduce((a, b) => a + b, 0)).toBe(25000);
    expect(roundToGym(25000, 'dipBelt', DEFAULT_KG_GYM)).toBe(25000);
  });
});
