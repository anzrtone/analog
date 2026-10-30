// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { groupLabels } from '@/engine/timer/rest';
import type { ExportSetRow } from '@/engine/export/csv';
import { exerciseRow } from './exercises';
import { TABLE_NAMES, tables, type AnalogDB, type TableName, type TombstoneRow, type WorkoutRow } from './schema';
import { skipSyncStamping } from '@/sync/stamp';
import { DEVICE_ONLY_SETTINGS } from './settings';
import { finishedWorkouts, getWorkout, setRow, workoutExerciseRow, workoutRow } from './workouts';
import { getExercises } from './exercises';

// Full JSON backup and restore. Every table, nothing hidden: this is the user's data.
// The file is the same as Analog 0.1.0's (app "analog", format 1, one section per table with the same row
// fields), so a backup moves freely between 0.1.0 and 0.2.0 in either direction.

export interface BackupFile {
  app: 'analog';
  format: 1;
  exportedAt: number;
  tables: Record<TableName, unknown[]>;
  /** Graves of deleted rows, for device sync. Older readers ignore it, and a restore does not use it. */
  tombstones?: TombstoneRow[];
}

/** `graves`: also include the tombstones of deleted rows (sync snapshots do; an ordinary backup stays exactly the 0.1.0 shape). */
export async function exportAll(d: AnalogDB, now = Date.now(), opts: { graves?: boolean } = {}): Promise<BackupFile> {
  const out = {} as Record<TableName, unknown[]>;
  let tombstones: TombstoneRow[] = [];
  await d.transaction('r', [...tables(d), d.tombstones], async () => {
    for (const name of TABLE_NAMES) out[name] = await d.table(name).toArray();
    if (opts.graves) tombstones = await d.tombstones.toArray();
  });
  // `open` is only an index helper; it isn't part of the user's data.
  out.workouts = (out.workouts as WorkoutRow[]).map(({ open: _open, ...w }) => w);
  // The anonymous survey id and what this device has seen belong to the install, not to the user's data.
  out.settings = (out.settings as { key: string }[]).filter((r) => !DEVICE_ONLY_SETTINGS.includes(r.key));
  return { app: 'analog', format: 1, exportedAt: now, tables: out, ...(opts.graves ? { tombstones } : {}) };
}

export type RestoreCheck = { ok: true; file: BackupFile; counts: Record<string, number> } | { ok: false; error: string };

export function checkBackup(text: string): RestoreCheck {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file isn't valid JSON." };
  }
  const f = parsed as Partial<BackupFile>;
  if (f.app !== 'analog' || !f.tables) return { ok: false, error: "This isn't an Analog backup." };
  if (f.format !== 1) return { ok: false, error: 'This backup was made by a newer Analog. Update the app to restore it.' };
  const counts: Record<string, number> = {};
  for (const name of TABLE_NAMES) {
    const rows = (f.tables as Record<string, unknown>)[name];
    if (rows != null && !Array.isArray(rows)) return { ok: false, error: `The ${name} section is damaged.` };
    counts[name] = Array.isArray(rows) ? rows.length : 0;
  }
  return { ok: true, file: f as BackupFile, counts };
}

/** Rows as the database stores them: every field present (0.1.0 defaults for any a file leaves out). */
export function normalise(name: TableName, rows: unknown[]): unknown[] {
  switch (name) {
    case 'workouts':
      return (rows as Parameters<typeof workoutRow>[0][]).map((w) => workoutRow(w));
    case 'workoutSets':
      return (rows as Parameters<typeof setRow>[0][]).map((s) => setRow(s));
    case 'workoutExercises':
      return (rows as Parameters<typeof workoutExerciseRow>[0][]).map((e) => workoutExerciseRow(e));
    case 'exercises':
      return (rows as Parameters<typeof exerciseRow>[0][]).map((e) => exerciseRow(e));
    case 'settings':
      return (rows as { key: string; value: unknown }[]).filter((r) => !DEVICE_ONLY_SETTINGS.includes(r.key) && r.value != null);
    default:
      return rows;
  }
}

/** Replace everything with the backup's contents, in one transaction: all or nothing. This device's own settings stay. */
export async function restoreAll(d: AnalogDB, file: BackupFile): Promise<void> {
  await d.transaction('rw', tables(d), async () => {
    // The file's rows keep the stamps they came with; this is not an edit made now.
    skipSyncStamping();
    for (const name of TABLE_NAMES) {
      if (name === 'settings') await d.settings.filter((r) => !DEVICE_ONLY_SETTINGS.includes(r.key)).delete();
      else await d.table(name).clear();
    }
    for (const name of TABLE_NAMES) {
      const rows = normalise(name, file.tables[name] ?? []);
      if (rows.length) await d.table(name).bulkPut(rows);
    }
  });
}

/** One row per set of every finished workout, oldest first, for the CSV export. */
export async function exportRows(d: AnalogDB): Promise<ExportSetRow[]> {
  const rows: ExportSetRow[] = [];
  const workouts = (await finishedWorkouts(d)).sort((a, b) => a.startedAt - b.startedAt);
  for (const w of workouts) {
    const full = (await getWorkout(d, w.id))!;
    const names = await getExercises(d, full.exercises.map((e) => e.exerciseId));
    const labels = groupLabels(full.exercises);
    full.exercises.forEach((e, i) =>
      e.sets.forEach((x, j) =>
        rows.push({ workoutStartedAt: w.startedAt, workoutEndedAt: w.endedAt, workoutName: w.title, workoutNotes: w.notes, exerciseName: names.get(e.exerciseId)?.name ?? e.exerciseId, group: labels[i] ?? null, setOrder: j + 1, type: x.type, weightG: x.weightG, reps: x.reps, rir: x.rir, rpe: x.rpe, partials: x.partials, timeMs: x.timeMs, distanceM: x.distanceM, side: x.side, note: x.note }),
      ),
    );
  }
  return rows;
}
