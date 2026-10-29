// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useState } from 'react';
import { addFeedback } from '@/db/repos';
import { db } from '@/db/schema';
import { MUSCLE_LABEL, type Muscle } from '@/engine/types';
import { FillRing } from './Charts';
import { cx } from './ui';

// Adaptive-volume feedback (SPEC §6.2, BRAND §7): one question per card, serif question text,
// rings that fill 0 → 3 instead of emoji. Skip is always visible and never nags.

export interface Question {
  key: string;
  kind: 'pump' | 'pain' | 'workload' | 'soreness';
  text: string;
  muscle?: Muscle;
  exerciseId?: string;
  slotId?: string | null;
}

const OPTIONS = {
  pump: [
    { value: '0', label: 'None' },
    { value: '1', label: 'Mild' },
    { value: '2', label: 'Good' },
    { value: '3', label: 'Great' },
  ],
  pain: [
    { value: 'none', label: 'None' },
    { value: 'some', label: 'Some' },
    { value: 'lot', label: 'A lot' },
  ],
  workload: [
    { value: 'easy', label: 'Easy' },
    { value: 'right', label: 'Just right' },
    { value: 'pushed', label: 'Pushed my limits' },
    { value: 'tooMuch', label: 'Too much' },
  ],
  soreness: [
    { value: 'never', label: 'Never sore' },
    { value: 'early', label: 'Healed well before' },
    { value: 'justInTime', label: 'Just in time' },
    { value: 'still', label: 'Still sore' },
  ],
};

export function pumpQuestion(exerciseName: string, muscle: Muscle | undefined, exerciseId: string, slotId: string | null): Question {
  return { key: `pump:${slotId ?? exerciseId}`, kind: 'pump', text: `How was the pump in your ${muscle ? MUSCLE_LABEL[muscle] : 'target muscle'} on ${exerciseName.toLowerCase()}?`, exerciseId, slotId };
}
export function painQuestion(exerciseName: string, exerciseId: string, slotId: string | null): Question {
  return { key: `pain:${slotId ?? exerciseId}`, kind: 'pain', text: `Any joint pain on ${exerciseName.toLowerCase()}?`, exerciseId, slotId };
}
export function workloadQuestion(m: Muscle): Question {
  return { key: `workload:${m}`, kind: 'workload', text: `How hard did the volume for your ${MUSCLE_LABEL[m]} feel?`, muscle: m };
}
export function sorenessQuestion(m: Muscle): Question {
  return { key: `soreness:${m}`, kind: 'soreness', text: `Since you last trained your ${MUSCLE_LABEL[m]}, how did they recover?`, muscle: m };
}

export function FeedbackCard<V extends string>({ question, options, value, onPick, onSkip }: { question: string; options: { value: V; label: string }[]; value?: V | null; onPick: (v: V) => void; onSkip: () => void }) {
  return (
    <div className="flex flex-col gap-4 px-margin py-4">
      <p className="t-title-m">{question}</p>
      <div className="flex justify-between" role="radiogroup" aria-label={question}>
        {options.map((o, i) => {
          const on = value === o.value;
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onPick(o.value)} className={cx('flex min-h-touch flex-1 flex-col items-center gap-1.5 rounded-control py-1.5 transition-colors active:scale-[0.96]', on ? 'bg-sunk' : 'hover:bg-sunk/60')}>
              <FillRing level={(i * 3) / (options.length - 1)} />
              <span className={cx('t-label text-center', on ? 'text-ink' : 'text-ink2')}>{o.label}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="btn-ghost" onClick={onSkip}>
        Skip
      </button>
    </div>
  );
}

/** One question at a time, every one skippable. Answers go straight to the feedback table. */
export function FeedbackFlow({ questions, workoutId, runId, onDone }: { questions: Question[]; workoutId: string; runId: string | null; onDone: () => void }) {
  const [i, setI] = useState(0);
  const q = questions[i];
  if (!q) return null;
  const next = () => (i + 1 >= questions.length ? onDone() : setI(i + 1));
  return (
    <div>
      <p className="t-meta px-margin text-pencil">{`QUESTION ${i + 1} OF ${questions.length} · SHAPES NEXT WEEK'S SETS`}</p>
      <FeedbackCard
        key={q.key}
        question={q.text}
        options={OPTIONS[q.kind]}
        onPick={(value) => {
          void addFeedback(db, { workoutId, runId, muscle: q.muscle ?? null, exerciseId: q.exerciseId ?? null, slotId: q.slotId ?? null, kind: q.kind, value: String(value) });
          next();
        }}
        onSkip={next}
      />
    </div>
  );
}
