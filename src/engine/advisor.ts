import { FOODS } from '@/data/foods';
import { NUTRIENTS } from '@/data/nutrients';
import { planWeek, type WeekPlan } from './planWeek';
import type { NutrientId, NutrientReport, RecipeUse, SourceKind } from './types';

export interface FoodSuggestion {
  nutrient: NutrientId;
  foodId: string;
  addGrams: number;
  newPercent: number;
  addedKcal: number;
  liked: boolean;
}

export interface ExcessExplanation {
  nutrient: NutrientId;
  percentOfMax: number;
  topSources: { label: string; kind: SourceKind; share: number }[];
  hints: string[];
}

export interface ComboSuggestion {
  recipes: { recipeId: string; count: number }[];
  fixes: NutrientId[];
  summary: string;
}

const CAPPED: NutrientId[] = ['sodium', 'satFat', 'addedSugar'];

/** Up to `limit` foods that would close a nutrient gap: liked first, then ones that fully fix it, then fewest calories. */
export function suggestForLow(plan: WeekPlan, nutrient: NutrientId, limit = 3): FoodSuggestion[] {
  const { lines } = plan.report;
  const line = lines[nutrient];
  if (!line.target || line.total >= line.target) return [];
  const gap = line.target - line.total;
  const lowBelow = plan.input.targets.nutrients[nutrient].lowBelow ?? line.target;
  const disliked = new Set(plan.input.dislikedFoodIds);
  const liked = new Set(plan.input.likedFoodIds);
  const current = new Map(plan.items.map((i) => [i.foodId, i.grams]));

  const out: (FoodSuggestion & { fixes: boolean })[] = [];
  for (const f of FOODS) {
    const per100 = f.per100g[nutrient] ?? 0;
    if (disliked.has(f.id) || per100 <= 0) continue;
    const room = f.maxWeeklyGrams - (current.get(f.id) ?? 0);
    if (room <= 0) continue;
    const addGrams = Math.min(room, Math.ceil(gap / (per100 / 100) / 10) * 10);
    const breaksCap = CAPPED.some((c) => {
      const max = lines[c].max;
      return max !== undefined && lines[c].total + ((f.per100g[c] ?? 0) * addGrams) / 100 > max;
    });
    if (breaksCap) continue;
    const newTotal = line.total + (per100 * addGrams) / 100;
    out.push({
      nutrient,
      foodId: f.id,
      addGrams,
      newPercent: (newTotal / line.target) * 100,
      addedKcal: ((f.per100g.energy ?? 0) * addGrams) / 100,
      liked: liked.has(f.id),
      fixes: newTotal >= lowBelow,
    });
  }

  out.sort((a, b) => Number(b.liked) - Number(a.liked) || Number(b.fixes) - Number(a.fixes) || a.addedKcal - b.addedKcal);
  return out.slice(0, limit).map(({ fixes: _fixes, ...s }) => s);
}

function recipeLabel(r: RecipeUse): string {
  return `${r.name} (${r.count}×)`;
}

/** Where an excess comes from, and what to change. */
export function explainHigh(plan: WeekPlan, nutrient: NutrientId): ExcessExplanation {
  const line = plan.report.lines[nutrient];
  const total = line.total || 1;
  const topSources = line.sources.slice(0, 3).map((s) => ({ label: s.label, kind: s.kind, share: s.amount / total }));

  const hints = topSources.map((s) => {
    if (s.kind === 'recipe') {
      const r = plan.input.recipes.find((x) => recipeLabel(x) === s.label);
      if (r && r.count > 1) return `Make ${r.name} ${r.count - 1}× instead of ${r.count}×`;
      return `Remove ${r?.name ?? s.label} this week`;
    }
    if (s.kind === 'supplement') return `Lower the ${s.label.replace(/^💊 /, '')} dose`;
    return `Reduce ${s.label}`;
  });

  return {
    nutrient,
    percentOfMax: line.max ? (line.total / line.max) * 100 : 0,
    topSources,
    hints,
  };
}

function score(report: NutrientReport): [number, number] {
  let issues = 0;
  let deficit = 0;
  for (const l of Object.values(report.lines)) {
    if (l.status !== 'ok') issues++;
    if (l.status === 'low' && l.target) deficit += (l.target - l.total) / l.target;
    if (l.status === 'high' && l.max) deficit += (l.total - l.max) / l.max;
  }
  return [issues, deficit];
}

function better(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1] - 1e-9);
}

function lowerFirst(s: string): string {
  return s.length > 1 && s[1] === s[1].toLowerCase() ? s[0].toLowerCase() + s.slice(1) : s;
}

function times(n: number): string {
  return n === 1 ? 'once' : n === 2 ? 'twice' : `${n}×`;
}

function listJoin(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Tries each recipe at one batch fewer, and each recipe removed; returns up to 3 variants that beat the current plan. */
export async function suggestRecipeCombos(plan: WeekPlan): Promise<ComboSuggestion[]> {
  const recipes = plan.input.recipes;
  if (!recipes.length) return [];
  const currentScore = score(plan.report);

  const variants: { recipes: RecipeUse[]; describe: string }[] = [];
  recipes.forEach((r, i) => {
    if (r.count > 1) {
      variants.push({
        recipes: recipes.map((x, j) => (j === i ? { ...x, count: x.count - 1 } : x)),
        describe: `Making ${r.name} ${times(r.count - 1)} instead of ${times(r.count)}`,
      });
    }
    variants.push({ recipes: recipes.filter((_, j) => j !== i), describe: `Dropping ${r.name} this week` });
  });

  const results: (ComboSuggestion & { score: [number, number] })[] = [];
  for (const v of variants) {
    const p = await planWeek({ ...plan.input, recipes: v.recipes });
    const s = score(p.report);
    if (!better(s, currentScore)) continue;
    const fixes = (Object.keys(plan.report.lines) as NutrientId[]).filter(
      (id) => plan.report.lines[id].status !== 'ok' && p.report.lines[id].status === 'ok',
    );
    const names = fixes.map((id) => lowerFirst(NUTRIENTS[id].name));
    results.push({
      recipes: v.recipes.map((r) => ({ recipeId: r.recipeId, count: r.count })),
      fixes,
      summary: fixes.length ? `${v.describe} fixes ${listJoin(names)}.` : `${v.describe} gets closer to your targets.`,
      score: s,
    });
  }

  results.sort((a, b) => (better(a.score, b.score) ? -1 : better(b.score, a.score) ? 1 : 0));
  return results.slice(0, 3).map(({ score: _s, ...r }) => r);
}
