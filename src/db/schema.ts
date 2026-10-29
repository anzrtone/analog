// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
/**
 * Local-first storage: IndexedDB via Dexie, inside the Tauri and Capacitor WebViews.
 * No servers, no accounts. The user owns every byte (see backup.ts for export and import).
 *
 * The tables and fields mirror Analog 0.1.0's SQLite schema one for one, so a 0.1.0 backup restores row for row
 * and a 0.2.0 backup has the same shape. Ids are string UUIDs, weights integer grams (`weightG`), times epoch ms.
 *
 * IndexedDB never indexes null, so an index on a nullable field only holds the rows where it is set. That is
 * used on purpose: `[exerciseId+completedAt]` holds only ticked sets, and `open` only unfinished workouts.
 */
import Dexie, { type Table } from 'dexie';
import type { PlateStock } from '@/engine/math/plates';
import type { Program, RunState, GroupDef } from '@/engine/programs/types';
import type { SetType } from '@/engine/setTypes';
import type { Equipment, LoggingMode, Muscle, Segment, Side } from '@/engine/types';

export interface ExerciseRow {
  id: string;
  name: string;
  aliases: string[];
  primary: Muscle[];
  secondary: Muscle[];
  secondaryCredit: number;
  equipment: Equipment;
  mode: LoggingMode;
  unilateral: boolean;
  incrementG: number;
  barG: number | null;
  defaultRestMs: number;
  repsMin: number | null;
  repsMax: number | null;
  link: string | null;
  notes: string | null;
  instructions: string[];
  image: string | null;
  category: string | null;
  /** 'seed' rows come from free-exercise-db and are refreshed on library updates; edits live in exerciseOverrides. */
  source: 'seed' | 'custom';
  hidden: boolean;
  createdAt: number;
  updatedAt: number;
}

/** User edits to built-in exercises. Library updates never touch this table. */
export interface ExerciseOverrideRow {
  exerciseId: string;
  fields: Partial<ExerciseRow>;
  hidden: boolean | null;
  stickyNote: string | null;
  updatedAt: number;
}

export interface MachineSettingRow {
  exerciseId: string;
  gymId: string;
  text: string;
  updatedAt: number;
}

export interface GymRow {
  id: string;
  name: string;
  unit: 'kg' | 'lb';
  barG: number;
  plates: PlateStock[];
  dumbbellsG: number[];
  kettlebellsG: number[];
  machineStepG: number;
  equipment: Equipment[];
  isDefault: boolean;
  createdAt: number;
}

export interface WorkoutRow {
  id: string;
  title: string;
  runId: string | null;
  programId: string | null;
  dayId: string | null;
  blockIndex: number | null;
  weekIndex: number | null;
  gymId: string | null;
  startedAt: number;
  endedAt: number | null;
  bodyweightG: number | null;
  sessionRpe: number | null;
  sleep: number | null;
  stress: number | null;
  notes: string | null;
  /** Where the import came from, so re-importing the same file doesn't duplicate. */
  importKey: string | null;
  healthConnectId: string | null;
  /** 1 while the workout is open; removed on finish. Only an index helper: never exported. */
  open?: 1;
}

export interface WorkoutGroupRow {
  id: string;
  workoutId: string;
  kind: GroupDef['kind'];
  restMs: number;
  transitionMs: number;
}

export interface WorkoutExerciseRow {
  id: string;
  workoutId: string;
  exerciseId: string;
  order: number;
  groupId: string | null;
  restMs: number | null;
  note: string | null;
  slotId: string | null;
  /** Engine margin note shown under the exercise title. */
  explanation: string | null;
  explanationDetail: string | null;
  skipped: boolean;
}

export interface WorkoutSetRow {
  id: string;
  workoutId: string;
  workoutExerciseId: string;
  exerciseId: string;
  order: number;
  type: SetType;
  weightG: number | null;
  reps: number | null;
  rir: number | null;
  rpe: number | null;
  partials: number | null;
  forced: number | null;
  tempo: string | null;
  side: Side | null;
  timeMs: number | null;
  distanceM: number | null;
  band: string | null;
  restMs: number | null;
  pain: number | null;
  note: string | null;
  segments: Segment[];
  parentSetId: string | null;
  targetWeightG: number | null;
  targetReps: number | null;
  targetRepsMax: number | null;
  targetRir: number | null;
  targetTimeMs: number | null;
  completedAt: number | null;
}

export interface FeedbackRow {
  id: string;
  workoutId: string;
  runId: string | null;
  muscle: Muscle | null;
  exerciseId: string | null;
  slotId: string | null;
  kind: 'pump' | 'pain' | 'workload' | 'soreness';
  value: string;
  createdAt: number;
}

export interface LandmarkRow {
  muscle: Muscle;
  mev: number;
  mav: number;
  mrv: number;
  learnedFrom: string[];
  updatedAt: number;
}

export interface ProgramRow {
  id: string;
  name: string;
  data: Program;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
}

export interface RunRow {
  id: string;
  programId: string;
  /** Snapshot of the program when started, so later edits don't rewrite history. */
  program: Program;
  state: RunState;
  startedAt: number;
  endedAt: number | null;
  active: boolean;
}

export interface PrRow {
  id: string;
  exerciseId: string;
  setId: string;
  workoutId: string;
  kind: 'weight' | 'reps' | 'e1rm' | 'volume' | 'hold';
  value: number;
  previous: number | null;
  atWeightG: number | null;
  side: Side | null;
  message: string;
  createdAt: number;
}

export interface MeasurementRow {
  id: string;
  date: number;
  kind: string;
  value: number;
  note: string | null;
}

export interface PhotoRow {
  id: string;
  date: number;
  uri: string;
  note: string | null;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

export class AnalogDB extends Dexie {
  exercises!: Table<ExerciseRow, string>;
  exerciseOverrides!: Table<ExerciseOverrideRow, string>;
  machineSettings!: Table<MachineSettingRow, [string, string]>;
  gyms!: Table<GymRow, string>;
  workouts!: Table<WorkoutRow, string>;
  workoutGroups!: Table<WorkoutGroupRow, string>;
  workoutExercises!: Table<WorkoutExerciseRow, string>;
  workoutSets!: Table<WorkoutSetRow, string>;
  feedback!: Table<FeedbackRow, string>;
  landmarks!: Table<LandmarkRow, string>;
  programs!: Table<ProgramRow, string>;
  programRuns!: Table<RunRow, string>;
  prs!: Table<PrRow, string>;
  measurements!: Table<MeasurementRow, string>;
  photos!: Table<PhotoRow, string>;
  settings!: Table<SettingRow, string>;

  constructor(name = 'analog') {
    super(name);
    // Schema changes are additive only: add a version, never drop or rename a field in a release.
    this.version(1).stores({
      exercises: 'id, name, source',
      exerciseOverrides: 'exerciseId',
      machineSettings: '[exerciseId+gymId]',
      gyms: 'id',
      // startedAt: history paging; open: the unfinished workout; runId: a program run's sessions.
      workouts: 'id, startedAt, open, runId, importKey',
      workoutGroups: 'id, workoutId',
      workoutExercises: 'id, workoutId',
      // [exerciseId+completedAt]: previous performance, PRs and history per exercise (ticked sets only).
      // completedAt: date ranges, such as this week's sets per muscle.
      workoutSets: 'id, workoutId, workoutExerciseId, [exerciseId+completedAt], completedAt',
      feedback: 'id, workoutId, [runId+createdAt]',
      landmarks: 'muscle',
      programs: 'id, updatedAt',
      programRuns: 'id, programId, startedAt',
      prs: 'id, exerciseId, workoutId, createdAt',
      measurements: 'id, [kind+date]',
      photos: 'id, date',
      settings: 'key',
    });
  }
}

/** Every table, in backup order. The names are the 0.1.0 backup's section names. */
export const TABLE_NAMES = [
  'exercises',
  'exerciseOverrides',
  'machineSettings',
  'gyms',
  'workouts',
  'workoutGroups',
  'workoutExercises',
  'workoutSets',
  'feedback',
  'landmarks',
  'programs',
  'programRuns',
  'prs',
  'measurements',
  'photos',
  'settings',
] as const;
export type TableName = (typeof TABLE_NAMES)[number];

export const tables = (d: AnalogDB) => TABLE_NAMES.map((n) => d.table(n));

/** The user's own database. Opened lazily by Dexie on first use. */
export const db = new AnalogDB();

/** Ask the WebView not to evict IndexedDB under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* not supported in this WebView */
  }
  return false;
}

let gen: () => string = () => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // RFC 4122 v4 from Math.random: fine for ids that never leave the device.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
};

export function newId(): string {
  return gen();
}

export function setIdGenerator(f: () => string): void {
  gen = f;
}
