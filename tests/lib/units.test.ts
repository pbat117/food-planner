import { describe, expect, it } from 'vitest';
import { cmToFtIn, ftInToCm, kgToLb, lbToKg } from '@/lib/units';

describe('units', () => {
  it(`round-trips 6'4" / 170 lb`, () => {
    expect(ftInToCm(6, 4)).toBe(193);
    expect(lbToKg(170)).toBe(77.1);
    expect(cmToFtIn(193)).toEqual({ ft: 6, inches: 4 });
    expect(kgToLb(77.1)).toBe(170);
  });
  it('carries 12 inches into feet', () => {
    expect(cmToFtIn(182.5)).toEqual({ ft: 6, inches: 0 });
  });
});
