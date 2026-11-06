// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import type { AnalogDB } from '@/db/schema';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '@/db/settings';
import { testDb } from '@/db/testing';
import { setRow, workoutExerciseRow, workoutRow } from '@/db/workouts';
import { decryptSnapshot, deriveKeys, encryptSnapshot, formatSyncCode, generateSyncCode, normalizeSyncCode, sha256Hex, WrongCodeError } from '@/sync/crypto';
import { mergeSyncFile, saveSyncFile, startAutoSyncLoop, stopAndDeleteFromServer, syncNow, type SyncDeps } from '@/sync/index';
import { buildSnapshot } from '@/sync/merge';
import { createRelay, type Fetch } from '@/sync/relay';
import { dev } from '@/platform/dev';
import type { Platform, SyncFile } from '@/platform/types';
// @ts-expect-error plain JavaScript Worker
import worker from '../worker/index.js';
import { relayEnv, sizedRequest } from './workerEnv';

const T = 1_700_000_000_000;
const CODE = 'ABCDEFGHJKMNPQRSTVWX';

async function addWorkout(d: AnalogDB, id: string) {
  await d.workouts.put(workoutRow({ id, title: id, startedAt: T, endedAt: T + 3_600_000 }));
  await d.workoutExercises.put(workoutExerciseRow({ id: `${id}-e`, workoutId: id, exerciseId: 'bench', order: 0 }));
  await d.workoutSets.put(setRow({ id: `${id}-s`, workoutId: id, workoutExerciseId: `${id}-e`, exerciseId: 'bench', order: 0, weightG: 100000, reps: 5, completedAt: T }));
}

const setSync = (d: AnalogDB, patch: Partial<typeof DEFAULT_SETTINGS.sync>) => saveSettings(d, { sync: { ...DEFAULT_SETTINGS.sync, ...patch } });

describe('pairing codes', () => {
  it('generates 20 Crockford characters and shows them in groups of five', () => {
    const code = generateSyncCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{20}$/);
    expect(formatSyncCode(code)).toMatch(/^\w{5}-\w{5}-\w{5}-\w{5}$/);
    expect(generateSyncCode()).not.toBe(code);
  });

  it('normalises separators, case and look-alikes, and rejects anything else', () => {
    expect(normalizeSyncCode('abcde-fghjk-mnpqr-stvwx')).toBe(CODE);
    expect(normalizeSyncCode('ABCDE FGHJK MNPQR STVWX')).toBe(CODE);
    expect(normalizeSyncCode('OOOOO-IIIII-LLLLL-00001')).toBe('00000111111111100001');
    expect(normalizeSyncCode('ABCDE-FGHJK')).toBeNull();
    expect(normalizeSyncCode('ABCDE-FGHJK-MNPQR-STVWXY')).toBeNull();
    expect(normalizeSyncCode('UUUUU-UUUUU-UUUUU-UUUUU')).toBeNull();
  });
});

describe('keys and the wire format', () => {
  it('derives the same values from the same code, and unrelated values from each other', async () => {
    const a = await deriveKeys(CODE);
    const b = await deriveKeys(CODE);
    expect(a.id).toMatch(/^[0-9a-f]{32}$/);
    expect(a.token).toMatch(/^[0-9a-f]{64}$/);
    expect(b.id).toBe(a.id);
    expect(b.token).toBe(a.token);
    expect(a.token.startsWith(a.id)).toBe(false);
    const c = await deriveKeys('0'.repeat(20));
    expect(c.id).not.toBe(a.id);
    expect(a.key.extractable).toBe(false);
  });

  it('round-trips version 1 (plain) and version 2 (gzipped)', async () => {
    const { key } = await deriveKeys(CODE);
    const json = JSON.stringify({ hello: 'world'.repeat(500) });
    const v1 = await encryptSnapshot(json, key, { compress: false });
    const v2 = await encryptSnapshot(json, key);
    expect(v1[0]).toBe(1);
    expect(v2[0]).toBe(2);
    expect(v2.length).toBeLessThan(v1.length);
    expect(await decryptSnapshot(v1, key)).toBe(json);
    expect(await decryptSnapshot(v2, key)).toBe(json);
  });

  it('throws WrongCodeError for the wrong code, and rejects unknown versions and short blobs', async () => {
    const { key } = await deriveKeys(CODE);
    const wrong = (await deriveKeys('0'.repeat(20))).key;
    const blob = await encryptSnapshot('{}', key);
    await expect(decryptSnapshot(blob, wrong)).rejects.toBeInstanceOf(WrongCodeError);
    await expect(decryptSnapshot(new Uint8Array([9, ...blob.slice(1)]), key)).rejects.toThrow(/newer Analog/);
    await expect(decryptSnapshot(new Uint8Array(13), key)).rejects.toThrow(/not readable/);
  });
});

/** A relay backed by the real Worker over a fake bucket, reached through a fake `fetch`. */
function fakeServer() {
  const env = relayEnv();
  const calls: { method: string; url: string }[] = [];
  const fetch: Fetch = async (url, init) => {
    calls.push({ method: init?.method ?? 'GET', url });
    return worker.fetch(sizedRequest(url, init), env) as Promise<Response>;
  };
  return { items: env.SYNC_BUCKET.items, calls, relay: createRelay('https://relay.test', fetch) };
}

describe('stopping and deleting from the server', () => {
  const blobCount = (items: Map<string, unknown>) => [...items.keys()].filter((k) => /^[0-9a-f]{32}$/.test(k)).length;

  it('removes the blob, forgets the code and keeps every workout on the device', async () => {
    const server = fakeServer();
    const a = testDb();
    await setSync(a, { method: 'relay', code: CODE });
    await addWorkout(a, 'w1');
    expect((await syncNow({ db: a, platform: dev, relay: server.relay })).status).toBe('ok');
    expect(blobCount(server.items)).toBe(1);

    expect(await stopAndDeleteFromServer({ db: a, relay: server.relay })).toEqual({ status: 'ok' });
    expect(blobCount(server.items)).toBe(0);
    const sync = (await loadSettings(a)).sync;
    expect(sync.method).toBe('off');
    expect(sync.code).toBeNull();
    expect(await a.workouts.get('w1')).toBeTruthy();
    expect(server.calls.at(-1)?.method).toBe('DELETE');
  });

  it('keeps the code and keeps syncing when the server cannot delete, so it can be tried again', async () => {
    const a = testDb();
    await setSync(a, { method: 'relay', code: CODE });
    const relay = createRelay('https://relay.test', async () => new Response(null, { status: 503 }));
    const r = await stopAndDeleteFromServer({ db: a, relay });
    expect(r.status).toBe('failed');
    const sync = (await loadSettings(a)).sync;
    expect(sync.method).toBe('relay');
    expect(sync.code).toBe(CODE);
  });

  it('counts a blob that is already gone as deleted', async () => {
    const server = fakeServer();
    const a = testDb();
    await setSync(a, { method: 'relay', code: CODE });
    expect(await stopAndDeleteFromServer({ db: a, relay: server.relay })).toEqual({ status: 'ok' });
    expect((await loadSettings(a)).sync.code).toBeNull();
  });

  it('is put back by a device still paired, which is why the screen says to do this last', async () => {
    const server = fakeServer();
    const a = testDb();
    const b = testDb();
    await setSync(a, { method: 'relay', code: CODE });
    await setSync(b, { method: 'relay', code: CODE });
    await addWorkout(b, 'w1');
    await syncNow({ db: a, platform: dev, relay: server.relay });
    await syncNow({ db: b, platform: dev, relay: server.relay });
    await stopAndDeleteFromServer({ db: a, relay: server.relay });
    expect(blobCount(server.items)).toBe(0);
    expect((await syncNow({ db: b, platform: dev, relay: server.relay })).status).toBe('ok');
    expect(blobCount(server.items)).toBe(1);
  });

  it('waits for a sync in flight rather than racing it', async () => {
    const server = fakeServer();
    const a = testDb();
    await setSync(a, { method: 'relay', code: CODE });
    const sync = syncNow({ db: a, platform: dev, relay: server.relay });
    expect(await stopAndDeleteFromServer({ db: a, relay: server.relay })).toEqual({ status: 'busy' });
    await sync;
    expect((await loadSettings(a)).sync.code).toBe(CODE);
  });
});

describe('relay sync', () => {
  const deps =(db: AnalogDB, relay = fakeServer().relay): SyncDeps => ({ db, platform: dev, relay });

  it('pulls, merges and pushes: two devices end with each other’s workouts', async () => {
    const server = fakeServer();
    const a = testDb();
    const b = testDb();
    await setSync(a, { method: 'relay', code: CODE });
    await setSync(b, { method: 'relay', code: CODE });
    await addWorkout(a, 'wa');
    await addWorkout(b, 'wb');

    const first = await syncNow(deps(a, server.relay));
    expect(first).toMatchObject({ status: 'ok', pushed: true });
    const second = await syncNow(deps(b, server.relay));
    expect(second).toMatchObject({ status: 'ok', pushed: true });
    if (second.status === 'ok') expect(second.summary).toBe('Brought in 1 new workout.');
    const third = await syncNow(deps(a, server.relay));
    expect(third).toMatchObject({ status: 'ok' });
    expect((await a.workouts.toArray()).map((w) => w.id).sort()).toEqual(['wa', 'wb']);
    expect((await b.workouts.toArray()).map((w) => w.id).sort()).toEqual(['wa', 'wb']);
  });

  it('never puts readable data on the server', async () => {
    const server = fakeServer();
    const a = testDb();
    await setSync(a, { method: 'relay', code: CODE });
    await addWorkout(a, 'secret-workout-title');
    await syncNow(deps(a, server.relay));
    const stored = [...server.items.values()][0]!;
    expect(new TextDecoder().decode(stored.body)).not.toContain('secret-workout-title');
  });

  it('skips the upload when nothing changed, and uploads again after a change', async () => {
    const server = fakeServer();
    const a = testDb();
    await setSync(a, { method: 'relay', code: CODE });
    await addWorkout(a, 'w1');
    await syncNow(deps(a, server.relay));
    const puts = () => server.calls.filter((c) => c.method === 'PUT').length;
    expect(puts()).toBe(1);
    const again = await syncNow(deps(a, server.relay));
    expect(again).toMatchObject({ status: 'ok', pushed: false });
    if (again.status === 'ok') expect(again.summary).toBe('Everything is already up to date.');
    expect(puts()).toBe(1);
    await addWorkout(a, 'w2');
    await syncNow(deps(a, server.relay));
    expect(puts()).toBe(2);
  });

  it('maps relay failures to sentences a person can act on', async () => {
    const respond = (status: number): Fetch => async () => new Response(null, { status });
    const a = testDb();
    await setSync(a, { method: 'relay', code: CODE });
    await addWorkout(a, 'w1');
    const cases: [Fetch, RegExp][] = [
      [async () => Promise.reject(new TypeError('offline')), /Couldn't reach the sync server/],
      [respond(500), /error \(500\)/],
    ];
    for (const [fetch, pattern] of cases) {
      const r = await syncNow({ db: a, platform: dev, relay: createRelay('https://relay.test', fetch) });
      expect(r.status).toBe('failed');
      if (r.status === 'failed') expect(r.error).toMatch(pattern);
    }
    // PUT-time statuses: the GET says "nothing yet", the PUT is refused.
    for (const [status, pattern] of [[403, /Re-pair/], [429, /Too many/], [413, /too big/]] as const) {
      const fetch: Fetch = async (_u, init) => new Response(null, { status: init?.method === 'PUT' ? status : 404 });
      const r = await syncNow({ db: a, platform: dev, relay: createRelay('https://relay.test', fetch) });
      expect(r.status).toBe('failed');
      if (r.status === 'failed') expect(r.error).toMatch(pattern);
    }
    expect((await loadSettings(a)).sync.lastError).toMatch(/too big/);
  });

  it('says so when this build has no relay', async () => {
    const a = testDb();
    await setSync(a, { method: 'relay', code: CODE });
    const r = await syncNow({ db: a, platform: dev, relay: createRelay(null) });
    expect(r).toEqual({ status: 'failed', error: 'Sync over the internet is not set up in this build.' });
  });

  it('fails with the wrong-code sentence when the stored data was made with another code', async () => {
    const server = fakeServer();
    const a = testDb();
    const b = testDb();
    await setSync(a, { method: 'relay', code: CODE });
    await addWorkout(a, 'w1');
    await syncNow(deps(a, server.relay));
    // Same pair name, different key: put a blob made with another key under a's name.
    const mine = await deriveKeys(CODE);
    const other = await deriveKeys('0'.repeat(20));
    server.items.get(mine.id)!.body = await encryptSnapshot('{}', other.key);
    await setSync(b, { method: 'relay', code: CODE });
    const r = await syncNow(deps(b, server.relay));
    expect(r).toMatchObject({ status: 'failed' });
    if (r.status === 'failed') expect(r.error).toMatch(/Double-check the sync code/);
  });

  it('is skipped when sync is off or has no code', async () => {
    const a = testDb();
    expect(await syncNow(deps(a))).toEqual({ status: 'skipped', reason: 'off' });
    await setSync(a, { method: 'relay', code: null });
    expect(await syncNow(deps(a))).toEqual({ status: 'skipped', reason: 'no-code' });
    await setSync(a, { method: 'folder', dir: null });
    expect(await syncNow(deps(a))).toEqual({ status: 'skipped', reason: 'no-folder' });
  });

  it('stores lastError on failure and clears it on success; a second run at once is busy', async () => {
    const server = fakeServer();
    const a = testDb();
    await setSync(a, { method: 'relay', code: CODE });
    const bad = await syncNow({ db: a, platform: dev, relay: createRelay('https://relay.test', async () => Promise.reject(new Error('x'))) });
    expect(bad.status).toBe('failed');
    expect((await loadSettings(a)).sync.lastError).toBeTruthy();
    const [one, two] = await Promise.all([syncNow(deps(a, server.relay)), syncNow(deps(a, server.relay))]);
    expect([one.status, two.status].sort()).toEqual(['ok', 'skipped']);
    const s = (await loadSettings(a)).sync;
    expect(s.lastError).toBeNull();
    expect(s.lastAt).not.toBeNull();
  });
});

/** A shared folder, in memory. Each device writes only its own file; `reads` records every file that was read. */
function fakeFolder() {
  const files = new Map<string, string>();
  const reads: Record<string, string[]> = {};
  const writes: string[] = [];
  const platformFor = (): Platform => ({
    ...dev,
    async readSyncFiles(_dir, skipName): Promise<SyncFile[]> {
      const mine = (reads[skipName] ??= []);
      return [...files].filter(([name]) => name !== skipName).map(([name, text]) => {
        mine.push(name);
        return { name, text };
      });
    },
    async writeSyncFile(_dir, name, contents) {
      writes.push(name);
      files.set(name, contents);
    },
  });
  return { files, reads, writes, platformFor };
}

describe('folder sync', () => {
  it('reads other devices’ files, never its own, and writes only its own', async () => {
    const folder = fakeFolder();
    const a = testDb();
    const b = testDb();
    await setSync(a, { method: 'folder', dir: '/cloud', deviceId: 'da' });
    await setSync(b, { method: 'folder', dir: '/cloud', deviceId: 'db' });
    await addWorkout(a, 'wa');
    await addWorkout(b, 'wb');

    const first = await syncNow({ db: a, platform: folder.platformFor(), relay: createRelay(null) });
    expect(first).toMatchObject({ status: 'ok', pushed: true });
    if (first.status === 'ok') expect(first.summary).toContain("Saved this device's data to the folder");
    await syncNow({ db: b, platform: folder.platformFor(), relay: createRelay(null) });
    await syncNow({ db: a, platform: folder.platformFor(), relay: createRelay(null) });

    expect([...folder.files.keys()].sort()).toEqual(['analog-sync-da.json', 'analog-sync-db.json']);
    expect(folder.writes.every((n) => n === 'analog-sync-da.json' || n === 'analog-sync-db.json')).toBe(true);
    expect(folder.reads['analog-sync-da.json']).toEqual(['analog-sync-db.json']);
    expect(folder.reads['analog-sync-db.json']).toEqual(['analog-sync-da.json']);
    expect((await a.workouts.toArray()).map((w) => w.id).sort()).toEqual(['wa', 'wb']);
    expect((await b.workouts.toArray()).map((w) => w.id).sort()).toEqual(['wa', 'wb']);
  });

  it('counts a file that will not parse as still arriving, not as an error', async () => {
    const folder = fakeFolder();
    folder.files.set('analog-sync-dz.json', '{"app":"analog","tables":{');
    const a = testDb();
    await setSync(a, { method: 'folder', dir: '/cloud', deviceId: 'da' });
    const r = await syncNow({ db: a, platform: folder.platformFor(), relay: createRelay(null) });
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.summary).toContain('1 file is still arriving.');
    expect((await loadSettings(a)).sync.lastError).toBeNull();
  });

  it('skips the write when nothing changed', async () => {
    const folder = fakeFolder();
    const a = testDb();
    await setSync(a, { method: 'folder', dir: '/cloud', deviceId: 'da' });
    await addWorkout(a, 'w1');
    await syncNow({ db: a, platform: folder.platformFor(), relay: createRelay(null) });
    await syncNow({ db: a, platform: folder.platformFor(), relay: createRelay(null) });
    expect(folder.writes).toEqual(['analog-sync-da.json']);
  });
});

describe('sync file', () => {
  it('saves a snapshot and merges one from the other device', async () => {
    const a = testDb();
    const b = testDb();
    await addWorkout(b, 'wb');
    let saved = '';
    const platform: Platform = { ...dev, saveText: async (_n, _m, contents) => ((saved = contents), 'x.json') };
    await saveSyncFile({ db: b, platform });
    const res = await mergeSyncFile({ db: a }, saved);
    expect(res.summary).toBe('Brought in 1 new workout.');
    expect((await loadSettings(a)).sync.lastSummary).toBe('Brought in 1 new workout.');
    await expect(mergeSyncFile({ db: a }, 'not json')).rejects.toThrow(/valid JSON/);
  });
});

describe('automatic sync', () => {
  it('runs 20 s after launch only when enabled, and keeps a gap between runs', async () => {
    vi.useFakeTimers();
    try {
      let runs = 0;
      let on = false;
      const doc = new EventTarget() as unknown as Pick<Document, 'addEventListener' | 'hidden'>;
      Object.assign(doc, { hidden: false });
      const loop = startAutoSyncLoop(async () => void runs++, () => on, doc);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(runs).toBe(0);
      on = true;
      loop.nudge();
      loop.nudge();
      expect(runs).toBe(1);
      await vi.advanceTimersByTimeAsync(121_000);
      loop.nudge();
      expect(runs).toBe(2);
      loop.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('snapshots keep a stable fingerprint', () => {
  it('hashes the same data to the same value however late it is exported', async () => {
    const a = testDb();
    await addWorkout(a, 'w1');
    const { snapshotJson } = await import('@/sync/merge');
    const one = await sha256Hex(snapshotJson(await buildSnapshot(a, 1)));
    const two = await sha256Hex(snapshotJson(await buildSnapshot(a, 999)));
    expect(one).toBe(two);
  });
});
