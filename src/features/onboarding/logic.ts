// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { saveProgram } from '@/db/repos';
import type { AnalogDB } from '@/db/schema';
import type { AppSettings, Survey } from '@/db/settings';
import { blankProgram, TEMPLATES } from '@/services/templates';

// The first-run welcome questions: which pages each mode shows, the answer options, and what finishing does.
// No React in here, so it runs in the Node tests.

/** Bump to show a newer welcome flow once to everyone who finished an older one. */
export const ONBOARDING_VERSION = 1;

export type OnboardingMode = 'full' | 'returning' | 'survey';
export type PageId = 'hello' | 'name' | 'uses' | 'heard' | 'setup' | 'consent';

export const PAGES: Record<OnboardingMode, PageId[]> = {
  full: ['hello', 'name', 'uses', 'heard', 'setup', 'consent'],
  returning: ['name', 'uses', 'heard', 'consent'],
  survey: ['uses', 'heard', 'consent'],
};

/** Icon names the wizard maps to Lucide icons (no emoji: BRAND §8). */
export type OptionIcon = 'dumbbell' | 'biceps' | 'heart' | 'list' | 'notebook' | 'sport' | 'restart' | 'pen' | 'users' | 'phone' | 'reddit' | 'video' | 'search' | 'store' | 'share';

export interface Option {
  /** Stable: it's what gets stored and, with consent, sent. */
  id: string;
  label: string;
  icon: OptionIcon;
}

export const USES: Option[] = [
  { id: 'strength', label: 'Get stronger', icon: 'dumbbell' },
  { id: 'muscle', label: 'Build muscle', icon: 'biceps' },
  { id: 'fitness', label: 'Stay fit and healthy', icon: 'heart' },
  { id: 'program', label: 'Follow a program', icon: 'list' },
  { id: 'log', label: 'Log my own workouts', icon: 'notebook' },
  { id: 'sport', label: 'Train for a sport', icon: 'sport' },
  { id: 'comeback', label: 'Get back into training', icon: 'restart' },
  { id: 'other', label: 'Something else', icon: 'pen' },
];

export const HEARD: Option[] = [
  { id: 'friend', label: 'A friend', icon: 'users' },
  { id: 'social', label: 'TikTok or Instagram', icon: 'phone' },
  { id: 'reddit', label: 'Reddit', icon: 'reddit' },
  { id: 'youtube', label: 'YouTube', icon: 'video' },
  { id: 'search', label: 'Searching online', icon: 'search' },
  { id: 'store', label: 'An app store', icon: 'store' },
  { id: 'shared-page', label: 'A shared Analog card or program', icon: 'share' },
  { id: 'other', label: 'Somewhere else', icon: 'pen' },
];

/** Starter program for each use (a template key), or none for people who log freestyle. */
export const USE_STARTER: Record<string, string | null> = {
  strength: 'fullbody-3-linear',
  muscle: 'upper-lower-4-adaptive',
  fitness: 'fullbody-3-linear',
  program: 'upper-lower-4-adaptive',
  log: null,
  sport: 'powerbuilding-topset',
  comeback: 'fullbody-3-linear',
};

/** What the tour suggests building, from the first use picked: [program name, first day name]. */
export const USE_SUGGESTION: Record<string, [string, string]> = {
  strength: ['Strength block', 'Squat day'],
  muscle: ['Hypertrophy block', 'Push day'],
  fitness: ['Weekly routine', 'Full body'],
  program: ['My program', 'Day 1'],
  log: ['My routine', 'Day 1'],
  sport: ['Off-season', 'Power day'],
  comeback: ['Fresh start', 'Easy day'],
};
const DEFAULT_SUGGESTION: [string, string] = ['My program', 'Day 1'];

export function suggestionFor(survey: Survey | null): [string, string] {
  return USE_SUGGESTION[survey?.uses[0] ?? ''] ?? DEFAULT_SUGGESTION;
}

export const clip = (s: string, n: number) => s.trim().slice(0, n).trim();

/** Anything the user made themselves. The bundled exercise library and the default gym don't count. */
export async function hasUserData(db: AnalogDB): Promise<boolean> {
  return (
    (await db.workouts.count()) > 0 ||
    (await db.programs.count()) > 0 ||
    (await db.measurements.count()) > 0 ||
    (await db.photos.count()) > 0 ||
    (await db.exercises.where('source').equals('custom').count()) > 0
  );
}

/** Which flow a first launch gets, or null when the current one is done. */
export async function launchMode(s: AppSettings, db: AnalogDB): Promise<OnboardingMode | null> {
  if (s.onboarded && s.onboardingVersion >= ONBOARDING_VERSION) return null;
  return (await hasUserData(db)) ? 'returning' : 'full';
}

export interface WizardResult {
  /** Null when the name page wasn't shown (survey mode). */
  name: string | null;
  uses: string[];
  usesOther: string;
  heardFrom: string | null;
  heardOther: string;
  share: boolean;
  /** From the setup page (full mode only). */
  unit?: AppSettings['unit'];
  effort?: AppSettings['effort'];
  /** "Skip all": finish now, save nothing but onboarded. */
  skipped?: boolean;
}

export function answeredAny(r: Pick<WizardResult, 'uses' | 'heardFrom'>): boolean {
  return r.uses.length > 0 || r.heardFrom != null;
}

/** Same answers, ignoring when they were given. */
export function sameAnswers(a: Survey | null, b: Survey | null): boolean {
  if (!a || !b) return a === b;
  return a.uses.join() === b.uses.join() && a.usesOther === b.usesOther && a.heardFrom === b.heardFrom && a.heardOther === b.heardOther;
}

export function toSurvey(r: WizardResult, now: number): Survey {
  return {
    uses: [...r.uses],
    usesOther: r.uses.includes('other') ? clip(r.usesOther, 80) : '',
    heardFrom: r.heardFrom,
    heardOther: r.heardFrom === 'other' ? clip(r.heardOther, 80) : '',
    answeredAt: now,
  };
}

/**
 * Starter programs for the picked uses, saved in one transaction. Only ever adds: nothing the user made is touched.
 * "Something else" becomes an empty program named from their words. Returns the new program ids in pick order.
 */
export async function addStarterPrograms(db: AnalogDB, uses: string[], usesOther: string, now = Date.now()): Promise<string[]> {
  const keys = [...new Set(uses.map((u) => USE_STARTER[u]).filter((k): k is string => !!k))];
  const custom = uses.includes('other') ? clip(usesOther, 24) : '';
  const made = [...keys.map((k) => TEMPLATES.find((t) => t.key === k)!.build()), ...(custom ? [blankProgram(custom)] : [])];
  await db.transaction('rw', db.programs, async () => {
    for (const p of made) await saveProgram(db, p, now);
  });
  return made.map((p) => p.id);
}

export interface Completion {
  /** One settings write. */
  patch: Partial<AppSettings>;
  /** Programs added from the picked uses (full mode on an empty app only). */
  starterIds: string[];
  answersChanged: boolean;
  /** Start the guided tour next. */
  tour: boolean;
}

/** Everything finishing the wizard does, except applying the settings patch and starting the tour. */
export async function completeOnboarding(db: AnalogDB, s: AppSettings, mode: OnboardingMode, r: WizardResult, opts: { now?: number; newId: () => string }): Promise<Completion> {
  const now = opts.now ?? Date.now();
  const done = { onboarded: true, onboardingVersion: ONBOARDING_VERSION, disclaimerAccepted: true };
  if (r.skipped) return { patch: done, starterIds: [], answersChanged: false, tour: false };

  const answered = answeredAny(r);
  const survey = answered ? toSurvey(r, now) : s.survey;
  const answersChanged = !sameAnswers(survey, s.survey);
  const starterIds = mode === 'full' && answered && !(await hasUserData(db)) ? await addStarterPrograms(db, r.uses, r.usesOther, now) : [];

  const patch: Partial<AppSettings> = {
    ...done,
    survey,
    shareSurvey: r.share,
    // Made only when someone opts in; kept afterwards so turning sharing off can withdraw the answers.
    installId: r.share ? (s.installId ?? opts.newId()) : s.installId,
  };
  if (r.name != null) patch.profile = { ...s.profile, name: clip(r.name, 40) };
  if (r.unit) patch.unit = r.unit;
  if (r.effort) patch.effort = r.effort;
  if (answersChanged && r.share) patch.surveySentAt = null;
  return { patch, starterIds, answersChanged, tour: mode === 'full' };
}
