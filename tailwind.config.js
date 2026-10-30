// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import plugin from 'tailwindcss/plugin';

/**
 * Analog design tokens (BRAND.md §14).
 *
 * Every colour is a CSS variable holding space-separated RGB channels, so Tailwind opacity modifiers work
 * (`bg-ink/40`) and the theme (Carbon, Paper) swaps by changing `data-theme` on <html>. Values live in
 * src/styles/index.css. Only brand colours exist here: Tailwind's default palette is replaced, not extended,
 * so nothing off-brand can sneak in.
 */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const plate = (name) => ({ ring: token(`${name}-ring`), text: token(`${name}-text`) });

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // hover: styles only where a pointer can hover, so a tapped cell on a phone doesn't stay shaded after the tap.
  future: { hoverOnlyWhenSupported: true },
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      paper: token('paper'), // the page
      raised: token('paper-raised'), // sheets, cards, the open workout
      sunk: token('paper-sunk'), // inputs, pressed rows, the spine
      rule: token('rule'), // ruled lines, dividers
      ink: token('ink'), // primary text, numbers, icons
      ink2: token('ink-2'), // secondary text
      pencil: token('pencil'), // hints, metadata, last time, engine targets
      erased: token('erased'), // disabled controls only
      red: plate('red'),
      blue: plate('blue'),
      yellow: plate('yellow'),
      green: plate('green'),
      white: plate('white'),
      scrim: 'rgb(0 0 0 / <alpha-value>)',
    },
    fontFamily: {
      title: ['Newsreader', 'Georgia', 'serif'],
      num: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      ui: ['Inter', 'system-ui', 'sans-serif'],
    },
    extend: {
      borderRadius: { sheet: '16px', control: '10px' },
      spacing: { row: '48px', touch: '48px', margin: '16px' },
      minHeight: { row: '48px', touch: '48px' },
      minWidth: { touch: '48px' },
      screens: { wide: '1024px', full: '1280px', outline: '1360px' },
      opacity: { 45: '0.45' },
      keyframes: {
        sheetUp: { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'none' } },
        cardIn: { '0%': { opacity: '0', transform: 'translateY(16px)' }, '100%': { opacity: '1', transform: 'none' } },
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        stamp: { '0%': { transform: 'scale(1.15) rotate(-7deg)', opacity: '0.4' }, '100%': { transform: 'scale(1) rotate(-4deg)', opacity: '1' } },
        pageIn: { '0%': { opacity: '0', transform: 'translateX(14px)' }, '100%': { opacity: '1', transform: 'none' } },
        pulse1: { '0%,100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.06)' } },
        pop: { '0%': { transform: 'scale(0.5)' }, '60%': { transform: 'scale(1.25)' }, '100%': { transform: 'scale(1)' } },
      },
      animation: {
        'sheet-up': 'sheetUp 240ms cubic-bezier(.2,.8,.3,1) both',
        'card-in': 'cardIn 160ms ease-out both',
        'fade-in': 'fadeIn 160ms ease-out both',
        stamp: 'stamp 180ms ease-out both',
        'page-in': 'pageIn 260ms ease-out both',
        pulse1: 'pulse1 1s ease-in-out infinite',
        pop: 'pop 220ms ease-out both',
      },
    },
  },
  plugins: [
    plugin(({ addUtilities }) => {
      addUtilities({
        '.tabular': { fontVariantNumeric: 'tabular-nums' },
        '.no-scrollbar': { scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } },
        '.safe-pt': { paddingTop: 'env(safe-area-inset-top)' },
        '.safe-pb': { paddingBottom: 'env(safe-area-inset-bottom)' },
      });
    }),
  ],
};
