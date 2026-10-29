// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import type { AppSettings, Survey } from '@/db/settings';

// Anonymous welcome answers, sent only when the user opts in and only if the app has somewhere to send them
// (SURVEY_URL). Never the name or any training data. No React in here, so it runs in the Node tests.

export interface SurveyEnv {
  platform: string;
  appVersion: string;
}

export interface SurveyPayload {
  v: 1;
  installId: string;
  uses: string[];
  usesOther?: string;
  heardFrom: string | null;
  heardOther?: string;
  platform: string;
  appVersion: string;
  /** Day only: no time, no timezone. */
  answeredOn: string;
}

export interface WithdrawPayload {
  v: 1;
  installId: string;
  withdraw: true;
}

const day = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Exactly what gets posted. The consent page previews it with the same function. */
export function surveyPayload(installId: string, survey: Survey, env: SurveyEnv): SurveyPayload {
  return {
    v: 1,
    installId,
    uses: survey.uses,
    ...(survey.usesOther ? { usesOther: survey.usesOther } : {}),
    heardFrom: survey.heardFrom,
    ...(survey.heardOther ? { heardOther: survey.heardOther } : {}),
    platform: env.platform,
    appVersion: env.appVersion,
    answeredOn: day(survey.answeredAt),
  };
}

export type Post = (url: string, body: SurveyPayload | WithdrawPayload) => Promise<boolean>;

/**
 * Bring the server in line with the settings. Idempotent, so it runs on every launch:
 * sharing on and not yet sent → send; sharing off after a send → withdraw (the server deletes the record).
 * Returns the settings to save, or null when there was nothing to do or the request failed (next launch retries).
 */
export async function syncSurvey(s: Pick<AppSettings, 'shareSurvey' | 'survey' | 'installId' | 'surveySentAt'>, url: string | null, post: Post, env: SurveyEnv, now = Date.now()): Promise<Partial<AppSettings> | null> {
  if (!url || !s.installId) return null;
  if (s.shareSurvey && s.survey && s.surveySentAt == null) {
    return (await post(url, surveyPayload(s.installId, s.survey, env))) ? { surveySentAt: now } : null;
  }
  if (!s.shareSurvey && s.surveySentAt != null) {
    return (await post(url, { v: 1, installId: s.installId, withdraw: true })) ? { surveySentAt: null } : null;
  }
  return null;
}

/** POST as JSON with no cookies and no referrer. Any failure, including a 10 s timeout, just means "try next launch". */
export const postJson: Post = async (url, body) => {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10_000);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit', referrerPolicy: 'no-referrer', signal: abort.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

/** The sharing switch in Settings: same rules as the consent page. */
export function sharingPatch(s: Pick<AppSettings, 'installId'>, on: boolean, newId: () => string): Partial<AppSettings> {
  return on ? { shareSurvey: true, installId: s.installId ?? newId() } : { shareSurvey: false };
}
