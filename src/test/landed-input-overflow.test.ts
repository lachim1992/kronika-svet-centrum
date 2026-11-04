import { describe, expect, it } from 'vitest';
import { landedInputCost, expectedInputCost } from '../../supabase/functions/_shared/productMarket';

const quote = { sourcePrice: 2, transport: 1, tolls: 0, tariffRate: 0, risk: 0, loss: 0 };

describe('landed input cost arithmetic overflow guard', () => {
  it('rejects overflow when finite transport and source price are added', () => {
    expect(() => landedInputCost({ ...quote, sourcePrice: 1e308, transport: 1e308 })).toThrow(RangeError);
  });
  it('rejects overflow in a finite tariff multiplication', () => {
    expect(() => landedInputCost({ ...quote, sourcePrice: 1e308, tariffRate: 10 })).toThrow(RangeError);
  });
  it('preserves normal finite landed costs and supplier selection', () => {
    expect(landedInputCost(quote).landed).toBe(3);
    expect(expectedInputCost(null, [{ city: 'a', ...quote }], 2)).toEqual({ cost: 3, source: 'a', available: true });
  });
});
