// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useEffect, useRef, useState } from 'react';
import { checkBackup, exportAll, exportRows, restoreAll } from '@/db/backup';
import { db } from '@/db/schema';
import { patchSettings, useSettings } from '@/db/settings';
import { exportCsv } from '@/engine/export/csv';
import { platform } from '@/platform';
import { ask } from '@/components/Dialog';
import { MarginNote, Pad, RuledRow, Screen, Section } from '@/components/ui';

const stamp = () => new Date().toISOString().slice(0, 10);
const day = (name: string) => /(\d{4}-\d{2}-\d{2})/.exec(name)?.[1] ?? name;

/** Ask, then replace everything with the backup in `text`. */
function confirmRestore(text: string, done: (msg: string) => void) {
  const check = checkBackup(text);
  if (!check.ok) return done(check.error);
  const c = check.counts;
  ask(
    'Replace everything with this backup?',
    `It has ${c.workouts ?? 0} workouts and ${c.workoutSets ?? 0} sets from ${new Date(check.file.exportedAt).toLocaleDateString()}. What's on this device now will be replaced. Make a backup first if you're not sure.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Replace',
        style: 'destructive',
        onPress: async () => {
          await restoreAll(db, check.file);
          done('Restored.');
        },
      },
    ],
  );
}

/** Your data is yours: full JSON, CSV for spreadsheets and other apps, and restore (also from a 0.1.0 backup). */
export function BackupScreen() {
  const s = useSettings();
  const [msg, setMsg] = useState<string | null>(null);
  const [autos, setAutos] = useState<string[]>([]);
  const [folder, setFolder] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const p = platform();
  useEffect(() => {
    void p.listBackups().then(setAutos);
    void p.backupFolder().then(setFolder);
  }, [p]);

  const exportJson = async () => {
    const where = await p.saveText(`analog-backup-${stamp()}.json`, 'application/json', JSON.stringify(await exportAll(db)));
    if (!where) return;
    await patchSettings({ lastBackupAt: Date.now() });
    setMsg('Backup made. Keep it somewhere that isn’t this device: Drive, email, a computer.');
  };

  const exportSetsCsv = async () => {
    const rows = await exportRows(db);
    const where = await p.saveText(`analog-sets-${stamp()}.csv`, 'text/csv', exportCsv(rows, s.unit));
    if (where) setMsg(`${rows.length} sets exported. The first columns match Strong's layout.`);
  };

  const fail = (e: Error) => setMsg(e.message);
  return (
    <Screen title="Backup and export" backButton meta={s.lastBackupAt ? `LAST BACKUP ${new Date(s.lastBackupAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}` : 'NO MANUAL BACKUP YET'}>
      <Pad className="flex flex-col gap-2">
        <p className="text-ink2">
          Analog also keeps a full copy after every workout, the last seven of them{p.kind === 'android' ? ', and Android carries those to a new phone with its own device backup' : ''}. These files are for when you want a copy you control.
        </p>
        {msg ? <p aria-live="polite">{msg}</p> : null}
      </Pad>
      <Section title="EXPORT">
        <Pad className="flex flex-col gap-2">
          <button type="button" className="btn-primary" onClick={() => exportJson().catch(fail)}>
            Full backup (.json)
          </button>
          <MarginNote>Everything: workouts, programs, exercises, settings. Restores into Analog 0.1.0 or 0.2.0.</MarginNote>
          <button type="button" className="btn-secondary" onClick={() => exportSetsCsv().catch(fail)}>
            All sets as CSV
          </button>
          <MarginNote>One row per set, for spreadsheets and other apps.</MarginNote>
        </Pad>
      </Section>
      <Section title="RESTORE">
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) f.text().then((t) => confirmRestore(t, setMsg), fail);
          }}
        />
        <Pad className="flex flex-col gap-2">
          <button type="button" className="btn-secondary" onClick={() => file.current?.click()}>
            Restore from a backup file
          </button>
          <MarginNote>Backups from Analog 0.1.0 restore as they are. Progress photos aren’t inside backups; they stay on this device.</MarginNote>
        </Pad>
      </Section>
      <Section title="AUTOMATIC BACKUPS">
        {autos.length === 0 ? (
          <Pad>
            <p className="text-pencil">None yet. One is made after your next finished workout.</p>
          </Pad>
        ) : (
          autos.map((name) => (
            <RuledRow key={name} label={`Restore the backup from ${day(name)}`} onClick={() => p.readBackup(name).then((t) => confirmRestore(t, setMsg), fail)}>
              <span className="t-num-m flex-1">{day(name)}</span>
              <span className="text-pencil">Restore</span>
            </RuledRow>
          ))
        )}
        <Pad className="pt-2">
          <MarginNote>Kept in {folder}.</MarginNote>
        </Pad>
      </Section>
    </Screen>
  );
}
