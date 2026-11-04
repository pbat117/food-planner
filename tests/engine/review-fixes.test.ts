import { describe, expect, it } from 'vitest';
import { computeWeeklyTargets } from '@/engine/targets';
import { buildLp, optimize } from '@/engine/optimizer';
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
  it('the optimizer never limits food because of vitamin A', () => {
    const ids = Object.keys(targets.nutrients);
    const lp = buildLp({ ...base, likedFoodIds: ['carrots', 'sweet-potato', 'spinach', 'kale', 'butternut-squash'] }).lp;
    expect(lp).not.toMatch(new RegExp('^ m' + ids.indexOf('vitA') + ':', 'm'));
    expect(lp).toMatch(new RegExp('^ m' + ids.indexOf('iron') + ':', 'm'));
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

describe('sodium', () => {
  it('is only a cap: unsalted whole foods are never flagged low', () => {
    const s = computeWeeklyTargets(man30).nutrients.sodium;
    expect(s.target).toBeUndefined();
    expect(s.lowBelow).toBeUndefined();
    expect(s.max).toBe(16100);
  });
});

describe('macro leeway', () => {
  it('fat and carbs are only low below 90% of their minimum, like other nutrients', () => {
    const n = computeWeeklyTargets(man30).nutrients;
    expect(n.carbs.lowBelow).toBeCloseTo(n.carbs.target! * 0.9);
    expect(n.fat.lowBelow).toBeCloseTo(n.fat.target! * 0.9);
    expect(n.protein.lowBelow).toBeCloseTo(n.protein.target!);
  });
});
