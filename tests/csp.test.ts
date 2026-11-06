// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RELAY_URL } from '@/config';
import { cspPlugin, withCsp } from '../vite.config';

const csp = (JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')) as { app: { security: { csp: string } } }).app.security.csp;
const page = readFileSync('index.html', 'utf8');

/** Android has no other policy, and desktop breaks if the page's policy and Tauri's disagree on IPC. */
describe('content security policy', () => {
  it('goes in the built page ahead of every script', () => {
    const html = withCsp(page, csp);
    const meta = html.indexOf('http-equiv="Content-Security-Policy"');
    expect(meta).toBeGreaterThan(-1);
    expect(meta).toBeLessThan(html.indexOf('<script'));
    expect(html).toContain(`content="${csp}"`);
  });

  it('fails the build rather than shipping without one', () => {
    expect(() => withCsp('<html></html>', csp)).toThrow(/Content-Security-Policy/);
  });

  it('stays out of the dev server, which needs inline scripts', () => {
    expect(cspPlugin().apply).toBe('build');
  });

  it('keeps Tauri IPC and the relay reachable, blocks inline scripts, and quotes safely', () => {
    expect(csp).not.toContain('"');
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toMatch(/script-src|'unsafe-eval'/);
    const connect = csp.split(';').find((d) => d.trim().startsWith('connect-src'))!;
    expect(connect).toContain('ipc:');
    expect(connect).toContain(RELAY_URL!);
  });
});
