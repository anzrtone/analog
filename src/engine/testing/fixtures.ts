import type { SetType } from '../setTypes';
import type { ExerciseInfo, LoggedSet } from '../types';

let n = 0;

export function makeSet(over: Partial<LoggedSet> = {}): LoggedSet {
  n += 1;
  return {
    id: `s${n}`,
    workoutId: 'w1',
    exerciseId: 'bench',
    type: 'working' as SetType,
    order: n,
    weightG: 100000,
    reps: 5,
    rir: 2,
    rpe: null,
    partials: null,
    forced: null,
    timeMs: null,
    distanceM: null,
    side: null,
    segments: [],
    completedAt: Date.UTC(2026, 9, 28, 12),
    ...over,
  };
}

export function makeExercise(over: Partial<ExerciseInfo> = {}): ExerciseInfo {
  return {
    id: 'bench',
    name: 'Bench press',
    primary: ['chest'],
    secondary: ['triceps', 'frontDelts'],
    secondaryCredit: 0.5,
    equipment: 'barbell',
    mode: 'weightReps',
    unilateral: false,
    incrementG: 2500,
    defaultRestMs: 180000,
    ...over,
  };
}
