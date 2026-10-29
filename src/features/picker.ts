// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { createStore } from './store';

/**
 * The exercise picker hands its choice back through here: the program builder or the import mapping opens the
 * library with a token, the library stores the pick under it, and the caller takes it when it comes back.
 */
const store = createStore<{ token: string | null; picked: string | null }>({ token: null, picked: null });

export const picker = {
  open: (token: string) => store.set({ token, picked: null }),
  pick: (token: string, exerciseId: string) => store.set({ token, picked: exerciseId }),
  /** The pick for `token`, once; null if there is none. */
  take(token: string): string | null {
    const { token: t, picked } = store.get();
    if (t !== token || !picked) return null;
    store.set({ token: null, picked: null });
    return picked;
  },
  use: () => store.use(),
};
