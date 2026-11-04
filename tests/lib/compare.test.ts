import { describe, expect, it } from 'vitest';
import type { WeekPlan } from '@/engine/planWeek';
import { roundAmount } from '@/engine/rounding';
import type { NutrientId, Status } from '@/engine/types';
import { compare } from '@/lib/compare';

function plan(items: [string, number][], energy: number, statuses: Partial<Record<NutrientId, Status>>): WeekPlan {
  const lines: Record<string, unknown> = { energy: { id: 'energy', total: energy, status: 'ok', sources: [] } };
  for (const [id, status] of Object.entries(statuses)) lines[id] = { id, total: 1, target: 1, status, sources: [] };
  return {
    items: items.map(([id, g]) => roundAmount(id, g)),
    report: { lines, weeklyCalories: energy, dailyCalories: energy / 7 } as unknown as WeekPlan['report'],
    relaxed: [],
    input: {} as WeekPlan['input'],
  };
}

describe('compare', () => {
  const now = plan([['milk', 1000], ['oats', 300], ['black-beans', 500], ['banana', 826]], 19600, { calcium: 'low', iron: 'ok' });
  const next = plan([['milk', 1500], ['oats', 200], ['lentils', 400], ['banana', 826]], 20300, { calcium: 'ok', iron: 'low' });
  const c = compare(now, next);

  it('marks added, removed, more, less and same', () => {
    const byId = Object.fromEntries(c.rows.map((r) => [r.foodId, r.change]));
    expect(byId).toEqual({ milk: 'more', oats: 'less', 'black-beans': 'removed', lentils: 'added', banana: 'same' });
    const beans = c.rows.find((r) => r.foodId === 'black-beans')!;
    expect(beans.newGrams).toBe(0);
    expect(beans.newItems).toBe('—');
    expect(c.rows.find((r) => r.foodId === 'lentils')!.nowItems).toBe('—');
  });

  it('sorts changes first, then by name', () => {
    expect(c.rows[c.rows.length - 1].foodId).toBe('banana');
    const changed = c.rows.slice(0, -1).map((r) => r.name);
    expect(changed).toEqual([...changed].sort((a, b) => a.localeCompare(b)));
  });

  it('fixed lists nutrients that went from not ok to ok, and broke the reverse', () => {
    expect(c.fixed).toEqual(['calcium']);
    expect(c.broke).toEqual(['iron']);
  });

  it('kcalPerDay is energy total / 7', () => {
    expect(c.kcalPerDay).toEqual({ now: 2800, new: 2900 });
  });
});
