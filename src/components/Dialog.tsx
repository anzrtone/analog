// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
import { useEffect, useRef } from 'react';
import { createStore } from '@/features/store';
import { cx, useBackClose } from './ui';

// Confirmations, in Analog's own style (BRAND §7): the last button is the one primary, cancel is a ghost.

export interface DialogButton {
  text: string;
  style?: 'cancel' | 'destructive' | 'default';
  onPress?: () => void;
}

const dialog = createStore<{ title: string; message?: string; buttons: DialogButton[] } | null>(null);

export function ask(title: string, message?: string, buttons: DialogButton[] = [{ text: 'OK' }]): void {
  dialog.set({ title, message, buttons });
}

/** Rendered once at the root. */
export function DialogHost() {
  const open = dialog.use();
  const cancel = open?.buttons.find((b) => b.style === 'cancel');
  const close = () => dialog.set(null);
  const press = (b: DialogButton) => {
    close();
    b.onPress?.();
  };
  useBackClose(!!open, () => (cancel ? press(cancel) : close()));
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) primary.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="absolute inset-0 animate-fade-in bg-scrim/50" onClick={() => (cancel ? press(cancel) : close())} />
      <div className="relative flex w-full max-w-[420px] animate-card-in flex-col gap-3 rounded-sheet bg-raised p-6">
        <h2 id="dialog-title" className="t-title-m">
          {open.title}
        </h2>
        {open.message ? <p className="whitespace-pre-line text-ink2">{open.message}</p> : null}
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          {open.buttons.map((b, i) => {
            const last = i === open.buttons.length - 1;
            return (
              <button
                key={`${b.text}${i}`}
                ref={last ? primary : undefined}
                type="button"
                onClick={() => press(b)}
                className={cx(b.style === 'cancel' ? 'btn-ghost' : last ? (b.style === 'destructive' ? 'btn-danger' : 'btn-primary') : b.style === 'destructive' ? 'btn-danger' : 'btn-secondary')}
              >
                {b.text}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
