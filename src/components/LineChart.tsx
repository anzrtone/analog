// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useEffect, useRef, useState } from 'react';

export interface Point {
  x: number;
  y: number;
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
  return (
    <div ref={ref} className="px-margin">
      <svg width={w} height={height} role="img" aria-label={label ?? `Trend from ${format(points[0]!.y)} to ${format(points[points.length - 1]!.y)}, best ${format(best.y)}`}>
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
      </svg>
    </div>
  );
}
