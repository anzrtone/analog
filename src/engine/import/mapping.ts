// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
// Match exercise names from other apps to our library.
// "Bench Press (Barbell)" → "barbell bench press" → our "Barbell Bench Press - Medium Grip" etc.

export interface LibraryEntry {
  id: string;
  name: string;
  aliases: string[];
}

export interface MatchCandidate {
  id: string;
  name: string;
  score: number;
}

const STOP = new Set(['the', 'a', 'with', 'on', 'of', 'and', 'to', '-', 'medium', 'grip']);
const SYNONYMS: [RegExp, string][] = [
  [/\bdb\b/g, 'dumbbell'],
  [/\bbb\b/g, 'barbell'],
  [/\bkb\b/g, 'kettlebell'],
  [/\bohp\b/g, 'overhead press'],
  [/\brdl\b/g, 'romanian deadlift'],
  [/\bpulldowns?\b/g, 'pulldown'],
  [/\bpull ups?\b|\bpullups?\b/g, 'pullup'],
  [/\bchin ups?\b|\bchinups?\b/g, 'chinup'],
  [/\bpush ups?\b|\bpushups?\b/g, 'pushup'],
  [/\bsit ups?\b|\bsitups?\b/g, 'situp'],
  [/\bflyes?\b|\bflys\b/g, 'fly'],
  [/\braises\b/g, 'raise'],
  [/\bcurls\b/g, 'curl'],
  [/\bextensions\b/g, 'extension'],
  [/\brows\b/g, 'row'],
  [/\bpresses\b/g, 'press'],
  [/\bsquats\b/g, 'squat'],
  [/\blunges\b/g, 'lunge'],
  [/\bdips\b/g, 'dip'],
  [/\bshrugs\b/g, 'shrug'],
  [/\bcrunches\b/g, 'crunch'],
  [/\bdeadlifts\b/g, 'deadlift'],
  [/\bsmith machine\b/g, 'smith'],
];

/** Lowercase, move "(Barbell)" to the front, unify common spellings. */
export function normalizeName(name: string): string {
  let s = name.toLowerCase().trim();
  const paren = s.match(/\(([^)]+)\)/g);
  if (paren) {
    const inside = paren.map((p) => p.slice(1, -1)).join(' ');
    s = `${inside} ${s.replace(/\([^)]*\)/g, ' ')}`;
  }
  s = s.replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ');
  for (const [re, rep] of SYNONYMS) s = s.replace(re, rep);
  return s.replace(/\s+/g, ' ').trim();
}

function tokens(s: string): string[] {
  return s.split(' ').filter((t) => t && !STOP.has(t));
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = s.replace(/ /g, '');
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

function dice(a: string, b: string): number {
  const x = bigrams(a);
  const y = bigrams(b);
  let inter = 0;
  let total = 0;
  for (const [g, n] of x) {
    inter += Math.min(n, y.get(g) ?? 0);
    total += n;
  }
  for (const n of y.values()) total += n;
  return total === 0 ? 0 : (2 * inter) / total;
}

/** 0–1 similarity: token overlap weighted with character bigrams, so word order doesn't matter much. */
export function similarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  const ta = new Set(tokens(na));
  const tb = new Set(tokens(nb));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const jacc = ta.size + tb.size === 0 ? 0 : inter / (ta.size + tb.size - inter);
  const sorted = (t: Set<string>) => [...t].sort().join(' ');
  return 0.6 * jacc + 0.4 * dice(sorted(ta), sorted(tb));
}

/** Best library matches for an imported name. Exact alias hits score 1. */
export function matchExercise(name: string, library: LibraryEntry[], limit = 5): MatchCandidate[] {
  const n = normalizeName(name);
  const scored = library.map((e) => {
    const names = [e.name, ...e.aliases];
    const exact = names.some((x) => normalizeName(x) === n);
    const score = exact ? 1 : Math.max(...names.map((x) => similarity(name, x)));
    return { id: e.id, name: e.name, score };
  });
  return scored.sort((a, b) => b.score - a.score || a.name.length - b.name.length).slice(0, limit);
}

/** Auto-accept threshold: above this we pre-select the match, below it the user picks. */
export const AUTO_MATCH = 0.72;
