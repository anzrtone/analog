// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { contrastRatio } from './contrast';
import { blueprint, carbon, darkroom, ledger, paper, type Palette } from './tokens';

const backgrounds = (p: Palette) => [p.paper, p.paperRaised, p.paperSunk];

describe.each([paper, carbon, blueprint, darkroom, ledger])('$name theme contrast', (p) => {
  it.each(['ink', 'ink2', 'pencil'] as const)('%s text passes AA (4.5:1) on every surface', (token) => {
    for (const bg of backgrounds(p)) expect(contrastRatio(p[token], bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.keys(p.plate) as (keyof Palette['plate'])[])('%s plate text passes AA, ring passes 3:1', (name) => {
    for (const bg of backgrounds(p)) {
      expect(contrastRatio(p.plate[name].text, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.plate[name].ring, bg)).toBeGreaterThanOrEqual(3);
    }
  });

  it('primary button text (paper on ink) passes AA', () => {
    expect(contrastRatio(p.paper, p.ink)).toBeGreaterThanOrEqual(4.5);
  });
});

it('contrast maths matches known values', () => {
  expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
});
