// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useEffect, useRef, useState } from 'react';
import { editDb } from '@/db/shown';
import { setExerciseRest } from '@/db/workouts';
import { formatClock } from '@/engine/math/units';
import { isRestOver, overrunMs, pulseSecond, remainingMs, ringFraction } from '@/engine/timer/rest';
import { sensory } from '@/features/sensory';
import { rest, restTimer } from '@/features/workout/timers';
import { platform } from '@/platform';
import { TimeEntrySheet } from './NumberSheet';
import { PlateRing } from './PlateRing';

/**
 * A yellow plate ring that empties clockwise, in a dashed box: "rest · next 27.5 × 10".
 * When rest runs out the bar stays as "Rest over", counting up how long you've been past it, with Go and more rest
 * (+15, +30) so a late look at the phone costs nothing. Tap the clock to type an exact rest.
 * `bar` sits above the phone's bottom buttons; `panel` is the big version for the desktop margin.
 */
export function RestTimer({ variant = 'bar' }: { variant?: 'bar' | 'panel' }) {
  const { rest: r, next, over, weId } = rest.use();
  const [now, setNow] = useState(() => Date.now());
  const [typing, setTyping] = useState(false);
  const lastPulse = useRef<number | null>(null);

  useEffect(() => {
    if (!r) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [r]);

  useEffect(() => {
    if (!r || over) return;
    const pulse = pulseSecond(r, now);
    if (pulse != null && pulse !== lastPulse.current) {
      lastPulse.current = pulse;
      sensory.restPulse();
    }
    if (isRestOver(r, now)) {
      lastPulse.current = null;
      // On Android the native alarm already rings the bell; don't ring twice.
      sensory.restOver(!platform().nativeRestAlarm());
      restTimer.finish();
    }
  }, [r, now, over]);

  if (!r) return null;
  const left = remainingMs(r, now);
  const past = overrunMs(r, now);
  const label = over ? `Rest over, ${Math.floor(past / 1000)} seconds ago. ${next}` : `Rest, ${Math.ceil(left / 1000)} seconds left. ${next}`;
  const compact = variant === 'panel' ? 'btn-secondary btn-compact' : 'btn-ghost btn-compact';
  const buttons = over ? (
    <>
      <button type="button" className={compact} onClick={() => restTimer.adjust(15000)} aria-label="15 more seconds of rest">
        +15
      </button>
      <button type="button" className={compact} onClick={() => restTimer.adjust(30000)} aria-label="30 more seconds of rest">
        +30
      </button>
      <button type="button" className="btn-primary btn-compact" onClick={restTimer.skip} aria-label="Rest over, keep going">
        Go
      </button>
    </>
  ) : (
    <>
      <button type="button" className={compact} onClick={() => restTimer.adjust(-15000)} aria-label="15 seconds less">
        −15
      </button>
      <button type="button" className={compact} onClick={() => restTimer.adjust(15000)} aria-label="15 seconds more">
        +15
      </button>
      <button type="button" className="btn-ghost btn-compact" onClick={restTimer.skip} aria-label="Skip rest">
        {variant === 'panel' ? 'Skip' : 'skip'}
      </button>
    </>
  );
  const clock = over ? `+${formatClock(past)}` : formatClock(left);
  const panel = variant === 'panel';
  const ringSize = panel ? 168 : 56;
  const ring = (
    <button type="button" onClick={() => setTyping(true)} aria-label="Set the rest time" className={`relative inline-flex shrink-0 items-center justify-center rounded-full ${!over && !panel && left <= 3000 ? 'animate-pulse1' : ''}`}>
      <PlateRing color="yellow" state={over ? 'done' : 'progress'} progress={ringFraction(r, now)} size={ringSize} stroke={panel ? 12 : 5} />
      <span className={panel ? 't-display absolute text-[40px] leading-[46px]' : 't-num-m absolute text-[14px]'}>{clock}</span>
    </button>
  );
  const sheet = typing ? (
    <TimeEntrySheet
      title="Rest for"
      valueMs={over ? 30000 : Math.max(1000, Math.round(left / 1000) * 1000)}
      stepMs={15000}
      onDone={(ms) => {
        if (ms != null && ms > 0) restTimer.restFor(ms);
      }}
      onClose={() => setTyping(false)}
      secondary={
        weId
          ? {
              label: 'Use this for the rest of the workout',
              onClick: (ms) => {
                if (ms != null && ms > 0) {
                  restTimer.restFor(ms);
                  void setExerciseRest(editDb(), weId, ms);
                }
                setTyping(false);
              },
            }
          : undefined
      }
    />
  ) : null;
  const heading = over ? 'REST OVER' : 'REST';
  if (panel) {
    return (
      <div role="timer" aria-live="polite" aria-label={label} className="flex flex-col items-center gap-3 rounded-sheet border-[1.5px] border-dashed border-yellow-ring bg-raised p-4">
        <span className="t-meta self-start text-yellow-text">{heading}</span>
        {ring}
        <span className="t-label line-clamp-2 text-center text-ink2">{next}</span>
        <div className="flex gap-1.5">{buttons}</div>
        {sheet}
      </div>
    );
  }
  return (
    <div role="timer" aria-live="polite" aria-label={label} className="mb-2 flex items-center gap-3 rounded-sheet border-[1.5px] border-dashed border-yellow-ring bg-raised p-2.5">
      {ring}
      <span className="min-w-0 flex-1">
        <span className="t-meta block text-yellow-text">{heading}</span>
        <span className="t-label line-clamp-2 text-ink2">{next}</span>
      </span>
      {buttons}
      {sheet}
    </div>
  );
}
