import { describe, it, expect } from 'vitest';
import { inventoryBackpressure } from '../../supabase/functions/_shared/productMarket';

describe('AUTO producer stock backpressure', () => {
  it('does not throttle empty inventory or at most one turn of demand', () => {
    expect(inventoryBackpressure(0, 10, false)).toBe(1);
    expect(inventoryBackpressure(10, 10, false)).toBe(1);
    expect(inventoryBackpressure(5, 10, true)).toBe(1);
  });
  it('reduces overstocked discretionary production monotonically and never below 10%', () => {
    expect(inventoryBackpressure(40, 10, false)).toBeLessThan(inventoryBackpressure(20, 10, false));
    expect(inventoryBackpressure(20, 10, false)).toBeLessThan(1);
    expect(inventoryBackpressure(1e8, 10, false)).toBe(0.1);
  });
  it('retains the 50% essential floor for both zero-demand and huge stock', () => {
    expect(inventoryBackpressure(1e8, 10, true)).toBe(0.5);
    expect(inventoryBackpressure(5, 0, true)).toBe(0.5);
    expect(inventoryBackpressure(5, 0, false)).toBe(0.1);
  });
  it('does not yield negative or non-finite coefficients from legacy values', () => {
    for(const input of [NaN, Infinity, -10])
      expect(inventoryBackpressure(input, 10, false)).toBe(1);
    expect(inventoryBackpressure(10, NaN, false)).toBe(0.1);
  });
});
