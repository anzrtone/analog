// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { defaultParams } from '../progression';
import { advanceRun, endsWeek, metaLine, resolveDay } from './resolve';
import { decodeProgram, encodeProgram, programLink } from './share';
import { DEFAULT_MESO, emptyRunState, type Program } from './types';

const program: Program = {
  id: 'p1',
  name: 'Upper/Lower 4-day hypertrophy',
  notes: '',
  schedule: 'rotation',
  groups: {},
  meso: DEFAULT_MESO,
  blocks: [
    {
      id: 'b1',
      name: 'Block 1',
      goal: 'hypertrophy',
      weeks: 4,
      deloadWeek: true,
      adaptive: true,
      overrides: { 3: { s1: { sets: [{ type: 'amrap', reps: 8, repsMax: null, rir: 0, pct: null, timeMs: null }] } } },
      days: [
        { id: 'd1', name: 'Upper A', weekday: null, slots: [{ id: 's1', exerciseId: 'bench', groupId: null, restMs: null, note: null, rule: defaultParams('double'), sets: [1, 2].map(() => ({ type: 'working' as const, reps: 8, repsMax: 12, rir: 2, pct: null, timeMs: null })) }] },
        { id: 'd2', name: 'Lower A', weekday: null, slots: [] },
      ],
    },
  ],
};

describe('resolving a day', () => {
  it('applies adaptive set counts', () => {
    const run = { ...emptyRunState(), slotSets: { s1: 4 } };
    expect(resolveDay(program, run, 0, 0, 0)!.slots[0]!.sets).toHaveLength(4);
    expect(resolveDay(program, { ...run, slotSets: { s1: 1 } }, 0, 0, 0)!.slots[0]!.sets).toHaveLength(1);
  });
  it('applies week overrides and swaps', () => {
    const run = { ...emptyRunState(), swaps: { s1: 'db-bench' } };
    const d = resolveDay(program, run, 0, 3, 0)!;
    expect(d.slots[0]!.sets[0]!.type).toBe('amrap');
    expect(d.slots[0]!.exerciseId).toBe('db-bench');
  });
  it('marks the deload week', () => {
    expect(resolveDay(program, emptyRunState(), 0, 4, 0)!.deload).toBe(true);
  });
  it('advances through days, weeks and blocks', () => {
    let run = emptyRunState();
    expect(endsWeek(program, run)).toBe(false);
    run = advanceRun(program, run);
    expect(run).toMatchObject({ dayIndex: 1, weekIndex: 0 });
    expect(endsWeek(program, run)).toBe(true);
    run = advanceRun(program, run);
    expect(run).toMatchObject({ dayIndex: 0, weekIndex: 1 });
    for (let i = 0; i < 8; i++) run = advanceRun(program, run);
    expect(run).toMatchObject({ blockIndex: 0, weekIndex: 0, dayIndex: 0 });
  });
  it('writes the log-header meta line', () => {
    expect(metaLine('Push A', 2, program.blocks[0]!, 1)).toBe('PUSH A — W3/5 — 1 RIR');
    expect(metaLine('Push A', 4, program.blocks[0]!, 1)).toBe('PUSH A — W5/5 — DELOAD');
  });
});

describe('sharing', () => {
  it('round-trips through a link', () => {
    const link = programLink({ program, exercises: [] });
    expect(link.startsWith('analog://program?d=')).toBe(true);
    const back = decodeProgram(link);
    expect(back.ok && back.payload.program).toEqual(program);
  });
  it('reads the web fallback link and bare data', () => {
    const data = encodeProgram({ program, exercises: [] });
    expect(decodeProgram(`https://example.org/p/#d=${data}`).ok).toBe(true);
    expect(decodeProgram(data).ok).toBe(true);
  });
  it('stays small enough for a QR code', () => {
    expect(encodeProgram({ program, exercises: [] }).length).toBeLessThan(2900);
  });
  it('explains bad links', () => {
    expect(decodeProgram('analog://program?d=garbage')).toEqual({ ok: false, error: "That link doesn't contain a program." });
  });
});
