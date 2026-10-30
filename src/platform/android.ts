// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
/**
 * Android shell (Capacitor). A WebView can't keep time once the phone sleeps, so the rest countdown, its −15/+15/Skip
 * buttons, the end-of-rest exact alarm (bell + two pulses), the AMTAP stopwatch and the workout note all live in
 * RestTimerPlugin.java and run without any JavaScript. Taps made while the app slept are queued natively and
 * replayed on resume (`drainActions`).
 */
import { App } from '@capacitor/app';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';
import { RestTimer } from './restTimer';
import type { Haptic, Platform, PlatformHandlers, SyncFile } from './types';

/** Automatic backups: the app's own files (Android Auto Backup carries them to a new phone with the rest). */
const BACKUP_DIR = 'backups';
const SYNC_DIR = 'Analog';
const quiet = (p: Promise<unknown>) => void p.catch((err) => console.warn('[android]', err));

export const android: Platform = {
  kind: 'android',
  storageLabel: 'this phone',

  async init(h: PlatformHandlers) {
    try {
      await RestTimer.addListener('timerAction', (e) => h.onTimerAction(e));
    } catch (err) {
      console.warn('[android] rest timer plugin unavailable', err);
    }
    await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) h.onResume();
    });
    await App.addListener('backButton', () => {
      if (!h.onBack()) void App.minimizeApp();
    });
    // analog://program?d=… opens the app (intent filter in AndroidManifest.xml).
    await App.addListener('appUrlOpen', ({ url }) => h.onDeepLink(url));
    const launch = await App.getLaunchUrl();
    if (launch?.url) h.onDeepLink(launch.url);
  },

  startRest: (endsAt, title, next, sound) => quiet(RestTimer.startRest({ endsAt, title, next, sound })),
  adjustRest: (deltaMs) => quiet(RestTimer.adjustRest({ deltaMs })),
  cancelRest: () => quiet(RestTimer.cancelRest()),
  showStopwatch: (startedAt, title, line) => quiet(RestTimer.showStopwatch({ startedAt, title, line })),
  cancelStopwatch: () => quiet(RestTimer.cancelStopwatch()),
  showWorkout: (title, body) => quiet(RestTimer.showWorkout({ title, body })),
  cancelWorkout: () => quiet(RestTimer.cancelWorkout()),
  async drainActions() {
    try {
      return (await RestTimer.drainActions()).actions;
    } catch {
      return [];
    }
  },
  nativeRestAlarm: () => true,

  /** Asked when the first workout starts, never at launch. */
  async requestNotificationPermission() {
    const cur = await LocalNotifications.checkPermissions();
    if (cur.display === 'granted') return true;
    return (await LocalNotifications.requestPermissions()).display === 'granted';
  },
  async canScheduleExactAlarms() {
    try {
      return (await RestTimer.canScheduleExactAlarms()).value;
    } catch {
      return true;
    }
  },
  async openExactAlarmSettings() {
    await RestTimer.openExactAlarmSettings();
  },

  async keepAwake(on) {
    await RestTimer.keepAwake({ on }).catch(() => undefined);
  },
  haptic(kind: Haptic) {
    if (kind === 'selection') void Haptics.selectionChanged().catch(() => undefined);
    else if (kind === 'success') void Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
    else void Haptics.impact({ style: kind === 'light' ? ImpactStyle.Light : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Heavy }).catch(() => undefined);
  },
  async openExternal(url) {
    window.open(url, '_system');
  },

  async saveText(fileName, _mime, contents) {
    const res = await Filesystem.writeFile({ path: fileName, data: contents, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: fileName, dialogTitle: 'Save your Analog data', files: [res.uri] });
    return res.uri;
  },
  async saveImage(fileName, base64) {
    const res = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
    await Share.share({ title: fileName, dialogTitle: 'Share', files: [res.uri] });
    return res.uri;
  },

  /** Atomic: a temp file renamed over the day's file, then the oldest beyond `keep` are deleted. */
  async writeBackup(fileName, contents, keep) {
    const tmp = `${BACKUP_DIR}/.${fileName}.tmp`;
    const final = `${BACKUP_DIR}/${fileName}`;
    await Filesystem.writeFile({ path: tmp, data: contents, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
    await Filesystem.deleteFile({ path: final, directory: Directory.Data }).catch(() => undefined);
    await Filesystem.rename({ from: tmp, to: final, directory: Directory.Data, toDirectory: Directory.Data });
    const ours = await android.listBackups();
    const old = ours.slice(Math.max(1, keep));
    for (const name of old) await Filesystem.deleteFile({ path: `${BACKUP_DIR}/${name}`, directory: Directory.Data });
    return { path: final, pruned: old.length };
  },
  async backupFolder() {
    return "Analog's own files on this phone (included in Android's device backup)";
  },
  async listBackups() {
    try {
      const { files } = await Filesystem.readdir({ path: BACKUP_DIR, directory: Directory.Data });
      return files
        .map((f) => f.name)
        .filter((n) => /^analog-backup-.*\.json$/.test(n))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  },
  async readBackup(fileName) {
    const r = await Filesystem.readFile({ path: `${BACKUP_DIR}/${fileName}`, directory: Directory.Data, encoding: Encoding.UTF8 });
    return typeof r.data === 'string' ? r.data : await r.data.text();
  },

  /** One folder, `Documents/Analog`: the person lets their sync app (Syncthing, Drive…) copy it. Nothing to create. */
  syncFolderMode: 'fixed',
  async pickSyncFolder() {
    return SYNC_DIR;
  },
  async fixedSyncFolder() {
    return `Documents/${SYNC_DIR}`;
  },
  async cloudFolders() {
    return [];
  },
  async readSyncFiles(_dir, skipName) {
    let names: string[];
    try {
      names = (await Filesystem.readdir({ path: SYNC_DIR, directory: Directory.Documents })).files.map((f) => f.name);
    } catch {
      return [];
    }
    const out: SyncFile[] = [];
    for (const name of names.filter((n) => /^analog-sync-[\w-]+\.json$/.test(n) && n !== skipName)) {
      const r = await Filesystem.readFile({ path: `${SYNC_DIR}/${name}`, directory: Directory.Documents, encoding: Encoding.UTF8 });
      out.push({ name, text: typeof r.data === 'string' ? r.data : await r.data.text() });
    }
    return out;
  },
  async writeSyncFile(_dir, fileName, contents) {
    await Filesystem.writeFile({ path: `${SYNC_DIR}/${fileName}`, data: contents, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
  },
  async revealFolder() {},
};
