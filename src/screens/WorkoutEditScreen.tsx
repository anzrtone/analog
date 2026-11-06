// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { getExercises, type Exercise } from '@/db/exercises';
import { db } from '@/db/schema';
import { useSettings } from '@/db/settings';
import { addSet, completeSet, getWorkout, removeExercise, uncompleteSet, updateWorkout, type FullWorkout, type WorkoutSet } from '@/db/workouts';
import { setTypeInfo } from '@/engine/setTypes';
import { groupLabels } from '@/engine/timer/rest';
import { formatTimeOfDay, resolveSpan } from '@/engine/timer/session';
import { useData } from '@/features/data';
import { navigate } from '@/features/nav';
import { useWide } from '@/features/responsive';
import { finishEditingWorkout } from '@/features/workout/actions';
import { ask } from '@/components/Dialog';
import { SetColumns, SetRow, type SetField } from '@/components/SetRow';
import { cx, Field, MarginNote, Pad, RuledRow, Screen, Section, Sheet } from '@/components/ui';
import { SetDetailSheet, SetFieldSheet, SetTypeSheet } from '@/components/workout/SetSheets';

/** Name and note, kept as typed and saved when the field is left. An empty name goes back to what it was. */
function NameFields({ id, title, notes }: { id: string; title: string; notes: string | null }) {
  const [name, setName] = useState(title);
  const [note, setNote] = useState(notes ?? '');
  return (
    <Pad className="flex flex-col gap-3 pb-2">
      <Field
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const t = name.trim();
          if (!t) return setName(title);
          if (t !== title) void updateWorkout(db, id, { title: t });
        }}
      />
      <Field label="Note" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => void updateWorkout(db, id, { notes: note.trim() || null })} />
    </Pad>
  );
}

/** "From 6:30 pm to 7:45 pm" for a workout that's over. The day stays the same. */
function TimesSheet({ workout, onClose }: { workout: FullWorkout['workout']; onClose: () => void }) {
  const clock = useSettings().clock;
  const [from, setFrom] = useState(formatTimeOfDay(workout.startedAt, clock));
  const [to, setTo] = useState(workout.endedAt ? formatTimeOfDay(workout.endedAt, clock) : '');
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    if (!to.trim()) return setError('Add an end time.');
    const r = resolveSpan(from, to, workout.startedAt, Date.now(), clock);
    if (!r.ok) return setError(r.error);
    void updateWorkout(db, workout.id, { startedAt: r.startedAt, endedAt: r.endedAt });
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Workout time">
      <form
        className="flex flex-col gap-3 px-margin pb-2 pt-2 wide:px-6"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex gap-2">
          <div className="flex-1">
            <Field label="From" value={from} autoCapitalize="none" autoCorrect="off" onChange={(e) => (setFrom(e.target.value), setError(null))} />
          </div>
          <div className="flex-1">
            <Field label="To" value={to} autoCapitalize="none" autoCorrect="off" onChange={(e) => (setTo(e.target.value), setError(null))} />
          </div>
        </div>
        {error ? (
          <p className="t-label text-red-text" aria-live="polite">
            {error}
          </p>
        ) : (
          <p className="t-hint">The day stays the same.</p>
        )}
        <button type="submit" className="btn-primary">
          Save times
        </button>
      </form>
    </Sheet>
  );
}

/**
 * A finished workout, opened for changes: rename it, fix any set, add or take away sets and exercises. Every change
 * is written as it's made, like in the logger. Done tidies up (unticked sets go), redoes the PR stamps and backs up.
 */
export function WorkoutEditScreen({ id }: { id: string }) {
  const s = useSettings();
  const wide = useWide();
  const full = useData((d) => getWorkout(d, id), [id], undefined as FullWorkout | null | undefined);
  const exerciseIds = full?.exercises.map((e) => e.exerciseId).join() ?? '';
  const infos = useData((d) => getExercises(d, exerciseIds ? exerciseIds.split(',') : []), [exerciseIds], new Map<string, Exercise>());
  const [edit, setEdit] = useState<{ set: WorkoutSet; field: SetField } | null>(null);
  const [typeFor, setTypeFor] = useState<WorkoutSet | null>(null);
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const [timesOpen, setTimesOpen] = useState(false);
  const labels = useMemo(() => groupLabels(full?.exercises ?? []), [full]);

  if (full === undefined) return <div className="min-h-full" />;
  if (!full) {
    return (
      <Screen title="Workout" backButton>
        <Pad>
          <p>This workout isn’t here any more.</p>
        </Pad>
      </Screen>
    );
  }
  const w = full.workout;
  // New and re-ticked sets are dated inside the workout, so "last time" and PRs keep their order in history.
  const stamp = w.endedAt ?? Date.now();
  const detailSet = detailFor ? full.exercises.flatMap((x) => x.sets).find((x) => x.id === detailFor) : undefined;
  const unticked = full.exercises.reduce((a, e) => a + e.sets.filter((x) => x.completedAt == null).length, 0);

  const toggle = (set: WorkoutSet) => {
    if (set.completedAt != null) return void uncompleteSet(db, set.id);
    // An open-ended hold has no result until a time is typed (the editor has no stopwatch).
    if (setTypeInfo(set.type).openEnded && set.timeMs == null) return setEdit({ set, field: 'time' });
    void completeSet(
      db,
      set.id,
      { weightG: set.weightG ?? set.targetWeightG, reps: set.reps ?? set.targetReps, rir: set.rir ?? (set.type === 'failure' ? 0 : set.targetRir), timeMs: set.timeMs ?? (setTypeInfo(set.type).openEnded ? null : set.targetTimeMs) },
      stamp,
    );
  };

  const done = () => {
    const sets = full.exercises.reduce((a, e) => a + e.sets.length - e.sets.filter((x) => x.completedAt == null).length, 0);
    if (sets === 0) return ask('No sets left', 'A workout needs at least one set. To remove the whole workout, delete it from History.');
    if (unticked === 0) return void finishEditingWorkout(id);
    ask('Done editing?', `${unticked} set${unticked > 1 ? 's' : ''} not ticked. Unticked sets will be removed.`, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Done', onPress: () => void finishEditingWorkout(id) },
    ]);
  };

  return (
    <Screen
      title="Edit workout"
      backButton
      meta={new Date(w.startedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}
      footer={
        <button type="button" className="btn-primary w-full" onClick={done}>
          Done
        </button>
      }
    >
      <NameFields key={id} id={id} title={w.title} notes={w.notes} />
      <RuledRow onClick={() => setTimesOpen(true)} label="Change the workout time">
        <span className="flex-1">Time</span>
        <span className="t-num-m text-ink2">{`${formatTimeOfDay(w.startedAt, s.clock)} – ${w.endedAt ? formatTimeOfDay(w.endedAt, s.clock) : '…'}`}</span>
      </RuledRow>
      <Pad className="py-2">
        <MarginNote>Changes save as you make them. Tick a set to keep it; unticked sets are removed when you tap Done.</MarginNote>
      </Pad>

      {full.exercises.map((e, ei) => {
        const ex = infos.get(e.exerciseId);
        const label = labels[ei];
        const timedCols = ex?.mode === 'time' || e.sets.some((x) => setTypeInfo(x.type).timed);
        let workingNo = 0;
        return (
          <section key={e.id} className="mt-6">
            <div className="flex items-baseline gap-2 px-margin pb-1">
              {label ? <span className="t-meta text-blue-text">{label}</span> : null}
              <span className="t-title-m flex-1">{ex?.name ?? e.exerciseId}</span>
              <button
                type="button"
                className="btn-ghost btn-compact text-red-text"
                onClick={() =>
                  ask(`Remove ${ex?.name ?? 'this exercise'}?`, 'Its sets are removed from this workout.', [
                    { text: 'Keep', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => void removeExercise(db, e.id) },
                  ])
                }
              >
                Remove
              </button>
            </div>
            {wide && e.sets.length ? <SetColumns effort={s.effort} timed={timedCols} /> : null}
            <div className={cx(label && 'ml-1 border-l-2 border-blue-ring')}>
              {e.sets.map((set, si) => {
                const info = setTypeInfo(set.type);
                if (info.letter === null && !info.glyph) workingNo++;
                return (
                  <SetRow
                    key={set.id}
                    set={set}
                    index={info.letter === null && !info.glyph ? workingNo - 1 : si}
                    unit={s.unit}
                    effort={s.effort}
                    mode={ex?.mode ?? 'weightReps'}
                    isNext={false}
                    wide={wide}
                    linked={set.type === 'backoff' && si > 0 && (e.sets[si - 1]?.type === 'top' || e.sets[si - 1]?.type === 'backoff')}
                    onEdit={(x, field) => setEdit({ set: x, field })}
                    onToggle={toggle}
                    onRing={setTypeFor}
                    onMore={(x) => setDetailFor(x.id)}
                  />
                );
              })}
            </div>
            <div className="flex gap-1 px-2">
              <button
                type="button"
                className="btn-ghost btn-compact"
                onClick={() => {
                  // The new set starts as a copy of the last one, already ticked: change what differs.
                  const last = e.sets[e.sets.length - 1];
                  void addSet(db, e.id, { type: last?.type === 'warmup' ? 'working' : (last?.type ?? 'working'), weightG: last?.weightG ?? last?.targetWeightG, reps: last?.reps ?? last?.targetReps, rir: last?.rir ?? last?.targetRir, timeMs: last?.timeMs ?? last?.targetTimeMs }).then((sid) => completeSet(db, sid, {}, stamp));
                }}
              >
                + set
              </button>
            </div>
          </section>
        );
      })}

      <Section>
        <Pad className="flex flex-col gap-2 pt-4">
          <button type="button" className="btn-secondary" onClick={() => navigate({ name: 'exercises', pick: id })}>
            <Plus size={18} strokeWidth={1.75} /> Add exercise
          </button>
          <MarginNote>An added exercise comes in with its sets unticked: tick the ones you did.</MarginNote>
        </Pad>
      </Section>

      {edit ? <SetFieldSheet set={edit.set} field={edit.field} unit={s.unit} effort={s.effort} incrementG={infos.get(edit.set.exerciseId)?.incrementG ?? 2500} onClose={() => setEdit(null)} /> : null}
      {typeFor ? <SetTypeSheet set={typeFor} onClose={() => setTypeFor(null)} /> : null}
      {detailSet ? <SetDetailSheet key={detailSet.id} set={detailSet} unit={s.unit} onClose={() => setDetailFor(null)} /> : null}
      {timesOpen ? <TimesSheet workout={w} onClose={() => setTimesOpen(false)} /> : null}
    </Screen>
  );
}
