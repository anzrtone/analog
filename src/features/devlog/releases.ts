// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors

// The dev log: what changed in each release, shipped inside the app so it needs no connection to read.
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
    version: '0.6.0',
    date: '2026-11-06',
    summary: 'Fix a workout after it’s finished, flip through History a month at a time, and rest that waits for you. Sync, shared links and backups also got a full security pass.',
    notes: [
      { tag: 'new', text: 'Edit a finished workout. Open it in History and press Edit to change its name, note and times, fix any set, or add and remove sets and exercises. Your PRs are worked out again when you press Done.' },
      { tag: 'new', text: 'History’s calendar now shows a whole month, back to your very first workout. Tap a filled date to open what you did that day.' },
      { tag: 'new', text: 'Rest that waits. When it runs out the bar stays, counting up how late you are, with Go, +15 and +30. The “Rest over” notification on Android has the same buttons and stays for half an hour.' },
      { tag: 'new', text: 'Rest any length. Tap the clock to type an exact rest, and keep it for the rest of the workout if you like. “Other…” in Settings and the exercise menu takes any time up to 30 minutes, and changing it mid-rest updates the rest that’s running.' },
      { tag: 'new', text: 'Next sets follow your last set. In a workout you build yourself, the rows below start from the set you just ticked: same weight and reps, a drop set 20% lighter, a back-off 12% lighter than a top set. What you typed stays, and program days keep their plan. Switch it in Settings.' },
      { tag: 'new', text: 'Type a timed hold instead of running the clock, or correct it after you stop, as 1:12, 72 or 1m12. A slip no longer means redoing the set.' },
      { tag: 'new', text: 'Swipe a program left to delete it, with a check first. Workouts you logged with it stay in your history.' },
      { tag: 'new', text: 'Stopping sync can now delete your data from the server. Do it from your last paired device: any device still paired puts it back on its next sync. Otherwise the server removes it after 60 days.' },
      { tag: 'better', text: 'Shared program links open on a preview, and nothing is added until you press Add this program.' },
      { tag: 'better', text: 'A sync that would remove a good part of your history now asks first, and any sync that removes something saves a backup before it does. You’ll find those backups marked “before a sync”.' },
      { tag: 'better', text: 'Sync and restore check what they’re given. Damaged rows and dates far in the future are left out, and you’re told how many.' },
      { tag: 'better', text: 'Cloud-folder and file sync now say plainly that they aren’t encrypted. A pairing code is the way to keep your log scrambled.' },
      { tag: 'better', text: 'Android cloud backup now only runs when your phone can encrypt it first, which needs a screen lock. Without one, your automatic backups stay on the phone.' },
      { tag: 'better', text: 'On a phone, number sheets no longer open with the keyboard covering them. Tap the number when you want to type.' },
      { tag: 'better', text: 'The sync server now has firm spending limits, to keep strangers from running up its bill. If it ever reaches one, sync says so and your data stays safe on your device.' },
      { tag: 'better', text: 'Android now has the same locked-down page rules as Windows, and “Open” in Sync only ever opens a real sync folder.' },
      { tag: 'better', text: 'Each release download can now be checked against the build that made it. The README says how.' },
      { tag: 'fixed', text: 'Sync couldn’t be reached on the desktop app. The sidebar and the phone’s tab bar now share one list, with the rest under More on both.' },
      { tag: 'fixed', text: 'One bad setting from a backup or another device could stop the app opening. Bad values are now ignored, and a screen that fails offers a way out, including to your backups.' },
      { tag: 'fixed', text: 'Something you restored from a backup could be deleted again by the next sync. Restoring now wins.' },
      { tag: 'fixed', text: 'Restoring an old backup could turn a sharing switch back on. Those switches now stay as you set them on this device.' },
      { tag: 'fixed', text: 'Ticking a hold-until-failure set could log its target as your result. It now takes a real or typed time.' },
      { tag: 'fixed', text: 'A running stopwatch could be swiped away and left going on the lock screen. Only Stop or Cancel end it now.' },
      { tag: 'fixed', text: 'A name starting with = in a CSV export could run as a formula in a spreadsheet.' },
      { tag: 'fixed', text: 'The tour’s highlight no longer runs off the edge of the screen on full-width items.' },
    ],
  },
  {
    version: '0.5.0',
    date: '2026-10-30',
    summary: 'A guided tour for sync, and two optional ways to help Analog grow. Both start off, and nothing about you is sent.',
    notes: [
      { tag: 'new', text: 'The first time you open Sync between devices, a short tour explains the three ways, the setup, and what happens when two devices disagree. “Re-tour” on that page plays it again.' },
      { tag: 'new', text: 'Count my install: one anonymous record, a random id with your platform and version, so the developer knows how many people use Analog. Off by default, in the welcome questions and in Settings; turning it off deletes the record.' },
      { tag: 'new', text: 'Share my answers anonymously now works: if you switch it on, your welcome answers reach the developer with that same random id, never your name or your training. Turning it off deletes them.' },
      { tag: 'better', text: '“See exactly what gets sent” in the welcome questions now shows both messages, word for word.' },
    ],
  },
  {
    version: '0.4.0',
    date: '2026-10-30',
    summary: 'Your devices can now share one log, if you want them to, and the logbook gets three new looks. Nothing goes online unless you turn it on.',
    notes: [
      { tag: 'new', text: 'Sync between devices (More, then Sync between devices). Pair with a code, a cloud folder you already use, or a file you carry across. New workouts, edits and deletions merge both ways, and merging twice never doubles anything.' },
      { tag: 'new', text: 'With a pairing code your data is scrambled on the device before it leaves, so the server only ever holds something it cannot read. There is no account.' },
      { tag: 'new', text: 'Three more themes: Blueprint, Darkroom and Ledger, with a small preview of each in Settings.' },
      { tag: 'new', text: 'A quiet Support me button in Settings and the dev log. It sends nothing until you press it.' },
      { tag: 'better', text: 'Plainer words about privacy. Analog never needs an account, and the few things that go online (the update check, sync, sharing your welcome answers) are optional and start switched off.' },
      { tag: 'better', text: 'Your unit, effort, theme and other preferences follow you between synced devices. Sounds and notifications stay per device.' },
    ],
  },
  {
    version: '0.3.0',
    date: '2026-10-30',
    summary: 'Nothing hides behind the Android buttons any more, the bottom bar gets Exercises and My Gyms, and the logbook learns what you use most.',
    notes: [
      { tag: 'fixed', text: 'Sheets, timers and buttons no longer slide under the Android back, home and recents buttons, and the last row of a page is no longer stuck behind the tab bar.' },
      { tag: 'fixed', text: 'The “why this target” note opens on screen on the desktop app instead of far below the window.' },
      { tag: 'new', text: 'Exercises and My Gyms are now tabs on the bottom bar, so the library and your plates are one tap away.' },
      { tag: 'new', text: 'The plate calculator now shows on your phone: the bar with its plates sits under each barbell lift, for the next set to do.' },
      { tag: 'new', text: 'Run a finger or the mouse across an estimated-max or bodyweight chart to read the logged top set behind each point.' },
      { tag: 'new', text: 'Importing: tap a new exercise to pick one from the library or make your own, with its muscles and equipment, right there.' },
      { tag: 'new', text: 'Pick any colour for a custom set type’s ring, and create set types from inside the program builder.' },
      { tag: 'new', text: 'Add your own body measurements next to the built-in ones.' },
      { tag: 'better', text: 'Warm-ups are lighter out of the box, two sets instead of four. Settings has Light, Standard and Thorough if you want more or fewer.' },
      { tag: 'better', text: 'The exercise library starts alphabetical, then moves what you log most to the top.' },
      { tag: 'better', text: 'The rest hint on the desktop margin has an X that closes it for good.' },
      { tag: 'better', text: 'Pop-ups with three choices stack neatly instead of wrapping.' },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-10-30',
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
