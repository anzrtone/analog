// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { memo, useEffect, useRef } from 'react';
import { ChartLine, History, ListChecks, Menu, NotebookPen } from 'lucide-react';
import { closeTopOverlay, cx } from '@/components/ui';
import { back, navigate, useNav, type Route, type Tab } from '@/features/nav';
import { Wordmark } from '@/components/Brand';

const TABS: Array<{ id: Tab; label: string; icon: typeof NotebookPen; tour?: string }> = [
  { id: 'today', label: 'Log', icon: NotebookPen },
  { id: 'history', label: 'History', icon: History, tour: 'nav-history' },
  { id: 'programs', label: 'Programs', icon: ListChecks, tour: 'nav-programs' },
  { id: 'stats', label: 'Stats', icon: ChartLine, tour: 'nav-stats' },
  { id: 'more', label: 'More', icon: Menu },
];

export function App() {
  const { route, tab } = useNav();
  useBackKeys();

  // Each page opens at the top.
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [route]);

  return (
    <div className="flex h-full">
      {/* Wide screens: the open logbook, with the spine on the left. */}
      <nav className="hidden w-[248px] shrink-0 flex-col gap-4 border-r border-rule bg-sunk p-4 wide:flex">
        <div className="px-2 pt-2">
          <Wordmark size={26} />
          <div className="t-meta mt-0.5 text-pencil">The training log you own</div>
        </div>
        <div className="flex flex-col gap-0.5">
          {TABS.map((t) => (
            <button key={t.id} type="button" data-tour={t.tour} onClick={() => navigate({ name: t.id })} className={cx('t-label flex min-h-[40px] items-center gap-3 rounded-control px-3 text-[14px]', tab === t.id ? 'bg-raised text-ink' : 'text-ink2 hover:bg-raised/60')}>
              <t.icon size={18} strokeWidth={1.75} /> {t.id === 'today' ? 'Today' : t.label}
            </button>
          ))}
        </div>
      </nav>

      <main ref={mainRef} className="relative flex-1 overflow-y-auto overflow-x-hidden pb-[76px] safe-pt wide:pb-0">
        <CurrentScreen route={route} />
      </main>

      {/* Phones: bottom tabs. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-rule bg-paper safe-pb wide:hidden">
        {TABS.map((t) => (
          <button key={t.id} type="button" data-tour={t.tour} onClick={() => navigate({ name: t.id })} className={cx('flex min-h-[62px] flex-1 flex-col items-center justify-center gap-1 text-[12px] font-medium leading-4', tab === t.id ? 'text-ink' : 'text-pencil')}>
            <t.icon size={22} strokeWidth={1.75} />
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

const CurrentScreen = memo(function CurrentScreen({ route }: { route: Route }) {
  return (
    <div key={route.name} className="mx-auto max-w-[880px] px-margin pt-9">
      <h1 className="t-title-l">{route.name}</h1>
    </div>
  );
});

/** Esc on desktop and the Android back button: close the newest sheet first, then walk the page stack. */
function useBackKeys() {
  useEffect(() => {
    const onBack = (e: Event) => {
      if (closeTopOverlay() || back()) e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeTopOverlay()) e.preventDefault();
    };
    window.addEventListener('analog:back', onBack);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('analog:back', onBack);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
}
