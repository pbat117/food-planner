import { FOODS } from '@/data/foods';
import { NUTRIENTS } from '@/data/nutrients';
import { computeWeeklyTargets } from '@/engine/targets';
import type { NutrientId, PlanInput, Profile, SupplementUse } from '@/engine/types';

export interface Settings {
  version: 1;
  profile: Profile;
  unitSystem: 'imperial' | 'metric';
  /** "Your foods": always in the plan, sized by the app. */
  includeFoodIds: string[];
  /** Foods the app may pick from (staples). Empty means any food that is not disliked. */
  likedFoodIds: string[];
  dislikedFoodIds: string[];
  fruit: { gramsPerDay: number; maxKinds: number } | null;
  supplements: SupplementUse[];
  /** foodId → weekly grams of things you always eat (e.g. your own shake); become locks. */
  regularItems: Record<string, number>;
  maxDistinctFoods: number;
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  profile: {
    age: 30, sex: 'male', heightCm: 175, weightKg: 75, activity: 'moderate', goal: 'maintain',
    proteinGoal: { mode: 'gPerKg', value: 1.6 },
  },
  unitSystem: 'imperial',
  includeFoodIds: [],
  likedFoodIds: [],
  dislikedFoodIds: [],
  fruit: { gramsPerDay: 300, maxKinds: 5 },
  supplements: [],
  regularItems: {},
  maxDistinctFoods: 20,
};

export const SETTINGS_KEY = 'planner.settings';

export interface KeyValueStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export function defaultStore(): KeyValueStore | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

const FOOD_IDS = new Set(FOODS.map((f) => f.id));
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isPos = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
function oneOf<T extends string>(v: unknown, opts: readonly T[]): v is T {
  return typeof v === 'string' && (opts as readonly string[]).includes(v);
}
const foodList = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && FOOD_IDS.has(x)))] : [];

function readProfile(v: unknown): Profile {
  const d = DEFAULT_SETTINGS.profile;
  if (!isObj(v)) return structuredClone(d);
  const pgRaw = v.proteinGoal;
  const pg = isObj(pgRaw) && oneOf(pgRaw.mode, ['gPerDay', 'gPerKg'] as const) && isPos(pgRaw.value)
    ? { mode: pgRaw.mode, value: pgRaw.value } : d.proteinGoal && { ...d.proteinGoal };
  return {
    age: isPos(v.age) ? v.age : d.age,
    sex: oneOf(v.sex, ['male', 'female'] as const) ? v.sex : d.sex,
    heightCm: isPos(v.heightCm) ? v.heightCm : d.heightCm,
    weightKg: isPos(v.weightKg) ? v.weightKg : d.weightKg,
    activity: oneOf(v.activity, ['sedentary', 'light', 'moderate', 'active', 'veryActive'] as const) ? v.activity : d.activity,
    goal: oneOf(v.goal, ['maintain', 'lose', 'gain'] as const) ? v.goal : d.goal,
    ...(pg ? { proteinGoal: pg } : {}),
    ...(isPos(v.calorieOverride) ? { calorieOverride: v.calorieOverride } : {}),
  };
}

/** Reads saved settings; anything missing or malformed falls back to the default, field by field. */
export function loadSettings(store: KeyValueStore | null = defaultStore()): Settings {
  let raw: unknown = null;
  try {
    const text = store?.getItem(SETTINGS_KEY);
    raw = text ? JSON.parse(text) : null;
  } catch {
    raw = null;
  }
  const d = DEFAULT_SETTINGS;
  if (!isObj(raw)) return structuredClone(d);
  const f = raw.fruit;
  const fruit = f === null ? null
    : isObj(f) && isPos(f.gramsPerDay) && isPos(f.maxKinds) ? { gramsPerDay: f.gramsPerDay, maxKinds: f.maxKinds } : structuredClone(d.fruit);
  const supplements: SupplementUse[] = [];
  if (Array.isArray(raw.supplements)) {
    for (const s of raw.supplements) {
      if (isObj(s) && typeof s.nutrient === 'string' && s.nutrient in NUTRIENTS && isPos(s.dailyDose) && typeof s.label === 'string') {
        supplements.push({ nutrient: s.nutrient as NutrientId, dailyDose: s.dailyDose, label: s.label });
      }
    }
  }
  const regularItems: Record<string, number> = {};
  if (isObj(raw.regularItems)) {
    for (const [k, v] of Object.entries(raw.regularItems)) if (FOOD_IDS.has(k) && isPos(v)) regularItems[k] = v;
  }
  return {
    version: 1,
    profile: readProfile(raw.profile),
    unitSystem: oneOf(raw.unitSystem, ['imperial', 'metric'] as const) ? raw.unitSystem : d.unitSystem,
    includeFoodIds: foodList(raw.includeFoodIds),
    likedFoodIds: foodList(raw.likedFoodIds),
    dislikedFoodIds: foodList(raw.dislikedFoodIds),
    fruit,
    supplements,
    regularItems,
    maxDistinctFoods: isPos(raw.maxDistinctFoods) ? Math.round(raw.maxDistinctFoods) : d.maxDistinctFoods,
  };
}

export function saveSettings(s: Settings, store: KeyValueStore | null = defaultStore()): void {
  try {
    store?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Storage full or blocked: the app keeps working with in-memory settings.
  }
}

/** Settings → engine input. Throws UnsupportedProfileError for out-of-range profiles. */
export function toPlanInput(s: Settings): PlanInput {
  return {
    targets: computeWeeklyTargets(s.profile),
    // Staples come from foods you like beyond "Your foods"; if there are none, from every food you don't dislike.
    likedFoodIds: s.likedFoodIds.some((id) => !s.includeFoodIds.includes(id)) ? [...s.likedFoodIds] : [],
    dislikedFoodIds: [...s.dislikedFoodIds],
    recipes: [],
    locks: { ...s.regularItems },
    supplements: s.supplements.map((x) => ({ ...x })),
    supplementedNutrients: [...new Set(s.supplements.map((x) => x.nutrient))],
    maxDistinctFoods: s.maxDistinctFoods,
    includeFoodIds: [...s.includeFoodIds],
    ...(s.fruit ? { fruit: { ...s.fruit } } : {}),
  };
}

export type FoodPref = 'include' | 'liked' | 'neutral' | 'disliked';

export function prefOf(s: Settings, foodId: string): FoodPref {
  if (s.includeFoodIds.includes(foodId)) return 'include';
  if (s.dislikedFoodIds.includes(foodId)) return 'disliked';
  if (s.likedFoodIds.includes(foodId)) return 'liked';
  return 'neutral';
}

/** Pure: returns new settings with the three food lists kept consistent. */
export function setPref(s: Settings, foodId: string, pref: FoodPref): Settings {
  const without = (l: string[]) => l.filter((x) => x !== foodId);
  const include = without(s.includeFoodIds);
  const liked = without(s.likedFoodIds);
  const disliked = without(s.dislikedFoodIds);
  if (pref === 'include') include.push(foodId);
  if (pref === 'include' || pref === 'liked') liked.push(foodId);
  const regularItems = { ...s.regularItems };
  if (pref === 'disliked') {
    disliked.push(foodId);
    delete regularItems[foodId];
  }
  return { ...s, includeFoodIds: include, likedFoodIds: liked, dislikedFoodIds: disliked, regularItems };
}
