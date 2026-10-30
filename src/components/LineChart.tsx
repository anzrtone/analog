// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useEffect, useRef, useState, type PointerEvent } from 'react';

export interface Point {
  x: number;
  y: number;
  /** What was logged to make this point, shown while scrubbing (e.g. "70 kg × 5 · 1 RIR"). */
  detail?: string;
}

/** Line in ink, the best point in red (BRAND §4.6). Plain SVG that fills its container's width. */
export function LineChart({ points, height = 180, format = (v: number) => v.toFixed(0), label }: { points: Point[]; height?: number; format?: (v: number) => string; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The div has the page margins as padding; the drawing fills what's inside them.
    const ro = new ResizeObserver(() => setW(Math.max(160, el.clientWidth - 32)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [active, setActive] = useState<number | null>(null);
  if (points.length < 2) return null;
  const pad = { l: 8, r: 44, t: 12, b: 22 };
  const xs = points.map((pt) => pt.x);
  const ys = points.map((pt) => pt.y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  if (y0 === y1) [y0, y1] = [y0 - 1, y1 + 1];
  const span = y1 - y0;
  y0 -= span * 0.1;
  y1 += span * 0.1;
  const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (w - pad.l - pad.r);
  const sy = (y: number) => pad.t + (1 - (y - y0) / (y1 - y0)) * (height - pad.t - pad.b);
  const d = points.map((pt, i) => `${i ? 'L' : 'M'}${sx(pt.x).toFixed(1)},${sy(pt.y).toFixed(1)}`).join(' ');
  const best = points.reduce((a, b) => (b.y > a.y ? b : a));
  const ticks = [y0 + span * 0.1, (y0 + y1) / 2, y1 - span * 0.1];
  const month = (x: number) => new Date(x).toLocaleDateString('en-US', { month: 'short' });
  const day = (x: number) => new Date(x).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  // Hover or drag: the point nearest the finger or pointer, with the logged set behind it.
  const scrub = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left;
    let near = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(sx(points[i]!.x) - x) < Math.abs(sx(points[near]!.x) - x)) near = i;
    setActive(near);
  };
  const shown = active != null ? points[active]! : null;
  return (
    <div ref={ref} className="px-margin">
      <div className="t-hint flex min-h-[40px] flex-col justify-end pb-1" aria-live="polite">
        {shown ? (
          <>
            <span className="t-num-m text-ink">{`${format(shown.y)} · ${day(shown.x)}`}</span>
            {shown.detail ? <span className="text-ink2">{shown.detail}</span> : null}
          </>
        ) : (
          <span className="text-pencil">Hover or drag across to see each logged point</span>
        )}
      </div>
      <svg
        width={w}
        height={height}
        className="touch-pan-y select-none"
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse') e.currentTarget.setPointerCapture(e.pointerId);
          scrub(e);
        }}
        onPointerMove={scrub}
        onPointerUp={(e) => e.pointerType !== 'mouse' && setActive(null)}
        onPointerCancel={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
        role="img" aria-label={label ?? `Trend from ${format(points[0]!.y)} to ${format(points[points.length - 1]!.y)}, best ${format(best.y)}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={sy(t)} y2={sy(t)} stroke="rgb(var(--rule))" strokeWidth={1} />
            <text x={w - pad.r + 4} y={sy(t) + 4} fill="rgb(var(--pencil))" fontSize={10} className="font-num">
              {format(t)}
            </text>
          </g>
        ))}
        <text x={pad.l} y={height - 4} fill="rgb(var(--pencil))" fontSize={10} className="font-num">
          {month(x0)}
        </text>
        <text x={w - pad.r} y={height - 4} textAnchor="end" fill="rgb(var(--pencil))" fontSize={10} className="font-num">
          {month(x1)}
        </text>
        <path d={d} stroke="rgb(var(--ink))" strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={sx(best.x)} cy={sy(best.y)} r={5} fill="rgb(var(--red-ring))" />
        {shown ? (
          <g pointerEvents="none">
            <line x1={sx(shown.x)} x2={sx(shown.x)} y1={pad.t} y2={height - pad.b} stroke="rgb(var(--pencil))" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={sx(shown.x)} cy={sy(shown.y)} r={5} fill="rgb(var(--paper))" stroke="rgb(var(--ink))" strokeWidth={2} />
          </g>
        ) : null}
      </svg>
    </div>
  );
}
