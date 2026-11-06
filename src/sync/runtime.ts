// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
// The app's wiring of sync: the real database, the native shell and the relay. Tests call `syncNow` with fakes instead.
import { db } from '@/db/schema';
import { settings } from '@/db/settings';
import { platform } from '@/platform';
import { startAutoSyncLoop, syncNow, type SyncDeps } from './index';
import { createRelay } from './relay';

export const appSyncDeps = (): SyncDeps => ({ db, platform: platform(), relay: createRelay() });

export const syncNowInApp = (opts: { allowLargeDelete?: boolean } = {}) => syncNow({ ...appSyncDeps(), ...opts });

let loop: ReturnType<typeof startAutoSyncLoop> | null = null;

/** Once at launch. Does nothing for anyone who has not set sync up. */
export function startSync(): void {
  loop ??= startAutoSyncLoop(
    () => syncNowInApp(),
    () => {
      const s = settings().sync;
      return s.auto && (s.method === 'relay' || s.method === 'folder');
    },
  );
}

/** Ask for a sync soon after something worth sharing (a finished workout). The loop's gap keeps it polite. */
export const nudgeSync = (): void => loop?.nudge();
