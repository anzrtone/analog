// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { createExercise, getExercise, getExercises } from '@/db/exercises';
import { saveProgram } from '@/db/repos';
import { newId, type AnalogDB } from '@/db/schema';
import type { SharePayload, SharedExercise } from '@/engine/programs/share';
import type { Program } from '@/engine/programs/types';
import type { Equipment, LoggingMode, Muscle } from '@/engine/types';

/**
 * Save a shared program as a new copy. Custom exercises that travel with it are recreated
 * (built-ins already exist on every device), and slots are pointed at the new ids.
 */
export async function importSharedProgram(d: AnalogDB, payload: SharePayload): Promise<string> {
  return d.transaction('rw', d.exercises, d.exerciseOverrides, d.programs, async () => {
    const idMap = new Map<string, string>();
    for (const e of payload.exercises) {
      if (await getExercise(d, e.id)) continue;
      const id = await createExercise(d, { name: e.name, primary: e.primary as Muscle[], secondary: e.secondary as Muscle[], equipment: e.equipment as Equipment, mode: e.mode as LoggingMode });
      idMap.set(e.id, id);
    }
    const p = JSON.parse(JSON.stringify(payload.program)) as SharePayload['program'];
    p.id = newId();
    for (const b of p.blocks) for (const day of b.days) for (const s of day.slots) s.exerciseId = idMap.get(s.exerciseId) ?? s.exerciseId;
    await saveProgram(d, p);
    return p.id;
  });
}

/** The custom exercises a program uses, so whoever opens the link gets them too. */
export async function sharedExercises(d: AnalogDB, program: Program): Promise<SharedExercise[]> {
  const infos = await getExercises(d, program.blocks.flatMap((b) => b.days.flatMap((x) => x.slots.map((s) => s.exerciseId))));
  return [...infos.values()].filter((e) => e.source === 'custom').map((e) => ({ id: e.id, name: e.name, primary: e.primary, secondary: e.secondary, equipment: e.equipment, mode: e.mode }));
}
