import { describe, it, expect } from 'vitest';
import { computeCanonicalEconomy, normalizeStructureRoles } from '../../supabase/functions/_shared/economyAdapter';
import { resolveGoodsEconomy, type Good, type City, type Producer, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { validateBuild, canonicalSettlementLevel, settlementRank } from '../../supabase/functions/_shared/buildValidation';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';

/** Minimal in-memory stand-in for the Supabase client used by computeCanonicalEconomy. */
function fakeSb(tables: Record<string, any[]>) {
  const saved: Record<string, any> = {};
  const from = (table: string) => {
    const f: [string, string, any][] = []; let lim = Infinity, lo = 0, hi = Infinity;
    const data = () => (tables[table] || []).filter(r => f.every(([op, k, v]) => op === 'eq' ? r[k] === v : r[k] < v)).slice(lo, Math.min(hi + 1, lo + lim));
    const b: any = {
      select: () => b, order: () => b, eq: (k: string, v: any) => (f.push(['eq', k, v]), b), lt: (k: string, v: any) => (f.push(['lt', k, v]), b),
      range: (a: number, z: number) => (lo = a, hi = z, b), limit: (n: number) => (lim = n, b),
      maybeSingle: async () => ({ data: data()[0] ?? null, error: null }), single: async () => ({ data: data()[0], error: null }),
      then: (res: any) => res({ data: data(), error: null }),
    };
    return b;
  };
  return { from, rpc: async (name: string, args: any) => { saved[name] = args; return { error: null }; }, saved };
}
const S = 'sess';
const baseTables = (): Record<string, any[]> => ({
  game_sessions: [{ id: S, current_turn: 2 }], economy_turn_ledgers: [], city_capital_stock: [], node_inventory: [],
  goods: [], production_recipes: [], cities: [], province_nodes: [], city_buildings: [], building_templates: [], city_districts: [],
  military_stacks: [], realm_resources: [{ session_id: S, player_name: 'p' }], road_segments: [], province_hexes: [],
  node_production_orders: [], structure_production_orders: [], laws: [], war_declarations: [], node_projects: [],
});
const cityRow = (id: string, x: number, pop = 1000) => ({ id, session_id: S, name: id, owner_player: 'p', status: 'ok', population_total: pop,
  population_peasants: pop * 0.8, population_burghers: pop * 0.2, population_clerics: 0, grid_x: x, grid_y: 0, city_stability: 100, housing_capacity: pop * 2 });
const goodRow = (key: string, demand_basket: string, price: number, stage: string) => ({ key, demand_basket, base_price_numeric: price, production_stage: stage, storable: true, friction_profile: {} });
const building = (id: string, city: string, effects: any) => ({ id, session_id: S, city_id: city, status: 'completed', template_id: null, name: id, current_level: 1, effects });

describe('1. legacy saved well (draw_water + producer role) still produces water', () => {
  it('adapter normalises the legacy role and the ledger shows water output', async () => {
    const t = baseTables();
    t.goods = [goodRow('well_water', 'drinking_water', 1, 'raw')];
    t.production_recipes = [{ recipe_key: 'draw_water', output_good_key: 'well_water', output_quantity: 1, input_items: [], labor_cost: 1 / ECONOMY.workersPerLaborUnit, required_role: 'source', required_tags: [] }];
    t.cities = [cityRow('a', 0)];
    t.city_buildings = [building('studna', 'a', { recipe_keys: ['draw_water'], production_roles: ['producer'], basket_outputs: { drinking_water: 10 }, jobs_capacity: 100 })];
    const sb = fakeSb(t);
    await computeCanonicalEconomy(sb, S);
    const bal = sb.saved.replace_goods_economy_projection.p_payload.result.balances.find((b: any) => b.city === 'a' && b.good === 'well_water');
    expect(bal.produced_facility).toBeGreaterThan(0);
  });
  it('normalisation never grants source to a factory whose recipes have inputs', () => {
    const role = (r: any) => r.required_role;
    expect(normalizeStructureRoles(['producer'], [{ required_role: 'source', input_items: [] }], role)).toContain('source');
    expect(normalizeStructureRoles(['producer'], [{ required_role: 'processing', input_items: [{ key: 'x', qty: 1 }] }], role)).toEqual(['producer']);
  });
});

describe('2. settlement level aliases (real templates)', () => {
  const ctx = (lvl: string) => ({ actor: 'p', city: { owner_player: 'p', settlement_level: lvl }, tile: { has_river: true }, existingBuildingNames: [], existingTemplateIds: [] });
  it('Akvadukt VILLAGE, Mincovna TOWN, Aréna town are not buildable in a HAMLET', () => {
    const akvadukt = { name: 'Akvadukt', required_settlement_level: 'VILLAGE', effects: {} };
    const mincovna = { name: 'Mincovna', required_settlement_level: 'TOWN', effects: {} };
    const arena = { name: 'Aréna', required_settlement_level: 'town', effects: {} };
    for (const t of [akvadukt, mincovna, arena]) expect(validateBuild(t, ctx('HAMLET'))).toMatch(/úrovně/);
    expect(validateBuild(akvadukt, ctx('TOWNSHIP'))).toBeNull();
    expect(validateBuild(mincovna, ctx('TOWNSHIP'))).toMatch(/úrovně/);
    expect(validateBuild(mincovna, ctx('CITY'))).toBeNull();
    expect(validateBuild(arena, ctx('POLIS'))).toBeNull();
  });
  it('aliases map to the four canonical tiers; unknown values fail closed', () => {
    expect(canonicalSettlementLevel('VILLAGE')).toBe('TOWNSHIP'); expect(canonicalSettlementLevel('town')).toBe('CITY');
    expect(settlementRank('MEGALOPOLIS')).toBeNull();
    expect(validateBuild({ required_settlement_level: 'MEGALOPOLIS', effects: {} }, ctx('POLIS'))).toMatch(/neznámá/);
  });
});

describe('3. trade services are gated by real staffing', () => {
  const L = 1 / ECONOMY.workersPerLaborUnit;
  const good = (key: string, basket: string, price = 10): Good => ({ key, basket, price, stage: 'final', storable: true, bulk: 1, density: 30, perishability: 0, storageLoss: 0, storageCost: 0, substitutability: 1, strategic: 0, prestige: 0, transshipment: 0, finalUse: true });
  const city = (id: string, x: number, labor: any): City => ({ id, owner: 'p', name: id, cell: `${x},0`, population: 1000, classes: { peasants: 800, burghers: 200 }, soldiers: 0, stability: 1, irrigation: 0, labor, market: 3, storage: 3, commercialBaseline: 0, admin: 0, security: 1, guild: 0, ideology: 'open_merchant', coastal: false });
  const prod = (id: string, c: string, g: string, cap: number): Producer => ({ id, city: c, channel: 'node', capacity: cap, jobs: cap, recipe: { key: id, good: g, qty: 1, inputs: [], labor: L, quality: 0, minQuality: 0 }, allocation: 1, staffing: 1, logistics: 1, mastery: 1, source: true, distinctive: false });
  const run = (logistics: number) => {
    const labor = { farming: 0.4, crafting: 0.3, logistics, administration: 0.3 - logistics };
    const s: Snapshot = { turn: 2, cities: [city('a', 0, labor), city('b', 1, labor)], goods: [good('raw_grain', 'staple_food', 2)],
      producers: [prod('grain', 'a', 'raw_grain', 60)], edges: [{ id: 'r', from: '0,0', to: '1,0', cost: 1, capacity: 500, mode: 'road', risk: 0, toll: 0, border: 0 }], opening: [], fame: [] };
    const r = resolveGoodsEconomy(s);
    return { m: r.metrics.find(m => m.city === 'b')!.trade_services, lab: r.labor.find(l => l.city === 'b')! };
  };
  it('same trade + same infrastructure: zero < partial < full staffing; hamlet floor at zero', () => {
    const zero = run(0), part = run(0.005), full = run(0.3);
    expect(zero.m.opportunity_total).toBeGreaterThan(0);
    expect(part.m.opportunity_total).toBeCloseTo(zero.m.opportunity_total, 6);
    expect(full.m.opportunity_total).toBeCloseTo(zero.m.opportunity_total, 6);
    expect(zero.m.capture).toBeCloseTo(0.15, 9);
    expect(zero.m.service_value_added).toBeLessThan(part.m.service_value_added);
    expect(part.m.service_value_added).toBeLessThan(full.m.service_value_added);
    expect(full.lab.service!.jobs).toBe(60); expect(full.lab.service!.employed).toBeGreaterThan(part.lab.service!.employed);
  });
});

describe('4. AUTO uses expected landed input cost (adapter integration)', () => {
  const setup = (friction: number, order?: string) => {
    const t = baseTables();
    t.goods = [goodRow('iron', 'metalwork', 5, 'intermediate'), goodRow('arms', 'military_supply', 10, 'final')];
    t.production_recipes = [
      { recipe_key: 'mine_iron', output_good_key: 'iron', output_quantity: 1, input_items: [], labor_cost: 0.025, required_role: 'source', required_tags: [] },
      { recipe_key: 'forge_arms', output_good_key: 'arms', output_quantity: 1, input_items: [{ key: 'iron', qty: 1 }], labor_cost: 0.025, required_role: 'processing', required_tags: [] }];
    t.cities = [cityRow('a', 0), cityRow('b', 1)];
    t.city_buildings = [
      building('mine_a', 'a', { recipe_keys: ['mine_iron'], production_roles: ['source'], basket_outputs: { metalwork: 5 } }),
      building('mine_b', 'b', { recipe_keys: ['mine_iron'], production_roles: ['source'], basket_outputs: { metalwork: 20 } }),
      building('forge', 'a', { recipe_keys: ['forge_arms'], production_roles: ['processing'], basket_outputs: { military_supply: 5 } })];
    if (order) t.structure_production_orders = [{ session_id: S, structure_id: 'forge', mode: order, target_good_key: 'arms' }];
    t.road_segments = [{ id: 'r', session_id: S, status: 'completed', from_x: 0, from_y: 0, to_x: 1, to_y: 0, friction, capacity: 200 }];
    t.economy_turn_ledgers = [{ session_id: S, turn_number: 1, committed: true, committed_result: { prices: [
      { city: 'a', good: 'iron', local_price: 20 }, { city: 'b', good: 'iron', local_price: 3 }, { city: 'a', good: 'arms', local_price: 10 }] } }];
    return t;
  };
  const forge = async (friction: number, order?: string) => {
    const sb = fakeSb(setup(friction, order)); await computeCanonicalEconomy(sb, S);
    return sb.saved.replace_goods_economy_projection.p_payload.result.snapshot.producers.find((p: any) => p.id === 'forge:forge_arms');
  };
  it('a) expensive local iron + cheap reachable remote iron → AUTO keeps profitable arms', async () => {
    const p = await forge(1); expect(p).toBeTruthy(); expect(p.expectedMarginProxy).toBeGreaterThan(0);
    expect(p.expectedInputSources.iron.source).toBe('b');
  });
  it('b) same remote iron with prohibitive transport → AUTO drops the loss-making arms', async () => {
    expect(await forge(30)).toBeUndefined();
  });
  it('c) PREFER/LOCK keep their semantics regardless of expected margin', async () => {
    for (const mode of ['lock', 'prefer']) { const p = await forge(30, mode); expect(p).toBeTruthy(); expect(p.order).toBe(mode); }
  });
});
