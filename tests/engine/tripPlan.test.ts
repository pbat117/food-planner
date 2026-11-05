import { describe, expect, it } from 'vitest';
import { roundAmount } from '@/engine/rounding';
import {
  addDays, buildTripInput, dueFoods, finishTrip, historyWindow, planTrip, purchase,
  type TripArgs, type TripPlan, type TripRecord,
} from '@/engine/tripPlan';
import { base, liked, targets } from '../fixtures';

const args = (over: Partial<TripArgs> = {}): TripArgs => ({
  base, date: '2026-11-05', days: 3, history: [], pantry: {}, regularLocks: {}, includeFoodIds: [], ...over,
});

describe('trip planning', () => {
  it('addDays crosses month ends', () => {
    expect(addDays('2026-11-29', 3)).toBe('2026-12-02');
    expect(addDays('2026-11-05', -4)).toBe('2026-11-01');
  });

  it('first trip targets scale to N/7', () => {
    const input = buildTripInput(args());
    expect(input.targets.nutrients.protein.target).toBeCloseTo(targets.nutrients.protein.target! * 3 / 7, 6);
    expect(input.windowDays).toBe(3);
    expect(input.tripDays).toBe(3);
    expect(input.background ?? {}).toEqual({});
  });

  it('history fills the window', () => {
    const history: TripRecord[] = [{ date: '2026-11-01', days: 4, daily: { milk: 250, oats: 80 } }];
    const input = buildTripInput(args({ history }));
    expect(input.windowDays).toBe(7);
    expect(input.background).toEqual({ milk: 1000, oats: 320 });
    expect(input.targets.nutrients.protein.target).toBeCloseTo(targets.nutrients.protein.target!, 6);
  });

  it('only the part of an old trip inside the window counts', () => {
    const history: TripRecord[] = [{ date: '2026-10-29', days: 6, daily: { milk: 100 } }]; // covers 10-29 .. 11-03
    const w = historyWindow(history, '2026-11-05', 3); // window 11-01 .. 11-04, overlap 11-01 .. 11-03
    expect(w.days).toBe(3);
    expect(w.amounts).toEqual({ milk: 300 });
  });

  it('dueFoods caps and orders by absence', () => {
    const history: TripRecord[] = [
      { date: '2026-10-20', days: 3, daily: { kiwi: 50 } },
      { date: '2026-10-26', days: 3, daily: { salmon: 50 } },
    ];
    const seen = new Set(['eggs']);
    const due = dueFoods(['eggs', 'salmon', 'kiwi', 'walnuts', 'spinach'], seen, history, '2026-11-05', 6);
    expect(due).toEqual(['walnuts', 'spinach', 'kiwi']);
  });

  it('dueFoods spreads never-seen foods across categories', () => {
    const due = dueFoods(['chicken-breast', 'salmon', 'eggs', 'spinach', 'banana'], new Set(), [], '2026-11-05', 6);
    expect(due).toEqual(['chicken-breast', 'spinach', 'banana']);
  });

  it('pantry covers the need → nothing to buy', () => {
    const r = purchase([roundAmount('brown-rice', 400)], { 'brown-rice': 600 });
    expect(r.buy).toEqual({});
    expect(r.fromPantry).toEqual({ 'brown-rice': 400 });
    expect(r.pantryAfter).toEqual({ 'brown-rice': 200 });
  });

  it('buys whole packages for long-keepers and keeps the rest', () => {
    const r = purchase([roundAmount('brown-rice', 400)], {});
    expect(r.buy).toEqual({ 'brown-rice': 900 });
    expect(r.pantryAfter).toEqual({ 'brown-rice': 500 });
  });

  it('perishables are bought exactly and unused pantry carries over', () => {
    const banana = roundAmount('banana', 354);
    const r = purchase([banana], { oats: 300 });
    expect(r.buy).toEqual({ banana: banana.grams });
    expect(r.pantryAfter).toEqual({ oats: 300 });
  });

  it('finishTrip drops history older than 14 days', () => {
    const old: TripRecord[] = [
      { date: '2026-10-01', days: 3, daily: { milk: 1 } },
      { date: '2026-10-25', days: 3, daily: { milk: 1 } },
    ];
    const t: TripPlan = {
      date: '2026-11-05', days: 3, buy: {}, fromPantry: {}, pantryAfter: {},
      plan: { items: [roundAmount('banana', 354)], report: {} as never, relaxed: [], input: base },
    };
    const r = finishTrip(t, old, []);
    expect(r.history.map((h) => h.date)).toEqual(['2026-10-25', '2026-11-05']);
    expect(r.history[1].daily.banana).toBeCloseTo(354 / 3, 6);
  });

  it('finishTrip: things not bought are not eaten and not in the pantry', () => {
    const t: TripPlan = {
      date: '2026-11-05', days: 3,
      buy: { 'brown-rice': 900, banana: 354 }, fromPantry: { 'brown-rice': 100 }, pantryAfter: { 'brown-rice': 500 },
      plan: { items: [roundAmount('brown-rice', 500), roundAmount('banana', 354)], report: {} as never, relaxed: [], input: base },
    };
    const r = finishTrip(t, [], ['brown-rice', 'banana']);
    expect(r.pantry).toEqual({});
    expect(r.history[0].daily.banana).toBeUndefined();
    expect(r.history[0].daily['brown-rice']).toBeCloseTo(100 / 3, 6);
  });

  it('finishTrip: things you already had are eaten but add nothing to the pantry', () => {
    const t: TripPlan = {
      date: '2026-11-05', days: 3,
      buy: { 'brown-rice': 900, banana: 354 }, fromPantry: {}, pantryAfter: { 'brown-rice': 400 },
      plan: { items: [roundAmount('brown-rice', 500), roundAmount('banana', 354)], report: {} as never, relaxed: [], input: base },
    };
    const r = finishTrip(t, [], [], ['brown-rice', 'banana']);
    expect(r.pantry).toEqual({});
    expect(r.history[0].daily.banana).toBeCloseTo(354 / 3, 6);
    expect(r.history[0].daily['brown-rice']).toBeCloseTo(500 / 3, 6);
  });

  it('planTrip second trip differs from the first and the window is on target', async () => {
    const a = args({ base: { ...base, maxDistinctFoods: 12 }, includeFoodIds: liked });
    const t1 = await planTrip(a);
    const done = finishTrip(t1, [], []);
    const t2 = await planTrip({ ...a, date: addDays(a.date, 3), history: done.history, pantry: done.pantry });
    const ids = (t: TripPlan) => t.plan.items.map((i) => i.foodId).sort();
    expect(ids(t2)).not.toEqual(ids(t1));
    expect(t2.plan.input.windowDays).toBe(6);
    expect(t2.plan.report.lines.energy.status).toBe('ok');
  }, 60000);
});

describe('trip guards', () => {
  it('never forces more fruits than the fruit rule allows', () => {
    const fruits = ['banana', 'orange', 'kiwi', 'blackberries', 'apple', 'pear'];
    const input = buildTripInput(args({ base: { ...base, maxDistinctFoods: 20, fruit: { gramsPerDay: 300, maxKinds: 3 } }, includeFoodIds: fruits }));
    expect(input.includeFoodIds).toEqual(['banana', 'orange', 'kiwi']);
  });
});

describe('review fixes', () => {
  it('locked fruits use up fruit kinds, so due fruits never make the trip infeasible', () => {
    const input = buildTripInput(args({
      base: { ...base, maxDistinctFoods: 12, fruit: { gramsPerDay: 300, maxKinds: 5 } },
      regularLocks: { banana: 200, blueberries: 100 },
      includeFoodIds: ['apple', 'orange', 'kiwi', 'pear', 'grapes', 'banana', 'chicken-breast'],
    }));
    const fruits = input.includeFoodIds!.filter((id) => ['apple', 'orange', 'kiwi', 'pear', 'grapes', 'banana'].includes(id));
    expect(fruits.length).toBeLessThanOrEqual(3);
    expect(input.includeFoodIds).not.toContain('banana');
    expect(input.includeFoodIds).toContain('chicken-breast');
  });

  it('a locked fruit trip still plans real food', async () => {
    const t = await planTrip(args({
      base: { ...base, maxDistinctFoods: 12, fruit: { gramsPerDay: 300, maxKinds: 5 } },
      regularLocks: { banana: 200, blueberries: 100 },
      includeFoodIds: ['apple', 'orange', 'kiwi', 'pear', 'grapes', 'chicken-breast'],
    }));
    // Before the fix both solves were infeasible and the trip was just the two locked fruits (~260 kcal).
    expect(t.plan.items.length).toBeGreaterThanOrEqual(8);
    const e = t.plan.report.lines.energy;
    expect(e.total).toBeGreaterThan(e.target! * 0.85);
  }, 60000);

  it('pantry food is used before buying other long-keepers', () => {
    const input = buildTripInput(args({ pantry: { 'brown-rice': 450, oats: 5 } }));
    expect(input.includeFoodIds).toContain('brown-rice');
    expect(input.includeFoodIds).not.toContain('oats'); // less than a minimum amount left
  });
});
