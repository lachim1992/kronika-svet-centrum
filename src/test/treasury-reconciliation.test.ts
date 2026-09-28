import { describe, it, expect } from 'vitest';
import { treasuryBreakdown } from '../../supabase/functions/_shared/treasury';
import { getFiscalIncome } from '../lib/economyFlow';
import { tradeServiceVolumes, tradeServiceValue } from '../../supabase/functions/_shared/productMarket';

describe('complete fiscal reconciliation', () => {
  it('includes trade and prestige without deducting tolls twice, including both rounding stages', () => {
    const b = treasuryBreakdown({ opening: 100, closingBeforeRounding: 111.7, taxRevenue: 10.4, creditedTax: 10,
      tradeNet: 8, tradeTolls: 2, prestigeBonus: 3, army: 5, sport: 2, roads: 2.3, insolvencyRelief: 0 });
    expect(b.turn_fiscal_delta).toBe(12);
    expect(b.legacy_trade_gross).toBe(10);
    expect(b.total_income - b.total_expenses + b.rounding_adjustment).toBeCloseTo(12);
    const ui = getFiscalIncome({wealth_pop_tax:10.4,computed_modifiers:{wealth_breakdown:b}});
    expect(ui.netChange).toBe(12);
    expect(ui.roadUpkeep).toBe(2.3);
  });
  it('reports the insolvency floor separately from income', () => {
    const b = treasuryBreakdown({opening:3,closingBeforeRounding:1,taxRevenue:2,creditedTax:2,
      tradeNet:-4,tradeTolls:1,prestigeBonus:1,army:6,sport:0,roads:2,insolvencyRelief:7});
    expect(b.turn_fiscal_delta).toBe(-2);
    expect(b.insolvency_relief).toBe(7);
    expect(b.fiscal_revenue).toBe(2);
  });
  it('rejects unexplained treasury mutations', () => {
    expect(()=>treasuryBreakdown({opening:100,closingBeforeRounding:999,taxRevenue:0,creditedTax:0,
      tradeNet:0,tradeTolls:0,prestigeBonus:0,army:0,sport:0,roads:0,insolvencyRelief:0})).toThrow('Unreconciled');
  });
});

describe('constant-price trade services', () => {
  const flows = [{good:'grain',delivered:10,reason:'trade',gross_value:200},
    {good:'tools',delivered:5,reason:'hub_aggregation',gross_value:900}];
  const value = (inbound = flows) => tradeServiceValue({...tradeServiceVolumes({inbound,
    outbound:[{good:'tools',delivered:3,reason:'trade'}],transit:[],basePrices:{grain:2,tools:8},localExchange:25}),infrastructure:10,staffing:1});
  it('scarcity/fame sale premiums cannot inflate service GDP at unchanged physical volumes', () => {
    expect(value(flows.map(f=>({...f,gross_value:f.gross_value*20})))).toEqual(value());
  });
  it('values aggregation and reexports using the physical volume of the same good', () => {
    const v=tradeServiceVolumes({inbound:flows,outbound:[{good:'tools',delivered:3,reason:'trade'}],
      transit:[{good:'grain',delivered:4,reason:'trade'}],basePrices:{grain:2,tools:8},localExchange:25});
    expect(v).toEqual({local_exchange:25,import_export:44,aggregation:40,reexport:24,transit:8});
    expect(value(flows.map(f=>({...f,delivered:f.delivered*2}))).service_value_added).toBeGreaterThan(value().service_value_added);
  });
});
