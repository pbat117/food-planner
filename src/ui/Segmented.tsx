'use client';

export interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange(v: T): void;
  label: string;
}

/** iOS segmented control. */
export function Segmented<T extends string>({ options, value, onChange, label }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex w-full rounded-[9px] bg-fill p-0.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => !on && onChange(o.value)}
            className={`min-h-8 flex-1 rounded-[7px] px-2 text-subhead transition-colors ${
              on ? 'bg-cell font-semibold shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)] dark:bg-[#636366]' : 'text-label'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
