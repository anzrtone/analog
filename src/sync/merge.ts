// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
/**
 * Merging two devices' data. A snapshot is an ordinary backup plus the graves of deleted rows and the preferences
 * that follow you. Merging is idempotent and order-independent: the newer edit wins per row, a delete beats an older
 * copy and loses to a newer edit, and nothing is ever "overwritten by the other device".
 */
import { checkBackup, exportAll, normalise, type BackupFile } from '@/db/backup';
import type { AnalogDB, TableName, TombstoneRow, WorkoutRow } from '@/db/schema';
import { DEFAULT_SETTINGS, SYNCED_PREFS } from '@/db/settings';
import { flushTombstones, pruneTombstones, ridOf, skipSyncStamping, SYNC_TABLES, tombstoneId, type SyncTable } from './stamp';

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

/** Validate a snapshot's text; throws a BackupError that is fit to show. */
export function parseBackup(text: string): BackupFile {
  const check = checkBackup(text);
  if (!check.ok) throw new BackupError(check.error);
  return check.file;
}

export interface MergeStats {
  /** Finished workouts that were new here. */
  workouts: number;
  /** Other rows that were new or newer here (a new workout's own sets don't count twice). */
  rows: number;
  /** Rows removed because the other device deleted them after their last edit. */
  deleted: number;
  /** 1 when the preferences came across. */
  prefs: number;
}

export const emptyStats = (): MergeStats => ({ workouts: 0, rows: 0, deleted: 0, prefs: 0 });
export const mergedAnything = (s: MergeStats): boolean => s.workouts + s.rows + s.deleted + s.prefs > 0;

const PREF_KEYS = new Set<string>([...SYNCED_PREFS, 'prefsUpdatedAt']);
const stampOf = (row: unknown): number => (row as { updatedAt?: number }).updatedAt ?? 0;
const keyOf = (d: AnalogDB, name: SyncTable) => {
  const path = d.table(name).schema.primKey.keyPath;
  return (row: unknown): string => {
    const r = row as Record<string, unknown>;
    return ridOf(Array.isArray(path) ? path.map((p) => r[p]) : r[path as string]);
  };
};

/**
 * What this device offers: finished workouts only (an open one stays where it is being logged), custom exercises
 * only (the library is bundled on every device), the preferences that follow the person, and the graves.
 */
export async function buildSnapshot(d: AnalogDB, now = Date.now()): Promise<BackupFile> {
  await flushTombstones();
  await pruneTombstones(d, now);
  const file = await exportAll(d, now, { graves: true });
  const t = file.tables;
  const workouts = (t.workouts as WorkoutRow[]).filter((w) => w.endedAt != null);
  const ids = new Set(workouts.map((w) => w.id));
  t.workouts = workouts;
  for (const name of ['workoutGroups', 'workoutExercises', 'workoutSets', 'feedback', 'prs'] as const) {
    t[name] = (t[name] as { workoutId: string }[]).filter((r) => ids.has(r.workoutId));
  }
  t.exercises = (t.exercises as { source: string }[]).filter((e) => e.source === 'custom');
  t.photos = [];
  t.settings = (t.settings as { key: string }[]).filter((r) => PREF_KEYS.has(r.key));
  return file;
}

/** The fingerprint of a snapshot's contents: the export time is blanked so unchanged data hashes the same. */
export const snapshotJson = (file: BackupFile): string => JSON.stringify({ ...file, exportedAt: 0 });

export async function mergeBackup(d: AnalogDB, backup: BackupFile, opts: { honorDeletes: boolean }): Promise<MergeStats> {
  await flushTombstones();
  const stats = emptyStats();
  const names: TableName[] = [...SYNC_TABLES];
  await d.transaction('rw', [...names.map((n) => d.table(n)), d.settings, d.tombstones], async () => {
    skipSyncStamping();

    // Graves: ours and theirs, the newest per id.
    const graves = new Map<string, TombstoneRow>((await d.tombstones.toArray()).map((g) => [g.id, g]));
    const incoming: TombstoneRow[] = opts.honorDeletes ? (backup.tombstones ?? []).filter((g) => g && typeof g.id === 'string') : [];

    const newWorkouts = new Set<string>();
    for (const name of SYNC_TABLES) {
      const key = keyOf(d, name);
      const local = new Map<string, unknown>((await d.table(name).toArray()).map((r) => [key(r), r]));

      // Their deletions first: a grave beats an older copy of the row.
      for (const g of incoming) {
        if (g.table !== name) continue;
        const have = local.get(g.rid);
        if (have && stampOf(have) <= g.at) {
          await d.table(name).delete(keyPath(d, name, have) as string);
          local.delete(g.rid);
          stats.deleted++;
        }
        const ours = graves.get(g.id);
        if (!ours || ours.at < g.at) graves.set(g.id, g);
      }

      let theirs = ((backup.tables[name] as unknown[] | undefined) ?? []).filter((r) => r && typeof r === 'object');
      if (name === 'workouts') theirs = theirs.filter((w) => (w as WorkoutRow).endedAt != null);
      if (name === 'exercises') theirs = theirs.filter((e) => (e as { source?: string }).source === 'custom');
      if ((name === 'workoutGroups' || name === 'workoutExercises' || name === 'workoutSets' || name === 'feedback' || name === 'prs') && backup.tables.workouts) {
        const finished = new Set((backup.tables.workouts as WorkoutRow[]).filter((w) => w.endedAt != null).map((w) => w.id));
        theirs = theirs.filter((r) => finished.has((r as { workoutId: string }).workoutId));
      }

      const normalised = normalise(name, theirs);
      const write: unknown[] = [];
      theirs.forEach((raw, i) => {
        const rid = key(raw);
        const stamp = stampOf(raw);
        const grave = graves.get(tombstoneId(name, rid));
        if (grave && grave.at >= stamp) return;
        const have = local.get(rid);
        if (have && stamp <= stampOf(have)) return;
        write.push({ ...(normalised[i] as object), updatedAt: stamp });
        const wid = (raw as { workoutId?: string }).workoutId;
        if (name === 'workouts') {
          if (!have) {
            stats.workouts++;
            newWorkouts.add(rid);
          } else stats.rows++;
        } else if (!have && wid && newWorkouts.has(wid)) {
          // part of a workout that is new here
        } else stats.rows++;
      });
      if (write.length) await d.table(name).bulkPut(write);
    }

    if (graves.size) await d.tombstones.bulkPut([...graves.values()]);

    // Preferences travel as one group, with whichever device edited them last.
    const theirPrefs = ((backup.tables.settings as { key: string; value: unknown }[] | undefined) ?? []).filter((r) => PREF_KEYS.has(r.key));
    const theirAt = Number(theirPrefs.find((r) => r.key === 'prefsUpdatedAt')?.value ?? 0);
    const ourAt = Number((await d.settings.get('prefsUpdatedAt'))?.value ?? 0);
    if (theirAt > ourAt) {
      let changed = false;
      for (const key of SYNCED_PREFS) {
        const next = theirPrefs.find((r) => r.key === key)?.value ?? DEFAULT_SETTINGS[key];
        const was = (await d.settings.get(key))?.value ?? DEFAULT_SETTINGS[key];
        if (JSON.stringify(next) === JSON.stringify(was)) continue;
        changed = true;
        if (theirPrefs.some((r) => r.key === key)) await d.settings.put({ key, value: next });
        else await d.settings.delete(key);
      }
      await d.settings.put({ key: 'prefsUpdatedAt', value: theirAt });
      if (changed) stats.prefs = 1;
    }
  });
  return stats;
}

function keyPath(d: AnalogDB, name: SyncTable, row: unknown): unknown {
  const path = d.table(name).schema.primKey.keyPath;
  const r = row as Record<string, unknown>;
  return Array.isArray(path) ? path.map((p) => r[p]) : r[path as string];
}

/** The sentence under the Sync button and in the toast. */
export function describeMerge(s: MergeStats, pushed: boolean): string {
  if (!mergedAnything(s)) return pushed ? 'Up to date. Sent your latest.' : 'Everything is already up to date.';
  const parts: string[] = [];
  if (s.workouts) parts.push(`${s.workouts} new workout${s.workouts === 1 ? '' : 's'}`);
  if (s.rows) parts.push(`${s.rows} other change${s.rows === 1 ? '' : 's'}`);
  if (s.deleted) parts.push(`${s.deleted} removed`);
  if (s.prefs) parts.push('your settings');
  return `Brought in ${parts.join(', ')}.`;
}

export function addStats(a: MergeStats, b: MergeStats): MergeStats {
  return { workouts: a.workouts + b.workouts, rows: a.rows + b.rows, deleted: a.deleted + b.deleted, prefs: Math.max(a.prefs, b.prefs) };
}
