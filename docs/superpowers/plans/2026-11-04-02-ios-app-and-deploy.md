# iOS App Shell, This Week and First Deploy (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the tested engine (Plan 1) into an installable-feeling iPhone-style web app. You fill in your profile and foods, tap Generate, see the weekly list in the sample PDF's format, open the nutrient report, swap foods with a Now vs New comparison, and the whole thing is deployed on Vercel.

**Architecture:** One Next.js App Router project, fully client-side for now. Settings and the last plan live in `localStorage`; Supabase comes in Plan 3. The HiGHS solver runs in a Web Worker so the UI never freezes, and loads `highs.wasm` from `public/`. The new pure modules (`weeklyList`, `settings`, `compare`, `units`) are unit-tested. UI components get a few behaviour tests in jsdom, and screens are checked in the browser at iPhone size in light and dark mode.

**Tech Stack:** Next.js 16.4.5 (read `node_modules/next/dist/docs/` before Next code, per AGENTS.md), React 19.3, TypeScript, Tailwind v4, Vitest 5 (+ `jsdom`, `@testing-library/react` for component tests), `highs` 1.15.4, `lucide-react` icons.

**Spec:** `docs/superpowers/specs/2026-11-04-nutrition-shopping-planner-design.md` (sections 10b, 11 and 12 especially)

## Global Constraints

- **No AI anywhere.** No LLM calls, no AI parsing.
- **Only what the user enters:** the app never adds foods, supplements or extras (protein powder, creatine, …) on its own. Staples are chosen by the optimizer *from the liked pool*. Default settings have empty include, liked, disliked, supplements and regular items.
- **Your foods always stay in the plan** (`includeFoodIds`), sized by the app.
- **Grams beside items on every list row:** columns Food · Grams per week · Estimated items.
- **Aim for about 90%, not 100%:** status "ok" at ≥ `lowBelow` (90%; protein 100%). Never present 90% as a failure.
- Calories shown weekly and as a daily average.
- **Apple HIG look:**
  - system font stack `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif`
  - iOS system colors, light and dark (`prefers-color-scheme`)
  - inset grouped lists, bottom sheets, segmented control, stepper, switch
  - tap targets ≥ 44 px
  - works at 375 px wide with no horizontal scroll
- **Icons:** lucide-react only (SF Symbols are Apple-platform-only).
- **Free hosting:** Vercel Hobby. No server code, no paid services, no secrets in this plan.
- **Units:** profile inputs accept ft/in and lb (the user's units) or cm/kg, and are stored as cm/kg.

## Review Focus

1. **Corrupt or old `localStorage`** (bad JSON, missing fields, older `version`): the app should load defaults merged with whatever is valid and never show a blank screen. Test: `loadSettings returns defaults for garbage` (Task 3).
2. **Solver fails or the wasm doesn't load in the worker:** keep showing the last good plan, show an inline error, and keep Generate enabled. Test: `requestPlan rejects with a readable message when the worker posts an error` (Task 4).
3. **No foods entered at all:** Generate still works (the pool becomes all foods) and the plan is realistic. Test: `toPlanInput with default settings produces a valid PlanInput` (Task 3).
4. **Imperial input rounding:** 6 ft 4 in and 170 lb become 193 cm and 77.1 kg, and switching units back and forth doesn't drift. Test: `round-trips 6'4" / 170 lb` (Task 3).
5. **Disliking a food that is in "Your foods":** it is removed from include *and* liked so the solver can't be asked to both include and exclude it. Test: `dislike removes from include and liked` (Task 3).

---

## File map

| File | Responsibility |
|---|---|
| `data/foods-seed.csv` (+ `scripts/build-foods.ts`, `src/engine/types.ts`) | new columns `section`, `basis`, `yield`, `packageName`, `packageGrams` |
| `src/engine/weeklyList.ts` | WeekPlan → the sample-PDF list (sections, rows, supplements, daily average, notes) |
| `src/lib/units.ts` | ft/in/lb ↔ cm/kg |
| `src/lib/settings.ts` | `Settings` type, defaults, load/save, `toPlanInput`, food-preference mutations |
| `src/lib/compare.ts` | Now vs New rows |
| `src/engine/optimizer.ts` | `configureHighs(opts)` so the worker can pass `locateFile` |
| `src/worker/plan.worker.ts`, `src/lib/planClient.ts` | solver off the main thread |
| `scripts/copy-wasm.mjs` | copies `highs.wasm` into `public/` (pre-dev/pre-build) |
| `src/app/globals.css` | iOS tokens (light/dark) |
| `src/ui/*.tsx` | `GroupedList`, `Row`, `Segmented`, `Stepper`, `Switch`, `Sheet`, `TabBar`, `NavHeader` |
| `src/app/layout.tsx`, `src/app/(tabs)/…` | shell, tab routes `/week`, `/shopping`, `/recipes`, `/profile` |
| `src/state/AppState.tsx` | React context: settings, last plan, undo stack, generate() |
| `src/screens/*` | Profile, Week, NutrientReport sheet, Compare sheet, FoodPicker |
| `README.md` | GitHub + Vercel steps for the user |

---

### Task 1: List-format data (seed columns)

**Files:**
- Modify: `data/foods-seed.csv`, `scripts/build-foods.ts`, `src/engine/types.ts`, `src/data/foods.json` (regenerated)
- Test: `tests/data/foods.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type Section = 'Meat' | 'Fruit' | 'Vegetables and beans' | 'Grains' | 'Dairy' | 'Nuts and nut butter' | 'Other';
  type GramsBasis = 'raw' | 'cooked' | 'dry' | 'drained' | 'peeled' | 'flesh' | 'as sold';
  Food.section: Section;
  Food.basis: GramsBasis;
  Food.yield?: number;
  Food.package?: { name: string; grams: number };   // what you buy when it differs from the unit, e.g. peanut butter unit tbsp 16 g, package jar 500 g
  ```
  `yield` is the cooked/raw weight ratio for the *other* form: for basis 'raw' meat it gives cooked = raw × yield; for basis 'cooked' rice it gives dry = cooked × yield.

- [ ] **Step 1: Write the failing tests** in `tests/data/foods.test.ts`:
  - `every food has a section and basis`: every `FOODS` entry has `section` in the Section list and `basis` in the GramsBasis list.
  - `meat is raw with a cooked yield`: `getFood('ground-beef-85')` → `basis === 'raw'`, `yield` 0.70–0.78, `section === 'Meat'`; `chicken-breast` the same.
  - `rice is cooked with a dry yield`: `getFood('white-rice').basis === 'cooked'`, `yield` 0.33–0.40.
  - `black beans sit under Vegetables and beans, drained`.
  - `almonds and peanut butter sit under Nuts and nut butter`.
- [ ] **Step 2:** Run `npx vitest run tests/data/foods.test.ts`. Expected: FAIL (section undefined).
- `peanut butter has a 500 g jar package`: `getFood('peanut-butter').package` → `{ name: 'jar', grams: 500 }`.
- [ ] **Step 3: Add the columns `section,basis,yield,packageName,packageGrams` to the end of `data/foods-seed.csv`** for all 200 rows and parse them in `build-foods.ts` (pad short rows as before). Check each USDA description to decide the basis: "raw" in the name means raw, "cooked" means cooked, "canned, drained" means drained, oats and pasta "dry" mean dry. Yields:
  - raw meat and poultry: 0.74
  - raw fish: 0.80
  - cooked rice: 0.36
  - cooked quinoa: 0.36
  - cooked pasta: 0.42
  - cooked lentils: 0.40

  Leave `yield` blank elsewhere. Fill `packageName/packageGrams` only where the unit is not what you buy: nut butters jar 500, oils bottle 500, rice and grains bag 900, oats bag 1000, chia/flax bag 300, honey/maple bottle 500; blank otherwise. Section by category (protein → Meat except beans, lentils, chickpeas and tofu → Vegetables and beans; nuts, seeds, nut butters → Nuts and nut butter; oils, condiments and sweets → Other). Then run `npx tsx scripts/build-foods.ts <SR folder>`; the SR folder is in the scratchpad `usda-sr/`. If it is gone, re-download as in Plan 1 Task 2.
- [ ] **Step 4:** Run `npm test`. Expected: all pass (73 + new).
- [ ] **Step 5: Commit** `feat(data): section, grams basis and cooked yield per food`.

### Task 2: `buildWeeklyList`, the sample PDF format

**Files:**
- Create: `src/engine/weeklyList.ts`
- Test: `tests/engine/weeklyList.test.ts`

**Interfaces:**
- Consumes: `WeekPlan` (planWeek.ts), `Food.section/basis/yield` (Task 1), `NUTRIENTS`, `UNTRACKED_NUTRIENTS`.
- Produces:
  ```ts
  interface ListRow { foodId: string; name: string; grams: number; gramsText: string; itemsText: string; locked: boolean; dailyHint?: string }
  interface ListSection { title: Section | 'Supplements and extras'; rows: ListRow[] }
  interface DailyAverage { kcal: number; protein: number; carbs: number; fat: number; fiber: number }
  interface CoverageRow { nutrient: NutrientId; name: string; percent: number; status: Status; supplemented: boolean }
  interface WeeklyList { sections: ListSection[]; dailyAverage: DailyAverage; weeklyKcal: number; coverage: CoverageRow[]; notes: string[] }
  function buildWeeklyList(plan: WeekPlan): WeeklyList
  function gramsText(food: Food, grams: number): string
  function itemsText(food: Food, grams: number, units: number): string
  ```

- [ ] **Step 1: Write the failing tests.** Use small hand-built `WeekPlan`s made with `planWeek(base)` from `tests/fixtures.ts`, or call `gramsText` and `itemsText` directly.
  - `gramsText meat shows raw and cooked`: `gramsText(beef, 1350)` → `"1,350 g raw (about 1,000 g cooked)"`. Round the conversion to the nearest 50 g. Use `toLocaleString('en-US')` for thousands.
  - `gramsText rice shows cooked and dry`: `gramsText(whiteRice, 1000)` → `"1,000 g cooked (about 350 g dry)"`.
  - `gramsText plain basis`: `gramsText(blackBeans, 800)` → `"800 g drained"`; a fruit with basis 'as sold' → `"600 g"`.
  - `itemsText countable fruit`: kiwi, 4 units → `"4"`; banana, 1 unit → `"1"`.
  - `itemsText packs`: beef, 1350 g with unit pack 454 → `"About 3 packs of 454 g"`.
  - `itemsText with a package`: peanut butter 220 g (unit tbsp 16 g, package jar 500 g) → `"about 14 tbsp, under half a 500 g jar"`; 400 g → `"about 25 tbsp, about 1 jar of 500 g"`; 1100 g → `"about 69 tbsp, about 2 jars of 500 g"`. Packages: < 0.5 → `under half a G g NAME`, otherwise `about N NAME(s) of G g` with N = round, min 1.
  - `sections follow the sample order and skip empty ones`: titles are a subsequence of `['Meat','Fruit','Vegetables and beans','Grains','Dairy','Nuts and nut butter','Other','Supplements and extras']`.
  - `supplements are rows`: with `supplements: [{nutrient:'vitD', dailyDose:25, label:'Vitamin D3 1,000 IU'}]`, the last section is 'Supplements and extras' with row name `'Vitamin D3 1,000 IU'` and itemsText `"7 daily doses, per label"`.
  - `daily average is weekly / 7`: `dailyAverage.kcal` ≈ `report.lines.energy.total / 7` (±1), and `weeklyKcal` = `report.lines.energy.total`.
  - `coverage lists every tracked nutrient with percent of target`, and sodium, saturated fat and added sugar show percent of max.
  - `notes include iodized salt and the estimates disclaimer`, plus one note per low nutrient: `"<Name> is at N% — <first suggestForLow food name>, about N g more"` when a suggestion exists.
- [ ] **Step 2:** `npx vitest run tests/engine/weeklyList.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `src/engine/weeklyList.ts`.** Rows come from `plan.items`, already rounded. Within a section, rows sort by name. Exact strings:
  - Notes: `"Use iodized salt when you cook — iodine isn't tracked in the food data."`
  - Disclaimer: `"Package sizes vary, so the grams are the amounts to go by."`
- [ ] **Step 4:** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(engine): weekly list in the sample format`.

### Task 3: Settings, units and preference edits

**Files:**
- Create: `src/lib/units.ts`, `src/lib/settings.ts`
- Test: `tests/lib/units.test.ts`, `tests/lib/settings.test.ts`

**Interfaces:**
- Consumes: `Profile`, `PlanInput`, `SupplementUse`, `computeWeeklyTargets`, `FOODS`.
- Produces:
  ```ts
  // units.ts
  function ftInToCm(ft: number, inches: number): number   // rounded to 1 cm
  function cmToFtIn(cm: number): { ft: number; inches: number }  // inches rounded to 0.5
  function lbToKg(lb: number): number   // rounded to 0.1
  function kgToLb(kg: number): number   // rounded to 1
  // settings.ts
  interface Settings {
    version: 1;
    profile: Profile;
    unitSystem: 'imperial' | 'metric';
    includeFoodIds: string[]; likedFoodIds: string[]; dislikedFoodIds: string[];
    fruit: { gramsPerDay: number; maxKinds: number } | null;
    supplements: SupplementUse[];
    regularItems: Record<string, number>;  // weekly grams the user always eats (e.g. their own shake), become locks
    maxDistinctFoods: number;
  }
  const DEFAULT_SETTINGS: Settings
  interface KeyValueStore { getItem(k: string): string | null; setItem(k: string, v: string): void }
  function loadSettings(store?: KeyValueStore): Settings
  function saveSettings(s: Settings, store?: KeyValueStore): void
  function toPlanInput(s: Settings): PlanInput
  type FoodPref = 'include' | 'liked' | 'neutral' | 'disliked';
  function prefOf(s: Settings, foodId: string): FoodPref
  function setPref(s: Settings, foodId: string, pref: FoodPref): Settings   // pure; keeps the three lists mutually consistent
  ```
  `DEFAULT_SETTINGS`:
  - profile: age 30, sex male, 175 cm, 75 kg, activity moderate, goal maintain, `proteinGoal: { mode: 'gPerKg', value: 1.6 }`. Check the `Profile` type for the exact mode names.
  - unitSystem 'imperial'; fruit `{ gramsPerDay: 300, maxKinds: 5 }`; maxDistinctFoods 20.
  - All lists, supplements and regularItems empty.

  Storage key: `'planner.settings'`. The default `store` is `globalThis.localStorage` when it exists, with every access in try/catch.

- [ ] **Step 1: Write the failing tests:**
  - `round-trips 6'4" / 170 lb`: `ftInToCm(6,4) === 193`, `lbToKg(170) === 77.1`, `cmToFtIn(193)` → `{ft:6, inches:4}`, `kgToLb(77.1) === 170`.
  - `loadSettings returns defaults for garbage`: with a store returning `'{nope'`, the result `toEqual(DEFAULT_SETTINGS)`; with `null` the same.
  - `loadSettings merges partial data`: a store with `{"version":1,"likedFoodIds":["oats"]}` gives `likedFoodIds` `['oats']` and the rest default. A wrong-typed field (`maxDistinctFoods: "x"`) falls back to the default.
  - `save then load round-trips`, using an in-memory store.
  - `toPlanInput with default settings produces a valid PlanInput`: `targets.nutrients.protein.target > 0`, `locks` `{}`, `supplementedNutrients` `[]`, and `planWeek(toPlanInput(DEFAULT_SETTINGS))` resolves with items. Give this test a 30 s timeout.
  - `toPlanInput maps supplements and regular items`: supplements give `supplementedNutrients` equal to their nutrient ids; `regularItems` `{milk: 1400}` gives `locks` `{milk: 1400}`.
  - `dislike removes from include and liked`: `setPref(s, 'kiwi', 'disliked')` on settings where kiwi is in include and liked removes it from both and adds it to disliked. `'include'` adds to include *and* liked and removes from disliked; `'neutral'` removes from all three.
- [ ] **Step 2:** `npx vitest run tests/lib`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement `units.ts` and `settings.ts`.** Validate each top-level field with a small per-field type check and fall back to the default per field. Run `computeWeeklyTargets(profile)` inside `toPlanInput`. It can throw `UnsupportedProfileError`: let it throw, and the UI shows the message.
- [ ] **Step 4:** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(lib): settings, units and food preferences`.

### Task 4: Solver in a Web Worker

**Files:**
- Modify: `src/engine/optimizer.ts` (add `configureHighs`), `package.json` (scripts `predev`, `prebuild`: `node scripts/copy-wasm.mjs`), `.gitignore` (`public/highs.wasm`)
- Create: `scripts/copy-wasm.mjs`, `src/worker/plan.worker.ts`, `src/lib/planClient.ts`
- Test: `tests/lib/planClient.test.ts`

**Interfaces:**
- Consumes: `planWeek`, `PlanInput`, `WeekPlan`.
- Produces:
  ```ts
  // optimizer.ts
  function configureHighs(opts: { locateFile?: (file: string) => string }): void  // must be called before the first solve; resets the cached loader
  // worker messages
  type WorkerRequest = { id: number; input: PlanInput };
  type WorkerResponse = { id: number; ok: true; plan: WeekPlan } | { id: number; ok: false; error: string };
  // planClient.ts
  interface WorkerLike { postMessage(m: WorkerRequest): void; onmessage: ((e: { data: WorkerResponse }) => void) | null }
  function createPlanClient(makeWorker: () => WorkerLike): { requestPlan(input: PlanInput): Promise<WeekPlan> }
  const planClient: ReturnType<typeof createPlanClient>  // browser default: new Worker(new URL('../worker/plan.worker.ts', import.meta.url), { type: 'module' }), created lazily on first request
  ```
- [ ] **Step 1: Write the failing tests** in `tests/lib/planClient.test.ts`, using a fake `WorkerLike` that answers synchronously from a queue:
  - `requestPlan resolves with the plan for its id`: two requests in flight, answered out of order, each resolves with its own plan.
  - `requestPlan rejects with a readable message when the worker posts an error`: `{ok:false, error:'Solver failed'}` rejects with an `Error` whose message is `'Solver failed'`.
  - In `tests/engine/optimizer.test.ts`, add `configureHighs passes locateFile to the loader`: call `configureHighs({ locateFile: f => require.resolve('highs/build/' + f) })`, run a small `optimize`, and assert status `'optimal'`. Reset with `configureHighs({})` afterwards.
- [ ] **Step 2:** `npx vitest run tests/lib/planClient.test.ts tests/engine/optimizer.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The worker calls `configureHighs({ locateFile: (f) => '/' + f })` once, then answers each request with `planWeek`. It wraps each request in try/catch and posts `{ok:false, error: e.message}` on failure.
  - `copy-wasm.mjs` copies `node_modules/highs/build/highs.wasm` to `public/highs.wasm`.
  - Before writing the worker, read the Web Worker notes in `node_modules/next/dist/docs/` (grep `new Worker`).
- [ ] **Step 4:** `npm test` passes. `npm run build` succeeds and `public/highs.wasm` exists.
- [ ] **Step 5: Commit** `feat: run the solver in a web worker`.

### Task 5: iOS design system

**Files:**
- Modify: `src/app/globals.css`, `package.json` (add `lucide-react`, dev `jsdom`, `@testing-library/react`)
- Create: `src/ui/GroupedList.tsx` (`GroupedList`, `Row`), `src/ui/Segmented.tsx`, `src/ui/Stepper.tsx`, `src/ui/Switch.tsx`, `src/ui/Sheet.tsx`, `src/ui/TabBar.tsx`, `src/ui/NavHeader.tsx`
- Test: `tests/ui/controls.test.tsx` (first line `// @vitest-environment jsdom`)

**Interfaces:**
- Produces, all client components:
  ```ts
  GroupedList({ header?: string; footer?: string; children })
  Row({ title: ReactNode; detail?: ReactNode; subtitle?: ReactNode; onClick?: () => void; chevron?: boolean; accessory?: ReactNode })
  Segmented<T extends string>({ options: { value: T; label: string }[]; value: T; onChange(v: T): void })
  Stepper({ value: number; min: number; max: number; step: number; onChange(v: number): void; format?(v: number): string })
  Switch({ checked: boolean; onChange(v: boolean): void; label: string })
  Sheet({ open: boolean; onClose(): void; title: string; children })   // bottom sheet, Escape and backdrop close, focus trapped
  TabBar({ items: { href: string; label: string; icon: LucideIcon }[] })  // uses usePathname
  NavHeader({ title: string; trailing?: ReactNode })   // large title that collapses on scroll
  ```
  Colour tokens on `:root`, overridden under `@media (prefers-color-scheme: dark)`:
  - `--bg` (systemGroupedBackground #F2F2F7 / #000), `--cell` (#FFF / #1C1C1E), `--label` (#000 / #FFF)
  - `--secondary` (#3C3C4399 / #EBEBF599), `--separator` (#C6C6C8 / #38383A)
  - `--tint` (systemBlue #007AFF / #0A84FF), `--green` (#34C759 / #30D158), `--orange` (#FF9500 / #FF9F0A), `--red` (#FF3B30 / #FF453A)

  Type scale:

  | Style | Size (px) | Weight |
  |---|---|---|
  | Large title | 34 | 700 |
  | Headline | 17 | 600 |
  | Body | 17 | 400 |
  | Subhead | 15 | 400 |
  | Footnote | 13 | 400 |
- [ ] **Step 1: Write the failing tests:**
  - `Stepper clamps to min and max`: at value = max, clicking + does not call onChange; − calls it with `value - step`.
  - `Segmented calls onChange with the option value`, and the selected option has `aria-pressed="true"`.
  - `Switch toggles`, with role `switch` and `aria-checked`.
  - `Sheet closes on Escape`.
- [ ] **Step 2:** `npx vitest run tests/ui`. Expected: FAIL.
- [ ] **Step 3: Implement the components.** Use Tailwind with the CSS variables. Load the `frontend-design:frontend-design` skill first for visual polish; HIG stays the authority. Every button is at least 44 px tall.
- [ ] **Step 4:** `npm test`, `npm run typecheck`. Expected: pass.
- [ ] **Step 5: Commit** `feat(ui): iOS design system components`.

### Task 6: App shell, state and Profile screen

**Files:**
- Modify: `src/app/layout.tsx` (drop Geist; set `metadata` title "Food Planner"; set `viewport` with `themeColor` light/dark, `viewportFit: 'cover'`, see `generate-viewport.md`), `src/app/page.tsx` (redirect to `/week`)
- Create: `src/app/(tabs)/layout.tsx` (AppStateProvider + TabBar), `src/app/(tabs)/week/page.tsx`, `shopping/page.tsx`, `recipes/page.tsx`, `profile/page.tsx`, `src/state/AppState.tsx`, `src/screens/ProfileScreen.tsx`, `src/screens/FoodPicker.tsx`
- Delete: `public/next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg` (if unused)
- Test: `tests/state/appState.test.tsx` (jsdom)

**Interfaces:**
- Consumes: Tasks 2 to 5.
- Produces:
  ```ts
  interface AppState {
    settings: Settings; setSettings(next: Settings): void;   // saves to localStorage
    plan: WeekPlan | null; list: WeeklyList | null;
    status: 'idle' | 'solving' | 'error'; error: string | null;
    generate(overrides?: Partial<PlanInput>): Promise<WeekPlan | null>;  // keeps the last good plan on error
    applyPlan(p: WeekPlan): void;  // pushes the current plan on the undo stack
    undo(): void; canUndo: boolean;
  }
  function useAppState(): AppState
  function AppStateProvider({ children, client? }: { children: ReactNode; client?: { requestPlan(i: PlanInput): Promise<WeekPlan> } })
  ```
  The last plan is persisted under `'planner.lastPlan'`.
- [ ] **Step 1: Write the failing tests** in `tests/state/appState.test.tsx`, with a fake client:
  - `generate keeps the last good plan on error`: the first call resolves plan A; the second rejects `'Solver failed'`. Then `plan` is still A, `status` is 'error', and `error` is `'Solver failed'`.
  - `undo restores the previous plan`: applyPlan A, then applyPlan B, then undo gives A, and `canUndo` becomes false.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement the shell, AppState and ProfileScreen.**
  - Tabs: This Week (`CalendarDays`), Shopping (`ShoppingCart`), Recipes (`BookOpen`), Profile (`User`). Shopping and Recipes show "Coming soon" with one line on what they'll do.
  - Profile has these grouped sections:
    - **Body:** age stepper; sex segmented; units segmented; height as ft + in or cm; weight as lb or kg.
    - **Goal:** activity (sedentary to very active); goal (lose, maintain, gain); protein as g/day or g/kg plus a stepper. Show daily kcal from `dailyCaloriesFor`.
    - **Your foods:** opens FoodPicker.
    - **Fruit:** switch, g/day stepper, max kinds stepper.
    - **Supplements:** add/remove rows of nutrient, daily dose and label. The nutrient list is exactly vitD, epaDha, vitB12, iron, calcium, magnesium, zinc, folate, vitK, potassium (check spelling against `NutrientId` in types.ts).
    - **Regular items:** a food plus weekly grams, for things the user always eats, e.g. their own shake.
    - **Variety:** max distinct foods stepper, 10–30.
  - FoodPicker: a search field over `FOODS` names, grouped by section. Each row has a segmented control `Always · Like · — · Don't like` mapped to `setPref`.
- [ ] **Step 4:** `npm test`, `npm run typecheck`, `npm run build` all pass. Run `npm run dev` and use the browser pane at 375×812: enter the user's profile (20, male, 6 ft 4 in, 170 lb, moderate, maintain, 136 g/day). It shows about 2,900 kcal/day, and after a reload the settings are still there.
- [ ] **Step 5: Commit** `feat(app): shell, app state and profile`.

### Task 7: This Week screen and Nutrient Report

**Files:**
- Create: `src/screens/WeekScreen.tsx`, `src/screens/NutrientReportSheet.tsx`
- Modify: `src/app/(tabs)/week/page.tsx`

**Interfaces:**
- Consumes: `useAppState`, `buildWeeklyList`, `suggestForLow`, `explainHigh`.
- Produces: UI only.
- [ ] **Step 1: Build the WeekScreen.**
  - **Empty state:** "Set up your profile and foods, then generate your week", plus a Generate button.
  - **Summary card:** kcal/day vs target, weekly kcal, protein g/day vs goal, "N of M nutrients on target" (ok ≥ 90%), and a "Nutrient report" button.
  - **Sections:** one `GroupedList` per `list.sections`, each row three columns: name; gramsText (secondary); itemsText (trailing). It must stay readable at 375 px: gramsText wraps under the name, and itemsText stays trailing.
  - Daily average row and notes footer.
  - Generate / Regenerate button with a spinner while solving, and an inline red error with the last plan still shown.
- [ ] **Step 2: Build the NutrientReportSheet.**
  - Rows: name, percent, and a status dot (green ok, orange low, red high); supplemented rows get a 💊 tag.
  - Tapping a low row shows `suggestForLow` results ("Add 30 g flaxseed → 104%"). The Add button calls `generate({ locks: { ...current locks, [food]: current + add } })` and opens the Compare sheet (Task 8).
  - Tapping a high row shows `explainHigh` hints and top sources.
- [ ] **Step 3: Check it in the browser at 375×812, light and dark.** Generate the user's week and check that:
  - the sections appear in sample order
  - every row shows grams and items
  - beef reads "… g raw (about … g cooked)"
  - calcium shows as low with a suggestion
  - there is no horizontal scroll

  Then `npm run build` passes.
- [ ] **Step 4: Commit** `feat(app): this week list and nutrient report`.

### Task 8: Edits: don't like, lock, Now vs New, undo

**Files:**
- Create: `src/lib/compare.ts`, `src/screens/CompareSheet.tsx`, `src/screens/RowActions.tsx`
- Modify: `src/screens/WeekScreen.tsx`
- Test: `tests/lib/compare.test.ts`

**Interfaces:**
- Consumes: `WeekPlan`, `RoundedAmount`, `reanalyze`, `setPref`.
- Produces:
  ```ts
  interface CompareRow { foodId: string; name: string; nowGrams: number; newGrams: number; nowItems: string; newItems: string; change: 'added' | 'removed' | 'more' | 'less' | 'same' }
  interface CompareSummary { rows: CompareRow[]; kcalPerDay: { now: number; new: number }; fixed: NutrientId[]; broke: NutrientId[] }
  function compare(now: WeekPlan, next: WeekPlan): CompareSummary
  ```
- [ ] **Step 1: Write the failing tests** in `tests/lib/compare.test.ts`:
  - `marks added, removed, more, less and same`, using two hand-built plans; rows are sorted with changes first, then by name.
  - `fixed lists nutrients that went from not ok to ok, and broke the reverse`.
  - `kcalPerDay is energy total / 7`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement `compare`, CompareSheet and RowActions.**
  - **CompareSheet:** a Now vs New table, kcal/day, "Fixes: …" / "Now low: …", and Apply / Keep current. Apply calls `applyPlan`.
  - **RowActions:** tapping a row opens a sheet with:
    - "Don't like this": `setPref(…, 'disliked')`, then generate, then Compare.
    - "Lock amount": a Stepper in the food's roundTo step; Re-analyze calls `reanalyze`, which doesn't re-solve. The sheet shows the changed coverage, then "Rebalance the rest" generates with that lock, then Compare.
    - "Remove from Your foods" (only if included).
  - An Undo button sits in the WeekScreen header when `canUndo` is true.
- [ ] **Step 4:** `npm test` passes. Browser check: dislike black beans, and Compare shows them removed and something added; Apply, then Undo, restores the old list.
- [ ] **Step 5: Commit** `feat(app): don't like, lock, re-analyze, now vs new, undo`.

### Task 9: First deploy

**Files:**
- Modify: `README.md` (replace create-next-app text), `src/app/layout.tsx` if the build needs it
- [ ] **Step 1:** `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` all pass. Expected: no errors.
- [ ] **Step 2: Write the README** with what the app does, `npm install` / `npm run dev`, and these deploy steps for the user:
  1. Create a GitHub account and a new empty repo `food-planner`.
  2. Run `git remote add origin …` and `git push -u origin main`.
  3. At vercel.com, sign up with GitHub (Hobby), Import the repo, keep the framework preset Next.js, and Deploy.
  4. Open the URL on your iPhone in Safari, then Share → Add to Home Screen.
- [ ] **Step 3: Commit** `docs: readme with deploy steps`.
- [ ] **Step 4: Stop for the user.** Pushing and creating accounts is their action. Walk them through steps 1–4 and check the deployed URL in the browser pane once they share it: generate a week, confirm the wasm loads (no 404 for `/highs.wasm`), and confirm the list renders.
