// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
/**
 * Native bridge contract. The engine, database and UI are shared; each shell (Tauri desktop, Capacitor Android)
 * implements this interface for what a WebView can't do on its own: lock-screen timers, exact alarms, files,
 * haptics, sharing. The engine and UI never import Capacitor or Tauri directly; they call `platform()`.
 */

/** Buttons on the rest and stopwatch notifications, and the end-of-rest alarm, as the native side recorded them. */
export type TimerAction = 'minus15' | 'plus15' | 'skip' | 'stop' | 'restOver';

export interface NativeTimerAction {
  action: TimerAction;
  /** Epoch ms when it happened (the app may have been asleep). */
  at: number;
}

export interface PlatformHandlers {
  /** A notification button was pressed while the app was running. */
  onTimerAction(a: NativeTimerAction): void;
  /** The app came back to the foreground: replay what happened while it slept. */
  onResume(): void;
  /** Android hardware back. Return true if handled; otherwise the app is minimised. */
  onBack(): boolean;
  /** An analog://program?d=… link opened the app. */
  onDeepLink(url: string): void;
}

export type Haptic = 'light' | 'medium' | 'heavy' | 'selection' | 'success';

export interface BackupWriteResult {
  path: string;
  pruned: number;
}

export interface CloudFolder {
  /** "Dropbox", "OneDrive"… */
  label: string;
  path: string;
}

export interface SyncFile {
  name: string;
  text: string;
}

export interface Platform {
  kind: 'desktop' | 'android' | 'dev';
  /** Where the database lives, for the spine and About ("Saved to …"). */
  storageLabel: string;
  init(h: PlatformHandlers): Promise<void>;

  /* ---- rest timer and stopwatch (BRAND §7, SPEC §2) ---- */
  /** Rest started: a countdown on the lock screen and an alarm at `endsAt` (bell + two pulses when `sound`). */
  startRest(endsAt: number, title: string, next: string, sound: boolean): void;
  /** −15 / +15 from inside the app. */
  adjustRest(deltaMs: number): void;
  cancelRest(): void;
  /** AMTAP hold: a count-up from `startedAt` with a Stop button. */
  showStopwatch(startedAt: number, title: string, line: string): void;
  cancelStopwatch(): void;
  /** The quiet "workout in progress" note while a workout is open. */
  showWorkout(title: string, body: string): void;
  cancelWorkout(): void;
  /** Notification taps made while the app slept, oldest first. The native side already moved its own timer. */
  drainActions(): Promise<NativeTimerAction[]>;
  /** True when the OS rings the end of rest itself (so the app doesn't ring twice). */
  nativeRestAlarm(): boolean;
  requestNotificationPermission(): Promise<boolean>;
  /** Android 14+ can deny exact alarms; then the alert may be a little late. */
  canScheduleExactAlarms(): Promise<boolean>;
  openExactAlarmSettings(): Promise<void>;

  /* ---- device ---- */
  keepAwake(on: boolean): Promise<void>;
  haptic(kind: Haptic): void;
  openExternal(url: string): Promise<void>;

  /* ---- files ---- */
  /** Save an export (Save dialog on desktop, share sheet on Android, download in dev). Null when cancelled. */
  saveText(fileName: string, mime: string, contents: string): Promise<string | null>;
  /** Share or save a PNG (share cards), base64-encoded. */
  saveImage(fileName: string, base64: string): Promise<string | null>;
  /** Write one dated backup file into the app's own files and keep only the newest `keep`. */
  writeBackup(fileName: string, contents: string, keep: number): Promise<BackupWriteResult>;
  /** Human-readable folder the automatic backups go to. */
  backupFolder(): Promise<string>;
  /** The automatic backups on this device, newest first (file names). */
  listBackups(): Promise<string[]>;
  readBackup(fileName: string): Promise<string>;

  /* ---- folder sync (optional: a way to sync with no server, through a folder the person's own cloud app already syncs) ---- */
  /** 'pick': the person chooses a folder; 'fixed': one folder the shell owns (Android); 'none': no folders here. */
  syncFolderMode: 'pick' | 'fixed' | 'none';
  /** Pick a folder (or use `parent`, such as a detected cloud folder, without asking); the shell makes the `Analog Sync` folder inside it. Null when cancelled. */
  pickSyncFolder(title: string, parent?: string): Promise<string | null>;
  /** The fixed folder (`syncFolderMode: 'fixed'`): its path as shown to the person. */
  fixedSyncFolder(): Promise<string>;
  /** Installed cloud-storage folders (Dropbox, OneDrive, Google Drive, iCloud) the shell can find. */
  cloudFolders(): Promise<CloudFolder[]>;
  /** Every `analog-sync-*.json` in the folder except `skipName` (this device's own file, which is never read back). */
  readSyncFiles(dir: string, skipName: string): Promise<SyncFile[]>;
  /** Write this device's file into the folder, atomically. */
  writeSyncFile(dir: string, fileName: string, contents: string): Promise<void>;
  revealFolder(dir: string): Promise<void>;
}
