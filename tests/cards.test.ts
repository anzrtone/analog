// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { cardGeometry, FORMAT_SIZE, mesoCard, prCard, programCard, progressCard, workoutCard, wrappedCard, type CardFormat, type CardOptions } from '@/features/share/cards';
import { carbon, paper } from '@/theme/tokens';

const formats = Object.keys(FORMAT_SIZE) as CardFormat[];
const opts = (format: CardFormat, over: Partial<CardOptions> = {}): CardOptions => ({ format, hideWeights: false, hideDates: false, palette: paper, ...over });

describe('share cards', () => {
  it('every card is one SVG page at the format’s aspect, with the wordmark and the URL', () => {
    for (const f of formats) {
      const cards = [
        prCard(opts(f), { meta: 'OCT 29 · PUSH A', exercise: 'Incline DB press', weightG: 32500, reps: 8, timeMs: null, prevText: '30 × 8', unit: 'kg', changePct: 0.083 }),
        workoutCard(opts(f), { meta: 'OCT 29', title: 'Push A', rows: [{ exercise: 'Bench', sets: [{ type: 'top', weightG: 100000, reps: 5, timeMs: null }] }], durationMs: 3_600_000, volumeG: 500_000, prs: 1, unit: 'kg' }),
        programCard(opts(f), { name: 'Upper/Lower', days: [{ name: 'Upper A', exercises: ['Bench', 'Row'] }], qr: { d: 'M0,0h1v1h-1z', n: 21 } }),
        progressCard(opts(f), { meta: 'LAST 6 MONTHS', exercise: 'Squat', points: [{ x: 1, y: 100000 }, { x: 2, y: 110000 }], unit: 'kg', fromG: 100000, toG: 110000 }),
        mesoCard(opts(f), { meta: 'MESO 1', weeks: 4, headline: '4 weeks done.', muscles: [{ name: 'chest', sets: [10, 12] }], lifts: [{ name: 'Bench', pct: 0.05 }] }),
        wrappedCard(opts(f), { meta: 'OCTOBER', period: 'October', tonnageKg: 77561, comparison: '2.2 loaded semi trucks', workouts: 14, hours: 16, topLift: { name: 'Deadlift', e1rmG: 180000 }, mostTrained: 'quads', unit: 'kg' }),
      ];
      for (const svg of cards) {
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg).toContain(`height="${cardGeometry(f).height}"`);
        expect(svg).toContain('FREE · OPEN SOURCE');
        expect(svg).toContain('>Anal<');
      }
    }
  });

  it('escapes what the user typed', () => {
    const svg = workoutCard(opts('post'), { meta: 'X', title: 'Legs <&> "day"', rows: [], durationMs: 0, volumeG: 0, prs: 0, unit: 'kg' });
    expect(svg).toContain('Legs &lt;&amp;&gt; &quot;day&quot;');
    expect(svg).not.toContain('<&>');
  });

  it('hides weights when asked and follows the chosen theme', () => {
    const shown = prCard(opts('story'), { meta: 'M', exercise: 'Bench', weightG: 100000, reps: 5, timeMs: null, prevText: '95 × 5', unit: 'kg', changePct: 0.05 });
    const hidden = prCard(opts('story', { hideWeights: true, palette: carbon }), { meta: 'M', exercise: 'Bench', weightG: 100000, reps: 5, timeMs: null, prevText: '95 × 5', unit: 'kg', changePct: 0.05 });
    expect(shown).toContain('>100<');
    expect(hidden).toContain('+5%');
    expect(hidden).not.toContain('95 × 5');
    expect(hidden).toContain(carbon.paper);
  });
});
