import { describe, it, expect } from 'vitest';
import { parcelPotential, parcelProducers, parcelClosing, parcelWorkshops, type EconomicParcel } from '../../supabase/functions/_shared/parcelEconomy';
import { resolveGoodsEconomy, produced, type City, type Good } from '../../supabase/functions/_shared/goodsEconomy';
import { RECIPES, GOODS } from '../../supabase/functions/_shared/productionCatalog';

const recipes = new Map(RECIPES.map(r => [r.key, { recipe_key:r.key, output_good_key:r.output, output_quantity:r.qty, labor_cost:1, input_items:r.inputs.map(i=>({key:i.good,qty:i.qty})) }]));
const terrain = [{q:0,r:0,biome_family:'forest',has_river:true,is_passable:true}, {q:1,r:0,biome_family:'forest',is_passable:true}];
const parcel = (id:string, sub_biome='clearing', x=0): EconomicParcel => ({id,grid_x:x,grid_y:0,parcel_index:0,sub_biome,buildable:true,status:'claimed',city_id:'P',owner_player:'Player',capacity_slots:2});
const city: City = {id:'P',owner:'Player',name:'P',cell:'0,0',population:100,classes:{peasants:100},soldiers:0,stability:0.65,irrigation:0,labor:{},market:1,storage:10,admin:0,security:1,guild:0,ideology:'customary_local',coastal:false};
const goods: Good[] = GOODS.map(g => ({key:g.key,basket:g.basket,price:1,stage:g.stage,storable:!['raw_meat','raw_fish','well_water'].includes(g.key),bulk:1,density:30,perishability:0,storageLoss:0,storageCost:0,substitutability:1,strategic:0,prestige:0,transshipment:0,finalUse:g.finalUse,household:(g as any).household}));
describe('owned physical parcel economy', () => {
  it('river supplies water without a well; sea never supplies potable water', () => {
    expect(parcelPotential(parcel('p'),terrain).some(p=>p.recipe==='draw_river_water')).toBe(true);
    expect(parcelPotential(parcel('p'),[{q:0,r:0,biome_family:'sea',coastal:true}]).some(p=>p.recipe==='draw_river_water')).toBe(false);
  });
  it('canonical seat land_use=open has the same legal natural sources as wild land',()=>{
    expect(parcelPotential({...parcel('p'),land_use:'open'},terrain)).toEqual(parcelPotential(parcel('p'),terrain));
  });
  it('unclaimed, blocked, civic, foreign and disconnected parcels yield nothing', () => {
    for(const change of [{status:'wild'}, {status:'blocked'}, {land_use:'civic'}, {owner_player:'AI'}, {grid_x:9}])
      expect(parcelProducers([{...parcel('p'),...change}],terrain,[city],recipes,1)).toEqual([]);
  });
  it('diagonal freshwater needs a real passable intermediate square',()=>{
    const diag={q:1,r:1,biome_family:'forest',has_river:true,is_passable:true};
    expect(parcelPotential(parcel('p'),[{...terrain[0],has_river:false},diag]).some(p=>p.recipe==='draw_river_water')).toBe(false);
    expect(parcelPotential(parcel('p'),[{...terrain[0],has_river:false},terrain[1],diag]).some(p=>p.recipe==='draw_river_water')).toBe(true);
  });
  it('hand processing physically consumes timber/stone before reserve conversion, never copies raw stock',()=>{
    const seat={...parcel('seat'),status:'occupied',land_use:'civic'};
    const producers=parcelWorkshops([seat],[city],recipes);
    const r=resolveGoodsEconomy({turn:1,goods,cities:[city],producers,edges:[],fame:[],opening:[{city:'P',good:'raw_timber',qty:3,quality:1},{city:'P',good:'raw_stone',qty:3,quality:1}]});
    expect(producers.every(p=>!p.source&&p.recipe.inputs.length>0)).toBe(true);
    expect(r.balances.find(b=>b.good==='raw_timber')?.consumed_as_input).toBeGreaterThan(0);
    expect(r.balances.find(b=>b.good==='lumber')?.capex).toBeGreaterThan(0);
    for(const b of r.balances) expect(b.opening+produced(b)+b.imported).toBeCloseTo(b.consumed_household+b.consumed_state+b.consumed_as_input+b.exported+b.stored+b.capex+b.lost_spoilage,6);
  });
  it('claimed second macro square adds production, never duplicates the same parcel', () => {
    const a=parcel('a'),b=parcel('b','dense_forest',1);
    const first=parcelProducers([a],terrain,[city],recipes,1),expanded=parcelProducers([a,a,b],terrain,[city],recipes,1);
    expect(expanded.length).toBeGreaterThan(first.length);
    expect(new Set(expanded.map(p=>p.id)).size).toBe(expanded.length);
  });
  it('forest has timber/game, desert has none; farming is not replaced by infinite gathering',()=>{
    expect(parcelPotential(parcel('a','dense_forest'),terrain).some(p=>p.recipe==='fell_timber')).toBe(true);
    expect(parcelPotential(parcel('a','sand_flat'),terrain)).toEqual([]);
    expect(parcelPotential(parcel('a'),terrain).find(p=>p.recipe==='gather_wild_seeds')?.capacity).toBeLessThan(7);
  });
  it('real solver 0/1/5/20: finite harvesting, exact labour, conserved stocks and idempotent refresh',()=>{
    let ecology = {}, opening: any[] = [];
    const parcels = Array.from({length:8},(_,i)=>parcel(`${i}`,i<2?'dense_forest':'clearing'));
    let harvested=0;
    for(let turn=1;turn<=20;turn++){
      const producers=parcelProducers(parcels,terrain,[city],recipes,turn,ecology);
      const snap={turn,goods,cities:[city],producers,edges:[],fame:[],opening};
      const r=resolveGoodsEconomy(snap);
      expect(resolveGoodsEconomy(snap)).toEqual(r);
      expect(r.labor[0].employed_total).toBeLessThanOrEqual(r.labor[0].available_workforce+1e-6);
      for(const b of r.balances) expect(b.opening+produced(b)+b.imported).toBeCloseTo(b.consumed_household+b.consumed_state+b.consumed_as_input+b.exported+b.stored+b.capex+b.lost_spoilage,6);
      for(const p of producers) expect(r.diagnostics.find(d=>d.producer===p.id)?.realized || 0).toBeLessThanOrEqual(p.capacity+1e-6);
      harvested+=r.diagnostics.filter(d=>d.good==='raw_grain').reduce((s,d)=>s+d.realized,0);
      ecology=parcelClosing(producers,r.diagnostics);
      opening=r.balances.filter(b=>b.stored>0).map(b=>({city:b.city,good:b.good,qty:b.stored,quality:b.quality}));
    }
    expect(harvested).toBeGreaterThan(0);
    expect(harvested).toBeLessThan(6*0.55*20);
  });
});