import type { Food } from '@/engine/types';
import data from './foods.json';

export const FOODS: Food[] = data as Food[];

/** Extras the app never picks on its own; they appear only if you like or include them. */
export const NOT_AUTO_PICKED = new Set(['whey-protein']);

const BY_ID = new Map(FOODS.map((f) => [f.id, f]));

export function getFood(id: string): Food {
  const f = BY_ID.get(id);
  if (!f) throw new Error(`Unknown food id: ${id}`);
  return f;
}
