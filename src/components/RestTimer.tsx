// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useEffect, useRef, useState } from 'react';
import { formatClock } from '@/engine/math/units';
import { isRestOver, pulseSecond, remainingMs, ringFraction } from '@/engine/timer/rest';
import { sensory } from '@/features/sensory';
import { rest, restTimer } from '@/features/workout/timers';
import { platform } from '@/platform';
import { PlateRing } from './PlateRing';

/**
 * A yellow plate ring that empties clockwise, in a dashed box: "rest · next 27.5 × 10".
 * `bar` sits above the phone's bottom buttons; `panel` is the big version for the desktop margin.
 */
export function RestTimer({ variant = 'bar' }: { variant?: 'bar' | 'panel' }) {
  const { rest: r, next } = rest.use();
  const [now, setNow] = useState(() => Date.now());
  const lastPulse = useRef<number | null>(null);

  useEffect(() => {
    if (!r) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [r]);

  useEffect(() => {
    if (!r) return;
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
  }, [r, now]);

  if (!r) return null;
  const left = remainingMs(r, now);
  const label = `Rest, ${Math.ceil(left / 1000)} seconds left. ${next}`;
  const buttons = (cls: string) => (
    <>
      <button type="button" className={cls} onClick={() => restTimer.adjust(-15000)} aria-label="15 seconds less">
        −15
      </button>
      <button type="button" className={cls} onClick={() => restTimer.adjust(15000)} aria-label="15 seconds more">
        +15
      </button>
      <button type="button" className="btn-ghost btn-compact" onClick={restTimer.skip} aria-label="Skip rest">
        {variant === 'panel' ? 'Skip' : 'skip'}
      </button>
    </>
  );
  if (variant === 'panel') {
    return (
      <div role="timer" aria-live="polite" aria-label={label} className="flex flex-col items-center gap-3 rounded-sheet border-[1.5px] border-dashed border-yellow-ring bg-raised p-4">
        <span className="t-meta self-start text-yellow-text">REST</span>
        <span className="relative inline-flex items-center justify-center">
          <PlateRing color="yellow" state="progress" progress={ringFraction(r, now)} size={168} stroke={12} />
          <span className="t-display absolute text-[40px] leading-[46px]">{formatClock(left)}</span>
        </span>
        <span className="t-label line-clamp-2 text-center text-ink2">{next}</span>
        <div className="flex gap-1.5">{buttons('btn-secondary btn-compact')}</div>
      </div>
    );
  }
  return (
    <div role="timer" aria-live="polite" aria-label={label} className="mb-2 flex items-center gap-3 rounded-sheet border-[1.5px] border-dashed border-yellow-ring bg-raised p-2.5">
      <span className={`relative inline-flex shrink-0 items-center justify-center ${left <= 3000 ? 'animate-pulse1' : ''}`}>
        <PlateRing color="yellow" state="progress" progress={ringFraction(r, now)} size={56} stroke={5} />
        <span className="t-num-m absolute text-[14px]">{formatClock(left)}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="t-meta block text-yellow-text">REST</span>
        <span className="t-label line-clamp-2 text-ink2">{next}</span>
      </span>
      {buttons('btn-ghost btn-compact')}
    </div>
  );
}
