const CM_PER_IN = 2.54;
const LB_PER_KG = 2.20462;

/** Feet + inches → whole centimetres. */
export function ftInToCm(ft: number, inches: number): number {
  return Math.round((ft * 12 + inches) * CM_PER_IN);
}

/** Centimetres → feet + inches (to the nearest half inch). */
export function cmToFtIn(cm: number): { ft: number; inches: number } {
  const total = Math.round((cm / CM_PER_IN) * 2) / 2;
  const ft = Math.floor(total / 12);
  return { ft, inches: total - ft * 12 };
}

/** Pounds → kg, to 0.1 kg. */
export function lbToKg(lb: number): number {
  return Math.round((lb / LB_PER_KG) * 10) / 10;
}

/** kg → whole pounds. */
export function kgToLb(kg: number): number {
  return Math.round(kg * LB_PER_KG);
}
