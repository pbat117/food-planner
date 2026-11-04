import { getFood } from '@/data/foods';
import type { Aisle } from './types';

export interface RoundedAmount {
  foodId: string;
  grams: number;
  units: number;
  /** The "roughly" column: "6", "2 small containers", "≈ 7 handfuls". */
  label: string;
  locked: boolean;
  dailyHint?: string;
}

export const AISLE_ORDER: Aisle[] = ['Produce', 'Meat & Fish', 'Dairy & Eggs', 'Pantry', 'Frozen'];

function unitLabel(units: number, name: string, plural: string): string {
  if (!name) return `${units}`;
  return `${units} ${units === 1 ? name : plural || name}`;
}

/** Rounds a weekly gram amount to what you'd actually buy, with a human label. */
export function roundAmount(foodId: string, grams: number, locked = false): RoundedAmount {
  const f = getFood(foodId);
  const { unit } = f;
  let finalGrams: number;
  let units: number;
  let label: string;

  if (f.roundTo === 'unit') {
    units = Math.max(1, Math.round(grams / unit.grams));
    finalGrams = locked ? grams : units * unit.grams;
    label = unitLabel(units, unit.name, unit.plural);
  } else {
    const step = f.roundTo;
    finalGrams = locked ? grams : Math.max(step, Math.round(grams / step) * step);
    units = Math.round((finalGrams / unit.grams) * 2) / 2;
    label = units < 0.5 ? `${Math.round(finalGrams)} g` : `≈ ${unitLabel(units, unit.name, unit.plural)}`;
  }

  return {
    foodId,
    grams: finalGrams,
    units,
    label,
    locked,
    ...(f.dailyHint ? { dailyHint: f.dailyHint } : {}),
  };
}

export function sortByAisle(items: RoundedAmount[]): RoundedAmount[] {
  return [...items].sort((a, b) => {
    const fa = getFood(a.foodId);
    const fb = getFood(b.foodId);
    return AISLE_ORDER.indexOf(fa.aisle) - AISLE_ORDER.indexOf(fb.aisle) || fa.name.localeCompare(fb.name);
  });
}
