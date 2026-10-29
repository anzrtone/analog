// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { listGyms, toGymProfile } from '@/db/repos';
import type { AnalogDB } from '@/db/schema';
import { settings } from '@/db/settings';
import { DEFAULT_KG_GYM, roundToGym, type GymProfile } from '@/engine/math/plates';
import type { EngineSettings } from '@/engine/progression';

export async function currentGym(d: AnalogDB): Promise<GymProfile> {
  const id = settings().defaultGymId;
  const gyms = await listGyms(d);
  const g = gyms.find((x) => x.id === id) ?? gyms[0];
  return g ? toGymProfile(g) : DEFAULT_KG_GYM;
}

/**
 * Round a load for an exercise to what the current gym can actually give you. The engine rounds synchronously,
 * so this loads the gym and the library once and hands back a plain function.
 */
export async function rounder(d: AnalogDB): Promise<(grams: number, exerciseId: string) => number> {
  const [gym, rows, overrides] = await Promise.all([currentGym(d), d.exercises.toArray(), d.exerciseOverrides.toArray()]);
  const edits = new Map(overrides.map((o) => [o.exerciseId, o.fields]));
  const byId = new Map(rows.map((r) => [r.id, { ...r, ...edits.get(r.id) }]));
  return (grams, exerciseId) => {
    const ex = byId.get(exerciseId);
    return roundToGym(grams, ex?.equipment ?? 'other', gym, 'nearest', ex?.incrementG);
  };
}

export function engineSettings(): Omit<EngineSettings, 'incrementG' | 'mesoRir'> {
  const s = settings();
  return { unit: s.unit, round: (g) => g, maxJumpPct: s.maxJumpPct };
}
