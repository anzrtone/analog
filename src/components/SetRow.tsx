// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { memo } from 'react';
import { Check, Ellipsis } from 'lucide-react';
import type { WorkoutSet } from '@/db/workouts';
import { formatClock, formatSet, formatWeight, fromGrams } from '@/engine/math/units';
import { setTypeInfo } from '@/engine/setTypes';
import type { LoggingMode, WeightUnit } from '@/engine/types';
import { ringVar } from '@/theme/tokens';
import { SetTypeRing } from './PlateRing';
import { cx } from './ui';

export type SetField = 'weight' | 'reps' | 'rir' | 'time';

export interface SetRowProps {
  set: WorkoutSet;
  /** Position among this exercise's sets, for the ring number on plain working sets. */
  index: number;
  prev?: WorkoutSet;
  unit: WeightUnit;
  effort: 'rir' | 'rpe';
  mode: LoggingMode;
  isNext: boolean;
  /** Back-off linked to the top set above it: thin blue connector. */
  linked?: boolean;
  /** Keyboard focus on desktop: an ink bar in the margin. */
  focused?: boolean;
  wide?: boolean;
  onEdit: (set: WorkoutSet, field: SetField) => void;
  onToggle: (set: WorkoutSet) => void;
  onRing: (set: WorkoutSet) => void;
  onMore: (set: WorkoutSet) => void;
  /** The row the guided tour points at: its ring, values and tick get tour targets. */
  tour?: boolean;
}

function Cell({ text, ghost, onClick, label, grow = 1, tour }: { text: string; ghost: boolean; onClick: () => void; label: string; grow?: number; tour?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} data-tour={tour} className="flex min-h-touch min-w-0 items-center justify-center rounded-[8px] transition-[background-color,transform] duration-100 hover:bg-sunk active:scale-[0.92]" style={{ flex: grow }}>
      <span className={cx('t-num-m', ghost ? 'border-b border-dashed border-pencil text-pencil' : 'text-ink')}>{text}</span>
    </button>
  );
}

/** The completion circle: dashed until done, then the plate colour swells from the middle and the tick pops in. */
export function CheckDot({ done, color }: { done: boolean; color: string }) {
  return (
    <span className="relative inline-flex h-8 w-8 items-center justify-center">
      <span className={cx('absolute inset-0 rounded-full border-[1.5px] border-dashed border-pencil transition-opacity duration-200', done && 'opacity-0')} />
      <span className={cx('absolute inset-0 rounded-full transition-[opacity,transform] duration-200 ease-out', done ? 'scale-100 opacity-100' : 'scale-[0.4] opacity-0')} style={{ backgroundColor: color }} />
      <Check size={18} strokeWidth={2.25} className={cx('relative', done ? 'animate-pop text-paper' : 'text-pencil')} />
    </span>
  );
}

/** ring (32) | previous (pencil) | weight | reps | RIR | ⋯ | ✓ (48). 48 px tall with a rule underneath. */
export const SetRow = memo(function SetRow({ set, index, prev, unit, effort, mode, isNext, linked, focused, wide, onEdit, onToggle, onRing, onMore, tour }: SetRowProps) {
  const info = setTypeInfo(set.type);
  const done = set.completedAt != null;
  const timed = info.timed || mode === 'time';
  const w = set.weightG ?? set.targetWeightG;
  const reps = set.reps ?? set.targetReps;
  const rir = set.rir ?? set.targetRir;
  const time = set.timeMs ?? set.targetTimeMs;
  const ghostW = set.weightG == null && set.targetWeightG != null;
  const ghostR = set.reps == null && set.targetReps != null;
  const ghostE = set.rir == null && set.targetRir != null;
  const ghostT = set.timeMs == null && set.targetTimeMs != null;

  const weightText = w == null ? '—' : mode === 'bodyweight' ? (w > 0 ? `+${formatWeight(w, unit)}` : 'BW') : mode === 'assisted' ? `−${formatWeight(Math.abs(w), unit)}` : formatWeight(w, unit);
  let repsText = reps == null ? '—' : String(reps);
  if (!done && set.reps == null && set.targetRepsMax && set.targetReps && set.targetRepsMax !== set.targetReps) repsText = `${set.targetReps}–${set.targetRepsMax}`;
  if (set.partials) repsText += `+${set.partials}p`;
  if (set.forced) repsText += `+${set.forced}a`;
  const effortText = rir == null ? '—' : effort === 'rir' ? String(rir) : String(10 - rir);
  const prevText = prev ? (timed ? formatClock(prev.timeMs ?? 0) : formatSet(prev.weightG, prev.reps, unit)) : '';

  const kgWord = unit === 'kg' ? 'kilograms' : 'pounds';
  const a11y = [
    info.label,
    done ? 'completed' : 'not done',
    w != null ? `${Math.round(fromGrams(w, unit) * 100) / 100} ${kgWord}` : null,
    timed ? (time != null ? `${Math.round(time / 1000)} seconds` : null) : reps != null ? `${reps} reps` : null,
    rir != null ? (effort === 'rir' ? `${rir} reps in reserve` : `RPE ${10 - rir}`) : null,
    set.side ? (set.side === 'L' ? 'left side' : 'right side') : null,
  ]
    .filter(Boolean)
    .join(', ');

  const segText = set.segments.length
    ? set.type === 'drop' || set.type === 'mechDrop'
      ? set.segments.map((s) => formatSet(s.weightG ?? set.weightG, s.reps, unit)).join(' → ')
      : set.segments.map((s) => `${s.reps ?? '—'}`).join(' + ')
    : null;

  return (
    <div id={`set-${set.id}`} data-tour={tour ? 'set-row' : undefined} className={cx(wide && 'border-l-[3px]', focused ? 'border-l-ink bg-raised' : 'border-l-transparent', isNext && !done && 'bg-raised')}>
      <div className="relative flex min-h-row items-center border-b border-rule pl-3 pr-1">
        {linked ? <span className="absolute -top-3 left-[27px] h-4 w-0.5 bg-blue-ring" aria-hidden /> : null}
        <span className="flex w-9 shrink-0 justify-center" data-tour={tour ? 'set-ring' : undefined}>
          <SetTypeRing type={set.type} index={index} state={done ? 'done' : 'pending'} onClick={() => onRing(set)} label={`${a11y}. Change set type`} />
        </span>
        {/* Last time and today's values sit in one span, so the tour's spotlight takes in both. Its basis is the
            previous column's width, so the columns still line up with SetColumns. */}
        <span className="flex min-w-0 items-center" style={{ flex: `${timed ? 2.3 : 2.2} 1 ${wide ? 120 : 72}px` }} data-tour={tour ? 'set-values' : undefined}>
          <span className={cx('t-num-m line-clamp-2 shrink-0 text-pencil', wide ? 'w-[120px] text-[14px]' : 'w-[72px] text-[13px]')} aria-label={prev ? `Last time ${prevText}` : 'No previous set'}>
            {prevText}
            {set.side ? ` ${set.side}` : ''}
          </span>
          {timed ? (
            <>
              {mode !== 'time' || (w ?? 0) > 0 ? <Cell text={weightText} ghost={ghostW} onClick={() => onEdit(set, 'weight')} label={`Load ${weightText}`} /> : <span className="flex-1" />}
              <Cell text={time != null ? formatClock(time) : info.openEnded ? 'start' : '—'} ghost={ghostT} onClick={() => onEdit(set, 'time')} label={info.openEnded ? 'Start the stopwatch' : 'Time'} grow={1.3} />
            </>
          ) : (
            <>
              <Cell text={weightText} ghost={ghostW} onClick={() => onEdit(set, 'weight')} label={`Weight ${weightText}`} grow={1.2} />
              <Cell text={repsText} ghost={ghostR} onClick={() => onEdit(set, 'reps')} label={`Reps ${repsText}`} />
            </>
          )}
        </span>
        <Cell text={effortText} ghost={ghostE} onClick={() => onEdit(set, 'rir')} label={`${effort.toUpperCase()} ${effortText}`} grow={0.7} />
        <button type="button" onClick={() => onMore(set)} aria-label="More set options" className="inline-flex h-touch w-8 shrink-0 items-center justify-center text-pencil hover:text-ink2">
          <Ellipsis size={18} strokeWidth={1.75} />
        </button>
        <button type="button" role="checkbox" aria-checked={done} aria-label={done ? 'Mark not done' : 'Complete set'} onClick={() => onToggle(set)} data-tour={tour ? 'set-tick' : undefined} className="inline-flex h-touch w-touch shrink-0 items-center justify-center transition-transform active:scale-[0.86]">
          <CheckDot done={done} color={ringVar(info.ring)} />
        </button>
      </div>
      {segText ? <p className="t-num-m py-1 pl-[52px] text-[13px] text-pencil">{set.type === 'drop' || set.type === 'mechDrop' ? `drops: ${segText}` : `then ${segText}`}</p> : null}
    </div>
  );
});

/** Column headings for the desktop log, aligned with SetRow's columns. */
export function SetColumns({ effort, timed }: { effort: 'rir' | 'rpe'; timed?: boolean }) {
  return (
    <div className="t-meta flex items-center border-b border-rule py-1.5 pl-[15px] pr-1 text-pencil" aria-hidden>
      <span className="w-9 text-center">SET</span>
      <span className="w-[120px]">PREVIOUS</span>
      {timed ? (
        <>
          <span className="flex-1 text-center">LOAD</span>
          <span className="text-center" style={{ flex: 1.3 }}>
            TIME
          </span>
        </>
      ) : (
        <>
          <span className="text-center" style={{ flex: 1.2 * 1.1 }}>
            WEIGHT
          </span>
          <span className="flex-1 text-center">REPS</span>
        </>
      )}
      <span className="text-center" style={{ flex: 0.7 }}>
        {effort.toUpperCase()}
      </span>
      <span className="w-[80px]" />
    </div>
  );
}
