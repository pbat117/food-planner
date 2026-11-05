# Shopping Trips and the Shopping Tab (Plan 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the week's list across the user's shopping days so perishables are bought fresh, and fill the Shopping tab with a per-trip checklist by store aisle, an "I have this" toggle, and a per-trip eating guide.

**Architecture:** A pure engine module `trips.ts` turns the plan's rounded items plus the shopping weekdays into trips. A small `shoppingState.ts` keeps the checkboxes and the "I have this" choices in localStorage, tied to the current plan so they reset when the plan changes. The Shopping screen reads both. Shopping days are a new settings field, edited on Profile.

**Tech Stack:** as Plan 2 (Next.js 16.4.5, React 19.3, Tailwind v4, Vitest + jsdom, lucide-react).

**Spec:** `docs/superpowers/specs/2026-11-04-nutrition-shopping-planner-design.md`, section 8 (Shopping trips), plus the row in section 2: "List always shows full weekly amounts (it's also the eating guide); per-item 'I have this' removes it from the shopping view only".

## Global Constraints

- **No AI anywhere.**
- **Trip rules (spec §8):**
  - Each trip covers the days until the next trip, e.g. Tue covers 3 days and Fri covers 4.
  - Perishables (`shelfLifeDays` < 7) are split in proportion to days covered, rounded to units.
  - Long-keeping foods are not split.
- **Freshness gap:** when a trip covers more days than a perishable lasts, the guide says so and suggests freezing part on shopping day or eating it in the first N days.
- **"I have this"** removes the item from the shopping view only. The This Week list and the nutrients are unchanged.
- **Every shopping row shows grams beside estimated items**, as on This Week.
- **Default shopping days are Tuesday and Friday** (the user's own schedule). At least 1 day must stay selected.
- iOS look, 375 px wide with no horizontal scroll, light and dark, tap targets ≥ 44 px.

## Review Focus

1. **One shopping day a week:** a single trip covers 7 days, so every perishable gets a freshness note. Test: `one shopping day covers 7 days and warns for perishables` (Task 1).
2. **A perishable with only 1 unit for the week** (e.g. 1 small container of raspberries over a Tue/Fri week): it can't be split, so it goes whole into one trip. The trip it lands in must say how fast to eat it. Test: `an unsplittable perishable goes whole to one trip, with a note` (Task 1).
3. **The plan changes after ticking items:** old ticks must not carry over to a different list. Test: `state resets when the plan stamp changes` (Task 3).
4. **Shopping days stored as garbage or empty:** fall back to Tue/Fri and never produce zero trips. Test: `loadSettings rejects empty or invalid shopping days` (Task 2).
5. **Supplement rows and locked regular items:** supplements are not shopping-trip items (they're bought rarely). Regular items are split like any food. Test: `locked items are split like other foods` (Task 1).

---

### Task 1: `splitTrips` and the eating guide

**Files:**
- Create: `src/engine/trips.ts`
- Test: `tests/engine/trips.test.ts`

**Interfaces:**
- Consumes: `RoundedAmount` (rounding.ts), `getFood`, `Food.shelfLifeDays`, `Food.roundTo`, `Food.unit`.
- Produces:
  ```ts
  type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;  // 0 = Sunday
  interface TripItem { foodId: string; grams: number; units: number; perishable: boolean; note?: string }
  interface Trip { day: Weekday; daysCovered: number; items: TripItem[] }
  function splitTrips(items: RoundedAmount[], days: Weekday[]): Trip[]
  interface GuideLine { foodId: string; gramsPerDay: number; note?: string }
  function eatingGuide(trip: Trip, weekItems: RoundedAmount[]): GuideLine[]
  ```
  - **Trips:** sorted by weekday. A trip's `daysCovered` = days until the next trip's weekday, wrapping around the week. A single trip covers 7.
  - **Perishable** = `shelfLifeDays < 7`.
  - **Splitting a perishable:** share each trip `grams × daysCovered / 7`.
    - For unit foods (`roundTo === 'unit'`), allocate whole units by largest remainder. A trip that gets 0 units gets no row.
    - For gram-step foods, round each share to `roundTo` and give the remainder to the last trip, so the shares add up to the weekly grams exactly.
  - **Long-keeping food:** goes whole to the first trip.
  - **Notes:**
    - When `daysCovered > shelfLifeDays` and the trip has the food, the note is `` `Keeps about ${shelf} days: eat it in the first ${shelf} days, or freeze some on shopping day.` ``
    - When a perishable unit food is bought whole on one trip because it has fewer units than trips, use the same note if its `shelfLifeDays` is less than the days that trip covers.
  - **`eatingGuide`:**
    - For each perishable in the trip: `gramsPerDay = grams / daysCovered`.
    - For each long-keeping food in `weekItems`, every trip: `gramsPerDay = weekly grams / 7`.
    - The note is copied from the trip item. Sort by name.

- [ ] **Step 1: Write the failing tests:**
  - `Tue/Fri gives 3 and 4 days`: `splitTrips(items, [5, 2])` → days `[2, 5]`, daysCovered `[3, 4]`.
  - `perishables split 3/7 and 4/7 and add up`: ground beef 1400 g (gram step 50, shelf 3) → Tue 600, Fri 800. Bananas 7 units → Tue 3, Fri 4.
  - `long-keeping foods go whole to the first trip`: rice 1000 g → Tue 1000, no Fri row.
  - `freshness note fires for a 4-day trip of a 3-day food`: ground beef in the Fri trip has a note containing `"Keeps about 3 days"`, and Tue's has none.
  - `one shopping day covers 7 days and warns for perishables`: `[2]` → one trip, daysCovered 7, beef grams = weekly, note set.
  - `an unsplittable perishable goes whole to one trip, with a note`: raspberries at 1 unit (shelf 3) with Tue/Fri → only Fri has it (largest remainder), 1 unit, with the note because 4 days > 3.
  - `locked items are split like other foods`: a locked 1400 g milk (shelf 10) goes whole to the first trip; a locked 1400 g chicken (shelf 3) is split.
  - `eating guide per day`: Fri trip with beef 800 g over 4 days → `gramsPerDay` 200; rice 1000 g/week → 142.9 on both trips.
- [ ] **Step 2:** `npx vitest run tests/engine/trips.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `src/engine/trips.ts`.**
- [ ] **Step 4:** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(engine): split the week into shopping trips`.

### Task 2: Shopping days in settings and on Profile

**Files:**
- Modify: `src/lib/settings.ts`, `src/screens/ProfileScreen.tsx`
- Test: `tests/lib/settings.test.ts`

**Interfaces:**
- Produces: `Settings.shoppingDays: Weekday[]`, default `[2, 5]`, plus `WeekdayPicker` (in `src/ui/WeekdayPicker.tsx`): `({ value: Weekday[]; onChange(v: Weekday[]): void })`. It shows 7 round toggle buttons labelled S M T W T F S, each with `aria-pressed` and an aria-label naming the full weekday. It refuses to deselect the last remaining day.
- [ ] **Step 1: Write the failing tests:**
  - `default shopping days are Tuesday and Friday`.
  - `loadSettings rejects empty or invalid shopping days`: `[]`, `[9]`, `"x"` → `[2, 5]`; `[5, 2, 2]` → `[2, 5]` (deduped and sorted).
  - In `tests/ui/controls.test.tsx`, `WeekdayPicker keeps at least one day`: with value `[2]`, clicking Tuesday does not call onChange; clicking Friday calls it with `[2, 5]`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.** Add a "Shopping" `GroupedList` on Profile with the WeekdayPicker. Footer: `"Fresh food is split between these days so it's bought when you need it."`
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`. Expected: pass.
- [ ] **Step 5: Commit** `feat: shopping days setting`.

### Task 3: Checklist state

**Files:**
- Create: `src/lib/shoppingState.ts`
- Test: `tests/lib/shoppingState.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface ShoppingState { stamp: string; checked: string[]; have: string[] }   // checked keys are `${day}:${foodId}`, have keys are foodIds
  function planStamp(items: RoundedAmount[], days: Weekday[]): string   // e.g. "2,5|beef:1400|milk:1500…", sorted
  function loadShopping(stamp: string, store?: KeyValueStore): ShoppingState   // a different stored stamp → fresh empty state
  function saveShopping(s: ShoppingState, store?: KeyValueStore): void
  function toggle(list: string[], key: string): string[]
  ```
  Storage key: `'planner.shopping'`. Every access goes through try/catch, as settings does.
- [ ] **Step 1: Write the failing tests:**
  - `state resets when the plan stamp changes`.
  - `same stamp keeps ticks`.
  - `garbage storage gives empty state`.
  - `toggle adds then removes`.
  - `planStamp ignores item order but changes with grams or days`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npm test`. Expected: pass.
- [ ] **Step 5: Commit** `feat(lib): shopping checklist state`.

### Task 4: Shopping screen

**Files:**
- Create: `src/screens/ShoppingScreen.tsx`
- Modify: `src/app/(tabs)/shopping/page.tsx`

**Interfaces:**
- Consumes: `useAppState().plan`, `settings.shoppingDays`, `splitTrips`, `eatingGuide`, the shoppingState functions, `gramsText`/`itemsText` (weeklyList.ts), `AISLE_ORDER`.
- [ ] **Step 1: Build the screen:**
  - **No plan:** "Make your list on This Week first", linking to /week.
  - **Trip picker:** a `Segmented` control with one option per trip, labelled by weekday, e.g. "Tue" / "Fri".
  - **Trip header:** "Tuesday · covers Tue–Thu (3 days)". It opens on the trip whose day is today or most recently passed.
  - **Aisle groups:** grouped by `AISLE_ORDER`. Each row has:
    - a round checkbox with `role="checkbox"`, at least 44 px
    - the name, with gramsText below it
    - itemsText trailing
    - an "I have this" button (lucide `PackageCheck`)
  - **Checked rows:** strike through, in secondary colour.
  - **"Already have" section:** rows marked "I have this" move into a greyed section at the bottom of every trip, with a "Need to buy" button to undo. Footer: "Still counted in your nutrients."
  - **Freshness notes:** shown under their row in orange.
  - **Progress line:** "N of M bought".
  - **Eating guide:** a `GroupedList` showing "About N g a day" per food, plus dailyHint and the note.
- [ ] **Step 2: Check in the browser at 375×812, light and dark.** Use the user's settings with Tue/Fri. Check that:
  - beef and chicken are split across both trips
  - rice appears only on Tue
  - Fri beef has the freshness note
  - ticking persists across a reload
  - "I have this" moves the row and This Week is unchanged
  - there's no horizontal scroll

  Then `npm run build` passes.
- [ ] **Step 3: Commit** `feat(app): shopping tab with trips, checklist and eating guide`.
