// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
/**
 * Sync bookkeeping in database hooks, so no code path can forget it:
 *  - every create stamps `updatedAt`; every update moves it forward (never backwards, never a tie with itself);
 *  - every delete leaves a tombstone, written once the delete went through.
 * A merge applies the other device's rows inside `skipSyncStamping()`, which switches both off for that
 * transaction. Without it a merge would re-stamp every row it touched and two devices would trade them forever.
 */
import Dexie, { type Transaction } from 'dexie';
import type { AnalogDB, TombstoneRow } from '@/db/schema';

/** The tables whose rows travel between devices. `settings` has its own rule (SYNCED_PREFS) and `photos` stays put. */
export const SYNC_TABLES = [
  'exercises',
  'exerciseOverrides',
  'machineSettings',
  'gyms',
  'workouts',
  'workoutGroups',
  'workoutExercises',
  'workoutSets',
  'feedback',
  'landmarks',
  'programs',
  'programRuns',
  'prs',
  'measurements',
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

/** Graves are forgotten after this long; a device that was away longer than that gets its deleted rows back. */
export const TOMBSTONE_TTL_MS = 180 * 86_400_000;

const SKIP = '__analogSkipSync';
type Flagged = Transaction & { [SKIP]?: boolean };

/** Mark the running transaction as "applying the other device's data": no stamping, no tombstones. */
export function skipSyncStamping(): void {
  const t = Dexie.currentTransaction as Flagged | null;
  if (t) t[SKIP] = true;
}

/** A row's key as a string, for tombstone ids and lookups. Compound keys become JSON arrays. */
export const ridOf = (key: unknown): string => (Array.isArray(key) ? JSON.stringify(key) : String(key));
export const tombstoneId = (table: string, rid: string): string => `${table}:${rid}`;

const pending = new Set<Promise<unknown>>();

/** Resolves once every tombstone write started so far has landed. A merge awaits it before it reads the graves. */
export async function flushTombstones(): Promise<void> {
  while (pending.size) await Promise.allSettled([...pending]);
}

export function installSyncHooks(d: AnalogDB): void {
  for (const name of SYNC_TABLES) {
    const table = d.table(name);
    table.hook('creating', function (_key, obj: { updatedAt?: number }, trans) {
      if ((trans as Flagged)[SKIP]) return;
      if (obj.updatedAt === undefined) obj.updatedAt = Date.now();
    });
    table.hook('updating', function (_mods, _key, obj: { updatedAt?: number }, trans) {
      if ((trans as Flagged)[SKIP]) return;
      return { updatedAt: Math.max(Date.now(), (obj.updatedAt ?? 0) + 1) };
    });
    table.hook('deleting', function (key, _obj, trans) {
      if ((trans as Flagged)[SKIP]) return;
      const rid = ridOf(key);
      const row: TombstoneRow = { id: tombstoneId(name, rid), table: name, rid, at: Date.now() };
      // After the delete has gone through, in a transaction of its own (this one may not include `tombstones`).
      this.onsuccess = () => {
        const write = Dexie.ignoreTransaction(() => d.tombstones.put(row)).catch((err) => console.warn('[sync] tombstone not written', err));
        pending.add(write);
        void write.finally(() => pending.delete(write));
      };
    });
  }
}

/** Forget graves older than the TTL. */
export async function pruneTombstones(d: AnalogDB, now = Date.now()): Promise<number> {
  return d.tombstones.where('at').below(now - TOMBSTONE_TTL_MS).delete();
}
