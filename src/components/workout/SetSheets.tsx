// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useEffect, useRef, useState } from 'react';
import { newId } from '@/db/schema';
import { patchSettings, useSettings } from '@/db/settings';
import { editDb } from '@/db/shown';
import { deleteSet, retypeSets, updateSet, type SetPatch, type WorkoutSet } from '@/db/workouts';
import { formatClock, formatWeight, parseWeightInput } from '@/engine/math/units';
import { CUSTOM_PREFIX, GLYPHS, PICKER_ORDER, setTypeInfo, type CustomSetType, type SetType } from '@/engine/setTypes';
import { countdownSecond, cuesCrossed, elapsedMs, targetLine } from '@/engine/timer/stopwatch';
import type { Segment, WeightUnit } from '@/engine/types';
import { rounder } from '@/features/gym';
import { sensory } from '@/features/sensory';
import { holdTimer, stopwatch } from '@/features/workout/timers';
import { ringVar, type RingColor } from '@/theme/tokens';
import { Glyph } from '../Glyph';
import { PlateRing, SetTypeRing } from '../PlateRing';
import { ChoiceRow, cx, Field, Pad, RuledRow, Segmented, Sheet } from '../ui';

const save = (id: string, p: SetPatch) => void updateSet(editDb(), id, p);

/** Tap the ring: pick one of 20+ set types, each with its ring and a one-line hint, or make your own. */
export function SetTypeSheet({ set, onClose }: { set: WorkoutSet; onClose: () => void }) {
  const custom = useSettings().customSetTypes;
  const [editing, setEditing] = useState<CustomSetType | null>(null);
  const choose = (t: SetType) => {
    save(set.id, { type: t, rir: t === 'failure' ? 0 : set.rir });
    onClose();
  };
  const order: SetType[] = [...PICKER_ORDER, ...custom.map((c) => c.id)];
  const isNew = !!editing && !custom.some((c) => c.id === editing.id);
  return (
    <Sheet open onClose={onClose} title={editing ? (isNew ? 'New set type' : 'Edit set type') : 'Set type'}>
      {editing ? (
        <CustomSetTypeEditor initial={editing} isNew={isNew} onDone={() => setEditing(null)} />
      ) : (
        <>
          {order.map((t) => {
            const mine = custom.find((c) => c.id === t);
            const info = setTypeInfo(t);
            return (
              <div key={t} className="ruled-row pressable" onClick={() => choose(t)} role="button" tabIndex={0} aria-label={info.label} onKeyDown={(e) => e.key === 'Enter' && choose(t)}>
                <SetTypeRing type={t} index={0} state={set.type === t ? 'done' : 'pending'} />
                <span className="min-w-0 flex-1">
                  <span className="t-label block">{info.label}</span>
                  <span className="t-hint block">{info.hint}</span>
                </span>
                {mine ? (
                  <button
                    type="button"
                    className="btn-ghost btn-compact"
                    aria-label={`Edit ${mine.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(mine);
                    }}
                  >
                    Edit
                  </button>
                ) : null}
              </div>
            );
          })}
          <Pad className="pt-3">
            <button type="button" className="btn-secondary w-full" onClick={() => setEditing(blankCustomSetType())}>
              New set type
            </button>
          </Pad>
        </>
      )}
    </Sheet>
  );
}

const RING_CHOICES: RingColor[] = ['ink', 'red', 'blue', 'yellow', 'green', 'white'];

export const blankCustomSetType = (): CustomSetType => ({ id: `${CUSTOM_PREFIX}${newId()}`, label: '', hint: '', letter: null, glyph: 'star', ring: 'ink', countsAsVolume: true, prEligible: true, timed: false });

/** Name, ring colour and emblem (a letter of your choice, or a drawn glyph), plus how the type counts. */
export function CustomSetTypeEditor({ initial, isNew, onDone }: { initial: CustomSetType; isNew: boolean; onDone: () => void }) {
  const list = useSettings().customSetTypes;
  const [draft, setDraft] = useState(initial);
  const patch = (x: Partial<CustomSetType>) => setDraft((d) => ({ ...d, ...x }));
  const letter = draft.letter?.trim() || null;
  const saveType = () => {
    const clean: CustomSetType = { ...draft, label: draft.label.trim() || 'My set type', hint: draft.hint.trim() || 'Your own set type.', letter };
    void patchSettings({ customSetTypes: isNew ? [...list, clean] : list.map((c) => (c.id === clean.id ? clean : c)) });
    onDone();
  };
  const remove = async () => {
    await retypeSets(editDb(), draft.id, 'working');
    await patchSettings({ customSetTypes: list.filter((c) => c.id !== draft.id) });
    onDone();
  };
  const yesNo = (v: boolean) => (v ? 'yes' : 'no');
  return (
    <Pad className="flex flex-col gap-3.5 pb-2">
      <div className="flex justify-center py-1">
        <PlateRing color={draft.ring} state="done" size={44} letter={letter} glyph={letter ? undefined : (draft.glyph ?? undefined)} label="Preview" />
      </div>
      <Field label="Name" value={draft.label} onChange={(e) => patch({ label: e.target.value })} autoFocus={isNew} maxLength={24} />
      <Field label="One-line hint (optional)" value={draft.hint} onChange={(e) => patch({ hint: e.target.value })} maxLength={80} />
      <div className="flex flex-col gap-1.5">
        <span className="t-label text-ink2">Ring colour</span>
        <div className="flex flex-wrap gap-1">
          {RING_CHOICES.map((c) => (
            <button key={c} type="button" onClick={() => patch({ ring: c })} aria-label={`Ring colour ${c}`} aria-pressed={draft.ring === c} className={cx('inline-flex h-touch w-touch items-center justify-center rounded-[8px]', draft.ring === c && 'ring-2 ring-ink')}>
              <PlateRing color={c} state="done" size={24} filled />
            </button>
          ))}
          <label className={cx('relative inline-flex h-touch w-touch items-center justify-center rounded-[8px]', draft.ring.startsWith('#') && 'ring-2 ring-ink')}>
            <span className="h-6 w-6 rounded-full border border-rule" style={{ background: draft.ring.startsWith('#') ? draft.ring : 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }} />
            <input type="color" aria-label="Pick any ring colour" value={draft.ring.startsWith('#') ? draft.ring : '#e8615e'} onChange={(e) => patch({ ring: e.target.value as RingColor })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
          </label>
        </div>
      </div>
      <Field label="Letter in the ring (1–2 characters; blank uses a symbol)" value={draft.letter ?? ''} onChange={(e) => patch({ letter: e.target.value.slice(0, 2) || null })} autoCapitalize="none" maxLength={2} />
      {!letter ? (
        <div className="flex flex-col gap-1.5">
          <span className="t-label text-ink2">Symbol</span>
          <div className="flex flex-wrap gap-1">
            {GLYPHS.map((g) => (
              <button key={g} type="button" onClick={() => patch({ glyph: g })} aria-label={`Symbol ${g}`} aria-pressed={draft.glyph === g} className={cx('inline-flex h-touch w-touch items-center justify-center rounded-[8px] border', draft.glyph === g ? 'border-2 border-ink' : 'border-rule')}>
                <Glyph name={g} size={22} color={ringVar(draft.ring, 'text')} />
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <ChoiceRow label="Counts toward weekly volume">
        <Segmented label="Counts toward weekly volume" value={yesNo(draft.countsAsVolume)} onChange={(v) => patch({ countsAsVolume: v === 'yes' })} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
      </ChoiceRow>
      <ChoiceRow label="Can set personal records">
        <Segmented label="Can set personal records" value={yesNo(draft.prEligible)} onChange={(v) => patch({ prEligible: v === 'yes' })} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
      </ChoiceRow>
      <ChoiceRow label="Logged as">
        <Segmented label="Logged as" value={draft.timed ? 'time' : 'reps'} onChange={(v) => patch({ timed: v === 'time' })} options={[{ value: 'reps', label: 'Weight × reps' }, { value: 'time', label: 'Time' }]} />
      </ChoiceRow>
      <button type="button" className="btn-primary" onClick={saveType}>
        Save
      </button>
      <button type="button" className="btn-ghost" onClick={onDone}>
        Cancel
      </button>
      {!isNew ? (
        <button type="button" className="btn-ghost text-red-text" onClick={() => void remove()}>
          Delete this set type
        </button>
      ) : null}
    </Pad>
  );
}

function StepRow({ label, value, onChange, step = 1 }: { label: string; value: number | null; onChange: (v: number | null) => void; step?: number }) {
  return (
    <RuledRow>
      <span className="flex-1">{label}</span>
      <button type="button" className="btn-secondary btn-compact" onClick={() => onChange(Math.max(0, (value ?? 0) - step) || null)} aria-label={`Less ${label}`}>
        −
      </button>
      <span className="t-num-m min-w-9 text-center">{value ?? 0}</span>
      <button type="button" className="btn-secondary btn-compact" onClick={() => onChange((value ?? 0) + step)} aria-label={`More ${label}`}>
        +
      </button>
    </RuledRow>
  );
}

/** Everything else about a set: segments (drops, mini-sets, clusters), add-ons, side, tempo, pain, note. */
export function SetDetailSheet({ set, unit, onClose }: { set: WorkoutSet; unit: WeightUnit; onClose: () => void }) {
  const [note, setNote] = useState(set.note ?? '');
  const [tempo, setTempo] = useState(set.tempo ?? '');
  const info = setTypeInfo(set.type);
  const patch = (p: SetPatch) => save(set.id, p);
  const segs = set.segments;
  const isDrop = set.type === 'drop' || set.type === 'mechDrop';
  const addSegment = async () => {
    const base = segs[segs.length - 1]?.weightG ?? set.weightG ?? set.targetWeightG ?? 0;
    // Drops suggest −25%, rounded to your plates; mini-sets keep the weight.
    const w = isDrop ? (await rounder(editDb()))(base * 0.75, set.exerciseId) : null;
    const seg: Segment = { reps: set.type === 'myo' || set.type === 'myoMatch' ? 4 : null, weightG: w, restMs: set.type === 'cluster' ? 20000 : set.type === 'restPause' ? 15000 : null };
    patch({ segments: [...segs, seg] });
  };
  const setSeg = (i: number, s: Partial<Segment>) => patch({ segments: segs.map((x, j) => (j === i ? { ...x, ...s } : x)) });

  return (
    <Sheet open onClose={onClose} title={info.label}>
      {info.segmented ? (
        <div>
          <p className="t-meta px-margin pt-2 text-pencil">{isDrop ? 'DROPS' : set.type === 'cluster' ? 'CLUSTERS' : 'MINI-SETS'}</p>
          {segs.map((sg, i) => (
            <RuledRow key={i}>
              <span className="t-num-m w-6 text-pencil">{i + 1}</span>
              {isDrop ? (
                <input className="field w-[90px]" defaultValue={sg.weightG != null ? formatWeight(sg.weightG, unit) : ''} onBlur={(e) => setSeg(i, { weightG: parseWeightInput(e.target.value, unit) })} inputMode="decimal" placeholder={unit} aria-label={`Drop ${i + 1} weight`} />
              ) : null}
              <span className="flex-1" />
              <button type="button" className="btn-secondary btn-compact" onClick={() => setSeg(i, { reps: Math.max(0, (sg.reps ?? 0) - 1) })} aria-label="One rep less">
                −
              </button>
              <span className="t-num-m min-w-7 text-center">{sg.reps ?? 0}</span>
              <button type="button" className="btn-secondary btn-compact" onClick={() => setSeg(i, { reps: (sg.reps ?? 0) + 1 })} aria-label="One rep more">
                +
              </button>
              <button type="button" className="btn-ghost btn-compact" onClick={() => patch({ segments: segs.filter((_, j) => j !== i) })} aria-label="Remove">
                ×
              </button>
            </RuledRow>
          ))}
          <Pad className="py-2">
            <button type="button" className="btn-secondary w-full" onClick={() => void addSegment()}>
              {isDrop ? '+ drop (−25%)' : '+ segment'}
            </button>
          </Pad>
        </div>
      ) : null}
      <StepRow label="Partial reps (+p)" value={set.partials} onChange={(v) => patch({ partials: v })} />
      <StepRow label="Forced / assisted reps (+a)" value={set.forced} onChange={(v) => patch({ forced: v })} />
      <ChoiceRow label="Side">
        <Segmented label="Side" value={set.side ?? 'both'} onChange={(v) => patch({ side: v === 'both' ? null : v })} options={[{ value: 'both', label: 'Both' }, { value: 'L', label: 'L' }, { value: 'R', label: 'R' }]} />
      </ChoiceRow>
      <ChoiceRow label="Joint pain">
        <Segmented label="Pain" value={String(set.pain ?? 0)} onChange={(v) => patch({ pain: Number(v) || null })} options={[{ value: '0', label: 'None' }, { value: '1', label: 'Some' }, { value: '2', label: 'A lot' }]} />
      </ChoiceRow>
      <Pad className="flex flex-col gap-3 py-3">
        <Field label="Tempo (e.g. 3-1-1-0)" value={tempo} onChange={(e) => setTempo(e.target.value)} onBlur={() => patch({ tempo: tempo.trim() || null })} />
        <Field label="Note" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => patch({ note: note.trim() || null })} />
        <button
          type="button"
          className="btn-danger"
          onClick={() => {
            void deleteSet(editDb(), set.id);
            onClose();
          }}
        >
          Delete set
        </button>
      </Pad>
    </Sheet>
  );
}

/**
 * AMTAP / timed hold. Start → optional 3-2-1 → big stopwatch counts up → tap anywhere to stop.
 * Cues at the target and at your best ("PR pace"). Mirrored on the lock screen with a Stop button.
 */
export function StopwatchSheet({ set, title, lastMs, bestMs, onClose }: { set: WorkoutSet; title: string; lastMs: number | null; bestMs: number | null; onClose: (timeMs: number | null) => void }) {
  const s = useSettings();
  const { sw, setId } = stopwatch.use();
  const [now, setNow] = useState(() => Date.now());
  const prevElapsed = useRef(0);
  const target = set.targetTimeMs ?? null;
  const mine = setId === set.id;

  useEffect(() => {
    if (!mine || (sw.phase !== 'running' && sw.phase !== 'countdown')) return;
    const id = setInterval(
      () => {
        holdTimer.tick();
        setNow(Date.now());
      },
      s.holdHundredths ? 31 : 100,
    );
    return () => clearInterval(id);
  }, [mine, sw.phase, s.holdHundredths]);

  const elapsed = mine ? elapsedMs(sw, now) : 0;
  useEffect(() => {
    if (!mine || sw.phase !== 'running' || !s.holdCues) return;
    if (cuesCrossed(prevElapsed.current, elapsed, target, bestMs).length) sensory.holdCue();
    prevElapsed.current = elapsed;
  }, [elapsed, mine, sw.phase, target, bestMs, s.holdCues]);

  const cd = mine ? countdownSecond(sw, now) : null;
  const stopped = mine && sw.phase === 'stopped';
  const running = mine && (sw.phase === 'running' || sw.phase === 'countdown');
  const line = targetLine(lastMs, bestMs, target);

  return (
    <Sheet open onClose={() => onClose(null)} title={title}>
      <button
        type="button"
        onClick={() => (running ? holdTimer.stopAt(Date.now()) : !stopped ? holdTimer.start(set.id, s.holdCountdown, title, line) : undefined)}
        aria-label={running ? 'Stop' : stopped ? 'Stopped' : 'Start'}
        className={cx('mx-margin flex min-h-[300px] w-[calc(100%-32px)] flex-col items-center justify-center gap-3 rounded-sheet border-[1.5px] border-red-ring', running ? 'border-solid' : 'border-dashed')}
      >
        <span className="t-meta text-pencil">{line || 'Hold until you can’t'}</span>
        <span className="t-display text-[72px] leading-[80px]" aria-live="polite">
          {cd != null ? String(cd) : formatClock(elapsed, s.holdHundredths)}
        </span>
        <span className="text-ink2">{running ? 'Tap anywhere to stop' : stopped ? (bestMs != null && elapsed > bestMs ? 'Longer than your best.' : 'Logged.') : 'Tap to start'}</span>
      </button>
      <Pad className="flex flex-col gap-2 py-3">
        {stopped ? (
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              holdTimer.reset();
              prevElapsed.current = 0;
              onClose(elapsed);
            }}
          >
            {`Save ${formatClock(elapsed)}`}
          </button>
        ) : null}
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            holdTimer.reset();
            prevElapsed.current = 0;
            if (!stopped) onClose(null);
          }}
        >
          {stopped ? 'Discard and redo' : 'Cancel'}
        </button>
      </Pad>
    </Sheet>
  );
}
