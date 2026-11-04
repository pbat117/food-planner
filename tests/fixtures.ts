import type { Profile } from '@/engine/types';
import { computeWeeklyTargets } from '@/engine/targets';

export const man30: Profile = {
  age: 30, sex: 'male', heightCm: 180, weightKg: 80, activity: 'moderate', goal: 'maintain',
};
export const targets = computeWeeklyTargets(man30);

import type { PlanInput, RecipeUse } from '@/engine/types';

export const liked = ['ground-beef-85', 'chicken-breast', 'eggs', 'salmon', 'black-beans', 'brown-rice', 'oats',
  'sweet-potato', 'potato', 'spinach', 'broccoli', 'red-pepper', 'banana', 'orange', 'kiwi', 'blackberries',
  'avocado', 'almonds', 'greek-yogurt', 'olive-oil', 'milk', 'walnuts'];

export const base: PlanInput = {
  targets, likedFoodIds: liked, dislikedFoodIds: [], recipes: [], locks: {}, supplements: [],
  supplementedNutrients: [], maxDistinctFoods: 15,
};

export const salty: RecipeUse = {
  recipeId: 's', name: 'Salty Soup', ingredients: [{ foodId: 'soy-sauce', grams: 600 }], count: 2,
};
