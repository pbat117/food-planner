import type { NutrientId, Sex } from '@/engine/types';

const DRI = 'National Academies Dietary Reference Intakes (via NIH Office of Dietary Supplements)';
const DRI_2019 = 'National Academies DRIs for Sodium and Potassium (2019)';
const DGA = 'Dietary Guidelines for Americans (USDA/HHS)';
const AMDR = 'National Academies Acceptable Macronutrient Distribution Range';

export type NutrientUnit = 'kcal' | 'g' | 'mg' | 'mcg';

export const NUTRIENTS: Record<NutrientId, { name: string; unit: NutrientUnit; source: string }> = {
  energy: { name: 'Calories', unit: 'kcal', source: 'Mifflin-St Jeor equation × activity factor' },
  protein: { name: 'Protein', unit: 'g', source: `${DRI}; or user goal` },
  carbs: { name: 'Carbohydrates', unit: 'g', source: AMDR },
  fiber: { name: 'Fiber', unit: 'g', source: `${DRI} (14 g per 1,000 kcal)` },
  fat: { name: 'Fat', unit: 'g', source: AMDR },
  satFat: { name: 'Saturated fat', unit: 'g', source: `${DGA}: under 10% of calories` },
  addedSugar: { name: 'Added sugar', unit: 'g', source: `${DGA}: under 10% of calories` },
  sodium: { name: 'Sodium', unit: 'mg', source: `${DRI_2019} (AI and CDRR)` },
  potassium: { name: 'Potassium', unit: 'mg', source: DRI_2019 },
  calcium: { name: 'Calcium', unit: 'mg', source: DRI },
  iron: { name: 'Iron', unit: 'mg', source: DRI },
  magnesium: { name: 'Magnesium', unit: 'mg', source: DRI },
  phosphorus: { name: 'Phosphorus', unit: 'mg', source: DRI },
  zinc: { name: 'Zinc', unit: 'mg', source: DRI },
  selenium: { name: 'Selenium', unit: 'mcg', source: DRI },
  copper: { name: 'Copper', unit: 'mcg', source: DRI },
  manganese: { name: 'Manganese', unit: 'mg', source: DRI },
  vitA: { name: 'Vitamin A', unit: 'mcg', source: `${DRI} (RAE)` },
  vitC: { name: 'Vitamin C', unit: 'mg', source: DRI },
  vitD: { name: 'Vitamin D', unit: 'mcg', source: DRI },
  vitE: { name: 'Vitamin E', unit: 'mg', source: DRI },
  vitK: { name: 'Vitamin K', unit: 'mcg', source: DRI },
  thiamin: { name: 'Thiamin (B1)', unit: 'mg', source: DRI },
  riboflavin: { name: 'Riboflavin (B2)', unit: 'mg', source: DRI },
  niacin: { name: 'Niacin (B3)', unit: 'mg', source: DRI },
  vitB6: { name: 'Vitamin B6', unit: 'mg', source: DRI },
  folate: { name: 'Folate', unit: 'mcg', source: `${DRI} (DFE)` },
  vitB12: { name: 'Vitamin B12', unit: 'mcg', source: DRI },
  pantothenicAcid: { name: 'Pantothenic acid (B5)', unit: 'mg', source: DRI },
  choline: { name: 'Choline', unit: 'mg', source: DRI },
  ala: { name: 'Omega-3 (ALA)', unit: 'g', source: DRI },
  linoleicAcid: { name: 'Omega-6 (linoleic acid)', unit: 'g', source: DRI },
  epaDha: { name: 'Omega-3 (EPA + DHA)', unit: 'mg', source: 'Common expert guideline of 250 mg/day — a guideline, not a DRI' },
};

export const UNTRACKED_NUTRIENTS = ['Iodine', 'Biotin', 'Chromium', 'Molybdenum'];

export interface DriValue {
  /** Daily RDA or AI. */
  daily?: number;
  /** Daily upper limit. */
  upper?: number;
  upperScope?: 'total' | 'supplementsOnly';
}

type Micro = Exclude<NutrientId, 'energy' | 'protein' | 'carbs' | 'fiber' | 'fat' | 'satFat' | 'addedSugar'>;

/** Adult (19+) daily reference values for micronutrients and fatty acids. */
export function driFor(id: Micro, sex: Sex, age: number): DriValue {
  const m = sex === 'male';
  const total = (daily: number, upper?: number): DriValue => ({ daily, upper, upperScope: upper ? 'total' : undefined });
  const supp = (daily: number, upper: number): DriValue => ({ daily, upper, upperScope: 'supplementsOnly' });
  switch (id) {
    // Only the upper limit is used: home cooking adds salt that food data can't see, so a "low" flag would mislead.
    case 'sodium': return { upper: 2300, upperScope: 'total' };
    case 'potassium': return total(m ? 3400 : 2600);
    case 'calcium': return total(age >= 71 || (!m && age >= 51) ? 1200 : 1000, age >= 51 ? 2000 : 2500);
    case 'iron': return total(m || age >= 51 ? 8 : 18, 45);
    case 'magnesium': return supp(m ? (age <= 30 ? 400 : 420) : (age <= 30 ? 310 : 320), 350);
    case 'phosphorus': return total(700, age >= 71 ? 3000 : 4000);
    case 'zinc': return total(m ? 11 : 8, 40);
    case 'selenium': return total(55, 400);
    case 'copper': return total(900, 10000);
    case 'manganese': return total(m ? 2.3 : 1.8, 11);
    // The UL covers preformed vitamin A (retinol), not carotenoids from plants, so food is not capped.
    case 'vitA': return supp(m ? 900 : 700, 3000);
    case 'vitC': return total(m ? 90 : 75, 2000);
    case 'vitD': return total(age >= 71 ? 20 : 15, 100);
    case 'vitE': return supp(15, 1000);
    case 'vitK': return total(m ? 120 : 90);
    case 'thiamin': return total(m ? 1.2 : 1.1);
    case 'riboflavin': return total(m ? 1.3 : 1.1);
    case 'niacin': return supp(m ? 16 : 14, 35);
    case 'vitB6': return total(age <= 50 ? 1.3 : m ? 1.7 : 1.5, 100);
    case 'folate': return supp(400, 1000);
    case 'vitB12': return total(2.4);
    case 'pantothenicAcid': return total(5);
    case 'choline': return total(m ? 550 : 425, 3500);
    case 'ala': return total(m ? 1.6 : 1.1);
    case 'linoleicAcid': return total(m ? (age <= 50 ? 17 : 14) : (age <= 50 ? 12 : 11));
    case 'epaDha': return total(250);
  }
}

export const MICRO_IDS: Micro[] = [
  'sodium', 'potassium', 'calcium', 'iron', 'magnesium', 'phosphorus', 'zinc', 'selenium',
  'copper', 'manganese', 'vitA', 'vitC', 'vitD', 'vitE', 'vitK', 'thiamin', 'riboflavin',
  'niacin', 'vitB6', 'folate', 'vitB12', 'pantothenicAcid', 'choline', 'ala', 'linoleicAcid', 'epaDha',
];
