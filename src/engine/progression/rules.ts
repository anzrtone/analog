// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { estimate1rm, loadFor } from '../math/e1rm';
import { formatClock } from '../math/units';
import { capAndRound, heaviest, kg, lastSession, repeat, rirText, setText, workSets } from './helpers';
import type {
  DoubleParams,
  LinearParams,
  ManualParams,
  MesoParams,
  RpeParams,
  RuleInput,
  RuleOutput,
  TimeParams,
  TmParams,
  TopBackoffParams,
  TripleParams,
} from './types';

// Every rule is a pure function: (params, history, state, settings) → targets + explanation.

export function linear({ params: p, history, state, settings }: RuleInput<LinearParams>): RuleOutput {
  const sets = workSets(lastSession(history));
  // What was actually lifted last time wins over stored state, so the same lift on two days stays in step.
  const load = heaviest(sets) ?? state.loadG;
  const target = (w: number | null) => repeat(p.sets, { type: 'working', weightG: w, reps: p.reps, rir: p.rir });
  const detail = `Linear: hit every set at ${p.reps} reps and the weight goes up by ${kg(settings.incrementG, settings)}. Miss ${p.failThreshold} times in a row and it drops ${Math.round(p.deloadPct * 100)}% so you can build back up.`;
  if (load == null || !sets.length) {
    return { targets: target(load), state: { ...state, loadG: load, fails: 0 }, event: 'start', explanation: 'First session: pick a weight you could do for a few more reps.', detail };
  }
  const success = sets.length >= p.sets && sets.every((s) => (s.reps ?? 0) >= p.reps);
  if (success) {
    const next = capAndRound(load + settings.incrementG, load, settings);
    return {
      targets: target(next),
      state: { ...state, loadG: next, fails: 0 },
      event: 'increase',
      explanation: `+${kg(next - load, settings)} · hit ${p.sets} × ${p.reps} last time`,
      detail,
    };
  }
  const fails = state.fails + 1;
  const worst = Math.min(...sets.map((s) => s.reps ?? 0));
  if (fails >= p.failThreshold) {
    const next = settings.round(load * (1 - p.deloadPct));
    return {
      targets: target(next),
      state: { ...state, loadG: next, fails: 0 },
      event: 'deload',
      explanation: `Down to ${kg(next, settings)} · ${fails} misses in a row, build back up from here`,
      detail,
    };
  }
  return {
    targets: target(load),
    state: { ...state, loadG: load, fails },
    event: 'hold',
    explanation: `Hold ${kg(load, settings)} · reps dropped to ${worst} of ${p.reps}`,
    detail,
  };
}

export function double({ params: p, history, state, settings }: RuleInput<DoubleParams>): RuleOutput {
  const sets = workSets(lastSession(history));
  const load = heaviest(sets) ?? state.loadG;
  const detail = `Double progression: add reps until every set reaches ${p.repsMax}, then add ${kg(settings.incrementG, settings)} and go back to ${p.repsMin}.`;
  if (load == null || !sets.length) {
    return { targets: repeat(p.sets, { type: 'working', weightG: load, reps: p.repsMin, repsMax: p.repsMax, rir: p.rir }), state: { ...state, loadG: load }, event: 'start', explanation: `Start at ${p.repsMin} reps with a weight you could do ${p.repsMax} times.`, detail };
  }
  if (sets.length >= p.sets && sets.every((s) => (s.reps ?? 0) >= p.repsMax)) {
    const next = capAndRound(load + settings.incrementG, load, settings);
    return {
      targets: repeat(p.sets, { type: 'working', weightG: next, reps: p.repsMin, repsMax: p.repsMax, rir: p.rir }),
      state: { ...state, loadG: next, fails: 0 },
      event: 'increase',
      explanation: `+${kg(next - load, settings)} · hit ${p.sets} × ${p.repsMax}${rirText(p.rir)} last time`,
      detail,
    };
  }
  const targets = Array.from({ length: p.sets }, (_, i) => {
    const last = sets[i]?.reps ?? p.repsMin;
    return { type: 'working' as const, weightG: load, reps: Math.min(p.repsMax, Math.max(p.repsMin, last + 1)), repsMax: p.repsMax, rir: p.rir };
  });
  return {
    targets,
    state: { ...state, loadG: load },
    event: 'addReps',
    explanation: `Same weight, +1 rep a set · last time ${setText(sets, settings)}`,
    detail,
  };
}

export function triple({ params: p, history, state, settings }: RuleInput<TripleParams>): RuleOutput {
  const sets = workSets(lastSession(history));
  const load = heaviest(sets) ?? state.loadG;
  const nSets = state.sets ?? p.setsMin;
  const t = (w: number | null, n: number, reps: number) => repeat(n, { type: 'working', weightG: w, reps, repsMax: p.repsMax, rir: p.rir });
  const detail = `Triple progression: reps up to ${p.repsMax}, then a set at a time up to ${p.setsMax} sets, then +${kg(settings.incrementG, settings)} back at ${p.setsMin} × ${p.repsMin}.`;
  if (load == null || !sets.length) {
    return { targets: t(load, nSets, p.repsMin), state: { ...state, loadG: load, sets: nSets }, event: 'start', explanation: `Start with ${nSets} × ${p.repsMin}.`, detail };
  }
  const allTop = sets.length >= nSets && sets.every((s) => (s.reps ?? 0) >= p.repsMax);
  if (allTop && nSets < p.setsMax) {
    return { targets: t(load, nSets + 1, p.repsMin), state: { ...state, loadG: load, sets: nSets + 1 }, event: 'addSet', explanation: `+1 set · hit ${nSets} × ${p.repsMax} last time`, detail };
  }
  if (allTop) {
    const next = capAndRound(load + settings.incrementG, load, settings);
    return { targets: t(next, p.setsMin, p.repsMin), state: { ...state, loadG: next, sets: p.setsMin }, event: 'increase', explanation: `+${kg(next - load, settings)} · maxed out at ${p.setsMax} × ${p.repsMax}`, detail };
  }
  const targets = Array.from({ length: nSets }, (_, i) => ({ type: 'working' as const, weightG: load, reps: Math.min(p.repsMax, (sets[i]?.reps ?? p.repsMin) + 1), repsMax: p.repsMax, rir: p.rir }));
  return { targets, state: { ...state, loadG: load, sets: nSets }, event: 'addReps', explanation: `Same weight, +1 rep a set · last time ${setText(sets, settings)}`, detail };
}

/** Average of the best e1RM from each of the last `lookback` sessions. */
export function recentE1rm(history: RuleInput['history'], lookback: number): number | null {
  const recent = history.slice(-lookback);
  const bests = recent
    .map((s) => Math.max(0, ...workSets(s).filter((x) => x.weightG && x.reps).map((x) => estimate1rm(x.weightG!, x.reps!, x.rir).e1rm)))
    .filter((v) => v > 0);
  return bests.length ? bests.reduce((a, b) => a + b, 0) / bests.length : null;
}

export function rpe({ params: p, history, state, settings }: RuleInput<RpeParams>): RuleOutput {
  const e = recentE1rm(history, p.lookback);
  const rir = settings.mesoRir ?? p.rir;
  const detail = `RIR-based: the weight comes from your estimated max (best set of the last ${p.lookback} sessions) so that ${p.reps} reps leaves ${rir} in reserve.`;
  if (e == null) {
    return { targets: repeat(p.sets, { type: 'working', weightG: state.loadG, reps: p.reps, rir }), state, event: 'start', explanation: `Pick a weight for ${p.reps} reps with ${rir} left in the tank.`, detail };
  }
  const prev = heaviest(workSets(lastSession(history))) ?? state.loadG;
  const next = capAndRound(loadFor(e, p.reps, rir), prev, settings);
  const diff = prev != null ? next - prev : 0;
  const lead = diff > 0 ? `+${kg(diff, settings)}` : diff < 0 ? `−${kg(-diff, settings)}` : `Hold ${kg(next, settings)}`;
  return {
    targets: repeat(p.sets, { type: 'working', weightG: next, reps: p.reps, rir }),
    state: { ...state, loadG: next },
    event: diff > 0 ? 'increase' : diff < 0 ? 'deload' : 'hold',
    explanation: `${lead} · e1RM ${kg(Math.round(e), settings)} → ${p.reps} reps${rirText(rir)}`,
    detail,
  };
}

export function tm({ params: p, history, state, settings }: RuleInput<TmParams>): RuleOutput {
  const weekCount = p.weeks.length;
  const week = state.week ?? 0;
  const tmG = state.tmG ?? p.startTmG ?? null;
  const detail = `Training max: each week is a set of percentages of your TM. Beat the AMRAP prescription by ${p.amrapExtra}+ reps and the TM goes up ${kg(p.tmIncrementG, settings)}; fall short of the prescription by more than 2 and it drops ${Math.round(p.dropPct * 100)}%.`;
  const build = (tmv: number | null, w: number) =>
    (p.weeks[w % weekCount] ?? []).map((s) => ({ type: s.amrap ? ('amrap' as const) : ('working' as const), weightG: tmv == null ? null : settings.round(tmv * s.pct), reps: s.reps, rir: null }));

  if (tmG == null) return { targets: build(null, week), state, event: 'start', explanation: 'Set a training max (about 90% of your best single) to start.', detail };

  const last = lastSession(history);
  const amrap = last?.sets.find((s) => s.type === 'amrap');
  const nextWeek = last ? week + 1 : week;
  if (!amrap || amrap.reps == null) {
    return { targets: build(tmG, nextWeek), state: { ...state, week: nextWeek }, event: last ? 'hold' : 'start', explanation: `Week ${(nextWeek % weekCount) + 1} of ${weekCount} · TM ${kg(tmG, settings)}`, detail };
  }
  const prescribed = (p.weeks[week % weekCount] ?? []).find((s) => s.amrap)?.reps ?? 1;
  const needed = prescribed + p.amrapExtra;
  let nextTm = tmG;
  let event: RuleOutput['event'] = 'hold';
  let why: string;
  if (amrap.reps >= needed) {
    nextTm = tmG + p.tmIncrementG;
    event = 'increase';
    why = `TM +${kg(p.tmIncrementG, settings)} · AMRAP hit ${amrap.reps} (needed ${needed})`;
  } else if (amrap.reps >= prescribed - 2) {
    why = `Hold TM ${kg(tmG, settings)} · AMRAP ${amrap.reps}, needed ${needed} to raise it`;
  } else {
    nextTm = settings.round(tmG * (1 - p.dropPct));
    event = 'deload';
    why = `TM down to ${kg(nextTm, settings)} · AMRAP ${amrap.reps}, prescribed ${prescribed}`;
  }
  return { targets: build(nextTm, nextWeek), state: { ...state, tmG: nextTm, week: nextWeek }, event, explanation: why, detail };
}

export function time({ params: p, history, state, settings }: RuleInput<TimeParams>): RuleOutput {
  const sets = workSets(lastSession(history)).filter((s) => (s.timeMs ?? 0) > 0);
  const load = state.loadG ?? 0;
  const targetMs = state.targetMs ?? p.timeMinMs;
  const ladderIndex = state.ladderIndex ?? 0;
  const t = (ms: number, w: number) => repeat(p.sets, { type: 'amtap', weightG: w || null, reps: null, rir: null, timeMs: ms });
  const detail = `Time progression: aim for your best + ${formatClock(p.stepMs)} each session. When every set reaches ${formatClock(p.timeMaxMs)}, ${p.ladder.length ? 'move to the next variation' : `add ${kg(p.loadStepG, settings)}`} and start again at ${formatClock(p.timeMinMs)}. Miss ${p.failThreshold} times and the target drops 10%.`;
  if (!sets.length) return { targets: t(targetMs, load), state: { ...state, targetMs }, event: 'start', explanation: `Hold for ${formatClock(targetMs)} or longer.`, detail };

  const best = Math.max(...sets.map((s) => s.timeMs!));
  if (sets.length >= p.sets && sets.every((s) => s.timeMs! >= p.timeMaxMs)) {
    if (p.ladder.length && ladderIndex < p.ladder.length) {
      return { targets: t(p.timeMinMs, load), state: { ...state, targetMs: p.timeMinMs, fails: 0, ladderIndex: ladderIndex + 1 }, event: 'nextVariation', explanation: `Next variation · every set past ${formatClock(p.timeMaxMs)}`, detail };
    }
    const nextLoad = load + p.loadStepG;
    return { targets: t(p.timeMinMs, nextLoad), state: { ...state, loadG: nextLoad, targetMs: p.timeMinMs, fails: 0 }, event: 'increase', explanation: `+${kg(p.loadStepG, settings)}, back to ${formatClock(p.timeMinMs)} · every set past ${formatClock(p.timeMaxMs)}`, detail };
  }
  if (best >= targetMs) {
    const next = Math.min(p.timeMaxMs, best + p.stepMs);
    return { targets: t(next, load), state: { ...state, targetMs: next, fails: 0 }, event: 'addTime', explanation: `Aim for ${formatClock(next)} · best last time ${formatClock(best)}`, detail };
  }
  const fails = state.fails + 1;
  if (fails >= p.failThreshold) {
    const next = Math.max(p.timeMinMs, Math.round((targetMs * 0.9) / 1000) * 1000);
    return { targets: t(next, load), state: { ...state, targetMs: next, fails: 0 }, event: 'deload', explanation: `Target down to ${formatClock(next)} · missed ${fails} times`, detail };
  }
  return { targets: t(targetMs, load), state: { ...state, targetMs, fails }, event: 'hold', explanation: `Hold the ${formatClock(targetMs)} target · best was ${formatClock(best)}`, detail };
}

export function topBackoff({ params: p, history, state, settings }: RuleInput<TopBackoffParams>): RuleOutput {
  const last = lastSession(history);
  const top = last?.sets.find((s) => s.type === 'top' && s.weightG && s.reps);
  const detail = `Top set + back-offs: the top set is worked out from your estimated max for ${p.topReps} reps at ${p.topRir} RIR. Back-offs are ${Math.round(p.backoffPct * 100)}% lighter.`;
  const build = (topG: number | null) => [
    { type: 'top' as const, weightG: topG, reps: p.topReps, rir: p.topRir },
    ...repeat(p.backoffSets, { type: 'backoff', weightG: topG == null ? null : settings.round(topG * (1 - p.backoffPct)), reps: p.backoffReps, rir: null }),
  ];
  if (!top) return { targets: build(state.loadG), state, event: 'start', explanation: `Work up to a top set of ${p.topReps} at ${p.topRir} RIR.`, detail };
  const e = estimate1rm(top.weightG!, top.reps!, top.rir).e1rm;
  const rir = settings.mesoRir ?? p.topRir;
  const next = capAndRound(loadFor(e, p.topReps, rir), top.weightG, settings);
  const diff = next - top.weightG!;
  const lead = diff > 0 ? `+${kg(diff, settings)}` : diff < 0 ? `−${kg(-diff, settings)}` : `Hold ${kg(next, settings)}`;
  return {
    targets: build(next),
    state: { ...state, loadG: next },
    event: diff > 0 ? 'increase' : diff < 0 ? 'deload' : 'hold',
    explanation: `${lead} top set · last ${kg(top.weightG!, settings)} × ${top.reps}${rirText(top.rir)}`,
    detail,
  };
}

/**
 * Load inside a mesocycle (SPEC §6.4): last week's reps at this week's lower RIR target.
 * Reps hit with RIR to spare → add the increment; missed → hold the load and keep the reps.
 * Set count comes from the adaptive volume plan, so it's passed in on state.sets.
 */
export function meso({ params: p, history, state, settings }: RuleInput<MesoParams>): RuleOutput {
  const sets = workSets(lastSession(history));
  const rir = settings.mesoRir ?? 2;
  const n = state.sets ?? 2;
  const detail = `Mesocycle: reps from last week at this week's RIR target (${rir}). Beat last week's effort with reps to spare and the weight goes up; otherwise it holds.`;
  if (!sets.length) {
    return { targets: repeat(n, { type: 'working', weightG: state.loadG, reps: p.repsMin, repsMax: p.repsMax, rir }), state, event: 'start', explanation: `Pick a weight for ${p.repsMin}–${p.repsMax} reps at ${rir} RIR.`, detail };
  }
  const load = heaviest(sets)!;
  const reps = Math.max(p.repsMin, Math.min(p.repsMax, Math.round(sets.reduce((a, s) => a + (s.reps ?? 0), 0) / sets.length)));
  const spare = sets.every((s) => (s.reps ?? 0) >= reps && (s.rir ?? 0) > rir);
  const missed = sets.some((s) => (s.reps ?? 0) < p.repsMin);
  if (spare && !missed) {
    const next = capAndRound(load + settings.incrementG, load, settings);
    return { targets: repeat(n, { type: 'working', weightG: next, reps, repsMax: p.repsMax, rir }), state: { ...state, loadG: next }, event: 'increase', explanation: `+${kg(next - load, settings)} · reps to spare last week, now ${rir} RIR`, detail };
  }
  const nextReps = missed ? reps : Math.min(p.repsMax, reps + (sets.every((s) => (s.rir ?? 0) >= rir) ? 1 : 0));
  return { targets: repeat(n, { type: 'working', weightG: load, reps: nextReps, repsMax: p.repsMax, rir }), state: { ...state, loadG: load }, event: missed ? 'hold' : 'addReps', explanation: missed ? `Hold ${kg(load, settings)} · reps dropped below ${p.repsMin}` : `Same weight, ${nextReps} reps at ${rir} RIR`, detail };
}

export function manual({ history, state }: RuleInput<ManualParams>): RuleOutput {
  const sets = workSets(lastSession(history));
  return {
    targets: sets.map((s) => ({ type: s.type, weightG: s.weightG, reps: s.reps, rir: s.rir, timeMs: s.timeMs })),
    state,
    event: 'manual',
    explanation: 'Manual · last session shown, no suggestions',
    detail: 'Manual: Analog shows what you did last time and leaves the rest to you.',
  };
}
