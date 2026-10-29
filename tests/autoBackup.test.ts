// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { checkBackup } from '@/db/backup';
import { loadSettings, saveSettings } from '@/db/settings';
import { testDb } from '@/db/testing';
import { startWorkout } from '@/db/workouts';
import { backupFileName, KEEP_BACKUPS, runAutoBackup } from '@/features/autoBackup';
import { dev } from '@/platform/dev';
import type { Platform } from '@/platform/types';

const DAY = 86_400_000;
const T0 = new Date(2026, 9, 1, 18, 0).getTime();

/** The Android bridge's file handling, in memory: one file per name, newest `keep` kept. */
function fakeFiles(): Platform & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    ...dev,
    files,
    async writeBackup(name, contents, keep) {
      files.set(name, contents);
      const old = [...files.keys()].sort().reverse().slice(keep);
      old.forEach((n) => files.delete(n));
      return { path: `backups/${name}`, pruned: old.length };
    },
    async listBackups() {
      return [...files.keys()].sort().reverse();
    },
    async readBackup(name) {
      return files.get(name)!;
    },
  };
}

describe('automatic backups', () => {
  it('writes after every finished workout, one file a day, and keeps the newest 7', async () => {
    const db = testDb();
    const p = fakeFiles();
    await startWorkout(db, { title: 'x' }, T0);
    for (let day = 0; day < 10; day++) {
      // Two workouts on the same day rewrite that day's file.
      expect((await runAutoBackup(db, p, 'workout', T0 + day * DAY)).status).toBe('written');
      expect((await runAutoBackup(db, p, 'workout', T0 + day * DAY + 3_600_000)).status).toBe('written');
    }
    expect(p.files.size).toBe(KEEP_BACKUPS);
    expect(await p.listBackups()).toEqual(Array.from({ length: 7 }, (_, i) => backupFileName(T0 + (9 - i) * DAY)));
    const newest = checkBackup(await p.readBackup((await p.listBackups())[0]!));
    expect(newest.ok && newest.counts.workouts).toBe(1);
  });

  it('at launch: at most once a day, and not for an empty app', async () => {
    const db = testDb();
    const p = fakeFiles();
    expect(await runAutoBackup(db, p, 'launch', T0)).toEqual({ status: 'skipped', reason: 'empty' });
    await startWorkout(db, { title: 'x' }, T0);
    expect((await runAutoBackup(db, p, 'launch', T0)).status).toBe('written');
    expect(await runAutoBackup(db, p, 'launch', T0 + 3_600_000)).toEqual({ status: 'skipped', reason: 'today' });
    expect((await runAutoBackup(db, p, 'launch', T0 + DAY)).status).toBe('written');
    expect((await loadSettings(db)).autoBackupAt).toBe(T0 + DAY);
  });

  it('a failure is reported and the next run tries again', async () => {
    const db = testDb();
    await saveSettings(db, { autoBackupAt: null });
    await startWorkout(db, { title: 'x' }, T0);
    const broken: Platform = { ...dev, writeBackup: async () => Promise.reject(new Error('disk full')) };
    expect(await runAutoBackup(db, broken, 'workout', T0)).toEqual({ status: 'failed', error: 'disk full' });
    expect((await loadSettings(db)).autoBackupAt).toBeNull();
  });
});
