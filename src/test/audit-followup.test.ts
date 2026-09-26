import { describe, it, expect } from 'vitest';
import { resolveGoodsEconomy, type Good, type City, type Producer, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { demandShares, cityAccounts, autoAllocation, autoAllocationDetail, recipeMargin, substitutionEfficiency, functionalValue, discretionaryBudgetScale, PRODUCT_META, PRODUCT_MARKET } from '../../supabase/functions/_shared/productMarket';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';

const L = 1 / ECONOMY.workersPerLaborUnit;
const good = (key: string, basket: string, price = 10, stage = 'final'): Good => ({ key, basket, price, stage, storable: true, bulk: 1, density: 30, perishability: 0, storageLoss: 0, storageCost: 0, substitutability: 1, strategic: 0, prestige: 0, transshipment: 0, finalUse: stage !== 'intermediate' });
const city = (id: string, x: number, pop = 1000): City => ({ id, owner: 'p', name: id, cell: `${x},0`, population: pop, classes: { peasants: pop * 0.8, burghers: pop * 0.2 }, soldiers: 0, stability: 1, irrigation: 0, labor: {}, market: 2, storage: 10, admin: 0, security: 1, guild: 0, ideology: 'open_merchant', coastal: false });
const prod = (id: string, c: string, g: string, cap = 10, inputs: { good: string; qty: number }[] = []): Producer => ({ id, city: c, channel: 'node', capacity: cap, jobs: cap, recipe: { key: id, good: g, qty: 1, inputs, labor: L, quality: 0, minQuality: 0 }, allocation: 1, staffing: 1, logistics: 1, mastery: 1, source: inputs.length === 0, distinctive: false });
const opt = (good: string, extra: any = {}) => ({ good, basket: 'staple_food', referencePrice: 4, basketAveragePrice: 4, quality: 0, fame: 0, familiarity: 0, prevalence: 0.5, coastal: false, affordability: 1, substitutability: 1, ...extra });
const base = (): Snapshot => ({ turn: 2, cities: [city('a', 0), city('b', 1)], goods: [good('raw_grain', 'staple_food', 2), good('baked_staples', 'staple_food', 4), good('pottery', 'variety', 8)],
  producers: [prod('grain', 'a', 'raw_grain', 30), prod('bread', 'b', 'baked_staples', 10), prod('pots', 'a', 'pottery', 5)],
  edges: [{ id: 'r', from: '0,0', to: '1,0', cost: 1, capacity: 200, mode: 'road', risk: 0, toll: 0, border: 0 }], opening: [], fame: [] });

describe('1. purchasing power is not indexed to local CPI', () => {
  it('2x local prices at same GDP/taxes/qty → lower real PP & affordability, larger gap', () => {
    const mk = (p: number) => cityAccounts({ city: 'c', valueAdded: 150, householdTaxRate: 0.1, needs: [{ good: 'g', qty: 100, localPrice: p, basePrice: 1, consumed: 100 }], discretionaryWish: 0, basketConsumption: {} });
    const a = mk(1), b = mk(2);
    expect(b.real_purchasing_power).toBeLessThan(a.real_purchasing_power);
    expect(b.affordability).toBeLessThan(a.affordability);
    expect(b.affordability_gap).toBeGreaterThan(a.affordability_gap);
    expect(b.labor_income).toBeCloseTo(a.labor_income, 9);
  });
});

describe('2. subbasket is a functional layer', () => {
  it('shares sum to 1 and identical variants do not enlarge their subbasket', () => {
    const one = demandShares([opt('baked_staples'), opt('raw_grain')]);
    PRODUCT_META.bread_v1 = { ...PRODUCT_META.baked_staples }; PRODUCT_META.bread_v2 = { ...PRODUCT_META.baked_staples };
    const many = demandShares([opt('baked_staples'), opt('bread_v1'), opt('bread_v2'), opt('raw_grain')]);
    delete PRODUCT_META.bread_v1; delete PRODUCT_META.bread_v2;
    expect(many.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 12);
    const breadOne = one.filter(r => r.subbasket === 'bread').reduce((s, r) => s + r.share, 0);
    const breadMany = many.filter(r => r.subbasket === 'bread').reduce((s, r) => s + r.share, 0);
    expect(breadMany).toBeCloseTo(breadOne, 12);
    expect(many.find(r => r.good === 'bread_v1')!.within_subbasket_share).toBeCloseTo(1 / 3, 12);
  });
});

describe('3. functional value', () => {
  it('product with functional_value 0.5 covers half the need per unit', () => {
    PRODUCT_META.half = { ...PRODUCT_META.raw_grain, functional_value: 0.5 };
    const g = { key: 'raw_grain', basket: 'staple_food', substitutability: 1 }, h = { key: 'half', basket: 'staple_food', substitutability: 1 };
    expect(functionalValue('half', 'staple_food')).toBe(0.5);
    expect(substitutionEfficiency(g, h)).toBeCloseTo(0.5, 12);
    expect(substitutionEfficiency(h, g)).toBeCloseTo(2, 12);
    delete PRODUCT_META.half;
  });
  it('seed with value 1 keeps the physical balance unchanged (demand = functional need)', () => {
    const r = resolveGoodsEconomy(base());
    for (const d of r.demand) expect(d.total).toBeCloseTo(r.balances.find(b => b.city === d.city && b.good === d.good)!.demand, 6);
  });
});

describe('4. choice uses previous committed prices', () => {
  it('dearer product last committed turn gets a lower share; refresh twice identical', () => {
    const s = base(), t = base();
    t.priorPrices = { 'b::baked_staples': 12, 'b::raw_grain': 2 };
    s.priorPrices = { 'b::baked_staples': 4, 'b::raw_grain': 2 };
    const share = (r: any) => r.productChoice.find((c: any) => c.city === 'b' && c.good === 'baked_staples').share;
    expect(share(resolveGoodsEconomy(t))).toBeLessThan(share(resolveGoodsEconomy(s)));
    expect(JSON.stringify(resolveGoodsEconomy(t))).toBe(JSON.stringify(resolveGoodsEconomy(t)));
  });
});

describe('5. hard discretionary + fame budget cap', () => {
  it('scale factor never lets planned spend exceed the budget', () => {
    for (const [plan, cap] of [[1e9, 5], [10, 100], [0, 0]]) {
      const d = discretionaryBudgetScale(plan, cap); expect(plan * d.scale).toBeLessThanOrEqual(cap + 1e-9);
    }
    expect(discretionaryBudgetScale(100, undefined).mode).toBe('bootstrap_unconstrained');
  });
  it('extreme fame/luxury stays within budget and need demand is unchanged', () => {
    const mk = (budget?: number) => { const s = base();
      s.fame = [{ city: 'a', good: 'pottery', name: 'x', streak: 9, fame: 100, quality: 3, created: 1, turn: 1 }];
      if (budget != null) s.budget = { a: { discretionary_ratio: 1, affordability: 1, discretionary_budget: budget }, b: { discretionary_ratio: 1, affordability: 1, discretionary_budget: budget } };
      return resolveGoodsEconomy(s); };
    const free = mk(), tight = mk(3);
    for (const a of tight.cityAccounts as any[]) expect(a.discretionary_cap.funded_spend).toBeLessThanOrEqual(3 + 1e-9);
    const need = (r: any) => r.demand.reduce((t: number, d: any) => t + d.channels.household_need, 0);
    expect(need(tight)).toBeCloseTo(need(free), 9);
  });
});

describe('6. AUTO never runs non-essential goods at a loss', () => {
  it('single negative-margin luxury → 0; critical food may run at a flagged emergency floor', () => {
    expect(autoAllocation([{ key: 'lux', necessity: 1, marginRatio: -0.2 }]).lux).toBe(0);
    const d = autoAllocationDetail([{ key: 'food', necessity: 1, marginRatio: -0.2, essential: true }]);
    expect(d.weights.food).toBe(PRODUCT_MARKET.autoEmergencyFloor);
    expect(d.flags.food).toBe('emergency_unprofitable_production');
    // A profitable option removes the emergency floor even for essentials.
    expect(autoAllocation([{ key: 'food', necessity: 1, marginRatio: -0.2, essential: true }, { key: 'b', necessity: 1, marginRatio: 0.1 }]).food).toBe(0);
  });
});

describe('7. origin-specific fame WTP in trade', () => {
  it('higher fame can make an export tradable on the same route; dearer inputs still cut producer margin', () => {
    const mk = (fame: number) => { const s = base(); s.producers.push(prod('pots_b', 'b', 'pottery', 5));
      if (fame > 0) s.fame = [{ city: 'a', good: 'pottery', name: 'x', streak: 9, fame, quality: 0, created: 1, turn: 1 }];
      return resolveGoodsEconomy(s).flows.filter(f => f.source === 'a' && f.destination === 'b' && f.good === 'pottery').reduce((t, f) => t + f.delivered, 0); };
    expect(mk(100)).toBeGreaterThan(mk(0));
    expect(recipeMargin(10, 8, [{ qty: 10, price: 5 }]).margin).toBeLessThan(recipeMargin(10, 8, [{ qty: 10, price: 2 }]).margin);
  });
});
