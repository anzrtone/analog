// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { exportAll } from '@/db/backup';
import { saveGym } from '@/db/repos';
import type { AnalogDB } from '@/db/schema';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '@/db/settings';
import { testDb } from '@/db/testing';
import { setRow, workoutExerciseRow, workoutRow } from '@/db/workouts';
import { buildSnapshot, describeMerge, mergeBackup, parseBackup, BackupError, mergedAnything } from '@/sync/merge';
import { flushTombstones } from '@/sync/stamp';

const T = 1_700_000_000_000;

async function addWorkout(d: AnalogDB, id: string, at = T) {
  await d.workouts.put(workoutRow({ id, title: id, startedAt: at, endedAt: at + 3_600_000 }));
  await d.workoutExercises.put(workoutExerciseRow({ id: `${id}-e`, workoutId: id, exerciseId: 'bench', order: 0 }));
  await d.workoutSets.put(setRow({ id: `${id}-s`, workoutId: id, workoutExerciseId: `${id}-e`, exerciseId: 'bench', order: 0, weightG: 100000, reps: 5, completedAt: at }));
}

const snap = (d: AnalogDB) => buildSnapshot(d);
const merge = async (into: AnalogDB, from: AnalogDB, honorDeletes = true) => mergeBackup(into, await snap(from), { honorDeletes });

async function ids(d: AnalogDB, table: 'workouts' | 'workoutSets' | 'gyms') {
  return (await d.table(table).toArray()).map((r: { id: string }) => r.id).sort();
}

describe('sync hooks', () => {
  it('stamps new rows and moves an edit forward, even in the same millisecond', async () => {
    const d = testDb();
    await d.gyms.put({ id: 'g', name: 'A', unit: 'kg', barG: 20000, plates: [], dumbbellsG: [], kettlebellsG: [], machineStepG: 5000, equipment: [], isDefault: false, createdAt: 1 });
    const first = (await d.gyms.get('g'))!.updatedAt!;
    expect(first).toBeGreaterThan(0);
    await d.gyms.update('g', { name: 'B' });
    await d.gyms.update('g', { name: 'C' });
    expect((await d.gyms.get('g'))!.updatedAt!).toBeGreaterThan(first);
  });

  it('keeps an explicit updatedAt of 0 on create (seed rows always lose to a real edit)', async () => {
    const d = testDb();
    await d.gyms.put({ id: 'g', name: 'A', unit: 'kg', barG: 20000, plates: [], dumbbellsG: [], kettlebellsG: [], machineStepG: 5000, equipment: [], isDefault: false, createdAt: 1, updatedAt: 0 });
    expect((await d.gyms.get('g'))!.updatedAt).toBe(0);
  });

  it('leaves a tombstone when a row is deleted', async () => {
    const d = testDb();
    await addWorkout(d, 'w1');
    await d.workoutSets.delete('w1-s');
    await flushTombstones();
    const g = await d.tombstones.get('workoutSets:w1-s');
    expect(g).toMatchObject({ table: 'workoutSets', rid: 'w1-s' });
  });
});

describe('merging two devices', () => {
  it('adds what only the other side has, and counts a new workout once', async () => {
    const a = testDb();
    const b = testDb();
    await addWorkout(b, 'w1');
    const stats = await merge(a, b);
    expect(stats).toMatchObject({ workouts: 1, rows: 0, deleted: 0 });
    expect(await ids(a, 'workouts')).toEqual(['w1']);
    expect(await ids(a, 'workoutSets')).toEqual(['w1-s']);
    expect(mergedAnything(stats)).toBe(true);
  });

  it('keeps the newer edit on both sides, and local on a tie', async () => {
    const a = testDb();
    const b = testDb();
    const gym = { id: 'g', name: 'Home', unit: 'kg' as const, barG: 20000, plates: [], dumbbellsG: [], kettlebellsG: [], machineStepG: 5000, equipment: [], isDefault: false, createdAt: 1 };
    await a.gyms.put({ ...gym, updatedAt: 100 });
    await b.gyms.put({ ...gym, name: 'Garage', updatedAt: 200 });
    await merge(a, b);
    expect((await a.gyms.get('g'))!.name).toBe('Garage');
    await merge(b, a);
    expect((await b.gyms.get('g'))!.name).toBe('Garage');

    const c = testDb();
    const e = testDb();
    await c.gyms.put({ ...gym, name: 'Mine', updatedAt: 300 });
    await e.gyms.put({ ...gym, name: 'Theirs', updatedAt: 300 });
    await merge(c, e);
    expect((await c.gyms.get('g'))!.name).toBe('Mine');
  });

  it('a delete beats an older copy, loses to a newer edit, and is ignored when honorDeletes is false', async () => {
    const a = testDb();
    const b = testDb();
    await addWorkout(a, 'w1');
    await merge(b, a);
    await b.workouts.delete('w1');
    await flushTombstones();

    // honorDeletes false: nothing is removed.
    await merge(a, b, false);
    expect(await ids(a, 'workouts')).toEqual(['w1']);
    // honorDeletes true: the older copy goes.
    const stats = await merge(a, b);
    expect(stats.deleted).toBe(1);
    expect(await ids(a, 'workouts')).toEqual([]);

    // A newer edit on the other side beats the delete.
    const c = testDb();
    const e = testDb();
    await addWorkout(c, 'w2');
    await merge(e, c);
    await e.workouts.delete('w2');
    await flushTombstones();
    await new Promise((r) => setTimeout(r, 5));
    await c.workouts.update('w2', { title: 'edited after the delete' });
    await merge(c, e);
    expect(await ids(c, 'workouts')).toEqual(['w2']);
    await merge(e, c);
    expect(await ids(e, 'workouts')).toEqual(['w2']);
  });

  it('is idempotent: merging the same snapshot twice changes nothing', async () => {
    const a = testDb();
    const b = testDb();
    await addWorkout(b, 'w1');
    const shot = await snap(b);
    await mergeBackup(a, shot, { honorDeletes: true });
    const once = JSON.stringify((await exportAll(a, 0)).tables);
    const stats = await mergeBackup(a, shot, { honorDeletes: true });
    expect(mergedAnything(stats)).toBe(false);
    expect(JSON.stringify((await exportAll(a, 0)).tables)).toBe(once);
  });

  it('converges: two devices merging each other end with the same rows', async () => {
    const a = testDb();
    const b = testDb();
    await addWorkout(a, 'wa', T);
    await addWorkout(b, 'wb', T + 86_400_000);
    const sa = await snap(a);
    const sb = await snap(b);
    await mergeBackup(a, sb, { honorDeletes: true });
    await mergeBackup(b, sa, { honorDeletes: true });
    expect(await ids(a, 'workouts')).toEqual(['wa', 'wb']);
    expect(await ids(b, 'workouts')).toEqual(['wa', 'wb']);
    expect(JSON.stringify((await exportAll(a, 0)).tables)).toBe(JSON.stringify((await exportAll(b, 0)).tables));
  });

  it('does not re-stamp rows or make tombstones while merging', async () => {
    const a = testDb();
    const b = testDb();
    await addWorkout(b, 'w1');
    const theirs = (await b.workouts.get('w1'))!.updatedAt;
    await merge(a, b);
    expect((await a.workouts.get('w1'))!.updatedAt).toBe(theirs);
    await flushTombstones();
    expect(await a.tombstones.count()).toBe(0);
  });

  it('leaves an unfinished workout where it is being logged', async () => {
    const a = testDb();
    const b = testDb();
    await b.workouts.put(workoutRow({ id: 'open', title: 'open', startedAt: T }));
    await b.workoutSets.put(setRow({ id: 'open-s', workoutId: 'open', workoutExerciseId: 'x', exerciseId: 'bench', order: 0 }));
    await merge(a, b);
    expect(await ids(a, 'workouts')).toEqual([]);
    expect(await ids(a, 'workoutSets')).toEqual([]);
  });

  it('preferences follow the device that edited them last; per-device settings never travel', async () => {
    const a = testDb();
    const b = testDb();
    await saveSettings(a, { theme: 'paper', restSound: false }, 100);
    await saveSettings(b, { theme: 'carbon', unit: 'lb', restSound: true }, 200);
    const stats = await merge(a, b);
    expect(stats.prefs).toBe(1);
    const s = await loadSettings(a);
    expect(s.unit).toBe('lb');
    expect(s.theme).toBe('carbon');
    expect(s.restSound).toBe(false); // this device's own
    expect(s.prefsUpdatedAt).toBe(200);
    // The older side does not overwrite the newer one.
    const stats2 = await merge(b, a);
    expect(stats2.prefs).toBe(0);
    expect((await loadSettings(b)).unit).toBe('lb');
  });

  it('only a changed preference moves the preferences clock', async () => {
    const d = testDb();
    await saveSettings(d, { theme: 'paper' }, 50);
    await saveSettings(d, { theme: 'paper' }, 90);
    await saveSettings(d, { restSound: false }, 95);
    expect((await loadSettings(d)).prefsUpdatedAt).toBe(50);
  });

  it('keeps sync settings, the code and ids out of a snapshot', async () => {
    const d = testDb();
    await saveSettings(d, { sync: { ...DEFAULT_SETTINGS.sync, method: 'relay', code: 'ABCDEFGHJKMNPQRSTVWX', deviceId: 'd1' }, installId: 'secret-install', theme: 'paper' });
    const text = JSON.stringify(await snap(d));
    expect(text).not.toContain('ABCDEFGHJKMNPQRSTVWX');
    expect(text).not.toContain('secret-install');
    expect(text).not.toContain('"sync"');
    const manual = JSON.stringify(await exportAll(d));
    expect(manual).not.toContain('ABCDEFGHJKMNPQRSTVWX');
  });

  it('syncs a gym that was saved through the app code path', async () => {
    const a = testDb();
    const b = testDb();
    await saveGym(b, { id: 'g2', name: 'Garage', unit: 'kg', barG: 20000, plates: [], dumbbellsG: [], kettlebellsG: [], machineStepG: 5000, equipment: [], isDefault: false });
    await merge(a, b);
    expect(await ids(a, 'gyms')).toEqual(['g2']);
  });

  it('rejects text that is not an Analog snapshot with a friendly error', () => {
    expect(() => parseBackup('nope')).toThrow(BackupError);
    expect(() => parseBackup('{"app":"other"}')).toThrow(/isn't an Analog backup/);
  });

  it('describes what came in', () => {
    expect(describeMerge({ workouts: 3, rows: 5, deleted: 2, prefs: 1 }, true)).toBe('Brought in 3 new workouts, 5 other changes, 2 removed, your settings.');
    expect(describeMerge({ workouts: 0, rows: 0, deleted: 0, prefs: 0 }, true)).toBe('Up to date. Sent your latest.');
    expect(describeMerge({ workouts: 0, rows: 0, deleted: 0, prefs: 0 }, false)).toBe('Everything is already up to date.');
  });
});
