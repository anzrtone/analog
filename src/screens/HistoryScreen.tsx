// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useMemo, useState } from 'react';
import { getExercises, type Exercise } from '@/db/exercises';
import { prsForWorkout, type PrRow } from '@/db/repos';
import { readDb } from '@/db/shown';
import { db } from '@/db/schema';
import { useSettings } from '@/db/settings';
import { deleteWorkout, finishedWorkouts, getWorkout, historyPage, toLoggedSet, type FullWorkout, type HistoryItem, type Workout } from '@/db/workouts';
import { formatClock, formatDuration, formatSet, formatWeight } from '@/engine/math/units';
import { setTypeInfo } from '@/engine/setTypes';
import { calendarDays, weekStreak } from '@/engine/stats/stats';
import { groupLabels } from '@/engine/timer/rest';
import { volumeLoadG } from '@/engine/volume/count';
import { useData } from '@/features/data';
import { back, navigate } from '@/features/nav';
import { useWide } from '@/features/responsive';
import { startEmptyWorkout } from '@/features/workout/actions';
import { Stamp } from '@/components/Brand';
import { ask } from '@/components/Dialog';
import { SetTypeRing } from '@/components/PlateRing';
import { cx, EmptyState, KeyValue, MarginNote, Pad, RuledRow, Screen, Section } from '@/components/ui';

const WEEKS = 12;
const DAY_LABELS = ['M', '', 'W', '', 'F', '', 'S'];
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * The last 12 weeks, one column per week (Monday on top); ink dot = trained, ruled ring = rest day.
 * Month names sit over the week each month starts in. Days after today are left off.
 */
function CalendarStrip({ workouts }: { workouts: Workout[] }) {
  const days = calendarDays(workouts);
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7) - (WEEKS - 1) * 7);
  const weeks = Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + w * 7 + i);
      return { key: dayKey(d), date: d, on: days.has(dayKey(d)), future: d > today };
    }),
  );
  return (
    <div className="px-margin pb-4 pt-1" data-tour="history-calendar" role="img" aria-label={`${[...days.keys()].length} training days in the last ${WEEKS} weeks`}>
      <div className="flex gap-1">
        <div className="mt-[18px] flex w-3 flex-col gap-1">
          {DAY_LABELS.map((l, i) => (
            <span key={i} className="t-meta h-3 text-[9px] leading-3 tracking-normal text-pencil">
              {l}
            </span>
          ))}
        </div>
        <div>
          <div className="relative mb-1 h-3.5">
            {weeks.map((w, i) => {
              const first = w[0]!.date;
              const prev = weeks[i - 1]?.[0]!.date;
              if (prev && prev.getMonth() === first.getMonth()) return null;
              return (
                <span key={i} className="t-meta absolute text-[10px] leading-[14px] text-pencil" style={{ left: i * 16 }}>
                  {first.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                </span>
              );
            })}
          </div>
          <div className="flex gap-1">
            {weeks.map((w, i) => (
              <div key={i} className="flex flex-col gap-1">
                {w.map((c) => (
                  <span key={c.key} className={cx('h-3 w-3 rounded-full', c.on ? 'border border-ink bg-ink' : c.future ? '' : 'border border-rule')} title={c.date.toDateString()} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function HistoryScreen() {
  const unit = useSettings().unit;
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
  const shown = selected && items.some((i) => i.id === selected) ? selected : (items[0]?.id ?? null);

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
  const streak = weekStreak(recent, Date.now());
  const meta = streak ? `${streak} WEEK${streak > 1 ? 'S' : ''} IN A ROW` : 'FULL HISTORY, FOREVER';
  const list = (
    <>
      <CalendarStrip workouts={recent} />
      <div className="h-px bg-rule" />
      {items.map((item, index) => (
        <RuledRow
          key={item.id}
          tour={index === 0 ? 'history-list' : undefined}
          onClick={() => (wide ? setSelected(item.id) : navigate({ name: 'workoutDetail', id: item.id }))}
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
  if (!full) return <div className="min-h-full" />;
  // Totals from the workout already loaded. PRs come from the stored table, so nothing here re-reads the whole history.
  const done = full.exercises.flatMap((e) => e.sets).filter((s) => s.completedAt != null);
  const durationMs = full.workout.endedAt ? full.workout.endedAt - full.workout.startedAt : 0;
  const labels = groupLabels(full.exercises);
  const prSets = new Set(prs.map((x) => x.setId));
  const w = full.workout;
  return (
    <Screen title={w.title} backButton={page} meta={new Date(w.startedAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: clock === '12h' }).toUpperCase()}>
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
