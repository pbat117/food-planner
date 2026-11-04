/**
 * Builds src/data/foods.json from data/foods-seed.csv and the USDA FoodData Central
 * SR Legacy bulk CSV download (no API key needed).
 *
 * 1. Download and unzip:
 *    https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
 * 2. npx tsx scripts/build-foods.ts <path to the unzipped folder>
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Aisle, Food, FoodCategory, NutrientId, NutrientVector } from '../src/engine/types';

/** FDC nutrient id → our id and unit conversion factor. Arrays are fallbacks, in order. */
const MAP: { ours: NutrientId; fdc: number[]; factor: number; sum?: boolean; zeroOk?: boolean }[] = [
  { ours: 'energy', fdc: [1008], factor: 1 },
  { ours: 'protein', fdc: [1003], factor: 1 },
  { ours: 'carbs', fdc: [1005], factor: 1 },
  { ours: 'fiber', fdc: [1079], factor: 1 },
  { ours: 'fat', fdc: [1004], factor: 1 },
  { ours: 'satFat', fdc: [1258], factor: 1 },
  { ours: 'addedSugar', fdc: [1235], factor: 1, zeroOk: true },
  { ours: 'sodium', fdc: [1093], factor: 1 },
  { ours: 'potassium', fdc: [1092], factor: 1 },
  { ours: 'calcium', fdc: [1087], factor: 1 },
  { ours: 'iron', fdc: [1089], factor: 1 },
  { ours: 'magnesium', fdc: [1090], factor: 1 },
  { ours: 'phosphorus', fdc: [1091], factor: 1 },
  { ours: 'zinc', fdc: [1095], factor: 1 },
  { ours: 'selenium', fdc: [1103], factor: 1 },
  { ours: 'copper', fdc: [1098], factor: 1000 },
  { ours: 'manganese', fdc: [1101], factor: 1 },
  { ours: 'vitA', fdc: [1106], factor: 1 },
  { ours: 'vitC', fdc: [1162], factor: 1 },
  { ours: 'vitD', fdc: [1114], factor: 1 },
  { ours: 'vitE', fdc: [1109], factor: 1 },
  { ours: 'vitK', fdc: [1185], factor: 1 },
  { ours: 'thiamin', fdc: [1165], factor: 1 },
  { ours: 'riboflavin', fdc: [1166], factor: 1 },
  { ours: 'niacin', fdc: [1167], factor: 1 },
  { ours: 'vitB6', fdc: [1175], factor: 1 },
  { ours: 'folate', fdc: [1190], factor: 1 },
  { ours: 'vitB12', fdc: [1178], factor: 1 },
  { ours: 'pantothenicAcid', fdc: [1170], factor: 1 },
  { ours: 'choline', fdc: [1180], factor: 1 },
  { ours: 'ala', fdc: [1404, 1270], factor: 1 },
  { ours: 'linoleicAcid', fdc: [1269, 1316], factor: 1 },
  { ours: 'epaDha', fdc: [1278, 1272], factor: 1000, sum: true, zeroOk: true },
];

/** Minimal CSV parser for quoted, comma-separated rows. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function readCsv(file: string): Record<string, string>[] {
  const [head, ...rows] = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const cols = parseCsvLine(head);
  return rows.map((r) => {
    const v = parseCsvLine(r);
    return Object.fromEntries(cols.map((c, i) => [c, v[i] ?? '']));
  });
}

function main(): void {
  const srDir = process.argv[2];
  if (!srDir) throw new Error('usage: tsx scripts/build-foods.ts <SR Legacy CSV folder>');
  const root = path.resolve(__dirname, '..');
  const seed = readCsv(path.join(root, 'data/foods-seed.csv'));
  const wanted = new Set(seed.map((s) => s.fdcId));

  // fdcId → (nutrient id → amount per 100 g), streamed line by line to stay light.
  const amounts = new Map<string, Map<number, number>>();
  const lines = fs.readFileSync(path.join(srDir, 'food_nutrient.csv'), 'utf8').split(/\r?\n/);
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const [, fdcId, nutrientId, amount] = parseCsvLine(line);
    if (!wanted.has(fdcId)) continue;
    if (!amounts.has(fdcId)) amounts.set(fdcId, new Map());
    amounts.get(fdcId)!.set(Number(nutrientId), Number(amount));
  }

  const foods: Food[] = seed.map((s) => {
    const a = amounts.get(s.fdcId);
    if (!a) throw new Error(`No USDA data for ${s.id} (fdcId ${s.fdcId})`);
    const per100g: NutrientVector = {};
    const missing: NutrientId[] = [];
    for (const m of MAP) {
      const found = m.fdc.filter((id) => a.has(id));
      if (found.length === 0) {
        per100g[m.ours] = 0;
        if (!m.zeroOk) missing.push(m.ours);
        continue;
      }
      const raw = m.sum ? found.reduce((t, id) => t + a.get(id)!, 0) : a.get(found[0])!;
      per100g[m.ours] = Math.round(raw * m.factor * 1000) / 1000;
    }
    return {
      id: s.id,
      fdcId: Number(s.fdcId),
      name: s.name,
      per100g,
      category: s.category as FoodCategory,
      aisle: s.aisle as Aisle,
      unit: { name: s.unitName, plural: s.unitPlural, grams: Number(s.unitGrams) },
      roundTo: s.roundTo === 'unit' ? 'unit' : Number(s.roundTo),
      shelfLifeDays: Number(s.shelfLifeDays),
      maxWeeklyGrams: Number(s.maxWeeklyGrams),
      minGrams: Number(s.minGrams),
      ...(s.dailyHint ? { dailyHint: s.dailyHint } : {}),
      missing,
    };
  });

  fs.writeFileSync(path.join(root, 'src/data/foods.json'), JSON.stringify(foods, null, 1) + '\n');
  console.log(`Wrote ${foods.length} foods`);
  for (const f of foods.filter((x) => x.missing.length)) console.log(`  ${f.id}: missing ${f.missing.join(', ')}`);
}

main();
