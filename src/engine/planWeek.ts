import { analyze } from './analyze';
import { optimize } from './optimizer';
import { type RoundedAmount, roundAmount, sortByAisle } from './rounding';
import type { NutrientId, NutrientReport, PlanInput } from './types';

export interface WeekPlan {
  items: RoundedAmount[];
  report: NutrientReport;
  relaxed: NutrientId[];
  input: PlanInput;
}

/** "Re-analyze only": nutrient report for the given amounts, without re-optimizing. */
export function reanalyze(items: RoundedAmount[], input: PlanInput): NutrientReport {
  const amounts: Record<string, number> = {};
  for (const i of items) amounts[i.foodId] = (amounts[i.foodId] ?? 0) + i.grams;
  return analyze(amounts, input.recipes, input.supplements, input.targets);
}

/** optimize → round to buyable units → analyze what will actually be bought. */
export async function planWeek(input: PlanInput): Promise<WeekPlan> {
  const result = await optimize(input);
  const items = sortByAisle(
    Object.entries(result.amounts).filter(([, g]) => g > 0).map(([id, g]) => roundAmount(id, g, id in input.locks)),
  );
  return { items, report: reanalyze(items, input), relaxed: result.relaxed, input };
}
