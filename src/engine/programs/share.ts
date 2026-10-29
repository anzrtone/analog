// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import LZString from 'lz-string';
import { SITE_URL } from '../../config';
import type { Program } from './types';

// Programs travel as compressed JSON in a link or QR code. No server involved.

export const SHARE_SCHEME = 'analog://program?d=';
/** Static GitHub Pages fallback for people without the app installed. */
export const SHARE_WEB = `${SITE_URL}/p/#d=`;

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

export type DecodeResult = { ok: true; payload: SharePayload } | { ok: false; error: string };

/** Accepts the bare data, an analog:// link or the web fallback link. */
export function decodeProgram(input: string): DecodeResult {
  const m = input.match(/[?#&]d=([^&#\s]+)/);
  const data = m ? m[1]! : input.trim();
  let json: unknown;
  try {
    const raw = LZString.decompressFromEncodedURIComponent(data);
    if (!raw) return { ok: false, error: "That link doesn't contain a program." };
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "That link is damaged. Ask for it to be shared again." };
  }
  const p = json as Partial<SharePayload>;
  if (p.v !== 1) return { ok: false, error: 'This program was made by a newer Analog. Update the app to open it.' };
  if (!p.program || typeof p.program.name !== 'string' || !Array.isArray(p.program.blocks)) return { ok: false, error: "That link doesn't contain a program." };
  return { ok: true, payload: { v: 1, program: p.program, exercises: Array.isArray(p.exercises) ? p.exercises : [] } };
}
