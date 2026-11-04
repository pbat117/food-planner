import { reanalyze, type WeekPlan } from '@/engine/planWeek';
import { roundAmount } from '@/engine/rounding';

/** The plan with one food fixed at `grams`, re-analyzed without re-solving. */
export function withLockedAmount(plan: WeekPlan, foodId: string, grams: number): WeekPlan {
  const items = plan.items.map((i) => (i.foodId === foodId ? roundAmount(foodId, grams, true) : i));
  const input = { ...plan.input, locks: { ...plan.input.locks, [foodId]: grams } };
  return { ...plan, items, input, report: reanalyze(items, input) };
}
