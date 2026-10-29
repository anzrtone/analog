// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
/** JS side of RestTimerPlugin.java: the lock-screen rest countdown, the AMTAP stopwatch and the workout note. */
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { NativeTimerAction } from './types';

export interface RestTimerPlugin {
  startRest(o: { endsAt: number; title: string; next: string; sound: boolean }): Promise<void>;
  adjustRest(o: { deltaMs: number }): Promise<void>;
  cancelRest(): Promise<void>;
  showStopwatch(o: { startedAt: number; title: string; line: string }): Promise<void>;
  cancelStopwatch(): Promise<void>;
  showWorkout(o: { title: string; body: string }): Promise<void>;
  cancelWorkout(): Promise<void>;
  drainActions(): Promise<{ actions: NativeTimerAction[] }>;
  canScheduleExactAlarms(): Promise<{ value: boolean }>;
  openExactAlarmSettings(): Promise<void>;
  keepAwake(o: { on: boolean }): Promise<void>;
  addListener(event: 'timerAction', cb: (e: NativeTimerAction) => void): Promise<PluginListenerHandle>;
}

export const RestTimer = registerPlugin<RestTimerPlugin>('RestTimer');
