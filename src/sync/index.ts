// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
/**
 * Device sync, orchestrated. Three ways carry the same snapshot and all end in `mergeBackup`:
 *  - relay: a pairing code; an encrypted blob on a server that cannot read it;
 *  - folder: one file per device in a folder the person's own cloud app syncs;
 *  - file: save a file here, merge a file there.
 * Pull, merge, then push the merged result, so what is stored is always a superset of what each device had.
 * Everything is opt-in: with `method: 'off'` (the default) nothing here ever runs.
 */
import type { AnalogDB } from '@/db/schema';
import { loadSettings, saveSettings, type SyncSettings } from '@/db/settings';
import type { Platform } from '@/platform/types';
import { decryptSnapshot, deriveKeys, encryptSnapshot, normalizeSyncCode, sha256Hex } from './crypto';
import { addStats, buildSnapshot, describeMerge, emptyStats, mergeBackup, mergedAnything, parseBackup, snapshotJson, type MergeStats } from './merge';
import type { Relay } from './relay';

export { generateSyncCode, formatSyncCode, normalizeSyncCode, WrongCodeError } from './crypto';
export { mergedAnything, describeMerge, type MergeStats } from './merge';

export interface SyncDeps {
  db: AnalogDB;
  platform: Platform;
  relay: Relay;
  now?: () => number;
}

export type SyncOutcome =
  | { status: 'ok'; summary: string; pushed: boolean; stats: MergeStats }
  | { status: 'skipped'; reason: 'off' | 'busy' | 'no-folder' | 'no-code' }
  | { status: 'failed'; error: string };

let running = false;

const syncFileName = (deviceId: string) => `analog-sync-${deviceId}.json`;

async function patchSync(d: AnalogDB, patch: Partial<SyncSettings>): Promise<SyncSettings> {
  const next = { ...(await loadSettings(d)).sync, ...patch };
  await saveSettings(d, { sync: next });
  return next;
}

/** This device's name in a sync folder, made once. */
export async function ensureDeviceId(d: AnalogDB): Promise<string> {
  const have = (await loadSettings(d)).sync.deviceId;
  if (have) return have;
  const id = `d${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
  await patchSync(d, { deviceId: id });
  return id;
}

interface Ran {
  summary: string;
  pushed: boolean;
  stats: MergeStats;
}

async function syncRelay(deps: SyncDeps, s: SyncSettings): Promise<Ran | 'no-code'> {
  const code = s.code ? normalizeSyncCode(s.code) : null;
  if (!code) return 'no-code';
  const { id, key, token } = await deriveKeys(code);

  // 1. Pull whatever is stored, and merge it in.
  const blob = await deps.relay.get(id);
  let stats = emptyStats();
  if (blob) stats = await mergeBackup(deps.db, parseBackup(await decryptSnapshot(blob, key)), { honorDeletes: true });

  // 2. Push the merged result, unless neither side has changed since the last time.
  const file = await buildSnapshot(deps.db, deps.now?.());
  const hash = await sha256Hex(snapshotJson(file));
  const blobHash = blob ? await sha256Hex(blob) : null;
  if (blob && s.lastPushHash === hash && s.lastBlobHash === blobHash) return { summary: describeMerge(stats, false), pushed: false, stats };

  const body = await encryptSnapshot(JSON.stringify(file), key);
  await deps.relay.put(id, token, body);
  await patchSync(deps.db, { lastPushHash: hash, lastBlobHash: await sha256Hex(body) });
  return { summary: describeMerge(stats, true), pushed: true, stats };
}

async function syncFolder(deps: SyncDeps, s: SyncSettings): Promise<Ran | 'no-folder'> {
  if (!s.dir) return 'no-folder';
  const own = syncFileName(await ensureDeviceId(deps.db));
  const files = await deps.platform.readSyncFiles(s.dir, own);
  let stats = emptyStats();
  let arriving = 0;
  let others = 0;
  for (const f of files) {
    if (f.name === own) continue;
    try {
      const backup = parseBackup(f.text);
      others++;
      stats = addStats(stats, await mergeBackup(deps.db, backup, { honorDeletes: true }));
    } catch {
      // Half-synced by the cloud app, or from a newer Analog: try again next time.
      arriving++;
    }
  }

  const file = await buildSnapshot(deps.db, deps.now?.());
  const hash = await sha256Hex(snapshotJson(file));
  let pushed = false;
  if (s.lastPushHash !== hash) {
    await deps.platform.writeSyncFile(s.dir, own, JSON.stringify(file));
    await patchSync(deps.db, { lastPushHash: hash });
    pushed = true;
  }

  let summary = others === 0 && arriving === 0 ? "Saved this device's data to the folder. Sync the other device to bring it together." : describeMerge(stats, pushed);
  if (arriving && !mergedAnything(stats)) summary += ` (${arriving} file${arriving === 1 ? ' is' : 's are'} still arriving.)`;
  return { summary, pushed, stats };
}

/** Sync with the chosen way. Never throws: the result says what happened and `lastError` remembers a failure. */
export async function syncNow(deps: SyncDeps): Promise<SyncOutcome> {
  if (running) return { status: 'skipped', reason: 'busy' };
  running = true;
  try {
    const s = (await loadSettings(deps.db)).sync;
    if (s.method === 'off' || s.method === 'file') return { status: 'skipped', reason: 'off' };
    const ran = s.method === 'relay' ? await syncRelay(deps, s) : await syncFolder(deps, s);
    if (ran === 'no-code' || ran === 'no-folder') return { status: 'skipped', reason: ran };
    await patchSync(deps.db, { lastAt: deps.now?.() ?? Date.now(), lastError: null, lastSummary: ran.summary });
    return { status: 'ok', ...ran };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await patchSync(deps.db, { lastError: error }).catch(() => undefined);
    return { status: 'failed', error };
  } finally {
    running = false;
  }
}

/** The manual way, outbound: this device's snapshot as a file to carry to the other. */
export async function saveSyncFile(deps: Pick<SyncDeps, 'db' | 'platform' | 'now'>): Promise<string | null> {
  const id = await ensureDeviceId(deps.db);
  const where = await deps.platform.saveText(syncFileName(id), 'application/json', JSON.stringify(await buildSnapshot(deps.db, deps.now?.())));
  if (where) await patchSync(deps.db, { lastAt: deps.now?.() ?? Date.now(), lastError: null, lastSummary: 'Saved a sync file. Merge it on the other device.' });
  return where;
}

/** The manual way, inbound: merge a sync file from the other device. Throws a BackupError that is fit to show. */
export async function mergeSyncFile(deps: Pick<SyncDeps, 'db' | 'now'>, text: string): Promise<{ summary: string; stats: MergeStats }> {
  const stats = await mergeBackup(deps.db, parseBackup(text), { honorDeletes: true });
  const summary = describeMerge(stats, false);
  await patchSync(deps.db, { lastAt: deps.now?.() ?? Date.now(), lastError: null, lastSummary: summary });
  return { summary, stats };
}

/** Stop syncing on this device. The other devices carry on. */
export async function stopSyncing(d: AnalogDB): Promise<void> {
  await patchSync(d, { method: 'off', code: null, dir: null, lastPushHash: null, lastBlobHash: null, lastError: null });
}

/** Changing the folder or code must upload again next time. */
export const FORGET_PUSH: Partial<SyncSettings> = { lastPushHash: null, lastBlobHash: null };

export { patchSync };

/**
 * Sync in the background, only when the person turned on a way that needs no tap (relay or folder) and left
 * "Sync automatically" on: soon after launch, every 20 minutes, when the app is put away (so the other device sees the
 * latest) and when it comes back. A shared gap keeps it from hammering anything. Errors land in `lastError`.
 */
export function startAutoSyncLoop(run: () => Promise<unknown>, enabled: () => boolean, doc: Pick<Document, 'addEventListener' | 'hidden'> = document): { nudge: () => void; stop: () => void } {
  let last = 0;
  const go = (minGapMs: number) => {
    if (!enabled() || Date.now() - last < minGapMs) return;
    last = Date.now();
    void run().catch(() => undefined);
  };
  const first = setTimeout(() => go(0), 20_000);
  const every = setInterval(() => go(10 * 60_000), 20 * 60_000);
  doc.addEventListener('visibilitychange', () => go(doc.hidden ? 2 * 60_000 : 10 * 60_000));
  return {
    nudge: () => go(2 * 60_000),
    stop: () => {
      clearTimeout(first);
      clearInterval(every);
    },
  };
}
