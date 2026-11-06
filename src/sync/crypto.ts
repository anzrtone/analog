// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
/**
 * The pairing code and what it unlocks. One 20-character code (100 bits) is stretched with HKDF-SHA-256 into three
 * values that have nothing to do with each other: the name the relay stores the snapshot under, the AES-256-GCM key
 * that scrambles it, and a write token. The relay learns the name and (a hash of) the token, never the key, so it
 * only ever holds ciphertext it cannot read.
 */

/** Crockford base32: no I, L, O or U. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SALT = 'analog-sync-v1';

export class WrongCodeError extends Error {
  constructor(message = "Couldn't unlock the synced data. Double-check the sync code.") {
    super(message);
    this.name = 'WrongCodeError';
  }
}

export function generateSyncCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  // 256 is a multiple of 32, so taking the low five bits is unbiased.
  return Array.from(bytes, (b) => ALPHABET[b & 31]).join('');
}

/** `ABCDE-FGHJK-MNPQR-STVWX` for showing and copying. */
export const formatSyncCode = (code: string): string => code.replace(/(.{5})(?=.)/g, '$1-');

/** Upper-cases, drops separators, maps the look-alikes (O→0, I and L→1). Null unless it is exactly 20 valid characters. */
export function normalizeSyncCode(input: string): string | null {
  const s = input
    .toUpperCase()
    .replace(/[\s\-_.]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  return s.length === 20 && [...s].every((c) => ALPHABET.includes(c)) ? s : null;
}

const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => Array.from(b instanceof Uint8Array ? b : new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');

export interface SyncKeys {
  /** 32 hex chars: the relay's name for this pair's snapshot. */
  id: string;
  key: CryptoKey;
  /** 64 hex chars: proves the right to write. Unrelated to `key`. */
  token: string;
}

export async function deriveKeys(code: string): Promise<SyncKeys> {
  const base = await crypto.subtle.importKey('raw', enc.encode(code), 'HKDF', false, ['deriveBits', 'deriveKey']);
  const params = (info: string) => ({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode(SALT), info: enc.encode(info) });
  const id = hex(await crypto.subtle.deriveBits(params('id'), base, 128));
  const token = hex(await crypto.subtle.deriveBits(params('token'), base, 256));
  const key = await crypto.subtle.deriveKey(params('key'), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { id, key, token };
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  return hex(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
}

const canCompress = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>));
  return new Uint8Array(await out.arrayBuffer());
}

/** Far more than any real history, and a gzip bomb stops here: gzip can expand a thousandfold. */
const MAX_PLAIN_BYTES = 500 * 1024 * 1024;

async function gunzipCapped(data: Uint8Array): Promise<Uint8Array> {
  const reader = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>).getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_PLAIN_BYTES) {
      await reader.cancel();
      throw new Error('too large');
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Wire format: [version][12-byte IV][ciphertext]. Version 1 encrypts the JSON; version 2 gzips it first. */
export async function encryptSnapshot(json: string, key: CryptoKey, opts: { compress?: boolean } = {}): Promise<Uint8Array> {
  const compress = (opts.compress ?? true) && canCompress();
  const plain = compress ? await pipe(enc.encode(json), new CompressionStream('gzip')) : enc.encode(json);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain as BufferSource));
  const out = new Uint8Array(1 + 12 + cipher.length);
  out[0] = compress ? 2 : 1;
  out.set(iv, 1);
  out.set(cipher, 13);
  return out;
}

export async function decryptSnapshot(blob: Uint8Array, key: CryptoKey): Promise<string> {
  const unreadable = () => new Error('The synced data is not readable. Is it from a newer Analog?');
  if (blob.length < 14 || (blob[0] !== 1 && blob[0] !== 2)) throw unreadable();
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.slice(1, 13) }, key, blob.slice(13)));
  } catch {
    throw new WrongCodeError();
  }
  if (blob[0] === 2) {
    if (!canCompress()) throw unreadable();
    try {
      plain = await gunzipCapped(plain);
    } catch {
      throw unreadable();
    }
  }
  return new TextDecoder().decode(plain);
}
