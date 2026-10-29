// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { exportAll, restoreAll } from '@/db/backup';
import { listPrograms, saveProgram } from '@/db/repos';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type AppSettings } from '@/db/settings';
import { testDb } from '@/db/testing';
import { startWorkout } from '@/db/workouts';
import { blankProgram } from '@/services/templates';
import { completeOnboarding, launchMode, ONBOARDING_VERSION, type WizardResult } from './logic';
import { surveyPayload, syncSurvey, type Post } from './survey';

const NOW = new Date(2026, 9, 29, 18, 30).getTime();
let ids = 0;
const newId = () => `install-${++ids}`;
const env = { platform: 'android', appVersion: '0.1.0' };

const answers = (over: Partial<WizardResult> = {}): WizardResult => ({ name: '  Sam  ', uses: ['strength'], usesOther: '', heardFrom: 'reddit', heardOther: '', share: false, ...over });
const fresh = (over: Partial<AppSettings> = {}): AppSettings => ({ ...DEFAULT_SETTINGS, ...over });

describe('welcome flow', () => {
  test('a new install gets the full flow; data from before onboarding gets the returning one', async () => {
    const db = testDb();
    expect(await launchMode(fresh(), db)).toBe('full');
    await startWorkout(db, { title: 'Old session' }, NOW);
    expect(await launchMode(fresh(), db)).toBe('returning');
    expect(await launchMode(fresh({ onboarded: true, onboardingVersion: ONBOARDING_VERSION }), db)).toBeNull();
    // A newer flow shows once more.
    expect(await launchMode(fresh({ onboarded: true, onboardingVersion: ONBOARDING_VERSION - 1 }), db)).toBe('returning');
  });

  test('starter programs follow the picked uses, and "something else" becomes a named program', async () => {
    const db = testDb();
    const c = await completeOnboarding(db, fresh(), 'full', answers({ uses: ['strength', 'muscle', 'fitness', 'other'], usesOther: 'Climbing wall sessions every week' }), { now: NOW, newId });
    const names = (await listPrograms(db)).map((p) => p.name).sort();
    // fitness maps to the same beginner template as strength: added once.
    // "Something else" is clipped to 24 characters.
    expect(names).toEqual(['Climbing wall sessions e', 'Full-body 3-day beginner linear', 'Upper/Lower 4-day hypertrophy']);
    expect(c.starterIds).toHaveLength(3);
    expect(c.tour).toBe(true);
  });

  test('nothing picked adds nothing and keeps earlier answers', async () => {
    const db = testDb();
    const before = { uses: ['muscle'], usesOther: '', heardFrom: 'friend', heardOther: '', answeredAt: 1 };
    const c = await completeOnboarding(db, fresh({ survey: before }), 'full', answers({ uses: [], heardFrom: null }), { now: NOW, newId });
    expect(await listPrograms(db)).toHaveLength(0);
    expect(c.patch.survey).toBe(before);
    expect(c.answersChanged).toBe(false);
  });

  test('an app that already has data keeps its content exactly as it was', async () => {
    const db = testDb();
    const mine = blankProgram('My split');
    await saveProgram(db, mine, NOW - 1000);
    await startWorkout(db, { title: 'Monday' }, NOW - 1000);
    for (const mode of ['full', 'returning', 'survey'] as const) {
      await completeOnboarding(db, fresh(), mode, answers({ uses: ['strength', 'muscle', 'other'], usesOther: 'Judo' }), { now: NOW, newId });
    }
    expect((await listPrograms(db)).map((p) => p.id)).toEqual([mine.id]);
  });

  test('finishing stores the trimmed name, the answers and the setup choices; no install id without opting in', async () => {
    const db = testDb();
    const { patch } = await completeOnboarding(db, fresh(), 'full', answers({ name: '   A very long nickname that keeps going and going   ', unit: 'lb', effort: 'rpe' }), { now: NOW, newId });
    expect(patch).toMatchObject({ onboarded: true, onboardingVersion: ONBOARDING_VERSION, disclaimerAccepted: true, unit: 'lb', effort: 'rpe', shareSurvey: false, installId: null });
    expect(patch.profile!.name).toBe('A very long nickname that keeps going an');
    expect(patch.profile!.name.length).toBeLessThanOrEqual(40);
    expect(patch.survey).toEqual({ uses: ['strength'], usesOther: '', heardFrom: 'reddit', heardOther: '', answeredAt: NOW });

    // The whole patch saves in one write and reads back, nulls included.
    await saveSettings(db, { installId: 'stale', surveySentAt: 3 });
    await saveSettings(db, { ...patch, surveySentAt: null });
    expect(await loadSettings(db)).toMatchObject({ ...patch, surveySentAt: null });

    const shared = await completeOnboarding(testDb(), fresh(), 'full', answers({ share: true }), { now: NOW, newId });
    expect(shared.patch.installId).toMatch(/^install-/);
    expect(shared.patch.surveySentAt).toBeNull();
  });

  test('survey mode leaves the name alone; "Skip all" saves nothing but onboarded', async () => {
    const db = testDb();
    const survey = await completeOnboarding(db, fresh({ profile: { name: 'Sam' } }), 'survey', answers({ name: null }), { now: NOW, newId });
    expect(survey.patch.profile).toBeUndefined();
    expect(survey.tour).toBe(false);

    const skipped = await completeOnboarding(db, fresh(), 'full', { ...answers(), skipped: true }, { now: NOW, newId });
    expect(skipped.patch).toEqual({ onboarded: true, onboardingVersion: ONBOARDING_VERSION, disclaimerAccepted: true });
    expect(skipped.tour).toBe(false);
    expect(await listPrograms(db)).toHaveLength(0);
  });

  test('changed answers with sharing on are sent again; unchanged ones are not', async () => {
    const db = testDb();
    const prev = { uses: ['strength'], usesOther: '', heardFrom: 'reddit', heardOther: '', answeredAt: 1 };
    const s = fresh({ survey: prev, shareSurvey: true, installId: 'install-x', surveySentAt: 5 });
    const same = await completeOnboarding(db, s, 'survey', answers({ name: null, share: true }), { now: NOW, newId });
    expect(same.answersChanged).toBe(false);
    expect('surveySentAt' in same.patch).toBe(false);
    const changed = await completeOnboarding(db, s, 'survey', answers({ name: null, uses: ['muscle'], share: true }), { now: NOW, newId });
    expect(changed.patch.surveySentAt).toBeNull();
    expect(changed.patch.installId).toBe('install-x');
  });
});

describe('anonymous survey', () => {
  const survey = { uses: ['strength', 'other'], usesOther: 'Judo', heardFrom: 'other', heardOther: 'A poster', answeredAt: NOW };

  test('the payload has the answers and the day, never the name', async () => {
    const p = surveyPayload('id-1', survey, env);
    expect(p).toEqual({ v: 1, installId: 'id-1', uses: ['strength', 'other'], usesOther: 'Judo', heardFrom: 'other', heardOther: 'A poster', platform: 'android', appVersion: '0.1.0', answeredOn: '2026-10-29' });
    const settings = fresh({ profile: { name: 'Sam Example' }, survey, installId: 'id-1' });
    expect(JSON.stringify(surveyPayload(settings.installId!, settings.survey!, env))).not.toContain('Sam');
  });

  function server(ok = true) {
    const sent: unknown[] = [];
    const post: Post = async (_url, body) => {
      sent.push(body);
      return ok;
    };
    return { sent, post };
  }

  test('nothing is sent without consent, or without somewhere to send it', async () => {
    const { sent, post } = server();
    expect(await syncSurvey(fresh({ survey, shareSurvey: false, installId: null }), 'https://x.test', post, env, NOW)).toBeNull();
    expect(await syncSurvey(fresh({ survey, shareSurvey: true, installId: 'id-1' }), null, post, env, NOW)).toBeNull();
    expect(sent).toHaveLength(0);
  });

  test('sends once, withdraws when turned off, retries after a failure', async () => {
    const { sent, post } = server();
    let s = fresh({ survey, shareSurvey: true, installId: 'id-1' });
    s = { ...s, ...(await syncSurvey(s, 'https://x.test', post, env, NOW)) };
    expect(s.surveySentAt).toBe(NOW);
    expect(await syncSurvey(s, 'https://x.test', post, env, NOW)).toBeNull();
    expect(sent).toHaveLength(1);

    s = { ...s, shareSurvey: false };
    s = { ...s, ...(await syncSurvey(s, 'https://x.test', post, env, NOW)) };
    expect(sent[1]).toEqual({ v: 1, installId: 'id-1', withdraw: true });
    expect(s.surveySentAt).toBeNull();

    const down = server(false);
    const on = fresh({ survey, shareSurvey: true, installId: 'id-1' });
    expect(await syncSurvey(on, 'https://x.test', down.post, env, NOW)).toBeNull();
    expect((await syncSurvey(on, 'https://x.test', post, env, NOW))?.surveySentAt).toBe(NOW);
  });

  test('changed answers go out again under the same id', async () => {
    const db = testDb();
    const { sent, post } = server();
    let s = fresh({ survey, shareSurvey: true, installId: 'id-1', surveySentAt: NOW - 1000 });
    s = { ...s, ...(await completeOnboarding(db, s, 'survey', answers({ name: null, uses: ['muscle'], share: true }), { now: NOW, newId })).patch };
    await syncSurvey(s, 'https://x.test', post, env, NOW);
    expect(sent).toEqual([expect.objectContaining({ installId: 'id-1', uses: ['muscle'] })]);
  });

  test('backups never carry the install id, and a restore keeps this device’s', async () => {
    const db = testDb();
    await saveSettings(db, { installId: 'id-1', surveySentAt: NOW, survey, profile: { name: 'Sam' } });
    const file = (await exportAll(db, NOW));
    expect(JSON.stringify(file)).not.toContain('id-1');
    expect(JSON.stringify(file)).toContain('Judo');

    const other = testDb();
    await saveSettings(other, { installId: 'id-2', surveySentAt: 7 });
    await restoreAll(other, file);
    const back = (await loadSettings(other));
    expect(back.installId).toBe('id-2');
    expect(back.surveySentAt).toBe(7);
    expect(back.profile.name).toBe('Sam');
  });
});
