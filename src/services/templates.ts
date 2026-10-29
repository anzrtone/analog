// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { newId } from '@/db/schema';
import { defaultParams, type RuleParams } from '@/engine/progression';
import type { Day, Program, ProgramSet, Slot } from '@/engine/programs/types';
import { DEFAULT_MESO } from '@/engine/programs/types';
import type { SetType } from '@/engine/setTypes';

// Generic, unbranded starter programs (SPEC §4). Training methods only: no paid program's content or names.

const sets = (n: number, reps: number, repsMax: number | null, rir: number | null, type: SetType = 'working'): ProgramSet[] =>
  Array.from({ length: n }, () => ({ type, reps, repsMax, rir, pct: null, timeMs: null }));

const slot = (exerciseId: string, s: ProgramSet[], rule: RuleParams, restMs: number | null = null, groupId: string | null = null): Slot => ({ id: newId(), exerciseId, groupId, sets: s, rule, restMs, note: null });

const day = (name: string, slots: Slot[]): Day => ({ id: newId(), name, weekday: null, slots });

export interface Template {
  key: string;
  name: string;
  blurb: string;
  build: () => Program;
}

export const TEMPLATES: Template[] = [
  {
    key: 'fullbody-3-linear',
    name: 'Full-body 3-day beginner linear',
    blurb: 'Three sessions a week, the same big lifts each time. Add weight every session you hit all your reps.',
    build: () => {
      const lin = (reps = 5) => ({ ...defaultParams('linear'), reps }) as RuleParams;
      const a = day('Day A', [
        slot('Barbell_Squat', sets(3, 5, null, 2), lin(), 180000),
        slot('Barbell_Bench_Press_-_Medium_Grip', sets(3, 5, null, 2), lin(), 180000),
        slot('Bent_Over_Barbell_Row', sets(3, 8, null, 2), lin(8), 120000),
        slot('Plank', [{ type: 'amtap', reps: null, repsMax: null, rir: null, pct: null, timeMs: 30000 }], defaultParams('time'), 60000),
      ]);
      const b = day('Day B', [
        slot('Barbell_Squat', sets(3, 5, null, 2), lin(), 180000),
        slot('Standing_Military_Press', sets(3, 5, null, 2), lin(), 180000),
        slot('Barbell_Deadlift', sets(1, 5, null, 2), { ...defaultParams('linear'), sets: 1, reps: 5 } as RuleParams, 180000),
        slot('Pullups', sets(3, 6, 10, 2), defaultParams('double'), 120000),
      ]);
      return { id: newId(), name: 'Full-body 3-day beginner linear', notes: 'Alternate A and B. Start lighter than you think.', schedule: 'rotation', groups: {}, meso: DEFAULT_MESO, blocks: [{ id: newId(), name: 'Linear block', goal: 'strength', weeks: 12, deloadWeek: false, adaptive: false, overrides: {}, days: [a, b] }] };
    },
  },
  {
    key: 'upper-lower-4-adaptive',
    name: 'Upper/Lower 4-day hypertrophy',
    blurb: 'A 4-week mesocycle plus a deload. Reps in reserve walk down each week and sets per muscle adapt to your feedback.',
    build: () => {
      const m = defaultParams('meso');
      const g1 = newId();
      const upperA = day('Upper A', [
        slot('Barbell_Bench_Press_-_Medium_Grip', sets(3, 6, 10, 3), { type: 'meso', repsMin: 6, repsMax: 10 }, 150000),
        slot('Seated_Cable_Rows', sets(3, 8, 12, 3), m, 120000),
        slot('Seated_Dumbbell_Press', sets(2, 8, 12, 3), m, 120000),
        slot('Barbell_Curl', sets(2, 10, 15, 3), { type: 'meso', repsMin: 10, repsMax: 15 }, 75000, g1),
        slot('Triceps_Pushdown', sets(2, 10, 15, 3), { type: 'meso', repsMin: 10, repsMax: 15 }, 75000, g1),
      ]);
      const lowerA = day('Lower A', [
        slot('Barbell_Squat', sets(3, 6, 10, 3), { type: 'meso', repsMin: 6, repsMax: 10 }, 180000),
        slot('Romanian_Deadlift', sets(2, 8, 12, 3), m, 150000),
        slot('Leg_Extensions', sets(2, 10, 15, 3), { type: 'meso', repsMin: 10, repsMax: 15 }, 90000),
        slot('Standing_Calf_Raises', sets(3, 10, 15, 3), { type: 'meso', repsMin: 10, repsMax: 15 }, 60000),
      ]);
      const g2 = newId();
      const upperB = day('Upper B', [
        slot('Incline_Dumbbell_Press', sets(3, 8, 12, 3), m, 120000),
        slot('Wide-Grip_Lat_Pulldown', sets(3, 8, 12, 3), m, 120000),
        slot('Side_Lateral_Raise', sets(3, 12, 20, 3), { type: 'meso', repsMin: 12, repsMax: 20 }, 60000),
        slot('Face_Pull', sets(2, 12, 20, 3), { type: 'meso', repsMin: 12, repsMax: 20 }, 60000),
        slot('Hammer_Curls', sets(2, 10, 15, 3), { type: 'meso', repsMin: 10, repsMax: 15 }, 75000, g2),
        slot('EZ-Bar_Skullcrusher', sets(2, 10, 15, 3), { type: 'meso', repsMin: 10, repsMax: 15 }, 75000, g2),
      ]);
      const lowerB = day('Lower B', [
        slot('Leg_Press', sets(3, 8, 12, 3), m, 150000),
        slot('Seated_Leg_Curl', sets(3, 10, 15, 3), { type: 'meso', repsMin: 10, repsMax: 15 }, 90000),
        slot('Barbell_Hip_Thrust', sets(2, 8, 12, 3), m, 120000),
        slot('Hanging_Leg_Raise', sets(2, 10, 15, 3), { type: 'meso', repsMin: 10, repsMax: 15 }, 60000),
      ]);
      return {
        id: newId(),
        name: 'Upper/Lower 4-day hypertrophy',
        notes: 'Answer the quick pump, joint and workload questions after each session: they decide next week’s sets.',
        schedule: 'rotation',
        groups: { [g1]: { kind: 'superset', restMs: 90000, transitionMs: 0 }, [g2]: { kind: 'superset', restMs: 90000, transitionMs: 0 } },
        meso: DEFAULT_MESO,
        blocks: [{ id: newId(), name: 'Mesocycle 1', goal: 'hypertrophy', weeks: 4, deloadWeek: true, adaptive: true, overrides: {}, days: [upperA, lowerA, upperB, lowerB] }],
      };
    },
  },
  {
    key: 'powerbuilding-topset',
    name: 'Top set + back-off powerbuilding',
    blurb: 'One heavy top set worked out from your estimated max, then lighter back-offs. Accessories use double progression.',
    build: () => {
      const tb = defaultParams('topBackoff');
      const top = (): ProgramSet[] => [{ type: 'top', reps: 5, repsMax: null, rir: 1, pct: null, timeMs: null }, ...sets(3, 8, null, 2, 'backoff')];
      const dbl = defaultParams('double');
      return {
        id: newId(),
        name: 'Top set + back-off powerbuilding',
        notes: '',
        schedule: 'rotation',
        groups: {},
        meso: DEFAULT_MESO,
        blocks: [
          {
            id: newId(),
            name: 'Block 1',
            goal: 'strength',
            weeks: 5,
            deloadWeek: true,
            adaptive: false,
            overrides: {},
            days: [
              day('Squat day', [slot('Barbell_Squat', top(), tb, 180000), slot('Romanian_Deadlift', sets(3, 8, 12, 2), dbl, 120000), slot('Leg_Extensions', sets(3, 10, 15, 2), dbl, 90000)]),
              day('Bench day', [slot('Barbell_Bench_Press_-_Medium_Grip', top(), tb, 180000), slot('One-Arm_Dumbbell_Row', sets(3, 8, 12, 2), dbl, 90000), slot('Side_Lateral_Raise', sets(3, 12, 20, 2), dbl, 60000)]),
              day('Deadlift day', [slot('Barbell_Deadlift', top(), tb, 180000), slot('Leg_Press', sets(3, 8, 12, 2), dbl, 120000), slot('Hanging_Leg_Raise', sets(3, 10, 15, 2), dbl, 60000)]),
              day('Press day', [slot('Standing_Military_Press', top(), tb, 180000), slot('Pullups', sets(3, 6, 10, 2), dbl, 120000), slot('Dumbbell_Bicep_Curl', sets(3, 10, 15, 2), dbl, 60000)]),
            ],
          },
        ],
      };
    },
  },
];

/** Used by the builder for a new program. */
export function blankProgram(name = 'New program'): Program {
  return { id: newId(), name, notes: '', schedule: 'rotation', groups: {}, meso: DEFAULT_MESO, blocks: [{ id: newId(), name: 'Block 1', goal: 'general', weeks: 4, deloadWeek: true, adaptive: false, overrides: {}, days: [day('Day 1', [])] }] };
}
