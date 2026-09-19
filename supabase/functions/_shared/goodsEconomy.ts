import { ECONOMY as C, IDEOLOGIES, BASKET_SECTOR, BASKET_TIER, DEMAND_WEIGHTS, type Sector } from './economyConfig.ts';
import { computeWorkforceBreakdown } from './manpower.ts';

export type Channel = 'household' | 'node' | 'facility' | 'district';
export interface Good {
  key: string; basket: string; price: number; stage: string; storable: boolean;
  bulk: number; density: number; perishability: number; storageLoss: number; storageCost: number;
  substitutability: number; strategic: number; prestige: number; transshipment: number;
  finalUse?: boolean; household?: boolean;
}
export interface City {
  id: string; owner: string; name: string; cell: string; population: number;
  classes: Record<string, number>; soldiers: number; stability: number; irrigation: number;
  labor: Partial<Record<Sector, number>>; market: number; storage: number; admin: number;
  security: number; guild: number; ideology: keyof typeof IDEOLOGIES; coastal: boolean;
  activePopModifier?: number; maxMobModifier?: number;
}
export interface Recipe { key: string; good: string; qty: number; inputs: { good: string; qty: number }[]; labor: number; quality: number; minQuality: number }
export interface Producer { id: string; city: string; node?: string; cell?: string; channel: Channel; capacity: number;
  recipe: Recipe; allocation: number; staffing: number; logistics: number; mastery: number; source: boolean; distinctive: boolean }
export interface Edge { id: string; from: string; to: string; cost: number; capacity: number;
  mode: 'road'|'river'|'sea'|'spur'; risk: number; toll: number; border: number }
export interface Fame { city: string; good: string; name: string; streak: number; fame: number; quality: number; created: number|null; turn: number }
export interface Opening { city: string; good: string; qty: number; quality: number }
export interface Snapshot { turn: number; goods: Good[]; cities: City[]; producers: Producer[]; edges: Edge[]; opening: Opening[]; fame: Fame[]; blockedTrade?: [string,string][] }
export interface Balance { city: string; good: string; opening: number; produced_household: number; produced_node: number;
  produced_facility: number; produced_district: number; consumed_household: number; consumed_state: number;
  consumed_as_input: number; imported: number; exported: number; stored: number; lost_spoilage: number;
  unmet_demand: number; demand: number; quality: number; gross_output_value: number; intermediate_value: number;
  extraction_value: number; capex: number }
export interface Flow { good: string; source: string; destination: string; qty: number; delivered: number; quality: number;
  gross_value: number; transport_cost: number; tolls: number; net_value: number; reason: string;
  path: string[]; edges: string[]; via_hubs: string[]; famous: string|null }
const n = (x: number) => Number.isFinite(x) ? Math.max(0,x) : 0;
const clamp = (x: number) => Math.max(0,Math.min(1,x));
const key = (city: string, good: string) => `${city}::${good}`;
export const produced = (b: Balance) => b.produced_household+b.produced_node+b.produced_facility+b.produced_district;

/** Pure deterministic physical ledger. No DB/time/random state, no fiscal mutations. */
export function resolveGoodsEconomy(snapshot: Snapshot) {
  const cities=[...snapshot.cities].sort((a,b)=>a.id.localeCompare(b.id));
  const goods=[...snapshot.goods].sort((a,b)=>a.key.localeCompare(b.key));
  const cityById=new Map(cities.map(c=>[c.id,c])); const goodByKey=new Map(goods.map(g=>[g.key,g]));
  const balances=new Map<string,Balance>(); const flows: Flow[]=[];
  const diagnostics: {producer:string; good:string; capacity:number; realized:number; factors:Record<string,number>; blocked:string|null; delivery_path?:string[]}[]=[];
  const priorFame=new Map(snapshot.fame.map(f=>[key(f.city,f.good),f]));
  const stock=(city:string,good:string):Balance=>{
    if(!cityById.has(city)||!goodByKey.has(good)) throw Error(`Invalid economy reference ${city}/${good}`);
    const k=key(city,good);let b=balances.get(k);
    if(!b){b={city,good,opening:0,produced_household:0,produced_node:0,produced_facility:0,produced_district:0,
      consumed_household:0,consumed_state:0,consumed_as_input:0,imported:0,exported:0,stored:0,lost_spoilage:0,
      unmet_demand:0,demand:0,quality:1,gross_output_value:0,intermediate_value:0,extraction_value:0,capex:0};balances.set(k,b)}return b;
  };
  const available=(b:Balance)=>Math.max(0,b.opening+produced(b)+b.imported-b.exported-b.consumed_household-b.consumed_state-b.consumed_as_input-b.lost_spoilage);
  const add=(b:Balance,qty:number,quality:number,channel:Channel,source=false)=>{
    const before=available(b);b.quality=(before*b.quality+qty*quality)/(before+qty||1);
    b[`produced_${channel}`]+=qty;b.gross_output_value+=qty*goodByKey.get(b.good)!.price*(1+quality*C.qualityPremium);
    if(source)b.extraction_value+=qty*goodByKey.get(b.good)!.price*(1+quality*C.qualityPremium);
  };
  for(const o of snapshot.opening){const b=stock(o.city,o.good),g=goodByKey.get(o.good)!;
    b.quality=(b.opening*b.quality+n(o.qty)*n(o.quality))/(b.opening+n(o.qty)||1);b.opening+=n(o.qty);
    b.lost_spoilage+=n(o.qty)*clamp(g.storageLoss/(1+cityById.get(o.city)!.storage));}
  const workforce=new Map(cities.map(c=>[c.id,computeWorkforceBreakdown([{
    population_peasants:c.classes.peasants,population_burghers:c.classes.burghers,
    population_clerics:c.classes.clerics,population_warriors:c.classes.warriors}],0.1,c.activePopModifier??0,c.maxMobModifier??0,c.soldiers)]));
  const sectorFactor=(c:City,sector:Sector)=>{
    const raw={...C.sectors,...c.labor};const sum=Object.values(raw).reduce((a,b)=>a+n(b),0);
    return sum>0 ? n(raw[sector])/Math.max(1,sum)/C.sectors[sector] : 0;
  };
  const stateDemand=new Map<string,number>();
  const laborUsed=new Map<string,number>();
  // Demand is a need budget, not one full demand for every substitute.
  for(const c of cities){
    for(const basket of Object.keys(BASKET_TIER)){
      const options=goods.filter(g=>g.basket===basket&&(g.finalUse??g.stage!=='intermediate'));if(!options.length)continue;
      const weight=(g:Good)=> (g.key.includes('fish')?(c.coastal?3:0.2):1) *
        (g.key.includes('bread')?(1+n(c.classes.burghers)/Math.max(1,c.population)):1)*Math.max(0.01,g.substitutability);
      const sum=options.reduce((a,g)=>a+weight(g),0);
      const weightedPop=Object.entries(DEMAND_WEIGHTS[basket]).reduce((sum,[k,w])=>sum+n(c.classes[k])*w,0);
      const demand=weightedPop*C.populationDemand/BASKET_TIER[basket];
      const state=(basket==='military_supply'||basket==='staple_food')?c.soldiers*C.armyDemand:basket==='admin_supplies'?c.admin:0;
      for(const g of options){const b=stock(c.id,g.key);b.demand=(demand+state)*weight(g)/sum;stateDemand.set(key(c.id,g.key),state*weight(g)/sum);}
      if((C.householdBaskets as readonly string[]).includes(basket)){
        const baseline=options.find(g=>g.household===true)||options.find(g=>g.household===undefined&&g.stage==='household');
        if(baseline){let qty=c.population*C.householdRate/BASKET_TIER[basket]*workforce.get(c.id)!.workforceRatio*
          sectorFactor(c,BASKET_SECTOR[basket]||'crafting')*clamp(c.stability)*
          (BASKET_SECTOR[basket]==='farming'?1+c.irrigation*C.irrigationGain:1);
          const sector=BASKET_SECTOR[basket]||'crafting',lk=key(c.id,sector);
          const pool=workforce.get(c.id)!.workforce*C.sectors[sector]*sectorFactor(c,sector);
          qty=Math.min(qty,Math.max(0,pool-(laborUsed.get(lk)||0)));
          add(stock(c.id,baseline.key),qty,0,'household');
          laborUsed.set(lk,(laborUsed.get(lk)||0)+qty);}
      }
    }
  }
  const graph=new Map<string,Edge[]>();const reserved=new Map<string,number>();
  for(const e of [...snapshot.edges].sort((a,b)=>a.id.localeCompare(b.id))){if(e.capacity<=0)continue;
    graph.set(e.from,[...(graph.get(e.from)||[]),e]);graph.set(e.to,[...(graph.get(e.to)||[]),{...e,from:e.to,to:e.from}]);}
  type Path={cells:string[];edges:Edge[];cost:number;capacity:number;loss:number;tolls:number};
  const routeCache=new Map<string,Path|null>();
  const routeTrees=new Map<string,{dist:Map<string,number>;prev:Map<string,Edge>}>();
  const route=(from:string,to:string,g:Good,ignoreReservations=false):Path|null=>{
    const frictionClass=`${g.bulk}:${g.perishability}:${g.transshipment}`;
    const k=`${from}>${to}:${frictionClass}`;
    const cached=routeCache.get(k);if(cached!==undefined){if(cached===null)return null;
      return {...cached,capacity:Math.min(...cached.edges.map(e=>(e.capacity-(ignoreReservations?0:reserved.get(e.id)||0))/Math.max(1,g.bulk)),Infinity)};}
    const treeKey=`${from}:${frictionClass}`;
    let tree=routeTrees.get(treeKey);
    if(!tree){
    const dist=new Map([[from,0]]),prev=new Map<string,Edge>(),open=new Set([from]);
    const edgeCost=(e:Edge)=>n(e.cost)*Math.max(0.01,g.bulk)*(e.mode==='river'||e.mode==='sea'?C.waterBulkEfficiency:1)*C.transportUnitCost+
      n(e.risk)+n(e.toll)+n(e.border)+g.perishability*n(e.cost)+g.transshipment*C.transshipmentCost;
    while(open.size){const u=[...open].sort((a,b)=>dist.get(a)!-dist.get(b)!||a.localeCompare(b))[0];open.delete(u);
      for(const e of graph.get(u)||[]){const d=dist.get(u)!+edgeCost(e);if(d<(dist.get(e.to)??Infinity)){dist.set(e.to,d);prev.set(e.to,e);open.add(e.to);}}}
    tree={dist,prev};routeTrees.set(treeKey,tree);
    }
    const {dist,prev}=tree;
    if(!dist.has(to)){routeCache.set(k,null);return null;}let u=to;const edges:Edge[]=[],cells=[to];
    while(u!==from){const e=prev.get(u);if(!e)return null;edges.unshift(e);u=e.from;cells.unshift(u);}
    const p={cells,edges,cost:dist.get(to)!,capacity:Math.min(...edges.map(e=>e.capacity/Math.max(1,g.bulk)),Infinity),
      loss:clamp(edges.reduce((a,e)=>a+e.cost*g.perishability,0)),tolls:edges.reduce((a,e)=>a+e.toll,0)};routeCache.set(k,p);
    return {...p,capacity:Math.min(...edges.map(e=>(e.capacity-(ignoreReservations?0:reserved.get(e.id)||0))/Math.max(1,g.bulk)),Infinity)};
  };
  const service=(c:City)=>c.market*C.marketPull+c.storage*C.storagePull+c.admin*C.adminPull+(graph.get(c.cell)?.length||0)*C.centralityPull;
  const hubs=new Map<string,string>();
  // Nearest better serviced centers, per friction class; no name/population-based tiers.
  for(const c of cities)for(const g of goods){let best=c.id,score=0;
    for(const h of cities){if(h.id===c.id||service(h)<=service(c))continue;const p=route(c.cell,h.cell,g,true);if(!p)continue;
      const a=service(h)*Math.max(0.1,h.security)/Math.pow(1+p.cost,C.hubDistanceExponent);
      if(a>score&&p.cost<C.regionalReach){best=h.id;score=a;}}
    if(best!==c.id)hubs.set(key(c.id,g.key),best);
  }
  const transfer=(src:City,dst:City,g:Good,wanted:number,reason:string,via:string[]=[],keep=0)=>{
    if(snapshot.blockedTrade?.some(([a,b])=>(src.owner===a&&dst.owner===b)||(src.owner===b&&dst.owner===a)))return 0;
    if(src.id===dst.id||wanted<C.minLot)return 0;const p=route(src.cell,dst.cell,g);if(!p||p.loss>=1)return 0;
    const policy=IDEOLOGIES[src.ideology]||IDEOLOGIES.customary_local;
    const targetPolicy=IDEOLOGIES[dst.ideology]||IDEOLOGIES.customary_local;
    const b=stock(src.id,g.key),db=stock(dst.id,g.key);const fame=priorFame.get(key(src.id,g.key));
    const branded=fame?.created!=null&&fame.fame>0;
    const premium=branded?C.famePremium*fame!.fame/100:0;
    const unit=g.price*(1+b.quality*C.qualityPremium)*(1+premium);
    const reach=C.localReach+g.density+g.strategic*C.regionalReach+g.prestige*C.regionalReach+(branded?fame!.fame:0);
    const transport=p.cost*policy.merchantFriction;
    if(transport>unit||p.cost>reach*policy.reach)return 0;
    if ((1-p.loss)*unit-transport-p.tolls-unit*targetPolicy.tariff<=0) return 0;
    const scarcity=1+Math.min(2,Math.max(0,db.demand-available(db))/Math.max(1,db.demand));
    if(p.cost>C.regionalReach&&unit*scarcity-unit-transport-p.tolls<unit*C.merchantMargin)return 0;
    const qty=Math.min(Math.max(0,available(b)-keep),wanted/(1-p.loss),p.capacity)*targetPolicy.imports;
    if(qty<C.minLot)return 0;const delivered=qty*(1-p.loss),before=available(db);
    b.exported+=qty;db.imported+=delivered;db.quality=(before*db.quality+delivered*b.quality)/(before+delivered);
    // Lost transport quantity is recorded at destination as import+loss for conservation.
    db.imported+=qty-delivered;db.lost_spoilage+=qty-delivered;
    for(const e of p.edges)reserved.set(e.id,(reserved.get(e.id)||0)+qty*Math.max(1,g.bulk));
    const tolls=qty*(p.tolls+unit*targetPolicy.tariff);
    flows.push({good:g.key,source:src.id,destination:dst.id,qty,delivered,quality:b.quality,gross_value:delivered*unit,
      transport_cost:qty*transport,tolls,net_value:delivered*unit-qty*transport-tolls,reason:branded&&reason==='household_consumption'?'famous_good_demand':reason,
      path:p.cells,edges:p.edges.map(e=>e.id),via_hubs:via.filter(id=>p.cells.includes(cityById.get(id)?.cell||'')),famous:branded?key(src.id,g.key):null});return delivered;
  };
  const producers=[...snapshot.producers].sort((a,b)=>Number(b.source)-Number(a.source)||a.id.localeCompare(b.id));
  const pending=new Map(producers.map(p=>[p.id,p]));
  const inputSources=(c:City,g:Good)=>{
    const hub=hubs.get(key(c.id,g.key));
    // Only direct hinterland siblings/parent/children are considered in local clearing.
    return cities.filter(s=>s.id!==c.id&&(s.id===hub||hubs.get(key(s.id,g.key))===c.id||
      (hub&&hubs.get(key(s.id,g.key))===hub))).sort((a,b)=>(route(a.cell,c.cell,g)?.cost??Infinity)-(route(b.cell,c.cell,g)?.cost??Infinity)||a.id.localeCompare(b.id));
  };
  for(let pass=0;pending.size&&pass<C.maxProductionPasses;pass++){
    let progress=false;
    for(const [id,p] of pending){const c=cityById.get(p.city),g=goodByKey.get(p.recipe.good);if(!c||!g)throw Error(`Invalid producer ${id}`);
      const remote=!!p.cell&&p.cell!==c.cell,delivery=remote?route(p.cell!,c.cell,g):null;
      if(remote&&(!delivery||delivery.loss>=1||delivery.capacity<=0)){
        diagnostics.push({producer:id,good:g.key,capacity:p.capacity,realized:0,factors:{logistics:0},blocked:'missing_local_delivery_route'});pending.delete(id);continue;
      }
      const sector=BASKET_SECTOR[g.basket]||'crafting',lk=key(c.id,sector);
      const factors={staffing:clamp(p.staffing),workforce:workforce.get(c.id)!.workforceRatio,sector:sectorFactor(c,sector),
        stability:clamp(c.stability),logistics:clamp(p.logistics),mastery:n(p.mastery),
        infrastructure:sector==='farming'?1+c.irrigation*C.irrigationGain:1};
      const desired=n(p.capacity)*clamp(p.allocation)*Object.values(factors).reduce((a,b)=>a*b,1);
      const laborPool=workforce.get(c.id)!.workforce*C.sectors[sector]*sectorFactor(c,sector);
      let qty=Math.min(desired,Math.max(0,laborPool-(laborUsed.get(lk)||0))*p.recipe.qty/Math.max(C.epsilon,p.recipe.labor));
      const inputPaths=new Map<string,Path>();
      const loadByEdge=new Map<string,number>();
      if(delivery)for(const edge of delivery.edges)loadByEdge.set(edge.id,Math.max(1,g.bulk));
      if(remote)for(const i of p.recipe.inputs){const ig=goodByKey.get(i.good);if(!ig)throw Error(`Unknown input ${i.good}`);
        const path=route(c.cell,p.cell!,ig);if(!path||path.loss>=1){qty=0;break;}inputPaths.set(i.good,path);
        for(const e of path.edges)loadByEdge.set(e.id,(loadByEdge.get(e.id)||0)+i.qty/Math.max(C.epsilon,p.recipe.qty)*Math.max(1,ig.bulk)/(1-path.loss));
      }
      for(const [edge,load] of loadByEdge){const e=snapshot.edges.find(e=>e.id===edge)!;qty=Math.min(qty,Math.max(0,e.capacity-(reserved.get(edge)||0))/load);}
      if(!p.source&&!p.recipe.inputs.length){diagnostics.push({producer:id,good:g.key,capacity:p.capacity,realized:0,factors,blocked:'missing_recipe_inputs'});pending.delete(id);continue;}
      for(const i of p.recipe.inputs){const ig=goodByKey.get(i.good);if(!ig)throw Error(`Unknown input ${i.good}`);
        const deliveryRatio=1-(inputPaths.get(i.good)?.loss||0);
        const b=stock(c.id,i.good),required=qty*i.qty/Math.max(C.epsilon,p.recipe.qty)/deliveryRatio;
        if(b.quality<p.recipe.minQuality&&available(b)>0){qty=0;break;}
        let missing=Math.max(0,required-available(b));
        for(const s of inputSources(c,ig)){if(missing<C.minLot)break;
          const sb=stock(s.id,ig.key);if(sb.quality<p.recipe.minQuality)continue;
          missing-=transfer(s,c,ig,missing,'production_input',hubs.has(key(s.id,ig.key))?[hubs.get(key(s.id,ig.key))!]:[],Math.max(0,sb.demand-sb.consumed_household-sb.consumed_state));}
        qty=Math.min(qty,available(b)*p.recipe.qty/Math.max(C.epsilon,i.qty)*deliveryRatio);
      }
      // Input imports above may reserve the same road as the local delivery.
      for(const [edge,load] of loadByEdge){const e=snapshot.edges.find(e=>e.id===edge)!;qty=Math.min(qty,Math.max(0,e.capacity-(reserved.get(edge)||0))/load);}
      if(qty<=C.epsilon){if(desired<=C.epsilon){diagnostics.push({producer:id,good:g.key,capacity:p.capacity,realized:0,factors,blocked:'capacity_labor_or_staffing'});pending.delete(id);}continue;}
      let inputValue=0,minQuality=Infinity;
      for(const i of p.recipe.inputs){const b=stock(c.id,i.good),amount=qty*i.qty/p.recipe.qty;
        const shipped=amount/(1-(inputPaths.get(i.good)?.loss||0));
        b.consumed_as_input+=amount;b.lost_spoilage+=shipped-amount;minQuality=Math.min(minQuality,b.quality);
        inputValue+=shipped*goodByKey.get(i.good)!.price*(1+b.quality*C.qualityPremium);}
      const quality=Math.min(3,p.recipe.quality+(p.source?c.guild:Math.min(c.guild,minQuality)))*(IDEOLOGIES[c.ideology]?.quality||1);
      const b=stock(c.id,g.key);add(b,qty,quality,p.channel,p.source);b.intermediate_value+=inputValue;
      b.lost_spoilage+=qty*(delivery?.loss||0);
      for(const [edge,load] of loadByEdge)reserved.set(edge,(reserved.get(edge)||0)+qty*load);
      laborUsed.set(lk,(laborUsed.get(lk)||0)+qty*p.recipe.labor/p.recipe.qty);
      diagnostics.push({producer:id,good:g.key,capacity:p.capacity,realized:qty,factors:{...factors,inputs:desired?qty/desired:0},delivery_path:delivery?.cells,blocked:null});pending.delete(id);progress=true;
    }
    if(!progress)break;
  }
  for(const [id,p] of pending)diagnostics.push({producer:id,good:p.recipe.good,capacity:p.capacity,realized:0,factors:{},blocked:'missing_inputs_or_route'});
  const consume=(c:City,g:Good)=>{const b=stock(c.id,g.key),missing=Math.max(0,b.demand-b.consumed_household-b.consumed_state);
    const qty=Math.min(available(b),missing),state=Math.min(qty,Math.max(0,(stateDemand.get(key(c.id,g.key))||0)-b.consumed_state));
    b.consumed_state+=state;b.consumed_household+=qty-state;};
  for(const c of cities)for(const g of goods)consume(c,g);
  // Substitution debits actual goods, transfers unmet need, never creates physical units.
  for(const c of cities)for(const g of goods){const b=stock(c.id,g.key);let missing=Math.max(0,b.demand-b.consumed_household-b.consumed_state);
    for(const sub of goods.filter(s=>s.key!==g.key&&s.basket===g.basket&&s.substitutability>0&&(s.finalUse??s.stage!=='intermediate'))){
      const sb=stock(c.id,sub.key),qty=Math.min(missing,available(sb));if(qty<=0)continue;
      sb.consumed_household+=qty;sb.demand+=qty;b.demand-=qty;missing-=qty;}
  }
  // Aggregate only for reachable downstream demand, retaining local reserves first.
  for(const c of [...cities].sort((a,b)=>service(a)-service(b)||a.id.localeCompare(b.id)))for(const g of goods){
    const hubId=hubs.get(key(c.id,g.key));if(!hubId)continue;const h=cityById.get(hubId)!;
    const downstream=cities.filter(d=>d.id===hubId||hubs.get(key(d.id,g.key))===hubId);
    let ancestor=hubs.get(key(hubId,g.key));const visited=new Set(downstream.map(d=>d.id));
    while(ancestor&&!visited.has(ancestor)){visited.add(ancestor);downstream.push(cityById.get(ancestor)!);ancestor=hubs.get(key(ancestor,g.key));}
    const demand=downstream.reduce((a,d)=>{const b=stock(d.id,g.key);return a+Math.max(0,b.demand-b.consumed_household-b.consumed_state-available(b));},0);
    const b=stock(c.id,g.key),policy=IDEOLOGIES[c.ideology]||IDEOLOGIES.customary_local;
    transfer(c,h,g,demand,'hub_aggregation',[h.id],b.demand*C.reserveTurns+available(b)*policy.retention);
  }
  for(const c of cities)for(const g of goods){consume(c,g);const b=stock(c.id,g.key);let missing=Math.max(0,b.demand-b.consumed_household-b.consumed_state);
    for(const s of inputSources(c,g)){if(missing<C.minLot)break;const sb=stock(s.id,g.key);
      missing-=transfer(s,c,g,missing,'regional_redistribution',[s.id],sb.demand*C.reserveTurns);consume(c,g);}
    // Long distance is restricted to center-to-center trade, not every producer × city.
    if(c.market>0&&missing>C.minLot)for(const s of cities.filter(s=>s.market>0&&s.id!==c.id)){
      const sb=stock(s.id,g.key);missing-=transfer(s,c,g,missing,'household_consumption',[],sb.demand*C.reserveTurns);consume(c,g);if(missing<C.minLot)break;}
  }
  // Reputation creates origin-specific additional demand, fulfilled only by that brand.
  for(const f of snapshot.fame.filter(f=>f.created!=null&&f.fame>0)){
    const origin=cityById.get(f.city),g=goodByKey.get(f.good);if(!origin||!g)continue;
    for(const c of cities.filter(c=>c.id!==origin.id&&c.market>0)){
      const wanted=c.population*C.fameDemand*f.fame/100;
      const b=stock(c.id,g.key);b.demand+=wanted;
      const delivered=transfer(origin,c,g,wanted,'famous_good_demand',[],stock(origin.id,g.key).demand*C.reserveTurns);
      b.consumed_household+=delivered;
    }
  }
  const famous: Fame[]=[];
  for(const c of cities)for(const g of goods){const b=stock(c.id,g.key),old=priorFame.get(key(c.id,g.key));
    const output=produced(b)-b.produced_household,cityOutput=[...balances.values()].filter(x=>x.city===c.id).reduce((a,x)=>a+produced(x),0);
    const exported=flows.filter(f=>f.source===c.id&&f.good===g.key).reduce((a,f)=>a+f.delivered,0);
    const distinctive=producers.some(p=>p.city===c.id&&p.recipe.good===g.key&&p.distinctive);
    const eligible=output>=C.fameMinOutput&&exported>=C.fameMinExport&&b.quality>=C.fameMinQuality&&c.guild>0&&distinctive&&output/Math.max(1,cityOutput)>=C.fameSpecialization;
    if(!old&&!eligible)continue;const streak=eligible?(old?.turn===snapshot.turn-1?old.streak+1:1):0;
    const created=old?.created??(streak>=C.fameTurns?snapshot.turn:null);
    famous.push({city:c.id,good:g.key,name:old?.name||`${c.name}: ${g.key}`,streak,
      fame:Math.max(0,Math.min(100,(old?.fame||0)+(eligible&&created!=null?C.fameGain:-C.fameDecay))),quality:b.quality,created,turn:snapshot.turn});
  }
  const metrics=cities.map(c=>{const own=[...balances.values()].filter(b=>b.city===c.id);
    const inbound=flows.filter(f=>f.destination===c.id),outbound=flows.filter(f=>f.source===c.id);
    const transit=flows.filter(f=>f.source!==c.id&&f.destination!==c.id&&f.path.includes(c.cell));
    const children=cities.filter(d=>[...hubs.entries()].some(([k,h])=>k.startsWith(`${d.id}::`)&&h===c.id));
    const sum=(a:Flow[])=>a.reduce((s,f)=>s+f.gross_value,0),agg=sum(inbound.filter(f=>f.reason==='hub_aggregation'));
    const reexport=goods.reduce((value,g)=>value+Math.min(sum(inbound.filter(f=>f.good===g.key)),sum(outbound.filter(f=>f.good===g.key))),0);const production=own.reduce((s,b)=>s+b.gross_output_value,0);
    const roles:string[]=[];if(production>0)roles.push('producer');if(c.market>0)roles.push('local_market');if(agg>0)roles.push('collection_center');
    if(own.some(b=>b.intermediate_value>0))roles.push('processing_center');if(children.length>1&&agg>0)roles.push('regional_hub');
    if(transit.length)roles.push('transit_hub');if(c.admin>0)roles.push('administrative_center');
    if(outbound.some(f=>cityById.get(f.destination)?.owner!==c.owner))roles.push('export_gateway');
    return {city:c.id,roles,tier:roles.includes('export_gateway')?4:roles.includes('regional_hub')?3:agg>0?2:c.market>0?1:0,
      production_importance:production,aggregation_importance:agg,transit_importance:sum(transit),strategic_importance:service(c),
      demand_importance:own.reduce((s,b)=>s+b.demand*goodByKey.get(b.good)!.price,0),administrative_importance:c.admin,
      handled_trade_value:sum(inbound)+sum(outbound),reexport_value:reexport,local_value_added:own.reduce((s,b)=>s+b.gross_output_value-b.intermediate_value,0),
      hinterland_population:children.reduce((s,d)=>s+d.population,0),network_centrality:graph.get(c.cell)?.length||0};});
  for(const c of cities){let storage=n(c.storage)*C.warehouseCapacity;for(const g of goods){const b=stock(c.id,g.key);
    b.unmet_demand=Math.max(0,b.demand-b.consumed_household-b.consumed_state);
    b.capex=(C.capexGoods as readonly string[]).includes(g.key)?Math.max(0,available(b)-b.demand*C.reserveTurns):0;
    const remaining=available(b)-b.capex;b.stored=g.storable?Math.min(remaining,storage/Math.max(1,g.bulk)):0;storage-=b.stored*Math.max(1,g.bulk);
    b.lost_spoilage+=Math.max(0,remaining-b.stored);
    const residual=b.opening+produced(b)+b.imported-b.exported-b.consumed_household-b.consumed_state-b.consumed_as_input-b.lost_spoilage-b.stored-b.capex;
    if(Math.abs(residual)>1e-6)throw Error(`Goods conservation failed ${key(c.id,g.key)}: ${residual}`);
  }}
  return {balances:[...balances.values()],flows,metrics,famous,diagnostics,hinterlands:[...hubs].map(([k,hub])=>({city:k.split('::')[0],good:k.split('::')[1],hub})),workforce:Object.fromEntries(workforce)};
}
