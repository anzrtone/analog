// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { activeRun, getRun, type RunRow } from '@/db/repos';
import { useSettings } from '@/db/settings';
import { formatWeight } from '@/engine/math/units';
import { MUSCLE_LABEL } from '@/engine/types';
import { useData } from '@/features/data';
import { navigate } from '@/features/nav';
import { Stamp } from '@/components/Brand';
import { PlateRing } from '@/components/PlateRing';
import { EmptyState, KeyValue, MarginNote, Pad, RuledRow, Screen, Section } from '@/components/ui';

/** End-of-meso report (SPEC §6.5): volume ramp, e1RM changes, best pumps, joint flags, learned landmarks. */
export function MesoReportScreen({ runId }: { runId?: string }) {
  const unit = useSettings().unit;
  const run = useData((d) => (runId ? getRun(d, runId) : activeRun(d)), [runId], undefined as RunRow | null | undefined);
  if (run === undefined) return <div className="min-h-full" />;
  const r = run?.state.lastReport;
  if (!run || !r) {
    return (
      <Screen title="Meso report" backButton>
        <EmptyState line="Finish a mesocycle and its report lands here." />
      </Screen>
    );
  }
  return (
    <Screen
      title="Meso report"
      backButton
      meta={`${run.program.name.toUpperCase()} · ${r.weeks} WEEKS`}
      footer={
        <button type="button" className="btn-primary w-full" onClick={() => navigate({ name: 'today' })}>
          Start next meso
        </button>
      }
    >
      <Pad className="flex flex-col gap-2">
        <Stamp kind="MESO DONE" />
        <p className="t-title-m">{r.headline}</p>
        <MarginNote>The next meso starts from your learned MEV, a little heavier than this meso&apos;s first week.</MarginNote>
      </Pad>

      <Section title="SETS PER MUSCLE, BY WEEK">
        {r.volume.map((v) => (
          <RuledRow key={v.muscle}>
            <span className="t-label w-[120px]">{MUSCLE_LABEL[v.muscle]}</span>
            <span className="flex flex-1 flex-wrap gap-1">
              {v.weeklySets.map((s, i) => (
                <PlateRing key={i} color={i > 0 && s > v.weeklySets[0]! ? 'green' : 'ink'} state="done" letter={String(Math.round(s))} size={26} label={`Week ${i + 1}: ${s} sets`} />
              ))}
            </span>
          </RuledRow>
        ))}
      </Section>

      <Section title="ESTIMATED MAX">
        {r.lifts.map((l) => (
          <KeyValue key={l.exerciseId} k={l.name} v={l.changePct == null ? '—' : `${l.changePct >= 0 ? '+' : ''}${(l.changePct * 100).toFixed(1)}%${l.end ? ` · ${formatWeight(l.end, unit)} ${unit}` : ''}`} />
        ))}
      </Section>

      {r.bestPump.length ? (
        <Section title="BEST PUMP">
          {r.bestPump.map((b) => (
            <KeyValue key={b.exerciseId} k={b.name} v={`${b.avgPump.toFixed(1)} / 3`} />
          ))}
        </Section>
      ) : null}

      {r.painFlags.length ? (
        <Section title="JOINT FLAGS">
          {r.painFlags.map((f) => (
            <Pad key={f.exerciseId}>
              <p className="text-red-text">{f.explanation}</p>
            </Pad>
          ))}
        </Section>
      ) : null}

      <Section title="LEARNED LANDMARKS">
        {r.landmarks.map((l) => (
          <RuledRow key={l.muscle}>
            <span className="flex-1">
              <span className="t-label block">{MUSCLE_LABEL[l.muscle]}</span>
              <MarginNote>{l.explanation.replace(`${MUSCLE_LABEL[l.muscle]}: `, '')}</MarginNote>
            </span>
            <span className="t-num-m text-ink2">
              {l.after.mev}–{l.after.mrv}
            </span>
          </RuledRow>
        ))}
      </Section>

      <Section>
        <Pad>
          <button type="button" className="btn-secondary w-full" onClick={() => navigate({ name: 'share', kind: 'meso', id: run.id })}>
            Share the recap
          </button>
        </Pad>
      </Section>
    </Screen>
  );
}
