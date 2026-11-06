// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
// The Worker in the real Cloudflare runtime (workerd), with a real local R2, Durable Object and rate limiters. This is
// what catches what running it in Node cannot: the runtime refusing to start it, and the bindings behaving differently.
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unstable_startWorker as startWorker } from 'wrangler';

type Worker = Awaited<ReturnType<typeof startWorker>>;

let w: Worker;
let base: string;
let persist: string;

const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
const id = () => hex(16);
const token = () => hex(32);
const bytes = (n: number) => new Uint8Array(n).fill(7);
let nextIp = 0;
const ip = () => `10.${(nextIp >> 16) & 255}.${(nextIp >> 8) & 255}.${nextIp++ & 255}`;

const req = (method: string, path: string, o: { token?: string; body?: BodyInit; headers?: Record<string, string>; from?: string } = {}) =>
  fetch(base + path, { method, body: o.body, headers: { 'cf-connecting-ip': o.from ?? ip(), ...(o.token ? { 'x-sync-token': o.token } : {}), ...o.headers } });

beforeAll(async () => {
  persist = mkdtempSync(join(tmpdir(), 'analog-relay-'));
  w = await startWorker({
    config: 'worker/wrangler.toml',
    bindings: { ADMIN_TOKEN: { type: 'plain_text', value: 'local-test-token' }, LIMITS: { type: 'plain_text', value: JSON.stringify({ maxNetworkNewPairsPerDay: 100000, maxNetworkNewBytesPerDay: 1e12 }) } },
    dev: { server: { port: 0 }, inspector: false, logLevel: 'none', persist },
  });
  base = (await w.url).toString().replace(/\/$/, '');
}, 60_000);

afterAll(async () => {
  await w?.dispose();
  try {
    rmSync(persist, { recursive: true, force: true });
  } catch {
    /* Windows may hold a file for a moment; it is a temp folder */
  }
}, 30_000);

describe('the relay in the real runtime', () => {
  it('boots, stores a blob, and returns the same bytes from a streamed upload', async () => {
    const k = id();
    const t = token();
    expect((await req('GET', `/sync/${k}`)).status).toBe(404);
    expect((await req('PUT', `/sync/${k}`, { token: t, body: bytes(1000) })).status).toBe(204);
    const res = await req('GET', `/sync/${k}`);
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes(1000));
  });

  it('takes the largest allowed blob and an update of it', async () => {
    const k = id();
    const t = token();
    expect((await req('PUT', `/sync/${k}`, { token: t, body: bytes(20 * 1024 * 1024) })).status).toBe(204);
    expect((await req('PUT', `/sync/${k}`, { token: t, body: bytes(100) })).status).toBe(204);
    expect((await (await req('GET', `/sync/${k}`)).arrayBuffer()).byteLength).toBe(100);
  }, 60_000);

  it('lets exactly one first writer win, with the real conditional write', async () => {
    for (let round = 0; round < 5; round++) {
      const k = id();
      const tokens = Array.from({ length: 8 }, token);
      const statuses = await Promise.all(tokens.map((t) => req('PUT', `/sync/${k}`, { token: t, body: bytes(100) }).then((r) => r.status)));
      expect(statuses.filter((s) => s === 204).length, statuses.join()).toBe(1);
    }
  }, 30_000);

  it('refuses a chunked upload after reading almost none of it', async () => {
    const result = await new Promise<{ status: number; sent: number }>((resolve, reject) => {
      const { hostname, port } = new URL(base);
      let sent = 0;
      let done = false;
      const r = http.request({ host: hostname, port, path: `/sync/${id()}`, method: 'PUT', headers: { 'transfer-encoding': 'chunked', 'x-sync-token': token(), 'cf-connecting-ip': ip() } }, (res) => {
        done = true;
        res.resume();
        r.destroy();
        resolve({ status: res.statusCode!, sent });
      });
      r.on('error', (e) => (done ? undefined : reject(e)));
      const chunk = Buffer.alloc(1024 * 1024, 7);
      const pump = () => {
        while (sent < 60 * 1024 * 1024 && !done) {
          sent += chunk.length;
          if (!r.write(chunk)) return void r.once('drain', pump);
        }
        if (!done) r.end();
      };
      pump();
    });
    expect(result.status).toBe(411);
  }, 30_000);

  // Limiter windows line up with the wall clock, so a run can straddle two of them. Each test sends more than two
  // windows' worth: it must then hit the limit, and never let more than two windows' worth through, at any moment.
  const within = (statuses: number[], ok: number, limit: number) => {
    const passed = statuses.filter((s) => s === ok).length;
    expect(passed, statuses.join()).toBeGreaterThanOrEqual(limit);
    expect(passed, statuses.join()).toBeLessThanOrEqual(limit * 2);
    expect(statuses.filter((s) => s !== ok).every((s) => s === 429), statuses.join()).toBe(true);
  };

  it('rate-limits writes per network, including every address of one IPv6 /64', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 45; i++) statuses.push((await req('PUT', `/sync/${id()}`, { token: token(), body: bytes(20), from: `2001:db8:7:7::${i.toString(16)}` })).status);
    within(statuses, 204, 20);
  }, 30_000);

  it('limits one pair\'s writes whatever address they come from', async () => {
    const k = id();
    const t = token();
    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) statuses.push((await req('PUT', `/sync/${k}`, { token: t, body: bytes(20) })).status);
    within(statuses, 204, 6);
  }, 30_000);

  it('rate-limits reads and /stats guesses', async () => {
    const reads: number[] = [];
    const from = ip();
    for (let i = 0; i < 245; i++) reads.push((await req('GET', `/sync/${id()}`, { from })).status);
    within(reads, 404, 120);
    const guesses: number[] = [];
    const guesser = ip();
    for (let i = 0; i < 12; i++) guesses.push((await req('GET', '/stats', { from: guesser, headers: { authorization: `Bearer guess${i}` } })).status);
    within(guesses, 401, 5);
  }, 60_000);

  it('keeps its totals in the real ledger and reports them to the owner', async () => {
    const res = await req('GET', '/stats', { headers: { authorization: 'Bearer local-test-token' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.budget.newPairs).toBeGreaterThan(0);
    expect(body.budget.storedBytes).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toMatch(/2001:|\b10\.\d+\.\d+\.\d+\b/);
  });

  it('refuses a foreign web page and serves the app', async () => {
    const k = id();
    expect((await req('GET', `/sync/${k}`, { headers: { origin: 'https://evil.test' } })).status).toBe(403);
    const ok = await req('GET', `/sync/${k}`, { headers: { origin: 'https://localhost' } });
    expect(ok.status).toBe(404);
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://localhost');
  });
});
