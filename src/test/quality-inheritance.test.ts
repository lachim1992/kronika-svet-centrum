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
      const qq = (g: string) => r.balances.find((b) => b.good === g)!.quality;
      const grain = qq('raw_grain'), flour = qq('flour'), bread = qq('baked_staples');
      expect(flour).toBeLessThanOrEqual(Math.min(grain + H, PRODUCT_MARKET.maxQuality) + 1e-9);
      expect(bread).toBeLessThanOrEqual(Math.min(flour + H, PRODUCT_MARKET.maxQuality) + 1e-9);
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

