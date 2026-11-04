import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { configureHighs } from '@/engine/optimizer';
import { buildLp, optimize } from '@/engine/optimizer';
import { analyze } from '@/engine/analyze';
import { getFood } from '@/data/foods';
import type { NutrientId } from '@/engine/types';
import { base, salty, targets } from '../fixtures';

describe('optimize', () => {
  it('meets calories, protein and caps with a realistic liked list', async () => {
    const r = await optimize(base);
    const rep = analyze(r.amounts, [], [], targets);
    expect(rep.lines.energy.status).toBe('ok');
    expect(rep.lines.protein.status).not.toBe('low');
    (['sodium', 'satFat', 'addedSugar'] as NutrientId[]).forEach((n) => expect(rep.lines[n].status, n).not.toBe('high'));
    expect(Object.keys(r.amounts).length).toBeLessThanOrEqual(15);
    expect(r.relaxed).toEqual([]);
  });
  it('keeps the week realistic: total food weight and protein overshoot', async () => {
    const r = await optimize(base);
    const totalGrams = Object.values(r.amounts).reduce((a, b) => a + b, 0);
    const rep = analyze(r.amounts, [], [], targets);
    expect(totalGrams).toBeLessThan(16000); // ~2.3 kg/day incl. milk, for a 2,760 kcal/day profile
    expect(rep.lines.protein.percent!).toBeLessThan(250);
  });
  it('never uses disliked foods', async () => {
    const r = await optimize({ ...base, dislikedFoodIds: ['salmon', 'spinach'] });
    expect(r.amounts.salmon).toBeUndefined();
    expect(r.amounts.spinach).toBeUndefined();
  });
  it('respects per-food bounds', async () => {
    const r = await optimize(base);
    for (const [id, g] of Object.entries(r.amounts)) {
      const f = getFood(id);
      expect(g, id).toBeGreaterThanOrEqual(f.minGrams - 0.5);
      expect(g, id).toBeLessThanOrEqual(f.maxWeeklyGrams + 0.5);
    }
  });
  it('locks win, even above max or on a disliked food', async () => {
    const r = await optimize({ ...base, dislikedFoodIds: ['banana'], locks: { banana: 2000 } });
    expect(r.amounts.banana).toBe(2000);
  });
  it('tiny liked list still returns a plan', async () => {
    const r = await optimize({ ...base, likedFoodIds: ['banana', 'brown-rice', 'chicken-breast', 'olive-oil'] });
    expect(Object.keys(r.amounts).length).toBeGreaterThan(0);
  });
  it('salty recipe → sodium relaxed, not a crash', async () => {
    const r = await optimize({ ...base, recipes: [salty] });
    expect(r.relaxed).toContain('sodium');
  });
  it('supplemented nutrients have no deficit row in the model', () => {
    const ids = Object.keys(targets.nutrients);
    const row = (id: string) => new RegExp(`^ t${ids.indexOf(id)}:`, 'm');
    const normal = buildLp(base).lp;
    const supp = buildLp({ ...base, supplementedNutrients: ['vitD', 'epaDha'] }).lp;
    expect(normal).toMatch(row('vitD'));
    expect(normal).toMatch(row('epaDha'));
    expect(supp).not.toMatch(row('vitD'));
    expect(supp).not.toMatch(row('epaDha'));
    expect(supp).toMatch(row('vitC'));
  });
  it('all-foods candidate set solves within 6 s', async () => {
    const t0 = Date.now();
    const r = await optimize({ ...base, likedFoodIds: [] });
    expect(Date.now() - t0).toBeLessThan(6000);
    expect(Object.keys(r.amounts).length).toBeGreaterThan(0);
  });
});

describe('configureHighs', () => {
  it('passes locateFile to the loader', async () => {
    const seen: string[] = [];
    configureHighs({ locateFile: (f) => { seen.push(f); return path.resolve('node_modules/highs/build', f); } });
    try {
      const r = await optimize({ ...base, maxDistinctFoods: 10 });
      expect(r.status).toBe('optimal');
      expect(seen).toContain('highs.wasm');
    } finally {
      configureHighs({});
    }
  });
});
