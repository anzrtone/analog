// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useMemo, useState } from 'react';
import { getExercise, listExercises, searchExercises, toInfo, type Exercise } from '@/db/exercises';
import { editDb } from '@/db/shown';
import { swapExercise } from '@/db/workouts';
import { rankSubstitutes } from '@/engine/exercises/substitutes';
import { MUSCLE_LABEL, MUSCLES, type Muscle } from '@/engine/types';
import { useData } from '@/features/data';
import { back, navigate } from '@/features/nav';
import { picker } from '@/features/picker';
import { addExerciseToWorkout } from '@/features/workout/actions';
import { Chip, MarginNote, Pad, RuledRow, Screen } from '@/components/ui';

/** Rows drawn at once; the rest come in as the list scrolls ("Show more"), so 876 exercises open instantly. */
const PAGE = 120;

/** The library. Also the picker (`pick`: a workout), the swap list (`swap` + `target`) and the builder's picker (`picker`). */
export function ExercisesScreen({ pick, swap, target, picker: pickerToken }: { pick?: string; swap?: string; target?: string; picker?: string }) {
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<Muscle | 'all'>('all');
  const [showStretches, setShowStretches] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const all = useData((d) => listExercises(d), [], [] as Exercise[]);
  const targetEx = useData((d) => (target ? getExercise(d, target) : Promise.resolve(null)), [target], null);

  const ranked = useMemo(() => (targetEx ? rankSubstitutes(toInfo(targetEx), all.map(toInfo), 12) : []), [targetEx, all]);
  const list = useMemo(() => {
    let l = all;
    if (!showStretches && !q) l = l.filter((e) => e.category !== 'stretching');
    if (muscle !== 'all') l = l.filter((e) => e.primary.includes(muscle));
    return searchExercises(l, q);
  }, [all, q, muscle, showStretches]);

  const choose = (e: Exercise) => {
    if (pick) {
      void addExerciseToWorkout(pick, e.id);
      back();
    } else if (swap) {
      void swapExercise(editDb(), swap, e.id);
      back();
    } else if (pickerToken) {
      picker.pick(pickerToken, e.id);
      back();
    } else navigate({ name: 'exercise', id: e.id });
  };

  const title = pick ? 'Add exercise' : swap ? 'Swap exercise' : 'Exercises';
  return (
    <Screen
      title={title}
      backButton
      meta={`${all.length} EXERCISES · UNLIMITED CUSTOM`}
      right={
        <button type="button" className="btn-secondary btn-compact mb-1" onClick={() => navigate({ name: 'exerciseEdit' })}>
          New
        </button>
      }
    >
      <Pad className="flex flex-col gap-3 pb-3">
        <input
          className="field"
          type="search"
          placeholder="Search: bench, curl, plank…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setShown(PAGE);
          }}
          autoCorrect="off"
          aria-label="Search exercises"
          autoFocus={!!pick}
        />
        {/* Bleeds to the page edge like the ruled rows, so a cut-off chip reads as "scrolls". */}
        <div className="no-scrollbar -mx-margin flex gap-2 overflow-x-auto px-margin py-[3px]" role="radiogroup" aria-label="Muscle">
          {(['all', ...MUSCLES] as (Muscle | 'all')[]).map((m) => (
            <Chip key={m} label={m === 'all' ? 'All' : MUSCLE_LABEL[m]} on={m === muscle} onClick={() => setMuscle(m)} />
          ))}
        </div>
      </Pad>
      {ranked.length && !q ? (
        <div>
          <p className="t-meta px-margin pt-2 text-pencil">BEST SWAPS</p>
          {ranked.map((r) => (
            <RuledRow key={r.exercise.id} onClick={() => choose(all.find((e) => e.id === r.exercise.id)!)} label={`${r.exercise.name}, ${r.reason}`}>
              <span className="flex-1">
                <span className="block">{r.exercise.name}</span>
                <MarginNote>{r.reason}</MarginNote>
              </span>
            </RuledRow>
          ))}
          <p className="t-meta px-margin pt-4 text-pencil">EVERYTHING</p>
        </div>
      ) : null}
      {list.slice(0, shown).map((e) => (
        <RuledRow key={e.id} onClick={() => choose(e)} label={e.name}>
          <span className="min-w-0 flex-1">
            <span className="block truncate">{e.name}</span>
            <span className="t-hint block truncate">
              {e.primary.map((m) => MUSCLE_LABEL[m]).join(', ') || e.notes || e.equipment}
              {e.source === 'custom' ? ' · custom' : e.edited ? ' · edited' : ''}
            </span>
          </span>
        </RuledRow>
      ))}
      {list.length === 0 && all.length ? <p className="px-margin py-6 text-ink2">Nothing matches “{q}”. Try fewer words, or add it as your own exercise.</p> : null}
      <Pad className="flex flex-col gap-2 py-4">
        {list.length > shown ? (
          <button type="button" className="btn-secondary" onClick={() => setShown(shown + PAGE * 4)}>
            {`Show more (${list.length - shown} left)`}
          </button>
        ) : null}
        <button type="button" className="btn-ghost" onClick={() => setShowStretches(!showStretches)}>
          {showStretches ? 'Hide stretches' : 'Show stretches and mobility'}
        </button>
      </Pad>
    </Screen>
  );
}
