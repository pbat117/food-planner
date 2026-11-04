import { getFood } from '@/data/foods';
import { NUTRIENTS } from '@/data/nutrients';
import { suggestForLow } from './advisor';
import type { WeekPlan } from './planWeek';
import type { Food, NutrientId, Section, Status } from './types';

export type ListSectionTitle = Section | 'Supplements and extras';

export interface ListRow {
  foodId: string;
  name: string;
  grams: number;
  gramsText: string;
  itemsText: string;
  locked: boolean;
  dailyHint?: string;
}

export interface ListSection {
  title: ListSectionTitle;
  rows: ListRow[];
}

export interface DailyAverage {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface CoverageRow {
  nutrient: NutrientId;
  name: string;
  percent: number;
  status: Status;
  supplemented: boolean;
}

export interface WeeklyList {
  sections: ListSection[];
  dailyAverage: DailyAverage;
  weeklyKcal: number;
  coverage: CoverageRow[];
  notes: string[];
}

export const SECTION_ORDER: ListSectionTitle[] = [
  'Meat', 'Fruit', 'Vegetables and beans', 'Grains', 'Dairy', 'Nuts and nut butter', 'Other', 'Supplements and extras',
];

/** Units you'd actually see on a shelf, so "About 3 packs of 454 g" reads naturally. */
const PACKAGE_UNITS = new Set(['pack', 'can', 'bag', 'box', 'block', 'container', 'small container', 'tub', 'jar', 'bottle', 'carton', 'pint']);

export const IODIZED_SALT_NOTE = "Use iodized salt when you cook — iodine isn't tracked in the food data.";
export const ESTIMATES_NOTE = 'Package sizes vary, so the grams are the amounts to go by.';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const round50 = (n: number) => Math.round(n / 50) * 50;
const plural = (word: string, n: number) => (n === 1 ? word : `${word}s`);

const OTHER_FORM: Partial<Record<Food['basis'], string>> = { raw: 'cooked', dry: 'cooked', cooked: 'dry' };

/** "1,350 g raw (about 1,000 g cooked)", "800 g drained", "600 g". */
export function gramsText(food: Food, grams: number): string {
  const main = food.basis === 'as sold' ? `${fmt(grams)} g` : `${fmt(grams)} g ${food.basis}`;
  const other = OTHER_FORM[food.basis];
  if (food.yield && other) return `${main} (about ${fmt(round50(grams * food.yield))} g ${other})`;
  return main;
}

/** The "Estimated items" column. */
export function itemsText(food: Food, grams: number, units: number): string {
  const { unit } = food;
  if (food.package) {
    const { name, grams: pg } = food.package;
    const p = grams / pg;
    const pkg = p < 0.5 ? `under half a ${pg} g ${name}` : `about ${Math.max(1, Math.round(p))} ${plural(name, Math.max(1, Math.round(p)))} of ${pg} g`;
    return `about ${units} ${units === 1 ? unit.name : unit.plural || unit.name}, ${pkg}`;
  }
  if (!unit.name) return `${units}`;
  const baseName = unit.name.replace(/, drained$/, '');
  if (PACKAGE_UNITS.has(baseName)) {
    const n = Math.max(1, Math.round(units));
    const pl = (unit.plural || unit.name).replace(/, drained$/, '');
    return `About ${n} ${n === 1 ? baseName : pl} of ${unit.grams} g`;
  }
  const word = units === 1 ? unit.name : unit.plural || unit.name;
  if (food.roundTo === 'unit') return `${units} ${word}`;
  return units < 0.5 ? `${fmt(grams)} g` : `about ${units} ${word}`;
}

/** WeekPlan → the weekly list in the format of the user's sample. */
export function buildWeeklyList(plan: WeekPlan): WeeklyList {
  const bySection = new Map<ListSectionTitle, ListRow[]>();
  for (const item of plan.items) {
    const f = getFood(item.foodId);
    const row: ListRow = {
      foodId: f.id,
      name: f.name,
      grams: item.grams,
      gramsText: gramsText(f, item.grams),
      itemsText: itemsText(f, item.grams, item.units),
      locked: item.locked,
      ...(item.dailyHint ? { dailyHint: item.dailyHint } : {}),
    };
    if (!bySection.has(f.section)) bySection.set(f.section, []);
    bySection.get(f.section)!.push(row);
  }
  const supps = plan.input.supplements.map<ListRow>((s) => ({
    foodId: `supp:${s.nutrient}`,
    name: s.label,
    grams: 0,
    gramsText: `${s.dailyDose.toLocaleString('en-US')} ${NUTRIENTS[s.nutrient].unit} a day`,
    itemsText: '7 daily doses, per label',
    locked: true,
  }));
  if (supps.length) bySection.set('Supplements and extras', supps);

  const sections = SECTION_ORDER.filter((t) => bySection.get(t)?.length).map((title) => ({
    title,
    rows: title === 'Supplements and extras' ? bySection.get(title)! : bySection.get(title)!.sort((a, b) => a.name.localeCompare(b.name)),
  }));

  const { lines } = plan.report;
  const supplemented = new Set(plan.input.supplementedNutrients);
  const coverage: CoverageRow[] = [];
  for (const id of Object.keys(lines) as NutrientId[]) {
    if (id === 'energy') continue;
    const l = lines[id];
    const of = l.target || l.max;
    if (!of) continue;
    coverage.push({ nutrient: id, name: NUTRIENTS[id].name, percent: (l.total / of) * 100, status: l.status, supplemented: supplemented.has(id) });
  }

  const notes: string[] = [];
  for (const c of coverage) {
    if (c.status === 'low' && !c.supplemented) {
      const s = suggestForLow(plan, c.nutrient, 1)[0];
      const pct = Math.round(c.percent);
      notes.push(s ? `${c.name} is at ${pct}% — ${getFood(s.foodId).name}, about ${s.addGrams} g more` : `${c.name} is at ${pct}%`);
    } else if (c.status === 'high') {
      notes.push(`${c.name} is over the limit (${Math.round(c.percent)}% of the max)`);
    }
  }
  notes.push(IODIZED_SALT_NOTE, ESTIMATES_NOTE);

  const day = (id: NutrientId) => Math.round(lines[id].total / 7);
  return {
    sections,
    dailyAverage: { kcal: day('energy'), protein: day('protein'), carbs: day('carbs'), fat: day('fat'), fiber: day('fiber') },
    weeklyKcal: Math.round(lines.energy.total),
    coverage,
    notes,
  };
}
