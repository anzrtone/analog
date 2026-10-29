// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useState } from 'react';
import { deleteGym, listGyms, saveGym, toGymProfile, type GymRow } from '@/db/repos';
import { db, newId } from '@/db/schema';
import { patchSettings, useSettings } from '@/db/settings';
import { DEFAULT_KG_GYM, DEFAULT_LB_GYM, loadBarbell } from '@/engine/math/plates';
import { formatWeight, parseWeightInput } from '@/engine/math/units';
import { generateWarmups } from '@/engine/math/warmup';
import { useData } from '@/features/data';
import { back, navigate } from '@/features/nav';
import { BarDiagram } from '@/components/Charts';
import { ask } from '@/components/Dialog';
import { Field, MarginNote, Pad, RuledRow, Screen, Section, Segmented, TextArea } from '@/components/ui';

export function GymsScreen() {
  const s = useSettings();
  const gyms = useData((d) => listGyms(d), [], [] as GymRow[]);
  const gym = gyms.find((g) => g.id === s.defaultGymId) ?? gyms[0];
  const [target, setTarget] = useState(s.unit === 'kg' ? '100' : '225');
  if (!gym) return <div className="min-h-full" />;
  const profile = toGymProfile(gym);
  const tg = parseWeightInput(target, s.unit) ?? 0;
  const load = loadBarbell(tg, profile.barG, profile.plates, 'nearest', s.unit);
  const warm = generateWarmups(load.totalG, 'barbell', profile, s.warmupRamp);
  return (
    <Screen title="Gyms and plates" backButton meta={`${gym.name.toUpperCase()} · ${profile.unit}`}>
      <Section title="PLATE CALCULATOR">
        <Pad className="flex flex-col gap-2">
          <Field label={`Target (${s.unit})`} value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" />
          <BarDiagram perSide={load.perSide} />
          <p className="t-num-l">
            {formatWeight(load.totalG, s.unit)} {s.unit}
          </p>
          <p className="text-ink2">{load.explanation}</p>
        </Pad>
      </Section>
      <Section title="WARM-UPS FOR THAT">
        {warm.sets.map((w, i) => (
          <RuledRow key={i}>
            <span className="t-num-m flex-1">
              {formatWeight(w.weightG, s.unit)} × {w.reps}
            </span>
          </RuledRow>
        ))}
        <Pad>
          <MarginNote>{warm.explanation}</MarginNote>
        </Pad>
      </Section>
      <Section title="YOUR GYMS">
        {gyms.map((g) => (
          <div key={g.id} className="ruled-row">
            <button type="button" className="flex min-h-row flex-1 items-center text-left" onClick={() => navigate({ name: 'gym', id: g.id })}>
              {g.name}
            </button>
            {g.id === s.defaultGymId ? (
              <span className="text-ink2">current</span>
            ) : (
              <button type="button" className="btn-secondary btn-compact" onClick={() => void patchSettings({ defaultGymId: g.id })}>
                Use
              </button>
            )}
          </div>
        ))}
        <Pad className="pt-2">
          <button
            type="button"
            className="btn-secondary w-full"
            onClick={async () => {
              const base = s.unit === 'lb' ? DEFAULT_LB_GYM : DEFAULT_KG_GYM;
              const id = newId();
              await saveGym(db, { ...base, id, name: 'Another gym', equipment: [], isDefault: false });
              navigate({ name: 'gym', id });
            }}
          >
            Add a gym
          </button>
        </Pad>
      </Section>
    </Screen>
  );
}

const list = (gs: number[], unit: 'kg' | 'lb') => gs.map((g) => formatWeight(g, unit)).join(', ');
const parseList = (t: string, unit: 'kg' | 'lb') =>
  t
    .split(/[,\s]+/)
    .map((x) => parseWeightInput(x, unit))
    .filter((x): x is number => x != null && x > 0)
    .sort((a, b) => a - b);

export function GymScreen({ id }: { id: string }) {
  const gym = useData(async (d) => (await listGyms(d)).find((g) => g.id === id) ?? null, [id], undefined as GymRow | null | undefined);
  if (!gym) return <div className="min-h-full" />;
  return <EditGym key={id} gym={gym} />;
}

/** Your plate inventory, bar, dumbbell rack and machine steps: what every load gets rounded to. */
function EditGym({ gym }: { gym: GymRow }) {
  const s = useSettings();
  const [name, setName] = useState(gym.name);
  const [unit, setUnit] = useState<'kg' | 'lb'>(gym.unit);
  const [bar, setBar] = useState(formatWeight(gym.barG, gym.unit));
  const [plates, setPlates] = useState(gym.plates.map((p) => ({ w: formatWeight(p.weightG, gym.unit), n: String(p.count) })));
  const [dbs, setDbs] = useState(list(gym.dumbbellsG, gym.unit));
  const [kbs, setKbs] = useState(list(gym.kettlebellsG, gym.unit));
  const [step, setStep] = useState(formatWeight(gym.machineStepG, gym.unit));

  const save = async () => {
    await saveGym(db, {
      ...gym,
      name: name.trim() || 'My gym',
      unit,
      barG: parseWeightInput(bar, unit) ?? gym.barG,
      plates: plates.map((p) => ({ weightG: parseWeightInput(p.w, unit) ?? 0, count: Number(p.n) || 0 })).filter((p) => p.weightG > 0 && p.count > 0),
      dumbbellsG: parseList(dbs, unit),
      kettlebellsG: parseList(kbs, unit),
      machineStepG: parseWeightInput(step, unit) ?? gym.machineStepG,
    });
    back();
  };

  return (
    <Screen
      title={name || 'Gym'}
      backButton
      footer={
        <button type="button" className="btn-primary w-full" onClick={() => void save()}>
          Save
        </button>
      }
    >
      <Pad className="flex flex-col gap-3">
        <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Segmented label="Gym units" value={unit} onChange={setUnit} options={[{ value: 'kg', label: 'kg plates' }, { value: 'lb', label: 'lb plates' }]} />
        <Field label={`Bar (${unit})`} value={bar} onChange={(e) => setBar(e.target.value)} inputMode="decimal" />
      </Pad>
      <Section title="PLATES · WEIGHT AND HOW MANY YOU OWN (BOTH SIDES)">
        {plates.map((p, i) => (
          <RuledRow key={i}>
            <input className="field min-w-0 flex-1" value={p.w} onChange={(e) => setPlates(plates.map((x, j) => (j === i ? { ...x, w: e.target.value } : x)))} inputMode="decimal" aria-label="Plate weight" />
            <span className="text-pencil">×</span>
            <input className="field w-[70px]" value={p.n} onChange={(e) => setPlates(plates.map((x, j) => (j === i ? { ...x, n: e.target.value } : x)))} inputMode="numeric" aria-label="How many" />
            <button type="button" className="btn-ghost btn-compact" onClick={() => setPlates(plates.filter((_, j) => j !== i))} aria-label="Remove plate">
              ×
            </button>
          </RuledRow>
        ))}
        <Pad className="pt-2">
          <button type="button" className="btn-secondary w-full" onClick={() => setPlates([...plates, { w: unit === 'kg' ? '0.5' : '1.25', n: '2' }])}>
            + plate (microplates too)
          </button>
        </Pad>
      </Section>
      <Section title="DUMBBELLS, KETTLEBELLS, MACHINES">
        <Pad className="flex flex-col gap-3">
          <TextArea label={`Dumbbells you have (${unit}), comma separated`} value={dbs} onChange={(e) => setDbs(e.target.value)} />
          <Field label={`Kettlebells (${unit})`} value={kbs} onChange={(e) => setKbs(e.target.value)} />
          <Field label={`Machine and cable stack step (${unit})`} value={step} onChange={(e) => setStep(e.target.value)} inputMode="decimal" />
          <MarginNote>Engine targets round to this kit, so suggestions are always weights you can actually load.</MarginNote>
        </Pad>
      </Section>
      {/* The default gym can't be deleted: something has to round loads. */}
      {gym.isDefault ? null : (
        <Section>
          <Pad>
            <button
              type="button"
              className="btn-ghost w-full text-red-text"
              onClick={() =>
                ask('Delete this gym?', 'Workouts logged here stay in your history.', [
                  { text: 'Keep', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      await deleteGym(db, gym.id);
                      if (s.defaultGymId === gym.id) await patchSettings({ defaultGymId: null });
                      back();
                    },
                  },
                ])
              }
            >
              Delete this gym
            </button>
          </Pad>
        </Section>
      )}
    </Screen>
  );
}
