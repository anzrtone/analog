// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import type { WeightUnit } from '../types';

export const GRAMS_PER_LB = 453.59237;

export function toGrams(value: number, unit: WeightUnit): number {
  return Math.round(unit === 'kg' ? value * 1000 : value * GRAMS_PER_LB);
}

export function fromGrams(grams: number, unit: WeightUnit): number {
  return unit === 'kg' ? grams / 1000 : grams / GRAMS_PER_LB;
}

/** Display a weight with at most 2 decimals and no trailing zeros: 32.5, 100, 1.25. */
export function formatWeight(grams: number, unit: WeightUnit): string {
  const v = fromGrams(grams, unit);
  const rounded = Math.round(v * 100) / 100;
  return trimZeros(rounded.toFixed(2));
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** "32.5 × 8". Plex Mono has no thin space, so plain spaces keep the columns monospaced. */
export function formatSet(grams: number | null, reps: number | null, unit: WeightUnit): string {
  if (grams == null && reps == null) return '—';
  if (grams == null || grams === 0) return `${reps ?? '—'}`;
  return `${formatWeight(grams, unit)} × ${reps ?? '—'}`;
}

/** m:ss, or h:mm:ss past an hour. Hundredths optional for the AMTAP stopwatch. */
export function formatClock(ms: number, hundredths = false): string {
  const neg = ms < 0;
  const abs = Math.abs(ms);
  const totalSec = Math.floor(abs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const ss = String(s).padStart(2, '0');
  let out = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  if (hundredths) out += `.${String(Math.floor((abs % 1000) / 10)).padStart(2, '0')}`;
  return neg ? `−${out}` : out;
}

/**
 * What someone types for a time, in milliseconds: "1:12", "72", "1m12", "1m 12s", "1h2m3s", "1:02:03", "72.5".
 * A bare number is seconds. Null when it isn't a time (or the seconds/minutes part runs past 59 in a colon form).
 */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/,/g, '.').replace(/\s+/g, '');
  if (!t) return null;
  if (/^\d*\.?\d+$/.test(t) || /^\d+\.$/.test(t)) return Math.round(Number(t) * 1000);
  if (t.includes(':')) {
    const parts = t.split(':');
    if (parts.length > 3 || parts.some((p, i) => !(i === parts.length - 1 ? /^\d{1,2}(\.\d+)?$/ : /^\d{1,3}$/).test(p))) return null;
    const nums = parts.map(Number);
    const sec = nums[nums.length - 1]!;
    const min = nums.length === 1 ? 0 : nums[nums.length - 2]!;
    const hr = nums.length === 3 ? nums[0]! : 0;
    if (sec >= 60 || (nums.length === 3 && min >= 60)) return null;
    return Math.round(((hr * 60 + min) * 60 + sec) * 1000);
  }
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m(?:in)?)?(?:(\d*\.?\d+)s?)?$/);
  if (!m || (m[1] == null && m[2] == null && m[3] == null)) return null;
  return Math.round(((Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 1000);
}

/** Long durations: "1 h 12 m", "45 m", "30 s". */
export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  if (ms < 60000) return `${Math.round(ms / 1000)} s`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} h ${m} m` : `${m} m`;
}

/** Parse what the user typed in a weight field ("82,5" works too). */
export function parseWeightInput(text: string, unit: WeightUnit): number | null {
  const v = Number(text.trim().replace(',', '.'));
  return Number.isFinite(v) && text.trim() !== '' ? toGrams(v, unit) : null;
}

export function rirToRpe(rir: number): number {
  return 10 - rir;
}

export function rpeToRir(rpe: number): number {
  return 10 - rpe;
}
