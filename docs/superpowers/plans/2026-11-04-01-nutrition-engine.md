# Plan 1: Nutrition Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tested, UI-free TypeScript engine that turns a profile + liked foods + recipes + locks + supplements into a rounded weekly food list and a nutrient report with fix suggestions.

**Architecture:** Pure modules under `src/engine/` (no React, no network), bundled data under `src/data/`. The optimizer builds a mixed-integer LP and solves it with HiGHS (WebAssembly). `planWeek()` composes optimize → round → analyze. Later plans call only the functions in the Interfaces blocks below.

**Tech Stack:** Next.js (App Router) + TypeScript (strict), Vitest, `highs` npm package, `tsx` for scripts.

**Spec:** `docs/superpowers/specs/2026-11-04-nutrition-shopping-planner-design.md` (sections 4, 5, 6 are the ones this plan implements). Roadmap: `docs/superpowers/plans/2026-11-04-00-roadmap.md`.

## Global Constraints

- No AI/LLM calls anywhere.
- Engine modules are pure: no `fetch`, no DOM, no React imports in `src/engine/**`.
- All amounts inside the engine are **weekly** and in the nutrient's own unit; food amounts are **grams**.
- Nutrient reference values live only in `src/data/nutrients.ts`, each with a `source` string.
- Targets are daily value × 7. Status: **low** < `lowBelow`; **high** > `max`; else **ok**.
- Upper limits that apply to supplements only (magnesium, folic acid, niacin, vitamin E) never cap food.
- Calories hard band ±5% of target; protein ≥ goal; sodium ≤ 2,300 mg/day; saturated fat < 10% kcal; added sugar < 10% kcal.
- Not tracked: iodine, biotin, chromium, molybdenum (`UNTRACKED_NUTRIENTS` constant for the UI).
- Supported ages 19–100, not pregnant/lactating (outside → `UnsupportedProfileError`).
- Optimizer must always return a plan (never throw for infeasibility).
- Commit after every task.

## Review Focus

1. **Liked list too small to meet targets** (e.g. 4 foods) → closest plan returned, lows listed, no crash. Test in Task 5.
2. **Recipes alone exceed a cap** (2× a very salty recipe) → plan returned, `relaxed` contains `sodium`, sodium status `high`, advisor names the recipe as the top source. Tests in Tasks 5 and 7.
3. **Lock above `maxWeeklyGrams` or on a disliked food** → the lock wins (explicit user choice) and appears in the result unchanged. Test in Task 5.
4. **Unsupported or extreme profile** (age 17, weight 0) → `UnsupportedProfileError` with a readable message; aggressive "lose" goal never drops daily calories below 1,500 (male) / 1,200 (female). Tests in Task 2.
5. **Food missing a nutrient value** (USDA gaps) → treated as 0 in analysis (no `NaN`), and listed by the data validation test. Tests in Tasks 3 and 4.

---

## File Structure

```
src/engine/types.ts          shared types (Task 2)
src/data/nutrients.ts        DRI reference table (Task 2)
src/engine/targets.ts        profile → WeeklyTargets (Task 2)
data/foods-seed.csv          hand-curated food list (Task 3)
scripts/build-foods.ts       seed + USDA → src/data/foods.json (Task 3)
src/data/foods.json          generated food database (Task 3)
src/data/foods.ts            typed loader + getFood() (Task 3)
src/engine/analyze.ts        amounts → NutrientReport (Task 4)
src/engine/optimizer.ts      PlanInput → OptimizeResult (Task 5)
src/engine/rounding.ts       grams → RoundedAmount (Task 6)
src/engine/planWeek.ts       optimize → round → analyze (Task 6)
src/engine/advisor.ts        suggestions for low/high/recipe combos (Task 7)
scripts/sample-week.ts       terminal printout for user review (Task 8)
tests/engine/*.test.ts       one test file per module
```

---

### Task 1: Project scaffold

**Files:**
- Create: Next.js project at repo root, `vitest.config.ts`, `.gitignore` additions, `tests/smoke.test.ts`

**Interfaces:**
- Produces: `npm test` runs Vitest; path alias `@/*` → `src/*`.

- [ ] **Step 1: Init git** — `git init` in `C:\Users\pbati\Food`, then commit the existing `docs/` (`docs: add spec and plans`).
- [ ] **Step 2: Scaffold Next.js** — `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack`. If it refuses because `docs/` exists, move `docs` to the scratchpad, scaffold, move it back.
- [ ] **Step 3: Install dev/runtime deps** — `npm i highs` and `npm i -D vitest tsx @types/node`. Add `"test": "vitest run"` and `"test:watch": "vitest"` to `package.json` scripts.
- [ ] **Step 4: Write `vitest.config.ts`** with `resolve.alias` `@` → `./src`, `test.include: ['tests/**/*.test.ts']`, `test.testTimeout: 20000`.
- [ ] **Step 5: Smoke test** — `tests/smoke.test.ts`: `expect(1 + 1).toBe(2)`. Run `npm test` → 1 passed.
- [ ] **Step 6: Confirm `.gitignore`** contains `.env*.local` and `node_modules`. Commit: `chore: scaffold Next.js + Vitest`.

---

### Task 2: Types, nutrient reference data, weekly targets

**Files:**
- Create: `src/engine/types.ts`, `src/data/nutrients.ts`, `src/engine/targets.ts`
- Test: `tests/engine/targets.test.ts`

**Interfaces:**
- Produces (in `types.ts`):

```ts
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
  age: number; sex: Sex; heightCm: number; weightKg: number;
  activity: Activity; goal: 'maintain' | 'lose' | 'gain';
  proteinGoal?: { mode: 'gPerDay' | 'gPerKg'; value: number };
  calorieOverride?: number;            // daily kcal
}
export interface NutrientTarget {
  id: NutrientId;
  target?: number;        // the 100% value (weekly)
  lowBelow?: number;      // below this → 'low' (weekly)
  max?: number;           // above this → 'high'; applies to total intake (weekly)
  supplementMax?: number; // daily cap on supplement dose only
}
export interface WeeklyTargets { dailyCalories: number; nutrients: Record<NutrientId, NutrientTarget>; }
export class UnsupportedProfileError extends Error {}
```

- Produces (in `targets.ts`): `computeWeeklyTargets(profile: Profile): WeeklyTargets`
- Produces (in `nutrients.ts`): `NUTRIENTS: Record<NutrientId, { name: string; unit: 'kcal'|'g'|'mg'|'mcg'; source: string }>`, `UNTRACKED_NUTRIENTS: string[]`, and the DRI table below.

**Reference values (adults, daily; "M/F"; age bands 19–30, 31–50, 51–70, 71+):**

| Nutrient | Value | Upper | Notes |
|---|---|---|---|
| protein | 0.8 g/kg default | — | or user goal |
| fiber | 14 g per 1,000 kcal | — | |
| fat | ≥ 20% kcal (÷9) | ≤ 35% kcal | target = lowBelow = 20% |
| carbs | ≥ 45% kcal (÷4) | ≤ 65% kcal | target = lowBelow = 45% |
| satFat | — | < 10% kcal (÷9) | |
| addedSugar | — | < 10% kcal (÷4) | |
| sodium | 1,500 mg | 2,300 mg (CDRR) | |
| potassium | 3,400 / 2,600 mg | — | 2019 DRI |
| calcium | 1,000 mg; F 51+ and all 71+: 1,200 | 2,500 (≤50), 2,000 (51+) | total |
| iron | M 8; F 18 (≤50), 8 (51+) mg | 45 | total |
| magnesium | M 400/420; F 310/320 (19–30 / 31+) mg | 350 | supplementsOnly |
| phosphorus | 700 mg | 4,000 (≤70), 3,000 (71+) | total |
| zinc | 11 / 8 mg | 40 | total |
| selenium | 55 mcg | 400 | total |
| copper | 900 mcg | 10,000 | total |
| manganese | 2.3 / 1.8 mg | 11 | total |
| vitA | 900 / 700 mcg RAE | 3,000 | total (UL is preformed; apply to total — conservative) |
| vitC | 90 / 75 mg | 2,000 | total |
| vitD | 15 mcg (≤70), 20 (71+) | 100 | total |
| vitE | 15 mg | 1,000 | supplementsOnly |
| vitK | 120 / 90 mcg | — | |
| thiamin | 1.2 / 1.1 mg | — | |
| riboflavin | 1.3 / 1.1 mg | — | |
| niacin | 16 / 14 mg | 35 | supplementsOnly |
| vitB6 | 1.3 (≤50); 51+: M 1.7 / F 1.5 mg | 100 | total |
| folate | 400 mcg DFE | 1,000 | supplementsOnly (folic acid) |
| vitB12 | 2.4 mcg | — | |
| pantothenicAcid | 5 mg | — | |
| choline | 550 / 425 mg | 3,500 | total |
| ala | 1.6 / 1.1 g | — | |
| linoleicAcid | M 17 (≤50), 14 (51+); F 12 (≤50), 11 (51+) g | — | |
| epaDha | 250 mg (guideline) | — | source must say "guideline, not a DRI" |

Every nutrient with a `target`: `lowBelow = 0.9 × target` (except fat, carbs, protein: `lowBelow = target`). "total" uppers become `max`; "supplementsOnly" uppers become `supplementMax` (daily, not ×7).

**Calories:** Mifflin-St Jeor BMR = 10·kg + 6.25·cm − 5·age + 5 (M) / −161 (F). Activity factors: 1.2, 1.375, 1.55, 1.725, 1.9. Goal: lose −500, gain +300. Floor: 1,500 (M) / 1,200 (F). `calorieOverride` replaces the result (floor still applies). Round daily kcal to the nearest whole number. `energy`: `target = 7·daily`, `lowBelow = 0.95·target`, `max = 1.05·target`.

- [ ] **Step 1: Write the failing tests** (`tests/engine/targets.test.ts`)

```ts
const man30: Profile = { age: 30, sex: 'male', heightCm: 180, weightKg: 80, activity: 'moderate', goal: 'maintain' };
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
it('fiber scales with calories', () => expect(computeWeeklyTargets(man30).nutrients.fiber.target).toBeCloseTo(270.38, 1));
it('vit C target, low threshold and max', () => {
  const c = computeWeeklyTargets(man30).nutrients.vitC;
  expect(c).toMatchObject({ target: 630, lowBelow: 567, max: 14000 });
});
it('iron changes for women after 50', () => {
  const w = { ...man30, sex: 'female' as const };
  expect(computeWeeklyTargets({ ...w, age: 25 }).nutrients.iron.target).toBe(126);
  expect(computeWeeklyTargets({ ...w, age: 55 }).nutrients.iron.target).toBe(56);
});
it('magnesium UL is supplement-only', () => {
  const m = computeWeeklyTargets({ ...man30, age: 40 }).nutrients.magnesium;
  expect(m.target).toBe(2940); expect(m.max).toBeUndefined(); expect(m.supplementMax).toBe(350);
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
  const small = { age: 60, sex: 'female' as const, heightCm: 150, weightKg: 45, activity: 'sedentary' as const, goal: 'lose' as const };
  expect(computeWeeklyTargets(small).dailyCalories).toBe(1200);
});
```

- [ ] **Step 2: Run** `npm test -- targets` → FAIL (module not found).
- [ ] **Step 3: Implement** `types.ts`, `nutrients.ts` (table above, one `source` string per nutrient citing NIH ODS / National Academies DRI or DGA), `targets.ts`. Validation: age 19–100, heightCm 120–230, weightKg 30–300, else throw `UnsupportedProfileError` with a message naming the field.
- [ ] **Step 4: Run** `npm test -- targets` → all PASS.
- [ ] **Step 5: Commit** `feat(engine): nutrient reference data and weekly targets`.

---

### Task 3: Food database

**Files:**
- Create: `data/foods-seed.csv`, `scripts/build-foods.ts`, `src/data/foods.json` (generated, committed), `src/data/foods.ts`
- Test: `tests/data/foods.test.ts`

**Interfaces:**
- Consumes: `NutrientId`, `NutrientVector` (Task 2)
- Produces (add to `types.ts`):

```ts
export type FoodCategory = 'protein' | 'carb' | 'vegetable' | 'fruit' | 'fat' | 'dairy' | 'other';
export type Aisle = 'Produce' | 'Meat & Fish' | 'Dairy & Eggs' | 'Pantry' | 'Frozen';
export interface Food {
  id: string; fdcId: number; name: string;
  per100g: NutrientVector;
  category: FoodCategory; aisle: Aisle;
  unit: { name: string; plural: string; grams: number };   // name '' for countable fruit ("6")
  roundTo: 'unit' | number;                                // whole units, or a gram step
  shelfLifeDays: number; maxWeeklyGrams: number; minGrams: number;
  dailyHint?: string;
  missing: NutrientId[];                                   // nutrients USDA had no value for
}
```
- Produces (in `foods.ts`): `FOODS: Food[]`, `getFood(id: string): Food` (throws on unknown id).

- [ ] **Step 1: Write `data/foods-seed.csv`** with columns `id,fdcId,name,category,aisle,unitName,unitPlural,unitGrams,roundTo,shelfLifeDays,maxWeeklyGrams,minGrams,dailyHint`. ~200 rows covering: 25+ proteins (ground beef 85/15, chicken breast, chicken thigh, eggs, salmon, canned tuna, sardines, tofu, tempeh, turkey, pork loin, shrimp, Greek yogurt…), 15+ legumes/grains (black beans canned, lentils, chickpeas, rice brown/white, oats, quinoa, whole-wheat pasta, bread…), 50+ vegetables, 35+ fruits, 20+ nuts/seeds/oils (almonds, walnuts, chia, flax, pumpkin seeds, olive oil, peanut butter…), 15+ dairy. Use **SR Legacy** `fdcId`s (look up via https://fdc.nal.usda.gov search, filter "SR Legacy"). Must include the user's example foods: banana (unit '' 118 g, roundTo unit, shelf 5), orange, kiwi, avocado, blackberries ("small container" 170 g), broccoli ("head" 600 g, roundTo unit), spinach ("bag" 142 g), sweet potato ("small" 130 g), red pepper, potato ("medium" 213 g), almonds ("handful" 30 g, roundTo 10, dailyHint "30 g a day, a small handful"), black beans ("can, drained" 250 g). Shelf life: ground beef 3, chicken 3, fish 2, berries 4, leafy greens 5, root veg 30, canned/dry 365.
- [ ] **Step 2: Write `scripts/build-foods.ts`** — reads the CSV, fetches `https://api.nal.usda.gov/fdc/v1/foods?fdcIds=…&format=full&api_key=$FDC_API_KEY` in batches of 20 (`DEMO_KEY` works for one run), maps nutrients by FDC nutrient id, writes `src/data/foods.json`. Mapping (`nutrient.id` → ours, × factor):

| FDC id | ours | factor | | FDC id | ours | factor |
|---|---|---|---|---|---|---|
| 1008 | energy | 1 | | 1106 | vitA | 1 |
| 1003 | protein | 1 | | 1162 | vitC | 1 |
| 1005 | carbs | 1 | | 1114 | vitD | 1 |
| 1079 | fiber | 1 | | 1109 | vitE | 1 |
| 1004 | fat | 1 | | 1185 | vitK | 1 |
| 1258 | satFat | 1 | | 1165 | thiamin | 1 |
| 1235 | addedSugar | 1 (missing → 0, not flagged) | | 1166 | riboflavin | 1 |
| 1093 | sodium | 1 | | 1167 | niacin | 1 |
| 1092 | potassium | 1 | | 1175 | vitB6 | 1 |
| 1087 | calcium | 1 | | 1190 | folate | 1 |
| 1089 | iron | 1 | | 1178 | vitB12 | 1 |
| 1090 | magnesium | 1 | | 1170 | pantothenicAcid | 1 |
| 1091 | phosphorus | 1 | | 1180 | choline | 1 |
| 1095 | zinc | 1 | | 1404 (fallback 1270) | ala | 1 |
| 1103 | selenium | 1 | | 1269 (fallback 1316) | linoleicAcid | 1 |
| 1098 | copper | **1000** (mg→mcg) | | 1278 + 1272 | epaDha | **1000** (g→mg), summed |
| 1101 | manganese | 1 | | | | |

  Missing values: set to 0 and push the id to `missing` (except `addedSugar` and `epaDha` for plant foods, which are genuinely 0).
- [ ] **Step 3: Run** `npx tsx scripts/build-foods.ts` (with `FDC_API_KEY` set, or `DEMO_KEY`). Expected: "Wrote N foods" with N ≥ 200 and a printed list of foods with `missing` entries.
- [ ] **Step 4: Write `tests/data/foods.test.ts`**

```ts
it('has at least 200 foods with unique ids', () => { expect(FOODS.length).toBeGreaterThanOrEqual(200); expect(new Set(FOODS.map(f => f.id)).size).toBe(FOODS.length); });
it('every food has energy, sane units and bounds', () => FOODS.forEach(f => {
  expect(f.per100g.energy).toBeGreaterThanOrEqual(0);
  expect(f.unit.grams).toBeGreaterThan(0);
  expect(f.maxWeeklyGrams).toBeGreaterThan(f.minGrams);
  expect(f.shelfLifeDays).toBeGreaterThan(0);
}));
it('no nutrient value is NaN or negative', () => FOODS.forEach(f => Object.values(f.per100g).forEach(v => { expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0); })));
it('spot-check banana and almonds against USDA', () => {
  expect(getFood('banana').per100g.energy).toBeCloseTo(89, 0);
  expect(getFood('banana').per100g.potassium).toBeCloseTo(358, -1);
  expect(getFood('almonds').per100g.vitE).toBeGreaterThan(20);
});
it('getFood throws on unknown id', () => expect(() => getFood('nope')).toThrow());
```

- [ ] **Step 5: Run** `npm test -- foods` → PASS. Commit `feat(data): USDA-based food database`.

---

### Task 4: Nutrient analyzer

**Files:**
- Create: `src/engine/analyze.ts`
- Test: `tests/engine/analyze.test.ts`

**Interfaces:**
- Consumes: `Food`, `getFood`, `WeeklyTargets` (Tasks 2–3)
- Produces (add to `types.ts`):

```ts
export interface RecipeUse { recipeId: string; name: string; ingredients: { foodId: string; grams: number }[]; count: number } // ingredients = one batch
export interface SupplementUse { nutrient: NutrientId; dailyDose: number; label: string }
export type Status = 'low' | 'ok' | 'high';
export interface NutrientLine {
  id: NutrientId; total: number; target?: number; max?: number;
  percent?: number;        // total / target × 100
  status: Status;
  sources: { label: string; kind: 'food' | 'recipe' | 'supplement'; amount: number }[]; // sorted desc
}
export interface NutrientReport { lines: Record<NutrientId, NutrientLine>; weeklyCalories: number; dailyCalories: number; }
```
- Produces: `analyze(amounts: Record<string, number>, recipes: RecipeUse[], supplements: SupplementUse[], targets: WeeklyTargets): NutrientReport` — `amounts` is foodId → weekly grams.

Recipe source label: `` `${name} (${count}×)` ``. Supplement label: `` `💊 ${label}` ``, contributes `dailyDose × 7`.

- [ ] **Step 1: Write failing tests**

```ts
it('sums foods per 100 g', () => {
  const r = analyze({ banana: 700 }, [], [], targets);
  expect(r.lines.potassium.total).toBeCloseTo(getFood('banana').per100g.potassium! * 7);
});
it('adds recipes × count and supplements × 7', () => {
  const recipe = { recipeId: 'r1', name: 'Tikka', ingredients: [{ foodId: 'chicken-breast', grams: 500 }], count: 2 };
  const r = analyze({}, [recipe], [{ nutrient: 'vitD', dailyDose: 25, label: 'Vitamin D 1000 IU' }], targets);
  expect(r.lines.protein.total).toBeCloseTo(getFood('chicken-breast').per100g.protein! * 10);
  expect(r.lines.vitD.sources.find(s => s.kind === 'supplement')!.amount).toBe(175);
  expect(r.lines.protein.sources[0].label).toBe('Tikka (2×)');
});
it('status thresholds', () => {
  const r = analyze({ banana: 100 }, [], [], targets);
  expect(r.lines.vitC.status).toBe('low');
  const salty = analyze({}, [], [{ nutrient: 'sodium', dailyDose: 3000, label: 'salt' }], targets);
  expect(salty.lines.sodium.status).toBe('high');
});
it('missing nutrient data never produces NaN', () => {
  const r = analyze({ banana: 100 }, [], [], targets);
  Object.values(r.lines).forEach(l => expect(Number.isFinite(l.total)).toBe(true));
});
it('daily calories = weekly / 7', () => {
  const r = analyze({ banana: 700 }, [], [], targets);
  expect(r.dailyCalories).toBeCloseTo(r.weeklyCalories / 7);
});
```
(`targets = computeWeeklyTargets(man30)` in a shared `tests/fixtures.ts`, together with `man30`.)

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `analyze`. Status: `high` if `max` defined and total > max; else `low` if `lowBelow` defined and total < lowBelow; else `ok`. Missing `per100g` key → 0.
- [ ] **Step 4: Run** `npm test -- analyze` → PASS. **Step 5: Commit** `feat(engine): nutrient analyzer`.

---

### Task 5: Optimizer

**Files:**
- Create: `src/engine/optimizer.ts`
- Test: `tests/engine/optimizer.test.ts`

**Interfaces:**
- Consumes: `analyze` types, `FOODS`, `WeeklyTargets` (Tasks 2–4)
- Produces (add to `types.ts`):

```ts
export interface PlanInput {
  targets: WeeklyTargets;
  likedFoodIds: string[];             // candidates; empty → all non-disliked foods
  dislikedFoodIds: string[];
  recipes: RecipeUse[];
  locks: Record<string, number>;      // foodId → weekly grams (always honored)
  supplements: SupplementUse[];
  supplementedNutrients: NutrientId[]; // optimizer ignores deficits for these
  maxDistinctFoods: number;            // default 15
}
export interface OptimizeResult { amounts: Record<string, number>; relaxed: (NutrientId)[]; status: 'optimal' | 'timeLimit'; }
```
- Produces: `optimize(input: PlanInput): Promise<OptimizeResult>`

**Formulation** (build a CPLEX-LP string; variables named by index `x0…`, `y0…`, slacks `d…`, `s…`):
- Candidates C = (liked, or all foods) − disliked − locked. Locked foods are constants.
- Fixed contribution `F_n` = recipes + locks + supplements×7.
- For each candidate: `x_f − minGrams·y_f ≥ 0`, `x_f − maxWeeklyGrams·y_f ≤ 0`, `y_f` binary.
- `Σ y_f ≤ max(0, maxDistinctFoods − |locked foods| − |distinct recipe foods not in C|)`.
- For each nutrient n with `target` (excluding `energy` and supplemented nutrients): `Σ a_nf·x_f + d1_n + d2_n ≥ target_n − F_n`, `0 ≤ d1_n ≤ 0.1·target_n`, `d2_n ≥ 0`. Objective terms `d1_n/target_n + 10·d2_n/target_n`. (Two tiers stop the LP from sacrificing one nutrient entirely.)
- Protein: same as above but weight `1000/target` on both tiers.
- Energy band: `Σ a·x + e_lo ≥ lowBelow − F`, `Σ a·x − e_hi ≤ max − F`, weight `1000/target`.
- Each `max` (total-scope): `Σ a_nf·x_f − s_n ≤ max_n − F_n`, weight `1000/max_n`.
- Tie-breaker: `+ 1e-6 · Σ x_f`.
- Solve: `const highs = await (await import('highs')).default(); highs.solve(lp, { time_limit: 5, mip_rel_gap: 0.01 })`. Cache the loaded instance.
- `relaxed` = nutrient ids whose `e_lo`/`e_hi`/`s_n` slack > 1e-6, or protein deficit > 1e-6 (use `'energy'` / `'protein'` ids). `amounts` = candidates with `x_f > 0.5` plus all locks.
- `Status` from HiGHS: `'Optimal'` → `optimal`; `'Time limit reached'` with a solution → `timeLimit`. Any other status: rerun once with `maxDistinctFoods + 5`; if still failing, return locks only with `relaxed` = every nutrient that's low (never throw).

- [ ] **Step 1: Write failing tests**

```ts
const liked = ['ground-beef-85','chicken-breast','eggs','salmon','black-beans','brown-rice','oats','sweet-potato','potato','spinach','broccoli','red-pepper','banana','orange','kiwi','blackberries','avocado','almonds','greek-yogurt','olive-oil','milk','walnuts'];
const base: PlanInput = { targets, likedFoodIds: liked, dislikedFoodIds: [], recipes: [], locks: {}, supplements: [], supplementedNutrients: [], maxDistinctFoods: 15 };

it('meets calories, protein and caps with a realistic liked list', async () => {
  const r = await optimize(base);
  const rep = analyze(r.amounts, [], [], targets);
  expect(rep.lines.energy.status).toBe('ok');
  expect(rep.lines.protein.status).not.toBe('low');
  expect(['sodium','satFat','addedSugar'].every(n => rep.lines[n as NutrientId].status !== 'high')).toBe(true);
  expect(Object.keys(r.amounts).length).toBeLessThanOrEqual(15);
});
it('never uses disliked foods', async () => {
  const r = await optimize({ ...base, dislikedFoodIds: ['salmon','spinach'] });
  expect(r.amounts.salmon).toBeUndefined(); expect(r.amounts.spinach).toBeUndefined();
});
it('respects per-food bounds', async () => {
  const r = await optimize(base);
  for (const [id, g] of Object.entries(r.amounts)) { const f = getFood(id); expect(g).toBeGreaterThanOrEqual(f.minGrams - 0.5); expect(g).toBeLessThanOrEqual(f.maxWeeklyGrams + 0.5); }
});
it('locks win, even above max or on a disliked food', async () => {
  const r = await optimize({ ...base, dislikedFoodIds: ['banana'], locks: { banana: 2000 } });
  expect(r.amounts.banana).toBe(2000);
});
it('tiny liked list still returns a plan', async () => {
  const r = await optimize({ ...base, likedFoodIds: ['banana','brown-rice','chicken-breast','olive-oil'] });
  expect(Object.keys(r.amounts).length).toBeGreaterThan(0);
});
it('salty recipe → sodium relaxed, not a crash', async () => {
  const salty = { recipeId: 's', name: 'Salty Soup', ingredients: [{ foodId: 'soy-sauce', grams: 600 }], count: 2 };
  const r = await optimize({ ...base, recipes: [salty] });
  expect(r.relaxed).toContain('sodium');
});
it('supplemented nutrient is not chased with food', async () => {
  const r = await optimize({ ...base, supplementedNutrients: ['vitD','epaDha'], supplements: [{ nutrient: 'vitD', dailyDose: 25, label: 'D3' }] });
  expect(r.amounts.salmon ?? 0).toBeLessThan(200);
});
it('all-foods candidate set solves within 6 s', async () => {
  const t0 = Date.now(); await optimize({ ...base, likedFoodIds: [] }); expect(Date.now() - t0).toBeLessThan(6000);
});
```
(`soy-sauce` must exist in the seed CSV. Put `liked`, `base` and `salty` in `tests/fixtures.ts` — Tasks 6 and 7 reuse them.)

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `optimize` per the formulation.
- [ ] **Step 4: Run** `npm test -- optimizer` → PASS. If "supplemented" test fails because salmon is chosen for protein, assert instead that vitD is not in any deficit term (inspect LP string via an exported `buildLp(input): string` helper) — do not weaken the other tests.
- [ ] **Step 5: Commit** `feat(engine): MILP optimizer`.

---

### Task 6: Rounding and `planWeek`

**Files:**
- Create: `src/engine/rounding.ts`, `src/engine/planWeek.ts`
- Test: `tests/engine/rounding.test.ts`, `tests/engine/planWeek.test.ts`

**Interfaces:**
- Consumes: `optimize`, `analyze`, `getFood`
- Produces:

```ts
export interface RoundedAmount { foodId: string; grams: number; units: number; label: string; locked: boolean; dailyHint?: string }
export function roundAmount(foodId: string, grams: number, locked?: boolean): RoundedAmount;
export interface WeekPlan { items: RoundedAmount[]; report: NutrientReport; relaxed: NutrientId[]; input: PlanInput }
export function planWeek(input: PlanInput): Promise<WeekPlan>;
export function reanalyze(items: RoundedAmount[], input: PlanInput): NutrientReport; // "Re-analyze only"
```

Rules: `roundTo === 'unit'` → `units = max(1, round(grams/unit.grams))`, `grams = units × unit.grams`, label `` `${units}` `` when unit name is `''`, else `` `${units} ${units === 1 ? name : plural}` ``. Numeric `roundTo` → grams rounded to that step (min one step), `units = grams/unit.grams` rounded to 0.5, label `` `≈ ${units} ${plural or name}` ``. Locked amounts are never rounded (`grams` unchanged, label still computed). Items sorted by aisle then name.

- [ ] **Step 1: Failing tests** (rounding)

```ts
expect(roundAmount('banana', 700)).toMatchObject({ grams: 708, units: 6, label: '6' });
expect(roundAmount('blackberries', 300)).toMatchObject({ grams: 340, units: 2, label: '2 small containers' });
expect(roundAmount('broccoli', 300)).toMatchObject({ units: 1, label: '1 head' });
expect(roundAmount('almonds', 213)).toMatchObject({ grams: 210, label: '≈ 7 handfuls' });
expect(roundAmount('banana', 650, true).grams).toBe(650);
```
  (planWeek)
```ts
it('report reflects rounded grams, not raw optimizer grams', async () => {
  const p = await planWeek(base);
  const direct = analyze(Object.fromEntries(p.items.map(i => [i.foodId, i.grams])), base.recipes, base.supplements, base.targets);
  expect(p.report.lines.energy.total).toBeCloseTo(direct.lines.energy.total);
});
it('reanalyze uses edited amounts without re-optimizing', async () => {
  const p = await planWeek(base);
  const edited = p.items.map(i => i.foodId === p.items[0].foodId ? { ...i, grams: i.grams * 2 } : i);
  expect(reanalyze(edited, base).lines.energy.total).toBeGreaterThan(p.report.lines.energy.total);
});
```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test -- rounding planWeek` → PASS. **Step 5: Commit** `feat(engine): rounding and planWeek`.

---

### Task 7: Advisor

**Files:**
- Create: `src/engine/advisor.ts`
- Test: `tests/engine/advisor.test.ts`

**Interfaces:**
- Consumes: `WeekPlan`, `planWeek`, `getFood`, `FOODS`
- Produces:

```ts
export interface FoodSuggestion { nutrient: NutrientId; foodId: string; addGrams: number; newPercent: number; addedKcal: number; liked: boolean }
export interface ExcessExplanation { nutrient: NutrientId; percentOfMax: number; topSources: { label: string; kind: 'food'|'recipe'|'supplement'; share: number }[]; hints: string[] }
export interface ComboSuggestion { recipes: { recipeId: string; count: number }[]; fixes: NutrientId[]; summary: string }
export function suggestForLow(plan: WeekPlan, nutrient: NutrientId, limit?: number): FoodSuggestion[]; // default 3
export function explainHigh(plan: WeekPlan, nutrient: NutrientId): ExcessExplanation;
export function suggestRecipeCombos(plan: WeekPlan): Promise<ComboSuggestion[]>; // best ≤ 3 that improve
```

Rules:
- `suggestForLow`: gap = `target − total`; candidates = non-disliked foods with `per100g[n] > 0`; `addGrams` = `min(maxWeeklyGrams, ceil(gap / (per100g[n]/100) / 10) × 10)`; rank liked first, then by `addedKcal` ascending; skip candidates whose addition would push any capped nutrient (`sodium`, `satFat`, `addedSugar`) to `high`.
- `explainHigh`: `share` = source amount / total; top 3; `hints` built from the top source kind: recipe → `` `Make ${name} ${count − 1}× instead of ${count}×` `` (or "Remove …" when count is 1); food → `` `Reduce ${food name}` ``; supplement → `` `Lower the ${label} dose` ``.
- `suggestRecipeCombos`: variants = each recipe count −1 (drop if 0), each recipe removed; run `planWeek` per variant; score = (#low + #high) then total relative deficit; return variants that score better than the current plan, best first; `summary` like "Making Pasta Bake once instead of twice fixes saturated fat and calories."

- [ ] **Step 1: Failing tests**

```ts
it('vitamin D suggestion prefers liked foods', async () => {
  const p = await planWeek({ ...base, likedFoodIds: liked.filter(f => f !== 'salmon') });
  const s = suggestForLow(p, 'vitD');
  expect(s.length).toBeGreaterThan(0);
  expect(s[0].newPercent).toBeGreaterThan(p.report.lines.vitD.percent!);
});
it('excess names the salty recipe first with a reduce hint', async () => {
  const p = await planWeek({ ...base, recipes: [salty] });
  const e = explainHigh(p, 'sodium');
  expect(e.topSources[0].label).toBe('Salty Soup (2×)');
  expect(e.hints[0]).toBe('Make Salty Soup 1× instead of 2×');
});
it('recipe combo suggestion improves the plan', async () => {
  const p = await planWeek({ ...base, recipes: [salty] });
  const c = await suggestRecipeCombos(p);
  expect(c[0].fixes).toContain('sodium');
});
```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test -- advisor` → PASS. **Step 5: Commit** `feat(engine): advisor suggestions`.

---

### Task 8: Sample week printout + full verification

**Files:**
- Create: `scripts/sample-week.ts`

**Interfaces:**
- Consumes: `computeWeeklyTargets`, `planWeek`, `suggestForLow`, `explainHigh`

- [ ] **Step 1: Write the script** — reads a profile + liked list from `scripts/sample-input.json` (Claude fills it with the user's real stats after asking), runs `planWeek`, prints: a food table (Food | grams | Roughly, matching the user's screenshot format), calories weekly + daily vs target, every nutrient with % and status, and for each low/high line the top suggestion/explanation.
- [ ] **Step 2: Run** `npx tsx scripts/sample-week.ts` → readable table, no `NaN`, finishes in < 10 s.
- [ ] **Step 3: Run the full suite** `npm test` → all tests pass; `npx tsc --noEmit` → no errors.
- [ ] **Step 4: Commit** `feat: sample week script`. Show the user the printout and collect feedback for Plan 2.
