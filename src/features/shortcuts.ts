// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useEffect } from 'react';
import { overlayOpen } from '@/components/ui';
import { navigate, type Route } from './nav';
import { startEmptyWorkout } from './workout/actions';

/** True when typing in a field, so single-key shortcuts don't steal letters. */
export function typingInField(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

/** True while a dialog, sheet, the welcome flow or the tour is open: they own the keyboard. */
export function modalOpen(): boolean {
  return overlayOpen() || !!document.querySelector('[aria-modal="true"]');
}

const PAGES: Route[] = [{ name: 'today' }, { name: 'history' }, { name: 'programs' }, { name: 'stats' }, { name: 'exercises' }];

/** App-wide keys on desktop: Alt+1–5 jump to Today, History, Programs, Stats and Exercises, Ctrl+N starts or resumes a workout. */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalOpen()) return;
      if (e.altKey && /^[1-5]$/.test(e.key)) {
        e.preventDefault();
        navigate(PAGES[Number(e.key) - 1]!);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && !typingInField(e)) {
        e.preventDefault();
        void startEmptyWorkout();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
