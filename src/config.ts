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
export const PRIVACY_URL = `${SITE_URL}/privacy`;
/**
 * Where opted-in welcome answers go (POST, upserted by install id). Null: no server, so nothing is ever sent,
 * the consent page says the answers stay on this device, and Settings hides the sharing switch.
 * Setting it also means updating the "no servers" lines in About and the store listing.
 */
export const SURVEY_URL: string | null = null;
/** Release pages, and the API the optional update check asks (only when the user presses Check or turns on the daily check). */
export const RELEASES_URL = `${REPO_URL}/releases`;
export const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
