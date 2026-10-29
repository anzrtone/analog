// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { getExercises, toInfo } from '@/db/exercises';
import { activeRun, feedbackForWorkouts, getRun, loadLandmarks, saveLandmark, saveRunState, type RunRow } from '@/db/repos';
import { newId, type AnalogDB } from '@/db/schema';
import { addExercise, getWorkout, startWorkout, toLoggedSet, workoutsForRun } from '@/db/workouts';
import { estimate1rm } from '@/engine/math/e1rm';
import { buildMesoReport, planWeek, rirForWeek, type JointPain, type MesoReport, type MuscleFeedback, type PlanSlot, type Pump, type Soreness, type Workload } from '@/engine/meso';
import { applyDeload, initialState, nextTargets, type EngineSettings, type RuleOutput, type SetTarget } from '@/engine/progression';
import { advanceRun, endsWeek, metaLine, resolveDay } from '@/engine/programs/resolve';
import type { RunState, Slot } from '@/engine/programs/types';
import type { Muscle } from '@/engine/types';
import { countVolume } from '@/engine/volume/count';
import { sessionsFor } from './workoutFlow';

export interface PlannedSlot {
  slot: Slot;
  output: RuleOutput;
  targets: SetTarget[];
}

type Settings = Omit<EngineSettings, 'incrementG' | 'mesoRir'>;

/** Targets for one program day: rule output, meso RIR, deloads applied. Pure reads. */
export async function planDay(d: AnalogDB, run: RunRow, settings: Settings, round: (g: number, exerciseId: string) => number): Promise<{ title: string; meta: string; slots: PlannedSlot[]; deload: boolean } | null> {
  const st = run.state;
  const r = resolveDay(run.program, st, st.blockIndex, st.weekIndex, st.dayIndex);
  if (!r) return null;
  const { block, day, slots, deload } = r;
  const rir = block.adaptive ? rirForWeek(st.weekIndex + 1, block.weeks, deload) : null;
  const infos = await getExercises(d, slots.map((s) => s.exerciseId));
  const histories = await Promise.all(slots.map((s) => sessionsFor(d, s.exerciseId)));
  const planned = slots.map((slot, i) => {
    const ex = infos.get(slot.exerciseId);
    const engine: EngineSettings = { ...settings, incrementG: ex?.incrementG ?? 2500, round: (g) => round(g, slot.exerciseId), mesoRir: rir };
    const state = { ...(st.slots[slot.id] ?? initialState), sets: slot.sets.length };
    const output = nextTargets({ params: slot.rule, history: histories[i]!, state, settings: engine });
    let targets = output.targets.length ? output.targets : slot.sets.map((s) => ({ type: s.type, weightG: null, reps: s.reps, repsMax: s.repsMax, rir: s.rir, timeMs: s.timeMs }));
    // Program prescription decides set types (e.g. AMRAP week override) when the rule gives plain sets.
    targets = targets.map((t, j) => (slot.sets[j] && t.type === 'working' && slot.sets[j]!.type !== 'working' ? { ...t, type: slot.sets[j]!.type } : t));
    const muscleDeload = !!ex && ex.primary.some((m) => st.deloadMuscles.includes(m));
    if (deload || st.deloadProgram || muscleDeload) targets = applyDeload(targets, run.program.meso.deloadStyle, engine).targets;
    return { slot, output, targets };
  });
  return { title: day.name, meta: metaLine(day.name, st.weekIndex, block, rir), slots: planned, deload };
}

/** Start the next program day as a workout, with targets as ghost values and the engine's margin notes. */
export async function startProgramDay(d: AnalogDB, run: RunRow, settings: Settings, round: (g: number, exerciseId: string) => number, gymId: string | null, now = Date.now()): Promise<string | null> {
  const plan = await planDay(d, run, settings, round);
  if (!plan) return null;
  const st = run.state;
  const day = run.program.blocks[st.blockIndex]!.days[st.dayIndex]!;
  const id = await startWorkout(d, { title: plan.title, runId: run.id, programId: run.programId, dayId: day.id, blockIndex: st.blockIndex, weekIndex: st.weekIndex, gymId }, now);
  const groupIds = new Map<string, string>();
  for (const [gid, g] of Object.entries(run.program.groups)) {
    if (!plan.slots.some((p) => p.slot.groupId === gid)) continue;
    const wgId = newId();
    groupIds.set(gid, wgId);
    await d.workoutGroups.add({ id: wgId, workoutId: id, kind: g.kind, restMs: g.restMs, transitionMs: g.transitionMs });
  }
  for (const p of plan.slots) {
    await addExercise(d, id, p.slot.exerciseId, {
      slotId: p.slot.id,
      restMs: p.slot.restMs,
      note: p.slot.note,
      explanation: plan.deload ? 'Deload week. Half the sets, same weights.' : p.output.explanation,
      explanationDetail: p.output.detail,
      groupId: p.slot.groupId ? (groupIds.get(p.slot.groupId) ?? null) : null,
      sets: p.targets.map((t) => ({ type: t.type, targetWeightG: t.weightG, targetReps: t.reps, targetRepsMax: t.repsMax ?? null, targetRir: t.rir, targetTimeMs: t.timeMs ?? null })),
    });
  }
  return id;
}

/** Feedback rows → per-muscle answers for the weekly plan (latest answer of each kind wins). */
async function collectFeedback(d: AnalogDB, workoutIds: string[], slotMuscles: Map<string, Muscle[]>): Promise<{ byMuscle: Partial<Record<Muscle, MuscleFeedback>>; pumpBySlot: Map<string, number[]>; painBySlot: Map<string, JointPain[]> }> {
  const rows = (await feedbackForWorkouts(d, workoutIds)).sort((a, b) => a.createdAt - b.createdAt);
  const byMuscle: Partial<Record<Muscle, MuscleFeedback>> = {};
  const pumpBySlot = new Map<string, number[]>();
  const painBySlot = new Map<string, JointPain[]>();
  const get = (m: Muscle) => (byMuscle[m] ??= { soreness: null, workload: null, pumps: [], performance: null });
  for (const f of rows) {
    if (f.kind === 'soreness' && f.muscle) get(f.muscle).soreness = f.value as Soreness;
    if (f.kind === 'workload' && f.muscle) get(f.muscle).workload = f.value as Workload;
    if (f.kind === 'pump' && f.slotId) {
      const v = Number(f.value) as Pump;
      pumpBySlot.set(f.slotId, [...(pumpBySlot.get(f.slotId) ?? []), v]);
      for (const m of slotMuscles.get(f.slotId) ?? []) get(m).pumps.push(v);
    }
    if (f.kind === 'pain' && f.slotId) painBySlot.set(f.slotId, [...(painBySlot.get(f.slotId) ?? []), f.value as JointPain]);
  }
  return { byMuscle, pumpBySlot, painBySlot };
}

async function setsOf(d: AnalogDB, workoutIds: string[]) {
  const fulls = await Promise.all(workoutIds.map((id) => getWorkout(d, id)));
  return fulls.flatMap((f) => f?.exercises.flatMap((x) => x.sets) ?? []);
}

export interface RunUpdate {
  cards: string[];
  mesoReport: MesoReport | null;
  weekEnded: boolean;
}

/**
 * After a program workout is finished: store each slot's rule state, roll the run forward,
 * and at the end of a week run the adaptive volume plan. At the end of a block, build the meso report
 * and save learned landmarks.
 */
export async function applyFinishedWorkout(d: AnalogDB, workoutId: string, settings: Settings, round: (g: number, exerciseId: string) => number): Promise<RunUpdate | null> {
  const full = await getWorkout(d, workoutId);
  if (!full?.workout.runId) return null;
  const run = await getRun(d, full.workout.runId);
  if (!run || !run.active) return null;
  const st: RunState = JSON.parse(JSON.stringify(run.state));
  const block = run.program.blocks[st.blockIndex];
  if (!block) return null;
  const resolved = resolveDay(run.program, st, st.blockIndex, st.weekIndex, st.dayIndex);
  const infos = await getExercises(d, full.exercises.map((e) => e.exerciseId));

  // 1. Rule state per slot: re-run the rule on history before today (deterministic, same as at start).
  for (const e of full.exercises) {
    const slot = resolved?.slots.find((s) => s.id === e.slotId);
    if (!slot) continue;
    const ex = infos.get(e.exerciseId);
    const engine: EngineSettings = { ...settings, incrementG: ex?.incrementG ?? 2500, round: (g) => round(g, e.exerciseId), mesoRir: null };
    const out = nextTargets({ params: slot.rule, history: await sessionsFor(d, e.exerciseId, workoutId), state: { ...(st.slots[slot.id] ?? initialState), sets: slot.sets.length }, settings: engine });
    st.slots[slot.id] = out.state;
  }

  let cards: string[] = [];
  let mesoReport: MesoReport | null = null;
  const weekEnded = endsWeek(run.program, st);

  // 2. Weekly adaptive volume plan.
  if (weekEnded && block.adaptive) {
    const weekWorkouts = (await workoutsForRun(d, run.id)).filter((w) => w.blockIndex === st.blockIndex && w.weekIndex === st.weekIndex);
    const weekIds = weekWorkouts.map((w) => w.id);
    const allSlots = block.days.flatMap((dd) => dd.slots.map((s) => ({ s, d: dd })));
    const slotInfos = await getExercises(d, allSlots.map(({ s }) => st.swaps[s.id] ?? s.exerciseId));
    const slotMuscles = new Map(allSlots.map(({ s }) => [s.id, slotInfos.get(st.swaps[s.id] ?? s.exerciseId)?.primary ?? []]));
    const fb = await collectFeedback(d, weekIds, slotMuscles);

    // Weekly sets per muscle, for the report.
    const weekSets = (await setsOf(d, weekIds)).filter((s) => s.completedAt != null);
    const weekInfos = await getExercises(d, weekSets.map((s) => s.exerciseId));
    const vol = countVolume(weekSets.map(toLoggedSet), new Map([...weekInfos.values()].map((x) => [x.id, toInfo(x)])));
    for (const [m, v] of Object.entries(vol) as [Muscle, number][]) st.weeklySets[m] = [...(st.weeklySets[m] ?? []), v];

    const planSlots: PlanSlot[] = allSlots.map(({ s, d: dd }) => {
      const pumps = fb.pumpBySlot.get(s.id) ?? [];
      const pains = fb.painBySlot.get(s.id) ?? [];
      const exId = st.swaps[s.id] ?? s.exerciseId;
      return {
        slotId: s.id,
        exerciseId: exId,
        exerciseName: slotInfos.get(exId)?.name ?? 'exercise',
        dayId: dd.id,
        dayName: dd.name,
        primary: slotMuscles.get(s.id) ?? [],
        sets: st.slotSets[s.id] ?? s.sets.length,
        pump: pumps.length ? pumps.reduce((a, b) => a + b, 0) / pumps.length : null,
        pain: pains.includes('lot') ? 'lot' : pains.includes('some') ? 'some' : pains.length ? 'none' : null,
        somePainCount: pains.filter((x) => x === 'some').length,
      };
    });
    const plan = planWeek({
      week: st.weekIndex + 2,
      slots: planSlots,
      feedback: fb.byMuscle,
      history: st.muscleHistory,
      landmarks: await loadLandmarks(d),
      sessionCap: run.program.meso.sessionCap,
      momentum: run.program.meso.momentum,
      deloadScope: run.program.meso.deloadScope,
    });
    for (const c of plan.slotChanges) st.slotSets[c.slotId] = Math.max(1, (st.slotSets[c.slotId] ?? planSlots.find((p) => p.slotId === c.slotId)!.sets) + c.delta);
    st.muscleHistory = { ...st.muscleHistory, ...plan.history };
    st.deloadMuscles = plan.deload.program ? [] : plan.deload.muscles;
    st.deloadProgram = plan.deload.program;
    cards = plan.cards;
    st.lastPlan = { week: st.weekIndex + 1, cards: plan.cards, swaps: plan.swaps.map((s) => ({ slotId: s.slotId, explanation: s.explanation })), overflow: plan.overflow.map((o) => o.explanation), deload: plan.deload.explanation };
  } else if (weekEnded) {
    st.deloadMuscles = [];
    st.deloadProgram = false;
  }

  // 3. Roll forward; at the end of the block, the meso report.
  const next = advanceRun(run.program, st);
  const totalWeeks = block.weeks + (block.deloadWeek ? 1 : 0);
  const blockDone = weekEnded && st.weekIndex === totalWeeks - 1;
  if (blockDone && block.adaptive) {
    const runWorkouts = (await workoutsForRun(d, run.id)).filter((w) => w.blockIndex === st.blockIndex);
    const first = runWorkouts.slice(0, block.days.length).map((w) => w.id);
    const last = runWorkouts.filter((w) => w.weekIndex === block.weeks - 1).map((w) => w.id);
    const [firstSets, lastSets] = await Promise.all([setsOf(d, first), setsOf(d, last)]);
    const e1rmOf = (all: typeof firstSets, exerciseId: string) => {
      const sets = all.filter((s) => s.exerciseId === exerciseId && s.weightG && s.reps);
      return sets.length ? Math.max(...sets.map((s) => estimate1rm(s.weightG!, s.reps!, s.rir).e1rm)) : null;
    };
    const exIds = [...new Set(block.days.flatMap((dd) => dd.slots.map((s) => st.swaps[s.id] ?? s.exerciseId)))];
    const exInfos = await getExercises(d, exIds);
    const fbRows = await feedbackForWorkouts(d, runWorkouts.map((w) => w.id));
    const landmarks = await loadLandmarks(d);
    mesoReport = buildMesoReport(
      block.weeks,
      Object.fromEntries((Object.entries(st.weeklySets) as [Muscle, number[]][]).map(([m, sets]) => [m, { weeklySets: sets, scores: st.muscleHistory[m]?.scores ?? [] }])),
      exIds.map((id) => ({
        exerciseId: id,
        name: exInfos.get(id)?.name ?? id,
        e1rmStart: e1rmOf(firstSets, id),
        e1rmEnd: e1rmOf(lastSets, id),
        pumps: fbRows.filter((f) => f.kind === 'pump' && f.exerciseId === id).map((f) => Number(f.value) as Pump),
        pains: fbRows.filter((f) => f.kind === 'pain' && f.exerciseId === id).map((f) => f.value as JointPain),
      })),
      landmarks,
    );
    for (const l of mesoReport.landmarks) await saveLandmark(d, l.muscle, l.after, run.id);
    // Next meso starts from the learned MEV estimate.
    for (const s of block.days.flatMap((dd) => dd.slots)) delete next.slotSets[s.id];
    next.weeklySets = {};
    next.muscleHistory = {};
    next.mesosDone = (st.mesosDone ?? 0) + 1;
    next.lastReport = mesoReport;
  }
  await saveRunState(d, run.id, next);
  return { cards, mesoReport, weekEnded };
}

/** Muscles about to be trained that were trained before in this run: ask how they recovered. */
export async function sorenessQuestions(d: AnalogDB, workoutId: string): Promise<Muscle[]> {
  const full = await getWorkout(d, workoutId);
  const run = full?.workout.runId ? await getRun(d, full.workout.runId) : await activeRun(d);
  if (!full || !run) return [];
  const prior = (await workoutsForRun(d, run.id)).filter((w) => w.id !== workoutId);
  if (!prior.length) return [];
  const priorFull = await Promise.all(prior.map((w) => getWorkout(d, w.id)));
  const priorEx = new Set(priorFull.flatMap((w) => w?.exercises.map((e) => e.exerciseId) ?? []));
  const priorMuscles = new Set([...(await getExercises(d, [...priorEx])).values()].flatMap((e) => e.primary));
  const today = [...(await getExercises(d, full.exercises.map((e) => e.exerciseId))).values()].flatMap((e) => e.primary);
  return [...new Set(today)].filter((m) => priorMuscles.has(m));
}
