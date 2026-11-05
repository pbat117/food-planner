'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { WeekPlan } from '@/engine/planWeek';
import { addDays, finishTrip, purchase, type TripArgs, type TripPlan, type TripRecord } from '@/engine/tripPlan';
import type { PlanInput } from '@/engine/types';
import { buildWeeklyList, type WeeklyList } from '@/engine/weeklyList';
import { type PlanClient, planClient } from '@/lib/planClient';
import {
  DEFAULT_SETTINGS, defaultStore, loadSettings, regularLocksFor, saveSettings, type Settings, toPlanInput,
} from '@/lib/settings';
import { loadPantry, loadTrips, savePantry, saveTrips } from '@/lib/tripStore';

export const LAST_TRIP_KEY = 'planner.lastTrip';
const UNDO_LIMIT = 20;

/** A trip you can go back to, with the settings that were in effect for it. */
interface UndoEntry { trip: TripPlan; settings: Settings }

export interface GenerateOptions {
  /** false → return the new plan without showing it (for Now vs New). Default true. */
  apply?: boolean;
  /** Use these settings instead of the current ones (e.g. right after an edit). */
  settings?: Settings;
}

export interface AppState {
  ready: boolean;
  settings: Settings;
  setSettings(next: Settings): void;
  /** The trip being planned or shopped for. */
  trip: TripPlan | null;
  /** The trip's plan and list (what the This Trip screen shows). */
  plan: WeekPlan | null;
  list: WeeklyList | null;
  history: TripRecord[];
  pantry: Record<string, number>;
  setPantry(p: Record<string, number>): void;
  status: 'idle' | 'solving' | 'error';
  error: string | null;
  generate(overrides?: Partial<PlanInput>, opts?: GenerateOptions): Promise<WeekPlan | null>;
  applyPlan(p: WeekPlan): void;
  /** Done shopping: records what this trip feeds you, updates the pantry and moves to the next trip. */
  finishShopping(notBought: string[]): void;
  undo(): void;
  canUndo: boolean;
}

const Ctx = createContext<AppState | null>(null);

/** Today on this device, YYYY-MM-DD. */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function safeList(build: (p: WeekPlan) => WeeklyList | null, p: WeekPlan | null): WeeklyList | null {
  if (!p) return null;
  try {
    return build(p);
  } catch {
    return null; // e.g. a saved plan that names a food this version no longer has
  }
}

const isMap = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);

function loadLastTrip(): TripPlan | null {
  try {
    const raw = defaultStore()?.getItem(LAST_TRIP_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as TripPlan;
    const p = t?.plan;
    const tg = p?.input?.targets;
    const ok = typeof t.date === 'string' && Number.isFinite(t.days) && isMap(t.buy) && isMap(t.fromPantry) && isMap(t.pantryAfter)
      && Array.isArray(p?.items) && p.report?.lines?.energy && Number.isFinite(tg?.dailyCalories) && tg?.nutrients?.protein
      && Array.isArray(p.input.supplements) && Array.isArray(p.input.supplementedNutrients) && p.input.locks;
    return ok ? t : null;
  } catch {
    return null;
  }
}

function saveLastTrip(t: TripPlan | null): void {
  try {
    const s = defaultStore();
    if (!s) return;
    if (t) s.setItem(LAST_TRIP_KEY, JSON.stringify(t));
    else s.removeItem?.(LAST_TRIP_KEY);
  } catch {
    // ignore: storage full or blocked
  }
}

export function AppStateProvider({
  children,
  client = planClient,
  buildList = buildWeeklyList,
}: {
  children: ReactNode;
  client?: PlanClient;
  buildList?: (p: WeekPlan) => WeeklyList | null;
}) {
  const [ready, setReady] = useState(false);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [trip, setTrip] = useState<TripPlan | null>(null);
  const [history, setHistory] = useState<TripRecord[]>([]);
  const [pantry, setPantryState] = useState<Record<string, number>>({});
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [status, setStatus] = useState<AppState['status']>('idle');
  const [error, setError] = useState<string | null>(null);
  const settingsRef = useRef(settings);
  const tripRef = useRef(trip);
  const historyRef = useRef(history);
  const pantryRef = useRef(pantry);
  const undoRef = useRef<UndoEntry[]>([]);
  /** Trips the worker returned, so applying one of their plans keeps its exact shopping list. */
  const tripsByPlan = useRef(new WeakMap<WeekPlan, TripPlan>());

  // Load from this device after mount, so server and first client render match.
  useEffect(() => {
    const s = loadSettings();
    /* eslint-disable react-hooks/set-state-in-effect -- reading localStorage is syncing with an external system; doing it during render would break hydration */
    settingsRef.current = s;
    setSettingsState(s);
    historyRef.current = loadTrips();
    setHistory(historyRef.current);
    pantryRef.current = loadPantry();
    setPantryState(pantryRef.current);
    const last = loadLastTrip();
    if (last && safeList(buildList, last.plan)) {
      tripRef.current = last;
      setTrip(last);
    }
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [buildList]);

  const setSettings = useCallback((next: Settings) => {
    settingsRef.current = next;
    setSettingsState(next);
    saveSettings(next);
  }, []);

  const setPantry = useCallback((p: Record<string, number>) => {
    pantryRef.current = p;
    setPantryState(p);
    savePantry(p);
  }, []);

  const showTrip = useCallback((t: TripPlan | null) => {
    tripRef.current = t;
    setTrip(t);
    saveLastTrip(t);
  }, []);

  const applyPlan = useCallback((p: WeekPlan) => {
    const cur = tripRef.current;
    if (cur) {
      undoRef.current = [...undoRef.current, { trip: cur, settings: settingsRef.current }].slice(-UNDO_LIMIT);
      setUndoStack(undoRef.current);
    }
    const s = settingsRef.current;
    // A plan edited on screen (e.g. an amount you typed) gets its shopping list worked out here.
    const t = tripsByPlan.current.get(p) ?? {
      date: cur?.date ?? (s.nextTripDate || today()),
      days: cur?.days ?? s.shopEveryDays,
      plan: p,
      ...purchase(p.items, pantryRef.current),
    };
    showTrip(t.plan === p ? t : { ...t, plan: p });
  }, [showTrip]);

  const undo = useCallback(() => {
    const h = undoRef.current;
    if (!h.length) return;
    const { trip: prev, settings: prevSettings } = h[h.length - 1];
    undoRef.current = h.slice(0, -1);
    setUndoStack(undoRef.current);
    showTrip(prev);
    settingsRef.current = prevSettings;
    setSettingsState(prevSettings);
    saveSettings(prevSettings);
  }, [showTrip]);

  const generate = useCallback(
    async (overrides: Partial<PlanInput> = {}, opts: GenerateOptions = {}): Promise<WeekPlan | null> => {
      setStatus('solving');
      setError(null);
      try {
        const s = opts.settings ?? settingsRef.current;
        const days = s.shopEveryDays;
        const args: TripArgs = {
          // Locks passed in already hold this trip's regular items, so they are not added twice.
          base: { ...toPlanInput(s), locks: {}, ...overrides },
          date: s.nextTripDate || today(),
          days,
          history: historyRef.current,
          pantry: pantryRef.current,
          regularLocks: overrides.locks ? {} : regularLocksFor(s, days),
          includeFoodIds: [...s.includeFoodIds],
        };
        const t = await client.requestTrip(args);
        tripsByPlan.current.set(t.plan, t);
        if (opts.apply !== false) applyPlan(t.plan);
        setStatus('idle');
        return t.plan;
      } catch (e) {
        setStatus('error');
        setError(e instanceof Error ? e.message : 'Planning failed. Try again.');
        return null;
      }
    },
    [client, applyPlan],
  );

  const finishShopping = useCallback((notBought: string[]) => {
    const t = tripRef.current;
    if (!t) return;
    const done = finishTrip(t, historyRef.current, notBought);
    historyRef.current = done.history;
    setHistory(done.history);
    saveTrips(done.history);
    setPantry(done.pantry);
    setSettings({ ...settingsRef.current, nextTripDate: addDays(t.date, t.days) });
    // Undo can't take back a finished trip.
    undoRef.current = [];
    setUndoStack([]);
    showTrip(null);
  }, [setPantry, setSettings, showTrip]);

  const plan = trip?.plan ?? null;
  const list = useMemo(() => safeList(buildList, plan), [buildList, plan]);

  const value: AppState = {
    ready, settings, setSettings, trip, plan, list, history, pantry, setPantry, status, error,
    generate, applyPlan, finishShopping, undo, canUndo: undoStack.length > 0,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppState must be used inside AppStateProvider');
  return v;
}
