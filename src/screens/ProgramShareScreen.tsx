// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useState } from 'react';
import { Share } from '@capacitor/share';
import { getProgram } from '@/db/repos';
import { programLink, type SharedExercise } from '@/engine/programs/share';
import type { Program } from '@/engine/programs/types';
import { useData } from '@/features/data';
import { navigate } from '@/features/nav';
import { sharedExercises } from '@/features/programs';
import { platform } from '@/platform';
import { MarginNote, Pad, Screen, Section } from '@/components/ui';
import { Qr, qrFits } from '@/components/Qr';

/** Android shares the link through the share sheet; Windows and the dev build copy it. */
async function shareText(message: string): Promise<string | null> {
  if (platform().kind === 'android') {
    await Share.share({ text: message });
    return null;
  }
  await navigator.clipboard.writeText(message);
  return 'Link copied. Paste it anywhere.';
}

/** No server: the whole program is compressed into the link and the QR code. */
export function ProgramShareScreen({ id }: { id: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const data = useData(
    async (d) => {
      const row = await getProgram(d, id);
      return row ? { program: row.data, exercises: await sharedExercises(d, row.data) } : null;
    },
    [id],
    undefined as { program: Program; exercises: SharedExercise[] } | null | undefined,
  );
  if (!data) return <div className="min-h-full" />;
  const app = programLink(data);
  const web = programLink(data, true);
  const name = data.program.name;
  return (
    <Screen title="Share program" backButton meta={name.toUpperCase()}>
      <Pad className="flex flex-col items-center gap-2 py-4">
        {qrFits(app) ? (
          <div className="rounded-control bg-paper p-1">
            <Qr data={app} size={240} color="rgb(var(--ink))" background="rgb(var(--paper))" />
          </div>
        ) : (
          <p className="text-ink2">This program is too big for one QR code. Share the link or the file instead.</p>
        )}
        <MarginNote className="text-center">Scan with a phone that has Analog. Imports as a copy; your history stays yours.</MarginNote>
      </Pad>
      <Section>
        <Pad className="flex flex-col gap-2">
          <button type="button" className="btn-primary" onClick={() => shareText(`${name}, made in Analog (free, open source): ${web}`).then(setStatus, () => setStatus("Couldn't share the link."))}>
            Share link
          </button>
          <button type="button" className="btn-secondary" onClick={() => void platform().saveText(`${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.analog.json`, 'application/json', JSON.stringify({ v: 1, ...data }))}>
            Share as a .json file
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate({ name: 'share', kind: 'program', id })}>
            Make a program card
          </button>
          {status ? <p className="text-ink2">{status}</p> : null}
        </Pad>
      </Section>
    </Screen>
  );
}
