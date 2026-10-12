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
