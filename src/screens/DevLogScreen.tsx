// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { RELEASES_URL } from '@/config';
import { patchSettings, useSettings } from '@/db/settings';
import { compareVersions, formatDay, type CheckOutcome } from '@/features/devlog/logic';
import { RELEASES, type NoteTag, type Release } from '@/features/devlog/releases';
import { appVersion, runUpdateCheck } from '@/features/devlog/store';
import { openLink } from '@/platform';
import { SupportButton } from '@/components/SupportButton';
import { PlateRing } from '@/components/PlateRing';
import { ChoiceRow, cx, Pad, Screen, Section, Toggle } from '@/components/ui';

// The dev log: a card that says which version you're on, then one ruled notebook page per release.

const STATUS: Partial<Record<CheckOutcome, string>> = {
  current: 'You have the latest version.',
  none: 'No releases on GitHub yet.',
  failed: 'Couldn’t reach GitHub. Try again later.',
};

/** New / Better / Fixed: a light wash behind the plate's text colour. */
const TAGS: Record<NoteTag, { label: string; cls: string }> = {
  new: { label: 'New', cls: 'bg-yellow-ring/20 text-yellow-text' },
  better: { label: 'Better', cls: 'bg-blue-ring/20 text-blue-text' },
  fixed: { label: 'Fixed', cls: 'bg-green-ring/20 text-green-text' },
};

function Pill({ label, cls }: { label: string; cls: string }) {
  return <span className={cx('t-label mt-[5px] inline-flex h-[22px] shrink-0 items-center self-start rounded-full px-2.5 text-[12px] leading-4', cls)}>{label}</span>;
}

export function DevLogScreen({ whatsNew = false }: { whatsNew?: boolean }) {
  const s = useSettings();
  const current = appVersion();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const latest = s.latestRelease && compareVersions(s.latestRelease.version, current) > 0 ? s.latestRelease : null;
  const checked = s.updateCheckedAt ? `Last checked ${formatDay(new Date(s.updateCheckedAt).toISOString().slice(0, 10))}.` : 'Not checked yet.';

  const check = async () => {
    setBusy(true);
    setStatus(null);
    const outcome = await runUpdateCheck(true);
    setBusy(false);
    setStatus(STATUS[outcome] ?? null);
  };

  return (
    <Screen title={whatsNew ? `What’s new in Analog ${current}` : 'Dev log'} backButton>
      <Pad className="pt-2">
        <VersionCard
          title={latest ? `Analog ${latest.version} is out.` : `You’re on ${current}.`}
          line={latest ? `You’re on ${current}${latest.date ? ` · released ${formatDay(latest.date)}` : ''}.` : (status ?? checked)}
          action={
            latest ? (
              <button type="button" className="btn-primary btn-compact" onClick={() => void openLink(latest.url)}>
                Get it
              </button>
            ) : (
              <button type="button" className="btn-secondary btn-compact" disabled={busy} onClick={() => void check()}>
                <RefreshCw size={16} strokeWidth={1.75} className={cx(busy && 'animate-spin')} /> {busy ? 'Checking…' : 'Check'}
              </button>
            )
          }
        >
          {latest?.notes ? <p className="select-text whitespace-pre-line pt-3 text-ink2">{latest.notes}</p> : null}
        </VersionCard>
      </Pad>

      {RELEASES.map((r) => (
        <Pad key={r.version} className="pt-4">
          <ReleasePage release={r} installed={r.version === current} />
        </Pad>
      ))}

      <Section title="UPDATES">
        <ChoiceRow label="Check once a day" hint="asks GitHub for the newest version; sends nothing about you">
          <Toggle label="Check once a day" checked={s.checkUpdates} onChange={(v) => void patchSettings({ checkUpdates: v })} />
        </ChoiceRow>
        <Pad className="pt-2">
          <button type="button" className="btn-ghost" onClick={() => void openLink(RELEASES_URL)}>
            All releases on GitHub
          </button>
        </Pad>
      </Section>

      <Pad className="pb-4 pt-4">
        <SupportButton />
      </Pad>
    </Screen>
  );
}

function VersionCard({ title, line, action, children }: { title: string; line: string; action: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-sheet border border-rule bg-raised p-4">
      <div className="flex flex-wrap items-center gap-3.5">
        <PlateRing color="red" state="done" size={44} stroke={9} />
        <div className="flex min-w-[140px] flex-1 flex-col gap-0.5">
          <h2 className="t-title-m">{title}</h2>
          <p className="t-hint" aria-live="polite">
            {line}
          </p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/** One release on a ruled page: the red margin line, then every line of writing sitting on a 32 px rule. */
function ReleasePage({ release: r, installed }: { release: Release; installed: boolean }) {
  return (
    <article
      aria-label={`Version ${r.version}${installed ? ', installed' : ''}`}
      className="relative overflow-hidden rounded-sheet border border-rule bg-paper pb-8 pl-[38px] pr-margin pt-4 sm:pl-[58px]"
      style={{ backgroundImage: 'repeating-linear-gradient(180deg, transparent 0, transparent 31px, rgb(var(--rule)) 31px, rgb(var(--rule)) 32px)', backgroundPosition: '0 16px' }}
    >
      <span className="absolute inset-y-0 left-6 w-[1.5px] bg-red-ring/55 sm:left-11" aria-hidden />
      <div className="flex min-h-8 flex-wrap items-center gap-x-3">
        <h2 className="t-title-l leading-8 text-red-text">v{r.version}</h2>
        <span className="t-num-m leading-8 text-pencil">{r.date ? formatDay(r.date) : 'In development'}</span>
        {installed ? <Pill label="you are here" cls="bg-red-ring/20 text-red-text" /> : null}
      </div>
      <p className="t-title-m leading-8 text-ink2">{r.summary}</p>
      {r.notes.map((n) => (
        <div key={n.text} className="flex gap-2 sm:gap-3">
          <span className="w-[58px] shrink-0">
            <Pill {...TAGS[n.tag]} />
          </span>
          <p className="flex-1 leading-8">{n.text}</p>
        </div>
      ))}
    </article>
  );
}
