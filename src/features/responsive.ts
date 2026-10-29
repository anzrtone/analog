// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useSyncExternalStore } from 'react';

/** From 1024 px the app opens like a logbook spread: the spine on the left, the page on the right. */
export const WIDE_MIN = 1024;

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (f) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', f);
      return () => m.removeEventListener('change', f);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function useWide(): boolean {
  return useMedia(`(min-width: ${WIDE_MIN}px)`);
}

/**
 * How much room the spread has:
 * - `spine`: the full sidebar with labels (≥ 1280) or icons only
 * - `outline`: the workout's session outline column (≥ 1360)
 */
export function useSpread(): { wide: boolean; spine: 'full' | 'icons'; outline: boolean } {
  const wide = useWide();
  const full = useMedia('(min-width: 1280px)');
  const outline = useMedia('(min-width: 1360px)');
  return { wide, spine: full ? 'full' : 'icons', outline };
}
