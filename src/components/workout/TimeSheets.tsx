// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useEffect, useState } from 'react';
import { useSettings } from '@/db/settings';
import { formatClock } from '@/engine/math/units';
import { formatTimeOfDay, resolveSpan, windBack } from '@/engine/timer/session';
import { setWorkoutStart } from '@/features/workout/actions';
import { Field, Pad, Sheet } from '../ui';

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const STEPS = [5, 15, 30, 60];

/**
 * Fix the workout's clock: turn the elapsed counter back, or say when you trained ("from 4:05 to 5:20 pm").
 * With an end time it finishes the workout at that time.
 */
export function WorkoutTimeSheet({ workoutId, startedAt, suggestedEnd, onFinish, onClose }: { workoutId: string; startedAt: number; suggestedEnd?: number | null; onFinish: (endedAt: number) => void; onClose: () => void }) {
  const now = useNow();
  const clock = useSettings().clock;
  // Untouched, "From" follows the start, so the −N min buttons show up in it.
  const [typedFrom, setTypedFrom] = useState<string | null>(null);
  const from = typedFrom ?? formatTimeOfDay(startedAt, clock);
  const [to, setTo] = useState(() => (suggestedEnd ? formatTimeOfDay(suggestedEnd, clock) : ''));
  const [error, setError] = useState<string | null>(null);
  const elapsed = Math.max(0, now - startedAt);
  const save = () => {
    const r = resolveSpan(from, to, startedAt, Date.now(), clock);
    if (!r.ok) return setError(r.error);
    if (Math.abs(r.startedAt - startedAt) >= 60000) void setWorkoutStart(workoutId, r.startedAt);
    onClose();
    if (r.endedAt != null) onFinish(r.endedAt);
  };

  return (
    <Sheet open onClose={onClose} title="Workout time">
      <Pad className="flex flex-col gap-5 py-3">
        <p className="text-ink2">{`Started ${formatTimeOfDay(startedAt, clock)} · ${formatClock(elapsed)} so far.`}</p>
        <div className="flex flex-col gap-2">
          <p className="t-meta text-pencil">TURN THE CLOCK BACK</p>
          <div className="flex flex-wrap gap-2">
            {STEPS.map((min) => (
              <button
                key={min}
                type="button"
                className="btn-secondary btn-compact"
                aria-label={`Take ${min < 60 ? `${min} minutes` : 'an hour'} off the clock`}
                disabled={elapsed < min * 60000}
                onClick={() => void setWorkoutStart(workoutId, windBack(startedAt, min * 60000, Date.now()))}
              >
                {min < 60 ? `−${min} min` : '−1 h'}
              </button>
            ))}
          </div>
        </div>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <p className="t-meta text-pencil">OR SAY WHEN YOU TRAINED</p>
          <div className="flex gap-2">
            <div className="flex-1">
              <Field
                label="From"
                value={from}
                autoCapitalize="none"
                autoCorrect="off"
                onChange={(e) => {
                  setTypedFrom(e.target.value);
                  setError(null);
                }}
              />
            </div>
            <div className="flex-1">
              <Field
                label="To"
                placeholder="still going"
                value={to}
                autoCapitalize="none"
                autoCorrect="off"
                onChange={(e) => {
                  setTo(e.target.value);
                  setError(null);
                }}
              />
            </div>
          </div>
          {error ? (
            <p className="t-label text-red-text" aria-live="polite">
              {error}
            </p>
          ) : (
            <p className="t-hint">{to.trim() ? 'Finishes the workout at the end time.' : 'Leave “To” empty if you’re still training.'}</p>
          )}
          <button type="submit" className="btn-primary">
            {to.trim() ? 'Finish workout' : 'Set start time'}
          </button>
        </form>
      </Pad>
    </Sheet>
  );
}

/** Shown once a workout has run for hours: most often someone left the gym and forgot to tap Finish. */
export function LongWorkoutSheet({ startedAt, lastSetAt, onFinishAt, onSetTimes, onStillGoing }: { startedAt: number; lastSetAt: number | null; onFinishAt: (endedAt: number) => void; onSetTimes: () => void; onStillGoing: () => void }) {
  const now = useNow();
  const clock = useSettings().clock;
  return (
    <Sheet open onClose={onStillGoing} title="Still training?">
      <Pad className="flex flex-col gap-3 py-3">
        <p className="text-ink2">{`This workout has been running for ${formatClock(now - startedAt)}. If it’s over, finish it at the right time so your log stays honest.`}</p>
        {lastSetAt ? (
          <button type="button" className="btn-primary" onClick={() => onFinishAt(lastSetAt)}>
            {`Finish at last set · ${formatTimeOfDay(lastSetAt, clock)}`}
          </button>
        ) : null}
        <button type="button" className={lastSetAt ? 'btn-secondary' : 'btn-primary'} onClick={onSetTimes}>
          Set the times
        </button>
        <button type="button" className="btn-ghost" onClick={onStillGoing}>
          Still going
        </button>
      </Pad>
    </Sheet>
  );
}
