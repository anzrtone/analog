// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { describe, expect, it } from 'vitest';
import { followTargets, type FollowRow } from './follow';

const round = (g: number) => Math.round(g / 2500) * 2500;
const row = (id: string, type: string, extra: Partial<FollowRow> = {}): FollowRow => ({ id, type, weightG: null, reps: null, rir: null, timeMs: null, targetRir: null, ...extra });

describe('next sets follow my last set', () => {
  it('copies weight and reps onto plain rows still to do', () => {
    const out = followTargets({ type: 'working', weightG: 60000, reps: 4 }, [row('a', 'working'), row('b', 'working')], round);
    expect(out).toEqual([
      { id: 'a', targetWeightG: 60000, targetReps: 4, targetRir: null },
      { id: 'b', targetWeightG: 60000, targetReps: 4, targetRir: null },
    ]);
  });
  it('takes 20% off a drop set, and keeps stepping down for a second one', () => {
    const out = followTargets({ type: 'working', weightG: 50000, reps: 7 }, [row('d1', 'drop'), row('d2', 'drop')], round);
    expect(out.map((o) => o.targetWeightG)).toEqual([40000, 32500]);
    expect(out.map((o) => o.targetReps)).toEqual([7, 7]);
  });
  it('takes 12% off a back-off that follows a top set, but not one that follows a back-off', () => {
    const out = followTargets({ type: 'top', weightG: 100000, reps: 5 }, [row('b1', 'backoff'), row('b2', 'backoff')], round);
    expect(out.map((o) => o.targetWeightG)).toEqual([87500, 87500]);
  });
  it('leaves rows you typed into, warm-ups, holds and deliberate shapes alone', () => {
    const out = followTargets(
      { type: 'working', weightG: 60000, reps: 4 },
      [row('typed', 'working', { weightG: 55000 }), row('w', 'warmup'), row('h', 'amtap'), row('p', 'pyramid'), row('ok', 'working')],
      round,
    );
    expect(out.map((o) => o.id)).toEqual(['ok']);
    // The typed row is the reference for what follows it.
    expect(out[0]).toMatchObject({ targetWeightG: 55000, targetReps: 4 });
  });
  it('does nothing when the set just done has no numbers', () => {
    expect(followTargets({ type: 'working', weightG: null, reps: null }, [row('a', 'working')], round)).toEqual([]);
  });
  it('keeps a bodyweight set bodyweight and only carries reps', () => {
    const out = followTargets({ type: 'working', weightG: null, reps: 12 }, [row('a', 'working')], round);
    expect(out).toEqual([{ id: 'a', targetWeightG: null, targetReps: 12, targetRir: null }]);
  });
  it('keeps the row\'s own RIR target', () => {
    const out = followTargets({ type: 'working', weightG: 60000, reps: 4 }, [row('a', 'working', { targetRir: 2 })], round);
    expect(out[0]!.targetRir).toBe(2);
  });
});
