import { expect } from 'vitest';
import { computeCanonicalEconomy } from '../../supabase/functions/_shared/economyAdapter';
import { produced } from '../../supabase/functions/_shared/goodsEconomy';
import { buildSnapshot } from '../../supabase/functions/economy-dev-snapshot/build';
import { INDUSTRIAL_INPUT_FIELDS } from '../lib/economyFieldContract';
export function fakeSb(tables: Record<string, any[]>) {
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
export const S = 'sess';
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
export const run = async (t: Record<string, any[]>) => { const sb = fakeSb(t); await computeCanonicalEconomy(sb, S); return sb.saved.replace_goods_economy_projection.p_payload; };
const producerOf = (payload: any, id: string) => payload.result.snapshot.producers.find((p: any) => p.id === id);
export const bal = (payload: any, city: string, good: string) => payload.result.balances.find((b: any) => b.city === city && b.good === good);


export function fixture(mode='auto',capacity=100,grain=80){
  const t=baseTables();
  t.goods=[goodRow('raw_grain','staple_food',2,'raw',{final_use:true,perishability:0,storage_loss:0}),
    goodRow('flour','staple_food',8,'intermediate',{final_use:false,perishability:0,storage_loss:0}),
    goodRow('baked_staples','staple_food',15,'final',{final_use:true,perishability:0,storage_loss:0}),
    goodRow('metalwork_tools','tools',20,'final',{perishability:0,storage_loss:0}),
    goodRow('peat','fuel',3,'raw',{final_use:false,perishability:0,storage_loss:0})];
  const mill=recipe('mill_grain','flour',[{key:'raw_grain',qty:3,kind:'material'},
    {key:'metalwork_tools',qty:1,kind:'factor',wear:0.05}]);mill.output_quantity=2;
  const bake=recipe('bake_staples','baked_staples',[{key:'flour',qty:2,kind:'material'},
    {key:'peat',qty:1,kind:'operating',fallback:0.8}]);bake.output_quantity=2;
  t.production_recipes=[recipe('harvest_wheat','raw_grain'),mill,bake];
  t.cities=[cityRow('a',0,0,'p',1000),cityRow('b',1,0,'p',1000),cityRow('c',2,0,'p',1000)];
  t.city_buildings=[building('farm','a',{recipe_keys:['harvest_wheat'],production_roles:['source'],basket_outputs:{staple_food:grain}}),
    building('mill','b',{recipe_keys:['mill_grain'],production_roles:['processing'],basket_outputs:{staple_food:20}}),
    building('bakery','c',{recipe_keys:['bake_staples'],production_roles:['processing'],basket_outputs:{staple_food:8}})];
  t.road_segments=[road('ab',[0,0],[1,0],0.1,capacity),road('bc',[1,0],[2,0],0.1,capacity)];
  t.economy_turn_ledgers=[{session_id:S,turn_number:2,opening:[{city:'b',good:'metalwork_tools',qty:10,quality:2},
    {city:'c',good:'peat',qty:10,quality:0}]}];
  if(mode==='lock')t.structure_production_orders=[{session_id:S,structure_id:'mill',mode:'lock',target_good_key:'flour'},
    {session_id:S,structure_id:'bakery',mode:'lock',target_good_key:'baked_staples'}];
  return t;
}
export function conserve(p:any){for(const b of p.result.balances)expect(b.opening+produced(b)+b.imported)
  .toBeCloseTo(b.consumed_household+b.consumed_state+b.consumed_as_input+b.exported+b.stored+b.lost_spoilage+b.capex,7);}
const input=(p:any)=>p.result.industrialInputs.find((x:any)=>x.producer==='mill:mill_grain'&&x.good==='raw_grain');