import { describe,it,expect } from 'vitest';
import { resolveGoodsEconomy, produced, type Good, type City, type Producer, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { computeWorkforceBreakdown, actualSoldiers } from '../../supabase/functions/_shared/manpower';
import { normalizeLabor } from '../../supabase/functions/_shared/economyConfig';
import { previewEconomy } from '../../supabase/functions/_shared/economyPreview';
import { buildManagementReport } from '../../supabase/functions/_shared/management';

const good=(key:string,basket='metalwork',price=10):Good=>({key,basket,price,stage:'intermediate',storable:true,bulk:1,density:30,perishability:0,storageLoss:0,storageCost:0,substitutability:1,strategic:0,prestige:0,transshipment:0});
const city=(id:string,x:number,market=0):City=>({id,owner:'p',name:id,cell:`${x},0`,population:1000,classes:{peasants:1000},soldiers:0,stability:1,irrigation:0,labor:{},market,storage:10,admin:0,security:1,guild:0,ideology:'open_merchant',coastal:false});
const producer=(id:string,c:string,g:string,capacity=10,inputs:{good:string;qty:number}[]=[]):Producer=>({id,city:c,channel:'node',capacity,recipe:{key:id,good:g,qty:1,inputs,labor:1,quality:0,minQuality:0},allocation:1,staffing:1,logistics:1,mastery:1,source:inputs.length===0,distinctive:false});
const setup=():Snapshot=>({turn:1,cities:[city('mine',0),city('forge',1,2)],goods:[good('ore','metalwork',10),good('ingot','metalwork',20),good('sword','military_supply',35)],
  producers:[producer('ore','mine','ore'),producer('ingot','forge','ingot',10,[{good:'ore',qty:1}]),producer('sword','forge','sword',10,[{good:'ingot',qty:1}])],
  edges:[{id:'road',from:'0,0',to:'1,0',cost:1,capacity:100,mode:'road',risk:0,toll:0,border:0}],opening:[],fame:[]});
describe('management reports and shared scenario previews',()=>{
  it('reconciles additive headlines with source rows',()=>{
    const snapshot=setup(),report=buildManagementReport(snapshot,resolveGoodsEconomy(snapshot),{player_name:'p'});
    for(const metric of report.metrics.filter(m=>m.sources.length))expect(metric.value).toBeCloseTo(metric.sources.reduce((n,s)=>n+s.value,0));
  });
  it('previews recruitment with the canonical workforce and leaves input unchanged',()=>{
    const snapshot=setup(),original=JSON.stringify(snapshot),result=previewEconomy(snapshot,{player_name:'p'},{kind:'recruitment',soldiers:100});
    const workforce=result.rows.find(m=>m.key==='workforce')!;
    expect(workforce.before!-workforce.after!).toBe(100);
    expect(JSON.stringify(snapshot)).toBe(original);
    expect(()=>previewEconomy(snapshot,{player_name:'p'},{kind:'recruitment',soldiers:10000})).toThrow();
  });
  it('capacity expansion does not invent missing production inputs',()=>{
    const snapshot=setup();snapshot.producers=snapshot.producers.filter(p=>p.id!=='ore');
    const result=previewEconomy(snapshot,{player_name:'p'},{kind:'production',producer:'ingot',capacityMultiplier:2});
    expect(result.rows.find(m=>m.key==='gross_output')?.after).toBe(0);
  });
  it('does not preview another realm private producer',()=>{
    expect(()=>previewEconomy(setup(),{player_name:'other'},{kind:'production',producer:'ingot',capacityMultiplier:2})).toThrow('not owned');
  });
  it('law workforce modifiers also affect the physical solver',()=>{
    const snapshot=setup();snapshot.cities[0].activePopModifier=0.1;
    expect(resolveGoodsEconomy(snapshot).workforce.mine.effectiveActivePop).toBe(600);
    expect(actualSoldiers([{compositions:[{manpower:20}]},{is_active:false,soldiers:100}])).toBe(20);
  });
});
describe('canonical physical goods economy',()=>{
  it('debits routed ore and intermediate ingots, preserving value added',()=>{
    const r=resolveGoodsEconomy(setup());const ore=r.balances.find(b=>b.city==='mine'&&b.good==='ore')!;
    expect(ore.exported).toBe(10);expect(r.flows.some(f=>f.good==='ore'&&f.reason==='production_input'&&f.edges[0]==='road')).toBe(true);
    const ingot=r.balances.find(b=>b.city==='forge'&&b.good==='ingot')!;expect(ingot.consumed_as_input).toBe(10);
    const va=r.balances.reduce((s,b)=>s+b.gross_output_value-b.intermediate_value,0);expect(va).toBeCloseTo(350);
    expect(r.balances.reduce((s,b)=>s+b.gross_output_value,0)).toBeCloseTo(650);
  });
  it('blocks processing when the route is broken',()=>{const s=setup();s.edges=[];const r=resolveGoodsEconomy(s);
    expect(r.flows).toHaveLength(0);expect(r.diagnostics.find(d=>d.producer==='ingot')?.realized).toBe(0);});
  it('zero capacity and unstaffed facilities never produce',()=>{const s=setup();s.producers[0].capacity=0;s.producers[0].channel='facility';
    expect(resolveGoodsEconomy(s).balances.reduce((n,b)=>n+produced(b),0)).toBe(0);
    s.producers[0].capacity=10;s.producers[0].staffing=0;expect(resolveGoodsEconomy(s).balances.reduce((n,b)=>n+produced(b),0)).toBe(0);});
  it('rejects processing without declared inputs',()=>{const s=setup();s.producers[0].source=false;const r=resolveGoodsEconomy(s);
    expect(r.diagnostics.find(d=>d.producer==='ore')?.blocked).toBe('missing_recipe_inputs');});
  it('mobilization removes actual civilian workers and output',()=>{const a=resolveGoodsEconomy(setup());const s=setup();s.cities[0].soldiers=250;const b=resolveGoodsEconomy(s);
    expect(b.workforce.mine.workforce).toBe(250);expect(b.diagnostics.find(d=>d.producer==='ore')!.realized).toBeLessThan(a.diagnostics.find(d=>d.producer==='ore')!.realized);});
  it('refresh is pure and deterministic including reputation streaks',()=>{const s=setup(),before=JSON.stringify(s);const a=resolveGoodsEconomy(s),b=resolveGoodsEconomy(s);
    expect(a).toEqual(b);expect(JSON.stringify(s)).toBe(before);});
  it('never spends consumed or exported construction goods on CAPEX',()=>{const s=setup();s.goods=[good('timber','construction',10),good('chair','tools',20)];
    s.producers=[producer('timber','mine','timber'),producer('chair','forge','chair',10,[{good:'timber',qty:1}])];
    const r=resolveGoodsEconomy(s);expect(r.balances.find(b=>b.city==='mine'&&b.good==='timber')!.capex).toBe(0);
    for(const b of r.balances)expect(b.opening+produced(b)+b.imported).toBeCloseTo(b.consumed_household+b.consumed_state+b.consumed_as_input+b.exported+b.stored+b.capex+b.lost_spoilage);});
  it('uses actual soldiers including explicit zero, independently of policy',()=>{
    expect(actualSoldiers([{soldiers:0,unit_count:100}])).toBe(0);
    const c=[{population_warriors:1000}];const a=computeWorkforceBreakdown(c,0.3,0,0,50);
    expect(a.activePopRaw).toBe(900);expect(a.workforce).toBe(400);expect(a.mobilizationCapacity).toBe(135);});
  it('bulk friction blocks stone while valuable luxury goods travel',()=>{
    const s=setup();s.cities=[city('source',0,2),city('consumer',1,4)];
    const stone={...good('stone','construction',1),stage:'final',bulk:30,density:0.1};
    const silk={...good('robe','luxury_clothing',100),stage:'final',bulk:0.1,density:100,prestige:1};
    s.goods=[stone,silk];s.producers=[producer('stone','source','stone',20),producer('robe','source','robe',20)];s.edges[0].cost=30;
    const r=resolveGoodsEconomy(s);expect(r.flows.filter(f=>f.good==='stone')).toHaveLength(0);
    expect(r.flows.some(f=>f.good==='robe'&&f.delivered>0)).toBe(true);
  });
  it('a serviced junction aggregates and reexports without a production bonus',()=>{
    const s=setup();s.cities=[city('hamlet',0),city('junction',1,3),city('capital',2,4)];
    s.cities[2].population=5000;s.cities[2].classes={peasants:5000};
    s.cities[1].storage=30;s.goods=[{...good('cloth','basic_clothing',20),stage:'final'}];
    s.producers=[producer('weaver','hamlet','cloth',20)];
    s.edges=[{...s.edges[0],id:'a'},{...s.edges[0],id:'b',from:'1,0',to:'2,0'}];
    const r=resolveGoodsEconomy(s);const j=r.metrics.find(m=>m.city==='junction')!;
    expect(j.production_importance).toBe(0);expect(j.aggregation_importance).toBeGreaterThan(0);
    expect(j.reexport_value).toBeGreaterThan(0);
    expect(r.flows.some(f=>f.source==='hamlet'&&f.destination==='junction'&&f.reason==='hub_aggregation')).toBe(true);
    expect(r.flows.some(f=>f.source==='junction'&&f.destination==='capital')).toBe(true);
  });
  it('sustained exports create a persistent candidate, premium flows, then decay',()=>{
    const s=setup();s.cities=[city('bakery',0,2),city('court',1,4)];s.cities[0].guild=2;
    s.cities[1].population=12000;s.cities[1].classes={peasants:12000};
    s.goods=[good('spice'),{...good('pastries','feast',100),stage:'final',prestige:1}];
    s.producers=[producer('spice','bakery','spice',20),{...producer('pastries','bakery','pastries',20,[{good:'spice',qty:1}]),distinctive:true}];
    for(let turn=1;turn<=3;turn++){s.turn=turn;const r=resolveGoodsEconomy(s);s.fame=r.famous;}
    expect(s.fame[0]?.created).toBe(3);expect(s.fame[0]?.streak).toBe(3);
    s.turn=4;const branded=resolveGoodsEconomy(s);expect(branded.flows.some(f=>f.famous&&f.gross_value>f.delivered*100)).toBe(true);
    s.fame=branded.famous;s.producers=[];s.turn=5;const dormant=resolveGoodsEconomy(s);
    expect(dormant.famous[0].fame).toBeLessThan(s.fame[0].fame);expect(dormant.famous[0].created).toBe(3);
  });
  it('normalizes historical percent allocations without reviving explicit zero sectors',()=>{
    expect(normalizeLabor({farming:60,crafting:25,scribes:5,canal:10})).toEqual({farming:0.6,crafting:0.25,administration:0.05,logistics:0.1});
    expect(normalizeLabor({farming:0,crafting:100})).toEqual({farming:0,crafting:1,administration:0,logistics:0});
  });
  it('does not feed raw industrial inputs to households as basket substitutes',()=>{
    const s=setup();s.goods=[{...good('ore','tools'),stage:'raw',finalUse:false},{...good('tool','tools'),stage:'final'}];
    s.producers=[producer('ore','mine','ore')];const r=resolveGoodsEconomy(s);
    expect(r.balances.filter(b=>b.good==='ore').every(b=>b.consumed_household===0)).toBe(true);
    expect(r.balances.find(b=>b.city==='mine'&&b.good==='tool')!.unmet_demand).toBeGreaterThan(0);
  });
  it('rejects a transport whose spoilage and tolls exceed delivered value',()=>{
    const s=setup();s.goods[0].perishability=0.9;s.edges[0].toll=2;
    expect(resolveGoodsEconomy(s).flows).toHaveLength(0);
  });
  it('requires and reserves a physical route from a remote mine to its city',()=>{
    const s=setup();s.producers=[{...producer('ore','mine','ore',10),cell:'-1,0'}];
    expect(resolveGoodsEconomy(s).diagnostics[0].blocked).toBe('missing_local_delivery_route');
    s.edges.push({...s.edges[0],id:'local',from:'-1,0',to:'0,0',capacity:3});
    const r=resolveGoodsEconomy(s);expect(r.diagnostics[0].realized).toBe(3);
    expect(r.diagnostics[0].delivery_path).toEqual(['-1,0','0,0']);
  });
});
