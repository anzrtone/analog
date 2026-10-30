// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import seedFile from '@/assets/seed.json';
import type { SeedExercise } from '@/db/exercises';
import { getProgram, saveProgram } from '@/db/repos';
import { AnalogDB, db } from '@/db/schema';
import { patchSettings, settings } from '@/db/settings';
import { showDatabase } from '@/db/shown';
import { blankProgram } from '@/services/templates';
import { current, navigate, type Route } from '../nav';
import { suggestionFor } from '../onboarding/logic';
import { buildSample } from './sample';
import type { TourScreen } from './script';
import { setTourHost } from './store';

// Connects the tour to the real app: navigation, the throwaway sample database, and making programs.
// The sample is its own Dexie database ("analog-tour-sample"), deleted when the tour ends; the user's is never touched.

const ROUTES: Record<Exclude<TourScreen, 'workout'>, Route> = { today: { name: 'today' }, history: { name: 'history' }, programs: { name: 'programs' }, stats: { name: 'stats' }, more: { name: 'more' }, sync: { name: 'sync' } };
const SAMPLE_DB = 'analog-tour-sample';

let scratch: { db: AnalogDB; workoutId: string } | null = null;

export function installTourHost(): void {
  setTourHost({
    // The sync tour starts on the Sync page: don't stack a second copy of it.
    go: (screen) => (screen === 'sync' && current().name === 'sync' ? undefined : navigate(screen === 'workout' ? { name: 'workout', id: scratch?.workoutId ?? '' } : ROUTES[screen])),
    prepareSample: async () => {
      if (scratch) return;
      await AnalogDB.delete(SAMPLE_DB);
      const sample = new AnalogDB(SAMPLE_DB);
      const { workoutId } = await buildSample(sample, (seedFile as unknown as { exercises: SeedExercise[] }).exercises);
      scratch = { db: sample, workoutId };
    },
    showSample: (on) => showDatabase(on && scratch ? scratch.db : null),
    discardSample: () => {
      const done = scratch;
      scratch = null;
      // After the screens have switched back to the user's data, so nothing reads a closed database.
      setTimeout(() => {
        done?.db.close();
        void AnalogDB.delete(SAMPLE_DB);
      }, 0);
    },
    makeProgram: async (name) => {
      const p = blankProgram(name);
      await saveProgram(db, p);
      return { id: p.id, name };
    },
    makeDay: async (programId, name) => {
      const p = (await getProgram(db, programId))!.data;
      // A new program comes with an empty "Day 1": naming the first day renames that one.
      const block = p.blocks[0]!;
      const day = block.days[0]!;
      await saveProgram(db, { ...p, blocks: [{ ...block, days: [{ ...day, name }, ...block.days.slice(1)] }, ...p.blocks.slice(1)] });
      return { id: day.id, name };
    },
    suggestion: () => suggestionFor(settings().survey),
    userName: () => settings().profile.name,
    onEnd: (tourId) => {
      // The main tour ends at Today; the sync tour ends where it began.
      if (tourId === 'main') navigate({ name: 'today' });
      const seen = settings().toursSeen;
      if (!seen.includes(tourId)) void patchSettings({ toursSeen: [...seen, tourId] });
    },
  });
}
