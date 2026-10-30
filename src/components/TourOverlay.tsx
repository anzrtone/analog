// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { TOURS } from '@/features/tour/script';
import { endTour, makeStep, nextStep, prevStep, skipUnreachable, subscribeTour, tourSnapshot, type TourView } from '@/features/tour/store';
import { typingInField } from '@/features/shortcuts';
import { cx, useBackClose } from './ui';

// The spotlight (Promodoro's TourOverlay, in Analog's colours): everything but the target dims, a note explains it,
// and taps outside the note do nothing, so the tour can't be lost by accident. Esc, the Android back button and
// "Skip tour" end it.

const PAD = 8;
const GAP = 12;
const EDGE = 16;
/** How long to wait for a step's target to render (screens load their data async) before skipping it. */
const FIND_MS = 1500;

/** The visible element for a tour target (the phone tab bar and the desktop spine carry the same marker). */
function findTarget(target: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(target)}"]`));
  return all.find((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden') ?? null;
}

/** Mounted once at the root, above every screen. */
export function TourOverlay() {
  const v = useSyncExternalStore(subscribeTour, tourSnapshot);
  return v ? <Spotlight v={v} /> : null;
}

function Spotlight({ v }: { v: TourView }) {
  const [box, setBox] = useState<{ rect: DOMRect | null; vw: number; vh: number }>({ rect: null, vw: window.innerWidth, vh: window.innerHeight });
  const [ready, setReady] = useState(false);
  const [noteH, setNoteH] = useState(0);
  useBackClose(true, endTour);

  // Follow the target through scrolling and resizes; only re-render when it actually moves.
  useLayoutEffect(() => {
    setReady(false);
    let raf = 0;
    let el: HTMLElement | null = null;
    let last = '';
    let stable = 0;
    const since = performance.now();
    const track = () => {
      if (v.target && !el) {
        el = findTarget(v.target);
        if (!el) {
          if (performance.now() - since > FIND_MS) return skipUnreachable();
          raf = requestAnimationFrame(track);
          return;
        }
        el.scrollIntoView({ block: el.offsetHeight > window.innerHeight * 0.55 ? 'start' : 'center', behavior: 'instant' });
      }
      const r = el ? el.getBoundingClientRect() : null;
      const key = `${r?.left},${r?.top},${r?.width},${r?.height},${window.innerWidth},${window.innerHeight}`;
      if (key !== last) {
        last = key;
        stable = 0;
        setBox({ rect: r, vw: window.innerWidth, vh: window.innerHeight });
      } else if (++stable >= 2) setReady(true);
      raf = requestAnimationFrame(track);
    };
    track();
    return () => cancelAnimationFrame(raf);
  }, [v.index, v.target]);

  // Keyboard: arrows step, Esc (via useBackClose) ends. Arrows stay with the name field on make steps.
  const make = !!v.step.make;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (make || typingInField(e)) return;
      if (e.key === 'ArrowRight') nextStep();
      else if (e.key === 'ArrowLeft') prevStep();
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [make]);

  if (!ready) return <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Tour" />;
  const { rect, vw, vh } = box;
  const w = Math.min(340, vw - EDGE * 2);
  const h = noteH || 200;
  // Below the spotlight if it fits, else above, else pinned to the bottom (tall targets); centred with no target.
  let pos: { left: number; top: number } = { left: (vw - w) / 2, top: Math.max(EDGE, (vh - h) / 2) };
  if (rect) {
    const left = Math.min(Math.max(EDGE, rect.left + rect.width / 2 - w / 2), vw - w - EDGE);
    const below = rect.bottom + PAD + GAP;
    const above = rect.top - PAD - GAP - h;
    pos = { left, top: below + h <= vh - EDGE ? below : above >= EDGE ? above : vh - h - EDGE };
  }
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Tour">
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-[14px] border-2 border-ink transition-all duration-300 ease-out"
          style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.5)' }}
        />
      ) : (
        <div className="absolute inset-0 bg-scrim/50" />
      )}
      {/* Clicks outside the note do nothing. */}
      <div className="absolute inset-0" />
      <div ref={(el) => el && el.offsetHeight !== noteH && setNoteH(el.offsetHeight)} className="absolute rounded-sheet border border-rule bg-raised p-4 transition-[left,top] duration-300 ease-out" style={{ width: w, ...pos }}>
        <div key={v.index} className={cx('flex flex-col gap-3', v.dir === 1 ? 'animate-page-in' : 'animate-fade-in')}>
          <Note v={v} />
        </div>
      </div>
    </div>
  );
}

function Note({ v }: { v: TourView }) {
  const script = TOURS[v.tourId]!;
  const at = v.last ? script.chapters.length : script.chapters.findIndex((c) => c.id === v.chapter);
  const [name, setName] = useState(v.suggestion ?? '');
  const what = v.step.make === 'day' ? 'day' : 'program';
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {script.chapters.map((c, k) => (
          <span key={c.id} className={cx('t-meta rounded-full px-2 py-0.5', k === at ? 'bg-ink text-paper' : 'text-pencil', k > at && 'opacity-55')}>
            {k < at ? '✓ ' : ''}
            {c.label.toUpperCase()}
          </span>
        ))}
      </div>
      <p>{v.text}</p>
      {v.step.make ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void makeStep(name);
          }}
        >
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoFocus onFocus={(e) => e.target.select()} maxLength={40} enterKeyHint="done" aria-label={`Name of the ${what}`} />
        </form>
      ) : null}
      <div className="flex items-center gap-1">
        <button type="button" className={cx('btn-ghost btn-compact', v.index === 0 && 'invisible')} onClick={prevStep} disabled={v.index === 0} title="Previous step (←)">
          Back
        </button>
        <div className="mx-1 h-[3px] min-w-6 flex-1 overflow-hidden rounded-sm bg-rule" role="progressbar" aria-label={`Step ${v.index + 1} of ${v.count}`}>
          <div className="h-full bg-ink transition-[width] duration-300" style={{ width: `${((v.index + 1) / v.count) * 100}%` }} />
        </div>
        {v.step.make ? (
          <>
            <button type="button" className="btn-ghost btn-compact" onClick={nextStep}>
              Not now
            </button>
            <button type="button" className="btn-primary btn-compact" onClick={() => void makeStep(name)}>
              {`Make ${what}`}
            </button>
          </>
        ) : (
          <>
            {v.last ? null : (
              <button type="button" className="btn-ghost btn-compact" onClick={endTour}>
                Skip tour
              </button>
            )}
            <button type="button" className="btn-primary btn-compact" onClick={v.last ? endTour : nextStep} autoFocus>
              {v.last ? script.done : 'Next'}
            </button>
          </>
        )}
      </div>
    </>
  );
}
