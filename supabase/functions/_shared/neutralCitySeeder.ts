/**
 * Deterministic, opt-in provisioning of 16 genuinely economic independent cities.
 * No LLM calls. Caller uses a SERVICE ROLE client during world initialization.
 * Never run on an existing live world: only fresh init after its starter parcel rollout.
 *
 * Unlike province_nodes neutral_settlement, these are normal cities with real
 * parcel seats, source/processing city_buildings, food_specializations and budgets.
 */
import { generateTileParcels, type TileTerrain } from "./tileParcels.ts";
import { seatCityOnParcels, ensureTileParcels } from "./citySeat.ts";
import { FOOD_RESOURCES, foodResourceByKey, foodResourceChance, type FoodResource } from "./foodResources.ts";
import { establishTurns } from "./foodSpecialization.ts";

export interface NeutralCityProfile {
  code: string;
  name: string;
  resources: string[];
  processor: string;
}
export const NEUTRAL_CITY_PROFILES: readonly NeutralCityProfile[] = [
  { code:"wheat", name:"Zlaté Lány", resources:["wheat"], processor:"Mlýn" },
  { code:"barley", name:"Ječmenný Brod", resources:["barley"], processor:"Mlýn" },
  { code:"milpa", name:"Milpa", resources:["maize","common_beans","squash"], processor:"Mlýn" },
  { code:"rice", name:"Rýžová Delta", resources:["rice"], processor:"Mlýn" },
  { code:"millet", name:"Prosná Výspa", resources:["millet","sorghum"], processor:"Mlýn" },
  { code:"lentils", name:"Čočkovec", resources:["lentils"], processor:"Mlýn" },
  { code:"beans", name:"Fazolový Dvůr", resources:["common_beans","chickpeas"], processor:"Mlýn" },
  { code:"potatoes", name:"Hlíznice", resources:["potatoes"], processor:"Pekárna" },
  { code:"taro", name:"Taroš", resources:["taro","yams","cassava"], processor:"Pekárna" },
  { code:"olives", name:"Oliveta", resources:["olives"], processor:"Lisovna oleje" },
  { code:"grapes", name:"Vinohrad", resources:["grapes"], processor:"Vinařství" },
  { code:"tropical", name:"Fíkový Přístav", resources:["bananas_plantains","dates"], processor:"Udírna a solírna" },
  { code:"cattle", name:"Pastviny", resources:["cattle"], processor:"Pekárna" },
  { code:"sheep", name:"Ovčín", resources:["sheep","goats"], processor:"Udírna a solírna" },
  { code:"fish", name:"Rybné Molo", resources:["freshwater_fish","marine_fish"], processor:"Udírna a solírna" },
  { code:"bees", name:"Medový Háj", resources:["bees"], processor:"Vinařství" },
];

type Macro = {
  grid_x:number; grid_y:number; biome_family:string; mean_height:number;
  is_passable:boolean; has_river:boolean; river_direction:string|null; coastal:boolean;
  owner_player:string|null; temp_band:number; moisture_band:number;
};
type Candidate = { macro:Macro; score:number; resource:FoodResource };
const XY = (x:number,y:number)=>String(x)+","+String(y);
const distance=(a:{grid_x:number;grid_y:number},b:{grid_x:number;grid_y:number})=>
  Math.abs(a.grid_x-b.grid_x)+Math.abs(a.grid_y-b.grid_y);
const terrain=(h:Macro):TileTerrain=>({
  biome_family:h.biome_family,elevation:h.mean_height,has_river:h.has_river,
  river_direction:h.river_direction,is_coastal:h.coastal,is_passable:h.is_passable,
});

/** Preflight is read-only and rejects an impossible 16-city world before mutating anything. */
export async function planNeutralCities(db:any, sessionId:string) {
  const [terrainRes,citiesRes] = await Promise.all([
    db.from("province_hexes").select("grid_x,grid_y,biome_family,mean_height,is_passable,has_river,river_direction,coastal,owner_player,temp_band,moisture_band")
      .eq("session_id",sessionId).range(0,4999),
    db.from("cities").select("id,name,owner_player,grid_x,grid_y,province_q,province_r").eq("session_id",sessionId).range(0,499),
  ]);
  if(terrainRes.error)throw terrainRes.error;
  if(citiesRes.error)throw citiesRes.error;
  const map=new Map<string,Macro>((terrainRes.data||[]).filter((m:Macro)=>Number.isInteger(m.grid_x)&&Number.isInteger(m.grid_y)).map((m:Macro)=>[XY(m.grid_x,m.grid_y),m]));
  const current=(citiesRes.data||[]).map((c:any)=>({grid_x:Number(c.grid_x??c.province_q),grid_y:Number(c.grid_y??c.province_r)}));
  const used=[...current];
  const existingByOwner=new Map((citiesRes.data||[]).filter((c:any)=>String(c.owner_player||'').startsWith('Neutral:')).map((c:any)=>[c.owner_player,c]));
  const materialized=new Map<string,ReturnType<typeof generateTileParcels>>();
  function micro(h:Macro) {
    const key=XY(h.grid_x,h.grid_y);
    let specs=materialized.get(key);
    if(!specs){
      const neighbours=([[1,0],[-1,0],[0,1],[0,-1]] as const).flatMap(([dx,dy])=>{
        const n=map.get(XY(h.grid_x+dx,h.grid_y+dy));
        return n?[{dx,dy,terrain:terrain(n)}]:[];
      });
      specs=generateTileParcels(sessionId,h.grid_x,h.grid_y,terrain(h),neighbours);
      materialized.set(key,specs);
    }
    return specs;
  }
  const assignments:Array<{profile:NeutralCityProfile;macro:Macro;resource:FoodResource}>=[];
  const blocked:string[]=[];
  for(const profile of NEUTRAL_CITY_PROFILES){
    const existing=existingByOwner.get('Neutral:'+profile.code) as any;
    if(existing){
      const priorMacro=map.get(XY(Number(existing.grid_x??existing.province_q),Number(existing.grid_y??existing.province_r)));
      const priorResource=foodResourceByKey.get(profile.resources[0]);
      if(!priorMacro||!priorResource){blocked.push(profile.name+': pre-existing neutral has invalid world location');continue;}
      assignments.push({profile,macro:priorMacro,resource:priorResource});
      continue;
    }
    // The site requires usable microground; choose by REAL climate/sub-biome, not by a label.
    const possible:Candidate[]=[];
    for(const h of map.values()){
      if(!h.is_passable||h.owner_player||["sea","ocean"].includes(h.biome_family))continue;
      if(used.some(c=>distance(c,h)<3))continue;
      const plots=micro(h);
      if(plots.filter(p=>p.buildable).length<6)continue;
      let best:Candidate|null=null;
      for(const key of profile.resources){
        const resource=foodResourceByKey.get(key);
        if(!resource)throw Error("Unknown neutral profile food "+key);
        const source=plots.reduce((v,p)=>{
          const chance=foodResourceChance(resource,{
            subBiome:p.subBiome,tempBand:h.temp_band,moistureBand:h.moisture_band,
            elevation:p.elevation/100,hasRiver:h.has_river,coastal:h.coastal,
          });
          if(chance<=0)return v;
          // Sources must have a buildable site; fishing and flooded crops may use a 4-adjacent dry shore.
          const near=plots.some(q=>q.buildable&&
            Math.abs(q.parcelX-p.parcelX)+Math.abs(q.parcelY-p.parcelY)<=1&&
            (p.buildable||["lake","river_channel","open_water","reed_marsh"].includes(p.subBiome)));
          return near?Math.max(v,chance):v;
        },0);
        const score=source+(profile.resources[0]===key?0.06:0);
        if(score>0&&(!best||score>best.score))best={macro:h,score,resource};
      }
      if(best)possible.push(best);
    }
    possible.sort((a,b)=>b.score-a.score||
      a.macro.grid_x-b.macro.grid_x||a.macro.grid_y-b.macro.grid_y);
    if(!possible.length){
      blocked.push(profile.name+": no real climate/sub-biome/buildable resource site at safe spacing");
      continue;
    }
    const pick=possible[0];
    assignments.push({profile,macro:pick.macro,resource:pick.resource});
    used.push(pick.macro);
  }
  return {assignments,blocked,existing:current.length};
}

async function one(promise:any,operation:string):Promise<any>{
  const r=await promise;
  if(r.error)throw Error(operation+": "+String(r.error.message||r.error));
  if(!r.data)throw Error(operation+": missing row");
  return r.data;
}
async function occupy(db:any,sessionId:string,owner:string,parcelId:string,kind:string,entityId:string,land:string,worked=false){
  const r=await db.rpc("occupy_city_parcel_atomic",{
    p_session:sessionId,p_player:owner,p_parcel:parcelId,p_kind:kind,
    p_entity:entityId,p_land_use:land,p_worked:worked,
  });
  if(r.error)throw Error("occupy_city_parcel_atomic: "+r.error.message);
}
async function createCityBuilding(db:any,sessionId:string,cityId:string,owner:string,tpl:any,parcelId:string,role:"worked"|"urban",label:string,starter=false) {
  const query=await db.from("city_buildings").select("id,parcel_id").eq("session_id",sessionId).eq("city_id",cityId).eq("name",label).maybeSingle();
  if(query.error)throw query.error;
  let b=query.data;
  if(!b){
    b=await one(db.from("city_buildings").insert({
      session_id:sessionId,city_id:cityId,template_id:tpl.id,name:label,
      category:tpl.category,description:tpl.description||"",
      effects:{...(tpl.effects||{}),...(starter?{starter_economy:true,starter_reserve:{baked_staples:20}}:{})},
      level_data:tpl.level_data||[],building_tags:tpl.effects?.capability_tags||[],
      status:"completed",build_started_turn:1,build_duration:0,completed_turn:1,
      current_level:1,max_level:tpl.max_level||3,
      cost_wealth:0,cost_wood:0,cost_stone:0,cost_iron:0,
    }).select("id,parcel_id").single(),"create "+label);
  }
  if(!b.parcel_id)await occupy(db,sessionId,owner,parcelId,"building",b.id,role==="worked"?"agriculture":"industrial",role==="worked");
  return b.id as string;
}

/** Seed only a fresh initialized world: no live turns, no pre-existing neutral city copies. */
export async function seedNeutralCities(db:any,sessionId:string) {
  const session=await one(db.from("game_sessions").select("id,current_turn,resolving_turn,init_status").eq("id",sessionId).single(),"session");
  if(Number(session.current_turn)!==1||session.resolving_turn!=null)throw Error("Neutral seeding permitted at turn 1 only");
  const preflight=await planNeutralCities(db,sessionId);
  // Exactly 16 economic sites required: never publish ornamental or climatologically impossible cities.
  if(preflight.blocked.length)throw Error("Neutral city ecological preflight: "+preflight.blocked.join("; "));
  const rows=await one(db.from("building_templates").select("id,name,description,category,effects,level_data,max_level")
    .in("name",["Farma","Rýžoviště","Vinice","Rybářství","Mlýn","Pekárna","Lisovna oleje","Udírna a solírna","Vinařství"]),
    "building templates");
  const templates=new Map((rows as any[]).map((x:any)=>[x.name,x]));
  const result:Array<{name:string;owner:string;population:number;specialization:string;grid_x:number;grid_y:number}>=[];
  for(const {profile,macro,resource} of preflight.assignments){
    const owner="Neutral:"+profile.code;
    let city=(await db.from("cities").select("id,name").eq("session_id",sessionId).eq("owner_player",owner).maybeSingle()).data;
    if(!city){
      city=await one(db.from("cities").insert({
        session_id:sessionId,owner_player:owner,name:profile.name,level:"Osada",settlement_level:"HAMLET",
        status:"ok",founded_round:1,province:"Nezávislé městské státy",
        province_q:macro.grid_x,province_r:macro.grid_y,grid_x:macro.grid_x,grid_y:macro.grid_y,
        population_total:200,population_peasants:160,population_burghers:30,
        population_clerics:10,population_warriors:0,housing_capacity:400,city_stability:75,
      }).select("id,name").single(),"create "+profile.name);
    }
    const cityId=String(city.id);
    const existingSpecCheck=await db.from("food_specializations").select("resource_key")
      .eq("session_id",sessionId).eq("owner_player",owner).limit(1);
    if(existingSpecCheck.error)throw existingSpecCheck.error;
    if(existingSpecCheck.data?.length){
      const [bc,dc]=await Promise.all([
        db.from("city_buildings").select("id",{count:"exact",head:true}).eq("city_id",cityId).eq("status","completed"),
        db.from("city_districts").select("id",{count:"exact",head:true}).eq("city_id",cityId).eq("status","completed"),
      ]);
      if(bc.error||dc.error||Number(bc.count)<2||Number(dc.count)<1)
        throw Error("Partially seeded neutral city requires recovery: "+profile.name);
      result.push({name:profile.name,owner,population:200,
        specialization:existingSpecCheck.data[0].resource_key,grid_x:macro.grid_x,grid_y:macro.grid_y});
      continue; // idempotent: do not recreate initial money, goods, land, or buildings.
    }
    // A neutral city is an economic owner, not a game_player turn-closing seat.
    const realm=await db.from("realm_resources").select("id").eq("session_id",sessionId).eq("player_name",owner).maybeSingle();
    if(realm.error)throw realm.error;
    if(!realm.data){
      const rr=await db.from("realm_resources").insert({session_id:sessionId,player_name:owner,gold_reserve:200,production_reserve:20});
      if(rr.error)throw rr.error;
    }
    const cap=await db.from("city_capital_stock").select("city_id").eq("session_id",sessionId).eq("city_id",cityId).maybeSingle();
    if(cap.error)throw cap.error;
    if(!cap.data){const cc=await db.from("city_capital_stock").insert({session_id:sessionId,city_id:cityId,stock:80});if(cc.error)throw cc.error;}
    const seats=await seatCityOnParcels(db,{
      sessionId,cityId,cityName:profile.name,ownerPlayer:owner,
      gridX:macro.grid_x,gridY:macro.grid_y,population:200,turnNumber:1,
    });
    if(seats.seatIndex==null)throw Error("No seat for "+profile.name);
    await one(db.from("cities").update({founded_parcel_index:seats.seatIndex}).eq("id",cityId).select("id").single(),"seat index");
    const parcels=await ensureTileParcels(db,sessionId,macro.grid_x,macro.grid_y);
    const cityUrban=parcels.filter((p:any)=>p.city_id===cityId&&p.status==="claimed"&&p.claim_kind!=="worked");
    const residential=cityUrban.shift();
    if(!residential)throw Error("Missing housing parcel for "+profile.name);
    let district=(await db.from("city_districts").select("id,parcel_id").eq("city_id",cityId).eq("district_type","residential").maybeSingle()).data;
    if(!district){
      district=await one(db.from("city_districts").insert({
        session_id:sessionId,city_id:cityId,district_type:"residential",name:"Obytná čtvrť",
        population_capacity:400,current_population:200,status:"completed",completed_turn:1,
        build_turns:0,build_started_turn:1,build_cost_wealth:0,build_cost_wood:0,build_cost_stone:0,
      }).select("id,parcel_id").single(),"housing "+profile.name);
    }
    if(!district.parcel_id)await occupy(db,sessionId,owner,residential.id,"district",district.id,"residential");

    // Source industry always on its own real worked parcel, one active recipe per rural site.
    const sourceTpl=templates.get(resource.building);
    if(!sourceTpl)throw Error("Missing harvest building "+resource.building);
    const candidate=parcels.filter((p:any)=>p.buildable&&p.status==="wild"&&!p.city_id)
      .map((p:any)=>({p,chance:foodResourceChance(resource,{
        subBiome:p.sub_biome,tempBand:macro.temp_band,moistureBand:macro.moisture_band,
        elevation:p.elevation/100,hasRiver:macro.has_river,coastal:macro.coastal,
      })})).filter((x:any)=>x.chance>0).sort((a:any,b:any)=>b.chance-a.chance)[0];
    if(!candidate)throw Error("No usable worked site in "+profile.name+" for "+resource.key);
    const rural=candidate.p;
    const claimed=await db.from("tile_parcels").update({
      status:"claimed",claim_kind:"worked",land_use:"open",city_id:cityId,owner_player:owner,claimed_turn:1,
    }).eq("id",rural.id);
    if(claimed.error)throw claimed.error;
    await createCityBuilding(db,sessionId,cityId,owner,sourceTpl,rural.id,"worked",sourceTpl.name+" — "+profile.name);
    const fs=await db.from("food_specializations").upsert({
      session_id:sessionId,site_parcel_id:rural.id,owner_player:owner,resource_key:resource.key,
      source_micro_x:macro.grid_x*6+(rural.parcel_index%6),
      source_micro_y:macro.grid_y*6+Math.floor(rural.parcel_index/6),
      chosen_turn:1-establishTurns(resource),stock_mode:"starter_kit",stock_cost:0,
    },{onConflict:"session_id,site_parcel_id"});
    if(fs.error)throw Error("food specialization "+profile.name+": "+fs.error.message);
    // Include at least one processor and an emergency bakery. Both consume actual local inputs.
    const urbanNames=[...new Set([profile.processor,"Pekárna"])];
    for(const building of urbanNames){
      const parcel=cityUrban.shift();
      const tpl=templates.get(building);
      if(!parcel||!tpl)throw Error("Missing urban parcel/processor "+building+" for "+profile.name);
      await createCityBuilding(db,sessionId,cityId,owner,tpl,parcel.id,"urban",building+" — "+profile.name,building==="Pekárna");
    }
    result.push({name:profile.name,owner,population:200,specialization:resource.key,grid_x:macro.grid_x,grid_y:macro.grid_y});
  }
  return result;
}
