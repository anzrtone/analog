// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useSyncExternalStore } from 'react';
import { db, type AnalogDB } from './schema';

// Screens read through `readDb()`, so the guided tour can show a throwaway sample database in place of the user's
// for a while. Writes always name the user's `db`: anything written meanwhile lands in their own data, and their
// data is only hidden behind the sample, never touched.

let shown: AnalogDB | null = null;
let version = 0;
const subs = new Set<() => void>();

/** Read from another database (the tour's sample) or from the user's own again (null). */
export function showDatabase(d: AnalogDB | null): void {
  if (d === shown) return;
  shown = d;
  version++;
  subs.forEach((f) => f());
}

/** The database screens read from right now. */
export function readDb(): AnalogDB {
  return shown ?? db;
}

/**
 * Where edits made on the open screen go. Normally the user's database; while the tour shows its sample workout,
 * ticking a sample set changes the sample, so the tour can be tried out without touching the user's data.
 */
export function editDb(): AnalogDB {
  return shown ?? db;
}

/** True while the tour's sample is on screen: nothing should leave the app about it (notifications, say). */
export function sampleShown(): boolean {
  return shown != null;
}

/** Changes whenever the shown database does, so live queries re-run against the other one. */
export function useShownVersion(): number {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    () => version,
  );
}
