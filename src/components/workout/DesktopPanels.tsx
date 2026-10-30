// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useEffect, useState } from 'react';
import { Keyboard, Pencil, Plus, X } from 'lucide-react';
import type { Exercise } from '@/db/exercises';
import { patchSettings, useSettings } from '@/db/settings';
import type { FullWorkout, WorkoutSet } from '@/db/workouts';
import { readDb } from '@/db/shown';
import { formatClock, formatSet, formatWeight } from '@/engine/math/units';
import { loadBarbell, loadDipBelt, type GymProfile } from '@/engine/math/plates';
import { setTypeInfo } from '@/engine/setTypes';
import { useData } from '@/features/data';
import { currentGym } from '@/features/gym';
import { rest } from '@/features/workout/timers';
import { BarDiagram } from '../Charts';
import { PlateRing } from '../PlateRing';
import { RestTimer } from '../RestTimer';
import { cx, MarginNote } from '../ui';

/** Left page edge: the session at a glance. Click an exercise to jump to its next set. */
export function WorkoutOutline({ full, infos, labels, focusId, onJump, onAdd }: { full: FullWorkout; infos: Map<string, Exercise>; labels: (string | null)[]; focusId: string | null; onJump: (setId: string) => void; onAdd: () => void }) {
  const total = full.exercises.reduce((a, e) => a + e.sets.length, 0);
  const done = full.exercises.reduce((a, e) => a + e.sets.filter((s) => s.completedAt != null).length, 0);
  return (
    <aside className="sticky top-0 hidden h-full max-h-screen w-[264px] shrink-0 overflow-y-auto border-r border-rule bg-paper p-4 outline:block">
      <p className="t-meta px-2 pt-5 text-pencil">THIS SESSION</p>
      <div className="flex flex-col gap-1.5 px-2 pb-2.5">
        <p className="t-num-l">
          {done}
          <span className="t-num-m text-pencil">{` / ${total} sets`}</span>
        </p>
        <div className="h-1 overflow-hidden rounded-sm bg-sunk">
          <div className="h-full bg-ink transition-[width] duration-300" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
      </div>
      {full.exercises.map((e, i) => {
        const ex = infos.get(e.exerciseId);
        const d = e.sets.filter((s) => s.completedAt != null).length;
        const next = e.sets.find((s) => s.completedAt == null) ?? e.sets[e.sets.length - 1];
        const active = e.sets.some((s) => s.id === focusId);
        const complete = e.sets.length > 0 && d === e.sets.length;
        return (
          <button key={e.id} type="button" onClick={() => next && onJump(next.id)} aria-label={`${ex?.name}: ${d} of ${e.sets.length} sets done`} className={cx('flex w-full items-center gap-2.5 rounded-control p-2 text-left hover:bg-sunk', active && 'bg-raised', e.skipped && 'opacity-50')}>
            <span className="t-meta w-[22px] text-center">{labels[i] ? <span className="text-blue-text">{labels[i]}</span> : <span className="text-pencil">{String(i + 1).padStart(2, '0')}</span>}</span>
            <span className={cx('t-label line-clamp-2 flex-1 text-[14px]', active ? 'text-ink' : 'text-ink2')}>{ex?.name ?? 'Exercise'}</span>
            <PlateRing color="ink" state={complete ? 'done' : d > 0 ? 'progress' : 'pending'} progress={e.sets.length ? d / e.sets.length : 0} letter={complete ? '✓' : `${d}`} size={24} label={`${d} of ${e.sets.length}`} />
          </button>
        );
      })}
      <button type="button" onClick={onAdd} aria-label="Add exercise" className="mt-1.5 flex w-full items-center gap-2.5 rounded-control border border-dashed border-rule p-2.5 text-pencil hover:bg-sunk">
        <Plus size={16} />
        <span className="t-label flex-1 text-left">Add exercise</span>
        <span className="t-meta">SHIFT E</span>
      </button>
    </aside>
  );
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="t-display block text-[40px] leading-[44px]">{formatClock(now - since)}</span>;
}

const SHORTCUTS: [string, string][] = [
  ['Enter', 'tick the set'],
  ['↑ ↓', 'move between sets'],
  ['← →', 'weight − / +'],
  ['[ ]', 'reps − / +'],
  ['W R E', 'type weight, reps, effort'],
  ['T', 'set type'],
  ['A', 'add a set'],
  ['Shift E', 'add exercise'],
  ['S', 'skip rest'],
  ['− =', 'rest −15 / +15 s'],
  ['Ctrl Enter', 'finish workout'],
];

/** Right margin: time, rest, the focused set's plates and the engine's reasoning, like notes beside the page. */
export function WorkoutMargin({ startedAt, onClock, focus, exercise, explanation, onExplain, onFinish, onAdd }: { startedAt: number; onClock: () => void; focus: WorkoutSet | null; exercise: Exercise | undefined; explanation: string | null; onExplain: () => void; onFinish: () => void; onAdd: () => void }) {
  const unit = useSettings().unit;
  const resting = rest.use((r) => r.rest);
  const [keys, setKeys] = useState(true);
  const gym = useData<GymProfile | null>(() => currentGym(readDb()), [], null);
  const w = focus ? (focus.weightG ?? focus.targetWeightG) : null;
  const barbell = exercise && (exercise.equipment === 'barbell' || exercise.equipment === 'ezBar' || exercise.equipment === 'smith');
  const belt = exercise?.equipment === 'dipBelt';
  const load = gym && w ? (barbell ? loadBarbell(w, gym.barG, gym.plates, 'nearest', unit) : belt ? loadDipBelt(w, gym.plates, 'nearest', unit) : null) : null;
  const info = focus ? setTypeInfo(focus.type) : null;

  return (
    <aside className="sticky top-0 flex h-full max-h-screen w-[300px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-rule bg-sunk p-5">
      <button type="button" onClick={onClock} aria-label="Workout duration. Adjust the workout's start or end time" className="-mx-2 mt-2 rounded-control px-2 pb-1 pt-2 text-left hover:bg-paper">
        <span className="flex items-center gap-1.5">
          <span className="t-meta text-pencil">ELAPSED</span>
          <Pencil size={12} strokeWidth={1.75} className="text-pencil" />
        </span>
        <Elapsed since={startedAt} />
      </button>

      {resting ? (
        <RestTimer variant="panel" />
      ) : (
        <RestHint />
      )}

      {focus && exercise ? (
        <div className="flex flex-col gap-2">
          <span className="t-meta text-pencil">{`UP NEXT · ${info?.label.toUpperCase()}`}</span>
          <span className="t-title-m">{exercise.name}</span>
          <span className="t-num-l">{info?.timed ? formatClock(focus.timeMs ?? focus.targetTimeMs ?? 0) : formatSet(w, focus.reps ?? focus.targetReps, unit)}</span>
          {load ? (
            <div>
              <PlateLoad exercise={exercise} set={focus} scale={0.8} />
            </div>
          ) : w && exercise.equipment !== 'bodyweight' ? (
            <p className="t-hint">{`${formatWeight(w, unit)} ${unit} on the ${exercise.equipment}`}</p>
          ) : null}
          {explanation ? <MarginNote onClick={onExplain}>{explanation}</MarginNote> : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <button type="button" className="btn-secondary" onClick={onAdd} aria-label="Add exercise (Shift E)" data-tour="workout-add-exercise">
          <Plus size={18} strokeWidth={1.75} /> Add exercise
        </button>
        <button type="button" className="btn-primary" onClick={onFinish} aria-label="Finish workout (Ctrl Enter)" data-tour="workout-finish">
          Finish workout
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <button type="button" onClick={() => setKeys(!keys)} className="flex items-center gap-2 text-pencil">
          <Keyboard size={16} />
          <span className="t-meta">{keys ? 'KEYBOARD · HIDE' : 'KEYBOARD · SHOW'}</span>
        </button>
        {keys
          ? SHORTCUTS.map(([k, what]) => (
              <div key={k} className="flex items-center gap-2.5">
                <span className="min-w-[76px]">
                  <kbd className="t-num-m rounded border border-rule px-1.5 py-px text-[12px]">{k}</kbd>
                </span>
                <span className="t-hint text-ink2">{what}</span>
              </div>
            ))
          : null}
      </div>
    </aside>
  );
}

/** A one-time hint about the rest timer. The X closes it for good. */
function RestHint() {
  const dismissed = useSettings().hintsDismissed;
  if (dismissed.includes('rest')) return null;
  return (
    <div className="relative flex flex-col gap-1 rounded-sheet border-[1.5px] border-dashed border-rule p-4 pr-12">
      <span className="t-meta text-pencil">REST</span>
      <span className="text-ink2">Starts when you tick a set. Supersets rest after the last exercise of the round.</span>
      <button type="button" aria-label="Close this hint for good" className="absolute right-1 top-1 inline-flex h-touch w-touch items-center justify-center rounded-control text-pencil hover:bg-paper" onClick={() => void patchSettings({ hintsDismissed: [...dismissed, 'rest'] })}>
        <X size={18} strokeWidth={1.75} />
      </button>
    </div>
  );
}

/** The bar with its plates for one set, and the per-side sum. Used in the desktop margin and under each lift on the phone. */
export function PlateLoad({ exercise, set, scale = 0.8, compact }: { exercise: Exercise; set: WorkoutSet; scale?: number; compact?: boolean }) {
  const unit = useSettings().unit;
  const gym = useData<GymProfile | null>(() => currentGym(readDb()), [], null);
  const w = set.weightG ?? set.targetWeightG;
  const barbell = exercise.equipment === 'barbell' || exercise.equipment === 'ezBar' || exercise.equipment === 'smith';
  const belt = exercise.equipment === 'dipBelt';
  const load = gym && w ? (barbell ? loadBarbell(w, gym.barG, gym.plates, 'nearest', unit) : belt ? loadDipBelt(w, gym.plates, 'nearest', unit) : null) : null;
  if (!load) return null;
  return (
    <div className={cx(compact && 'flex items-center gap-3')}>
      {belt ? null : <div className={cx(compact && 'w-[140px] shrink-0')}><BarDiagram perSide={load.perSide} scale={scale} /></div>}
      <p className="t-hint text-ink2">{load.explanation}</p>
    </div>
  );
}
