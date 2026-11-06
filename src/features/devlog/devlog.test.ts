// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import pkg from '../../../package.json';
import { RELEASES_URL } from '@/config';
import { DEFAULT_SETTINGS, DEVICE_ONLY_SETTINGS } from '@/db/settings';
import { checkForUpdate, compareVersions, formatDay, parseLatest, whatsNew, whatsNewMessage, type Get } from './logic';
import { RELEASES, type Release } from './releases';

const URL = 'https://api.github.test/latest';
const NOW = Date.UTC(2026, 9, 29, 12);
const on = { ...DEFAULT_SETTINGS, checkUpdates: true };
const gh = (tag: string) => ({ tag_name: tag, html_url: `${RELEASES_URL}/tag/${tag}`, published_at: '2026-11-02T09:00:00Z', body: '## Changes\n- Faster' });

function server(...answers: ({ status: number; json: unknown } | null)[]) {
  const calls: string[] = [];
  const get: Get = async (url) => {
    calls.push(url);
    return answers.shift() ?? null;
  };
  return { get, calls };
}

describe('bundled release notes', () => {
  test('the newest entry is the version in package.json, and versions only go down', () => {
    expect(RELEASES[0]!.version).toBe(pkg.version);
    for (let i = 1; i < RELEASES.length; i++) expect(compareVersions(RELEASES[i - 1]!.version, RELEASES[i]!.version)).toBeGreaterThan(0);
    for (const r of RELEASES) {
      expect(r.notes.length).toBeGreaterThan(0);
      expect(r.summary.trim()).not.toBe('');
      if (r.date) expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test('versions compare by number, with or without a "v"', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('v1.2.0', '1.2')).toBe(0);
    expect(compareVersions('1.2.0-beta.1', '1.2.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
  });
});

describe("what's new", () => {
  const n = (...texts: string[]) => texts.map((text) => ({ tag: 'new' as const, text }));
  const log: Release[] = [
    { version: '0.3.0', summary: 'C', notes: n('c1', 'c2', 'c3', 'c4', 'c5', 'c6') },
    { version: '0.2.0', summary: 'B', notes: n('b1') },
    { version: '0.1.0', summary: 'A', notes: n('a1') },
  ];

  test('shows the releases since the last one seen, never on a first launch', () => {
    expect(whatsNew(null, '0.3.0', log)).toEqual([]);
    expect(whatsNew('0.3.0', '0.3.0', log)).toEqual([]);
    expect(whatsNew('0.1.0', '0.3.0', log).map((r) => r.version)).toEqual(['0.3.0', '0.2.0']);
    // Notes for a version newer than the one installed aren't shown.
    expect(whatsNew('0.1.0', '0.2.0', log).map((r) => r.version)).toEqual(['0.2.0']);
  });

  test('the dialog keeps to a few lines', () => {
    expect(whatsNewMessage(whatsNew('0.1.0', '0.3.0', log))).toBe('C\n\n• c1\n• c2\n• c3\n• c4\n…and 2 more.\nPlus 1 earlier release in the dev log.');
    expect(whatsNewMessage([])).toBe('');
  });
});

describe('update check', () => {
  test('nothing goes out on its own while the setting is off; the Check button still works', async () => {
    const { get, calls } = server({ status: 200, json: gh('v9.0.0') });
    expect((await checkForUpdate(DEFAULT_SETTINGS, '0.1.0', URL, get, { now: NOW })).outcome).toBe('off');
    expect(calls).toEqual([]);
    expect((await checkForUpdate(DEFAULT_SETTINGS, '0.1.0', URL, get, { now: NOW, force: true })).outcome).toBe('newer');
    expect(calls).toHaveLength(1);
  });

  test('dates read like a calendar', () => {
    expect(formatDay('2026-10-29')).toBe('Oct 29, 2026');
    expect(formatDay('soon')).toBe('soon');
  });

  test('a newer release is saved and announced once', async () => {
    const { get } = server({ status: 200, json: gh('v0.2.0') }, { status: 200, json: gh('v0.2.0') });
    const first = await checkForUpdate(on, '0.1.0', URL, get, { now: NOW });
    expect(first.outcome).toBe('newer');
    expect(first.patch).toEqual({ updateCheckedAt: NOW, latestRelease: { version: '0.2.0', url: `${RELEASES_URL}/tag/v0.2.0`, date: '2026-11-02', notes: '## Changes\n- Faster' } });
    expect(first.announce?.version).toBe('0.2.0');
    const again = await checkForUpdate({ ...on, ...first.patch }, '0.1.0', URL, get, { now: NOW, force: true });
    expect(again.outcome).toBe('newer');
    expect(again.announce).toBeNull();
  });

  test('at most once a day, unless forced', async () => {
    const { get, calls } = server({ status: 200, json: gh('v0.1.0') });
    const checked = { ...on, updateCheckedAt: NOW - 3_600_000 };
    expect((await checkForUpdate(checked, '0.1.0', URL, get, { now: NOW })).outcome).toBe('skipped');
    expect(calls).toHaveLength(0);
    expect((await checkForUpdate(checked, '0.1.0', URL, get, { now: NOW, force: true })).outcome).toBe('current');
    expect(calls).toHaveLength(1);
  });

  test('no releases yet, a failure or a strange answer', async () => {
    const { get } = server({ status: 404, json: null }, null, { status: 200, json: { message: 'hm' } }, { status: 403, json: null });
    expect(await checkForUpdate(on, '0.1.0', URL, get, { now: NOW })).toEqual({ outcome: 'none', patch: { updateCheckedAt: NOW, latestRelease: null }, announce: null });
    // Failures save nothing, so the next launch tries again.
    for (let i = 0; i < 3; i++) expect(await checkForUpdate(on, '0.1.0', URL, get, { now: NOW })).toEqual({ outcome: 'failed', patch: null, announce: null });
  });

  test('parses only what it needs from GitHub', () => {
    expect(parseLatest(null)).toBeNull();
    expect(parseLatest({ tag_name: 'v1.0.0' })).toBeNull();
    const url = `${RELEASES_URL}/tag/1.0.0`;
    expect(parseLatest({ tag_name: '1.0.0', html_url: url, body: 'x'.repeat(3000) })).toEqual({ version: '1.0.0', url, date: null, notes: 'x'.repeat(2000) });
  });

  test('what this device has seen and checked stays out of backups', () => {
    expect(DEVICE_ONLY_SETTINGS).toEqual(expect.arrayContaining(['lastSeenVersion', 'updateCheckedAt', 'latestRelease']));
    expect(DEVICE_ONLY_SETTINGS).not.toContain('checkUpdates');
  });
});
