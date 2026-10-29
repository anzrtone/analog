// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useState } from 'react';
import { MUSCLE_LABEL, type Muscle } from '@/engine/types';
import { cx } from './ui';

// A pencil-outline body, front and back, one hue (red) in 5 opacity steps (BRAND §4.6). Never a rainbow.
// 0.1.0 used react-native-body-highlighter, which only runs in React Native; this is a schematic drawing
// with the same regions and the same rule: a region takes the hardest-worked of the muscles mapped onto it.

type Shape = { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number } | { kind: 'rect'; x: number; y: number; w: number; h: number; r: number };
interface Region {
  id: string;
  label: string;
  muscles: Muscle[];
  shapes: Shape[];
}

const e = (cx: number, cy: number, rx: number, ry: number): Shape => ({ kind: 'ellipse', cx, cy, rx, ry });
const r = (x: number, y: number, w: number, h: number, rr = 6): Shape => ({ kind: 'rect', x, y, w, h, r: rr });
/** Left and right copies around the body's centre line (x = 60). */
const pair = (s: Shape): Shape[] => (s.kind === 'ellipse' ? [s, { ...s, cx: 120 - s.cx }] : [s, { ...s, x: 120 - s.x - s.w }]);

const FRONT: Region[] = [
  { id: 'neck', label: 'neck', muscles: ['neckFlexors'], shapes: [r(53, 30, 14, 10, 4)] },
  { id: 'traps', label: 'traps', muscles: ['traps'], shapes: pair(e(44, 42, 10, 4)) },
  { id: 'delts', label: 'shoulders', muscles: ['frontDelts', 'sideDelts'], shapes: pair(e(30, 50, 9, 9)) },
  { id: 'chest', label: 'chest', muscles: ['chest'], shapes: pair(e(48, 58, 12, 9)) },
  { id: 'biceps', label: 'biceps', muscles: ['biceps'], shapes: pair(e(25, 72, 6, 12)) },
  { id: 'forearms', label: 'forearms', muscles: ['forearmFlexors'], shapes: pair(e(20, 98, 5, 13)) },
  { id: 'abs', label: 'abs', muscles: ['abs'], shapes: [r(51, 70, 18, 34, 5)] },
  { id: 'obliques', label: 'obliques', muscles: ['obliques'], shapes: pair(e(42, 88, 6, 14)) },
  { id: 'adductors', label: 'adductors', muscles: ['adductors'], shapes: pair(e(55, 128, 4, 14)) },
  { id: 'quads', label: 'quads', muscles: ['quads', 'abductors'], shapes: pair(e(45, 136, 9, 24)) },
  { id: 'calves', label: 'shins', muscles: [], shapes: pair(e(46, 182, 6, 18)) },
];

const BACK: Region[] = [
  { id: 'neck', label: 'neck', muscles: ['neckExtensors'], shapes: [r(53, 30, 14, 10, 4)] },
  { id: 'traps', label: 'traps', muscles: ['traps'], shapes: [{ kind: 'rect', x: 44, y: 38, w: 32, h: 18, r: 8 }] },
  { id: 'delts', label: 'shoulders', muscles: ['rearDelts'], shapes: pair(e(30, 50, 9, 9)) },
  { id: 'upperBack', label: 'upper back', muscles: ['upperBack'], shapes: pair(e(46, 70, 11, 15)) },
  { id: 'triceps', label: 'triceps', muscles: ['triceps'], shapes: pair(e(25, 72, 6, 12)) },
  { id: 'forearms', label: 'forearms', muscles: ['forearmExtensors'], shapes: pair(e(20, 98, 5, 13)) },
  { id: 'lowerBack', label: 'lower back', muscles: ['lowerBack'], shapes: [r(50, 88, 20, 16, 6)] },
  { id: 'glutes', label: 'glutes', muscles: ['glutes'], shapes: pair(e(50, 114, 10, 10)) },
  { id: 'hamstrings', label: 'hamstrings', muscles: ['hamstrings'], shapes: pair(e(46, 142, 8, 20)) },
  { id: 'calves', label: 'calves', muscles: ['calves'], shapes: pair(e(46, 182, 6, 16)) },
];

const STEPS = [0.18, 0.36, 0.54, 0.72, 0.9];
/** The body outline the regions sit in. */
const OUTLINE = 'M60 6 a12 12 0 1 1 0 24 a12 12 0 1 1 0 -24 M48 32 L20 44 L10 108 L18 110 L30 64 L38 62 L36 112 L40 206 L54 206 L58 120 L62 120 L66 206 L80 206 L84 112 L82 62 L90 64 L102 110 L110 108 L100 44 L72 32 Z';

function Shapes({ shapes, fill, active }: { shapes: Shape[]; fill: string; active: boolean }) {
  const common = { fill, stroke: active ? 'rgb(var(--ink))' : 'rgb(var(--pencil))', strokeWidth: active ? 1.6 : 0.6 };
  return (
    <>
      {shapes.map((s, i) => (s.kind === 'ellipse' ? <ellipse key={i} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} {...common} /> : <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r} {...common} />))}
    </>
  );
}

/** Sets per muscle → 0–5 steps (5 = about 20 sets, near MRV). Hover or tap a region to read its sets. */
export function Heatmap({ sets }: { sets: Partial<Record<Muscle, number>> }) {
  const [shown, setShown] = useState<{ side: 'front' | 'back'; id: string } | null>(null);
  const level = (m: Muscle) => {
    const v = sets[m] ?? 0;
    return v <= 0 ? 0 : Math.min(5, Math.ceil(v / 4));
  };
  const region = shown ? (shown.side === 'front' ? FRONT : BACK).find((x) => x.id === shown.id) : undefined;
  const total = region?.muscles.reduce((n, m) => n + (sets[m] ?? 0), 0) ?? 0;
  const trained = (Object.keys(sets) as Muscle[]).filter((m) => (sets[m] ?? 0) > 0);
  return (
    <div aria-label={`Muscles trained: ${trained.map((m) => `${MUSCLE_LABEL[m]} ${sets[m]} sets`).join(', ') || 'none'}`}>
      <div className="flex justify-center gap-4" onPointerLeave={(ev) => ev.pointerType !== 'touch' && setShown(null)}>
        {(['front', 'back'] as const).map((side) => (
          <div key={side} className="flex flex-col items-center">
            <svg width={132} height={230} viewBox="0 0 120 212" role="img" aria-label={`Body, ${side}`}>
              <path d={OUTLINE} fill="rgb(var(--paper-sunk))" stroke="rgb(var(--pencil))" strokeWidth={1} strokeLinejoin="round" />
              {(side === 'front' ? FRONT : BACK).map((reg) => {
                const lv = Math.max(0, ...reg.muscles.map(level));
                const active = shown?.side === side && shown.id === reg.id;
                const fill = active ? 'rgb(var(--red-ring))' : lv > 0 ? `rgb(var(--red-ring) / ${STEPS[lv - 1]})` : 'transparent';
                return (
                  <g key={reg.id} className={cx(reg.muscles.length > 0 && 'cursor-pointer')} onPointerEnter={(ev) => ev.pointerType !== 'touch' && reg.muscles.length && setShown({ side, id: reg.id })} onClick={() => reg.muscles.length && setShown(active ? null : { side, id: reg.id })}>
                    <Shapes shapes={reg.shapes} fill={fill} active={active} />
                  </g>
                );
              })}
            </svg>
            <span className="t-meta text-pencil">{side.toUpperCase()}</span>
          </div>
        ))}
      </div>
      <div className="mx-margin mt-3 min-h-[72px] border-t border-rule pt-2.5" aria-live="polite">
        {region ? (
          <>
            <p className="t-label">{region.label.toUpperCase()}</p>
            <p className="text-pencil">{total === 0 ? 'No sets logged' : `${total} set${total === 1 ? '' : 's'}`}</p>
            {region.muscles.length > 1 || (region.muscles[0] && MUSCLE_LABEL[region.muscles[0]] !== region.label)
              ? region.muscles.map((m) => (
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
