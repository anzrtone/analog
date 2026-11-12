// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getExercises, type Exercise } from '@/db/exercises';
import { prsForWorkout, type PrRow } from '@/db/repos';
import { readDb } from '@/db/shown';
import { db } from '@/db/schema';
import { useSettings } from '@/db/settings';
import { deleteWorkout, finishedWorkouts, firstWorkoutAt, getWorkout, historyPage, toLoggedSet, type FullWorkout, type HistoryItem, type Workout } from '@/db/workouts';
import { formatClock, formatDuration, formatSet, formatWeight } from '@/engine/math/units';
import { setTypeInfo } from '@/engine/setTypes';
import { calendarDays, monthGrid, weekdayLetters, weekStreak } from '@/engine/stats/stats';
import { groupLabels } from '@/engine/timer/rest';
import { volumeLoadG } from '@/engine/volume/count';
import { useData } from '@/features/data';
import { back, navigate } from '@/features/nav';
import { useWide } from '@/features/responsive';
import { reopenWorkout, startEmptyWorkout } from '@/features/workout/actions';
import { canUndoFinish } from '@/services/undoFinish';
import { Stamp } from '@/components/Brand';
import { ask } from '@/components/Dialog';
import { SetTypeRing } from '@/components/PlateRing';
import { cx, EmptyState, IconButton, KeyValue, MarginNote, Pad, RuledRow, Screen, Section } from '@/components/ui';

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Kept outside the component: on the phone a workout replaces this screen, and Back should land on the same month.
let lastOffset = 0;

/**
 * One month, starting the week on the day chosen in Settings, stepping back as far as the oldest workout. Filled date = trained, ringed date = today.
 * Each month is read when it's opened, so a long history costs nothing here. A filled date opens its workout; a day
 * with two or more asks which one.
 */
function MonthCalendar({ onOpen }: { onOpen: (id: string) => void }) {
  const { clock, weekStart } = useSettings();
  const [offset, setOffset] = useState(lastOffset);
  const step = (by: number) => {
    lastOffset = offset + by;
    setOffset(lastOffset);
  };
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - offset, 1);
  const year = start.getFullYear();
  const month = start.getMonth();
  const workouts = useData((d) => finishedWorkouts(d, new Date(year, month, 1).getTime(), new Date(year, month + 1, 1).getTime()), [year, month], [] as Workout[]);
  const oldest = useData((d) => firstWorkoutAt(d), [], null as number | null);
  const oldestDate = oldest === null ? null : new Date(oldest);
  const maxOffset = oldestDate ? (today.getFullYear() - oldestDate.getFullYear()) * 12 + today.getMonth() - oldestDate.getMonth() : 0;
  const trained = calendarDays(workouts);
  const { lead, days } = monthGrid(year, month, weekStart);
  const title = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const todayKey = dayKey(today);
  const onDay = (key: string) => workouts.filter((w) => dayKey(new Date(w.startedAt)) === key).sort((a, b) => a.startedAt - b.startedAt);
  const openDay = (date: Date) => {
    const found = onDay(dayKey(date));
    if (found.length === 1) return onOpen(found[0]!.id);
    const time = (w: Workout) => new Date(w.startedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: clock === '12h' });
    ask(date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }), 'Which workout?', [{ text: 'Cancel', style: 'cancel' }, ...found.map((w) => ({ text: `${w.title}, ${time(w)}`, onPress: () => onOpen(w.id) }))]);
  };
  return (
    <div className="px-margin pb-4 pt-1" data-tour="history-calendar">
      <div className="mb-1 flex items-center justify-between">
        <span className="t-title-m">{title}</span>
        <div className="flex">
          <IconButton label="Previous month" disabled={offset >= maxOffset} onClick={() => step(1)}>
            <ChevronLeft size={20} />
          </IconButton>
          <IconButton label="Next month" disabled={offset === 0} onClick={() => step(-1)}>
            <ChevronRight size={20} />
          </IconButton>
        </div>
      </div>
      <div role="group" aria-label={`${title}: ${trained.size} training day${trained.size === 1 ? '' : 's'}`}>
        <div className="mb-2 grid grid-cols-7">
          {weekdayLetters(weekStart).map((l, i) => (
            <span key={i} className="t-meta text-center text-[10px] leading-3 tracking-normal text-pencil">
              {l}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {Array.from({ length: days }, (_, i) => {
            const date = new Date(year, month, i + 1);
            const key = dayKey(date);
            const on = trained.has(key);
            const isToday = key === todayKey;
            const style = i === 0 ? { gridColumnStart: lead + 1 } : undefined;
            const shape = 't-num-m flex h-8 w-8 items-center justify-center justify-self-center rounded-full text-[13px]';
            if (on) {
              return (
                <button
                  key={key}
                  type="button"
                  style={style}
                  aria-label={`${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}: ${onDay(key).map((w) => w.title).join(', ')}`}
                  onClick={() => openDay(date)}
                  // The hit area reaches past the dot, across the gap to its neighbours, without changing how it looks.
                  className={cx(shape, 'relative bg-ink text-paper before:absolute before:-inset-x-2 before:-inset-y-0.5 hover:bg-ink/90', isToday && 'ring-1 ring-ink ring-offset-2 ring-offset-paper')}
                >
                  {i + 1}
                </button>
              );
            }
            return (
              <span key={key} style={style} className={cx(shape, isToday ? 'border border-ink text-ink' : date > today ? 'text-erased' : 'text-pencil')}>
                {i + 1}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function HistoryScreen() {
  const { unit, weekStart } = useSettings();
  const wide = useWide();
  const first = useData((d) => historyPage(d, null, 40), [], undefined as HistoryItem[] | undefined);
  const recent = useData((d) => finishedWorkouts(d, Date.now() - 400 * 86400000), [], [] as Workout[]);
  const [more, setMore] = useState<HistoryItem[]>([]);
  const [end, setEnd] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const items = useMemo(() => {
    const ids = new Set((first ?? []).map((f) => f.id));
    return [...(first ?? []), ...more.filter((m) => !ids.has(m.id))];
  }, [first, more]);
  // Not limited to the loaded list: the calendar can pick a workout from a month the list hasn't paged to yet.
  const shown = selected ?? items[0]?.id ?? null;
  const open = (id: string) => (wide ? setSelected(id) : navigate({ name: 'workoutDetail', id }));

  // Keyset paging: the next 40 before the oldest one shown.
  const loadMore = async () => {
    if (end || !items.length) return;
    const page = await historyPage(readDb(), items[items.length - 1]!.startedAt, 40);
    if (!page.length) setEnd(true);
    else setMore((m) => [...m, ...page]);
  };

  if (first === undefined) return <div className="min-h-full" />;
  if (!items.length) {
    return (
      <Screen title="History">
        <EmptyState line="Blank page. Start your first workout." action="Start a workout" onAction={() => void startEmptyWorkout()} />
      </Screen>
    );
  }
  const streak = weekStreak(recent, Date.now(), weekStart);
  const meta = streak ? `${streak} WEEK${streak > 1 ? 'S' : ''} IN A ROW` : 'FULL HISTORY, FOREVER';
  const list = (
    <>
      <MonthCalendar onOpen={open} />
      <div className="h-px bg-rule" />
      {items.map((item, index) => (
        <RuledRow
          key={item.id}
          tour={index === 0 ? 'history-list' : undefined}
          onClick={() => open(item.id)}
          label={`${item.title}, ${new Date(item.startedAt).toDateString()}`}
          className={cx('relative', wide && item.id === shown && 'bg-raised')}
        >
          {wide && item.id === shown ? <span className="absolute inset-y-0 left-0 w-[3px] bg-ink" /> : null}
          <span className="w-[52px] shrink-0">
            <span className="t-meta block text-pencil">{new Date(item.startedAt).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</span>
            <span className="t-num-l block">{new Date(item.startedAt).getDate()}</span>
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="t-title-m truncate">{item.title}</span>
            <span className="t-num-m text-[13px] text-pencil">
              {item.exercises} ex · {item.sets} sets{item.volumeG ? ` · ${formatWeight(item.volumeG, unit)} ${unit}` : ''}
              {item.endedAt ? ` · ${formatDuration(item.endedAt - item.startedAt)}` : ''}
            </span>
          </span>
        </RuledRow>
      ))}
      {!end && items.length >= 40 ? (
        <Pad className="py-4">
          <button type="button" className="btn-ghost w-full" onClick={() => void loadMore()}>
            Older workouts
          </button>
        </Pad>
      ) : null}
    </>
  );
  if (!wide) {
    return (
      <Screen title="History" meta={meta}>
        {list}
      </Screen>
    );
  }
  // Desktop: the list is the left page, the chosen workout the right page.
  return (
    <div className="flex min-h-full">
      <div className="w-[420px] shrink-0 border-r border-rule">
        <Screen title="History" meta={meta} maxWidth={420}>
          {list}
        </Screen>
      </div>
      <div className="min-w-0 flex-1">{shown ? <WorkoutDetailView key={shown} id={shown} onDeleted={() => setSelected(null)} /> : null}</div>
    </div>
  );
}

/** A finished page of the log. Its own screen on the phone; the right-hand page of History on desktop. */
export function WorkoutDetailView({ id, onDeleted = back, page }: { id: string; onDeleted?: () => void; page?: boolean }) {
  const { unit, effort, clock } = useSettings();
  const full = useData((d) => getWorkout(d, id), [id], undefined as FullWorkout | null | undefined);
  const exIds = full?.exercises.map((e) => e.exerciseId).join() ?? '';
  const infos = useData((d) => getExercises(d, exIds ? exIds.split(',') : []), [exIds], new Map<string, Exercise>());
  const prs = useData((d) => prsForWorkout(d, id), [id], [] as PrRow[]);
  const canUndo = useData((d) => canUndoFinish(d, id), [id, full?.workout.endedAt], false);
  if (!full) return <div className="min-h-full" />;
  // Totals from the workout already loaded. PRs come from the stored table, so nothing here re-reads the whole history.
  const done = full.exercises.flatMap((e) => e.sets).filter((s) => s.completedAt != null);
  const durationMs = full.workout.endedAt ? full.workout.endedAt - full.workout.startedAt : 0;
  const labels = groupLabels(full.exercises);
  const prSets = new Set(prs.map((x) => x.setId));
  const w = full.workout;
  return (
    <Screen
      title={w.title}
      backButton={page}
      right={
        <button type="button" className="btn-ghost btn-compact mb-0.5" onClick={() => navigate({ name: 'workoutEdit', id })}>
          Edit
        </button>
      }
      meta={new Date(w.startedAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: clock === '12h' }).toUpperCase()}
    >
      <Section>
        <KeyValue k="Duration" v={formatDuration(durationMs)} />
        <KeyValue k="Sets" v={String(done.length)} />
        <KeyValue k="Volume" v={`${formatWeight(volumeLoadG(done.map(toLoggedSet)), unit)} ${unit}`} />
        {w.bodyweightG ? <KeyValue k="Bodyweight" v={`${formatWeight(w.bodyweightG, unit)} ${unit}`} /> : null}
        {w.notes ? (
          <Pad className="pt-2">
            <MarginNote>{w.notes}</MarginNote>
          </Pad>
        ) : null}
      </Section>
      {full.exercises.map((e, ei) => {
        const ex = infos.get(e.exerciseId);
        let n = 0;
        return (
          <section key={e.id} className="mt-6">
            <div className="flex items-baseline gap-2 px-margin pb-1">
              {labels[ei] ? <span className="t-meta text-blue-text">{labels[ei]}</span> : null}
              <button type="button" className="t-title-m text-left hover:underline" onClick={() => navigate({ name: 'exercise', id: e.exerciseId })}>
                {ex?.name ?? e.exerciseId}
              </button>
            </div>
            {e.note ? (
              <Pad>
                <MarginNote>{e.note}</MarginNote>
              </Pad>
            ) : null}
            <div className={cx(labels[ei] && 'ml-1 border-l-2 border-blue-ring')}>
              {e.sets.map((s) => {
                const info = setTypeInfo(s.type);
                if (info.letter === null && !info.glyph) n++;
                const value = info.timed ? `${s.weightG ? `${formatWeight(s.weightG, unit)} ${unit} · ` : ''}${formatClock(s.timeMs ?? 0)}` : formatSet(s.weightG, s.reps, unit) + (s.partials ? ` +${s.partials}p` : '');
                const eff = s.rir == null ? '' : effort === 'rir' ? `${s.rir} RIR` : `RPE ${10 - s.rir}`;
                return (
                  <RuledRow key={s.id}>
                    <SetTypeRing type={s.type} index={Math.max(0, n - 1)} state="done" label={info.label} />
                    <span className="t-num-m flex-1">
                      {value}
                      {s.side ? ` ${s.side}` : ''}
                    </span>
                    <span className="t-num-m text-pencil">{eff}</span>
                    {prSets.has(s.id) ? <Stamp kind="PR" animate={false} /> : null}
                  </RuledRow>
                );
              })}
            </div>
          </section>
        );
      })}
      <Section>
        <Pad className="flex flex-col gap-2">
          {canUndo ? (
            <button type="button" className="btn-secondary" onClick={() => void reopenWorkout(id).then((ok) => ok || ask('Can’t reopen it', 'Another workout has been logged since.'))}>
              Reopen this workout
            </button>
          ) : null}
          <button type="button" className="btn-primary" onClick={() => navigate({ name: 'workoutEdit', id })}>
            Edit this workout
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate({ name: 'share', kind: 'workout', id })}>
            Share this workout
          </button>
          <button
            type="button"
            className="btn-ghost text-red-text"
            onClick={() =>
              ask('Delete this workout?', 'It will be gone from your history and stats. This can’t be undone.', [
                { text: 'Keep it', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    await deleteWorkout(db, id);
                    onDeleted();
                  },
                },
              ])
            }
          >
            Delete this workout
          </button>
        </Pad>
      </Section>
    </Screen>
  );
}
