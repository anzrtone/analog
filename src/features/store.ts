// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useSyncExternalStore } from 'react';

/** A module-level store for useSyncExternalStore, the pattern Promodoro uses instead of a state library. */
export function createStore<T>(initial: T) {
  let state = initial;
  const subs = new Set<() => void>();
  const subscribe = (f: () => void) => {
    subs.add(f);
    return () => void subs.delete(f);
  };
  return {
    get: () => state,
    set(next: T | ((s: T) => T)) {
      const value = typeof next === 'function' ? (next as (s: T) => T)(state) : next;
      if (Object.is(value, state)) return;
      state = value;
      subs.forEach((f) => f());
    },
    use: <U = T>(pick: (s: T) => U = (s) => s as unknown as U): U => useSyncExternalStore(subscribe, () => pick(state)),
    subscribe,
  };
}
