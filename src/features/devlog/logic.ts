// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { RELEASES_URL } from '@/config';
import type { AppSettings, LatestRelease } from '@/db/settings';
import { RELEASES, type Release } from './releases';

// What's new after an update, and the optional check for a newer release on GitHub. Off unless the user turns it
// on in Settings. No React in here, so it runs in the Node tests.

const DAY = 86_400_000;

/** "v1.2.3" → [1, 2, 3]. Anything after a "-" (pre-release) is ignored. */
function parts(v: string): number[] {
  return v
    .trim()
    .replace(/^v/i, '')
    .split('-')[0]!
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);
}

/** Negative when a is older than b, 0 when the same, positive when newer. */
export function compareVersions(a: string, b: string): number {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Releases newer than the last one seen, up to the installed one. Empty on a first launch (null). */
export function whatsNew(lastSeen: string | null, current: string, releases: Release[] = RELEASES): Release[] {
  if (lastSeen == null) return [];
  return releases.filter((r) => compareVersions(r.version, lastSeen) > 0 && compareVersions(r.version, current) <= 0);
}

/** The few lines a "what's new" dialog shows: the newest release's summary and notes, then a count of the rest. */
export function whatsNewMessage(releases: Release[], max = 4): string {
  const [newest, ...older] = releases;
  if (!newest) return '';
  const lines = [newest.summary, '', ...newest.notes.slice(0, max).map((n) => `• ${n.text}`)];
  if (newest.notes.length > max) lines.push(`…and ${newest.notes.length - max} more.`);
  if (older.length) lines.push(`Plus ${older.length} earlier ${older.length === 1 ? 'release' : 'releases'} in the dev log.`);
  return lines.join('\n');
}

const VERSION_TAG = /^v?\d{1,6}(\.\d{1,6}){1,3}(-[\w.]{1,40})?$/i;

/**
 * GitHub's "latest release" response, reduced to what the dev log shows. Null if it doesn't look like one, or if it
 * doesn't point at this project's own release pages: this URL becomes a "Get it" button.
 */
export function parseLatest(json: unknown): LatestRelease | null {
  const r = json as { tag_name?: unknown; html_url?: unknown; published_at?: unknown; body?: unknown } | null;
  if (!r || typeof r.tag_name !== 'string' || typeof r.html_url !== 'string') return null;
  if (!VERSION_TAG.test(r.tag_name.trim()) || !r.html_url.startsWith(`${RELEASES_URL}/`)) return null;
  return {
    version: r.tag_name.trim().replace(/^v/i, ''),
    url: r.html_url,
    date: typeof r.published_at === 'string' ? r.published_at.slice(0, 10) : null,
    notes: typeof r.body === 'string' ? r.body.trim().slice(0, 2000) : '',
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-29" → "Oct 29, 2026". */
export function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return y && m && d ? `${MONTHS[m - 1]} ${d}, ${y}` : day;
}

/** A GET that resolves to the status and parsed body, or null when the network failed. */
export type Get = (url: string) => Promise<{ status: number; json: unknown } | null>;

export type CheckOutcome = 'off' | 'skipped' | 'failed' | 'none' | 'current' | 'newer';

export interface CheckResult {
  outcome: CheckOutcome;
  /** Settings to save, if any. */
  patch: Partial<AppSettings> | null;
  /** A newer release this device hasn't been told about yet. */
  announce: LatestRelease | null;
}

/**
 * Ask GitHub for the latest release. On launch: only with the daily check on, at most once a day.
 * `force` is the Check button: the user asked, so it goes out whatever the setting says.
 * A failure saves nothing, so the next launch tries again.
 */
export async function checkForUpdate(
  s: Pick<AppSettings, 'checkUpdates' | 'updateCheckedAt' | 'latestRelease'>,
  current: string,
  url: string,
  get: Get,
  opts: { now?: number; force?: boolean } = {},
): Promise<CheckResult> {
  const now = opts.now ?? Date.now();
  if (!s.checkUpdates && !opts.force) return { outcome: 'off', patch: null, announce: null };
  if (!opts.force && s.updateCheckedAt != null && now - s.updateCheckedAt < DAY) return { outcome: 'skipped', patch: null, announce: null };
  const res = await get(url);
  if (!res) return { outcome: 'failed', patch: null, announce: null };
  // GitHub answers 404 until the first release is published.
  if (res.status === 404) return { outcome: 'none', patch: { updateCheckedAt: now, latestRelease: null }, announce: null };
  const latest = res.status === 200 ? parseLatest(res.json) : null;
  if (!latest) return { outcome: 'failed', patch: null, announce: null };
  const newer = compareVersions(latest.version, current) > 0;
  return {
    outcome: newer ? 'newer' : 'current',
    patch: { updateCheckedAt: now, latestRelease: latest },
    announce: newer && s.latestRelease?.version !== latest.version ? latest : null,
  };
}

/** GET as JSON with no cookies and no referrer. Any failure, including a 10 s timeout, resolves to null. */
export const getJson: Get = async (url) => {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10_000);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' }, credentials: 'omit', referrerPolicy: 'no-referrer', signal: abort.signal });
    return { status: res.status, json: res.ok ? await res.json() : null };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};
