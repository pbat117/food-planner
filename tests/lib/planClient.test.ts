import { describe, expect, it } from 'vitest';
import type { WeekPlan } from '@/engine/planWeek';
import type { PlanInput } from '@/engine/types';
import { createPlanClient, type WorkerLike, type WorkerRequest, type WorkerResponse } from '@/lib/planClient';

function fakeWorker() {
  const sent: WorkerRequest[] = [];
  const w: WorkerLike & { sent: WorkerRequest[]; reply(r: WorkerResponse): void } = {
    sent,
    onmessage: null,
    onerror: null,
    postMessage(m) { sent.push(m); },
    reply(r) { w.onmessage?.({ data: r }); },
  };
  return w;
}

const input = { maxDistinctFoods: 1 } as unknown as PlanInput;
const planA = { items: [], relaxed: ['vitD'] } as unknown as WeekPlan;
const planB = { items: [], relaxed: ['iron'] } as unknown as WeekPlan;

describe('planClient', () => {
  it('requestPlan resolves with the plan for its id', async () => {
    const w = fakeWorker();
    let made = 0;
    const client = createPlanClient(() => { made++; return w; });
    const a = client.requestPlan(input);
    const b = client.requestPlan(input);
    expect(made).toBe(1);
    w.reply({ id: w.sent[1].id, ok: true, plan: planB });
    w.reply({ id: w.sent[0].id, ok: true, plan: planA });
    await expect(a).resolves.toBe(planA);
    await expect(b).resolves.toBe(planB);
  });

  it('requestPlan rejects with a readable message when the worker posts an error', async () => {
    const w = fakeWorker();
    const client = createPlanClient(() => w);
    const p = client.requestPlan(input);
    w.reply({ id: w.sent[0].id, ok: false, error: 'Solver failed' });
    await expect(p).rejects.toThrow('Solver failed');
  });

  it('a crashed worker rejects pending requests and is recreated', async () => {
    const workers: ReturnType<typeof fakeWorker>[] = [];
    const client = createPlanClient(() => { const w = fakeWorker(); workers.push(w); return w; });
    const p = client.requestPlan(input);
    workers[0].onerror?.('Could not load the solver');
    await expect(p).rejects.toThrow('Could not load the solver');
    const q = client.requestPlan(input);
    expect(workers.length).toBe(2);
    workers[1].reply({ id: workers[1].sent[0].id, ok: true, plan: planA });
    await expect(q).resolves.toBe(planA);
  });

  it('rejects when the worker cannot be created', async () => {
    const client = createPlanClient(() => { throw new Error('no workers here'); });
    await expect(client.requestPlan(input)).rejects.toThrow('no workers here');
  });
});
