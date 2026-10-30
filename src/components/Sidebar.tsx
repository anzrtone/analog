// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { memo, useEffect, useState, type ComponentType } from 'react';
import { ChartLine, Database, Dumbbell, History, Info, ListChecks, NotebookPen, Settings, Upload, Weight, Wrench } from 'lucide-react';
import { activeRun, type RunRow } from '@/db/repos';
import { activeWorkout, type Workout } from '@/db/workouts';
import { formatClock } from '@/engine/math/units';
import { rirForWeek } from '@/engine/meso';
import { metaLine } from '@/engine/programs/resolve';
import { useData } from '@/features/data';
import { navigate, useNav, type Route } from '@/features/nav';
import { useSpread } from '@/features/responsive';
import { startEmptyWorkout, startNextProgramDay } from '@/features/workout/actions';
import { rest } from '@/features/workout/timers';
import { platform } from '@/platform';
import { Wordmark } from './Brand';
import { PlateRing } from './PlateRing';
import { cx } from './ui';

type Icon = ComponentType<{ size?: number | string; strokeWidth?: number | string }>;
interface NavItem {
  label: string;
  to: Route;
  icon: Icon;
  match: (r: Route['name'], tab: string) => boolean;
  hint?: string;
  tour?: string;
}

const NAV: NavItem[] = [
  { label: 'Today', to: { name: 'today' }, icon: NotebookPen, match: (r, t) => t === 'today' && r !== 'exercises' && r !== 'exercise' && r !== 'exerciseEdit', hint: 'Alt 1' },
  { label: 'History', to: { name: 'history' }, icon: History, match: (_, t) => t === 'history', hint: 'Alt 2', tour: 'nav-history' },
  { label: 'Programs', to: { name: 'programs' }, icon: ListChecks, match: (_, t) => t === 'programs', hint: 'Alt 3', tour: 'nav-programs' },
  { label: 'Stats', to: { name: 'stats' }, icon: ChartLine, match: (_, t) => t === 'stats', hint: 'Alt 4', tour: 'nav-stats' },
  { label: 'Exercises', to: { name: 'exercises' }, icon: Dumbbell, match: (r) => r === 'exercises' || r === 'exercise' || r === 'exerciseEdit', hint: 'Alt 5' },
  { label: 'Gyms and plates', to: { name: 'gyms' }, icon: Weight, match: (r) => r === 'gyms' || r === 'gym' },
];
const NAV2: NavItem[] = [
  { label: 'Import', to: { name: 'import' }, icon: Upload, match: (r) => r === 'import' },
  { label: 'Backup and export', to: { name: 'backup' }, icon: Database, match: (r) => r === 'backup' },
  { label: 'Settings', to: { name: 'settings' }, icon: Settings, match: (r) => r === 'settings' },
  { label: 'About', to: { name: 'about' }, icon: Info, match: (r) => r === 'about' || r === 'devlog' || r === 'kitchen' },
  // Development builds only.
  ...(__DEV_BUILD__ ? [{ label: 'Admin console', to: { name: 'admin' } as Route, icon: Wrench as Icon, match: (r: Route['name']) => r === 'admin' }] : []),
];

// Memoised: a page change re-renders only the items whose highlight moves.
const Item = memo(function Item({ item, active, compact }: { item: NavItem; active: boolean; compact: boolean }) {
  const I = item.icon;
  return (
    <button
      type="button"
      onClick={() => navigate(item.to, { root: true })}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      data-tour={item.tour}
      title={compact ? item.label : undefined}
      className={cx('relative flex w-full items-center gap-3 overflow-hidden rounded-control transition-colors', compact ? 'min-h-touch justify-center' : 'min-h-[40px] px-3', active ? 'bg-raised text-ink' : 'text-ink2 hover:bg-raised/60')}
    >
      <span className={cx('absolute inset-y-0 left-0 w-0.5 bg-ink transition-opacity', active ? 'opacity-100' : 'opacity-0')} />
      <I size={compact ? 20 : 18} strokeWidth={1.75} />
      {compact ? null : <span className="t-label flex-1 text-left text-[14px]">{item.label}</span>}
      {item.hint && !compact ? <span className="t-meta text-pencil">{item.hint}</span> : null}
    </button>
  );
});

function LiveClock({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="t-num-m">{formatClock(now - since)}</span>;
}

/**
 * The spine of the open logbook (wide screens): where you are, what's running, and one way to start.
 * Plate colours only where they mean something: blue for the program, yellow for a running rest.
 */
export function Sidebar() {
  const { route, tab } = useNav();
  const active = useData((d) => activeWorkout(d), [], null as Workout | null);
  const run = useData((d) => activeRun(d), [], null as RunRow | null);
  const resting = rest.use((r) => r.rest);
  const { spine } = useSpread();
  const block = run ? run.program.blocks[run.state.blockIndex] : undefined;
  const day = block?.days[run!.state.dayIndex];
  const isActive = (n: NavItem) => n.match(route.name, tab);

  if (spine === 'icons') {
    // Narrower windows: the spine folds to icons so the page keeps its width.
    return (
      <nav className="no-scrollbar flex w-[76px] shrink-0 flex-col gap-1.5 overflow-y-auto border-r border-rule bg-sunk px-2 py-5" aria-label="Pages">
        <div className="flex justify-center pb-3">
          <PlateRing color="red" state="done" size={28} stroke={6} label="Analog" />
        </div>
        {active ? (
          <button type="button" onClick={() => navigate({ name: 'workout', id: active.id })} aria-label={`Resume ${active.title}`} className={cx('flex justify-center rounded-control border-[1.5px] border-dashed py-2', resting ? 'border-yellow-ring' : 'border-ink')}>
            <PlateRing color={resting ? 'yellow' : 'ink'} state="progress" progress={0.6} size={22} />
          </button>
        ) : null}
        {[...NAV, ...NAV2].map((n) => (
          <Item key={n.label} item={n} active={isActive(n)} compact />
        ))}
      </nav>
    );
  }

  return (
    <nav className="no-scrollbar flex w-[248px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-rule bg-sunk p-4" aria-label="Pages">
      <div className="px-2 pt-2">
        <Wordmark size={26} />
        <p className="t-meta mt-0.5 text-pencil">THE TRAINING LOG YOU OWN</p>
      </div>

      {active ? (
        <button type="button" onClick={() => navigate({ name: 'workout', id: active.id })} aria-label={`Resume ${active.title}`} className={cx('flex flex-col gap-1 rounded-sheet border-[1.5px] border-dashed bg-raised p-3 text-left transition-transform active:scale-[0.98]', resting ? 'border-yellow-ring' : 'border-ink')}>
          <span className="flex items-center gap-2">
            <PlateRing color={resting ? 'yellow' : 'ink'} state="progress" progress={0.6} size={18} />
            <span className={cx('t-meta', resting ? 'text-yellow-text' : 'text-ink2')}>{resting ? 'RESTING' : 'IN PROGRESS'}</span>
          </span>
          <span className="t-title-m truncate">{active.title}</span>
          <LiveClock since={active.startedAt} />
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Secondary on purpose: the page keeps the one primary button (BRAND §7). */}
          {run && day ? (
            <button type="button" className="btn-secondary" onClick={() => void startNextProgramDay()}>
              {`Start ${day.name}`}
            </button>
          ) : null}
          <button type="button" className={run ? 'btn-ghost' : 'btn-secondary'} onClick={() => void startEmptyWorkout()} aria-label="Start an empty workout">
            Empty workout
          </button>
        </div>
      )}

      <div className="flex flex-col gap-0.5">
        {NAV.map((n) => (
          <Item key={n.label} item={n} active={isActive(n)} compact={false} />
        ))}
      </div>
      <div className="mx-2 h-px bg-rule" />
      <div className="flex flex-col gap-0.5">
        {NAV2.map((n) => (
          <Item key={n.label} item={n} active={isActive(n)} compact={false} />
        ))}
      </div>

      <div className="flex-1" />

      {run && block && day ? (
        <button type="button" onClick={() => navigate({ name: 'program', id: run.programId })} className="flex flex-col gap-0.5 border-l-2 border-blue-ring pl-2.5 text-left">
          <span className="t-meta text-blue-text">{metaLine(day.name, run.state.weekIndex, block, block.adaptive ? rirForWeek(run.state.weekIndex + 1, block.weeks, run.state.weekIndex >= block.weeks) : null)}</span>
          <span className="t-label line-clamp-2">{run.program.name}</span>
        </button>
      ) : null}

      <div className="flex flex-col gap-0.5 px-2">
        <p className="t-meta text-pencil">FREE · OPEN SOURCE · PRIVATE</p>
        <p className="line-clamp-2 text-[11px] leading-4 text-pencil">Saved to {platform().storageLabel}</p>
      </div>
    </nav>
  );
}
