// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
// What a security audit reproduced, kept as tests: anything from outside the app is assumed to be hostile.
import { allowedLink, RELEASES_URL } from '@/config';
import { checkBackup, exportAll, restoreAll, type BackupFile } from '@/db/backup';
import { TABLE_NAMES, type AnalogDB } from '@/db/schema';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '@/db/settings';
import { testDb } from '@/db/testing';
import { setRow, workoutExerciseRow, workoutRow } from '@/db/workouts';
import { exportCsv } from '@/engine/export/csv';
import { deepLinkData, decodeProgram, encodeProgram, MAX_LINK_CHARS } from '@/engine/programs/share';
import { setTypeInfo } from '@/engine/setTypes';
import { checkForUpdate, parseLatest } from '@/features/devlog/logic';
import { syncSurvey } from '@/features/onboarding/survey';
import { importSharedProgram } from '@/features/programs';
import { dev } from '@/platform/dev';
import { decryptSnapshot, deriveKeys, encryptSnapshot, WrongCodeError } from '@/sync/crypto';
import { mergeSyncFile, previewSyncFile, syncNow } from '@/sync/index';
import { buildSnapshot, isLargeDelete, mergeBackup, previewDeletes } from '@/sync/merge';
import { createRelay, type Relay } from '@/sync/relay';
import { flushTombstones } from '@/sync/stamp';

const NOW = Date.now();
const DAY = 86_400_000;
const emptyTables = () => Object.fromEntries(TABLE_NAMES.map((t) => [t, []])) as unknown as Record<string, unknown[]>;
const backup = (over: Record<string, unknown[]>, tombstones?: unknown[]): BackupFile => ({ app: 'analog', format: 1, exportedAt: NOW, tables: { ...emptyTables(), ...over }, ...(tombstones ? { tombstones } : {}) }) as unknown as BackupFile;
const workout = (id: string, stamp = NOW - 1000, over: object = {}) => ({ id, title: id, startedAt: NOW - 5000, endedAt: NOW - 4000, updatedAt: stamp, ...over });
/** Stamped just ahead of the clock, so it is newer than a row seeded a moment ago. */
const grave = (id: string, at = Date.now() + 1000) => ({ id: `workouts:${id}`, table: 'workouts', rid: id, at });
const prefs = (rows: { key: string; value: unknown }[]) => ({ settings: [{ key: 'prefsUpdatedAt', value: NOW }, ...rows] });

async function seed(d: AnalogDB, count: number) {
  for (let i = 0; i < count; i++) await d.workouts.put(workoutRow({ id: `w${i}`, title: `w${i}`, startedAt: NOW - DAY, endedAt: NOW - DAY + 1000 }));
}

describe('settings from outside can never stop the app opening', () => {
  const POISON: unknown[] = [5, [null], 'x', { a: 1 }, [{ id: 5 }], true];

  it.each(POISON)('a restore with customSetTypes = %j', async (bad) => {
    const d = testDb();
    await restoreAll(d, backup({ settings: [{ key: 'customSetTypes', value: bad }] }));
    await expect(loadSettings(d)).resolves.toMatchObject({ customSetTypes: [] });
  });

  it.each(POISON)('a merge with customSetTypes = %j, and the rest of its preferences still arrive', async (bad) => {
    const d = testDb();
    await mergeBackup(d, backup(prefs([{ key: 'customSetTypes', value: bad }, { key: 'unit', value: 'lb' }])), { honorDeletes: true });
    const s = await loadSettings(d);
    expect(s.customSetTypes).toEqual([]);
    expect(s.unit).toBe('lb');
  });

  it('a value already stored by an older version', async () => {
    const d = testDb();
    await d.settings.bulkPut([{ key: 'customSetTypes', value: 5 }, { key: 'warmupRamp', value: 'x' }, { key: 'profile', value: null }, { key: 'unit', value: 'stone' }, { key: 'theme', value: 'constructor' }, { key: 'defaultRestMs', value: 'soon' }, { key: 'sync', value: 7 }]);
    const s = await loadSettings(d);
    expect(s).toMatchObject({ customSetTypes: [], warmupRamp: DEFAULT_SETTINGS.warmupRamp, profile: { name: '' }, unit: 'kg', theme: 'carbon', defaultRestMs: 120000 });
    expect(s.sync.method).toBe('off');
  });

  it('a __proto__ or constructor settings row does nothing', async () => {
    const d = testDb();
    await d.settings.bulkPut(JSON.parse('[{"key":"__proto__","value":{"polluted":"yes"}},{"key":"constructor","value":"x"}]'));
    const s = await loadSettings(d);
    expect((s as unknown as { polluted?: string }).polluted).toBeUndefined();
    expect(typeof s.constructor).toBe('function');
  });

  it('a custom set type cannot replace a built-in one', async () => {
    const d = testDb();
    await d.settings.put({ key: 'customSetTypes', value: [{ id: 'working', label: 'HIJACK', ring: 'red' }] });
    await loadSettings(d);
    expect(setTypeInfo('working').label).not.toBe('HIJACK');
  });

  it('keeps every setting the app itself writes, through a backup and back', async () => {
    const d = testDb();
    const mine = { unit: 'lb', effort: 'rpe', theme: 'paper', clock: '24h', bodyFigure: 'female', defaultRestMs: 90000, warmupBar: true, profile: { name: 'Sam' }, customMeasurements: [{ id: 'm1', label: 'Calf' }], customSetTypes: [{ id: 'custom:1', label: 'Mine', hint: '', letter: 'M', glyph: null, ring: 'red', countsAsVolume: true, prEligible: true, timed: false }], lastBackupAt: 1000, defaultGymId: 'g' } as const;
    await saveSettings(d, mine as never);
    const fresh = testDb();
    await restoreAll(fresh, await exportAll(d));
    expect(await loadSettings(fresh)).toMatchObject(mine);
  });
});

describe('merging a hostile snapshot', () => {
  it('ignores a grave from the future, and one whose id does not match its row', async () => {
    const d = testDb();
    await seed(d, 2);
    const soon = Date.now() + 1000;
    await mergeBackup(d, backup({}, [grave('w0', soon + 10 * DAY), { id: 'workouts:other', table: 'workouts', rid: 'w1', at: soon }, { id: 'nope:w1', table: 'nope', rid: 'w1', at: soon }, null, 5]), { honorDeletes: true });
    expect(await d.workouts.count()).toBe(2);
    expect(await d.tombstones.count()).toBe(0);
  });

  it('refuses a row stamped far in the future, so it cannot beat honest edits for good', async () => {
    const d = testDb();
    const s = await mergeBackup(d, backup({ workouts: [workout('w1', NOW + 100 * 365 * DAY)] }), { honorDeletes: true });
    expect(await d.workouts.count()).toBe(0);
    expect(s.skipped).toBe(1);
    await mergeBackup(d, backup({ workouts: [workout('w1', 1e308)] }), { honorDeletes: true });
    expect(await d.workouts.count()).toBe(0);
  });

  it('accepts a stamp a little ahead: clocks disagree', async () => {
    const d = testDb();
    await mergeBackup(d, backup({ workouts: [workout('w1', NOW + 3_600_000)] }), { honorDeletes: true });
    expect(await d.workouts.count()).toBe(1);
  });

  it('skips a wrong-typed or keyless row and still merges the good ones, instead of failing every sync after', async () => {
    const d = testDb();
    const s = await mergeBackup(
      d,
      backup({
        workouts: [{ endedAt: 1, updatedAt: NOW - 1 }, workout('bad1', NOW - 1, { title: { nested: 1 } }), workout('bad2', NOW - 1, { startedAt: 'yesterday' }), workout('bad3', NOW - 1, { notes: 12345 }), workout('good')],
        workoutSets: [{ id: 's1', workoutId: 'good', workoutExerciseId: 'x', exerciseId: 'e', order: 0, type: 'working', weightG: 1e308, updatedAt: NOW - 1 }],
        gyms: [{ name: 'no id' }, null, 5],
      }),
      { honorDeletes: true },
    );
    expect((await d.workouts.toArray()).map((w) => w.id)).toEqual(['good']);
    expect(await d.workoutSets.count()).toBe(0);
    expect(await d.gyms.count()).toBe(0);
    expect(s.skipped).toBeGreaterThanOrEqual(5);
  });

  it('refuses a preferences clock from the future', async () => {
    const d = testDb();
    await mergeBackup(d, backup({ settings: [{ key: 'prefsUpdatedAt', value: 1e300 }, { key: 'unit', value: 'lb' }] }), { honorDeletes: true });
    expect((await loadSettings(d)).unit).toBe('kg');
  });

  it('cannot set anything but the preferences that sync', async () => {
    const d = testDb();
    await mergeBackup(d, backup(prefs([{ key: 'shareSurvey', value: true }, { key: 'checkUpdates', value: true }, { key: 'sync', value: { code: 'x' } }])), { honorDeletes: true });
    const s = await loadSettings(d);
    expect(s).toMatchObject({ shareSurvey: false, checkUpdates: false });
    expect(s.sync.code).toBeNull();
  });

  it('pollutes nothing through a __proto__ key on a row', async () => {
    const d = testDb();
    await mergeBackup(d, backup({ workouts: [JSON.parse(`{"id":"p1","title":"x","startedAt":1,"endedAt":2,"updatedAt":${NOW - 1},"__proto__":{"polluted":"yes"}}`)] }), { honorDeletes: true });
    expect(({} as { polluted?: string }).polluted).toBeUndefined();
  });

  it('survives malformed sections', () => {
    expect(checkBackup('null').ok).toBe(false);
    expect(checkBackup('{"app":"analog","format":1,"tables":5}').ok).toBe(false);
    expect(checkBackup('{"app":"analog","format":1,"tables":{"workouts":5}}').ok).toBe(false);
  });
});

describe('losing history takes a yes', () => {
  const syncDeps = (d: AnalogDB, blob: Uint8Array | null, extra: object = {}) => ({ db: d, platform: dev, relay: { get: async () => blob, put: async () => undefined, del: async () => undefined } as Relay, ...extra });
  const CODE = 'ABCDEFGHJKMNPQRSTVWX';
  const paired = (d: AnalogDB) => saveSettings(d, { sync: { ...DEFAULT_SETTINGS.sync, method: 'relay', code: CODE } });
  const blobOf = async (file: BackupFile) => encryptSnapshot(JSON.stringify(file), (await deriveKeys(CODE)).key);
  const wipe = (n: number) => backup({}, Array.from({ length: n }, (_, i) => grave(`w${i}`)));

  it('previews what a file would remove, without changing anything', async () => {
    const d = testDb();
    await seed(d, 3);
    const p = await previewSyncFile(d, JSON.stringify(wipe(3)));
    expect(p).toMatchObject({ workouts: 3, rows: 3, totalWorkouts: 3 });
    expect(await d.workouts.count()).toBe(3);
  });

  it('lets an ordinary delete from the other device through without asking', async () => {
    const d = testDb();
    await seed(d, 10);
    await paired(d);
    const r = await syncNow(syncDeps(d, await blobOf(wipe(1))));
    expect(r.status).toBe('ok');
    expect(await d.workouts.count()).toBe(9);
  });

  it('stops an automatic sync before a wipe, changes nothing, and says why', async () => {
    const d = testDb();
    await seed(d, 10);
    await paired(d);
    const pushed: unknown[] = [];
    const deps = syncDeps(d, await blobOf(wipe(10)));
    deps.relay.put = async (...a) => void pushed.push(a);
    const r = await syncNow(deps);
    expect(r).toMatchObject({ status: 'confirm-deletes', preview: { workouts: 10, totalWorkouts: 10 } });
    expect(await d.workouts.count()).toBe(10);
    expect(pushed).toHaveLength(0);
    expect((await loadSettings(d)).sync.lastError).toMatch(/would remove 10 of your 10 workouts/);
  });

  it('goes ahead once the person agrees, saving a backup first', async () => {
    const d = testDb();
    await seed(d, 10);
    await paired(d);
    const saved: { name: string; text: string }[] = [];
    const platform = { ...dev, listBackups: async () => saved.map((s) => s.name), writeBackup: async (name: string, text: string) => (saved.push({ name, text }), { path: name, pruned: 0 }) };
    const r = await syncNow({ ...syncDeps(d, await blobOf(wipe(10)), { allowLargeDelete: true }), platform });
    expect(r.status).toBe('ok');
    expect(await d.workouts.count()).toBe(0);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.name).toMatch(/^analog-backup-\d{4}-\d{2}-\d{2}-before-merge\.json$/);
    expect(JSON.parse(saved[0]!.text).tables.workouts).toHaveLength(10);
  });

  it('keeps the day\'s first safety copy: a later merge cannot replace the good one', async () => {
    const d = testDb();
    await seed(d, 3);
    const saved: string[] = [];
    const platform = { ...dev, listBackups: async () => [...saved], writeBackup: async (name: string) => (saved.push(name), { path: name, pruned: 0 }) };
    await mergeSyncFile({ db: d, platform }, JSON.stringify(backup({}, [grave('w0')])));
    await mergeSyncFile({ db: d, platform }, JSON.stringify(backup({}, [grave('w1')])));
    expect(saved).toHaveLength(1);
  });

  it('knows a large delete from an ordinary one', () => {
    expect(isLargeDelete({ workouts: 1, rows: 30, totalRows: 100, totalWorkouts: 5 })).toBe(false);
    expect(isLargeDelete({ workouts: 5, rows: 150, totalRows: 10_000, totalWorkouts: 300 })).toBe(false);
    expect(isLargeDelete({ workouts: 5, rows: 150, totalRows: 400, totalWorkouts: 10 })).toBe(true);
    expect(isLargeDelete({ workouts: 0, rows: 500, totalRows: 500, totalWorkouts: 0 })).toBe(true);
  });

  it('a restore brings rows back for good, even with their graves still around', async () => {
    const d = testDb();
    await seed(d, 2);
    const good = await exportAll(d);
    const graves = [grave('w0'), grave('w1')];
    await mergeBackup(d, backup({}, graves), { honorDeletes: true });
    expect(await d.workouts.count()).toBe(0);

    await restoreAll(d, good, Date.now() + 5000);
    expect(await d.workouts.count()).toBe(2);
    expect(await d.tombstones.count()).toBe(0);
    // The relay still holds the same graves: the next sync must not delete the restored rows again.
    await mergeBackup(d, backup({}, graves), { honorDeletes: true });
    expect(await d.workouts.count()).toBe(2);
    // And they travel: the snapshot this device pushes beats the graves on the others.
    const other = testDb();
    await mergeBackup(other, backup({}, graves), { honorDeletes: true });
    await mergeBackup(other, await buildSnapshot(d), { honorDeletes: true });
    expect(await other.workouts.count()).toBe(2);
  });

  it('a restore leaves out damaged rows, keeps the good ones and says how many', async () => {
    const d = testDb();
    const r = await restoreAll(d, backup({ workouts: [workout('ok'), { title: 'no id' }, workout('bad', 1, { startedAt: 'x' }), null] }));
    expect(r.skipped).toBe(3);
    expect((await d.workouts.toArray()).map((w) => w.id)).toEqual(['ok']);
  });

  it('a real workout survives the row checks, sets and all', async () => {
    const a = testDb();
    await a.workouts.put(workoutRow({ id: 'w', title: 'w', startedAt: NOW - DAY, endedAt: NOW - DAY + 1 }));
    await a.workoutExercises.put(workoutExerciseRow({ id: 'e', workoutId: 'w', exerciseId: 'bench', order: 0 }));
    await a.workoutSets.put(setRow({ id: 's', workoutId: 'w', workoutExerciseId: 'e', exerciseId: 'bench', order: 0, weightG: 100000, reps: 5, completedAt: NOW - DAY }));
    await flushTombstones();
    const b = testDb();
    const stats = await mergeBackup(b, await buildSnapshot(a), { honorDeletes: true });
    expect(stats).toMatchObject({ workouts: 1, skipped: 0 });
    expect(await b.workoutSets.count()).toBe(1);
    expect(await previewDeletes(b, await buildSnapshot(a))).toMatchObject({ rows: 0 });
  });
});

describe('sharing stays off when it was turned off', () => {
  it('a restored backup cannot turn the survey switch on', async () => {
    const d = testDb();
    await saveSettings(d, { installId: 'inst-1', shareInstall: true, shareSurvey: false });
    await restoreAll(d, backup({ settings: [{ key: 'shareSurvey', value: true }, { key: 'survey', value: { uses: ['planted'], usesOther: '', heardFrom: null, heardOther: '', answeredAt: 1 } }] }));
    const s = await loadSettings(d);
    expect(s.shareSurvey).toBe(false);
    const posts: unknown[] = [];
    await syncSurvey(s, 'https://relay.test/survey', async (_u, b) => (posts.push(b), true), { platform: 'android', appVersion: '0.5.0' });
    expect(posts).toHaveLength(0);
  });

  it('a backup does not carry the switch at all', async () => {
    const d = testDb();
    await saveSettings(d, { shareSurvey: true });
    expect(JSON.stringify(await exportAll(d))).not.toContain('shareSurvey');
  });
});

describe('shared program links', () => {
  const program = (over: object = {}) => ({ id: 'p', name: 'Plan', notes: '', schedule: 'rotation', groups: {}, meso: {}, blocks: [{ id: 'b', name: 'B', goal: 'general', weeks: 4, deloadWeek: false, adaptive: false, overrides: {}, days: [{ id: 'd', name: 'Day', weekday: null, slots: [{ id: 's', exerciseId: 'Bench', groupId: null, sets: [{ type: 'working', reps: 5, repsMax: null, rir: 1, pct: null, timeMs: null }], rule: { type: 'manual' }, restMs: null, note: null }] }] }], ...over });
  const link = (o: unknown) => encodeProgram(o as never);

  it('opens a good one', () => {
    expect(decodeProgram(link({ program: program(), exercises: [] }))).toMatchObject({ ok: true, payload: { program: { name: 'Plan' } } });
  });

  it.each([
    ['a block with no days', { blocks: [{}] }],
    ['a null block', { blocks: [null] }],
    ['a slot with no rule', { blocks: [{ name: 'B', days: [{ name: 'D', slots: [{ id: 's', exerciseId: 'e', sets: [] }] }] }] }],
    ['an unknown rule', { blocks: [{ name: 'B', days: [{ name: 'D', slots: [{ id: 's', exerciseId: 'e', sets: [], rule: { type: 'nope' } }] }] }] }],
    ['an absurd number of weeks', { blocks: [{ name: 'B', weeks: 1e308, days: [] }] }],
    ['a name that is not a string', { name: { a: 1 } }],
    ['a huge name', { name: 'x'.repeat(5000) }],
  ])('refuses %s', (_label, over) => {
    expect(decodeProgram(link({ program: program(over), exercises: [] })).ok).toBe(false);
  });

  it.each([[[null]], [[{ id: 'e', name: 'n', primary: 'not-an-array', secondary: [], equipment: 'x', mode: 'time' }]], [[{ id: 'e', name: 'n', primary: [], secondary: [], equipment: 'x', mode: 'nope' }]], [5]])('refuses the exercises %j', (exercises) => {
    expect(decodeProgram(link({ program: program(), exercises })).ok).toBe(false);
  });

  it('refuses an oversized link before decompressing it', () => {
    const r = decodeProgram('A'.repeat(MAX_LINK_CHARS + 1));
    expect(r).toEqual({ ok: false, error: 'That link is too long to be an Analog program.' });
  });

  it('imports only as a new copy', async () => {
    const d = testDb();
    const r = decodeProgram(link({ program: program(), exercises: [] }));
    if (!r.ok) throw new Error(r.error);
    const id = await importSharedProgram(d, r.payload);
    expect(id).not.toBe('p');
    expect(await d.programs.count()).toBe(1);
  });

  it('reads an opened link, and does nothing at all with a bad one', () => {
    expect(deepLinkData('analog://program?d=abc')).toBe('abc');
    expect(deepLinkData('analog://program?d=a%2Bb')).toBe('a+b');
    expect(deepLinkData('analog://program?d=%ZZ')).toBeNull();
    expect(deepLinkData('analog://programEVIL?d=abc')).toBeNull();
    expect(deepLinkData('analog://other?d=abc')).toBeNull();
    expect(deepLinkData('https://program?d=abc')).toBeNull();
    expect(deepLinkData('analog://program')).toBeNull();
    expect(deepLinkData('not a url')).toBeNull();
    expect(deepLinkData(`analog://program?d=${'a'.repeat(MAX_LINK_CHARS * 4)}`)).toBeNull();
  });
});

describe('CSV export', () => {
  it('stops a spreadsheet running names and notes as formulas', () => {
    const row = { workoutStartedAt: 1, workoutEndedAt: 2, workoutName: '=HYPERLINK("http://evil.test","x")', workoutNotes: '@SUM(1+1)', exerciseName: "=cmd|' /C calc'!A0", group: null, setOrder: 1, type: 'working', weightG: 1000, reps: 1, rir: null, rpe: null, partials: null, timeMs: null, distanceM: null, side: null, note: '+1+1' };
    const csv = exportCsv([row as never], 'kg');
    const cells = csv.split('\n')[1]!;
    expect(cells).not.toMatch(/(^|,)"?[=+@]/);
    expect(cells).toContain("'=cmd");
    expect(cells).toContain("'@SUM");
  });
});

describe('the update check and outside links', () => {
  const good = { tag_name: 'v1.2.3', html_url: `${RELEASES_URL}/tag/v1.2.3`, published_at: '2026-11-02T09:00:00Z', body: 'notes' };

  it('accepts this project\'s own release', () => {
    expect(parseLatest(good)).toMatchObject({ version: '1.2.3', url: good.html_url });
  });

  it.each(['https://evil.test/malware.apk', 'javascript:alert(1)', `${RELEASES_URL}.evil.test/x`, 'https://github.com/someone/else/releases/tag/v9', `http://github.com/anzrtone/analog/releases/tag/v9`])('refuses a release pointing at %s', async (html_url) => {
    expect(parseLatest({ ...good, html_url })).toBeNull();
    const r = await checkForUpdate({ checkUpdates: true, updateCheckedAt: null, latestRelease: null }, '0.5.0', 'u', async () => ({ status: 200, json: { ...good, tag_name: 'v99.0.0', html_url } }));
    expect(r).toMatchObject({ outcome: 'failed', announce: null });
  });

  it('refuses a tag that is not a version', () => {
    expect(parseLatest({ ...good, tag_name: 'not-a-version' })).toBeNull();
    expect(parseLatest({ ...good, tag_name: '99999999999999999999.0' })).toBeNull();
  });

  it('drops a stored release that points elsewhere', async () => {
    const d = testDb();
    await d.settings.put({ key: 'latestRelease', value: { version: '9', url: 'javascript:alert(1)', date: null, notes: '' } });
    expect((await loadSettings(d)).latestRelease).toBeNull();
  });

  it('only ever opens https links to the app\'s own places', () => {
    expect(allowedLink(`${RELEASES_URL}/tag/v1`)).toBe(true);
    expect(allowedLink('https://analog-app.github.io/privacy')).toBe(true);
    expect(allowedLink('https://supportkori.com/anzar')).toBe(true);
    for (const bad of ['javascript:alert(1)', 'https://evil.test', 'http://github.com/x', 'https://github.com.evil.test/x', 'https://github.com@evil.test/x', 'intent://x', 'file:///c:/x', 'not a url']) expect(allowedLink(bad), bad).toBe(false);
  });
});

describe('navigation', () => {
  it('has one list, covering every top-level page, so phone and desktop cannot drift apart', async () => {
    const { NAV_ITEMS } = await import('@/features/navItems');
    const { TABS } = await import('@/features/nav');
    expect(NAV_ITEMS.map((i) => i.id)).toEqual(TABS);
  });
});

describe('the sync transport', () => {
  it('treats a flipped version byte as unreadable, never as data', async () => {
    const { key } = await deriveKeys('ABCDEFGHJKMNPQRSTVWX');
    const plain = await encryptSnapshot('{"a":1}', key, { compress: false });
    const flipped = plain.slice();
    flipped[0] = 2;
    await expect(decryptSnapshot(flipped, key)).rejects.toThrow(/not readable/);
    const tampered = plain.slice();
    tampered[20]! ^= 1;
    await expect(decryptSnapshot(tampered, key)).rejects.toThrow(WrongCodeError);
  });

  it('does not follow redirects, and refuses an oversized answer', async () => {
    const seen: RequestInit[] = [];
    const relay = createRelay('https://relay.test', async (_u, i) => (seen.push(i!), new Response(new Uint8Array(21 * 1024 * 1024))));
    await expect(relay.get('a'.repeat(32))).rejects.toThrow(/more than it should/);
    expect(seen[0]!.redirect).toBe('error');
  });

  it('gives up on a body that stalls, through the same timeout', async () => {
    vi.useFakeTimers();
    try {
      const relay = createRelay('https://relay.test', async (_u, i) => {
        const stalled = new ReadableStream({
          start(c) {
            i!.signal!.addEventListener('abort', () => c.error(new Error('aborted')));
          },
        });
        return new Response(stalled);
      });
      const p = relay.get('a'.repeat(32));
      const check = expect(p).rejects.toThrow(/Couldn't reach/);
      await vi.advanceTimersByTimeAsync(31_000);
      await check;
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries once when another device won the race', async () => {
    const d = testDb();
    await seed(d, 1);
    await saveSettings(d, { sync: { ...DEFAULT_SETTINGS.sync, method: 'relay', code: 'ABCDEFGHJKMNPQRSTVWX' } });
    let puts = 0;
    const { RelayError } = await import('@/sync/relay');
    const relay: Relay = {
      get: async () => null,
      put: async () => {
        if (++puts === 1) throw new RelayError('race', 409);
      },
      del: async () => undefined,
    };
    expect((await syncNow({ db: d, platform: dev, relay })).status).toBe('ok');
    expect(puts).toBe(2);
  });

  it('tells a person what a full or busy server means', async () => {
    for (const [status, pattern] of [[507, /full/], [503, /busy/], [409, /same moment/]] as const) {
      const relay = createRelay('https://relay.test', async () => new Response(null, { status }));
      await expect(relay.put('a'.repeat(32), 'b'.repeat(64), new Uint8Array(20))).rejects.toThrow(pattern);
    }
  });
});
