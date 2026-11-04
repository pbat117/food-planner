import type { NutrientId } from '@/engine/types';

/** Nutrients you can tell the app you'll cover with a supplement, with a typical dose and when to take it. */
export const SUPPLEMENTABLE: { id: NutrientId; typicalDose: number; label: string; timing: string }[] = [
  { id: 'vitD', typicalDose: 25, label: 'Vitamin D3 1,000 IU', timing: 'With a meal that has some fat, so it absorbs well.' },
  { id: 'epaDha', typicalDose: 300, label: 'Fish oil (EPA + DHA)', timing: 'With a meal; this also cuts down on fishy burps.' },
  { id: 'vitB12', typicalDose: 25, label: 'Vitamin B12', timing: 'Any time of day, with or without food.' },
  { id: 'iron', typicalDose: 18, label: 'Iron', timing: 'Away from milk, coffee and tea; vitamin C helps absorption.' },
  { id: 'calcium', typicalDose: 500, label: 'Calcium', timing: 'With food, at most 500 mg at once, and not at the same time as iron.' },
  { id: 'magnesium', typicalDose: 200, label: 'Magnesium', timing: 'With food; evening works well.' },
  { id: 'zinc', typicalDose: 10, label: 'Zinc', timing: 'With a meal, away from iron and calcium.' },
  { id: 'folate', typicalDose: 400, label: 'Folate', timing: 'Any time of day.' },
  { id: 'vitK', typicalDose: 100, label: 'Vitamin K2', timing: 'With a meal that has some fat.' },
  { id: 'potassium', typicalDose: 99, label: 'Potassium', timing: 'With food and water.' },
];

export function supplementTiming(id: NutrientId): string | undefined {
  return SUPPLEMENTABLE.find((s) => s.id === id)?.timing;
}
