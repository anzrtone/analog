// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import type { DeloadStyle, RuleParams, RuleState } from '../progression';
import type { SetType } from '../setTypes';
import type { GroupKind } from '../timer/rest';
import type { Muscle } from '../types';

export interface ProgramSet {
  type: SetType;
  reps: number | null;
  repsMax: number | null;
  rir: number | null;
  /** Fraction of training max, for % programs. */
  pct: number | null;
  timeMs: number | null;
}

export interface Slot {
  id: string;
  exerciseId: string;
  groupId: string | null;
  sets: ProgramSet[];
  rule: RuleParams;
  restMs: number | null;
  note: string | null;
}

export interface Day {
  id: string;
  name: string;
  /** 0 = Monday. Null in rotation programs. */
  weekday: number | null;
  slots: Slot[];
}

export interface SlotOverride {
  sets?: ProgramSet[];
  rule?: RuleParams;
  exerciseId?: string;
}

export type Goal = 'hypertrophy' | 'strength' | 'peaking' | 'general';

export interface Block {
  id: string;
  name: string;
  goal: Goal;
  /** Training weeks, not counting the deload. */
  weeks: number;
  deloadWeek: boolean;
  /** Run the adaptive-volume algorithm on this block. */
  adaptive: boolean;
  days: Day[];
  /** weekIndex (0-based) → slotId → override. E.g. week 4 = AMRAP test. */
  overrides: Record<number, Record<string, SlotOverride>>;
}

export interface GroupDef {
  kind: GroupKind;
  restMs: number;
  transitionMs: number;
  rounds?: number;
}

export interface MesoSettings {
  sessionCap: number;
  momentum: boolean;
  deloadScope: 'muscle' | 'program';
  deloadStyle: DeloadStyle;
}

export interface Program {
  id: string;
  name: string;
  notes: string;
  schedule: 'rotation' | 'weekdays';
  blocks: Block[];
  groups: Record<string, GroupDef>;
  meso: MesoSettings;
}

/** A started copy of a program. The engine writes into it after each session. */
export interface RunState {
  blockIndex: number;
  weekIndex: number;
  /** Next day in rotation. */
  dayIndex: number;
  /** slotId → rule state (loads, stall counters, TMs). */
  slots: Record<string, RuleState>;
  /** slotId → set count from the adaptive volume plan. */
  slotSets: Record<string, number>;
  /** slotId → swapped exercise for the rest of the meso. */
  swaps: Record<string, string>;
  /** Adaptive-volume history per muscle. */
  muscleHistory: Partial<Record<Muscle, { scores: number[]; stillSoreCount: number }>>;
  /** Weekly sets per muscle recorded for the meso report. */
  weeklySets: Partial<Record<Muscle, number[]>>;
  /** Muscles in an early deload this week. */
  deloadMuscles: Muscle[];
  deloadProgram: boolean;
  /** What the weekly volume plan changed, shown as explanation cards. */
  lastPlan?: { week: number; cards: string[]; swaps: { slotId: string; explanation: string }[]; overflow: string[]; deload: string | null };
  /** Finished mesos, for the report screen. */
  mesosDone?: number;
  /** The last end-of-meso report, kept for the report screen and its share card. */
  lastReport?: import('../meso/report').MesoReport;
}

export const DEFAULT_MESO: MesoSettings = { sessionCap: 24, momentum: true, deloadScope: 'muscle', deloadStyle: 'volume' };

export function emptyRunState(): RunState {
  return { blockIndex: 0, weekIndex: 0, dayIndex: 0, slots: {}, slotSets: {}, swaps: {}, muscleHistory: {}, weeklySets: {}, deloadMuscles: [], deloadProgram: false };
}
