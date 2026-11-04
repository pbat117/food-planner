import { getFood } from '@/data/foods';
import type { WeekPlan } from '@/engine/planWeek';
import type { RoundedAmount } from '@/engine/rounding';
import type { NutrientId } from '@/engine/types';
import { itemsText } from '@/engine/weeklyList';

export type Change = 'added' | 'removed' | 'more' | 'less' | 'same';

export interface CompareRow {
  foodId: string;
  name: string;
  nowGrams: number;
  newGrams: number;
  nowItems: string;
  newItems: string;
  change: Change;
}

export interface CompareSummary {
  rows: CompareRow[];
  kcalPerDay: { now: number; new: number };
  fixed: NutrientId[];
  broke: NutrientId[];
}

const NONE = '—';

function byFood(items: RoundedAmount[]): Map<string, RoundedAmount> {
  return new Map(items.map((i) => [i.foodId, i]));
}

/** Now vs New: every food in either plan, what changed, and which nutrients got fixed or newly fell short. */
export function compare(now: WeekPlan, next: WeekPlan): CompareSummary {
  const a = byFood(now.items);
  const b = byFood(next.items);
  const ids = [...new Set([...a.keys(), ...b.keys()])];
  const rows = ids.map<CompareRow>((id) => {
    const f = getFood(id);
    const x = a.get(id);
    const y = b.get(id);
    const nowGrams = x?.grams ?? 0;
    const newGrams = y?.grams ?? 0;
    const change: Change = !x ? 'added' : !y ? 'removed' : newGrams > nowGrams ? 'more' : newGrams < nowGrams ? 'less' : 'same';
    return {
      foodId: id,
      name: f.name,
      nowGrams,
      newGrams,
      nowItems: x ? itemsText(f, x.grams, x.units) : NONE,
      newItems: y ? itemsText(f, y.grams, y.units) : NONE,
      change,
    };
  });
  rows.sort((p, q) => Number(p.change === 'same') - Number(q.change === 'same') || p.name.localeCompare(q.name));

  const fixed: NutrientId[] = [];
  const broke: NutrientId[] = [];
  for (const id of Object.keys(next.report.lines) as NutrientId[]) {
    const before = now.report.lines[id]?.status;
    const after = next.report.lines[id].status;
    if (!before) continue;
    if (before !== 'ok' && after === 'ok') fixed.push(id);
    if (before === 'ok' && after !== 'ok') broke.push(id);
  }

  const day = (p: WeekPlan) => Math.round(p.report.lines.energy.total / 7);
  return { rows, kcalPerDay: { now: day(now), new: day(next) }, fixed, broke };
}
