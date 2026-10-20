import { fuelGuidance } from './fuelGuidance.ts';
import { buildRouteGraph, shortestTree, tracePath, usablePath, routeFrictionClass, type RoutePath } from './landedRoute.ts';
import { ECONOMY as C, IDEOLOGIES, BASKET_SECTOR, BASKET_TIER, DEMAND_WEIGHTS, type Sector } from './economyConfig.ts';
import { isFactor, isStaged, fallbackOf, kindOf, wearOf, consumedPerBatch, factorMultiplier, type KindedInput } from './inputKinds.ts';
import { computeWorkforceBreakdown } from './manpower.ts';
import { demandShares, functionalValue, substitutionEfficiency, discretionaryBudgetScale, cityAccounts, recipeMargin, localWage, producerAccount, productMeta, landedInputCost, outputQuality, tradeServiceVolumes, tradeServiceValue, prosperityIndex, capitalStockDelta, PRODUCT_MARKET, type CityAccounts } from './productMarket.ts';
import { BASKET_KEYS, DEMAND_CHANNELS, basketDemandChannels, basketSpec, channelTotal, emptyChannels,
  toolIntensityOf, toolProductivityMultiplier, DEMAND, type DemandChannel, type DemandInput } from './demandModel.ts';

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
  security: number; guild: number; /** Active building sites / projects: the only driver of construction demand. */
  constructionProjects?: number; ideology: keyof typeof IDEOLOGIES; coastal: boolean;
  activePopModifier?: number; maxMobModifier?: number;
  /** Informal part of market+storage (settlement baseline) — creates no service jobs. */
  commercialBaseline?: number;
  /** Housing headroom 0..1 (free housing / capacity), for the prosperity index only. */
  housingHeadroom?: number;
  /** Persisted city capital stock (written only by process-turn); read-only here. */
  capitalStock?: number; devastated?: boolean;
}
export interface Recipe { key: string; good: string; qty: number; inputs: KindedInput[]; labor: number; quality: number; minQuality: number }
export interface Producer { id: string; city: string; node?: string; cell?: string; channel: Channel; capacity: number;
  recipe: Recipe; allocation: number; staffing: number; logistics: number; mastery: number; source: boolean; distinctive: boolean;
  /** Workers this facility can employ at full capacity. Derived from capacity × recipe labour when absent. */
  jobs?: number;
  /** Explicit craftsmanship from level/master craft (productMarket.craftsmanship); falls back to city guild. */
  craft?: number;
  /** AUTO diagnostic: emergency_unprofitable_production when an essential recipe runs at a loss. */
  autoFlag?: string|null;
  /** Expected margin ratio at previous committed prices (proxy, not a landed-cost forecast). */
  expectedMarginProxy?: number;
  /** Player production order mode for this structure (loss warnings only; never changes it). */
  order?: 'auto'|'prefer'|'lock' }
/** Canonical labour-market readout of one city. Derived, never a second population writer. */
export interface CityLabor { city: string; population: number; economically_active: number; available_workforce: number;
  employed_total: number; unemployed_total: number; jobs_capacity: number; vacancies_total: number;
  employment_rate: number; unemployment_rate: number;
  /** Local wage per employed worker (productMarket.localWage). */
  wage_rate?: number;
  /** Share of idle labour that can cross sectors this turn (guilds, administration, market, stability). */
  labor_mobility?: number;
  /** Workers who actually retrained into another sector this turn. */
  retrained?: number;
  /** Idle people while jobs stand empty — the sector mismatch, not a general labour shortage. */
  structural_unemployed?: number;
  sectors: Record<string, { labor_supply: number; jobs_capacity: number; employed: number; vacancies: number; labor_shortage: number; transferred_in?: number; service_jobs?: number; service_employed?: number }>;
  /** Trade-service jobs from formal commercial infrastructure (logistics sector, filled after goods producers). */
  service?: { infrastructure: number; jobs: number; employed: number; staffing: number } }
export interface Edge { id: string; from: string; to: string; cost: number; capacity: number;
  mode: 'road'|'river'|'sea'|'spur'; risk: number; toll: number; border: number }
export interface Fame { city: string; good: string; name: string; streak: number; fame: number; quality: number; created: number|null; turn: number }
export interface OpeningLot { qty: number; quality: number; origin: string }
/** `lots` (optional) carries the previous turn's closing batch composition; must sum to qty. */
export interface Opening { city: string; good: string; qty: number; quality: number; lots?: OpeningLot[] }
export interface Snapshot { turn: number; goods: Good[]; cities: City[]; producers: Producer[]; edges: Edge[]; opening: Opening[]; fame: Fame[]; blockedTrade?: [string,string][];
  /** Last COMMITTED turn's consumption share per city × good (read-only history, never written by refresh). */
  familiarity?: Record<string, Record<string, number>>;
  /** Last COMMITTED turn's city budget ratios; absent → bootstrap (unconstrained, flagged). */
  budget?: Record<string, { discretionary_ratio: number; affordability: number; discretionary_budget?: number }>;
  /** Last COMMITTED local prices per `city::good` (product choice + budget reference; never same pass). */
  priorPrices?: Record<string, number>;
  /** Household tax wedge per owner (realm tax rates), for city accounts only. */
  householdTaxRate?: Record<string, number>;
  /** Wages paid per city in the last COMMITTED turn (wage_settlement); diagnostic only. */
  settledWages?: Record<string, number>;
  /** Ownership income actually paid last committed turn; absent for legacy settlements. */
  settledOwnership?: Record<string, number>;
  settlement?: Record<string, { arrears_closing: number; producer_retained: number; producer_cash_closing?: number; ownership_income_paid?: number }> }
export interface Balance { city: string; good: string; opening: number; produced_household: number; produced_node: number;
  produced_facility: number; produced_district: number; consumed_household: number; consumed_state: number;
  consumed_as_input: number; imported: number; exported: number; stored: number; lost_spoilage: number;
  /** Decomposition of lost_spoilage (the three sum to it): natural storage decay on opening stock,
   *  physical transport/delivery losses, and warehouse-capacity discard of unstorable surplus. */
  lost_decay: number; lost_transport: number; lost_discard: number;
  /** Closing batch composition of `stored` (sums to stored); next turn's Opening.lots. */
  stored_lots?: OpeningLot[];
  unmet_demand: number; demand: number; quality: number; gross_output_value: number; intermediate_value: number;
  extraction_value: number; capex: number }
export interface Flow { good: string; source: string; destination: string; qty: number; delivered: number; quality: number;
  gross_value: number; transport_cost: number; tolls: number; net_value: number; reason: string;
  path: string[]; edges: string[]; via_hubs: string[]; famous: string|null;
  source_price: number; destination_price: number; destination_wtp?: number; expected_margin: number }
/** Endogenous local market price, derived from the physical ledger only. */
export interface PriceRow { city: string; good: string; base_price: number; local_price: number;
  scarcity_factor: number; quality_factor: number; fame_factor: number; coverage: number;
  demand: number; supply: number; imported: number; substitutability: number }

const n = (x: number | undefined | null) => typeof x === "number" && Number.isFinite(x) ? Math.max(0,x) : 0;
const clamp = (x: number) => Math.max(0,Math.min(1,x));
const key = (city: string, good: string) => `${city}::${good}`;
export const produced = (b: Balance) => b.produced_household+b.produced_node+b.produced_facility+b.produced_district;

/** Pure deterministic physical ledger. No DB/time/random state, no fiscal mutations. */
export function resolveGoodsEconomy(snapshot: Snapshot) {
  const cities=[...snapshot.cities].sort((a,b)=>a.id.localeCompare(b.id));
  const goods=[...snapshot.goods].sort((a,b)=>a.key.localeCompare(b.key));
  const cityById=new Map(cities.map(c=>[c.id,c])); const goodByKey=new Map(goods.map(g=>[g.key,g]));
  const balances=new Map<string,Balance>(); const flows: Flow[]=[];
  const importBlockers: {city:string; good:string; unmet:number; reason:string; source:string|null}[]=[];
  const diagnostics: {producer:string; good:string; capacity:number; realized:number; factors:Record<string,number>;
    jobs_capacity?:number; employed?:number; staffing_ratio?:number; potential_output?:number;
    inputs?:{good:string;required:number;supplied:number}[]; bottleneck?:string|null;
    blocked:string|null; delivery_path?:string[];
    /** Observational: quality and origin city of the lots this producer actually consumed. */
    input_lots?:{good:string;qty:number;quality:number;origins:Record<string,number>;kind?:string}[];
    /** Staged fuel (C with fallback): physical coverage of the batch and output lost to the fallback. */
    fuel?:{coverage:number;fallback:number;batch:number;fueled:number;unfueled:number;lost_output:number;consumed:Record<string,number>}}[]=[];
  const priorFame=new Map(snapshot.fame.map(f=>[key(f.city,f.good),f]));
  const stock=(city:string,good:string):Balance=>{
    if(!cityById.has(city)||!goodByKey.has(good)) throw Error(`Invalid economy reference ${city}/${good}`);
    const k=key(city,good);let b=balances.get(k);
    if(!b){b={city,good,opening:0,produced_household:0,produced_node:0,produced_facility:0,produced_district:0,
      consumed_household:0,consumed_state:0,consumed_as_input:0,imported:0,exported:0,stored:0,lost_spoilage:0,
      lost_decay:0,lost_transport:0,lost_discard:0,
      unmet_demand:0,demand:0,quality:1,gross_output_value:0,intermediate_value:0,extraction_value:0,capex:0};balances.set(k,b)}return b;
  };
  const available=(b:Balance)=>Math.max(0,b.opening+produced(b)+b.imported-b.exported-b.consumed_household-b.consumed_state-b.consumed_as_input-b.lost_spoilage);
  // QUALITY LOTS: an in-pass composition of each balance's physical stock (not a second ledger —
  // quantities always equal available(b)). Each lot keeps its quality and origin city. Drains that
  // are not lot-aware (households, state, spoilage) remove proportionally; producers and exports
  // draw actual lots FIFO, so consumed quality is that of the batch used, not the city average.
  type Lot={qty:number;quality:number;origin:string};
  const lots=new Map<Balance,Lot[]>();
  const syncLots=(b:Balance)=>{const l=lots.get(b)||[];lots.set(b,l);const total=l.reduce((s,x)=>s+x.qty,0),avail=available(b);
    if(total>C.epsilon&&Math.abs(total-avail)>1e-12){const f=avail/total;for(const x of l)x.qty*=f;}
    else if(total<=C.epsilon&&avail>C.epsilon){l.length=0;l.push({qty:avail,quality:b.quality,origin:b.city});}
    for(let i=l.length-1;i>=0;i--)if(l[i].qty<=1e-12)l.splice(i,1);return l;};
  const requality=(b:Balance)=>{const l=lots.get(b)||[],t=l.reduce((s,x)=>s+x.qty,0);
    if(t>C.epsilon)b.quality=l.reduce((s,x)=>s+x.qty*x.quality,0)/t;};
  /** Call BEFORE the ledger counters change: adds a lot to the current composition. */
  const pushLot=(b:Balance,qty:number,quality:number,origin:string)=>{if(qty<=0)return;const l=syncLots(b);
    const same=l.find(x=>x.origin===origin&&Math.abs(x.quality-quality)<1e-12);if(same)same.qty+=qty;else l.push({qty,quality,origin});
    const t=l.reduce((s,x)=>s+x.qty,0);b.quality=l.reduce((s,x)=>s+x.qty*x.quality,0)/t;};
  /** Call BEFORE the ledger counters change: removes `amount` FIFO and returns the drawn lots. */
  /** FIFO among lots with quality ≥ minQ (default: all lots). */
  const drawLots=(b:Balance,amount:number,minQ=-Infinity):Lot[]=>{const l=syncLots(b),out:Lot[]=[];let rest=amount;
    for(let i=0;rest>1e-12&&i<l.length;){const x=l[i];if(x.quality<minQ-1e-12){i++;continue;}
      const take=Math.min(x.qty,rest);out.push({...x,qty:take});x.qty-=take;rest-=take;if(x.qty<=1e-12)l.splice(i,1);else i++;}
    if(rest>1e-12)out.push({qty:rest,quality:b.quality,origin:b.city});return out;};
  /** Physical quantity in lots meeting a recipe's minimum quality (the actual allocatable batch). */
  const eligibleQty=(b:Balance,minQ:number)=>minQ<=0?available(b):syncLots(b).reduce((t,x)=>t+(x.quality>=minQ-1e-12?x.qty:0),0);
  const lotQuality=(d:Lot[],fallback:number)=>{const t=d.reduce((s,x)=>s+x.qty,0);return t>0?d.reduce((s,x)=>s+x.qty*x.quality,0)/t:fallback;};
  const add=(b:Balance,qty:number,quality:number,channel:Channel,source=false)=>{
    pushLot(b,qty,quality,b.city);
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
    const ol=(o.lots||[]).filter(x=>n(x.qty)>0),olq=ol.reduce((s,x)=>s+n(x.qty),0);
    // Carried lots are trusted only when they reconcile with the canonical quantity; else one lot.
    if(ol.length&&Math.abs(olq-n(o.qty))<=1e-6*Math.max(1,n(o.qty)))for(const x of ol){const q=n(x.qty)*n(o.qty)/olq;pushLot(b,q,n(x.quality),x.origin||o.city);b.opening+=q;}
    else{pushLot(b,n(o.qty),n(o.quality),o.city);b.opening+=n(o.qty);}
    const decay=n(o.qty)*clamp(g.storageLoss/(1+cityById.get(o.city)!.storage));b.lost_spoilage+=decay;b.lost_decay+=decay;}
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
  const choice:any[]=[];
  const budgetCaps=new Map<string,{planned_spend:number;budget:number|null;scale:number;funded_spend:number;constrained:boolean;mode:string}>();
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

  const graph=buildRouteGraph(snapshot.edges);const reserved=new Map<string,number>();
  type Path=RoutePath<Edge>;
  const routeCache=new Map<string,Path|null>();
  const routeTrees=new Map<string,{dist:Map<string,number>;prev:Map<string,Edge>}>();
  // Shared landed-route model (landedRoute.ts): the same path/cost AUTO planning estimates with.
  const route=(from:string,to:string,g:Good,ignoreReservations=false):Path|null=>{
    const frictionClass=routeFrictionClass(g);
    const k=`${from}>${to}:${frictionClass}`;
    let p=routeCache.get(k);
    if(p===undefined){const treeKey=`${from}:${frictionClass}`;let tree=routeTrees.get(treeKey);
      if(!tree){tree=shortestTree(graph,from,g);routeTrees.set(treeKey,tree);}
      p=tracePath(tree,from,to,g);routeCache.set(k,p);}
    if(p===null)return null;
    return {...p,capacity:Math.min(...p.edges.map(e=>(e.capacity-(ignoreReservations?0:reserved.get(e.id)||0))/Math.max(1,g.bulk)),Infinity)};
  };
  const bestFame=(dst:City,g:Good)=>{let best={fame:0,origin:null as string|null};
    for(const f of snapshot.fame)if(f.good===g.key&&f.created!=null&&f.fame>best.fame&&fameReachable(f,dst,g))best={fame:f.fame,origin:f.city};return best;};
  const tradeBlocked=(a:City,b:City)=>!!snapshot.blockedTrade?.some(([x,y])=>(a.owner===x&&b.owner===y)||(a.owner===y&&b.owner===x));
  /** Origin-specific, route-reachable fame: an unreachable or war-blocked brand never shapes demand. */
  const fameReachable=(f:Fame,dst:City,g:Good)=>{if(f.city===dst.id)return true;const o=cityById.get(f.city);
    return !!o&&!tradeBlocked(o,dst)&&usablePath(route(o.cell,dst.cell,g,true));};
  const service=(c:City)=>c.market*C.marketPull+c.storage*C.storagePull+c.admin*C.adminPull+(graph.get(c.cell)?.length||0)*C.centralityPull;
  const hubs=new Map<string,string>();
  // Nearest better serviced centers, per friction class; no name/population-based tiers.
  for(const c of cities)for(const g of goods){let best=c.id,score=0;
    for(const h of cities){if(h.id===c.id||service(h)<=service(c))continue;const p=route(c.cell,h.cell,g,true);if(!p)continue;
      const a=service(h)*Math.max(0.1,h.security)/Math.pow(1+p.cost,C.hubDistanceExponent);
      if(a>score&&p.cost<C.regionalReach){best=h.id;score=a;}}
    if(best!==c.id)hubs.set(key(c.id,g.key),best);
  }
  /** Quality of the lots a FIFO draw of `amount` (only lots ≥ minQ) would take — read-only peek. */
  const peekQuality=(b:Balance,amount:number,minQ=-Infinity)=>{let rest=amount,q=0,t=0;
    for(const x of syncLots(b)){if(rest<=1e-12)break;if(x.quality<minQ-1e-12)continue;const take=Math.min(rest,x.qty);q+=take*x.quality;t+=take;rest-=take;}
    return t>C.epsilon?q/t:b.quality;};
  /** Canonical LANDED cost of one delivered unit of g from src to dst (productMarket.landedInputCost).
   *  Factory input: the source price is valued at the quality of the lots that would actually ship
   *  (eligible ≥ minQ, FIFO), NOT the city average, and never carries fame (fame = consumer WTP only).
   *  base × scarcity × (1 + eligibleQuality × premium): quality applied exactly once. */
  const landed=(src:City,dst:City,g:Good,minQ=-Infinity,wanted=Infinity)=>{const p=route(src.cell,dst.cell,g);if(!p||p.loss>=1||p.capacity<=0)return null;
    const policy=IDEOLOGIES[src.ideology]||IDEOLOGIES.customary_local,targetPolicy=IDEOLOGIES[dst.ideology]||IDEOLOGIES.customary_local;
    const sd=priceDetail(src.id,g.key),eq=peekQuality(stock(src.id,g.key),wanted,minQ),qf=1+eq*C.qualityPremium;
    return {...landedInputCost({sourcePrice:sd.base_price*sd.scarcity_factor*qf,transport:p.cost*policy.merchantFriction,tolls:p.tolls,
      tariffRate:targetPolicy.tariff,destinationPrice:priceOf(dst.id,g.key),risk:p.risk,loss:p.loss}),
      eligible_quality:eq,source_scarcity_factor:sd.scarcity_factor,source_quality_factor:qf};};
  /** Why the last household-ward transfer into a city×good was refused; diagnostics only, never alters stock. */
  type TradeRefusal='trade_blocked'|'route_unreachable'|'beyond_reach'|'margin_unprofitable'|'route_capacity'|'source_retained'|'source_empty';
  const tradeRefusals=new Map<string,{reason:TradeRefusal;source:string}>();
  const refuse=(src:City,dst:City,g:Good,why:string,r:TradeRefusal)=>{
    if(why==='household_consumption'||why==='regional_redistribution')tradeRefusals.set(key(dst.id,g.key),{reason:r,source:src.id});
    return 0;};
  const transfer=(src:City,dst:City,g:Good,wanted:number,reason:string,via:string[]=[],keep=0,minQ=-Infinity)=>{
    if(tradeBlocked(src,dst))return refuse(src,dst,g,reason,'trade_blocked');
    if(src.id===dst.id||wanted<C.minLot)return 0;const p=route(src.cell,dst.cell,g);if(!p||p.loss>=1)return refuse(src,dst,g,reason,'route_unreachable');
    const policy=IDEOLOGIES[src.ideology]||IDEOLOGIES.customary_local;
    const targetPolicy=IDEOLOGIES[dst.ideology]||IDEOLOGIES.customary_local;
    const b=stock(src.id,g.key),db=stock(dst.id,g.key);const fame=priorFame.get(key(src.id,g.key));
    const branded=fame?.created!=null&&fame.fame>0;
    const premium=branded?C.famePremium*fame!.fame/100:0;
    // Acquisition value at origin NEVER carries fame: fame acts on destination WTP only.
    const unit=g.price*(1+b.quality*C.qualityPremium);
    // Industrial inputs are pulled by factories, not by shoppers: they reach further.
    const reach=(C.localReach+g.density+g.strategic*C.regionalReach+g.prestige*C.regionalReach+(branded?fame!.fame:0))
      *(reason==='production_input'?C.inputReachBonus:1);
    const transport=p.cost*policy.merchantFriction;
    if(p.cost>reach*policy.reach)return refuse(src,dst,g,reason,'beyond_reach');
    const sd=priceDetail(src.id,g.key),sourcePrice=branded?sd.local_price/Math.max(C.epsilon,sd.fame_factor):sd.local_price,destinationPrice=priceOf(dst.id,g.key);
    const risk=p.edges.reduce((a,e)=>a+n(e.risk),0)*C.priceRiskCost*destinationPrice;
    // Origin-specific WTP: destination base valuation × the good's OWN origin fame premium
    // (destination's own fame factor removed). A factory buying an input pays no fame premium.
    const dd=priceDetail(dst.id,g.key),baseWTP=branded?dd.local_price/Math.max(C.epsilon,dd.fame_factor):destinationPrice;
    const destinationWTP=branded&&reason!=='production_input'?baseWTP*(1+premium):baseWTP;
    // ONE economics for every guard: sourcePrice + destination WTP + transport + tolls + tariff + risk.
    const margin=destinationWTP*(1-p.loss)*(1-targetPolicy.tariff)-sourcePrice-transport-p.tolls-risk;
    if(reason!=='production_input'&&margin<=g.price*C.arbitrageMargin)return refuse(src,dst,g,reason,'margin_unprofitable');
    // Factories are cost-driven: the physical haul must be worth the good, and the landed cost is capped.
    if(reason==='production_input'&&((1-p.loss)*unit-transport-p.tolls-unit*targetPolicy.tariff<=0
      ||(landed(src,dst,g,minQ,wanted)?.landed??Infinity)>g.price*PRODUCT_MARKET.maxLandedInputMultiple))return 0;
    // Realised sale value per delivered unit (gross trade — never GDP; only service margin is VA).
    const saleUnit=reason==='production_input'?unit:destinationWTP;
    // Quality-filtered sourcing: only lots meeting the buyer recipe's minQuality may be shipped.
    const shippable=minQ>0?Math.min(available(b)-keep,eligibleQty(b,minQ)):available(b)-keep;
    const qty=Math.min(Math.max(0,shippable),wanted/(1-p.loss),p.capacity)*targetPolicy.imports;
    if(qty<C.minLot){const r:TradeRefusal=available(b)<=keep+C.minLot?(available(b)<=C.minLot?'source_empty':'source_retained'):'route_capacity';return refuse(src,dst,g,reason,r);}const delivered=qty*(1-p.loss),before=available(db);
    void before;const drawn=drawLots(b,qty,minQ),shippedQuality=lotQuality(drawn,b.quality);
    for(const x of drawn)pushLot(db,x.qty*delivered/qty,x.quality,x.origin); // lots keep origin + quality in transit
    b.exported+=qty;db.imported+=delivered;requality(b);
    // Lost transport quantity is recorded at destination as import+loss for conservation.
    db.imported+=qty-delivered;db.lost_spoilage+=qty-delivered;db.lost_transport+=qty-delivered;
    for(const e of p.edges)reserved.set(e.id,(reserved.get(e.id)||0)+qty*Math.max(1,g.bulk));
    const tolls=qty*(p.tolls+saleUnit*targetPolicy.tariff);
    flows.push({good:g.key,source:src.id,destination:dst.id,qty,delivered,quality:shippedQuality,gross_value:delivered*saleUnit,
      transport_cost:qty*transport,tolls,net_value:delivered*saleUnit-qty*transport-tolls,reason:branded&&reason==='household_consumption'?'famous_good_demand':reason,
      path:p.cells,edges:p.edges.map(e=>e.id),via_hubs:via.filter(id=>p.cells.includes(cityById.get(id)?.cell||'')),famous:branded?key(src.id,g.key):null,
      source_price:sourcePrice,destination_price:destinationPrice,destination_wtp:destinationWTP,expected_margin:margin*delivered});return delivered;

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
  /**
   * HEADCOUNT. A producing structure declares its crew (ECONOMY.structureJobsBase at level 1,
   * doubling per level). Jobs are split between its recipe lines by allocation, so a structure
   * never employs more people than it declares, whatever recipes it happens to run.
   */
  const jobsOf=(p:Producer)=>{
    const declared=p.jobs!==undefined?n(p.jobs):(n(p.capacity)>0?C.structureJobsBase:0);
    return declared*clamp(p.allocation)*clamp(p.staffing);
  };

  const laborSupply=(c:City,sector:Sector)=>workforce.get(c.id)!.workforce*C.sectors[sector]*sectorFactor(c,sector);
  const employed=new Map<string,number>();
  const laborMetrics:CityLabor[]=[];
  const serviceLabor=new Map<string,{infrastructure:number;jobs:number;employed:number;staffing:number}>();
  /**
   * LABOUR MOBILITY. Share of idle labour able to cross into another sector this turn. Guilds,
   * administration, markets and stability raise it, so structural unemployment is a problem the
   * player can act on instead of an invisible rounding rule.
   */
  const mobilityOf=(c:City)=>{const m=C.laborMobility;
    return Math.max(0,Math.min(m.max,m.base+n(c.guild)*m.guild+n(c.admin)*m.admin+Math.max(0,n(c.market))*m.market+clamp(c.stability)*m.stability));};
  for(const c of cities){
    const sectors:CityLabor['sectors']={};let jobsTotal=0,employedTotal=0,supplyTotal=0;
    // Pass 1: every sector's own labour pool and its own jobs (goods lines + trade services).
    const plan=(Object.keys(C.sectors) as Sector[]).map(sector=>{
      const supply=laborSupply(c,sector);
      const own=producers.filter(p=>p.city===c.id&&producerSector(p)===sector);
      const goodsJobs=own.reduce((s,p)=>s+jobsOf(p),0);
      // TRADE SERVICES: formal market/warehouse/port capacity creates service jobs; they are filled
      // from logistics labour left after goods producers (one labour market, deterministic order).
      const infra=sector==='logistics'?Math.max(0,n(c.market)+n(c.storage)-n(c.commercialBaseline)):0;
      const serviceJobs=infra*PRODUCT_MARKET.serviceJobsPerCapacity;
      return {sector,supply,own,goodsJobs,serviceJobs,infra,jobs:goodsJobs+serviceJobs,transferred:0};
    });
    /**
     * Pass 2: RETRAINING. Idle labour in oversupplied sectors covers vacancies elsewhere, but only
     * up to the city's mobility. What stays idle next to an empty workshop is structural
     * unemployment — reported explicitly so it can be fixed, not silently hidden.
     */
    const mobility=mobilityOf(c);
    const surplus=plan.reduce((s,r)=>s+Math.max(0,r.supply-r.jobs),0);
    const deficit=plan.reduce((s,r)=>s+Math.max(0,r.jobs-r.supply),0);
    const moved=Math.min(surplus*mobility,deficit);
    if(moved>C.epsilon&&deficit>C.epsilon)for(const r of plan)r.transferred=moved*Math.max(0,r.jobs-r.supply)/deficit;
    for(const r of plan){
      const available=r.supply+r.transferred;
      const goodsUsed=Math.min(available,r.goodsJobs),fill=r.goodsJobs>C.epsilon?goodsUsed/r.goodsJobs:0;
      for(const p of r.own)employed.set(p.id,jobsOf(p)*fill);
      const serviceEmployed=Math.min(r.serviceJobs,Math.max(0,available-goodsUsed));
      const filled=goodsUsed+serviceEmployed;
      if(r.sector==='logistics')serviceLabor.set(c.id,{infrastructure:r.infra,jobs:r.serviceJobs,employed:serviceEmployed,
        staffing:r.serviceJobs>C.epsilon?serviceEmployed/r.serviceJobs:0});
      sectors[r.sector]={labor_supply:r.supply,jobs_capacity:r.jobs,employed:filled,
        vacancies:Math.max(0,r.jobs-filled),labor_shortage:Math.max(0,r.jobs-available),
        transferred_in:r.transferred,
        ...(r.sector==='logistics'?{service_jobs:r.serviceJobs,service_employed:serviceEmployed}:{})};
      jobsTotal+=r.jobs;employedTotal+=filled;supplyTotal+=r.supply;
    }
    const active=workforce.get(c.id)!.effectiveActivePop;
    const unemployed=Math.max(0,supplyTotal-employedTotal),vacancies=Math.max(0,jobsTotal-employedTotal);
    laborMetrics.push({city:c.id,population:c.population,economically_active:active,
      available_workforce:workforce.get(c.id)!.workforce,employed_total:employedTotal,
      unemployed_total:unemployed,jobs_capacity:jobsTotal,vacancies_total:vacancies,
      labor_mobility:mobility,retrained:moved,
      // People idle while jobs stand empty: the mismatch itself, not a general labour shortage.
      structural_unemployed:Math.min(unemployed,vacancies),
      employment_rate:supplyTotal>C.epsilon?employedTotal/supplyTotal:0,
      unemployment_rate:supplyTotal>C.epsilon?Math.max(0,1-employedTotal/supplyTotal):0,sectors,
      wage_rate:localWage({supply:supplyTotal,vacancies,unemployed}),service:serviceLabor.get(c.id)});
  }
  /** employed / jobs_capacity, clamped. Automated producers without declared labour run at their own staffing. */
  const staffingRatio=(p:Producer)=>{const jobs=jobsOf(p);
    return jobs>C.epsilon?clamp((employed.get(p.id)||0)/jobs):clamp(p.staffing)*(n(p.recipe.labor)>0?0:1);};
  // ── DEMAND PASS ──────────────────────────────────────────────────────────────────────
  // ONE canonical demand solver. Population creates NEEDS (and a little discretionary
  // consumption); everything else is demanded because the settlement actually does something:
  // staffed industry wears tools, building sites consume construction goods, institutions need
  // supplies, soldiers need military supply. Demand is a need budget per basket, not one full
  // demand for every substitute inside it.
  // A producer with an explicit B tools factor wears its own factor stock: never also city-level wear.
  const hasToolFactor=(p:Producer)=>p.recipe.inputs.some(i=>isFactor(i)&&goodByKey.get(i.good)?.basket==='tools');
  /** DERIVED B-factor demand (physical units of tools): expected wear at staffed capacity plus the gap
   *  between the factor requirement and opening stock. Expressed through the same industrial_operational
   *  channel, so tools explicitly declared as a factor still create replacement demand — exactly once. */
  const factorToolDemandOf=(c:City)=>{const need=new Map<string,{req:number;wear:number}>();
    for(const p of producers)if(p.city===c.id)for(const f of p.recipe.inputs)if(isFactor(f)&&goodByKey.get(f.good)?.basket==='tools'){
      const per=n(p.capacity)*clamp(p.allocation)*f.qty/Math.max(C.epsilon,p.recipe.qty),e=need.get(f.good)||{req:0,wear:0};
      e.req+=per;e.wear+=per*staffingRatio(p)*wearOf(f);need.set(f.good,e);}
    let total=0;for(const [g,e] of need)total+=e.wear+Math.max(0,e.req-stock(c.id,g).opening);return total;};
  const toolWearOf=(c:City)=>producers.filter(p=>p.city===c.id&&!hasToolFactor(p)).reduce((sum,p)=>{
    const basket=goodByKey.get(p.recipe.good)?.basket||'';
    return sum+n(p.capacity)*clamp(p.allocation)*staffingRatio(p)*toolIntensityOf(basket);},0)+factorToolDemandOf(c)/DEMAND.toolMaintenanceRate;
  const stockVolumeOf=(c:City)=>goods.reduce((sum,g)=>sum+stock(c.id,g.key).opening*Math.max(1,g.bulk),0);
  for(const c of cities){
    const labor=laborMetrics.find(l=>l.city===c.id);
    const input:DemandInput={
      weightedPop:0,populationRate:C.populationDemand,
      affluentShare:c.population>0?(n(c.classes.burghers)+n(c.classes.clerics))/c.population:0,
      market:n(c.market),toolWear:toolWearOf(c),
      adminWorkers:labor?.sectors.administration?.employed??0,adminInstitutions:n(c.admin),
      logisticsWorkers:labor?.sectors.logistics?.employed??0,
      stockVolume:stockVolumeOf(c),constructionProjects:n(c.constructionProjects),soldiers:n(c.soldiers),
    };
    // PASS 1 — plan every basket: functional need (channels) and two-level product shares.
    const budget=snapshot.budget?.[c.id],afford=budget?clamp(budget.affordability):1;
    const refPrice=(g:Good)=>snapshot.priorPrices?.[key(c.id,g.key)]??g.price*(1+stock(c.id,g.key).quality*C.qualityPremium);
    const plans:{basket:string;spec:any;options:Good[];shareOf:Map<string,number>;channels:ReturnType<typeof basketDemandChannels>}[]=[];
    for(const basket of BASKET_KEYS){
      const spec=basketSpec(basket)!;
      // Industrial intermediates receive demand from downstream recipes only.
      if(spec.class==='intermediate_only')continue;
      const options=goods.filter(g=>g.basket===basket&&(g.finalUse??g.stage!=='intermediate'));if(!options.length)continue;
      // PRODUCT CHOICE: preference, region, familiarity, novelty, quality, fame and PREVIOUS
      // COMMITTED local price (bootstrap: base × quality). Shares split the functional need only.
      const offer=options.map(g=>stock(c.id,g.key).opening+producers.filter(p=>p.city===c.id&&p.recipe.good===g.key).reduce((s,p)=>s+n(p.capacity)*clamp(p.allocation),0));
      const offerTotal=offer.reduce((a,b)=>a+b,0);
      const avgPrice=options.reduce((a,g)=>a+refPrice(g),0)/options.length;
      const shares=demandShares(options.map((g,i)=>({good:g.key,basket,referencePrice:refPrice(g),basketAveragePrice:avgPrice,
        quality:stock(c.id,g.key).quality,fame:bestFame(c,g).fame,
        familiarity:snapshot.familiarity?.[c.id]?.[g.key]??0,prevalence:offerTotal>0?offer[i]/offerTotal:1/options.length,
        coastal:c.coastal,affordability:afford,substitutability:g.substitutability})));
      for(const s of shares)choice.push({city:c.id,basket,...s,fame_origin:bestFame(c,goodByKey.get(s.good)!).origin,reference_price:refPrice(goodByKey.get(s.good)!),functional_value:functionalValue(s.good,basket)});
      const weightedPop=Object.entries(DEMAND_WEIGHTS[basket]||{}).reduce((s,[k,w])=>s+n(c.classes[k])*w,0);
      plans.push({basket,spec,options,shareOf:new Map(shares.map(s=>[s.good,s.share])),channels:basketDemandChannels(basket,{...input,weightedPop})});
    }
    // PASS 2 — one hard monetary cap for household_discretionary + fame at reference prices.
    let planned=0;
    for(const pl of plans)for(const g of pl.options)planned+=pl.channels.household_discretionary*(pl.shareOf.get(g.key)??0)/functionalValue(g.key,pl.basket)*refPrice(g);
    if(c.market>0)for(const f of snapshot.fame.filter(f=>f.created!=null&&f.fame>0&&f.city!==c.id)){const g=goodByKey.get(f.good);if(!g||!cityById.has(f.city)||!fameReachable(f,c,g))continue;
      planned+=c.population*C.fameDemand*f.fame/100*refPrice(g)*(1+C.famePremium*f.fame/100);}
    const cap=discretionaryBudgetScale(planned,budget?.discretionary_budget);
    budgetCaps.set(c.id,{planned_spend:planned,budget:budget?.discretionary_budget??null,scale:cap.scale,funded_spend:planned*cap.scale,constrained:cap.constrained,mode:cap.mode});
    for(const {basket,spec,options,shareOf,channels} of plans){
      channels.household_discretionary*=cap.scale;
      const total=channelTotal(channels);
      if(total<=0)continue;
      // Non-household channels (industry, institutions, construction, army) are state-side
      // consumption in the ledger; households consume needs and discretionary goods.
      const household=channels.household_need+channels.household_discretionary;
      // Functional need → physical units per product (÷ functional_value).
      for(const g of options){const share=shareOf.get(g.key)??0,b=stock(c.id,g.key),fv=functionalValue(g.key,basket);
        b.demand=total*share/fv;
        stateDemand.set(key(c.id,g.key),(total-household)*share/fv);
        for(const channel of DEMAND_CHANNELS)addChannel(c.id,g.key,channel,channels[channel]*share/fv);
      }
      // Population is NOT a goods producer. It supplies labour and demand only. The legacy
      // household emission stays behind an explicit flag for regression comparisons.
      if(C.householdProduction&&(C.householdBaskets as readonly string[]).includes(basket)){
        const baseline=options.find(g=>g.household===true)||options.find(g=>g.household===undefined&&g.stage==='household');
        if(baseline){let qty=c.population*C.householdRate*spec.intensity*workforce.get(c.id)!.workforceRatio*
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
  /**
   * TOOL COVERAGE. Tools are durable operational support, not a hard recipe input: coverage
   * scales productivity softly between the configured floor and 1, so zero tools never means
   * zero production and no settlement can enter a tool death spiral.
   */
  const toolCoverage=new Map<string,number>();
  for(const c of cities){
    const toolGoods=goods.filter(g=>g.basket==='tools'&&(g.finalUse??g.stage!=='intermediate'));
    const demand=toolGoods.reduce((s,g)=>s+stock(c.id,g.key).demand,0);
    const supply=toolGoods.reduce((s,g)=>s+available(stock(c.id,g.key)),0);
    toolCoverage.set(c.id,demand>C.epsilon?Math.min(1,supply/demand):1);
  }
  const toolFactor=(p:Producer)=>!hasToolFactor(p)&&toolIntensityOf(goodByKey.get(p.recipe.good)?.basket||'')>0
    ?toolProductivityMultiplier(toolCoverage.get(p.city)??1):1;

  // Factories may use food surplus, never the last edible stock needed by residents.
  // The same rule applies to local processing and to industrial exports.
  const foodReserve=(c:City,g:Good)=>{
    if(g.basket!=='staple_food'||!(g.finalUse??g.stage!=='intermediate'))return 0;
    const edible=goods.filter(s=>s.basket==='staple_food'&&(s.finalUse??s.stage!=='intermediate'));
    const own=stock(c.id,g.key),ownNeed=Math.max(0,own.demand-own.consumed_household-own.consumed_state);
    // Nutrition equivalence, one canonical rule shared with household substitution:
    // need and supply are compared in functional-value units, so preference friction
    // (substitutability) never steals calories from the reserve. All edible goods today
    // have functional_value 1, i.e. one physical unit feeds the same regardless of taste.
    const fv=(s:Good)=>functionalValue(s.key,s.basket);
    const needNu=edible.filter(s=>s.key!==g.key).reduce((sum,s)=>{const b=stock(c.id,s.key);return sum+Math.max(0,b.demand-b.consumed_household-b.consumed_state)*fv(s);},0);
    const otherNu=edible.filter(s=>s.key!==g.key).reduce((sum,s)=>sum+available(stock(c.id,s.key))*fv(s),0);
    return ownNeed+Math.max(0,needNu-otherNu)/Math.max(C.epsilon,fv(g));
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
  // OBSERVATIONAL ONLY (diagnostic v2): per-unit landed components accumulated from the same
  // landed() values already used for ranking/costing. Never read by any decision.
  const LANDED_PARTS=['source','transport','tolls','tariff','risk','loss_cost'] as const;
  type LandedParts=Record<typeof LANDED_PARTS[number],number>;
  const acquisition=new Map<string,Map<string,{qty:number;cost:number;suppliers:any[];chosen:string|null;parts:LandedParts}>>();
  /** B factors: required stock = capacity × qty/batch; coverage claimed per city/good so two
   *  producers cannot both count the same tools. Saturating multiplier (floor..1), computed once. */
  const factorClaims=new Map<string,number>(),capitalCache=new Map<string,{mult:number;coverage:Record<string,number>}>();
  const capitalFactor=(p:Producer)=>{const hit=capitalCache.get(p.id);if(hit)return hit.mult;let mult=1;const coverage:Record<string,number>={};
    const c=cityById.get(p.city)!;
    for(const f of p.recipe.inputs.filter(isFactor)){
      const ig=goodByKey.get(f.good);
      if(!ig)throw Error(`Unknown factor input ${f.good}`);
      const k=key(p.city,f.good),req=n(p.capacity)*clamp(p.allocation)*f.qty/Math.max(C.epsilon,p.recipe.qty);
      if(req<=C.epsilon)continue;
      const claimed=factorClaims.get(k)||0;
      let free=Math.max(0,available(stock(p.city,f.good))-claimed);
      // Class B is durable productive capital: import the MISSING STOCK before claiming it,
      // using the same quality-aware, capacity-limited and diplomatic route as class A.
      // The transfer itself is NOT intermediate consumption; only subsequent wear is.
      let missing=Math.max(0,req-free);
      if(missing>=C.minLot&&staffingRatio(p)>C.epsilon){
        const suppliers=[...inputSources(c,ig),...distantInputSources(c,ig)]
          .map(s=>({s,cost:landed(s,c,ig,0,missing)})).filter(x=>!!x.cost)
          .sort((a,b)=>a.cost!.landed-b.cost!.landed||a.s.id.localeCompare(b.s.id));
        const acq=acquisition.get(p.id)||new Map();acquisition.set(p.id,acq);
        const rec=acq.get(f.good)||{qty:0,cost:0,suppliers:suppliers.slice(0,3).map(x=>({city:x.s.id,landed:x.cost!.landed,...x.cost})),chosen:null as string|null,
          parts:{source:0,transport:0,tolls:0,tariff:0,risk:0,loss_cost:0}};acq.set(f.good,rec);
        for(const {s,cost} of suppliers){
          if(missing<C.minLot)break;
          const sb=stock(s.id,ig.key);
          const keep=Math.max(foodReserve(s,ig),sb.demand-sb.consumed_household-sb.consumed_state,0);
          const got=transfer(s,c,ig,missing,'production_input',[],keep);
          if(got>0){
            rec.qty+=got;rec.cost+=got*cost!.landed;rec.chosen ??= s.id;
            for(const part of LANDED_PARTS)rec.parts[part]+=got*cost![part];
            missing-=got;
          }
        }
        free=Math.max(0,available(stock(p.city,f.good))-claimed);
      }
      const cov=Math.min(1,free/req);
      factorClaims.set(k,claimed+Math.min(free,req));
      coverage[f.good]=cov;mult=Math.min(mult,factorMultiplier(cov));
    }
    capitalCache.set(p.id,{mult,coverage});return mult;};
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
        infrastructure:sector==='farming'?1+c.irrigation*C.irrigationGain:1,tools:toolFactor(p),capital:capitalFactor(p)};
      const target=n(p.capacity)*clamp(p.allocation)*Object.values(factors).reduce((a,b)=>a*b,1);
      const desired=Math.max(0,target-(realized.get(id)||0));
      const labor={jobs_capacity:jobs,employed:employed.get(p.id)||0,staffing_ratio:staffed,potential_output:target};
      let qty=desired;
      const inputPaths=new Map<string,Path>();
      const loadByEdge=new Map<string,number>();
      if(delivery)for(const edge of delivery.edges)loadByEdge.set(edge.id,Math.max(1,g.bulk));
      const flowInputs=p.recipe.inputs.filter(i=>!isFactor(i));
      if(remote)for(const i of flowInputs){const ig=goodByKey.get(i.good);if(!ig)throw Error(`Unknown input ${i.good}`);
        const path=route(c.cell,p.cell!,ig);if(!path||path.loss>=1){if(isStaged(i))continue;qty=0;break;}inputPaths.set(i.good,path);
        for(const e of path.edges)loadByEdge.set(e.id,(loadByEdge.get(e.id)||0)+i.qty/Math.max(C.epsilon,p.recipe.qty)*Math.max(1,ig.bulk)/(1-path.loss));
      }
      for(const [edge,load] of loadByEdge){const e=snapshot.edges.find(e=>e.id===edge)!;qty=Math.min(qty,Math.max(0,e.capacity-(reserved.get(edge)||0))/load);}
      if(!p.source&&!p.recipe.inputs.length){diagnostics.push({producer:id,good:g.key,capacity:p.capacity,realized:0,factors,...labor,inputs:[],blocked:'missing_recipe_inputs'});pending.delete(id);continue;}
      // INDUSTRIAL INPUT DEMAND scales from potential output, not from realized output: a staffed
      // mill demands grain before the grain arrives, through the canonical route engine.
      const inputs:{good:string;required:number;supplied:number}[]=[];
      let bottleneck:string|null=null;let stagedCovered=0;
      for(const i of flowInputs){const ig=goodByKey.get(i.good);if(!ig)throw Error(`Unknown input ${i.good}`);
        const staged=isStaged(i);if(staged&&p.cell&&p.cell!==c.cell&&!inputPaths.has(i.good))continue;
        const iq=kindOf(i)==='material'?p.recipe.minQuality:0; // C operating inputs are not quality-gated
        const deliveryRatio=1-(inputPaths.get(i.good)?.loss||0);
        const b=stock(c.id,i.good),required=(staged?Math.max(0,desired-stagedCovered):desired)*i.qty/Math.max(C.epsilon,p.recipe.qty)/deliveryRatio;
        // minQuality is checked on the lots that would actually be allocated, not the city average.
        const usable=()=>Math.max(0,Math.min(available(b)-foodReserve(c,ig),eligibleQty(b,iq)));
        let missing=Math.max(0,required-usable());
        // SOURCING: every eligible supplier (hinterland + reachable centers) ranked by LANDED cost,
        // subject to route capacity, source reserve, quality and diplomacy inside transfer().
        // Ranked at the price of the lots that would actually ship (eligible ≥ minQuality), not the city average.
        const minQ=iq;
        const suppliers=[...inputSources(c,ig),...distantInputSources(c,ig)]
          .filter(s=>minQ<=0||eligibleQty(stock(s.id,ig.key),minQ)>=C.minLot)
          .map(s=>({s,cost:landed(s,c,ig,minQ,Math.max(missing,C.minLot))})).filter(x=>!!x.cost)
          .sort((a,b)=>a.cost!.landed-b.cost!.landed||a.s.id.localeCompare(b.s.id));
        const acq=acquisition.get(id)||new Map();acquisition.set(id,acq);
        const rec=acq.get(i.good)||{qty:0,cost:0,suppliers:suppliers.slice(0,3).map(x=>({city:x.s.id,landed:x.cost!.landed,...x.cost})),chosen:null as string|null,parts:{source:0,transport:0,tolls:0,tariff:0,risk:0,loss_cost:0}};acq.set(i.good,rec);
        for(const {s,cost} of suppliers){if(missing<C.minLot)break;
          const sb=stock(s.id,ig.key);if(eligibleQty(sb,minQ)<C.minLot)continue;
          const got=transfer(s,c,ig,missing,'production_input',hubs.has(key(s.id,ig.key))?[hubs.get(key(s.id,ig.key))!]:[],Math.max(foodReserve(s,ig),sb.demand-sb.consumed_household-sb.consumed_state,0),minQ);
          if(got>0){rec.qty+=got;rec.cost+=got*cost!.landed;rec.chosen ??= s.id;for(const part of LANDED_PARTS)rec.parts[part]+=got*cost![part];}
          missing-=got;}
        const supplied=Math.min(required,usable());
        inputs.push({good:i.good,required,supplied});
        const allowed=usable()*p.recipe.qty/Math.max(C.epsilon,i.qty)*deliveryRatio;
        // Staged fuel never gates output: shortfall runs on the fallback (consumption below).
        if(staged){stagedCovered+=allowed;continue;}
        if(allowed<qty-C.epsilon)bottleneck=i.good;
        qty=Math.min(qty,allowed);
      }
      // Input imports above may reserve the same road as the local delivery.
      for(const [edge,load] of loadByEdge){const e=snapshot.edges.find(e=>e.id===edge)!;qty=Math.min(qty,Math.max(0,e.capacity-(reserved.get(edge)||0))/load);}
      if(qty<=C.epsilon){if(desired<=C.epsilon){diagnostics.push({producer:id,good:g.key,capacity:p.capacity,realized:0,factors,...labor,inputs,
        blocked:jobs>C.epsilon&&staffed<=C.epsilon?'no_workers':'capacity_labor_or_staffing'});pending.delete(id);}continue;}
      let inputValue=0,minQuality=Infinity;const inputLots:NonNullable<typeof diagnostics[number]['input_lots']>=[];
      // STAGED FUEL: the batch share covered by physical fuel (alternatives in order); the rest runs on
      // the fallback, so the same materials yield less output. Only stock actually present is drawn.
      const stagedInputs=flowInputs.filter(isStaged);let unfueled=qty;const fuelUse=new Map<KindedInput,number>();
      for(const i of stagedInputs){const ig=goodByKey.get(i.good)!,b=stock(c.id,i.good),lossF=1-(inputPaths.get(i.good)?.loss||0);
        const cover=Math.min(unfueled,Math.max(0,available(b)-foodReserve(c,ig))*p.recipe.qty/Math.max(C.epsilon,i.qty)*lossF);
        fuelUse.set(i,cover*i.qty/p.recipe.qty);unfueled-=cover;}
      const fallback=stagedInputs.length?Math.max(...stagedInputs.map(i=>fallbackOf(i)!)):1;
      const batch=qty;
      for(const i of flowInputs){const staged=isStaged(i),b=stock(c.id,i.good),amount=staged?(fuelUse.get(i)||0):qty*i.qty/p.recipe.qty,mat=kindOf(i)==='material';
        if(staged&&amount<=C.epsilon)continue;
        const shipped=amount/(1-(inputPaths.get(i.good)?.loss||0));
        // Quality of the batch actually drawn (FIFO lots), not the average of all city stock.
        const drawn=drawLots(b,shipped,mat?p.recipe.minQuality:-Infinity),usedQuality=lotQuality(drawn,b.quality),origins:Record<string,number>={};
        for(const x of drawn)origins[x.origin]=(origins[x.origin]||0)+x.qty;
        inputLots.push({good:i.good,qty:shipped,quality:usedQuality,origins,kind:kindOf(i)});
        b.consumed_as_input+=amount;b.lost_spoilage+=shipped-amount;b.lost_transport+=shipped-amount;requality(b);if(mat)minQuality=Math.min(minQuality,usedQuality);
        inputValue+=shipped*goodByKey.get(i.good)!.price*(1+usedQuality*C.qualityPremium);}
      // B factor wear: only wear × qty per output unit is physically consumed (never the whole stock).
      for(const f of p.recipe.inputs.filter(isFactor)){const b=stock(c.id,f.good),w=Math.min(available(b),qty*f.qty*wearOf(f)/p.recipe.qty);
        if(w<=C.epsilon)continue;const drawn=drawLots(b,w),wq=lotQuality(drawn,b.quality),origins:Record<string,number>={};
        for(const x of drawn)origins[x.origin]=(origins[x.origin]||0)+x.qty;
        inputLots.push({good:f.good,qty:w,quality:wq,origins,kind:'factor'});
        b.consumed_as_input+=w;requality(b);inputValue+=w*goodByKey.get(f.good)!.price*(1+wq*C.qualityPremium);}
      const lostOutput=stagedInputs.length?unfueled*(1-fallback):0;
      qty=batch-lostOutput;
      const fuelPrev=(diagnostics.find(d=>d.producer===id) as any)?.fuel;
      const fuel=stagedInputs.length?(()=>{const consumed:Record<string,number>={...(fuelPrev?.consumed||{})};
        for(const [i,v] of fuelUse)consumed[i.good]=(consumed[i.good]||0)+v;
        const bt=(fuelPrev?.batch||0)+batch,un=(fuelPrev?.unfueled||0)+unfueled;
        return {coverage:bt>C.epsilon?(bt-un)/bt:1,fallback,batch:bt,fueled:bt-un,unfueled:un,lost_output:(fuelPrev?.lost_output||0)+lostOutput,consumed};})():undefined;
      const quality=outputQuality({recipeBonus:p.recipe.quality,craft:p.craft??c.guild,source:p.source,
        minInputQuality:Number.isFinite(minQuality)?minQuality:0,craftFactor:IDEOLOGIES[c.ideology]?.quality||1});
      const b=stock(c.id,g.key);add(b,qty,quality,p.channel,p.source);b.intermediate_value+=inputValue;
      const inTransitLoss=qty*(delivery?.loss||0);b.lost_spoilage+=inTransitLoss;b.lost_transport+=inTransitLoss;
      for(const [edge,load] of loadByEdge)reserved.set(edge,(reserved.get(edge)||0)+qty*load);
      const total=(realized.get(id)||0)+qty;realized.set(id,total);
      const diagnostic={producer:id,good:g.key,capacity:p.capacity,realized:total,factors:{...factors,inputs:target?total/target:0},
        ...labor,inputs,input_lots:inputLots,bottleneck:total>=target-C.epsilon?null:bottleneck,delivery_path:delivery?.cells,blocked:null,...(fuel?{fuel}:{})};
      const index=diagnostics.findIndex(d=>d.producer===id);
      if(index>=0)diagnostics[index]=diagnostic;else diagnostics.push(diagnostic);
      if(total>=target-C.epsilon)pending.delete(id);
      progress=true;
    }
    if(!progress)break;
  }
  /**
   * A producer left pending never got its inputs. Say which reason honestly: the goods do not
   * exist anywhere in reach ("missing_inputs"), or they exist but no route carries them
   * ("missing_input_route"). Guessing "inputs or route" hides which problem to solve.
   */
  for(const [id,p] of pending)if(!realized.has(id)){
    const c=cityById.get(p.city)!;
    const unreachable=p.recipe.inputs.filter(i=>!isFactor(i)).some(i=>{const ig=goodByKey.get(i.good);if(!ig)return false;
      const holders=cities.filter(s=>available(stock(s.id,ig.key))>C.minLot);
      return holders.length>0&&!holders.some(s=>s.id===c.id||!!route(s.cell,c.cell,ig));});
    diagnostics.push({producer:id,good:p.recipe.good,capacity:p.capacity,realized:0,factors:{},
      jobs_capacity:jobsOf(p),employed:employed.get(id)||0,staffing_ratio:staffingRatio(p),
      inputs:p.recipe.inputs.filter(i=>!isFactor(i)).map(i=>({good:i.good,required:i.qty,supplied:available(stock(p.city,i.good))})),
      blocked:unreachable?'missing_input_route':'missing_inputs'});
  }

  // Claimed B factors remain productive capital after this turn: industrial demand may
  // request their acquisition, but must NOT consume their entire stock as household goods.
  // Only explicit B wear above may destroy them. Other tools without B claims still
  // fulfill normal industrial operational consumption.
  const uncommittedStock=(b:Balance)=>Math.max(0,available(b)-(factorClaims.get(key(b.city,b.good))||0));
  const consume=(c:City,g:Good)=>{const b=stock(c.id,g.key),missing=Math.max(0,b.demand-b.consumed_household-b.consumed_state);
    const qty=Math.min(uncommittedStock(b),missing),state=Math.min(qty,Math.max(0,(stateDemand.get(key(c.id,g.key))||0)-b.consumed_state));
    b.consumed_state+=state;b.consumed_household+=qty-state;};
  for(const c of cities)for(const g of goods)consume(c,g);
  // Substitution debits actual goods, transfers unmet need, never creates physical units.
  const substitute=()=>{for(const c of cities)for(const g of goods){const b=stock(c.id,g.key);let missing=Math.max(0,b.demand-b.consumed_household-b.consumed_state);
    for(const sub of goods.filter(s=>s.key!==g.key&&s.basket===g.basket&&s.substitutability>0&&(s.finalUse??s.stage!=='intermediate'))){
      // Need units of g covered per physical unit of sub: substitutability × functional value ratio.
      // Critical needs (staple_food) substitute by pure nutrition so preference friction never starves anyone.
      const efficiency=substitutionEfficiency(g,sub,{nutritionOnly:basketSpec(g.basket)?.class==='critical_need'});if(efficiency<=0)continue;
      const sb=stock(c.id,sub.key),qty=Math.min(missing/efficiency,uncommittedStock(sb));if(qty<=0)continue;
      const fulfilled=qty*efficiency,stateNeed=Math.min(fulfilled,Math.max(0,(stateDemand.get(key(c.id,g.key))||0)-b.consumed_state));
      const stateQty=stateNeed/efficiency;
      sb.consumed_state+=stateQty;sb.consumed_household+=qty-stateQty;
      stateDemand.set(key(c.id,g.key),Math.max(0,(stateDemand.get(key(c.id,g.key))||0)-stateNeed));
      stateDemand.set(key(c.id,sub.key),(stateDemand.get(key(c.id,sub.key))||0)+stateQty);
      sb.demand+=qty;b.demand-=fulfilled;shiftChannels(c.id,g.key,sub.key,fulfilled,qty);missing-=fulfilled;}
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
  // Basket-level subsistence trade: a city still short of a CRITICAL-need good (staple food)
  // may import a nutritious substitute from reachable sources — survival has physical priority
  // over product preference. transfer() still enforces routes, capacity, reserves, margins and
  // losses; nothing is created, and the following substitute() pass settles the imported units
  // against the deficit with shifted demand provenance (no double counting).
  for(const c of cities)for(const g of goods){
    if(basketSpec(g.basket)?.class!=='critical_need')continue;
    let missing=Math.max(0,stock(c.id,g.key).demand-stock(c.id,g.key).consumed_household-stock(c.id,g.key).consumed_state);
    if(missing<C.minLot)continue;
    for(const sub of goods.filter(s=>s.key!==g.key&&s.basket===g.basket&&s.substitutability>0&&(s.finalUse??s.stage!=='intermediate'))){
      if(missing<C.minLot)break;
      const eff=substitutionEfficiency(g,sub,{nutritionOnly:true});if(eff<=0)continue;
      const wanted=missing/eff;
      for(const s of inputSources(c,sub)){if(missing<C.minLot)break;const sb=stock(s.id,sub.key);
        missing-=transfer(s,c,sub,wanted,'regional_redistribution',[s.id],sb.demand*C.reserveTurns)*eff;}
      if(c.market>0&&missing>C.minLot)for(const s of cities.filter(s=>s.market>0&&s.id!==c.id)){
        const sb=stock(s.id,sub.key);
        missing-=transfer(s,c,sub,wanted,'household_consumption',[],sb.demand*C.reserveTurns)*eff;
        if(missing<C.minLot)break;}
    }
  }
  substitute();
  // Reputation creates origin-specific additional demand, fulfilled only by that brand.
  for(const f of snapshot.fame.filter(f=>f.created!=null&&f.fame>0)){
    const origin=cityById.get(f.city),g=goodByKey.get(f.good);if(!origin||!g)continue;
    for(const c of cities.filter(c=>c.id!==origin.id&&c.market>0&&fameReachable(f,c,g))){
      const wanted=c.population*C.fameDemand*f.fame/100*(budgetCaps.get(c.id)?.scale??1);
      const b=stock(c.id,g.key);b.demand+=wanted;addChannel(c.id,g.key,'fame',wanted);
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
      trade_services:tradeServiceValue({...tradeServiceVolumes({inbound,outbound,transit,
        basePrices:Object.fromEntries(goods.map(g=>[g.key,g.price])),
        localExchange:own.reduce((s,b)=>s+b.consumed_household*goodByKey.get(b.good)!.price,0)}),
        infrastructure:serviceLabor.get(c.id)?.infrastructure??0,staffing:serviceLabor.get(c.id)?.staffing??0}),
      hinterland_population:children.reduce((s,d)=>s+d.population,0),network_centrality:graph.get(c.cell)?.length||0};});
  for(const c of cities){let storage=n(c.storage)*C.warehouseCapacity;for(const g of goods){const b=stock(c.id,g.key);
    b.unmet_demand=Math.max(0,b.demand-b.consumed_household-b.consumed_state);
    // Diagnostic: why a still-hungry city did not import this good (last attempted source's refusal).
    if(b.unmet_demand>C.minLot){const ref=tradeRefusals.get(key(c.id,g.key));
      importBlockers.push({city:c.id,good:g.key,unmet:b.unmet_demand,reason:ref?.reason??'no_source_attempted',source:ref?.source??null});}
    b.capex=(C.capexGoods as readonly string[]).includes(g.key)?Math.max(0,available(b)-b.demand*C.reserveTurns):0;
    const remaining=available(b)-b.capex;b.stored=g.storable?Math.min(remaining,storage/Math.max(1,g.bulk)):0;storage-=b.stored*Math.max(1,g.bulk);
    { const l=syncLots(b),avail=available(b),f=avail>C.epsilon?b.stored/avail:0; // capex/spoilage drain proportionally
      b.stored_lots=b.stored>0?l.map(x=>({qty:x.qty*f,quality:x.quality,origin:x.origin})).filter(x=>x.qty>1e-12):[]; }
    const discard=Math.max(0,remaining-b.stored);b.lost_spoilage+=discard;b.lost_discard+=discard;
    const residual=b.opening+produced(b)+b.imported-b.exported-b.consumed_household-b.consumed_state-b.consumed_as_input-b.lost_spoilage-b.stored-b.capex;
    if(Math.abs(residual)>1e-6)throw Error(`Goods conservation failed ${key(c.id,g.key)}: ${residual}`);
    // Provenance must always add up to the canonical demand: no demand without a driver.
    const provenance=channelTotal(componentsOf(c.id,g.key));
    if(Math.abs(provenance-b.demand)>1e-6)throw Error(`Demand provenance mismatch ${key(c.id,g.key)}: ${provenance} vs ${b.demand}`);
  }}
  const prices:PriceRow[]=cities.flatMap(c=>goods.map(g=>priceDetail(c.id,g.key)));
  // COST ≠ MARKET VALUE: producer margin at local prices, inputs valued at the processing city.
  const recipeOf=new Map(snapshot.producers.map(p=>[p.id,p]));
  // Imported units are valued at their LANDED acquisition cost, own stock at the local price.
  for(const d of diagnostics){const p=recipeOf.get(d.producer);if(!p||!(d.realized>0))continue;
    const acq=acquisition.get(p.id);
    const fuelD=(d as any).fuel,base=fuelD?fuelD.batch:d.realized;
    const lines=p.recipe.inputs.map(i=>{const qty=isStaged(i)?(fuelD?.consumed?.[i.good]||0):base*consumedPerBatch(i)/Math.max(C.epsilon,p.recipe.qty),a=acq?.get(i.good);
      const imported=Math.min(qty,a?.qty||0),landedUnit=a&&a.qty>0?a.cost/a.qty:null,local=priceOf(p.city,i.good);
      const cost=imported*(landedUnit??local)+(qty-imported)*local;
      const cheaper=a?.suppliers.find(x=>x.city!==a.chosen&&landedUnit!=null&&x.landed<landedUnit-C.epsilon)||null;
      return {good:i.good,qty,price:qty>0?cost/qty:local,local_price:local,imported_qty:imported,landed_unit_cost:landedUnit,
        chosen_supplier:a?.chosen??null,cheaper_supplier:cheaper?{city:cheaper.city,landed:cheaper.landed}:null,
        landed_parts:a&&a.qty>0?Object.fromEntries(LANDED_PARTS.map(k=>[k,a.parts[k]/a.qty])):null,
        ranked_suppliers:a?a.suppliers.map(x=>({city:x.city,landed:x.landed,source:x.source,transport:x.transport,tolls:x.tolls,tariff:x.tariff,risk:x.risk,loss_cost:x.loss_cost,eligible_quality:x.eligible_quality,source_scarcity_factor:x.source_scarcity_factor,source_quality_factor:x.source_quality_factor})):null};});
    const outPrice=priceOf(p.city,p.recipe.good);
    const m=recipeMargin(d.realized,outPrice,lines);
    const sumKind=(f:(i:any)=>boolean)=>lines.filter((_,k)=>f(p.recipe.inputs[k])).reduce((t,l)=>t+l.qty*l.price,0);
    const capitalWear=sumKind(isFactor),operating=sumKind(i=>kindOf(i)==='operating'),material=sumKind(i=>kindOf(i)==='material');
    const wage=laborMetrics.find(l=>l.city===p.city)?.wage_rate??0;
    const account=producerAccount({realized:d.realized,revenue:m.revenue,intermediate:m.cost,capitalWear,employed:employed.get(p.id)||0,wage,material,operating,fuel:fuelD});
    (d as any).margin={...m,...account,unit_output_price:outPrice,unit_input_cost:d.realized>0?m.cost/d.realized:0,inputs:lines,
      diagnostic_version:3,order:p.order||'auto',loss_warning:m.margin<0,auto_flag:p.autoFlag??null,expected_margin_proxy:p.expectedMarginProxy??null};}
  // CITY ACCOUNTS (derived flows; no private wealth stock, no fiscal writes).
  const marginOf=(cid:string)=>diagnostics.filter(d=>recipeOf.get(d.producer)?.city===cid).map(d=>(d as any).margin).filter(Boolean);
  const producerPayroll=(cid:string)=>marginOf(cid).reduce((t:number,m:any)=>t+n(m.payroll),0);
  const producerSurplus=(cid:string)=>marginOf(cid).reduce((t:number,m:any)=>t+n(m.operating_surplus),0);
  const accounts=cities.map(c=>{const own=goods.map(g=>({g,b:stock(c.id,g.key)}));
    const comp=(g:Good)=>componentsOf(c.id,g.key);
    const needs=own.filter(({g})=>basketSpec(g.basket)?.class==='critical_need'||basketSpec(g.basket)?.class==='basic_need')
      .map(({g,b})=>{const ch=comp(g),tot=channelTotal(ch),hh=ch.household_need;
        return {good:g.key,qty:hh,localPrice:priceOf(c.id,g.key),basePrice:g.price,consumed:tot>0?(b.consumed_household+b.consumed_state)*hh/tot:0};})
      .filter(x=>x.qty>0);
    const wish=own.reduce((s,{g})=>s+(comp(g).household_discretionary+comp(g).fame)*priceOf(c.id,g.key),0);
    const basketConsumption:Record<string,number[]>={};
    for(const {g,b} of own){if(!(g.finalUse??g.stage!=='intermediate'))continue;(basketConsumption[g.basket] ||= []).push(b.consumed_household+b.consumed_state);}
    const goodsVA=own.reduce((s,{b})=>s+b.gross_output_value-b.intermediate_value,0);
    const services=metrics.find(m=>m.city===c.id)!.trade_services;
    const taxRate=snapshot.householdTaxRate?.[c.owner]??0.1;
    const acc=cityAccounts({city:c.id,valueAdded:goodsVA+services.service_value_added,
      householdTaxRate:taxRate,needs,discretionaryWish:wish,basketConsumption,settledWageIncome:snapshot.settledWages?.[c.id]??null,settledOwnershipIncome:snapshot.settledOwnership?.[c.id]??null});
    const lab=laborMetrics.find(l=>l.city===c.id);
    const prosperity=prosperityIndex({realPurchasingPowerPerCapita:c.population>0?acc.real_purchasing_power/c.population:0,
      employment:lab?lab.employment_rate:1,needCoverage:acc.physical_need_coverage,housingHeadroom:c.housingHeadroom??0.5,
      stability:c.stability,marketAccess:Math.min(1,n(c.market)/5)});
    // Candidate only: process-turn is the single writer that persists the stock.
    const capital=capitalStockDelta({stock:n(c.capitalStock),valueAdded:acc.city_gdp,needCoverage:acc.physical_need_coverage,
      stability:c.stability,taxRate,devastated:!!c.devastated});
    return {...acc,goods_value_added:goodsVA,service_value_added:services.service_value_added,trade_services:services,
      prosperity:prosperity.index,prosperity_parts:prosperity.parts,discretionary_cap:budgetCaps.get(c.id)??null,capital_stock:n(c.capitalStock),capital_candidate:capital,
      // Imputed producer payroll (sum of margin.payroll); household labour income uses SETTLED wages
      // (snapshot.settledWages) when present. UI labels: src/lib/economyFieldContract.ts.
      producer_payroll:producerPayroll(c.id),producer_operating_surplus:producerSurplus(c.id),wage_rate:lab?.wage_rate??null,
      // Echo of the last COMMITTED process-turn settlement (read-only; never recomputed here).
      settled_wage_arrears:snapshot.settlement?.[c.id]?.arrears_closing??null,
      settled_producer_retained:snapshot.settlement?.[c.id]?.producer_retained??null,
      settled_producer_cash:snapshot.settlement?.[c.id]?.producer_cash_closing??null,
      settled_ownership_income:snapshot.settlement?.[c.id]?.ownership_income_paid??null};});
  const demand=[...demandComponents.entries()].map(([k,channels])=>({city:k.split('::')[0],good:k.split('::')[1],
    channels:{...channels},total:channelTotal(channels)}));
  // Read-only fuel guidance from the same ledger (both views + AI); never alters stock.
  const fuelAdvice=fuelGuidance(snapshot,{balances:[...balances.values()],diagnostics});
  return {fuelGuidance:fuelAdvice,balances:[...balances.values()],flows,metrics,famous,diagnostics,prices,importBlockers,hinterlands:[...hubs].map(([k,hub])=>({city:k.split('::')[0],good:k.split('::')[1],hub})),
    workforce:Object.fromEntries(workforce),labor:laborMetrics,demand,
    toolCoverage:Object.fromEntries(toolCoverage),productChoice:choice,cityAccounts:accounts,
    budgetMode:snapshot.budget?'previous_committed_turn':'bootstrap_unconstrained'};

}
