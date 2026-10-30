// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useState } from 'react';
import { ISSUES_URL, REPO_URL } from '@/config';
import type { WorkoutSet } from '@/db/workouts';
import { PICKER_ORDER, setTypeInfo } from '@/engine/setTypes';
import { dataCounts, loadDemo, resetAll } from '@/dev/admin';
import { FREE_LINE, HEALTH_DISCLAIMER } from '@/features/copy';
import { useData } from '@/features/data';
import { appVersion } from '@/features/devlog/store';
import { navigate, type Route } from '@/features/nav';
import { startOnboardingIfNeeded } from '@/features/onboarding/store';
import { rest, restTimer } from '@/features/workout/timers';
import { openLink, platform } from '@/platform';
import { carbon, paper, type Palette } from '@/theme/tokens';
import { contrastRatio } from '@/theme/contrast';
import { Stamp, Wordmark } from '@/components/Brand';
import { ask } from '@/components/Dialog';
import { FeedbackCard } from '@/components/Feedback';
import { Heatmap } from '@/components/Heatmap';
import { PlateRing, SetTypeRing } from '@/components/PlateRing';
import { RestTimer } from '@/components/RestTimer';
import { SetRow } from '@/components/SetRow';
import { MarginNote, Pad, RuledRow, Screen, Section, Segmented } from '@/components/ui';

const row = (title: string, to: Route, hint?: string) => ({ title, to, hint });

const GROUPS = [
  { title: 'TRAINING', rows: [row('Exercise library', { name: 'exercises' }, 'search, edit, hide, add your own'), row('Gyms and plates', { name: 'gyms' }, 'plate calculator, bars, dumbbells'), row('Bodyweight and measurements', { name: 'measurements' })] },
  { title: 'YOUR DATA', rows: [row('Import from Strong or Hevy', { name: 'import' }, 'CSV'), row('Backup and export', { name: 'backup' }, 'JSON, CSV, restore')] },
  { title: 'APP', rows: [row('Settings', { name: 'settings' }), row('About Analog', { name: 'about' }), row('Dev log', { name: 'devlog' }, 'what changed in each release')] },
];

// Development builds get an extra group; release builds never see it.
const ALL_GROUPS = __DEV_BUILD__ ? [...GROUPS, { title: 'DEVELOPER', rows: [row('Admin console', { name: 'admin' }, 'load demo history, start over'), row('Kitchen sink', { name: 'kitchen' }, 'every component, both themes')] }] : GROUPS;

export function MoreScreen() {
  return (
    <Screen title="More">
      {ALL_GROUPS.map((g) => (
        <Section key={g.title} title={g.title}>
          {g.rows.map((r) => (
            <RuledRow key={r.title} onClick={() => navigate(r.to)} label={r.title}>
              <span className="flex-1">{r.title}</span>
              {r.hint ? <span className="t-hint text-right">{r.hint}</span> : null}
            </RuledRow>
          ))}
        </Section>
      ))}
    </Screen>
  );
}

export function AboutScreen() {
  return (
    <Screen title="About" backButton meta={`VERSION ${appVersion()}`}>
      <Pad className="flex flex-col gap-3">
        <Wordmark size={34} />
        <p className="t-title-m">The training log you own.</p>
        <p className="text-ink2">Free, open source and offline. No account, no servers, no ads, no tracking, nothing paywalled. Your data stays on this device.</p>
        <p className="text-ink2">The only thing it ever asks the internet is GitHub’s newest version number, and only when you tap Check in the dev log or turn on the daily check.</p>
        <button type="button" className="btn-ghost self-start" onClick={() => navigate({ name: 'devlog' })}>
          Dev log: what changed in each release
        </button>
      </Pad>
      <Section title="HEALTH">
        <Pad>
          <p className="text-ink2">{HEALTH_DISCLAIMER}</p>
        </Pad>
      </Section>
      <Section title="OPEN SOURCE">
        <Pad className="flex flex-col gap-2">
          <p className="text-ink2">{FREE_LINE}</p>
          <button type="button" className="btn-secondary" onClick={() => void openLink(REPO_URL)}>
            Source code (AGPL-3.0)
          </button>
          <button type="button" className="btn-ghost" onClick={() => void openLink(ISSUES_URL)}>
            Suggest a feature or report a bug
          </button>
          <MarginNote>Exercise library: free-exercise-db (Unlicense). Fonts: Newsreader, IBM Plex Mono and Inter (SIL Open Font License). Icons: Lucide (ISC). Muscle map: react-native-body-highlighter artwork by ELABBASSI Hicham (MIT).</MarginNote>
          <MarginNote>Adaptive volume uses Analog’s own published rules: feedback scores, MEV/MRV clamps, and the reason behind every change, shown in the app.</MarginNote>
          <MarginNote>Saved to {platform().storageLabel}.</MarginNote>
        </Pad>
      </Section>
    </Screen>
  );
}

/** Development builds only (More → Admin console). */
export function AdminScreen() {
  const counts = useData((d) => dataCounts(d), [], { workouts: 0, sets: 0, programs: 0, prs: 0 });
  const [busy, setBusy] = useState(false);
  if (!__DEV_BUILD__) return null;
  const run = async (fn: () => Promise<void>, then: () => void) => {
    setBusy(true);
    try {
      await fn();
      then();
    } catch (e) {
      ask('Failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen title="Admin console" backButton meta="DEV BUILD ONLY">
      <Section title="NOW IN THE DATABASE">
        <Pad>
          <p>
            {counts.workouts} workouts · {counts.sets} sets · {counts.programs} programs · {counts.prs} PRs
          </p>
        </Pad>
      </Section>
      <Section title="LOAD DEMO HISTORY">
        <Pad className="flex flex-col gap-2">
          <p className="text-ink2">A lifter four months in: three programs run through the real engine (beginner linear, a full hypertrophy meso with feedback and report, a powerbuilding run in progress), freestyle sessions covering every set type, PRs, measurements, gyms. Replaces current data.</p>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() =>
              ask('Replace all data with demo history?', 'Everything currently in the app is erased first.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Load demo', onPress: () => void run(() => loadDemo(), () => navigate({ name: 'today' })) },
              ])
            }
          >
            {busy ? 'Working…' : 'Load demo history'}
          </button>
        </Pad>
      </Section>
      <Section title="START OVER">
        <Pad className="flex flex-col gap-2">
          <p className="text-ink2">Erases workouts, programs, gyms, measurements, custom exercises and settings, then opens the welcome questions as on a fresh install.</p>
          <button
            type="button"
            className="btn-danger"
            disabled={busy}
            onClick={() =>
              ask('Erase everything?', 'This cannot be undone.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Erase',
                  style: 'destructive',
                  onPress: () =>
                    void run(
                      () => resetAll(),
                      () => {
                        navigate({ name: 'today' });
                        void startOnboardingIfNeeded();
                      },
                    ),
                },
              ])
            }
          >
            Start over from the beginning
          </button>
        </Pad>
      </Section>
      <Pad>
        <MarginNote>This screen and the kitchen sink only exist in development builds: release builds leave out the rows in More and these pages.</MarginNote>
      </Pad>
    </Screen>
  );
}

const fakeSet = (over: Partial<WorkoutSet>): WorkoutSet => ({
  id: Math.random().toString(36),
  workoutId: 'w',
  workoutExerciseId: 'we',
  exerciseId: 'e',
  order: 0,
  type: 'working',
  weightG: null,
  reps: null,
  rir: null,
  rpe: null,
  partials: null,
  forced: null,
  tempo: null,
  side: null,
  timeMs: null,
  distanceM: null,
  band: null,
  restMs: null,
  pain: null,
  note: null,
  segments: [],
  parentSetId: null,
  targetWeightG: 82500,
  targetReps: 8,
  targetRepsMax: null,
  targetRir: 2,
  targetTimeMs: null,
  completedAt: null,
  ...over,
});

function Swatches({ p }: { p: Palette }) {
  const bgs = [p.paper, p.paperRaised, p.paperSunk];
  const worst = (fg: string) => Math.min(...bgs.map((b) => contrastRatio(fg, b))).toFixed(2);
  return (
    <div className="flex flex-col gap-1">
      {(['ink', 'ink2', 'pencil', 'erased'] as const).map((k) => (
        <p key={k} className="t-num-m" style={{ color: p[k] }}>
          {k} {worst(p[k])}:1
        </p>
      ))}
      {(Object.keys(p.plate) as (keyof Palette['plate'])[]).map((k) => (
        <p key={k} className="flex items-center gap-2">
          <span className="h-[18px] w-[18px] rounded-full border-[3px]" style={{ borderColor: p.plate[k].ring }} />
          <span className="t-num-m" style={{ color: p.plate[k].text }}>
            {k} text {worst(p.plate[k].text)}:1 · ring {worst(p.plate[k].ring)}:1
          </span>
        </p>
      ))}
    </div>
  );
}

const noop = () => {};

/** Every design-system piece in both themes (debug screen, development builds only). */
export function KitchenSinkScreen() {
  const [theme, setTheme] = useState<'carbon' | 'paper'>('carbon');
  const resting = rest.use((r) => r.rest);
  if (!__DEV_BUILD__) return null;
  return (
    <Screen title="Kitchen sink" backButton meta="DESIGN SYSTEM · BRAND.MD">
      <Pad>
        <Segmented label="Theme" value={theme} onChange={setTheme} options={[{ value: 'carbon', label: 'Carbon' }, { value: 'paper', label: 'Paper' }]} />
      </Pad>
      <div data-theme={theme} className="mt-3 bg-paper pb-6 text-ink">
        <Pad className="flex flex-col gap-2 pt-3">
          <Wordmark size={28} />
          <p className="t-display">32.5</p>
          <p className="t-title-l">Title L · Push A</p>
          <p className="t-title-m">Title M · Incline DB press</p>
          <p className="t-num-l">82.5 × 8</p>
          <p className="t-num-m">82.5 × 8 @ 2 RIR</p>
          <p>Body · Plain lifter language, always says why.</p>
          <p className="t-label">Label · Finish workout</p>
          <p className="t-meta text-pencil">PUSH A — W3/5 — 1 RIR</p>
        </Pad>
        <Section title="CONTRAST (WORST CASE ACROSS PAPER, RAISED, SUNK)">
          <Pad>
            <Swatches p={theme === 'carbon' ? carbon : paper} />
          </Pad>
        </Section>
        <Section title="SET TYPES · DASHED = UPCOMING, SOLID = DONE">
          <Pad className="flex flex-wrap gap-2.5">
            {PICKER_ORDER.map((t, i) => (
              <div key={t} className="flex w-16 flex-col items-center gap-1">
                <span className="flex gap-0.5">
                  <SetTypeRing type={t} index={i} state="pending" />
                  <SetTypeRing type={t} index={i} state="done" />
                </span>
                <span className="t-hint text-center text-[10px] leading-3">{setTypeInfo(t).label}</span>
              </div>
            ))}
            <div className="flex w-16 flex-col items-center gap-1">
              <PlateRing color="red" state="progress" progress={0.5} glyph="stopwatch" />
              <span className="t-hint text-[10px] leading-3">half (running)</span>
            </div>
          </Pad>
        </Section>
        <Section title="SET ROWS">
          <SetRow set={fakeSet({})} index={0} unit="kg" effort="rir" mode="weightReps" isNext prev={fakeSet({ weightG: 80000, reps: 8 })} onEdit={noop} onToggle={noop} onRing={noop} onMore={noop} />
          <SetRow set={fakeSet({ type: 'top', weightG: 100000, reps: 5, rir: 1, completedAt: 1 })} index={0} unit="kg" effort="rir" mode="weightReps" isNext={false} onEdit={noop} onToggle={noop} onRing={noop} onMore={noop} />
          <SetRow set={fakeSet({ type: 'backoff', targetWeightG: 87500 })} index={1} linked unit="kg" effort="rir" mode="weightReps" isNext={false} onEdit={noop} onToggle={noop} onRing={noop} onMore={noop} />
          <SetRow set={fakeSet({ type: 'drop', weightG: 30000, reps: 10, completedAt: 1, segments: [{ weightG: 22500, reps: 8, restMs: 0 }, { weightG: 17500, reps: 6, restMs: 0 }] })} index={2} unit="kg" effort="rir" mode="weightReps" isNext={false} onEdit={noop} onToggle={noop} onRing={noop} onMore={noop} />
          <SetRow set={fakeSet({ type: 'amtap', targetWeightG: null, targetReps: null, targetTimeMs: 75000 })} index={3} unit="kg" effort="rir" mode="time" isNext={false} onEdit={noop} onToggle={noop} onRing={noop} onMore={noop} />
        </Section>
        <Section title="MUSCLE HEATMAP">
          <Heatmap sets={{ chest: 12, frontDelts: 6, sideDelts: 8, biceps: 4, abs: 2, quads: 16, rearDelts: 5, traps: 9, upperBack: 20, triceps: 7, glutes: 11, hamstrings: 3, calves: 1 }} />
        </Section>
        <Section title="STAMPS">
          <Pad className="flex flex-wrap gap-3">
            <Stamp kind="PR" />
            <Stamp kind="DELOAD" />
            <Stamp kind="MESO DONE" />
            <Stamp kind="NEW MAX VOLUME" />
            <Stamp kind="FAILED" />
          </Pad>
        </Section>
        <Section title="REST TIMER">
          <Pad className="flex flex-col gap-2 pb-2">
            <button type="button" className="btn-secondary" onClick={() => (resting ? restTimer.skip() : restTimer.start(20000, 'next 27.5 × 10'))}>
              {resting ? 'Stop demo timer' : 'Start a 20 s demo rest'}
            </button>
            <RestTimer />
          </Pad>
        </Section>
        <Section title="BUTTONS">
          <Pad className="flex flex-col gap-2">
            <button type="button" className="btn-primary">
              Finish workout
            </button>
            <button type="button" className="btn-secondary">
              Add exercise
            </button>
            <button type="button" className="btn-ghost">
              Skip
            </button>
            <button type="button" className="btn-danger">
              Delete
            </button>
          </Pad>
        </Section>
        <Section title="FEEDBACK PROMPT">
          <FeedbackCard question="How was the pump in your chest?" options={[{ value: '0', label: 'None' }, { value: '1', label: 'Mild' }, { value: '2', label: 'Good' }, { value: '3', label: 'Great' }]} onPick={noop} onSkip={noop} />
        </Section>
        <Section title="RULED ROWS AND MARGIN NOTES">
          <RuledRow>
            <span className="flex-1">Incline DB press</span>
            <span className="t-num-m">32.5 × 8</span>
          </RuledRow>
          <Pad className="pt-2">
            <MarginNote>+2.5 kg · hit 3 × 10 at 2 RIR last week</MarginNote>
          </Pad>
        </Section>
      </div>
    </Screen>
  );
}
