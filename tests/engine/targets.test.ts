import { describe, expect, it } from 'vitest';
import { computeWeeklyTargets } from '@/engine/targets';
import { UnsupportedProfileError, type Profile } from '@/engine/types';

const man30: Profile = { age: 30, sex: 'male', heightCm: 180, weightKg: 80, activity: 'moderate', goal: 'maintain' };

describe('computeWeeklyTargets', () => {
  it('calories via Mifflin-St Jeor', () => {
    const t = computeWeeklyTargets(man30);
    expect(t.dailyCalories).toBe(2759);
    expect(t.nutrients.energy.target).toBe(19313);
    expect(t.nutrients.energy.max).toBeCloseTo(20278.65, 1);
  });
  it('protein default 0.8 g/kg and custom g/kg', () => {
    expect(computeWeeklyTargets(man30).nutrients.protein.target).toBeCloseTo(448);
    expect(computeWeeklyTargets({ ...man30, proteinGoal: { mode: 'gPerKg', value: 1.6 } }).nutrients.protein.target).toBeCloseTo(896);
  });
  it('fiber scales with calories', () => {
    expect(computeWeeklyTargets(man30).nutrients.fiber.target).toBeCloseTo(270.38, 1);
  });
  it('vit C target, low threshold and max', () => {
    const c = computeWeeklyTargets(man30).nutrients.vitC;
    expect(c.target).toBeCloseTo(630);
    expect(c.lowBelow).toBeCloseTo(567);
    expect(c.max).toBeCloseTo(14000);
  });
  it('iron changes for women after 50', () => {
    const w = { ...man30, sex: 'female' as const };
    expect(computeWeeklyTargets({ ...w, age: 25 }).nutrients.iron.target).toBe(126);
    expect(computeWeeklyTargets({ ...w, age: 55 }).nutrients.iron.target).toBe(56);
  });
  it('magnesium UL is supplement-only', () => {
    const m = computeWeeklyTargets({ ...man30, age: 40 }).nutrients.magnesium;
    expect(m.target).toBe(2940);
    expect(m.max).toBeUndefined();
    expect(m.supplementMax).toBe(350);
  });
  it('caps: sodium, saturated fat, added sugar', () => {
    const n = computeWeeklyTargets(man30).nutrients;
    expect(n.sodium.max).toBe(16100);
    expect(n.satFat.max).toBeCloseTo(214.59, 1);
    expect(n.addedSugar.max).toBeCloseTo(482.83, 1);
  });
  it('rejects unsupported profiles', () => {
    expect(() => computeWeeklyTargets({ ...man30, age: 17 })).toThrow(UnsupportedProfileError);
    expect(() => computeWeeklyTargets({ ...man30, weightKg: 0 })).toThrow(UnsupportedProfileError);
  });
  it('calorie floor on aggressive loss', () => {
    const small: Profile = { age: 60, sex: 'female', heightCm: 150, weightKg: 45, activity: 'sedentary', goal: 'lose' };
    expect(computeWeeklyTargets(small).dailyCalories).toBe(1200);
  });
  it('every tracked nutrient has a target or a max', () => {
    const n = computeWeeklyTargets(man30).nutrients;
    expect(Object.keys(n).length).toBe(33);
    Object.values(n).forEach(t => expect(t.target !== undefined || t.max !== undefined).toBe(true));
  });
});
