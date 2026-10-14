/** Quality inheritance through grain → flour → bread, via the canonical solver. */
import { describe, it, expect } from 'vitest';
import { resolveGoodsEconomy, type Good, type City, type Producer, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { outputQuality, PRODUCT_MARKET } from '../../supabase/functions/_shared/productMarket';

const good = (key: string, basket: string, price: number): Good => ({
  key, basket, price, stage: 'intermediate', storable: true, bulk: 1, density: 30, perishability: 0,
  storageLoss: 0, storageCost: 0, substitutability: 1, strategic: 0, prestige: 0, transshipment: 0,
});
const city = (ideology: City['ideology'], guild: number): City => ({
  id: 'c', owner: 'p', name: 'c', cell: '0,0', population: 1000, classes: { peasants: 1000 }, soldiers: 0,
  stability: 1, irrigation: 0, labor: {}, market: 2, storage: 10, admin: 0, security: 1, guild, ideology, coastal: false,
});
const producer = (id: string, g: string, inputs: { good: string; qty: number }[], craft: number): Producer => ({
  id, city: 'c', channel: 'node', capacity: 50, craft,
  recipe: { key: id, good: g, qty: 1, inputs, labor: 1, quality: 0, minQuality: 0 },
  allocation: 1, staffing: 1, logistics: 1, mastery: 1, source: inputs.length === 0, distinctive: false,
});
function chain(ideology: City['ideology'], grainCraft: number, craft: number): Snapshot {
  return {
    turn: 1, cities: [city(ideology, craft)], edges: [], opening: [], fame: [],
    goods: [good('raw_grain', 'staple_food', 1), good('flour', 'staple_food', 2), good('baked_staples', 'staple_food', 4)],
    producers: [producer('harvest_wheat', 'raw_grain', [], grainCraft),
      producer('mill_grain', 'flour', [{ good: 'raw_grain', qty: 1 }], craft),
      producer('bake_staples', 'baked_staples', [{ good: 'flour', qty: 1 }], craft)],
  };
}
const q = (s: Snapshot, g: string) => resolveGoodsEconomy(s).balances.find((b) => b.good === g)!.quality;

describe('quality inheritance grain → flour → bread', () => {
  it('guild-chartered ideology cannot lift flour/bread above input quality + headroom', () => {
    const s = chain('guild_chartered', 0, 3);
    const grain = q(s, 'raw_grain'), flour = q(s, 'flour'), bread = q(s, 'baked_staples');
    expect(grain).toBe(0);
    expect(flour).toBeCloseTo(PRODUCT_MARKET.qualityInheritanceHeadroom, 6); // 1, was 1.1 before
    expect(bread).toBeCloseTo(2, 6); // was 2.2 before
  });

  it('ideology still raises craftsmanship when inputs are not the limit', () => {
    expect(outputQuality({ recipeBonus: 0, craft: 1, source: false, minInputQuality: 2, craftFactor: 1.1 })).toBeCloseTo(1.1, 6);
    expect(outputQuality({ recipeBonus: 0, craft: 3, source: true, minInputQuality: 0, craftFactor: 1.1 })).toBe(PRODUCT_MARKET.maxQuality);
  });
});

describe('regression: mixed grain qualities through the real solver', () => {
  const H = PRODUCT_MARKET.qualityInheritanceHeadroom;
  for (const grainCraft of [0, 0.5, 1, 2]) {
    it(`grain craft ${grainCraft}: flour ≤ grain+H, bread ≤ flour+H, all ≤ max`, () => {
      const s = chain('guild_chartered', grainCraft, 3);
      s.opening = [{ city: 'c', good: 'raw_grain', qty: 20, quality: 3 }]; // mix a high-quality lot in
      const r = resolveGoodsEconomy(s);
      // Cap applies to the batch actually consumed (input_lots), not the city's remaining average.
      const used = (p: string, g: string) => r.diagnostics.find((d) => d.producer === p)!.input_lots!.find((l) => l.good === g)!.quality;
      const qq = (g: string) => r.balances.find((b) => b.good === g)!.quality;
      expect(qq('flour')).toBeLessThanOrEqual(Math.min(used('mill_grain', 'raw_grain') + H, PRODUCT_MARKET.maxQuality) + 1e-9);
      expect(qq('baked_staples')).toBeLessThanOrEqual(Math.min(used('bake_staples', 'flour') + H, PRODUCT_MARKET.maxQuality) + 1e-9);
    });
  }

  it('quality factor is applied once and independently of fame', () => {
    const s = chain('open_merchant', 1, 1);
    const base = resolveGoodsEconomy(s).prices.find((p) => p.good === 'baked_staples')!;
    s.fame = [{ city: 'c', good: 'baked_staples', name: 'x', streak: 5, fame: 50, quality: 3, created: 1, turn: 1 }];
    const famed = resolveGoodsEconomy(s).prices.find((p) => p.good === 'baked_staples')!;
    for (const p of [base, famed]) {
      expect(p.quality_factor).toBeCloseTo(1 + famed.quality_factor - 1, 9);
      expect(p.local_price).toBeCloseTo(p.base_price * p.scarcity_factor * p.quality_factor * p.fame_factor, 9);
    }
    expect(famed.fame_factor).toBeGreaterThan(1);
    expect(famed.quality_factor).toBeCloseTo(base.quality_factor, 9); // fame never inflates quality
  });
});


describe('quality lots: consumed batch quality and origin, not city average', () => {
  const H = PRODUCT_MARKET.qualityInheritanceHeadroom;
  const total = (r: ReturnType<typeof resolveGoodsEconomy>) => { for (const b of r.balances)
    expect(b.opening + b.produced_household + b.produced_node + b.produced_facility + b.produced_district + b.imported)
      .toBeCloseTo(b.exported + b.consumed_household + b.consumed_state + b.consumed_as_input + b.stored + b.capex + b.lost_spoilage, 7); };

  it('mill uses the high-quality opening lot first; flour follows that batch, not the mixed average', () => {
    // 10 grain of q3 in stock + harvested q0 grain. Average would be well below 3; the mill (capacity 10 → draws ~10) uses the q3 lot.
    const s = chain('open_merchant', 0, 3);
    s.producers = s.producers.map((p) => p.id === 'mill_grain' ? { ...p, capacity: 10 } : p.id === 'bake_staples' ? { ...p, capacity: 0 } : p);
    s.opening = [{ city: 'c', good: 'raw_grain', qty: 10, quality: 3 }];
    const r = resolveGoodsEconomy(s);
    const mill = r.diagnostics.find((d) => d.producer === 'mill_grain')!;
    const lot = mill.input_lots!.find((l) => l.good === 'raw_grain')!;
    expect(lot.quality).toBeGreaterThan(2.9);
    expect(lot.origins.c).toBeCloseTo(lot.qty, 9);
    const grainAvg = r.balances.find((b) => b.good === 'raw_grain')!;
    const flour = r.balances.find((b) => b.good === 'flour')!;
    expect(flour.quality).toBeGreaterThan(grainAvg.quality); // old average-based rule would cap flour at avg+H
    expect(flour.quality).toBeLessThanOrEqual(Math.min(lot.quality + H, PRODUCT_MARKET.maxQuality) + 1e-9);
    total(r);
  });

  it('imported grain keeps its origin and quality into the mill and downstream bread', () => {
    const a: City = { ...city('open_merchant', 0), id: 'a', name: 'a', cell: '0,0' };
    const b: City = { ...city('open_merchant', 3), id: 'b', name: 'b', cell: '1,0', population: 10, classes: { peasants: 10 } };
    const s: Snapshot = { turn: 1, cities: [a, b], fame: [], opening: [{ city: 'a', good: 'raw_grain', qty: 400, quality: 2 }],
      edges: [{ id: 'r', from: '0,0', to: '1,0', cost: 1, capacity: 500, mode: 'road', risk: 0, toll: 0, border: 0 }],
      goods: [good('raw_grain', 'staple_food', 1), good('flour', 'staple_food', 2), good('baked_staples', 'staple_food', 4)],
      producers: [{ ...producer('mill_grain', 'flour', [{ good: 'raw_grain', qty: 1 }], 3), city: 'b', capacity: 10 },
        { ...producer('bake_staples', 'baked_staples', [{ good: 'flour', qty: 1 }], 3), city: 'b', capacity: 5 }] };
    const r = resolveGoodsEconomy(s);
    const lot = r.diagnostics.find((d) => d.producer === 'mill_grain')!.input_lots?.find((l) => l.good === 'raw_grain');
    expect(lot, 'mill must run on imported grain').toBeTruthy();
    expect(lot!.origins.a).toBeCloseTo(lot!.qty, 9);
    expect(lot!.quality).toBeCloseTo(2, 9);
    const flow = r.flows.find((f) => f.good === 'raw_grain' && f.destination === 'b')!;
    expect(flow.quality).toBeCloseTo(2, 9);
    const flour = r.balances.find((x) => x.city === 'b' && x.good === 'flour')!;
    const bread = r.balances.find((x) => x.city === 'b' && x.good === 'baked_staples')!;
    expect(flour.quality).toBeLessThanOrEqual(Math.min(2 + H, PRODUCT_MARKET.maxQuality) + 1e-9);
    expect(bread.quality).toBeLessThanOrEqual(Math.min(flour.quality + H, PRODUCT_MARKET.maxQuality) + 1e-9);
    total(r);
  });
});

describe('quality lots persist across turns via opening.lots', () => {
  it('two-turn: stored lots carry qty, quality and origin; material balance closes both turns', () => {
    const a: City = { ...city('open_merchant', 0), id: 'a', name: 'a', cell: '0,0', population: 10, classes: { peasants: 10 } };
    const s1: Snapshot = { turn: 1, cities: [a], fame: [], edges: [],
      opening: [{ city: 'a', good: 'raw_grain', qty: 5, quality: 1.5, lots: [{ qty: 3, quality: 3, origin: 'b' }, { qty: 2, quality: 0, origin: 'a' }] }],
      goods: [good('raw_grain', 'staple_food', 1)], producers: [] };
    const r1 = resolveGoodsEconomy(s1);
    const b1 = r1.balances.find((x) => x.good === 'raw_grain')!;
    const sum = (l: { qty: number }[]) => l.reduce((t, x) => t + x.qty, 0);
    expect(sum(b1.stored_lots!)).toBeCloseTo(b1.stored, 9);
    expect(b1.stored_lots!.some((l) => l.origin === 'b' && l.quality === 3)).toBe(true);
    // Turn 2: opening built exactly as economyAdapter does from the prior ledger.
    const s2: Snapshot = { ...s1, turn: 2, opening: r1.balances.map((b) => ({ city: b.city, good: b.good, qty: b.stored, quality: b.quality, lots: b.stored_lots })),
      producers: [{ ...producer('mill_grain', 'flour', [{ good: 'raw_grain', qty: 1 }], 3), city: 'a', capacity: 1 }],
      goods: [good('raw_grain', 'staple_food', 1), good('flour', 'staple_food', 2)] };
    const r2 = resolveGoodsEconomy(s2);
    const lot = r2.diagnostics.find((d) => d.producer === 'mill_grain')!.input_lots!.find((l) => l.good === 'raw_grain')!;
    expect(lot.origins.b).toBeCloseTo(lot.qty, 9); // FIFO draws the carried imported q3 batch first
    expect(lot.quality).toBeCloseTo(3, 9);
    const g2 = r2.balances.find((x) => x.good === 'raw_grain')!;
    expect(g2.opening).toBeCloseTo(b1.stored, 9);
    for (const r of [r1, r2]) for (const b of r.balances)
      expect(b.opening + b.produced_household + b.produced_node + b.produced_facility + b.produced_district + b.imported)
        .toBeCloseTo(b.exported + b.consumed_household + b.consumed_state + b.consumed_as_input + b.stored + b.capex + b.lost_spoilage, 7);
  });
  it('mismatched carried lots fall back to a single lot (no invented units)', () => {
    const a: City = { ...city('open_merchant', 0), id: 'a', name: 'a', population: 10, classes: { peasants: 10 } };
    const r = resolveGoodsEconomy({ turn: 1, cities: [a], fame: [], edges: [], producers: [], goods: [good('raw_grain', 'staple_food', 1)],
      opening: [{ city: 'a', good: 'raw_grain', qty: 5, quality: 1, lots: [{ qty: 50, quality: 3, origin: 'x' }] }] });
    const b = r.balances[0];
    expect(b.opening).toBe(5);
    expect(b.stored_lots!.every((l) => l.origin === 'a')).toBe(true);
  });
});
