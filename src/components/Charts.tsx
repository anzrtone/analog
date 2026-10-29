// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
/** Small data drawings in plain SVG and CSS: volume bands, the bar diagram, feedback rings (BRAND §4.6). */
import { memo } from 'react';
import type { Landmarks } from '@/engine/meso/types';
import { cx } from './ui';

/**
 * Weekly sets against MEV/MRV: pale band, ink ticks at MEV and MRV, fill green up to MAV, yellow to MRV, red past it.
 * The number is always printed too.
 */
export const VolumeBand = memo(function VolumeBand({ label, sets, lm }: { label: string; sets: number; lm: Landmarks }) {
  const max = Math.max(lm.mrv * 1.25, sets, 1);
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const fill = sets > lm.mrv ? 'bg-red-ring' : sets > lm.mav ? 'bg-yellow-ring' : 'bg-green-ring';
  const zone = sets > lm.mrv ? 'past MRV' : sets > lm.mav ? 'MAV to MRV' : sets >= lm.mev ? 'MEV to MAV' : 'under MEV';
  return (
    <div className="flex flex-col gap-[5px] py-[7px]" aria-label={`${label}: ${sets} sets, ${zone}. MEV ${lm.mev}, MRV ${lm.mrv}`} role="img">
      <div className="flex items-baseline justify-between">
        <span className="t-label">{label}</span>
        <span className="t-num-m text-[13px] text-ink2">{`${Math.round(sets * 10) / 10} sets`}</span>
      </div>
      <div className="relative h-2 overflow-hidden rounded bg-sunk">
        <div className={cx('absolute inset-y-0 left-0 origin-left transition-[width] duration-300 ease-out', fill)} style={{ width: pct(sets) }} />
        <div className="absolute inset-y-0 w-0.5 bg-ink/55" style={{ left: pct(lm.mev) }} />
        <div className="absolute inset-y-0 w-0.5 bg-ink/55" style={{ left: pct(lm.mrv) }} />
      </div>
    </div>
  );
});

const PLATE_COLOR: Record<number, string> = { 25000: 'bg-red-ring', 20000: 'bg-blue-ring', 15000: 'bg-yellow-ring', 10000: 'bg-green-ring', 5000: 'bg-white-ring' };

/** One side of the bar, plates in bumper colours: here the colours *are* the plates (BRAND §4.4). */
export function BarDiagram({ perSide, scale = 1 }: { perSide: number[]; scale?: number }) {
  return (
    <div className="flex items-center py-2" style={{ height: 90 * scale }} role="img" aria-label={`Each side: ${perSide.map((g) => g / 1000).join(', ') || 'empty bar'}`}>
      <div className="rounded-sm bg-pencil" style={{ width: 48 * scale, height: 8 * scale }} />
      <div className="bg-pencil" style={{ width: 8 * scale, height: 26 * scale }} />
      {perSide.map((g, i) => (
        <div key={i} className={cx('ml-0.5 rounded-[3px]', PLATE_COLOR[g] ?? 'bg-ink2')} style={{ width: (g >= 5000 ? 14 : 8) * scale, height: Math.max(30, Math.min(80, 30 + (g / 25000) * 50)) * scale }} />
      ))}
      <div className="ml-0.5 flex-1 rounded-sm bg-pencil" style={{ height: 8 * scale }} />
    </div>
  );
}

/** One quarter step of a ring, filled from 0 (empty) to 3 (full): the feedback answers instead of emoji. */
export function FillRing({ level, size = 40 }: { level: number; size?: number }) {
  const r = size / 2 - 3;
  const c = size / 2;
  const frac = level / 3;
  const angle = frac * 2 * Math.PI;
  const x = c + r * Math.sin(angle);
  const y = c - r * Math.cos(angle);
  const large = frac > 0.5 ? 1 : 0;
  return (
    <svg width={size} height={size} aria-hidden>
      <circle cx={c} cy={c} r={r} stroke={level === 0 ? 'rgb(var(--pencil))' : 'rgb(var(--ink))'} strokeWidth={3} fill="none" strokeDasharray={level === 0 ? '4 3' : undefined} />
      {level > 0 && level < 3 && <path d={`M${c},${c} L${c},${c - r} A${r},${r} 0 ${large} 1 ${x},${y} Z`} fill="rgb(var(--ink))" opacity={0.85} />}
      {level === 3 && <circle cx={c} cy={c} r={r} fill="rgb(var(--ink))" opacity={0.85} />}
    </svg>
  );
}
