// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { formatClock } from '../math/units';

// AMTAP stopwatch: open-ended time to failure, built on timestamps.

export type StopwatchPhase = 'idle' | 'countdown' | 'running' | 'stopped';

export interface StopwatchState {
  phase: StopwatchPhase;
  /** When the 3-2-1 countdown started. */
  countdownAt: number | null;
  /** When the clock started counting up. */
  startedAt: number | null;
  stoppedAt: number | null;
}

export const COUNTDOWN_MS = 3000;

export const idleStopwatch: StopwatchState = { phase: 'idle', countdownAt: null, startedAt: null, stoppedAt: null };

export function startStopwatch(now: number, withCountdown: boolean): StopwatchState {
  return withCountdown
    ? { phase: 'countdown', countdownAt: now, startedAt: now + COUNTDOWN_MS, stoppedAt: null }
    : { phase: 'running', countdownAt: null, startedAt: now, stoppedAt: null };
}

/** Moves countdown → running once the countdown has passed. */
export function tick(state: StopwatchState, now: number): StopwatchState {
  if (state.phase === 'countdown' && state.startedAt != null && now >= state.startedAt) return { ...state, phase: 'running' };
  return state;
}

export function stopStopwatch(state: StopwatchState, now: number): StopwatchState {
  if (state.phase === 'countdown') return idleStopwatch;
  if (state.phase !== 'running') return state;
  return { ...state, phase: 'stopped', stoppedAt: now };
}

export function elapsedMs(state: StopwatchState, now: number): number {
  if (state.startedAt == null) return 0;
  const end = state.stoppedAt ?? now;
  return Math.max(0, end - state.startedAt);
}

/** 3, 2, 1 during the countdown. */
export function countdownSecond(state: StopwatchState, now: number): number | null {
  if (state.phase !== 'countdown' || state.startedAt == null) return null;
  return Math.max(1, Math.ceil((state.startedAt - now) / 1000));
}

export type Cue = 'target' | 'best';

/** Cues crossed between two ticks, so a cue fires once even if a frame is dropped. */
export function cuesCrossed(prevElapsed: number, elapsed: number, targetMs: number | null, bestMs: number | null): Cue[] {
  const out: Cue[] = [];
  if (targetMs != null && prevElapsed < targetMs && elapsed >= targetMs) out.push('target');
  if (bestMs != null && prevElapsed < bestMs && elapsed >= bestMs) out.push('best');
  return out;
}

/** "Last: 1:12 · Best: 1:20 · Target: 1:15+" */
export function targetLine(lastMs: number | null, bestMs: number | null, targetMs: number | null): string {
  const parts: string[] = [];
  if (lastMs != null) parts.push(`Last: ${formatClock(lastMs)}`);
  if (bestMs != null) parts.push(`Best: ${formatClock(bestMs)}`);
  if (targetMs != null) parts.push(`Target: ${formatClock(targetMs)}+`);
  return parts.join(' · ');
}

export interface Imbalance {
  flagged: boolean;
  weakerSide: 'L' | 'R' | null;
  pct: number;
  message: string | null;
}

/** Flags left/right differences over 15% (of the stronger side). */
export function sideImbalance(left: number | null, right: number | null, threshold = 0.15): Imbalance {
  if (!left || !right) return { flagged: false, weakerSide: null, pct: 0, message: null };
  const hi = Math.max(left, right);
  const pct = Math.abs(left - right) / hi;
  const weakerSide = left < right ? 'L' : left > right ? 'R' : null;
  const flagged = pct > threshold;
  return {
    flagged,
    weakerSide,
    pct,
    message: flagged ? `${weakerSide === 'L' ? 'Left' : 'Right'} side is ${Math.round(pct * 100)}% behind. Start with that side next time.` : null,
  };
}
