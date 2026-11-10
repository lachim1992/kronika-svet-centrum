import { it, expect } from 'vitest';
import fixture from './fixtures/parcel-jv72o7-preflight.json';
import { resolveGoodsEconomy, produced, type Snapshot } from '../../supabase/functions/_shared/goodsEconomy';
import { parcelProducers, parcelClosing } from '../../supabase/functions/_shared/parcelEconomy';
import { RECIPES } from '../../supabase/functions/_shared/productionCatalog';

// Frozen read-only save geography, NOT a replay of live process-turn/fiscal/demography.
it('JV72O7 actual seeded geography: player + AI 1/5/20, no free-source nodes, food/water/fuel and physical identity',()=>{
  const base=fixture.snapshot as unknown as Snapshot;
  const parcels=fixture.parcels.map(p=>({...p,id:`preview:${p.grid_x}:${p.grid_y}:${p.parcel_index}`}));
  const recipes=new Map(RECIPES.map(r=>[r.key,{recipe_key:r.key,output_good_key:r.output,output_quantity:r.qty,labor_cost:1}]));
  let ecology={},opening=base.opening;
  expect(base.producers.filter(p=>p.channel==='node'&&p.source)).toEqual([]);
  for(let turn=1;turn<=20;turn++){
    const sources=parcelProducers(parcels,fixture.terrain,base.cities,recipes,turn,ecology);
    const snapshot={...base,turn,opening,producers:[...base.producers.filter(p=>!p.parcel),...sources]};
    const r=resolveGoodsEconomy(snapshot);
    expect(resolveGoodsEconomy(snapshot)).toEqual(r);
    for(const b of r.balances)expect(b.opening+produced(b)+b.imported).toBeCloseTo(b.consumed_household+b.consumed_state+b.consumed_as_input+b.exported+b.stored+b.capex+b.lost_spoilage,6);
    for(const l of r.labor)expect(l.employed_total).toBeLessThanOrEqual(l.available_workforce+1e-6);
    for(const c of base.cities)for(const basket of ['staple_food','drinking_water','fuel']){
      const bs=r.balances.filter(b=>b.city===c.id&&base.goods.find(g=>g.key===b.good)?.basket===basket);
      const demand=bs.reduce((s,b)=>s+b.demand,0),unmet=bs.reduce((s,b)=>s+b.unmet_demand,0);
      expect(demand?1-unmet/demand:1,`${turn} ${c.name} ${basket}`).toBeGreaterThanOrEqual(basket==='fuel'?0.8:1-1e-6);
    }
    ecology=parcelClosing(sources,r.diagnostics);
    opening=r.balances.filter(b=>b.stored>0).map(b=>({city:b.city,good:b.good,qty:b.stored,quality:b.quality,lots:b.stored_lots}));
  }
});