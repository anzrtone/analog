// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors

// The dev log: what changed in each release, shipped inside the app so it reads offline.
// Newest first. Add an entry when you bump the version in package.json; a test fails until you do.

/** New: a feature that wasn't there. Better: something that works better. Fixed: a bug that's gone. */
export type NoteTag = 'new' | 'better' | 'fixed';

export interface Note {
  tag: NoteTag;
  text: string;
}

export interface Release {
  /** Same as package.json's version, without a "v". */
  version: string;
  /** YYYY-MM-DD it went out. Leave it off while the version is still in development. */
  date?: string;
  /** One or two sentences: the release at a glance. */
  summary: string;
  notes: Note[];
}

export const RELEASES: Release[] = [
  {
    version: '0.2.0',
    summary: 'The same logbook, rebuilt from the ground up. It opens faster, weighs less, and Android gets a real app with the rest timer on your lock screen.',
    notes: [
      { tag: 'better', text: 'Rebuilt on a lighter stack, so screens open faster.' },
      { tag: 'new', text: 'A real Android app. Rest counts down on your lock screen with −15, +15 and Skip, and the bell rings on time even with the screen off.' },
      { tag: 'new', text: 'Timed holds count up in the notification too, with a Stop button.' },
      { tag: 'new', text: 'Automatic backups: a copy of everything after each workout, the last seven kept on this device.' },
      { tag: 'new', text: 'The Windows app is now a small installer, a .msi or a portable .exe.' },
      { tag: 'better', text: 'Years of history stay quick: the first page of History and last time’s numbers load in a blink.' },
      { tag: 'better', text: 'Backups from 0.1.0 restore as they are. Nothing to convert.' },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-29',
    summary: 'The first page of the logbook. Write down what you lift, follow a program that shows its working, and keep every set on your own device.',
    notes: [
      { tag: 'new', text: 'Log a workout as ruled rows of sets. Tick a set and it’s saved on the spot, the ring closes and the rest timer starts.' },
      { tag: 'new', text: 'Last time’s numbers sit beside every set, and pencilled targets show what to aim for today.' },
      { tag: 'new', text: 'Set types with their own letter and colour: warm-up, top set, back-off, drop set, AMRAP, timed holds, and ones you make yourself.' },
      { tag: 'new', text: 'Programs that work out your next weights and say why, from simple linear progression to adaptive blocks that tune your volume to how you feel.' },
      { tag: 'new', text: 'Free starter programs, or build your own day by day.' },
      { tag: 'new', text: 'History keeps every workout forever, with a twelve-week calendar and every set and PR inside.' },
      { tag: 'new', text: 'Stats: hard sets per muscle each week, trend charts and a PR stamp for every record.' },
      { tag: 'new', text: 'Share a workout, a PR or a whole program as a card or a link.' },
      { tag: 'new', text: 'Bring your history over from Strong or Hevy, export to CSV, and back up everything to one file.' },
      { tag: 'new', text: 'A plate calculator, gyms with their own bars and plates, and bodyweight and measurements.' },
      { tag: 'new', text: 'Welcome questions and a guided tour, every bit of it skippable.' },
      { tag: 'new', text: 'This dev log, with a check for new releases that only runs when you ask.' },
      { tag: 'new', text: 'Runs in your browser and as a Windows app. Android is on its way.' },
    ],
  },
];
