// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
// The workout's own clock: fixing it when someone forgot to finish, or started it early.

/** After this long the workout screen asks whether the session already ended. */
export const LONG_WORKOUT_MS = 3 * 3600_000;
/** "Still going" puts the question off for this long. */
export const ASK_AGAIN_MS = 3600_000;

/** Turn back the elapsed counter by moving the start later. Never past now. */
export function windBack(startedAt: number, byMs: number, now: number): number {
  return Math.min(startedAt + byMs, now);
}

/**
 * Minutes after midnight from what someone types: "18:30", "1830", "6:30 pm", "6pm", "6.30", "18".
 * Null when it isn't a time.
 */
export function parseTimeOfDay(text: string): number | null {
  const m = text.trim().toLowerCase().replace(/\s+/g, ' ').match(/^(\d{1,2})(?:[:.h]?(\d{2}))? ?(am|pm|a|p)?\.?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const half = m[3]?.[0];
  if (min > 59) return null;
  if (half) {
    if (h < 1 || h > 12) return null;
    if (h === 12) h = 0;
    if (half === 'p') h += 12;
  } else if (h > 23) return null;
  return h * 60 + min;
}

/** That time of day on the same calendar day as `day` (local time). */
export function atTimeOn(day: number, minutes: number): number {
  const d = new Date(day);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d.getTime();
}

/** How times of day are shown: "6:30 PM" or "18:30". */
export type ClockFormat = '12h' | '24h';

/** "6:30 PM" or "18:30", the form the time fields are filled in with (and read back). */
export function formatTimeOfDay(at: number, clock: ClockFormat = '12h'): string {
  const d = new Date(at);
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (clock === '24h') return `${String(d.getHours()).padStart(2, '0')}:${mm}`;
  return `${d.getHours() % 12 || 12}:${mm} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

export type SpanResult = { ok: true; startedAt: number; endedAt: number | null } | { ok: false; error: string };

/**
 * "I trained from x to y". The start lands on the day the workout began; the end on the start's day,
 * or the next one when it reads earlier (a session past midnight). An empty end keeps the workout open.
 */
export function resolveSpan(fromText: string, toText: string, startedAt: number, now: number, clock: ClockFormat = '12h'): SpanResult {
  const [eg1, eg2] = clock === '24h' ? ['18:30', '19:45'] : ['6:30 pm', '7:45 pm'];
  const from = parseTimeOfDay(fromText);
  if (from == null) return { ok: false, error: `Couldn’t read the start time. Try ${eg1}.` };
  const start = atTimeOn(startedAt, from);
  if (start > now) return { ok: false, error: 'The start is later than now.' };
  if (!toText.trim()) return { ok: true, startedAt: start, endedAt: null };
  const to = parseTimeOfDay(toText);
  if (to == null) return { ok: false, error: `Couldn’t read the end time. Try ${eg2}.` };
  let end = atTimeOn(start, to);
  if (end <= start) end = atTimeOn(start + 86400_000, to);
  if (end > now) return { ok: false, error: 'The end is later than now.' };
  return { ok: true, startedAt: start, endedAt: end };
}

/** Whether to ask "did your workout end?" now. */
export function shouldAskEnded(startedAt: number, now: number, askAgainAt: number | null): boolean {
  return now - startedAt >= LONG_WORKOUT_MS && (askAgainAt == null || now >= askAgainAt);
}
