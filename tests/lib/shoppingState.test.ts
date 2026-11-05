import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '@/lib/settings';
import { loadShopping, saveShopping } from '@/lib/shoppingState';

function memStore(): KeyValueStore {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('shoppingState', () => {
  it('shoppingState resets per trip date', () => {
    const s = memStore();
    saveShopping('2026-11-05', { checked: ['milk'], have: ['oats'] }, s);
    expect(loadShopping('2026-11-05', s)).toEqual({ checked: ['milk'], have: ['oats'] });
    expect(loadShopping('2026-11-08', s)).toEqual({ checked: [], have: [] });
  });

  it('garbage gives an empty list', () => {
    const s = memStore();
    s.setItem('planner.shopping', '{"date":"2026-11-05","checked":"milk","have":[1,"oats"]}');
    expect(loadShopping('2026-11-05', s)).toEqual({ checked: [], have: ['oats'] });
    s.setItem('planner.shopping', 'nope');
    expect(loadShopping('2026-11-05', s)).toEqual({ checked: [], have: [] });
  });
});
