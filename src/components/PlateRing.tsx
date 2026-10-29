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
  const inner = glyph ? (
    <Glyph name={glyph} size={size * 0.46} color={text} />
  ) : letter ? (
    <span className="font-num tabular leading-none" style={{ fontWeight: 500, fontSize: letter.length > 1 ? 8.5 : 11, letterSpacing: letter.length > 1 ? -0.4 : 0, color: text }}>
      {letter}
    </span>
  ) : null;

  const body = (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${className ?? ''}`} style={{ width: size, height: size }} role={onClick ? undefined : 'img'} aria-label={onClick ? undefined : label}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
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
      </svg>
      <span className="relative">{inner}</span>
    </span>
  );

  if (!onClick) return body;
  return (
    <button type="button" onClick={onClick} aria-label={label} className="inline-flex min-h-touch min-w-[32px] items-center justify-center rounded-full transition-transform active:scale-90">
      {body}
    </button>
  );
}

/** Ring for a set type, with the letter or glyph from the registry. */
export function SetTypeRing({ type, index, state, onClick, label, progress, size }: { type: SetType; index: number; state: RingState; onClick?: () => void; label?: string; progress?: number; size?: number }) {
  const info = setTypeInfo(type);
  const letter = info.glyph ? null : (info.letter ?? String(index + 1));
  return <PlateRing color={info.ring} state={state} letter={letter} glyph={info.glyph} onClick={onClick} label={label} progress={progress} size={size} />;
}
