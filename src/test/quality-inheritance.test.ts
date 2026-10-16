/** Quality inheritance through grain → flour → bread, via the canonical solver. */
import { describe, it, expect } from 'vitest';
import { resolveGoodsEconomy, type Good, type City, type Producer, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';
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

describe('minQuality is checked on actually allocated lots', () => {
  const H = PRODUCT_MARKET.qualityInheritanceHeadroom;
  const one = (opening: Snapshot['opening'], minQuality: number, storage = 10) => {
    const a: City = { ...city('open_merchant', 3), id: 'a', name: 'a', population: 10, classes: { peasants: 10 }, storage };
    const mill = { ...producer('mill_grain', 'flour', [{ good: 'raw_grain', qty: 1 }], 3), city: 'a', capacity: 50 };
    mill.recipe = { ...mill.recipe, minQuality };
    return resolveGoodsEconomy({ turn: 1, cities: [a], fame: [], edges: [], producers: [mill], opening,
      goods: [good('raw_grain', 'staple_food', 1), good('flour', 'staple_food', 2)] });
  };
  const closes = (r: ReturnType<typeof resolveGoodsEconomy>) => { for (const b of r.balances) {
    expect(b.opening + b.produced_household + b.produced_node + b.produced_facility + b.produced_district + b.imported)
      .toBeCloseTo(b.exported + b.consumed_household + b.consumed_state + b.consumed_as_input + b.stored + b.capex + b.lost_spoilage, 7);
    if (b.stored_lots) expect(b.stored_lots.reduce((t, l) => t + l.qty, 0)).toBeCloseTo(b.stored, 9); } };

  it('mixed q0 + q3 lots with minQuality 2: mill uses only the q3 lot (average 1.5 would have blocked it)', () => {
    const r = one([{ city: 'a', good: 'raw_grain', qty: 20, quality: 1.5,
      lots: [{ qty: 10, quality: 0, origin: 'a' }, { qty: 10, quality: 3, origin: 'b' }] }], 2);
    const lot = r.diagnostics.find((d) => d.producer === 'mill_grain')!.input_lots!.find((l) => l.good === 'raw_grain')!;
    expect(lot.qty).toBeGreaterThan(0);
    expect(lot.qty).toBeLessThanOrEqual(10 + 1e-9);
    expect(lot.quality).toBeCloseTo(3, 9);
    expect(lot.origins.b).toBeCloseTo(lot.qty, 9);
    const grain = r.balances.find((b) => b.good === 'raw_grain')!;
    expect(grain.consumed_as_input).toBeLessThanOrEqual(10 + 1e-9); // q0 lot never consumed
    expect((grain.stored_lots || []).filter((l) => l.quality === 0).reduce((t, l) => t + l.qty, 0)).toBeGreaterThan(0);
    expect(r.balances.find((b) => b.good === 'flour')!.quality).toBeLessThanOrEqual(Math.min(3 + H, PRODUCT_MARKET.maxQuality) + 1e-9);
    closes(r);
  });

  it('insufficient quality stock: only lots below minQuality → no production, grain untouched', () => {
    const r = one([{ city: 'a', good: 'raw_grain', qty: 20, quality: 0.5,
      lots: [{ qty: 10, quality: 0, origin: 'a' }, { qty: 10, quality: 1, origin: 'b' }] }], 2);
    expect(r.diagnostics.find((d) => d.producer === 'mill_grain')!.realized).toBe(0);
    expect(r.balances.find((b) => b.good === 'raw_grain')!.consumed_as_input).toBe(0);
    expect(r.balances.find((b) => b.good === 'flour')?.produced_node ?? 0).toBe(0);
    closes(r);
  });

  it('storage cap: stored lots sum to stored and keep quality/origin shares', () => {
    const r = one([{ city: 'a', good: 'raw_grain', qty: 5000, quality: 1.5,
      lots: [{ qty: 2500, quality: 0, origin: 'a' }, { qty: 2500, quality: 3, origin: 'b' }] }], 99, 0.01);
    const g = r.balances.find((b) => b.good === 'raw_grain')!;
    expect(g.stored).toBeLessThan(5000);
    const byQ = (q: number) => g.stored_lots!.filter((l) => l.quality === q).reduce((t, l) => t + l.qty, 0);
    if (g.stored > 0) expect(byQ(3) / g.stored).toBeCloseTo(0.5, 6);
    closes(r);
  });
});

describe('minQuality across two turns (carried lots)', () => {
  it('q0/q3 mix, minQuality 2: turn 1 mills only q3, q0 carries over; turn 2 with only q0 left produces nothing', () => {
    const a: City = { ...city('open_merchant', 3), id: 'a', name: 'a', population: 10, classes: { peasants: 10 } };
    const goods = [good('raw_grain', 'staple_food', 1), good('flour', 'staple_food', 2)];
    const mill = { ...producer('mill_grain', 'flour', [{ good: 'raw_grain', qty: 1 }], 3), city: 'a', capacity: 50 };
    mill.recipe = { ...mill.recipe, minQuality: 2 };
    const s1: Snapshot = { turn: 1, cities: [a], fame: [], edges: [], producers: [mill], goods,
      opening: [{ city: 'a', good: 'raw_grain', qty: 20, quality: 1.5, lots: [{ qty: 10, quality: 0, origin: 'a' }, { qty: 10, quality: 3, origin: 'b' }] }] };
    const r1 = resolveGoodsEconomy(s1);
    const g1 = r1.balances.find((b) => b.good === 'raw_grain')!;
    const used1 = r1.diagnostics.find((d) => d.producer === 'mill_grain')!.input_lots!.find((l) => l.good === 'raw_grain')!;
    expect(used1.quality).toBeCloseTo(3, 9);
    const q0Left = (l?: { qty: number; quality: number }[]) => (l || []).filter((x) => x.quality === 0).reduce((t, x) => t + x.qty, 0);
    expect(q0Left(g1.stored_lots)).toBeGreaterThan(0); // q0 batch carried, never milled
    const s2: Snapshot = { ...s1, turn: 2, opening: r1.balances.map((b) => ({ city: b.city, good: b.good, qty: b.stored, quality: b.quality, lots: b.stored_lots })) };
    const r2 = resolveGoodsEconomy(s2);
    const g2 = r2.balances.find((b) => b.good === 'raw_grain')!;
    expect(g2.opening).toBeCloseTo(g1.stored, 9);
    // Turn 2 may mill the carried q3 remainder only; it never draws the q0 batch.
    const lots2 = r2.diagnostics.find((d) => d.producer === 'mill_grain')!.input_lots?.find((l) => l.good === 'raw_grain');
    if (lots2) expect(lots2.quality).toBeCloseTo(3, 9);
    const q3Carried = g1.stored - q0Left(g1.stored_lots);
    expect(g2.consumed_as_input).toBeLessThanOrEqual(q3Carried + 1e-9);
    expect(r2.balances.find((b) => b.good === 'flour')!.produced_node).toBeLessThanOrEqual(q3Carried + 1e-9);
    for (const r of [r1, r2]) for (const b of r.balances)
      expect(b.opening + b.produced_household + b.produced_node + b.produced_facility + b.produced_district + b.imported)
        .toBeCloseTo(b.exported + b.consumed_household + b.consumed_state + b.consumed_as_input + b.stored + b.capex + b.lost_spoilage, 7);
  });
});

describe('quality-filtered remote sourcing (two cities)', () => {
  const H = PRODUCT_MARKET.qualityInheritanceHeadroom;
  const run = (lots: { qty: number; quality: number; origin: string }[]) => {
    const a: City = { ...city('open_merchant', 0), id: 'a', name: 'a', cell: '0,0', population: 10, classes: { peasants: 10 } };
    const b: City = { ...city('open_merchant', 3), id: 'b', name: 'b', cell: '1,0', population: 10, classes: { peasants: 10 } };
    const mill = { ...producer('mill_grain', 'flour', [{ good: 'raw_grain', qty: 1 }], 3), city: 'b', capacity: 10 };
    mill.recipe = { ...mill.recipe, minQuality: 2 };
    const qty = lots.reduce((t, l) => t + l.qty, 0);
    return resolveGoodsEconomy({ turn: 1, cities: [a, b], fame: [], producers: [mill],
      opening: [{ city: 'a', good: 'raw_grain', qty, quality: lots.reduce((t, l) => t + l.qty * l.quality, 0) / qty, lots }],
      edges: [{ id: 'r', from: '0,0', to: '1,0', cost: 1, capacity: 500, mode: 'road', risk: 0, toll: 0, border: 0 }],
      goods: [good('raw_grain', 'staple_food', 1), good('flour', 'staple_food', 2)] });
  };
  const closes = (r: ReturnType<typeof resolveGoodsEconomy>) => { for (const b of r.balances)
    expect(b.opening + b.produced_household + b.produced_node + b.produced_facility + b.produced_district + b.imported)
      .toBeCloseTo(b.exported + b.consumed_household + b.consumed_state + b.consumed_as_input + b.stored + b.capex + b.lost_spoilage, 7); };

  it('supplier with q0 (oldest) + q3 lots ships only q3; mill consumes q3 of origin a', () => {
    const r = run([{ qty: 200, quality: 0, origin: 'a' }, { qty: 200, quality: 3, origin: 'x' }]);
    const flows = r.flows.filter((f) => f.good === 'raw_grain' && f.destination === 'b');
    expect(flows.length).toBeGreaterThan(0);
    for (const f of flows) expect(f.quality).toBeCloseTo(3, 9); // average 1.5 / FIFO q0 never shipped
    const lot = r.diagnostics.find((d) => d.producer === 'mill_grain')!.input_lots!.find((l) => l.good === 'raw_grain')!;
    expect(lot.quality).toBeCloseTo(3, 9);
    expect(lot.origins.x).toBeCloseTo(lot.qty, 9); // provenance preserved through transit
    const src = r.balances.find((x) => x.city === 'a' && x.good === 'raw_grain')!;
    expect(src.exported).toBeLessThanOrEqual(200 + 1e-9);
    expect(r.balances.find((x) => x.city === 'b' && x.good === 'flour')!.quality).toBeLessThanOrEqual(Math.min(3 + H, PRODUCT_MARKET.maxQuality) + 1e-9);
    closes(r);
  });

  it('supplier holding only q0 lots is skipped: no import, no flour', () => {
    const r = run([{ qty: 400, quality: 0, origin: 'a' }]);
    expect(r.flows.filter((f) => f.good === 'raw_grain' && f.reason === 'production_input')).toHaveLength(0);
    expect(r.balances.find((x) => x.city === 'b' && x.good === 'flour')?.produced_node ?? 0).toBe(0);
    closes(r);
  });
});

describe('supplier ranking prices the eligible lots, not the city average', () => {
  const C3 = (id: string, cell: string, craft = 0): City => ({ ...city('open_merchant', craft), id, name: id, cell, population: 10, classes: { peasants: 10 } });
  const lotOpening = (c: string, lots: { qty: number; quality: number; origin: string }[]) => {
    const qty = lots.reduce((t, l) => t + l.qty, 0);
    return { city: c, good: 'raw_grain', qty, quality: lots.reduce((t, l) => t + l.qty * l.quality, 0) / qty, lots };
  };
  it('A (cheap average, expensive q3 eligible lots) loses to B (cheaper q2 eligible lots)', () => {
    const mill = { ...producer('mill_grain', 'flour', [{ good: 'raw_grain', qty: 1 }], 3), city: 'm', capacity: 10 };
    mill.recipe = { ...mill.recipe, minQuality: 2 };
    const edge = (id: string, from: string, to: string) => ({ id, from, to, cost: 1, capacity: 500, mode: 'road' as const, risk: 0, toll: 0, border: 0 });
    // A: average 0.75 (cheaper by average) but its only eligible lots are q3; B: all q2.
    const r = resolveGoodsEconomy({ turn: 1, cities: [C3('a', '0,0'), C3('m', '1,0', 3), C3('b', '2,0')], fame: [], producers: [mill],
      opening: [lotOpening('a', [{ qty: 300, quality: 0, origin: 'a' }, { qty: 100, quality: 3, origin: 'a' }]),
        lotOpening('b', [{ qty: 400, quality: 2, origin: 'b' }])],
      edges: [edge('ea', '0,0', '1,0'), edge('eb', '1,0', '2,0')],
      goods: [good('raw_grain', 'staple_food', 1), good('flour', 'staple_food', 2)] });
    const d = r.diagnostics.find((x) => x.producer === 'mill_grain')! as any;
    const line = d.margin.inputs.find((l: any) => l.good === 'raw_grain');
    expect(line.chosen_supplier).toBe('b');
    const [first, second] = line.ranked_suppliers;
    expect(first.city).toBe('b'); expect(second.city).toBe('a');
    expect(first.eligible_quality).toBeCloseTo(2, 9); expect(second.eligible_quality).toBeCloseTo(3, 9);
    for (const s of line.ranked_suppliers) {
      // price decomposition: source = base × scarcity × (1 + q·premium); no fame; parts sum to landed
      expect(s.source_quality_factor).toBeCloseTo(1 + s.eligible_quality * ECONOMY.qualityPremium, 9);
      expect(s.source).toBeCloseTo(1 * s.source_scarcity_factor * s.source_quality_factor, 9);
      expect(s.source + s.transport + s.tolls + s.tariff + s.risk + s.loss_cost).toBeCloseTo(s.landed, 9);
    }
    expect(first.landed).toBeLessThan(second.landed);
    const flows = r.flows.filter((f) => f.good === 'raw_grain' && f.destination === 'm');
    expect(flows.length).toBeGreaterThan(0);
    for (const f of flows) { expect(f.source).toBe('b'); expect(f.quality).toBeCloseTo(2, 9); }
    const lot = d.input_lots.find((l: any) => l.good === 'raw_grain');
    expect(lot.quality).toBeCloseTo(2, 9); expect(lot.origins.b).toBeCloseTo(lot.qty, 9);
    expect(r.balances.find((x) => x.city === 'a' && x.good === 'raw_grain')!.exported).toBe(0);
    for (const b of r.balances)
      expect(b.opening + b.produced_household + b.produced_node + b.produced_facility + b.produced_district + b.imported)
        .toBeCloseTo(b.exported + b.consumed_household + b.consumed_state + b.consumed_as_input + b.stored + b.capex + b.lost_spoilage, 7);
  });

  it('famous source: factory landed source price carries no fame premium', () => {
    const mill = { ...producer('mill_grain', 'flour', [{ good: 'raw_grain', qty: 1 }], 3), city: 'm', capacity: 10 };
    const r = resolveGoodsEconomy({ turn: 1, cities: [C3('a', '0,0'), C3('m', '1,0', 3)], producers: [mill],
      fame: [{ city: 'a', good: 'raw_grain', name: 'x', streak: 5, fame: 80, quality: 1, created: 1, turn: 1 }],
      opening: [lotOpening('a', [{ qty: 400, quality: 1, origin: 'a' }])],
      edges: [{ id: 'e', from: '0,0', to: '1,0', cost: 1, capacity: 500, mode: 'road', risk: 0, toll: 0, border: 0 }],
      goods: [good('raw_grain', 'staple_food', 1), good('flour', 'staple_food', 2)] });
    const s = (r.diagnostics.find((x) => x.producer === 'mill_grain') as any).margin.inputs[0].ranked_suppliers[0];
    expect(s.source).toBeCloseTo(s.source_scarcity_factor * (1 + ECONOMY.qualityPremium), 9);
  });
});
