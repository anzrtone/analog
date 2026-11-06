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

/**
 * `over` is rest that has run out but hasn't been dealt with: the bar stays, counting up, until Go, more rest, or the
 * next set is ticked. Nothing is lost if you look at the phone late.
 */
export const rest = createStore<{ rest: RestState | null; next: string; over: boolean; weId: string | null }>({ rest: null, next: '', over: false, weId: null });

export const restTimer = {
  /** `weId`: the workout exercise this rest follows, when its own rest length drives it (not a superset's). */
  start(durationMs: number, next: string, weId: string | null = null) {
    if (durationMs <= 0) return restTimer.skip();
    const r = startRest(Date.now(), durationMs);
    rest.set({ rest: r, next, over: false, weId });
    native()?.startRest(r.endsAt, 'Rest', next, settings().restSound);
  },
  /** Rest for exactly this long from now (typed time, or more rest once it has run out). */
  restFor(durationMs: number) {
    const { next, weId } = rest.get();
    restTimer.start(durationMs, next, weId);
  },
  /**
   * The rest length of the exercise this rest follows was changed mid-rest: the running rest takes the new total,
   * counted from when it began (40 s in, a new 2:00 leaves 1:20; a new 0:30 ends it).
   */
  retimeFor(weId: string, totalMs: number) {
    const cur = rest.get();
    if (!cur.rest || cur.over || cur.weId !== weId) return;
    const endsAt = Math.max(Date.now(), cur.rest.startedAt + totalMs);
    rest.set({ ...cur, rest: { ...cur.rest, endsAt, plannedMs: totalMs } });
    native()?.startRest(endsAt, 'Rest', cur.next, settings().restSound);
  },
  /** −15 / +15 and the keyboard. Once rest is over there's nothing to take away; more time starts a fresh rest. */
  adjust(deltaMs: number) {
    const { rest: r, next, over } = rest.get();
    if (!r) return;
    if (over) return deltaMs > 0 ? restTimer.restFor(deltaMs) : undefined;
    rest.set({ ...rest.get(), rest: adjustRest(r, deltaMs, Date.now()), next, over: false });
    native()?.adjustRest(deltaMs);
  },
  skip() {
    rest.set({ rest: null, next: '', over: false, weId: null });
    native()?.cancelRest();
  },
  /** Rest ran out. The bar stays as "rest over" until the lifter moves on. */
  finish() {
    const cur = rest.get();
    if (cur.rest) rest.set({ ...cur, over: true });
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
  if (a.action === 'plus15' && r) rest.set({ ...rest.get(), rest: { ...r, endsAt: r.endsAt + 15000 }, next, over: false });
  else if (a.action === 'minus15' && r) rest.set({ ...rest.get(), rest: { ...r, endsAt: Math.max(a.at, r.endsAt - 15000) }, next, over: false });
  else if ((a.action === 'over15' || a.action === 'over30') && r) rest.set({ ...rest.get(), rest: { startedAt: a.at, endsAt: a.at + (a.action === 'over15' ? 15000 : 30000), plannedMs: a.action === 'over15' ? 15000 : 30000 }, next, over: false });
  else if (a.action === 'skip') rest.set({ rest: null, next: '', over: false, weId: null });
  else if (a.action === 'restOver') restTimer.finish();
  else if (a.action === 'stop') holdTimer.stopAt(a.at);
}
