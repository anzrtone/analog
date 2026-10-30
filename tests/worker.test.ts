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
    async put(key: string, body: Uint8Array, opts: { customMetadata?: Record<string, string> }) {
      items.set(key, { body, uploaded: new Date(), customMetadata: opts.customMetadata });
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
