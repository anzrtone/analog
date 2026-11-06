// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useEffect, useMemo, useRef, useState } from 'react';
import { activeRun, deleteProgram, endRun, listPrograms, saveProgram, startRun, type ProgramRow, type RunRow } from '@/db/repos';
import { db } from '@/db/schema';
import { rirForWeek } from '@/engine/meso';
import { decodeProgram } from '@/engine/programs/share';
import { metaLine } from '@/engine/programs/resolve';
import { blankProgram, TEMPLATES } from '@/services/templates';
import { useData } from '@/features/data';
import { navigate, replace } from '@/features/nav';
import { importSharedProgram } from '@/features/programs';
import { ask } from '@/components/Dialog';
import { SwipeRow } from '@/components/SwipeRow';
import { EmptyState, MarginNote, Pad, RuledRow, Screen, Section } from '@/components/ui';

export function ProgramsScreen() {
  const run = useData((d) => activeRun(d), [], null as RunRow | null);
  const programs = useData((d) => listPrograms(d), [], [] as ProgramRow[]);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const block = run ? run.program.blocks[run.state.blockIndex] : undefined;
  const day = block?.days[run!.state.dayIndex];

  const openLink = async () => {
    const r = decodeProgram(link);
    if (!r.ok) return setLinkError(r.error);
    setLinkError(null);
    setLink('');
    navigate({ name: 'programImport', data: link });
  };

  return (
    <Screen title="Programs" meta="UNLIMITED · FREE · YOURS">
      {run && block && day ? (
        <Section title="RUNNING">
          <Pad className="flex flex-col gap-1">
            <p className="t-meta text-blue-text">{metaLine(day.name, run.state.weekIndex, block, block.adaptive ? rirForWeek(run.state.weekIndex + 1, block.weeks, run.state.weekIndex >= block.weeks) : null)}</p>
            <p className="t-title-m">{run.program.name}</p>
            <MarginNote>Next: {day.name}. Start it from the Log tab.</MarginNote>
          </Pad>
          <Pad className="flex gap-2 pt-3">
            <button type="button" className="btn-secondary flex-1" onClick={() => navigate({ name: 'program', id: run.programId })}>
              Open
            </button>
            <button
              type="button"
              className="btn-ghost flex-1"
              onClick={() =>
                ask('End this program?', 'Your history stays. Starting it again later picks up from your last weights.', [
                  { text: 'Keep going', style: 'cancel' },
                  { text: 'End it', onPress: () => void endRun(db, run.id) },
                ])
              }
            >
              End program
            </button>
          </Pad>
        </Section>
      ) : null}

      <Section title="YOUR PROGRAMS">
        {programs.length === 0 ? (
          <EmptyState line="No programs yet. Start from a template or build your own." />
        ) : (
          programs.map((p) => (
            <SwipeRow
              key={p.id}
              onSwipe={({ keep, remove }) =>
                ask(
                  `Delete ${p.name}?`,
                  run?.programId === p.id ? 'It is running, so this ends it too. Workouts you logged with it stay in your history.' : 'Workouts you logged with it stay in your history.',
                  [
                    { text: 'Keep', style: 'cancel', onPress: keep },
                    { text: 'Delete', style: 'destructive', onPress: () => remove(() => void deleteProgram(db, p.id)) },
                  ],
                )
              }
            >
              <div className="ruled-row" data-tour={`program-${p.id}`}>
                <button type="button" className="flex min-h-row min-w-0 flex-1 flex-col justify-center text-left" onClick={() => navigate({ name: 'program', id: p.id })}>
                  <span>{p.name}</span>
                  <span className="t-hint">
                    {p.data.blocks.map((b) => `${b.weeks}${b.deloadWeek ? '+1' : ''} wk${b.adaptive ? ', adaptive' : ''}`).join(' · ')} · {p.data.blocks[0]?.days.length ?? 0} days
                  </span>
                </button>
                {run?.programId === p.id ? (
                  <span className="text-blue-text">running</span>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary btn-compact"
                    onClick={() => {
                      void startRun(db, p.id);
                      navigate({ name: 'today' });
                    }}
                  >
                    Start
                  </button>
                )}
              </div>
            </SwipeRow>
          ))
        )}
        {programs.length ? (
          <Pad className="pt-2">
            <MarginNote>Swipe a program left to delete it.</MarginNote>
          </Pad>
        ) : null}
        <Pad className="pt-3" tour="programs-build">
          <button type="button" className={`${programs.length ? 'btn-secondary' : 'btn-primary'} w-full`} onClick={() => navigate({ name: 'program', id: 'new' })}>
            Build a program
          </button>
        </Pad>
      </Section>

      <Section title="STARTER TEMPLATES" tour="programs-templates">
        {TEMPLATES.map((t) => (
          <RuledRow
            key={t.key}
            label={t.name}
            onClick={async () => {
              const p = t.build();
              await saveProgram(db, p);
              navigate({ name: 'program', id: p.id });
            }}
          >
            <span className="flex-1">
              <span className="block">{t.name}</span>
              <MarginNote>{t.blurb}</MarginNote>
            </span>
          </RuledRow>
        ))}
      </Section>

      <Section title="OPEN A SHARED PROGRAM">
        <form
          className="flex flex-col gap-2 px-margin"
          onSubmit={(e) => {
            e.preventDefault();
            void openLink();
          }}
        >
          <input className="field" placeholder="Paste an analog://program link" value={link} onChange={(e) => setLink(e.target.value)} autoCapitalize="none" autoCorrect="off" aria-label="Program link" />
          {linkError ? <p className="text-red-text">{linkError}</p> : null}
          <button type="submit" className="btn-secondary">
            Open link
          </button>
        </form>
      </Section>
    </Screen>
  );
}

/**
 * Target of a shared link, opened from anywhere: any web page or app can send someone here. So it only shows what the
 * link holds. Nothing is saved until the person says so.
 */
export function ProgramImportScreen({ data }: { data: string }) {
  const r = useMemo(() => decodeProgram(data), [data]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!r.ok || error) {
    return (
      <Screen title="Shared program" backButton>
        <Pad>
          <p>{error ?? (r.ok ? '' : r.error)}</p>
        </Pad>
      </Screen>
    );
  }
  const { program, exercises } = r.payload;
  const days = program.blocks.flatMap((b) => b.days);
  const slots = days.reduce((n, d) => n + d.slots.length, 0);
  const add = async () => {
    setBusy(true);
    try {
      replace({ name: 'program', id: await importSharedProgram(db, r.payload) });
    } catch {
      setError('That program couldn’t be added. Ask for it to be shared again.');
    }
  };
  return (
    <Screen title="Shared program" backButton>
      <Pad className="flex flex-col gap-3">
        <h2 className="t-title-l break-words">{program.name || 'Untitled program'}</h2>
        <p className="text-ink2">
          {days.length} {days.length === 1 ? 'day' : 'days'}, {slots} {slots === 1 ? 'exercise' : 'exercises'}.
          {exercises.length ? ` Adds ${exercises.length} custom ${exercises.length === 1 ? 'exercise' : 'exercises'}: ${exercises.slice(0, 8).map((e) => e.name).join(', ')}${exercises.length > 8 ? '…' : ''}.` : ''}
        </p>
        <MarginNote>Someone shared this with you. It’s only added if you say so, as a new copy that changes nothing you already have.</MarginNote>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void add()}>
          Add this program
        </button>
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => replace({ name: 'programs' })}>
          Don’t add it
        </button>
      </Pad>
    </Screen>
  );
}

/** "Build a program": a blank program, made once, then its builder. */
export function NewProgramScreen() {
  const made = useRef(false);
  useEffect(() => {
    if (made.current) return;
    made.current = true;
    const p = blankProgram();
    void saveProgram(db, p).then(() => replace({ name: 'program', id: p.id }));
  }, []);
  return <div className="min-h-full" />;
}

