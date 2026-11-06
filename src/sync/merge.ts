// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
/**
 * Merging two devices' data. A snapshot is an ordinary backup plus the graves of deleted rows and the preferences
 * that follow you. Merging is idempotent and order-independent: the newer edit wins per row, a delete beats an older
 * copy and loses to a newer edit, and nothing is ever "overwritten by the other device".
 *
 * A snapshot can come from anyone who can reach the folder or holds the code, so nothing in it is trusted: rows of the
 * wrong shape are skipped, and a time more than a day in the future is refused. Without that, one forged or wrong clock
 * could win every later merge for good.
 */
import { checkBackup, exportAll, normalise, type BackupFile } from '@/db/backup';
import type { AnalogDB, TableName, TombstoneRow, WorkoutRow } from '@/db/schema';
import { DEFAULT_SETTINGS, SYNCED_PREFS, validSetting } from '@/db/settings';
import { validRow } from '@/db/validate';
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
  /** Rows and graves left out because they were damaged or dated in the future. */
  skipped?: number;
}

export const emptyStats = (): MergeStats => ({ workouts: 0, rows: 0, deleted: 0, prefs: 0, skipped: 0 });
export const mergedAnything = (s: MergeStats): boolean => s.workouts + s.rows + s.deleted + s.prefs > 0;

/** Clocks disagree a little, so a day of grace. More than that is a wrong clock or a forgery. */
export const MAX_CLOCK_SKEW_MS = 24 * 3_600_000;

const validStamp = (t: unknown, now: number) => typeof t === 'number' && Number.isFinite(t) && t >= 0 && t <= now + MAX_CLOCK_SKEW_MS;

function validGrave(g: unknown, now: number): g is TombstoneRow {
  if (typeof g !== 'object' || g === null) return false;
  const t = g as Partial<TombstoneRow>;
  return validStamp(t.at, now) && typeof t.table === 'string' && (SYNC_TABLES as readonly string[]).includes(t.table) && typeof t.rid === 'string' && t.id === tombstoneId(t.table, t.rid);
}

const PREF_KEYS = new Set<string>([...SYNCED_PREFS, 'prefsUpdatedAt']);
const stampOf = (row: unknown): number => (row as { updatedAt?: number }).updatedAt ?? 0;
const keyOf = (d: AnalogDB, name: SyncTable) => {
  const path = d.table(name).schema.primKey.keyPath;
  return (row: unknown): string => {
    const r = row as Record<string, unknown>;
    return ridOf(Array.isArray(path) ? path.map((p) => r[p]) : r[path as string]);
  };
};

const gravesIn = (backup: BackupFile, now: number): TombstoneRow[] => (Array.isArray(backup.tombstones) ? backup.tombstones.filter((g) => validGrave(g, now)) : []);

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

export interface DeletePreview {
  /** Finished workouts this merge would remove. */
  workouts: number;
  /** All rows it would remove, those workouts included. */
  rows: number;
  /** How many rows and workouts there are now, to judge the rest against. */
  totalRows: number;
  totalWorkouts: number;
}

/** What merging this snapshot would delete here, without changing anything. */
export async function previewDeletes(d: AnalogDB, backup: BackupFile, now = Date.now()): Promise<DeletePreview> {
  await flushTombstones();
  const graves = gravesIn(backup, now);
  const preview: DeletePreview = { workouts: 0, rows: 0, totalRows: 0, totalWorkouts: await d.workouts.count() };
  for (const name of SYNC_TABLES) {
    preview.totalRows += await d.table(name).count();
    const mine = graves.filter((g) => g.table === name);
    if (!mine.length) continue;
    const key = keyOf(d, name);
    const local = new Map<string, unknown>((await d.table(name).toArray()).map((r) => [key(r), r]));
    for (const g of mine) {
      const have = local.get(g.rid);
      if (!have || stampOf(have) > g.at) continue;
      preview.rows++;
      if (name === 'workouts') preview.workouts++;
    }
  }
  return preview;
}

/**
 * Worth stopping to ask? Deleting a workout on the other device should just follow through; losing a good part of the
 * history in one sync, which no ordinary tap does, should not happen without the person saying so.
 */
export function isLargeDelete(p: DeletePreview): boolean {
  const workouts = p.workouts >= 5 && p.workouts >= p.totalWorkouts * 0.25;
  const rows = p.rows >= 100 && p.rows >= p.totalRows * 0.25;
  return workouts || rows;
}

export async function mergeBackup(d: AnalogDB, backup: BackupFile, opts: { honorDeletes: boolean; now?: number }): Promise<MergeStats> {
  await flushTombstones();
  const now = opts.now ?? Date.now();
  const stats = emptyStats();
  const names: TableName[] = [...SYNC_TABLES];
  await d.transaction('rw', [...names.map((n) => d.table(n)), d.settings, d.tombstones], async () => {
    skipSyncStamping();

    // Graves: ours and theirs, the newest per id.
    const graves = new Map<string, TombstoneRow>((await d.tombstones.toArray()).map((g) => [g.id, g]));
    const claimed = opts.honorDeletes && Array.isArray(backup.tombstones) ? backup.tombstones.length : 0;
    const incoming: TombstoneRow[] = opts.honorDeletes ? gravesIn(backup, now) : [];
    stats.skipped! += claimed - incoming.length;

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

      const sent = ((backup.tables[name] as unknown[] | undefined) ?? []).filter((r) => r && typeof r === 'object');
      let theirs = sent.filter((r) => validRow(d, name, r) && validStamp(stampOf(r), now));
      stats.skipped! += sent.length - theirs.length;
      if (name === 'workouts') theirs = theirs.filter((w) => (w as WorkoutRow).endedAt != null);
      if (name === 'exercises') theirs = theirs.filter((e) => (e as { source?: string }).source === 'custom');
      if ((name === 'workoutGroups' || name === 'workoutExercises' || name === 'workoutSets' || name === 'feedback' || name === 'prs') && backup.tables.workouts) {
        const finished = new Set((backup.tables.workouts as (WorkoutRow | null)[]).filter((w) => w && w.endedAt != null).map((w) => w!.id));
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
    const theirPrefs = ((backup.tables.settings as ({ key: string; value: unknown } | null)[] | undefined) ?? []).filter((r): r is { key: string; value: unknown } => !!r && PREF_KEYS.has(r.key));
    const clock = Number(theirPrefs.find((r) => r.key === 'prefsUpdatedAt')?.value ?? 0);
    const theirAt = validStamp(clock, now) ? clock : 0;
    const ourAt = Number((await d.settings.get('prefsUpdatedAt'))?.value ?? 0);
    if (theirAt > ourAt) {
      let changed = false;
      for (const key of SYNCED_PREFS) {
        const sent = theirPrefs.find((r) => r.key === key);
        // A value this app could not run on is left out, and this device's own stays.
        if (sent && !validSetting(key, sent.value)) {
          stats.skipped!++;
          continue;
        }
        const next = sent?.value ?? DEFAULT_SETTINGS[key];
        const was = (await d.settings.get(key))?.value ?? DEFAULT_SETTINGS[key];
        if (JSON.stringify(next) === JSON.stringify(was)) continue;
        changed = true;
        if (sent) await d.settings.put({ key, value: next });
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
  const skipped = s.skipped ? ` ${s.skipped} damaged or future-dated item${s.skipped === 1 ? ' was' : 's were'} left out.` : '';
  if (!mergedAnything(s)) return (pushed ? 'Up to date. Sent your latest.' : 'Everything is already up to date.') + skipped;
  const parts: string[] = [];
  if (s.workouts) parts.push(`${s.workouts} new workout${s.workouts === 1 ? '' : 's'}`);
  if (s.rows) parts.push(`${s.rows} other change${s.rows === 1 ? '' : 's'}`);
  if (s.deleted) parts.push(`${s.deleted} removed`);
  if (s.prefs) parts.push('your settings');
  return `Brought in ${parts.join(', ')}.${skipped}`;
}

export function addStats(a: MergeStats, b: MergeStats): MergeStats {
  return { workouts: a.workouts + b.workouts, rows: a.rows + b.rows, deleted: a.deleted + b.deleted, prefs: Math.max(a.prefs, b.prefs), skipped: (a.skipped ?? 0) + (b.skipped ?? 0) };
}
