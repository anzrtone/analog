// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { closeTopOverlay } from '@/components/ui';
import { back, current, isTab, navigate } from './nav';

/**
 * The Android back button and Esc: close the newest sheet first, then walk the page stack, then return to Today.
 * False means there was nothing left to do (Android then minimises the app).
 */
export function handleBack(): boolean {
  if (closeTopOverlay()) return true;
  if (back()) return true;
  const r = current();
  if (isTab(r) && r.name !== 'today') {
    navigate({ name: 'today' });
    return true;
  }
  return false;
}
