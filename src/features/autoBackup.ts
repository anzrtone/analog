// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
/**
 * Automatic backups into the app's own files, as Promodoro's features/autoBackup.ts does.
 *
 * One file per day (`analog-backup-YYYY-MM-DD.json`, the same file Backup and export makes): written after every
 * finished workout (rewriting that day's file, so there is at most one a day) and once at launch when the newest
 * is from an earlier day. Only the newest 7 are kept. On Android the folder is part of Android's device backup, so
 * a new phone gets them back; Backup and export can restore any of them.
 */
import { exportAll } from '@/db/backup';
import type { AnalogDB } from '@/db/schema';
import { loadSettings, saveSettings } from '@/db/settings';
import type { Platform } from '@/platform/types';

export const KEEP_BACKUPS = 7;

const pad = (n: number) => String(n).padStart(2, '0');
export const localDay = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const backupFileName = (now = Date.now()) => `analog-backup-${localDay(now)}.json`;

export type BackupOutcome = { status: 'written'; path: string; pruned: number } | { status: 'skipped'; reason: 'today' | 'empty' | 'busy' } | { status: 'failed'; error: string };

let running = false;

/**
 * `workout`: a workout was just finished; always write (today's file is rewritten).
 * `launch`: write only if today's backup isn't there yet and there is something worth keeping.
 */
export async function runAutoBackup(d: AnalogDB, p: Platform, reason: 'workout' | 'launch', now = Date.now()): Promise<BackupOutcome> {
  if (running) return { status: 'skipped', reason: 'busy' };
  running = true;
  try {
    const s = await loadSettings(d);
    if (reason === 'launch') {
      if (s.autoBackupAt != null && localDay(s.autoBackupAt) === localDay(now)) return { status: 'skipped', reason: 'today' };
      if ((await d.workouts.count()) === 0 && (await d.programs.count()) === 0) return { status: 'skipped', reason: 'empty' };
    }
    const file = await exportAll(d, now);
    const res = await p.writeBackup(backupFileName(now), JSON.stringify(file), KEEP_BACKUPS);
    await saveSettings(d, { autoBackupAt: now });
    return { status: 'written', path: res.path, pruned: res.pruned };
  } catch (err) {
    return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
  } finally {
    running = false;
  }
}
