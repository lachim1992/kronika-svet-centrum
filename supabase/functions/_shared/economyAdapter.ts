import { resolveGoodsEconomy, produced, type Snapshot, type City, type Good, type Producer, type Edge } from './goodsEconomy.ts';
import { actualSoldiers, workforceLawModifiers } from './manpower.ts';
import { staffingCapacity } from './cityDistricts.ts';
import { BASKET_TIER, ECONOMY, normalizeLabor, INDUSTRIAL_INPUTS, HOUSEHOLD_GOODS } from './economyConfig.ts';
import { buildManagementReport } from './management.ts';
import {spurWalk,spurCapacity,nodeCatchmentRadius,cityCatchmentRadius,SPUR_COST_PER_TILE} from './roadCatchment.ts';

const nonnegative=(v:unknown)=>Math.max(0,Number(v)||0);
/** Baseline market/granary capability that any inhabited settlement has by its size alone. */
const settlementBaseline=(population:unknown)=>{const p=nonnegative(population);
  return p>=8000?3:p>=4000?2:p>=1500?1:p>0?0.5:0;};
/** Fail closed: pagination and DB failures must never masquerade as an empty economy. */
async function rows(sb:any,table:string,session?:string){
  const out:any[]=[];
  const orderBy=table==='goods'?'key':table==='production_recipes'?'recipe_key':table==='node_production_orders'?'node_id':'id';
  for(let start=0;;start+=1000){let q=sb.from(table).select('*').order(orderBy,{ascending:true}).range(start,start+999);if(session)q=q.eq('session_id',session);
    const r=await q;if(r.error)throw Error(`${table}: ${r.error.message}`);out.push(...r.data);if(r.data.length<1000)return out;}
}
const remap:Record<string,string>={basic_material:'metalwork',textile:'basic_clothing',variety:'feast',ritual:'luxury_clothing',prestige:'luxury_clothing'};
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
  const names=['goods','production_recipes','cities','province_nodes','city_buildings','building_templates','city_districts','military_stacks','realm_resources','road_segments','province_hexes','node_production_orders','laws','war_declarations'];
  const loaded=await Promise.all(names.map(t=>rows(sb,t,['goods','production_recipes','building_templates'].includes(t)?undefined:session)));
  const db=Object.fromEntries(names.map((name,i)=>[name,loaded[i]]));
  const sess=await sb.from('game_sessions').select('current_turn').eq('id',session).single();if(sess.error)throw sess.error;
  const turn=sess.data.current_turn;
  const previous=await sb.from('economy_turn_ledgers').select('committed_result').eq('session_id',session).lt('turn_number',turn).eq('committed',true).order('turn_number',{ascending:false}).limit(1).maybeSingle();
  if(previous.error)throw previous.error;
  const prior=previous.data?.committed_result;
  const current=await sb.from('economy_turn_ledgers').select('result').eq('session_id',session).eq('turn_number',turn).maybeSingle();
  if(current.error)throw current.error;
  const goods:Good[]=db.goods.map(g=>{
    const bk=basket(g.demand_basket);if(!BASKET_TIER[bk])throw Error(`Unmapped basket for good ${g.key}: ${bk}`);
    const profile=g.friction_profile||{};
    const luxury=['luxury_clothing','feast'].includes(bk),stone=/stone|marble|brick/.test(g.key),food=bk==='staple_food'||bk==='feast';
    return {key:g.key,basket:bk,price:nonnegative(g.base_price_numeric),stage:g.production_stage,storable:g.storable,
      finalUse:profile.final_use??!INDUSTRIAL_INPUTS.includes(g.key),household:profile.household??(HOUSEHOLD_GOODS[bk]||[]).includes(g.key),
      bulk:profile.bulk_factor??(stone?12:luxury?0.2:1),density:profile.value_density??(luxury?30:stone?0.1:3),
      perishability:profile.perishability??(food?0.01:0),storageLoss:profile.storage_loss??(food?0.03:0.001),
      storageCost:profile.storage_cost??0,substitutability:profile.substitutability??1,strategic:profile.strategic_priority??(bk==='military_supply'?1:0),
      prestige:profile.prestige_factor??(luxury?1:0),transshipment:profile.transshipment_penalty??0.1};
  });
  const goodMap=new Map(goods.map(g=>[g.key,g]));
  const role=(r:any)=>r.required_role==='producer'?(goodMap.get(r.output_good_key)?.stage==='raw'?'source':'processing'):r.required_role;
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
      admin:nonnegative(c.temple_level),

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
  for(const node of db.province_nodes){if(node.is_active===false)continue;const c=anchor(node);if(!c)continue;
    const order=db.node_production_orders.find(o=>o.node_id===node.id);
    let eligible=db.production_recipes.filter(r=>role(r)===node.production_role&&(r.required_tags||[]).every((tag:string)=>(node.capability_tags||[]).includes(tag)));
    if(order?.mode==='lock')eligible=eligible.filter(r=>(!order.target_good_key||r.output_good_key===order.target_good_key)&&goodMap.get(r.output_good_key)?.basket===basket(order.target_basket_key));
    const weights=eligible.map(r=>order?.mode==='prefer'&&goodMap.get(r.output_good_key)?.basket===basket(order.target_basket_key)?3:1),total=weights.reduce((s,n)=>s+n,0);
    eligible.forEach((r,i)=>producers.push({id:`${node.id}:${r.recipe_key}`,city:c.id,node:node.id,cell:`${node.grid_x??node.hex_q},${node.grid_y??node.hex_r}`,channel:'node',capacity:nonnegative(node.production_output),
      recipe:recipe(r),allocation:weights[i]/total,staffing:1,logistics:nonnegative(node.route_access_factor??1),mastery:1+nonnegative(node.guild_level)*ECONOMY.guildProductivity,
      source:node.production_role==='source',distinctive:(r.input_items||[]).some((i:any)=>/silk|dye|gold|spice|gem/.test(i.key||''))}));
  }
  const structure=(id:string,city:string,channel:'facility'|'district',outputs:Record<string,number>,staffed:boolean,tags:string[],allowSource=false)=>{
    if(!cityMap.has(city))return;
    for(const [bk,capacity] of Object.entries(outputs)){
      // A structure that explicitly declares an output basket brings its own craft with it;
      // only structures with declared capability tags are restricted to matching recipes.
      const gated=tags.length>0;
      const candidates=db.production_recipes.filter(r=>goodMap.get(r.output_good_key)?.basket===basket(bk)&&
        (role(r)!=='source'||allowSource)&&(!gated||(r.required_tags||[]).every((tag:string)=>tags.includes(tag))));
      if(!candidates.length)continue;
      for(const r of candidates)producers.push({id:`${id}:${r.recipe_key}`,city,channel,capacity:nonnegative(capacity),recipe:recipe(r),
        allocation:1/candidates.length,staffing:staffed?1:0,logistics:1,mastery:1,source:role(r)==='source',
        distinctive:(r.input_items||[]).some((i:any)=>/silk|dye|gold|spice|gem/.test(i.key||''))});
    }
  };
  // Basket capacity is not a license to run unrelated extraction/processing recipes.
  const facilityTags=(name:string):string[]=>{
    const rules:[RegExp,string[]][]=[[/bakery|pekár/i,['baking']],[/mill|mlýn/i,['milling']],
      [/weav|tkal|silk|hedváb/i,['weaving']],[/forge|smith|ková|armory|arsenal|zbroj/i,['smithing','armoring']],
      [/lumber|woodcut|dřev/i,['logging','sawing']],[/well|aqueduct|studn|akvad/i,['farming']],
      [/script|chancell|písař/i,['crafting']],[/warehouse|granary|sklad|sýpk/i,['construction']],
      [/stonecut|kamen/i,['stonecutting']],[/winery|vinař|tavern|hostin/i,['fermenting']]];
    return rules.flatMap(([match,tags])=>match.test(name)?tags:[]);
  };
  for(const b of db.city_buildings.filter(b=>b.status==='completed')){
    const template=db.building_templates.find(t=>t.id===b.template_id);
    const effect={...template?.effects,...b.effects};
    const name=`${template?.key||''} ${template?.name||''} ${b.name||''}`;
    const tags=effect.capability_tags||facilityTags(name);
    structure(b.id,b.city_id,'facility',effect.basket_outputs||{},true,tags,/well|aqueduct|studn|akvad|woodcut|lumber|dřev/i.test(name));
  }
  for(const c of cities){const districts=db.city_districts.filter(d=>d.city_id===c.id&&d.status==='completed').sort((a,b)=>a.id.localeCompare(b.id));
    let staffed=staffingCapacity(districts.filter(d=>d.district_type==='residential'||d.type==='residential').length);
    for(const d of districts.filter(d=>d.district_type==='production')){
      const farm=/hospodářský pás|farm_belt/i.test(d.name||'');
      structure(d.id,c.id,'district',{[basket(d.basket_key)]:nonnegative(d.basket_output)},staffed-->0,
        farm?['farming','herding','gathering']:['weaving','smithing','armoring','construction','crafting','baking','spinning','smelting','stonecutting','sawing'],farm);
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
  let opening=prior?.balances?.filter((b:any)=>cityMap.has(b.city)).map((b:any)=>({city:b.city,good:b.good,qty:b.stored,quality:b.quality}))??current.data?.result?.opening;
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
  const snapshot:Snapshot={turn,goods,cities,producers,edges,opening,fame:prior?.famous||[],blockedTrade:db.war_declarations.filter(w=>['active','peace_offered'].includes(w.status)).map(w=>[w.declaring_player,w.target_player])};
  const physical=resolveGoodsEconomy(snapshot);
  const management=Object.fromEntries(db.realm_resources.map(r=>[r.player_name,buildManagementReport(snapshot,physical,r,prior?.management?.[r.player_name])]));
  const result={...physical,opening,snapshot,management};
  const cityNode=new Map<string,string>();for(const node of db.province_nodes){const c=cityMap.get(node.city_id);if(c&&!cityNode.has(c.id))cityNode.set(c.id,node.id);}
  const marketBaskets:any[]=[];
  for(const c of cities)for(const bk of Object.keys(BASKET_TIER)){const bs=result.balances.filter(b=>b.city===c.id&&goodMap.get(b.good)!.basket===bk);
    const sum=(field:string)=>bs.reduce((s,b)=>s+Number((b as any)[field]||0),0),demand=sum('demand'),unmet=sum('unmet_demand');
    const recipeSupply=sum('produced_node'),structureSupply=sum('produced_facility')+sum('produced_district');
    marketBaskets.push({session_id:session,city_id:c.id,player_name:c.owner,basket_key:bk,turn_number:turn,
      auto_supply:sum('produced_household'),recipe_bonus:recipeSupply,building_bonus:structureSupply,bonus_supply:recipeSupply+structureSupply,
      local_supply:sum('consumed_household')+sum('consumed_state'),
      local_demand:demand,unmet_demand:unmet,domestic_satisfaction:demand?1-unmet/demand:1,export_surplus:sum('stored')+sum('exported'),quality_weight:1,
      market_access:1,monetization:1});}
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
    return {player_name:r.player_name,goods_production_value:sum('gross_output_value'),value_added_gdp:sum('gross_output_value')-sum('intermediate_value'),
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

  const marketShares=realms.flatMap(realm=>Object.keys(BASKET_TIER).map(bk=>{
    const world=marketBaskets.filter(b=>b.basket_key===bk),local=world.filter(b=>b.player_name===realm.player_name);
    const exports=basketFlows.filter(f=>f.basket_key===bk&&f.source_player!==f.target_player);
    const totalExport=exports.reduce((s,f)=>s+f.volume,0),ownExport=exports.filter(f=>f.source_player===realm.player_name).reduce((s,f)=>s+f.volume,0);
    const demand=local.reduce((s,b)=>s+b.local_demand,0),unmet=local.reduce((s,b)=>s+b.unmet_demand,0);
    return {session_id:session,turn_number:turn,player_name:realm.player_name,basket_key:bk,
      auto_production:local.reduce((s,b)=>s+b.auto_supply,0),bonus_production:local.reduce((s,b)=>s+b.bonus_supply,0),
      domestic_satisfaction:demand?1-unmet/demand:1,effective_export:ownExport,global_export:totalExport,
      global_demand:world.reduce((s,b)=>s+b.local_demand,0),market_share:totalExport?ownExport/totalExport:0,quality_weight:1,wealth_generated:0};
  }));
  const payload={result,marketBaskets,tradeFlows,basketFlows,realms,summaries,marketShares};
  const saved=await sb.rpc('replace_goods_economy_projection',{p_session:session,p_turn:turn,p_payload:payload});if(saved.error)throw saved.error;
  return {ok:true,turn,flows:result.flows.length,balances:result.balances.length,blocked:result.diagnostics.filter(d=>d.blocked).length};
}
