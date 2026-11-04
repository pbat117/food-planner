import { describe, expect, it } from 'vitest';
import { analyze } from '@/engine/analyze';
import { getFood } from '@/data/foods';
import { targets } from '../fixtures';

describe('analyze', () => {
  it('sums foods per 100 g', () => {
    const r = analyze({ banana: 700 }, [], [], targets);
    expect(r.lines.potassium.total).toBeCloseTo(getFood('banana').per100g.potassium! * 7);
  });
  it('adds recipes × count and supplements × 7', () => {
    const recipe = { recipeId: 'r1', name: 'Tikka', ingredients: [{ foodId: 'chicken-breast', grams: 500 }], count: 2 };
    const r = analyze({}, [recipe], [{ nutrient: 'vitD', dailyDose: 25, label: 'Vitamin D 1000 IU' }], targets);
    expect(r.lines.protein.total).toBeCloseTo(getFood('chicken-breast').per100g.protein! * 10);
    expect(r.lines.vitD.sources.find((s) => s.kind === 'supplement')!.amount).toBe(175);
    expect(r.lines.vitD.sources.find((s) => s.kind === 'supplement')!.label).toBe('💊 Vitamin D 1000 IU');
    expect(r.lines.protein.sources[0].label).toBe('Tikka (2×)');
  });
  it('merges the same food from free amounts into one source line', () => {
    const r = analyze({ banana: 300 }, [], [], targets);
    expect(r.lines.potassium.sources).toHaveLength(1);
    expect(r.lines.potassium.sources[0]).toMatchObject({ label: 'Bananas', kind: 'food' });
  });
  it('status thresholds', () => {
    const r = analyze({ banana: 100 }, [], [], targets);
    expect(r.lines.vitC.status).toBe('low');
    const salty = analyze({}, [], [{ nutrient: 'sodium', dailyDose: 3000, label: 'salt' }], targets);
    expect(salty.lines.sodium.status).toBe('high');
    expect(salty.lines.sodium.total).toBeCloseTo(21000);
  });
  it('caps without a target have no percent and are ok when under', () => {
    const r = analyze({ banana: 100 }, [], [], targets);
    expect(r.lines.satFat.status).toBe('ok');
    expect(r.lines.satFat.percent).toBeUndefined();
  });
  it('missing nutrient data never produces NaN', () => {
    const r = analyze({ banana: 100, pollock: 200 }, [], [], targets);
    Object.values(r.lines).forEach((l) => expect(Number.isFinite(l.total)).toBe(true));
  });
  it('daily calories = weekly / 7', () => {
    const r = analyze({ banana: 700 }, [], [], targets);
    expect(r.dailyCalories).toBeCloseTo(r.weeklyCalories / 7);
    expect(r.weeklyCalories).toBeCloseTo(getFood('banana').per100g.energy! * 7);
  });
});
