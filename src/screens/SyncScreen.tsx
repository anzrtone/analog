// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useEffect, useRef, useState } from 'react';
import { RELAY_URL } from '@/config';
import { db } from '@/db/schema';
import { useSettings, type SyncMethod } from '@/db/settings';
import { platform } from '@/platform';
import type { CloudFolder } from '@/platform/types';
import { startTour } from '@/features/tour/store';
import { describeDeletes, FORGET_PUSH, formatSyncCode, generateSyncCode, mergeSyncFile, normalizeSyncCode, patchSync, previewSyncFile, saveSyncFile, stopAndDeleteFromServer, stopSyncing } from '@/sync';
import { appSyncDeps, syncNowInApp } from '@/sync/runtime';
import { ask } from '@/components/Dialog';
import { Field, MarginNote, Pad, Screen, Section, Segmented, ToggleRow } from '@/components/ui';

const MASKED = '••••• ••••• ••••• •••••';
const EXAMPLE = 'ABCDE-FGHJK-MNPQR-STVWX';
const REST_MS = 10_000;

function ago(ms: number, now = Date.now()): string {
  const m = Math.round((now - ms) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** Optional sync between your own devices. Off until you choose a way; nothing here runs, or is sent, before that. */
export function SyncScreen() {
  const all = useSettings();
  const s = all.sync;
  const p = platform();
  const [busy, setBusy] = useState(false);
  const [rested, setRested] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [joining, setJoining] = useState(false);
  const [shown, setShown] = useState(false);
  const [clouds, setClouds] = useState<CloudFolder[] | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const restTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const relayOk = RELAY_URL !== null;
  const foldersOk = p.syncFolderMode !== 'none';
  const methods: { value: SyncMethod; label: string }[] = [
    { value: 'off', label: 'Off' },
    ...(relayOk ? [{ value: 'relay' as const, label: 'Pairing code' }] : []),
    ...(foldersOk ? [{ value: 'folder' as const, label: 'Cloud folder' }] : []),
    { value: 'file', label: 'File' },
  ];

  useEffect(() => {
    if (s.method === 'folder' && p.syncFolderMode === 'pick') void p.cloudFolders().then(setClouds, () => setClouds([]));
  }, [s.method, p]);
  useEffect(() => () => void (restTimer.current && clearTimeout(restTimer.current)), []);
  // The first visit gets the tour, a moment after the page settles, and only once the welcome flow is done.
  const tourDue = all.onboarded && !all.toursSeen.includes('sync');
  useEffect(() => {
    if (!tourDue) return;
    const t = setTimeout(() => void startTour('sync'), 600);
    return () => clearTimeout(t);
  }, [tourDue]);

  const setMethod = (method: SyncMethod) => {
    setNote(null);
    void patchSync(db, { method, ...FORGET_PUSH, lastError: null });
  };

  const run = async (allowLargeDelete = false) => {
    setBusy(true);
    setNote(null);
    try {
      const r = await syncNowInApp({ allowLargeDelete });
      if (r.status === 'ok') {
        setRested(true);
        restTimer.current = setTimeout(() => setRested(false), REST_MS);
      } else if (r.status === 'skipped') {
        setNote(r.reason === 'busy' ? 'Already syncing.' : r.reason === 'no-code' ? 'Add a sync code first.' : r.reason === 'no-folder' ? 'Choose a folder first.' : 'Pick a way to sync first.');
      } else if (r.status === 'confirm-deletes') {
        ask('Remove this much?', `${describeDeletes(r.preview)} If you didn't delete these on another device, don't continue. Analog saves a backup first either way.`, [
          { text: 'Not now', style: 'cancel' },
          { text: 'Remove them', style: 'destructive', onPress: () => void run(true) },
        ]);
      }
    } finally {
      setBusy(false);
    }
  };

  /** A file can come from anywhere, so any removal it asks for is shown before it happens. */
  const mergeFile = async (text: string) => {
    const preview = await previewSyncFile(db, text);
    const go = () => mergeSyncFile({ db, platform: p }, text).then((r) => setNote(r.summary), (err: Error) => setNote(err.message));
    if (!preview.rows) return void (await go());
    ask('Remove this much?', `This file would remove ${preview.workouts} of your ${preview.totalWorkouts} workouts (${preview.rows} rows in all). If you didn't delete these on your other device, don't continue. Analog saves a backup first either way.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Merge and remove', style: 'destructive', onPress: () => void go() },
    ]);
  };

  const startFirstDevice = async () => {
    await patchSync(db, { method: 'relay', code: generateSyncCode(), ...FORGET_PUSH });
    setShown(true);
    await run();
  };

  const connect = async () => {
    const code = normalizeSyncCode(typed);
    if (!code) return setNote('That code should be 20 letters and numbers, like ABCDE-FGHJK-MNPQR-STVWX');
    setTyped('');
    setJoining(false);
    await patchSync(db, { method: 'relay', code, ...FORGET_PUSH });
    await run();
  };

  const copy = async () => {
    if (!s.code) return;
    try {
      await navigator.clipboard.writeText(formatSyncCode(s.code));
      setNote('Code copied. Paste it into the other device.');
    } catch {
      setShown(true);
      setNote('Couldn’t copy, so the code is showing. Type it into the other device.');
    }
  };

  const chooseFolder = async (parent?: string) => {
    try {
      const dir = await p.pickSyncFolder('Choose a folder your cloud app already syncs', parent);
      if (!dir) return;
      await patchSync(db, { method: 'folder', dir, ...FORGET_PUSH });
      await run();
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  };

  const stopped = () => {
    setNote(null);
    setShown(false);
    setJoining(false);
  };

  const deleteAndStop = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await stopAndDeleteFromServer(appSyncDeps());
      if (r.status === 'ok') {
        stopped();
        setNote('Stopped syncing and deleted your data from the server.');
      } else {
        setNote(r.status === 'busy' ? 'A sync is running. Try again in a moment.' : r.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const stop = () => {
    const leaveFolderFile = s.dir ? " This device's file stays in the folder; delete it there if you no longer want it." : '';
    ask(
      'Stop syncing on this device?',
      s.code
        ? 'Everything on this device stays either way. Only delete the server copy from your last paired device: any device still paired puts it back the next time it syncs. If you keep it, the server removes it after 60 days.' + leaveFolderFile
        : 'The other devices keep syncing with each other. Everything already here stays as it is.' + leaveFolderFile,
      [
        { text: 'Cancel', style: 'cancel' },
        ...(s.code ? [{ text: 'Stop and delete from server', style: 'destructive' as const, onPress: () => void deleteAndStop() }] : []),
        {
          text: s.code ? 'Stop, keep server copy' : 'Stop syncing',
          style: s.code ? 'default' : 'destructive',
          onPress: async () => {
            await stopSyncing(db);
            stopped();
          },
        },
      ],
    );
  };

  const ready = (s.method === 'relay' && !!s.code) || (s.method === 'folder' && !!s.dir);

  return (
    <Screen title="Sync between devices" backButton meta={s.method === 'off' ? 'OFF' : s.method.toUpperCase()}>
      <Pad className="flex flex-col gap-2">
        <button type="button" className="btn-ghost self-end" onClick={() => void startTour('sync')}>
          Re-tour
        </button>
        <p className="text-ink2">Everything stays on your devices unless you turn this on. Syncing just merges the copies on your own devices: new workouts, edits and deletions follow you both ways, and you never need an account.</p>
      </Pad>

      <Section title="WAY TO SYNC" tour="sync-method">
        <Pad className="flex flex-col gap-2">
          <Segmented label="Way to sync" value={s.method} onChange={setMethod} options={methods} />
          {s.method === 'off' ? <MarginNote>{relayOk ? 'Pick a way to sync above. Not sure which? Pairing code is the easiest.' : 'Pick a way to sync above. Cloud folder is the easiest where it is offered; File works everywhere.'}</MarginNote> : null}
          {s.method === 'relay' ? <MarginNote>Pair with a code. Your data is scrambled on this device before it leaves, so the server only holds something it cannot read.</MarginNote> : null}
          {s.method === 'folder' ? <MarginNote>No Analog server, but not encrypted: each device writes a readable copy of your log, including your name and body measurements, into a folder your own cloud app already syncs. Anyone who can open that folder can read it. To keep it encrypted, use a pairing code.</MarginNote> : null}
          {s.method === 'file' ? <MarginNote>Fully manual: save a file on one device, merge it on the other. The file is readable, not encrypted, so keep it somewhere you trust.</MarginNote> : null}
        </Pad>
      </Section>

      {s.method === 'relay' ? (
        <Section title="PAIRING CODE">
          <Pad className="flex flex-col gap-3">
            {s.code ? (
              <>
                <p className="t-num-m" aria-label="Your sync code">
                  {shown ? formatSyncCode(s.code) : MASKED}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary" onClick={() => setShown(!shown)}>
                    {shown ? 'Hide' : 'Show'}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => void copy()}>
                    Copy
                  </button>
                </div>
                <MarginNote>Keep this private; it unlocks your synced data.</MarginNote>
              </>
            ) : (
              <>
                <button type="button" className="btn-primary" onClick={() => void startFirstDevice()}>
                  This is my first device
                </button>
                <button type="button" className="btn-secondary" onClick={() => setJoining(!joining)}>
                  I have a code from another device
                </button>
                {joining ? (
                  <form
                    className="flex flex-col gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void connect();
                    }}
                  >
                    <Field label="Sync code" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={EXAMPLE} autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="off" />
                    <button type="submit" className="btn-primary">
                      Connect
                    </button>
                  </form>
                ) : null}
              </>
            )}
          </Pad>
        </Section>
      ) : null}

      {s.method === 'folder' ? (
        <Section title="FOLDER">
          <Pad className="flex flex-col gap-2">
            {p.syncFolderMode === 'fixed' ? (
              <>
                <p className="text-ink2">Analog keeps its sync file in Documents/Analog on this phone. Let your sync app (Syncthing, Drive, whichever you use) copy that folder, and nothing needs creating. Other apps with file access on this phone can read or change what's in it.</p>
                {!s.dir ? (
                  <button type="button" className="btn-primary" onClick={() => void chooseFolder()}>
                    Use Documents/Analog
                  </button>
                ) : null}
              </>
            ) : (
              <>
                {clouds && clouds.length > 0
                  ? clouds.map((c) => (
                      <button key={c.path} type="button" className={s.dir ? 'btn-secondary' : 'btn-primary'} onClick={() => void chooseFolder(c.path)}>
                        Use {c.label}
                      </button>
                    ))
                  : null}
                {clouds && clouds.length === 0 ? <p className="text-ink2">No cloud app found on this computer. Pick a folder you already sync another way, or use a pairing code instead.</p> : null}
                <button type="button" className="btn-secondary" onClick={() => void chooseFolder()}>
                  Use a different synced folder…
                </button>
                {!clouds || clouds.length === 0 ? (
                  relayOk ? (
                    <button type="button" className="btn-ghost self-start" onClick={() => setMethod('relay')}>
                      Use a pairing code instead
                    </button>
                  ) : null
                ) : (
                  <MarginNote>Analog makes an “Analog Sync” folder inside it, so you create nothing.</MarginNote>
                )}
              </>
            )}
            {s.dir ? (
              <div className="flex flex-col gap-2 pt-1">
                <p className="t-num-m break-all">{s.dir}</p>
                {p.syncFolderMode === 'pick' ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-ghost" onClick={() => void chooseFolder()}>
                      Change…
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => void p.revealFolder(s.dir!).catch(() => setNote("Couldn't open that folder."))}>
                      Open
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </Pad>
        </Section>
      ) : null}

      {s.method === 'file' ? (
        <Section title="SYNC FILE">
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              f.text()
                .then(mergeFile)
                .catch((err: Error) => setNote(err.message));
            }}
          />
          <Pad className="flex flex-col gap-2">
            <button type="button" className="btn-secondary" onClick={() => void saveSyncFile(appSyncDeps()).then((w) => w && setNote('Saved. Carry it to the other device and merge it there.'), (err: Error) => setNote(err.message))}>
              Save a sync file
            </button>
            <button type="button" className="btn-secondary" onClick={() => file.current?.click()}>
              Merge a sync file…
            </button>
            <MarginNote>Do it in both directions to bring the devices level. Merging the same file twice changes nothing.</MarginNote>
          </Pad>
        </Section>
      ) : null}

      {ready ? (
        <Section title="SYNC">
          <Pad className="flex flex-col gap-2">
            <button type="button" className="btn-primary" disabled={busy || rested} onClick={() => void run()}>
              {busy ? 'Syncing…' : rested ? 'Synced just now' : 'Sync now'}
            </button>
          </Pad>
          <ToggleRow label="Sync automatically" hint="When Analog opens, every so often, and when you put it away." checked={s.auto} onChange={(v) => void patchSync(db, { auto: v })} />
        </Section>
      ) : null}

      {note || s.lastError || s.lastAt ? (
        <Pad className="flex flex-col gap-1 pt-3" >
          <div aria-live="polite" className="flex flex-col gap-1">
            {note ? <p>{note}</p> : null}
            {s.lastError ? <p className="text-red-text">Last attempt failed: {s.lastError}</p> : s.lastAt ? <p className="text-ink2">Last synced {ago(s.lastAt)}. {s.lastSummary ?? ''}</p> : null}
          </div>
        </Pad>
      ) : null}

      {s.code || (s.method !== 'off' && (s.dir || s.lastAt)) ? (
        <Pad className="pt-4">
          <button type="button" className="btn-ghost" disabled={busy} onClick={stop}>
            Stop syncing on this device
          </button>
        </Pad>
      ) : null}
    </Screen>
  );
}
