import { describe, expect, it } from 'vitest';
import { autoAllocationDetail, PRODUCT_MARKET } from '../../supabase/functions/_shared/productMarket';

const essential = { key: 'bread', necessity: 1, marginRatio: -0.2, essential: true };

describe('AUTO profitable-option eligibility', () => {
  it('does not let a zero-demand profitable recipe suppress emergency essential production', () => {
    const r = autoAllocationDetail([essential, { key: 'luxury', necessity: 0, marginRatio: 0.8 }]);
    expect(r.weights.bread).toBeCloseTo(PRODUCT_MARKET.autoEmergencyFloor);
    expect(r.flags.bread).toBe('emergency_unprofitable_production');
    expect(r.weights.luxury).toBe(0);
  });

  it('does not treat a non-finite margin as a viable profitable alternative', () => {
    for (const marginRatio of [Infinity, NaN]) {
      const r = autoAllocationDetail([essential, { key: 'invalid', necessity: 1, marginRatio }]);
      expect(r.weights.bread).toBeCloseTo(PRODUCT_MARKET.autoEmergencyFloor);
      expect(r.weights.invalid).toBe(0);
    }
  });

  it('still stops emergency loss-making output when a viable profitable recipe exists', () => {
    const r = autoAllocationDetail([essential, { key: 'other', necessity: 0.5, marginRatio: 0.4 }]);
    expect(r.weights.bread).toBe(0);
    expect(r.flags.bread).toBe('auto_loss_stopped');
    expect(r.weights.other).toBeGreaterThan(0);
  });

  it('does not count a profitable but physically unavailable alternative', () => {
    const r = autoAllocationDetail([essential, { key: 'blocked', necessity: 1, marginRatio: 0.8, inputsAvailable: false }]);
    expect(r.weights.bread).toBeCloseTo(PRODUCT_MARKET.autoEmergencyFloor);
    expect(r.flags.blocked).toBe('auto_input_unavailable');
  });
});
