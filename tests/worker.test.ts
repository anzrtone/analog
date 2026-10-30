// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
// @ts-expect-error plain JavaScript Worker
import worker, { MAX_AGE_MS, MAX_BYTES } from '../worker/index.js';

interface Stored {
  body: Uint8Array;
  uploaded: Date;
  customMetadata?: Record<string, string>;
}

/** Just enough of an R2 bucket. */
function fakeBucket() {
  const items = new Map<string, Stored>();
  return {
    items,
    async get(key: string) {
      const o = items.get(key);
      return o ? { ...o, body: new Blob([o.body as BlobPart]).stream() } : null;
    },
    async head(key: string) {
      return items.get(key) ?? null;
    },
    async put(key: string, body: Uint8Array | string, opts: { customMetadata?: Record<string, string> }) {
      items.set(key, { body: typeof body === 'string' ? new TextEncoder().encode(body) : body, uploaded: new Date(), customMetadata: opts.customMetadata });
    },
    async list({ prefix = '', cursor, limit = 1000 }: { prefix?: string; cursor?: string; limit?: number }) {
      const all = [...items].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => (a < b ? -1 : 1));
      const from = cursor ? Number(cursor) : 0;
      const page = all.slice(from, from + limit);
      return { objects: page.map(([key, o]) => ({ key, uploaded: o.uploaded, customMetadata: o.customMetadata })), truncated: from + limit < all.length, cursor: String(from + limit) };
    },
    async delete(key: string) {
      items.delete(key);
    },
  };
}

const ID = 'a'.repeat(32);
const TOKEN = 'b'.repeat(64);
const OTHER = 'c'.repeat(64);
const bytes = (n: number) => new Uint8Array(n).fill(7);

function call(env: unknown, method: string, token: string | null, body?: Uint8Array, path = `/sync/${ID}`) {
  const headers: Record<string, string> = {};
  if (token) headers['x-sync-token'] = token;
  return worker.fetch(new Request(`https://relay.test${path}`, { method, headers, body: body as BodyInit }), env) as Promise<Response>;
}

describe('sync relay worker', () => {
  it('answers 404, takes a PUT, then returns the same bytes', async () => {
    const env = { SYNC_BUCKET: fakeBucket() };
    expect((await call(env, 'GET', null)).status).toBe(404);
    expect((await call(env, 'PUT', TOKEN, bytes(100))).status).toBe(204);
    const res = await call(env, 'GET', null);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes(100));
  });

  it('stores only a hash of the token, and the first write claims the name', async () => {
    const bucket = fakeBucket();
    const env = { SYNC_BUCKET: bucket };
    await call(env, 'PUT', TOKEN, bytes(50));
    const meta = bucket.items.get(ID)!.customMetadata!.tokenHash;
    expect(meta).toMatch(/^[0-9a-f]{64}$/);
    expect(meta).not.toBe(TOKEN);
    expect((await call(env, 'PUT', OTHER, bytes(50))).status).toBe(403);
    expect((await call(env, 'PUT', TOKEN, bytes(60))).status).toBe(204);
  });

  it('refuses a missing or malformed token', async () => {
    const env = { SYNC_BUCKET: fakeBucket() };
    expect((await call(env, 'PUT', null, bytes(50))).status).toBe(403);
    expect((await call(env, 'PUT', 'short', bytes(50))).status).toBe(403);
    expect((await call(env, 'DELETE', null)).status).toBe(403);
  });

  it('enforces the size limits', async () => {
    const env = { SYNC_BUCKET: fakeBucket() };
    expect((await call(env, 'PUT', TOKEN, bytes(13))).status).toBe(400);
    expect((await call(env, 'PUT', TOKEN, bytes(MAX_BYTES + 1))).status).toBe(413);
    expect((await call(env, 'PUT', TOKEN, bytes(14))).status).toBe(204);
  });

  it('treats an object older than 60 days as gone, and deletes it', async () => {
    const bucket = fakeBucket();
    const env = { SYNC_BUCKET: bucket };
    await call(env, 'PUT', TOKEN, bytes(50));
    bucket.items.get(ID)!.uploaded = new Date(Date.now() - MAX_AGE_MS - 1000);
    expect((await call(env, 'GET', null)).status).toBe(404);
    expect(bucket.items.has(ID)).toBe(false);
  });

  it('needs the token to DELETE', async () => {
    const bucket = fakeBucket();
    const env = { SYNC_BUCKET: bucket };
    await call(env, 'PUT', TOKEN, bytes(50));
    expect((await call(env, 'DELETE', OTHER)).status).toBe(403);
    expect(bucket.items.has(ID)).toBe(true);
    expect((await call(env, 'DELETE', TOKEN)).status).toBe(204);
    expect(bucket.items.has(ID)).toBe(false);
    expect((await call(env, 'DELETE', TOKEN)).status).toBe(404);
  });

  it('rate-limits writes, and skips the check when the limiter is not bound', async () => {
    const limited = { SYNC_BUCKET: fakeBucket(), SYNC_LIMITER: { limit: async () => ({ success: false }) } };
    expect((await call(limited, 'PUT', TOKEN, bytes(50))).status).toBe(429);
    expect((await call(limited, 'GET', null)).status).toBe(404);
    const open = { SYNC_BUCKET: fakeBucket() };
    expect((await call(open, 'PUT', TOKEN, bytes(50))).status).toBe(204);
  });

  it('answers only the sync route, and CORS preflight', async () => {
    const env = { SYNC_BUCKET: fakeBucket() };
    expect((await call(env, 'GET', null, undefined, '/elsewhere')).status).toBe(404);
    expect((await call(env, 'GET', null, undefined, '/sync/not-hex')).status).toBe(404);
    const pre = await call(env, 'OPTIONS', null);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-headers')).toContain('x-sync-token');
  });
});

const ME = '11111111-2222-4333-8444-555555555555';
const post = (env: unknown, path: string, body: unknown, raw?: string) =>
  worker.fetch(new Request(`https://relay.test${path}`, { method: 'POST', body: raw ?? JSON.stringify(body) }), env) as Promise<Response>;
const survey = (over: Record<string, unknown> = {}) => ({ v: 1, installId: ME, uses: ['strength', 'other'], usesOther: 'rowing', heardFrom: 'reddit', platform: 'android', appVersion: '0.5.0', answeredOn: '2026-10-30', ...over });
const install = (over: Record<string, unknown> = {}) => ({ v: 1, installId: ME, platform: 'desktop', appVersion: '0.5.0', day: '2026-10-30', ...over });
const stats = (env: unknown, auth?: string) => worker.fetch(new Request('https://relay.test/stats', { headers: auth ? { authorization: auth } : {} }), env) as Promise<Response>;

describe('survey and install records', () => {
  it('stores an opted-in survey and an install, and deletes them on withdraw', async () => {
    const bucket = fakeBucket();
    const env = { SYNC_BUCKET: bucket };
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
    const env = { SYNC_BUCKET: fakeBucket() };
    expect((await post(env, '/survey', null, 'not json')).status).toBe(400);
    expect((await post(env, '/survey', survey({ installId: '../x' }))).status).toBe(400);
    expect((await post(env, '/survey', survey({ v: 2 }))).status).toBe(400);
    expect((await post(env, '/survey', survey({ platform: 'toaster' }))).status).toBe(400);
    expect((await post(env, '/survey', survey({ uses: 'strength' }))).status).toBe(400);
    expect((await post(env, '/survey', survey({ usesOther: 'x'.repeat(500) }))).status).toBe(400);
    expect((await post(env, '/install', install({ day: 'today' }))).status).toBe(400);
    expect((await post(env, '/install', install(), 'x'.repeat(5000))).status).toBe(413);
    expect((await worker.fetch(new Request('https://relay.test/survey'), env) as Response).status).toBe(405);
  });

  it('rate-limits records like writes', async () => {
    const env = { SYNC_BUCKET: fakeBucket(), SYNC_LIMITER: { limit: async () => ({ success: false }) } };
    expect((await post(env, '/install', install())).status).toBe(429);
  });
});

describe('owner stats', () => {
  const seed = async (env: { SYNC_BUCKET: ReturnType<typeof fakeBucket> }) => {
    await post(env, '/install', install({ installId: 'aaaaaaaa-0000' }));
    await post(env, '/install', install({ installId: 'bbbbbbbb-0000', platform: 'android', appVersion: '0.4.0' }));
    await post(env, '/survey', survey({ installId: 'aaaaaaaa-0000' }));
  };

  it('is off until the secret is set, and refuses a wrong token', async () => {
    const env = { SYNC_BUCKET: fakeBucket() };
    expect((await stats(env, 'Bearer nope')).status).toBe(404);
    const on = { ...env, ADMIN_TOKEN: 'secret' };
    expect((await stats(on)).status).toBe(401);
    expect((await stats(on, 'Bearer wrong')).status).toBe(401);
  });

  it('counts installs and tallies the answers, without ever returning an id', async () => {
    const env = { SYNC_BUCKET: fakeBucket(), ADMIN_TOKEN: 'secret' };
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

  it('pages through more than one list page', async () => {
    const bucket = fakeBucket();
    const env = { SYNC_BUCKET: bucket, ADMIN_TOKEN: 'secret' };
    for (let i = 0; i < 1200; i++) await bucket.put(`install/${String(i).padStart(8, '0')}`, '{}', { customMetadata: { platform: 'desktop', appVersion: '0.5.0', day: '2026-10-30' } });
    expect(JSON.parse(await (await stats(env, 'Bearer secret')).text()).installs.total).toBe(1200);
  });
});
