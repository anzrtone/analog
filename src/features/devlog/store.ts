// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { LATEST_RELEASE_API } from '@/config';
import { patchSettings, settings } from '@/db/settings';
import { openLink } from '@/platform';
import { ask } from '@/components/Dialog';
import { navigate } from '../nav';
import { checkForUpdate, getJson, whatsNew, type CheckOutcome } from './logic';

export const appVersion = (): string => (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0');

/** Once at launch, after the settings have loaded and the welcome flow (if any) has opened. */
export function startDevlog(): void {
  const current = appVersion();
  const last = settings().lastSeenVersion;
  if (last !== current) {
    const fresh = whatsNew(last, current);
    void patchSettings({ lastSeenVersion: current });
    // Not on a first install: the welcome flow has that covered.
    if (fresh.length) {
      navigate({ name: 'devlog', whatsNew: true });
    }
  }
  void runUpdateCheck();
}

let checking: Promise<CheckOutcome> | null = null;

/**
 * Ask GitHub for a newer release: one of the few optional requests Analog can make (sync and the survey are the others). On launch only with the daily check on,
 * at most once a day; `force` is the Check button. No cookies, no referrer, a 10 s timeout (see logic.ts).
 */
export function runUpdateCheck(force = false): Promise<CheckOutcome> {
  checking ??= (async () => {
    try {
      const r = await checkForUpdate(settings(), appVersion(), LATEST_RELEASE_API, getJson, { force });
      if (r.patch) await patchSettings(r.patch);
      if (r.announce) {
        const { url, version } = r.announce;
        ask(`Analog ${version} is out`, `You have ${appVersion()}. The release page has the download and what changed.`, [
          { text: 'Later', style: 'cancel' },
          { text: 'Get it', onPress: () => void openLink(url) },
        ]);
      }
      return r.outcome;
    } finally {
      checking = null;
    }
  })();
  return checking;
}
