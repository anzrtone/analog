// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useEffect, useState } from 'react';
import { getExercise, getExercises, toInfo } from '@/db/exercises';
import { activeRun, getProgram, getRun, prsForWorkout, recentPrs } from '@/db/repos';
import type { AnalogDB } from '@/db/schema';
import { settings, useSettings } from '@/db/settings';
import { exerciseHistory, finishedWorkouts, getWorkout, setsBetween, toLoggedSet } from '@/db/workouts';
import { estimate1rm } from '@/engine/math/e1rm';
import { formatClock, formatSet, formatWeight } from '@/engine/math/units';
import { programLink } from '@/engine/programs/share';
import { buildWrapped, e1rmTrend } from '@/engine/stats/stats';
import { MUSCLE_LABEL, type WeightUnit } from '@/engine/types';
import { countVolume, volumeLoadG } from '@/engine/volume/count';
import { summarise } from '@/services/workoutFlow';
import { useData } from '@/features/data';
import type { ShareKind } from '@/features/nav';
import { sharedExercises } from '@/features/programs';
import { FORMAT_SIZE, mesoCard, prCard, programCard, progressCard, workoutCard, wrappedCard, type CardFormat, type CardOptions } from '@/features/share/cards';
import { cardImageUrl, cardPng } from '@/features/share/render';
import { platform } from '@/platform';
import { carbon, paper } from '@/theme/tokens';
import { qrFits, qrPath } from '@/components/Qr';
import { ChoiceRow, Pad, Screen, Section, Segmented } from '@/components/ui';

const dateMeta = (ts: number, hide: boolean, extra: string) => (hide ? extra : `${new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()} · ${extra}`);

/** Builds the card's SVG from the database. Null when there's nothing to show. */
async function buildCard(d: AnalogDB, kind: ShareKind, id: string, o: CardOptions, unit: WeightUnit): Promise<string | null> {
  if (kind === 'pr') {
    const pr = (await d.prs.get(id)) ?? (await recentPrs(d, 1))[0];
    if (!pr) return null;
    const ex = await getExercise(d, pr.exerciseId);
    const set = (await exerciseHistory(d, pr.exerciseId)).find((s) => s.id === pr.setId);
    const prev = pr.kind === 'hold' ? (pr.previous ? formatClock(pr.previous) : null) : pr.kind === 'reps' ? formatSet(pr.atWeightG, pr.previous, unit) : pr.previous ? `${formatWeight(pr.previous, unit)} ${unit}` : null;
    const title = (await getWorkout(d, pr.workoutId))?.workout.title ?? 'PR';
    return prCard(o, { meta: dateMeta(pr.createdAt, o.hideDates, title.toUpperCase()), exercise: ex?.name ?? 'Lift', weightG: set?.weightG ?? (pr.kind === 'weight' ? pr.value : null), reps: set?.reps ?? null, timeMs: pr.kind === 'hold' ? pr.value : null, prevText: prev, unit, changePct: pr.previous ? (pr.value - pr.previous) / pr.previous : null });
  }
  if (kind === 'workout') {
    const full = await getWorkout(d, id);
    if (!full) return null;
    const infos = await getExercises(d, full.exercises.map((e) => e.exerciseId));
    const sum = await summarise(d, id, unit);
    return workoutCard(o, {
      meta: dateMeta(full.workout.startedAt, o.hideDates, full.workout.title.toUpperCase()),
      title: full.workout.title,
      rows: full.exercises.map((e) => ({ exercise: infos.get(e.exerciseId)?.name ?? '', sets: e.sets.filter((s) => s.completedAt).map((s) => ({ type: s.type, weightG: s.weightG, reps: s.reps, timeMs: s.timeMs })) })),
      durationMs: sum.durationMs,
      volumeG: sum.volumeG,
      prs: (await prsForWorkout(d, id)).length,
      unit,
    });
  }
  if (kind === 'progress') {
    const ex = await getExercise(d, id);
    const months = 6;
    const trend = e1rmTrend((await exerciseHistory(d, id)).map(toLoggedSet)).filter((t) => t.date > Date.now() - months * 30 * 86400000);
    if (trend.length < 2) return null;
    return progressCard(o, { meta: `LAST ${months} MONTHS`, exercise: ex?.name ?? '', points: trend.map((t) => ({ x: t.date, y: t.value })), unit, fromG: trend[0]!.value, toG: trend[trend.length - 1]!.value });
  }
  if (kind === 'meso') {
    const run = id ? await getRun(d, id) : await activeRun(d);
    const r = run?.state.lastReport;
    if (!run || !r) return null;
    return mesoCard(o, { meta: `${run.program.name.toUpperCase()} · MESO ${run.state.mesosDone ?? 1}`, weeks: r.weeks, headline: r.headline, muscles: r.volume.map((v) => ({ name: MUSCLE_LABEL[v.muscle], sets: v.weeklySets })), lifts: r.lifts.map((l) => ({ name: l.name, pct: l.changePct })) });
  }
  if (kind === 'wrapped') {
    const now = new Date();
    const month = id === 'month';
    const from = month ? new Date(now.getFullYear(), now.getMonth(), 1).getTime() : new Date(now.getFullYear(), 0, 1).getTime();
    const ws = await finishedWorkouts(d, from);
    const sets = (await setsBetween(d, from, Date.now() + 1)).map(toLoggedSet);
    const infos = await getExercises(d, sets.map((s) => s.exerciseId));
    const muscleSets = countVolume(sets, new Map([...infos.values()].map((e) => [e.id, toInfo(e)])));
    let top: { name: string; e1rmG: number } | null = null;
    for (const s of sets) {
      if (!s.weightG || !s.reps) continue;
      const e = estimate1rm(s.weightG, s.reps, s.rir).e1rm;
      if (!top || e > top.e1rmG) top = { name: infos.get(s.exerciseId)?.name ?? '', e1rmG: e };
    }
    const wr = buildWrapped({ workouts: ws, tonnageG: volumeLoadG(sets), topLift: top, muscleSets, now: Date.now(), weekStart: settings().weekStart });
    const label = month ? now.toLocaleDateString('en-US', { month: 'long' }) : String(now.getFullYear());
    return wrappedCard(o, { meta: `${label.toUpperCase()} · ${wr.streak} WEEK STREAK`, period: label, tonnageKg: wr.tonnageKg, comparison: wr.comparison, workouts: wr.workouts, hours: wr.hours, topLift: top, mostTrained: wr.mostTrained ? MUSCLE_LABEL[wr.mostTrained] : null, unit });
  }
  if (kind === 'program') {
    const pr = await getProgram(d, id);
    if (!pr) return null;
    const infos = await getExercises(d, pr.data.blocks.flatMap((b) => b.days.flatMap((x) => x.slots.map((s) => s.exerciseId))));
    const link = programLink({ program: pr.data, exercises: await sharedExercises(d, pr.data) });
    return programCard(o, { name: pr.name, days: (pr.data.blocks[0]?.days ?? []).map((x) => ({ name: x.name, exercises: x.slots.map((s) => infos.get(s.exerciseId)?.name ?? '') })), qr: qrFits(link) ? qrPath(link) : null });
  }
  return null;
}

/** Cards are made on the device and shared from it. Nothing is uploaded. */
export function ShareScreen({ kind, id }: { kind: ShareKind; id: string }) {
  const unit = useSettings().unit;
  const [format, setFormat] = useState<CardFormat>('story');
  const [theme, setTheme] = useState<'paper' | 'carbon'>('paper');
  const [hideWeights, setHideWeights] = useState(false);
  const [hideDates, setHideDates] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const svg = useData((d) => buildCard(d, kind, id, { format, hideWeights, hideDates, palette: theme === 'paper' ? paper : carbon }, unit), [kind, id, format, theme, hideWeights, hideDates, unit], undefined as string | null | undefined);
  useEffect(() => {
    let live = true;
    if (svg) void cardImageUrl(svg).then((u) => live && setImg(u));
    return () => {
      live = false;
    };
  }, [svg]);
  const { w, h } = FORMAT_SIZE[format];
  const android = platform().kind === 'android';

  const share = async () => {
    if (!svg) return;
    setStatus(null);
    try {
      const where = await platform().saveImage(`analog-${kind}-${new Date().toISOString().slice(0, 10)}.png`, await cardPng(svg, w, h));
      if (where && !android) setStatus(`Saved: ${where}`);
    } catch {
      setStatus("Couldn't make the image. Try again.");
    }
  };

  return (
    <Screen
      title="Share"
      backButton
      meta="MADE ON YOUR DEVICE · NOTHING UPLOADED"
      footer={
        <button type="button" className="btn-primary w-full" disabled={!svg} onClick={() => void share()}>
          {android ? 'Share' : 'Save image'}
        </button>
      }
    >
      <div className="flex justify-center py-2">
        {svg === null ? (
          <Pad>
            <p>Nothing to share here yet.</p>
          </Pad>
        ) : img ? (
          <img src={img} alt="Share card preview" className="rounded-[8px] border border-rule" style={{ width: Math.min(360, 520 * (w / h)), aspectRatio: `${w} / ${h}` }} />
        ) : (
          <div className="rounded-[8px] bg-sunk" style={{ width: Math.min(360, 520 * (w / h)), aspectRatio: `${w} / ${h}` }} />
        )}
      </div>
      {status ? (
        <Pad>
          <p className="text-ink2">{status}</p>
        </Pad>
      ) : null}
      <Section title="FORMAT">
        <ChoiceRow label="Size">
          <Segmented label="Format" value={format} onChange={setFormat} options={(Object.keys(FORMAT_SIZE) as CardFormat[]).map((f) => ({ value: f, label: FORMAT_SIZE[f].label }))} />
        </ChoiceRow>
        <ChoiceRow label="Theme">
          <Segmented label="Theme" value={theme} onChange={setTheme} options={[{ value: 'paper', label: 'Paper' }, { value: 'carbon', label: 'Carbon' }]} />
        </ChoiceRow>
        <ChoiceRow label="Weights">
          <Segmented label="Weights" value={hideWeights ? 'hide' : 'show'} onChange={(v) => setHideWeights(v === 'hide')} options={[{ value: 'show', label: 'Show weights' }, { value: 'hide', label: 'Hide (show %)' }]} />
        </ChoiceRow>
        <ChoiceRow label="Dates">
          <Segmented label="Dates" value={hideDates ? 'hide' : 'show'} onChange={(v) => setHideDates(v === 'hide')} options={[{ value: 'show', label: 'Show date' }, { value: 'hide', label: 'Hide date' }]} />
        </ChoiceRow>
      </Section>
    </Screen>
  );
}
