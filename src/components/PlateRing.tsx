// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { setTypeInfo, type Glyph as GlyphName, type SetType } from '@/engine/setTypes';
import { ringVar, type RingColor } from '@/theme/tokens';
import { Glyph } from './Glyph';

export type RingState = 'done' | 'pending' | 'progress';

export interface PlateRingProps {
  color: RingColor;
  state: RingState;
  letter?: string | null;
  glyph?: GlyphName;
  /** 0–1 for the partial arc while a timed set runs, or the rest timer emptying. */
  progress?: number;
  size?: number;
  stroke?: number;
  /** Fill the ring solid (the "ring fills in" completed state). */
  filled?: boolean;
  label?: string;
  onClick?: () => void;
  className?: string;
}

/**
 * The brand's one mark: solid = done, dashed (4 on, 3 off) = upcoming, partial arc = in progress.
 * A completed ring draws closed like a pen circle (BRAND §9, 220 ms).
 */
export function PlateRing({ color, state, letter, glyph, progress = 0.5, size = 24, stroke = 3, filled, label, onClick, className }: PlateRingProps) {
  const ring = ringVar(color, 'ring');
  const text = filled ? 'rgb(var(--paper))' : ringVar(color, 'text');
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const c = size / 2;
  const fontSize = letter && letter.length > 1 ? size * 0.36 : size * 0.46;
  const ink = letter ? inkCentre(letter, fontSize) : null;
  const body = (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${className ?? ''}`} style={{ width: size, height: size }} role={onClick ? undefined : 'img'} aria-label={onClick ? undefined : label}>
      <svg width={size} height={size} className="absolute inset-0 block" aria-hidden>
        <g transform={`rotate(-90 ${c} ${c})`}>
          {state === 'pending' && <circle cx={c} cy={c} r={r} stroke={ring} strokeWidth={stroke} strokeDasharray="4 3" fill="none" />}
          {state === 'progress' && (
            <>
              <circle cx={c} cy={c} r={r} stroke={ring} strokeWidth={stroke} strokeDasharray="4 3" fill="none" opacity={0.5} />
              <circle cx={c} cy={c} r={r} stroke={ring} strokeWidth={stroke} strokeDasharray={`${circ} ${circ}`} strokeDashoffset={circ * (1 - Math.max(0, Math.min(1, progress)))} fill="none" />
            </>
          )}
          {state === 'done' && (
            <circle
              cx={c}
              cy={c}
              r={r}
              stroke={ring}
              strokeWidth={stroke}
              fill={filled ? ring : 'none'}
              strokeDasharray={`${circ} ${circ}`}
              className="transition-[stroke-dashoffset] duration-[220ms] ease-out"
              style={{ strokeDashoffset: 0, animation: 'ring-draw 220ms ease-out both', ['--circ' as string]: circ }}
            />
          )}
        </g>
        {ink ? (
          <text x={c + ink.dx} y={c + ink.dy} fill={text} fontSize={fontSize} fontWeight={500} letterSpacing={letter!.length > 1 ? -0.4 : 0} className="font-num">
            {letter}
          </text>
        ) : null}
      </svg>
      {glyph ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Glyph name={glyph} size={size * 0.46} color={text} />
        </span>
      ) : null}
    </span>
  );

  if (!onClick) return body;
  return (
    <button type="button" onClick={onClick} aria-label={label} className="inline-flex min-h-touch min-w-[32px] items-center justify-center rounded-full transition-transform active:scale-90">
      {body}
    </button>
  );
}

const metrics = new Map<string, { dx: number; dy: number }>();
let canvas: HTMLCanvasElement | null = null;

/**
 * Where to put a letter's baseline so its ink, not its em box, sits in the middle of the ring: "w" and "T" have
 * different heights, and the browser's own centring lines up the em box, which leaves every letter a little high.
 * Measured once per letter in Plex Mono at 100 px and scaled; a rough cap or x-height guess until the font has loaded.
 */
function inkCentre(letter: string, fontSize: number): { dx: number; dy: number } {
  let m = metrics.get(letter);
  if (!m) {
    const font = '500 100px "IBM Plex Mono"';
    const ctx = typeof document !== 'undefined' && document.fonts?.check(font) ? (canvas ??= document.createElement('canvas')).getContext('2d') : null;
    if (ctx) {
      ctx.font = font;
      const t = ctx.measureText(letter);
      m = { dx: (t.actualBoundingBoxLeft - t.actualBoundingBoxRight) / 200, dy: (t.actualBoundingBoxAscent - t.actualBoundingBoxDescent) / 200 };
      metrics.set(letter, m);
    } else {
      m = { dx: -0.3 * letter.length, dy: /^[a-z]+$/.test(letter) ? 0.27 : 0.35 };
    }
  }
  // The -0.4 px tracking on two-letter marks pulls the ink left by half of it per gap.
  return { dx: m.dx * fontSize + 0.2 * (letter.length - 1), dy: m.dy * fontSize };
}

/** Ring for a set type, with the letter or glyph from the registry. */
export function SetTypeRing({ type, index, state, onClick, label, progress, size }: { type: SetType; index: number; state: RingState; onClick?: () => void; label?: string; progress?: number; size?: number }) {
  const info = setTypeInfo(type);
  const letter = info.glyph ? null : (info.letter ?? String(index + 1));
  return <PlateRing color={info.ring} state={state} letter={letter} glyph={info.glyph} onClick={onClick} label={label} progress={progress} size={size} />;
}
