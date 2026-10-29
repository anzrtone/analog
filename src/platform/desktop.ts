// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
/**
 * Desktop shell (Tauri 2, Windows). Files go through Rust commands (src-tauri/src/files.rs) and the Save dialog;
 * the end of rest shows a desktop notification. The window never throttles its timers (tauri.conf.json), so a
 * timeout in the page is on time even when Analog is behind other windows.
 */
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { save } from '@tauri-apps/plugin-dialog';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { BackupWriteResult, Platform, PlatformHandlers } from './types';

let rest: { endsAt: number; title: string; next: string; timer: ReturnType<typeof setTimeout> | null } | null = null;

function scheduleRestAlert() {
  if (!rest) return;
  if (rest.timer) clearTimeout(rest.timer);
  const r = rest;
  r.timer = setTimeout(
    () => {
      // The in-app ring and bell cover a focused window; the notification is for when Analog is behind others.
      void getCurrentWindow()
        .isFocused()
        .then(async (focused) => {
          if (!focused && (await isPermissionGranted())) sendNotification({ title: 'Rest over', body: r.next || 'Time for the next set.' });
        })
        .catch(() => undefined);
      rest = null;
    },
    Math.max(0, r.endsAt - Date.now()),
  );
}

export const desktop: Platform = {
  kind: 'desktop',
  storageLabel: 'this computer',

  async init(h: PlatformHandlers) {
    const win = getCurrentWindow();
    await win.onFocusChanged(({ payload: focused }) => {
      if (focused) h.onResume();
    });
  },

  startRest(endsAt, title, next) {
    if (rest?.timer) clearTimeout(rest.timer);
    rest = { endsAt, title, next, timer: null };
    scheduleRestAlert();
  },
  adjustRest(deltaMs) {
    if (!rest) return;
    rest.endsAt = Math.max(Date.now(), rest.endsAt + deltaMs);
    scheduleRestAlert();
  },
  cancelRest() {
    if (rest?.timer) clearTimeout(rest.timer);
    rest = null;
  },
  showStopwatch() {},
  cancelStopwatch() {},
  showWorkout() {},
  cancelWorkout() {},
  async drainActions() {
    return [];
  },
  nativeRestAlarm: () => false,
  async requestNotificationPermission() {
    if (await isPermissionGranted()) return true;
    return (await requestPermission()) === 'granted';
  },
  async canScheduleExactAlarms() {
    return true;
  },
  async openExactAlarmSettings() {},

  async keepAwake() {
    /* a desktop screen is the user's to manage */
  },
  haptic() {
    /* no haptics on desktop */
  },
  async openExternal(url) {
    await openUrl(url);
  },

  async saveText(fileName, _mime, contents) {
    const ext = fileName.split('.').pop() ?? 'txt';
    const path = await save({ defaultPath: fileName, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (!path) return null;
    await invoke('write_text_file', { path, contents });
    return path;
  },
  async saveImage(fileName, base64) {
    const path = await save({ defaultPath: fileName, filters: [{ name: 'PNG image', extensions: ['png'] }] });
    if (!path) return null;
    await invoke('write_base64_file', { path, base64 });
    return path;
  },

  async writeBackup(fileName, contents, keep) {
    return invoke<BackupWriteResult>('backup_write', { fileName, contents, keep });
  },
  async backupFolder() {
    return invoke<string>('backup_dir');
  },
  async listBackups() {
    return invoke<string[]>('backup_list');
  },
  async readBackup(fileName) {
    return invoke<string>('backup_read', { fileName });
  },
};
