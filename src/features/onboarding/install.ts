// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import type { AppSettings } from '@/db/settings';
import type { Post, SurveyEnv, WithdrawPayload } from './survey';

// The anonymous install count: one record per install, sent only when the user turns the switch on, so the
// developer can tell how many people use the app. A random id made at that moment, the platform, the version and
// the day: nothing else, and nothing about the person. Turning it off asks the server to delete the record.
// No React in here, so it runs in the Node tests.

export interface InstallPayload {
  v: 1;
  installId: string;
  platform: string;
  appVersion: string;
  /** Day only: no time, no timezone. */
  day: string;
}

const day = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Exactly what gets posted. The consent page previews it with the same function. */
export function installPayload(installId: string, env: SurveyEnv, now = Date.now()): InstallPayload {
  return { v: 1, installId, platform: env.platform, appVersion: env.appVersion, day: day(now) };
}

/**
 * Bring the server in line with the settings. Idempotent, so it runs on every launch:
 * counting on and not yet sent → send once; counting off after a send → withdraw (the server deletes the record).
 * Returns the settings to save, or null when there was nothing to do or the request failed (next launch retries).
 */
export async function syncInstall(s: Pick<AppSettings, 'shareInstall' | 'installId' | 'installSentAt'>, url: string | null, post: Post, env: SurveyEnv, now = Date.now()): Promise<Partial<AppSettings> | null> {
  if (!url || !s.installId) return null;
  if (s.shareInstall && s.installSentAt == null) {
    return (await post(url, installPayload(s.installId, env, now))) ? { installSentAt: now } : null;
  }
  if (!s.shareInstall && s.installSentAt != null) {
    const gone: WithdrawPayload = { v: 1, installId: s.installId, withdraw: true };
    return (await post(url, gone)) ? { installSentAt: null } : null;
  }
  return null;
}

/** The counting switch: turning it on makes the random id if there isn't one yet (the survey may have made it). */
export function countingPatch(s: Pick<AppSettings, 'installId'>, on: boolean, newId: () => string): Partial<AppSettings> {
  return on ? { shareInstall: true, installId: s.installId ?? newId() } : { shareInstall: false };
}
