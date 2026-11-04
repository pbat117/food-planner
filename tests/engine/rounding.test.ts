import { describe, expect, it } from 'vitest';
import { roundAmount } from '@/engine/rounding';

describe('roundAmount', () => {
  it('countable fruit becomes a plain number', () => {
    expect(roundAmount('banana', 700)).toMatchObject({ grams: 708, units: 6, label: '6' });
  });
  it('named units pluralize', () => {
    expect(roundAmount('blackberries', 300)).toMatchObject({ grams: 340, units: 2, label: '2 small containers' });
  });
  it('a selected unit food never rounds to zero', () => {
    expect(roundAmount('broccoli', 300)).toMatchObject({ grams: 600, units: 1, label: '1 head' });
  });
  it('gram-step foods round grams and show an approximate unit', () => {
    expect(roundAmount('almonds', 213)).toMatchObject({ grams: 210, units: 7, label: '≈ 7 handfuls' });
  });
  it('gram-step foods keep at least one step', () => {
    expect(roundAmount('almonds', 3).grams).toBe(10);
  });
  it('locked amounts are never rounded', () => {
    expect(roundAmount('banana', 650, true)).toMatchObject({ grams: 650, locked: true, label: '6' });
  });
  it('carries the daily hint', () => {
    expect(roundAmount('almonds', 210).dailyHint).toBe('30 g a day, a small handful');
  });
});
