import { defaultStore, type KeyValueStore } from './settings';

export const SHOPPING_KEY = 'planner.shopping';

/** Ticks on the Shopping tab. They belong to one trip, so a new trip date starts fresh. */
export interface ShoppingState { checked: string[]; have: string[] }

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function loadShopping(date: string, store: KeyValueStore | null = defaultStore()): ShoppingState {
  try {
    const raw = JSON.parse(store?.getItem(SHOPPING_KEY) ?? 'null') as Record<string, unknown> | null;
    if (!raw || raw.date !== date) return { checked: [], have: [] };
    return { checked: strings(raw.checked), have: strings(raw.have) };
  } catch {
    return { checked: [], have: [] };
  }
}

export function saveShopping(date: string, s: ShoppingState, store: KeyValueStore | null = defaultStore()): void {
  try {
    store?.setItem(SHOPPING_KEY, JSON.stringify({ date, ...s }));
  } catch {
    // Storage full or blocked: ticks last for this visit only.
  }
}
