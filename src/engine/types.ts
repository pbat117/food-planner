export type NutrientId =
  | 'energy' | 'protein' | 'carbs' | 'fiber' | 'fat' | 'satFat' | 'addedSugar'
  | 'sodium' | 'potassium' | 'calcium' | 'iron' | 'magnesium' | 'phosphorus'
  | 'zinc' | 'selenium' | 'copper' | 'manganese'
  | 'vitA' | 'vitC' | 'vitD' | 'vitE' | 'vitK' | 'thiamin' | 'riboflavin'
  | 'niacin' | 'vitB6' | 'folate' | 'vitB12' | 'pantothenicAcid' | 'choline'
  | 'ala' | 'linoleicAcid' | 'epaDha';

export type NutrientVector = Partial<Record<NutrientId, number>>;

export type Sex = 'male' | 'female';
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'veryActive';

export interface Profile {
  age: number;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  activity: Activity;
  goal: 'maintain' | 'lose' | 'gain';
  proteinGoal?: { mode: 'gPerDay' | 'gPerKg'; value: number };
  /** Daily kcal; replaces the computed value (the floor still applies). */
  calorieOverride?: number;
}

/** All amounts are weekly, except supplementMax which is a daily supplement dose cap. */
export interface NutrientTarget {
  id: NutrientId;
  /** The 100% value. */
  target?: number;
  /** Below this the nutrient is 'low'. */
  lowBelow?: number;
  /** Above this the nutrient is 'high'; applies to total intake. */
  max?: number;
  /** Daily cap on supplement dose only (UL that applies to supplements, not food). */
  supplementMax?: number;
}

export interface WeeklyTargets {
  dailyCalories: number;
  nutrients: Record<NutrientId, NutrientTarget>;
}

export class UnsupportedProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedProfileError';
  }
}
