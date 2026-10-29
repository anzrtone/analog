// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useEffect, useRef, useState } from 'react';
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
}

/** Big −/+ steppers (64 px) and a keypad field. Tap a number in a set row to open it; Enter saves. */
export function NumberSheet({ title, value, step, min = 0, unit, format = String, parse, onDone, onClose }: NumberSheetProps) {
  // The parent mounts this sheet fresh for each edit, so the initial state is the current value.
  const [v, setV] = useState<number | null>(value);
  const [text, setText] = useState(value != null ? format(value) : '');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

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
          <button type="button" className="btn-secondary h-16 w-16 text-2xl" onClick={() => bump(-1)} aria-label={`Minus ${format(step)}`}>
            −
          </button>
          <div className="flex flex-1 flex-col items-center">
            <input
              ref={input}
              value={text}
              inputMode="decimal"
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
          <button type="button" className="btn-secondary h-16 w-16 text-2xl" onClick={() => bump(1)} aria-label={`Plus ${format(step)}`}>
            +
          </button>
        </div>
        <button type="submit" className="btn-primary">
          Done
        </button>
      </form>
    </Sheet>
  );
}
