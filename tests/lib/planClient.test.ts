import { describe, expect, it } from 'vitest';
import type { TripArgs, TripPlan } from '@/engine/tripPlan';
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

const input = { days: 3 } as unknown as TripArgs;
const planA = { date: '2026-11-05' } as unknown as TripPlan;
const planB = { date: '2026-11-08' } as unknown as TripPlan;

describe('planClient', () => {
  it('requestTrip resolves with the plan for its id', async () => {
    const w = fakeWorker();
    let made = 0;
    const client = createPlanClient(() => { made++; return w; });
    const a = client.requestTrip(input);
    const b = client.requestTrip(input);
    expect(made).toBe(1);
    w.reply({ id: w.sent[1].id, ok: true, trip: planB });
    w.reply({ id: w.sent[0].id, ok: true, trip: planA });
    await expect(a).resolves.toBe(planA);
    await expect(b).resolves.toBe(planB);
  });

  it('requestTrip rejects with a readable message when the worker posts an error', async () => {
    const w = fakeWorker();
    const client = createPlanClient(() => w);
    const p = client.requestTrip(input);
    w.reply({ id: w.sent[0].id, ok: false, error: 'Solver failed' });
    await expect(p).rejects.toThrow('Solver failed');
  });

  it('a crashed worker rejects pending requests and is recreated', async () => {
    const workers: ReturnType<typeof fakeWorker>[] = [];
    const client = createPlanClient(() => { const w = fakeWorker(); workers.push(w); return w; });
    const p = client.requestTrip(input);
    workers[0].onerror?.('Could not load the solver');
    await expect(p).rejects.toThrow('Could not load the solver');
    const q = client.requestTrip(input);
    expect(workers.length).toBe(2);
    workers[1].reply({ id: workers[1].sent[0].id, ok: true, trip: planA });
    await expect(q).resolves.toBe(planA);
  });

  it('rejects when the worker cannot be created', async () => {
    const client = createPlanClient(() => { throw new Error('no workers here'); });
    await expect(client.requestTrip(input)).rejects.toThrow('no workers here');
  });
});
