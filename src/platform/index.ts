// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { Capacitor } from '@capacitor/core';
import { allowedLink } from '@/config';
import type { Platform } from './types';

export type { Platform } from './types';

let current: Platform | null = null;

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export const isAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

/** Resolve the native bridge once. Each shell's module is code-split so the other isn't loaded. */
export async function loadPlatform(): Promise<Platform> {
  if (current) return current;
  if (isTauri()) current = (await import('./desktop')).desktop;
  else if (isAndroid()) current = (await import('./android')).android;
  else current = (await import('./dev')).dev;
  return current;
}

/** Synchronous access after `loadPlatform()` has resolved (boot waits for it before rendering). */
export function platform(): Platform {
  if (!current) throw new Error('platform not loaded');
  return current;
}

/** Open a link outside the app (system browser). */
export async function openLink(url: string): Promise<void> {
  // Checked here for every platform: Android has no opener scope, and the fallback below would skip the desktop one.
  if (!allowedLink(url)) return;
  try {
    if (current) return await current.openExternal(url);
  } catch {
    /* fall through to the browser route */
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Test hook: inject a fake bridge. */
export function __setPlatform(p: Platform | null) {
  current = p;
}
