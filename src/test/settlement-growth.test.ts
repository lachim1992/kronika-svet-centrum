import {describe, it, expect} from 'vitest';
import {promotedSettlementTier, settlementTierForPopulation} from '../../supabase/functions/_shared/demographics.ts';

describe('settlement growth', () => {
  it('maps population to a tier', () => {
    expect(settlementTierForPopulation(400)).toBe('HAMLET');
    expect(settlementTierForPopulation(1500)).toBe('TOWNSHIP');
    expect(settlementTierForPopulation(4200)).toBe('CITY');
    expect(settlementTierForPopulation(8600)).toBe('POLIS');
  });
  it('promotes a grown hamlet', () => {
    expect(promotedSettlementTier('HAMLET', 8560)).toBe('POLIS');
    expect(promotedSettlementTier('hamlet', 1600)).toBe('TOWNSHIP');
  });
  it('never demotes and never re-promotes', () => {
    expect(promotedSettlementTier('POLIS', 900)).toBeNull();
    expect(promotedSettlementTier('CITY', 4200)).toBeNull();
  });
});
