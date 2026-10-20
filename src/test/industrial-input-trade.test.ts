import { describe,it,expect } from 'vitest';
import { computeCanonicalEconomy } from '../../supabase/functions/_shared/economyAdapter';
import { produced } from '../../supabase/functions/_shared/goodsEconomy';
import { buildSnapshot } from '../../supabase/functions/economy-dev-snapshot/build';
import { INDUSTRIAL_INPUT_FIELDS } from '../lib/economyFieldContract';
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


function fixture(mode='auto',capacity=100,grain=80){
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
function conserve(p:any){for(const b of p.result.balances)expect(b.opening+produced(b)+b.imported)
  .toBeCloseTo(b.consumed_household+b.consumed_state+b.consumed_as_input+b.exported+b.stored+b.lost_spoilage+b.capex,7);}
const input=(p:any)=>p.result.industrialInputs.find((x:any)=>x.producer==='mill:mill_grain'&&x.good==='raw_grain');
describe('adapter industrial grain trade acceptance',()=>{
  for(const mode of ['auto','lock'])it(`${mode}: zero-local-grain mill imports A, wears B, bakery consumes C`,async()=>{
    const t=fixture(mode),p=await run(t);conserve(p);
    expect(bal(p,'b','raw_grain').opening).toBe(0);
    expect(p.result.flows.some((f:any)=>f.good==='raw_grain'&&f.source==='a'&&f.destination==='b'&&f.reason==='production_input'&&f.delivered>0)).toBe(true);
    expect(bal(p,'b','raw_grain').consumed_as_input).toBeGreaterThan(0);
    expect(produced(bal(p,'b','flour'))).toBeGreaterThan(0);
    expect(p.result.flows.some((f:any)=>f.good==='flour'&&f.destination==='c'&&f.reason==='production_input'&&f.delivered>0)).toBe(true);
    expect(produced(bal(p,'c','baked_staples'))).toBeGreaterThan(0);
    expect(bal(p,'b','metalwork_tools').consumed_as_input).toBeCloseTo(produced(bal(p,'b','flour'))*0.05/2);
    expect(bal(p,'c','peat').consumed_as_input).toBeGreaterThan(0);
    expect(input(p).planned).toBeGreaterThan(0);expect(input(p).imported).toBeGreaterThan(0);expect(input(p).used).toBeGreaterThan(0);
    expect(input(p).supplier).toBe('a');expect(input(p).landed_unit_cost).toBeGreaterThan(0);
    expect(p.result.management.p.industrial_inputs).toEqual(p.result.industrialInputs);
    const dev=buildSnapshot(p.result,null,[]);
    expect(dev.industrial_inputs).toEqual(p.result.industrialInputs);
    expect(Object.keys(input(p)).filter(k=>!INDUSTRIAL_INPUT_FIELDS.some(f=>f.key===k))).toEqual([]);
    expect((await run(t)).result).toEqual(p.result);
    console.table([{mode,A_produced:produced(bal(p,'a','raw_grain')),A_export:bal(p,'a','raw_grain').exported,...input(p),flour:produced(bal(p,'b','flour')),margin:p.result.diagnostics.find((d:any)=>d.producer==='mill:mill_grain').margin.margin_ratio,road_load:p.result.flows.filter((f:any)=>f.edges.includes('ab')).reduce((n:number,f:any)=>n+f.qty,0),price:p.result.prices.find((x:any)=>x.city==='b'&&x.good==='raw_grain').local_price}]);
  });
  it('capacity 4 physically limits input compared with 100',async()=>{const small=await run(fixture('lock',4)),large=await run(fixture('lock',100));
    conserve(small);conserve(large);expect(input(small).imported).toBeLessThan(input(large).imported);
    expect(produced(bal(small,'b','flour'))).toBeLessThan(produced(bal(large,'b','flour')));
    expect(small.result.flows.filter((f:any)=>f.edges.includes('ab')).reduce((n:number,f:any)=>n+f.qty,0)).toBeLessThanOrEqual(4.000001);
  });
  for(const blocked of ['disconnected','missing','expensive','war','reserve'])it(`${blocked}: no phantom mill input or output`,async()=>{
    const t=fixture('lock');if(blocked==='disconnected'){t.road_segments=[];t.cities[1].grid_x=10;t.cities[2].grid_x=20;}
    if(blocked==='missing')t.city_buildings=t.city_buildings.filter((b:any)=>b.id!=='farm');
    if(blocked==='expensive')t.road_segments.forEach((r:any)=>r.friction=1000);
    if(blocked==='war'){t.cities[0].owner_player='q';t.war_declarations=[{session_id:S,status:'active',declaring_player:'q',target_player:'p'}];}
    if(blocked==='reserve')t.city_buildings[0].effects.basket_outputs.staple_food=1;
    const p=await run(t);conserve(p);expect(bal(p,'b','raw_grain').consumed_as_input).toBe(0);expect(produced(bal(p,'b','flour'))).toBe(0);
    expect(input(p).planned).toBeGreaterThan(0);expect(input(p).unmet).toBeGreaterThan(0);expect(input(p).blocked).toBeTruthy();
  });
  it('two mills share scarce grain and road without double allocation; stopped mills still signal demand',async()=>{
    const t=fixture('lock',4,20);t.city_buildings.push(building('mill2','b',{recipe_keys:['mill_grain'],production_roles:['processing'],basket_outputs:{staple_food:20}}));
    t.structure_production_orders.push({session_id:S,structure_id:'mill2',mode:'lock',target_good_key:'flour'});
    const p=await run(t);conserve(p);const rows=p.result.industrialInputs.filter((x:any)=>x.city==='b'&&x.good==='raw_grain');
    expect(rows).toHaveLength(2);expect(rows.reduce((n:number,x:any)=>n+x.used,0)).toBeCloseTo(bal(p,'b','raw_grain').consumed_as_input);
    const empty=fixture('lock');empty.city_buildings=empty.city_buildings.filter((b:any)=>b.id!=='farm');const q=await run(empty);
    const px=q.result.prices.find((x:any)=>x.city==='b'&&x.good==='raw_grain');
    expect(px.demand).toBeGreaterThan(bal(q,'b','raw_grain').demand);expect(px.scarcity_factor).toBeGreaterThan(1);
  });
  it('AUTO keeps reachable grain mill with fuel fallback, but no absent material supplier',async()=>{
    const t=fixture();t.economy_turn_ledgers[0].opening=t.economy_turn_ledgers[0].opening.filter((b:any)=>b.good!=='peat');
    const p=await run(t);conserve(p);expect(producerOf(p,'mill:mill_grain')?.allocation).toBeGreaterThan(0);
    expect(produced(bal(p,'c','baked_staples'))).toBeGreaterThan(0);expect(bal(p,'c','peat').consumed_as_input).toBe(0);
    t.city_buildings=t.city_buildings.filter((b:any)=>b.id!=='farm');
    const q=await run(t);expect(producerOf(q,'mill:mill_grain')).toBeUndefined();conserve(q);
  });
  it('carried B stock is never refreshed into free tools; repeated projections do not pay or progress turns',async()=>{
    const t=fixture('lock'),p=await run(t),tools=bal(p,'b','metalwork_tools');
    t.game_sessions[0].current_turn=3;
    t.economy_turn_ledgers=[{session_id:S,turn_number:2,committed:true,committed_result:p.result}];
    const q=await run(t);conserve(q);expect(bal(q,'b','metalwork_tools').opening).toBeCloseTo(tools.stored);
    expect((await run(t)).result).toEqual(q.result);expect(t.realm_resources[0].gold_reserve).toBe(100);
    expect(t.game_sessions[0].current_turn).toBe(3);
  });
});
