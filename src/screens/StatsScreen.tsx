// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getExercises, toInfo, type Exercise } from '@/db/exercises';
import { activeRun, listMeasurements, loadLandmarks, recentPrs, type MeasurementRow, type PrRow, type RunRow } from '@/db/repos';
import { useSettings } from '@/db/settings';
import { finishedWorkouts, firstWorkoutAt, setsBetween, toLoggedSet, type Workout, type WorkoutSet } from '@/db/workouts';
import { formatDuration, formatWeight } from '@/engine/math/units';
import { DEFAULT_LANDMARKS } from '@/engine/meso/landmarks';
import { adherence, averageDurationMs, plannedSessions, weekStreak } from '@/engine/stats/stats';
import { MUSCLE_LABEL, type Muscle } from '@/engine/types';
import { countVolume, volumeLoadG } from '@/engine/volume/count';
import { useData } from '@/features/data';
import { navigate } from '@/features/nav';
import { Stamp } from '@/components/Brand';
import { VolumeBand } from '@/components/Charts';
import { Heatmap } from '@/components/Heatmap';
import { LineChart } from '@/components/LineChart';
import { EmptyState, IconButton, KeyValue, MarginNote, Pad, RuledRow, Screen, Section, Segmented } from '@/components/ui';

type Period = 'week' | 'month' | 'year';
const DAY = 86400000;
const fmt = (ms: number, o: Intl.DateTimeFormatOptions) => new Date(ms).toLocaleDateString(undefined, o);
const mondayOf = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
};

/**
 * Calendar bounds of the week (Mon–Sun), month or year `offset` periods before the current one.
 * Periods are numbered from the one holding `origin` (the first logged workout), which is number 1.
 */
export function periodRange(period: Period, offset: number, origin: number, nowMs = Date.now()): { from: number; to: number; title: string; sub: string; count: number } {
  const now = new Date(nowMs);
  const o = new Date(origin);
  if (period === 'week') {
    const cur = mondayOf(now.getTime());
    const count = Math.round((cur.getTime() - mondayOf(origin).getTime()) / (7 * DAY)) + 1;
    const start = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() - offset * 7);
    const to = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7).getTime();
    const last = to - DAY;
    const sameYear = start.getFullYear() === new Date(last).getFullYear();
    const a = fmt(start.getTime(), sameYear ? { month: 'long', day: 'numeric' } : { month: 'long', day: 'numeric', year: 'numeric' });
    return { from: start.getTime(), to, title: `Week ${count - offset}`, sub: `${a} – ${fmt(last, { month: 'long', day: 'numeric', year: 'numeric' })}`, count };
  }
  if (period === 'month') {
    const count = (now.getFullYear() - o.getFullYear()) * 12 + now.getMonth() - o.getMonth() + 1;
    const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    return { from: start.getTime(), to: end.getTime(), title: `Month ${count - offset}`, sub: fmt(start.getTime(), { month: 'long', year: 'numeric' }), count };
  }
  const count = now.getFullYear() - o.getFullYear() + 1;
  const start = new Date(now.getFullYear() - offset, 0, 1);
  const end = new Date(start.getFullYear() + 1, 0, 1);
  return { from: start.getTime(), to: end.getTime(), title: `Year ${count - offset}`, sub: `January 1 – December 31, ${start.getFullYear()}`, count };
}

export function StatsScreen() {
  const unit = useSettings().unit;
  const [now] = useState(() => Date.now());
  const [{ period, offset, epoch }, setNav] = useState<{ period: Period; offset: number; epoch: number }>({ period: 'week', offset: 0, epoch: 0 });
  const firstAt = useData((d) => firstWorkoutAt(d), [], null as number | null);
  const { from, to, title, sub, count } = periodRange(period, offset, firstAt ?? now, now);
  // Average over the time the user was actually logging: not before their first week, not past today.
  const since = Math.max(from, mondayOf(firstAt ?? now).getTime());
  const weeks = Math.max(1, (Math.min(to, now) - since) / (7 * DAY));
  const range = useData(
    async (d) => {
      const sets = await setsBetween(d, from, to);
      return { sets, infos: await getExercises(d, sets.map((s) => s.exerciseId)) };
    },
    [from, to],
    { sets: [] as WorkoutSet[], infos: new Map<string, Exercise>() },
  );
  const vol = useMemo(() => {
    const raw = countVolume(range.sets.map(toLoggedSet), new Map([...range.infos.values()].map((e) => [e.id, toInfo(e)])));
    // Landmarks are per week, so longer periods show the average weekly sets.
    if (period === 'week') return raw;
    return Object.fromEntries(Object.entries(raw).map(([m, v]) => [m, Math.round((v / weeks) * 10) / 10])) as typeof raw;
  }, [range, period, weeks]);
  const lms = useData((d) => loadLandmarks(d), [], DEFAULT_LANDMARKS);
  const allWorkouts = useData((d) => finishedWorkouts(d), [], undefined as Workout[] | undefined);
  const prData = useData(
    async (d) => {
      const prs = await recentPrs(d, 10);
      return { prs, names: await getExercises(d, prs.map((p) => p.exerciseId)) };
    },
    [],
    { prs: [] as PrRow[], names: new Map<string, Exercise>() },
  );
  const run = useData((d) => activeRun(d), [], null as RunRow | null);
  const bw = useData((d) => listMeasurements(d, 'bodyweight'), [], [] as MeasurementRow[]);
  const monthSets = useData((d) => setsBetween(d, now - 30 * DAY, now + 1), [now], [] as WorkoutSet[]);
  const muscles = useMemo(() => (Object.entries(vol) as [Muscle, number][]).sort((a, b) => b[1] - a[1]), [vol]);
  const workouts = useMemo(() => (allWorkouts ?? []).filter((w) => w.startedAt >= now - 365 * DAY), [allWorkouts, now]);

  if (allWorkouts === undefined) return <div className="min-h-full" />;
  if (!allWorkouts.length) {
    return (
      <Screen title="Stats">
        <EmptyState line="Blank page. Stats appear after your first workout." />
      </Screen>
    );
  }
  const avg = averageDurationMs(workouts);
  const runWorkouts = run ? allWorkouts.filter((w) => w.runId === run.id) : [];
  const planned = run ? plannedSessions(run.startedAt, now, run.program.blocks[run.state.blockIndex]?.days.length ?? 0) : 0;
  const adh = run ? adherence(planned, runWorkouts.length) : null;
  const pick = (v: Period) => setNav((n) => (n.period === v ? n : { period: v, offset: 0, epoch: n.epoch + 1 }));
  const step = (by: 1 | -1) => setNav((n) => ({ ...n, offset: Math.max(0, n.offset + by), epoch: n.epoch + 1 }));

  return (
    <Screen title="Stats" meta={`${weekStreak(allWorkouts, now)} WEEK STREAK · ${workouts.length} WORKOUTS IN THE LAST 12 MONTHS`}>
      <Section title={period === 'week' ? 'WEEKLY SETS PER MUSCLE' : 'AVERAGE WEEKLY SETS PER MUSCLE'} tour="stats-volume">
        <Pad className="flex flex-col gap-3">
          <Segmented label="Period" value={period} onChange={pick} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} />
          <div className="flex items-center gap-2">
            <div key={epoch} className="flex flex-1 animate-page-in flex-col gap-0.5">
              <span className="t-label">{title}</span>
              <span className="text-pencil">{sub}</span>
            </div>
            <IconButton label={`Previous ${period}`} disabled={offset >= count - 1} onClick={() => step(1)}>
              <ChevronLeft size={20} />
            </IconButton>
            <IconButton label={`Next ${period}`} disabled={offset === 0} onClick={() => step(-1)}>
              <ChevronRight size={20} />
            </IconButton>
          </div>
        </Pad>
        <Pad className="pt-2">
          <div key={epoch} className="animate-page-in">
            {muscles.length === 0 ? <p className="text-pencil">No sets in this {period}.</p> : muscles.map(([m, v]) => <VolumeBand key={m} label={MUSCLE_LABEL[m]} sets={v} lm={lms[m]} />)}
          </div>
          <MarginNote>Secondary muscles count as a fraction of a set (0.5 by default, set per exercise).</MarginNote>
        </Pad>
        {muscles.length ? (
          <div className="pt-4">
            <Heatmap sets={vol} />
          </div>
        ) : null}
      </Section>

      {prData.prs.length ? (
        <Section title="RECENT PRS" tour="stats-prs">
          {prData.prs.map((p) => (
            <RuledRow key={p.id} onClick={() => navigate({ name: 'share', kind: 'pr', id: p.id })} label={p.message}>
              <Stamp kind="PR" animate={false} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="t-label">{prData.names.get(p.exerciseId)?.name}</span>
                <span className="t-num-m text-[13px] text-ink2">{p.message.replace(/^New PR: /, '')}</span>
              </span>
            </RuledRow>
          ))}
        </Section>
      ) : null}

      <Section title="TRAINING">
        <KeyValue k="Average session" v={avg ? formatDuration(avg) : '—'} />
        <KeyValue k="Tonnage, last 30 days" v={`${formatWeight(volumeLoadG(monthSets.map(toLoggedSet)), unit)} ${unit}`} />
        {adh != null ? <KeyValue k={`Program adherence (${run!.program.name})`} v={`${Math.round(adh * 100)}%`} /> : null}
      </Section>

      {bw.length > 1 ? (
        <Section title="BODYWEIGHT">
          <LineChart points={bw.map((m) => ({ x: m.date, y: m.value }))} format={(g) => formatWeight(g, unit)} />
        </Section>
      ) : null}

      <Section title="MORE">
        <RuledRow onClick={() => navigate({ name: 'measurements' })} label="Bodyweight, measurements and photos">
          <span className="flex-1">Bodyweight, measurements and photos</span>
        </RuledRow>
        {run?.state.lastReport ? (
          <RuledRow onClick={() => navigate({ name: 'mesoReport' })} label="Last meso report">
            <span className="flex-1">Last meso report</span>
            <Stamp kind="MESO DONE" animate={false} />
          </RuledRow>
        ) : null}
        <Pad className="flex gap-2 pt-4">
          <button type="button" className="btn-secondary flex-1" onClick={() => navigate({ name: 'share', kind: 'wrapped', id: 'month' })}>
            Month wrapped
          </button>
          <button type="button" className="btn-secondary flex-1" onClick={() => navigate({ name: 'share', kind: 'wrapped', id: 'year' })}>
            Year wrapped
          </button>
        </Pad>
      </Section>
    </Screen>
  );
}
