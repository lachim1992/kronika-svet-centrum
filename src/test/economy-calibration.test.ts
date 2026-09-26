import { describe, it, expect } from 'vitest';
import { resolveGoodsEconomy, type Good, type City, type Producer, type Snapshot, type Fame } from '../../supabase/functions/_shared/goodsEconomy';
import { PRODUCT_MARKET, calibrateIncomeUnitFactor, attractiveness, demandShares, recipeMargin, autoRecipeWeights, PRODUCT_META } from '../../supabase/functions/_shared/productMarket';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';
import { LAB_SCENARIOS, labCity, REFERENCE_BASKET_VALUE } from './economyLab';

const L = 1 / ECONOMY.workersPerLaborUnit;
const good = (key: string, basket: string, price = 10, stage = 'final'): Good => ({ key, basket, price, stage, storable: true, bulk: 1, density: 30, perishability: 0, storageLoss: 0, storageCost: 0, substitutability: 1, strategic: 0, prestige: 0, transshipment: 0, finalUse: stage !== 'intermediate' });
const city = (id: string, x: number, pop = 1000): City => ({ id, owner: 'p', name: id, cell: `${x},0`, population: pop, classes: { peasants: pop * 0.8, burghers: pop * 0.2 }, soldiers: 0, stability: 1, irrigation: 0, labor: {}, market: 2, storage: 10, admin: 0, security: 1, guild: 0, ideology: 'open_merchant', coastal: false });
const prod = (id: string, c: string, g: string, cap = 10, inputs: { good: string; qty: number }[] = []): Producer => ({ id, city: c, channel: 'node', capacity: cap, jobs: cap, recipe: { key: id, good: g, qty: 1, inputs, labor: L, quality: 0, minQuality: 0 }, allocation: 1, staffing: 1, logistics: 1, mastery: 1, source: inputs.length === 0, distinctive: false });
const base = (): Snapshot => ({ turn: 2, cities: [city('a', 0), city('b', 1)], goods: [good('raw_grain', 'staple_food', 2), good('baked_staples', 'staple_food', 4), good('flour', 'staple_food', 3, 'intermediate'), good('pottery', 'variety', 8)],
  producers: [prod('grain', 'a', 'raw_grain', 30), prod('flour', 'b', 'flour', 10, [{ good: 'raw_grain', qty: 1 }]), prod('bread', 'b', 'baked_staples', 10, [{ good: 'flour', qty: 1 }]), prod('pots', 'a', 'pottery', 5)],
  edges: [{ id: 'r', from: '0,0', to: '1,0', cost: 1, capacity: 200, mode: 'road', risk: 0, toll: 0, border: 0 }], opening: [], fame: [] });

/** Pottery made in 'a' only; 'b' wants it. Road cost controls how marginal the export is. */
const potteryTrade = (cost: number, fame = 0): Snapshot => {
  const s = base(); s.edges = [{ ...s.edges[0], cost }];
  s.producers = s.producers.map(p => p.id === 'pots' ? { ...p, capacity: 40, jobs: 40 } : p);
  if (fame > 0) s.fame = [{ city: 'a', good: 'pottery', name: 'Keramika z A', streak: 5, fame, quality: 2, created: 1, turn: 1 } as Fame];
  return s;
};
const potteryFlow = (s: Snapshot) => resolveGoodsEconomy(s).flows.filter(f => f.good === 'pottery' && f.destination === 'b');

describe('A — fame acts on destination WTP only', () => {
  it('fame=0 behaves exactly like no fame record', () => {
    const none = potteryTrade(1), zero = potteryTrade(1);
    zero.fame = [{ city: 'a', good: 'pottery', name: 'x', streak: 0, fame: 0, quality: 0, created: 1, turn: 1 } as Fame];
    expect(JSON.stringify(resolveGoodsEconomy(zero).flows)).toBe(JSON.stringify(resolveGoodsEconomy(none).flows));
  });
  it('source acquisition cost never rises with fame; gross value is the realised WTP', () => {
    const plain = potteryFlow(potteryTrade(1)), famed = potteryFlow(potteryTrade(1, 100));
    expect(plain.length && famed.length).toBeTruthy();
    expect(famed[0].source_price).toBeCloseTo(plain[0].source_price, 9);
    expect(famed[0].destination_wtp!).toBeGreaterThan(plain[0].destination_wtp!);
    for (const f of famed) expect(f.gross_value).toBeCloseTo(f.delivered * f.destination_wtp!, 6);
  });
  it('higher fame opens an otherwise marginal export; a costlier route closes it again', () => {
    let marginal = 0;
    for (let c = 1; c < 60; c += 0.5) if (!potteryFlow(potteryTrade(c)).length) { marginal = c; break; }
    expect(marginal).toBeGreaterThan(0);
    expect(potteryFlow(potteryTrade(marginal, 100)).length).toBeGreaterThan(0);
    expect(potteryFlow(potteryTrade(marginal * 4, 100)).length).toBe(0);
  });
  it('production inputs pay no consumer fame premium', () => {
    const s = base(); s.fame = [{ city: 'a', good: 'raw_grain', name: 'x', streak: 5, fame: 100, quality: 2, created: 1, turn: 1 } as Fame];
    for (const f of resolveGoodsEconomy(s).flows.filter(f => f.reason === 'production_input'))
      expect(f.destination_wtp!).toBeLessThanOrEqual(f.destination_price + 1e-9);
  });
  it('gross trade never becomes GDP', () => {
    const r = resolveGoodsEconomy(potteryTrade(1, 100));
    const va = r.balances.reduce((s, b) => s + b.gross_output_value - b.intermediate_value, 0) + r.metrics.reduce((s, m) => s + m.trade_services.service_value_added, 0);
    expect(r.cityAccounts.reduce((s, a) => s + a.city_gdp, 0)).toBeCloseTo(va, 6);
  });
});

describe('B — global income unit calibration', () => {
  it('is derived from the documented reference relation, global and CPI-independent', () => {
    const hs = PRODUCT_MARKET.laborShare + (1 - PRODUCT_MARKET.laborShare) * PRODUCT_MARKET.localCapitalShare;
    expect(PRODUCT_MARKET.incomeUnitFactor).toBeCloseTo(1 / (hs * (1 - PRODUCT_MARKET.defaultHouseholdTaxRate) * PRODUCT_MARKET.propensityToConsume), 12);
    expect(calibrateIncomeUnitFactor()).toBe(PRODUCT_MARKET.incomeUnitFactor);
    expect(labCity({ id: 'x', valueAdded: 100, priceMultiple: 3 }).income_unit_factor).toBe(labCity({ id: 'y', valueAdded: 100 }).income_unit_factor);
  });
  it('EconomyLab scenarios behave as economic intuition requires', () => {
    const bal = LAB_SCENARIOS.balanced(), sc = LAB_SCENARIOS.scarcity(), ex = LAB_SCENARIOS.productiveExport(), ht = LAB_SCENARIOS.highTaxExpensive();
    expect(bal.affordability).toBeCloseTo(1, 6);
    expect(bal.purchasing_power).toBeCloseTo(bal.basic_basket_cost, 6);
    expect(sc.city_gdp).toBe(bal.city_gdp);
    expect(sc.affordability).toBeLessThan(bal.affordability);
    expect(sc.real_purchasing_power).toBeLessThan(bal.real_purchasing_power);
    expect(ex.real_purchasing_power).toBeGreaterThan(bal.real_purchasing_power);
    expect(ex.discretionary_budget).toBeGreaterThan(0);
    expect(ht.city_gdp).toBeGreaterThan(bal.city_gdp);
    expect(ht.real_purchasing_power).toBeLessThan(bal.real_purchasing_power);
  });
});

describe('B4 — sanity ranges and invariants', () => {
  const all = [...Object.values(LAB_SCENARIOS).map(f => f()), ...resolveGoodsEconomy(base()).cityAccounts];
  it('keeps every account in its sane range', () => {
    for (const a of all) {
      expect(a.physical_need_coverage).toBeGreaterThanOrEqual(0); expect(a.physical_need_coverage).toBeLessThanOrEqual(1);
      expect(a.affordability).toBeGreaterThanOrEqual(0); expect(a.affordability).toBeLessThanOrEqual(1);
      expect(a.real_purchasing_power).toBeGreaterThanOrEqual(0);
      expect(a.discretionary_budget).toBeGreaterThanOrEqual(0);
      expect(a.city_gdp).toBeGreaterThanOrEqual(0);
      expect(a.discretionary_funded).toBeLessThanOrEqual(a.discretionary_budget + 1e-9);
    }
  });
  it('prices, income and tax move PP in the right direction', () => {
    const v = REFERENCE_BASKET_VALUE * 1.2;
    const calm = labCity({ id: 'c', valueAdded: v }), dear = labCity({ id: 'c', valueAdded: v, priceMultiple: 2 });
    expect(dear.real_purchasing_power).toBeLessThan(calm.real_purchasing_power);
    expect(dear.affordability).toBeLessThan(calm.affordability);
    const poorer = labCity({ id: 'c', valueAdded: v * 0.7 });
    expect(calm.purchasing_power).toBeGreaterThan(poorer.purchasing_power);
    expect(calm.affordability).toBeGreaterThanOrEqual(poorer.affordability);
    const taxed = labCity({ id: 'c', valueAdded: v, taxRate: 0.4 });
    expect(taxed.disposable_income).toBeLessThan(calm.disposable_income);
    expect(taxed.purchasing_power).toBeLessThan(calm.purchasing_power);
  });
  it('poverty never changes need demand; discretionary spend stays within budget', () => {
    const s = base(); s.budget = { a: { discretionary_ratio: 0, affordability: 0, discretionary_budget: 0 }, b: { discretionary_ratio: 0, affordability: 0, discretionary_budget: 0 } };
    const poor = resolveGoodsEconomy(s), rich = resolveGoodsEconomy(base());
    const need = (r: typeof poor) => r.demand.reduce((t, d) => t + d.channels.household_need, 0);
    expect(need(poor)).toBeCloseTo(need(rich), 9);
    for (const a of poor.cityAccounts) expect(a.discretionary_cap?.funded_spend ?? 0).toBeLessThanOrEqual(1e-9);
  });
  it('repeated derived recompute is identical (refresh idempotence)', () => {
    expect(JSON.stringify(resolveGoodsEconomy(base()))).toBe(JSON.stringify(resolveGoodsEconomy(base())));
  });
});

describe('B5 — elasticity / behaviour', () => {
  const opt = (good: string, extra: Record<string, unknown> = {}) => ({ good, basket: 'staple_food', referencePrice: 4, basketAveragePrice: 4, quality: 0, fame: 0, familiarity: 0, prevalence: 0.5, coastal: false, affordability: 1, substitutability: 1, ...extra });
  it('a higher previous committed price lowers the product share', () => {
    const cheap = demandShares([opt('baked_staples'), opt('raw_grain')]), dear = demandShares([opt('baked_staples', { referencePrice: 6 }), opt('raw_grain')]);
    expect(dear[0].share).toBeLessThan(cheap[0].share);
  });
  it('fame raises attractiveness but neither source cost nor household budget', () => {
    expect(attractiveness(opt('baked_staples', { fame: 100 })).total).toBeGreaterThan(attractiveness(opt('baked_staples')).total);
    const a = labCity({ id: 'c', valueAdded: 150 }), b = labCity({ id: 'c', valueAdded: 150, discretionaryWish: 1e6 });
    expect(b.discretionary_budget).toBe(a.discretionary_budget);
  });
  it('dearer inputs cut producer margin', () => {
    expect(recipeMargin(10, 5, [{ qty: 10, price: 4 }]).margin).toBeLessThan(recipeMargin(10, 5, [{ qty: 10, price: 2 }]).margin);
  });
  it('AUTO stops a non-essential loss maker; an essential one is flagged emergency', () => {
    const r = autoRecipeWeights([{ key: 'lux', margin: -1, unmetDemand: 10, inputsAvailable: true }, { key: 'ok', margin: 1, unmetDemand: 5, inputsAvailable: true }]) as any;
    expect(r.lux ?? r.weights?.lux).toBe(0);
    const e = autoRecipeWeights([{ key: 'bread', margin: -1, unmetDemand: 10, inputsAvailable: true, essential: true, necessity: 1 } as any]) as any;
    expect(e.flags?.bread ?? e.__flags?.bread).toBe('emergency_unprofitable_production');
  });
  it('diversity inside a subbasket does not change survival need', () => {
    const s = base(); s.familiarity = { b: { raw_grain: 1 } };
    const need = (r: ReturnType<typeof resolveGoodsEconomy>) => r.demand.reduce((t, d) => t + d.channels.household_need, 0);
    expect(need(resolveGoodsEconomy(s))).toBeCloseTo(need(resolveGoodsEconomy(base())), 9);
  });
  it('adding an identical product variant does not enlarge its subbasket share', () => {
    (PRODUCT_META as any).bread_twin = { ...PRODUCT_META.baked_staples };
    const one = demandShares([opt('baked_staples'), opt('raw_grain')]), two = demandShares([opt('baked_staples'), opt('bread_twin'), opt('raw_grain')]);
    expect(two[0].subbasket_share).toBeCloseTo(one[0].subbasket_share, 9);
    delete (PRODUCT_META as any).bread_twin;
  });
});
