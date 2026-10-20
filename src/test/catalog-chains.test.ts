/**
 * CATALOG-WIDE INDUSTRIAL CHAIN ACCEPTANCE.
 *
 * For EVERY catalog recipe with A-class material inputs this builds an isolated
 * adapter-level world (computeCanonicalEconomy over an in-memory DB fixture):
 * the processing city owns zero local input stock and every material input must
 * physically arrive as a production_input flow from a real supplier city running
 * the input's own recipe (recursively, so processed inputs form 3-city chains).
 * A second suite runs ALL recipes in one connected world and asserts every
 * recipe produces and every material input is actually delivered.
 */
import { describe, it, expect } from 'vitest';
import { computeCanonicalEconomy } from '../../supabase/functions/_shared/economyAdapter';
import { produced } from '../../supabase/functions/_shared/goodsEconomy';
import { GOODS, RECIPES, PRODUCTION_BUILDINGS, producersOfRecipe, goodByKey, type CatalogRecipe } from '../../supabase/functions/_shared/productionCatalog';

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
const STAGE_PRICE: Record<string, number> = { raw: 2, processed: 8, final: 15, luxury: 30 };
const goodRow = (key: string) => {
  const g = goodByKey.get(key)!;
  return { key, demand_basket: g.basket, base_price_numeric: STAGE_PRICE[g.stage], production_stage: g.stage, storable: true,
    friction_profile: { final_use: g.finalUse, household: g.household, perishability: 0, storage_loss: 0, substitutability: 1 } };
};
const recipeRow = (r: CatalogRecipe) => ({ recipe_key: r.key, output_good_key: r.output, output_quantity: r.qty,
  input_items: r.inputs.map(i => ({ key: i.good, qty: i.qty, kind: i.kind ?? 'material', wear: i.wear, fallback: i.fallback })),
  labor_cost: 0.025, required_role: r.role, required_tags: r.tags });
const cityRow = (id: string, x: number, pop = 1000) => ({ id, session_id: S, name: id, owner_player: 'p', status: 'ok', population_total: pop,
  population_peasants: pop * 0.8, population_burghers: pop * 0.2, population_clerics: 0, grid_x: x, grid_y: 0, city_stability: 100, housing_capacity: pop * 2 });
const buildingRow = (id: string, city: string, effects: any, level: number) =>
  ({ id, session_id: S, city_id: city, status: 'completed', template_id: null, name: id, current_level: level, effects });
const roadRow = (id: string, a: number, b: number, capacity = 100000) =>
  ({ id, session_id: S, status: 'completed', from_x: a, from_y: 0, to_x: b, to_y: 0, friction: 0.1, capacity });
const baseTables = (): Record<string, any[]> => ({
  game_sessions: [{ id: S, current_turn: 2 }], economy_turn_ledgers: [], city_capital_stock: [], node_inventory: [],
  goods: GOODS.map(g => goodRow(g.key)), production_recipes: RECIPES.map(recipeRow), cities: [], province_nodes: [],
  city_buildings: [], building_templates: [], city_districts: [], military_stacks: [],
  realm_resources: [{ session_id: S, player_name: 'p', gold_reserve: 100 }],
  road_segments: [], province_hexes: [], node_production_orders: [], structure_production_orders: [], laws: [], war_declarations: [], node_projects: [],
});
const run = async (t: Record<string, any[]>) => { const sb = fakeSb(t); await computeCanonicalEconomy(sb, S); return sb.saved.replace_goods_economy_projection.p_payload; };
const bal = (p: any, city: string, good: string) => p.result.balances.find((b: any) => b.city === city && b.good === good);
const conserve = (p: any) => { for (const b of p.result.balances) expect(b.opening + produced(b) + b.imported)
  .toBeCloseTo(b.consumed_household + b.consumed_state + b.consumed_as_input + b.exported + b.stored + b.lost_spoilage + b.capex, 7); };

/** Supplier recipe for a good: prefer zero-input sources, then the simplest BOM. */
const supplierRecipe = (good: string): CatalogRecipe => {
  const candidates = RECIPES.filter(r => r.output === good);
  if (!candidates.length) throw Error(`no recipe produces ${good}`);
  return candidates.slice().sort((a, b) => (a.role === 'source' ? 0 : 1) - (b.role === 'source' ? 0 : 1) ||
    a.inputs.filter(i => (i.kind ?? 'material') === 'material').length - b.inputs.filter(i => (i.kind ?? 'material') === 'material').length ||
    a.key.localeCompare(b.key))[0];
};
const materialInputs = (r: CatalogRecipe) => r.inputs.filter(i => (i.kind ?? 'material') === 'material');
const supportInputs = (r: CatalogRecipe) => r.inputs.filter(i => (i.kind ?? 'material') !== 'material');

interface World { tables: Record<string, any[]>; cities: string[] }
function world(): World {
  const tables = baseTables();
  return { tables, cities: [] };
}
/** Adds a city running `recipeKey` (LOCKed) and recursively everything its BOM needs. */
function addProducer(w: World, recipeKey: string, cityId: string, capacity: number, built = new Set<string>()) {
  if (built.has(cityId)) return; built.add(cityId);
  const r = RECIPES.find(x => x.key === recipeKey)!;
  const contract = producersOfRecipe(recipeKey)[0];
  const def = PRODUCTION_BUILDINGS.find(b => b.name === contract.building)!;
  const x = w.cities.length;
  w.cities.push(cityId);
  w.tables.cities.push(cityRow(cityId, x));
  w.tables.city_buildings.push(buildingRow(cityId, cityId, {
    recipe_keys: [recipeKey], production_roles: def.roles, capability_tags: def.tags,
    basket_outputs: { [goodByKey.get(r.output)!.basket]: capacity }, jobs_capacity: 10,
  }, contract.level));
  w.tables.structure_production_orders.push({ session_id: S, structure_id: cityId, mode: 'lock', target_good_key: r.output });
  // B factors and C operating inputs are stocked locally: this harness isolates A-material trade.
  for (const i of supportInputs(r)) w.tables.economy_turn_ledgers[0]?.opening?.push({ city: cityId, good: i.good, qty: 200, quality: 2 });
  for (const i of materialInputs(r)) addProducer(w, supplierRecipe(i.good).key, `s_${i.good}`, Math.max(400, capacity * 4), built);
}
function finalize(w: World) {
  w.tables.economy_turn_ledgers = [{ session_id: S, turn_number: 2, opening: w.tables.economy_turn_ledgers[0]?.opening ?? [] }];
  w.tables.road_segments = w.cities.slice(1).map((_, i) => roadRow(`r${i}`, i, i + 1));
  return w.tables;
}
/** Fresh world for one target recipe: target city has zero local stock of its A inputs. */
function scenarioFor(recipeKey: string, targetCapacity = 40) {
  const w = world();
  w.tables.economy_turn_ledgers = [{ opening: [] as any[] }];
  addProducer(w, recipeKey, 'target', targetCapacity);
  return finalize(w);
}

const CHAIN_RECIPES = RECIPES.filter(r => materialInputs(r).length > 0);

describe('catalog-wide industrial chains (adapter, LOCK)', () => {
  it('covers every multi-input stage of the physical catalog', () => {
    expect(CHAIN_RECIPES.length).toBe(RECIPES.filter(r => r.inputs.length).length);
    expect(CHAIN_RECIPES.length).toBeGreaterThanOrEqual(30);
  });

  for (const r of CHAIN_RECIPES) {
    it(`${r.key}: every A input arrives as production_input and output is produced`, async () => {
      const p = await run(scenarioFor(r.key));
      conserve(p);
      const producedOut = bal(p, 'target', r.output);
      expect(produced(producedOut), `${r.key} output`).toBeGreaterThan(0);
      for (const i of materialInputs(r)) {
        expect(bal(p, 'target', i.good).opening ?? 0).toBe(0);
        const ii = p.result.industrialInputs.find((x: any) => x.producer === `target:${r.key}` && x.good === i.good);
        expect(ii, `${r.key} input ${i.good} registered`).toBeTruthy();
        expect(ii.planned).toBeGreaterThan(0);
        expect(ii.imported, `${r.key} input ${i.good} imported`).toBeGreaterThan(0);
        expect(ii.used, `${r.key} input ${i.good} used`).toBeGreaterThan(0);
        expect(ii.unmet, `${r.key} input ${i.good} fully supplied`).toBeCloseTo(0, 5);
        expect(ii.supplier).toBeTruthy();
        expect(ii.landed_unit_cost).toBeGreaterThan(0);
        expect(p.result.flows.some((f: any) => f.good === i.good && f.destination === 'target' &&
          f.reason === 'production_input' && f.delivered > 0), `${r.key} flow ${i.good}`).toBe(true);
      }
    });
  }

  for (const key of ['mill_grain', 'forge_tools', 'press_wine', 'prepare_feast', 'burn_charcoal']) {
    it(`${key}: disconnected world yields zero output and a diagnosed block, deterministically`, async () => {
      const t = scenarioFor(key);
      t.road_segments = [];
      t.cities.forEach((c: any, i: number) => { c.grid_x = i * 50; });
      const p = await run(t);
      conserve(p);
      expect(produced(bal(p, 'target', RECIPES.find(r => r.key === key)!.output)) ?? 0).toBe(0);
      for (const i of materialInputs(RECIPES.find(r => r.key === key)!)) {
        const ii = p.result.industrialInputs.find((x: any) => x.producer === `target:${key}` && x.good === i.good);
        expect(ii.planned).toBeGreaterThan(0);
        expect(ii.imported).toBe(0);
        expect(ii.used).toBe(0);
      }
      expect((await run(t)).result).toEqual(p.result);
    });
  }

  it('one connected world runs EVERY catalog recipe; every A input is physically delivered', async () => {
    // Capacity per recipe from downstream BOM demand (leaves first), with headroom for
    // the tool-productivity floor and household consumption of final-use goods.
    const need = new Map<string, number>();
    for (const g of GOODS) if (g.finalUse) need.set(g.key, 150);
    const depth = (good: string, seen = new Set<string>()): number => {
      if (seen.has(good)) return 0; seen.add(good);
      const users = RECIPES.filter(r => materialInputs(r).some(i => i.good === good));
      return users.length ? 1 + Math.max(...users.map(r => depth(r.output, new Set(seen)))) : 0;
    };
    const capacityOf = new Map<string, number>();
    for (const r of RECIPES.slice().sort((a, b) => depth(a.output) - depth(b.output))) {
      const target = Math.max(20, need.get(r.output) ?? 0);
      capacityOf.set(r.key, target / 0.5);
      for (const i of materialInputs(r)) need.set(i.good, (need.get(i.good) ?? 0) + target * i.qty / r.qty);
    }
    const w = world();
    w.tables.economy_turn_ledgers = [{ opening: [] as any[] }];
    const built = new Set<string>();
    for (const r of RECIPES) addProducer(w, r.key, `c_${r.key}`, capacityOf.get(r.key)!, built);
    const p = await run(finalize(w));
    conserve(p);
    const failures: string[] = [];
    for (const r of RECIPES) {
      if (!(produced(bal(p, `c_${r.key}`, r.output)) > 0)) failures.push(`${r.key}: no output`);
      for (const i of materialInputs(r)) {
        const ii = p.result.industrialInputs.find((x: any) => x.producer === `c_${r.key}:${r.key}` && x.good === i.good);
        if (!ii) { failures.push(`${r.key}: ${i.good} not registered`); continue; }
        if (!(ii.used > 0)) failures.push(`${r.key}: ${i.good} not used`);
        if (!(ii.imported > 0)) failures.push(`${r.key}: ${i.good} not imported`);
        if (ii.unmet > 0.001) failures.push(`${r.key}: ${i.good} unmet ${ii.unmet.toFixed(3)} (${ii.blocked})`);
      }
    }
    expect(failures).toEqual([]);
  });
});
