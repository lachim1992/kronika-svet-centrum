import { it, expect } from 'vitest';
import { parcelProducers } from '../../supabase/functions/_shared/parcelEconomy';
import { resolveGoodsEconomy, produced, type City, type Good } from '../../supabase/functions/_shared/goodsEconomy';
import { RECIPES, GOODS } from '../../supabase/functions/_shared/productionCatalog';
import { buildSnapshot } from '../../supabase/functions/economy-dev-snapshot/build';
import { buildManagementReport } from '../../supabase/functions/_shared/management';
import { CONSTRUCTION_FIELDS } from '../lib/economyFieldContract';

const city:City={id:'c',owner:'p',name:'Hamlet',cell:'0,0',population:100,classes:{peasants:100},soldiers:0,stability:1,irrigation:0,labor:{},market:1,storage:10,admin:0,security:1,guild:0,ideology:'customary_local',coastal:false};
const goods:Good[]=GOODS.map(g=>({key:g.key,basket:g.basket,price:1,stage:g.stage,storable:true,bulk:1,density:30,perishability:0,storageLoss:0,storageCost:0,substitutability:1,strategic:0,prestige:0,transshipment:0,finalUse:g.finalUse,household:g.household}));
const recipes=new Map(RECIPES.map(r=>[r.key,{recipe_key:r.key,output_good_key:r.output,output_quantity:r.qty,labor_cost:1}]));
const parcels=['dense_forest','rocky_shelf'].map((sub_biome,i)=>({id:`land${i}`,grid_x:0,grid_y:0,parcel_index:i,sub_biome,buildable:true,status:'claimed',land_use:'open',city_id:'c',owner_player:'p',capacity_slots:2}));
const producers=parcelProducers(parcels,[{q:0,r:0,biome_family:'forest',has_river:true}], [city], recipes,1);
const snapshot={turn:1,goods,cities:[city],producers,edges:[],fame:[],opening:[]};

it('100-person forest/rock hamlet without processors earns bounded positive construction from raw harvest',()=>{
  expect(producers.every(p=>p.source)).toBe(true);
  const r=resolveGoodsEconomy(snapshot);
  for(const [key,efficiency] of [['raw_timber',0.2],['raw_stone',0.15]] as const){
    const b=r.balances.find(b=>b.good===key);expect(b).toBeDefined();if(!b)return;
    expect(b.capex).toBeGreaterThan(0);expect(b.capex).toBeLessThanOrEqual(1);
    expect(b.construction_efficiency).toBe(efficiency);
    expect(b.construction_points).toBeCloseTo(b.capex*efficiency,8);
    expect(b.construction_points).toBeLessThan(b.capex);
    expect(b.stored+b.capex).toBeCloseTo(b.opening+produced(b)-b.consumed_as_input,6);
    expect(b.stored_lots?.reduce((s,l)=>s+l.qty,0)).toBeCloseTo(b.stored,6);
  }
  for(const b of r.balances)expect(b.opening+produced(b)+b.imported).toBeCloseTo(b.consumed_household+b.consumed_state+b.consumed_as_input+b.exported+b.capex+b.stored+b.lost_spoilage,6);
  expect(resolveGoodsEconomy(snapshot)).toEqual(r);
});
it('projects consume first; their raw material is not also awarded as reserve',()=>{
  const r=resolveGoodsEconomy({...snapshot,cities:[{...city,constructionProjects:100}],goods:goods.map(g=>g.key==='raw_timber'?{...g,basket:'construction',finalUse:true}:g)});
  const b=r.balances.find(b=>b.good==='raw_timber');expect(b?.consumed_state).toBeGreaterThan(0);
  expect(b?.capex).toBe(0);expect(b?.construction_points).toBe(0);
});
it('both secure reports preserve physical withdrawals, stock and normalized construction points',()=>{
  const r=resolveGoodsEconomy(snapshot),report=buildManagementReport(snapshot,r,{player_name:'p',production_reserve:50});
  const dev=buildSnapshot({...r,snapshot},null);
  const raw=r.balances.find(b=>b.good==='raw_timber');
  expect(dev.construction_balances.find(b=>b.good==='raw_timber')).toEqual(raw);
  expect(report.cities.flatMap(c=>c.balances).find(b=>b.good==='raw_timber')).toEqual(raw);
  expect(report.metrics.find(m=>m.key==='construction_incoming')?.value).toBeCloseTo(r.balances.reduce((s,b)=>s+(b.construction_points??0),0),8);
  for(const key of ['capex','stored','construction_efficiency','construction_points'])expect(CONSTRUCTION_FIELDS.some(f=>f.key===key)).toBe(true);
});