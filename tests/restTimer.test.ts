// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dev } from '@/platform/dev';
import { __setPlatform } from '@/platform';
import { applyNativeAction, rest, restTimer } from '@/features/workout/timers';

describe('rest timer: rest over', () => {
  beforeEach(() => {
    __setPlatform(dev);
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    restTimer.skip();
  });
  afterEach(() => {
    restTimer.skip();
    vi.useRealTimers();
  });

  it('keeps the bar when rest runs out, until Go', () => {
    restTimer.start(60_000, 'next 50 × 8');
    expect(rest.get().over).toBe(false);
    vi.setSystemTime(1_070_000);
    restTimer.finish();
    expect(rest.get().over).toBe(true);
    expect(rest.get().rest).not.toBeNull();
    expect(rest.get().next).toBe('next 50 × 8');
    restTimer.skip();
    expect(rest.get()).toEqual({ rest: null, next: '', over: false, weId: null });
  });

  it('+30 after rest is over starts a fresh 30 s rest from now; more taps stack on it', () => {
    restTimer.start(60_000, 'next 50 × 8');
    vi.setSystemTime(1_100_000);
    restTimer.finish();
    restTimer.adjust(30_000);
    let r = rest.get();
    expect(r.over).toBe(false);
    expect(r.rest!.endsAt).toBe(1_130_000);
    restTimer.adjust(15_000);
    restTimer.adjust(15_000);
    r = rest.get();
    expect(r.rest!.endsAt).toBe(1_160_000);
    expect(r.next).toBe('next 50 × 8');
  });

  it('−15 does nothing once rest is over', () => {
    restTimer.start(10_000, 'x');
    vi.setSystemTime(1_020_000);
    restTimer.finish();
    const before = rest.get().rest;
    restTimer.adjust(-15_000);
    expect(rest.get().rest).toBe(before);
    expect(rest.get().over).toBe(true);
  });

  it('a typed time restarts the countdown from now, even after rest is over', () => {
    restTimer.start(60_000, 'x');
    vi.setSystemTime(1_090_000);
    restTimer.finish();
    restTimer.restFor(150_000);
    expect(rest.get().over).toBe(false);
    expect(rest.get().rest!.endsAt).toBe(1_240_000);
  });

  it('the alert\'s own buttons restart rest from when they were tapped; the alarm marks it over instead of dropping it', () => {
    restTimer.start(60_000, 'x');
    applyNativeAction({ action: 'restOver', at: 1_060_000 });
    expect(rest.get().over).toBe(true);
    applyNativeAction({ action: 'over30', at: 1_065_000 });
    expect(rest.get().over).toBe(false);
    expect(rest.get().rest!.endsAt).toBe(1_095_000);
    applyNativeAction({ action: 'skip', at: 1_070_000 });
    expect(rest.get().rest).toBeNull();
  });

  it("changing the exercise's rest retimes the running rest from when it began", () => {
    restTimer.start(60_000, 'x', 'we1');
    vi.setSystemTime(1_040_000);
    restTimer.retimeFor('we1', 120_000);
    expect(rest.get().rest!.endsAt).toBe(1_120_000);
    restTimer.retimeFor('other', 10_000);
    expect(rest.get().rest!.endsAt).toBe(1_120_000);
    restTimer.retimeFor('we1', 30_000);
    expect(rest.get().rest!.endsAt).toBe(1_040_000);
  });

  it('a typed time keeps the exercise the rest follows', () => {
    restTimer.start(60_000, 'x', 'we1');
    restTimer.restFor(90_000);
    expect(rest.get().weId).toBe('we1');
  });
});
