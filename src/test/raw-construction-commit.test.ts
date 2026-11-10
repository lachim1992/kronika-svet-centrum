// @vitest-environment node
import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolveGoodsEconomy } from '../../supabase/functions/_shared/goodsEconomy';
import { parcelProducers } from '../../supabase/functions/_shared/parcelEconomy';
import fixture from './fixtures/parcel-jv72o7-preflight.json';
import { RECIPES } from '../../supabase/functions/_shared/productionCatalog';

it('real PostgreSQL fiscal function commits raw construction once, rejects mismatched credit, and retries without minting',async()=>{
  const db=new PGlite();
  try {
    const s='00000000-0000-0000-0000-000000000001',c='00000000-0000-0000-0000-000000000002';
    await db.exec(`CREATE TABLE realm_resources(id uuid,session_id uuid,player_name text,gold_reserve numeric,production_reserve numeric,last_processed_turn integer);
      CREATE TABLE game_sessions(id uuid,current_turn integer,resolving_turn integer);
      CREATE TABLE cities(id uuid,owner_player text);
      CREATE TABLE economy_turn_ledgers(session_id uuid,turn_number integer,committed boolean);
      CREATE TABLE city_good_balances(session_id uuid,turn_number integer,city_id uuid,balance jsonb);
      INSERT INTO realm_resources VALUES('${c}','${s}','p',75,50,0);
      INSERT INTO game_sessions VALUES('${s}',1,NULL);
      INSERT INTO cities VALUES('${c}','p');
      INSERT INTO economy_turn_ledgers VALUES('${s}',1,false);`);
    await db.exec(readFileSync('drizzle/migrations/0012_validate_normalized_construction_points.sql','utf8'));
    const city={...fixture.snapshot.cities[0],id:c,owner:'p',population:100,classes:{peasants:100},cell:'0,0'};
    const recipes=new Map(RECIPES.map(r=>[r.key,{recipe_key:r.key,output_good_key:r.output,output_quantity:r.qty,labor_cost:1}]));
    const parcels=['dense_forest','rocky_shelf'].map((sub_biome,i)=>({id:`land${i}`,grid_x:0,grid_y:0,parcel_index:i,sub_biome,buildable:true,status:'claimed',land_use:'open',city_id:c,owner_player:'p',capacity_slots:2}));
    const producers=parcelProducers(parcels,[{q:0,r:0,has_river:true}], [city] as any,recipes,1);
    const snapshot={...fixture.snapshot,cities:[city],producers,opening:[],edges:[],fame:[]};
    const ledger=resolveGoodsEconomy(snapshot as any);
    expect(producers.every(p=>p.source)).toBe(true);
    const points=ledger.balances.reduce((s,b)=>s+(b.construction_points??0),0);
    expect(points).toBeGreaterThan(0);expect(points).toBeLessThanOrEqual(0.35);
    for(const b of ledger.balances)await db.query('INSERT INTO city_good_balances VALUES($1,1,$2,$3)',[s,c,JSON.stringify(b)]);
    const call=(delta:number)=>db.query('SELECT apply_goods_fiscal_turn($1,$2,1,$3,0,$4) as paid',[s,'p','{}',delta]);
    await expect(call(points+1)).rejects.toThrow('CAPEX differs from physical ledger');
    expect((await call(points)).rows).toEqual([{paid:true}]);
    await db.exec(`UPDATE economy_turn_ledgers SET committed=true WHERE session_id='${s}';`);
    expect((await call(points)).rows).toEqual([{paid:false}]);
    const row=(await db.query<{production_reserve:string;gold_reserve:string}>('SELECT production_reserve,gold_reserve FROM realm_resources')).rows[0];
    expect(Number(row.production_reserve)).toBeCloseTo(50+points,8);expect(Number(row.gold_reserve)).toBe(75);
    for(const b of ledger.balances.filter(b=>['raw_timber','raw_stone'].includes(b.good)))expect(b.stored+b.capex+b.consumed_as_input+b.lost_spoilage).toBeCloseTo(b.produced_facility,6);
  } finally {await db.close();}
},20000);