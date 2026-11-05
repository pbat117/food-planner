/// <reference lib="webworker" />
import { configureHighs } from '@/engine/optimizer';
import { planTrip } from '@/engine/tripPlan';
import type { WorkerRequest, WorkerResponse } from '@/lib/planClient';

// highs.wasm is copied into public/ by scripts/copy-wasm.mjs.
configureHighs({ locateFile: (file) => `/${file}` });

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, args } = e.data;
  let res: WorkerResponse;
  try {
    res = { id, ok: true, trip: await planTrip(args) };
  } catch (err) {
    res = { id, ok: false, error: err instanceof Error ? err.message : 'Planning failed' };
  }
  ctx.postMessage(res);
};
