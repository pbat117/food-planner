import highsLoader from 'highs';
import { FOODS, getFood } from '@/data/foods';
import { analyze } from './analyze';
import type { Food, NutrientId, OptimizeResult, PlanInput } from './types';

type Highs = Awaited<ReturnType<typeof highsLoader>>;
let highsPromise: Promise<Highs> | null = null;
function loadHighs(): Promise<Highs> {
  highsPromise ??= highsLoader();
  return highsPromise;
}

const HARD = 1000; // weight for constraints that should only break when unavoidable
// Per gram of food: 100 g costs as much as missing 1% of one nutrient, so the plan stays a realistic amount of food.
const TIE_BREAK = 1e-4;
/** Protein above this multiple of the goal is mildly penalized (lots of extra meat is costly, not useful). */
const PROTEIN_SOFT_CAP = 2;
const EPS = 1e-6;
/** Aim slightly under every cap so rounding to store units doesn't tip a nutrient into 'high'. */
const CAP_MARGIN = 0.99;

interface Model {
  lp: string;
  candidates: Food[];
  /** slack variable name → nutrient it relaxes */
  relaxVars: Map<string, NutrientId>;
}

function num(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toPrecision(12).replace(/\.?0+$/, '');
}

/** Builds the mixed-integer LP (CPLEX LP format). Exported for inspection in tests. */
export function buildLp(input: PlanInput): Model {
  const { targets } = input;
  const disliked = new Set(input.dislikedFoodIds);
  const lockedIds = new Set(Object.keys(input.locks));
  const pool = input.likedFoodIds.length ? input.likedFoodIds.map(getFood) : FOODS;
  const candidates = pool.filter((f) => !disliked.has(f.id) && !lockedIds.has(f.id));
  const candidateIds = new Set(candidates.map((f) => f.id));

  // Fixed contributions: recipes, locks, supplements.
  const fixedAmounts = Object.fromEntries(Object.entries(input.locks));
  const fixed = analyze(fixedAmounts, input.recipes, input.supplements, targets).lines;

  const objective: string[] = [];
  const rows: string[] = [];
  const bounds: string[] = [];
  const binaries: string[] = [];
  const relaxVars = new Map<string, NutrientId>();

  const sumTerms = (id: NutrientId): string[] => candidates.flatMap((f, i) => {
    const a = (f.per100g[id] ?? 0) / 100;
    return Math.abs(a) > 1e-12 ? [`+ ${num(a)} x${i}`] : [];
  });

  candidates.forEach((f, i) => {
    objective.push(`+ ${num(TIE_BREAK)} x${i}`);
    rows.push(`lo${i}: x${i} - ${num(f.minGrams)} y${i} >= 0`);
    rows.push(`hi${i}: x${i} - ${num(f.maxWeeklyGrams)} y${i} <= 0`);
    bounds.push(`0 <= x${i} <= ${num(f.maxWeeklyGrams)}`);
    binaries.push(`y${i}`);
  });

  const recipeFoodsOutside = new Set(
    input.recipes.flatMap((r) => r.ingredients.map((g) => g.foodId)).filter((id) => !candidateIds.has(id)),
  );
  const maxNew = Math.max(0, input.maxDistinctFoods - lockedIds.size - recipeFoodsOutside.size);
  if (candidates.length) rows.push(`distinct: ${candidates.map((_, i) => `+ y${i}`).join(' ')} <= ${maxNew}`);

  const supplemented = new Set(input.supplementedNutrients);
  (Object.keys(targets.nutrients) as NutrientId[]).forEach((id, k) => {
    const t = targets.nutrients[id];
    const F = fixed[id].total;
    const terms = sumTerms(id);
    const lhs = terms.length ? terms.join('\n ') : '0 x0';

    if (id === 'energy') {
      const w = HARD / t.target!;
      rows.push(`elo: ${lhs}\n + 1 elo >= ${num(t.lowBelow! - F)}`);
      rows.push(`ehi: ${lhs}\n - 1 ehi <= ${num(CAP_MARGIN * t.max! - F)}`);
      objective.push(`+ ${num(w)} elo`, `+ ${num(w)} ehi`);
      relaxVars.set('elo', 'energy').set('ehi', 'energy');
      return;
    }

    if (t.target !== undefined && !supplemented.has(id) && t.target - F > EPS) {
      const w = (id === 'protein' ? HARD : 1) / t.target;
      rows.push(`t${k}: ${lhs}\n + 1 da${k} + 1 db${k} >= ${num(t.target - F)}`);
      bounds.push(`0 <= da${k} <= ${num(0.1 * t.target)}`);
      objective.push(`+ ${num(w)} da${k}`, `+ ${num(10 * w)} db${k}`);
      if (id === 'protein') relaxVars.set(`da${k}`, 'protein').set(`db${k}`, 'protein');
    }

    if (t.max !== undefined) {
      rows.push(`m${k}: ${lhs}\n - 1 s${k} <= ${num(CAP_MARGIN * t.max - F)}`);
      objective.push(`+ ${num(HARD / t.max)} s${k}`);
      relaxVars.set(`s${k}`, id);
    }

    if (id === 'protein' && t.target !== undefined) {
      rows.push(`pc: ${lhs}\n - 1 pover <= ${num(PROTEIN_SOFT_CAP * t.target - F)}`);
      objective.push(`+ ${num(1 / t.target)} pover`);
    }
  });

  const lp = [
    'Minimize',
    ` obj: ${objective.join('\n ')}`,
    'Subject To',
    ...rows.map((r) => ` ${r}`),
    'Bounds',
    ...bounds.map((b) => ` ${b}`),
    ...(binaries.length ? ['Binary', ` ${binaries.join(' ')}`] : []),
    'End',
  ].join('\n');

  return { lp, candidates, relaxVars };
}

async function solveOnce(input: PlanInput): Promise<OptimizeResult | null> {
  const highs = await loadHighs();
  const { lp, candidates, relaxVars } = buildLp(input);
  let sol: ReturnType<Highs['solve']>;
  try {
    sol = highs.solve(lp, { time_limit: 5, mip_rel_gap: 0.01, output_flag: false });
  } catch {
    return null; // malformed model (e.g. NaN input) → caller falls back
  }
  const ok = sol.Status === 'Optimal' || sol.Status === 'Time limit reached';
  if (!ok) return null;
  const col = (name: string): number => (sol.Columns[name] as { Primal?: number } | undefined)?.Primal ?? 0;
  if (sol.Status === 'Time limit reached' && candidates.length && !(`x0` in sol.Columns)) return null;

  const amounts: Record<string, number> = {};
  candidates.forEach((f, i) => {
    const g = col(`x${i}`);
    if (g > 0.5) amounts[f.id] = g;
  });
  Object.assign(amounts, input.locks);

  const relaxed = new Set<NutrientId>();
  for (const [name, id] of relaxVars) if (col(name) > EPS) relaxed.add(id);

  return { amounts, relaxed: [...relaxed], status: sol.Status === 'Optimal' ? 'optimal' : 'timeLimit' };
}

/** Picks weekly food amounts. Never throws for infeasibility: worst case returns locks only. */
export async function optimize(input: PlanInput): Promise<OptimizeResult> {
  const first = await solveOnce(input);
  if (first) return first;
  const second = await solveOnce({ ...input, maxDistinctFoods: input.maxDistinctFoods + 5 });
  if (second) return second;

  const report = analyze(input.locks, input.recipes, input.supplements, input.targets);
  const relaxed = (Object.keys(report.lines) as NutrientId[]).filter((id) => report.lines[id].status === 'low');
  return { amounts: { ...input.locks }, relaxed, status: 'fallback' };
}
