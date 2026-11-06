// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
// The decisions behind a swipe-to-delete row, apart from the DOM so they can be tested.

/** How far a finger must travel before it's called a swipe or a scroll. */
export const SWIPE_LOCK_PX = 10;
/** Touches starting this close to the screen edge belong to Android's back gesture. */
export const EDGE_GUARD_PX = 24;

export type SwipeIntent = 'undecided' | 'horizontal' | 'vertical';

/** Mostly sideways is a swipe; anything else is the list scrolling and the row lets go. */
export function swipeIntent(dx: number, dy: number): SwipeIntent {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < SWIPE_LOCK_PX && ay < SWIPE_LOCK_PX) return 'undecided';
  return ax > ay * 1.5 ? 'horizontal' : 'vertical';
}

/** Where the row sits for a drag of `dx`: only leftwards, never past its own width. */
export function swipeOffset(dx: number, width: number): number {
  return Math.max(-width, Math.min(0, dx));
}

/** Release past 40% of the width (at least 96 px), or a quick flick past 48 px, counts as "delete". */
export function swipeCommits(offset: number, width: number, velocityPxPerMs: number): boolean {
  const dist = -offset;
  return dist >= Math.max(96, width * 0.4) || (dist >= 48 && velocityPxPerMs <= -0.6);
}
