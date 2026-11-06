// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { validProgram } from '@/engine/programs/share';
import type { AnalogDB, TableName } from './schema';

// What may enter the database from outside: a backup file, a sync snapshot, a shared link. These files can come from
// anyone, so a row that is the wrong shape is dropped rather than stored for a screen to trip over later. A field a
// file leaves out is fine (older backups do, and normalise() fills it in); a field that is present must make sense.

const MAX_TEXT = 100_000;
/** Far beyond any real time, weight or distance, and well inside what arithmetic can handle. */
const MAX_NUMBER = 1e15;

type Check = (v: unknown) => boolean;

const text: Check = (v) => typeof v === 'string' && v.length <= MAX_TEXT;
const num: Check = (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= MAX_NUMBER;
const bool: Check = (v) => typeof v === 'boolean';
const orNull = (c: Check): Check => (v) => v === null || c(v);
const texts: Check = (v) => Array.isArray(v) && v.length <= 1000 && v.every(text);
const obj: Check = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

const FIELDS: Partial<Record<TableName, Record<string, Check>>> = {
  exercises: { id: text, name: text, aliases: texts, primary: texts, secondary: texts, secondaryCredit: num, equipment: text, mode: text, unilateral: bool, incrementG: num, barG: orNull(num), defaultRestMs: num, repsMin: orNull(num), repsMax: orNull(num), notes: orNull(text), instructions: texts, source: text, hidden: bool },
  exerciseOverrides: { exerciseId: text, fields: obj, hidden: orNull(bool), stickyNote: orNull(text) },
  machineSettings: { exerciseId: text, gymId: text, text },
  gyms: { id: text, name: text, unit: text, barG: num, machineStepG: num, plates: Array.isArray, dumbbellsG: Array.isArray, kettlebellsG: Array.isArray, equipment: Array.isArray },
  workouts: { id: text, title: text, runId: orNull(text), programId: orNull(text), dayId: orNull(text), blockIndex: orNull(num), weekIndex: orNull(num), gymId: orNull(text), startedAt: num, endedAt: orNull(num), bodyweightG: orNull(num), notes: orNull(text), importKey: orNull(text) },
  workoutGroups: { id: text, workoutId: text, kind: text, restMs: num, transitionMs: num },
  workoutExercises: { id: text, workoutId: text, exerciseId: text, order: num, groupId: orNull(text), restMs: orNull(num), note: orNull(text), slotId: orNull(text), explanation: orNull(text), explanationDetail: orNull(text), skipped: bool },
  workoutSets: {
    id: text, workoutId: text, workoutExerciseId: text, exerciseId: text, order: num, type: text,
    weightG: orNull(num), reps: orNull(num), rir: orNull(num), rpe: orNull(num), partials: orNull(num), forced: orNull(num), tempo: orNull(text), side: orNull(text),
    timeMs: orNull(num), distanceM: orNull(num), band: orNull(text), restMs: orNull(num), pain: orNull(num), note: orNull(text), segments: Array.isArray, parentSetId: orNull(text),
    targetWeightG: orNull(num), targetReps: orNull(num), targetRepsMax: orNull(num), targetRir: orNull(num), targetTimeMs: orNull(num), completedAt: orNull(num),
  },
  feedback: { id: text, workoutId: text, runId: orNull(text), kind: text, createdAt: num },
  landmarks: { muscle: text, mev: num, mav: num, mrv: num, learnedFrom: texts },
  programs: { id: text, name: text, data: validProgram, createdAt: num, archived: bool },
  programRuns: { id: text, programId: text, program: validProgram, state: obj, startedAt: num, endedAt: orNull(num), active: bool },
  prs: { id: text, exerciseId: text, setId: text, workoutId: text, kind: text, value: num, previous: orNull(num), atWeightG: orNull(num), message: text, createdAt: num },
  measurements: { id: text, date: num, kind: text, value: num, note: orNull(text) },
  photos: { id: text, date: num, uri: text, note: orNull(text) },
};

/** Has its primary key, as a usable key, and every field it does have is the right kind of thing. */
export function validRow(d: AnalogDB, table: TableName, row: unknown): boolean {
  if (!obj(row)) return false;
  const r = row as Record<string, unknown>;
  const path = d.table(table).schema.primKey.keyPath;
  const keyParts = Array.isArray(path) ? path : [path as string];
  if (!keyParts.every((k) => typeof r[k] === 'string' && (r[k] as string).length > 0 && (r[k] as string).length <= 1000)) return false;
  if (r.updatedAt !== undefined && !num(r.updatedAt)) return false;
  const fields = FIELDS[table];
  if (!fields) return true;
  return Object.entries(fields).every(([k, check]) => r[k] === undefined || check(r[k]));
}
