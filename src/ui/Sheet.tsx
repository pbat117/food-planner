'use client';

import { type ReactNode, useEffect, useId, useRef } from 'react';

export interface SheetProps {
  open: boolean;
  onClose(): void;
  title: string;
  children: ReactNode;
  /** Optional trailing header button, e.g. "Apply". */
  action?: ReactNode;
}

/** iOS-style bottom sheet. Escape or the backdrop closes it; focus stays inside while open. */
export function Sheet({ open, onClose, title, children, action }: SheetProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="animate-fade absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="animate-sheet relative flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-[14px] bg-bg pb-[env(safe-area-inset-bottom)] outline-none"
      >
        <div className="mx-auto mt-1.5 h-[5px] w-9 rounded-full bg-tertiary" aria-hidden />
        <header className="grid grid-cols-[1fr_auto_1fr] items-center px-4 pt-2 pb-3">
          <button type="button" onClick={onClose} className="min-h-11 justify-self-start text-body text-tint">
            Close
          </button>
          <h2 id={titleId} className="text-headline font-semibold">{title}</h2>
          <span className="justify-self-end">{action}</span>
        </header>
        <div className="overflow-y-auto overscroll-contain pb-6">{children}</div>
      </div>
    </div>
  );
}
