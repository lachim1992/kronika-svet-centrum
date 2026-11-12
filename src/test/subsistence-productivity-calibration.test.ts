import { describe, it, expect } from 'vitest';
import {
  resolveGoodsEconomy, produced,
  type City, type Good, type Producer, type Snapshot, type Edge,
} from '../../supabase/functions/_shared/goodsEconomy';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';

// Unit calibration: 100 inhabitants demand roughly one staple-food unit per
// turn. Twenty people working a small field should cover that and leave an
// exportable margin; 100 fully staffed fishers should not collapse to ~1.4
// during a local civic crisis when the physical catch is still available.
const good = (key: string, basket: string): Good => ({
  key, basket, price: 1, stage: 'raw', storable: true, bulk: 1, density: 30,
  perishability: 0, storageLoss: 0, storageCost: 0, substitutability: 1,
  strategic: 0, prestige: 0, transshipment: 0, finalUse: true, household: true,
});
const city = (id: string, population: number, stability: number, x: number): City => ({
  id, owner: 'P', name: id, cell: `${x},0`, population,
  classes: { peasants: population }, soldiers: 0, stability, irrigation: 0,
  labor: {}, market: 2, storage: 10, admin: 0, security: 1, guild: 0,
  ideology: 'open_merchant', coastal: false,
});
const source = (cityId: string, goodKey: string, capacity: number, jobs: number): Producer => ({
  id: `source:${cityId}:${goodKey}`, city: cityId, channel: 'facility',
  capacity, jobs,
  recipe: { key: `harvest_${goodKey}`, good: goodKey, qty: 1, inputs: [],
    labor: 1 / ECONOMY.workersPerLaborUnit, quality: 0, minQuality: 0 },
  allocation: 1, staffing: 1, logistics: 1, mastery: 1,
  source: true, distinctive: false,
});
const street: Edge[] = [
  { id: 'ab', from: '0,0', to: '1,0', cost: 0.01, capacity: 20, mode: 'road', risk: 0, toll: 0, border: 0 },
  { id: 'ba', from: '1,0', to: '0,0', cost: 0.01, capacity: 20, mode: 'road', risk: 0, toll: 0, border: 0 },
];
const solve = (cities: City[], goods: Good[], producers: Producer[], edges: Edge[] = []): ReturnType<typeof resolveGoodsEconomy> =>
  resolveGoodsEconomy({ turn: 1, goods, cities, producers, edges, opening: [], fame: [] } as Snapshot);
const bal = (r: ReturnType<typeof solve>, c: string, g: string) =>
  r.balances.find(b => b.city === c && b.good === g)!;

describe('subsistence workforce-output calibration', () => {
  it('at 30% stability a fully staffed critical source survives, but ordinary timber remains sensitive to unrest', () => {
    const c = city('c', 1000, 0.3, 0);
    const r = solve([c], [good('raw_grain', 'staple_food'), good('raw_timber', 'construction')],
      [source('c', 'raw_grain', 4, 100), source('c', 'raw_timber', 4, 100)]);
    const food = r.diagnostics.find(d => d.producer === 'source:c:raw_grain')!;
    const timber = r.diagnostics.find(d => d.producer === 'source:c:raw_timber')!;
    expect(food.factors.stability).toBeCloseTo(ECONOMY.criticalSourceStabilityFloor, 8);
    expect(timber.factors.stability).toBeCloseTo(0.3, 8);
    expect(food.realized).toBeGreaterThan(timber.realized);
    // Every extra produced food unit is physical and appears in the ledger, not
    // as a virtual coverage bonus.
    expect(produced(bal(r,'c','raw_grain'))).toBeGreaterThan(2);
  });

  it('a 100-person producer can supply its own needs and physically trade a real surplus over an open road', () => {
    const r = solve([city('farm', 100, 0.55, 0), city('buyer', 100, 0.65, 1)],
      [good('raw_grain', 'staple_food')], [source('farm', 'raw_grain', 3, 20)], street);
    const f = bal(r, 'farm', 'raw_grain');
    const b = bal(r, 'buyer', 'raw_grain');
    expect(produced(f)).toBeGreaterThan(1.1);
    expect(f.consumed_household).toBeGreaterThan(0);
    expect(f.exported).toBeGreaterThan(0.05);
    expect(b.imported).toBeGreaterThan(0);
    expect(b.unmet_demand).toBeLessThan(b.demand);
    for (const x of r.balances)
      expect(x.opening + produced(x) + x.imported).toBeCloseTo(
        x.consumed_household + x.consumed_state + x.consumed_as_input + x.exported + x.stored + x.capex + x.lost_spoilage, 7);
  });

  it('isolation blocks exports and production never changes a city\'s population by itself', () => {
    const a = city('farm', 100, 0.55, 0), b = city('buyer', 100, 0.65, 1);
    const r = solve([a,b], [good('raw_grain', 'staple_food')],
      [source('farm', 'raw_grain', 3, 20)], []);
    expect(r.flows).toHaveLength(0);
    expect(bal(r,'buyer','raw_grain').imported).toBe(0);
    expect(a.population).toBe(100);
    expect(b.population).toBe(100);
  });
});
