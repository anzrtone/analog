// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
// Design tokens from BRAND.md §14. The same values live as CSS variables in src/styles/index.css
// (tests/theme-css.test.ts keeps the two in step); this copy feeds the contrast test, SVG share cards and the canvas.
// Contrast fixes (BRAND §12, checked by tokens.test.ts):
//   paper.pencil      #7D7A70 → #69665E  (3.45 → 4.61 on paper-sunk)
//   paper.white.text  #6E6C64 → #67655E  (4.23 → 4.69)
//   paper.yellow.ring #E0961F → #B17618  (1.98 → 3.09, graphics need 3:1)
//   paper.white.ring  #B4B2A9 → #858274  (1.71 → 3.10)
//   carbon.pencil     #85827A → #8C8A82  (4.24 → 4.70 on paper-raised)
//   carbon.white.ring #5F5E5A → #6D6C68  (2.50 → 3.09)
// `erased` stays below AA on purpose: it is only for disabled controls, which WCAG exempts.

export type PlateName = 'red' | 'blue' | 'yellow' | 'green' | 'white';
/** A named plate colour, the plain pen, or any user-picked colour as `#rrggbb`. */
export type RingColor = PlateName | 'ink' | `#${string}`;

export interface Plate {
  ring: string;
  text: string;
}

export interface Palette {
  name: 'paper' | 'carbon';
  paper: string;
  paperRaised: string;
  paperSunk: string;
  rule: string;
  ink: string;
  ink2: string;
  pencil: string;
  erased: string;
  plate: Record<PlateName, Plate>;
}

export const paper: Palette = {
  name: 'paper',
  paper: '#F6F1E7',
  paperRaised: '#FBF8F1',
  paperSunk: '#EDE6D6',
  rule: '#D9D1BF',
  ink: '#23324A',
  ink2: '#4F5A6E',
  pencil: '#69665E',
  erased: '#A9A496',
  plate: {
    red: { ring: '#D93F3C', text: '#A32D2D' },
    blue: { ring: '#2F7BD0', text: '#185FA5' },
    yellow: { ring: '#B17618', text: '#8A5A0C' },
    green: { ring: '#3E8E3A', text: '#2C6B28' },
    white: { ring: '#858274', text: '#67655E' },
  },
};

export const carbon: Palette = {
  name: 'carbon',
  paper: '#17181C',
  paperRaised: '#1F2025',
  paperSunk: '#121316',
  rule: '#2C2D33',
  ink: '#ECE6D8',
  ink2: '#BDB7A9',
  pencil: '#8C8A82',
  erased: '#5A5852',
  plate: {
    red: { ring: '#E8615E', text: '#F4A09D' },
    blue: { ring: '#4F93DE', text: '#93BDEE' },
    yellow: { ring: '#F0A93A', text: '#F6C878' },
    green: { ring: '#5AAE55', text: '#9AD394' },
    white: { ring: '#6D6C68', text: '#A8A59C' },
  },
};

export const palettes = { paper, carbon } as const;
export type ThemeName = keyof typeof palettes;

/** Ring stroke and letter colour for a ring colour name ("ink" = the plain pen colour). */
export function ringColors(p: Palette, c: RingColor): Plate {
  if (c === 'ink') return { ring: p.ink, text: p.ink };
  if (c.startsWith('#')) return { ring: c, text: c };
  return p.plate[c as PlateName];
}

/** CSS variable for a ring colour, for SVG drawn in the app (follows the theme without a re-render). */
export function ringVar(c: RingColor, part: 'ring' | 'text' = 'ring'): string {
  if (c.startsWith('#')) return c;
  return c === 'ink' ? 'rgb(var(--ink))' : `rgb(var(--${c}-${part}))`;
}

export const motion = { setComplete: 220, stamp: 180, pageTurn: 260, sheet: 240 } as const;
