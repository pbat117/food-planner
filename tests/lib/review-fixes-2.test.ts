import { describe, expect, it } from 'vitest';
import { planWeek } from '@/engine/planWeek';
import { DEFAULT_SETTINGS, setPref, toPlanInput } from '@/lib/settings';
import { proteinGoalInMode } from '@/lib/units';

describe('final review fixes', () => {
  it('one Your food still gives a full-calorie plan (staples come from all foods)', async () => {
    const s = setPref(DEFAULT_SETTINGS, 'chicken-breast', 'include');
    const plan = await planWeek(toPlanInput(s));
    expect(plan.items.map((i) => i.foodId)).toContain('chicken-breast');
    expect(plan.report.lines.energy.status).toBe('ok');
    expect(plan.items.length).toBeGreaterThan(5);
  }, 30000);

  it('liked foods beyond Your foods are the staple pool', () => {
    const s = setPref(setPref(DEFAULT_SETTINGS, 'chicken-breast', 'include'), 'white-rice', 'liked');
    expect(toPlanInput(s).likedFoodIds).toEqual(['chicken-breast', 'white-rice']);
    expect(toPlanInput(setPref(DEFAULT_SETTINGS, 'kiwi', 'include')).likedFoodIds).toEqual([]);
  });

  it('disliking a regular item removes it from regular items', () => {
    const s = { ...DEFAULT_SETTINGS, regularItems: { milk: 1400 } };
    expect(setPref(s, 'milk', 'disliked').regularItems).toEqual({});
  });

  it('the app never adds protein powder on its own', async () => {
    const plan = await planWeek(toPlanInput(DEFAULT_SETTINGS));
    expect(plan.items.map((i) => i.foodId)).not.toContain('whey-protein');
  }, 30000);

  it('switching the protein unit back and forth keeps the goal', () => {
    const kg = 77.1;
    const perKg = proteinGoalInMode({ mode: 'gPerDay', value: 136 }, 'gPerKg', kg);
    expect(proteinGoalInMode(perKg, 'gPerDay', kg)).toEqual({ mode: 'gPerDay', value: 136 });
  });
});
