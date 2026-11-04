'use client';

import { Pill } from 'lucide-react';
import { useState } from 'react';
import { getFood } from '@/data/foods';
import { explainHigh, suggestForLow } from '@/engine/advisor';
import type { WeekPlan } from '@/engine/planWeek';
import type { NutrientId, Status } from '@/engine/types';
import type { WeeklyList } from '@/engine/weeklyList';
import { GroupedList } from '@/ui/GroupedList';
import { Sheet } from '@/ui/Sheet';

const DOT: Record<Status, string> = { ok: 'bg-green', low: 'bg-orange', high: 'bg-red' };
const RANK: Record<Status, number> = { high: 0, low: 1, ok: 2 };

export function StatusDot({ status }: { status: Status }) {
  return <span aria-hidden className={`inline-block size-2.5 shrink-0 rounded-full ${DOT[status]}`} />;
}

export function NutrientReportSheet({
  open, onClose, plan, list, onAddFood, busy,
}: {
  open: boolean;
  onClose(): void;
  plan: WeekPlan;
  list: WeeklyList;
  onAddFood(foodId: string, addGrams: number): void;
  busy: boolean;
}) {
  const [openId, setOpenId] = useState<NutrientId | null>(null);
  const rows = [...list.coverage].sort((a, b) => RANK[a.status] - RANK[b.status] || a.name.localeCompare(b.name));
  const okCount = rows.filter((r) => r.status === 'ok').length;

  return (
    <Sheet open={open} onClose={onClose} title="Nutrient report">
      <p className="mx-8 mb-4 text-center text-subhead text-secondary">
        {okCount} of {rows.length} on target for the week. 90% or more counts as on target. Protein aims for your full goal.
      </p>
      <GroupedList footer="Percent of the weekly target. Sodium, saturated fat and added sugar show percent of the upper limit. Tap a nutrient that's low or high for ideas.">
        {rows.map((r) => {
          const expandable = r.status !== 'ok';
          const expanded = openId === r.nutrient;
          return (
            <div key={r.nutrient}>
              <button
                type="button"
                disabled={!expandable}
                aria-expanded={expandable ? expanded : undefined}
                onClick={() => setOpenId(expanded ? null : r.nutrient)}
                className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left enabled:active:bg-cell-pressed"
              >
                <StatusDot status={r.status} />
                <span className="flex-1 text-body">
                  {r.name}
                  {r.supplemented && (
                    <span className="ml-2 inline-flex items-center gap-1 align-middle text-footnote text-secondary">
                      <Pill aria-hidden className="size-3.5" />supplement
                    </span>
                  )}
                </span>
                <span className={`text-body tabular-nums ${r.status === 'ok' ? 'text-secondary' : r.status === 'low' ? 'text-orange' : 'text-red'}`}>
                  {Math.round(r.percent)}%
                </span>
              </button>
              {expanded && <Detail plan={plan} nutrient={r.nutrient} status={r.status} onAddFood={onAddFood} busy={busy} />}
            </div>
          );
        })}
      </GroupedList>
    </Sheet>
  );
}

function Detail({ plan, nutrient, status, onAddFood, busy }: {
  plan: WeekPlan; nutrient: NutrientId; status: Status; onAddFood(foodId: string, g: number): void; busy: boolean;
}) {
  if (status === 'low') {
    const ideas = suggestForLow(plan, nutrient);
    if (!ideas.length) return <p className="px-4 pb-3 pl-9 text-footnote text-secondary">No single food fixes this without breaking another limit. A supplement may be the easiest route.</p>;
    return (
      <ul className="pb-2 pl-9">
        {ideas.map((s) => (
          <li key={s.foodId} className="flex items-center gap-2 pr-4 py-1.5">
            <span className="flex-1 text-subhead">
              Add {s.addGrams} g {getFood(s.foodId).name.toLowerCase()}
              <span className="block text-footnote text-secondary">{Math.round(s.newPercent)}% after, +{Math.round(s.addedKcal / 7)} kcal a day</span>
            </span>
            <button type="button" disabled={busy} onClick={() => onAddFood(s.foodId, s.addGrams)}
              className="min-h-9 rounded-full bg-fill px-4 text-subhead font-semibold text-tint disabled:opacity-40">Add</button>
          </li>
        ))}
      </ul>
    );
  }
  const ex = explainHigh(plan, nutrient);
  return (
    <div className="pb-3 pl-9 pr-4 text-subhead">
      <p className="text-footnote text-secondary">Mostly from {ex.topSources.map((s) => `${s.label} (${Math.round(s.share * 100)}%)`).join(', ')}.</p>
      <ul className="mt-1 list-disc pl-4">
        {ex.hints.map((h) => <li key={h}>{h}</li>)}
      </ul>
    </div>
  );
}
