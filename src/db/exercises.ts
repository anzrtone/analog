// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import type { ExerciseInfo } from '@/engine/types';
import { newId, type AnalogDB, type ExerciseOverrideRow, type ExerciseRow } from './schema';

export type Exercise = ExerciseRow & { stickyNote: string | null; edited: boolean };
type Optional = 'aliases' | 'secondary' | 'secondaryCredit' | 'mode' | 'unilateral' | 'incrementG' | 'barG' | 'defaultRestMs' | 'repsMin' | 'repsMax' | 'link' | 'notes' | 'instructions' | 'image' | 'category' | 'hidden';
export type ExerciseInput = Omit<ExerciseRow, 'id' | 'source' | 'createdAt' | 'updatedAt' | Optional> & Partial<Pick<ExerciseRow, Optional>>;

/** A full row with 0.1.0's column defaults for anything not given. */
export function exerciseRow(e: Omit<ExerciseInput, 'equipment'> & Pick<ExerciseRow, 'id' | 'source' | 'createdAt' | 'updatedAt'> & { equipment?: ExerciseRow['equipment'] }): ExerciseRow {
  return {
    id: e.id,
    name: e.name,
    aliases: e.aliases ?? [],
    primary: e.primary,
    secondary: e.secondary ?? [],
    secondaryCredit: e.secondaryCredit ?? 0.5,
    equipment: e.equipment ?? 'other',
    mode: e.mode ?? 'weightReps',
    unilateral: e.unilateral ?? false,
    incrementG: e.incrementG ?? 2500,
    barG: e.barG ?? null,
    defaultRestMs: e.defaultRestMs ?? 120000,
    repsMin: e.repsMin ?? null,
    repsMax: e.repsMax ?? null,
    link: e.link ?? null,
    notes: e.notes ?? null,
    instructions: e.instructions ?? [],
    image: e.image ?? null,
    category: e.category ?? null,
    source: e.source,
    hidden: e.hidden ?? false,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

/** Built-in row + the user's override layer. */
function merge(row: ExerciseRow, o: ExerciseOverrideRow | undefined): Exercise {
  if (!o) return { ...row, stickyNote: null, edited: false };
  const fields = o.fields ?? {};
  return { ...row, ...fields, id: row.id, source: row.source, hidden: o.hidden ?? row.hidden, stickyNote: o.stickyNote, edited: Object.keys(fields).length > 0 } as Exercise;
}

export async function listExercises(d: AnalogDB, opts: { includeHidden?: boolean } = {}): Promise<Exercise[]> {
  const [rows, overrides] = await Promise.all([d.exercises.toArray(), d.exerciseOverrides.toArray()]);
  const byId = new Map(overrides.map((o) => [o.exerciseId, o]));
  return rows
    .map((r) => merge(r, byId.get(r.id)))
    .filter((e) => opts.includeHidden || !e.hidden)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getExercise(d: AnalogDB, id: string): Promise<Exercise | null> {
  const row = await d.exercises.get(id);
  if (!row) return null;
  return merge(row, await d.exerciseOverrides.get(id));
}

export async function getExercises(d: AnalogDB, ids: string[]): Promise<Map<string, Exercise>> {
  if (!ids.length) return new Map();
  const unique = [...new Set(ids)];
  const [rows, overrides] = await Promise.all([d.exercises.bulkGet(unique), d.exerciseOverrides.bulkGet(unique)]);
  const out = new Map<string, Exercise>();
  rows.forEach((r, i) => r && out.set(r.id, merge(r, overrides[i])));
  return out;
}

export function toInfo(e: Exercise): ExerciseInfo {
  return {
    id: e.id,
    name: e.name,
    primary: e.primary,
    secondary: e.secondary,
    secondaryCredit: e.secondaryCredit,
    equipment: e.equipment,
    mode: e.mode,
    unilateral: e.unilateral,
    incrementG: e.incrementG,
    defaultRestMs: e.defaultRestMs,
  };
}

/** Simple ranked search: name starts-with beats word starts-with beats contains, aliases count too. */
export function searchExercises(list: Exercise[], query: string): Exercise[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  const words = q.split(/\s+/);
  const scored: [Exercise, number][] = [];
  for (const e of list) {
    const hay = [e.name, ...e.aliases].map((s) => s.toLowerCase());
    if (!words.every((w) => hay.some((h) => h.includes(w)))) continue;
    const name = e.name.toLowerCase();
    const score = name.startsWith(q) ? 0 : name.split(/[\s-]+/).some((w) => w.startsWith(words[0]!)) ? 1 : 2;
    scored.push([e, score]);
  }
  return scored.sort((a, b) => a[1] - b[1] || a[0].name.length - b[0].name.length).map(([e]) => e);
}

export async function createExercise(d: AnalogDB, input: ExerciseInput, now = Date.now()): Promise<string> {
  const id = `custom-${newId()}`;
  await d.exercises.add(exerciseRow({ ...input, id, source: 'custom', createdAt: now, updatedAt: now }));
  return id;
}

/** Custom exercises are edited in place; built-ins get an override so library updates don't wipe the edit. */
export async function updateExercise(d: AnalogDB, id: string, patch: Partial<ExerciseInput>, now = Date.now()): Promise<void> {
  await d.transaction('rw', d.exercises, d.exerciseOverrides, async () => {
    const row = await d.exercises.get(id);
    if (!row) return;
    if (row.source === 'custom') {
      await d.exercises.update(id, { ...patch, updatedAt: now });
      return;
    }
    const o = await d.exerciseOverrides.get(id);
    await d.exerciseOverrides.put({ exerciseId: id, hidden: o?.hidden ?? null, stickyNote: o?.stickyNote ?? null, fields: { ...(o?.fields ?? {}), ...patch }, updatedAt: now });
  });
}

export async function resetExercise(d: AnalogDB, id: string, now = Date.now()): Promise<void> {
  await d.exerciseOverrides.update(id, { fields: {}, updatedAt: now });
}

export async function setHidden(d: AnalogDB, id: string, hidden: boolean, now = Date.now()): Promise<void> {
  await d.transaction('rw', d.exercises, d.exerciseOverrides, async () => {
    const row = await d.exercises.get(id);
    if (!row) return;
    if (row.source === 'custom') {
      await d.exercises.update(id, { hidden, updatedAt: now });
      return;
    }
    const o = await d.exerciseOverrides.get(id);
    await d.exerciseOverrides.put({ exerciseId: id, fields: o?.fields ?? {}, stickyNote: o?.stickyNote ?? null, hidden, updatedAt: now });
  });
}

export async function setStickyNote(d: AnalogDB, id: string, note: string | null, now = Date.now()): Promise<void> {
  await d.transaction('rw', d.exerciseOverrides, async () => {
    const o = await d.exerciseOverrides.get(id);
    await d.exerciseOverrides.put({ exerciseId: id, fields: o?.fields ?? {}, hidden: o?.hidden ?? null, stickyNote: note, updatedAt: now });
  });
}

export async function addAlias(d: AnalogDB, id: string, alias: string): Promise<void> {
  const e = await getExercise(d, id);
  if (!e || e.aliases.some((a) => a.toLowerCase() === alias.toLowerCase())) return;
  await updateExercise(d, id, { aliases: [...e.aliases, alias] });
}

export type SeedExercise = Omit<ExerciseInput, 'hidden'> & { id: string };

/** Insert or refresh built-in exercises. Overrides and custom exercises are never touched. */
export async function syncSeed(d: AnalogDB, seed: SeedExercise[], now = Date.now()): Promise<number> {
  await d.transaction('rw', d.exercises, async () => {
    const existing = new Map((await d.exercises.bulkGet(seed.map((s) => s.id))).map((r, i) => [seed[i]!.id, r]));
    const rows = seed.map((s) => {
      const prev = existing.get(s.id);
      // On refresh only the library's own fields change; the user's settings on the row stay (as 0.1.0's upsert did).
      if (prev) return { ...prev, name: s.name, aliases: s.aliases ?? [], primary: s.primary, secondary: s.secondary ?? [], equipment: s.equipment, mode: s.mode ?? 'weightReps', unilateral: s.unilateral ?? false, instructions: s.instructions ?? [], image: s.image ?? null, category: s.category ?? null, updatedAt: now };
      return exerciseRow({ ...s, source: 'seed', hidden: false, createdAt: now, updatedAt: now });
    });
    await d.exercises.bulkPut(rows);
  });
  return seed.length;
}
