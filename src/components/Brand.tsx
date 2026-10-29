// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { PlateRing } from './PlateRing';

/** "Analog" in Newsreader with the o replaced by the red plate ring (BRAND §3). */
export function Wordmark({ size = 20 }: { size?: number }) {
  const ring = Math.round(size * 0.62);
  return (
    <span className="inline-flex items-center font-title" style={{ fontSize: size, lineHeight: `${size * 1.2}px`, fontWeight: 500 }} role="img" aria-label="Analog">
      <span aria-hidden>Anal</span>
      <span aria-hidden style={{ margin: `${size * 0.12}px ${size * 0.03}px 0` }} className="inline-flex">
        <PlateRing color="red" state="done" size={ring} stroke={ring * 0.22} />
      </span>
      <span aria-hidden>g</span>
    </span>
  );
}

export type StampKind = 'PR' | 'DELOAD' | 'MESO DONE' | 'NEW MAX VOLUME' | 'FAILED';

const STAMP_TONE: Record<StampKind, string> = { PR: 'text-red-text border-red-text', DELOAD: 'text-green-text border-green-text', 'MESO DONE': 'text-green-text border-green-text', 'NEW MAX VOLUME': 'text-green-text border-green-text', FAILED: 'text-pencil border-pencil' };

/** The brand's celebration: a rotated outline that lands with scale 1.15 → 1 (no confetti). */
export function Stamp({ kind, text, animate = true }: { kind: StampKind; text?: string; animate?: boolean }) {
  return (
    <span
      role="img"
      aria-label={text ?? kind}
      className={`inline-block self-start whitespace-nowrap rounded-[3px] border-[1.5px] px-2 py-[3px] font-num text-[12px] uppercase leading-4 tracking-[1px] ${STAMP_TONE[kind]} ${animate ? 'animate-stamp' : ''}`}
      style={{ fontWeight: 500, transform: 'rotate(-4deg)' }}
    >
      {text ?? kind}
    </span>
  );
}
