import { describe, expect, it } from 'vitest';
import { FOODS, getFood } from '@/data/foods';

describe('food database', () => {
  it('has at least 200 foods with unique ids', () => {
    expect(FOODS.length).toBeGreaterThanOrEqual(200);
    expect(new Set(FOODS.map((f) => f.id)).size).toBe(FOODS.length);
  });
  it('every food has energy, sane units and bounds', () => {
    FOODS.forEach((f) => {
      expect(f.per100g.energy, f.id).toBeGreaterThanOrEqual(0);
      expect(f.unit.grams, f.id).toBeGreaterThan(0);
      expect(f.maxWeeklyGrams, f.id).toBeGreaterThan(f.minGrams);
      expect(f.shelfLifeDays, f.id).toBeGreaterThan(0);
    });
  });
  it('no nutrient value is NaN or negative', () => {
    FOODS.forEach((f) => Object.values(f.per100g).forEach((v) => {
      expect(Number.isFinite(v), f.id).toBe(true);
      expect(v, f.id).toBeGreaterThanOrEqual(0);
    }));
  });
  it('spot-check banana and almonds against USDA', () => {
    expect(getFood('banana').per100g.energy).toBeCloseTo(89, 0);
    expect(getFood('banana').per100g.potassium).toBeCloseTo(358, -1);
    expect(getFood('almonds').per100g.vitE).toBeGreaterThan(20);
  });
  it('converts copper to mcg and EPA+DHA to mg', () => {
    expect(getFood('almonds').per100g.copper).toBeGreaterThan(500);
    expect(getFood('salmon').per100g.epaDha).toBeGreaterThan(1000);
  });
  it('contains every food the engine tests rely on', () => {
    ['banana', 'almonds', 'chicken-breast', 'ground-beef-85', 'eggs', 'salmon', 'black-beans', 'brown-rice', 'oats',
      'sweet-potato', 'potato', 'spinach', 'broccoli', 'red-pepper', 'orange', 'kiwi', 'blackberries', 'avocado',
      'greek-yogurt', 'olive-oil', 'milk', 'walnuts', 'soy-sauce'].forEach((id) => expect(() => getFood(id)).not.toThrow());
  });
  it('getFood throws on unknown id', () => {
    expect(() => getFood('nope')).toThrow();
  });
});
