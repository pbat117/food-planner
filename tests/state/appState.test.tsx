// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WeekPlan } from '@/engine/planWeek';
import type { PlanInput } from '@/engine/types';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { AppStateProvider, useAppState } from '@/state/AppState';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const fakePlan = (tag: string): WeekPlan => ({
  items: [],
  relaxed: [],
  input: { supplements: [], supplementedNutrients: [] } as unknown as PlanInput,
  report: { lines: {}, weeklyCalories: 0, dailyCalories: 0, tag } as unknown as WeekPlan['report'],
});

function setup(responses: (WeekPlan | Error)[]) {
  const calls: PlanInput[] = [];
  const client = {
    requestPlan: async (i: PlanInput) => {
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
    const A = fakePlan('A');
    const { result } = setup([A, new Error('Solver failed')]);
    await act(async () => { await result.current.generate(); });
    expect(result.current.plan).toBe(A);
    await act(async () => { await result.current.generate(); });
    expect(result.current.plan).toBe(A);
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

  it('generate passes overrides on top of the settings', async () => {
    const { result, calls } = setup([fakePlan('A')]);
    await act(async () => { await result.current.generate({ locks: { milk: 1000 } }); });
    expect(calls[0].locks).toEqual({ milk: 1000 });
    expect(calls[0].maxDistinctFoods).toBe(DEFAULT_SETTINGS.maxDistinctFoods);
  });

  it('setSettings persists to localStorage', async () => {
    const { result } = setup([]);
    act(() => result.current.setSettings({ ...DEFAULT_SETTINGS, maxDistinctFoods: 12 }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('planner.settings')!).maxDistinctFoods).toBe(12));
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
