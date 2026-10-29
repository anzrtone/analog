// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import type { SetType } from '../setTypes';
import type { WeightUnit } from '../types';

/** One set the engine wants you to do next time. */
export interface SetTarget {
  type: SetType;
  weightG: number | null;
  reps: number | null;
  /** Top of a rep range, shown as "8–12". */
  repsMax?: number | null;
  rir: number | null;
  timeMs?: number | null;
}

/** What actually happened to one set of this slot in a past session. */
export interface PerformedSet {
  type: SetType;
  weightG: number | null;
  reps: number | null;
  rir: number | null;
  timeMs: number | null;
}

export interface SessionResult {
  date: number;
  sets: PerformedSet[];
}

export type RuleType = 'linear' | 'double' | 'triple' | 'rpe' | 'tm' | 'time' | 'topBackoff' | 'meso' | 'manual';

export interface LinearParams {
  type: 'linear';
  sets: number;
  reps: number;
  rir: number | null;
  failThreshold: number;
  deloadPct: number;
}

export interface DoubleParams {
  type: 'double';
  sets: number;
  repsMin: number;
  repsMax: number;
  rir: number | null;
}

export interface TripleParams {
  type: 'triple';
  setsMin: number;
  setsMax: number;
  repsMin: number;
  repsMax: number;
  rir: number | null;
}

export interface RpeParams {
  type: 'rpe';
  sets: number;
  reps: number;
  rir: number;
  /** How many recent sessions feed the e1RM (best set from each, averaged). */
  lookback: number;
}

export interface TmWeekSet {
  pct: number;
  reps: number;
  amrap?: boolean;
}

export interface TmParams {
  type: 'tm';
  /** Week-by-week percentage waves, cycled. */
  weeks: TmWeekSet[][];
  tmIncrementG: number;
  /** Reps beyond the AMRAP set's prescription needed to raise the TM (e.g. 5+ needs 5 + 2 = 7). */
  amrapExtra: number;
  /** TM drop when the AMRAP falls well short. */
  dropPct: number;
  /** Starting training max, set in the program builder. */
  startTmG?: number | null;
}

export interface TimeParams {
  type: 'time';
  sets: number;
  timeMinMs: number;
  timeMaxMs: number;
  stepMs: number;
  loadStepG: number;
  /** Harder variations to move to instead of adding load (exercise ids). */
  ladder: string[];
  failThreshold: number;
}

export interface TopBackoffParams {
  type: 'topBackoff';
  topReps: number;
  topRir: number;
  backoffSets: number;
  backoffReps: number;
  /** Back-off load = top × (1 − pct). */
  backoffPct: number;
}

export interface MesoParams {
  type: 'meso';
  repsMin: number;
  repsMax: number;
}

export interface ManualParams {
  type: 'manual';
}

export type RuleParams =
  | LinearParams
  | DoubleParams
  | TripleParams
  | RpeParams
  | TmParams
  | TimeParams
  | TopBackoffParams
  | MesoParams
  | ManualParams;

/** Per-slot memory kept on the program run between sessions. */
export interface RuleState {
  loadG: number | null;
  reps?: number | null;
  sets?: number | null;
  fails: number;
  tmG?: number | null;
  week?: number;
  targetMs?: number | null;
  ladderIndex?: number;
}

export interface EngineSettings {
  unit: WeightUnit;
  incrementG: number;
  /** Rounds a raw load to what the gym can give you. */
  round: (grams: number) => number;
  /** Largest jump allowed from one session to the next, as a fraction. */
  maxJumpPct: number;
  /** Meso week RIR target, when the slot runs inside a mesocycle. */
  mesoRir?: number | null;
}

export interface RuleInput<P extends RuleParams = RuleParams> {
  params: P;
  /** Oldest first. Only this slot's working sets. */
  history: SessionResult[];
  state: RuleState;
  settings: EngineSettings;
}

export type ProgressionEvent = 'start' | 'increase' | 'hold' | 'deload' | 'addReps' | 'addSet' | 'addTime' | 'nextVariation' | 'manual';

export interface RuleOutput {
  targets: SetTarget[];
  state: RuleState;
  event: ProgressionEvent;
  /** Short margin note: "+2.5 kg · hit 3 × 10 at 2 RIR last week". */
  explanation: string;
  /** The full rule, shown when the margin note is tapped. */
  detail: string;
}

export const initialState: RuleState = { loadG: null, fails: 0 };
