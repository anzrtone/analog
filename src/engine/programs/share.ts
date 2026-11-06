// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import LZString from 'lz-string';
import { SITE_URL } from '../../config';
import { LOGGING_MODES, type LoggingMode } from '../types';
import { DEFAULT_MESO, type Program } from './types';

// Programs travel as compressed JSON in a link or QR code. No server involved.

export const SHARE_SCHEME = 'analog://program?d=';
/** Static GitHub Pages fallback for people without the app installed. */
export const SHARE_WEB = `${SITE_URL}/p/#d=`;

/**
 * LZ output can grow with the square of its input and cannot be stopped partway, so the only real guard against a
 * small link unpacking into gigabytes is refusing long links before decompressing. A real program is a few KB.
 */
export const MAX_LINK_CHARS = 64 * 1024;
const MAX_JSON_CHARS = 2 * 1024 * 1024;

export interface SharedExercise {
  id: string;
  name: string;
  primary: string[];
  secondary: string[];
  equipment: string;
  mode: string;
}

export interface SharePayload {
  v: 1;
  program: Program;
  /** Custom exercises the program uses, so the receiver can recreate them. */
  exercises: SharedExercise[];
}

export function encodeProgram(payload: Omit<SharePayload, 'v'>): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify({ v: 1, ...payload }));
}

export function programLink(payload: Omit<SharePayload, 'v'>, web = false): string {
  return (web ? SHARE_WEB : SHARE_SCHEME) + encodeProgram(payload);
}

const RULES = new Set(['linear', 'double', 'triple', 'rpe', 'tm', 'time', 'topBackoff', 'meso', 'manual']);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const name = (v: unknown, max = 200) => typeof v === 'string' && v.length <= max;
const list = (v: unknown, max: number): v is unknown[] => Array.isArray(v) && v.length <= max;
const count = (v: unknown, max: number) => v === null || v === undefined || (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max);

function validSet(s: unknown): boolean {
  return isObj(s) && name(s.type, 60) && count(s.reps, 1000) && count(s.repsMax, 1000) && count(s.rir, 100) && count(s.pct, 100) && count(s.timeMs, 86_400_000);
}

function validSlot(s: unknown): boolean {
  if (!isObj(s) || !name(s.id, 200) || !name(s.exerciseId, 300)) return false;
  if (!list(s.sets, 100) || !s.sets.every(validSet)) return false;
  if (!isObj(s.rule) || !RULES.has(s.rule.type as string)) return false;
  for (const v of Object.values(s.rule)) if (typeof v === 'number' && !Number.isFinite(v)) return false;
  return count(s.restMs, 86_400_000) && (s.note == null || name(s.note, 5000)) && (s.groupId == null || name(s.groupId, 200));
}

/** The shape every screen and the progression engine rely on, with limits far above any real program. */
export function validProgram(p: unknown): boolean {
  if (!isObj(p) || !name(p.name) || !list(p.blocks, 50)) return false;
  return p.blocks.every(
    (b) =>
      isObj(b) &&
      name(b.name) &&
      count(b.weeks, 520) &&
      list(b.days, 60) &&
      b.days.every((d) => isObj(d) && name(d.name) && count(d.weekday, 6) && list(d.slots, 100) && d.slots.every(validSlot)),
  );
}

function validExercise(e: unknown): e is SharedExercise {
  if (!isObj(e) || !name(e.id, 300) || !name(e.name) || !name(e.equipment, 100)) return false;
  if (!LOGGING_MODES.includes(e.mode as LoggingMode)) return false;
  const muscles = (v: unknown) => list(v, 50) && v.every((m) => name(m, 60));
  return muscles(e.primary) && muscles(e.secondary);
}

/** The program data in an opened analog://program link, or null when the link is anything else or malformed. */
export function deepLinkData(url: string): string | null {
  if (url.length > MAX_LINK_CHARS * 3) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'analog:' || u.host !== 'program') return null;
    const d = /[?&]d=([^&]+)/.exec(url)?.[1];
    return d ? decodeURIComponent(d) : null;
  } catch {
    return null;
  }
}

export type DecodeResult = { ok: true; payload: SharePayload } | { ok: false; error: string };

const NOT_A_PROGRAM = "That link doesn't contain a program.";

/** Accepts the bare data, an analog:// link or the web fallback link. */
export function decodeProgram(input: string): DecodeResult {
  if (input.length > MAX_LINK_CHARS) return { ok: false, error: 'That link is too long to be an Analog program.' };
  const m = input.match(/[?#&]d=([^&#\s]+)/);
  const data = m ? m[1]! : input.trim();
  let json: unknown;
  try {
    const raw = LZString.decompressFromEncodedURIComponent(data);
    if (!raw) return { ok: false, error: NOT_A_PROGRAM };
    if (raw.length > MAX_JSON_CHARS) return { ok: false, error: 'That link is too long to be an Analog program.' };
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'That link is damaged. Ask for it to be shared again.' };
  }
  if (!isObj(json)) return { ok: false, error: NOT_A_PROGRAM };
  if (json.v !== 1) return { ok: false, error: 'This program was made by a newer Analog. Update the app to open it.' };
  if (!validProgram(json.program)) return { ok: false, error: NOT_A_PROGRAM };
  const exercises = json.exercises === undefined ? [] : json.exercises;
  if (!list(exercises, 500) || !exercises.every(validExercise)) return { ok: false, error: NOT_A_PROGRAM };
  const p = json.program as unknown as Program;
  // What a builder always fills in, in case a hand-made link left it out.
  const blocks = p.blocks.map((b) => ({ ...b, overrides: isObj(b.overrides) ? b.overrides : {} }));
  const program: Program = { ...p, notes: typeof p.notes === 'string' ? p.notes : '', groups: isObj(p.groups) ? p.groups : {}, meso: isObj(p.meso) ? p.meso : DEFAULT_MESO, blocks };
  return { ok: true, payload: { v: 1, program, exercises } };
}
