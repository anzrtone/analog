// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { memo, useEffect, useRef } from 'react';
import { ChartLine, Dumbbell, History, ListChecks, Menu, NotebookPen, Weight } from 'lucide-react';
import { useSettings } from '@/db/settings';
import { isTab, navigate, useNav, type Route, type Tab } from '@/features/nav';
import { useWide } from '@/features/responsive';
import { useGlobalShortcuts } from '@/features/shortcuts';
import { closeTopOverlay, cx } from '@/components/ui';
import { DialogHost } from '@/components/Dialog';
import { TourOverlay } from '@/components/TourOverlay';
import { OnboardingHost } from '@/components/Welcome';
import { ScreenStack } from '@/components/ScreenStack';
import { Sidebar } from '@/components/Sidebar';
import { ExercisesScreen } from '@/screens/ExercisesScreen';
import { BackupScreen } from '@/screens/BackupScreen';
import { DevLogScreen } from '@/screens/DevLogScreen';
import { ExerciseDetailScreen, ExerciseEditScreen } from '@/screens/ExerciseScreens';
import { GymScreen, GymsScreen } from '@/screens/GymScreens';
import { ImportScreen } from '@/screens/ImportScreen';
import { MeasurementsScreen } from '@/screens/MeasurementsScreen';
import { AboutScreen, AdminScreen, KitchenSinkScreen, MoreScreen } from '@/screens/MoreScreens';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { HistoryScreen, WorkoutDetailView } from '@/screens/HistoryScreen';
import { MesoReportScreen } from '@/screens/MesoReportScreen';
import { ProgramBuilderScreen } from '@/screens/ProgramBuilderScreen';
import { ProgramShareScreen } from '@/screens/ProgramShareScreen';
import { NewProgramScreen, ProgramImportScreen, ProgramsScreen } from '@/screens/ProgramsScreen';
import { ShareScreen } from '@/screens/ShareScreen';
import { StatsScreen } from '@/screens/StatsScreen';
import { SummaryScreen } from '@/screens/SummaryScreen';
import { TodayScreen } from '@/screens/TodayScreen';
import { WorkoutScreen } from '@/screens/WorkoutScreen';

const TABS: Array<{ id: Tab; label: string; icon: typeof NotebookPen; tour?: string }> = [
  { id: 'today', label: 'Log', icon: NotebookPen },
  { id: 'history', label: 'History', icon: History, tour: 'nav-history' },
  { id: 'programs', label: 'Programs', icon: ListChecks, tour: 'nav-programs' },
  { id: 'stats', label: 'Stats', icon: ChartLine, tour: 'nav-stats' },
  { id: 'exercises', label: 'Exercises', icon: Dumbbell },
  { id: 'gyms', label: 'My Gyms', icon: Weight },
  { id: 'more', label: 'More', icon: Menu },
];

export function App() {
  const { route, stack, tab } = useNav();
  const wide = useWide();
  // Like 0.1.0: pushed pages (the workout, a program, the summary…) cover the tab bar on phones.
  const tabs = !wide && isTab(route);
  const theme = useSettings().theme;
  useTheme(theme);
  useGlobalShortcuts();
  useEscape();

  const mainRef = useRef<HTMLElement>(null);

  return (
    <div className="flex h-full">
      {wide ? <Sidebar /> : null}

      <main ref={mainRef} className={cx('relative flex-1 overflow-y-auto overflow-x-hidden safe-pt', tabs && 'pb-[calc(76px+var(--sab))]')}>
        <ScreenStack stack={stack} scroller={mainRef} render={renderScreen} />
      </main>

      {!tabs ? null : (
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-rule bg-paper safe-pb" aria-label="Pages">
          {TABS.map((t) => (
            <button key={t.id} type="button" data-tour={t.tour} aria-current={tab === t.id ? 'page' : undefined} onClick={() => navigate({ name: t.id })} className={cx('flex min-h-[62px] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0 text-[11px] font-medium leading-4 tracking-[-0.025em]', tab === t.id ? 'text-ink' : 'text-pencil')}>
              <t.icon size={21} strokeWidth={1.75} />
              <span className="max-w-full truncate">{t.label}</span>
            </button>
          ))}
        </nav>
      )}

      <TourOverlay />
      <OnboardingHost />
      <DialogHost />
    </div>
  );
}

const renderScreen = (route: Route) => <CurrentScreen route={route} />;

/** Memoised so shell-level updates (rest ticks, the spine) never re-render the page. */
const CurrentScreen = memo(function CurrentScreen({ route }: { route: Route }) {
  switch (route.name) {
    case 'today':
      return <TodayScreen />;
    case 'workout':
      return <WorkoutScreen key={route.id} id={route.id} />;
    case 'summary':
      return <SummaryScreen key={route.id} id={route.id} />;
    case 'exercises':
      return <ExercisesScreen key={JSON.stringify(route)} pick={route.pick} swap={route.swap} target={route.target} picker={route.picker} />;
    case 'history':
      return <HistoryScreen />;
    case 'workoutDetail':
      return <WorkoutDetailView key={route.id} id={route.id} page />;
    case 'programs':
      return <ProgramsScreen />;
    case 'program':
      return route.id === 'new' ? <NewProgramScreen /> : <ProgramBuilderScreen key={route.id} id={route.id} />;
    case 'programShare':
      return <ProgramShareScreen key={route.id} id={route.id} />;
    case 'programImport':
      return <ProgramImportScreen data={route.data} />;
    case 'mesoReport':
      return <MesoReportScreen runId={route.runId} />;
    case 'stats':
      return <StatsScreen />;
    case 'share':
      return <ShareScreen key={`${route.kind}:${route.id}`} kind={route.kind} id={route.id} />;
    case 'exercise':
      return <ExerciseDetailScreen key={route.id} id={route.id} />;
    case 'exerciseEdit':
      return <ExerciseEditScreen key={route.id ?? `new:${route.prefill ?? ''}`} id={route.id} prefill={route.prefill} picker={route.picker} />;
    case 'gyms':
      return <GymsScreen />;
    case 'gym':
      return <GymScreen key={route.id} id={route.id} />;
    case 'measurements':
      return <MeasurementsScreen />;
    case 'import':
      return <ImportScreen />;
    case 'backup':
      return <BackupScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'about':
      return <AboutScreen />;
    case 'devlog':
      return <DevLogScreen />;
    case 'more':
      return <MoreScreen />;
    case 'admin':
      return <AdminScreen />;
    case 'kitchen':
      return <KitchenSinkScreen />;
  }
});


/** Carbon (dark, default), Paper (light) or System: one attribute on <html> swaps every token. */
function useTheme(theme: 'carbon' | 'paper' | 'system') {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'paper' : 'carbon') : theme;
      document.documentElement.dataset.theme = resolved;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'paper' ? '#F6F1E7' : '#17181C');
    };
    apply();
    if (theme !== 'system') return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}

/** Esc closes the newest sheet or dialog (desktop). The Android back button goes through handleBack in boot. */
function useEscape() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeTopOverlay()) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

