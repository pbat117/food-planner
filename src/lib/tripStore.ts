import { FOODS } from '@/data/foods';
import type { TripRecord } from '@/engine/tripPlan';
import { defaultStore, type KeyValueStore } from './settings';

export const TRIPS_KEY = 'planner.trips';
export const PANTRY_KEY = 'planner.pantry';

const FOOD_IDS = new Set(FOODS.map((f) => f.id));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function read(key: string, store: KeyValueStore | null): unknown {
  try {
    const text = store?.getItem(key);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown, store: KeyValueStore | null): void {
  try {
    store?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: keep working in memory.
  }
}

/** foodId → positive grams, known foods only. */
export function gramsMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  for (const [id, g] of Object.entries(v)) {
    if (FOOD_IDS.has(id) && typeof g === 'number' && Number.isFinite(g) && g > 0) out[id] = g;
  }
  return out;
}

export function loadTrips(store: KeyValueStore | null = defaultStore()): TripRecord[] {
  const raw = read(TRIPS_KEY, store);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => (isObj(r) && typeof r.date === 'string' && ISO_DATE.test(r.date)
    && typeof r.days === 'number' && r.days >= 1 && r.days <= 14
    ? [{ date: r.date, days: Math.round(r.days), daily: gramsMap(r.daily) }] : []));
}

export function saveTrips(t: TripRecord[], store: KeyValueStore | null = defaultStore()): void {
  write(TRIPS_KEY, t, store);
}

export function loadPantry(store: KeyValueStore | null = defaultStore()): Record<string, number> {
  return gramsMap(read(PANTRY_KEY, store));
}

export function savePantry(p: Record<string, number>, store: KeyValueStore | null = defaultStore()): void {
  write(PANTRY_KEY, p, store);
}
