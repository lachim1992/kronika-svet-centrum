import { describe, it, expect } from 'vitest';
import { resolveGoodsEconomy, produced, type Good, type City, type Producer, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';

type Result = ReturnType<typeof resolveGoodsEconomy>;

const good = (key: string, basket: string, price: number): Good => ({ key, basket, price, stage: 'final', storable: true,
  bulk: 1, density: 30, perishability: 0, storageLoss: 0, storageCost: 0, substitutability: 1,
  strategic: 0, prestige: 0, transshipment: 0, finalUse: true });
const city = (id: string, x: number, population: number, market = 2): City => ({ id, owner: 'p', name: id, cell: `${x},0`,
  population, classes: { peasants: population }, soldiers: 0, stability: 1, irrigation: 0, labor: {},
  market, storage: 10, admin: 0, security: 1, guild: 0, ideology: 'open_merchant', coastal: false });
const producer = (id: string, c: string, g: string, capacity: number): Producer => ({ id, city: c, channel: 'node',
  capacity, recipe: { key: id, good: g, qty: 1, inputs: [], labor: 1, quality: 0, minQuality: 0 },
  allocation: 1, staffing: 1, logistics: 1, mastery: 1, source: true, distinctive: false });

/** One producing town, one large consuming town, one road between them. */
const pair = (cost = 1, capacity = 1000, goods: Good[] = [good('grain', 'staple_food', 10)]): Snapshot => ({
  turn: 2, goods, cities: [city('surplus', 0, 500), city('deficit', 1, 8000)],
  producers: goods.map(g => producer(g.key, 'surplus', g.key, 60)),
  edges: [{ id: 'road', from: '0,0', to: '1,0', cost, capacity, mode: 'road', risk: 0, toll: 0, border: 0 }],
  opening: [], fame: [],
});
const priceAt = (r: Result, cityId: string, goodKey = 'grain') =>
  r.prices.find(p => p.city === cityId && p.good === goodKey)!.local_price;

describe('phase A — endogenous local prices', () => {
  it('keeps every scarcity factor inside the configured bounds', () => {
    for (const r of [resolveGoodsEconomy(pair()), resolveGoodsEconomy({ ...pair(), edges: [] })])
      for (const p of r.prices) {
        expect(p.scarcity_factor).toBeGreaterThanOrEqual(ECONOMY.priceFloor);
        expect(p.scarcity_factor).toBeLessThanOrEqual(ECONOMY.priceCeiling);
        expect(p.local_price).toBeCloseTo(p.base_price * p.scarcity_factor * p.quality_factor * p.fame_factor);
      }
  });

  it('prices the short town above and the supplied town below its reference price', () => {
    const r = resolveGoodsEconomy({ ...pair(), edges: [] });
    expect(priceAt(r, 'deficit')).toBeGreaterThan(10);
    expect(priceAt(r, 'surplus')).toBeLessThan(priceAt(r, 'deficit'));
  });

  it('H — a price gap drives a flow that narrows the gap', () => {
    const connected = resolveGoodsEconomy(pair());
    const isolated = resolveGoodsEconomy({ ...pair(), edges: [] });
    const flow = connected.flows.find(f => f.destination === 'deficit');
    expect(flow).toBeTruthy();
    expect(flow!.destination_price).toBeGreaterThan(flow!.source_price);
    expect(flow!.expected_margin).toBeGreaterThan(0);
    expect(priceAt(connected, 'deficit') - priceAt(connected, 'surplus'))
      .toBeLessThan(priceAt(isolated, 'deficit') - priceAt(isolated, 'surplus'));
  });

  it('J — no price, market or fame setting creates physical goods', () => {
    const snapshot = pair();
    const physical = (r: Result) => r.balances.reduce((n, b) => n + b.opening + produced(b), 0);
    const plain = resolveGoodsEconomy(snapshot);
    const hyped = resolveGoodsEconomy({ ...snapshot, cities: snapshot.cities.map(c => ({ ...c, market: 9, admin: 9 })),
      fame: [{ city: 'surplus', good: 'grain', name: 'x', streak: 9, fame: 100, quality: 3, created: 1, turn: 1 }] });
    expect(physical(hyped)).toBeCloseTo(physical(plain));
    expect(physical(plain)).toBeGreaterThan(0);
  });

  it('conserves every balance even with prices and arbitrage gating active', () => {
    for (const b of resolveGoodsEconomy(pair()).balances)
      expect(b.opening + produced(b) + b.imported)
        .toBeCloseTo(b.consumed_household + b.consumed_state + b.consumed_as_input + b.exported + b.stored + b.capex + b.lost_spoilage);
  });

  it('D — light valuable goods still travel where cheap bulk goods stop paying', () => {
    const stone = { ...good('stone', 'construction', 1), bulk: 30, density: 0.1 };
    const robe = { ...good('robe', 'luxury_clothing', 100), bulk: 0.1, density: 100, prestige: 1 };
    const r = resolveGoodsEconomy(pair(30, 1000, [stone, robe]));
    expect(r.flows.filter(f => f.good === 'stone')).toHaveLength(0);
    expect(r.flows.some(f => f.good === 'robe' && f.delivered > 0)).toBe(true);
  });

  it('I — a narrow road caps the realized flow and leaves demand unmet', () => {
    const moved = (r: Result) => r.flows.reduce((n, f) => n + f.qty, 0);
    const unmet = (r: Result) => r.balances.filter(b => b.city === 'deficit').reduce((n, b) => n + b.unmet_demand, 0);
    const wide = resolveGoodsEconomy(pair(1, 1000)), narrow = resolveGoodsEconomy(pair(1, 5));
    expect(moved(narrow)).toBeLessThan(moved(wide));
    expect(unmet(narrow)).toBeGreaterThan(unmet(wide));
  });

  it('C — cutting the only route removes the flow and raises the local price again', () => {
    const open = resolveGoodsEconomy(pair()), blocked = resolveGoodsEconomy({ ...pair(), edges: [] });
    expect(blocked.flows).toHaveLength(0);
    expect(priceAt(blocked, 'deficit')).toBeGreaterThan(priceAt(open, 'deficit'));
  });

  it('stays deterministic and pure across repeated runs', () => {
    const snapshot = pair(), before = JSON.stringify(snapshot);
    expect(resolveGoodsEconomy(snapshot).prices).toEqual(resolveGoodsEconomy(snapshot).prices);
    expect(JSON.stringify(snapshot)).toBe(before);
  });
});
