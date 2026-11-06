// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors

// The guided tours, as data. Each step names a screen, the `tourTarget` id to spotlight (null = a centred note)
// and one or two sentences. Text can use {name}, {program} and {day}; {program} and {day} also work in targets.

/** `workout` is the sample workout in progress. */
export type TourScreen = 'today' | 'workout' | 'history' | 'programs' | 'stats' | 'more' | 'sync';

/** Interactive steps: the note shows a name field and makes the thing. A day is made inside the program. */
export type MakeKind = 'program' | 'day';

export interface TourStep {
  screen: TourScreen;
  target: string | null;
  text: string;
  make?: MakeKind;
  /** Which chapter chip lights up. Defaults to the screen. */
  chapter?: string;
}

export interface TourScript {
  steps: TourStep[];
  chapters: { id: string; label: string }[];
  /** Label of the last button. */
  done: string;
}

/** Screens that would be blank on a new install: the tour fills them from a throwaway sample database. */
export const SAMPLE_SCREENS: TourScreen[] = ['workout', 'history', 'stats'];

export const TOURS: Record<string, TourScript> = {
  main: {
    chapters: [
      { id: 'today', label: 'Today' },
      { id: 'workout', label: 'Workout' },
      { id: 'programs', label: 'Programs' },
      { id: 'history', label: 'History' },
      { id: 'stats', label: 'Stats' },
    ],
    done: 'Start logging',
    steps: [
      { screen: 'today', target: null, text: 'This is Today, the page you open at the gym. A quick look around takes about a minute.' },
      { screen: 'today', target: 'today-import', text: 'Coming from Strong or Hevy? Bring your history along as a CSV. It’s read on this device, nothing is uploaded.' },
      { screen: 'today', target: 'today-start', text: 'Tap here to start a workout. You don’t need a program: add exercises as you go. Here’s one already under way.' },
      { screen: 'workout', target: 'set-row', text: 'A sample workout. Each exercise is a block of ruled rows, one per set; the set to do next is lit up.' },
      { screen: 'workout', target: 'set-values', text: 'Tap the weight or reps to change them. Dashed pencil numbers are the suggested target; the ones on the left are what you did last time.' },
      { screen: 'workout', target: 'set-tick', text: 'Tick the set when it’s done. It saves straight away, the ring closes and the rest timer starts.' },
      { screen: 'workout', target: 'set-ring', text: 'Tap the ring to change the set type: warm-up, top set, back-off, drop set, AMRAP and more. Each has its own letter and colour, like this blue “b” back-off.' },
      { screen: 'workout', target: 'workout-add-set', text: 'Add another set like the last one, or a warm-up ramp worked out from your working weight. ⋯ on a set has drops, notes and more.' },
      { screen: 'workout', target: 'workout-add-exercise', text: 'Add exercises from the library: search by name, muscle or equipment.' },
      { screen: 'workout', target: 'workout-finish', text: 'Finish when you’re done. You get a summary with the volume, the time and any PRs.' },
      { screen: 'programs', target: 'nav-programs', text: 'Programs plan your sessions and work out the next weights for you.' },
      { screen: 'programs', target: 'programs-templates', text: 'Starter templates, all free. Each one says how it adds weight, so nothing is a mystery.' },
      { screen: 'programs', target: 'programs-build', text: 'Or build your own. Give it a name and it’s ready to fill in.', make: 'program' },
      { screen: 'programs', target: 'program-{program}', text: 'There it is: “{program}”. Programs are split into days. Name the first one.', make: 'day' },
      { screen: 'programs', target: 'program-{program}', text: '“{day}” is waiting inside. Tap the program any time to add exercises, sets and how each lift progresses.' },
      { screen: 'history', target: 'nav-history', text: 'History keeps every workout, forever. These are sample workouts for the tour; yours start with your first session.' },
      { screen: 'history', target: 'history-calendar', text: 'Your month at a glance: a filled date is a training day. Missed a week? It’s just a blank page.' },
      { screen: 'history', target: 'history-list', text: 'Tap a session to see every set, the PRs it set, and to share it as a card.' },
      { screen: 'stats', target: 'nav-stats', text: 'Stats turns the log into numbers.' },
      { screen: 'stats', target: 'stats-volume', text: 'Hard sets per muscle each week, against the range that usually builds muscle. Comparisons are just info, never a grade.' },
      { screen: 'stats', target: 'stats-prs', text: 'Every PR gets a stamp and stays here. Tap one to share it.' },
      { screen: 'today', target: null, chapter: 'today', text: 'That’s the tour, {name}. Your data lives on this device unless you turn on sync; back it up from More whenever you like.' },
    ],
  },
};

/**
 * The sync tour: six notes on the Sync page. Only one points at something, the way-to-sync switch, which is always
 * there; the rest use no target because the setup panels, Sync now and the code come and go.
 */
TOURS.sync = {
  chapters: [{ id: 'sync', label: 'Sync' }],
  done: 'Got it',
  steps: [
    { screen: 'sync', target: null, text: 'Why sync? Your log lives on this device. If you train with a phone and a computer, syncing keeps them level, with no account in between.' },
    { screen: 'sync', target: 'sync-method', text: 'Three ways. A pairing code is the easiest and works anywhere. A cloud folder uses a Dropbox, OneDrive or Drive you already have. A file is fully by hand: save it here, merge it there.' },
    { screen: 'sync', target: null, text: 'Setup is once per device. On the first one, choose a way and make a code or pick a folder. On the second, enter that same code or pick the same folder.' },
    { screen: 'sync', target: null, text: 'Sync now merges straight away. Sync automatically also does it when Analog opens, every so often, and when you put it away, so the other device sees your latest.' },
    { screen: 'sync', target: null, text: 'If both devices changed the same thing, the newer edit wins. Deleting something removes it on both. Merging twice never doubles anything. With a code your data is scrambled before it leaves, so even the server can’t read it. A folder or file isn’t scrambled: anyone who can open it can read it.' },
    { screen: 'sync', target: null, chapter: 'sync', text: 'That’s sync. It’s all optional: turn it off any time and your data stays right here.' },
  ],
};

export type Made = Partial<Record<MakeKind, { id: string; name: string }>>;

const TOKEN = /\{(program|day)\}/g;

/** The step needs something the user chose not to make. */
export function needsUnmade(step: TourStep, made: Made): boolean {
  const refs = [...`${step.text} ${step.target ?? ''}`.matchAll(TOKEN)].map((m) => m[1] as MakeKind);
  return refs.some((k) => !made[k]) || (step.make === 'day' && !made.program);
}

/** Fill {name}, {program} and {day}. Without a name, "That’s the tour, {name}." reads "That’s the tour." */
export function fill(text: string, name: string, made: Made): string {
  const named = name ? text.replace(/\{name\}/g, name) : text.replace(/,? ?\{name\}/g, '');
  return named.replace(TOKEN, (_, k: MakeKind) => made[k]?.name ?? '');
}

/** Target ids carry made ids, e.g. "program-{program}" → "program-1f3…". */
export function fillTarget(target: string | null, made: Made): string | null {
  return target ? target.replace(TOKEN, (_, k: MakeKind) => made[k]?.id ?? '') : null;
}
