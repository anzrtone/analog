// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { DEFAULT_KG_GYM, DEFAULT_LB_GYM, type GymProfile } from '@/engine/math/plates';
import { DEFAULT_LANDMARKS } from '@/engine/meso/landmarks';
import type { Landmarks } from '@/engine/meso/types';
import type { PrRecord } from '@/engine/prs/detect';
import type { Program, RunState } from '@/engine/programs/types';
import { emptyRunState } from '@/engine/programs/types';
import type { Muscle, WeightUnit } from '@/engine/types';
import { newId, type AnalogDB, type FeedbackRow, type GymRow, type MeasurementRow, type PhotoRow, type ProgramRow, type PrRow, type RunRow } from './schema';

export type { FeedbackRow, GymRow, MeasurementRow, ProgramRow, PrRow, RunRow };

// ---- Gyms ----

export function toGymProfile(g: GymRow): GymProfile {
  return { id: g.id, name: g.name, unit: g.unit, barG: g.barG, plates: g.plates, dumbbellsG: g.dumbbellsG, kettlebellsG: g.kettlebellsG, machineStepG: g.machineStepG };
}

export async function listGyms(d: AnalogDB): Promise<GymRow[]> {
  const rows = await d.gyms.toArray();
  return rows.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
}

/** Makes sure there's always one gym to round loads against. */
export async function ensureDefaultGym(d: AnalogDB, unit: WeightUnit, now = Date.now()): Promise<GymRow> {
  return d.transaction('rw', d.gyms, async () => {
    const all = await d.gyms.toArray();
    const existing = all.find((g) => g.isDefault) ?? all[0];
    if (existing) return existing;
    const base = unit === 'lb' ? DEFAULT_LB_GYM : DEFAULT_KG_GYM;
    const row: GymRow = { ...base, id: newId(), name: 'My gym', equipment: [], isDefault: true, createdAt: now };
    await d.gyms.add(row);
    return row;
  });
}

export async function saveGym(d: AnalogDB, g: Omit<GymRow, 'createdAt'> & { createdAt?: number }): Promise<void> {
  const row: GymRow = { ...g, createdAt: g.createdAt ?? Date.now() };
  await d.transaction('rw', d.gyms, async () => {
    if (row.isDefault) await d.gyms.toCollection().modify({ isDefault: false });
    await d.gyms.put(row);
  });
}

export async function deleteGym(d: AnalogDB, id: string): Promise<void> {
  await d.gyms.delete(id);
}

export async function getMachineSetting(d: AnalogDB, exerciseId: string, gymId: string): Promise<string | null> {
  return (await d.machineSettings.get([exerciseId, gymId]))?.text ?? null;
}

export async function setMachineSetting(d: AnalogDB, exerciseId: string, gymId: string, text: string, now = Date.now()): Promise<void> {
  if (!text.trim()) await d.machineSettings.delete([exerciseId, gymId]);
  else await d.machineSettings.put({ exerciseId, gymId, text, updatedAt: now });
}

// ---- PRs ----

export async function recordPrs(d: AnalogDB, workoutId: string, records: PrRecord[], now = Date.now()): Promise<void> {
  if (!records.length) return;
  await d.prs.bulkAdd(records.map((r) => ({ id: newId(), exerciseId: r.exerciseId, setId: r.setId, workoutId, kind: r.kind, value: r.value, previous: r.previous, atWeightG: r.atWeightG ?? null, side: r.side ?? null, message: r.message, createdAt: now })));
}

export async function prsForWorkout(d: AnalogDB, workoutId: string): Promise<PrRow[]> {
  return d.prs.where('workoutId').equals(workoutId).toArray();
}

export async function prsForExercise(d: AnalogDB, exerciseId: string): Promise<PrRow[]> {
  const rows = await d.prs.where('exerciseId').equals(exerciseId).toArray();
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

export async function recentPrs(d: AnalogDB, limit = 50): Promise<PrRow[]> {
  return d.prs.orderBy('createdAt').reverse().limit(limit).toArray();
}

export async function clearPrsForWorkout(d: AnalogDB, workoutId: string): Promise<void> {
  await d.prs.where('workoutId').equals(workoutId).delete();
}

// ---- Feedback ----

export async function addFeedback(d: AnalogDB, f: Omit<FeedbackRow, 'id' | 'createdAt'>, now = Date.now()): Promise<void> {
  await d.feedback.add({ ...f, id: newId(), createdAt: now });
}

export async function feedbackForRun(d: AnalogDB, runId: string, since = 0): Promise<FeedbackRow[]> {
  return d.feedback.where('[runId+createdAt]').between([runId, since], [runId, Infinity]).toArray();
}

export async function feedbackForWorkouts(d: AnalogDB, workoutIds: string[]): Promise<FeedbackRow[]> {
  if (!workoutIds.length) return [];
  return d.feedback.where('workoutId').anyOf(workoutIds).toArray();
}

// ---- Landmarks ----

export async function loadLandmarks(d: AnalogDB): Promise<Record<Muscle, Landmarks>> {
  const out = { ...DEFAULT_LANDMARKS };
  for (const r of await d.landmarks.toArray()) out[r.muscle] = { mev: r.mev, mav: r.mav, mrv: r.mrv };
  return out;
}

export async function saveLandmark(d: AnalogDB, muscle: Muscle, l: Landmarks, learnedFrom?: string, now = Date.now()): Promise<void> {
  await d.transaction('rw', d.landmarks, async () => {
    const prev = await d.landmarks.get(muscle);
    const from = learnedFrom ? [...(prev?.learnedFrom ?? []), learnedFrom] : (prev?.learnedFrom ?? []);
    await d.landmarks.put({ muscle, mev: l.mev, mav: l.mav, mrv: l.mrv, learnedFrom: from, updatedAt: now });
  });
}

// ---- Programs ----

export async function listPrograms(d: AnalogDB): Promise<ProgramRow[]> {
  const rows = await d.programs.orderBy('updatedAt').reverse().toArray();
  return rows.filter((p) => !p.archived);
}

export async function getProgram(d: AnalogDB, id: string): Promise<ProgramRow | null> {
  return (await d.programs.get(id)) ?? null;
}

export async function saveProgram(d: AnalogDB, p: Program, now = Date.now()): Promise<void> {
  await d.transaction('rw', d.programs, async () => {
    const existing = await d.programs.get(p.id);
    if (existing) await d.programs.update(p.id, { name: p.name, data: p, updatedAt: now });
    else await d.programs.add({ id: p.id, name: p.name, data: p, createdAt: now, updatedAt: now, archived: false });
  });
}

export async function archiveProgram(d: AnalogDB, id: string): Promise<void> {
  await d.programs.update(id, { archived: true });
}

/**
 * Delete a program from the list. Workouts logged with it stay, and so does the program's own history; a program
 * that is running first has its run ended (the run keeps its own copy, so nothing already logged changes).
 */
export async function deleteProgram(d: AnalogDB, id: string, now = Date.now()): Promise<void> {
  await d.transaction('rw', d.programs, d.programRuns, async () => {
    const run = await d.programRuns.filter((r) => r.active && r.programId === id).first();
    if (run) await d.programRuns.update(run.id, { active: false, endedAt: now });
    await d.programs.update(id, { archived: true });
  });
}

/** Start a program. Restarting seeds the new run from the last run's ending loads. */
export async function startRun(d: AnalogDB, programId: string, now = Date.now()): Promise<string> {
  const id = newId();
  await d.transaction('rw', d.programs, d.programRuns, async () => {
    const p = await d.programs.get(programId);
    if (!p) throw new Error('No such program');
    const runs = await d.programRuns.where('programId').equals(programId).toArray();
    const prev = runs.sort((a, b) => b.startedAt - a.startedAt)[0];
    const state: RunState = emptyRunState();
    if (prev) {
      for (const [slotId, s] of Object.entries(prev.state.slots)) state.slots[slotId] = { loadG: s.loadG, fails: 0, tmG: s.tmG ?? null, targetMs: s.targetMs ?? null, ladderIndex: s.ladderIndex ?? 0 };
    }
    await d.programRuns.filter((r) => r.active).modify({ active: false, endedAt: now });
    await d.programRuns.add({ id, programId, program: p.data, state, startedAt: now, endedAt: null, active: true });
  });
  return id;
}

export async function activeRun(d: AnalogDB): Promise<RunRow | null> {
  return (await d.programRuns.filter((r) => r.active).first()) ?? null;
}

export async function getRun(d: AnalogDB, id: string): Promise<RunRow | null> {
  return (await d.programRuns.get(id)) ?? null;
}

export async function saveRunState(d: AnalogDB, id: string, state: RunState): Promise<void> {
  await d.programRuns.update(id, { state });
}

export async function endRun(d: AnalogDB, id: string, now = Date.now()): Promise<void> {
  await d.programRuns.update(id, { active: false, endedAt: now });
}

// ---- Measurements and photos (stored only on this device) ----

export async function addMeasurement(d: AnalogDB, kind: string, value: number, date = Date.now(), note: string | null = null): Promise<void> {
  await d.measurements.add({ id: newId(), kind, value, date, note });
}

export async function listMeasurements(d: AnalogDB, kind: string): Promise<MeasurementRow[]> {
  return d.measurements.where('[kind+date]').between([kind, -Infinity], [kind, Infinity]).toArray();
}

export async function deleteMeasurement(d: AnalogDB, id: string): Promise<void> {
  await d.measurements.delete(id);
}

export async function addPhoto(d: AnalogDB, uri: string, date = Date.now(), note: string | null = null): Promise<void> {
  await d.photos.add({ id: newId(), uri, date, note });
}

export async function listPhotos(d: AnalogDB): Promise<PhotoRow[]> {
  return d.photos.orderBy('date').reverse().toArray();
}

export async function deletePhoto(d: AnalogDB, id: string): Promise<void> {
  await d.photos.delete(id);
}
