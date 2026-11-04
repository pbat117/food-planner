import { describe, expect, it } from 'vitest';
import { planWeek } from '@/engine/planWeek';
import { withLockedAmount } from '@/lib/edits';
import { base } from '../fixtures';

describe('withLockedAmount', () => {
  it('fixes one food, re-analyzes, and leaves the rest alone', async () => {
    const plan = await planWeek(base);
    const id = plan.items[0].foodId;
    const next = withLockedAmount(plan, id, 1234);
    const item = next.items.find((i) => i.foodId === id)!;
    expect(item.grams).toBe(1234);
    expect(item.locked).toBe(true);
    expect(next.input.locks[id]).toBe(1234);
    expect(next.items.slice(1)).toEqual(plan.items.slice(1));
    expect(next.report.lines.energy.total).not.toBe(plan.report.lines.energy.total);
    expect(plan.input.locks[id]).toBeUndefined();
  }, 30000);
});
