import { describe, expect, it } from 'vitest';
import { buildLp, optimize } from '@/engine/optimizer';
import { getFood } from '@/data/foods';
import { base, targets } from '../fixtures';

describe('your foods (always included)', () => {
  it('every food in includeFoodIds is in the plan, at least its minimum amount', async () => {
    const mine = ['broccoli', 'red-pepper', 'potato', 'spinach', 'sweet-potato'];
    const r = await optimize({ ...base, includeFoodIds: mine });
    mine.forEach((id) => expect(r.amounts[id], id).toBeGreaterThanOrEqual(getFood(id).minGrams - 0.5));
  });
  it('included foods count toward the distinct-food limit', async () => {
    const mine = ['broccoli', 'red-pepper', 'potato'];
    const r = await optimize({ ...base, includeFoodIds: mine, maxDistinctFoods: 10 });
    expect(Object.keys(r.amounts).length).toBeLessThanOrEqual(10);
  });
  it('a disliked food is never forced in', async () => {
    const r = await optimize({ ...base, includeFoodIds: ['broccoli'], dislikedFoodIds: ['broccoli'] });
    expect(r.amounts.broccoli).toBeUndefined();
  });
});

describe('aim for 90%, not 100%', () => {
  it('nutrient goal rows use the 90% threshold', () => {
    const ids = Object.keys(targets.nutrients);
    const k = ids.indexOf('vitC');
    const row = buildLp(base).lp.split('\n').findIndex((l) => l.startsWith(` t${k}:`));
    const lines = buildLp(base).lp.split('\n');
    const end = lines.slice(row).find((l) => l.includes('>='))!;
    expect(Number(end.split('>=')[1])).toBeCloseTo(targets.nutrients.vitC.lowBelow!, 3);
  });
});
