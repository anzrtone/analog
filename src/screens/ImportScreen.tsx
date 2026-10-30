// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useEffect, useRef } from 'react';
import { listExercises, type Exercise } from '@/db/exercises';
import { commitImport, type CommitSummary, type NameMapping } from '@/db/importer';
import { db } from '@/db/schema';
import { settings, useSettings } from '@/db/settings';
import { parseCsvExport } from '@/engine/import/csv';
import { AUTO_MATCH, matchExercise } from '@/engine/import/mapping';
import type { ImportResult } from '@/engine/import/normalize';
import type { WeightUnit } from '@/engine/types';
import { useData } from '@/features/data';
import { navigate } from '@/features/nav';
import { picker } from '@/features/picker';
import { createStore } from '@/features/store';
import { ask } from '@/components/Dialog';
import { MarginNote, Pad, Screen, Section, Segmented } from '@/components/ui';

/** The import in progress. It outlives this page while the exercise library is open to change a match. */
const session = createStore<{ unit: WeightUnit | null; result: ImportResult | null; mapping: NameMapping; done: CommitSummary | null; error: string | null }>({ unit: null, result: null, mapping: {}, done: null, error: null });
const patch = (p: Partial<ReturnType<typeof session.get>>) => session.set((s) => ({ ...s, ...p }));

/** Strong / Hevy CSV → pick the file → check the exercise matches → import. Safe to run twice. */
export function ImportScreen() {
  const s = useSettings();
  const { result, mapping, done, error, unit: chosen } = session.use();
  const unit = chosen ?? s.unit;
  const library = useData((d) => listExercises(d, { includeHidden: true }), [], [] as Exercise[]);
  const names = new Map(library.map((e) => [e.id, e.name]));
  const file = useRef<HTMLInputElement>(null);

  // An exercise came back from the library for one of the names.
  const pick = picker.use();
  useEffect(() => {
    const [kind, name] = (pick.token ?? '').split('|');
    if (kind !== 'import' || !name || !pick.picked) return;
    const id = picker.take(pick.token!);
    if (id) patch({ mapping: { ...session.get().mapping, [name]: { exerciseId: id } } });
  }, [pick]);

  const read = async (f: File) => {
    patch({ error: null });
    const r = parseCsvExport(await f.text(), unit);
    if (!r.workouts.length) return patch({ error: r.warnings[0] ?? 'No workouts found in that file.' });
    const lib = library.map((e) => ({ id: e.id, name: e.name, aliases: e.aliases }));
    const auto: NameMapping = {};
    for (const n of r.exerciseNames) {
      const best = matchExercise(n, lib, 1)[0];
      auto[n] = best && best.score >= AUTO_MATCH ? { exerciseId: best.id } : { create: true };
    }
    patch({ mapping: auto, result: r });
  };

  if (done) {
    return (
      <Screen
        title="Imported"
        backButton
        footer={
          <button
            type="button"
            className="btn-primary w-full"
            onClick={() => {
              session.set({ unit: null, result: null, mapping: {}, done: null, error: null });
              navigate({ name: 'history' });
            }}
          >
            See your history
          </button>
        }
      >
        <Pad className="flex flex-col gap-2">
          <p className="t-title-m">
            {done.workouts} workouts, {done.sets} sets.
          </p>
          {done.skippedDuplicates ? <p className="text-ink2">Skipped {done.skippedDuplicates} already imported.</p> : null}
          {done.createdExercises ? <p className="text-ink2">Created {done.createdExercises} custom exercises. Set their muscles in the library so they count toward volume.</p> : null}
          <MarginNote>Your matches are saved as aliases, so next time is automatic.</MarginNote>
        </Pad>
      </Screen>
    );
  }

  return (
    <Screen
      title="Import"
      backButton
      meta="STRONG · HEVY · CSV"
      footer={
        result ? (
          <button type="button" className="btn-primary w-full" onClick={async () => patch({ done: await commitImport(db, result, mapping, settings().defaultGymId) })}>
            {`Import ${result.workouts.length} workouts`}
          </button>
        ) : (
          <button type="button" className="btn-primary w-full" onClick={() => file.current?.click()}>
            Choose a CSV file
          </button>
        )
      }
    >
      <input
        ref={file}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) read(f).catch((err: Error) => patch({ error: `Couldn't read that file: ${err.message}` }));
        }}
      />
      <Pad className="flex flex-col gap-2">
        <p className="text-ink2">Export your history from Strong (Settings → Export data) or Hevy (Profile → Settings → Export data), then pick the file here. Nothing leaves your device.</p>
        <Segmented label="Weights in the file" value={unit} onChange={(v) => patch({ unit: v })} options={[{ value: 'kg', label: 'File is in kg' }, { value: 'lb', label: 'File is in lb' }]} />
        <MarginNote>Used when the file doesn&apos;t say. Hevy files always do.</MarginNote>
        {error ? <p className="text-red-text">{error}</p> : null}
      </Pad>
      {result ? (
        <Section title={`MATCH ${result.exerciseNames.length} EXERCISES`}>
          {result.warnings.map((w) => (
            <Pad key={w}>
              <MarginNote>{w}</MarginNote>
            </Pad>
          ))}
          {result.exerciseNames.map((n) => {
            const m = mapping[n];
            const target = m && 'exerciseId' in m ? names.get(m.exerciseId) : null;
            const token = `import|${n}`;
            return (
              <div key={n} className="ruled-row">
                <button
                  type="button"
                  className="flex min-h-row min-w-0 flex-1 flex-col justify-center text-left"
                  aria-label={`${n}: ${target ?? 'create new'}`}
                  onClick={() => {
                    const choose = () => {
                      picker.open(token);
                      navigate({ name: 'exercises', picker: token });
                    };
                    if (target) return choose();
                    ask(`Where does “${n}” belong?`, 'Match it to an exercise already in the Analog library, or set it up as your own with its own muscles and equipment.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Pick from library', style: 'default', onPress: choose },
                      {
                        text: 'Make my own',
                        onPress: () => {
                          picker.open(token);
                          navigate({ name: 'exerciseEdit', prefill: n, picker: token });
                        },
                      },
                    ]);
                  }}
                >
                  <span className="truncate">{n}</span>
                  <span className={`t-hint truncate ${target ? 'text-ink2' : 'text-yellow-text'}`}>{target ? `→ ${target}` : '→ new custom exercise'}</span>
                </button>
                {target ? (
                  <button type="button" className="btn-ghost btn-compact" onClick={() => patch({ mapping: { ...mapping, [n]: { create: true } } })} aria-label={`Create ${n} as a new exercise`}>
                    New
                  </button>
                ) : null}
              </div>
            );
          })}
        </Section>
      ) : null}
    </Screen>
  );
}
