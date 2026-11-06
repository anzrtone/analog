// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useEffect, useRef, useState } from 'react';
import { formatClock, parseDuration } from '@/engine/math/units';
import { Sheet } from './ui';

export interface NumberSheetProps {
  title: string;
  value: number | null;
  step: number;
  min?: number;
  unit?: string;
  /** Formats the big number (e.g. weight from grams). */
  format?: (v: number) => string;
  /** Parses typed text back into the value's unit. */
  parse?: (s: string) => number | null;
  onDone: (v: number | null) => void;
  onClose: () => void;
  /** Keyboard for the field; times need the colon, so they ask for plain text. */
  inputMode?: 'decimal' | 'text';
  /** A quieter second action under Done, e.g. "Run the stopwatch instead". */
  secondary?: { label: string; onClick: (v: number | null) => void };
}

/** Big −/+ steppers (64 px) and a keypad field. Tap a number in a set row to open it; Enter saves. */
export function NumberSheet({ title, value, step, min = 0, unit, format = String, parse, onDone, onClose, inputMode = 'decimal', secondary }: NumberSheetProps) {
  // The parent mounts this sheet fresh for each edit, so the initial state is the current value.
  const [v, setV] = useState<number | null>(value);
  const [text, setText] = useState(value != null ? format(value) : '');
  const input = useRef<HTMLInputElement>(null);
  // A phone's keyboard stays away until you tap the number: opening with it up covers the sheet, and closing it on the
  // first +/− tap moved everything. With a mouse and a keyboard, typing straight away is the point.
  useEffect(() => {
    if (!window.matchMedia?.('(pointer: fine)').matches) return;
    input.current?.focus();
    input.current?.select();
  }, []);
  // The steppers never take focus from the number, so a keyboard you opened yourself stays up while you tap them.
  const keepFocus = { onPointerDown: (e: React.PointerEvent) => e.preventDefault(), onMouseDown: (e: React.MouseEvent) => e.preventDefault() };

  const bump = (dir: number) => {
    const next = Math.max(min, Math.round(((v ?? 0) + dir * step) * 1000) / 1000);
    setV(next);
    setText(format(next));
  };
  const done = () => {
    onDone(v);
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={title}>
      <form
        className="flex flex-col gap-4 px-margin pb-2 pt-2 wide:px-6"
        onSubmit={(e) => {
          e.preventDefault();
          done();
        }}
      >
        <div className="flex items-center gap-3">
          <button type="button" className="btn-secondary h-16 w-16 text-2xl" {...keepFocus} onClick={() => bump(-1)} aria-label={`Minus ${format(step)}`}>
            −
          </button>
          <div className="flex flex-1 flex-col items-center">
            <input
              ref={input}
              value={text}
              inputMode={inputMode}
              aria-label={title}
              onChange={(e) => {
                const t = e.target.value;
                setText(t);
                const n = parse ? parse(t) : Number(t.replace(',', '.'));
                setV(t.trim() === '' ? null : n != null && Number.isFinite(n) ? n : v);
              }}
              className="w-full min-w-0 max-w-[220px] rounded-control border-b border-dashed border-rule bg-transparent text-center font-num text-[48px] leading-[56px] text-ink outline-none tabular"
              style={{ fontWeight: 500 }}
            />
            {unit ? <span className="text-pencil">{unit}</span> : null}
          </div>
          <button type="button" className="btn-secondary h-16 w-16 text-2xl" {...keepFocus} onClick={() => bump(1)} aria-label={`Plus ${format(step)}`}>
            +
          </button>
        </div>
        <button type="submit" className="btn-primary">
          Done
        </button>
        {secondary ? (
          <button type="button" className="btn-ghost" onClick={() => secondary.onClick(v)}>
            {secondary.label}
          </button>
        ) : null}
      </form>
    </Sheet>
  );
}

/**
 * A time as m:ss in milliseconds: type "1:12", "72" or "1m12", or nudge by a second. Used wherever a set's time is
 * set by hand: after a stopwatch run, on a ticked set, and on rows that never needed the stopwatch.
 */
export function TimeEntrySheet({ title, valueMs, stepMs = 1000, onDone, onClose, secondary }: { title: string; valueMs: number | null; stepMs?: number; onDone: (ms: number | null) => void; onClose: () => void; secondary?: NumberSheetProps['secondary'] }) {
  return <NumberSheet title={title} value={valueMs} step={stepMs} format={(ms) => formatClock(ms)} parse={parseDuration} inputMode="text" onDone={onDone} onClose={onClose} secondary={secondary} />;
}
