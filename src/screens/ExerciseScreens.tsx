// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { createExercise, getExercise, resetExercise, setHidden, updateExercise, type Exercise, type ExerciseInput } from '@/db/exercises';
import { prsForExercise, type PrRow } from '@/db/repos';
import { db } from '@/db/schema';
import { useSettings } from '@/db/settings';
import { exerciseHistory, toLoggedSet, type WorkoutSet } from '@/db/workouts';
import { formatClock, formatSet, formatWeight, parseWeightInput } from '@/engine/math/units';
import { repMaxTable } from '@/engine/prs/detect';
import { e1rmTrend } from '@/engine/stats/stats';
import { BUILT_IN_EQUIPMENT, equipmentLabel, MUSCLE_LABEL, MUSCLES, type Equipment, type LoggingMode, type Muscle } from '@/engine/types';
import { useData } from '@/features/data';
import { back, navigate } from '@/features/nav';
import { LineChart } from '@/components/LineChart';
import { ChoiceRow, cx, Field, KeyValue, MarginNote, Pad, RuledRow, Screen, Section, Segmented, TextArea } from '@/components/ui';

export function ExerciseDetailScreen({ id }: { id: string }) {
  const unit = useSettings().unit;
  const ex = useData((d) => getExercise(d, id), [id], undefined as Exercise | null | undefined);
  const sets = useData((d) => exerciseHistory(d, id), [id], [] as WorkoutSet[]);
  const prs = useData((d) => prsForExercise(d, id), [id], [] as PrRow[]);
  if (!ex) return <div className="min-h-full" />;
  const logged = sets.map(toLoggedSet);
  const trend = e1rmTrend(logged);
  const table = repMaxTable(logged);
  const timed = sets.filter((s) => s.timeMs);
  const longest = timed.length ? Math.max(...timed.map((s) => s.timeMs!)) : null;
  const sessions = new Set(sets.map((s) => s.workoutId)).size;
  const best = trend.length ? Math.max(...trend.map((t) => t.value)) : null;

  return (
    <Screen
      title={ex.name}
      backButton
      meta={`${sessions} SESSIONS · ${equipmentLabel(ex.equipment).toUpperCase()}`}
      right={
        <button type="button" className="btn-secondary btn-compact mb-1" onClick={() => navigate({ name: 'exerciseEdit', id })}>
          Edit
        </button>
      }
    >
      <Pad className="flex flex-col gap-1">
        <MarginNote>
          Primary: {ex.primary.map((m) => MUSCLE_LABEL[m]).join(', ') || 'none'}
          {ex.secondary.length ? ` · secondary (${ex.secondaryCredit} set): ${ex.secondary.map((m) => MUSCLE_LABEL[m]).join(', ')}` : ''}
        </MarginNote>
        {ex.stickyNote ? (
          <MarginNote className="flex items-center gap-1">
            <NotebookPen size={13} strokeWidth={1.75} aria-label="Sticky note" /> {ex.stickyNote}
          </MarginNote>
        ) : null}
      </Pad>

      {trend.length > 1 ? (
        <Section title="ESTIMATED MAX">
          <LineChart points={trend.map((t) => ({ x: t.date, y: t.value }))} format={(g) => formatWeight(Math.round(g / 500) * 500, unit)} />
          {best ? (
            <Pad>
              <p className="t-num-m text-ink2">
                Best e1RM {formatWeight(best, unit)} {unit}
              </p>
            </Pad>
          ) : null}
        </Section>
      ) : null}

      {table.some((v) => v != null) ? (
        <Section title="REP MAXES (1–20RM)">
          <div className="flex flex-wrap px-3">
            {table.map((g, i) => (
              <div key={i} className="flex w-1/5 flex-col items-center py-1.5" aria-label={g ? `${i + 1} rep max ${formatWeight(g, unit)} ${unit}` : `${i + 1} rep max none`}>
                <span className="t-meta text-pencil">{`${i + 1}RM`}</span>
                <span className="t-num-m">{g ? formatWeight(g, unit) : '—'}</span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {longest ? (
        <Section title="HOLDS">
          <KeyValue k="Longest hold" v={formatClock(longest)} />
        </Section>
      ) : null}

      {prs.length ? (
        <Section title="PR LOG">
          {prs.slice(0, 20).map((p) => (
            <RuledRow key={p.id} onClick={() => navigate({ name: 'share', kind: 'pr', id: p.id })} label={p.message}>
              <span className="flex-1">{p.message}</span>
              <span className="t-num-m text-pencil">{new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</span>
            </RuledRow>
          ))}
        </Section>
      ) : null}

      <Section title="RECENT SETS">
        {sets.length === 0 ? (
          <Pad>
            <p className="text-pencil">Not logged yet.</p>
          </Pad>
        ) : (
          sets
            .slice(-15)
            .reverse()
            .map((s) => (
              <RuledRow key={s.id}>
                <span className="t-num-m flex-1">{s.timeMs ? formatClock(s.timeMs) : formatSet(s.weightG, s.reps, unit)}</span>
                <span className="t-num-m text-pencil">{new Date(s.completedAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </RuledRow>
            ))
        )}
      </Section>

      {ex.instructions.length ? (
        <Section title="HOW TO">
          <Pad className="flex flex-col gap-1.5">
            {ex.instructions.map((line, i) => (
              <p key={i} className="text-ink2">
                {line}
              </p>
            ))}
          </Pad>
        </Section>
      ) : null}

      <Section>
        <Pad className="flex flex-col gap-2">
          {sets.length > 1 ? (
            <button type="button" className="btn-secondary" onClick={() => navigate({ name: 'share', kind: 'progress', id })}>
              Share progress
            </button>
          ) : null}
          <button type="button" className="btn-ghost" onClick={() => void setHidden(db, id, !ex.hidden)}>
            {ex.hidden ? 'Show in library' : 'Hide from library'}
          </button>
        </Pad>
      </Section>
    </Screen>
  );
}

const CUSTOM = 'custom';
const isBuiltIn = (e: string) => (BUILT_IN_EQUIPMENT as readonly string[]).includes(e);
const MODES: { value: LoggingMode; label: string }[] = [
  { value: 'weightReps', label: 'Weight × reps' },
  { value: 'bodyweight', label: 'Bodyweight ± weight' },
  { value: 'assisted', label: 'Assisted' },
  { value: 'time', label: 'Time' },
  { value: 'distance', label: 'Distance' },
  { value: 'reps', label: 'Reps only' },
];

/** Tap once for primary (full set), twice for secondary (fractional), three times to clear. */
function MuscleChip({ m, state, onClick }: { m: Muscle; state: 'primary' | 'secondary' | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${MUSCLE_LABEL[m]}: ${state ?? 'not worked'}`}
      className={cx('t-label min-h-touch rounded-control px-3 transition-colors hover:bg-sunk', state === 'primary' ? 'border-2 border-ink text-ink' : state === 'secondary' ? 'border border-dashed border-ink text-ink' : 'border border-rule text-ink2')}
    >
      {MUSCLE_LABEL[m]}
      {state === 'primary' ? ' · 1' : state === 'secondary' ? ' · ½' : ''}
    </button>
  );
}

export function ExerciseEditScreen({ id }: { id?: string }) {
  const ex = useData((d) => (id ? getExercise(d, id) : Promise.resolve(null)), [id], undefined as Exercise | null | undefined);
  if (ex === undefined) return <div className="min-h-full" />;
  return <EditExercise key={id ?? 'new'} id={id} ex={ex} />;
}

function EditExercise({ id, ex }: { id?: string; ex: Exercise | null }) {
  const unit = useSettings().unit;
  const [name, setName] = useState(ex?.name ?? '');
  const [primary, setPrimary] = useState<Muscle[]>(ex?.primary ?? []);
  const [secondary, setSecondary] = useState<Muscle[]>(ex?.secondary ?? []);
  const [credit, setCredit] = useState(String(ex?.secondaryCredit ?? 0.5));
  // Anything outside the built-in list is the user's own text; the "Custom…" option reveals the field.
  const [equipment, setEquipment] = useState<string>(ex ? (isBuiltIn(ex.equipment) ? ex.equipment : CUSTOM) : 'barbell');
  const [customEquip, setCustomEquip] = useState(ex && !isBuiltIn(ex.equipment) && ex.equipment !== 'other' ? ex.equipment : '');
  const [mode, setMode] = useState<LoggingMode>(ex?.mode ?? 'weightReps');
  const [unilateral, setUnilateral] = useState(ex?.unilateral ?? false);
  const [increment, setIncrement] = useState(formatWeight(ex?.incrementG ?? 2500, unit));
  const [rest, setRest] = useState(String(Math.round((ex?.defaultRestMs ?? 120000) / 1000)));
  const [aliases, setAliases] = useState((ex?.aliases ?? []).join(', '));
  const [link, setLink] = useState(ex?.link ?? '');
  const [notes, setNotes] = useState(ex?.notes ?? '');

  const cycle = (m: Muscle) => {
    if (primary.includes(m)) {
      setPrimary(primary.filter((x) => x !== m));
      setSecondary([...secondary, m]);
    } else if (secondary.includes(m)) setSecondary(secondary.filter((x) => x !== m));
    else setPrimary([...primary, m]);
  };

  const save = async () => {
    const input: ExerciseInput = {
      name: name.trim() || 'Untitled exercise',
      primary,
      secondary,
      secondaryCredit: Math.max(0, Math.min(1, Number(credit.replace(',', '.')) || 0.5)),
      equipment: equipment === CUSTOM ? customEquip.trim() || 'other' : (equipment as Equipment),
      mode,
      unilateral,
      incrementG: parseWeightInput(increment, unit) ?? 2500,
      defaultRestMs: (Number(rest) || 120) * 1000,
      aliases: aliases
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      link: link.trim() || null,
      notes: notes.trim() || null,
    };
    if (id) await updateExercise(db, id, input);
    else await createExercise(db, input);
    back();
  };

  return (
    <Screen
      title={id ? 'Edit exercise' : 'New exercise'}
      backButton
      meta={ex?.source === 'seed' ? 'BUILT-IN · YOUR EDITS SURVIVE LIBRARY UPDATES' : 'CUSTOM'}
      footer={
        <button type="button" className="btn-primary w-full" onClick={() => void save()}>
          Save
        </button>
      }
    >
      <Pad className="flex flex-col gap-3">
        <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!id} />
        <Field label="Other names (for search and imports), comma separated" value={aliases} onChange={(e) => setAliases(e.target.value)} />
      </Pad>
      <Section title="MUSCLES · TAP ONCE PRIMARY, TWICE SECONDARY">
        <Pad className="flex flex-wrap gap-2">
          {MUSCLES.map((m) => (
            <MuscleChip key={m} m={m} state={primary.includes(m) ? 'primary' : secondary.includes(m) ? 'secondary' : null} onClick={() => cycle(m)} />
          ))}
        </Pad>
        <Pad className="pt-2">
          <Field label="Set credit for secondary muscles (0–1)" value={credit} onChange={(e) => setCredit(e.target.value)} inputMode="decimal" />
        </Pad>
      </Section>
      <Section title="EQUIPMENT">
        <Pad>
          <Segmented label="Equipment" value={equipment} onChange={setEquipment} options={[...BUILT_IN_EQUIPMENT.map((e) => ({ value: e as string, label: equipmentLabel(e) })), { value: CUSTOM, label: 'Custom…' }]} />
          {equipment === CUSTOM ? (
            <div className="pt-2">
              <Field label="Equipment name" value={customEquip} onChange={(e) => setCustomEquip(e.target.value)} placeholder="e.g. Landmine, Sled, Trap bar" autoFocus maxLength={30} />
            </div>
          ) : null}
        </Pad>
      </Section>
      <Section title="LOGGED AS">
        <ChoiceRow label="Logging mode">
          <Segmented label="Logging mode" value={mode} onChange={setMode} options={MODES} />
        </ChoiceRow>
        <ChoiceRow label="Sides">
          <Segmented label="Unilateral" value={unilateral ? 'yes' : 'no'} onChange={(v) => setUnilateral(v === 'yes')} options={[{ value: 'no', label: 'Both sides together' }, { value: 'yes', label: 'One side at a time (L/R)' }]} />
        </ChoiceRow>
      </Section>
      <Section title="DEFAULTS">
        <Pad className="flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <Field label={`Increment (${unit})`} value={increment} onChange={(e) => setIncrement(e.target.value)} inputMode="decimal" />
            </div>
            <div className="flex-1">
              <Field label="Rest (seconds)" value={rest} onChange={(e) => setRest(e.target.value)} inputMode="numeric" />
            </div>
          </div>
          <Field label="Video or link" value={link} onChange={(e) => setLink(e.target.value)} autoCapitalize="none" inputMode="url" />
          <TextArea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          {ex?.source === 'seed' && ex.edited ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={async () => {
                await resetExercise(db, ex.id);
                back();
              }}
            >
              Reset to the library version
            </button>
          ) : null}
        </Pad>
      </Section>
    </Screen>
  );
}
