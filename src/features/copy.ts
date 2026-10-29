// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
// Shared UI copy (BRAND §2: short, specific, explains why, no shame, sentence case).

export const HEALTH_DISCLAIMER =
  'Analog is a training log, not medical advice. Check with a doctor before starting a new program, especially if you have an injury or health condition. Stop if something hurts.';

export const FREE_LINE = 'Analog is free software under the GNU AGPL-3.0. Suggest it on GitHub.';

export function backupReminder(days: number): string {
  return `It's been ${days} days since your last backup. Save a copy?`;
}
