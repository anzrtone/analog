// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
/**
 * The Analog sync relay: a Cloudflare Worker with an R2 bucket. It stores one opaque blob per pairing code and
 * cannot read it: the app encrypts everything with a key the server never sees. It keeps no accounts, no IP
 * addresses and no user agents.
 *
 * Route: /sync/<32 hex chars>
 *   GET     the blob, 404 if there is none (or it is older than 60 days: it is deleted then)
 *   PUT     store the blob. The first write claims the name by storing SHA-256 of the write token; later writes
 *           must present a token that hashes to the same value. 20 MB at most, 14 bytes at least.
 *   DELETE  same token check.
 * Bindings: SYNC_BUCKET (R2, required) and SYNC_LIMITER (Workers Rate Limiting, optional: 20 writes a minute per IP;
 * the address goes to the limiter in memory and is never stored). Add an R2 lifecycle rule that expires objects after
 * 60 days; every sync rewrites the object, so pairs that are in use never expire.
 */

export const MAX_BYTES = 20 * 1024 * 1024;
export const MIN_BYTES = 14;
export const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;

const ROUTE = /^\/sync\/([0-9a-f]{32})$/;
const TOKEN = /^[0-9a-f]{64}$/;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, x-sync-token',
  'access-control-max-age': '86400',
};

const reply = (status, body = null, extra = {}) => new Response(body, { status, headers: { ...CORS, 'cache-control': 'no-store', ...extra } });

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string comparison for the token hashes. */
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** null when the token is fine for this object; otherwise the 403 to send. `existing` is the stored object head, if any. */
async function checkToken(request, existing) {
  const token = request.headers.get('x-sync-token');
  if (!token || !TOKEN.test(token)) return reply(403);
  const stored = existing?.customMetadata?.tokenHash;
  // An object with no stored hash can be claimed by the first token that arrives.
  if (stored && !same(stored, await sha256Hex(token))) return reply(403);
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = ROUTE.exec(url.pathname);
    if (request.method === 'OPTIONS') return reply(204);
    if (!match) return reply(404);
    const key = match[1];
    const bucket = env.SYNC_BUCKET;

    if (request.method === 'GET') {
      const obj = await bucket.get(key);
      if (!obj) return reply(404);
      if (Date.now() - obj.uploaded.getTime() > MAX_AGE_MS) {
        await bucket.delete(key);
        return reply(404);
      }
      return reply(200, obj.body, { 'content-type': 'application/octet-stream' });
    }

    if (request.method === 'PUT' || request.method === 'DELETE') {
      if (env.SYNC_LIMITER && request.method === 'PUT') {
        const { success } = await env.SYNC_LIMITER.limit({ key: request.headers.get('cf-connecting-ip') ?? 'unknown' });
        if (!success) return reply(429);
      }
      const existing = await bucket.head(key);
      const denied = await checkToken(request, existing);
      if (denied) return denied;

      if (request.method === 'DELETE') {
        await bucket.delete(key);
        return existing ? reply(204) : reply(404);
      }

      const declared = Number(request.headers.get('content-length') ?? 0);
      if (declared > MAX_BYTES) return reply(413);
      const body = new Uint8Array(await request.arrayBuffer());
      if (body.length > MAX_BYTES) return reply(413);
      if (body.length < MIN_BYTES) return reply(400);
      const tokenHash = await sha256Hex(request.headers.get('x-sync-token'));
      await bucket.put(key, body, { customMetadata: { tokenHash } });
      return reply(204);
    }

    return reply(405);
  },
};
