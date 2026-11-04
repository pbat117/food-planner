/**
 * Prints a sample week for review in the terminal.
 *   npx tsx scripts/sample-week.ts [path/to/input.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { getFood } from '@/data/foods';
import { NUTRIENTS, UNTRACKED_NUTRIENTS } from '@/data/nutrients';
import { explainHigh, suggestForLow } from '@/engine/advisor';
import { planWeek } from '@/engine/planWeek';
import { computeWeeklyTargets } from '@/engine/targets';
import type { NutrientId, PlanInput, Profile, SupplementUse } from '@/engine/types';

interface SampleInput {
  profile: Profile; liked: string[]; disliked: string[]; maxDistinctFoods: number;
  fruit?: PlanInput['fruit']; supplements?: SupplementUse[]; supplementedNutrients?: NutrientId[];
}

const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const fmt = (v: number) => (v >= 100 ? Math.round(v).toLocaleString('en-US') : v.toFixed(1));

async function main(): Promise<void> {
  const file = process.argv[2] ?? path.join(__dirname, 'sample-input.json');
  const input: SampleInput = JSON.parse(fs.readFileSync(file, 'utf8'));
  const targets = computeWeeklyTargets(input.profile);
  const t0 = Date.now();
  const plan = await planWeek({
    targets, likedFoodIds: input.liked, dislikedFoodIds: input.disliked, recipes: [], locks: {},
    supplements: input.supplements ?? [], supplementedNutrients: input.supplementedNutrients ?? [],
    maxDistinctFoods: input.maxDistinctFoods, fruit: input.fruit,
  });

  console.log(`\nWEEKLY LIST (${plan.items.length} foods, solved in ${Date.now() - t0} ms)\n`);
  console.log(`${pad('Food', 32)}${pad('Amount per week', 18)}Roughly`);
  console.log('-'.repeat(80));
  for (const i of plan.items) {
    const hint = i.dailyHint ? `  (${i.dailyHint})` : '';
    console.log(`${pad(getFood(i.foodId).name, 32)}${pad(`${Math.round(i.grams)} g`, 18)}${i.label}${hint}`);
  }

  const r = plan.report;
  console.log(`\nCALORIES  ${fmt(r.weeklyCalories)} kcal/week  ·  ${fmt(r.dailyCalories)} kcal/day average  ·  target ${targets.dailyCalories} kcal/day`);

  console.log(`\nNUTRIENTS\n`);
  console.log(`${pad('Nutrient', 28)}${pad('Week total', 16)}${pad('Target', 14)}${pad('%', 8)}Status`);
  console.log('-'.repeat(80));
  for (const id of Object.keys(r.lines) as NutrientId[]) {
    const l = r.lines[id];
    const meta = NUTRIENTS[id];
    const target = l.target !== undefined ? `${fmt(l.target)}` : l.max !== undefined ? `max ${fmt(l.max)}` : '-';
    const pct = l.percent !== undefined ? `${Math.round(l.percent)}%` : '';
    const status = l.status === 'low' ? 'LOW' : l.status === 'high' ? 'HIGH' : 'ok';
    console.log(`${pad(meta.name, 28)}${pad(`${fmt(l.total)} ${meta.unit}`, 16)}${pad(target, 14)}${pad(pct, 8)}${status}`);
  }
  console.log(`\nNot tracked (not enough USDA data): ${UNTRACKED_NUTRIENTS.join(', ')}`);

  const problems = (Object.keys(r.lines) as NutrientId[]).filter((id) => r.lines[id].status !== 'ok');
  if (problems.length) console.log('\nSUGGESTIONS\n');
  for (const id of problems) {
    const name = NUTRIENTS[id].name;
    if (r.lines[id].status === 'low') {
      const s = suggestForLow(plan, id)[0];
      console.log(s
        ? `- ${name} is low (${Math.round(r.lines[id].percent ?? 0)}%): add ${s.addGrams} g ${getFood(s.foodId).name} → ${Math.round(s.newPercent)}%${s.liked ? '' : ' (not on your liked list)'}${['energy','protein','carbs','fat','fiber'].includes(id) ? '' : ', or supplement it'}.`
        : `- ${name} is low: no single food fixes it without breaking a limit; consider a supplement.`);
    } else {
      const e = explainHigh(plan, id);
      console.log(`- ${name} is high (${Math.round(e.percentOfMax)}% of limit), mostly from ${e.topSources[0]?.label}: ${e.hints[0]}.`);
    }
  }
  console.log('');
}

main();
