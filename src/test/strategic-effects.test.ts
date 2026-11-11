import { describe, it, expect } from 'vitest';
import { strategicCombatMult, strategicBuildCostMult, discountedCost, strategicTier } from '../../supabase/functions/_shared/strategicEffects';

describe('strategic combat', () => {
  it('iron tiers 0..3', () => {
    expect([0, 1, 2, 3].map(t => strategicCombatMult({ strategic_iron_tier: t }))).toEqual([1, 1.05, 1.12, 1.2]);
  });
  it('obsidian tiers and combination multiply once', () => {
    expect(strategicCombatMult({ strategic_obsidian_tier: 2 })).toBeCloseTo(1.10);
    expect(strategicCombatMult({ strategic_iron_tier: 3, strategic_obsidian_tier: 3 })).toBeCloseTo(1.38);
  });
  it('neutral / bad tiers give no bonus', () => {
    expect(strategicCombatMult(null)).toBe(1);
    for (const v of [-1, NaN, 4, 1.5, '2x']) expect(strategicTier(v)).toBe(0);
    expect(strategicCombatMult({ strategic_iron_tier: 99 })).toBe(1);
  });
  it('sides are independent: attacker bonus does not change defender', () => {
    const a = strategicCombatMult({ strategic_iron_tier: 2 }), d = strategicCombatMult({ strategic_iron_tier: 0 });
    expect(Math.round(100 * a)).toBe(112); expect(Math.round(100 * d)).toBe(100);
  });
});

describe('marble build discount', () => {
  it('tiers 0..3 on gold 20 / production 35', () => {
    const m = [0, 1, 2, 3].map(t => strategicBuildCostMult({ strategic_marble_tier: t }));
    expect(m).toEqual([1, 0.9, 0.8, 0.7]);
    expect(m.map(x => discountedCost(20, x))).toEqual([20, 18, 16, 14]);
    expect(m.map(x => discountedCost(35, x))).toEqual([35, 32, 28, 25]);
  });
  it('fails closed on bad inputs and never inflates', () => {
    expect(discountedCost(-5, 0.9)).toBe(0);
    expect(discountedCost(NaN, 0.9)).toBe(0);
    expect(discountedCost(20, 0)).toBe(20);
    expect(discountedCost(20, 1.5)).toBe(20);
    expect(strategicBuildCostMult({ strategic_marble_tier: -2 })).toBe(1);
  });
  it('applied once: discounting an already-discounted quote is not what the server does', () => {
    expect(discountedCost(discountedCost(40, 0.8), 1)).toBe(32);
  });
});
