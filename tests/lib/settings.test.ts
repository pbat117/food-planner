import { describe, expect, it } from 'vitest';
import { planWeek } from '@/engine/planWeek';
import {
  DEFAULT_SETTINGS, type KeyValueStore, loadSettings, prefOf, saveSettings, setPref, type Settings, toPlanInput,
} from '@/lib/settings';

function memStore(initial: string | null = null): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== null) data.set('planner.settings', initial);
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('settings storage', () => {
  it('loadSettings returns defaults for garbage', () => {
    expect(loadSettings(memStore('{nope'))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memStore(null))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memStore('42'))).toEqual(DEFAULT_SETTINGS);
  });
  it('loadSettings merges partial data and drops wrong types', () => {
    const s = loadSettings(memStore('{"version":1,"likedFoodIds":["oats"],"maxDistinctFoods":"x","profile":{"age":"old","weightKg":70}}'));
    expect(s.likedFoodIds).toEqual(['oats']);
    expect(s.maxDistinctFoods).toBe(DEFAULT_SETTINGS.maxDistinctFoods);
    expect(s.profile.age).toBe(DEFAULT_SETTINGS.profile.age);
    expect(s.profile.weightKg).toBe(70);
    expect(s.includeFoodIds).toEqual([]);
  });
  it('drops unknown food ids', () => {
    expect(loadSettings(memStore('{"version":1,"likedFoodIds":["oats","not-a-food"]}')).likedFoodIds).toEqual(['oats']);
  });
  it('save then load round-trips', () => {
    const store = memStore();
    const s: Settings = { ...DEFAULT_SETTINGS, likedFoodIds: ['milk'], regularItems: { milk: 1400 }, unitSystem: 'metric' };
    saveSettings(s, store);
    expect(loadSettings(store)).toEqual(s);
  });
  it('defaults assume nothing about what you eat', () => {
    expect(DEFAULT_SETTINGS.includeFoodIds).toEqual([]);
    expect(DEFAULT_SETTINGS.likedFoodIds).toEqual([]);
    expect(DEFAULT_SETTINGS.supplements).toEqual([]);
    expect(DEFAULT_SETTINGS.regularItems).toEqual({});
  });
});

describe('toPlanInput', () => {
  it('with default settings produces a valid PlanInput', async () => {
    const input = toPlanInput(DEFAULT_SETTINGS);
    expect(input.targets.nutrients.protein.target).toBeGreaterThan(0);
    expect(input.locks).toEqual({});
    expect(input.supplementedNutrients).toEqual([]);
    const plan = await planWeek(input);
    expect(plan.items.length).toBeGreaterThan(0);
  }, 30000);
  it('maps supplements and regular items', () => {
    const input = toPlanInput({
      ...DEFAULT_SETTINGS,
      supplements: [{ nutrient: 'vitD', dailyDose: 25, label: 'D3' }, { nutrient: 'epaDha', dailyDose: 300, label: 'Fish oil' }],
      regularItems: { milk: 1400 },
    });
    expect(input.supplementedNutrients).toEqual(['vitD', 'epaDha']);
    expect(input.locks).toEqual({ milk: 1400 });
  });
  it('fruit null means no fruit rule', () => {
    expect(toPlanInput({ ...DEFAULT_SETTINGS, fruit: null }).fruit).toBeUndefined();
  });
});

describe('food preferences', () => {
  const s: Settings = { ...DEFAULT_SETTINGS, includeFoodIds: ['kiwi'], likedFoodIds: ['kiwi', 'oats'] };
  it('dislike removes from include and liked', () => {
    const n = setPref(s, 'kiwi', 'disliked');
    expect(n.includeFoodIds).toEqual([]);
    expect(n.likedFoodIds).toEqual(['oats']);
    expect(n.dislikedFoodIds).toEqual(['kiwi']);
    expect(prefOf(n, 'kiwi')).toBe('disliked');
  });
  it('include adds to include and liked, and clears disliked', () => {
    const n = setPref({ ...s, dislikedFoodIds: ['milk'] }, 'milk', 'include');
    expect(n.includeFoodIds).toContain('milk');
    expect(n.likedFoodIds).toContain('milk');
    expect(n.dislikedFoodIds).toEqual([]);
    expect(prefOf(n, 'milk')).toBe('include');
  });
  it('neutral removes from all three; liked is liked only', () => {
    const n = setPref(s, 'kiwi', 'neutral');
    expect(prefOf(n, 'kiwi')).toBe('neutral');
    expect(n.likedFoodIds).toEqual(['oats']);
    expect(prefOf(setPref(s, 'kiwi', 'liked'), 'kiwi')).toBe('liked');
    expect(setPref(s, 'kiwi', 'liked').includeFoodIds).toEqual([]);
  });
  it('does not mutate its input', () => {
    setPref(s, 'kiwi', 'disliked');
    expect(s.includeFoodIds).toEqual(['kiwi']);
  });
});
