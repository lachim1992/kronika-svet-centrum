import { describe, it, expect } from 'vitest';
import { resolveGoodsEconomy, produced, type City, type Good, type Producer, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { GOODS, RECIPES, DISTINCTIVE_RECIPE_KEYS } from '../../supabase/functions/_shared/productionCatalog';
import { foodShortageImpact } from '../../supabase/functions/_shared/foodShortage';
import { ECONOMY } from "../../supabase/functions/_shared/economyConfig";
// Fixture crews are one person per output unit; the engine measures labour in crews of ECONOMY.workersPerLaborUnit.
const FIXTURE_LABOR = 1 / ECONOMY.workersPerLaborUnit;

const city:City={id:'c',owner:'p',name:'C',cell:'0,0',population:1000,classes:{peasants:1000},soldiers:0,
  stability:1,irrigation:0,labor:{},market:1,storage:100,admin:0,security:1,guild:0,ideology:'open_merchant',coastal:false};
const good=(key:string,basket='tools',finalUse=false):Good=>({key,basket,price:10,stage:'processed',storable:true,
  bulk:1,density:30,perishability:0,storageLoss:0,storageCost:0,substitutability:1,strategic:0,prestige:0,transshipment:0,finalUse,household:false});
const producer=(id:string,output:string,inputs:{good:string;qty:number}[]=[],source=false):Producer=>({id,city:'c',channel:'facility',capacity:10,
  recipe:{key:id,good:output,qty:1,inputs,labor:FIXTURE_LABOR,quality:0,minQuality:0},allocation:1,staffing:1,logistics:1,mastery:1,source,distinctive:false});
const snapshot=(goods:Good[],producers:Producer[]=[],opening:Snapshot['opening']=[]):Snapshot=>({turn:1,goods,cities:[city],producers,opening,fame:[],edges:[]});
const stock=(good:string,qty:number)=>({city:'c',good,qty,quality:1});
const conserve=(out:ReturnType<typeof resolveGoodsEconomy>)=>{for(const b of out.balances)
  expect(b.opening+produced(b)+b.imported,`${b.city}/${b.good}`).toBeCloseTo(b.exported+b.consumed_household+b.consumed_state+b.consumed_as_input+b.stored+b.capex+b.lost_spoilage,7);};

describe('economy chain closure',()=>{
  it('turns finished construction materials into capital once, without keeping a duplicate',()=>{
    const out=resolveGoodsEconomy(snapshot([good('construction_materials','construction',true)],[],[stock('construction_materials',100)]));
    expect(out.balances[0].capex).toBeCloseTo(98.75);expect(out.balances[0].stored).toBeCloseTo(0.25);conserve(out);
  });
  it('does not lose final production because an upstream workshop has a later UUID',()=>{
    const run=(id:string)=>resolveGoodsEconomy(snapshot([good('raw'),good('mid'),good('final')],
      [producer(id,'final',[{good:'mid',qty:1}]),producer('m-middle','mid',[{good:'raw',qty:1}])],[stock('raw',20),stock('mid',1)]));
    for(const id of ['a-final','z-final']){const out=run(id);expect(produced(out.balances.find(b=>b.good==='final')!)).toBe(10);conserve(out);}
  });
  it('finishes partial circular production from opening stock without exceeding capacity',()=>{
    const out=resolveGoodsEconomy(snapshot([good('a'),good('b')],
      [producer('a','a',[{good:'b',qty:1}]),producer('b','b',[{good:'a',qty:1}])],[stock('a',3)]));
    expect(out.diagnostics).toHaveLength(2);
    for(const d of out.diagnostics)expect(d.realized).toBe(10);
    conserve(out);
  });
  it('keeps the last food for residents instead of turning it into inedible flour',()=>{
    const out=resolveGoodsEconomy(snapshot([good('raw_grain','staple_food',true),good('flour','staple_food')],
      [producer('mill','flour',[{good:'raw_grain',qty:1}])],[stock('raw_grain',10)]));
    const grain=out.balances.find(b=>b.good==='raw_grain')!;
    expect(grain.consumed_as_input).toBe(0);expect(grain.unmet_demand).toBe(0);conserve(out);
  });
  it('still mills actual food surplus',()=>{
    const out=resolveGoodsEconomy(snapshot([good('raw_grain','staple_food',true),good('flour','staple_food')],
      [producer('mill','flour',[{good:'raw_grain',qty:1}])],[stock('raw_grain',20)]));
    expect(produced(out.balances.find(b=>b.good==='flour')!)).toBe(10);conserve(out);
  });
  it('does not treat low-substitutability grain as an equal amount of bread',()=>{
    const out=resolveGoodsEconomy(snapshot([{...good('raw_grain','staple_food',true),substitutability:0.3},good('baked_staples','staple_food',true)],[],[stock('raw_grain',10)]));
    expect(out.balances.find(b=>b.good==='baked_staples')!.unmet_demand).toBeGreaterThan(5);conserve(out);
  });
  it('preserves state consumption when military demand uses a substitute',()=>{
    const s=snapshot([good('basic','military_supply',true),good('fine','military_supply',true)],[],[stock('fine',100)]);
    s.cities=[{...city,soldiers:100}];const out=resolveGoodsEconomy(s);
    expect(out.balances.reduce((sum,b)=>sum+b.consumed_state,0)).toBeCloseTo(0.4);conserve(out);
  });
  it.each(RECIPES.map(r=>[r.key,r] as const))('actually executes catalog recipe %s with its inputs',(_key,r)=>{
    const catalogGood=GOODS.find(g=>g.key===r.output)!;
    const source=r.role==='source'||(r.role==='producer'&&catalogGood.stage==='raw');
    const goods=[...new Set([r.output,...r.inputs.map(i=>i.good)])].map(k=>good(k));
    const p={...producer(r.key,r.output,r.inputs,source),recipe:{key:r.key,good:r.output,qty:r.qty,inputs:r.inputs,labor:FIXTURE_LABOR,quality:0,minQuality:0}};
    const out=resolveGoodsEconomy(snapshot(goods,[p],r.inputs.map(i=>stock(i.good,100))));
    expect(out.diagnostics[0].blocked).toBeNull();expect(out.diagnostics[0].realized).toBeGreaterThan(0);conserve(out);
  });
  it('makes master recipes eligible for fame using an explicit catalogue contract',()=>{
    for(const key of ['forge_fine_arms','age_wine','craft_jewelry','prepare_feast'])expect(DISTINCTIVE_RECIPE_KEYS.has(key)).toBe(true);
    expect(DISTINCTIVE_RECIPE_KEYS.has('mine_iron')).toBe(false);
  });
  it('scales famine deaths with the unmet fraction and ignores tiny deficits',()=>{
    expect(foodShortageImpact(1000,10,0.00001).deaths).toBe(0);
    expect(foodShortageImpact(1000,10,0.1).famine).toBe(false);
    expect(foodShortageImpact(1000,10,1).deaths).toBe(5);
    expect(foodShortageImpact(1000,10,10).deaths).toBe(50);
    expect(foodShortageImpact(1000,0,1).famine).toBe(false);
  });
});
