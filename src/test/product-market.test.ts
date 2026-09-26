import { describe, it, expect } from 'vitest';
import { resolveGoodsEconomy, type Good, type City, type Producer, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { attractiveness, demandShares, diversityIndex, recipeMargin, autoRecipeWeights, cityAccounts, PRODUCT_MARKET } from '../../supabase/functions/_shared/productMarket';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';

const L = 1 / ECONOMY.workersPerLaborUnit;
const good = (key: string, basket: string, price = 10, stage = 'final'): Good => ({ key, basket, price, stage, storable: true, bulk: 1, density: 30, perishability: 0, storageLoss: 0, storageCost: 0, substitutability: 1, strategic: 0, prestige: 0, transshipment: 0, finalUse: stage !== 'intermediate' });
const city = (id: string, x: number, pop = 1000): City => ({ id, owner: 'p', name: id, cell: `${x},0`, population: pop, classes: { peasants: pop * 0.8, burghers: pop * 0.2 }, soldiers: 0, stability: 1, irrigation: 0, labor: {}, market: 2, storage: 10, admin: 0, security: 1, guild: 0, ideology: 'open_merchant', coastal: false });
const prod = (id: string, c: string, g: string, cap = 10, inputs: { good: string; qty: number }[] = []): Producer => ({ id, city: c, channel: 'node', capacity: cap, jobs: cap, recipe: { key: id, good: g, qty: 1, inputs, labor: L, quality: 0, minQuality: 0 }, allocation: 1, staffing: 1, logistics: 1, mastery: 1, source: inputs.length === 0, distinctive: false });
const base = (): Snapshot => ({ turn: 2, cities: [city('a', 0), city('b', 1)], goods: [good('raw_grain', 'staple_food', 2), good('baked_staples', 'staple_food', 4), good('flour', 'staple_food', 3, 'intermediate'), good('pottery', 'variety', 8)],
  producers: [prod('grain', 'a', 'raw_grain', 30), prod('flour', 'b', 'flour', 10, [{ good: 'raw_grain', qty: 1 }]), prod('bread', 'b', 'baked_staples', 10, [{ good: 'flour', qty: 1 }]), prod('pots', 'a', 'pottery', 5)],
  edges: [{ id: 'r', from: '0,0', to: '1,0', cost: 1, capacity: 200, mode: 'road', risk: 0, toll: 0, border: 0 }], opening: [], fame: [] });
const opt = (good: string, extra: Partial<Parameters<typeof attractiveness>[0]> = {}) => ({ good, basket: 'staple_food', referencePrice: 4, basketAveragePrice: 4, quality: 0, fame: 0, familiarity: 0, prevalence: 0.5, coastal: false, affordability: 1, substitutability: 1, ...extra });

describe('product market layer', () => {
  it('is deterministic: same snapshot twice gives identical derived state (refresh idempotence)', () => {
    expect(JSON.stringify(resolveGoodsEconomy(base()))).toBe(JSON.stringify(resolveGoodsEconomy(base())));
  });
  it('Σ city_gdp equals the value added of the physical ledger', () => {
    const r = resolveGoodsEconomy(base());
    const va = r.balances.reduce((s, b) => s + b.gross_output_value - b.intermediate_value, 0)
      + r.metrics.reduce((s, m) => s + m.trade_services.service_value_added, 0);
    expect(r.cityAccounts.reduce((s, a) => s + a.city_gdp, 0)).toBeCloseTo(va, 6);
  });
  it('dearer inputs cut margin and never raise the output price', () => {
    const cheap = recipeMargin(10, 5, [{ qty: 10, price: 2 }]), dear = recipeMargin(10, 5, [{ qty: 10, price: 4 }]);
    expect(dear.margin).toBeLessThan(cheap.margin);
    expect(dear.revenue).toBe(cheap.revenue);
  });
  it('fame raises share but spending never exceeds the budget', () => {
    const plain = demandShares([opt('x'), opt('y')]), famed = demandShares([opt('x', { fame: 100 }), opt('y')]);
    expect(famed.find(s => s.good === 'x')!.share).toBeGreaterThan(plain.find(s => s.good === 'x')!.share);
    const acc = cityAccounts({ city: 'c', valueAdded: 100, householdTaxRate: 0.1, needs: [{ good: 'g', qty: 10, localPrice: 2, basePrice: 2, consumed: 10 }], discretionaryWish: 1e6, basketConsumption: {} });
    expect(acc.basic_basket_cost + acc.discretionary_funded).toBeLessThanOrEqual(acc.purchasing_power + 1e-9);
  });
  it('substitutes at equal base prices differ by preference/novelty, but novelty is bounded', () => {
    const s = demandShares([opt('baked_staples'), opt('raw_grain')]);
    expect(s[0].share).not.toBeCloseTo(s[1].share, 3);
    const rare = attractiveness(opt('pottery', { prevalence: 0 })), common = attractiveness(opt('pottery', { prevalence: 1 }));
    expect(rare.novelty / common.novelty).toBeLessThanOrEqual(1 + PRODUCT_MARKET.noveltySpan + 1e-9);
    // Prevalence below the saturation point gives no extra novelty past the cap.
    expect(attractiveness(opt('pottery', { prevalence: 0 })).novelty).toBeCloseTo(attractiveness(opt('pottery', { prevalence: 1e-6 })).novelty, 4);
  });
  it('low diversity with full coverage creates no shortage, only lower diversity utility', () => {
    const one = diversityIndex([100]), four = diversityIndex([25, 25, 25, 25]);
    expect(one.index).toBe(0); expect(four.index).toBeCloseTo(1);
    const acc = cityAccounts({ city: 'c', valueAdded: 1000, householdTaxRate: 0, needs: [{ good: 'g', qty: 100, localPrice: 1, basePrice: 1, consumed: 100 }], discretionaryWish: 0, basketConsumption: { staple_food: [100] } });
    expect(acc.physical_need_coverage).toBe(1);
  });
  it('low purchasing power shows an affordability gap; discretionary collapses first, physical need unchanged', () => {
    const acc = cityAccounts({ city: 'c', valueAdded: 20, householdTaxRate: 0.1, needs: [{ good: 'g', qty: 100, localPrice: 1, basePrice: 1, consumed: 100 }], discretionaryWish: 50, basketConsumption: {} });
    expect(acc.affordability_gap).toBeGreaterThan(0);
    expect(acc.discretionary_funded).toBe(0);
    expect(acc.physical_need_coverage).toBe(1);
    // In the solver the discretionary channel is scaled, the need channel is not.
    const s = base(); s.budget = { a: { discretionary_ratio: 0, affordability: 0, discretionary_budget: 0 }, b: { discretionary_ratio: 0, affordability: 0, discretionary_budget: 0 } };
    const poor = resolveGoodsEconomy(s), rich = resolveGoodsEconomy(base());
    const need = (r: typeof poor) => r.demand.reduce((t, d) => t + d.channels.household_need, 0);
    const disc = (r: typeof poor) => r.demand.reduce((t, d) => t + d.channels.household_discretionary, 0);
    expect(need(poor)).toBeCloseTo(need(rich), 6);
    expect(disc(poor)).toBe(0);
  });
  it('higher GDP does not imply higher real purchasing power under high prices and taxes', () => {
    const rich = cityAccounts({ city: 'r', valueAdded: 200, householdTaxRate: 0.5, needs: [{ good: 'g', qty: 50, localPrice: 3, basePrice: 1, consumed: 50 }], discretionaryWish: 0, basketConsumption: {} });
    const modest = cityAccounts({ city: 'm', valueAdded: 120, householdTaxRate: 0.05, needs: [{ good: 'g', qty: 50, localPrice: 1, basePrice: 1, consumed: 50 }], discretionaryWish: 0, basketConsumption: {} });
    expect(rich.city_gdp).toBeGreaterThan(modest.city_gdp);
    expect(rich.real_purchasing_power).toBeLessThan(modest.real_purchasing_power);
  });
  it('AUTO production never prefers a loss-making famous good', () => {
    const w = autoRecipeWeights([{ key: 'famous', margin: -5, unmetDemand: 100, inputsAvailable: true }, { key: 'plain', margin: 2, unmetDemand: 10, inputsAvailable: true }]);
    expect(w.famous).toBe(0); expect(w.plain).toBe(1);
  });
  it('demand split keeps provenance and physical need total identical across preference changes', () => {
    const a = resolveGoodsEconomy(base()), s = base(); s.familiarity = { b: { raw_grain: 1 } };
    const b = resolveGoodsEconomy(s);
    const need = (r: typeof a) => r.demand.filter(d => d.city === 'b').reduce((t, d) => t + d.channels.household_need, 0);
    expect(need(b)).toBeCloseTo(need(a), 6);
  });
  it('local inflation is NOT cancelled: 2x local prices at the same GDP/taxes/qty lower real PP and affordability', () => {
    const needs = (localPrice: number) => [{ good: 'g', qty: 100, localPrice, basePrice: 1, consumed: 100 }];
    const calm = cityAccounts({ city: 'c', valueAdded: 100, householdTaxRate: 0.1, needs: needs(1), discretionaryWish: 0, basketConsumption: {} });
    const dear = cityAccounts({ city: 'c', valueAdded: 100, householdTaxRate: 0.1, needs: needs(2), discretionaryWish: 0, basketConsumption: {} });
    expect(dear.purchasing_power).toBeCloseTo(calm.purchasing_power, 9); // income not indexed to local CPI
    expect(dear.real_purchasing_power).toBeLessThan(calm.real_purchasing_power);
    expect(dear.affordability).toBeLessThan(calm.affordability);
    expect(dear.affordability_gap).toBeGreaterThan(calm.affordability_gap);
    expect(dear.price_index).toBeCloseTo(2, 9);
  });
  it('a city producing its own basic basket can afford it (calibration floor)', () => {
    const acc = cityAccounts({ city: 'c', valueAdded: 100, householdTaxRate: 0.1, needs: [{ good: 'g', qty: 100, localPrice: 1, basePrice: 1, consumed: 100 }], discretionaryWish: 0, basketConsumption: {} });
    expect(acc.affordability).toBeGreaterThan(0.6);
    expect(acc.affordability_gap).toBeLessThan(acc.basic_basket_cost * 0.4);
  });
});
