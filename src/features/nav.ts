// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useSyncExternalStore } from 'react';

// Navigation without a router library: a typed back stack. Tabs reset it; pushed pages stack on top;
// the Android back button and the in-app back arrow walk it (see App.tsx).

export type Tab = 'today' | 'history' | 'programs' | 'stats' | 'exercises' | 'gyms' | 'more';

export type Route =
  | { name: Exclude<Tab, 'exercises'> }
  | { name: 'workout'; id: string }
  | { name: 'summary'; id: string }
  | { name: 'workoutDetail'; id: string }
  | { name: 'program'; id: string }
  | { name: 'programShare'; id: string }
  | { name: 'programImport'; data: string }
  | { name: 'mesoReport'; runId?: string }
  | { name: 'exercises'; pick?: string; swap?: string; target?: string; workout?: string; picker?: string }
  | { name: 'exercise'; id: string }
  | { name: 'exerciseEdit'; id?: string; /** Name to start a new exercise with. */ prefill?: string; /** Hand the new exercise back to this picker token (the import mapping). */ picker?: string }
  | { name: 'gym'; id: string }
  | { name: 'measurements' }
  | { name: 'import' }
  | { name: 'backup' }
  | { name: 'sync' }
  | { name: 'settings' }
  | { name: 'about' }
  | { name: 'devlog'; whatsNew?: true }
  | { name: 'share'; kind: ShareKind; id: string }
  | { name: 'admin' }
  | { name: 'kitchen' };

export type RouteName = Route['name'];
/** Share cards: `id` is a workout, PR, program or exercise id; "month" or "year" for Wrapped; a run id (or "") for the meso recap. */
export type ShareKind = 'workout' | 'pr' | 'program' | 'progress' | 'meso' | 'wrapped';

export const TABS: Tab[] = ['today', 'history', 'programs', 'stats', 'exercises', 'gyms', 'more'];
/** A tab is a bare page. The exercise library opened as a picker (a workout, a swap, the builder, an import) carries params and is pushed instead. */
export const isTab = (r: Route): r is { name: Tab } => (TABS as string[]).includes(r.name) && Object.keys(r).length === 1;

let stack: Route[] = [{ name: 'today' }];
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** Open a page on top of the current one. A tab (or `root`, as the wide-screen spine uses) starts a fresh stack. */
export function navigate(route: Route, opts: { root?: boolean } = {}): void {
  stack = isTab(route) || opts.root ? [route] : [...stack, route];
  emit();
}

/** Swap the current page (finishing a workout goes to its summary, not back to the logger). */
export function replace(route: Route): void {
  stack = [...stack.slice(0, -1), route];
  emit();
}

/** One page back. False when already at the bottom of the stack. */
export function back(): boolean {
  if (stack.length <= 1) return false;
  stack = stack.slice(0, -1);
  emit();
  return true;
}

export function current(): Route {
  return stack[stack.length - 1]!;
}

/** The tab a page belongs to, for the highlighted tab and spine item. */
export function tabOf(stackNow: Route[] = stack): Tab {
  const bottom = stackNow[0]!;
  return isTab(bottom) ? bottom.name : 'today';
}

export function useNav(): { route: Route; stack: Route[]; tab: Tab } {
  const s = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    () => stack,
  );
  return { route: s[s.length - 1]!, stack: s, tab: tabOf(s) };
}

/** Test hook. */
export function __resetNav(to: Route[] = [{ name: 'today' }]): void {
  stack = to;
  emit();
}
