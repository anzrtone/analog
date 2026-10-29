// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useMemo, useState } from 'react';
import { getExercises, type Exercise } from '@/db/exercises';
import { getRun, prsForWorkout, type PrRow, type RunRow } from '@/db/repos';
import { useSettings } from '@/db/settings';
import { getWorkout, type FullWorkout } from '@/db/workouts';
import { formatDuration, formatWeight } from '@/engine/math/units';
import { MUSCLE_LABEL, type Muscle } from '@/engine/types';
import { summarise, type WorkoutSummary } from '@/services/workoutFlow';
import { useData } from '@/features/data';
import { navigate } from '@/features/nav';
import { lastFinish } from '@/features/workout/actions';
import { Stamp } from '@/components/Brand';
import { FeedbackFlow, painQuestion, pumpQuestion, workloadQuestion } from '@/components/Feedback';
import { KeyValue, MarginNote, Pad, RuledRow, Screen, Section } from '@/components/ui';

/** After Finish: duration, sets, volume, PRs with stamps, the quick feedback and what changes next week. */
export function SummaryScreen({ id }: { id: string }) {
  const unit = useSettings().unit;
  const last = lastFinish.use();
  const full = useData((d) => getWorkout(d, id), [id], undefined as FullWorkout | null | undefined);
  const summary = useData((d) => summarise(d, id, unit), [id, unit], null as WorkoutSummary | null);
  const prs = useData((d) => prsForWorkout(d, id), [id], [] as PrRow[]);
  const runId = full?.workout.runId ?? null;
  const run = useData((d) => (runId ? getRun(d, runId) : Promise.resolve(null)), [runId], null as RunRow | null);
  const exIds = full?.exercises.map((e) => e.exerciseId).join() ?? '';
  const infos = useData((d) => getExercises(d, exIds ? exIds.split(',') : []), [exIds], new Map<string, Exercise>());
  const [asking, setAsking] = useState(true);

  const adaptive = !!run && !!run.program.blocks[full?.workout.blockIndex ?? 0]?.adaptive;
  const questions = useMemo(() => {
    if (!adaptive || !full) return [];
    const qs = full.exercises
      .filter((e) => e.sets.some((x) => x.completedAt))
      .flatMap((e) => {
        const ex = infos.get(e.exerciseId);
        return [pumpQuestion(ex?.name ?? 'this exercise', ex?.primary[0], e.exerciseId, e.slotId), painQuestion(ex?.name ?? 'this exercise', e.exerciseId, e.slotId)];
      });
    const muscles = [...new Set([...infos.values()].flatMap((x) => x.primary))] as Muscle[];
    return [...qs, ...muscles.map(workloadQuestion)];
  }, [adaptive, full, infos]);

  if (!full || !summary) return <div className="min-h-full" />;
  const muscles = (Object.entries(summary.muscles) as [Muscle, number][]).sort((a, b) => b[1] - a[1]);
  const runUpdate = last.run;

  return (
    <Screen
      title={full.workout.title}
      meta={`DONE · ${new Date(full.workout.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}`}
      footer={
        <button type="button" className="btn-primary w-full" onClick={() => navigate({ name: 'today' })}>
          Done
        </button>
      }
      tour="summary"
    >
      <Section>
        <KeyValue k="Duration" v={formatDuration(summary.durationMs)} />
        <KeyValue k="Sets" v={String(summary.sets)} />
        <KeyValue k="Volume" v={`${formatWeight(summary.volumeG, unit)} ${unit}`} />
      </Section>

      {prs.length ? (
        <Section title="PERSONAL RECORDS">
          {prs.map((p) => (
            <RuledRow key={p.id} onClick={() => navigate({ name: 'share', kind: 'pr', id: p.id })} label={`${p.message}. Share`}>
              <Stamp kind="PR" />
              <span className="min-w-0 flex-1">
                <span className="t-label block">{infos.get(p.exerciseId)?.name}</span>
                <span className="t-num-m block">{p.message.replace(/^New PR: /, '')}</span>
              </span>
              <span className="text-pencil">Share</span>
            </RuledRow>
          ))}
        </Section>
      ) : null}

      {adaptive && asking && questions.length ? (
        <Section title="QUICK FEEDBACK">
          <FeedbackFlow questions={questions} workoutId={id} runId={full.workout.runId} onDone={() => setAsking(false)} />
        </Section>
      ) : null}

      {runUpdate?.cards.length ? (
        <Section title="NEXT WEEK">
          <Pad className="flex flex-col gap-1.5">
            {runUpdate.cards.map((c) => (
              <MarginNote key={c}>{c}</MarginNote>
            ))}
          </Pad>
        </Section>
      ) : null}

      {runUpdate?.mesoReport ? (
        <Section title="MESOCYCLE">
          <Pad className="flex flex-col gap-2">
            <Stamp kind="MESO DONE" />
            <p className="t-title-m">{runUpdate.mesoReport.headline}</p>
            <button type="button" className="btn-secondary" onClick={() => navigate({ name: 'mesoReport', runId: runId ?? undefined })}>
              See the meso report
            </button>
          </Pad>
        </Section>
      ) : null}

      <Section title="MUSCLES">
        {muscles.map(([m, v]) => (
          <KeyValue key={m} k={MUSCLE_LABEL[m]} v={`${v} set${v === 1 ? '' : 's'}`} />
        ))}
      </Section>

      <Section>
        <Pad>
          <button type="button" className="btn-secondary w-full" onClick={() => navigate({ name: 'share', kind: 'workout', id })}>
            Share this workout
          </button>
        </Pad>
      </Section>
    </Screen>
  );
}
