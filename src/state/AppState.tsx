'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { WeekPlan } from '@/engine/planWeek';
import type { PlanInput } from '@/engine/types';
import { buildWeeklyList, type WeeklyList } from '@/engine/weeklyList';
import { type PlanClient, planClient } from '@/lib/planClient';
import { DEFAULT_SETTINGS, defaultStore, loadSettings, saveSettings, type Settings, toPlanInput } from '@/lib/settings';

export const LAST_PLAN_KEY = 'planner.lastPlan';
const UNDO_LIMIT = 20;

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
  plan: WeekPlan | null;
  list: WeeklyList | null;
  status: 'idle' | 'solving' | 'error';
  error: string | null;
  generate(overrides?: Partial<PlanInput>, opts?: GenerateOptions): Promise<WeekPlan | null>;
  applyPlan(p: WeekPlan): void;
  undo(): void;
  canUndo: boolean;
}

const Ctx = createContext<AppState | null>(null);

function safeList(build: (p: WeekPlan) => WeeklyList | null, p: WeekPlan | null): WeeklyList | null {
  if (!p) return null;
  try {
    return build(p);
  } catch {
    return null; // e.g. a saved plan that names a food this version no longer has
  }
}

function loadLastPlan(): WeekPlan | null {
  try {
    const raw = defaultStore()?.getItem(LAST_PLAN_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as WeekPlan;
    return Array.isArray(p?.items) && p.report?.lines && p.input ? p : null;
  } catch {
    return null;
  }
}

function saveLastPlan(p: WeekPlan | null): void {
  try {
    const s = defaultStore();
    if (!s) return;
    if (p) s.setItem(LAST_PLAN_KEY, JSON.stringify(p));
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
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [history, setHistory] = useState<WeekPlan[]>([]);
  const [status, setStatus] = useState<AppState['status']>('idle');
  const [error, setError] = useState<string | null>(null);
  const settingsRef = useRef(settings);
  const planRef = useRef(plan);
  const historyRef = useRef<WeekPlan[]>([]);

  // Load from this device after mount, so server and first client render match.
  useEffect(() => {
    const s = loadSettings();
    /* eslint-disable react-hooks/set-state-in-effect -- reading localStorage is syncing with an external system; doing it during render would break hydration */
    settingsRef.current = s;
    setSettingsState(s);
    const last = loadLastPlan();
    if (last && safeList(buildList, last)) {
      planRef.current = last;
      setPlan(last);
    }
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [buildList]);

  const setSettings = useCallback((next: Settings) => {
    settingsRef.current = next;
    setSettingsState(next);
    saveSettings(next);
  }, []);

  const applyPlan = useCallback((p: WeekPlan) => {
    const cur = planRef.current;
    if (cur) {
      historyRef.current = [...historyRef.current, cur].slice(-UNDO_LIMIT);
      setHistory(historyRef.current);
    }
    planRef.current = p;
    setPlan(p);
    saveLastPlan(p);
  }, []);

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (!h.length) return;
    const prev = h[h.length - 1];
    historyRef.current = h.slice(0, -1);
    setHistory(historyRef.current);
    planRef.current = prev;
    setPlan(prev);
    saveLastPlan(prev);
  }, []);

  const generate = useCallback(
    async (overrides: Partial<PlanInput> = {}, opts: GenerateOptions = {}): Promise<WeekPlan | null> => {
      setStatus('solving');
      setError(null);
      try {
        const input = { ...toPlanInput(opts.settings ?? settingsRef.current), ...overrides };
        const p = await client.requestPlan(input);
        if (opts.apply !== false) applyPlan(p);
        setStatus('idle');
        return p;
      } catch (e) {
        setStatus('error');
        setError(e instanceof Error ? e.message : 'Planning failed. Try again.');
        return null;
      }
    },
    [client, applyPlan],
  );

  const list = useMemo(() => safeList(buildList, plan), [buildList, plan]);

  const value: AppState = {
    ready, settings, setSettings, plan, list, status, error, generate, applyPlan, undo, canUndo: history.length > 0,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppState must be used inside AppStateProvider');
  return v;
}
