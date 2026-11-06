// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
// The real Worker and its real ledger over a fake bucket, for the tests that run in Node. tests/worker-live.test.ts runs
// the same code in the real runtime.
// @ts-expect-error plain JavaScript Worker
import { Budget } from '../worker/budget.js';

export interface Stored {
  body: Uint8Array;
  uploaded: Date;
  size: number;
  etag: string;
  customMetadata?: Record<string, string>;
}

interface PutOptions {
  customMetadata?: Record<string, string>;
  onlyIf?: Headers | { etagMatches?: string };
}

/** Just enough of an R2 bucket, including conditional writes. `calls` counts what R2 would bill. */
export function fakeBucket() {
  const items = new Map<string, Stored>();
  const calls = { get: 0, head: 0, put: 0, list: 0, delete: 0 };
  let version = 0;
  return {
    items,
    calls,
    async get(key: string) {
      calls.get++;
      const o = items.get(key);
      return o ? { ...o, body: new Blob([o.body as BlobPart]).stream() } : null;
    },
    async head(key: string) {
      calls.head++;
      return items.get(key) ?? null;
    },
    async put(key: string, value: ReadableStream | Uint8Array | string | null, opts: PutOptions = {}) {
      calls.put++;
      const have = items.get(key);
      const c = opts.onlyIf;
      if (c instanceof Headers && c.get('if-none-match') === '*' && have) return null;
      if (c && !(c instanceof Headers) && c.etagMatches && have?.etag !== c.etagMatches) return null;
      const body = value instanceof ReadableStream ? new Uint8Array(await new Response(value).arrayBuffer()) : typeof value === 'string' ? new TextEncoder().encode(value) : (value ?? new Uint8Array());
      const stored = { body, uploaded: new Date(), size: body.length, etag: `v${++version}`, customMetadata: opts.customMetadata };
      items.set(key, stored);
      return stored;
    },
    async list({ prefix = '', cursor, limit = 1000 }: { prefix?: string; cursor?: string; limit?: number }) {
      calls.list++;
      const all = [...items].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => (a < b ? -1 : 1));
      const from = cursor ? Number(cursor) : 0;
      const page = all.slice(from, from + limit);
      return { objects: page.map(([key, o]) => ({ key, uploaded: o.uploaded, size: o.size, customMetadata: o.customMetadata })), truncated: from + limit < all.length, cursor: String(from + limit) };
    },
    async delete(key: string | string[]) {
      calls.delete++;
      for (const k of Array.isArray(key) ? key : [key]) items.delete(k);
    },
  };
}

export type FakeBucket = ReturnType<typeof fakeBucket>;

/** A Durable Object namespace with one real Budget in it, over in-memory storage. */
export function fakeBudget(limits: Record<string, number> = {}) {
  const data = new Map<string, unknown>();
  let ready: Promise<unknown> = Promise.resolve();
  const state = {
    blockConcurrencyWhile: (f: () => Promise<unknown>) => void (ready = f()),
    storage: { get: async (k: string) => data.get(k), put: async (k: string, v: unknown) => void data.set(k, structuredClone(v)) },
  };
  const budget = new Budget(state, { LIMITS: JSON.stringify(limits) });
  return {
    budget,
    data,
    idFromName: (name: string) => name,
    get: () => ({
      fetch: async (req: Request) => {
        await ready;
        return budget.fetch(req) as Promise<Response>;
      },
    }),
  };
}

const open = { limit: async () => ({ success: true }) };

/** An environment with everything the Worker insists on. Override a binding to test it, or set it to undefined to remove it. */
export function relayEnv(over: Record<string, unknown> = {}, limits: Record<string, number> = {}) {
  const bucket = (over.SYNC_BUCKET as FakeBucket) ?? fakeBucket();
  const BUDGET = (over.BUDGET as ReturnType<typeof fakeBudget>) ?? fakeBudget(limits);
  return { SYNC_LIMITER: open, READ_LIMITER: open, PAIR_LIMITER: open, ADMIN_LIMITER: open, WIDE_LIMITER: open, ...over, SYNC_BUCKET: bucket, BUDGET };
}

/** A Request with the Content-Length a browser's fetch would send; Node's Request leaves it out. */
export function sizedRequest(url: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  const b = init.body;
  if (b != null && !headers.has('content-length')) {
    const size = typeof b === 'string' ? new TextEncoder().encode(b).length : (b as Uint8Array).byteLength;
    headers.set('content-length', String(size));
  }
  return new Request(url, { ...init, headers });
}
