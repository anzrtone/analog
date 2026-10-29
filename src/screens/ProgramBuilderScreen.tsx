// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from 'lucide-react';
import { getExercises, type Exercise } from '@/db/exercises';
import { activeRun, archiveProgram, getProgram, saveProgram, startRun, type ProgramRow, type RunRow } from '@/db/repos';
import { db, newId } from '@/db/schema';
import { useSettings } from '@/db/settings';
import { formatClock, formatWeight, parseWeightInput } from '@/engine/math/units';
import { DEFAULT_LANDMARKS } from '@/engine/meso';
import { RULE_LABEL, defaultParams, type RuleParams, type RuleType, type TmParams } from '@/engine/progression';
import type { Block, Day, Program, ProgramSet, Slot } from '@/engine/programs/types';
import { setTypeInfo, type SetType } from '@/engine/setTypes';
import { groupLabels } from '@/engine/timer/rest';
import { MUSCLE_LABEL, type Muscle } from '@/engine/types';
import { useData } from '@/features/data';
import { back, navigate } from '@/features/nav';
import { picker } from '@/features/picker';
import { ask } from '@/components/Dialog';
import { PlateRing, SetTypeRing } from '@/components/PlateRing';
import { ChoiceRow, Field, IconButton, MarginNote, Pad, RuledRow, Screen, Section, Segmented, Sheet, TextArea } from '@/components/ui';

function Stepper({ label, value, onChange, min = 0, max = 99 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <RuledRow>
      <span className="flex-1">{label}</span>
      <button type="button" className="btn-secondary btn-compact" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Less ${label}`}>
        −
      </button>
      <span className="t-num-m min-w-8 text-center">{value}</span>
      <button type="button" className="btn-secondary btn-compact" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`More ${label}`}>
        +
      </button>
    </RuledRow>
  );
}

const SET_CHOICES: SetType[] = ['working', 'top', 'backoff', 'amrap', 'amtap', 'isometric', 'myo', 'drop', 'restPause', 'failure'];

function scheme(s: Slot): string {
  const first = s.sets[0];
  if (!first) return 'no sets';
  const reps = first.timeMs ? formatClock(first.timeMs) : first.repsMax && first.repsMax !== first.reps ? `${first.reps}–${first.repsMax}` : `${first.reps ?? '—'}`;
  const rir = first.rir != null ? ` @ ${first.rir} RIR` : '';
  return `${s.sets.length} × ${reps}${rir} · ${RULE_LABEL[s.rule.type]}`;
}

/** The picker token carries where the exercise goes, since the builder unmounts while the library is open. */
const pickToken = (programId: string, blockIdx: number, dayId: string, slotId?: string) => `builder|${programId}|${blockIdx}|${dayId}|${slotId ?? ''}`;

export function ProgramBuilderScreen({ id }: { id: string }) {
  const row = useData((d) => getProgram(d, id), [id], undefined as ProgramRow | null | undefined);
  if (row === undefined) return <div className="min-h-full" />;
  if (!row) {
    return (
      <Screen title="Program" backButton>
        <Pad>
          <p>This program isn’t here any more.</p>
        </Pad>
      </Screen>
    );
  }
  return <Builder key={id} id={id} initial={row.data} />;
}

function Builder({ id, initial }: { id: string; initial: Program }) {
  const unit = useSettings().unit;
  const run = useData((d) => activeRun(d), [], null as RunRow | null);
  const [prog, setProg] = useState<Program>(initial);
  const [blockIdx, setBlockIdx] = useState(0);
  const [week, setWeek] = useState<number | 'all'>('all');
  const [editing, setEditing] = useState<{ dayId: string; slotId: string } | null>(null);
  const exIds = prog.blocks.flatMap((b) => b.days.flatMap((x) => x.slots.map((s) => s.exerciseId))).join();
  const infos = useData((d) => getExercises(d, exIds ? exIds.split(',') : []), [exIds], new Map<string, Exercise>());

  // Every edit is saved once it has committed (autosave).
  const edited = useRef(false);
  const update = useCallback((fn: (draft: Program) => void) => {
    edited.current = true;
    setProg((cur) => {
      const next = JSON.parse(JSON.stringify(cur)) as Program;
      fn(next);
      return next;
    });
  }, []);
  useEffect(() => {
    if (!edited.current) return;
    edited.current = false;
    void saveProgram(db, prog);
  }, [prog]);

  // An exercise came back from the picker.
  const pick = picker.use();
  useEffect(() => {
    const [kind, programId, b, dayId, slotId] = (pick.token ?? '').split('|');
    if (kind !== 'builder' || programId !== id || !pick.picked) return;
    const picked = picker.take(pick.token!);
    if (!picked) return;
    setBlockIdx(Number(b));
    update((draft) => {
      const day = draft.blocks[Number(b)]?.days.find((x) => x.id === dayId);
      if (!day) return;
      const s = slotId ? day.slots.find((x) => x.id === slotId) : undefined;
      if (s) s.exerciseId = picked;
      else day.slots.push({ id: newId(), exerciseId: picked, groupId: null, rule: defaultParams('double'), restMs: null, note: null, sets: Array.from({ length: 3 }, () => ({ type: 'working' as const, reps: 8, repsMax: 12, rir: 2, pct: null, timeMs: null })) });
    });
  }, [pick, id, update]);

  const block = prog.blocks[blockIdx] ?? prog.blocks[0]!;
  const openPicker = (dayId: string, slotId?: string) => {
    const token = pickToken(id, blockIdx, dayId, slotId);
    picker.open(token);
    navigate({ name: 'exercises', picker: token });
  };
  const editingDay = editing ? block.days.find((d) => d.id === editing.dayId) : undefined;
  const editingSlot = editingDay?.slots.find((s) => s.id === editing!.slotId);

  // Meso preview: sets per muscle (primary) per week. Week 1 from the plan; later weeks from the run, else dashed (they adapt).
  const muscleSets = new Map<Muscle, number>();
  for (const d of block.days) for (const s of d.slots) for (const m of infos.get(s.exerciseId)?.primary ?? []) muscleSets.set(m, (muscleSets.get(m) ?? 0) + s.sets.length);
  const runWeekly = run?.programId === id ? run.state.weeklySets : {};
  const moveDay = (di: number, dir: -1 | 1) =>
    update((dr) => {
      const ds = dr.blocks[blockIdx]!.days;
      const j = di + dir;
      if (j >= 0 && j < ds.length) [ds[j], ds[di]] = [ds[di]!, ds[j]!];
    });

  return (
    <Screen
      title={prog.name || 'Untitled program'}
      backButton
      meta={`${prog.blocks.length} BLOCK${prog.blocks.length > 1 ? 'S' : ''} · AUTOSAVED`}
      footer={
        run?.programId === id ? (
          <button type="button" className="btn-primary w-full" onClick={() => navigate({ name: 'programShare', id })}>
            Running · share it
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary w-full"
            onClick={async () => {
              await startRun(db, id);
              navigate({ name: 'today' });
            }}
          >
            Start this program
          </button>
        )
      }
    >
      <Pad className="flex flex-col gap-3">
        <Field label="Name" value={prog.name} onChange={(e) => update((dr) => void (dr.name = e.target.value))} />
        <TextArea label="Notes" value={prog.notes} onChange={(e) => update((dr) => void (dr.notes = e.target.value))} />
      </Pad>

      {prog.blocks.length > 1 ? (
        <Section title="BLOCK">
          <Pad>
            <Segmented label="Block" value={String(blockIdx)} onChange={(v) => setBlockIdx(Number(v))} options={prog.blocks.map((b, i) => ({ value: String(i), label: b.name }))} />
          </Pad>
        </Section>
      ) : null}

      <Section title={block.name.toUpperCase()}>
        <Stepper label="Training weeks" value={block.weeks} min={1} max={16} onChange={(v) => update((dr) => void (dr.blocks[blockIdx]!.weeks = v))} />
        <ChoiceRow label="Deload week at the end">
          <Segmented label="Deload" value={block.deloadWeek ? 'yes' : 'no'} onChange={(v) => update((dr) => void (dr.blocks[blockIdx]!.deloadWeek = v === 'yes'))} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
        </ChoiceRow>
        <ChoiceRow label="Adaptive volume" hint="Sets per muscle change weekly from your feedback; RIR walks 3 → 0.">
          <Segmented label="Adaptive" value={block.adaptive ? 'yes' : 'no'} onChange={(v) => update((dr) => void (dr.blocks[blockIdx]!.adaptive = v === 'yes'))} options={[{ value: 'yes', label: 'On' }, { value: 'no', label: 'Off' }]} />
        </ChoiceRow>
        {block.adaptive ? (
          <>
            <Stepper label="Most sets in one session" value={prog.meso.sessionCap} min={6} max={60} onChange={(v) => update((dr) => void (dr.meso.sessionCap = v))} />
            <ChoiceRow label="Deload style">
              <Segmented label="Deload style" value={prog.meso.deloadStyle} onChange={(v) => update((dr) => void (dr.meso.deloadStyle = v))} options={[{ value: 'volume', label: 'Half sets' }, { value: 'intensity', label: 'Lighter' }, { value: 'both', label: 'Both' }]} />
            </ChoiceRow>
          </>
        ) : null}
      </Section>

      <Section title="EDITING">
        <Pad className="flex flex-col gap-2">
          <Segmented
            label="Week"
            value={String(week)}
            onChange={(v) => setWeek(v === 'all' ? 'all' : Number(v))}
            options={[{ value: 'all', label: 'Every week' }, ...Array.from({ length: block.weeks + (block.deloadWeek ? 1 : 0) }, (_, i) => ({ value: String(i), label: i >= block.weeks ? 'Deload' : `W${i + 1}` }))]}
          />
          {week !== 'all' ? <MarginNote>Changes now apply to week {week + 1} only, e.g. an AMRAP test week.</MarginNote> : null}
        </Pad>
      </Section>

      {block.days.map((day, di) => {
        const labels = groupLabels(day.slots);
        return (
          <section key={day.id} className="mt-5" aria-label={day.name}>
            <Pad className="flex items-center gap-1">
              <input className="field min-w-0 flex-1 font-title text-[20px]" value={day.name} onChange={(e) => update((dr) => void (dr.blocks[blockIdx]!.days[di]!.name = e.target.value))} aria-label="Day name" />
              <IconButton label="Move day up" onClick={() => moveDay(di, -1)}>
                <ChevronUp size={18} />
              </IconButton>
              <IconButton label="Move day down" onClick={() => moveDay(di, 1)}>
                <ChevronDown size={18} />
              </IconButton>
              <IconButton
                label="Duplicate day"
                onClick={() =>
                  update((dr) => {
                    const copy: Day = JSON.parse(JSON.stringify(day));
                    copy.id = newId();
                    copy.name = `${day.name} copy`;
                    copy.slots.forEach((s) => (s.id = newId()));
                    dr.blocks[blockIdx]!.days.splice(di + 1, 0, copy);
                  })
                }
              >
                <Copy size={18} />
              </IconButton>
              <IconButton label="Delete day" className="text-red-text" onClick={() => ask(`Delete ${day.name}?`, undefined, [{ text: 'Keep', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => update((dr) => void dr.blocks[blockIdx]!.days.splice(di, 1)) }])}>
                <Trash2 size={18} />
              </IconButton>
            </Pad>
            {day.slots.map((s, si) => {
              const ov = week !== 'all' ? block.overrides[week]?.[s.id] : undefined;
              const shown = ov?.sets ? { ...s, sets: ov.sets } : s;
              return (
                <RuledRow key={s.id} onClick={() => setEditing({ dayId: day.id, slotId: s.id })} label={`${infos.get(s.exerciseId)?.name}, ${scheme(shown)}`}>
                  <span className="t-meta w-6 text-blue-text">{labels[si] ?? ''}</span>
                  <SetTypeRing type={shown.sets[0]?.type ?? 'working'} index={0} state="pending" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{infos.get(s.exerciseId)?.name ?? s.exerciseId}</span>
                    <span className="t-num-m block text-[13px] text-pencil">
                      {scheme(shown)}
                      {ov ? ' · this week only' : ''}
                    </span>
                  </span>
                </RuledRow>
              );
            })}
            <RuledRow dashed onClick={() => openPicker(day.id)} label={`Add exercise to ${day.name}`}>
              <Plus size={18} className="text-pencil" />
              <span className="text-pencil">Add exercise</span>
            </RuledRow>
          </section>
        );
      })}
      <Pad className="pt-3">
        <button type="button" className="btn-secondary w-full" onClick={() => update((dr) => void dr.blocks[blockIdx]!.days.push({ id: newId(), name: `Day ${dr.blocks[blockIdx]!.days.length + 1}`, weekday: null, slots: [] }))}>
          Add a day
        </button>
      </Pad>

      {muscleSets.size ? (
        <Section title="MESO PREVIEW · SETS PER MUSCLE PER WEEK">
          {[...muscleSets.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([m, sets]) => {
              const lm = DEFAULT_LANDMARKS[m];
              const done = runWeekly[m] ?? [];
              return (
                <RuledRow key={m}>
                  <span className="t-label w-[110px] truncate">{MUSCLE_LABEL[m]}</span>
                  <span className="flex flex-1 flex-wrap gap-1">
                    {Array.from({ length: block.weeks }, (_, w) => {
                      const v = done[w] ?? (w === 0 ? sets : null);
                      const grew = v != null && v > sets;
                      return <PlateRing key={w} color={grew ? 'green' : 'ink'} state={done[w] != null ? 'done' : 'pending'} letter={v != null ? String(Math.round(v)) : '?'} size={26} label={`Week ${w + 1}: ${v ?? 'adapts'} sets`} />;
                    })}
                  </span>
                  <span className="t-num-m text-[12px] text-pencil">
                    {lm.mev}–{lm.mrv}
                  </span>
                </RuledRow>
              );
            })}
          <Pad>
            <MarginNote>Dashed weeks adapt from your feedback. Range on the right is MEV–MRV.</MarginNote>
          </Pad>
        </Section>
      ) : null}

      <Section>
        <Pad className="flex flex-col gap-2">
          <button type="button" className="btn-secondary" onClick={() => navigate({ name: 'programShare', id })}>
            Share this program
          </button>
          <button
            type="button"
            className="btn-ghost text-red-text"
            onClick={() =>
              ask('Delete this program?', 'Workouts you logged with it stay in your history.', [
                { text: 'Keep', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    await archiveProgram(db, id);
                    back();
                  },
                },
              ])
            }
          >
            Delete program
          </button>
        </Pad>
      </Section>

      {editingSlot && editingDay ? (
        <Sheet open onClose={() => setEditing(null)} title={infos.get(editingSlot.exerciseId)?.name}>
          <SlotEditor
            slot={editingSlot}
            block={block}
            week={week}
            unit={unit}
            nextSlot={editingDay.slots[editingDay.slots.findIndex((s) => s.id === editingSlot.id) + 1]}
            onChange={(fn) => update((dr) => fn(dr.blocks[blockIdx]!, dr.blocks[blockIdx]!.days.find((d) => d.id === editingDay.id)!, dr))}
            onPick={() => {
              const dayId = editingDay.id;
              const slotId = editingSlot.id;
              setEditing(null);
              openPicker(dayId, slotId);
            }}
            onClose={() => setEditing(null)}
          />
        </Sheet>
      ) : null}
    </Screen>
  );
}

function SlotEditor({ slot, block, week, unit, nextSlot, onChange, onPick, onClose }: { slot: Slot; block: Block; week: number | 'all'; unit: 'kg' | 'lb'; nextSlot?: Slot; onChange: (fn: (b: Block, d: Day, prog: Program) => void) => void; onPick: () => void; onClose: () => void }) {
  const ov = week !== 'all' ? block.overrides[week]?.[slot.id] : undefined;
  const sets = ov?.sets ?? slot.sets;
  const first = sets[0] ?? { type: 'working' as const, reps: 8, repsMax: 12, rir: 2, pct: null, timeMs: null };
  const [tm, setTm] = useState(slot.rule.type === 'tm' && slot.rule.startTmG ? formatWeight(slot.rule.startTmG, unit) : '');

  const setSets = (next: ProgramSet[]) =>
    onChange((b, d) => {
      if (week === 'all') d.slots.find((x) => x.id === slot.id)!.sets = next;
      else b.overrides[week] = { ...(b.overrides[week] ?? {}), [slot.id]: { ...(b.overrides[week]?.[slot.id] ?? {}), sets: next } };
    });
  const all = (patch: Partial<ProgramSet>) => setSets(sets.map((s) => ({ ...s, ...patch })));
  const setRule = (rule: RuleParams) => onChange((_, d) => void (d.slots.find((x) => x.id === slot.id)!.rule = rule));

  return (
    <div>
      <RuledRow onClick={onPick} label="Change exercise">
        <span className="flex-1">Change exercise</span>
      </RuledRow>
      <Stepper label="Sets" value={sets.length} min={1} max={12} onChange={(n) => setSets(n > sets.length ? [...sets, ...Array.from({ length: n - sets.length }, () => ({ ...(sets[sets.length - 1] ?? first) }))] : sets.slice(0, n))} />
      <p className="t-meta px-margin pt-2 text-pencil">SET TYPE</p>
      <Pad className="flex flex-wrap gap-2 py-2">
        {SET_CHOICES.map((t) => (
          <button
            key={t}
            type="button"
            className={first.type === t ? 'btn-secondary btn-compact' : 'btn-ghost btn-compact'}
            onClick={() => (t === 'top' ? setSets(sets.map((s, i) => ({ ...s, type: i === 0 ? 'top' : 'backoff' }))) : all({ type: t, timeMs: setTypeInfo(t).timed ? (first.timeMs ?? 30000) : null }))}
          >
            <SetTypeRing type={t} index={0} state={first.type === t ? 'done' : 'pending'} />
            {setTypeInfo(t).label}
          </button>
        ))}
      </Pad>
      {setTypeInfo(first.type).timed ? (
        <Stepper label="Target seconds" value={Math.round((first.timeMs ?? 30000) / 1000)} min={5} max={600} onChange={(v) => all({ timeMs: v * 1000 })} />
      ) : (
        <>
          <Stepper label="Reps (bottom of range)" value={first.reps ?? 8} min={1} max={50} onChange={(v) => all({ reps: v, repsMax: Math.max(v, first.repsMax ?? v) })} />
          <Stepper label="Reps (top of range)" value={first.repsMax ?? first.reps ?? 8} min={first.reps ?? 1} max={60} onChange={(v) => all({ repsMax: v })} />
        </>
      )}
      <Stepper label="Reps in reserve" value={first.rir ?? 2} min={0} max={5} onChange={(v) => all({ rir: v })} />
      <Stepper label="Rest (×15 s)" value={Math.round((slot.restMs ?? 120000) / 15000)} min={0} max={40} onChange={(v) => onChange((_, d) => void (d.slots.find((x) => x.id === slot.id)!.restMs = v * 15000))} />

      <p className="t-meta px-margin pt-3 text-pencil">PROGRESSION</p>
      <Pad className="flex flex-col gap-2 py-2">
        <Segmented label="Progression rule" value={slot.rule.type} onChange={(v: RuleType) => setRule(defaultParams(v))} options={(Object.keys(RULE_LABEL) as RuleType[]).map((r) => ({ value: r, label: RULE_LABEL[r] }))} />
        {slot.rule.type === 'meso' && !block.adaptive ? <MarginNote>Turn on adaptive volume for this block, or the meso rule holds sets steady.</MarginNote> : null}
        {slot.rule.type === 'tm' ? <Field label={`Training max (${unit}), about 90% of your best single`} value={tm} onChange={(e) => setTm(e.target.value)} inputMode="decimal" onBlur={() => setRule({ ...(slot.rule as TmParams), startTmG: parseWeightInput(tm, unit) })} /> : null}
      </Pad>

      <Pad className="flex flex-col gap-2 py-3">
        {nextSlot ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              onChange((_, d, prog) => {
                const a = d.slots.find((x) => x.id === slot.id)!;
                const b = d.slots.find((x) => x.id === nextSlot.id)!;
                if (a.groupId && a.groupId === b.groupId) b.groupId = null;
                else {
                  const gid = a.groupId ?? newId();
                  a.groupId = gid;
                  b.groupId = gid;
                  prog.groups[gid] ??= { kind: 'superset', restMs: 90000, transitionMs: 0 };
                }
                const size = d.slots.filter((x) => x.groupId === a.groupId).length;
                if (a.groupId && prog.groups[a.groupId]) prog.groups[a.groupId]!.kind = size >= 4 ? 'giant' : size === 3 ? 'triset' : 'superset';
              })
            }
          >
            {slot.groupId && slot.groupId === nextSlot.groupId ? 'Unlink from next (superset)' : 'Superset with the next exercise'}
          </button>
        ) : null}
        {week !== 'all' && ov ? (
          <button
            type="button"
            className="btn-ghost"
            onClick={() =>
              onChange((b) => {
                delete b.overrides[week]?.[slot.id];
              })
            }
          >
            Remove this week&apos;s override
          </button>
        ) : null}
        <button
          type="button"
          className="btn-danger"
          onClick={() => {
            onChange((_, d) => void d.slots.splice(d.slots.findIndex((x) => x.id === slot.id), 1));
            onClose();
          }}
        >
          Remove from day
        </button>
      </Pad>
    </div>
  );
}
