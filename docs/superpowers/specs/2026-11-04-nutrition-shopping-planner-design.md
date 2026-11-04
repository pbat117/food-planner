# Nutrition Shopping Planner — Design Spec

**Date:** 2026-11-04
**Status:** Draft, awaiting user review
**Working name:** Nutrition Shopping Planner (user may rename later; the name does not affect the design)

## 1. Purpose

Generate a weekly shopping list that, if bought and fully eaten that week, meets roughly 100% of the user's **weekly** recommended intake for all tracked macro- and micronutrients, while respecting food likes/dislikes, chosen recipes, a protein goal, a calorie target, and upper safe limits. Then split that list across the user's grocery trips so perishables stay fresh.

Targets are weekly (daily target × 7) on purpose: hitting every target every day is impractical; hitting them across a week is realistic.

**Success looks like:** the user picks a couple of recipes, taps Analyze, sees what they'll get and what's short or excessive, fixes it (swap, lock, re-analyze, or supplement), and walks into the store with a per-trip list in real units ("6 bananas", "1 head broccoli").

## 2. Decisions made during brainstorming

| Topic | Decision |
|---|---|
| Users & data | User accounts; data syncs across devices |
| AI | **None anywhere.** All logic is deterministic code |
| Recipe input | Paste recipe text (rule-based parser) **or** manual entry; both end on the same review screen |
| List amounts | Grams **plus** a "roughly" real-world unit (e.g. "700 g — 6") |
| Changes | "Now vs New" comparison table, changed values in bold |
| Food at home | List always shows full weekly amounts (it's also the eating guide); per-item "I have this" removes it from the shopping view only |
| Bowls | Ingredient totals by default; optional "Suggest bowls" feature |
| Engine | Math optimizer (mixed-integer linear programming) |
| Excess | Too-high nutrients are flagged with causes and suggested fixes, same as deficits |
| Supplements | User can choose "I'll supplement this"; app suggests dose and when to take it |
| UI | Apple Human Interface Guidelines aesthetic; installable PWA |
| Hosting | Vercel (free tier) |

## 3. Architecture

- **Frontend/app:** Next.js (App Router) + TypeScript + Tailwind CSS, deployed on Vercel. Installable as a PWA (home-screen icon, offline support via service worker).
- **Auth + database:** Supabase (free tier). Email magic-link login (Sign in with Apple/Google optional later). Postgres with Row Level Security so each user can only read/write their own rows.
- **Core engine runs client-side** as pure TypeScript modules with no UI or network dependencies. Each module has one job and its own unit tests (Vitest):

| Module | Input → Output |
|---|---|
| `targets` | Profile → weekly targets (min / goal / max per nutrient, calories, protein) |
| `nutrition` | Food amounts + recipes + supplements → nutrient totals and per-source breakdown |
| `optimizer` | Targets + liked foods + fixed recipes + locks + supplements → food amounts in grams |
| `rounding` | Gram amounts → real-unit amounts ("roughly"), then re-analysis on rounded amounts |
| `advisor` | Nutrient report → explanations and fix suggestions (deficits, excesses, recipe-combo alternatives) |
| `trips` | Final amounts + schedule + shelf life → per-trip lists + per-trip eating guide |
| `recipeParser` | Pasted text → structured ingredients with match confidence |
| `bowls` | Weekly totals + meal slots → suggested bowl combinations |
| `supplements` | Remaining gaps + food intake → suggested dose and timing schedule |

- **LP solver:** `highs` (HiGHS compiled to WebAssembly, npm package), which supports mixed-integer problems. Runs in a Web Worker so the UI never freezes.
- **USDA search:** a small Next.js server route proxies FoodData Central search so the free API key stays secret. Only used for foods not in the built-in list.

## 4. Data

### 4.1 Nutrient reference file (`data/nutrients.ts`)
Single source of truth, with a citation per value. For each nutrient: id, name, unit, life-stage values (RDA or AI by sex/age), Upper Limit (UL) if any, and `ulScope`:
- `total` — UL applies to food + supplements (e.g. iron, zinc, selenium, calcium, copper, phosphorus, manganese, vitamin D, preformed vitamin A).
- `supplementsOnly` — UL applies only to supplement/fortified forms (magnesium, folic acid, niacin, vitamin E). The optimizer does **not** cap food intake for these; the supplement module respects them.

Sources: NIH Office of Dietary Supplements / National Academies DRIs (including 2019 sodium & potassium update), Dietary Guidelines for Americans (current edition) for saturated-fat and added-sugar caps.

**Tracked nutrients:** calories, protein, carbohydrate, fiber, total fat, saturated fat (cap: < 10% kcal), added sugar (cap: < 10% kcal), sodium (cap: 2,300 mg/day), potassium, calcium, iron, magnesium, phosphorus, zinc, selenium, copper, manganese, vitamins A (RAE), C, D, E, K, thiamin, riboflavin, niacin, B6, folate (DFE), B12, pantothenic acid, choline, ALA omega-3, linoleic acid, EPA+DHA (guideline 250–500 mg/day, labelled "guideline, not an official DRI").

**Not tracked (shown as "not enough food data"):** iodine, biotin, chromium, molybdenum — USDA data is too sparse to plan with.

### 4.2 Targets calculation
- Calories: Mifflin-St Jeor BMR × activity factor, adjusted by goal (maintain 0; lose −500/day; gain +300/day; user-editable).
- Protein: user goal (g/day or g/kg); default RDA 0.8 g/kg.
- Macros: fiber 14 g / 1,000 kcal; fat and carbs within AMDR ranges (fat 20–35%, carbs 45–65% of kcal).
- Every daily value × 7 = weekly target. Status thresholds: **Low** < 90% of target; **On target** 90% up to the max; **High** above UL (total-scope) or cap.

### 4.3 Built-in food list (`data/foods.json`)
~200 common whole foods, nutrient data extracted from USDA FoodData Central (Foundation / SR Legacy) per 100 g, bundled with the app. Extra fields per food:
- `unit` — name and grams of one "roughly" unit (banana 118 g; "head" broccoli ~600 g; "can, drained" black beans ~250 g; "small container" blackberries ~170 g). User-editable per account.
- `shelfLifeDays` — fridge/pantry days after purchase (ground beef 3, chicken 3, spinach 5, banana 5, potato 30, rice 180).
- `category` — protein / carb / vegetable / fruit / fat / dairy / other (used by bowls and aisle grouping).
- `aisle` — Produce / Meat & Fish / Dairy & Eggs / Pantry / Frozen.
- `maxWeeklyGrams` — realism cap (e.g. spinach 700 g, almonds 350 g), and `minGrams` when selected (avoid "12 g of broccoli").
- `dailyHint` — optional ("30 g a day, a small handful").

Foods added from USDA search are saved to the user's `custom_foods` with the same fields (shelf life and unit defaulted by category, editable).

### 4.4 Database tables (Supabase)
- `profiles` — user_id, age, sex, height, weight, activity, goal, protein goal, calorie override, max distinct foods (default 15), bowl meals per day (default 2), shopping schedule.
- `food_prefs` — user_id, food_id, `liked | disliked`, unit override.
- `custom_foods` — user-saved USDA foods.
- `recipes` — user_id, name, servings, source text; `recipe_ingredients` — recipe_id, food_id, grams, original line.
- `supplements` — user_id, nutrient, dose, unit, label, active.
- `have_it` — user_id, food_id, remember (bool) for auto-marking next week.
- `plans` — user_id, week start, chosen recipes + counts, locks, final amounts, trip split (JSON), status (draft/approved).

## 5. Weekly planning flow

1. **Choose recipes** (optional), each with a count stepper (1×, 2×…). Each shows per-batch calories, protein and main nutrients. A batch's servings use up bowl meal slots.
2. **Analyze:** totals recipes → optimizer fills the remainder from liked foods → rounding → re-analysis on rounded amounts.
3. **Report:** every nutrient with % of weekly target and status (Low / On target / High). Calories as weekly total, daily average, and target. Protein likewise. Per-nutrient breakdown of where it comes from (foods, recipes, supplements 💊).
4. **Fix:**
   - *Low:* suggest the liked food (then any food) that closes the gap with the fewest grams/calories, e.g. "Vitamin D 45% — add 300 g salmon → 95%". Also offer **"I'll supplement this"**.
   - *High:* name the biggest contributors and suggest a change, e.g. "Sodium 135% of limit, mostly Chicken Tikka (2×) — make it 1×, or swap canned beans for no-salt-added".
   - *Recipe combo can't work:* evaluate variations (each recipe −1×, each recipe dropped), report the closest-to-target combo with what it fixes.
5. **Edits** (each produces a Now vs New sheet with Apply / Cancel; every applied change is undoable):
   - **Don't like** — remove from this plan, or mark disliked permanently; re-optimize.
   - **Set amount / lock 🔒** — fixed grams the optimizer must keep.
   - **Re-analyze only** — recompute the report from the current amounts without re-optimizing.
6. **Approve** → trips are generated.

## 6. Optimizer formulation

Variables: grams `x_f` for each candidate food (liked foods; if none, all non-disliked foods), binary `y_f` (food selected).

- `minGrams_f · y_f ≤ x_f ≤ maxWeeklyGrams_f · y_f`
- `Σ y_f ≤ maxDistinctFoods` (minus foods already supplied by recipes/locks)
- Locked foods: `x_f = lockedGrams`
- For each tracked nutrient n: `Σ a_nf x_f + recipe_n + supplement_n + d_n ≥ target_n`, deficit slack `d_n ≥ 0`. Nutrients the user supplements are covered by the supplement term instead.
- Upper limits (total-scope ULs, sodium/sat-fat/added-sugar caps): `Σ a_nf x_f + recipe_n + supplement_n ≤ max_n` (hard).
- Protein ≥ goal (hard). Calories within ±5% of target (hard).
- **Objective:** minimize `Σ w_n · d_n / target_n + ε · Σ x_f` (weighted relative deficits, small tie-breaker against buying excess food).

**Always returns an answer:** if a hard constraint is infeasible (e.g. recipes/locks alone already exceed the sodium cap or calories), that constraint is converted to a penalized soft constraint, solving continues, and the report flags it as "caused by your recipes/locks" with the advisor's suggestions.

**Rounding:** amounts are rounded to sensible units (whole fruit, ½ pack, 50 g for loose items), then nutrients are recomputed so the report matches what is bought.

## 7. Supplements

- Triggered from any Low nutrient via "I'll supplement this", or added manually in Profile.
- Suggested dose = remaining gap after food, rounded to a common product dose, and never exceeding the UL (counting food for total-scope ULs). Dose and label are editable to match the user's product.
- Supplements are included in the report with a 💊 marker.
- **Timing guidance** shown as a daily schedule:
  - Vitamins D, A, E, K and omega-3: with a meal containing fat.
  - Iron: with vitamin C; 2 hours apart from calcium, coffee, tea, dairy.
  - Calcium: split doses over 500 mg; separate from iron and zinc.
  - Zinc: separate from iron and calcium.
  - Magnesium: evening.
  - B12 / B-complex: morning.
- Disclaimer: general guidance, not medical advice; consult a doctor, especially if taking medication.

## 8. Shopping trips

- **Schedule:** user picks shopping weekdays and time (e.g. Tuesday before lunch and Friday before lunch). The planning week runs from the first trip to the same time a week later. Each trip covers the days until the next trip (Tue → 3 days, Fri → 4 days).
- **Perishables** (`shelfLifeDays` < 7): split across trips in proportion to days covered (3/7 and 4/7), rounded to units.
- **Long-keeping foods:** not split; assigned whole to one trip to balance trip sizes, never later than first needed.
- **Unsplittable units** (1 head broccoli): assigned to a single trip only if it stays fresh through its use; otherwise the app suggests a smaller pack size.
- **Freshness gap:** if a trip covers more days than a perishable lasts (e.g. 4 days vs ground beef's 3), the trip's eating guide says so and suggests a fix: "freeze ¼ of the pack on purchase day" or "eat the beef in the first 3 days".
- **Shopping view:** grouped by aisle, checkboxes, "I have this" toggle per row (moves to a greyed-out "Already have" section; still counts toward nutrients; optional "remember for next week").
- **Eating guide per trip:** amounts to eat over that trip's days, plus daily hints.

## 9. Recipe input (no AI)

- **Paste:** rule-based parser per line: quantity (incl. fractions "1 ½", unicode "½", ranges "2–3"), unit (cup, tbsp, tsp, g, kg, oz, lb, ml, can, clove, piece, etc.), descriptors stripped ("chopped", "fresh", "drained"), parenthetical sizes ("1 (14 oz) can" → 14 oz). Food name fuzzy-matched against built-in foods, then custom foods, then USDA search. Units converted to grams via per-food densities/unit weights.
- **Manual:** search food → enter amount + unit.
- **Review screen (both paths):** each line shows matched food + grams; low-confidence matches marked ⚠️; saving is blocked until every ⚠️ line is confirmed, changed, or skipped. User sets servings.

## 10. Bowl suggestions (optional)

"Suggest bowls" divides the week's bowl-eligible totals across bowl meal slots (bowl meals/day × 7 − recipe servings). Each bowl = 1 protein + 1 carb + 1–2 vegetables + optional fat, portions sized so the slots evenly use up each trip's perishables first. Shows protein and calories per bowl; "Shuffle" regenerates.

## 11. UI (Apple Human Interface Guidelines)

- Principles: clarity, deference, depth. System font stack (SF Pro on Apple devices), iOS type scale (Large Title, Headline, Body, Footnote), Dynamic-Type-friendly sizing, iOS system colors, automatic dark mode, inset grouped lists, bottom sheets, segmented controls, steppers, switches, swipe actions, ≥ 44 pt tap targets, iOS-like motion. SF-Symbols-style open-source line icons (SF Symbols themselves are licensed for Apple platforms only).
- **Tabs:**
  1. **This Week** — summary card (kcal/day vs target, protein, nutrients on target), recipes with steppers, ingredient totals (grams + roughly), Analyze, Suggest bowls. Sheets: Nutrient Report, Now vs New.
  2. **Shopping** — segmented control per trip, aisle groups, checkboxes, "I have this", eating guide.
  3. **Recipes** — library, + → Paste / Enter manually → review.
  4. **Profile** — body stats, goal, protein goal, liked/disliked foods, supplements & schedule, shopping schedule, max distinct foods, bowl meals/day, sign out.

## 12. Error handling

- Offline: all features except login and USDA search work; changes queue and sync when back online.
- Parser uncertainty: never silent; ⚠️ lines must be resolved.
- Infeasible plan: closest plan + explicit shortfall/excess list (section 6).
- USDA search unavailable: built-in foods still work; inline notice.
- Solver failure (unexpected): show last good plan and an error message; no data lost.

## 13. Testing

- Vitest unit tests for every engine module, including: targets match published DRI values for sample profiles; optimizer never exceeds hard upper limits, never changes locked amounts, never selects disliked foods, respects max distinct foods; Tue/Fri schedule yields 3/7 and 4/7 perishable split; freshness-gap warning fires for 4-day coverage of 3-day foods; parser test table of real recipe lines; supplement doses never exceed ULs.
- Manual browser check at iPhone viewport (light + dark) before each release.

## 14. Build order (milestones)

1. Project setup + data files (nutrients, foods) + `targets` + `nutrition`
2. `optimizer` + `rounding` + `advisor` (tested engine, no UI)
3. iOS-style UI shell + This Week + Nutrient Report + Now vs New (local data)
4. Supabase auth + database + sync
5. Recipes: parser, manual entry, review
6. Trips + Shopping tab + "I have this"
7. Supplements + bowls
8. PWA + Vercel deployment

## 15. Out of scope (for now)

Prices/budgets, store-specific inventory, barcode scanning, meal logging/tracking what was actually eaten, multiple household members, native iOS app.
