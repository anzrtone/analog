// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { applyDeload, defaultParams, initialState, nextTargets, performanceDrop, type EngineSettings, type RuleParams, type RuleState, type SessionResult, type TimeParams } from './index';

const settings: EngineSettings = { unit: 'kg', incrementG: 2500, round: (g) => Math.round(g / 2500) * 2500, maxJumpPct: 0.1 };
const sess = (sets: [number | null, number | null, number | null][], type: 'working' | 'top' | 'backoff' | 'amrap' = 'working', date = 0): SessionResult => ({
  date,
  sets: sets.map(([w, r, rir]) => ({ type, weightG: w, reps: r, rir, timeMs: null })),
});
const run = (params: RuleParams, history: SessionResult[], state: RuleState = initialState, s = settings) => nextTargets({ params, history, state, settings: s });

describe('linear', () => {
  const p = defaultParams('linear');
  it('adds the increment after a clean session and says why', () => {
    const out = run(p, [sess([[80000, 5, 2], [80000, 5, 2], [80000, 5, 2]])]);
    expect(out.event).toBe('increase');
    expect(out.targets).toHaveLength(3);
    expect(out.targets[0]).toMatchObject({ weightG: 82500, reps: 5 });
    expect(out.explanation).toBe('+2.5 kg · hit 3 × 5 last time');
  });
  it('holds after a miss', () => {
    const out = run(p, [sess([[80000, 5, 0], [80000, 4, 0], [80000, 3, 0]])], { loadG: 80000, fails: 0 });
    expect(out).toMatchObject({ event: 'hold', explanation: 'Hold 80 kg · reps dropped to 3 of 5' });
    expect(out.state.fails).toBe(1);
  });
  it('deloads 10% after three misses in a row', () => {
    const out = run(p, [sess([[80000, 4, 0]])], { loadG: 80000, fails: 2 });
    expect(out.event).toBe('deload');
    expect(out.targets[0]!.weightG).toBe(72500);
    expect(out.state.fails).toBe(0);
  });
  it('starts gracefully with no history', () => {
    expect(run(p, []).event).toBe('start');
  });
  it('is deterministic', () => {
    const h = [sess([[80000, 5, 2], [80000, 5, 2], [80000, 5, 2]])];
    expect(run(p, h)).toEqual(run(p, h));
  });
  it('respects the weekly jump cap', () => {
    const big = { ...settings, incrementG: 20000, round: (g: number) => g };
    expect(run(p, [sess([[50000, 5, 2], [50000, 5, 2], [50000, 5, 2]])], initialState, big).targets[0]!.weightG).toBe(55000);
  });
});

describe('double progression', () => {
  const p = defaultParams('double');
  it('adds a rep per set until the top of the range', () => {
    const out = run(p, [sess([[30000, 10, 2], [30000, 9, 2], [30000, 8, 1]])]);
    expect(out.event).toBe('addReps');
    expect(out.targets.map((t) => t.reps)).toEqual([11, 10, 9]);
  });
  it('adds weight and resets reps once every set hits 12', () => {
    const out = run(p, [sess([[30000, 12, 2], [30000, 12, 2], [30000, 12, 2]])]);
    expect(out.targets[0]).toMatchObject({ weightG: 32500, reps: 8, repsMax: 12 });
    expect(out.explanation).toBe('+2.5 kg · hit 3 × 12 at 2 RIR last time');
  });
});

describe('triple progression', () => {
  const p = defaultParams('triple');
  it('adds a set before adding load', () => {
    const out = run(p, [sess([[30000, 12, 2], [30000, 12, 2]])], { loadG: 30000, fails: 0, sets: 2 });
    expect(out.event).toBe('addSet');
    expect(out.targets).toHaveLength(3);
  });
  it('adds load at max sets, back to min sets', () => {
    const out = run(p, [sess([[30000, 12, 2], [30000, 12, 2], [30000, 12, 2], [30000, 12, 2]])], { loadG: 30000, fails: 0, sets: 4 });
    expect(out.event).toBe('increase');
    expect(out.targets).toHaveLength(2);
    expect(out.targets[0]!.weightG).toBe(32500);
  });
});

describe('RIR based', () => {
  const p = defaultParams('rpe');
  it('works out the load from recent e1RM', () => {
    const out = run(p, [sess([[100000, 6, 2]])]);
    // 6 @ 2 RIR = 6 @ RPE 8 → same set again: hold.
    expect(out.targets[0]).toMatchObject({ weightG: 100000, reps: 6, rir: 2 });
    expect(out.explanation).toContain('e1RM');
  });
  it('goes up when the last set had more in the tank', () => {
    const out = run(p, [sess([[100000, 6, 4]])]);
    expect(out.event).toBe('increase');
    expect(out.targets[0]!.weightG).toBeGreaterThan(100000);
  });
  it('uses the meso RIR when running inside a meso', () => {
    const out = run(p, [sess([[100000, 6, 2]])], initialState, { ...settings, mesoRir: 0 });
    expect(out.targets[0]!.rir).toBe(0);
    expect(out.targets[0]!.weightG).toBeGreaterThan(100000);
  });
});

describe('% of training max', () => {
  const p = defaultParams('tm');
  it('asks for a TM first', () => {
    expect(run(p, []).explanation).toContain('training max');
  });
  it('builds weekly percentages from the TM', () => {
    const out = run(p, [], { loadG: null, fails: 0, tmG: 100000, week: 0 });
    expect(out.targets.map((t) => t.weightG)).toEqual([70000, 75000, 80000]);
    expect(out.targets[2]!.type).toBe('amrap');
  });
  it('raises the TM when the AMRAP beats the prescription', () => {
    const out = run(p, [sess([[80000, 9, null]], 'amrap')], { loadG: null, fails: 0, tmG: 100000, week: 0 });
    expect(out.state.tmG).toBe(102500);
    expect(out.state.week).toBe(1);
    expect(out.explanation).toBe('TM +2.5 kg · AMRAP hit 9 (needed 8)');
  });
  it('drops the TM when the AMRAP falls well short', () => {
    const out = run(p, [sess([[80000, 3, null]], 'amrap')], { loadG: null, fails: 0, tmG: 100000, week: 0 });
    expect(out.state.tmG).toBe(90000);
  });
});

describe('time progression', () => {
  const p = defaultParams('time') as TimeParams;
  const holds = (ms: number[]) => ({ date: 0, sets: ms.map((t) => ({ type: 'amtap' as const, weightG: null, reps: null, rir: null, timeMs: t })) });
  it('targets last best + 5 s', () => {
    const out = run(p, [holds([42000, 40000, 38000])], { loadG: 0, fails: 0, targetMs: 40000 });
    expect(out.targets[0]!.timeMs).toBe(47000);
    expect(out.explanation).toBe('Aim for 0:47 · best last time 0:42');
  });
  it('adds load and resets once every set reaches the top of the range', () => {
    const out = run(p, [holds([61000, 60000, 60000])], { loadG: 0, fails: 0, targetMs: 60000 });
    expect(out.event).toBe('increase');
    expect(out.targets[0]).toMatchObject({ weightG: 5000, timeMs: 30000 });
  });
  it('moves up the variation ladder instead when one is set', () => {
    const out = run({ ...p, ladder: ['long-lever-plank'] }, [holds([60000, 60000, 60000])], { loadG: 0, fails: 0, targetMs: 60000 });
    expect(out.event).toBe('nextVariation');
    expect(out.state.ladderIndex).toBe(1);
  });
  it('cuts the target 10% after three misses', () => {
    const out = run(p, [holds([40000])], { loadG: 0, fails: 2, targetMs: 50000 });
    expect(out.event).toBe('deload');
    expect(out.targets[0]!.timeMs).toBe(45000);
  });
});

describe('top set + back-offs', () => {
  const p = defaultParams('topBackoff');
  it('back-offs are 12% under the top set', () => {
    const h: SessionResult = { date: 0, sets: [{ type: 'top', weightG: 140000, reps: 5, rir: 1, timeMs: null }] };
    const out = run(p, [h]);
    expect(out.targets[0]).toMatchObject({ type: 'top', weightG: 140000 });
    expect(out.targets.slice(1).map((t) => t.weightG)).toEqual([122500, 122500, 122500]);
  });
});

describe('meso rule', () => {
  const p = defaultParams('meso');
  it('adds load when last week had reps to spare', () => {
    const out = run(p, [sess([[50000, 10, 3], [50000, 10, 3]])], { loadG: 50000, fails: 0, sets: 3 }, { ...settings, mesoRir: 2 });
    expect(out.event).toBe('increase');
    expect(out.targets).toHaveLength(3);
    expect(out.targets[0]).toMatchObject({ weightG: 52500, reps: 10, rir: 2 });
  });
  it('holds load and reps when reps fell under the range', () => {
    const out = run(p, [sess([[50000, 7, 0], [50000, 6, 0]])], { loadG: 50000, fails: 0, sets: 2 }, { ...settings, mesoRir: 1 });
    expect(out.event).toBe('hold');
    expect(out.targets[0]!.weightG).toBe(50000);
  });
});

describe('manual', () => {
  it('repeats last session without suggestions', () => {
    const out = run({ type: 'manual' }, [sess([[60000, 8, 2]])]);
    expect(out.targets).toEqual([{ type: 'working', weightG: 60000, reps: 8, rir: 2, timeMs: null }]);
  });
});

describe('deloads', () => {
  const targets = [1, 2, 3, 4].map(() => ({ type: 'working' as const, weightG: 100000, reps: 8, rir: 1 }));
  it('default halves the sets, keeps the load, RIR 4+', () => {
    const d = applyDeload(targets, 'volume', settings);
    expect(d.targets).toHaveLength(2);
    expect(d.targets[0]).toMatchObject({ weightG: 100000, rir: 4 });
    expect(d.explanation).toBe('Deload week. Half the sets, same weights. You’ve earned it.');
  });
  it('intensity style keeps sets and cuts load', () => {
    const d = applyDeload(targets, 'intensity', settings);
    expect(d.targets).toHaveLength(4);
    expect(d.targets[0]).toMatchObject({ weightG: 90000, rir: 4 });
  });
  it('detects a two-session e1RM drop', () => {
    const h = [sess([[100000, 5, 1]]), sess([[100000, 3, 0]]), sess([[100000, 3, 0]])];
    expect(performanceDrop(h).triggered).toBe(true);
    expect(performanceDrop(h.slice(0, 2)).triggered).toBe(false);
  });
});
