// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useSyncExternalStore } from 'react';
import { liveQuery } from 'dexie';
import { registerCustomSetTypes, type CustomSetType } from '@/engine/setTypes';
import { DEFAULT_RAMP, type WarmupStep } from '@/engine/math/warmup';
import type { ThemeName } from '@/theme/tokens';
import type { ClockFormat } from '@/engine/timer/session';
import type { WeightUnit } from '@/engine/types';
import { db as userDb, type AnalogDB } from './schema';

// Settings live in a key-value table, one row per setting, as in 0.1.0. Every field and default is carried over.

export interface AppSettings {
  unit: WeightUnit;
  effort: 'rir' | 'rpe';
  theme: ThemeName | 'system';
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
  /** Open barbell warm-ups with the empty bar. */
  warmupBar: boolean;
  maxJumpPct: number;
  /** Version of the bundled exercise library last synced into the database. */
  seedVersion: number;
  customSetTypes: CustomSetType[];
  /** One-time hints the user closed with their X; they never come back. */
  hintsDismissed: string[];
  /** Body measurements the user added beyond the built-in five; logged in length like the tape ones. */
  customMeasurements: { id: string; label: string }[];
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
  /** Opted in to being counted as one install. Off unless the user turns it on. Never in backups. */
  shareInstall: boolean;
  /** When this install was counted. Never in backups. */
  installSentAt: number | null;
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
  /** When any SYNCED_PREFS setting last changed on any device; the newest group wins in a sync. */
  prefsUpdatedAt: number;
  /** Device sync (off unless the user sets it up). Never in backups and never synced. */
  sync: SyncSettings;
}

export type SyncMethod = 'off' | 'relay' | 'folder' | 'file';

export interface SyncSettings {
  method: SyncMethod;
  /** The pairing code, normalised (20 characters). Anyone holding it can read the synced data: keep it private. */
  code: string | null;
  /** Names this device's file in a sync folder. Made on first use. */
  deviceId: string | null;
  /** The synced cloud folder (desktop). */
  dir: string | null;
  auto: boolean;
  lastAt: number | null;
  lastError: string | null;
  lastSummary: string | null;
  /** Fingerprint of what this device last uploaded, so an unchanged sync uploads nothing. */
  lastPushHash: string | null;
  lastBlobHash: string | null;
}

export const DEFAULT_SYNC: SyncSettings = { method: 'off', code: null, deviceId: null, dir: null, auto: true, lastAt: null, lastError: null, lastSummary: null, lastPushHash: null, lastBlobHash: null };

/** The settings that follow the person from device to device. Volume, notifications, folders and ids stay per device. */
export const SYNCED_PREFS: (keyof AppSettings)[] = ['unit', 'effort', 'theme', 'clock', 'bodyFigure', 'defaultRestMs', 'holdCountdown', 'holdCues', 'holdHundredths', 'warmupRamp', 'warmupBar', 'maxJumpPct', 'customSetTypes', 'customMeasurements', 'profile'];

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
export const DEVICE_ONLY_SETTINGS: string[] = ['installId', 'surveySentAt', 'shareInstall', 'installSentAt', 'lastSeenVersion', 'updateCheckedAt', 'latestRelease', 'autoBackupAt', 'sync'];

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
  warmupBar: false,
  maxJumpPct: 0.1,
  seedVersion: 0,
  customSetTypes: [],
  hintsDismissed: [],
  customMeasurements: [],
  onboarded: false,
  onboardingVersion: 0,
  profile: { name: '' },
  survey: null,
  shareSurvey: false,
  installId: null,
  surveySentAt: null,
  shareInstall: false,
  installSentAt: null,
  toursSeen: [],
  lastSeenVersion: null,
  checkUpdates: false,
  updateCheckedAt: null,
  latestRelease: null,
  autoBackupAt: null,
  prefsUpdatedAt: 0,
  sync: DEFAULT_SYNC,
};

export async function loadSettings(d: AnalogDB): Promise<AppSettings> {
  const rows = await d.settings.toArray();
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) out[r.key] = r.value;
  const loaded = out as unknown as AppSettings;
  loaded.sync = { ...DEFAULT_SYNC, ...loaded.sync };
  registerCustomSetTypes(loaded.customSetTypes);
  return loaded;
}

/** Several settings in one transaction. A null deletes the row, so every nullable setting reads back as its default. */
export async function saveSettings(d: AnalogDB, patch: Partial<AppSettings>, now = Date.now()): Promise<void> {
  await d.transaction('rw', d.settings, async () => {
    // A changed preference moves the whole group's clock, so the newest edit wins on the next sync.
    if (patch.prefsUpdatedAt === undefined) {
      for (const key of SYNCED_PREFS) {
        if (!(key in patch)) continue;
        const was = (await d.settings.get(key))?.value ?? DEFAULT_SETTINGS[key];
        if (JSON.stringify(was) !== JSON.stringify(patch[key] ?? DEFAULT_SETTINGS[key])) {
          patch = { ...patch, prefsUpdatedAt: now };
          break;
        }
      }
    }
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
