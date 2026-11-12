// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useState } from 'react';
import { getExercises, toInfo, type Exercise } from '@/db/exercises';
import { activeRun, loadLandmarks, recentPrs, type PrRow, type RunRow } from '@/db/repos';
import { useSettings } from '@/db/settings';
import { activeWorkout, finishedWorkouts, hasHistory, setsBetween, toLoggedSet, type Workout, type WorkoutSet } from '@/db/workouts';
import { formatSet } from '@/engine/math/units';
import { DEFAULT_LANDMARKS } from '@/engine/meso/landmarks';
import { startOfWeek, weekStreak } from '@/engine/stats/stats';
import { MUSCLE_LABEL, type Muscle } from '@/engine/types';
import { countVolume } from '@/engine/volume/count';
import { planDay } from '@/services/programFlow';
import { useData } from '@/features/data';
import { engineSettings, rounder } from '@/features/gym';
import { navigate } from '@/features/nav';
import { useWide } from '@/features/responsive';
import { startEmptyWorkout, startNextProgramDay } from '@/features/workout/actions';
import { Stamp } from '@/components/Brand';
import { VolumeBand } from '@/components/Charts';
import { SetTypeRing } from '@/components/PlateRing';
import { EmptyState, MarginNote, Pad, RuledRow, Screen, Section } from '@/components/ui';

function today(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase().replace(',', ' ·');
}

/** The page you open at the gym: the workout in progress, the next program day, or a blank page to start one. */
export function TodayScreen() {
  const wide = useWide();
  const s = useSettings();
  const active = useData((d) => activeWorkout(d), [], undefined as Workout | null | undefined);
  const run = useData((d) => activeRun(d), [], null as RunRow | null);
  const runKey = run ? `${run.id}:${JSON.stringify(run.state)}` : '';
  const plan = useData(async (d) => (run ? planDay(d, run, engineSettings(), await rounder(d)) : null), [runKey], null);
  const names = useData((d) => getExercises(d, plan?.slots.map((p) => p.slot.exerciseId) ?? []), [plan], new Map<string, Exercise>());
  const anyHistory = useData((d) => hasHistory(d), [], true);

  if (active === undefined) return <div className="min-h-full" />;
  return (
    <Screen title="Today" meta={today()} maxWidth={wide ? 1160 : 880}>
      <div className="wide:flex wide:items-start wide:gap-8">
        <div className="min-w-0 flex-1">
          {active ? (
            <Section title="IN PROGRESS">
              <RuledRow onClick={() => navigate({ name: 'workout', id: active.id })} label={`Resume ${active.title}`}>
                <span className="t-title-m flex-1">{active.title}</span>
                <span className="text-ink2">Resume</span>
              </RuledRow>
            </Section>
          ) : null}

          {plan && run ? (
            <Section title={plan.meta}>
              <Pad className="flex flex-col gap-1 pb-2">
                <p className="t-title-m">{plan.title}</p>
                <MarginNote>{run.program.name}</MarginNote>
              </Pad>
              {plan.slots.map((p) => (
                <RuledRow key={p.slot.id}>
                  <SetTypeRing type={p.targets[0]?.type ?? 'working'} index={0} state="pending" />
                  <span className="min-w-0 flex-1">
                    <span className="block">{names.get(p.slot.exerciseId)?.name ?? p.slot.exerciseId}</span>
                    <MarginNote>{p.output.explanation}</MarginNote>
                  </span>
                  <span className="t-num-m text-ink2">
                    {p.targets.length} × {p.targets[0]?.timeMs ? `${Math.round(p.targets[0].timeMs / 1000)}s` : formatSet(p.targets[0]?.weightG ?? null, p.targets[0]?.reps ?? null, s.unit)}
                  </span>
                </RuledRow>
              ))}
              {run.state.lastPlan?.cards.length ? (
                <Pad className="flex flex-col gap-1 pt-2">
                  <p className="t-meta text-green-text">THIS WEEK&apos;S VOLUME</p>
                  {run.state.lastPlan.cards.map((c) => (
                    <MarginNote key={c}>{c}</MarginNote>
                  ))}
                  {run.state.lastPlan.deload ? <p className="text-green-text">{run.state.lastPlan.deload}</p> : null}
                </Pad>
              ) : null}
              <Pad className="pt-3">
                <button type="button" className={`${active ? 'btn-secondary' : 'btn-primary'} w-full`} onClick={() => void startNextProgramDay()} disabled={!!active}>
                  {`Start ${plan.title}`}
                </button>
              </Pad>
            </Section>
          ) : null}

          {!anyHistory && !active && !run ? (
            <div data-tour="today-start">
              <EmptyState line="Blank page. Start your first workout." action="Start a workout" onAction={() => void startEmptyWorkout()} />
            </div>
          ) : (
            <Section title="AD-HOC" tour="today-start">
              <Pad>
                <button type="button" className={`${run || active ? 'btn-secondary' : 'btn-primary'} w-full`} onClick={() => void startEmptyWorkout()} disabled={!!active}>
                  Start an empty workout
                </button>
              </Pad>
            </Section>
          )}

          {!anyHistory ? (
            <Section title="BRING YOUR HISTORY" tour="today-import">
              <RuledRow onClick={() => navigate({ name: 'import' })} label="Import from Strong or Hevy">
                <span className="flex-1">Import your Strong or Hevy history</span>
                <span className="text-pencil">CSV</span>
              </RuledRow>
              <RuledRow onClick={() => navigate({ name: 'backup' })} label="Restore from a backup">
                <span className="flex-1">Restore an Analog backup</span>
                <span className="text-pencil">JSON</span>
              </RuledRow>
            </Section>
          ) : null}
        </div>
        {wide ? <WeekGlance /> : null}
      </div>
    </Screen>
  );
}

/** Desktop Today, right-hand column: this week's sets against your landmarks, and the latest PRs. */
function WeekGlance() {
  const [now] = useState(() => Date.now());
  const weekStart = useSettings().weekStart;
  const from = startOfWeek(now, weekStart);
  const data = useData(
    async (d) => {
      const sets = await setsBetween(d, from, now + 7 * 86400000);
      const [infos, lms, prs, workouts] = await Promise.all([getExercises(d, sets.map((x) => x.exerciseId)), loadLandmarks(d), recentPrs(d, 4), finishedWorkouts(d, now - 400 * 86400000)]);
      const prNames = await getExercises(d, prs.map((x) => x.exerciseId));
      return { sets, infos, lms, prs, prNames, streak: weekStreak(workouts, now, weekStart) };
    },
    [from, weekStart],
    { sets: [] as WorkoutSet[], infos: new Map<string, Exercise>(), lms: DEFAULT_LANDMARKS, prs: [] as PrRow[], prNames: new Map<string, Exercise>(), streak: 0 },
  );
  const vol = countVolume(data.sets.map(toLoggedSet), new Map([...data.infos.values()].map((e) => [e.id, toInfo(e)])));
  const muscles = (Object.entries(vol) as [Muscle, number][]).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return (
    <aside className="flex w-[340px] shrink-0 flex-col gap-4 pt-4">
      <div className="flex flex-col gap-1.5 rounded-sheet bg-raised p-[18px]">
        <p className="t-meta text-pencil">THIS WEEK</p>
        <div className="flex gap-7">
          {[
            [new Set(data.sets.map((x) => x.workoutId)).size, 'WORKOUTS'],
            [data.sets.length, 'SETS'],
            [data.streak, 'WEEK STREAK'],
          ].map(([n, label]) => (
            <div key={label}>
              <p className="t-num-l">{n}</p>
              <p className="t-meta text-pencil">{label}</p>
            </div>
          ))}
        </div>
        {muscles.length ? (
          <div className="mt-2">
            {muscles.map(([m, v]) => (
              <VolumeBand key={m} label={MUSCLE_LABEL[m]} sets={v} lm={data.lms[m]} />
            ))}
          </div>
        ) : (
          <p className="mt-1.5 text-ink2">No sets yet this week. Every set you tick shows up here against your MEV and MRV.</p>
        )}
      </div>
      {data.prs.length ? (
        <button type="button" onClick={() => navigate({ name: 'stats' })} className="flex flex-col gap-2.5 rounded-sheet bg-raised p-[18px] text-left">
          <p className="t-meta text-pencil">LATEST PRS</p>
          {data.prs.map((x) => (
            <span key={x.id} className="flex items-center gap-2.5">
              <Stamp kind="PR" animate={false} />
              <span className="min-w-0 flex-1">
                <span className="t-label block truncate">{data.prNames.get(x.exerciseId)?.name}</span>
                <span className="t-num-m block truncate text-[13px] text-ink2">{x.message.replace(/^New PR: /, '')}</span>
              </span>
            </span>
          ))}
        </button>
      ) : null}
    </aside>
  );
}
