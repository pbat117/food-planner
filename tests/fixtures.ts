import type { Profile } from '@/engine/types';
import { computeWeeklyTargets } from '@/engine/targets';

export const man30: Profile = {
  age: 30, sex: 'male', heightCm: 180, weightKg: 80, activity: 'moderate', goal: 'maintain',
};
export const targets = computeWeeklyTargets(man30);
