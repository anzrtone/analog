// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import type { Muscle } from '../types';

export type Pump = 0 | 1 | 2 | 3;
export type JointPain = 'none' | 'some' | 'lot';
export type Workload = 'easy' | 'right' | 'pushed' | 'tooMuch';
export type Soreness = 'never' | 'early' | 'justInTime' | 'still';
export type Performance = 'held' | 'dropped';

export interface Landmarks {
  mev: number;
  mav: number;
  mrv: number;
}

/** Feedback gathered the last time a muscle was trained (all optional: every prompt can be skipped). */
export interface MuscleFeedback {
  soreness: Soreness | null;
  workload: Workload | null;
  /** One pump rating per exercise that trained the muscle. */
  pumps: Pump[];
  performance: Performance | null;
}

export interface MuscleScore {
  muscle: Muscle;
  score: number;
  /** "healed early", "easy workload"… in the order they were scored. */
  reasons: string[];
  /** True when every prompt was skipped, so the score means nothing. */
  empty: boolean;
}

/** A slot in this week's plan that trains the muscle as a primary mover. */
export interface PlanSlot {
  slotId: string;
  exerciseId: string;
  exerciseName: string;
  dayId: string;
  dayName: string;
  primary: Muscle[];
  sets: number;
  /** Average recent pump on this slot, null if unknown. */
  pump: number | null;
  pain: JointPain | null;
  /** How many recent sessions reported "some" pain. */
  somePainCount: number;
}

export interface MuscleHistory {
  /** Scores from previous weeks of this meso, oldest first. */
  scores: number[];
  /** Times "still sore" was reported this meso. */
  stillSoreCount: number;
}

export interface WeekPlanInput {
  /** 1-based meso week that is about to start. */
  week: number;
  slots: PlanSlot[];
  feedback: Partial<Record<Muscle, MuscleFeedback>>;
  history: Partial<Record<Muscle, MuscleHistory>>;
  landmarks: Record<Muscle, Landmarks>;
  /** Most sets you want in one session. */
  sessionCap: number;
  /** +1 set in week 2 at MEV even on a 0 score, to keep momentum. */
  momentum: boolean;
  /** "program" deloads everything when any muscle needs it; "muscle" deloads just that muscle. */
  deloadScope: 'muscle' | 'program';
}

export interface MuscleChange {
  muscle: Muscle;
  from: number;
  to: number;
  delta: number;
  score: number;
  flag: 'approachingMrv' | 'atMrv' | 'atMev' | null;
  explanation: string;
}

export interface SlotChange {
  slotId: string;
  delta: number;
  muscle: Muscle;
}

export interface SwapSuggestion {
  slotId: string;
  exerciseName: string;
  explanation: string;
}

export interface WeekPlan {
  muscles: MuscleChange[];
  slotChanges: SlotChange[];
  /** Explanation cards, e.g. "Quads +1 set (Wed leg extension): healed early + easy workload." */
  cards: string[];
  swaps: SwapSuggestion[];
  /** Sets that didn't fit under the session cap. */
  overflow: { muscle: Muscle; sets: number; explanation: string }[];
  deload: { muscles: Muscle[]; program: boolean; explanation: string | null };
  /** Updated per-muscle history to store for next week. */
  history: Partial<Record<Muscle, MuscleHistory>>;
}
