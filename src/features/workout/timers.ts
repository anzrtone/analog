// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { settings } from '@/db/settings';
import { sampleShown } from '@/db/shown';
import { adjustRest, startRest, type RestState } from '@/engine/timer/rest';
import { idleStopwatch, startStopwatch, stopStopwatch, tick, type StopwatchState } from '@/engine/timer/stopwatch';
import { platform } from '@/platform';
import { createStore } from '../store';

// The rest timer and the AMTAP stopwatch. Both are timestamps in the page, mirrored on the lock screen by the
// platform bridge (the tour's sample never reaches the lock screen).

const native = () => (sampleShown() ? null : platform());

export const rest = createStore<{ rest: RestState | null; next: string }>({ rest: null, next: '' });

export const restTimer = {
  start(durationMs: number, next: string) {
    if (durationMs <= 0) return restTimer.skip();
    const r = startRest(Date.now(), durationMs);
    rest.set({ rest: r, next });
    native()?.startRest(r.endsAt, 'Rest', next, settings().restSound);
  },
  adjust(deltaMs: number) {
    const { rest: r, next } = rest.get();
    if (!r) return;
    rest.set({ rest: adjustRest(r, deltaMs, Date.now()), next });
    native()?.adjustRest(deltaMs);
  },
  skip() {
    rest.set({ rest: null, next: '' });
    native()?.cancelRest();
  },
  /** Rest ran out while the app was open. */
  finish() {
    rest.set({ rest: null, next: '' });
  },
};

export const stopwatch = createStore<{ setId: string | null; sw: StopwatchState }>({ setId: null, sw: idleStopwatch });

export const holdTimer = {
  start(setId: string, countdown: boolean, title: string, line: string) {
    const sw = startStopwatch(Date.now(), countdown);
    stopwatch.set({ setId, sw });
    native()?.showStopwatch(sw.startedAt!, title, line);
  },
  tick() {
    const cur = stopwatch.get();
    const sw = tick(cur.sw, Date.now());
    if (sw !== cur.sw) stopwatch.set({ ...cur, sw });
  },
  stopAt(at: number) {
    const cur = stopwatch.get();
    stopwatch.set({ ...cur, sw: stopStopwatch(tick(cur.sw, at), at) });
    native()?.cancelStopwatch();
  },
  reset() {
    stopwatch.set({ setId: null, sw: idleStopwatch });
    native()?.cancelStopwatch();
  },
};

/** Lock-screen taps made while the app slept, replayed on resume. The native side already moved its own timer. */
export async function applyNativeActions(): Promise<void> {
  for (const a of await platform().drainActions()) applyNativeAction(a);
}

export function applyNativeAction(a: { action: string; at: number }): void {
  const { rest: r, next } = rest.get();
  if (a.action === 'plus15' && r) rest.set({ rest: { ...r, endsAt: r.endsAt + 15000 }, next });
  else if (a.action === 'minus15' && r) rest.set({ rest: { ...r, endsAt: Math.max(a.at, r.endsAt - 15000) }, next });
  else if (a.action === 'skip' || a.action === 'restOver') rest.set({ rest: null, next: '' });
  else if (a.action === 'stop') holdTimer.stopAt(a.at);
}
