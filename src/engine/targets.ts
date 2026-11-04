import { driFor, MICRO_IDS } from '@/data/nutrients';
import {
  type Activity, type NutrientId, type NutrientTarget, type Profile,
  UnsupportedProfileError, type WeeklyTargets,
} from './types';

const ACTIVITY_FACTOR: Record<Activity, number> = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, veryActive: 1.9,
};
const GOAL_ADJUST = { maintain: 0, lose: -500, gain: 300 } as const;
const CALORIE_FLOOR = { male: 1500, female: 1200 } as const;
const DAYS = 7;

function validate(p: Profile): void {
  const check = (ok: boolean, msg: string) => { if (!ok) throw new UnsupportedProfileError(msg); };
  check(Number.isFinite(p.age) && p.age >= 19 && p.age <= 100, 'Age must be between 19 and 100.');
  check(Number.isFinite(p.heightCm) && p.heightCm >= 120 && p.heightCm <= 230, 'Height must be between 120 and 230 cm.');
  check(Number.isFinite(p.weightKg) && p.weightKg >= 30 && p.weightKg <= 300, 'Weight must be between 30 and 300 kg.');
  check(p.sex === 'male' || p.sex === 'female', 'Sex must be male or female (used for the reference values).');
  check(Object.hasOwn(ACTIVITY_FACTOR, p.activity), 'Choose an activity level.');
  check(Object.hasOwn(GOAL_ADJUST, p.goal), 'Choose a goal: maintain, lose or gain.');
  if (p.calorieOverride !== undefined) {
    check(Number.isFinite(p.calorieOverride) && p.calorieOverride > 0, 'Daily calories must be a positive number.');
  }
  if (p.proteinGoal !== undefined) {
    check(Number.isFinite(p.proteinGoal.value) && p.proteinGoal.value > 0, 'Protein goal must be a positive number.');
  }
}

export function dailyCaloriesFor(p: Profile): number {
  const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
  const computed = bmr * ACTIVITY_FACTOR[p.activity] + GOAL_ADJUST[p.goal];
  const chosen = p.calorieOverride ?? computed;
  return Math.round(Math.max(chosen, CALORIE_FLOOR[p.sex]));
}

export function computeWeeklyTargets(profile: Profile): WeeklyTargets {
  validate(profile);
  const kcal = dailyCaloriesFor(profile);
  const w = (daily: number) => daily * DAYS;
  const n = {} as Record<NutrientId, NutrientTarget>;

  n.energy = { id: 'energy', target: w(kcal), lowBelow: w(kcal) * 0.95, max: w(kcal) * 1.05 };

  const g = profile.proteinGoal;
  const proteinDaily = !g ? 0.8 * profile.weightKg : g.mode === 'gPerKg' ? g.value * profile.weightKg : g.value;
  n.protein = { id: 'protein', target: w(proteinDaily), lowBelow: w(proteinDaily) };

  const fiber = (14 * kcal) / 1000;
  n.fiber = { id: 'fiber', target: w(fiber), lowBelow: w(fiber) * 0.9 };

  const fatMin = (0.2 * kcal) / 9;
  n.fat = { id: 'fat', target: w(fatMin), lowBelow: w(fatMin) * 0.9, max: w((0.35 * kcal) / 9) };
  const carbMin = (0.45 * kcal) / 4;
  n.carbs = { id: 'carbs', target: w(carbMin), lowBelow: w(carbMin) * 0.9, max: w((0.65 * kcal) / 4) };

  n.satFat = { id: 'satFat', max: w((0.1 * kcal) / 9) };
  n.addedSugar = { id: 'addedSugar', max: w((0.1 * kcal) / 4) };

  for (const id of MICRO_IDS) {
    const d = driFor(id, profile.sex, profile.age);
    const t: NutrientTarget = { id };
    if (d.daily !== undefined) { t.target = w(d.daily); t.lowBelow = w(d.daily) * 0.9; }
    if (d.upper !== undefined) {
      if (d.upperScope === 'total') t.max = w(d.upper);
      else t.supplementMax = d.upper;
    }
    n[id] = t;
  }

  return { dailyCalories: kcal, nutrients: n };
}
