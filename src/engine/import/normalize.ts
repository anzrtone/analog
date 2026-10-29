// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import type { SetType } from '../setTypes';

/** One workout as read from another app's export, before it is matched to our exercise library. */
export interface ImportedWorkout {
  title: string;
  startedAt: number;
  endedAt: number | null;
  notes: string | null;
  exercises: ImportedExercise[];
}

export interface ImportedExercise {
  name: string;
  notes: string | null;
  /** Same key on consecutive exercises = a superset. */
  groupKey: string | null;
  sets: ImportedSet[];
}

export interface ImportedSet {
  type: SetType;
  weightG: number | null;
  reps: number | null;
  rpe: number | null;
  timeMs: number | null;
  distanceM: number | null;
  note: string | null;
}

export interface ImportResult {
  source: 'strong' | 'hevy' | 'analog-csv';
  workouts: ImportedWorkout[];
  /** Distinct exercise names, for the mapping screen. */
  exerciseNames: string[];
  warnings: string[];
}

export function num(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/**
 * Parse the date formats these exports use, as local time:
 * "2023-01-15 08:30:00", "2023-01-15T08:30:00", "15 Jan 2024, 08:30", "Jan 15, 2024, 8:30 AM".
 */
export function parseDate(v: string): number | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0)).getTime();
  m = s.match(/^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4}),? (\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (m) return new Date(+m[3]!, MONTHS[m[2]!.toLowerCase()] ?? 0, +m[1]!, hour(+m[4]!, m[6]), +m[5]!).getTime();
  m = s.match(/^([A-Za-z]{3})[a-z]* (\d{1,2}),? (\d{4}),? (\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (m) return new Date(+m[3]!, MONTHS[m[1]!.toLowerCase()] ?? 0, +m[2]!, hour(+m[4]!, m[6]), +m[5]!).getTime();
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1]!, +m[2]! - 1, +m[3]!).getTime();
  return null;
}

function hour(h: number, ampm: string | undefined): number {
  if (!ampm) return h;
  const pm = ampm.toUpperCase() === 'PM';
  if (h === 12) return pm ? 12 : 0;
  return pm ? h + 12 : h;
}

/** "1h 5m", "45m", "1:05:00", "3900" (seconds) → ms. */
export function parseDurationText(v: string | undefined): number | null {
  if (!v) return null;
  const s = v.trim();
  if (/^\d+$/.test(s)) return +s * 1000;
  const hms = s.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (hms) return hms[3] != null ? (+hms[1]! * 3600 + +hms[2]! * 60 + +hms[3]) * 1000 : (+hms[1]! * 60 + +hms[2]!) * 1000;
  const h = s.match(/(\d+)\s*h/);
  const mm = s.match(/(\d+)\s*m(?!s)/);
  const sec = s.match(/(\d+)\s*s/);
  if (!h && !mm && !sec) return null;
  return ((+(h?.[1] ?? 0)) * 3600 + (+(mm?.[1] ?? 0)) * 60 + +(sec?.[1] ?? 0)) * 1000;
}

export function nonEmpty(v: unknown): string | null {
  const s = v == null ? '' : String(v).trim();
  return s === '' ? null : s;
}
