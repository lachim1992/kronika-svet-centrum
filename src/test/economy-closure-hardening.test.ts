import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeCanonicalEconomy } from '../../supabase/functions/_shared/economyAdapter';
import { resolveGoodsEconomy, produced, type Good, type City, type Producer, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { expectedInputCost, autoAllocationDetail } from '../../supabase/functions/_shared/productMarket';
import { buildRouteGraph, shortestTree, tracePath, usablePath, edgeTransportCost } from '../../supabase/functions/_shared/landedRoute';
import { buildManagementReport } from '../../supabase/functions/_shared/management';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';

/* ---------- in-memory DB for the adapter (same pattern as post-closure-integration) ---------- */
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
  military_stacks: [], realm_resources: [{ session_id: S, player_name: 'p', gold_reserve: 100 }, { session_id: S, player_name: 'q', gold_reserve: 50 }],
  road_segments: [], province_hexes: [], node_production_orders: [], structure_production_orders: [], laws: [], war_declarations: [], node_projects: [],
});
const cityRow = (id: string, x: number, y = 0, owner = 'p', pop = 1000) => ({ id, session_id: S, name: id, owner_player: owner, status: 'ok', population_total: pop,
  population_peasants: pop * 0.8, population_burghers: pop * 0.2, population_clerics: 0, grid_x: x, grid_y: y, city_stability: 100, housing_capacity: pop * 2 });
const goodRow = (key: string, demand_basket: string, price: number, stage: string, friction_profile: any = {}) =>
  ({ key, demand_basket, base_price_numeric: price, production_stage: stage, storable: true, friction_profile });
const building = (id: string, city: string, effects: any) => ({ id, session_id: S, city_id: city, status: 'completed', template_id: null, name: id, current_level: 1, effects });
const recipe = (key: string, out: string, inputs: any[] = [], role = inputs.length ? 'processing' : 'source') =>
  ({ recipe_key: key, output_good_key: out, output_quantity: 1, input_items: inputs, labor_cost: 0.025, required_role: role, required_tags: [] });
const road = (id: string, a: [number, number], b: [number, number], friction = 1, capacity = 200) =>
  ({ id, session_id: S, status: 'completed', from_x: a[0], from_y: a[1], to_x: b[0], to_y: b[1], friction, capacity });
const run = async (t: Record<string, any[]>) => { const sb = fakeSb(t); await computeCanonicalEconomy(sb, S); return sb.saved.replace_goods_economy_projection.p_payload; };
const producerOf = (payload: any, id: string) => payload.result.snapshot.producers.find((p: any) => p.id === id);
const bal = (payload: any, city: string, good: string) => payload.result.balances.find((b: any) => b.city === city && b.good === good);

/* ================================ P0 — missing input is unavailable ================================ */
describe('P0 expectedInputCost: a missing input is unavailable, never free', () => {
  it('no local supply and no supplier → available=false, infinite cost (was {cost:0,source:"local"})', () => {
    for (const local of [null, Infinity]) {
      const v = expectedInputCost(local as any, [], 5);
      expect(v.available).toBe(false); expect(v.cost).toBe(Infinity); expect(v.source).toBe('unavailable');
    }
  });
  it('a reachable supplier makes the input available at its landed cost', () => {
    const v = expectedInputCost(null, [{ city: 'b', sourcePrice: 4, transport: 1, tolls: 0, tariffRate: 0, risk: 0, loss: 0 }], 5);
    expect(v.available).toBe(true); expect(v.source).toBe('b'); expect(v.cost).toBeCloseTo(5);
  });
  it('a supplier above the landed ceiling does not count as availability', () => {
    expect(expectedInputCost(null, [{ city: 'b', sourcePrice: 4, transport: 100, tolls: 0, tariffRate: 0, risk: 0, loss: 0 }], 5).available).toBe(false);
  });
  it('AUTO: unavailable input → zero weight, even for essential recipes; it never counts as "profitable"', () => {
    const d = autoAllocationDetail([
      { key: 'ghost', necessity: 1, marginRatio: 0.9, inputsAvailable: false },
      { key: 'bread', necessity: 1, marginRatio: -0.2, essential: true }]);
    expect(d.weights.ghost).toBe(0); expect(d.flags.ghost).toBe('auto_input_unavailable');
    // the ghost recipe must not suppress the essential emergency floor of an available recipe
    expect(d.flags.bread).toBe('emergency_unprofitable_production'); expect(d.weights.bread).toBeGreaterThan(0);
    const e = autoAllocationDetail([{ key: 'food', necessity: 1, marginRatio: 0.5, essential: true, inputsAvailable: false }]);
    expect(e.weights.food).toBe(0);
  });
});

describe('P0 adapter: a recipe with an unreachable input cannot win AUTO capacity', () => {
  const setup = (reachable: boolean) => {
    const t = baseTables();
    t.goods = [goodRow('iron', 'metalwork', 5, 'intermediate'), goodRow('arms', 'military_supply', 50, 'final'),
      goodRow('wood', 'construction', 1, 'raw'), goodRow('tools', 'tools', 4, 'final')];
    t.production_recipes = [recipe('mine_iron', 'iron'), recipe('cut_wood', 'wood'),
      recipe('forge_arms', 'arms', [{ key: 'iron', qty: 1 }]), recipe('make_tools', 'tools', [{ key: 'wood', qty: 1 }])];
    t.cities = [cityRow('a', 0), cityRow('b', 1)];
    t.city_buildings = [
      building('lumber', 'a', { recipe_keys: ['cut_wood'], production_roles: ['source'], basket_outputs: { construction: 20 } }),
      building('works', 'a', { recipe_keys: ['forge_arms', 'make_tools'], production_roles: ['processing'], basket_outputs: { military_supply: 10, tools: 10 } })];
    if (reachable) {
      t.city_buildings.push(building('mine', 'b', { recipe_keys: ['mine_iron'], production_roles: ['source'], basket_outputs: { metalwork: 20 } }));
      t.road_segments = [road('r', [0, 0], [1, 0])];
    }
    return t;
  };
  it('no iron anywhere: arms gets zero AUTO weight, tools keeps the capacity, and no arms are produced', async () => {
    const p = await run(setup(false));
    expect(producerOf(p, 'works:forge_arms')).toBeUndefined();
    expect(producerOf(p, 'works:make_tools')?.allocation).toBeGreaterThan(0.99);
    expect(produced(bal(p, 'a', 'arms') ?? { produced_node: 0, produced_facility: 0, produced_district: 0, produced_household: 0 } as any)).toBe(0);
    expect(produced(bal(p, 'a', 'tools'))).toBeGreaterThan(0);
  });
  it('control: once iron is reachable the profitable arms recipe competes again', async () => {
    const p = await run(setup(true));
    expect(producerOf(p, 'works:forge_arms')?.allocation).toBeGreaterThan(0);
    expect(producerOf(p, 'works:forge_arms').expectedInputSources.iron.available).toBe(true);
  });
});

/* ======================== P0/P1 — expected landed ranking = actual sourcing ======================== */
describe('P1 shared landed-route estimate', () => {
  const bulky = { bulk: 12, perishability: 0, transshipment: 0.1 };
  it('water efficiency and bulk change the ranking that raw distance would choose', () => {
    const road = { id: 'r', from: 'a', to: 'b', cost: 1, capacity: 100, mode: 'road' };
    const river = { id: 'w', from: 'a', to: 'c', cost: 1.6, capacity: 100, mode: 'river' };
    expect(edgeTransportCost(river, bulky)).toBeLessThan(edgeTransportCost(road, bulky));
  });
  it('tolls, risk and perishability losses are carried in the path, not dropped', () => {
    const g = buildRouteGraph([{ id: 'e', from: 'a', to: 'b', cost: 2, capacity: 50, toll: 0.7, risk: 0.3 }]);
    const p = tracePath(shortestTree(g, 'a', { bulk: 1, perishability: 0.1, transshipment: 0 }), 'a', 'b', { bulk: 1, perishability: 0.1, transshipment: 0 })!;
    expect(p.tolls).toBeCloseTo(0.7); expect(p.risk).toBeCloseTo(0.3); expect(p.loss).toBeCloseTo(0.2);
  });
  it('zero-capacity edges make the supplier unreachable', () => {
    const g = buildRouteGraph([{ id: 'e', from: 'a', to: 'b', cost: 1, capacity: 0 }]);
    expect(usablePath(tracePath(shortestTree(g, 'a', bulky), 'a', 'b', bulky))).toBe(false);
  });
});

describe('P1 adapter: expected supplier = actual supplier; war/zero-capacity → unavailable', () => {
  // a(0,0) consumes bulky ore. b(1,0) is ONE raw road step away; c(0,2) is two river steps (raw 1.6),
  // but bulky ore is far cheaper by water. Raw-distance planning used to pick b.
  const setup = (opts: { war?: boolean; zeroCap?: boolean } = {}) => {
    const t = baseTables();
    t.goods = [goodRow('ore', 'metalwork', 5, 'intermediate', { bulk_factor: 12 }), goodRow('arms', 'military_supply', 30, 'final')];
    t.production_recipes = [recipe('mine_ore', 'ore'), recipe('forge_arms', 'arms', [{ key: 'ore', qty: 1 }])];
    t.cities = [cityRow('a', 0), cityRow('b', 1, 0, opts.war ? 'q' : 'p'), cityRow('c', 0, 2, opts.war ? 'q' : 'p')];
    t.city_buildings = [
      building('mine_b', 'b', { recipe_keys: ['mine_ore'], production_roles: ['source'], basket_outputs: { metalwork: 20 } }),
      building('mine_c', 'c', { recipe_keys: ['mine_ore'], production_roles: ['source'], basket_outputs: { metalwork: 20 } }),
      building('forge', 'a', { recipe_keys: ['forge_arms'], production_roles: ['processing'], basket_outputs: { military_supply: 5 } })];
    t.road_segments = [road('r', [0, 0], [1, 0], 1, opts.zeroCap ? 0 : 500)];
    t.province_hexes = opts.zeroCap ? [] : [[0, 0], [0, 1], [0, 2]].map(([x, y]) => ({ session_id: S, grid_x: x, grid_y: y, has_river: true, is_passable: true, biome_family: 'plains' }));
    if (opts.war) t.war_declarations = [{ session_id: S, declaring_player: 'p', target_player: 'q', status: 'active' }];
    return t;
  };
  it('distance alone would choose b; the shared estimate chooses c and actual sourcing agrees', async () => {
    const p = await run(setup());
    const forge = producerOf(p, 'forge:forge_arms');
    expect(forge.expectedInputSources.ore.source).toBe('c');
    const ore = p.result.flows.filter((f: any) => f.destination === 'a' && f.good === 'ore');
    expect(ore.length).toBeGreaterThan(0);
    expect(ore[0].source).toBe('c');
  });
  it('war-blocked suppliers: ore unavailable, no AUTO weight, no arms', async () => {
    const p = await run(setup({ war: true }));
    expect(producerOf(p, 'forge:forge_arms')).toBeUndefined();
    expect(p.result.flows.some((f: any) => f.destination === 'a' && f.good === 'ore')).toBe(false);
  });
  it('zero-capacity road and no river: ore unavailable, no AUTO weight', async () => {
    const p = await run(setup({ zeroCap: true }));
    expect(producerOf(p, 'forge:forge_arms')).toBeUndefined();
  });
});

/* ================================ P1 — fame respects reachable origin ================================ */
const good = (key: string, basket: string, price: number): Good => ({ key, basket, price, stage: 'final', storable: true,
  bulk: 1, density: 30, perishability: 0, storageLoss: 0, storageCost: 0, substitutability: 1, strategic: 0, prestige: 0, transshipment: 0, finalUse: true });
const city = (id: string, x: number, population: number, owner = 'p'): City => ({ id, owner, name: id, cell: `${x},0`, population,
  classes: { peasants: population }, soldiers: 0, stability: 1, irrigation: 0, labor: {}, market: 2, storage: 10, admin: 0, security: 1, guild: 0, ideology: 'open_merchant', coastal: false });
const src = (id: string, c: string, g: string, capacity: number): Producer => ({ id, city: c, channel: 'node', capacity, jobs: capacity,
  recipe: { key: id, good: g, qty: 1, inputs: [], labor: 1 / ECONOMY.workersPerLaborUnit, quality: 0, minQuality: 0 },
  allocation: 1, staffing: 1, logistics: 1, mastery: 1, source: true, distinctive: false });
const famePair = (o: { edges?: boolean; war?: boolean } = {}): Snapshot => ({
  turn: 2, goods: [good('wine', 'feast', 20)], cities: [city('origin', 0, 500, o.war ? 'q' : 'p'), city('dest', 1, 4000)],
  producers: [src('vineyard', 'origin', 'wine', 200)],
  edges: o.edges === false ? [] : [{ id: 'road', from: '0,0', to: '1,0', cost: 1, capacity: 1000, mode: 'road', risk: 0, toll: 0, border: 0 }],
  opening: [], fame: [{ city: 'origin', good: 'wine', name: 'Origin wine', streak: 9, fame: 80, quality: 2, created: 1, turn: 1 }],
  blockedTrade: o.war ? [['p', 'q']] : undefined,
});
const destChoice = (r: any) => r.productChoice.find((c: any) => c.city === 'dest' && c.good === 'wine');
const planned = (r: any) => r.cityAccounts.find((a: any) => a.city === 'dest').discretionary_cap?.planned_spend ?? r.metrics.find((m: any) => m.city === 'dest')?.discretionary_cap?.planned_spend;
const fameDemand = (r: any) => (r.demand || []).find((d: any) => d.city === 'dest' && d.good === 'wine')?.channels?.fame ?? 0;

describe('P1 fame/product choice is origin-specific and route-reachable', () => {
  it('reachable famous origin raises the factor, keeps origin identity and creates funded fame demand', () => {
    const r: any = resolveGoodsEconomy(famePair());
    expect(destChoice(r).fame_origin).toBe('origin');
    expect(fameDemand(r)).toBeGreaterThan(0);
    expect(r.flows.some((f: any) => f.reason === 'famous_good_demand' && f.source === 'origin')).toBe(true);
  });
  for (const [label, opts] of [['unreachable (no route)', { edges: false }], ['war-blocked', { war: true }]] as const) {
    it(`${label} famous origin does not raise product choice, fame demand or planned spend`, () => {
      const blocked: any = resolveGoodsEconomy(famePair(opts));
      const neutral: any = resolveGoodsEconomy({ ...famePair(opts), fame: [] });
      expect(destChoice(blocked).fame_origin).toBeNull();
      expect(destChoice(blocked).share).toBeCloseTo(destChoice(neutral).share);
      expect(fameDemand(blocked)).toBe(0);
      expect(planned(blocked)).toBeCloseTo(planned(neutral));
    });
  }
  it('budget cap: funded fame + discretionary spend never exceeds the committed budget', () => {
    const snap = { ...famePair(), budget: { dest: { discretionary_ratio: 0.1, affordability: 1, discretionary_budget: 5 } } };
    const r: any = resolveGoodsEconomy(snap as any);
    const cap = r.cityAccounts.find((a: any) => a.city === 'dest').discretionary_cap ?? r.metrics.find((m: any) => m.city === 'dest')?.discretionary_cap;
    expect(cap.funded_spend).toBeLessThanOrEqual(5 + 1e-9);
  });
  it('factories buying inputs pay no fame premium (production_input source price excludes fame)', () => {
    const r: any = resolveGoodsEconomy(famePair());
    for (const f of r.flows.filter((f: any) => f.reason === 'production_input')) {
      const sd = r.prices.find((p: any) => p.city === f.source && p.good === f.good);
      expect(f.source_price).toBeCloseTo(sd.local_price / sd.fame_factor);
    }
  });
});

/* ================================ P1 — City accounts via secure read model ================================ */
describe('P1 CityAccountsPanel reads only the owner-scoped management RPC', () => {
  const panel = readFileSync('src/components/economy/CityAccountsPanel.tsx', 'utf8');
  it('no direct economy_turn_ledgers query, uses useManagementReport, shows an error state', () => {
    expect(panel).not.toMatch(/economy_turn_ledgers/);
    expect(panel).not.toMatch(/\.from\(/);
    expect(panel).toMatch(/useManagementReport/);
    expect(panel).toMatch(/role="alert"/);
    expect(panel).not.toMatch(/return null;\s*\n\s*\n\s*return \(/); // no silent null for an empty/failed read
  });
  it('the hook reads read_economy_management, never the raw ledger', () => {
    const hook = readFileSync('src/hooks/useManagementReport.ts', 'utf8');
    expect(hook).toMatch(/rpc\('read_economy_management'/); expect(hook).not.toMatch(/economy_turn_ledgers/);
  });
  it('raw ledger SELECT stays revoked for authenticated; report table is owner-scoped by RLS', () => {
    const sql = readFileSync('supabase/migrations/20260919205104_2ac02c2b-fad5-4f35-800c-8401533029f6.sql', 'utf8');
    expect(sql).toMatch(/own_management_report_read[\s\S]*p\.user_id=auth\.uid\(\)/);
    const { readdirSync } = require('node:fs');
    const all = readdirSync('supabase/migrations').map((f: string) => readFileSync(`supabase/migrations/${f}`, 'utf8')).join('\n');
    expect(all).not.toMatch(/GRANT\s+SELECT[^;]*ON\s+(TABLE\s+)?public\.economy_turn_ledgers\s+TO[^;]*authenticated/i);
  });
  it('management report carries only the owner\'s city accounts', () => {
    const snap = { ...famePair(), cities: [city('mine', 0, 500, 'p'), city('theirs', 1, 500, 'q')], producers: [src('v', 'mine', 'wine', 50)], fame: [] } as Snapshot;
    const ledger = resolveGoodsEconomy(snap);
    const rep: any = buildManagementReport(snap, ledger, { player_name: 'p' });
    expect(rep.cityAccounts.map((a: any) => a.city)).toEqual(['mine']);
    expect(rep.productChoice.every((c: any) => c.city === 'mine')).toBe(true);
    expect(rep.budgetMode).toBeTruthy();
  });
});

/* ======================= Acceptance — multi-city chain + refresh idempotence ======================= */
describe('Acceptance: raw → processed → final, imported input, AUTO, consumption/export, reachable fame', () => {
  const world = () => {
    const t = baseTables();
    t.goods = [goodRow('raw_grain', 'staple_food', 2, 'raw'), goodRow('baked_staples', 'staple_food', 4, 'processed'),
      goodRow('iron', 'metalwork', 5, 'intermediate'), goodRow('tools', 'tools', 12, 'final'), goodRow('wine_luxury', 'feast', 25, 'final')];
    t.production_recipes = [recipe('farm', 'raw_grain'), recipe('bake', 'baked_staples', [{ key: 'raw_grain', qty: 1 }]),
      recipe('mine_iron', 'iron'), recipe('smith', 'tools', [{ key: 'iron', qty: 1 }]), recipe('press', 'wine_luxury')];
    t.cities = [cityRow('farmtown', 0), cityRow('mill', 1), cityRow('mine', 2), cityRow('vine', 3)];
    t.city_buildings = [
      building('farm', 'farmtown', { recipe_keys: ['farm'], production_roles: ['source'], basket_outputs: { staple_food: 40 } }),
      building('bakery', 'mill', { recipe_keys: ['bake', 'smith'], production_roles: ['processing'], basket_outputs: { staple_food: 15, tools: 10 } }),
      building('pit', 'mine', { recipe_keys: ['mine_iron'], production_roles: ['source'], basket_outputs: { metalwork: 20 } }),
      building('winery', 'vine', { recipe_keys: ['press'], production_roles: ['source'], basket_outputs: { feast: 10 } })];
    t.road_segments = [road('r1', [0, 0], [1, 0]), road('r2', [1, 0], [2, 0]), road('r3', [2, 0], [3, 0])];
    t.economy_turn_ledgers = [{ session_id: S, turn_number: 1, committed: true, committed_result: { prices: [], balances: [], famous: [
      { city: 'vine', good: 'wine_luxury', name: 'Vine', streak: 5, fame: 60, quality: 1, created: 1, turn: 1 }] } }];
    return t;
  };
  it('produces the whole chain and conserves every balance', async () => {
    const p = await run(world());
    expect(produced(bal(p, 'farmtown', 'raw_grain'))).toBeGreaterThan(0);
    expect(produced(bal(p, 'mill', 'baked_staples'))).toBeGreaterThan(0);
    expect(produced(bal(p, 'mill', 'tools'))).toBeGreaterThan(0);
    expect(p.result.flows.some((f: any) => f.good === 'iron' && f.source === 'mine' && f.destination === 'mill')).toBe(true);
    expect(producerOf(p, 'bakery:bake').order).toBe('auto');
    expect(p.result.flows.some((f: any) => f.reason === 'famous_good_demand' && f.source === 'vine')).toBe(true);
    for (const b of p.result.balances)
      expect(b.opening + produced(b) + b.imported).toBeCloseTo(b.consumed_household + b.consumed_state + b.consumed_as_input + b.exported + b.stored + b.capex + b.lost_spoilage, 6);
  });
  it('two identical refreshes give identical physical balances and write no treasury/population/capital/history/turn', async () => {
    const t = world(); const snapshot = JSON.stringify(t);
    const a = fakeSb(t); await computeCanonicalEconomy(a, S);
    const b = fakeSb(t); await computeCanonicalEconomy(b, S);
    expect(JSON.stringify(a.saved.replace_goods_economy_projection.p_payload.result.balances))
      .toBe(JSON.stringify(b.saved.replace_goods_economy_projection.p_payload.result.balances));
    expect(JSON.stringify(t)).toBe(snapshot); // inputs (realm gold, population, capital stock, ledgers, session turn) untouched
    for (const name of Object.keys(a.saved)) expect(['replace_goods_economy_projection', 'update_goods_management_reports']).toContain(name);
    const realms = a.saved.replace_goods_economy_projection.p_payload.realms;
    for (const r of realms) { expect(r).not.toHaveProperty('gold_reserve'); expect(r).not.toHaveProperty('population_total'); }
  });
});
