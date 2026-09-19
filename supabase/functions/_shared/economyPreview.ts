import { resolveGoodsEconomy, type Snapshot } from './goodsEconomy.ts';
import { buildManagementReport } from './management.ts';
import { normalizeLabor } from './economyConfig.ts';

export type EconomyScenario =
  | {kind:'recruitment';soldiers:number}
  | {kind:'labor';city:string;allocation:Record<string,number>}
  | {kind:'production';producer:string;capacityMultiplier:number}
  | {kind:'route';route:string;capacityMultiplier:number;costMultiplier:number};

const bounded=(value:number,min:number,max:number)=>{
  if(!Number.isFinite(value)||value<min||value>max)throw new Error('Scenario value out of range');
  return value;
};
/** Read-only counterfactual: exactly the same solver and opening stocks as a real refresh. */
export function previewEconomy(snapshot:Snapshot,realm:any,scenario:EconomyScenario){
  const next=structuredClone(snapshot),owned=next.cities.filter(c=>c.owner===realm.player_name);
  const owns=new Set(owned.map(c=>c.id));
  const before=resolveGoodsEconomy(snapshot);
  if(scenario.kind==='recruitment'){
    const available=owned.reduce((sum,c)=>sum+before.workforce[c.id].workforce,0);
    bounded(scenario.soldiers,0,available);
    for(const c of owned)c.soldiers+=available?scenario.soldiers*before.workforce[c.id].workforce/available:0;
  }else if(scenario.kind==='labor'){
    const city=owned.find(c=>c.id===scenario.city);if(!city)throw new Error('City not owned');
    for(const value of Object.values(scenario.allocation))bounded(value,0,100);
    city.labor=normalizeLabor(scenario.allocation);
  }else if(scenario.kind==='production'){
    const producer=next.producers.find(p=>p.id===scenario.producer&&owns.has(p.city));
    if(!producer)throw new Error('Producer not owned');
    producer.capacity*=bounded(scenario.capacityMultiplier,0,3);
  }else if(scenario.kind==='route'){
    const route=next.edges.find(e=>e.id===scenario.route);
    if(!route||!before.flows.some(f=>f.edges.includes(route.id)&&(owns.has(f.source)||owns.has(f.destination))))throw new Error('Route not part of this realm trade');
    route.capacity*=bounded(scenario.capacityMultiplier,1,3);
    route.cost*=bounded(scenario.costMultiplier,0.25,1);
  }else throw new Error('Unsupported scenario');
  const baseline=buildManagementReport(snapshot,before,realm);
  const after=buildManagementReport(next,resolveGoodsEconomy(next),realm);
  const keys=['value_added','gross_output','exports','imports','workforce','soldiers','food_stock','food_consumption','construction_incoming'];
  return {turn:snapshot.turn,assumption:'Jednorázové srovnání při stejných počátečních zásobách, obyvatelstvu, zákonech a chování partnerů. Nezahrnuje nákupní cenu investice ani budoucí růst. Změna kapacity sama nezajišťuje vstupy, práci ani dopravu.',
    rows:keys.map(key=>{const a=baseline.metrics.find(m=>m.key===key)!,b=after.metrics.find(m=>m.key===key)!;return {key,label:a.label,unit:a.unit,before:a.value,after:b.value};})};
}
