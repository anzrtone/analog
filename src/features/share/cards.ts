// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
/**
 * Share cards (BRAND §10): a page torn out of the log. Each card is one SVG string, drawn on a 360-wide page and
 * exported at 1080 px, so the preview on screen and the PNG are the same drawing. Text sits on the rules: every
 * line is a whole number of 28 px rules tall. No React here, so the tests can read the cards.
 */
import { CARD_URL } from '@/config';
import { formatClock, formatDuration, formatSet, formatWeight, fromGrams } from '@/engine/math/units';
import { setTypeInfo, type SetType } from '@/engine/setTypes';
import type { WeightUnit } from '@/engine/types';
import { ringColors, type Palette, type RingColor } from '@/theme/tokens';

export type CardFormat = 'story' | 'post' | 'portrait';
export const FORMAT_SIZE: Record<CardFormat, { w: number; h: number; label: string }> = {
  story: { w: 1080, h: 1920, label: '9:16 story' },
  post: { w: 1080, h: 1080, label: '1:1 post' },
  portrait: { w: 1080, h: 1350, label: '4:5' },
};
/** Cards are laid out 360 wide and exported at 1080 px (3×). */
export const CARD_W = 360;
export const RULE = 28;

export interface CardOptions {
  format: CardFormat;
  hideWeights: boolean;
  hideDates: boolean;
  palette: Palette;
}

const FONT = { title: "Newsreader, Georgia, serif", num: "'IBM Plex Mono', monospace", ui: 'Inter, sans-serif' } as const;
/** Average advance per character, as a fraction of the font size, for fitting text to a line. */
const ADVANCE = { title: 0.47, num: 0.6, ui: 0.53 } as const;

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Shorten text with an ellipsis so it fits `width` at `size` in `family`. */
export function fit(text: string, width: number, size: number, family: keyof typeof ADVANCE): string {
  const max = Math.floor(width / (size * ADVANCE[family]));
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/** The page geometry for a format: a 120 px inset on stories keeps everything clear of Instagram's UI; 60 px elsewhere. */
export function cardGeometry(format: CardFormat) {
  const { w, h } = FORMAT_SIZE[format];
  const height = (CARD_W * h) / w;
  const inset = (format === 'story' ? 120 : 60) / 3;
  const top = Math.ceil(inset / RULE) * RULE;
  const footer = Math.floor((height - inset) / RULE) * RULE;
  const margin = inset + 2;
  const left = margin + 12;
  return { height, inset, top, footer, margin, left, width: CARD_W - left - inset };
}

interface TextOpts {
  size: number;
  family: keyof typeof FONT;
  weight?: number;
  fill: string;
  anchor?: 'start' | 'middle' | 'end';
  caps?: boolean;
  spacing?: number;
}

/** One line of text written on the rule below `top` (`lines` rules tall). */
export function text(x: number, top: number, s: string, o: TextOpts, lines = 1): string {
  const baseline = top + lines * RULE - 7;
  return `<text x="${x}" y="${baseline}" font-family="${FONT[o.family]}" font-size="${o.size}" font-weight="${o.weight ?? 400}" fill="${o.fill}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.spacing ? ` letter-spacing="${o.spacing}"` : ''}>${esc(o.caps ? s.toUpperCase() : s)}</text>`;
}

/** A plate ring: solid when done, with a letter or the set number. */
export function ring(cx: number, cy: number, size: number, color: RingColor, p: Palette, letter: string | null, stroke = 3, filled = false): string {
  const c = ringColors(p, color);
  const r = (size - stroke) / 2;
  const t = letter ? `<text x="${cx}" y="${cy + size * 0.16}" text-anchor="middle" font-family="${FONT.num}" font-size="${letter.length > 1 ? size * 0.36 : size * 0.46}" font-weight="500" fill="${filled ? p.paper : c.text}">${esc(letter)}</text>` : '';
  return `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${c.ring}" stroke-width="${stroke}" fill="${filled ? c.ring : 'none'}"/>${t}`;
}

/** "Analog" with the o as a red plate ring (BRAND §3). */
function wordmark(x: number, baseline: number, size: number, p: Palette): string {
  const anal = size * 1.93;
  const ringD = size * 0.62;
  const cx = x + anal + size * 0.03 + ringD / 2;
  return `<text x="${x}" y="${baseline}" font-family="${FONT.title}" font-size="${size}" font-weight="500" fill="${p.ink}">Anal</text>${ring(cx, baseline - ringD / 2 + size * 0.02, ringD, 'red', p, null, ringD * 0.22)}<text x="${cx + ringD / 2 + size * 0.03}" y="${baseline}" font-family="${FONT.title}" font-size="${size}" font-weight="500" fill="${p.ink}">g</text>`;
}

/** A block of the card body: `rules` rules tall, drawn from `top`. */
export interface Row {
  rules: number;
  draw: (top: number, g: ReturnType<typeof cardGeometry>) => string;
}

const HEADLINE: Record<CardFormat, { size: number; lines: number }> = {
  story: { size: 40, lines: 2 },
  portrait: { size: 34, lines: 2 },
  post: { size: 28, lines: 1 },
};

/** The page: ruled lines and a red margin, the meta line, a serif headline, the body centred on whole rules, the wordmark on the last rule. */
export function frame(o: CardOptions, meta: string, headline: string, rows: Row[]): string {
  const p = o.palette;
  const g = cardGeometry(o.format);
  const head = HEADLINE[o.format];
  const rules = Array.from({ length: Math.floor(g.height / RULE) }, (_, i) => `<rect x="0" y="${RULE * (i + 1)}" width="${CARD_W}" height="1" fill="${p.rule}" opacity="0.6"/>`).join('');
  // Two-line headlines wrap at a word; one line is fitted.
  const hl = (() => {
    const max = Math.floor(g.width / (head.size * ADVANCE.title));
    if (head.lines === 1 || headline.length <= max) return [fit(headline, g.width, head.size, 'title')];
    const cut = headline.lastIndexOf(' ', max);
    const a = cut > 0 ? headline.slice(0, cut) : headline.slice(0, max);
    return [a, fit(headline.slice(a.length).trim(), g.width, head.size, 'title')];
  })();
  const headTop = g.top;
  const headSvg = hl.map((l, i) => text(g.left, headTop + (i * head.lines * RULE) / hl.length, l, { size: head.size, family: 'title', weight: 500, fill: p.ink }, head.lines / hl.length)).join('');
  const bodyTop = headTop + head.lines * RULE;
  const space = Math.floor((g.footer - RULE - bodyTop) / RULE);
  const used = rows.reduce((n, r) => n + r.rules, 0);
  let y = bodyTop + Math.max(0, Math.floor((space - used) / 2)) * RULE;
  let body = '';
  for (const r of rows) {
    if (y + r.rules * RULE > g.footer - RULE) break;
    body += r.draw(y, g);
    y += r.rules * RULE;
  }
  const footerTop = g.footer - RULE;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${g.height}" viewBox="0 0 ${CARD_W} ${g.height}">
<rect width="${CARD_W}" height="${g.height}" fill="${p.paper}"/>${rules}
<rect x="${g.margin}" y="0" width="1" height="${g.height}" fill="${p.plate.red.ring}" opacity="0.45"/>
${text(g.left, g.top - RULE, fit(meta, g.width, 11, 'num'), { size: 11, family: 'num', fill: p.pencil, caps: true, spacing: 0.66 })}
${headSvg}
${body}
<rect x="${g.margin}" y="${footerTop}" width="${CARD_W - g.margin - g.inset}" height="1.5" fill="${p.ink}" opacity="0.7"/>
${wordmark(g.left, footerTop + RULE - 5, 19, p)}
<text x="${CARD_W - g.inset}" y="${footerTop + RULE - 15}" text-anchor="end" font-family="${FONT.num}" font-size="9" fill="${p.ink2}" letter-spacing="0.5">FREE · OPEN SOURCE</text>
<text x="${CARD_W - g.inset}" y="${footerTop + RULE - 4}" text-anchor="end" font-family="${FONT.num}" font-size="9" fill="${p.pencil}">${esc(CARD_URL)}</text>
</svg>`;
}

const line = (s: string, o: TextOpts, x?: number): Row => ({ rules: 1, draw: (top, g) => text(x ?? (o.anchor === 'middle' ? CARD_W / 2 + (g.left - g.inset) / 2 : g.left), top, fit(s, g.width, o.size, o.family), o) });
const blank: Row = { rules: 1, draw: () => '' };

// ---- The cards ----

export function prCard(o: CardOptions, d: { meta: string; exercise: string; weightG: number | null; reps: number | null; timeMs: number | null; prevText: string | null; unit: WeightUnit; changePct: number | null }): string {
  const p = o.palette;
  const hero = d.timeMs ? formatClock(d.timeMs) : o.hideWeights && d.changePct != null ? `+${Math.round(d.changePct * 100)}%` : d.weightG ? formatWeight(d.weightG, d.unit) : String(d.reps ?? '');
  // The ring is a whole number of rules tall so the lines under it stay on the grid.
  const rules = o.format === 'post' ? 5 : o.format === 'portrait' ? 7 : 8;
  const size = rules * RULE;
  const center = (g: ReturnType<typeof cardGeometry>) => g.left + g.width / 2;
  const rows: Row[] = [
    {
      rules,
      draw: (top, g) => {
        const cx = center(g);
        const cy = top + size / 2;
        const fs = size * (hero.length > 5 ? 0.2 : 0.26);
        const unitText = !d.timeMs && !o.hideWeights && d.weightG ? `<text x="${cx}" y="${cy + fs * 0.35 + 22}" text-anchor="middle" font-family="${FONT.ui}" font-size="15" fill="${p.pencil}">${d.unit}</text>` : '';
        return `${ring(cx, cy, size - 6, 'red', p, null, size * 0.1)}<text x="${cx}" y="${cy + fs * 0.35}" text-anchor="middle" font-family="${FONT.num}" font-size="${fs}" font-weight="500" fill="${p.ink}">${esc(hero)}</text>${unitText}`;
      },
    },
    {
      rules: 1,
      draw: (top, g) => {
        const lead = d.timeMs ? '' : d.reps ? `× ${d.reps} · ` : '';
        return `<text x="${center(g)}" y="${top + RULE - 7}" text-anchor="middle"><tspan font-family="${FONT.num}" font-size="20" font-weight="500" fill="${p.ink}">${esc(lead)}</tspan><tspan font-family="${FONT.title}" font-size="20" font-weight="500" fill="${p.ink}">${esc(fit(d.exercise.toLowerCase(), g.width - lead.length * 12, 20, 'title'))}</tspan></text>`;
      },
    },
  ];
  if (d.prevText && !o.hideWeights) rows.push({ rules: 1, draw: (top, g) => text(center(g), top, `prev ${d.prevText}`, { size: 16, family: 'num', fill: p.pencil, anchor: 'middle' }) });
  return frame(o, d.meta, 'New PR', rows);
}

export interface MiniLogRow {
  exercise: string;
  sets: { type: SetType; weightG: number | null; reps: number | null; timeMs: number | null }[];
}

function stats(o: CardOptions, items: { label: string; value: string; tone?: 'red' | 'ink' }[]): Row {
  const p = o.palette;
  return {
    rules: 2,
    draw: (top, g) =>
      items
        .map((it, i) => {
          const anchor = i === 0 ? 'start' : i === items.length - 1 ? 'end' : 'middle';
          const x = i === 0 ? g.left : i === items.length - 1 ? g.left + g.width : g.left + g.width / 2;
          return text(x, top, it.label, { size: 11, family: 'num', fill: p.pencil, anchor, spacing: 0.66 }) + text(x, top + RULE, it.value, { size: 20, family: 'num', weight: 500, fill: it.tone === 'red' ? p.plate.red.text : p.ink, anchor });
        })
        .join(''),
  };
}

export function workoutCard(o: CardOptions, d: { meta: string; title: string; rows: MiniLogRow[]; durationMs: number; volumeG: number; prs: number; unit: WeightUnit }): string {
  const p = o.palette;
  // Body lines left under the headline: each exercise takes two (name, sets), the totals two.
  const budget = { story: 14, portrait: 11, post: 9 }[o.format];
  const maxRows = d.rows.length * 2 + 3 <= budget ? d.rows.length : Math.max(1, Math.floor((budget - 4) / 2));
  const label = (s: MiniLogRow['sets'][number]) => (setTypeInfo(s.type).timed ? formatClock(s.timeMs ?? 0) : o.hideWeights ? `${s.reps ?? ''}` : formatSet(s.weightG, s.reps, d.unit));
  const rows: Row[] = [];
  for (const r of d.rows.slice(0, maxRows)) {
    rows.push(line(r.exercise, { size: 17, family: 'title', weight: 500, fill: p.ink }));
    rows.push({
      rules: 1,
      draw: (top, g) => {
        // As many sets as fit on one line (ring + Plex Mono at 12: 7.2 px a character), then "+n".
        let x = g.left;
        let out = '';
        let shown = 0;
        for (const [i, s] of r.sets.entries()) {
          const w = 24 + 3 + label(s).length * 7.2 + 8;
          if (x + w > g.left + g.width - 24) break;
          const info = setTypeInfo(s.type);
          out += ring(x + 12, top + RULE / 2, 22, info.ring, p, info.glyph ? null : (info.letter ?? String(i + 1)), 2.5);
          out += `<text x="${x + 27}" y="${top + RULE / 2 + 4}" font-family="${FONT.num}" font-size="12" fill="${p.ink}">${esc(label(s))}</text>`;
          x += w;
          shown++;
        }
        if (shown < r.sets.length) out += `<text x="${x}" y="${top + RULE / 2 + 4}" font-family="${FONT.num}" font-size="12" fill="${p.pencil}">+${r.sets.length - shown}</text>`;
        return out;
      },
    });
  }
  if (d.rows.length > maxRows) rows.push(line(`+${d.rows.length - maxRows} more ${d.rows.length - maxRows === 1 ? 'exercise' : 'exercises'}`, { size: 15, family: 'ui', fill: p.pencil }));
  if (rows.length + 3 <= budget) rows.push(blank);
  rows.push(stats(o, [{ label: 'TIME', value: formatDuration(d.durationMs) }, ...(o.hideWeights ? [] : [{ label: 'VOLUME', value: `${formatWeight(d.volumeG, d.unit)} ${d.unit}` }]), { label: 'PRS', value: String(d.prs), tone: d.prs ? ('red' as const) : ('ink' as const) }]));
  return frame(o, d.meta, d.title, rows);
}

/** The modules of a QR code as one path (from components/Qr), placed on the card. */
export function programCard(o: CardOptions, d: { name: string; days: { name: string; exercises: string[] }[]; qr: { d: string; n: number } | null }): string {
  const p = o.palette;
  const g = cardGeometry(o.format);
  const colW = (g.width - 10) / 2;
  const days = d.days.slice(0, o.format === 'post' ? 2 : 4);
  const per = o.format === 'post' ? 3 : 5;
  const rows: Row[] = [];
  for (let i = 0; i < days.length; i += 2) {
    const pair = days.slice(i, i + 2);
    const tall = 1 + Math.max(...pair.map((x) => Math.min(per, x.exercises.length)));
    rows.push({
      rules: tall,
      draw: (top, gg) =>
        pair
          .map((day, j) => {
            const x = gg.left + j * (colW + 10);
            const items = day.exercises.slice(0, per).map((e, k) => text(x + 8, top + (k + 1) * RULE, fit(e, colW - 10, 12, 'ui'), { size: 12, family: 'ui', fill: p.ink2 })).join('');
            return `<rect x="${x}" y="${top + 6}" width="2" height="${tall * RULE - 10}" fill="${p.plate.blue.ring}"/>${text(x + 8, top, fit(day.name, colW - 10, 14, 'ui'), { size: 14, family: 'ui', weight: 500, fill: p.ink })}${items}`;
          })
          .join(''),
    });
  }
  if (d.qr) {
    const rules = o.format === 'post' ? 4 : 6;
    const size = rules * RULE - 8;
    const qr = d.qr;
    rows.push(blank, {
      rules,
      draw: (top, gg) => {
        const x = gg.left + (gg.width - size) / 2;
        const s = size / (qr.n + 4);
        return `<g transform="translate(${x},${top + 4}) scale(${s})"><rect x="0" y="0" width="${qr.n + 4}" height="${qr.n + 4}" fill="${p.paper}"/><path transform="translate(2,2)" d="${qr.d}" fill="${p.ink}"/></g>`;
      },
    });
  }
  return frame(o, d.qr ? 'PROGRAM · SCAN TO IMPORT' : 'PROGRAM · MADE IN ANALOG', d.name, rows);
}

export function progressCard(o: CardOptions, d: { meta: string; exercise: string; points: { x: number; y: number }[]; unit: WeightUnit; fromG: number; toG: number }): string {
  const p = o.palette;
  const pct = d.fromG ? (d.toG - d.fromG) / d.fromG : 0;
  const rules = 6;
  const chart: Row = {
    rules,
    draw: (top, g) => {
      const h = rules * RULE - 12;
      const xs = d.points.map((pt) => pt.x);
      const ys = d.points.map((pt) => pt.y);
      const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
      let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
      if (y0 === y1) [y0, y1] = [y0 - 1, y1 + 1];
      const sx = (x: number) => g.left + ((x - x0) / (x1 - x0 || 1)) * (g.width - 8);
      const sy = (y: number) => top + 6 + (1 - (y - y0) / (y1 - y0)) * h;
      const path = d.points.map((pt, i) => `${i ? 'L' : 'M'}${sx(pt.x).toFixed(1)},${sy(pt.y).toFixed(1)}`).join(' ');
      const best = d.points.reduce((a, b) => (b.y > a.y ? b : a));
      return `<path d="${path}" stroke="${p.ink}" stroke-width="2" fill="none" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${sx(best.x)}" cy="${sy(best.y)}" r="5" fill="${p.plate.red.ring}"/>`;
    },
  };
  return frame(o, d.meta, d.exercise, [chart, blank, line(o.hideWeights ? `e1RM ${pct >= 0 ? '+' : ''}${Math.round(pct * 100)}%` : `e1RM ${formatWeight(d.fromG, d.unit)} → ${formatWeight(d.toG, d.unit)} ${d.unit}`, { size: 18, family: 'num', weight: 500, fill: p.ink })]);
}

export function mesoCard(o: CardOptions, d: { meta: string; weeks: number; headline: string; muscles: { name: string; sets: number[] }[]; lifts: { name: string; pct: number | null }[] }): string {
  const p = o.palette;
  const rows: Row[] = [line(d.headline, { size: 15, family: 'ui', fill: p.ink2 }), blank];
  for (const m of d.muscles.slice(0, o.format === 'post' ? 4 : 7)) {
    rows.push({
      rules: 1,
      draw: (top, g) => text(g.left, top, fit(m.name, 96, 13, 'ui'), { size: 13, family: 'ui', weight: 500, fill: p.ink }) + m.sets.map((s, i) => ring(g.left + 108 + i * 28, top + RULE / 2, 24, i > 0 && s > m.sets[0]! ? 'green' : 'ink', p, String(Math.round(s)), 2.5)).join(''),
    });
  }
  const lifts = d.lifts.filter((l) => l.pct != null).slice(0, 3);
  if (lifts.length) rows.push(blank);
  for (const l of lifts) rows.push(line(`${l.name.toLowerCase()} ${l.pct! >= 0 ? '+' : ''}${Math.round(l.pct! * 100)}% e1RM`, { size: 15, family: 'num', fill: p.ink }));
  return frame(o, d.meta, `Survived ${d.weeks} weeks`, rows);
}

export function wrappedCard(o: CardOptions, d: { meta: string; period: string; tonnageKg: number; comparison: string; workouts: number; hours: number; topLift: { name: string; e1rmG: number } | null; mostTrained: string | null; unit: WeightUnit }): string {
  const p = o.palette;
  const g = cardGeometry(o.format);
  // "2.2 loaded semi trucks": the count becomes the hero when weights are hidden.
  const [count = '', ...things] = d.comparison.split(' ');
  const hero = o.hideWeights ? count : Math.round(fromGrams(d.tonnageKg * 1000, d.unit)).toLocaleString('en-US');
  const suffix = o.hideWeights ? '' : ` ${d.unit}`;
  const heroLines = o.format === 'story' ? 3 : 2;
  const heroSize = Math.min(o.format === 'story' ? 64 : o.format === 'portrait' ? 56 : 48, Math.floor((g.width - suffix.length * 12) / (hero.length * 0.6)));
  const ledger = (label: string, value: string, extra = ''): Row => ({
    rules: 1,
    draw: (top, gg) => text(gg.left, top, label, { size: 11, family: 'num', fill: p.pencil, spacing: 0.66 }) + text(gg.left + 102, top, fit(value, gg.width - 102 - extra.length * 9.6, 18, 'title'), { size: 18, family: 'title', weight: 500, fill: p.ink }) + (extra ? text(gg.left + gg.width, top, extra, { size: 16, family: 'num', fill: p.ink, anchor: 'end' }) : ''),
  });
  const rows: Row[] = [
    line('YOU LIFTED', { size: 11, family: 'num', fill: p.pencil, spacing: 0.66 }),
    {
      rules: heroLines,
      draw: (top, gg) => `<text x="${gg.left}" y="${top + heroLines * RULE - 9}"><tspan font-family="${FONT.num}" font-size="${heroSize}" font-weight="500" fill="${p.ink}">${esc(hero)}</tspan><tspan font-family="${FONT.num}" font-size="20" fill="${p.pencil}">${esc(suffix)}</tspan></text>`,
    },
    line(o.hideWeights ? `${things.join(' ')}.` : `That's ${d.comparison}.`, { size: 20, family: 'title', weight: 500, fill: p.ink }),
    blank,
    ledger('WORKOUTS', `${d.workouts} in ${d.hours} ${d.hours === 1 ? 'hour' : 'hours'}`),
  ];
  if (d.topLift) rows.push(ledger('TOP E1RM', d.topLift.name, o.hideWeights ? '' : `${Math.round(fromGrams(d.topLift.e1rmG, d.unit))} ${d.unit}`));
  if (d.mostTrained && o.format !== 'post') rows.push(ledger('MOST TRAINED', d.mostTrained.charAt(0).toUpperCase() + d.mostTrained.slice(1)));
  return frame(o, d.meta, `${d.period}, wrapped`, rows);
}
