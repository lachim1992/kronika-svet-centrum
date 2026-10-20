import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveGoodsEconomy, produced, type Good, type City, type Producer, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';
import { PRODUCT_META, productMeta, substitutionEfficiency } from '../../supabase/functions/_shared/productMarket';
import { GOODS } from '../../supabase/functions/_shared/productionCatalog';
import { starterUnitsFor, starterJobsFor, STARTER_FARM } from '../../supabase/functions/_shared/starterEconomy';
import { LEVEL_CAPACITY_SCALE, scaledBasketOutputs } from '../lib/goodsCatalog';

const L = 1 / ECONOMY.workersPerLaborUnit;
const good = (key: string, basket: string, price = 2, stage = 'final', substitutability = 1): Good => ({
  key, basket, price, stage, storable: true, bulk: 1, density: 30, perishability: 0, storageLoss: 0,
  storageCost: 0, substitutability, strategic: 0, prestige: 0, transshipment: 0, finalUse: stage !== 'intermediate',
});
const city = (id: string, x: number, pop = 10000, stability = 1): City => ({
  id, owner: 'p', name: id, cell: `${x},0`, population: pop,
  classes: { peasants: pop * 0.8, burghers: pop * 0.2 }, soldiers: 0, stability, irrigation: 0,
  labor: {}, market: 2, storage: 10, admin: 0, security: 1, guild: 0, ideology: 'open_merchant', coastal: false,
});
const src = (id: string, c: string, g: string, cap: number, allocation: number, jobs = 100): Producer => ({
  id, city: c, channel: 'facility', capacity: cap, jobs,
  recipe: { key: id, good: g, qty: 2, inputs: [], labor: L, quality: 0, minQuality: 0 },
  allocation, staffing: 1, logistics: 1, mastery: 1, source: true, distinctive: false,
});
/** Farm Lv1: three food recipes sharing ONE rated capacity budget (wheat/barley→grain, cattle→meat). */
const farm = (c: string, rating: number, recipes: [string, string][] = [['wheat', 'raw_grain'], ['barley', 'raw_grain'], ['cattle', 'raw_meat']], lock?: string): Producer[] =>
  recipes.map(([key, g]) => src(key, c, g, rating, lock ? (key === lock ? 1 : 0) : 1 / recipes.length));
const snap = (cities: City[], goods: Good[], producers: Producer[], opening: Snapshot['opening'] = []): Snapshot =>
  ({ turn: 2, cities, goods, producers, edges: [], opening, fame: [] });
const EDIBLE = ['raw_grain', 'raw_meat', 'baked_staples'];
const edibleRealized = (r: ReturnType<typeof resolveGoodsEconomy>, c: string) =>
  r.diagnostics.filter(d => d.producer && EDIBLE.includes(d.good))
    .reduce((s, d) => s + d.realized, 0);
const foodBalance = (r: ReturnType<typeof resolveGoodsEconomy>, c: string) =>
  r.balances.filter(b => b.city === c && ['raw_grain', 'raw_meat', 'baked_staples'].includes(b.good));
const expectConservation = (r: ReturnType<typeof resolveGoodsEconomy>) => {
  for (const b of r.balances) expect(b.opening + produced(b) + b.imported)
    .toBeCloseTo(b.consumed_household + b.consumed_state + b.consumed_as_input + b.exported + b.stored + b.capex + b.lost_spoilage, 7);
};

describe('level scaling — one canonical multiplier', () => {
  it('UI scale mirrors ECONOMY.levelCapacityScale exactly', () => {
    expect(LEVEL_CAPACITY_SCALE).toEqual([...ECONOMY.levelCapacityScale]);
  });
  it('scaledBasketOutputs uses [1,2,4] for Lv1/2/3, never linear level', () => {
    const b = { current_level: 1, effects: { basket_outputs: { staple_food: 7 } } };
    expect(scaledBasketOutputs(b)).toEqual({ staple_food: 7 });
    expect(scaledBasketOutputs({ ...b, current_level: 2 })).toEqual({ staple_food: 14 });
    expect(scaledBasketOutputs({ ...b, current_level: 3 })).toEqual({ staple_food: 28 });
  });
});

describe('farm calibration — food-equivalent per turn from one shared budget', () => {
  const foods = [good('raw_grain', 'staple_food'), good('raw_meat', 'staple_food'), good('baked_staples', 'staple_food', 4)];
  it('Lv1 rating 7 at full staffing/stability/tools yields 7 food-equivalents', () => {
    const r = resolveGoodsEconomy(snap([city('a', 0)], foods, farm('a', 7)));
    expect(edibleRealized(r, 'a')).toBeCloseTo(7, 6);
    expectConservation(r);
  });
  it('Lv2/Lv3 ratings 14/28 (7 × canonical scale) yield 14/28 food-equivalents', () => {
    expect(edibleRealized(resolveGoodsEconomy(snap([city('a', 0)], foods, farm('a', 7 * LEVEL_CAPACITY_SCALE[1]))), 'a')).toBeCloseTo(14, 6);
    expect(edibleRealized(resolveGoodsEconomy(snap([city('a', 0)], foods, farm('a', 7 * LEVEL_CAPACITY_SCALE[2]))), 'a')).toBeCloseTo(28, 6);
  });
  it('stability .68 with missing tools (floor .75) yields ≈3.57 at Lv1', () => {
    const g = [...foods, good('metalwork_tools', 'tools', 8)];
    const r = resolveGoodsEconomy(snap([city('a', 0, 10000, 0.68)], g, farm('a', 7)));
    expect(edibleRealized(r, 'a')).toBeCloseTo(7 * 0.68 * 0.75, 2);
  });
  it('AUTO with Lv2 non-food recipes shares the SAME budget — total never exceeds the rating', () => {
    const mixed = farm('a', 7, [['wheat', 'raw_grain'], ['barley', 'raw_grain'], ['cattle', 'raw_meat'], ['flax', 'raw_fiber'], ['sheep', 'raw_fiber']]);
    const g = [...foods, good('raw_fiber', 'textile_fiber', 3, 'raw')];
    const r = resolveGoodsEconomy(snap([city('a', 0)], g, mixed));
    const total = r.diagnostics.reduce((s, d) => s + d.realized, 0);
    expect(total).toBeCloseTo(7, 6);
    expect(edibleRealized(r, 'a')).toBeLessThan(7); // fiber takes its share of the one budget
    expectConservation(r);
  });
  it('LOCK on wheat puts the whole budget into grain', () => {
    const r = resolveGoodsEconomy(snap([city('a', 0)], foods, farm('a', 7, undefined, 'wheat')));
    expect(r.balances.find(b => b.good === 'raw_grain')!.produced_facility).toBeCloseTo(7, 6);
    expect(r.balances.find(b => b.good === 'raw_meat')!.produced_facility).toBe(0);
  });
});

describe('nutrition equivalence — taste never steals calories', () => {
  it('critical-need substitution ignores preference friction', () => {
    const target = { key: 'baked_staples', basket: 'staple_food', substitutability: 1 };
    const grain = { key: 'raw_grain', basket: 'staple_food', substitutability: 0.3 };
    expect(substitutionEfficiency(target, grain, { nutritionOnly: true })).toBeCloseTo(1, 9);
    expect(substitutionEfficiency(target, grain)).toBeLessThan(1); // friction still shapes CHOICE
  });
  it('every edible staple_food good has functional_value 1 (UI food-equivalent is 1:1)', () => {
    for (const g of GOODS.filter(g => g.basket === 'staple_food' && g.finalUse !== false))
      expect(productMeta(g.key, 'staple_food').functional_value, g.key).toBe(1);
    expect(GOODS.find(g => g.key === 'flour')!.finalUse).toBe(false); // flour is intermediate, not edible
    expect(PRODUCT_META.raw_grain.functional_value).toBe(1);
  });
  it('grain-only diet fully covers bread demand — zero hunger with enough calories', () => {
    for (const friction of [1, 0.3]) {
      const g = [good('raw_grain', 'staple_food', 2, 'raw', friction), good('baked_staples', 'staple_food', 4)];
      const s = snap([city('a', 0, 1000)], g, []);
      const need = 1000 * ECONOMY.populationDemand * 2; // generous surplus over any class weighting
      s.opening = [{ city: 'a', good: 'raw_grain', qty: need, quality: 0 }];
      const r = resolveGoodsEconomy(s);
      const fb = foodBalance(r, 'a');
      expect(fb.reduce((sum, b) => sum + b.unmet_demand, 0), `friction ${friction}`).toBeLessThan(1e-6);
      expect(fb.reduce((sum, b) => sum + b.consumed_household, 0)).toBeGreaterThan(0);
      expectConservation(r);
    }
  });
  it('a mill cannot take the last edible grain, but uses real surplus above the food reserve', () => {
    const g = [good('raw_grain', 'staple_food', 2, 'raw'), good('flour', 'staple_food', 3, 'intermediate'), good('baked_staples', 'staple_food', 4)];
    const mill: Producer = { id: 'mill', city: 'a', channel: 'facility', capacity: 50, jobs: 50,
      recipe: { key: 'mill_grain', good: 'flour', qty: 2, inputs: [{ good: 'raw_grain', qty: 3 }], labor: L, quality: 0, minQuality: 0 },
      allocation: 1, staffing: 1, logistics: 1, mastery: 1, source: false, distinctive: false };
    // Grain BELOW the food need → reserve holds everything, the mill starves.
    const exact = snap([city('a', 0, 1000)], g, [mill]);
    exact.opening = [{ city: 'a', good: 'raw_grain', qty: 1000 * ECONOMY.populationDemand * 0.8, quality: 0 }];
    const r1 = resolveGoodsEconomy(exact);
    expect(r1.diagnostics.find(d => d.producer === 'mill')!.realized).toBeLessThan(1e-6);
    expect(r1.balances.find(b => b.good === 'raw_grain')!.consumed_household).toBeGreaterThan(0);
    expect(r1.balances.find(b => b.good === 'raw_grain')!.consumed_as_input).toBeLessThan(1e-9);
    // Double the grain → the surplus above the reserve is milled, residents still eat.
    const surplus = snap([city('a', 0, 1000)], g, [mill]);
    surplus.opening = [{ city: 'a', good: 'raw_grain', qty: 1000 * ECONOMY.populationDemand * 2 + 30, quality: 0 }];
    const r2 = resolveGoodsEconomy(surplus);
    expect(r2.diagnostics.find(d => d.producer === 'mill')!.realized).toBeGreaterThan(0);
    expect(foodBalance(r2, 'a').reduce((s, b) => s + b.unmet_demand, 0)).toBeLessThan(1e-6);
    expectConservation(r2);
  });
});

describe('starter farm — sized once at founding, never inflated by growth', () => {
  it('one unit mirrors one normal farm (rating 7, 100 jobs) and tracks population', () => {
    expect(starterUnitsFor(3796)).toBe(9); // ≈ one farm per 400 souls
    expect(starterUnitsFor(100)).toBe(1);
    expect(starterJobsFor(STARTER_FARM, 3796)).toBe(Math.min(9 * 100, Math.round(3796 * 0.3)));
    for (const pop of [100, 450, 1000, 3796, 10000])
      expect(starterJobsFor(STARTER_FARM, pop)).toBeLessThanOrEqual(Math.max(10, Math.round(pop * 0.3)));
  });
  it('ensureStarterEconomy never resizes an existing starter structure (frozen at founding)', () => {
    const source = readFileSync('supabase/functions/_shared/starterEconomy.ts', 'utf8');
    expect(source).toContain('FROZEN AT FOUNDING');
    expect(source).not.toContain('resizes.push');
  });
});
