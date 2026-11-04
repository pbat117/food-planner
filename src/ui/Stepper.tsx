'use client';

import { Minus, Plus } from 'lucide-react';

export interface StepperProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange(v: number): void;
  label: string;
  format?(v: number): string;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/** iOS stepper with the value shown beside it. */
export function Stepper({ value, min, max, step, onChange, label, format }: StepperProps) {
  const dec = () => value > min && onChange(round(Math.max(min, value - step)));
  const inc = () => value < max && onChange(round(Math.min(max, value + step)));
  const btn = 'flex h-8 w-11 items-center justify-center text-label disabled:text-tertiary active:bg-cell-pressed';
  return (
    <span className="inline-flex items-center gap-3">
      <span className="min-w-12 text-right text-body tabular-nums text-secondary" aria-live="polite">
        {format ? format(value) : value}
      </span>
      <span className="inline-flex overflow-hidden rounded-[8px] bg-fill">
        <button type="button" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={dec} className={btn}>
          <Minus className="size-4" strokeWidth={2.5} />
        </button>
        <span aria-hidden className="my-1.5 w-px bg-separator" />
        <button type="button" aria-label={`Increase ${label}`} disabled={value >= max} onClick={inc} className={btn}>
          <Plus className="size-4" strokeWidth={2.5} />
        </button>
      </span>
    </span>
  );
}
