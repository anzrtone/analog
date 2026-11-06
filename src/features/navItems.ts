// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { ChartLine, Dumbbell, History, ListChecks, Menu, NotebookPen, Weight, type LucideIcon } from 'lucide-react';
import type { Tab } from './nav';

/**
 * The app's main navigation, and the only list of it: the phone's tab bar and the desktop sidebar both draw this. Two
 * separate lists once left Sync reachable on the phone and nowhere on desktop. A page belongs either here or on More.
 */
export const NAV_ITEMS: { id: Tab; label: string; icon: LucideIcon; tour?: string; /** Keyboard shortcut, shown on desktop. */ hint?: string }[] = [
  { id: 'today', label: 'Log', icon: NotebookPen, hint: 'Alt 1' },
  { id: 'history', label: 'History', icon: History, tour: 'nav-history', hint: 'Alt 2' },
  { id: 'programs', label: 'Programs', icon: ListChecks, tour: 'nav-programs', hint: 'Alt 3' },
  { id: 'stats', label: 'Stats', icon: ChartLine, tour: 'nav-stats', hint: 'Alt 4' },
  { id: 'exercises', label: 'Exercises', icon: Dumbbell, hint: 'Alt 5' },
  { id: 'gyms', label: 'My Gyms', icon: Weight },
  { id: 'more', label: 'More', icon: Menu },
];
