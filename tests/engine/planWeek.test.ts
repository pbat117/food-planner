import { describe, expect, it } from 'vitest';
import { planWeek, reanalyze } from '@/engine/planWeek';
import { analyze } from '@/engine/analyze';
import { getFood } from '@/data/foods';
import { base } from '../fixtures';

const AISLES = ['Produce', 'Meat & Fish', 'Dairy & Eggs', 'Pantry', 'Frozen'];

describe('planWeek', () => {
  it('report reflects rounded grams, not raw optimizer grams', async () => {
    const p = await planWeek(base);
    const direct = analyze(Object.fromEntries(p.items.map((i) => [i.foodId, i.grams])), base.recipes, base.supplements, base.targets);
    expect(p.report.lines.energy.total).toBeCloseTo(direct.lines.energy.total);
  });
  it('reanalyze uses edited amounts without re-optimizing', async () => {
    const p = await planWeek(base);
    const edited = p.items.map((i) => (i.foodId === p.items[0].foodId ? { ...i, grams: i.grams * 2 } : i));
    expect(reanalyze(edited, base).lines.energy.total).toBeGreaterThan(p.report.lines.energy.total);
  });
  it('items are sorted by aisle then name', async () => {
    const p = await planWeek(base);
    const keys = p.items.map((i) => [AISLES.indexOf(getFood(i.foodId).aisle), getFood(i.foodId).name] as const);
    const sorted = [...keys].sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
    expect(keys).toEqual(sorted);
  });
  it('locked items keep their exact grams and are flagged', async () => {
    const p = await planWeek({ ...base, locks: { banana: 650 } });
    expect(p.items.find((i) => i.foodId === 'banana')).toMatchObject({ grams: 650, locked: true });
  });
});
