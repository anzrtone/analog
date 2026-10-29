// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
// Shared domain types. Weights are stored as integer grams, times as integer milliseconds.

export const MUSCLES = [
  'chest',
  'frontDelts',
  'sideDelts',
  'rearDelts',
  'triceps',
  'biceps',
  'forearmFlexors',
  'forearmExtensors',
  'upperBack',
  'traps',
  'lowerBack',
  'abs',
  'obliques',
  'glutes',
  'quads',
  'hamstrings',
  'adductors',
  'abductors',
  'calves',
  'neckFlexors',
  'neckExtensors',
] as const;
export type Muscle = (typeof MUSCLES)[number];

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'chest',
  frontDelts: 'front delts',
  sideDelts: 'side delts',
  rearDelts: 'rear delts',
  triceps: 'triceps',
  biceps: 'biceps',
  forearmFlexors: 'forearm flexors',
  forearmExtensors: 'forearm extensors',
  upperBack: 'upper back & lats',
  traps: 'traps',
  lowerBack: 'lower back',
  abs: 'abs',
  obliques: 'obliques',
  glutes: 'glutes',
  quads: 'quads',
  hamstrings: 'hamstrings',
  adductors: 'adductors',
  abductors: 'abductors',
  calves: 'calves',
  neckFlexors: 'neck flexors',
  neckExtensors: 'neck extensors',
};

export type LoggingMode = 'weightReps' | 'bodyweight' | 'assisted' | 'time' | 'distance' | 'reps';
export const BUILT_IN_EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'ezBar', 'smith', 'dipBelt'] as const;
/** A built-in kind, 'other', or free text the user typed (a custom piece of equipment). */
export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'kettlebell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'band'
  | 'ezBar'
  | 'smith'
  | 'dipBelt'
  | 'other'
  | (string & {});

const EQUIPMENT_LABEL: Record<string, string> = { ezBar: 'EZ bar', dipBelt: 'Dip belt' };
/** Display name: "EZ bar", "Dip belt", "Barbell", or the user's own text as typed. */
export function equipmentLabel(e: Equipment): string {
  return EQUIPMENT_LABEL[e] ?? (BUILT_IN_EQUIPMENT.includes(e as never) ? e.charAt(0).toUpperCase() + e.slice(1) : e);
}

export interface ExerciseInfo {
  id: string;
  name: string;
  primary: Muscle[];
  secondary: Muscle[];
  /** Set credit given to each secondary muscle. Default 0.5. */
  secondaryCredit: number;
  equipment: Equipment;
  mode: LoggingMode;
  unilateral: boolean;
  /** Smallest load jump for this exercise, grams. */
  incrementG: number;
  defaultRestMs: number;
}

export type Side = 'L' | 'R';

export interface Segment {
  reps: number | null;
  /** Drop sets change weight per segment; rest-pause, cluster and myo keep the parent weight. */
  weightG: number | null;
  restMs: number | null;
}

export interface LoggedSet {
  id: string;
  workoutId: string;
  exerciseId: string;
  type: import('./setTypes').SetType;
  order: number;
  weightG: number | null;
  reps: number | null;
  rir: number | null;
  rpe: number | null;
  partials: number | null;
  forced: number | null;
  timeMs: number | null;
  distanceM: number | null;
  side: Side | null;
  segments: Segment[];
  completedAt: number | null;
}

export type WeightUnit = 'kg' | 'lb';
