import type { WeekPlan } from '@/engine/planWeek';
import type { PlanInput } from '@/engine/types';

export type WorkerRequest = { id: number; input: PlanInput };
export type WorkerResponse = { id: number; ok: true; plan: WeekPlan } | { id: number; ok: false; error: string };

export interface WorkerLike {
  postMessage(m: WorkerRequest): void;
  onmessage: ((e: { data: WorkerResponse }) => void) | null;
  /** Set by the client; called when the worker itself dies (e.g. the solver could not load). */
  onerror?: ((message: string) => void) | null;
}

export interface PlanClient {
  requestPlan(input: PlanInput): Promise<WeekPlan>;
}

/** Talks to the solver worker; the worker is created on the first request. */
export function createPlanClient(makeWorker: () => WorkerLike): PlanClient {
  let worker: WorkerLike | null = null;
  let nextId = 1;
  const pending = new Map<number, { resolve(p: WeekPlan): void; reject(e: Error): void }>();

  function ensureWorker(): WorkerLike {
    if (worker) return worker;
    const w = makeWorker();
    w.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      if (data.ok) p.resolve(data.plan);
      else p.reject(new Error(data.error));
    };
    w.onerror = (message) => {
      worker = null; // the next request starts a fresh worker
      for (const p of pending.values()) p.reject(new Error(message));
      pending.clear();
    };
    worker = w;
    return w;
  }

  return {
    requestPlan(input) {
      return new Promise<WeekPlan>((resolve, reject) => {
        let w: WorkerLike;
        try {
          w = ensureWorker();
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
          return;
        }
        const id = nextId++;
        pending.set(id, { resolve, reject });
        w.postMessage({ id, input });
      });
    },
  };
}

/** Browser default: the solver runs in a module worker so the UI stays responsive. */
export const planClient: PlanClient = createPlanClient(() => {
  const w = new Worker(new URL('../worker/plan.worker.ts', import.meta.url), { type: 'module' });
  const like: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage: (m) => w.postMessage(m),
  };
  w.onmessage = (e: MessageEvent<WorkerResponse>) => like.onmessage?.({ data: e.data });
  w.onerror = (e) => {
    e.preventDefault();
    w.terminate();
    like.onerror?.('The meal planner could not start. Check your connection and try again.');
  };
  return like;
});
