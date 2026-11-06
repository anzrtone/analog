// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
/**
 * The Analog sync relay: a Cloudflare Worker with an R2 bucket. It stores one opaque blob per pairing code and
 * cannot read it: the app encrypts everything with a key the server never sees. It keeps no accounts, no IP
 * addresses and no user agents.
 *
 * Route: /sync/<32 hex chars>
 *   GET     the blob, 404 if there is none (or it is older than 60 days)
 *   PUT     store the blob. The first write claims the name by storing SHA-256 of the write token; later writes
 *           must present a token that hashes to the same value. 20 MB at most, 14 bytes at least, and the length must
 *           be declared up front so the body streams straight to R2 instead of through memory.
 *   DELETE  same token check.
 *
 * Also, both opt-in and anonymous (a random id the app makes only when the person turns the switch on):
 *   POST /survey   the welcome answers, stored under survey/<id>; {withdraw:true} deletes them
 *   POST /install  one "this install exists" record (platform, version, day), install/<id>; {withdraw:true} deletes it
 *   GET  /stats    for the owner: counts, budget use and the answers (never ids), with `Authorization: Bearer <ADMIN_TOKEN>`.
 *                  Off (404) until the ADMIN_TOKEN secret is set: `npx wrangler secret put ADMIN_TOKEN`.
 * Records live in R2 custom metadata, so /stats reads them with a few list calls. No IPs, no user agents.
 *
 * Paying for it: anyone on the internet can call this, so nothing billable happens without passing, in order, the
 * origin check, the shape checks, the rate limiters and the Budget ledger (budget.js). Any of those missing or
 * unreachable means the request is refused: this Worker fails closed. A scheduled walk over the bucket deletes expired
 * blobs and corrects the ledger, so expiry does not depend on a dashboard setting.
 */
import { Budget } from './budget.js';
import { MAX_AGE_MS, MAX_BYTES, MAX_JSON, MAX_STATS_PAGES, MIN_BYTES, READ_BATCH } from './limits.js';
import { networkOf } from './network.js';

// The entry module's named exports are entrypoints to the runtime: classes and handlers only, never plain values.
export { Budget };

const ROUTE = /^\/sync\/([0-9a-f]{32})$/;
const BLOB_KEY = /^[0-9a-f]{32}$/;
const TOKEN = /^[0-9a-f]{64}$/;

/** The only web origins the app runs under. Requests with no Origin at all are not from a web page's script. */
const ORIGINS = new Set(['https://localhost', 'http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost', 'http://localhost:1420']);

const corsFor = (request) => {
  const origin = request.headers.get('origin');
  return {
    ...(origin && ORIGINS.has(origin) ? { 'access-control-allow-origin': origin } : {}),
    vary: 'Origin',
    'access-control-allow-methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type, x-sync-token, authorization',
    'access-control-max-age': '86400',
  };
};

/**
 * A browser visiting someone's web page must not be usable as a free botnet: each visitor is a new address to every
 * rate limit. A page's fetch carries its Origin, <img>, <script> and the like announce themselves in Sec-Fetch-Dest, and
 * a no-cors fetch sends no Origin but still says it crossed sites. The app's own cross-origin fetches always send Origin.
 */
function fromForeignPage(request) {
  const origin = request.headers.get('origin');
  if (origin) return !ORIGINS.has(origin);
  const dest = request.headers.get('sec-fetch-dest');
  if (dest && dest !== 'empty') return true;
  const site = request.headers.get('sec-fetch-site');
  return !!site && site !== 'none' && site !== 'same-origin';
}

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

/** Passed by every limiter it asks? Reports null when fine, or the response to send. A missing binding refuses. */
async function throttled(request, env, reply, binding) {
  const limiter = env[binding];
  if (!limiter || !env.WIDE_LIMITER) return reply(503);
  const { narrow, wide } = networkOf(request.headers.get('cf-connecting-ip'));
  if (!(await limiter.limit({ key: narrow })).success) return reply(429);
  if (wide && !(await env.WIDE_LIMITER.limit({ key: wide })).success) return reply(429);
  return null;
}

const ledger = (env) => env.BUDGET.get(env.BUDGET.idFromName('global'));

async function ask(env, op, body) {
  const res = await ledger(env).fetch(new Request(`https://budget/${op}`, body ? { method: 'POST', body: JSON.stringify(body) } : {}));
  if (!res.ok) throw new Error(`ledger ${op}: ${res.status}`);
  return res.json();
}

/** The ledger's yes or no. Anything else, including not reaching it, is a no. */
async function reserve(env, body) {
  if (!env.BUDGET) return { ok: false, why: 'no-ledger' };
  try {
    return await ask(env, 'reserve', body);
  } catch {
    return { ok: false, why: 'no-ledger' };
  }
}

const refused = (reply, why) => reply(why === 'storage-full' || why === 'records-full' ? 507 : 503, null, { 'retry-after': '3600' });

/** Reads are counted in batches per isolate: asking the ledger on each one would cost more than the read. */
const gate = { pending: 0, closedDay: null };

async function readsOpen(env) {
  if (!env.BUDGET) return false;
  const day = new Date().toISOString().slice(0, 10);
  if (gate.closedDay === day) return false;
  gate.pending++;
  if (gate.pending >= READ_BATCH) {
    const count = gate.pending;
    gate.pending = 0;
    try {
      if ((await ask(env, 'reads', { count })).closed) {
        gate.closedDay = day;
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

const ID = /^[0-9a-fA-F-]{8,64}$/;
const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
/** The app's answer ids. No commas (they would split into several answers in /stats) and nothing like __proto__. */
const CHOICE = /^[a-z0-9-]{1,40}$/;
const PLATFORMS = new Set(['desktop', 'android', 'dev']);

/** A short string with no control characters: these end up in the owner's terminal. */
const str = (v, max) => (typeof v === 'string' && v.length <= max && !/\p{Cc}/u.test(v) ? v : null);
const isDay = (v) => typeof v === 'string' && DAY.test(v);

/** The survey answers as short strings (R2 custom metadata), or null when the payload is not what the app sends. */
function surveyRecord(b) {
  const uses = Array.isArray(b.uses) && b.uses.length <= 12 && b.uses.every((u) => typeof u === 'string' && CHOICE.test(u)) ? b.uses : null;
  const heardFrom = b.heardFrom === null ? '' : typeof b.heardFrom === 'string' && CHOICE.test(b.heardFrom) ? b.heardFrom : null;
  const platform = PLATFORMS.has(b.platform) ? b.platform : null;
  const appVersion = str(b.appVersion, 20);
  if (!uses || heardFrom === null || !platform || !appVersion || !isDay(b.answeredOn)) return null;
  const usesOther = b.usesOther === undefined ? '' : str(b.usesOther, 120);
  const heardOther = b.heardOther === undefined ? '' : str(b.heardOther, 120);
  if (usesOther === null || heardOther === null) return null;
  return { uses: uses.join(','), usesOther, heardFrom, heardOther, platform, appVersion, answeredOn: b.answeredOn };
}

function installRecord(b) {
  const platform = PLATFORMS.has(b.platform) ? b.platform : null;
  const appVersion = str(b.appVersion, 20);
  if (!platform || !appVersion || !isDay(b.day)) return null;
  return { platform, appVersion, day: b.day };
}

/** The declared body length, or null when there is none or it is not a plain number. */
function declaredLength(request) {
  const raw = request.headers.get('content-length');
  return raw !== null && /^\d{1,15}$/.test(raw) ? Number(raw) : null;
}

/** POST /survey and POST /install: the opt-in records. */
async function record(request, env, kind, reply) {
  const denied = await throttled(request, env, reply, 'SYNC_LIMITER');
  if (denied) return denied;
  const length = declaredLength(request);
  if (length === null) return reply(411);
  if (length > MAX_JSON) return reply(413);
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
  const allowed = await reserve(env, { kind: 'record' });
  if (!allowed.ok) return refused(reply, allowed.why);
  await env.SYNC_BUCKET.put(key, '{}', { customMetadata: meta });
  return reply(204);
}

/** At most MAX_STATS_PAGES pages: the owner's view of a poisoned bucket must stay inside the Worker's limits. */
async function listSome(bucket, prefix) {
  const out = [];
  let cursor;
  let pages = 0;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000, include: ['customMetadata'] });
    out.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
    pages++;
  } while (cursor && pages < MAX_STATS_PAGES);
  return { objects: out, truncated: !!cursor };
}

const tally = (rows, f) => {
  const t = Object.create(null);
  for (const r of rows) for (const k of [].concat(f(r))) if (k) t[k] = (t[k] ?? 0) + 1;
  return t;
};

/** GET /stats for the owner. Never includes an install id. */
async function stats(request, env, reply) {
  if (!env.ADMIN_TOKEN) return reply(404);
  const denied = await throttled(request, env, reply, 'ADMIN_LIMITER');
  if (denied) return denied;
  const given = request.headers.get('authorization') ?? '';
  if (!same(await sha256Hex(given), await sha256Hex(`Bearer ${env.ADMIN_TOKEN}`))) return reply(401);
  const installList = await listSome(env.SYNC_BUCKET, 'install/');
  const surveyList = await listSome(env.SYNC_BUCKET, 'survey/');
  const installs = installList.objects.map((o) => ({ ...o.customMetadata, firstSeen: o.uploaded.toISOString().slice(0, 10) }));
  const surveys = surveyList.objects.map((o) => o.customMetadata ?? {});
  const body = {
    truncated: installList.truncated || surveyList.truncated,
    budget: env.BUDGET ? await ask(env, 'status').catch(() => null) : null,
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

async function getBlob(request, env, key, reply) {
  const denied = await throttled(request, env, reply, 'READ_LIMITER');
  if (denied) return denied;
  if (!(await readsOpen(env))) return reply(503, null, { 'retry-after': '3600' });
  const obj = await env.SYNC_BUCKET.get(key);
  if (!obj) return reply(404);
  // An expired pair reads as gone, but its claim stays until the scheduled walk removes it, so a stranger holding the
  // id cannot free the name with a GET and claim it, and a returning device with the right token can still refresh it.
  if (Date.now() - obj.uploaded.getTime() > MAX_AGE_MS) return reply(404);
  return reply(200, obj.body, { 'content-type': 'application/octet-stream' });
}

async function writeBlob(request, env, key, reply) {
  // Everything that costs nothing comes first, so a malformed request never reaches a billable call.
  const token = request.headers.get('x-sync-token');
  if (!token || !TOKEN.test(token)) return reply(403);
  const isPut = request.method === 'PUT';
  let length = 0;
  if (isPut) {
    length = declaredLength(request);
    if (length === null) return reply(411);
    if (length > MAX_BYTES) return reply(413);
    if (length < MIN_BYTES) return reply(400);
  }
  const denied = await throttled(request, env, reply, 'SYNC_LIMITER');
  if (denied) return denied;
  if (!env.BUDGET || !env.PAIR_LIMITER) return reply(503);
  if (!(await readsOpen(env))) return reply(503, null, { 'retry-after': '3600' });

  const bucket = env.SYNC_BUCKET;
  const existing = await bucket.head(key);
  const hash = await sha256Hex(token);
  // An object with no stored hash is never written by this Worker. It is nobody's to take over.
  if (existing && !same(existing.customMetadata?.tokenHash, hash)) return reply(403);
  // After the token check, so a stranger who knows an id cannot use up that pair's allowance.
  if (!(await env.PAIR_LIMITER.limit({ key })).success) return reply(429);

  if (!isPut) {
    if (!existing) return reply(404);
    await bucket.delete(key);
    await ask(env, 'release', { bytes: existing.size ?? 0 }).catch(() => undefined);
    return reply(204);
  }

  const kind = existing ? 'update' : 'new';
  const bytes = length - (existing?.size ?? 0);
  const { narrow, wide } = networkOf(request.headers.get('cf-connecting-ip'));
  const allowed = await reserve(env, { kind, bytes, network: wide ?? narrow });
  if (!allowed.ok) return refused(reply, allowed.why);

  // Conditional, so two writers cannot both win: a first write only if the name is still free, and an update only of
  // the version just checked. The stream has a declared length, so nothing here is held in memory.
  const onlyIf = existing ? { etagMatches: existing.etag } : new Headers({ 'if-none-match': '*' });
  let stored;
  try {
    stored = await bucket.put(key, request.body, { customMetadata: { tokenHash: hash }, onlyIf });
  } catch (err) {
    await ask(env, 'refund', { kind, bytes }).catch(() => undefined);
    throw err;
  }
  if (!stored) {
    await ask(env, 'refund', { kind, bytes }).catch(() => undefined);
    return reply(409);
  }
  return reply(204);
}

/**
 * One page per run, so the walk fits the free plan's limits however full the bucket is. It deletes expired blobs,
 * counts what stays, and when it reaches the end the ledger takes the counted totals as the truth.
 */
async function walkBucket(env) {
  const state = await ask(env, 'scan-state');
  if (!state.due) return;
  const page = await env.SYNC_BUCKET.list({ cursor: state.cursor ?? undefined, limit: 1000 });
  const cutoff = Date.now() - MAX_AGE_MS;
  const expired = [];
  let bytes = 0;
  let records = 0;
  for (const o of page.objects) {
    if (BLOB_KEY.test(o.key)) {
      if (o.uploaded.getTime() < cutoff) expired.push(o.key);
      else bytes += o.size ?? 0;
    } else {
      records++;
    }
  }
  if (expired.length) await env.SYNC_BUCKET.delete(expired);
  await ask(env, 'scan-page', { cursor: page.truncated ? page.cursor : null, bytes, records });
}

export default {
  async fetch(request, env) {
    const cors = corsFor(request);
    const reply = (status, body = null, extra = {}) => new Response(body, { status, headers: { ...cors, 'cache-control': 'no-store', ...extra } });
    try {
      if (fromForeignPage(request)) return reply(403);
      if (request.method === 'OPTIONS') return reply(204);
      const url = new URL(request.url);
      if (url.pathname === '/survey' || url.pathname === '/install') return request.method === 'POST' ? await record(request, env, url.pathname.slice(1), reply) : reply(405);
      if (url.pathname === '/stats') return request.method === 'GET' ? await stats(request, env, reply) : reply(405);
      const match = ROUTE.exec(url.pathname);
      if (!match) return reply(404);
      if (request.method === 'GET') return await getBlob(request, env, match[1], reply);
      if (request.method === 'PUT' || request.method === 'DELETE') return await writeBlob(request, env, match[1], reply);
      return reply(405);
    } catch {
      return reply(503);
    }
  },

  async scheduled(_event, env) {
    await walkBucket(env);
  },
};
