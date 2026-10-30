// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Ellipsis, NotebookPen, Plus, Settings2 } from 'lucide-react';
import { getExercises, setStickyNote, type Exercise } from '@/db/exercises';
import { feedbackForWorkouts, getMachineSetting, getRun, setMachineSetting } from '@/db/repos';
import { useSettings } from '@/db/settings';
import { editDb, readDb } from '@/db/shown';
import { addSet, exerciseHistory, getWorkout, groupExercises, previousPerformance, removeExercise, reorderExercises, setExerciseNote, setExerciseRest, setExerciseSkipped, ungroup, updateSet, type FullWorkout, type WorkoutSet } from '@/db/workouts';
import { formatClock, formatWeight, parseWeightInput } from '@/engine/math/units';
import { setTypeInfo } from '@/engine/setTypes';
import { groupKindFor, groupLabels } from '@/engine/timer/rest';
import { ASK_AGAIN_MS, shouldAskEnded } from '@/engine/timer/session';
import { useData } from '@/features/data';
import { navigate } from '@/features/nav';
import { useSpread } from '@/features/responsive';
import { modalOpen, typingInField } from '@/features/shortcuts';
import { createStore } from '@/features/store';
import { addWarmups, discardWorkout, finishActiveWorkout, prStamps, toggleSet, updateWorkoutNotification } from '@/features/workout/actions';
import { restTimer } from '@/features/workout/timers';
import { platform } from '@/platform';
import { sorenessQuestions } from '@/services/programFlow';
import { Stamp } from '@/components/Brand';
import { ask } from '@/components/Dialog';
import { FeedbackFlow, sorenessQuestion } from '@/components/Feedback';
import { NumberSheet } from '@/components/NumberSheet';
import { RestTimer } from '@/components/RestTimer';
import { SetColumns, SetRow, type SetField } from '@/components/SetRow';
import { ChoiceRow, cx, Field, IconButton, MarginNote, Pad, RuledRow, Screen, Segmented, Sheet } from '@/components/ui';
import { PlateLoad, WorkoutMargin, WorkoutOutline } from '@/components/workout/DesktopPanels';
import { SetDetailSheet, SetTypeSheet, StopwatchSheet } from '@/components/workout/SetSheets';
import { LongWorkoutSheet, WorkoutTimeSheet } from '@/components/workout/TimeSheets';

function Elapsed({ since, onClick }: { since: number; onClick: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <button type="button" onClick={onClick} aria-label="Workout duration. Adjust the workout's start or end time" className="t-num-m mb-1 rounded-control px-2 py-1 text-ink2 hover:bg-sunk">
      {formatClock(now - since)}
    </button>
  );
}

/** "Still going" on the long-workout question, per workout, until this time. Outlives leaving the screen. */
const askAgain = createStore<Record<string, number>>({});

type Edit = { set: WorkoutSet; field: SetField } | null;
const write = (fn: (d: ReturnType<typeof editDb>) => Promise<unknown>) => void fn(editDb());

/** Finish, asking first if some sets aren't ticked (they won't be saved). */
function confirmFinish(full: FullWorkout, id: string, endedAt?: number) {
  const open = full.exercises.reduce((a, e) => a + e.sets.filter((x) => x.completedAt == null).length, 0);
  if (open === 0) return void finishActiveWorkout(id, endedAt);
  ask('Finish workout?', `${open} set${open > 1 ? 's' : ''} not ticked. Unticked sets won't be saved.`, [
    { text: 'Keep going', style: 'cancel' },
    { text: 'Finish', onPress: () => void finishActiveWorkout(id, endedAt) },
  ]);
}

const pickExercise = (workoutId: string) => navigate({ name: 'exercises', pick: workoutId });

export function WorkoutScreen({ id }: { id: string }) {
  const s = useSettings();
  const { wide, outline } = useSpread();
  const full = useData((d) => getWorkout(d, id), [id], undefined as FullWorkout | null | undefined);
  const exerciseIds = full?.exercises.map((e) => e.exerciseId).join() ?? '';
  const ids = useMemo(() => (exerciseIds ? exerciseIds.split(',') : []), [exerciseIds]);
  const infos = useData((d) => getExercises(d, ids), [exerciseIds], new Map<string, Exercise>());
  // Earlier sessions don't change while this one is logged, so ticks don't re-read them; adding an exercise does.
  const prev = useData(async (d) => new Map(await Promise.all(ids.map(async (x) => [x, await previousPerformance(d, x, id)] as const))), [exerciseIds, id], new Map<string, WorkoutSet[]>());
  const gymId = full?.workout.gymId ?? null;
  const machines = useData(async (d) => new Map(gymId ? await Promise.all(ids.map(async (x) => [x, await getMachineSetting(d, x, gymId)] as const)) : []), [exerciseIds, gymId], new Map<string, string | null>());
  const stamps = prStamps.use();

  const [edit, setEdit] = useState<Edit>(null);
  const [typeFor, setTypeFor] = useState<WorkoutSet | null>(null);
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [explain, setExplain] = useState<string | null>(null);
  const [timerFor, setTimerFor] = useState<{ set: WorkoutSet; bestMs: number | null } | null>(null);
  const [askedSoreness, setAskedSoreness] = useState(false);
  // The clock sheet; `suggestedEnd` pre-fills "To" when it's opened from the long-workout question.
  const [timeSheet, setTimeSheet] = useState<{ suggestedEnd: number | null } | null>(null);
  const [minute, setMinute] = useState(() => Date.now());
  const askAgainAt = askAgain.use((x) => x[id] ?? null);
  // Desktop: the set the keyboard acts on. Defaults to the next set to do.
  const [focusId, setFocusId] = useState<string | null>(null);
  const runId = full?.workout.runId ?? null;
  // Adaptive programs: the first time a muscle comes back, ask how it recovered (SPEC §6.2).
  const soreness = useData(
    async (d) => {
      if (!runId || !full) return [];
      const run = await getRun(d, runId);
      if (!run?.program.blocks[full.workout.blockIndex ?? 0]?.adaptive) return [];
      if ((await feedbackForWorkouts(d, [id])).some((f) => f.kind === 'soreness')) return [];
      return sorenessQuestions(d, id);
    },
    [id, runId],
    [],
  );

  useEffect(() => {
    void updateWorkoutNotification(id);
  }, [id]);

  // Keep the screen on during workouts (Settings), Android only.
  useEffect(() => {
    if (!s.keepAwake) return;
    void platform().keepAwake(true);
    return () => void platform().keepAwake(false);
  }, [s.keepAwake]);

  // Forgot to finish? After a few hours, ask. A minute's clock is plenty.
  useEffect(() => {
    const t = setInterval(() => setMinute(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const labels = useMemo(() => groupLabels(full?.exercises ?? []), [full]);
  const allSets = useMemo(() => full?.exercises.flatMap((e) => (e.skipped ? [] : e.sets)) ?? [], [full]);
  const nextSetId = useMemo(() => allSets.find((x) => x.completedAt == null)?.id, [allSets]);
  const focus = (focusId ? allSets.find((x) => x.id === focusId) : undefined) ?? allSets.find((x) => x.id === nextSetId) ?? null;

  const jump = (setId: string) => {
    setFocusId(setId);
    document.getElementById(`set-${setId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  const openTimer = useCallback(
    async (set: WorkoutSet) => {
      const all = (await exerciseHistory(readDb(), set.exerciseId, id)).filter((x) => x.side === set.side && x.timeMs);
      setTimerFor({ set, bestMs: all.length ? Math.max(...all.map((x) => x.timeMs!)) : null });
    },
    [id],
  );
  const onEdit = useCallback(
    (set: WorkoutSet, field: SetField) => {
      if (field === 'time' && setTypeInfo(set.type).timed) void openTimer(set);
      else setEdit({ set, field });
    },
    [openTimer],
  );
  const onToggle = useCallback((set: WorkoutSet) => void toggleSet(id, set), [id]);
  const onRing = useCallback((set: WorkoutSet) => setTypeFor(set), []);
  const onMore = useCallback((set: WorkoutSet) => setDetailFor(set.id), []);

  // Desktop keyboard: log a whole session without touching the mouse.
  useEffect(() => {
    if (!wide || !full) return;
    const onKey = (e: KeyboardEvent) => {
      if (typingInField(e) || modalOpen()) return;
      const f = focus;
      const idx = f ? allSets.findIndex((x) => x.id === f.id) : -1;
      const ex = f ? infos.get(f.exerciseId) : undefined;
      const k = e.key;
      const lower = k.toLowerCase();
      const handled = () => e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && k === 'Enter') {
        handled();
        confirmFinish(full, id);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (k === 'ArrowDown' || k === 'j') {
        handled();
        const n = allSets[Math.min(allSets.length - 1, idx + 1)];
        if (n) jump(n.id);
      } else if (k === 'ArrowUp' || k === 'k') {
        handled();
        const n = allSets[Math.max(0, idx - 1)];
        if (n) jump(n.id);
      } else if (lower === 'e' && (e.shiftKey || !f)) {
        handled();
        pickExercise(id);
      } else if (!f) {
        return;
      } else if (k === 'Enter' || k === ' ') {
        handled();
        if (setTypeInfo(f.type).openEnded && f.completedAt == null && f.timeMs == null) void openTimer(f);
        else {
          onToggle(f);
          if (f.completedAt == null) setFocusId(null);
        }
      } else if (k === 'ArrowRight' || k === 'ArrowLeft') {
        handled();
        const step = (ex?.incrementG ?? 2500) * (k === 'ArrowRight' ? 1 : -1);
        write((d) => updateSet(d, f.id, { weightG: Math.max(0, (f.weightG ?? f.targetWeightG ?? 0) + step) }));
      } else if (k === ']' || k === '[') {
        handled();
        write((d) => updateSet(d, f.id, { reps: Math.max(0, (f.reps ?? f.targetReps ?? 0) + (k === ']' ? 1 : -1)) }));
      } else if (lower === 'w') {
        handled();
        setEdit({ set: f, field: 'weight' });
      } else if (lower === 'r') {
        handled();
        setEdit({ set: f, field: 'reps' });
      } else if (lower === 'e') {
        handled();
        setEdit({ set: f, field: 'rir' });
      } else if (lower === 't') {
        handled();
        setTypeFor(f);
      } else if (lower === 'a') {
        handled();
        write((d) => addSet(d, f.workoutExerciseId, { type: f.type === 'warmup' ? 'working' : f.type, targetWeightG: f.weightG ?? f.targetWeightG, targetReps: f.reps ?? f.targetReps, targetRir: f.rir ?? f.targetRir }));
      } else if (lower === 's') {
        handled();
        restTimer.skip();
      } else if (k === '=' || k === '+') {
        handled();
        restTimer.adjust(15000);
      } else if (k === '-') {
        handled();
        restTimer.adjust(-15000);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

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
  const unit = s.unit;
  const done = full.exercises.reduce((a, e) => a + e.sets.filter((x) => x.completedAt != null).length, 0);
  const lastSetAt = full.exercises.reduce<number | null>((a, e) => e.sets.reduce((b, x) => (x.completedAt != null && x.completedAt > w.startedAt && x.completedAt > (b ?? 0) ? x.completedAt : b), a), null);
  const long = w.endedAt == null && shouldAskEnded(w.startedAt, minute, askAgainAt);
  const openClock = () => setTimeSheet({ suggestedEnd: null });
  // Whatever the answer, don't ask again for a while: backing out of a dialog shouldn't bring the question straight back.
  const snooze = () => askAgain.set((x) => ({ ...x, [id]: Date.now() + ASK_AGAIN_MS }));

  const editSheet = (() => {
    if (!edit) return null;
    const { set, field } = edit;
    const ex = infos.get(set.exerciseId);
    const close = () => setEdit(null);
    if (field === 'weight') {
      return <NumberSheet title="Weight" unit={unit} value={set.weightG ?? set.targetWeightG ?? null} step={ex?.incrementG ?? 2500} format={(g) => formatWeight(g, unit)} parse={(t) => parseWeightInput(t, unit)} onDone={(v) => write((d) => updateSet(d, set.id, { weightG: v == null ? null : Math.round(v) }))} onClose={close} />;
    }
    if (field === 'reps') return <NumberSheet title="Reps" value={set.reps ?? set.targetReps ?? null} step={1} onDone={(v) => write((d) => updateSet(d, set.id, { reps: v }))} onClose={close} />;
    if (field === 'time') return <NumberSheet title="Seconds" unit="s" value={(set.timeMs ?? set.targetTimeMs ?? 0) / 1000} step={5} onDone={(v) => write((d) => updateSet(d, set.id, { timeMs: v == null ? null : v * 1000 }))} onClose={close} />;
    const rpe = s.effort === 'rpe';
    const cur = set.rir ?? set.targetRir;
    return (
      <NumberSheet
        title={rpe ? 'RPE' : 'Reps in reserve'}
        value={cur == null ? null : rpe ? 10 - cur : cur}
        step={rpe ? 0.5 : 1}
        min={0}
        onDone={(v) => write((d) => updateSet(d, set.id, { rir: v == null ? null : rpe ? Math.max(0, 10 - v) : v, rpe: v == null ? null : rpe ? v : 10 - v }))}
        onClose={close}
      />
    );
  })();

  const menuEx = full.exercises.find((e) => e.id === menuFor);
  const menuIdx = full.exercises.findIndex((e) => e.id === menuFor);
  const nextEx = full.exercises[menuIdx + 1];
  const focusEx = focus ? full.exercises.find((x) => x.id === focus.workoutExerciseId) : undefined;
  const detailSet = detailFor ? full.exercises.flatMap((x) => x.sets).find((x) => x.id === detailFor) : undefined;

  const page = (
    <Screen
      title={w.title}
      backButton
      maxWidth={wide ? 820 : 880}
      meta={`${new Date(w.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()} · ${done} SETS`}
      right={wide ? undefined : <Elapsed since={w.startedAt} onClick={openClock} />}
      footer={
        wide ? undefined : (
          <div>
            <RestTimer />
            <div className="flex gap-2">
              <button type="button" className="btn-secondary flex-1" onClick={() => pickExercise(id)} data-tour="workout-add-exercise">
                <Plus size={18} strokeWidth={1.75} /> Add exercise
              </button>
              <button type="button" className="btn-primary flex-1" onClick={() => confirmFinish(full, id)} data-tour="workout-finish">
                Finish workout
              </button>
            </div>
          </div>
        )
      }
    >
      {soreness.length && !askedSoreness ? (
        <div className="mt-2">
          <FeedbackFlow questions={soreness.map(sorenessQuestion)} workoutId={id} runId={w.runId} onDone={() => setAskedSoreness(true)} />
        </div>
      ) : null}
      {full.exercises.length === 0 ? (
        <Pad className="flex flex-col gap-3 py-8">
          <p className="t-title-m">Blank page.</p>
          <p className="text-ink2">Add your first exercise. Sets save the moment you tick them, so you can close the app any time.</p>
          {wide ? (
            <button type="button" className="btn-secondary self-start" onClick={() => pickExercise(id)}>
              Add exercise
            </button>
          ) : null}
        </Pad>
      ) : null}

      {full.exercises.map((e, ei) => {
        const ex = infos.get(e.exerciseId);
        const label = labels[ei];
        const prevSets = prev.get(e.exerciseId) ?? [];
        const machine = machines.get(e.exerciseId);
        const stampMsg = e.sets.map((x) => stamps[x.id]).find(Boolean);
        const timedCols = ex?.mode === 'time' || e.sets.some((x) => setTypeInfo(x.type).timed);
        let workingNo = 0;
        return (
          <section key={e.id} className={cx('mt-4', e.skipped && 'opacity-50')} aria-label={ex?.name}>
            <div className="flex items-start gap-2 pl-margin pr-1">
              {label ? (
                <span className="t-meta w-7 pt-1 text-center text-blue-text" aria-label={`Group ${label}`}>
                  {label}
                </span>
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <button type="button" className="t-title-m text-left hover:underline" onClick={() => navigate({ name: 'exercise', id: e.exerciseId })}>
                  {ex?.name ?? 'Exercise'}
                </button>
                {e.explanation ? <MarginNote onClick={() => setExplain(e.explanationDetail ?? e.explanation)}>{e.explanation}</MarginNote> : null}
                {ex?.stickyNote ? (
                  <MarginNote className="flex items-center gap-1">
                    <NotebookPen size={13} strokeWidth={1.75} aria-label="Sticky note" /> {ex.stickyNote}
                  </MarginNote>
                ) : null}
                {machine ? (
                  <MarginNote className="flex items-center gap-1">
                    <Settings2 size={13} strokeWidth={1.75} aria-label="Machine settings" /> {machine}
                  </MarginNote>
                ) : null}
                {e.note ? <MarginNote>{e.note}</MarginNote> : null}
                {stampMsg ? (
                  <div className="flex items-center gap-2 pt-1">
                    <Stamp kind="PR" />
                    <span className="t-label text-red-text">{stampMsg}</span>
                  </div>
                ) : null}
              </div>
              <IconButton label={`${ex?.name ?? 'Exercise'} options`} onClick={() => setMenuFor(e.id)}>
                <Ellipsis size={20} strokeWidth={1.75} />
              </IconButton>
            </div>
            {!wide && ex && !e.skipped ? (() => {
              const next = e.sets.find((x) => x.completedAt == null);
              return next ? (
                <div className="pl-margin pr-margin pt-1">
                  <PlateLoad exercise={ex} set={next} scale={0.55} compact />
                </div>
              ) : null;
            })() : null}
            {wide && e.sets.length ? <SetColumns effort={s.effort} timed={timedCols} /> : null}
            <div className={cx(label && 'ml-1 border-l-2 border-blue-ring')}>
              {e.sets.map((set, si) => {
                const info = setTypeInfo(set.type);
                if (info.letter === null && !info.glyph) workingNo++;
                const idxForRing = info.letter === null && !info.glyph ? workingNo - 1 : si;
                return (
                  <SetRow
                    key={set.id}
                    set={set}
                    index={idxForRing}
                    prev={prevSets[si]}
                    unit={unit}
                    effort={s.effort}
                    mode={ex?.mode ?? 'weightReps'}
                    isNext={!wide && set.id === nextSetId}
                    focused={wide && set.id === focus?.id}
                    wide={wide}
                    linked={set.type === 'backoff' && si > 0 && (e.sets[si - 1]?.type === 'top' || e.sets[si - 1]?.type === 'backoff')}
                    onEdit={onEdit}
                    onToggle={onToggle}
                    onRing={onRing}
                    onMore={onMore}
                    tour={set.id === nextSetId}
                  />
                );
              })}
            </div>
            <div className="flex gap-1 px-2" data-tour={e.sets.some((x) => x.id === nextSetId) ? 'workout-add-set' : undefined}>
              <button
                type="button"
                className="btn-ghost btn-compact"
                onClick={() => {
                  const last = e.sets[e.sets.length - 1];
                  write((d) => addSet(d, e.id, { type: last?.type === 'warmup' ? 'working' : (last?.type ?? 'working'), targetWeightG: last?.weightG ?? last?.targetWeightG, targetReps: last?.reps ?? last?.targetReps, targetRir: last?.rir ?? last?.targetRir, targetTimeMs: last?.timeMs ?? last?.targetTimeMs }));
                }}
              >
                + set
              </button>
              {!e.sets.some((x) => x.type === 'warmup') && ex?.mode === 'weightReps' ? (
                <button
                  type="button"
                  className="btn-ghost btn-compact"
                  onClick={() => {
                    const first = e.sets.find((x) => x.type !== 'warmup');
                    const g = first?.weightG ?? first?.targetWeightG;
                    if (!g) return ask('Warm-ups', 'Set the working weight first, then the ramp is worked out from it.');
                    void addWarmups(e.id, e.exerciseId, g).then(setExplain);
                  }}
                >
                  + warm-ups
                </button>
              ) : null}
              {ex?.unilateral ? (
                <button
                  type="button"
                  className="btn-ghost btn-compact"
                  onClick={() =>
                    write(async (d) => {
                      await addSet(d, e.id, { side: 'L' });
                      await addSet(d, e.id, { side: 'R' });
                    })
                  }
                >
                  + L/R pair
                </button>
              ) : null}
            </div>
          </section>
        );
      })}

      <Pad className="pt-6">
        <button
          type="button"
          className="btn-ghost text-red-text"
          onClick={() =>
            ask('Discard this workout?', 'Every set in it will be deleted. This can’t be undone.', [
              { text: 'Keep it', style: 'cancel' },
              { text: 'Discard', style: 'destructive', onPress: () => void discardWorkout(id) },
            ])
          }
        >
          Discard workout
        </button>
      </Pad>

      {/* Sheets mount only while open, so a tick doesn't re-render their contents behind the page. */}
      {editSheet}
      {typeFor ? <SetTypeSheet set={typeFor} onClose={() => setTypeFor(null)} /> : null}
      {detailSet ? <SetDetailSheet key={detailSet.id} set={detailSet} unit={unit} onClose={() => setDetailFor(null)} /> : null}
      {timerFor ? (
        <StopwatchSheet
          set={timerFor.set}
          title={infos.get(timerFor.set.exerciseId)?.name ?? 'Hold'}
          lastMs={(prev.get(timerFor.set.exerciseId) ?? []).find((x) => x.side === timerFor.set.side)?.timeMs ?? null}
          bestMs={timerFor.bestMs}
          onClose={(ms) => {
            const set = timerFor.set;
            setTimerFor(null);
            if (ms != null) void updateSet(editDb(), set.id, { timeMs: ms }).then(() => toggleSet(id, { ...set, timeMs: ms }));
          }}
        />
      ) : null}

      {timeSheet ? <WorkoutTimeSheet workoutId={id} startedAt={w.startedAt} suggestedEnd={timeSheet.suggestedEnd} onFinish={(at) => confirmFinish(full, id, at)} onClose={() => setTimeSheet(null)} /> : null}
      {long && !timeSheet ? (
        <LongWorkoutSheet
          startedAt={w.startedAt}
          lastSetAt={lastSetAt}
          onFinishAt={(at) => {
            snooze();
            confirmFinish(full, id, at);
          }}
          onSetTimes={() => {
            snooze();
            setTimeSheet({ suggestedEnd: lastSetAt });
          }}
          onStillGoing={snooze}
        />
      ) : null}

      {explain ? (
        <Sheet open onClose={() => setExplain(null)} title="Why this target">
          <Pad className="py-3">
            <p>{explain}</p>
          </Pad>
        </Sheet>
      ) : null}

      {menuEx ? (
        <Sheet open onClose={() => setMenuFor(null)} title={infos.get(menuEx.exerciseId)?.name}>
          <ExerciseMenu
            workoutId={id}
            we={menuEx}
            info={infos.get(menuEx.exerciseId)}
            canGroupWithNext={!!nextEx}
            gymId={w.gymId}
            machine={machines.get(menuEx.exerciseId) ?? ''}
            onGroup={() => {
              const existing = full.exercises.filter((x) => menuEx.groupId && x.groupId === menuEx.groupId).map((x) => x.id);
              const members = [...new Set([...existing, menuEx.id, nextEx!.id])];
              write(async (d) => {
                if (menuEx.groupId) await ungroup(d, menuEx.groupId);
                await groupExercises(d, id, members, groupKindFor(members.length), 90000);
              });
              setMenuFor(null);
            }}
            onUngroup={() => {
              if (menuEx.groupId) write((d) => ungroup(d, menuEx.groupId!));
              setMenuFor(null);
            }}
            onMove={(dir) => {
              const order = full.exercises.map((x) => x.id);
              const i = order.indexOf(menuEx.id);
              const j = i + dir;
              if (j < 0 || j >= order.length) return;
              [order[i], order[j]] = [order[j]!, order[i]!];
              write((d) => reorderExercises(d, id, order));
            }}
            onClose={() => setMenuFor(null)}
          />
        </Sheet>
      ) : null}
    </Screen>
  );
  if (!wide) return page;
  // The open logbook: session outline | the page | the margin.
  return (
    <div className="flex min-h-full">
      {outline ? <WorkoutOutline full={full} infos={infos} labels={labels} focusId={focus?.id ?? null} onJump={jump} onAdd={() => pickExercise(id)} /> : null}
      <div className="min-w-0 flex-1">{page}</div>
      <WorkoutMargin
        startedAt={w.startedAt}
        onClock={openClock}
        focus={focus}
        exercise={focus ? infos.get(focus.exerciseId) : undefined}
        explanation={focusEx?.explanation ?? null}
        onExplain={() => setExplain(focusEx?.explanationDetail ?? focusEx?.explanation ?? null)}
        onFinish={() => confirmFinish(full, id)}
        onAdd={() => pickExercise(id)}
      />
    </div>
  );
}

function ExerciseMenu({ workoutId, we, info, canGroupWithNext, gymId, machine: machineNow, onGroup, onUngroup, onMove, onClose }: { workoutId: string; we: FullWorkout['exercises'][number]; info: Exercise | undefined; canGroupWithNext: boolean; gymId: string | null; machine: string; onGroup: () => void; onUngroup: () => void; onMove: (dir: -1 | 1) => void; onClose: () => void }) {
  const s = useSettings();
  const [note, setNote] = useState(we.note ?? '');
  const [sticky, setSticky] = useState(info?.stickyNote ?? '');
  const [machine, setMachine] = useState(machineNow);
  const restS = Math.round((we.restMs ?? info?.defaultRestMs ?? s.defaultRestMs) / 1000);
  return (
    <div>
      <RuledRow
        label="Swap exercise"
        onClick={() => {
          onClose();
          navigate({ name: 'exercises', swap: we.id, target: we.exerciseId, pick: undefined, workout: workoutId });
        }}
      >
        <span className="flex-1">Swap for another exercise</span>
        <span className="t-hint">ranked by muscle overlap</span>
      </RuledRow>
      {canGroupWithNext ? (
        <RuledRow label="Group with next" onClick={onGroup}>
          <span className="flex-1">Superset with the next exercise</span>
          <span className="t-meta text-blue-text">A1 · A2</span>
        </RuledRow>
      ) : null}
      {we.groupId ? (
        <RuledRow label="Ungroup" onClick={onUngroup}>
          <span className="flex-1">Ungroup</span>
        </RuledRow>
      ) : null}
      <ChoiceRow label="Rest after each set">
        <Segmented label="Rest" value={String(restS)} onChange={(v) => write((d) => setExerciseRest(d, we.id, Number(v) * 1000))} options={[60, 90, 120, 180, 240].map((x) => ({ value: String(x), label: formatClock(x * 1000) }))} />
      </ChoiceRow>
      <RuledRow>
        <span className="flex-1">Order</span>
        <IconButton label="Move up" onClick={() => onMove(-1)}>
          <ChevronUp size={20} />
        </IconButton>
        <IconButton label="Move down" onClick={() => onMove(1)}>
          <ChevronDown size={20} />
        </IconButton>
      </RuledRow>
      <Pad className="flex flex-col gap-3 py-3">
        <Field label="Note for today" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => write((d) => setExerciseNote(d, we.id, note.trim() || null))} />
        <Field label="Sticky note (every time)" placeholder="elbows tucked" value={sticky} onChange={(e) => setSticky(e.target.value)} onBlur={() => write((d) => setStickyNote(d, we.exerciseId, sticky.trim() || null))} />
        {gymId ? <Field label="Machine settings at this gym" placeholder="seat 4, pad 2" value={machine} onChange={(e) => setMachine(e.target.value)} onBlur={() => write((d) => setMachineSetting(d, we.exerciseId, gymId, machine))} /> : null}
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            write((d) => setExerciseSkipped(d, we.id, !we.skipped));
            onClose();
          }}
        >
          {we.skipped ? 'Un-skip' : 'Skip this exercise today'}
        </button>
        <button
          type="button"
          className="btn-danger"
          onClick={() => {
            write((d) => removeExercise(d, we.id));
            onClose();
          }}
        >
          Remove from workout
        </button>
      </Pad>
    </div>
  );
}
