// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Route } from '@/features/nav';
import { ScreenPending, ScreenPendingContext } from '@/features/screenReady';
import { cx } from './ui';

// Page changes without a flash. The new page is rendered out of sight while the old one stays up; once its first
// reads are in (or after HOLD_MS, whichever is first) the old page goes, the scroll goes back to the top before the
// browser paints, and the new page comes in: a fade for tabs, a short slide for pages pushed on or popped off.

/** The longest the old page waits for the new one's data. Past it, the new page shows its own empty state. */
const HOLD_MS = 300;

type Motion = 'tab' | 'push' | 'pop' | 'none';
interface Layer {
  key: string;
  route: Route;
  motion: Motion;
  pending: ScreenPending;
}

const ENTER: Record<Motion, string> = { tab: 'animate-screen-fade', push: 'animate-screen-push', pop: 'animate-screen-pop', none: '' };

function motionOf(prev: Route[], next: Route[]): Motion {
  const same = (a: Route, b: Route) => JSON.stringify(a) === JSON.stringify(b);
  if (next.length > prev.length && prev.every((r, i) => same(r, next[i]!))) return 'push';
  if (next.length < prev.length && next.every((r, i) => same(r, prev[i]!))) return 'pop';
  return 'tab';
}

export function ScreenStack({ stack, scroller, render }: { stack: Route[]; scroller: RefObject<HTMLElement>; render: (route: Route) => ReactNode }) {
  const route = stack[stack.length - 1]!;
  const key = JSON.stringify(route);
  const [layers, setLayers] = useState<{ shown: Layer; next: Layer | null }>(() => ({ shown: { key, route, motion: 'none', pending: new ScreenPending() }, next: null }));
  const lastStack = useRef(stack);

  // A new route: prepare it behind the current page (replacing a page still being prepared).
  useLayoutEffect(() => {
    const prev = lastStack.current;
    lastStack.current = stack;
    setLayers((l) => (key === (l.next ?? l.shown).key ? l : key === l.shown.key ? { shown: l.shown, next: null } : { shown: l.shown, next: { key, route, motion: motionOf(prev, stack), pending: new ScreenPending() } }));
  }, [key, route, stack]);

  // Swap when the prepared page is ready.
  const next = layers.next;
  useLayoutEffect(() => {
    if (!next) return;
    let done = false;
    const swap = () => {
      if (done) return;
      done = true;
      setLayers((l) => (l.next === next ? { shown: next, next: null } : l));
    };
    next.pending.whenReady(swap);
    const t = setTimeout(swap, HOLD_MS);
    return () => {
      done = true;
      clearTimeout(t);
    };
  }, [next]);

  // Each page opens at the top, set before the first paint of the new page.
  const shownKey = layers.shown.key;
  useLayoutEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [shownKey, scroller]);

  return (
    <>
      {[layers.shown, layers.next].map((l) =>
        l ? (
          <div
            key={l.key}
            data-screen={l === layers.next ? 'preparing' : 'shown'}
            aria-hidden={l === layers.next || undefined}
            {...(layers.next && l === layers.shown ? { inert: '' } : {})}
            className={cx(l === layers.next ? 'pointer-events-none absolute inset-x-0 top-0 opacity-0' : ENTER[l.motion])}
          >
            <ScreenPendingContext.Provider value={l.pending}>{render(l.route)}</ScreenPendingContext.Provider>
          </div>
        ) : null,
      )}
    </>
  );
}
