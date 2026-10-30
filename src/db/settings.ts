// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useSyncExternalStore } from 'react';
import { liveQuery } from 'dexie';
import { registerCustomSetTypes, type CustomSetType } from '@/engine/setTypes';
import { DEFAULT_RAMP, type WarmupStep } from '@/engine/math/warmup';
import type { ClockFormat } from '@/engine/timer/session';
import type { WeightUnit } from '@/engine/types';
import { db as userDb, type AnalogDB } from './schema';

// Settings live in a key-value table, one row per setting, as in 0.1.0. Every field and default is carried over.

export interface AppSettings {
  unit: WeightUnit;
  effort: 'rir' | 'rpe';
  theme: 'carbon' | 'paper' | 'system';
  /** 12-hour (AM/PM) or 24-hour times of day. */
  clock: ClockFormat;
  /** Which body the muscle map on Stats draws (new in 0.2.0; 0.1.0 always drew the male one). */
  bodyFigure: 'male' | 'female';
  restSound: boolean;
  otherSounds: boolean;
  haptics: boolean;
  keepAwake: boolean;
  defaultRestMs: number;
  holdCountdown: boolean;
  holdCues: boolean;
  holdHundredths: boolean;
  defaultGymId: string | null;
  disclaimerAccepted: boolean;
  /** Kept from 0.1.0 so backups carry it; 0.2.0 has no Health Connect (see STATUS.md). */
  healthConnect: boolean;
  backupReminderDays: number;
  lastBackupAt: number | null;
  warmupRamp: WarmupStep[];
  maxJumpPct: number;
  /** Version of the bundled exercise library last synced into the database. */
  seedVersion: number;
  customSetTypes: CustomSetType[];
  /** The welcome questions were answered or skipped. Bump ONBOARDING_VERSION to show a newer flow once. */
  onboarded: boolean;
  onboardingVersion: number;
  profile: { name: string };
  survey: Survey | null;
  /** Opted in to sending the survey answers anonymously. Off unless the user turns it on. */
  shareSurvey: boolean;
  /** Random id made only at the moment of opting in; null before. Never in backups. */
  installId: string | null;
  /** When the current answers were last sent. Never in backups. */
  surveySentAt: number | null;
  /** Feature tours already shown once, by tour id. */
  toursSeen: string[];
  /** App version whose "what's new" this device has shown. Null until the first launch with the dev log. */
  lastSeenVersion: string | null;
  /** Ask GitHub once a day whether a newer release is out. Off unless the user turns it on. */
  checkUpdates: boolean;
  updateCheckedAt: number | null;
  /** What the last check found; null before a check or while there are no releases. */
  latestRelease: LatestRelease | null;
  /** When this device last wrote an automatic backup (new in 0.2.0). Never in backups. */
  autoBackupAt: number | null;
}

export interface LatestRelease {
  version: string;
  url: string;
  /** YYYY-MM-DD. */
  date: string | null;
  /** The release notes as written on GitHub (Markdown, shown as plain text). */
  notes: string;
}

export interface Survey {
  uses: string[];
  usesOther: string;
  heardFrom: string | null;
  heardOther: string;
  answeredAt: number;
}

/** Device-only settings: never exported, and a restore keeps this device's values. */
export const DEVICE_ONLY_SETTINGS: string[] = ['installId', 'surveySentAt', 'lastSeenVersion', 'updateCheckedAt', 'latestRelease', 'autoBackupAt'];

export const DEFAULT_SETTINGS: AppSettings = {
  unit: 'kg',
  effort: 'rir',
  theme: 'carbon',
  clock: '12h',
  bodyFigure: 'male',
  restSound: true,
  otherSounds: false,
  haptics: true,
  keepAwake: true,
  defaultRestMs: 120000,
  holdCountdown: true,
  holdCues: true,
  holdHundredths: false,
  defaultGymId: null,
  disclaimerAccepted: false,
  healthConnect: false,
  backupReminderDays: 14,
  lastBackupAt: null,
  warmupRamp: DEFAULT_RAMP,
  maxJumpPct: 0.1,
  seedVersion: 0,
  customSetTypes: [],
  onboarded: false,
  onboardingVersion: 0,
  profile: { name: '' },
  survey: null,
  shareSurvey: false,
  installId: null,
  surveySentAt: null,
  toursSeen: [],
  lastSeenVersion: null,
  checkUpdates: false,
  updateCheckedAt: null,
  latestRelease: null,
  autoBackupAt: null,
};

export async function loadSettings(d: AnalogDB): Promise<AppSettings> {
  const rows = await d.settings.toArray();
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) out[r.key] = r.value;
  const loaded = out as unknown as AppSettings;
  registerCustomSetTypes(loaded.customSetTypes);
  return loaded;
}

/** Several settings in one transaction. A null deletes the row, so every nullable setting reads back as its default. */
export async function saveSettings(d: AnalogDB, patch: Partial<AppSettings>): Promise<void> {
  await d.transaction('rw', d.settings, async () => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined) await d.settings.delete(key);
      else await d.settings.put({ key, value });
    }
  });
  if (patch.customSetTypes) registerCustomSetTypes(patch.customSetTypes);
}

export async function saveSetting<K extends keyof AppSettings>(d: AnalogDB, key: K, value: AppSettings[K]): Promise<void> {
  await saveSettings(d, { [key]: value } as Partial<AppSettings>);
}

export async function getSetting<K extends keyof AppSettings>(d: AnalogDB, key: K): Promise<AppSettings[K]> {
  const row = await d.settings.get(key);
  return (row ? row.value : DEFAULT_SETTINGS[key]) as AppSettings[K];
}

/*
 * One app-wide live copy of the user's settings. Screens read it synchronously from their first frame (boot waits
 * for the first value), and every write lands here through Dexie's live query, so all screens stay in step.
 */
let stored: AppSettings = DEFAULT_SETTINGS;
let ready: Promise<void> | null = null;
const subs = new Set<() => void>();

/** Start watching the settings table; resolves once the first value is in. Boot awaits it before the first render. */
export function watchSettings(): Promise<void> {
  ready ??= new Promise<void>((resolve, reject) => {
    liveQuery(() => loadSettings(userDb)).subscribe({
      next: (s) => {
        stored = s;
        resolve();
        subs.forEach((f) => f());
      },
      error: (err) => {
        console.error('[settings] live query failed', err);
        reject(err);
      },
    });
  });
  return ready;
}

/** The current settings, synchronously (outside React). */
export const settings = (): AppSettings => stored;

/** Write settings to the user's database and update the live copy at once (the live query confirms it). */
export async function patchSettings(patch: Partial<AppSettings>): Promise<void> {
  stored = { ...stored, ...patch };
  subs.forEach((f) => f());
  await saveSettings(userDb, patch);
}

export function useSettings(): AppSettings {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    () => stored,
  );
}
