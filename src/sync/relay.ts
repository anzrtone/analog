// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
/**
 * The relay client: GET and PUT one encrypted blob under a pair's id. No cookies, no referrer, a 30 s timeout.
 * Every failure becomes a sentence a person can act on.
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

export function createRelay(baseUrl: string | null = RELAY_URL, doFetch: Fetch = (u, i) => fetch(u, i)): Relay {
  async function call(id: string, init: RequestInit): Promise<Response> {
    if (!baseUrl) throw new RelayError('Sync over the internet is not set up in this build.');
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await doFetch(`${baseUrl.replace(/\/+$/, '')}/sync/${id}`, { ...init, credentials: 'omit', referrerPolicy: 'no-referrer', signal: abort.signal });
    } catch {
      throw new RelayError("Couldn't reach the sync server. Check your connection and try again.");
    } finally {
      clearTimeout(timer);
    }
    return res;
  }
  const fail = (res: Response): never => {
    if (res.status === 403) throw new RelayError("The sync server didn't accept this device's code for that pair. Re-pair with a fresh sync code.", 403);
    if (res.status === 429) throw new RelayError('Too many sync requests at once. Wait a minute and try again.', 429);
    if (res.status === 413) throw new RelayError('Your data is too big for the sync server. Use a cloud folder instead.', 413);
    throw new RelayError(`The sync server answered with an error (${res.status}). Try again later.`, res.status);
  };
  return {
    async get(id) {
      const res = await call(id, { method: 'GET' });
      if (res.status === 404) return null;
      if (!res.ok) fail(res);
      return new Uint8Array(await res.arrayBuffer());
    },
    async put(id, token, body) {
      const res = await call(id, { method: 'PUT', headers: { 'x-sync-token': token, 'content-type': 'application/octet-stream' }, body: body as BodyInit });
      if (!res.ok) fail(res);
    },
    async del(id, token) {
      const res = await call(id, { method: 'DELETE', headers: { 'x-sync-token': token } });
      if (!res.ok && res.status !== 404) fail(res);
    },
  };
}
