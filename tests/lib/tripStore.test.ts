import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '@/lib/settings';
import { loadPantry, loadTrips, savePantry, saveTrips } from '@/lib/tripStore';

function memStore(seed: Record<string, string> = {}): KeyValueStore {
  const data = new Map(Object.entries(seed));
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('tripStore', () => {
  it('round-trips trips and pantry', () => {
    const s = memStore();
    saveTrips([{ date: '2026-11-05', days: 3, daily: { milk: 250 } }], s);
    savePantry({ 'brown-rice': 500 }, s);
    expect(loadTrips(s)).toEqual([{ date: '2026-11-05', days: 3, daily: { milk: 250 } }]);
    expect(loadPantry(s)).toEqual({ 'brown-rice': 500 });
  });

  it('loadTrips/loadPantry reject garbage', () => {
    const s = memStore({
      'planner.trips': JSON.stringify([{ date: 'x', days: 3, daily: {} }, { date: '2026-11-05', days: 3, daily: { milk: 'a', unicorn: 5, oats: 80 } }, 7]),
      'planner.pantry': JSON.stringify({ oats: -3, unicorn: 9, milk: 500 }),
    });
    expect(loadTrips(s)).toEqual([{ date: '2026-11-05', days: 3, daily: { oats: 80 } }]);
    expect(loadPantry(s)).toEqual({ milk: 500 });
    expect(loadTrips(memStore({ 'planner.trips': '{nope' }))).toEqual([]);
    expect(loadPantry(memStore({ 'planner.pantry': '[1]' }))).toEqual({});
    const throwing: KeyValueStore = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
    expect(loadTrips(throwing)).toEqual([]);
    expect(() => savePantry({}, throwing)).not.toThrow();
  });
});
