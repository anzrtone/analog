// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { SURVEY_URL } from '@/config';
import { db, newId } from '@/db/schema';
import { patchSettings, settings } from '@/db/settings';
import { platform } from '@/platform';
import { appVersion } from '../devlog/store';
import { createStore } from '../store';
import { startTour } from '../tour/store';
import { completeOnboarding, launchMode, type OnboardingMode, type WizardResult } from './logic';
import { postJson, sharingPatch, syncSurvey, type SurveyEnv } from './survey';

/** Which welcome flow is open, if any. */
export const onboarding = createStore<OnboardingMode | null>(null);

export const openOnboarding = (mode: OnboardingMode) => onboarding.set(mode);

/** Once at launch, after the settings have loaded. */
export async function startOnboardingIfNeeded(): Promise<void> {
  const mode = await launchMode(settings(), db);
  if (mode) onboarding.set(mode);
  void runSurveySync();
}

export function surveyEnv(): SurveyEnv {
  return { platform: platform().kind === 'desktop' ? 'desktop' : platform().kind, appVersion: appVersion() };
}

/** Save the wizard's answers in one write, then start the tour (first install) or just close. */
export async function finishOnboarding(mode: OnboardingMode, r: WizardResult): Promise<void> {
  const c = await completeOnboarding(db, settings(), mode, r, { newId });
  await patchSettings(c.patch);
  onboarding.set(null);
  void runSurveySync();
  if (c.tour) void startTour('main');
}

/** The sharing switch in Settings. */
export async function setSharing(on: boolean): Promise<void> {
  await patchSettings(sharingPatch(settings(), on, newId));
  void runSurveySync();
}

let syncing = false;
let again = false;

/** Send or withdraw the anonymous answers if the settings say so. With SURVEY_URL null (as shipped) it does nothing. */
export async function runSurveySync(): Promise<void> {
  if (!SURVEY_URL) return;
  if (syncing) {
    // A change while a request is out gets its own pass afterwards.
    again = true;
    return;
  }
  syncing = true;
  try {
    do {
      again = false;
      const patch = await syncSurvey(settings(), SURVEY_URL, postJson, surveyEnv());
      if (patch) await patchSettings(patch);
    } while (again);
  } finally {
    syncing = false;
  }
}
