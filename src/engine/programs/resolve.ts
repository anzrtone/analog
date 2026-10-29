// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import type { Block, Day, Program, RunState, Slot } from './types';

/** The day's slots for a given week, with week overrides, swaps and adaptive set counts applied. */
export function resolveDay(program: Program, run: RunState, blockIndex: number, weekIndex: number, dayIndex: number): { block: Block; day: Day; slots: Slot[]; deload: boolean } | null {
  const block = program.blocks[blockIndex];
  const day = block?.days[dayIndex];
  if (!block || !day) return null;
  const overrides = block.overrides[weekIndex] ?? {};
  const deload = block.deloadWeek && weekIndex >= block.weeks;
  const slots = day.slots.map((s) => {
    const o = overrides[s.id];
    const exerciseId = run.swaps[s.id] ?? o?.exerciseId ?? s.exerciseId;
    let sets = o?.sets ?? s.sets;
    const planned = run.slotSets[s.id];
    if (block.adaptive && planned != null && planned !== sets.length && sets.length) {
      const template = sets[sets.length - 1]!;
      sets = planned > sets.length ? [...sets, ...Array.from({ length: planned - sets.length }, () => ({ ...template }))] : sets.slice(0, Math.max(1, planned));
    }
    return { ...s, exerciseId, sets, rule: o?.rule ?? s.rule };
  });
  return { block, day, slots, deload };
}

/** Advance the run pointer after finishing a day. Weeks roll over once every day has been done. */
export function advanceRun(program: Program, run: RunState): RunState {
  const block = program.blocks[run.blockIndex];
  if (!block) return run;
  let { blockIndex, weekIndex, dayIndex } = run;
  dayIndex += 1;
  if (dayIndex >= block.days.length) {
    dayIndex = 0;
    weekIndex += 1;
    const totalWeeks = block.weeks + (block.deloadWeek ? 1 : 0);
    if (weekIndex >= totalWeeks) {
      weekIndex = 0;
      blockIndex = (blockIndex + 1) % program.blocks.length;
    }
  }
  return { ...run, blockIndex, weekIndex, dayIndex };
}

/** True when finishing this day ends a training week (used to run the weekly volume plan). */
export function endsWeek(program: Program, run: RunState): boolean {
  const block = program.blocks[run.blockIndex];
  return !!block && run.dayIndex === block.days.length - 1;
}

/** "PUSH A — W3/5 — 1 RIR" */
export function metaLine(dayName: string, weekIndex: number, block: Block, rir: number | null): string {
  const total = block.weeks + (block.deloadWeek ? 1 : 0);
  const deload = block.deloadWeek && weekIndex >= block.weeks;
  const parts = [dayName.toUpperCase(), `W${weekIndex + 1}/${total}`];
  if (deload) parts.push('DELOAD');
  else if (rir != null) parts.push(`${rir} RIR`);
  return parts.join(' — ');
}
