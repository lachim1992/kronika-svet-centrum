import { describe, it, expect } from 'vitest';
import { resolveGoodsEconomy, produced, type Good, type City, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';

const grain = (): Good => ({ key: 'grain', basket: 'staple_food', price: 10, stage: 'household', storable: true,
  bulk: 1, density: 3, perishability: 0, storageLoss: 0, storageCost: 0, substitutability: 1,
  strategic: 0, prestige: 0, transshipment: 0, finalUse: true, household: true });
const luxury = (): Good => ({ key: 'silk_robe', basket: 'luxury_clothing', price: 120, stage: 'finished', storable: true,
  bulk: 0.2, density: 30, perishability: 0, storageLoss: 0, storageCost: 0, substitutability: 1,
  strategic: 0, prestige: 1, transshipment: 0, finalUse: true });
const city = (id: string, x: number, population: number, market = 2): City => ({ id, owner: 'p', name: id, cell: `${x},0`,
  population, classes: { peasants: population }, soldiers: 0, stability: 1, irrigation: 0, labor: {},
  market, storage: 0, admin: 0, security: 1, guild: 0, ideology: 'open_merchant', coastal: false });

/** Surplus city with opening stock, deficit city with demand only, one road between them. */
const pair = (cost = 1, capacity = 1000, goods: Good[] = [grain()]): Snapshot => ({
  turn: 2, goods, cities: [city('surplus', 0, 400), city('deficit', 1, 4000)], producers: [],
  edges: [{ id: 'road', from: '0,0', to: '1,0', cost, capacity, mode: 'road', risk: 0, toll: 0, border: 0 }],
  opening: goods.map(g => ({ city: 'surplus', good: g.key, qty: 600, quality: 0 })), fame: [],
});

describe('phase A — endogenous local prices', () => {
  it('prices scarcity above and glut below the long-run reference price', () => {
    const r = resolveGoodsEconomy({ ...pair(), edges: [] });
    const surplus = r.prices.find(p => p.city === 'surplus' && p.good === 'grain')!;
    const deficit = r.prices.find(p => p.city === 'deficit' && p.good === 'grain')!;
    expect(surplus.base_price).toBe(10);
    expect(deficit.local_price).toBeGreaterThan(deficit.base_price);
    expect(surplus.local_price).toBeLessThan(surplus.base_price * 1.0001);
    for (const p of r.prices) {
      expect(p.scarcity_factor).toBeGreaterThanOrEqual(ECONOMY.priceFloor);
      expect(p.scarcity_factor).toBeLessThanOrEqual(ECONOMY.priceCeiling);
    }
  });

  it('H — a price gap creates a flow that narrows the gap', () => {
    const isolated = resolveGoodsEconomy({ ...pair(), edges: [] });
    const connected = resolveGoodsEconomy(pair());
    const gap = (r: ReturnType<typeof resolveGoodsEconomy>) => {
      const s = r.prices.find(p => p.city === 'surplus')!.local_price;
      const d = r.prices.find(p => p.city === 'deficit')!.local_price;
      return d - s;
    };
    const flow = connected.flows.find(f => f.destination === 'deficit');
    expect(flow).toBeTruthy();
    expect(flow!.destination_price).toBeGreaterThan(flow!.source_price);
    expect(flow!.expected_margin).toBeGreaterThan(0);
    expect(gap(connected)).toBeLessThan(gap(isolated));
  });

  it('J — no price, market or fame combination creates physical goods', () => {
    const snapshot = pair();
    const total = (r: ReturnType<typeof resolveGoodsEconomy>) =>
      r.balances.reduce((n, b) => n + b.opening + produced(b), 0);
    const plain = resolveGoodsEconomy(snapshot);
    const hyped = resolveGoodsEconomy({ ...snapshot, cities: snapshot.cities.map(c => ({ ...c, market: 9, admin: 9 })),
      fame: [{ city: 'surplus', good: 'grain', name: 'x', streak: 9, fame: 100, quality: 3, created: 1, turn: 1 }] });
    expect(total(hyped)).toBeCloseTo(total(plain));
    expect(total(plain)).toBeCloseTo(600);
  });

  it('D — light expensive goods still trade where cheap bulk goods no longer pay for transport', () => {
    const far = 40;
    const bulk = resolveGoodsEconomy(pair(far, 1000, [grain()]));
    const fine = resolveGoodsEconomy(pair(far, 1000, [luxury()]));
    expect(bulk.flows).toHaveLength(0);
    expect(fine.flows.length).toBeGreaterThan(0);
  });

  it('I — a narrow road caps the realized flow and leaves demand unmet', () => {
    const wide = resolveGoodsEconomy(pair(1, 1000));
    const narrow = resolveGoodsEconomy(pair(1, 20));
    const moved = (r: ReturnType<typeof resolveGoodsEconomy>) => r.flows.reduce((n, f) => n + f.qty, 0);
    expect(moved(narrow)).toBeLessThan(moved(wide));
    const unmet = (r: ReturnType<typeof resolveGoodsEconomy>) =>
      r.balances.filter(b => b.city === 'deficit').reduce((n, b) => n + b.unmet_demand, 0);
    expect(unmet(narrow)).toBeGreaterThan(unmet(wide));
  });

  it('C — blocking the only route removes the flow and raises the local price again', () => {
    const open = resolveGoodsEconomy(pair());
    const blocked = resolveGoodsEconomy({ ...pair(), edges: [] });
    expect(blocked.flows).toHaveLength(0);
    const price = (r: ReturnType<typeof resolveGoodsEconomy>) => r.prices.find(p => p.city === 'deficit')!.local_price;
    expect(price(blocked)).toBeGreaterThan(price(open));
  });

  it('prices are deterministic across repeated runs of the same snapshot', () => {
    const snapshot = pair();
    expect(JSON.stringify(resolveGoodsEconomy(snapshot).prices)).toBe(JSON.stringify(resolveGoodsEconomy(snapshot).prices));
  });
});
