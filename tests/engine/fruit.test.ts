import { describe, expect, it } from 'vitest';
import { optimize } from '@/engine/optimizer';
import { getFood } from '@/data/foods';
import { base } from '../fixtures';

const fruitOf = (amounts: Record<string, number>) =>
  Object.entries(amounts).filter(([id]) => getFood(id).category === 'fruit');

describe('fruit rule', () => {
  it('includes at least the daily fruit amount, from a limited number of kinds', async () => {
    const r = await optimize({ ...base, fruit: { gramsPerDay: 300, maxKinds: 4 } });
    const fruit = fruitOf(r.amounts);
    expect(fruit.reduce((s, [, g]) => s + g, 0)).toBeGreaterThanOrEqual(2100 - 0.5);
    expect(fruit.length).toBeGreaterThan(0);
    expect(fruit.length).toBeLessThanOrEqual(4);
  });
  it('locked fruit counts toward the amount and the kinds', async () => {
    const r = await optimize({ ...base, locks: { banana: 2100 }, fruit: { gramsPerDay: 300, maxKinds: 1 } });
    expect(fruitOf(r.amounts).map(([id]) => id)).toEqual(['banana']);
  });
  it('no liked fruit still returns a plan', async () => {
    const r = await optimize({ ...base, likedFoodIds: ['chicken-breast', 'brown-rice', 'broccoli', 'olive-oil'], fruit: { gramsPerDay: 300, maxKinds: 3 } });
    expect(Object.keys(r.amounts).length).toBeGreaterThan(0);
  });
});
