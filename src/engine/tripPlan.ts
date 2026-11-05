import { getFood } from '@/data/foods';
import { planWeek, type WeekPlan } from './planWeek';
import type { RoundedAmount } from './rounding';
import type { NutrientId, NutrientTarget, PlanInput, WeeklyTargets } from './types';

/** What one finished trip fed you: grams per day of each food. */
export interface TripRecord { date: string; days: number; daily: Record<string, number> }

export interface TripArgs {
  base: PlanInput;
  /** First day this trip feeds you (YYYY-MM-DD). */
  date: string;
  days: number;
  history: TripRecord[];
  pantry: Record<string, number>;
  /** Regular items, already scaled to this trip. */
  regularLocks: Record<string, number>;
  includeFoodIds: string[];
}

export interface TripPlan {
  date: string;
  days: number;
  plan: WeekPlan;
  buy: Record<string, number>;
  fromPantry: Record<string, number>;
  pantryAfter: Record<string, number>;
}

const DAY = 86_400_000;
const HISTORY_KEEP_DAYS = 14;
/** Foods that keep at least this long are bought by the package and kept in the pantry. */
const LONG_KEEP_DAYS = 7;

const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export const addDays = (iso: string, n: number): string => new Date(toMs(iso) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY);

export function scaleTargets(t: WeeklyTargets, windowDays: number): WeeklyTargets {
  const k = windowDays / 7;
  const scale = (v?: number) => (v === undefined ? undefined : v * k);
  const nutrients = {} as Record<NutrientId, NutrientTarget>;
  for (const [id, n] of Object.entries(t.nutrients) as [NutrientId, NutrientTarget][]) {
    const out: NutrientTarget = { ...n };
    if (n.target !== undefined) out.target = scale(n.target);
    if (n.lowBelow !== undefined) out.lowBelow = scale(n.lowBelow);
    if (n.max !== undefined) out.max = scale(n.max);
    nutrients[id] = out;
  }
  return { ...t, nutrients };
}

/** The part of the last 7 days before this trip that earlier trips already cover. */
export function historyWindow(history: TripRecord[], date: string, days: number) {
  const start = addDays(date, -Math.max(0, 7 - days));
  const amounts: Record<string, number> = {};
  const seen = new Set<string>();
  const covered = new Set<string>();
  for (const r of history) {
    const from = toMs(r.date) > toMs(start) ? r.date : start;
    const end = addDays(r.date, r.days);
    const to = toMs(end) < toMs(date) ? end : date;
    const overlap = daysBetween(from, to);
    if (overlap <= 0) continue;
    for (let d = 0; d < overlap; d++) covered.add(addDays(from, d));
    for (const [id, g] of Object.entries(r.daily)) {
      if (g <= 0) continue;
      amounts[id] = (amounts[id] ?? 0) + g * overlap;
      seen.add(id);
    }
  }
  return { amounts, days: covered.size, seen };
}

/** Your foods missing from the window, longest absent first; at most half the food limit, leaving room for staples. */
export function dueFoods(include: string[], seen: Set<string>, history: TripRecord[], date: string, maxFoods: number): string[] {
  const lastSeen = (id: string) => {
    let best = -Infinity;
    for (const r of history) if ((r.daily[id] ?? 0) > 0) best = Math.max(best, toMs(addDays(r.date, r.days)));
    return best;
  };
  // Among foods absent equally long, take one per category in turn so a trip is not all meat.
  const turn = new Map<string, number>();
  const order = include.filter((id) => !seen.has(id)).map((id, i) => {
    const cat = getFood(id).category;
    const n = turn.get(cat) ?? 0;
    turn.set(cat, n + 1);
    return { id, i, n, last: lastSeen(id) };
  });
  order.sort((a, b) => a.last - b.last || a.n - b.n || a.i - b.i);
  void date;
  return order.slice(0, Math.max(0, Math.floor(maxFoods / 2))).map((o) => o.id);
}

/** Forcing more fruits than the fruit rule allows would make the plan impossible. */
function capFruit(ids: string[], maxKinds?: number): string[] {
  if (maxKinds === undefined) return ids;
  let n = 0;
  return ids.filter((id) => getFood(id).category !== 'fruit' || ++n <= maxKinds);
}

export function buildTripInput(a: TripArgs): PlanInput {
  const w = historyWindow(a.history, a.date, a.days);
  const windowDays = Math.min(7, a.days + w.days);
  return {
    ...a.base,
    targets: scaleTargets(a.base.targets, windowDays),
    tripDays: a.days,
    windowDays,
    background: w.amounts,
    locks: { ...a.base.locks, ...a.regularLocks },
    includeFoodIds: capFruit(dueFoods(a.includeFoodIds, w.seen, a.history, a.date, a.base.maxDistinctFoods), a.base.fruit?.maxKinds),
  };
}

const keepsLong = (id: string) => getFood(id).shelfLifeDays >= LONG_KEEP_DAYS;

export function purchase(items: RoundedAmount[], pantry: Record<string, number>) {
  const buy: Record<string, number> = {};
  const fromPantry: Record<string, number> = {};
  const pantryAfter: Record<string, number> = { ...pantry };
  for (const item of items) {
    const id = item.foodId;
    const need = item.grams;
    if (need <= 0) continue;
    if (!keepsLong(id)) {
      buy[id] = (buy[id] ?? 0) + need;
      continue;
    }
    const have = pantryAfter[id] ?? 0;
    const take = Math.min(have, need);
    if (take > 0) fromPantry[id] = take;
    const short = need - take;
    let left = have - take;
    if (short > 0) {
      const f = getFood(id);
      const pkg = f.package?.grams ?? f.unit.grams;
      const bought = Math.ceil(short / pkg - 1e-9) * pkg;
      buy[id] = bought;
      left += bought - short;
    }
    if (left > 0.5) pantryAfter[id] = left;
    else delete pantryAfter[id];
  }
  return { buy, fromPantry, pantryAfter };
}

export async function planTrip(a: TripArgs): Promise<TripPlan> {
  const plan = await planWeek(buildTripInput(a));
  return { date: a.date, days: a.days, plan, ...purchase(plan.items, a.pantry) };
}

/**
 * Records what the trip feeds you and updates the pantry.
 * notBought: not eaten (except what came from the pantry). have: you already had it, so it is eaten but no package was bought.
 */
export function finishTrip(t: TripPlan, history: TripRecord[], notBought: string[], have: string[] = []) {
  const skip = new Set(notBought);
  const daily: Record<string, number> = {};
  for (const i of t.plan.items) {
    const eaten = skip.has(i.foodId) ? (t.fromPantry[i.foodId] ?? 0) : i.grams;
    if (eaten > 0) daily[i.foodId] = (daily[i.foodId] ?? 0) + eaten / t.days;
  }
  const cutoff = toMs(addDays(t.date, -HISTORY_KEEP_DAYS));
  const kept = history.filter((r) => toMs(addDays(r.date, r.days)) >= cutoff);
  const pantry = { ...t.pantryAfter };
  for (const id of new Set([...skip, ...have])) {
    if (!keepsLong(id) || !(id in pantry)) continue;
    const left = pantry[id] - (t.buy[id] ?? 0);
    if (left > 0.5) pantry[id] = left;
    else delete pantry[id];
  }
  return { history: [...kept, { date: t.date, days: t.days, daily }], pantry };
}
