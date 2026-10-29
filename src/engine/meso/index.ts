// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
export * from './types';
export { DEFAULT_LANDMARKS, learnLandmarks, rirForWeek, type MesoMuscleRecord } from './landmarks';
export { deltaForScore, planWeek, scoreMuscle } from './adaptive';
export { buildMesoReport, type MesoReport, type ExerciseMesoRecord } from './report';

/** After the deload, next meso W1 loads = this meso's W1 loads + one increment. */
export function nextMesoStartLoad(w1LoadG: number, incrementG: number, round: (g: number) => number): number {
  return round(w1LoadG + incrementG);
}
