'use client';

import { ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';

/** Right-aligned number input for a list row. Commits on blur/Enter; out-of-range input snaps back. */
export function NumberField({
  value, onChange, min, max, label, suffix, step = 'any', width = 'w-16',
}: {
  value: number;
  onChange(v: number): void;
  min: number;
  max: number;
  label: string;
  suffix?: string;
  step?: number | 'any';
  width?: string;
}) {
  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    // The value changed from outside (e.g. unit switch): show it.
    setShown(value);
    setText(String(value));
  }
  const commit = () => {
    const n = Number(text.replace(',', '.'));
    if (text.trim() !== '' && Number.isFinite(n) && n >= min && n <= max) {
      if (n !== value) onChange(n);
    } else {
      setText(String(value));
    }
  };
  return (
    <span className="inline-flex items-baseline gap-1">
      <input
        aria-label={label}
        inputMode="decimal"
        type="text"
        step={step}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        className={`${width} min-h-11 bg-transparent text-right text-body tabular-nums text-tint outline-none`}
      />
      {suffix && <span className="text-body text-secondary">{suffix}</span>}
    </span>
  );
}

/** A native select styled as an iOS row value. On iPhone this opens the system picker wheel. */
export function SelectField<T extends string>({
  value, onChange, options, label,
}: {
  value: T;
  onChange(v: T): void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <span className="relative inline-flex items-center gap-1 text-secondary">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="min-h-11 max-w-[11rem] appearance-none truncate bg-transparent pr-5 text-right text-body text-secondary outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronsUpDown aria-hidden className="pointer-events-none absolute right-0 size-4 text-tertiary" />
    </span>
  );
}

export function TextField({ value, onChange, label, placeholder }: { value: string; onChange(v: string): void; label: string; placeholder?: string }) {
  return (
    <input
      aria-label={label}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-11 w-full bg-transparent text-body outline-none placeholder:text-tertiary"
    />
  );
}
