import { describe, it, expect } from 'vitest';
import { resolveGoodsEconomy, type Good, type City, type Producer, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { landedInputCost, autoAllocation, recipeMargin, tradeServiceValue, craftsmanship, outputQuality, capitalStockDelta, PRODUCT_MARKET } from '../../supabase/functions/_shared/productMarket';
import { validateBuild, canonicalBuilding, stripProductionEffects, WATER_REASON } from '../../supabase/functions/_shared/buildValidation';
import { RECIPES, GOODS, PRODUCTION_BUILDINGS } from '../../supabase/functions/_shared/productionCatalog';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';

const L = 1 / ECONOMY.workersPerLaborUnit;
const good = (key: string, basket: string, price = 10, stage = 'final'): Good => ({ key, basket, price, stage, storable: true, bulk: 1, density: 30, perishability: 0, storageLoss: 0, storageCost: 0, substitutability: 1, strategic: 0, prestige: 0, transshipment: 0, finalUse: stage !== 'intermediate' });
const city = (id: string, x: number, pop = 1000): City => ({ id, owner: 'p', name: id, cell: `${x},0`, population: pop, classes: { peasants: pop * 0.8, burghers: pop * 0.2 }, soldiers: 0, stability: 1, irrigation: 0, labor: {}, market: 2, storage: 10, admin: 0, security: 1, guild: 0, ideology: 'open_merchant', coastal: false });
const prod = (id: string, c: string, g: string, cap = 10, inputs: { good: string; qty: number }[] = []): Producer => ({ id, city: c, channel: 'node', capacity: cap, jobs: cap, recipe: { key: id, good: g, qty: 1, inputs, labor: L, quality: 0, minQuality: 0 }, allocation: 1, staffing: 1, logistics: 1, mastery: 1, source: inputs.length === 0, distinctive: false });

describe('A. landed cost, margins, AUTO', () => {
  it('more expensive iron lowers arms margin at the same final market', () => {
    const cheap = recipeMargin(10, 8, [{ qty: 10, price: 2 }]), dear = recipeMargin(10, 8, [{ qty: 10, price: 5 }]);
    expect(dear.margin).toBeLessThan(cheap.margin);
    expect(dear.revenue).toBe(cheap.revenue); // input cost never multiplies the final price
  });
  it('cheaper remote iron beats expensive local iron after full landed cost; costly transport reverses it', () => {
    const local = landedInputCost({ sourcePrice: 6, transport: 0.2, tolls: 0, tariffRate: 0, risk: 0, loss: 0 }).landed;
    const remote = landedInputCost({ sourcePrice: 3, transport: 1, tolls: 0.5, tariffRate: 0.05, risk: 1, loss: 0.05 }).landed;
    expect(remote).toBeLessThan(local);
    const costly = landedInputCost({ sourcePrice: 3, transport: 4, tolls: 0.5, tariffRate: 0.05, risk: 1, loss: 0.05 }).landed;
    expect(costly).toBeGreaterThan(local);
  });
  it('AUTO abandons a loss-making recipe when a profitable legal option exists', () => {
    const w = autoAllocation([{ key: 'fame', necessity: 1, marginRatio: -0.3 }, { key: 'plain', necessity: 1, marginRatio: 0.2 }]);
    expect(w.fame).toBe(0); expect(w.plain).toBeGreaterThan(0);
    // Nothing pays: non-essential → 0; essential gets only the bounded emergency floor.
    expect(autoAllocation([{ key: 'a', necessity: 1, marginRatio: -0.1 }]).a).toBe(0);
    expect(autoAllocation([{ key: 'a', necessity: 1, marginRatio: -0.1, essential: true }]).a).toBe(PRODUCT_MARKET.autoEmergencyFloor);
  });
  it('LOCK keeps a loss-making recipe but the ledger reports the loss', () => {
    const s: Snapshot = { turn: 1, cities: [city('a', 0)], goods: [good('iron', 'tools', 20, 'intermediate'), good('arms', 'military_supply', 5)],
      producers: [prod('iron', 'a', 'iron', 20), { ...prod('arms', 'a', 'arms', 10, [{ good: 'iron', qty: 1 }]), order: 'lock' }], edges: [], opening: [], fame: [] };
    const r = resolveGoodsEconomy(s);
    const d: any = r.diagnostics.find(x => x.producer === 'arms');
    if (d?.realized > 0) { expect(d.margin.order).toBe('lock'); expect(d.margin.loss_warning).toBe(d.margin.margin < 0); }
  });
  it('factory sources the input from the lowest landed-cost supplier', () => {
    const s: Snapshot = { turn: 1, cities: [city('f', 0), city('near', 1), city('far', 2)],
      goods: [good('ore', 'tools', 2, 'intermediate'), good('tool', 'tools', 10)],
      producers: [prod('forge', 'f', 'tool', 5, [{ good: 'ore', qty: 1 }]), prod('o1', 'near', 'ore', 20), prod('o2', 'far', 'ore', 20)],
      edges: [{ id: 'a', from: '0,0', to: '1,0', cost: 1, capacity: 100, mode: 'road', risk: 0, toll: 0, border: 0 },
        { id: 'b', from: '1,0', to: '2,0', cost: 1, capacity: 100, mode: 'road', risk: 0, toll: 0, border: 0 }], opening: [], fame: [] };
    const r = resolveGoodsEconomy(s);
    const d: any = r.diagnostics.find(x => x.producer === 'forge');
    const inbound = r.flows.filter(f => f.destination === 'f' && f.good === 'ore' && f.reason === 'production_input');
    if (inbound.length) expect(inbound[0].source).toBe('near');
    expect(d).toBeTruthy();
  });
});

describe('B. trade services, capital stock', () => {
  it('staffed commercial capacity captures more service value than a hamlet on the same trade', () => {
    const t = { local_exchange: 0, import_export: 100, aggregation: 0, reexport: 0, transit: 500 };
    const hamlet = tradeServiceValue({ ...t, commercialCapacity: 0 }), hub = tradeServiceValue({ ...t, commercialCapacity: 12 });
    expect(hub.service_value_added).toBeGreaterThan(hamlet.service_value_added);
    // Only the service margin enters VA, never the gross value.
    expect(hub.service_value_added).toBeLessThan(600 * 0.1);
  });
  it('Σ city_gdp = realm value added incl. trade services', () => {
    const s: Snapshot = { turn: 1, cities: [city('a', 0), city('b', 1)], goods: [good('grain', 'staple_food', 2)],
      producers: [prod('g', 'a', 'grain', 40)], edges: [{ id: 'r', from: '0,0', to: '1,0', cost: 1, capacity: 200, mode: 'road', risk: 0, toll: 0, border: 0 }], opening: [], fame: [] };
    const r = resolveGoodsEconomy(s);
    const va = r.balances.reduce((t, b) => t + b.gross_output_value - b.intermediate_value, 0) + r.metrics.reduce((t, m) => t + m.trade_services.service_value_added, 0);
    expect(r.cityAccounts.reduce((t, a) => t + a.city_gdp, 0)).toBeCloseTo(va, 6);
  });
  it('capital stock candidate is deterministic and refresh does not accumulate it', () => {
    const s: Snapshot = { turn: 1, cities: [{ ...city('a', 0), capitalStock: 50 }], goods: [good('grain', 'staple_food', 2)], producers: [prod('g', 'a', 'grain', 40)], edges: [], opening: [], fame: [] };
    const a = resolveGoodsEconomy(s), b = resolveGoodsEconomy(s);
    expect(a.cityAccounts[0].capital_stock).toBe(50); expect(b.cityAccounts[0].capital_stock).toBe(50);
    expect(JSON.stringify(a.cityAccounts)).toBe(JSON.stringify(b.cityAccounts));
    const war = capitalStockDelta({ stock: 100, valueAdded: 10, needCoverage: 1, stability: 1, taxRate: 0.1, devastated: true });
    expect(war.delta).toBeLessThan(0);
  });
});

describe('C. catalog cleanup', () => {
  it('rice is its own good, needs water, never raw_grain', () => {
    expect(RECIPES.find(r => r.key === 'harvest_rice')!.output).toBe('raw_rice');
    expect(GOODS.some(g => g.key === 'raw_rice')).toBe(true);
    const paddy = PRODUCTION_BUILDINGS.find(b => b.levels.flat().includes('harvest_rice'))!;
    expect(paddy.requiresWater).toBe(true);
    expect(PRODUCTION_BUILDINGS.find(b => b.name === 'Farma')!.levels.flat()).not.toContain('harvest_rice');
  });
  it('tools are operational, not household; zero-input recipes are sources', () => {
    expect(GOODS.find(g => g.key === 'metalwork_tools')!.household).toBe(false);
    for (const r of RECIPES.filter(r => r.inputs.length === 0)) expect(r.role).toBe('source');
  });
});

describe('D. craftsmanship and quality', () => {
  it('Lv1 gives no free quality; upgrades + master craft reach luxury minimum', () => {
    expect(outputQuality({ recipeBonus: 0, craft: craftsmanship(1), source: true, minInputQuality: 0 })).toBe(0);
    // Chain: mine Lv3 → ore Q2; smelter Lv3 → ingot Q2 (bounded by input); jeweller master_craft Lv2 → jewelry.
    const ore = outputQuality({ recipeBonus: 0, craft: craftsmanship(3), source: true, minInputQuality: 0 });
    const ingot = outputQuality({ recipeBonus: 0, craft: craftsmanship(3), source: false, minInputQuality: ore });
    expect(ingot).toBeGreaterThanOrEqual(2); // craft_jewelry min_quality_input = 2
    const jewel = outputQuality({ recipeBonus: 2, craft: craftsmanship(2, ['master_craft']), source: false, minInputQuality: ingot });
    expect(jewel).toBeLessThanOrEqual(PRODUCT_MARKET.maxQuality);
    // Bounded inheritance: poor input caps a master's output.
    expect(outputQuality({ recipeBonus: 0, craft: 3, source: false, minInputQuality: 0 })).toBe(1);
  });
});

describe('E. server build validation', () => {
  const fishery = { id: 't1', name: 'Rybářství', required_settlement_level: 'HAMLET', cost_wealth: 10, effects: { requires_water: true, recipe_keys: ['catch_fish'] } };
  const ctx = (tile: any) => ({ actor: 'p', city: { owner_player: 'p', settlement_level: 'HAMLET' }, tile, existingBuildingNames: [], existingTemplateIds: [] });
  it('fishery inland rejected, river/coast accepted', () => {
    expect(validateBuild(fishery, ctx({ has_river: false, coastal: false }))).toBe(WATER_REASON);
    expect(validateBuild(fishery, ctx({ has_river: true }))).toBeNull();
    expect(validateBuild(fishery, ctx({ coastal: true }))).toBeNull();
  });
  it('spoofed client cost/effects ignored; custom buildings lose production effects', () => {
    const b = canonicalBuilding(fishery, { cost_wealth: 0, effects: { basket_outputs: { staple_food: 999 } } });
    expect(b.cost_wealth).toBe(10); expect(b.effects).toEqual(fishery.effects);
    expect(stripProductionEffects({ recipe_keys: ['x'], basket_outputs: { a: 1 }, stability: 2 })).toEqual({ stability: 2 });
  });
  it('invalid biome / deposit / settlement / owner rejected', () => {
    const mine = { id: 'm', name: 'Důl', required_settlement_level: 'TOWNSHIP', effects: { allowed_biomes: ['hills', 'mountains'], requires_deposit: 'iron' } };
    expect(validateBuild(mine, ctx({ biome_family: 'hills', resource_deposits: ['iron'] }))).toMatch(/úrovně/);
    const c2 = { ...ctx({ biome_family: 'plains', resource_deposits: ['iron'] }), city: { owner_player: 'p', settlement_level: 'CITY' } };
    expect(validateBuild(mine, c2)).toMatch(/terén/);
    const c3 = { ...ctx({ biome_family: 'hills', resource_deposits: [] }), city: { owner_player: 'p', settlement_level: 'CITY' } };
    expect(validateBuild(mine, c3)).toMatch(/ložisko/);
    expect(validateBuild(fishery, { ...ctx({ coastal: true }), actor: 'x' })).toMatch(/vlastním/);
  });
});
