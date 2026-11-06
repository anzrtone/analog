// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
/**
 * The relay client: GET and PUT one encrypted blob under a pair's id. No cookies, no referrer, no redirects, a 30 s
 * timeout for the whole request and body. Every failure becomes a sentence a person can act on.
 */
import { RELAY_URL } from '@/config';

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface Relay {
  /** Null when nothing is stored yet. */
  get(id: string): Promise<Uint8Array | null>;
  put(id: string, token: string, body: Uint8Array): Promise<void>;
  del(id: string, token: string): Promise<void>;
}

export class RelayError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'RelayError';
  }
}

const TIMEOUT_MS = 30_000;
/** The relay refuses anything larger, so a larger answer is not the relay. */
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

export function createRelay(baseUrl: string | null = RELAY_URL, doFetch: Fetch = (u, i) => fetch(u, i)): Relay {
  /** Runs `handle` under one timeout, so a server that stalls partway through a body can't hang the sync. */
  async function call<T>(id: string, init: RequestInit, handle: (res: Response) => Promise<T>): Promise<T> {
    if (!baseUrl) throw new RelayError('Sync over the internet is not set up in this build.');
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    try {
      const res = await doFetch(`${baseUrl.replace(/\/+$/, '')}/sync/${id}`, { ...init, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: abort.signal });
      return await handle(res);
    } catch (err) {
      if (err instanceof RelayError) throw err;
      throw new RelayError("Couldn't reach the sync server. Check your connection and try again.");
    } finally {
      clearTimeout(timer);
    }
  }
  const fail = (res: Response): never => {
    if (res.status === 403) throw new RelayError("The sync server didn't accept this device's code for that pair. Re-pair with a fresh sync code.", 403);
    if (res.status === 409) throw new RelayError('Another device was syncing at the same moment. Try again.', 409);
    if (res.status === 429) throw new RelayError('Too many sync requests at once. Wait a minute and try again.', 429);
    if (res.status === 413) throw new RelayError('Your data is too big for the sync server. Use a cloud folder instead.', 413);
    if (res.status === 507) throw new RelayError('The sync server is full right now. Your data is safe on this device; a cloud folder works in the meantime.', 507);
    if (res.status === 503) throw new RelayError('The sync server is too busy today. Your data is safe on this device; it will try again later.', 503);
    throw new RelayError(`The sync server answered with an error (${res.status}). Try again later.`, res.status);
  };
  return {
    get: (id) =>
      call(id, { method: 'GET' }, async (res) => {
        if (res.status === 404) return null;
        if (!res.ok) fail(res);
        const declared = Number(res.headers.get('content-length') ?? 0);
        if (declared > MAX_RESPONSE_BYTES) throw new RelayError('The sync server sent more than it should have. Try again later.');
        const body = new Uint8Array(await res.arrayBuffer());
        if (body.length > MAX_RESPONSE_BYTES) throw new RelayError('The sync server sent more than it should have. Try again later.');
        return body;
      }),
    put: (id, token, body) =>
      call(id, { method: 'PUT', headers: { 'x-sync-token': token, 'content-type': 'application/octet-stream' }, body: body as BodyInit }, async (res) => {
        if (!res.ok) fail(res);
      }),
    del: (id, token) =>
      call(id, { method: 'DELETE', headers: { 'x-sync-token': token } }, async (res) => {
        if (!res.ok && res.status !== 404) fail(res);
      }),
  };
}
