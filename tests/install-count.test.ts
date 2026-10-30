// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { exportAll } from '@/db/backup';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type AppSettings } from '@/db/settings';
import { testDb } from '@/db/testing';
import { countingPatch, installPayload, syncInstall } from '@/features/onboarding/install';
import { completeOnboarding, type WizardResult } from '@/features/onboarding/logic';
import { postJson, syncSurvey, type Post } from '@/features/onboarding/survey';
// @ts-expect-error plain JavaScript Worker
import worker from '../worker/index.js';

const ENV = { platform: 'android', appVersion: '0.5.0' };
const NOW = new Date(2026, 9, 30, 18, 0).getTime();
const ID = '11111111-2222-4333-8444-555555555555';
const URL = 'https://relay.test/install';

const settings = (over: Partial<AppSettings> = {}): AppSettings => ({ ...DEFAULT_SETTINGS, ...over });

function recorder(ok = true) {
  const sent: unknown[] = [];
  const post: Post = async (_url, body) => {
    sent.push(body);
    return ok;
  };
  return { sent, post };
}

describe('install count', () => {
  it('sends nothing unless the person opted in, or without somewhere to send it', async () => {
    const { sent, post } = recorder();
    expect(await syncInstall(settings({ shareInstall: false, installId: ID }), URL, post, ENV)).toBeNull();
    expect(await syncInstall(settings({ shareInstall: true, installId: ID }), null, post, ENV)).toBeNull();
    expect(await syncInstall(settings({ shareInstall: true, installId: null }), URL, post, ENV)).toBeNull();
    expect(sent).toEqual([]);
  });

  it('sends one anonymous record, once, and remembers it', async () => {
    const { sent, post } = recorder();
    const s = settings({ shareInstall: true, installId: ID });
    const patch = await syncInstall(s, URL, post, ENV, NOW);
    expect(patch).toEqual({ installSentAt: NOW });
    expect(sent).toEqual([{ v: 1, installId: ID, platform: 'android', appVersion: '0.5.0', day: '2026-10-30' }]);
    // Already counted: nothing more is sent.
    expect(await syncInstall({ ...s, installSentAt: NOW }, URL, post, ENV)).toBeNull();
    expect(sent).toHaveLength(1);
  });

  it('retries next launch when the request fails', async () => {
    const down = recorder(false);
    expect(await syncInstall(settings({ shareInstall: true, installId: ID }), URL, down.post, ENV)).toBeNull();
  });

  it('withdraws the record when the switch goes off after a send', async () => {
    const { sent, post } = recorder();
    const patch = await syncInstall(settings({ shareInstall: false, installId: ID, installSentAt: NOW }), URL, post, ENV);
    expect(patch).toEqual({ installSentAt: null });
    expect(sent).toEqual([{ v: 1, installId: ID, withdraw: true }]);
  });

  it('sends only the platform, version and day, never the name or training data', () => {
    expect(Object.keys(installPayload(ID, ENV, NOW)).sort()).toEqual(['appVersion', 'day', 'installId', 'platform', 'v']);
  });

  it('makes the random id only when counting is turned on, and keeps one the survey made', () => {
    let n = 0;
    const newId = () => `id-${++n}`;
    expect(countingPatch({ installId: null }, false, newId)).toEqual({ shareInstall: false });
    expect(countingPatch({ installId: null }, true, newId)).toEqual({ shareInstall: true, installId: 'id-1' });
    expect(countingPatch({ installId: 'mine' }, true, newId)).toEqual({ shareInstall: true, installId: 'mine' });
  });

  it('is its own switch: the welcome flow counts the install even when every question was skipped', async () => {
    const db = testDb();
    const r: WizardResult = { name: null, uses: [], usesOther: '', heardFrom: null, heardOther: '', share: false, countInstall: true };
    const c = await completeOnboarding(db, settings(), 'survey', r, { newId: () => ID, now: NOW });
    expect(c.patch).toMatchObject({ shareInstall: true, installId: ID, shareSurvey: false });
    const off = await completeOnboarding(db, settings(), 'survey', { ...r, countInstall: false }, { newId: () => ID, now: NOW });
    expect(off.patch).toMatchObject({ shareInstall: false, installId: null });
  });

  it('never travels in a backup', async () => {
    const db = testDb();
    await saveSettings(db, { shareInstall: true, installSentAt: NOW, installId: ID, theme: 'paper' });
    expect((await loadSettings(db)).shareInstall).toBe(true);
    const text = JSON.stringify(await exportAll(db));
    expect(text).not.toContain('shareInstall');
    expect(text).not.toContain('installSentAt');
    expect(text).not.toContain(ID);
  });
});

/** The app's own posts, answered by the real Worker over a fake bucket, then read back through /stats. */
describe('the app and the Worker, end to end', () => {
  function server() {
    const items = new Map<string, { uploaded: Date; customMetadata?: Record<string, string> }>();
    const bucket = {
      async put(k: string, _b: unknown, o: { customMetadata?: Record<string, string> }) {
        items.set(k, { uploaded: new Date(), customMetadata: o.customMetadata });
      },
      async delete(k: string) {
        items.delete(k);
      },
      async list({ prefix = '' }: { prefix?: string }) {
        return { objects: [...items].filter(([k]) => k.startsWith(prefix)).map(([key, o]) => ({ key, ...o })), truncated: false };
      },
    };
    const env = { SYNC_BUCKET: bucket, ADMIN_TOKEN: 'secret' };
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => worker.fetch(new Request(url, init), env)) as typeof fetch;
    const stats = async () => JSON.parse(await (await worker.fetch(new Request('https://relay.test/stats', { headers: { authorization: 'Bearer secret' } }), env)).text());
    return { stats, restore: () => void (globalThis.fetch = realFetch) };
  }

  it('delivers the survey answers and the install count to the owner, and withdraws them', async () => {
    const srv = server();
    try {
      const s = settings({
        shareSurvey: true,
        shareInstall: true,
        installId: ID,
        survey: { uses: ['strength', 'other'], usesOther: 'rowing', heardFrom: 'reddit', heardOther: '', answeredAt: NOW },
      });
      const surveyPatch = await syncSurvey(s, 'https://relay.test/survey', postJson, { platform: 'desktop', appVersion: '0.5.0' }, NOW);
      const installPatch = await syncInstall(s, 'https://relay.test/install', postJson, { platform: 'desktop', appVersion: '0.5.0' }, NOW);
      expect(surveyPatch).toEqual({ surveySentAt: NOW });
      expect(installPatch).toEqual({ installSentAt: NOW });

      const got = await srv.stats();
      expect(got.installs).toMatchObject({ total: 1, byPlatform: { desktop: 1 }, byVersion: { '0.5.0': 1 } });
      expect(got.surveys.answers).toEqual([expect.objectContaining({ uses: ['strength', 'other'], usesOther: 'rowing', heardFrom: 'reddit', platform: 'desktop' })]);
      expect(JSON.stringify(got)).not.toContain(ID);

      // Switch both off: the records are deleted.
      const off = { ...s, shareSurvey: false, shareInstall: false, surveySentAt: NOW, installSentAt: NOW };
      await syncSurvey(off, 'https://relay.test/survey', postJson, { platform: 'desktop', appVersion: '0.5.0' });
      await syncInstall(off, 'https://relay.test/install', postJson, { platform: 'desktop', appVersion: '0.5.0' });
      const after = await srv.stats();
      expect(after.installs.total).toBe(0);
      expect(after.surveys.total).toBe(0);
    } finally {
      srv.restore();
    }
  });
});
