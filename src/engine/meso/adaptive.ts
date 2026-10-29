// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { MUSCLE_LABEL, type Muscle } from '../types';
import type { MuscleChange, MuscleFeedback, MuscleHistory, MuscleScore, PlanSlot, SlotChange, SwapSuggestion, WeekPlan, WeekPlanInput } from './types';

// Adaptive volume, SPEC §6.3. Every number here is visible to the user through the explanation cards.

const RECOVERY = { never: [1, 'never got sore'], early: [1, 'healed early'], justInTime: [0, 'healed just in time'], still: [-2, 'still sore'] } as const;
const WORKLOAD = { easy: [1, 'easy workload'], right: [0, 'workload just right'], pushed: [-1, 'workload pushed your limits'], tooMuch: [-2, 'workload was too much'] } as const;
const PUMP: Record<number, [number, string]> = { 0: [1, 'no pump'], 1: [0.5, 'mild pump'], 2: [0, 'good pump'], 3: [0, 'great pump'] };

export function scoreMuscle(muscle: Muscle, f: MuscleFeedback | undefined): MuscleScore {
  if (!f) return { muscle, score: 0, reasons: [], empty: true };
  let score = 0;
  const reasons: string[] = [];
  if (f.soreness) {
    const [v, r] = RECOVERY[f.soreness];
    score += v;
    reasons.push(r);
  }
  if (f.workload) {
    const [v, r] = WORKLOAD[f.workload];
    score += v;
    reasons.push(r);
  }
  if (f.pumps.length) {
    const avg = Math.round(f.pumps.reduce<number>((a, b) => a + b, 0) / f.pumps.length);
    const [v, r] = PUMP[avg]!;
    score += v;
    reasons.push(r);
  }
  if (f.performance) {
    if (f.performance === 'dropped') {
      score -= 1;
      reasons.push('reps dropped');
    } else reasons.push('performance held');
  }
  return { muscle, score, reasons, empty: reasons.length === 0 };
}

/** Score → set change before clamping. */
export function deltaForScore(score: number): number {
  if (score >= 2) return 2;
  if (score >= 1) return 1;
  if (score <= -3) return -1;
  return 0;
}

function joinReasons(r: string[]): string {
  return r.length ? r.join(' + ') : 'no feedback';
}

/** Sets per muscle in the plan, counting primary movers only. */
function setsFor(muscle: Muscle, slots: PlanSlot[]): number {
  return slots.filter((s) => s.primary.includes(muscle)).reduce((a, s) => a + s.sets, 0);
}

function stimulus(s: PlanSlot): number {
  const painPenalty = s.pain === 'lot' ? 10 : s.pain === 'some' ? 2 : 0;
  return (s.pump ?? 1.5) - painPenalty;
}

export function planWeek(input: WeekPlanInput): WeekPlan {
  const slots = input.slots.map((s) => ({ ...s }));
  const daySets = new Map<string, number>();
  for (const s of slots) daySets.set(s.dayId, (daySets.get(s.dayId) ?? 0) + s.sets);

  const muscles = new Set<Muscle>(slots.flatMap((s) => s.primary));
  const changes: MuscleChange[] = [];
  const slotChanges: SlotChange[] = [];
  const cards: string[] = [];
  const overflow: WeekPlan['overflow'] = [];
  const history: WeekPlan['history'] = {};
  const deloadMuscles: Muscle[] = [];

  for (const m of [...muscles].sort()) {
    const lm = input.landmarks[m];
    const sc = scoreMuscle(m, input.feedback[m]);
    const prev: MuscleHistory = input.history[m] ?? { scores: [], stillSoreCount: 0 };
    const stillSore = input.feedback[m]?.soreness === 'still' ? prev.stillSoreCount + 1 : prev.stillSoreCount;
    history[m] = { scores: sc.empty ? prev.scores : [...prev.scores, sc.score], stillSoreCount: stillSore };

    const from = setsFor(m, slots);
    let delta = sc.empty ? 0 : deltaForScore(sc.score);
    let why = joinReasons(sc.reasons);
    if (!sc.empty && delta === 0 && sc.score === 0 && input.momentum && input.week === 2 && from <= lm.mev) {
      delta = 1;
      why += ', and week 2 at MEV keeps momentum';
    }
    let flag: MuscleChange['flag'] = sc.score <= -3 ? 'approachingMrv' : null;

    const lastTwo = history[m]!.scores.slice(-2);
    if ((lastTwo.length === 2 && lastTwo.every((x) => x <= -3)) || stillSore >= 2) {
      deloadMuscles.push(m);
    }

    // Clamp to [MEV, MRV], at most +2. Below MEV with feedback that isn't negative, climb toward MEV.
    let to = Math.min(from + Math.min(delta, 2), lm.mrv);
    if (!sc.empty && from < lm.mev && sc.score >= 0) {
      to = Math.max(to, Math.min(lm.mev, from + 2));
      if (to > from + delta) why += `, and you're under MEV (${lm.mev})`;
    }
    to = Math.max(to, Math.min(from, lm.mev));
    if (to >= lm.mrv && delta > 0) flag = 'atMrv';
    delta = to - from;

    // Place the change on actual slots.
    const placed: { slot: PlanSlot; d: number }[] = [];
    if (delta > 0) {
      let lastDay: string | null = null;
      for (let i = 0; i < delta; i++) {
        const candidates = slots
          .filter((s) => s.primary.includes(m) && s.pain !== 'lot' && (daySets.get(s.dayId) ?? 0) < input.sessionCap)
          .sort((a, b) => stimulus(b) - stimulus(a) || Number(a.dayId === lastDay) - Number(b.dayId === lastDay) || a.sets - b.sets);
        // Spread across days: prefer a different day from the last set added unless its pump is more than 1 point worse.
        const best = candidates.find((c) => c.dayId !== lastDay && stimulus(c) >= stimulus(candidates[0]!) - 1) ?? candidates[0];
        if (!best) {
          overflow.push({ muscle: m, sets: delta - i, explanation: `${cap(MUSCLE_LABEL[m])}: ${delta - i} more set${delta - i > 1 ? 's' : ''} won't fit under your ${input.sessionCap}-set session cap. Add a training day, or hold.` });
          break;
        }
        best.sets += 1;
        daySets.set(best.dayId, (daySets.get(best.dayId) ?? 0) + 1);
        lastDay = best.dayId;
        const p = placed.find((x) => x.slot.slotId === best.slotId);
        if (p) p.d += 1;
        else placed.push({ slot: best, d: 1 });
      }
    } else if (delta < 0) {
      const worst = slots.filter((s) => s.primary.includes(m) && s.sets > 1).sort((a, b) => stimulus(a) - stimulus(b))[0];
      if (worst) {
        worst.sets -= 1;
        daySets.set(worst.dayId, (daySets.get(worst.dayId) ?? 0) - 1);
        placed.push({ slot: worst, d: -1 });
      }
    }
    for (const p of placed) slotChanges.push({ slotId: p.slot.slotId, delta: p.d, muscle: m });
    const realDelta = placed.reduce((a, p) => a + p.d, 0);
    const toFinal = from + realDelta;
    const where = placed.map((p) => `${p.slot.dayName} ${p.slot.exerciseName.toLowerCase()}`).join(', ');
    const label = cap(MUSCLE_LABEL[m]);
    let explanation: string;
    if (realDelta > 0) explanation = `${label} +${realDelta} set${realDelta > 1 ? 's' : ''} (${where}): ${why}.`;
    else if (realDelta < 0) explanation = `${label} −1 set (${where}): ${why}. Approaching your max recoverable volume.`;
    else if (sc.empty) explanation = `${label} holds at ${from} sets: no feedback this week.`;
    else if (flag === 'atMrv') explanation = `${label} holds at ${from} sets: already at MRV (${lm.mrv}).`;
    else explanation = `${label} holds at ${from} sets: ${why}.`;
    if (from <= lm.mev && realDelta <= 0 && flag !== 'approachingMrv') flag = flag ?? 'atMev';
    changes.push({ muscle: m, from, to: toFinal, delta: realDelta, score: sc.score, flag, explanation });
    if (realDelta !== 0) cards.push(explanation);
  }

  const swaps: SwapSuggestion[] = [];
  for (const s of slots) {
    if (s.pain === 'lot') swaps.push({ slotId: s.slotId, exerciseName: s.exerciseName, explanation: `${s.exerciseName} hurt a lot. Swap it for the rest of the meso?` });
    else if (s.somePainCount >= 2) swaps.push({ slotId: s.slotId, exerciseName: s.exerciseName, explanation: `${s.exerciseName} has caused some joint pain twice. Swap it for the rest of the meso?` });
  }

  const program = input.deloadScope === 'program' && deloadMuscles.length > 0;
  const deloadExplanation = deloadMuscles.length
    ? `${deloadMuscles.map((m) => MUSCLE_LABEL[m]).join(', ')} ${deloadMuscles.length > 1 ? 'are' : 'is'} not recovering between sessions. ${program ? 'Deload the whole program this week.' : 'Deload those muscles this week.'}`
    : null;

  return { muscles: changes, slotChanges, cards, swaps, overflow, deload: { muscles: deloadMuscles, program, explanation: deloadExplanation }, history };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
