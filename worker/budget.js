// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
/**
 * The relay's spending ledger: one Durable Object that every billable write asks first, so the caps hold no matter how
 * many addresses or Cloudflare locations a request comes from. Rate limits slow one network down; this is what stops
 * the bill. When the ledger says no, or cannot be reached, the write is refused.
 *
 * It stores totals only. Per-network counts stay in memory under a hash with a random salt made when the object wakes,
 * so no address is ever written down. Losing them to a restart costs nothing but fairness: the global caps are stored.
 */
import { DEFAULT_LIMITS } from './limits.js';

const today = (now) => new Date(now).toISOString().slice(0, 10);

const freshDay = (day) => ({ day, newPairs: 0, newBytes: 0, syncWrites: 0, recordWrites: 0, reads: 0 });

const freshLedger = (now) => ({
  ...freshDay(today(now)),
  storedBytes: 0,
  records: 0,
  // The nightly walk over the bucket that corrects storedBytes and records. `delta` is what changed during the walk.
  scan: { active: false, cursor: null, bytes: 0, records: 0, delta: 0, recordDelta: 0, doneDay: null },
});

export function parseLimits(raw) {
  try {
    return { ...DEFAULT_LIMITS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return DEFAULT_LIMITS;
  }
}

export class Budget {
  constructor(state, env) {
    this.state = state;
    this.limits = parseLimits(env?.LIMITS);
    this.now = () => Date.now();
    this.networks = new Map();
    this.networksDay = null;
    this.salt = crypto.randomUUID();
    this.ledger = null;
    state.blockConcurrencyWhile(async () => {
      this.ledger = (await state.storage.get('ledger')) ?? freshLedger(this.now());
    });
  }

  rollDay() {
    const day = today(this.now());
    if (this.ledger.day !== day) Object.assign(this.ledger, freshDay(day));
    if (this.networksDay !== day) {
      this.networks.clear();
      this.networksDay = day;
      this.salt = crypto.randomUUID();
    }
  }

  async networkEntry(network) {
    const bytes = new TextEncoder().encode(`${this.salt}:${network}`);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const key = Array.from(digest.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
    let entry = this.networks.get(key);
    if (!entry) {
      // Only fairness lives here, so forgetting it is safe and running out of memory is not.
      if (this.networks.size >= 100_000) this.networks.clear();
      this.networks.set(key, (entry = { pairs: 0, bytes: 0 }));
    }
    return entry;
  }

  /** May this write go ahead? `kind` is new, update or record; `bytes` is how much the bucket grows (negative when it shrinks). */
  async reserve({ kind, bytes = 0, network = 'unknown' }) {
    const l = this.limits;
    const L = this.ledger;
    const growth = Math.max(0, bytes);
    if (kind === 'record') {
      if (L.recordWrites >= l.maxRecordWritesPerDay) return { ok: false, why: 'records-today' };
      if (L.records >= l.maxRecords) return { ok: false, why: 'records-full' };
      L.recordWrites++;
      L.records++;
      if (L.scan.active) L.scan.recordDelta++;
      await this.save();
      return { ok: true };
    }
    const entry = await this.networkEntry(network);
    if (kind === 'new') {
      if (L.newPairs >= l.maxNewPairsPerDay) return { ok: false, why: 'new-pairs-today' };
      if (entry.pairs >= l.maxNetworkNewPairsPerDay) return { ok: false, why: 'network-pairs-today' };
    } else if (L.syncWrites >= l.maxSyncWritesPerDay) {
      return { ok: false, why: 'writes-today' };
    }
    if (growth > 0) {
      if (L.storedBytes + growth > l.maxStoredBytes) return { ok: false, why: 'storage-full' };
      if (L.newBytes + growth > l.maxNewBytesPerDay) return { ok: false, why: 'new-bytes-today' };
      if (entry.bytes + growth > l.maxNetworkNewBytesPerDay) return { ok: false, why: 'network-bytes-today' };
    }
    if (kind === 'new') {
      L.newPairs++;
      entry.pairs++;
    } else {
      L.syncWrites++;
    }
    L.newBytes += growth;
    entry.bytes += growth;
    L.storedBytes = Math.max(0, L.storedBytes + bytes);
    if (L.scan.active) L.scan.delta += bytes;
    await this.save();
    return { ok: true };
  }

  /** A reserved write did not happen. Only the bytes come back: the attempt may still have cost an operation. */
  async refund({ kind, bytes = 0 }) {
    const L = this.ledger;
    if (kind === 'record') {
      L.records = Math.max(0, L.records - 1);
      if (L.scan.active) L.scan.recordDelta--;
    } else {
      L.storedBytes = Math.max(0, L.storedBytes - bytes);
      L.newBytes = Math.max(0, L.newBytes - Math.max(0, bytes));
      if (L.scan.active) L.scan.delta -= bytes;
    }
    await this.save();
    return { ok: true };
  }

  /** An object was deleted. */
  async release({ bytes = 0 }) {
    const L = this.ledger;
    L.storedBytes = Math.max(0, L.storedBytes - bytes);
    if (L.scan.active) L.scan.delta -= bytes;
    await this.save();
    return { ok: true };
  }

  async reads({ count = 0 }) {
    const L = this.ledger;
    L.reads += count;
    await this.save();
    return { closed: L.reads >= this.limits.maxReadsPerDay };
  }

  /** Where the nightly walk stands: `due` is false once today's walk has finished. */
  async scanState() {
    const s = this.ledger.scan;
    if (!s.active && s.doneDay === this.ledger.day) return { due: false };
    if (!s.active) {
      Object.assign(s, { active: true, cursor: null, bytes: 0, records: 0, delta: 0, recordDelta: 0 });
      await this.save();
    }
    return { due: true, cursor: s.cursor };
  }

  /** One page of the walk. `cursor` null means it reached the end, so the counted totals replace the running ones. */
  async scanPage({ cursor, bytes = 0, records = 0 }) {
    const L = this.ledger;
    const s = L.scan;
    s.bytes += bytes;
    s.records += records;
    s.cursor = cursor ?? null;
    if (!cursor) {
      L.storedBytes = Math.max(0, s.bytes + s.delta);
      L.records = Math.max(0, s.records + s.recordDelta);
      s.active = false;
      s.doneDay = L.day;
    }
    await this.save();
    return { ok: true };
  }

  status() {
    const { scan, ...totals } = this.ledger;
    return { ...totals, scanDoneDay: scan.doneDay, limits: this.limits };
  }

  async save() {
    await this.state.storage.put('ledger', this.ledger);
  }

  async fetch(request) {
    const op = new URL(request.url).pathname.slice(1);
    const body = request.method === 'POST' ? await request.json() : {};
    this.rollDay();
    const handlers = {
      reserve: () => this.reserve(body),
      refund: () => this.refund(body),
      release: () => this.release(body),
      reads: () => this.reads(body),
      'scan-state': () => this.scanState(),
      'scan-page': () => this.scanPage(body),
      status: () => this.status(),
    };
    const handler = Object.hasOwn(handlers, op) ? handlers[op] : null;
    if (!handler) return new Response(null, { status: 404 });
    return Response.json(await handler());
  }
}
