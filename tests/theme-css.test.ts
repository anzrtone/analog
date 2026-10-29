// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { readFileSync } from 'node:fs';
import { carbon, paper, type Palette } from '@/theme/tokens';

// The app draws with the CSS variables; the contrast test checks src/theme/tokens.ts. This keeps the two equal,
// so a colour changed in only one place fails here instead of slipping past the contrast check.

const css = readFileSync(new URL('../src/styles/index.css', import.meta.url), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(\d+)\s+(\d+)\s+(\d+);/g)) {
    out[m[1]!] = `#${[m[2], m[3], m[4]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  }
  return out;
}

function expected(p: Palette): Record<string, string> {
  const out: Record<string, string> = { paper: p.paper, 'paper-raised': p.paperRaised, 'paper-sunk': p.paperSunk, rule: p.rule, ink: p.ink, 'ink-2': p.ink2, pencil: p.pencil, erased: p.erased };
  for (const [name, c] of Object.entries(p.plate)) {
    out[`${name}-ring`] = c.ring;
    out[`${name}-text`] = c.text;
  }
  return out;
}

describe('CSS variables match the tokens', () => {
  it('Carbon (the default)', () => expect(block(":root[data-theme='carbon']")).toEqual(expected(carbon)));
  it('Paper', () => expect(block(":root[data-theme='paper']")).toEqual(expected(paper)));
});
