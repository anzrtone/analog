// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
// Public URLs. Change them in one place here.
/** The GitHub repository, as owner/name. */
export const REPO = 'anzrtone/analog';
export const REPO_URL = `https://github.com/${REPO}`;
export const SITE_URL = 'https://analog-app.github.io';
/** Shown on every share card footer. */
export const CARD_URL = 'analog-app.github.io';
export const ISSUES_URL = `${REPO_URL}/issues`;
/** The developer's Kori support page, opened only when the user presses Support me. */
export const SUPPORT_URL = 'https://supportkori.com/anzar';
export const PRIVACY_URL = `${SITE_URL}/privacy`;
/**
 * The sync relay, a Cloudflare Worker (worker/index.js) that stores one encrypted blob per pairing code. Null: this
 * build has no relay, the "pairing code" way to sync is hidden, and cloud-folder and file sync still work.
 * The same Worker takes the opt-in survey answers and install count. Setting it also means adding its origin to
 * connect-src in src-tauri/tauri.conf.json.
 */
export const RELAY_URL: string | null = 'https://analog-sync.promodoro.workers.dev';
/**
 * Where opted-in welcome answers go (POST, upserted by install id). Null: nothing is ever sent, the consent page
 * says sharing isn't on in this version, and Settings hides the sharing switch.
 * Setting it also means updating the "optional extras" lines in About, the README privacy section and the store listing.
 */
export const SURVEY_URL: string | null = RELAY_URL ? `${RELAY_URL}/survey` : null;
/** Where the opt-in install count goes (one anonymous record per install). Null: nothing is ever sent. */
export const INSTALL_URL: string | null = RELAY_URL ? `${RELAY_URL}/install` : null;
/** Release pages, and the API the optional update check asks (only when the user presses Check or turns on the daily check). */
export const RELEASES_URL = `${REPO_URL}/releases`;
export const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;

const LINK_HOSTS = new Set(['github.com', 'analog-app.github.io', 'supportkori.com', 'www.supportkori.com']);

/** The only places the app ever sends someone. Same list as the opener scope in src-tauri/capabilities/default.json. */
export function allowedLink(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && LINK_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}
