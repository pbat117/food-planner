import { describe, expect, it } from 'vitest';
import { computeWeeklyTargets } from '@/engine/targets';
import { optimize } from '@/engine/optimizer';
import { analyze } from '@/engine/analyze';
import { roundAmount } from '@/engine/rounding';
import { planWeek } from '@/engine/planWeek';
import { getFood } from '@/data/foods';
import { UnsupportedProfileError, type Profile } from '@/engine/types';
import { base, man30, targets } from '../fixtures';

describe('review fixes', () => {
  it('vitamin A upper limit applies to supplements only (carotenoids are not capped)', () => {
    const a = computeWeeklyTargets(man30).nutrients.vitA;
    expect(a.max).toBeUndefined();
    expect(a.supplementMax).toBe(3000);
  });
  it('orange-vegetable-heavy liked list still meets calories', async () => {
    const liked = ['carrots', 'sweet-potato', 'spinach', 'kale', 'butternut-squash', 'pumpkin-canned',
      'chicken-breast', 'brown-rice', 'olive-oil', 'eggs', 'black-beans', 'almonds', 'banana', 'milk'];
    const r = await optimize({ ...base, likedFoodIds: liked });
    expect(analyze(r.amounts, [], [], targets).lines.energy.status).toBe('ok');
  });
  it('beef liver weekly max keeps preformed vitamin A under the upper limit', () => {
    const f = getFood('beef-liver');
    expect((f.per100g.vitA! * f.maxWeeklyGrams) / 100).toBeLessThan(3000 * 7);
  });
  it('sweeteners carry added sugar; whole foods have none', () => {
    expect(getFood('honey').per100g.addedSugar).toBeGreaterThan(70);
    expect(getFood('maple-syrup').per100g.addedSugar).toBeGreaterThan(50);
    expect(getFood('banana').per100g.addedSugar).toBe(0);
  });
  it.each([
    ['sex', { sex: 'other' }],
    ['activity', { activity: 'couch' }],
    ['calorieOverride NaN', { calorieOverride: NaN }],
    ['calorieOverride negative', { calorieOverride: -5 }],
    ['negative protein goal', { proteinGoal: { mode: 'gPerKg', value: -1 } }],
  ])('rejects invalid %s', (_n, patch) => {
    expect(() => computeWeeklyTargets({ ...man30, ...(patch as Partial<Profile>) })).toThrow(UnsupportedProfileError);
  });
  it('gram-step labels never say zero', () => {
    expect(roundAmount('beef-liver', 100).label).toBe('100 g');
    expect(roundAmount('pasta', 100).label).not.toMatch(/≈ 0 /);
  });
  it('zero-gram locks are left out of the plan', async () => {
    const p = await planWeek({ ...base, locks: { broccoli: 0 } });
    expect(p.items.find((i) => i.foodId === 'broccoli')).toBeUndefined();
  });
});
