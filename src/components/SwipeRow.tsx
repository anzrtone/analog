// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { EDGE_GUARD_PX, swipeCommits, swipeIntent, swipeOffset } from '@/features/swipe';
import { cx } from './ui';

export interface SwipeHandlers {
  /** Not deleting after all: the row slides back. */
  keep: () => void;
  /** Deleting: the row folds away, then `after` runs (so the list changes once the row is gone). */
  remove: (after: () => void) => void;
}

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const SLIDE_MS = 180;

/**
 * Swipe a row left and it slides away like it's being deleted, then `onSwipe` asks "are you sure?" while the row
 * stays off to the side. Keep slides it back; Delete folds it shut. Nothing is deleted until the answer is yes.
 * Only mostly-sideways drags count, so the list still scrolls; the Delete key does the same as a swipe.
 */
export function SwipeRow({ children, onSwipe, label = 'Delete', className }: { children: ReactNode; onSwipe: (row: SwipeHandlers) => void; label?: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const slide = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; t: number; locked: boolean; offset: number; v: number } | null>(null);
  const moved = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const place = (px: number, animate: boolean) => {
    const el = slide.current;
    if (!el) return;
    el.style.transition = animate && !reduced() ? `transform ${SLIDE_MS}ms cubic-bezier(.2,.8,.2,1)` : 'none';
    el.style.transform = px ? `translateX(${px}px)` : '';
  };

  const commit = () => {
    const width = box.current?.offsetWidth ?? 0;
    place(-width, true);
    window.clearTimeout(timer.current);
    // The dialog opens once the row has gone, so the slide reads as the deletion and the dialog as its check.
    timer.current = window.setTimeout(
      () =>
        onSwipe({
          keep: () => place(0, true),
          remove: (after) => {
            // max-height can only animate between numbers: pin the current height, then close it.
            const el = box.current;
            if (el) {
              el.style.maxHeight = `${el.offsetHeight}px`;
              void el.offsetHeight;
              el.style.maxHeight = '0px';
              el.style.opacity = '0';
            }
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(after, reduced() ? 0 : SLIDE_MS);
          },
        }),
      reduced() ? 0 : SLIDE_MS,
    );
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Delete' || (e.target as HTMLElement).closest('input, textarea')) return;
    e.preventDefault();
    commit();
  };

  return (
    <div
      ref={box}
      className="relative overflow-hidden transition-[max-height,opacity] ease-out"
      style={{ transitionDuration: reduced() ? '0ms' : `${SLIDE_MS}ms` }}
      onKeyDown={onKeyDown}
      aria-keyshortcuts="Delete"
    >
      <div className="absolute inset-0 flex items-center justify-end gap-2 border-b border-rule bg-sunk px-margin text-red-text" aria-hidden>
        <Trash2 size={18} strokeWidth={1.75} />
        <span className="t-label">{label}</span>
      </div>
      <div
        ref={slide}
        className={cx('relative bg-paper', className)}
        style={{ touchAction: 'pan-y' }}
        onPointerDown={(e) => {
          if (e.button !== 0 || e.clientX < EDGE_GUARD_PX) return;
          drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, locked: false, offset: 0, v: 0 };
          moved.current = false;
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const dx = e.clientX - d.x;
          if (!d.locked) {
            const intent = swipeIntent(dx, e.clientY - d.y);
            if (intent === 'vertical') return void (drag.current = null);
            if (intent === 'undecided') return;
            d.locked = true;
            e.currentTarget.setPointerCapture(e.pointerId);
          }
          const offset = swipeOffset(dx, box.current?.offsetWidth ?? 0);
          d.v = (offset - d.offset) / Math.max(1, e.timeStamp - d.t);
          d.offset = offset;
          d.t = e.timeStamp;
          moved.current = true;
          place(offset, false);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d?.locked) return;
          e.currentTarget.releasePointerCapture?.(e.pointerId);
          if (swipeCommits(d.offset, box.current?.offsetWidth ?? 0, d.v)) commit();
          else place(0, true);
        }}
        onPointerCancel={() => {
          if (drag.current?.locked) place(0, true);
          drag.current = null;
        }}
        // A drag that ended over a button must not also press it.
        onClickCapture={(e) => {
          if (moved.current) {
            e.preventDefault();
            e.stopPropagation();
            moved.current = false;
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
