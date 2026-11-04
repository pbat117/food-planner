'use client';

import { NUTRIENTS } from '@/data/nutrients';
import type { WeekPlan } from '@/engine/planWeek';
import { type Change, compare } from '@/lib/compare';
import { GroupedList } from '@/ui/GroupedList';
import { Sheet } from '@/ui/Sheet';

const CHANGE_TEXT: Record<Change, string> = { added: 'New', removed: 'Removed', more: 'More', less: 'Less', same: '' };
const CHANGE_COLOR: Record<Change, string> = { added: 'text-green', removed: 'text-red', more: 'text-tint', less: 'text-orange', same: 'text-secondary' };
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export function CompareSheet({
  open, title, now, next, onApply, onClose,
}: {
  open: boolean;
  title: string;
  now: WeekPlan;
  next: WeekPlan;
  onApply(): void;
  onClose(): void;
}) {
  const c = compare(now, next);
  const names = (ids: typeof c.fixed) => ids.map((id) => NUTRIENTS[id].name).join(', ');
  const changed = c.rows.filter((r) => r.change !== 'same');
  const same = c.rows.filter((r) => r.change === 'same');
  return (
    <Sheet open={open} onClose={onClose} title="Now vs New"
      action={<button type="button" onClick={onApply} className="min-h-11 text-body font-semibold text-tint">Apply</button>}>
      <p className="mx-8 mb-4 text-center text-subhead text-secondary">{title}</p>
      <GroupedList>
        <div className="grid grid-cols-2 divide-x divide-separator/70 py-3 text-center">
          <div><div className="text-headline tabular-nums">{fmt(c.kcalPerDay.now)}</div><div className="text-footnote text-secondary">kcal a day now</div></div>
          <div><div className="text-headline tabular-nums">{fmt(c.kcalPerDay.new)}</div><div className="text-footnote text-secondary">kcal a day new</div></div>
        </div>
        {c.fixed.length > 0 && <p className="px-4 py-2.5 text-subhead"><span className="text-green">Fixes:</span> {names(c.fixed)}</p>}
        {c.broke.length > 0 && <p className="px-4 py-2.5 text-subhead"><span className="text-orange">Now off target:</span> {names(c.broke)}</p>}
      </GroupedList>
      <GroupedList header={changed.length ? 'What changes' : undefined} footer={changed.length ? undefined : 'Nothing on the list changes.'}>
        {changed.map((r) => <CompareRowView key={r.foodId} row={r} />)}
      </GroupedList>
      {same.length > 0 && (
        <GroupedList header="Stays the same">
          {same.map((r) => (
            <div key={r.foodId} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
              <span className="text-body">{r.name}</span>
              <span className="text-subhead text-secondary">{fmt(r.newGrams)} g</span>
            </div>
          ))}
        </GroupedList>
      )}
      <div className="mx-4 flex gap-3">
        <button type="button" onClick={onClose} className="min-h-[50px] flex-1 rounded-[12px] bg-fill text-headline text-tint">Keep current</button>
        <button type="button" onClick={onApply} className="min-h-[50px] flex-1 rounded-[12px] bg-tint text-headline font-semibold text-white">Apply</button>
      </div>
    </Sheet>
  );
}

function CompareRowView({ row }: { row: ReturnType<typeof compare>['rows'][number] }) {
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body">{row.name}</span>
        <span className={`text-footnote font-semibold ${CHANGE_COLOR[row.change]}`}>{CHANGE_TEXT[row.change]}</span>
      </div>
      <div className="mt-0.5 grid grid-cols-2 gap-3 text-footnote text-secondary">
        <span>Now: {row.nowGrams ? `${fmt(row.nowGrams)} g` : '—'}<span className="block">{row.nowItems}</span></span>
        <span>New: {row.newGrams ? `${fmt(row.newGrams)} g` : '—'}<span className="block">{row.newItems}</span></span>
      </div>
    </div>
  );
}
