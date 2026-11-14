// @vitest-environment node
import { describe,it,expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { advanceRural,ruralTurn,ruralCatchments,allocateRuralLabor,foundingTransfer,aggregateRuralPopulationByCity } from '../../supabase/functions/_shared/ruralGameplay';
import { type RuralCell } from '../../supabase/functions/_shared/ruralPopulation';
const row={q:0,r:0,carrying_capacity:1000,rural_population:500,mobile_population:40,last_resolved_turn:19};
const cell={q:0,r:0,seed:'x',is_passable:true,biome_family:'plains',moisture_band:2,temp_band:2,mean_height:0.2,forest_density:0,coastal:false,has_river:false,movement_cost:1,access_score:1,owner_player:'p',province_id:'province'} satisfies RuralCell & {owner_player:string;province_id:string};
const city={id:'a',owner:'p',cell:'0,0',population:100,housing:400,stability:70,food:1,vacancies:100};
describe('Phase C active rural state',()=>{
  it('takes exactly one deterministic logistic step from a stale baseline and never exceeds capacity',()=>{
    expect(advanceRural(row,27)).toEqual({...row,rural_population:503,mobile_population:40,last_resolved_turn:27});
    expect(advanceRural({...row,rural_population:1000},27).rural_population).toBe(1000);
    expect(advanceRural(row,20).rural_population).toBe(advanceRural(row,27).rural_population);
  });
  it('replayed and stale turns cannot change residents or transfer again',()=>{
    const first=ruralTurn('seed',[cell],[row],[city],27);
    expect(ruralTurn('seed',[cell],first.rows,[city],27).immigration).toEqual({});
    expect(advanceRural(first.rows[0],26)).toEqual(first.rows[0]);
  });
  it('caps migration at 3 percent and subtracts exactly what is added',()=>{
    const out=ruralTurn('seed',[cell],[row],[city],27);
    expect(out.immigration.a).toBe(15);
    expect(out.rows[0].rural_population+out.immigration.a).toBe(503);
    expect(out.rows[0].mobile_population).toBe(25);
  });
  it('housing, actual vacancies, food and stability cap or refuse migration',()=>{
    expect(ruralTurn('s',[cell],[row],[{...city,housing:102}],27).immigration.a).toBe(2);
    expect(ruralTurn('s',[cell],[row],[{...city,vacancies:1}],27).immigration.a).toBe(1);
    for(const c of [{...city,food:0},{...city,stability:59},{...city,vacancies:0}])expect(ruralTurn('s',[cell],[row],[c],27).immigration).toEqual({});
  });
  it('food and water shortages suppress rural growth instead of allowing capacity-only growth',()=>{
    const calm=advanceRural(row,27,{food:1,water:1});
    const hungry=advanceRural(row,27,{food:0.2,water:0.2});
    expect(calm.rural_population).toBeGreaterThan(row.rural_population);
    expect(hungry.rural_population).toBeLessThan(row.rural_population);
    expect(advanceRural(row,27,{food:0.2,water:0.2})).toEqual(hungry);
  });
  it('road-connected rural cells migrate more readily than equally distant off-road cells',()=>{
    const ruralCell={...cell,q:1,r:0,grid_x:1,grid_y:0};
    const ruralRow={...row,q:1,r:0};
    const destination={...city,cell:'0,0'};
    const connected=ruralTurn('s',[ruralCell],[ruralRow],[destination],27,[
      {from_x:0,from_y:0,to_x:1,to_y:0,owner_player:'p',status:'completed'},
    ]);
    const disconnected=ruralTurn('s',[ruralCell],[ruralRow],[destination],27,[
      {from_x:5,from_y:5,to_x:6,to_y:5,owner_player:'p',status:'completed'},
    ]);
    expect(connected.immigration.a).toBe(15);
    expect(disconnected.immigration.a).toBeLessThan(connected.immigration.a);
    expect(connected.rows[0].rural_population+connected.immigration.a).toBe(503);
  });
  it('assigns each controlled contiguous cell once with stable nearest-city ties; no foreign catchment',()=>{
    const cells=[cell,{...cell,q:1},{...cell,q:1,r:-1,grid_x:1,grid_y:-1},{...cell,q:2},{...cell,q:3,owner_player:'enemy'},{...cell,q:4}];
    const cities=[city,{...city,id:'b',cell:'2,0'}];
    const a=ruralCatchments(cells,cities),b=ruralCatchments(cells,[...cities].reverse());
    expect(a).toEqual(b);expect(a.get('1,0')).toBe('a');expect(a.get('1,-1')).toBe('a');expect(a.has('4,0')).toBe(false);
  });
  it('recovers a legacy city catchment from its nearest owned province cell and never crosses impassable cells',()=>{
    const cells=[
      {...cell,q:10,r:10,grid_x:10,grid_y:10},
      {...cell,q:11,r:10,grid_x:11,grid_y:10},
      {...cell,q:12,r:10,grid_x:12,grid_y:10,is_passable:false},
      {...cell,q:10,r:11,grid_x:10,grid_y:11,province_id:'other'},
    ];
    const catchments=ruralCatchments(cells,[{...city,cell:'0,0',province_id:'province'}]);
    expect(catchments.get('10,10')).toBe('a');
    expect(catchments.get('11,10')).toBe('a');
    expect(catchments.has('12,10')).toBe(false);
    expect(catchments.has('10,11')).toBe(false);
  });
  it('aggregates rural households once into their single city market catchment',()=>{
    const catchments=new Map([['0,0','a'],['1,0','a'],['2,0','b']]);
    const population=new Map([['0,0',100],['1,0',50],['2,0',25],['3,0',999]]);
    expect([...aggregateRuralPopulationByCity(catchments,population)].sort()).toEqual([['a',150],['b',25]]);
  });
  it('founding planning conserves 100 people and refuses insufficient population',()=>{
    const out=foundingTransfer([row]);expect(out[0].rural_population).toBe(400);expect(out[0].mobile_population).toBe(0);
    expect(()=>foundingTransfer([{...row,rural_population:99}])).toThrow('Nedostatek');
  });
  it('allocates one 50-percent cell workforce across all rural jobs, without per-producer duplication',()=>{
    const result=allocateRuralLabor(new Map([['0,0',100]]),[{id:'b',cell:'0,0',jobs:40},{id:'a',cell:'0,0',jobs:40},{id:'c',cell:'1,0',jobs:20}]);
    expect([...result.values()].reduce((s,n)=>s+n,0)).toBe(50);expect(result.get('a')).toBe(40);expect(result.get('b')).toBe(10);expect(result.get('c')).toBe(0);
  });
  it('real PostgreSQL atomic batch rolls back rural subtraction with failed city writes',async()=>{
    const db=new PGlite();try {
      await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE TABLE hex_population(session_id uuid,q int,r int,carrying_capacity int,rural_population int,mobile_population int,last_resolved_turn int,UNIQUE(session_id,q,r));
        CREATE TABLE cities(session_id uuid,id uuid,population_total int);
        CREATE TABLE city_population_ledger(session_id uuid,city_id uuid,turn_number int,local_immigration int,UNIQUE(session_id,city_id,turn_number));`);
      const base=readFileSync('drizzle/migrations/0000_apply_reviewed_turn_atomicity_20260926.sql','utf8');
      await db.exec(base.slice(0,base.indexOf('CREATE OR REPLACE FUNCTION public.apply_goods_fiscal_plan')));
      await db.exec(readFileSync('drizzle/migrations/0023_rural_population_atomic_world_phase.sql','utf8'));
      const s='00000000-0000-0000-0000-000000000001';
      const write={table:'hex_population',action:'upsert',conflict:'session_id,q,r',filters:[],values:{session_id:s,...row}};
      await db.query('select apply_turn_write_batch($1,$2)',[s,JSON.stringify([write])]);
      await expect(db.query('select apply_turn_write_batch($1,$2)',[s,JSON.stringify([{...write,values:{...write.values,rural_population:485}},{table:'cities',action:'insert',values:{session_id:s,unknown:1},filters:[]}])])).rejects.toThrow();
      expect((await db.query('select rural_population from hex_population')).rows).toEqual([{rural_population:500}]);
      await db.query('select apply_turn_write_batch($1,$2)',[s,JSON.stringify([{...write,values:{...write.values,rural_population:485}},{table:'city_population_ledger',action:'upsert',conflict:'session_id,city_id,turn_number',filters:[],values:{session_id:s,city_id:s,turn_number:27,local_immigration:15}}])]);
      expect((await db.query('select rural_population from hex_population')).rows).toEqual([{rural_population:485}]);
      expect((await db.query('select local_immigration from city_population_ledger')).rows).toEqual([{local_immigration:15}]);
    }finally{await db.close();}
  },20000);
  it('atomically founds a city from nearby rural settlers and is idempotent',async()=>{
    const db=new PGlite();try{
      await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE TABLE game_sessions(id uuid PRIMARY KEY);
        CREATE TABLE cities(
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid NOT NULL,owner_player text NOT NULL,name text NOT NULL,
          province_id uuid,province text,level text NOT NULL,settlement_level text NOT NULL,tags text[],founded_round int NOT NULL,
          flavor_prompt text,province_q int NOT NULL,province_r int NOT NULL,grid_x int,grid_y int,founded_parcel_index int,
          population_total int NOT NULL,population_peasants int NOT NULL,population_burghers int NOT NULL,
          population_clerics int NOT NULL,population_warriors int,city_stability int,local_grain_reserve int,local_granary_capacity int);
        CREATE TABLE province_hexes(
          id uuid DEFAULT gen_random_uuid(),session_id uuid NOT NULL,q int NOT NULL,r int NOT NULL,
          owner_player text,province_id uuid,is_passable boolean NOT NULL,biome_family text NOT NULL,
          PRIMARY KEY(session_id,q,r));
        CREATE TABLE hex_population(
          id uuid DEFAULT gen_random_uuid(),session_id uuid NOT NULL,q int NOT NULL,r int NOT NULL,
          rural_population int NOT NULL,mobile_population int NOT NULL,updated_at timestamptz DEFAULT now(),
          PRIMARY KEY(session_id,q,r));`);
      await db.exec(readFileSync('drizzle/migrations/0025_rural_households_and_atomic_founding.sql','utf8'));
      const session='00000000-0000-0000-0000-000000000011',province='00000000-0000-0000-0000-000000000012';
      await db.query('INSERT INTO game_sessions(id) VALUES($1)',[session]);
      for(const [q,r,owner] of [[0,0,'p'],[1,0,'p'],[0,1,'p'],[0,-1,'enemy']] as any[]){
        await db.query('INSERT INTO province_hexes(session_id,q,r,owner_player,province_id,is_passable,biome_family) VALUES($1,$2,$3,$4,$5,true,\'plains\')',[session,q,r,owner,province]);
        await db.query('INSERT INTO hex_population(session_id,q,r,rural_population,mobile_population) VALUES($1,$2,$3,60,5)',[session,q,r]);
      }
      const args=[session,'cmd-found-1',4,'p','Nová Ves',province,'Provincie',null,null,0,0,null,100];
      const first:any=await db.query('SELECT public.found_city_with_rural_settlers($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) AS result',args);
      const result:any=first.rows[0].result;
      expect(result.transferred).toBe(100);expect(result.idempotent).toBe(false);
      const cityCount:any=await db.query('SELECT count(*)::int AS n FROM cities');
      expect(cityCount.rows[0].n).toBe(1);
      const ruralAfterFounding:any=await db.query("SELECT sum(hp.rural_population)::int AS n FROM hex_population hp JOIN province_hexes ph ON ph.session_id=hp.session_id AND ph.q=hp.q AND ph.r=hp.r WHERE ph.owner_player='p'");
      expect(ruralAfterFounding.rows[0].n).toBe(80);
      const cityClasses:any=await db.query('SELECT population_total,population_peasants,population_burghers,population_clerics FROM cities');
      expect(cityClasses.rows[0]).toEqual({population_total:100,population_peasants:80,population_burghers:15,population_clerics:5});
      const replay:any=await db.query('SELECT public.found_city_with_rural_settlers($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) AS result',args);
      expect(replay.rows[0].result.idempotent).toBe(true);
      expect(replay.rows[0].result.city_id).toBe(result.city_id);
      const cityCountAfterReplay:any=await db.query('SELECT count(*)::int AS n FROM cities');
      expect(cityCountAfterReplay.rows[0].n).toBe(1);
      await expect(db.query('SELECT public.found_city_with_rural_settlers($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
        [session,'cmd-found-2',4,'p','Too Few',province,'Provincie',null,null,1,0,null,100])).rejects.toThrow('INSUFFICIENT_RURAL_SETTLERS');
      const ruralAfterFailedFounding:any=await db.query("SELECT sum(hp.rural_population)::int AS n FROM hex_population hp JOIN province_hexes ph ON ph.session_id=hp.session_id AND ph.q=hp.q AND ph.r=hp.r WHERE ph.owner_player='p'");
      expect(ruralAfterFailedFounding.rows[0].n).toBe(80);
      const cityCountAfterFailure:any=await db.query('SELECT count(*)::int AS n FROM cities');
      expect(cityCountAfterFailure.rows[0].n).toBe(1);
    }finally{await db.close();}
  },20000);
});