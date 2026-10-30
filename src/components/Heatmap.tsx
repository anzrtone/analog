// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useState } from 'react';
import { MUSCLE_LABEL, type Muscle } from '@/engine/types';
import { bodyBack } from './body/bodyBack';
import { bodyFemaleBack } from './body/bodyFemaleBack';
import { bodyFemaleFront } from './body/bodyFemaleFront';
import { bodyFront } from './body/bodyFront';
import { OUTLINES } from './body/outlines';
import type { BodyPart } from './body/types';
import { cx } from './ui';

// The anatomical front and back body 0.1.0 drew (react-native-body-highlighter, MIT, copied as path data into
// ./body), one hue (red) in 5 opacity steps (BRAND §4.6). Never a rainbow. The library's regions are coarser than
// ours, so a region takes the hardest-worked of the muscles that map onto it.

type Side = 'front' | 'back';
export type BodyFigure = 'male' | 'female';

const REGIONS: Record<Side, [string, Muscle[]][]> = {
  front: [
    ['neck', ['neckFlexors']],
    ['trapezius', ['traps']],
    ['deltoids', ['frontDelts', 'sideDelts']],
    ['chest', ['chest']],
    ['biceps', ['biceps']],
    ['forearm', ['forearmFlexors']],
    ['abs', ['abs']],
    ['obliques', ['obliques']],
    ['adductors', ['adductors']],
    ['quadriceps', ['quads', 'abductors']],
  ],
  back: [
    ['neck', ['neckExtensors']],
    ['trapezius', ['traps']],
    ['deltoids', ['rearDelts']],
    ['upper-back', ['upperBack']],
    ['triceps', ['triceps']],
    ['forearm', ['forearmExtensors']],
    ['lower-back', ['lowerBack']],
    ['gluteal', ['glutes']],
    ['hamstring', ['hamstrings']],
    ['calves', ['calves']],
  ],
};

const REGION_LABEL: Record<string, string> = {
  neck: 'neck',
  deltoids: 'shoulders',
  chest: 'chest',
  biceps: 'biceps',
  triceps: 'triceps',
  forearm: 'forearms',
  abs: 'abs',
  obliques: 'obliques',
  adductors: 'adductors',
  quadriceps: 'quads',
  trapezius: 'traps',
  'upper-back': 'upper back',
  'lower-back': 'lower back',
  gluteal: 'glutes',
  hamstring: 'hamstrings',
  calves: 'calves',
};

const BODIES: Record<BodyFigure, Record<Side, BodyPart[]>> = {
  male: { front: bodyFront, back: bodyBack },
  female: { front: bodyFemaleFront, back: bodyFemaleBack },
};

const STEPS = [0.18, 0.36, 0.54, 0.72, 0.9];

type Active = { side: Side; slug: string };

function Body({ figure, side, level, active, onHover, onPick }: { figure: BodyFigure; side: Side; level: (m: Muscle) => number; active: string | null; onHover: (a: Active) => void; onPick: (a: Active) => void }) {
  const regions = new Map(REGIONS[side]);
  const outline = OUTLINES[figure][side];
  // The picked region is drawn last, so its ink outline isn't covered by its neighbours.
  const parts = [...BODIES[figure][side]].sort((a, b) => Number(a.slug === active) - Number(b.slug === active));
  return (
    <svg viewBox={outline.viewBox} className="block aspect-[1/2] h-auto w-full max-w-[180px]" role="img" aria-label={`Body, ${side}`}>
      {parts.map((part) => {
        const muscles = regions.get(part.slug);
        const lv = muscles ? Math.max(0, ...muscles.map(level)) : 0;
        const on = part.slug === active;
        const fill = on ? 'rgb(var(--red-ring))' : lv > 0 ? `rgb(var(--red-ring) / ${STEPS[lv - 1]})` : 'rgb(var(--paper-sunk))';
        const paths = [...(part.path.common ?? []), ...(part.path.left ?? []), ...(part.path.right ?? [])];
        return (
          <g
            key={part.slug}
            className={cx(muscles && 'cursor-pointer')}
            fill={fill}
            stroke={on ? 'rgb(var(--ink))' : 'rgb(var(--pencil))'}
            strokeWidth={on ? 3 : 1}
            onPointerEnter={(ev) => ev.pointerType !== 'touch' && muscles && onHover({ side, slug: part.slug })}
            onClick={() => muscles && onPick({ side, slug: part.slug })}
          >
            {paths.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        );
      })}
      <path d={outline.d} fill="none" stroke="rgb(var(--pencil))" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
    </svg>
  );
}

/** Sets per muscle → 0–5 steps (5 = about 20 sets, near MRV). Hover or tap a region to read its sets. */
export function Heatmap({ sets, figure = 'male' }: { sets: Partial<Record<Muscle, number>>; figure?: BodyFigure }) {
  const [picked, setPicked] = useState<Active | null>(null);
  const [hover, setHover] = useState<Active | null>(null);
  const level = (m: Muscle) => {
    const v = sets[m] ?? 0;
    return v <= 0 ? 0 : Math.min(5, Math.ceil(v / 4));
  };
  const pick = (a: Active) => setPicked((c) => (c && c.slug === a.slug && c.side === a.side ? null : a));
  const shown = hover ?? picked;
  const muscles = shown ? (REGIONS[shown.side].find(([slug]) => slug === shown.slug)?.[1] ?? []) : [];
  const label = shown ? (REGION_LABEL[shown.slug] ?? shown.slug) : '';
  const total = muscles.reduce((n, m) => n + (sets[m] ?? 0), 0);
  const trained = (Object.keys(sets) as Muscle[]).filter((m) => (sets[m] ?? 0) > 0);
  return (
    <div aria-label={`Muscles trained: ${trained.map((m) => `${MUSCLE_LABEL[m]} ${sets[m]} sets`).join(', ') || 'none'}`}>
      <div className="flex justify-center gap-4 px-margin" onPointerLeave={(ev) => ev.pointerType !== 'touch' && setHover(null)}>
        {(['front', 'back'] as const).map((side) => (
          <div key={side} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <Body figure={figure} side={side} level={level} active={shown?.side === side ? shown.slug : null} onHover={setHover} onPick={pick} />
            <span className="t-meta text-pencil">{side.toUpperCase()}</span>
          </div>
        ))}
      </div>
      <div className="mx-margin mt-3 min-h-[72px] border-t border-rule pt-2.5" aria-live="polite">
        {shown ? (
          <>
            <p className="t-label">{label.toUpperCase()}</p>
            <p className="text-pencil">{total === 0 ? 'No sets logged' : `${total} set${total === 1 ? '' : 's'}`}</p>
            {muscles.length > 1 || (muscles[0] && MUSCLE_LABEL[muscles[0]] !== label)
              ? muscles.map((m) => (
                  <p key={m} className="t-meta text-pencil">
                    {MUSCLE_LABEL[m]} · {sets[m] ?? 0}
                  </p>
                ))
              : null}
          </>
        ) : (
          <p className="t-meta text-pencil">Hover or tap a muscle to see your sets.</p>
        )}
      </div>
    </div>
  );
}
