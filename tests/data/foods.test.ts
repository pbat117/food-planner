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

const SECTIONS = ['Meat', 'Fruit', 'Vegetables and beans', 'Grains', 'Dairy', 'Nuts and nut butter', 'Other'];
const BASES = ['raw', 'cooked', 'dry', 'drained', 'peeled', 'flesh', 'as sold'];

describe('list-format data', () => {
  it('every food has a section and basis', () => {
    FOODS.forEach((f) => {
      expect(SECTIONS, f.id).toContain(f.section);
      expect(BASES, f.id).toContain(f.basis);
    });
  });
  it('meat is raw with a cooked yield', () => {
    for (const id of ['ground-beef-85', 'chicken-breast']) {
      const f = getFood(id);
      expect(f.basis).toBe('raw');
      expect(f.section).toBe('Meat');
      expect(f.yield).toBeGreaterThanOrEqual(0.7);
      expect(f.yield).toBeLessThanOrEqual(0.78);
    }
  });
  // Ruling: the USDA rice entry is dry, so basis is dry and yield converts to cooked.
  it('rice is dry with a cooked yield', () => {
    const f = getFood('white-rice');
    expect(f.basis).toBe('dry');
    expect(f.yield).toBeGreaterThanOrEqual(2.5);
    expect(f.yield).toBeLessThanOrEqual(3.0);
  });
  it('black beans sit under Vegetables and beans, drained', () => {
    expect(getFood('black-beans').section).toBe('Vegetables and beans');
    expect(getFood('black-beans').basis).toBe('drained');
  });
  it('almonds and peanut butter sit under Nuts and nut butter', () => {
    expect(getFood('almonds').section).toBe('Nuts and nut butter');
    expect(getFood('peanut-butter').section).toBe('Nuts and nut butter');
  });
  it('peanut butter has a 500 g jar package', () => {
    expect(getFood('peanut-butter').package).toEqual({ name: 'jar', grams: 500 });
  });
});
