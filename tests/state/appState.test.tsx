// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WeekPlan } from '@/engine/planWeek';
import { roundAmount } from '@/engine/rounding';
import type { TripArgs, TripPlan } from '@/engine/tripPlan';
import type { PlanInput } from '@/engine/types';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { AppStateProvider, today, useAppState } from '@/state/AppState';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const fakePlan = (tag: string): WeekPlan => ({
  items: [],
  relaxed: [],
  input: { supplements: [], supplementedNutrients: [] } as unknown as PlanInput,
  report: { lines: {}, weeklyCalories: 0, dailyCalories: 0, tag } as unknown as WeekPlan['report'],
});

const fakeTrip = (tag: string, over: Partial<TripPlan> = {}): TripPlan => ({
  date: '2026-11-05', days: 3, plan: fakePlan(tag), buy: {}, fromPantry: {}, pantryAfter: {}, ...over,
});

function setup(responses: (TripPlan | Error)[]) {
  const calls: TripArgs[] = [];
  const client = {
    requestTrip: async (i: TripArgs) => {
      calls.push(i);
      const r = responses.shift();
      if (!r || r instanceof Error) throw r ?? new Error('no response');
      return r;
    },
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppStateProvider client={client} buildList={() => null}>{children}</AppStateProvider>
  );
  return { calls, ...renderHook(() => useAppState(), { wrapper }) };
}

describe('AppState', () => {
  it('generate keeps the last good plan on error', async () => {
    const A = fakeTrip('A');
    const { result } = setup([A, new Error('Solver failed')]);
    await act(async () => { await result.current.generate(); });
    expect(result.current.plan).toBe(A.plan);
    expect(result.current.trip).toBe(A);
    await act(async () => { await result.current.generate(); });
    expect(result.current.plan).toBe(A.plan);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Solver failed');
  });

  it('undo restores the previous plan', async () => {
    const A = fakePlan('A');
    const B = fakePlan('B');
    const { result } = setup([]);
    act(() => result.current.applyPlan(A));
    act(() => result.current.applyPlan(B));
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.plan).toBe(A);
    expect(result.current.canUndo).toBe(false);
  });

  it('undo also restores the settings from before the change', async () => {
    const A = fakePlan('A');
    const B = fakePlan('B');
    const { result } = setup([]);
    act(() => result.current.applyPlan(A));
    act(() => result.current.applyPlan(B));
    act(() => result.current.setSettings({ ...DEFAULT_SETTINGS, dislikedFoodIds: ['black-beans'] }));
    act(() => result.current.undo());
    expect(result.current.plan).toBe(A);
    expect(result.current.settings.dislikedFoodIds).toEqual([]);
  });

  it('generate passes overrides on top of the settings', async () => {
    const { result, calls } = setup([fakeTrip('A')]);
    await act(async () => { await result.current.generate({ locks: { milk: 1000 } }); });
    expect(calls[0].base.locks).toEqual({ milk: 1000 });
    expect(calls[0].regularLocks).toEqual({});
    expect(calls[0].base.maxDistinctFoods).toBe(DEFAULT_SETTINGS.maxDistinctFoods);
  });

  it('setSettings persists to localStorage', async () => {
    const { result } = setup([]);
    act(() => result.current.setSettings({ ...DEFAULT_SETTINGS, maxDistinctFoods: 12 }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('planner.settings')!).maxDistinctFoods).toBe(12));
  });

  it('ignores a saved plan that is missing its targets', async () => {
    localStorage.setItem('planner.lastTrip', JSON.stringify({ date: '2026-11-05', days: 3, plan: { items: [], report: { lines: {} }, input: {} } }));
    const { result } = setup([]);
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.plan).toBeNull();
  });

  it('generate plans a trip from the shopping rhythm and regular items', async () => {
    const { result, calls } = setup([fakeTrip('A')]);
    act(() => result.current.setSettings({ ...DEFAULT_SETTINGS, nextTripDate: '2026-11-07', shopEveryDays: 4, regularItems: { milk: 1400 } }));
    await act(async () => { await result.current.generate(); });
    expect(calls[0].date).toBe('2026-11-07');
    expect(calls[0].days).toBe(4);
    expect(calls[0].regularLocks.milk).toBeCloseTo(800, 6);
    expect(calls[0].base.locks).toEqual({});
  });

  it('finishShopping moves the date and saves history', async () => {
    const banana = roundAmount('banana', 354);
    const t = fakeTrip('A', { buy: { banana: banana.grams, oats: 1000 }, pantryAfter: { oats: 700 } });
    t.plan = { ...t.plan, items: [banana, roundAmount('oats', 300)] };
    const { result } = setup([t]);
    await act(async () => { await result.current.generate(); });
    act(() => result.current.finishShopping([]));
    expect(result.current.settings.nextTripDate).toBe('2026-11-08');
    expect(result.current.trip).toBeNull();
    expect(result.current.plan).toBeNull();
    expect(result.current.history).toHaveLength(1);
    expect(result.current.pantry).toEqual({ oats: 700 });
    expect(JSON.parse(localStorage.getItem('planner.trips')!)[0].daily.banana).toBeCloseTo(banana.grams / 3, 6);
    expect(JSON.parse(localStorage.getItem('planner.pantry')!)).toEqual({ oats: 700 });
    expect(localStorage.getItem('planner.lastTrip')).toBeNull();
    expect(result.current.canUndo).toBe(false);
  });

  it('a bad profile shows an error instead of throwing', async () => {
    const { result } = setup([]);
    act(() => result.current.setSettings({ ...DEFAULT_SETTINGS, profile: { ...DEFAULT_SETTINGS.profile, age: 5 } }));
    let out: WeekPlan | null = fakePlan('x');
    await act(async () => { out = await result.current.generate(); });
    expect(out).toBeNull();
    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/age/i);
  });
});

describe('AppState review fixes', () => {
  it('a next trip date in the past starts the trip today', async () => {
    const { result, calls } = setup([fakeTrip('A')]);
    act(() => result.current.setSettings({ ...DEFAULT_SETTINGS, nextTripDate: '2020-01-01' }));
    await act(async () => { await result.current.generate(); });
    expect(calls[0].date).toBe(today());
  });

  it('changing the pantry updates the shown trip', async () => {
    const t = fakeTrip('A', { fromPantry: { oats: 300 }, pantryAfter: { oats: 200 } });
    t.plan = { ...t.plan, items: [roundAmount('oats', 300)] };
    const { result } = setup([t]);
    await act(async () => { await result.current.generate(); });
    act(() => result.current.setPantry({}));
    expect(result.current.trip!.fromPantry).toEqual({});
    expect(result.current.trip!.buy.oats).toBe(1000);
    expect(JSON.parse(localStorage.getItem('planner.lastTrip')!).buy.oats).toBe(1000);
  });
});
