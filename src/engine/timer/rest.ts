// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
// Rest timer, built on timestamps only: the remaining time is always endsAt − now.

export interface RestState {
  startedAt: number;
  endsAt: number;
  /** Length as first set, before −15/+15 taps. */
  plannedMs: number;
}

export function startRest(now: number, durationMs: number): RestState {
  return { startedAt: now, endsAt: now + durationMs, plannedMs: durationMs };
}

export function remainingMs(state: RestState, now: number): number {
  return Math.max(0, state.endsAt - now);
}

/** Fraction of the ring still full, 1 → 0. */
export function ringFraction(state: RestState, now: number): number {
  const total = state.endsAt - state.startedAt;
  return total <= 0 ? 0 : Math.min(1, remainingMs(state, now) / total);
}

/** −15 / +15. Never goes below "now". */
export function adjustRest(state: RestState, deltaMs: number, now: number): RestState {
  return { ...state, endsAt: Math.max(now, state.endsAt + deltaMs) };
}

export function isRestOver(state: RestState, now: number): boolean {
  return now >= state.endsAt;
}

/** How long past the end of rest it is now (0 while rest is still running). */
export function overrunMs(state: RestState, now: number): number {
  return Math.max(0, now - state.endsAt);
}

/** Whole seconds left for the "last 3 s pulse once per second" cue. */
export function pulseSecond(state: RestState, now: number): number | null {
  const left = Math.ceil(remainingMs(state, now) / 1000);
  return left > 0 && left <= 3 ? left : null;
}

// ---- Group-aware sequencing ----

export type GroupKind = 'superset' | 'antagonist' | 'compound' | 'triset' | 'giant' | 'circuit';

export interface SequenceExercise {
  key: string;
  groupId: string | null;
  setCount: number;
  restMs: number;
}

export interface SequenceGroup {
  id: string;
  kind: GroupKind;
  /** Rest after the last exercise of a round (or between circuit rounds). */
  restMs: number;
  /** Short walk between exercises inside the group, usually 0. */
  transitionMs: number;
}

export interface SetPointer {
  exerciseIndex: number;
  setIndex: number;
}

export interface NextStep {
  next: SetPointer | null;
  restMs: number;
  explanation: string;
}

/**
 * After completing `done`, where does the lifter go, and how long do they rest?
 * Straight exercises: next set of the same exercise, then the next exercise.
 * Grouped exercises (A1/A2/A3): set k of A1 → set k of A2 → … → rest → set k+1 of A1.
 * Exercises in a group with fewer sets drop out of later rounds.
 */
export function nextAfter(exercises: SequenceExercise[], groups: Map<string, SequenceGroup>, done: SetPointer): NextStep {
  const ex = exercises[done.exerciseIndex];
  if (!ex) return { next: null, restMs: 0, explanation: 'Workout finished.' };
  const group = ex.groupId ? groups.get(ex.groupId) : undefined;

  if (!group) {
    if (done.setIndex + 1 < ex.setCount) return { next: { exerciseIndex: done.exerciseIndex, setIndex: done.setIndex + 1 }, restMs: ex.restMs, explanation: 'Rest, then the next set.' };
    const nextEx = firstPointerAfterBlock(exercises, done.exerciseIndex);
    return { next: nextEx, restMs: nextEx ? ex.restMs : 0, explanation: nextEx ? 'Exercise done. Rest, then move on.' : 'Last set done.' };
  }

  const members = exercises.map((e, i) => ({ e, i })).filter(({ e }) => e.groupId === group.id);
  const round = done.setIndex;
  const later = members.filter(({ i, e }) => i > done.exerciseIndex && e.setCount > round);
  if (later.length) {
    const target = later[0]!;
    return { next: { exerciseIndex: target.i, setIndex: round }, restMs: group.transitionMs, explanation: 'Grouped: straight to the next exercise.' };
  }
  const nextRound = members.filter(({ e }) => e.setCount > round + 1);
  if (nextRound.length) {
    return {
      next: { exerciseIndex: nextRound[0]!.i, setIndex: round + 1 },
      restMs: group.restMs,
      explanation: group.kind === 'circuit' ? 'Round done. Rest before the next round.' : 'Group done. Rest, then start the next round.',
    };
  }
  const lastIndex = members[members.length - 1]!.i;
  const nextEx = firstPointerAfterBlock(exercises, lastIndex);
  return { next: nextEx, restMs: nextEx ? group.restMs : 0, explanation: nextEx ? 'Group finished. Rest, then move on.' : 'Last set done.' };
}

function firstPointerAfterBlock(exercises: SequenceExercise[], index: number): SetPointer | null {
  const gid = exercises[index]?.groupId;
  for (let i = index + 1; i < exercises.length; i++) {
    const e = exercises[i]!;
    if (gid && e.groupId === gid) continue;
    if (e.setCount > 0) return { exerciseIndex: i, setIndex: 0 };
  }
  return null;
}

/** Group labels in the margin: A1, A2, B1… Ungrouped exercises get null. */
export function groupLabels(exercises: { groupId: string | null }[]): (string | null)[] {
  const letters = new Map<string, string>();
  const counts = new Map<string, number>();
  return exercises.map((e) => {
    if (!e.groupId) return null;
    if (!letters.has(e.groupId)) letters.set(e.groupId, String.fromCharCode(65 + letters.size));
    const n = (counts.get(e.groupId) ?? 0) + 1;
    counts.set(e.groupId, n);
    return `${letters.get(e.groupId)}${n}`;
  });
}

export function groupKindFor(size: number): GroupKind {
  if (size <= 2) return 'superset';
  if (size === 3) return 'triset';
  return 'giant';
}
