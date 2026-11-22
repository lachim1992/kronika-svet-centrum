import { describe, expect, it } from 'vitest';
import { resolveGoodsEconomy, produced, type Snapshot, type Good, type City, type Producer } from '../../supabase/functions/_shared/goodsEconomy';
import { ECONOMY } from '../../supabase/functions/_shared/economyConfig';
const goods:Good[]=[{key:'cloth',basket:'luxury_clothing',price:10,stage:'final',storable:true,
  bulk:1,density:30,perishability:0,storageLoss:0,storageCost:0,substitutability:1,strategic:0,
  prestige:0,transshipment:0,finalUse:true}];
const town:City={id:'town',owner:'p',name:'town',cell:'0,0',population:300,
 classes:{peasants:300},soldiers:0,stability:1,irrigation:0,labor:{},market:2,storage:10,
 admin:0,security:1,guild:0,ideology:'open_merchant',coastal:false};
const workshop:Producer={id:'loom',city:'town',channel:'node',capacity:20,jobs:20,
 recipe:{key:'loom',good:'cloth',qty:1,inputs:[],labor:1/ECONOMY.workersPerLaborUnit,quality:0,minQuality:0},
 allocation:1,staffing:1,logistics:1,mastery:1,source:true,distinctive:false};
const base=():Snapshot=>({turn:2,goods,cities:[town],producers:[workshop],edges:[],opening:[],fame:[]});
describe('physical stock overhang diagnostics',()=>{
 it('reports physical overhang without treating it as revenue',()=>{
   const s=base();s.cities=[{...town,population:0,classes:{peasants:300}}];
   const r=resolveGoodsEconomy(s),b=r.balances.find(x=>x.good==='cloth')!;
   expect(b.surplus_overhang).toBeCloseTo(b.stored+b.lost_discard);
   expect(b.inventory_cover_turns==null||b.inventory_cover_turns>=0).toBe(true);
   expect(b.production_to_outflow_ratio==null||b.production_to_outflow_ratio>=0).toBe(true);
   expect(b.opening+produced(b)+b.imported).toBeCloseTo(
     b.consumed_household+b.consumed_state+b.consumed_as_input+b.exported+b.stored+b.capex+b.lost_spoilage);
 });
 it('retains nonnegative and deterministic metrics under existing opening stock',()=>{
   const s=base();s.opening=[{city:'town',good:'cloth',qty:8,quality:1}];
   const a=resolveGoodsEconomy(s).balances[0],b=resolveGoodsEconomy(s).balances[0];
   expect(a.surplus_overhang).toEqual(b.surplus_overhang);
   expect(a.inventory_cover_turns).toEqual(b.inventory_cover_turns);
   expect(a.surplus_overhang).toBeGreaterThanOrEqual(0);
 });
});
