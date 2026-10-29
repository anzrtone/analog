// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
/**
 * Development fallback used by `npm run dev` in a desktop browser, so every screen can be checked there.
 * Not a shipped target: rest ends with the in-app ring and bell, exports download, notifications are stubs
 * that only log what the phone would show.
 */
import type { NativeTimerAction, Platform } from './types';

const log = (...a: unknown[]) => {
  if (import.meta.env.DEV) console.debug('[dev platform]', ...a);
};

function download(href: string, fileName: string) {
  const a = Object.assign(document.createElement('a'), { href, download: fileName });
  a.click();
}

export const dev: Platform = {
  kind: 'dev',
  storageLabel: 'this browser (development)',
  async init(h) {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) h.onResume();
    });
  },
  startRest: (endsAt, title, next) => log('rest until', new Date(endsAt).toLocaleTimeString(), title, next),
  adjustRest: (d) => log('rest adjust', d),
  cancelRest: () => log('rest cancelled'),
  showStopwatch: (startedAt, title) => log('stopwatch from', startedAt, title),
  cancelStopwatch: () => log('stopwatch cancelled'),
  showWorkout: (title, body) => log('workout note', title, body),
  cancelWorkout: () => log('workout note cleared'),
  async drainActions(): Promise<NativeTimerAction[]> {
    return [];
  },
  nativeRestAlarm: () => false,
  async requestNotificationPermission() {
    return true;
  },
  async canScheduleExactAlarms() {
    return true;
  },
  async openExactAlarmSettings() {},
  async keepAwake(on) {
    log('keep awake', on);
  },
  haptic: () => {},
  async openExternal(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  },
  async saveText(fileName, mime, contents) {
    const url = URL.createObjectURL(new Blob([contents], { type: mime }));
    download(url, fileName);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return fileName;
  },
  async saveImage(fileName, base64) {
    download(`data:image/png;base64,${base64}`, fileName);
    return fileName;
  },
  // A browser can't write into a folder, and this runs after every workout: a download each time would be worse
  // than nothing. Use Backup and export to test the file itself.
  async writeBackup(fileName) {
    log('automatic backup (not written in the browser)', fileName);
    return { path: fileName, pruned: 0 };
  },
  async backupFolder() {
    return 'nowhere (browser development build)';
  },
  async listBackups() {
    return [];
  },
  async readBackup() {
    throw new Error('The browser build keeps no automatic backups.');
  },
};
