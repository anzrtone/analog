// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import Papa from 'papaparse';
import { formatWeight } from '../math/units';
import { setTypeInfo, type SetType } from '../setTypes';
import type { WeightUnit } from '../types';

export interface ExportSetRow {
  workoutStartedAt: number;
  workoutEndedAt: number | null;
  workoutName: string;
  workoutNotes: string | null;
  exerciseName: string;
  group: string | null;
  setOrder: number;
  type: SetType;
  weightG: number | null;
  reps: number | null;
  rir: number | null;
  rpe: number | null;
  partials: number | null;
  timeMs: number | null;
  distanceM: number | null;
  side: string | null;
  note: string | null;
}

function iso(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** One row per set. The first columns match Strong's layout so other apps can read it. */
export function exportCsv(rows: ExportSetRow[], unit: WeightUnit): string {
  const data = rows.map((r) => ({
    Date: iso(r.workoutStartedAt),
    'Workout Name': r.workoutName,
    Duration: r.workoutEndedAt ? `${Math.round((r.workoutEndedAt - r.workoutStartedAt) / 60000)}m` : '',
    'Exercise Name': r.exerciseName,
    'Set Order': r.setOrder,
    Weight: r.weightG != null ? formatWeight(r.weightG, unit) : '',
    'Weight Unit': unit,
    Reps: r.reps ?? '',
    Distance: r.distanceM ?? '',
    Seconds: r.timeMs != null ? Math.round(r.timeMs / 1000) : '',
    Notes: r.note ?? '',
    'Workout Notes': r.workoutNotes ?? '',
    RPE: r.rpe ?? (r.rir != null ? 10 - r.rir : ''),
    'Set Type': setTypeInfo(r.type).label,
    RIR: r.rir ?? '',
    Partials: r.partials ?? '',
    Side: r.side ?? '',
    Group: r.group ?? '',
  }));
  return Papa.unparse(data, { newline: '\n' });
}
