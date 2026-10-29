// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import type { Glyph as GlyphName } from '@/engine/setTypes';

/** Custom glyphs Plex Mono lacks (⏱ ⏲ ▲ ▼ ≈), drawn at the ink stroke weight (BRAND §8). */
export function Glyph({ name, size, color }: { name: GlyphName; size: number; color: string }) {
  const s = 1.6;
  const svg = (children: React.ReactNode) => (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden>
      {children}
    </svg>
  );
  switch (name) {
    case 'stopwatch':
      return svg(
        <>
          <circle cx={6} cy={6.8} r={4} stroke={color} strokeWidth={s} fill="none" />
          <line x1={6} y1={6.8} x2={6} y2={4.6} stroke={color} strokeWidth={s} strokeLinecap="round" />
          <line x1={4.6} y1={1.4} x2={7.4} y2={1.4} stroke={color} strokeWidth={s} strokeLinecap="round" />
        </>,
      );
    case 'timer':
      return svg(
        <>
          <circle cx={6} cy={6} r={4.4} stroke={color} strokeWidth={s} fill="none" />
          <path d="M6 3.4 V6 L7.8 7.2" stroke={color} strokeWidth={s} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>,
      );
    case 'up':
      return svg(<path d="M6 2.5 L10 9.5 H2 Z" fill={color} />);
    case 'down':
      return svg(<path d="M2 2.5 H10 L6 9.5 Z" fill={color} />);
    case 'wave':
      return svg(<path d="M1.5 4.6 Q3.75 2.6 6 4.6 T10.5 4.6 M1.5 7.8 Q3.75 5.8 6 7.8 T10.5 7.8" stroke={color} strokeWidth={s} fill="none" strokeLinecap="round" />);
    case 'bolt':
      return svg(<path d="M7 1 L2.5 6.8 H5.6 L5 11 L9.5 5.2 H6.4 Z" fill={color} />);
    case 'flame':
      return svg(<path d="M6.2 1 C6.6 3.2 9.4 4.4 9.4 7.4 A3.4 3.4 0 0 1 2.6 7.4 C2.6 6 3.4 5.2 4 4.6 C4.2 5.6 4.6 6 5 6.2 C4.8 4.2 5.2 2.4 6.2 1 Z" fill={color} />);
    case 'star':
      return svg(<path d="M6 1 L7.5 4.4 L11 4.8 L8.4 7.2 L9.1 10.8 L6 9 L2.9 10.8 L3.6 7.2 L1 4.8 L4.5 4.4 Z" fill={color} />);
    case 'heart':
      return svg(<path d="M6 10.6 C1.6 7.6 1.4 4.6 2.8 3.2 C4 2 5.4 2.6 6 3.8 C6.6 2.6 8 2 9.2 3.2 C10.6 4.6 10.4 7.6 6 10.6 Z" fill={color} />);
    case 'diamond':
      return svg(<path d="M6 1.2 L10.4 6 L6 10.8 L1.6 6 Z" fill={color} />);
    case 'square':
      return svg(<path d="M2.6 2.6 H9.4 V9.4 H2.6 Z" fill={color} />);
    case 'plus':
      return svg(<path d="M6 2 V10 M2 6 H10" stroke={color} strokeWidth={s + 0.4} fill="none" strokeLinecap="round" />);
    case 'target':
      return svg(
        <>
          <circle cx={6} cy={6} r={4.2} stroke={color} strokeWidth={s} fill="none" />
          <circle cx={6} cy={6} r={1.3} fill={color} />
        </>,
      );
    case 'check':
      return svg(<path d="M2 6.4 L4.9 9.2 L10 3.2" stroke={color} strokeWidth={s + 0.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />);
    case 'pause':
      return svg(<path d="M3.8 2.4 V9.6 M8.2 2.4 V9.6" stroke={color} strokeWidth={s + 0.8} fill="none" strokeLinecap="round" />);
    case 'chevrons':
      return svg(<path d="M2.4 6.2 L6 2.8 L9.6 6.2 M2.4 10 L6 6.6 L9.6 10" stroke={color} strokeWidth={s} fill="none" strokeLinecap="round" strokeLinejoin="round" />);
  }
}
