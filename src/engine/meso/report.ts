// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { MUSCLE_LABEL, type Muscle } from '../types';
import { learnLandmarks, type MesoMuscleRecord } from './landmarks';
import type { JointPain, Landmarks, Pump } from './types';

export interface ExerciseMesoRecord {
  exerciseId: string;
  name: string;
  e1rmStart: number | null;
  e1rmEnd: number | null;
  pumps: Pump[];
  pains: JointPain[];
}

export interface MesoReport {
  weeks: number;
  volume: { muscle: Muscle; weeklySets: number[] }[];
  lifts: { exerciseId: string; name: string; changePct: number | null; start: number | null; end: number | null }[];
  bestPump: { exerciseId: string; name: string; avgPump: number }[];
  painFlags: { exerciseId: string; name: string; explanation: string }[];
  landmarks: { muscle: Muscle; before: Landmarks; after: Landmarks; nextStartSets: number; explanation: string }[];
  headline: string;
}

export function buildMesoReport(
  weeks: number,
  muscles: Partial<Record<Muscle, MesoMuscleRecord>>,
  exercises: ExerciseMesoRecord[],
  landmarks: Record<Muscle, Landmarks>,
): MesoReport {
  const volume = (Object.keys(muscles) as Muscle[]).sort().map((m) => ({ muscle: m, weeklySets: muscles[m]!.weeklySets }));
  const lifts = exercises
    .map((e) => ({
      exerciseId: e.exerciseId,
      name: e.name,
      start: e.e1rmStart,
      end: e.e1rmEnd,
      changePct: e.e1rmStart && e.e1rmEnd ? (e.e1rmEnd - e.e1rmStart) / e.e1rmStart : null,
    }))
    .sort((a, b) => (b.changePct ?? -1) - (a.changePct ?? -1));
  const bestPump = exercises
    .filter((e) => e.pumps.length)
    .map((e) => ({ exerciseId: e.exerciseId, name: e.name, avgPump: e.pumps.reduce<number>((a, b) => a + b, 0) / e.pumps.length }))
    .sort((a, b) => b.avgPump - a.avgPump)
    .slice(0, 5);
  const painFlags = exercises
    .filter((e) => e.pains.some((p) => p === 'lot') || e.pains.filter((p) => p === 'some').length >= 2)
    .map((e) => ({ exerciseId: e.exerciseId, name: e.name, explanation: `${e.name}: joint pain ${e.pains.filter((p) => p !== 'none').length} times. Consider a swap next meso.` }));
  const learned = volume.map(({ muscle }) => {
    const before = landmarks[muscle];
    const l = learnLandmarks(before, muscles[muscle]!);
    return { muscle, before, after: l.landmarks, nextStartSets: l.nextStartSets, explanation: `${MUSCLE_LABEL[muscle]}: ${l.explanation}` };
  });
  const gains = lifts.filter((l) => (l.changePct ?? 0) > 0).length;
  return {
    weeks,
    volume,
    lifts,
    bestPump,
    painFlags,
    landmarks: learned,
    headline: `${weeks} weeks done. ${gains} of ${lifts.length} lifts went up.`,
  };
}
