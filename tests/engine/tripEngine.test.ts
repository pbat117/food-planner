import { describe, expect, it } from 'vitest';
import { getFood } from '@/data/foods';
import { analyze } from '@/engine/analyze';
import { optimize } from '@/engine/optimizer';
import { planWeek } from '@/engine/planWeek';
import { buildWeeklyList } from '@/engine/weeklyList';
import { base, targets } from '../fixtures';

describe('engine trip support', () => {
  it('tripDays scales per-food caps', async () => {
    const plan = await planWeek({ ...base, tripDays: 3, includeFoodIds: ['kiwi'] });
    const kiwi = plan.items.find((i) => i.foodId === 'kiwi');
    expect(kiwi).toBeDefined();
    // 300 g weekly cap × 3/7 = 129 g; rounding to whole kiwis (75 g) can add at most one.
    expect(kiwi!.grams).toBeLessThanOrEqual(150);
  }, 30000);

  it('fruit rule scales with tripDays', async () => {
    const fruitOf = (a: Record<string, number>) => Object.entries(a).filter(([id]) => getFood(id).category === 'fruit').reduce((s, [, g]) => s + g, 0);
    const week = fruitOf((await optimize({ ...base, fruit: { gramsPerDay: 300, maxKinds: 4 } })).amounts);
    const trip = fruitOf((await optimize({ ...base, tripDays: 3, fruit: { gramsPerDay: 300, maxKinds: 4 } })).amounts);
    // Per-fruit caps bind before 300 g/day, so the trip gets the 7-day amount scaled to 3 days, never more than 900 g.
    expect(trip).toBeGreaterThan(week * (3 / 7) - 30);
    expect(trip).toBeLessThanOrEqual(900.5);
  }, 30000);

  it('background counts in the report but not in items or the food limit', async () => {
    const plan = await planWeek({ ...base, maxDistinctFoods: 6, background: { tofu: 2000 } });
    expect(plan.items.map((i) => i.foodId)).not.toContain('tofu');
    expect(plan.items.length).toBeLessThanOrEqual(6);
    const fromBg = plan.report.lines.protein.sources.find((s) => s.label === 'Earlier trips');
    expect(fromBg?.amount).toBeCloseTo((getFood('tofu').per100g.protein ?? 0) * 20, 0);
  }, 30000);

  it('windowDays scales supplements', () => {
    const r = analyze({}, [], [{ nutrient: 'vitD', dailyDose: 25, label: 'D3' }], targets, { windowDays: 3 });
    expect(r.lines.vitD.total).toBe(75);
  });

  it('daily average divides by windowDays', async () => {
    const plan = await planWeek({ ...base, tripDays: 3, windowDays: 3 });
    const list = buildWeeklyList(plan);
    expect(Math.abs(list.dailyAverage.kcal - plan.report.lines.energy.total / 3)).toBeLessThanOrEqual(1);
  }, 30000);

  it('defaults are unchanged without trip fields', () => {
    const a = analyze({ milk: 1000 }, [], [{ nutrient: 'vitD', dailyDose: 25, label: 'D3' }], targets);
    expect(a.lines.vitD.sources.find((s) => s.kind === 'supplement')!.amount).toBe(175);
  });
});

describe('trip list text', () => {
  it('supplement doses follow the trip length', async () => {
    const plan = await planWeek({ ...base, tripDays: 3, windowDays: 3, supplements: [{ nutrient: 'vitD', dailyDose: 25, label: 'D3' }] });
    const rows = buildWeeklyList(plan).sections.flatMap((s) => s.rows);
    expect(rows.find((r) => r.foodId.startsWith('supp:'))!.itemsText).toBe('3 daily doses, per label');
  }, 30000);
});
