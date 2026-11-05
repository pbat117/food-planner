import { getFood } from '@/data/foods';
import type {
  NutrientId, NutrientLine, NutrientReport, RecipeUse, SourceKind, Status, SupplementUse, WeeklyTargets,
} from './types';

type Source = { label: string; kind: SourceKind; amount: number };

function statusOf(total: number, lowBelow?: number, max?: number): Status {
  if (max !== undefined && total > max) return 'high';
  if (lowBelow !== undefined && total < lowBelow) return 'low';
  return 'ok';
}

/**
 * Totals the week's nutrients. `amounts` is foodId → weekly grams (free foods, bowls, locks);
 * recipes contribute their batch ingredients × count; supplements contribute dailyDose × 7.
 */
export const EARLIER_TRIPS = 'Earlier trips';

export function analyze(
  amounts: Record<string, number>,
  recipes: RecipeUse[],
  supplements: SupplementUse[],
  targets: WeeklyTargets,
  opts: { windowDays?: number; background?: Record<string, number> } = {},
): NutrientReport {
  const windowDays = opts.windowDays ?? 7;
  const ids = Object.keys(targets.nutrients) as NutrientId[];
  const sources = new Map<NutrientId, Source[]>(ids.map((id) => [id, []]));

  const addFoodGrams = (foodId: string, grams: number, bucket: Map<NutrientId, number>) => {
    const f = getFood(foodId);
    for (const id of ids) bucket.set(id, (bucket.get(id) ?? 0) + ((f.per100g[id] ?? 0) * grams) / 100);
  };
  const flush = (bucket: Map<NutrientId, number>, label: string, kind: SourceKind) => {
    for (const [id, amount] of bucket) if (amount > 0) sources.get(id)!.push({ label, kind, amount });
  };

  for (const [foodId, grams] of Object.entries(amounts)) {
    if (!(grams > 0)) continue;
    const bucket = new Map<NutrientId, number>();
    const name = getFood(foodId).name;
    addFoodGrams(foodId, grams, bucket);
    flush(bucket, name, 'food');
  }

  for (const r of recipes) {
    if (!(r.count > 0)) continue;
    const bucket = new Map<NutrientId, number>();
    const label = `${r.name} (${r.count}×)`;
    for (const ing of r.ingredients) addFoodGrams(ing.foodId, ing.grams * r.count, bucket);
    flush(bucket, label, 'recipe');
  }

  if (opts.background) {
    const bucket = new Map<NutrientId, number>();
    for (const [foodId, grams] of Object.entries(opts.background)) if (grams > 0) addFoodGrams(foodId, grams, bucket);
    flush(bucket, EARLIER_TRIPS, 'recipe');
  }

  for (const s of supplements) {
    sources.get(s.nutrient)!.push({ label: `💊 ${s.label}`, kind: 'supplement', amount: s.dailyDose * windowDays });
  }

  const lines = {} as Record<NutrientId, NutrientLine>;
  for (const id of ids) {
    const t = targets.nutrients[id];
    const src = sources.get(id)!.sort((a, b) => b.amount - a.amount);
    const total = src.reduce((sum, s) => sum + s.amount, 0);
    lines[id] = {
      id,
      total,
      target: t.target,
      max: t.max,
      percent: t.target ? (total / t.target) * 100 : undefined,
      status: statusOf(total, t.lowBelow, t.max),
      sources: src,
    };
  }

  const weeklyCalories = lines.energy.total;
  return { lines, weeklyCalories, dailyCalories: weeklyCalories / windowDays };
}
