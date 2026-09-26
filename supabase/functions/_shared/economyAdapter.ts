import { resolveGoodsEconomy, produced, type Snapshot, type City, type Good, type Producer, type Edge } from './goodsEconomy.ts';
import { actualSoldiers, workforceLawModifiers } from './manpower.ts';
import { staffingCapacity } from './cityDistricts.ts';
import { ratedNodeCapacity } from './nodeCapacity.ts';
import { IDEOLOGIES, BASKET_TIER, ECONOMY, normalizeLabor, INDUSTRIAL_INPUTS, HOUSEHOLD_GOODS, GOOD_FINAL_USE, GOOD_HOUSEHOLD } from './economyConfig.ts';
import { buildManagementReport } from './management.ts';
import { BASKET_KEYS, basketSpec, needBand, alertPriority, shortageEffect, basketSeverity } from './demandModel.ts';
import {spurWalk,spurCapacity,nodeCatchmentRadius,cityCatchmentRadius,SPUR_COST_PER_TILE} from './roadCatchment.ts';
import { DISTINCTIVE_RECIPE_KEYS } from './productionCatalog.ts';
import { autoAllocationDetail, craftsmanship, expectedInputCost, PRODUCT_MARKET } from './productMarket.ts';

const nonnegative=(v:unknown)=>Math.max(0,Number(v)||0);
/** Baseline market/granary capability that any inhabited settlement has by its size alone. */
const settlementBaseline=(population:unknown)=>{const p=nonnegative(population);
  return p>=8000?3:p>=4000?2:p>=1500?1:p>0?0.5:0;};
/**
 * A Postgres statement timeout (57014) is a transient load symptom, not a broken economy: the same
 * read succeeds moments later. Retry it a couple of times with backoff, and keep failing closed on
 * every other error so a partial read can never masquerade as an empty economy.
 */
async function query<T>(label:string,run:()=>Promise<{data:T;error:any}>):Promise<T>{
  for(let attempt=1;;attempt++){
    const r=await run();
    if(!r.error)return r.data;
    if(attempt>=3||r.error.code!=='57014')throw Error(`${label}: ${r.error.message}`);
    console.warn(`[economy] ${label}: databáze nestíhala (${attempt}. pokus), opakuji`);
    await new Promise(resolve=>setTimeout(resolve,600*attempt));
  }
}
/** Fail closed: pagination and DB failures must never masquerade as an empty economy. */
async function rows(sb:any,table:string,session?:string){
  const out:any[]=[];
  const orderBy=table==='goods'?'key':table==='production_recipes'?'recipe_key':table==='node_production_orders'?'node_id':'id';
  for(let start=0;;start+=1000){
    const page=await query<any[]>(table,()=>{let q=sb.from(table).select('*').order(orderBy,{ascending:true}).range(start,start+999);if(session)q=q.eq('session_id',session);return q;});
    out.push(...page);if(page.length<1000)return out;}
}
/**
 * LEGACY ROLE COMPATIBILITY lives in productionContract.ts (one shared normalizer). Saved
 * structures from before zero-input extraction became 'source' (wells, aqueducts, peat cuts)
 * declare only 'producer'; their whitelisted zero-input source recipes stay legal. Arbitrary
 * factories still cannot create goods from nothing — the recipe itself must be a zero-input source.
 */
export { normalizeStructureRoles, normalizeProductionContract, auditProductionContracts } from './productionContract.ts';
import { normalizeStructureRoles, normalizeProductionContract } from './productionContract.ts';
const remap:Record<string,string>={basic_material:'metalwork',textile:'basic_clothing',ritual:'luxury_clothing',prestige:'luxury_clothing'};
const basket=(v:string)=>remap[v]||v;
/** Refresh report fiscal fields after the fiscal transaction, without rerunning production. */
export async function finalizeManagementReports(sb:any,session:string,turn:number){
  const ledger=await sb.from('economy_turn_ledgers').select('result').eq('session_id',session).eq('turn_number',turn).single();
  if(ledger.error)throw ledger.error;
  const result=ledger.data?.result;if(!result?.snapshot)throw new Error('Missing physical snapshot');
  const previous=await sb.from('economy_turn_ledgers').select('committed_result').eq('session_id',session).eq('turn_number',turn-1).eq('committed',true).maybeSingle();
  if(previous.error)throw previous.error;
  const realms=await rows(sb,'realm_resources',session);
  const reports=Object.fromEntries(realms.map(realm=>[realm.player_name,buildManagementReport(result.snapshot,result,realm,previous.data?.committed_result?.management?.[realm.player_name])]));
  const saved=await sb.rpc('update_goods_management_reports',{p_session:session,p_turn:turn,p_reports:reports});
  if(saved.error)throw saved.error;
}
export async function computeCanonicalEconomy(sb:any,session:string){
  const names=['goods','production_recipes','cities','province_nodes','city_buildings','building_templates','city_districts','military_stacks','realm_resources','road_segments','province_hexes','node_production_orders','structure_production_orders','laws','war_declarations','node_projects'];
  const loaded=await Promise.all(names.map(t=>rows(sb,t,['goods','production_recipes','building_templates'].includes(t)?undefined:session)));
  const db=Object.fromEntries(names.map((name,i)=>[name,loaded[i]]));
  const sess=await query<any>('game_sessions',()=>sb.from('game_sessions').select('current_turn').eq('id',session).single());
  const turn=sess.current_turn;
  /**
   * The committed ledger is a very large JSON document (flows, diagnostics, per-good balances of
   * every city). Only five of its sections are ever read here, so ask Postgres for those sections
   * instead of the whole document — the full read is what pushes this query into a statement timeout.
   */
  const previous=await query<any>('economy_turn_ledgers',()=>sb.from('economy_turn_ledgers')
    .select('prices:committed_result->prices,balances:committed_result->balances,cityAccounts:committed_result->cityAccounts,famous:committed_result->famous,management:committed_result->management')
    .eq('session_id',session).lt('turn_number',turn).eq('committed',true).order('turn_number',{ascending:false}).limit(1).maybeSingle());
  const prior=previous?.balances||previous?.prices||previous?.management?previous:null;
  const current=await query<any>('economy_turn_ledgers',()=>sb.from('economy_turn_ledgers')
    .select('opening:result->opening').eq('session_id',session).eq('turn_number',turn).maybeSingle());
  const goods:Good[]=db.goods.map(g=>{
    const bk=basket(g.demand_basket);if(!basketSpec(bk))throw Error(`Unmapped basket for good ${g.key}: ${bk}`);
    const profile=g.friction_profile||{};
    const luxury=['luxury_clothing','feast'].includes(bk),stone=/stone|marble|brick/.test(g.key),food=bk==='staple_food'||bk==='feast';
    return {key:g.key,basket:bk,price:nonnegative(g.base_price_numeric),stage:g.production_stage,storable:g.storable,
      finalUse:profile.final_use??GOOD_FINAL_USE[g.key]??!INDUSTRIAL_INPUTS.includes(g.key),
      household:profile.household??GOOD_HOUSEHOLD[g.key]??(HOUSEHOLD_GOODS[bk]||[]).includes(g.key),
      bulk:profile.bulk_factor??(stone?12:luxury?0.2:1),density:profile.value_density??(luxury?30:stone?0.1:3),
      perishability:profile.perishability??(food?0.01:0),storageLoss:profile.storage_loss??(food?0.03:0.001),
      storageCost:profile.storage_cost??0,substitutability:profile.substitutability??1,strategic:profile.strategic_priority??(bk==='military_supply'?1:0),
      prestige:profile.prestige_factor??(luxury?1:0),transshipment:profile.transshipment_penalty??0.1};
  });
  const goodMap=new Map(goods.map(g=>[g.key,g]));
  const role=(r:any)=>r.required_role==='producer'?(goodMap.get(r.output_good_key)?.stage==='raw'?'source':'processing'):r.required_role;
  // Persisted city capital stock (process-turn is its only writer); tolerate a missing table.
  const capitalRows=await sb.from('city_capital_stock').select('city_id,stock').eq('session_id',session);
  const capitalByCity=new Map<string,number>((capitalRows.error?[]:capitalRows.data||[]).map((r:any)=>[r.city_id,nonnegative(r.stock)]));
  const cities:City[]=db.cities.filter(c=>c.owner_player&&(!c.status||c.status==='ok')).map(c=>{
    const realm=db.realm_resources.find(r=>r.player_name===c.owner_player)||{};
    const lawModifiers=workforceLawModifiers(db.laws.filter(l=>l.player_name===c.owner_player));
    const owned=db.cities.filter(x=>x.owner_player===c.owner_player);
    const population=owned.reduce((s,x)=>s+nonnegative(x.population_total),0);
    const soldiers=actualSoldiers(db.military_stacks.filter(s=>(s.owner_player??s.player_name)===c.owner_player));
    const buildings=db.city_buildings.filter(b=>b.city_id===c.id&&b.status==='completed');
    const effects=buildings.map(b=>({...db.building_templates.find(t=>t.id===b.template_id)?.effects,...b.effects}));
    return {id:c.id,name:c.name,owner:c.owner_player,cell:`${c.grid_x??c.province_q},${c.grid_y??c.province_r}`,population:nonnegative(c.population_total),
      activePopModifier:lawModifiers.active,maxMobModifier:lawModifiers.maxMobilization,
      classes:{peasants:nonnegative(c.population_peasants),burghers:nonnegative(c.population_burghers),clerics:nonnegative(c.population_clerics),warriors:nonnegative(c.population_warriors)},
      soldiers:population?soldiers*nonnegative(c.population_total)/population:0,stability:nonnegative(c.city_stability??50)/100,
      irrigation:nonnegative(c.irrigation_level),labor:normalizeLabor(c.labor_allocation||{}),
      // Every inhabited settlement keeps a baseline marketplace and granary even before dedicated
      // buildings exist; without it all surplus spoils and no trade can ever start.
      market:nonnegative(c.market_level)+settlementBaseline(c.population_total),
      storage:effects.reduce((s,e)=>s+nonnegative(e.storage_capacity??e.warehouse_level),0)+settlementBaseline(c.population_total),
      admin:nonnegative(c.temple_level),commercialBaseline:2*settlementBaseline(c.population_total),
      housingHeadroom:nonnegative(c.housing_capacity)>0?Math.max(0,Math.min(1,1-nonnegative(c.population_total)/nonnegative(c.housing_capacity))):0.5,
      capitalStock:capitalByCity.get(c.id)||0,
      // Construction demand exists only while something is actually being built.
      constructionProjects:db.city_buildings.filter(b=>b.city_id===c.id&&b.status!=='completed').length+
        db.city_districts.filter(d=>d.city_id===c.id&&d.status!=='completed').length+
        db.node_projects.filter(p=>!['completed','cancelled'].includes(p.status)&&
          db.province_nodes.some(n=>n.id===p.node_id&&n.city_id===c.id)).length,

      security:nonnegative(c.city_stability??50)/100,guild:Math.max(0,...db.province_nodes.filter(n=>n.city_id===c.id).map(n=>nonnegative(n.guild_level))),
      ideology:realm.trade_ideology||'customary_local',coastal:!!db.province_hexes.find(h=>(h.grid_x??h.q)===(c.grid_x??c.province_q)&&(h.grid_y??h.r)===(c.grid_y??c.province_r))?.coastal};
  });
  const cityMap=new Map(cities.map(c=>[c.id,c])),nodeMap=new Map(db.province_nodes.map(n=>[n.id,n]));
  const anchor=(node:any):City|undefined=>{const seen=new Set<string>();let current=node;
    while(current&&!seen.has(current.id)){seen.add(current.id);if(current.session_id!==session||current.controlled_by!==node.controlled_by)return;
      const city=cityMap.get(current.city_id);if(city)return city.owner===node.controlled_by?city:undefined;current=nodeMap.get(current.parent_node_id);}};
    const recipe=(r:any)=>({key:r.recipe_key,good:r.output_good_key,qty:nonnegative(r.output_quantity),
    inputs:(r.input_items||[]).map((i:any)=>({good:i.key??i.good_key,qty:nonnegative(i.qty??i.quantity)})),
    labor:nonnegative(r.labor_cost),quality:nonnegative(r.quality_output_bonus),minQuality:nonnegative(r.min_quality_input)});
  const producers:Producer[]=[];
  /**
   * PRODUCTION ORDERS (nodes, buildings and districts share one interpretation):
   *  AUTO   — legal recipes weighted by basket necessity (1/tier); never a blind even split.
   *  PREFER — the chosen good/basket gets triple weight, the rest still runs.
   *  LOCK   — only the chosen good/basket runs, if it is legal for this structure.
   */
  /**
   * AUTO PROFITABILITY. Expected margin ratio of a recipe at the PREVIOUS COMMITTED local prices
   * (catalogue base price at bootstrap) — never this pass's prices, so there is no price↔allocation loop.
   */
  const priorPrice=new Map<string,number>((prior?.prices||[]).map((p:any)=>[`${p.city}::${p.good}`,nonnegative(p.local_price)]));
  const refPrice=(city:string,good:string)=>priorPrice.get(`${city}::${good}`)||nonnegative(goodMap.get(good)?.price);
  const marginRatio=(city:string,r:any,inputCost:(city:string,good:string)=>number=refPrice)=>{const out=nonnegative(r.output_quantity)*refPrice(city,r.output_good_key);
    const cost=(r.input_items||[]).reduce((s:number,i:any)=>s+nonnegative(i.qty??i.quantity)*inputCost(city,i.key??i.good_key),0);
    return out>0?(out-cost)/out:-1;};
  /** AUTO structures are finalised after the route graph exists (expected LANDED input cost). */
  const autoGroups:{city:string;candidates:any[];weights:number[];ids:string[]}[]=[];
  const essential=(r:any)=>{const b=goodMap.get(r.output_good_key)?.basket||'',cls=basketSpec(b)?.class;
    return cls==='critical_need'||cls==='basic_need'||PRODUCT_MARKET.strategicOperationalBaskets.includes(b);};
  /** AUTO weights + flags; `norm` = max(Σweights, Σnecessity) so stopped/emergency capacity stays idle. */
  const autoWeights=(city:string,candidates:any[],weights:number[],order:any)=>{
    const margins=candidates.map(r=>marginRatio(city,r));
    const base=weights.reduce((s,w)=>s+w,0);
    // PREFER/LOCK keep their weights; AUTO is provisional here and finalised by finalizeAuto().
    return {weights,norm:base,flags:candidates.map(()=>null as string|null),margins,auto:!order||order.mode==='auto'};};
  const orderMode=(order:any)=>(order?.mode||'auto') as 'auto'|'prefer'|'lock';
  const orderWeight=(r:any,order:any)=>{
    const g=goodMap.get(r.output_good_key);
    const tier=BASKET_TIER[g?.basket||'']||1,auto=1/tier;
    if(!order||order.mode==='auto')return auto;
    const match=(order.target_good_key&&r.output_good_key===order.target_good_key)||
      (order.target_basket_key&&g?.basket===basket(order.target_basket_key));
    if(order.mode==='prefer')return match?auto*3:auto;
    return match?auto:0;
  };
/** Physical throughput and headcount multiplier of a structure level. */
  const levelScale=(level:unknown)=>{const scale=ECONOMY.levelCapacityScale;
    return scale[Math.min(scale.length,Math.max(1,Math.round(Number(level)||1)))-1];};
/**
   * ROUTE ACCESS. A settlement that touches the finished road network is connected, and every
   * structure and node anchored to it inherits that connection — a built road serves the whole
   * town, not only the hex it ends on. Unconnected anchors keep their own access factor.
   */
  const roadCells=new Set(db.road_segments.filter((r:any)=>r.status==='completed')
    .flatMap((r:any)=>[`${r.from_x},${r.from_y}`,`${r.to_x},${r.to_y}`]));
  const cityConnected=(city:City)=>roadCells.has(city.cell);
  for(const node of db.province_nodes){if(node.is_active===false)continue;const c=anchor(node);if(!c)continue;
    const order=db.node_production_orders.find(o=>o.node_id===node.id);
    const eligible=db.production_recipes.filter(r=>role(r)===node.production_role&&(r.required_tags||[]).every((tag:string)=>(node.capability_tags||[]).includes(tag)));
    const aw=autoWeights(c.id,eligible,eligible.map(r=>orderWeight(r,order)),order),weights=aw.weights,total=aw.norm;
    if(!(weights.reduce((s,n)=>s+n,0)>0))continue;
    // Nodes employ the same canonical crew as any other producing structure (Lv1 100 → doubling).
    const capacity=ratedNodeCapacity(node);
    const jobs=capacity>0?ECONOMY.structureJobsBase*levelScale(node.node_level??node.level):undefined;
    const logistics=cityConnected(c)?1:nonnegative(node.route_access_factor??1);
    if(aw.auto)autoGroups.push({city:c.id,candidates:eligible,weights,ids:eligible.map(r=>`${node.id}:${r.recipe_key}`)});
    eligible.forEach((r,i)=>{if(weights[i]<=0)return;
      producers.push({id:`${node.id}:${r.recipe_key}`,city:c.id,node:node.id,cell:`${node.grid_x??node.hex_q},${node.grid_y??node.hex_r}`,channel:'node',capacity,
        recipe:recipe(r),allocation:weights[i]/total,staffing:1,jobs,logistics,mastery:1+nonnegative(node.guild_level)*ECONOMY.guildProductivity,
        craft:craftsmanship(node.node_level??node.level,node.capability_tags||[],nonnegative(node.guild_level)),order:orderMode(order),autoFlag:aw.flags[i],expectedMarginProxy:aw.margins[i],
        source:node.production_role==='source',distinctive:DISTINCTIVE_RECIPE_KEYS.has(r.recipe_key)});});
  }

  const recipeByKey=new Map(db.production_recipes.map((r:any)=>[r.recipe_key,r]));
  /**
   * Explicit production contract. A structure runs either an exact recipe whitelist
   * (effects.recipe_keys) or the recipes matching its declared capability tags and roles.
   * A structure without any declared craft produces nothing — basket capacity alone is not
   * a licence to run unrelated extraction, processing or manufacturing recipes.
   *
   * CAPACITY / JOBS. Declared basket capacity is the level-1 rating; the level multiplier
   * (ECONOMY.levelCapacityScale) raises real throughput and the crew together, so the labour
   * market and the physical capacity never disagree.
   */
  const structureOrder=(id:string)=>db.structure_production_orders.find((o:any)=>o.structure_id===id);
  const structure=(id:string,city:string,channel:'facility'|'district',outputs:Record<string,number>,staffed:boolean,
    tags:string[],options:{recipeKeys?:string[];roles?:string[];allowSource?:boolean;level?:unknown;order?:any;jobs?:unknown}={})=>{
    if(!cityMap.has(city))return;
    const scale=levelScale(options.level);
    const total=Object.values(outputs).reduce((s,v)=>s+nonnegative(v),0)*scale;
    /**
     * HEADCOUNT. Every producing structure employs ECONOMY.structureJobsBase people at level 1
     * and doubles per level together with its throughput (Lv1 100, Lv2 200, Lv3 400). A declared
     * jobs_capacity is a per-structure override; the base never drops below the recipe-derived
     * crew, so labour demand and physical capacity stay one canonical interpretation.
     */
    const declared=Number(options.jobs)>0?nonnegative(options.jobs):ECONOMY.structureJobsBase;
    const jobs=total>0?declared*scale:undefined;

    const craft=craftsmanship(options.level,tags,nonnegative(cityMap.get(city)?.guild));
    const push=(candidates:any[],capacity:number)=>{
      if(!candidates.length||capacity<=0)return;
      const aw=autoWeights(city,candidates,candidates.map(r=>orderWeight(r,options.order)),options.order),weights=aw.weights,sum=aw.norm;
      if(!(weights.reduce((s,w)=>s+w,0)>0))return;
      if(aw.auto)autoGroups.push({city,candidates,weights,ids:candidates.map(r=>`${id}:${r.recipe_key}`)});
      candidates.forEach((r,i)=>{if(weights[i]<=0)return;
        producers.push({id:`${id}:${r.recipe_key}`,city,channel,capacity,recipe:recipe(r),jobs,
          allocation:weights[i]/sum,staffing:staffed?1:0,logistics:1,mastery:1,source:role(r)==='source',craft,order:orderMode(options.order),autoFlag:aw.flags[i],expectedMarginProxy:aw.margins[i],
          distinctive:DISTINCTIVE_RECIPE_KEYS.has(r.recipe_key)});});
    };
    if(options.recipeKeys?.length){
      // Exact whitelist: unknown keys are a contract error, roles/tags must still match.
      const candidates=options.recipeKeys.map(key=>{const r=recipeByKey.get(key);
        if(!r)throw Error(`Structure ${id} references unknown recipe ${key}`);return r;});
      const roles=normalizeStructureRoles(options.roles||[],candidates,role);
      const legal=candidates.filter((r:any)=>(!roles.length||roles.includes(role(r))||roles.includes(r.required_role))&&
        (r.required_tags||[]).every((tag:string)=>tags.includes(tag)));
      push(legal,total);
      return;
    }
    if(!tags.length)return;
    for(const [bk,capacity] of Object.entries(outputs)){
      const candidates=db.production_recipes.filter(r=>goodMap.get(r.output_good_key)?.basket===basket(bk)&&
        (role(r)!=='source'||options.allowSource)&&(!options.roles?.length||options.roles.includes(role(r))||options.roles.includes(r.required_role))&&
        (r.required_tags||[]).length>0&&(r.required_tags||[]).every((tag:string)=>tags.includes(tag)));
      push(candidates,nonnegative(capacity)*scale);
    }
  };
  // Legacy compatibility only: buildings saved before explicit metadata existed.
  const facilityTags=(name:string):string[]=>{
    const rules:[RegExp,string[]][]=[[/bakery|pekár/i,['baking']],[/mill|mlýn/i,['milling']],
      [/weav|tkal|silk|hedváb/i,['weaving']],[/forge|smith|ková|armory|arsenal|zbroj/i,['smithing','armoring']],
      [/lumber|woodcut|dřev/i,['logging','sawing']],[/well|aqueduct|studn|akvad/i,['farming']],
      [/script|chancell|písař/i,['crafting']],[/warehouse|granary|sklad|sýpk/i,['construction']],
      [/stonecut|kamen/i,['stonecutting']],[/winery|vinař|tavern|hostin/i,['fermenting']]];
    return rules.flatMap(([match,tags])=>match.test(name)?tags:[]);
  };
  const contractNotes:{structure:string;notes:string[]}[]=[];
  for(const b of db.city_buildings.filter(b=>b.status==='completed')){
    const template=db.building_templates.find(t=>t.id===b.template_id);
    // Old saves keep stale role metadata: reconcile it against the current recipe catalogue.
    const norm=normalizeProductionContract({...template?.effects,...b.effects},recipeByKey);
    if(norm.notes.length)contractNotes.push({structure:b.id,notes:norm.notes});
    const effect=norm.effects;
    const name=`${template?.key||''} ${template?.name||''} ${b.name||''}`;
    const tags=effect.capability_tags||facilityTags(name);
    structure(b.id,b.city_id,'facility',effect.basket_outputs||{},true,tags,
      {recipeKeys:effect.recipe_keys,roles:effect.production_roles,level:b.current_level,order:structureOrder(b.id),jobs:effect.jobs_capacity,
       allowSource:!!effect.recipe_keys||/well|aqueduct|studn|akvad|woodcut|lumber|dřev/i.test(name)});
  }
  for(const c of cities){const districts=db.city_districts.filter(d=>d.city_id===c.id&&d.status==='completed').sort((a,b)=>a.id.localeCompare(b.id));
    let staffed=staffingCapacity(districts.filter(d=>d.district_type==='residential'||d.type==='residential').length);
    for(const d of districts.filter(d=>d.district_type==='production')){
      const farm=/hospodářský pás|farm_belt/i.test(d.name||'');
      structure(d.id,c.id,'district',{[basket(d.basket_key)]:nonnegative(d.basket_output)},staffed-->0,
        farm?['farming','herding','gathering']:['weaving','smithing','armoring','construction','crafting','baking','spinning','smelting','stonecutting','sawing'],
        {allowSource:farm,level:d.level??d.current_level,order:structureOrder(d.id)});
    }
  }
  const edges:Edge[]=db.road_segments.filter(r=>r.status==='completed').map(r=>({id:r.id,from:`${r.from_x},${r.from_y}`,to:`${r.to_x},${r.to_y}`,
    cost:nonnegative(r.friction),capacity:nonnegative(r.capacity),mode:'road',risk:0,toll:0,border:0}));
  const rivers=new Set(db.province_hexes.filter(h=>h.has_river&&h.is_passable!==false).map(h=>`${h.grid_x??h.q},${h.grid_y??h.r}`));
  for(const cell of rivers){const [x,y]=cell.split(',').map(Number);for(const [dx,dy] of [[1,0],[0,1]]){const to=`${x+dx},${y+dy}`;
    if(rivers.has(to))edges.push({id:`river:${cell}>${to}`,from:cell,to,cost:ECONOMY.riverFriction,capacity:ECONOMY.riverCapacity,mode:'river',risk:0,toll:0,border:0});}}
  const transport=new Set([...edges.flatMap(e=>[e.from,e.to]),...cities.map(c=>c.cell)]);
  const land=new Set<string>(db.province_hexes.filter(h=>h.is_passable!==false&&!['sea','ocean'].includes(h.biome_family)).map(h=>`${h.grid_x??h.q},${h.grid_y??h.r}`));
  const feederEdges=new Set<string>();
  const attach=(cell:string,radius:number)=>{
    if(edges.some(e=>e.from===cell||e.to===cell))return;
    const targets=new Set(transport);targets.delete(cell);
    const [x,y]=cell.split(',').map(Number),hit=spurWalk(x,y,radius,targets,land);
    if(!hit)return;
    for(let i=1;i<hit.cells.length;i++){
      const [from,to]=[hit.cells[i-1],hit.cells[i]].sort(),id=`spur:${from}>${to}`;
      if(feederEdges.has(id))continue;feederEdges.add(id);
      edges.push({id,from,to,cost:SPUR_COST_PER_TILE,capacity:spurCapacity(hit.dist),mode:'spur',risk:0,toll:0,border:0});
    }
  };
  for(const c of db.cities){const city=cityMap.get(c.id);if(city)attach(city.cell,cityCatchmentRadius(c));}
  for(const node of db.province_nodes)if(node.is_active!==false&&anchor(node))attach(`${node.grid_x??node.hex_q},${node.grid_y??node.hex_r}`,nodeCatchmentRadius(node));
  /**
   * AUTO FINALISATION. Expected margin uses the cheapest EXPECTED LANDED input cost: previous
   * committed (bootstrap: catalogue) prices at every reachable supplier + route transport ×
   * merchant friction + destination tariff (productMarket.expectedInputCost). Read-only, no
   * same-pass prices; actual sourcing in goodsEconomy remains authoritative.
   */
  {
    const adj=new Map<string,[string,number][]>();
    for(const e of edges){(adj.get(e.from)||adj.set(e.from,[]).get(e.from)!).push([e.to,nonnegative(e.cost)]);(adj.get(e.to)||adj.set(e.to,[]).get(e.to)!).push([e.from,nonnegative(e.cost)]);}
    const distCache=new Map<string,Map<string,number>>();
    const distFrom=(cell:string)=>{let d=distCache.get(cell);if(d)return d;d=new Map([[cell,0]]);const done=new Set<string>();
      for(;;){let cur:string|null=null,best=Infinity;for(const [k,v] of d)if(!done.has(k)&&v<best){best=v;cur=k;}
        if(cur==null)break;done.add(cur);for(const [to,w] of adj.get(cur)||[])if(best+w<(d.get(to)??Infinity))d.set(to,best+w);}
      distCache.set(cell,d);return d;};
    const blocked=new Set(db.war_declarations.filter(w=>['active','peace_offered'].includes(w.status)).flatMap(w=>[`${w.declaring_player}|${w.target_player}`,`${w.target_player}|${w.declaring_player}`]));
    const producedPrior=new Set((prior?.balances||[]).filter((b:any)=>produced(b)>0).map((b:any)=>`${b.city}::${b.good}`));
    const supplies=(city:string,good:string)=>producedPrior.has(`${city}::${good}`)||producers.some(p=>p.city===city&&p.recipe.good===good);
    const costCache=new Map<string,{cost:number;source:string}>();
    const expected=(city:string,good:string)=>{const k=`${city}::${good}`;let v=costCache.get(k);if(v)return v.cost;
      const dst=cityMap.get(city)!,base=nonnegative(goodMap.get(good)?.price);
      const tariff=(IDEOLOGIES[dst.ideology]||IDEOLOGIES.customary_local).tariff;
      const suppliers=cities.filter(s=>s.id!==city&&supplies(s.id,good)&&!blocked.has(`${s.owner}|${dst.owner}`)).flatMap(s=>{
        const d=distFrom(s.cell).get(dst.cell);if(d==null)return [];
        return [{city:s.id,sourcePrice:refPrice(s.id,good),transport:d*(IDEOLOGIES[s.ideology]||IDEOLOGIES.customary_local).merchantFriction,tolls:0,tariffRate:tariff,risk:0,loss:0}];});
      const hasLocal=supplies(city,good)||priorPrice.has(k);
      v=expectedInputCost(hasLocal?refPrice(city,good):Infinity,suppliers,base);
      if(!Number.isFinite(v.cost))v={cost:refPrice(city,good),source:'reference'};
      costCache.set(k,v);return v.cost;};
    const byId=new Map(producers.map(p=>[p.id,p]));
    for(const g of autoGroups){
      const margins=g.candidates.map(r=>marginRatio(g.city,r,expected));
      const d=autoAllocationDetail(g.candidates.map((r,i)=>({key:String(i),necessity:g.weights[i],marginRatio:margins[i],essential:essential(r)})));
      const w=g.candidates.map((_,i)=>d.weights[String(i)]),norm=Math.max(w.reduce((s,x)=>s+x,0),g.weights.reduce((s,x)=>s+x,0));
      g.ids.forEach((id,i)=>{const p=byId.get(id);if(!p)return;p.allocation=norm>0?w[i]/norm:0;p.autoFlag=d.flags[String(i)];p.expectedMarginProxy=margins[i];
        (p as any).expectedInputSources=Object.fromEntries((g.candidates[i].input_items||[]).map((x:any)=>{const gk=x.key??x.good_key;expected(g.city,gk);return [gk,costCache.get(`${g.city}::${gk}`)];}));});
    }
    for(let i=producers.length-1;i>=0;i--)if(!(producers[i].allocation>0))producers.splice(i,1);
  }
  let opening=prior?.balances?.filter((b:any)=>cityMap.has(b.city)).map((b:any)=>({city:b.city,good:b.good,qty:b.stored,quality:b.quality}))??current?.opening;
  if(!opening){
    opening=[];
    // First adoption preserves existing inventories. Subsequent refreshes reuse
    // this frozen opening, never their own newly projected closing inventories.
    for(const node of db.province_nodes){const c=anchor(node);if(!c)continue;
      for(let offset=0;;offset+=1000){const inventory=await sb.from('node_inventory').select('*').eq('node_id',node.id).range(offset,offset+999);
        if(inventory.error)throw inventory.error;
        for(const i of inventory.data)if(goodMap.has(i.good_key))opening.push({city:c.id,good:i.good_key,qty:nonnegative(i.quantity),quality:nonnegative(i.quality_band)});
        if(inventory.data.length<1000)break;
      }
    }
  }
  // Read-only history of the last COMMITTED turn: familiarity and household budget. Refresh never writes it.
  const familiarity:Record<string,Record<string,number>>={};
  const basketTotals=new Map<string,number>();
  for(const b of prior?.balances||[]){const g=goodMap.get(b.good);if(!g)continue;const k=`${b.city}::${g.basket}`;
    basketTotals.set(k,(basketTotals.get(k)||0)+nonnegative(b.consumed_household)+nonnegative(b.consumed_state));}
  for(const b of prior?.balances||[]){const g=goodMap.get(b.good);if(!g)continue;const t=basketTotals.get(`${b.city}::${g.basket}`)||0;
    if(t>0)(familiarity[b.city] ||= {})[b.good]=(nonnegative(b.consumed_household)+nonnegative(b.consumed_state))/t;}
  const budget=prior?.cityAccounts?Object.fromEntries(prior.cityAccounts.map((a:any)=>[a.city,{discretionary_ratio:nonnegative(a.discretionary_ratio),affordability:nonnegative(a.affordability),discretionary_budget:nonnegative(a.discretionary_budget)}])):undefined;
  const householdTaxRate=Object.fromEntries(db.realm_resources.map((r:any)=>[r.player_name,Math.min(0.9,nonnegative(r.tax_rate_domestic??0.1)+nonnegative(r.tax_rate_poll??0.002))]));
  const priorPrices=prior?.prices?Object.fromEntries([...priorPrice]):undefined;
  const snapshot:Snapshot={turn,goods,cities,producers,edges,opening,fame:prior?.famous||[],familiarity,budget,priorPrices,householdTaxRate,blockedTrade:db.war_declarations.filter(w=>['active','peace_offered'].includes(w.status)).map(w=>[w.declaring_player,w.target_player])};
  const physical=resolveGoodsEconomy(snapshot);
  const management=Object.fromEntries(db.realm_resources.map(r=>[r.player_name,buildManagementReport(snapshot,physical,r,prior?.management?.[r.player_name])]));
  const result={...physical,opening,snapshot,management,contractNormalizations:contractNotes};
  // Anchor every city on its own settlement node (node_subtype 'city'); only fall back to
  // another node of the same city when the settlement node is missing. Cities must never
  // drop out of the projection just because a workshop node was indexed first.
  const cityNode=new Map<string,string>();
  for(const node of db.province_nodes){const c=cityMap.get(node.city_id);if(!c)continue;
    if(node.node_subtype==='city'||!cityNode.has(c.id))cityNode.set(c.id,node.id);
    if(node.node_subtype==='city')cityNode.set(c.id,node.id);}
  const marketBaskets:any[]=[];
  const demandByKey=new Map((result.demand||[]).map((d:any)=>[`${d.city}::${d.good}`,d.channels]));
  for(const c of cities)for(const bk of BASKET_KEYS){const bs=result.balances.filter(b=>b.city===c.id&&goodMap.get(b.good)!.basket===bk);
    const sum=(field:string)=>bs.reduce((s,b)=>s+Number((b as any)[field]||0),0),demand=sum('demand'),unmet=sum('unmet_demand');
    const recipeSupply=sum('produced_node'),structureSupply=sum('produced_facility')+sum('produced_district');
    marketBaskets.push({session_id:session,city_id:c.id,player_name:c.owner,basket_key:bk,turn_number:turn,
      auto_supply:sum('produced_household'),recipe_bonus:recipeSupply,building_bonus:structureSupply,bonus_supply:recipeSupply+structureSupply,
      local_supply:sum('consumed_household')+sum('consumed_state'),
      local_demand:demand,unmet_demand:unmet,domestic_satisfaction:demand?1-unmet/demand:1,export_surplus:sum('stored')+sum('exported'),quality_weight:1,
      market_access:1,monetization:1,
      // Demand provenance + class-aware consequence, so the UI never re-derives economics.
      demand_detail:(()=>{const coverage=demand>0?Math.max(0,demand-unmet)/demand:1,spec=basketSpec(bk)!;
        const channels:Record<string,number>={};
        for(const b of bs)for(const [channel,qty] of Object.entries(demandByKey.get(`${c.id}::${b.good}`)||{}))
          if(Number(qty)>0)channels[channel]=(channels[channel]||0)+Number(qty);
        return {demand_class:spec.class,group:spec.group,label:spec.label,channels,coverage,
          basic_need:spec.basicNeeds,band:needBand(coverage),severity:basketSeverity(bk,coverage),
          alert:alertPriority(bk,coverage,{activeSystem:demand>0}),effect:shortageEffect(bk,coverage),
          tool_coverage:bk==='tools'?(result.toolCoverage?.[c.id]??1):undefined};})()});}
  // City columns carry cities.id; node columns carry the anchoring province_nodes.id. Never swap them.
  const tradeFlows=result.flows.filter(f=>cityNode.has(f.source)&&cityNode.has(f.destination)).map(f=>({session_id:session,good_key:f.good,
    source_city_id:f.source,target_city_id:f.destination,
    source_node_id:cityNode.get(f.source),target_node_id:cityNode.get(f.destination),
    source_player:cityMap.get(f.source)!.owner,target_player:cityMap.get(f.destination)!.owner,
    flow_type:f.reason,volume_per_turn:f.qty,quality_band:Math.floor(f.quality),effective_price:f.qty?f.gross_value/f.qty:0,status:'active',turn_created:turn,
    path_cells:f.path,transport_modes:f.edges.map((edgeId:string)=>edgeId.startsWith('river:')?'river':edgeId.startsWith('spur:')?'spur':'road'),
    provenance:f}));
  const basketFlows=result.flows.map(f=>({session_id:session,basket_key:goodMap.get(f.good)!.basket,source_city_id:f.source,target_city_id:f.destination,
    source_player:cityMap.get(f.source)!.owner,target_player:cityMap.get(f.destination)!.owner,volume:f.qty,unit_price:f.qty?f.gross_value/f.qty:0,gross_value:f.gross_value,
    fiscal_capture:0,turn_number:turn,path_cells:f.path,transport_modes:f.edges.map(edgeId=>edgeId.startsWith('river:')?'river':edgeId.startsWith('spur:')?'spur':'road')}));
  const realms=db.realm_resources.map(r=>{const owned=new Set(cities.filter(c=>c.owner===r.player_name).map(c=>c.id)),bs=result.balances.filter(b=>owned.has(b.city));
    const sum=(f:string)=>bs.reduce((s,b)=>s+Number((b as any)[f]||0),0),consumption=bs.reduce((s,b)=>s+(b.consumed_household+b.consumed_state)*goodMap.get(b.good)!.price,0);
    const channelValue=(ch:string)=>bs.reduce((s,b)=>s+Number((b as any)[`produced_${ch}`])*goodMap.get(b.good)!.price*(1+b.quality*ECONOMY.qualityPremium),0);
    return {player_name:r.player_name,goods_production_value:sum('gross_output_value'),value_added_gdp:sum('gross_output_value')-sum('intermediate_value')+result.metrics.filter(m=>owned.has(m.city)).reduce((s,m)=>s+m.trade_services.service_value_added,0),
      trade_service_value_added:result.metrics.filter(m=>owned.has(m.city)).reduce((s,m)=>s+m.trade_services.service_value_added,0),
      goods_extraction_value:sum('extraction_value'),goods_domestic_consumption_value:consumption,construction_available_for_capex:sum('capex'),
      goods_supply_volume:bs.reduce((s,b)=>s+produced(b),0),goods_value_detail:{auto:channelValue('household'),recipe:channelValue('node'),structures:channelValue('facility')+channelValue('district')},
      economy_detail:{produced_household:sum('produced_household'),produced_node:sum('produced_node'),produced_facility:sum('produced_facility'),produced_district:sum('produced_district'),
        market_turnover:result.flows.filter(f=>owned.has(f.source)).reduce((s,f)=>s+f.gross_value,0),
        transit_value:result.metrics.filter(m=>owned.has(m.city)).reduce((s,m)=>s+m.transit_importance,0),
        food_produced:bs.filter(b=>goodMap.get(b.good)!.basket==='staple_food').reduce((s,b)=>s+produced(b),0),
        food_stored:bs.filter(b=>goodMap.get(b.good)!.basket==='staple_food').reduce((s,b)=>s+b.stored,0),
        fame_prestige:result.famous.filter(f=>owned.has(f.city)&&f.created!=null).reduce((s,f)=>s+f.fame*ECONOMY.famePrestige,0)}};
  });
  const priceIndex=new Map(result.prices.map(p=>[`${p.city}::${p.good}`,p]));
  const summaries=result.balances.filter(b=>cityNode.has(b.city)).map(b=>{const price=priceIndex.get(`${b.city}::${b.good}`);
    return {session_id:session,turn_number:turn,
    city_node_id:cityNode.get(b.city),good_key:b.good,supply_volume:produced(b),demand_volume:b.demand,avg_quality:Math.floor(b.quality),
    // Endogenous local price; the catalogue base price stays the long-run reference in goods.
    price_numeric:price?price.local_price:goodMap.get(b.good)!.price,
    price_band:price?Math.max(1,Math.min(5,Math.round(price.scarcity_factor*2))):0,
    domestic_share:b.demand?Math.min(1,(b.consumed_household+b.consumed_state)/b.demand):1,
    import_share:(b.opening+produced(b)+b.imported)>0?b.imported/(b.opening+produced(b)+b.imported):0};});

  const marketShares=realms.flatMap(realm=>BASKET_KEYS.map(bk=>{
    const world=marketBaskets.filter(b=>b.basket_key===bk),local=world.filter(b=>b.player_name===realm.player_name);
    const exports=basketFlows.filter(f=>f.basket_key===bk&&f.source_player!==f.target_player);
    const totalExport=exports.reduce((s,f)=>s+f.volume,0),ownExport=exports.filter(f=>f.source_player===realm.player_name).reduce((s,f)=>s+f.volume,0);
    const demand=local.reduce((s,b)=>s+b.local_demand,0),unmet=local.reduce((s,b)=>s+b.unmet_demand,0);
    return {session_id:session,turn_number:turn,player_name:realm.player_name,basket_key:bk,
      auto_production:local.reduce((s,b)=>s+b.auto_supply,0),bonus_production:local.reduce((s,b)=>s+b.bonus_supply,0),
      domestic_satisfaction:demand?1-unmet/demand:1,effective_export:ownExport,global_export:totalExport,
      global_demand:world.reduce((s,b)=>s+b.local_demand,0),market_share:totalExport?ownExport/totalExport:0,quality_weight:1,wealth_generated:0};
  }));
  // demand_baskets stays a pure compatibility projection of the canonical basket ledger
  // (no second demand solver). FK: demand_baskets.city_id -> province_nodes.id.
  const demandBaskets=marketBaskets.filter(b=>cityNode.has(b.city_id)).map(b=>({session_id:session,turn_number:turn,
    city_id:cityNode.get(b.city_id),basket_key:b.basket_key,tier:BASKET_TIER[b.basket_key as keyof typeof BASKET_TIER]??1,
    quantity_needed:b.local_demand,quantity_fulfilled:Math.max(0,b.local_demand-b.unmet_demand),
    satisfaction_score:b.local_demand?Math.max(0,b.local_demand-b.unmet_demand)/b.local_demand:1,
    fulfillment_type:'canonical',min_quality:0,preferred_quality:0}));
  const payload={result,marketBaskets,demandBaskets,tradeFlows,basketFlows,realms,summaries,marketShares};
  const saved=await sb.rpc('replace_goods_economy_projection',{p_session:session,p_turn:turn,p_payload:payload});if(saved.error)throw saved.error;
  /**
   * The management report is a read-only view of the projection just written, so a refresh must
   * republish it. Otherwise the production overview keeps showing the numbers frozen at the last
   * turn resolution while every other economy panel is already current.
   */
  const savedReports=await sb.rpc('update_goods_management_reports',{p_session:session,p_turn:turn,p_reports:management});
  if(savedReports.error)throw savedReports.error;
  return {ok:true,turn,flows:result.flows.length,balances:result.balances.length,blocked:result.diagnostics.filter(d=>d.blocked).length};


}
