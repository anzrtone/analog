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
 *
 * Also, both opt-in and anonymous (a random id the app makes only when the person turns the switch on):
 *   POST /survey   the welcome answers, stored under survey/<id>; {withdraw:true} deletes them
 *   POST /install  one "this install exists" record (platform, version, day), install/<id>; {withdraw:true} deletes it
 *   GET  /stats    for the owner: counts and the answers (never ids), with `Authorization: Bearer <ADMIN_TOKEN>`.
 *                  Off (404) until the ADMIN_TOKEN secret is set: `npx wrangler secret put ADMIN_TOKEN`.
 * Records live in R2 custom metadata, so /stats reads them with a few list calls. No IPs, no user agents.
 *
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
  'access-control-allow-methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, x-sync-token, authorization',
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

const ID = /^[0-9a-fA-F-]{8,64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PLATFORMS = new Set(['desktop', 'android', 'dev']);
const MAX_JSON = 4096;

const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : null);

/** The survey answers as short strings (R2 custom metadata), or null when the payload is not what the app sends. */
function surveyRecord(b) {
  const uses = Array.isArray(b.uses) && b.uses.length <= 12 && b.uses.every((u) => str(u, 40)) ? b.uses : null;
  const heardFrom = b.heardFrom === null ? '' : str(b.heardFrom, 40);
  const platform = PLATFORMS.has(b.platform) ? b.platform : null;
  const appVersion = str(b.appVersion, 20);
  if (!uses || heardFrom === null || !platform || !appVersion || !DAY.test(b.answeredOn ?? '')) return null;
  const usesOther = b.usesOther === undefined ? '' : str(b.usesOther, 120);
  const heardOther = b.heardOther === undefined ? '' : str(b.heardOther, 120);
  if (usesOther === null || heardOther === null) return null;
  return { uses: uses.join(','), usesOther, heardFrom, heardOther, platform, appVersion, answeredOn: b.answeredOn };
}

function installRecord(b) {
  const platform = PLATFORMS.has(b.platform) ? b.platform : null;
  const appVersion = str(b.appVersion, 20);
  if (!platform || !appVersion || !DAY.test(b.day ?? '')) return null;
  return { platform, appVersion, day: b.day };
}

/** POST /survey and POST /install: the opt-in records. */
async function record(request, env, kind) {
  if (env.SYNC_LIMITER) {
    const { success } = await env.SYNC_LIMITER.limit({ key: request.headers.get('cf-connecting-ip') ?? 'unknown' });
    if (!success) return reply(429);
  }
  const text = await request.text();
  if (text.length > MAX_JSON) return reply(413);
  let b;
  try {
    b = JSON.parse(text);
  } catch {
    return reply(400);
  }
  if (!b || typeof b !== 'object' || b.v !== 1 || typeof b.installId !== 'string' || !ID.test(b.installId)) return reply(400);
  const key = `${kind}/${b.installId.toLowerCase()}`;
  if (b.withdraw === true) {
    await env.SYNC_BUCKET.delete(key);
    return reply(204);
  }
  const meta = kind === 'survey' ? surveyRecord(b) : installRecord(b);
  if (!meta) return reply(400);
  await env.SYNC_BUCKET.put(key, '{}', { customMetadata: meta });
  return reply(204);
}

async function listAll(bucket, prefix) {
  const out = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000, include: ['customMetadata'] });
    out.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out;
}

const tally = (rows, f) => {
  const t = {};
  for (const r of rows) for (const k of [].concat(f(r))) if (k) t[k] = (t[k] ?? 0) + 1;
  return t;
};

/** GET /stats for the owner. Never includes an install id. */
async function stats(request, env) {
  if (!env.ADMIN_TOKEN) return reply(404);
  const given = request.headers.get('authorization') ?? '';
  if (!same(await sha256Hex(given), await sha256Hex(`Bearer ${env.ADMIN_TOKEN}`))) return reply(401);
  const installs = (await listAll(env.SYNC_BUCKET, 'install/')).map((o) => ({ ...o.customMetadata, firstSeen: o.uploaded.toISOString().slice(0, 10) }));
  const surveys = (await listAll(env.SYNC_BUCKET, 'survey/')).map((o) => o.customMetadata ?? {});
  const body = {
    installs: { total: installs.length, byPlatform: tally(installs, (r) => r.platform), byVersion: tally(installs, (r) => r.appVersion), byDay: tally(installs, (r) => r.firstSeen) },
    surveys: {
      total: surveys.length,
      uses: tally(surveys, (r) => (r.uses ? r.uses.split(',') : [])),
      heardFrom: tally(surveys, (r) => r.heardFrom),
      answers: surveys.map(({ uses, usesOther, heardFrom, heardOther, platform, appVersion, answeredOn }) => ({ uses: uses ? uses.split(',') : [], usesOther, heardFrom: heardFrom || null, heardOther, platform, appVersion, answeredOn })),
    },
  };
  return reply(200, JSON.stringify(body, null, 2), { 'content-type': 'application/json' });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = ROUTE.exec(url.pathname);
    if (request.method === 'OPTIONS') return reply(204);
    if (url.pathname === '/survey' || url.pathname === '/install') return request.method === 'POST' ? record(request, env, url.pathname.slice(1)) : reply(405);
    if (url.pathname === '/stats') return request.method === 'GET' ? stats(request, env) : reply(405);
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
