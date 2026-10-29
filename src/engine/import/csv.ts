// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import Papa from 'papaparse';
import { toGrams } from '../math/units';
import type { SetType } from '../setTypes';
import type { WeightUnit } from '../types';
import { nonEmpty, num, parseDate, parseDurationText, type ImportedExercise, type ImportedWorkout, type ImportResult } from './normalize';

type Row = Record<string, string>;

function parse(text: string): { rows: Row[]; fields: string[] } {
  const clean = text.replace(/^﻿/, '');
  const r = Papa.parse<Row>(clean, { header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim() });
  return { rows: r.data, fields: (r.meta.fields ?? []).map((f) => f.trim()) };
}

export type CsvKind = 'strong' | 'hevy' | 'unknown';

export function detectCsv(text: string): CsvKind {
  const head = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0]?.toLowerCase() ?? '';
  if (head.includes('exercise_title') && head.includes('set_index')) return 'hevy';
  if (head.includes('exercise name') && head.includes('set order')) return 'strong';
  return 'unknown';
}

function finish(source: ImportResult['source'], workouts: ImportedWorkout[], warnings: string[]): ImportResult {
  workouts.sort((a, b) => a.startedAt - b.startedAt);
  const names = new Set<string>();
  for (const w of workouts) for (const e of w.exercises) names.add(e.name);
  return { source, workouts, exerciseNames: [...names].sort((a, b) => a.localeCompare(b)), warnings };
}

/** Consecutive rows with the same exercise name in one workout form one exercise block. */
function pushSet(w: ImportedWorkout, name: string, groupKey: string | null, notes: string | null): ImportedExercise {
  const last = w.exercises[w.exercises.length - 1];
  if (last && last.name === name) return last;
  const ex: ImportedExercise = { name, notes, groupKey, sets: [] };
  w.exercises.push(ex);
  return ex;
}

/**
 * Strong export. Two layouts exist in the wild:
 *   comma: Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
 *   semicolon (older): adds "Weight Unit" and "Distance Unit" columns.
 * Weights without a unit column are in the unit the user picked for the import.
 * "Set Order" is a number, or a letter for warm-up (W), drop (D) and failure (F) sets.
 */
export function parseStrong(text: string, defaultUnit: WeightUnit): ImportResult {
  const { rows, fields } = parse(text);
  const warnings: string[] = [];
  if (!fields.includes('Exercise Name')) return { source: 'strong', workouts: [], exerciseNames: [], warnings: ["This doesn't look like a Strong export (no Exercise Name column)."] };
  const byKey = new Map<string, ImportedWorkout>();
  let skipped = 0;
  for (const r of rows) {
    const started = parseDate(r['Date'] ?? '');
    const name = nonEmpty(r['Exercise Name']);
    if (started == null || !name) {
      skipped++;
      continue;
    }
    const title = nonEmpty(r['Workout Name']) ?? 'Workout';
    const key = `${started}|${title}`;
    let w = byKey.get(key);
    if (!w) {
      const dur = parseDurationText(r['Duration'] ?? r['Workout Duration']);
      w = { title, startedAt: started, endedAt: dur != null ? started + dur : null, notes: nonEmpty(r['Workout Notes']), exercises: [] };
      byKey.set(key, w);
    }
    const order = (r['Set Order'] ?? '').trim().toUpperCase();
    // Strong writes a "Rest Timer" pseudo-row for rest periods in some versions.
    if (order === 'REST TIMER' || name === 'Rest Timer') continue;
    const type: SetType = order === 'W' ? 'warmup' : order === 'D' ? 'drop' : order === 'F' ? 'failure' : 'working';
    const unitCol = (r['Weight Unit'] ?? '').trim().toLowerCase();
    const unit: WeightUnit = unitCol === 'lbs' || unitCol === 'lb' ? 'lb' : unitCol === 'kg' ? 'kg' : defaultUnit;
    const weight = num(r['Weight']);
    const distUnit = (r['Distance Unit'] ?? '').trim().toLowerCase();
    const dist = num(r['Distance']);
    const ex = pushSet(w, name, null, nonEmpty(r['Notes']));
    ex.sets.push({
      type,
      weightG: weight != null && weight !== 0 ? toGrams(weight, unit) : null,
      reps: num(r['Reps']),
      rpe: num(r['RPE']),
      timeMs: num(r['Seconds']) ? num(r['Seconds'])! * 1000 : null,
      distanceM: dist ? Math.round(dist * (distUnit === 'mi' ? 1609.344 : distUnit === 'km' || distUnit === '' ? 1000 : 1)) : null,
      note: nonEmpty(r['Notes']),
    });
  }
  if (skipped) warnings.push(`Skipped ${skipped} row${skipped > 1 ? 's' : ''} with no date or exercise name.`);
  return finish('strong', [...byKey.values()], warnings);
}

/**
 * Hevy export:
 *   title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,
 *   weight_kg|weight_lbs,reps,distance_km|distance_miles,duration_seconds,rpe
 */
export function parseHevy(text: string): ImportResult {
  const { rows, fields } = parse(text);
  const warnings: string[] = [];
  if (!fields.includes('exercise_title')) return { source: 'hevy', workouts: [], exerciseNames: [], warnings: ["This doesn't look like a Hevy export (no exercise_title column)."] };
  const lbs = fields.includes('weight_lbs');
  const miles = fields.includes('distance_miles');
  const byKey = new Map<string, ImportedWorkout>();
  let skipped = 0;
  for (const r of rows) {
    const started = parseDate(r['start_time'] ?? '');
    const name = nonEmpty(r['exercise_title']);
    if (started == null || !name) {
      skipped++;
      continue;
    }
    const title = nonEmpty(r['title']) ?? 'Workout';
    const key = `${started}|${title}`;
    let w = byKey.get(key);
    if (!w) {
      w = { title, startedAt: started, endedAt: parseDate(r['end_time'] ?? ''), notes: nonEmpty(r['description']), exercises: [] };
      byKey.set(key, w);
    }
    const st = (r['set_type'] ?? 'normal').trim().toLowerCase();
    const type: SetType = st === 'warmup' ? 'warmup' : st === 'dropset' ? 'drop' : st === 'failure' ? 'failure' : 'working';
    const weight = num(lbs ? r['weight_lbs'] : r['weight_kg']);
    const dist = num(miles ? r['distance_miles'] : r['distance_km']);
    const dur = num(r['duration_seconds']);
    const ex = pushSet(w, name, nonEmpty(r['superset_id']), nonEmpty(r['exercise_notes']));
    ex.sets.push({
      type,
      weightG: weight != null && weight !== 0 ? toGrams(weight, lbs ? 'lb' : 'kg') : null,
      reps: num(r['reps']),
      rpe: num(r['rpe']),
      timeMs: dur ? dur * 1000 : null,
      distanceM: dist ? Math.round(dist * (miles ? 1609.344 : 1000)) : null,
      note: null,
    });
  }
  if (skipped) warnings.push(`Skipped ${skipped} row${skipped > 1 ? 's' : ''} with no date or exercise name.`);
  return finish('hevy', [...byKey.values()], warnings);
}

export function parseCsvExport(text: string, defaultUnit: WeightUnit): ImportResult {
  const kind = detectCsv(text);
  if (kind === 'hevy') return parseHevy(text);
  if (kind === 'strong') return parseStrong(text, defaultUnit);
  return { source: 'strong', workouts: [], exerciseNames: [], warnings: ["Analog can read Strong and Hevy CSV exports. This file doesn't match either."] };
}
