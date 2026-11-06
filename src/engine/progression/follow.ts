// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { setTypeInfo, type SetType } from '../setTypes';

// "Next sets follow my last set": in a freestyle workout the rows still to do start from what you just did, not from
// what the same row was last session. A pure rule; the workout flow applies the result.

/** A drop set takes this much off the set before it. */
export const DROP_PCT = 0.2;
/** A back-off after a top set takes this much off (the engine's default back-off). */
export const BACKOFF_PCT = 0.12;

/** Patterns chosen on purpose (weight up, weight down, waves): copying the last set would flatten them. */
const KEEP_SHAPE: SetType[] = ['pyramid', 'reversePyramid', 'wave'];

export interface FollowDone {
  type: SetType;
  weightG: number | null;
  reps: number | null;
}

export interface FollowRow {
  id: string;
  type: SetType;
  weightG: number | null;
  reps: number | null;
  rir: number | null;
  timeMs: number | null;
  targetRir: number | null;
}

export interface FollowPatch {
  id: string;
  targetWeightG: number | null;
  targetReps: number | null;
  targetRir: number | null;
}

/** Rows that take part: not ticked, nothing typed in, plain reps-and-weight sets (not warm-ups, holds or segmented work). */
function follows(r: FollowRow): boolean {
  const info = setTypeInfo(r.type);
  const plainDrop = r.type === 'drop';
  if (r.weightG != null || r.reps != null || r.rir != null || r.timeMs != null) return false;
  if (info.volumeCredit === 0 || info.timed || KEEP_SHAPE.includes(r.type)) return false;
  return !info.segmented || plainDrop;
}

/**
 * New targets for the rows after a set that was just ticked. Working-style sets copy its weight and reps; a drop
 * set takes 20% off; a back-off after a top set takes 12% off. `round` snaps a weight to the gym's plates.
 */
export function followTargets(done: FollowDone, later: FollowRow[], round: (g: number) => number): FollowPatch[] {
  if (done.weightG == null && done.reps == null) return [];
  const out: FollowPatch[] = [];
  // Each row follows the one before it, so a drop after a drop keeps stepping down.
  let prev: FollowDone = done;
  for (const r of later) {
    if (!follows(r)) {
      // A row typed into by hand becomes the new reference; a warm-up or hold leaves the chain as it was.
      if (r.weightG != null || r.reps != null) prev = { type: r.type, weightG: r.weightG ?? prev.weightG, reps: r.reps ?? prev.reps };
      continue;
    }
    let weightG = prev.weightG;
    if (weightG != null) {
      if (r.type === 'drop') weightG = round(weightG * (1 - DROP_PCT));
      else if (r.type === 'backoff' && prev.type === 'top') weightG = round(weightG * (1 - BACKOFF_PCT));
    }
    out.push({ id: r.id, targetWeightG: weightG, targetReps: prev.reps, targetRir: r.targetRir });
    prev = { type: r.type, weightG, reps: prev.reps };
  }
  return out;
}
