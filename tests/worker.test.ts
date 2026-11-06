// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
// @ts-expect-error plain JavaScript Worker
import worker from '../worker/index.js';
// @ts-expect-error plain JavaScript Worker
import * as entry from '../worker/index.js';
// @ts-expect-error plain JavaScript Worker
import { DEFAULT_LIMITS, MAX_AGE_MS, MAX_BYTES } from '../worker/limits.js';
// @ts-expect-error plain JavaScript Worker
import { networkOf } from '../worker/network.js';
import { fakeBucket, fakeBudget, relayEnv, sizedRequest, type FakeBucket } from './workerEnv';

const ID = 'a'.repeat(32);
const TOKEN = 'b'.repeat(64);
const OTHER = 'c'.repeat(64);
const bytes = (n: number) => new Uint8Array(n).fill(7);
const hexId = (i: number) => i.toString(16).padStart(32, '0');

function call(env: unknown, method: string, token: string | null, body?: Uint8Array, path = `/sync/${ID}`, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { ...headers };
  if (token) h['x-sync-token'] = token;
  return worker.fetch(sizedRequest(`https://relay.test${path}`, { method, headers: h, body: body as BodyInit }), env) as Promise<Response>;
}

/** A walk over the bucket, run to the end the way the cron does it: one page per run. */
async function walk(env: unknown, runs = 50) {
  for (let i = 0; i < runs; i++) await worker.scheduled({}, env);
}

const budgetOf = (env: { BUDGET: ReturnType<typeof fakeBudget> }) => env.BUDGET.budget.status();

describe('the entry module', () => {
  it('exports only handlers and classes: the runtime refuses to start on a plain value', () => {
    for (const [name, value] of Object.entries(entry)) {
      expect(typeof value === 'function' || (name === 'default' && typeof value === 'object'), `export ${name}`).toBe(true);
    }
  });
});

describe('sync relay worker', () => {
  it('answers 404, takes a PUT, then returns the same bytes', async () => {
    const env = relayEnv();
    expect((await call(env, 'GET', null)).status).toBe(404);
    expect((await call(env, 'PUT', TOKEN, bytes(100))).status).toBe(204);
    const res = await call(env, 'GET', null);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes(100));
  });

  it('stores only a hash of the token, and the first write claims the name', async () => {
    const env = relayEnv();
    await call(env, 'PUT', TOKEN, bytes(50));
    const meta = env.SYNC_BUCKET.items.get(ID)!.customMetadata!.tokenHash;
    expect(meta).toMatch(/^[0-9a-f]{64}$/);
    expect(meta).not.toBe(TOKEN);
    expect((await call(env, 'PUT', OTHER, bytes(50))).status).toBe(403);
    expect((await call(env, 'PUT', TOKEN, bytes(60))).status).toBe(204);
  });

  it('refuses a missing or malformed token before touching the bucket', async () => {
    const env = relayEnv();
    expect((await call(env, 'PUT', null, bytes(50))).status).toBe(403);
    expect((await call(env, 'PUT', 'short', bytes(50))).status).toBe(403);
    expect((await call(env, 'DELETE', null)).status).toBe(403);
    expect((await call(env, 'DELETE', 'short')).status).toBe(403);
    expect(env.SYNC_BUCKET.calls).toEqual({ get: 0, head: 0, put: 0, list: 0, delete: 0 });
  });

  it('enforces the size limits from the declared length, without reading the body', async () => {
    const env = relayEnv();
    expect((await call(env, 'PUT', TOKEN, bytes(13))).status).toBe(400);
    expect((await call(env, 'PUT', TOKEN, undefined, `/sync/${ID}`, { 'content-length': String(MAX_BYTES + 1) })).status).toBe(413);
    expect((await call(env, 'PUT', TOKEN, bytes(14))).status).toBe(204);
  });

  it('refuses a body with no declared length: a chunked upload cannot be billed or buffered', async () => {
    const env = relayEnv();
    const stream = new Blob([bytes(100)]).stream();
    const req = new Request(`https://relay.test/sync/${hexId(5)}`, { method: 'PUT', headers: { 'x-sync-token': TOKEN }, body: stream, duplex: 'half' } as RequestInit);
    expect((await worker.fetch(req, env)).status).toBe(411);
    for (const bad of ['abc', '-1', '0x10', '1e3', 'Infinity']) {
      const r = new Request(`https://relay.test/sync/${hexId(5)}`, { method: 'PUT', headers: { 'x-sync-token': TOKEN, 'content-length': bad }, body: bytes(20) });
      expect((await worker.fetch(r, env)).status).toBe(411);
    }
    expect(env.SYNC_BUCKET.calls.put).toBe(0);
  });

  it('reads an expired object as gone but keeps its claim until the walk removes it', async () => {
    const env = relayEnv();
    await call(env, 'PUT', TOKEN, bytes(50));
    env.SYNC_BUCKET.items.get(ID)!.uploaded = new Date(Date.now() - MAX_AGE_MS - 1000);
    expect((await call(env, 'GET', null)).status).toBe(404);
    expect(env.SYNC_BUCKET.items.has(ID)).toBe(true);
    // A stranger holding the id cannot free the name with a GET and claim it.
    expect((await call(env, 'PUT', OTHER, bytes(50))).status).toBe(403);
    // The right device can bring it back.
    expect((await call(env, 'PUT', TOKEN, bytes(50))).status).toBe(204);
    expect((await call(env, 'GET', null)).status).toBe(200);
  });

  it('needs the token to DELETE, and gives the space back', async () => {
    const env = relayEnv();
    await call(env, 'PUT', TOKEN, bytes(50));
    expect(budgetOf(env).storedBytes).toBe(50);
    expect((await call(env, 'DELETE', OTHER)).status).toBe(403);
    expect(env.SYNC_BUCKET.items.has(ID)).toBe(true);
    expect((await call(env, 'DELETE', TOKEN)).status).toBe(204);
    expect(env.SYNC_BUCKET.items.has(ID)).toBe(false);
    expect(budgetOf(env).storedBytes).toBe(0);
    expect((await call(env, 'DELETE', TOKEN)).status).toBe(404);
  });

  it('never lets a token take over an object with no stored hash', async () => {
    const env = relayEnv();
    await env.SYNC_BUCKET.put(ID, bytes(50));
    expect((await call(env, 'PUT', TOKEN, bytes(50))).status).toBe(403);
    expect((await call(env, 'DELETE', TOKEN)).status).toBe(403);
    expect(env.SYNC_BUCKET.items.has(ID)).toBe(true);
  });

  it('answers only the sync route, and CORS preflight from the app', async () => {
    const env = relayEnv();
    expect((await call(env, 'GET', null, undefined, '/elsewhere')).status).toBe(404);
    expect((await call(env, 'GET', null, undefined, '/sync/not-hex')).status).toBe(404);
    const pre = await call(env, 'OPTIONS', null, undefined, `/sync/${ID}`, { origin: 'https://localhost' });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('https://localhost');
    expect(pre.headers.get('access-control-allow-headers')).toContain('x-sync-token');
  });

  it('answers a failure with a status and CORS, never an exception', async () => {
    const down = { ...fakeBucket(), get: async () => Promise.reject(new Error('R2 down')), head: async () => Promise.reject(new Error('R2 down')) };
    const env = relayEnv({ SYNC_BUCKET: down });
    const res = await call(env, 'GET', null, undefined, `/sync/${ID}`, { origin: 'https://localhost' });
    expect(res.status).toBe(503);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://localhost');
    expect(await res.text()).toBe('');
    expect((await call(env, 'PUT', TOKEN, bytes(50))).status).toBe(503);
  });
});

describe('concurrent writers', () => {
  it('lets exactly one of several first writers win', async () => {
    const env = relayEnv();
    const tokens = Array.from({ length: 8 }, (_, i) => String(i).repeat(64));
    const statuses = await Promise.all(tokens.map((t) => call(env, 'PUT', t, bytes(100)).then((r) => r.status)));
    expect(statuses.filter((s) => s === 204)).toHaveLength(1);
    const winner = tokens[statuses.indexOf(204)]!;
    expect((await call(env, 'PUT', winner, bytes(100))).status).toBe(204);
  });

  it('refuses an update of a version that has changed, and gives the bytes back', async () => {
    const env = relayEnv();
    await call(env, 'PUT', TOKEN, bytes(100));
    // A second device writes between this request's check and its write.
    const bucket = env.SYNC_BUCKET;
    const realHead = bucket.head.bind(bucket);
    bucket.head = async (k: string) => {
      const seen = await realHead(k);
      bucket.head = realHead;
      await bucket.put(k, bytes(100), { customMetadata: seen?.customMetadata });
      return seen;
    };
    const before = budgetOf(env).storedBytes;
    expect((await call(env, 'PUT', TOKEN, bytes(500))).status).toBe(409);
    expect(budgetOf(env).storedBytes).toBe(before);
  });
});

describe('rate limits', () => {
  const no = { limit: async () => ({ success: false }) };

  it('limits writes, reads, deletes and /stats guesses', async () => {
    expect((await call(relayEnv({ SYNC_LIMITER: no }), 'PUT', TOKEN, bytes(50))).status).toBe(429);
    expect((await call(relayEnv({ SYNC_LIMITER: no }), 'DELETE', TOKEN)).status).toBe(429);
    expect((await call(relayEnv({ READ_LIMITER: no }), 'GET', null)).status).toBe(429);
    expect((await call(relayEnv({ ADMIN_LIMITER: no, ADMIN_TOKEN: 's' }), 'GET', null, undefined, '/stats')).status).toBe(429);
    const limited = relayEnv({ SYNC_LIMITER: no });
    await call(limited, 'PUT', TOKEN, bytes(50));
    await call(limited, 'DELETE', TOKEN);
    expect(limited.SYNC_BUCKET.calls).toEqual({ get: 0, head: 0, put: 0, list: 0, delete: 0 });
  });

  it('fails closed when any limiter or the ledger is missing', async () => {
    for (const missing of ['SYNC_LIMITER', 'WIDE_LIMITER', 'PAIR_LIMITER']) {
      const env = relayEnv({ [missing]: undefined });
      expect((await call(env, 'PUT', TOKEN, bytes(50))).status, missing).toBe(503);
      expect(env.SYNC_BUCKET.calls.put).toBe(0);
    }
    expect((await call(relayEnv({ READ_LIMITER: undefined }), 'GET', null)).status).toBe(503);
    expect((await call(relayEnv({ ADMIN_LIMITER: undefined, ADMIN_TOKEN: 's' }), 'GET', null, undefined, '/stats')).status).toBe(503);
    const noLedger = { ...relayEnv(), BUDGET: undefined };
    expect((await call(noLedger, 'PUT', TOKEN, bytes(50))).status).toBe(503);
    expect((await call(noLedger, 'GET', null)).status).toBe(503);
  });

  it('refuses the write when the ledger cannot be reached', async () => {
    const broken = { idFromName: () => 'x', get: () => ({ fetch: async () => Promise.reject(new Error('down')) }) };
    const env = relayEnv({ BUDGET: broken });
    expect((await call(env, 'PUT', TOKEN, bytes(50))).status).toBe(503);
    expect(env.SYNC_BUCKET.calls.put).toBe(0);
  });

  it('counts all of a host\'s IPv6 addresses as one network, however they are written', () => {
    const narrow = (ip: string) => networkOf(ip).narrow;
    const wide = (ip: string) => networkOf(ip).wide;
    expect(narrow('2001:db8:1:2::1')).toBe(narrow('2001:db8:1:2:ffff:ffff:ffff:ffff'));
    expect(narrow('2001:DB8:1:2::1')).toBe(narrow('2001:0db8:0001:0002:0:0:0:9'));
    expect(narrow('2001:db8::1')).toBe('2001:0db8:0000:0000');
    expect(narrow('2001:db8:1:2::1')).not.toBe(narrow('2001:db8:1:3::1'));
    expect(wide('2001:db8:1:2::1')).toBe(wide('2001:db8:1:ffff::1'));
    expect(wide('2001:db8:1:2::1')).not.toBe(wide('2001:db8:2:2::1'));
    expect(networkOf('203.0.113.9')).toEqual({ narrow: '203.0.113.9', wide: null });
    expect(networkOf(null)).toEqual({ narrow: 'unknown', wide: null });
  });

  it('checks a host\'s /64 and /48 separately, so rotating subnets of a tunnel does not escape', async () => {
    const seen: Record<string, string[]> = { SYNC: [], WIDE: [] };
    const spy = (name: string) => ({
      limit: async ({ key }: { key: string }) => {
        seen[name]!.push(key);
        return { success: true };
      },
    });
    const env = relayEnv({ SYNC_LIMITER: spy('SYNC'), WIDE_LIMITER: spy('WIDE') });
    for (let i = 0; i < 3; i++) await call(env, 'PUT', TOKEN, bytes(20), `/sync/${hexId(i + 1)}`, { 'cf-connecting-ip': `2001:db8:1:${i}::1` });
    expect(new Set(seen.SYNC).size).toBe(3);
    expect(new Set(seen.WIDE).size).toBe(1);
  });

  it('does not let a stranger use up a pair\'s allowance', async () => {
    const keys: string[] = [];
    const env = relayEnv({ PAIR_LIMITER: { limit: async ({ key }: { key: string }) => (keys.push(key), { success: true }) } });
    await call(env, 'PUT', TOKEN, bytes(20));
    expect(keys).toHaveLength(1);
    await call(env, 'PUT', OTHER, bytes(20));
    expect(keys).toHaveLength(1);
  });
});

describe('the bill', () => {
  /** Fresh pairs from fresh networks, until the ledger refuses. */
  async function flood(env: unknown, count: number, size: number, start = 0) {
    const out: number[] = [];
    for (let i = start; i < start + count; i++) {
      const res = await call(env, 'PUT', TOKEN, bytes(size), `/sync/${hexId(i + 1)}`, { 'cf-connecting-ip': `198.51.${i >> 8}.${i & 255}` });
      out.push(res.status);
    }
    return out;
  }

  it('has default budgets that stay inside R2\'s free allowance', () => {
    const writes = DEFAULT_LIMITS.maxNewPairsPerDay + DEFAULT_LIMITS.maxSyncWritesPerDay + DEFAULT_LIMITS.maxRecordWritesPerDay;
    // 31 days, plus 96 possible scan pages a day.
    expect((writes + 96) * 31).toBeLessThan(1_000_000);
    expect(DEFAULT_LIMITS.maxReadsPerDay * 31).toBeLessThan(10_000_000);
    expect(DEFAULT_LIMITS.maxStoredBytes).toBeLessThan(10 * 1024 ** 3);
  });

  it('stops new pairs at the daily cap, from any number of networks', async () => {
    const env = relayEnv({}, { maxNewPairsPerDay: 3 });
    expect(await flood(env, 5, 20)).toEqual([204, 204, 204, 503, 503]);
    expect(env.SYNC_BUCKET.calls.put).toBe(3);
  });

  it('stops all growth at the storage ceiling, from any number of networks', async () => {
    const env = relayEnv({}, { maxStoredBytes: 100 });
    expect(await flood(env, 3, 40)).toEqual([204, 204, 507]);
    expect(env.SYNC_BUCKET.items.size).toBe(2);
    // A pair that is already stored can still shrink or stay the same.
    const key = [...env.SYNC_BUCKET.items.keys()][0]!;
    expect((await call(env, 'PUT', TOKEN, bytes(40), `/sync/${key}`)).status).toBe(204);
    expect((await call(env, 'PUT', TOKEN, bytes(70), `/sync/${key}`)).status).toBe(507);
    expect((await call(env, 'PUT', TOKEN, bytes(14), `/sync/${key}`)).status).toBe(204);
    expect(budgetOf(env).storedBytes).toBe(54);
  });

  it('counts growth of an existing pair, so small pairs cannot be inflated around the cap', async () => {
    const env = relayEnv({}, { maxNewBytesPerDay: 100 });
    expect((await call(env, 'PUT', TOKEN, bytes(14))).status).toBe(204);
    expect((await call(env, 'PUT', TOKEN, bytes(100))).status).toBe(204);
    expect((await call(env, 'PUT', TOKEN, bytes(200))).status).toBe(503);
  });

  it('does not let create-and-delete churn around the daily new-bytes cap', async () => {
    const env = relayEnv({}, { maxNewBytesPerDay: 100 });
    for (let i = 0; i < 2; i++) {
      expect((await call(env, 'PUT', TOKEN, bytes(50))).status).toBe(204);
      expect((await call(env, 'DELETE', TOKEN)).status).toBe(204);
    }
    expect((await call(env, 'PUT', TOKEN, bytes(50))).status).toBe(503);
  });

  it('caps writes to existing pairs, and a flood of new pairs does not use that allowance', async () => {
    const env = relayEnv({}, { maxSyncWritesPerDay: 2, maxNewPairsPerDay: 2 });
    await call(env, 'PUT', TOKEN, bytes(20));
    expect(await flood(env, 3, 20, 100)).toEqual([204, 503, 503]);
    expect((await call(env, 'PUT', TOKEN, bytes(20))).status).toBe(204);
    expect((await call(env, 'PUT', TOKEN, bytes(20))).status).toBe(204);
    expect((await call(env, 'PUT', TOKEN, bytes(20))).status).toBe(503);
  });

  it('holds one network to its share, so one host cannot use up everyone\'s day', async () => {
    const env = relayEnv({}, { maxNetworkNewPairsPerDay: 2 });
    const same = { 'cf-connecting-ip': '2001:db8:1:2::1' };
    const near = { 'cf-connecting-ip': '2001:db8:1:ffff::9' };
    expect((await call(env, 'PUT', TOKEN, bytes(20), `/sync/${hexId(1)}`, same)).status).toBe(204);
    expect((await call(env, 'PUT', TOKEN, bytes(20), `/sync/${hexId(2)}`, near)).status).toBe(204);
    expect((await call(env, 'PUT', TOKEN, bytes(20), `/sync/${hexId(3)}`, same)).status).toBe(503);
    expect((await call(env, 'PUT', TOKEN, bytes(20), `/sync/${hexId(4)}`, { 'cf-connecting-ip': '2001:db8:2::1' })).status).toBe(204);
  });

  it('starts each UTC day with fresh daily allowances but keeps what is stored', async () => {
    const env = relayEnv({}, { maxNewPairsPerDay: 1, maxStoredBytes: 100 });
    const b = env.BUDGET.budget;
    let now = Date.UTC(2026, 10, 5, 23, 59);
    b.now = () => now;
    expect((await flood(env, 2, 20))).toEqual([204, 503]);
    now = Date.UTC(2026, 10, 6, 0, 1);
    expect(await flood(env, 1, 20, 50)).toEqual([204]);
    expect(budgetOf(env).storedBytes).toBe(40);
  });

  it('remembers the totals across a restart of the ledger', async () => {
    const first = fakeBudget();
    const env = relayEnv({ BUDGET: first });
    await call(env, 'PUT', TOKEN, bytes(50));
    // A new object over the same stored data, as after an eviction.
    const again = fakeBudget();
    for (const [k, v] of first.data) again.data.set(k, v);
    const reloaded = { ...again, budget: new (first.budget.constructor as new (s: unknown, e: unknown) => typeof first.budget)({ blockConcurrencyWhile: (f: () => Promise<unknown>) => void f(), storage: { get: async (k: string) => again.data.get(k), put: async () => undefined } }, {}) };
    await new Promise((r) => setTimeout(r, 0));
    expect(reloaded.budget.status().storedBytes).toBe(50);
  });

  it('closes reads once a day\'s budget is used, counting in batches', async () => {
    vi.resetModules();
    // @ts-expect-error plain JavaScript Worker
    const fresh = (await import('../worker/index.js')).default;
    const env = relayEnv({}, { maxReadsPerDay: 150 });
    const get = () => fresh.fetch(new Request(`https://relay.test/sync/${ID}`), env).then((r: Response) => r.status);
    const seen: number[] = [];
    for (let i = 0; i < 300; i++) seen.push(await get());
    expect(seen.filter((s) => s === 404).length).toBeLessThanOrEqual(200);
    expect(seen.at(-1)).toBe(503);
    const reads = env.SYNC_BUCKET.calls.get;
    await get();
    expect(env.SYNC_BUCKET.calls.get).toBe(reads);
  });

  it('caps survey and install records, by day and in total, apart from sync', async () => {
    const post = (env: unknown, i: number) => worker.fetch(sizedRequest('https://relay.test/install', { method: 'POST', body: JSON.stringify({ v: 1, installId: hexId(i), platform: 'dev', appVersion: '1', day: '2026-10-30' }) }), env).then((r: Response) => r.status);
    const today = relayEnv({}, { maxRecordWritesPerDay: 2 });
    expect([await post(today, 1), await post(today, 2), await post(today, 3)]).toEqual([204, 204, 503]);
    expect((await call(today, 'PUT', TOKEN, bytes(20))).status).toBe(204);
    const total = relayEnv({}, { maxRecords: 1 });
    expect([await post(total, 1), await post(total, 2)]).toEqual([204, 507]);
  });

  it('reports budget use to the owner', async () => {
    const env = relayEnv({ ADMIN_TOKEN: 's' });
    await call(env, 'PUT', TOKEN, bytes(50));
    const res = await worker.fetch(new Request('https://relay.test/stats', { headers: { authorization: 'Bearer s' } }), env);
    const body = JSON.parse(await res.text());
    expect(body.budget).toMatchObject({ storedBytes: 50, newPairs: 1, limits: { maxNewPairsPerDay: DEFAULT_LIMITS.maxNewPairsPerDay } });
    expect(JSON.stringify(body)).not.toContain('2001:');
  });

  it('never writes an address into the ledger', async () => {
    const env = relayEnv();
    await call(env, 'PUT', TOKEN, bytes(50), `/sync/${ID}`, { 'cf-connecting-ip': '2001:db8:1:2::1' });
    const stored = JSON.stringify([...env.BUDGET.data.entries()]);
    expect(stored).not.toContain('2001');
    expect(stored).not.toContain('0db8');
  });
});

describe('the scheduled walk', () => {
  const aged = (b: FakeBucket, key: string) => void (b.items.get(key)!.uploaded = new Date(Date.now() - MAX_AGE_MS - 1000));

  it('deletes expired blobs, keeps live ones and every record, and corrects the ledger', async () => {
    const env = relayEnv();
    const b = env.SYNC_BUCKET;
    await call(env, 'PUT', TOKEN, bytes(50), `/sync/${hexId(1)}`);
    await call(env, 'PUT', TOKEN, bytes(70), `/sync/${hexId(2)}`);
    await b.put('install/aaaaaaaa', '{}', { customMetadata: { platform: 'dev' } });
    b.items.get('install/aaaaaaaa')!.uploaded = new Date(0);
    aged(b, hexId(1));
    await walk(env);
    expect(b.items.has(hexId(1))).toBe(false);
    expect(b.items.has(hexId(2))).toBe(true);
    expect(b.items.has('install/aaaaaaaa')).toBe(true);
    expect(budgetOf(env)).toMatchObject({ storedBytes: 70, records: 1 });
  });

  it('fixes a ledger that started empty over a bucket already full', async () => {
    const env = relayEnv({}, { maxStoredBytes: 100 });
    const b = env.SYNC_BUCKET;
    await b.put(hexId(1), bytes(90), { customMetadata: { tokenHash: 'x' } });
    await walk(env);
    expect(budgetOf(env).storedBytes).toBe(90);
    expect((await call(env, 'PUT', TOKEN, bytes(20), `/sync/${hexId(2)}`)).status).toBe(507);
  });

  it('covers a large bucket one page per run, then stops touching R2 for the day', async () => {
    const env = relayEnv();
    const b = env.SYNC_BUCKET;
    for (let i = 0; i < 2500; i++) b.items.set(hexId(i), { body: new Uint8Array(0), uploaded: new Date(), size: 2, etag: 'x' });
    await worker.scheduled({}, env);
    expect(b.calls.list).toBe(1);
    await walk(env, 2);
    expect(b.calls.list).toBe(3);
    expect(budgetOf(env).storedBytes).toBe(5000);
    await walk(env, 10);
    expect(b.calls.list).toBe(3);
  });

  it('keeps writes made during the walk in the total', async () => {
    const env = relayEnv();
    const b = env.SYNC_BUCKET;
    for (let i = 0; i < 1500; i++) b.items.set(hexId(i + 10), { body: new Uint8Array(0), uploaded: new Date(), size: 1, etag: 'x' });
    await worker.scheduled({}, env);
    await call(env, 'PUT', TOKEN, bytes(100), `/sync/${'f'.repeat(32)}`);
    await walk(env);
    // Written after the walk began and also found by it: counted high until the next walk, never low.
    expect(budgetOf(env).storedBytes).toBeGreaterThanOrEqual(1600);
  });
});

describe('web pages cannot borrow visitors\' browsers', () => {
  it('refuses a foreign origin before anything billable', async () => {
    const env = relayEnv();
    const res = await call(env, 'PUT', TOKEN, bytes(50), `/sync/${ID}`, { origin: 'https://evil.test' });
    expect(res.status).toBe(403);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(env.SYNC_BUCKET.calls.head).toBe(0);
    const simple = await worker.fetch(sizedRequest('https://relay.test/survey', { method: 'POST', headers: { origin: 'https://evil.test', 'content-type': 'text/plain' }, body: '{}' }), env);
    expect(simple.status).toBe(403);
  });

  it('refuses images, scripts and no-cors fetches, which send no origin', async () => {
    const env = relayEnv();
    expect((await call(env, 'GET', null, undefined, `/sync/${ID}`, { 'sec-fetch-dest': 'image' })).status).toBe(403);
    expect((await call(env, 'GET', null, undefined, `/sync/${ID}`, { 'sec-fetch-dest': 'empty', 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect(env.SYNC_BUCKET.calls.get).toBe(0);
  });

  it('serves the app\'s origins, and tools that send no origin', async () => {
    const env = relayEnv();
    for (const origin of ['https://localhost', 'http://tauri.localhost', 'tauri://localhost']) {
      const res = await call(env, 'GET', null, undefined, `/sync/${ID}`, { origin, 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'empty' });
      expect(res.status, origin).toBe(404);
      expect(res.headers.get('access-control-allow-origin')).toBe(origin);
    }
    expect((await call(env, 'GET', null)).status).toBe(404);
  });
});

const ME = '11111111-2222-4333-8444-555555555555';
const post = (env: unknown, path: string, body: unknown, raw?: string) =>
  worker.fetch(sizedRequest(`https://relay.test${path}`, { method: 'POST', body: raw ?? JSON.stringify(body) }), env) as Promise<Response>;
const survey = (over: Record<string, unknown> = {}) => ({ v: 1, installId: ME, uses: ['strength', 'other'], usesOther: 'rowing', heardFrom: 'reddit', platform: 'android', appVersion: '0.5.0', answeredOn: '2026-10-30', ...over });
const install = (over: Record<string, unknown> = {}) => ({ v: 1, installId: ME, platform: 'desktop', appVersion: '0.5.0', day: '2026-10-30', ...over });
const stats = (env: unknown, auth?: string) => worker.fetch(new Request('https://relay.test/stats', { headers: auth ? { authorization: auth } : {} }), env) as Promise<Response>;

describe('survey and install records', () => {
  it('stores an opted-in survey and an install, and deletes them on withdraw', async () => {
    const env = relayEnv();
    const bucket = env.SYNC_BUCKET;
    expect((await post(env, '/survey', survey())).status).toBe(204);
    expect((await post(env, '/install', install())).status).toBe(204);
    expect(bucket.items.get(`survey/${ME}`)!.customMetadata).toMatchObject({ uses: 'strength,other', heardFrom: 'reddit', platform: 'android' });
    expect(bucket.items.get(`install/${ME}`)!.customMetadata).toMatchObject({ platform: 'desktop', appVersion: '0.5.0', day: '2026-10-30' });
    // Sending again replaces it: one record per install.
    await post(env, '/survey', survey({ heardFrom: 'friend' }));
    expect([...bucket.items.keys()].filter((k) => k.startsWith('survey/'))).toHaveLength(1);
    expect(bucket.items.get(`survey/${ME}`)!.customMetadata!.heardFrom).toBe('friend');
    expect((await post(env, '/survey', { v: 1, installId: ME, withdraw: true })).status).toBe(204);
    expect(bucket.items.has(`survey/${ME}`)).toBe(false);
    expect(bucket.items.has(`install/${ME}`)).toBe(true);
    expect((await post(env, '/install', { v: 1, installId: ME, withdraw: true })).status).toBe(204);
    expect(bucket.items.size).toBe(0);
  });

  it('rejects anything that is not what the app sends', async () => {
    const env = relayEnv();
    expect((await post(env, '/survey', null, 'not json')).status).toBe(400);
    expect((await post(env, '/survey', survey({ installId: '../x' }))).status).toBe(400);
    expect((await post(env, '/survey', survey({ v: 2 }))).status).toBe(400);
    expect((await post(env, '/survey', survey({ platform: 'toaster' }))).status).toBe(400);
    expect((await post(env, '/survey', survey({ uses: 'strength' }))).status).toBe(400);
    expect((await post(env, '/survey', survey({ usesOther: 'x'.repeat(500) }))).status).toBe(400);
    expect((await post(env, '/install', install({ day: 'today' }))).status).toBe(400);
    expect((await post(env, '/install', install(), 'x'.repeat(5000))).status).toBe(413);
    expect((await worker.fetch(new Request('https://relay.test/survey'), env) as Response).status).toBe(405);
    expect(env.SYNC_BUCKET.calls.put).toBe(0);
  });

  it('refuses a record with no declared length without reading it', async () => {
    const env = relayEnv();
    const stream = new Blob(['x'.repeat(100)]).stream();
    const req = new Request('https://relay.test/survey', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    expect((await worker.fetch(req, env)).status).toBe(411);
  });

  it('rejects what would poison the owner\'s tallies or terminal', async () => {
    const env = relayEnv();
    for (const bad of [
      { uses: ['x,x,x,x,x'] },
      { uses: ['__proto__'] },
      { heardFrom: 'a,b' },
      { usesOther: 'real\u001b[2JINSTALLS COUNTED: 999' },
      { heardOther: 'line\nbreak' },
      { appVersion: '\u001b]0;pwned\u0007' },
      { answeredOn: ['2026-10-30'] },
      { answeredOn: '9999-99-99' },
    ]) {
      expect((await post(env, '/survey', survey(bad))).status, JSON.stringify(bad)).toBe(400);
    }
    expect((await post(env, '/install', install({ day: ['2026-10-30'] }))).status).toBe(400);
    expect(env.SYNC_BUCKET.calls.put).toBe(0);
  });

  it('accepts every answer the app can send', async () => {
    const env = relayEnv();
    const { HEARD, USES } = await import('@/features/onboarding/logic');
    expect((await post(env, '/survey', survey({ uses: USES.map((o) => o.id), heardFrom: null }))).status).toBe(204);
    for (const o of HEARD) expect((await post(env, '/survey', survey({ heardFrom: o.id }))).status, o.id).toBe(204);
  });

  it('tallies a name like constructor as a plain count', async () => {
    const env = relayEnv({ ADMIN_TOKEN: 's' });
    await post(env, '/survey', survey({ uses: ['constructor', 'tostring'] }));
    await post(env, '/install', install({ appVersion: 'constructor' }));
    const body = JSON.parse(await (await stats(env, 'Bearer s')).text());
    expect(body.surveys.uses).toEqual({ constructor: 1, tostring: 1 });
    expect(body.installs.byVersion).toEqual({ constructor: 1 });
  });
});

describe('owner stats', () => {
  const seed = async (env: unknown) => {
    await post(env, '/install', install({ installId: 'aaaaaaaa-0000' }));
    await post(env, '/install', install({ installId: 'bbbbbbbb-0000', platform: 'android', appVersion: '0.4.0' }));
    await post(env, '/survey', survey({ installId: 'aaaaaaaa-0000' }));
  };

  it('is off until the secret is set, and refuses a wrong token', async () => {
    const env = relayEnv();
    expect((await stats(env, 'Bearer nope')).status).toBe(404);
    const on = { ...env, ADMIN_TOKEN: 'secret' };
    expect((await stats(on)).status).toBe(401);
    expect((await stats(on, 'Bearer wrong')).status).toBe(401);
  });

  it('counts installs and tallies the answers, without ever returning an id', async () => {
    const env = relayEnv({ ADMIN_TOKEN: 'secret' });
    await seed(env);
    const res = await stats(env, 'Bearer secret');
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('aaaaaaaa');
    const body = JSON.parse(text);
    expect(body.installs).toMatchObject({ total: 2, byPlatform: { desktop: 1, android: 1 }, byVersion: { '0.5.0': 1, '0.4.0': 1 } });
    expect(body.surveys).toMatchObject({ total: 1, uses: { strength: 1, other: 1 }, heardFrom: { reddit: 1 } });
    expect(body.surveys.answers[0]).toMatchObject({ uses: ['strength', 'other'], usesOther: 'rowing', heardFrom: 'reddit' });
  });

  it('pages through more than one list page, and says so if it stops short', async () => {
    const env = relayEnv({ ADMIN_TOKEN: 'secret' });
    const bucket = env.SYNC_BUCKET;
    for (let i = 0; i < 1200; i++) await bucket.put(`install/${String(i).padStart(8, '0')}`, '{}', { customMetadata: { platform: 'desktop', appVersion: '0.5.0', day: '2026-10-30' } });
    const body = JSON.parse(await (await stats(env, 'Bearer secret')).text());
    expect(body.installs.total).toBe(1200);
    expect(body.truncated).toBe(false);
  });

  it('stays inside the free plan\'s 50 subrequests however many records there are, and says it stopped short', async () => {
    const env = relayEnv({ ADMIN_TOKEN: 'secret' });
    const bucket = env.SYNC_BUCKET;
    const meta = { customMetadata: { platform: 'desktop', appVersion: '0.5.0', day: '2026-10-30' } };
    for (const kind of ['install', 'survey']) for (let i = 0; i < 40_000; i++) bucket.items.set(`${kind}/${String(i).padStart(8, '0')}`, { body: new Uint8Array(0), uploaded: new Date(), size: 2, etag: 'x', ...meta });
    const body = JSON.parse(await (await stats(env, 'Bearer secret')).text());
    expect(bucket.calls.list).toBeLessThanOrEqual(20);
    expect(body.truncated).toBe(true);
    expect(body.installs.total).toBe(10_000);
  });

  it('keeps a scheduled run and a write inside the free plan\'s 50 subrequests', async () => {
    const env = relayEnv();
    const bucket = env.SYNC_BUCKET;
    for (let i = 0; i < 2500; i++) bucket.items.set(hexId(i), { body: new Uint8Array(0), uploaded: new Date(0), size: 1, etag: 'x' });
    await worker.scheduled({}, env);
    expect(bucket.calls.list + bucket.calls.delete).toBeLessThanOrEqual(2);
    expect(bucket.items.size).toBe(1500);
  });
});
