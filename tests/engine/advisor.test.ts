import { describe, expect, it } from 'vitest';
import { explainHigh, suggestForLow, suggestRecipeCombos } from '@/engine/advisor';
import { planWeek } from '@/engine/planWeek';
import { getFood } from '@/data/foods';
import { base, liked, salty } from '../fixtures';

describe('advisor', () => {
  it('vitamin D suggestion improves the nutrient and prefers liked foods', async () => {
    const p = await planWeek({ ...base, likedFoodIds: liked.filter((f) => f !== 'salmon' && f !== 'milk') });
    expect(p.report.lines.vitD.status).toBe('low');
    const s = suggestForLow(p, 'vitD');
    expect(s.length).toBeGreaterThan(0);
    expect(s.length).toBeLessThanOrEqual(3);
    expect(s[0].newPercent).toBeGreaterThan(p.report.lines.vitD.percent!);
    const firstNonLiked = s.findIndex((x) => !x.liked);
    if (firstNonLiked >= 0) expect(s.slice(firstNonLiked).every((x) => !x.liked)).toBe(true);
  });
  it('never suggests disliked foods', async () => {
    const p = await planWeek({ ...base, likedFoodIds: ['banana', 'brown-rice', 'chicken-breast', 'olive-oil'], dislikedFoodIds: ['salmon'] });
    suggestForLow(p, 'vitD', 10).forEach((x) => expect(x.foodId).not.toBe('salmon'));
  });
  it('suggested grams respect the weekly maximum', async () => {
    const p = await planWeek({ ...base, likedFoodIds: ['banana', 'brown-rice', 'chicken-breast', 'olive-oil'] });
    suggestForLow(p, 'vitD', 10).forEach((x) => expect(x.addGrams).toBeLessThanOrEqual(getFood(x.foodId).maxWeeklyGrams));
  });
  it('excess names the salty recipe first with a reduce hint', async () => {
    const p = await planWeek({ ...base, recipes: [salty] });
    const e = explainHigh(p, 'sodium');
    expect(e.percentOfMax).toBeGreaterThan(100);
    expect(e.topSources[0].label).toBe('Salty Soup (2×)');
    expect(e.hints[0]).toBe('Make Salty Soup 1× instead of 2×');
  });
  it('single-batch recipe hint says remove', async () => {
    const p = await planWeek({ ...base, recipes: [{ ...salty, ingredients: [{ foodId: 'soy-sauce', grams: 1200 }], count: 1 }] });
    expect(explainHigh(p, 'sodium').hints[0]).toBe('Remove Salty Soup this week');
  });
  it('recipe combo suggestion improves the plan', async () => {
    const p = await planWeek({ ...base, recipes: [salty] });
    const c = await suggestRecipeCombos(p);
    expect(c.length).toBeGreaterThan(0);
    expect(c[0].fixes).toContain('sodium');
    expect(c[0].summary).toMatch(/Salty Soup/);
  });
  it('no combos when there are no recipes', async () => {
    const p = await planWeek(base);
    expect(await suggestRecipeCombos(p)).toEqual([]);
  });
});
