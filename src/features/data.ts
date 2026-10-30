// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useLiveQuery } from 'dexie-react-hooks';
import type { AnalogDB } from '@/db/schema';
import { readDb, useShownVersion } from '@/db/shown';
import { useHoldScreen } from './screenReady';

/**
 * Read from the database during render. Dexie's live query re-runs whenever a table it read is written, so a
 * screen always shows what's on disk. Reads go through `readDb()`, so the tour's sample can stand in for the
 * user's data. Returns `fallback` until the first result is in.
 */
export function useData<T>(fn: (d: AnalogDB) => Promise<T>, deps: unknown[], fallback: T): T;
export function useData<T>(fn: (d: AnalogDB) => Promise<T>, deps?: unknown[]): T | undefined;
export function useData<T>(fn: (d: AnalogDB) => Promise<T>, deps: unknown[] = [], fallback?: T): T | undefined {
  const shown = useShownVersion();
  // The caller's deps are passed through; the shown database is part of every query's identity. The result is
  // boxed so "loaded, and the answer is undefined" (no active workout) is told apart from "still loading".
  const box = useLiveQuery(async () => ({ v: await fn(readDb()) }), [...deps, shown]);
  useHoldScreen(box !== undefined);
  return box === undefined || box.v === undefined ? fallback : box.v;
}
