import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

/** iOS inset grouped list section. */
export function GroupedList({ header, footer, children }: { header?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="mx-4 mb-8">
      {header && <h2 className="px-4 pb-1.5 text-footnote text-secondary">{header}</h2>}
      <div className="overflow-hidden rounded-[10px] bg-cell [&>*+*]:border-t [&>*+*]:border-separator/70">{children}</div>
      {footer && <div className="px-4 pt-1.5 text-footnote text-secondary">{footer}</div>}
    </section>
  );
}

export interface RowProps {
  title: ReactNode;
  detail?: ReactNode;
  subtitle?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  accessory?: ReactNode;
  leading?: ReactNode;
}

/** One cell. A button when it has onClick, otherwise a plain row. */
export function Row({ title, detail, subtitle, onClick, chevron, accessory, leading }: RowProps) {
  const body = (
    <>
      {leading && <span className="shrink-0">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-body">{title}</span>
        {subtitle && <span className="block text-footnote text-secondary">{subtitle}</span>}
      </span>
      {detail !== undefined && <span className="shrink-0 text-right text-body text-secondary">{detail}</span>}
      {accessory && <span className="shrink-0">{accessory}</span>}
      {chevron && <ChevronRight aria-hidden className="size-4 shrink-0 text-tertiary" strokeWidth={2.5} />}
    </>
  );
  const cls = 'flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left';
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} active:bg-cell-pressed`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
