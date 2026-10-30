// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 The Analog contributors
/** Logbook UI primitives: ruled rows, margin notes, sheets and the one-primary-button rule (BRAND §6–7). */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, X } from 'lucide-react';
import { back, useNav } from '@/features/nav';

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ');
}

/** Open sheets, dialogs and the tour, newest last. Esc and the Android back button close the newest first. */
const overlays: Array<() => void> = [];

/** Close the newest overlay. False when none is open (the caller then walks the page stack). */
export function closeTopOverlay(): boolean {
  const close = overlays[overlays.length - 1];
  if (!close) return false;
  close();
  return true;
}

export const overlayOpen = () => overlays.length > 0;

/** While `open`, this overlay is the first thing Esc and the back button close. */
export function useBackClose(open: boolean, onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!open) return;
    const close = () => ref.current();
    overlays.push(close);
    return () => {
      const i = overlays.lastIndexOf(close);
      if (i >= 0) overlays.splice(i, 1);
    };
  }, [open]);
}

/**
 * A page: paper background, 16 px margins, serif title, optional log-header meta line.
 * Wide screens keep a readable page width. Pushed pages get a back arrow.
 */
export function Screen({ title, meta, children, footer, right, backButton: wantsBack, maxWidth = 880, tour }: { title?: ReactNode; meta?: ReactNode; children: ReactNode; footer?: ReactNode; right?: ReactNode; backButton?: boolean; maxWidth?: number; tour?: string }) {
  // Only when there is a page to go back to (a page opened from the spine starts its own stack).
  const depth = useNav().stack.length;
  const backButton = wantsBack && depth > 1;
  return (
    <div className="flex min-h-full flex-col" data-tour={tour}>
      <div className="flex-1 pb-8">
        <div className="mx-auto w-full" style={{ maxWidth }}>
          {title || backButton ? (
            <header className="flex items-end gap-2 px-margin pb-3 pt-3 wide:pt-9">
              {backButton ? (
                <button type="button" onClick={() => back()} className="-ml-3 mb-0.5 inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-control text-ink2 hover:bg-sunk" aria-label="Back">
                  <ArrowLeft size={22} strokeWidth={1.75} />
                </button>
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {meta ? <div className="t-meta text-pencil">{meta}</div> : null}
                {title ? <h1 className="t-title-l break-words">{title}</h1> : null}
              </div>
              {right}
            </header>
          ) : null}
          {children}
        </div>
      </div>
      {footer ? (
        <div className="sticky bottom-0 z-10 bg-paper pb-[calc(var(--sab)+8px)] pt-2 wide:border-t wide:border-rule">
          <div className="mx-auto w-full px-margin" style={{ maxWidth }}>
            {footer}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Section({ title, children, className, tour, aside }: { title?: ReactNode; children: ReactNode; className?: string; tour?: string; aside?: ReactNode }) {
  return (
    <section className={cx('mt-6', className)} data-tour={tour}>
      {title || aside ? (
        <div className="mb-2 flex items-center justify-between gap-2 px-margin">
          <h2 className="t-meta text-pencil">{title}</h2>
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** A ruled notebook row: at least 48 px, one rule underneath, no box. */
export function RuledRow({ children, onClick, className, label, dashed, tour }: { children: ReactNode; onClick?: () => void; className?: string; label?: string; dashed?: boolean; tour?: string }) {
  const cls = cx('ruled-row w-full text-left', dashed && 'border-dashed', onClick && 'pressable', className);
  if (!onClick)
    return (
      <div className={cls} data-tour={tour}>
        {children}
      </div>
    );
  return (
    <button type="button" className={cls} onClick={onClick} aria-label={label} data-tour={tour}>
      {children}
    </button>
  );
}

/** Label on the left, value on the right. */
export function KeyValue({ k, v, onClick }: { k: ReactNode; v: ReactNode; onClick?: () => void }) {
  return (
    <RuledRow onClick={onClick}>
      <span className="flex-1">{k}</span>
      <span className="t-num-m text-ink2">{v}</span>
    </RuledRow>
  );
}

/** Pencil note in the margin: engine explanations, group labels, notes. */
export function MarginNote({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) {
  if (!onClick) return <p className={cx('t-hint', className)}>{children}</p>;
  return (
    <button type="button" onClick={onClick} className={cx('t-hint text-left hover:text-ink2', className)}>
      {children}
    </button>
  );
}

/** A blank ruled page, one serif line and one primary button (BRAND §7). */
export function EmptyState({ line, action, onAction }: { line: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex flex-col gap-4 px-margin py-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="mt-6 h-px bg-rule" />
      ))}
      <p className="t-title-m text-center">{line}</p>
      {action && onAction ? (
        <button type="button" className="btn-primary" onClick={onAction}>
          {action}
        </button>
      ) : null}
    </div>
  );
}

export function Field({ label, className, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <label htmlFor={id} className="t-label text-ink2">
          {label}
        </label>
      ) : null}
      <input id={id} className={cx('field', className)} {...rest} />
    </div>
  );
}

export function TextArea({ label, className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <label htmlFor={id} className="t-label text-ink2">
          {label}
        </label>
      ) : null}
      <textarea id={id} className={cx('field min-h-[96px] py-2', className)} {...rest} />
    </div>
  );
}

/** A choice of a few options as one ruled track. Selected = raised segment with an ink outline. No colour. */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink flex-wrap gap-0.5 rounded-[13px] border border-rule p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx('t-label min-h-[40px] min-w-[40px] rounded-control border px-3.5 transition-colors duration-200', on ? 'border-ink bg-raised text-ink' : 'border-transparent text-ink2 hover:bg-sunk')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** One filter pill in a scrolling row. Selected = ink outline on a raised fill. */
export function Chip({ label, on, onClick }: { label: ReactNode; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cx('t-label min-h-[40px] shrink-0 whitespace-nowrap rounded-control border px-3.5 transition-colors duration-200', on ? 'border-ink bg-raised text-ink' : 'border-rule text-ink2 hover:bg-sunk')}
    >
      {label}
    </button>
  );
}

/** A setting as a ruled row: label (and an optional pencil hint) on the left, the control on the right. */
export function ChoiceRow({ label, hint, children, tour }: { label: ReactNode; hint?: ReactNode; children: ReactNode; tour?: string }) {
  return (
    <div className="ruled-row flex-wrap gap-y-2 py-2.5" data-tour={tour}>
      <div className="flex min-w-0 flex-shrink flex-grow basis-40 flex-col gap-0.5">
        <span>{label}</span>
        {hint ? <span className="t-hint">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** On/off switch. Ink when on: plate colours are for meaning, not controls. */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className="inline-flex h-touch w-14 shrink-0 items-center justify-center">
      <span className={cx('relative h-7 w-12 rounded-full border transition-colors duration-200', checked ? 'border-ink bg-ink' : 'border-rule bg-sunk')}>
        <span className={cx('absolute top-[3px] h-5 w-5 rounded-full transition-all duration-200', checked ? 'left-[23px] bg-paper' : 'left-[3px] bg-pencil')} />
      </span>
    </button>
  );
}

export function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <ChoiceRow label={label} hint={hint}>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </ChoiceRow>
  );
}

export function Rule() {
  return <div className="h-px bg-rule" />;
}

export function Pad({ children, className, tour }: { children: ReactNode; className?: string; tour?: string }) {
  return (
    <div className={cx('px-margin', className)} data-tour={tour}>
      {children}
    </div>
  );
}

/**
 * Phone: rises from the bottom like pulling a page out (240 ms). Wide screens: a centred card.
 * Closes on the scrim, Esc and the Android back button.
 */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useBackClose(open, onClose);
  if (!open) return null;
  // Portalled to <body>: a sheet inside a page would be placed by that page's transform or scroller, not the screen.
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center wide:items-center wide:p-8" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
      <div className="absolute inset-0 animate-fade-in bg-scrim/45" onClick={onClose} />
      <div className="relative flex max-h-[calc(100dvh-var(--sat)-16px)] w-full animate-sheet-up flex-col rounded-t-sheet bg-raised pb-[calc(var(--sab)+8px)] wide:max-h-[86dvh] wide:max-w-[560px] wide:animate-card-in wide:rounded-sheet wide:border wide:border-rule wide:pb-4">
        <div className="flex justify-center pt-2 wide:hidden">
          <div className="h-1 w-9 rounded-full bg-rule" />
        </div>
        <div className="flex items-start gap-2 px-margin pb-2 pt-2 wide:px-6 wide:pt-5">
          {title ? <h2 className="t-title-m flex-1">{title}</h2> : <span className="flex-1" />}
          <button type="button" className="-mr-2 -mt-2 inline-flex h-touch w-touch items-center justify-center rounded-control text-pencil hover:bg-sunk" onClick={onClose} aria-label="Close">
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer ? <div className="px-margin pt-2 wide:px-6">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/** Tiny count-up/down helper for icon buttons in rows. */
export function IconButton({ label, onClick, children, className, disabled }: { label: string; onClick: () => void; children: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={cx('inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-control text-ink2 hover:bg-sunk disabled:opacity-45', className)}>
      {children}
    </button>
  );
}
