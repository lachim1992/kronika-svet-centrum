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
  recipe: Recipe; allocation: number; staffing: number; logistics: number; mastery: number; source: boolean; distinctive: boolean;
  /** Workers this facility can employ at full capacity. Derived from capacity × recipe labour when absent. */
  jobs?: number }
/** Canonical labour-market readout of one city. Derived, never a second population writer. */
export interface CityLabor { city: string; population: number; economically_active: number; available_workforce: number;
  employed_total: number; unemployed_total: number; jobs_capacity: number; vacancies_total: number;
  employment_rate: number; unemployment_rate: number;
  sectors: Record<string, { labor_supply: number; jobs_capacity: number; employed: number; vacancies: number; labor_shortage: number }> }
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
  path: string[]; edges: string[]; via_hubs: string[]; famous: string|null;
  source_price: number; destination_price: number; expected_margin: number }
/** Endogenous local market price, derived from the physical ledger only. */
export interface PriceRow { city: string; good: string; base_price: number; local_price: number;
  scarcity_factor: number; quality_factor: number; fame_factor: number; coverage: number;
  demand: number; supply: number; imported: number; substitutability: number }

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
  const diagnostics: {producer:string; good:string; capacity:number; realized:number; factors:Record<string,number>;
    jobs_capacity?:number; employed?:number; staffing_ratio?:number; potential_output?:number;
    inputs?:{good:string;required:number;supplied:number}[]; bottleneck?:string|null;
    blocked:string|null; delivery_path?:string[]}[]=[];
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
  /** Bounded endogenous price. Reads the ledger, never creates or destroys physical units. */
  const priceDetail=(city:string,good:string):PriceRow=>{
    const b=stock(city,good),g=goodByKey.get(good)!,c=cityById.get(city)!;
    const supply=b.opening+produced(b)+b.imported-b.lost_spoilage;
    const need=b.demand+b.consumed_as_input;
    const coverage=need>C.epsilon?supply/need:(supply>C.epsilon?2:1);
    const substitutes=goods.filter(s=>s.key!==good&&s.basket===g.basket&&s.substitutability>0)
      .reduce((a,s)=>a+available(stock(city,s.key)),0);
    const relief=1/(1+substitutes*Math.max(0.01,g.substitutability)/Math.max(1,need))
      /(1+n(c.storage)*C.priceStorageRelief);
    const shortage=Math.max(0,1-Math.min(1,coverage)),glut=Math.min(1,Math.max(0,coverage-1));
    const scarcity=Math.min(C.priceCeiling,Math.max(C.priceFloor,
      1+C.priceScarcityGain*shortage*relief/Math.max(0.25,g.substitutability)-C.priceGlutRelief*glut));
    const fame=priorFame.get(key(city,good));
    const fameFactor=fame?.created!=null&&fame.fame>0?1+C.famePremium*fame.fame/100:1;
    const qualityFactor=1+b.quality*C.qualityPremium;
    return {city,good,base_price:g.price,local_price:g.price*scarcity*qualityFactor*fameFactor,
      scarcity_factor:scarcity,quality_factor:qualityFactor,fame_factor:fameFactor,coverage,
      demand:need,supply,imported:b.imported,substitutability:g.substitutability};
  };
  const priceOf=(city:string,good:string)=>priceDetail(city,good).local_price;

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
  // Demand components are filled after the labour market, because operational and civic demand
  // depend on how many jobs are actually staffed. See the DEMAND PASS below.
  const demandComponents=new Map<string,Record<DemandChannel,number>>();
  const componentsOf=(city:string,good:string)=>{const k=key(city,good);let c=demandComponents.get(k);
    if(!c){c=emptyChannels();demandComponents.set(k,c);}return c;};
  const addChannel=(city:string,good:string,channel:DemandChannel,qty:number)=>{
    if(!(qty>0))return;const c=componentsOf(city,good);c[channel]+=qty;};
  /** Move demand (with its provenance mix) from one good to a substitute in the same basket. */
  const shiftChannels=(city:string,from:string,to:string,removed:number,added:number)=>{
    const src=componentsOf(city,from),total=channelTotal(src);
    if(total<=C.epsilon)return;
    const dst=componentsOf(city,to);
    for(const channel of DEMAND_CHANNELS){const share=src[channel]/total;
      src[channel]=Math.max(0,src[channel]-removed*share);dst[channel]+=added*share;}
  };

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
    // Industrial inputs are pulled by factories, not by shoppers: they reach further.
    const reach=(C.localReach+g.density+g.strategic*C.regionalReach+g.prestige*C.regionalReach+(branded?fame!.fame:0))
      *(reason==='production_input'?C.inputReachBonus:1);
    const transport=p.cost*policy.merchantFriction;
    if(transport>unit||p.cost>reach*policy.reach)return 0;
    if ((1-p.loss)*unit-transport-p.tolls-unit*targetPolicy.tariff<=0) return 0;
    // Price gradient: merchants move goods for realized value differences, not for bare deficits.
    const sourcePrice=priceOf(src.id,g.key),destinationPrice=priceOf(dst.id,g.key);
    const risk=p.edges.reduce((a,e)=>a+n(e.risk),0)*C.priceRiskCost*destinationPrice;
    const margin=destinationPrice*(1-p.loss)*(1-targetPolicy.tariff)-sourcePrice-transport-p.tolls-risk;
    if(reason!=='production_input'&&margin<=g.price*C.arbitrageMargin)return 0;
    const qty=Math.min(Math.max(0,available(b)-keep),wanted/(1-p.loss),p.capacity)*targetPolicy.imports;
    if(qty<C.minLot)return 0;const delivered=qty*(1-p.loss),before=available(db);
    b.exported+=qty;db.imported+=delivered;db.quality=(before*db.quality+delivered*b.quality)/(before+delivered);
    // Lost transport quantity is recorded at destination as import+loss for conservation.
    db.imported+=qty-delivered;db.lost_spoilage+=qty-delivered;
    for(const e of p.edges)reserved.set(e.id,(reserved.get(e.id)||0)+qty*Math.max(1,g.bulk));
    const tolls=qty*(p.tolls+unit*targetPolicy.tariff);
    flows.push({good:g.key,source:src.id,destination:dst.id,qty,delivered,quality:b.quality,gross_value:delivered*unit,
      transport_cost:qty*transport,tolls,net_value:delivered*unit-qty*transport-tolls,reason:branded&&reason==='household_consumption'?'famous_good_demand':reason,
      path:p.cells,edges:p.edges.map(e=>e.id),via_hubs:via.filter(id=>p.cells.includes(cityById.get(id)?.cell||'')),famous:branded?key(src.id,g.key):null,
      source_price:sourcePrice,destination_price:destinationPrice,expected_margin:margin*delivered});return delivered;

  };
  // Resolve upstream recipes before their customers, independently of database UUIDs.
  // Repeated passes still handle alternative/cyclic recipes with opening inventories.
  const depths=new Map<string,number>();
  const depth=(good:string,seen=new Set<string>()):number=>{
    if(depths.has(good))return depths.get(good)!;
    if(seen.has(good))return Infinity;
    const next=new Set(seen).add(good),recipes=snapshot.producers.filter(p=>p.recipe.good===good);
    const value=recipes.length?Math.min(...recipes.map(p=>p.recipe.inputs.length?
      1+Math.max(...p.recipe.inputs.map(i=>depth(i.good,next))):0)):0;
    if(Number.isFinite(value))depths.set(good,value);
    return value;
  };
  const producers=[...snapshot.producers].sort((a,b)=>Number(b.source)-Number(a.source)||
    depth(a.recipe.good)-depth(b.recipe.good)||a.id.localeCompare(b.id));
  const pending=new Map(producers.map(p=>[p.id,p]));
  const realized=new Map<string,number>();
  // ── LABOUR MARKET ────────────────────────────────────────────────────────────────────
  // Structures declare jobs; the city fills them from the civilian workforce of the sector.
  // No worker is counted twice, employment never exceeds supply nor declared jobs.
  const producerSector=(p:Producer)=>BASKET_SECTOR[goodByKey.get(p.recipe.good)?.basket||'']||'crafting';
  const jobsOf=(p:Producer)=>{
    if(p.jobs!==undefined)return n(p.jobs)*clamp(p.allocation)*clamp(p.staffing);
    const perUnit=n(p.recipe.labor)/Math.max(C.epsilon,n(p.recipe.qty));
    return n(p.capacity)*clamp(p.allocation)*perUnit*C.workersPerLaborUnit*clamp(p.staffing);
  };
  const laborSupply=(c:City,sector:Sector)=>workforce.get(c.id)!.workforce*C.sectors[sector]*sectorFactor(c,sector);
  const employed=new Map<string,number>();
  const laborMetrics:CityLabor[]=[];
  for(const c of cities){
    const sectors:CityLabor['sectors']={};let jobsTotal=0,employedTotal=0,supplyTotal=0;
    for(const sector of Object.keys(C.sectors) as Sector[]){
      const supply=laborSupply(c,sector);
      const own=producers.filter(p=>p.city===c.id&&producerSector(p)===sector);
      const jobs=own.reduce((s,p)=>s+jobsOf(p),0);
      const fill=jobs>C.epsilon?Math.min(1,supply/jobs):0;
      for(const p of own)employed.set(p.id,jobsOf(p)*fill);
      const filled=jobs*fill;
      sectors[sector]={labor_supply:supply,jobs_capacity:jobs,employed:filled,
        vacancies:Math.max(0,jobs-filled),labor_shortage:Math.max(0,jobs-supply)};
      jobsTotal+=jobs;employedTotal+=filled;supplyTotal+=supply;
    }
    const active=workforce.get(c.id)!.effectiveActivePop;
    laborMetrics.push({city:c.id,population:c.population,economically_active:active,
      available_workforce:workforce.get(c.id)!.workforce,employed_total:employedTotal,
      unemployed_total:Math.max(0,supplyTotal-employedTotal),jobs_capacity:jobsTotal,
      vacancies_total:Math.max(0,jobsTotal-employedTotal),
      employment_rate:supplyTotal>C.epsilon?employedTotal/supplyTotal:0,
      unemployment_rate:supplyTotal>C.epsilon?Math.max(0,1-employedTotal/supplyTotal):0,sectors});
  }
  /** employed / jobs_capacity, clamped. Automated producers without declared labour run at their own staffing. */
  const staffingRatio=(p:Producer)=>{const jobs=jobsOf(p);
    return jobs>C.epsilon?clamp((employed.get(p.id)||0)/jobs):clamp(p.staffing)*(n(p.recipe.labor)>0?0:1);};
  // Factories may use food surplus, never the last edible stock needed by residents.
  // The same rule applies to local processing and to industrial exports.
  const foodReserve=(c:City,g:Good)=>{
    if(g.basket!=='staple_food'||!(g.finalUse??g.stage!=='intermediate'))return 0;
    const edible=goods.filter(s=>s.basket==='staple_food'&&(s.finalUse??s.stage!=='intermediate'));
    const own=stock(c.id,g.key),ownNeed=Math.max(0,own.demand-own.consumed_household-own.consumed_state);
    const need=edible.filter(s=>s.key!==g.key).reduce((sum,s)=>{const b=stock(c.id,s.key);return sum+Math.max(0,b.demand-b.consumed_household-b.consumed_state);},0);
    const other=edible.filter(s=>s.key!==g.key).reduce((sum,s)=>sum+available(stock(c.id,s.key))*Math.min(1,s.substitutability),0);
    return ownNeed+Math.max(0,need-other)/Math.max(C.epsilon,Math.min(1,g.substitutability));
  };
  const inputSources=(c:City,g:Good)=>{
    const hub=hubs.get(key(c.id,g.key));
    // Only direct hinterland siblings/parent/children are considered in local clearing.
    return cities.filter(s=>s.id!==c.id&&(s.id===hub||hubs.get(key(s.id,g.key))===c.id||
      (hub&&hubs.get(key(s.id,g.key))===hub))).sort((a,b)=>(route(a.cell,c.cell,g)?.cost??Infinity)-(route(b.cell,c.cell,g)?.cost??Infinity)||a.id.localeCompare(b.id));
  };
  /**
   * Stage two of industrial input sourcing: any reachable center on the same canonical route
   * graph, ranked by delivered economics. Raw and processed goods therefore travel long
   * distance to factories without needing household demand of their own.
   */
  const distantInputSources=(c:City,g:Good)=>{
    const local=new Set(inputSources(c,g).map(s=>s.id));
    return cities.filter(s=>s.id!==c.id&&!local.has(s.id)&&available(stock(s.id,g.key))>C.minLot&&!!route(s.cell,c.cell,g))
      .map(s=>({city:s,path:route(s.cell,c.cell,g)!,surplus:available(stock(s.id,g.key))}))
      .filter(x=>x.path.capacity>0&&x.path.loss<1)
      .sort((a,b)=>(a.path.cost+a.path.tolls)-(b.path.cost+b.path.tolls)||b.surplus-a.surplus||a.city.id.localeCompare(b.city.id))
      .map(x=>x.city);
  };
  for(let pass=0;pending.size&&pass<C.maxProductionPasses;pass++){
    let progress=false;
    for(const [id,p] of pending){const c=cityById.get(p.city),g=goodByKey.get(p.recipe.good);if(!c||!g)throw Error(`Invalid producer ${id}`);
      const remote=!!p.cell&&p.cell!==c.cell,delivery=remote?route(p.cell!,c.cell,g):null;
      if(remote&&(!delivery||delivery.loss>=1||delivery.capacity<=0)){
        if(!realized.has(id))diagnostics.push({producer:id,good:g.key,capacity:p.capacity,realized:0,factors:{logistics:0},blocked:'missing_local_delivery_route'});
        pending.delete(id);continue;
      }
      const sector=BASKET_SECTOR[g.basket]||'crafting';
      const jobs=jobsOf(p),staffed=staffingRatio(p);
      // POTENTIAL OUTPUT: what the staffed facility could make if supplied with its inputs.
      const factors={staffing:staffed,stability:clamp(c.stability),logistics:clamp(p.logistics),mastery:n(p.mastery),
        infrastructure:sector==='farming'?1+c.irrigation*C.irrigationGain:1};
      const target=n(p.capacity)*clamp(p.allocation)*Object.values(factors).reduce((a,b)=>a*b,1);
      const desired=Math.max(0,target-(realized.get(id)||0));
      const labor={jobs_capacity:jobs,employed:employed.get(p.id)||0,staffing_ratio:staffed,potential_output:target};
      let qty=desired;
      const inputPaths=new Map<string,Path>();
      const loadByEdge=new Map<string,number>();
      if(delivery)for(const edge of delivery.edges)loadByEdge.set(edge.id,Math.max(1,g.bulk));
      if(remote)for(const i of p.recipe.inputs){const ig=goodByKey.get(i.good);if(!ig)throw Error(`Unknown input ${i.good}`);
        const path=route(c.cell,p.cell!,ig);if(!path||path.loss>=1){qty=0;break;}inputPaths.set(i.good,path);
        for(const e of path.edges)loadByEdge.set(e.id,(loadByEdge.get(e.id)||0)+i.qty/Math.max(C.epsilon,p.recipe.qty)*Math.max(1,ig.bulk)/(1-path.loss));
      }
      for(const [edge,load] of loadByEdge){const e=snapshot.edges.find(e=>e.id===edge)!;qty=Math.min(qty,Math.max(0,e.capacity-(reserved.get(edge)||0))/load);}
      if(!p.source&&!p.recipe.inputs.length){diagnostics.push({producer:id,good:g.key,capacity:p.capacity,realized:0,factors,...labor,inputs:[],blocked:'missing_recipe_inputs'});pending.delete(id);continue;}
      // INDUSTRIAL INPUT DEMAND scales from potential output, not from realized output: a staffed
      // mill demands grain before the grain arrives, through the canonical route engine.
      const inputs:{good:string;required:number;supplied:number}[]=[];
      let bottleneck:string|null=null;
      for(const i of p.recipe.inputs){const ig=goodByKey.get(i.good);if(!ig)throw Error(`Unknown input ${i.good}`);
        const deliveryRatio=1-(inputPaths.get(i.good)?.loss||0);
        const b=stock(c.id,i.good),required=desired*i.qty/Math.max(C.epsilon,p.recipe.qty)/deliveryRatio;
        if(b.quality<p.recipe.minQuality&&available(b)>0){qty=0;bottleneck=i.good;inputs.push({good:i.good,required,supplied:0});break;}
        const usable=()=>Math.max(0,available(b)-foodReserve(c,ig));
        let missing=Math.max(0,required-usable());
        const pull=(suppliers:City[])=>{
          for(const s of suppliers){if(missing<C.minLot)break;
            const sb=stock(s.id,ig.key);if(sb.quality<p.recipe.minQuality)continue;
            missing-=transfer(s,c,ig,missing,'production_input',hubs.has(key(s.id,ig.key))?[hubs.get(key(s.id,ig.key))!]:[],Math.max(foodReserve(s,ig),sb.demand-sb.consumed_household-sb.consumed_state,0));}
        };
        pull(inputSources(c,ig));
        if(missing>=C.minLot)pull(distantInputSources(c,ig));
        const supplied=Math.min(required,usable());
        inputs.push({good:i.good,required,supplied});
        const allowed=usable()*p.recipe.qty/Math.max(C.epsilon,i.qty)*deliveryRatio;
        if(allowed<qty-C.epsilon)bottleneck=i.good;
        qty=Math.min(qty,allowed);
      }
      // Input imports above may reserve the same road as the local delivery.
      for(const [edge,load] of loadByEdge){const e=snapshot.edges.find(e=>e.id===edge)!;qty=Math.min(qty,Math.max(0,e.capacity-(reserved.get(edge)||0))/load);}
      if(qty<=C.epsilon){if(desired<=C.epsilon){diagnostics.push({producer:id,good:g.key,capacity:p.capacity,realized:0,factors,...labor,inputs,
        blocked:jobs>C.epsilon&&staffed<=C.epsilon?'no_workers':'capacity_labor_or_staffing'});pending.delete(id);}continue;}
      let inputValue=0,minQuality=Infinity;
      for(const i of p.recipe.inputs){const b=stock(c.id,i.good),amount=qty*i.qty/p.recipe.qty;
        const shipped=amount/(1-(inputPaths.get(i.good)?.loss||0));
        b.consumed_as_input+=amount;b.lost_spoilage+=shipped-amount;minQuality=Math.min(minQuality,b.quality);
        inputValue+=shipped*goodByKey.get(i.good)!.price*(1+b.quality*C.qualityPremium);}
      const quality=Math.min(3,p.recipe.quality+(p.source?c.guild:Math.min(c.guild,minQuality)))*(IDEOLOGIES[c.ideology]?.quality||1);
      const b=stock(c.id,g.key);add(b,qty,quality,p.channel,p.source);b.intermediate_value+=inputValue;
      b.lost_spoilage+=qty*(delivery?.loss||0);
      for(const [edge,load] of loadByEdge)reserved.set(edge,(reserved.get(edge)||0)+qty*load);
      const total=(realized.get(id)||0)+qty;realized.set(id,total);
      const diagnostic={producer:id,good:g.key,capacity:p.capacity,realized:total,factors:{...factors,inputs:target?total/target:0},
        ...labor,inputs,bottleneck:total>=target-C.epsilon?null:bottleneck,delivery_path:delivery?.cells,blocked:null};
      const index=diagnostics.findIndex(d=>d.producer===id);
      if(index>=0)diagnostics[index]=diagnostic;else diagnostics.push(diagnostic);
      if(total>=target-C.epsilon)pending.delete(id);
      progress=true;
    }
    if(!progress)break;
  }
  for(const [id,p] of pending)if(!realized.has(id))diagnostics.push({producer:id,good:p.recipe.good,capacity:p.capacity,realized:0,factors:{},
    jobs_capacity:jobsOf(p),employed:employed.get(id)||0,staffing_ratio:staffingRatio(p),blocked:'missing_inputs_or_route'});
  const consume=(c:City,g:Good)=>{const b=stock(c.id,g.key),missing=Math.max(0,b.demand-b.consumed_household-b.consumed_state);
    const qty=Math.min(available(b),missing),state=Math.min(qty,Math.max(0,(stateDemand.get(key(c.id,g.key))||0)-b.consumed_state));
    b.consumed_state+=state;b.consumed_household+=qty-state;};
  for(const c of cities)for(const g of goods)consume(c,g);
  // Substitution debits actual goods, transfers unmet need, never creates physical units.
  const substitute=()=>{for(const c of cities)for(const g of goods){const b=stock(c.id,g.key);let missing=Math.max(0,b.demand-b.consumed_household-b.consumed_state);
    for(const sub of goods.filter(s=>s.key!==g.key&&s.basket===g.basket&&s.substitutability>0&&(s.finalUse??s.stage!=='intermediate'))){
      const efficiency=Math.min(1,sub.substitutability/Math.max(C.epsilon,g.substitutability));
      const sb=stock(c.id,sub.key),qty=Math.min(missing/efficiency,available(sb));if(qty<=0)continue;
      const fulfilled=qty*efficiency,stateNeed=Math.min(fulfilled,Math.max(0,(stateDemand.get(key(c.id,g.key))||0)-b.consumed_state));
      const stateQty=stateNeed/efficiency;
      sb.consumed_state+=stateQty;sb.consumed_household+=qty-stateQty;
      stateDemand.set(key(c.id,g.key),Math.max(0,(stateDemand.get(key(c.id,g.key))||0)-stateNeed));
      stateDemand.set(key(c.id,sub.key),(stateDemand.get(key(c.id,sub.key))||0)+stateQty);
      sb.demand+=qty;b.demand-=fulfilled;missing-=fulfilled;}
  }};
  substitute();
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
  // Imports can satisfy a different final good in the same basket too.
  substitute();
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
  const prices:PriceRow[]=cities.flatMap(c=>goods.map(g=>priceDetail(c.id,g.key)));
  return {balances:[...balances.values()],flows,metrics,famous,diagnostics,prices,hinterlands:[...hubs].map(([k,hub])=>({city:k.split('::')[0],good:k.split('::')[1],hub})),
    workforce:Object.fromEntries(workforce),labor:laborMetrics};

}
