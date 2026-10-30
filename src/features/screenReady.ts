// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { createContext, useContext, useLayoutEffect } from 'react';

/**
 * Counts a page's first database reads while it is being prepared off screen, so the page it replaces can stay up
 * until the new one has something to show (ScreenStack). Reads made later, or outside a page, don't count.
 */
export class ScreenPending {
  private count = 0;
  private checking = false;
  private onReady: (() => void) | null = null;

  add(): void {
    this.count++;
  }

  done(): void {
    this.count--;
    this.check();
  }

  /** Calls back once nothing is loading. Checked after the commit, so a read that hands over to a child's read counts as one. */
  whenReady(cb: () => void): void {
    this.onReady = cb;
    this.check();
  }

  private check(): void {
    if (this.checking || !this.onReady) return;
    this.checking = true;
    queueMicrotask(() => {
      this.checking = false;
      if (this.count > 0 || !this.onReady) return;
      const cb = this.onReady;
      this.onReady = null;
      cb();
    });
  }
}

export const ScreenPendingContext = createContext<ScreenPending | null>(null);

/** Hold the page's entrance until `loaded`. */
export function useHoldScreen(loaded: boolean): void {
  const pending = useContext(ScreenPendingContext);
  useLayoutEffect(() => {
    if (loaded || !pending) return;
    pending.add();
    return () => pending.done();
  }, [loaded, pending]);
}
