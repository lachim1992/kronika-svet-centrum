import {produced,type Snapshot,type resolveGoodsEconomy} from './goodsEconomy.ts';
import {fiscalSummary} from './fiscal.ts';

export interface Contribution {id:string;label:string;value:number;city?:string;good?:string;route?:string}
export interface Metric {key:string;label:string;value:number|null;previous:number|null;unit:string;definition:string;sources:Contribution[];assumption?:string}
export interface ManagementAlert {id:string;severity:'critical'|'warning'|'opportunity'|'info';category:string;entity_type:string;entity_id:string;metric:string;current_value:number;threshold:number;reason:string;destination:string;levers:string[]}
export interface ManagementReport {turn:number;player:string;metrics:Metric[];alerts:ManagementAlert[];cities:any[];producers:any[];flows:any[];goods:any[];famous:any[];routes:any[];prices:any[];history:{turn:number;metrics:Record<string,number|null>}[]}
type Ledger=ReturnType<typeof resolveGoodsEconomy>;
const sum=<T>(rows:T[],f:(row:T)=>number)=>rows.reduce((n,row)=>n+f(row),0);

/** One deterministic interpretation of the physical ledger, reused by every screen. */
export function buildManagementReport(snapshot:Snapshot,ledger:Ledger,realm:any,previous?:ManagementReport):ManagementReport {
  if(previous?.turn!==snapshot.turn-1)previous=undefined;
  const player=realm.player_name,cities=snapshot.cities.filter(c=>c.owner===player),owned=new Set(cities.map(c=>c.id));
  const goods=new Map(snapshot.goods.map(g=>[g.key,g])),names=new Map(cities.map(c=>[c.id,c.name]));
  const balances=ledger.balances.filter(b=>owned.has(b.city)),flows=ledger.flows.filter(f=>owned.has(f.source)||owned.has(f.destination));
  const producers=ledger.diagnostics.flatMap(d=>{const p=snapshot.producers.find(p=>p.id===d.producer);return p&&owned.has(p.city)?[{...d,city:p.city,node:p.node,recipe:p.recipe,channel:p.channel}]:[]});
  const metrics:Metric[]=[],alerts:ManagementAlert[]=[];
  const add=(key:string,label:string,unit:string,definition:string,sources:Contribution[],value:number|null=sum(sources,s=>s.value),assumption?:string)=>{
    metrics.push({key,label,unit,definition,sources,value,previous:previous?.metrics.find(m=>m.key===key)?.value??null,assumption});
  };
  const fromBalances=(f:(b:typeof balances[number])=>number,rows=balances)=>rows.map(b=>({id:`${b.city}:${b.good}`,label:`${names.get(b.city)} · ${b.good}`,city:b.city,good:b.good,value:f(b)}));
  const fromFlows=(rows:typeof flows)=>rows.map((f,i)=>({id:`flow:${i}`,label:`${names.get(f.source)||'Zahraniční dodavatel'} → ${names.get(f.destination)||'Zahraniční odběratel'} · ${f.good}`,city:owned.has(f.source)?f.source:f.destination,good:f.good,route:f.edges[0],value:f.gross_value}));
  add('value_added','Přidaná hodnota','hodnota','Hrubá hodnota vyrobeného zboží minus hodnota spotřebovaných výrobních vstupů. Vývoz se nepřičítá.',fromBalances(b=>b.gross_output_value-b.intermediate_value));
  add('gross_output','Hrubý výstup','hodnota','Hodnota fyzické výroby ve všech čtyřech kanálech před odečtením vstupů.',fromBalances(b=>b.gross_output_value));
  add('final_consumption','Konečná spotřeba','hodnota','Skutečně spotřebované zboží domácností a státu v základních cenách.',fromBalances(b=>(b.consumed_household+b.consumed_state)*goods.get(b.good)!.price));
  add('exports','Vývoz','hodnota','Dodávky z vlastní říše do zahraničí; vnitřní přesuny jsou v obratu.',fromFlows(flows.filter(f=>owned.has(f.source)&&!owned.has(f.destination))));
  add('imports','Dovoz','hodnota','Dodávky ze zahraničí do vlastní říše.',fromFlows(flows.filter(f=>!owned.has(f.source)&&owned.has(f.destination))));
  add('trade_turnover','Obchodní obrat','hodnota','Odchozí fyzické transakce vlastní říše, včetně velkoobchodu a redistribuce.',fromFlows(flows.filter(f=>owned.has(f.source))));
  add('realized','Fyzická výroba','jednotek', 'Součet vyrobených jednotek zboží; není peněžní příjem.',fromBalances(produced));
  for(const channel of ['household','node','facility','district'] as const)add(`output_${channel}`,{household:'Domácnosti',node:'Uzly',facility:'Budovy',district:'Čtvrti'}[channel],'jednotek','Skutečná fyzická výroba příslušného kanálu.',fromBalances(b=>b[`produced_${channel}`]));
  add('rated_capacity','Jmenovitá kapacita','jednotek','Kapacita po rozdělení výrobních objednávek před omezením vstupy, prací a dopravou.',snapshot.producers.filter(p=>owned.has(p.city)).map(p=>({id:p.id,label:p.id,city:p.city,good:p.recipe.good,value:p.capacity*p.allocation})));
  const potential=sum(snapshot.producers.filter(p=>owned.has(p.city)),p=>p.capacity*p.allocation),realized=sum(producers,p=>p.realized);
  add('blocked_percent','Nevyužitá kapacita','%', 'Podíl nevyužité organizované kapacity ve stejných fyzických jednotkách.',[],potential?Math.max(0,1-realized/potential)*100:0);
  const food=balances.filter(b=>goods.get(b.good)?.basket==='staple_food');
  const consumption=sum(food,b=>b.consumed_household+b.consumed_state),stock=sum(food,b=>b.stored);
  add('food_stock','Zásoby jídla','jednotek','Zbývající skladovatelné potraviny po spotřebě, výrobních vstupech a ztrátách.',fromBalances(b=>b.stored,food));
  add('food_consumption','Spotřeba jídla','jednotek/tah','Skutečná spotřeba domácností a armád, započtená jednou.',fromBalances(b=>b.consumed_household+b.consumed_state,food));
  add('food_coverage','Pokrytí potravinami','tahů','Zásoba / současná spotřeba. Jde o hrubou rezervu bez další produkce; místní nedostatky zůstávají v upozorněních.',[],consumption?stock/consumption:null,'Při stejné spotřebě, bez nové produkce a dovozu.');
  add('workforce','Civilní pracovní síla','lidí','Potenciální aktivní populace minus skuteční aktivní vojáci.',cities.map(c=>({id:c.id,label:c.name,city:c.id,value:ledger.workforce[c.id].workforce})));
  add('soldiers','Aktivní vojáci','lidí','Skutečný stav aktivních armád; nastavená mobilizační sazba není počet vojáků.',cities.map(c=>({id:c.id,label:c.name,city:c.id,value:ledger.workforce[c.id].mobilized})));
  add('population','Obyvatelstvo','lidí','Součet obyvatel vlastních měst.',cities.map(c=>({id:c.id,label:c.name,city:c.id,value:c.population})));
  // LABOR MARKET. Obyvatelstvo nevyrábí zboží; dodává práci do míst, která zaměstnávají.
  const labor=(ledger.labor||[]).filter((l:any)=>owned.has(l.city));
  add('jobs_capacity','Pracovní místa','míst','Součet pracovních míst, která vytvářejí budovy, čtvrti a uzly.',labor.map((l:any)=>({id:l.city,label:names.get(l.city),city:l.city,value:l.jobs_capacity})));
  add('employed','Zaměstnaní','lidí','Skutečně obsazená pracovní místa; nikdo není zaměstnán dvakrát.',labor.map((l:any)=>({id:l.city,label:names.get(l.city),city:l.city,value:l.employed_total})));
  add('unemployed','Nezaměstnaní','lidí','Nabídka práce, pro kterou ve městě nejsou pracovní místa.',labor.map((l:any)=>({id:l.city,label:names.get(l.city),city:l.city,value:l.unemployed_total})));
  add('vacancies','Neobsazená místa','míst','Pracovní místa, pro která chybí lidé.',labor.map((l:any)=>({id:l.city,label:names.get(l.city),city:l.city,value:l.vacancies_total})));
  const laborSupplyTotal=labor.reduce((s:number,l:any)=>s+l.available_workforce,0),employedTotal=labor.reduce((s:number,l:any)=>s+l.employed_total,0);
  add('employment_rate','Zaměstnanost','%','Podíl zaměstnané pracovní síly říše.',[],laborSupplyTotal?employedTotal/laborSupplyTotal*100:null);
  const fiscal=fiscalSummary(realm);
  add('treasury','Pokladnice','zlata','Aktuální zůstatek státní pokladny.',[{id:player,label:'realm_resources.gold_reserve',value:Number(realm.gold_reserve||0)}]);
  add('net_fiscal','Čistý fiskální tok','zlata/tah','Zveřejněné daňové příjmy minus vykázané průběžné výdaje. Jednorázové stavební náklady nejsou zahrnuty.',[{id:'tax',label:'Daňové příjmy',value:fiscal.income},{id:'expenses',label:'Průběžné výdaje',value:-fiscal.expenses}],fiscal.net,`Poslední fiskální vyúčtování: tah ${realm.last_processed_turn??'nezjištěn'}.`);
  add('runway','Výdrž pokladnice','tahů','Pokladnice dělená záporným čistým fiskálním tokem; při nezáporném toku se nevyčerpává.',[],fiscal.net<0?Number(realm.gold_reserve||0)/-fiscal.net:null,'Stejný příjem a průběžné výdaje; bez nových jednorázových investic.');
  add('construction_stock','Stavební zásoba','jednotek','Aktuální stavební rezerva po dosavadních úhradách projektů.',[{id:player,label:'realm_resources.production_reserve',value:Number(realm.production_reserve||0)}]);
  add('construction_incoming','Volný stavební přebytek','jednotek/tah','Pouze dosud nespotřebované a nevyvezené stavební zboží způsobilé pro CAPEX.',fromBalances(b=>b.capex));
  const prices=ledger.prices.filter(p=>owned.has(p.city)).map(p=>({...p,city_name:names.get(p.city),basket:goods.get(p.good)?.basket}));
  const weight=prices.reduce((n,p)=>n+p.demand,0);
  add('price_index','Cenová hladina','× referenční cena','Vážený poměr lokální tržní ceny k dlouhodobé referenční ceně; váhou je skutečná poptávka daného zboží.',[],
    weight?prices.reduce((n,p)=>n+p.local_price/Math.max(1e-9,p.base_price)*p.demand,0)/weight:1,
    'Cena vzniká z fyzického ledgeru (nabídka, poptávka, zásoby, substituty, dovoz, kvalita, proslulost) a nevytváří ani neničí množství.');
  for(const p of prices.filter(p=>p.demand>0&&p.local_price>=p.base_price*1.3).sort((a,b)=>b.local_price/b.base_price-a.local_price/a.base_price).slice(0,12)){
    const shortage=balances.find(b=>b.city===p.city&&b.good===p.good);
    alerts.push({id:`price:${p.city}:${p.good}`,severity:p.local_price>=p.base_price*2?'critical':'warning',category:'price',entity_type:'city',entity_id:p.city,
      metric:p.good,current_value:p.local_price,threshold:p.base_price,
      reason:`${p.city_name}: ${p.good} je za ${p.local_price.toFixed(1)} místo ${p.base_price.toFixed(1)} (pokrytí poptávky ${(p.coverage*100).toFixed(0)} %, dovoz ${p.imported.toFixed(1)}, chybí ${(shortage?.unmet_demand||0).toFixed(1)}).`,
      destination:'economy',levers:['Rozšířit cestu k dodavateli','Zvýšit místní výrobu','Otevřít nový dovoz','Změnit obchodní režim']});}

  for(const b of balances)if(b.unmet_demand>0){const fill=b.demand?1-b.unmet_demand/b.demand:1;
    alerts.push({id:`need:${b.city}:${b.good}`,severity:goods.get(b.good)?.basket==='staple_food'&&fill<0.8?'critical':'warning',category:'staple_food'===goods.get(b.good)?.basket?'food':'input',entity_type:'city',entity_id:b.city,metric:b.good,current_value:fill,threshold:1,reason:`${names.get(b.city)}: chybí ${b.unmet_demand.toFixed(1)} jednotek ${b.good}.`,destination:'economy',levers:['Prověřit dodavatele a cestu','Otevřít výrobu města']});}
  for(const d of producers)if(d.blocked)alerts.push({id:d.producer,severity:'warning',category:'production',entity_type:'node',entity_id:d.node||d.city,metric:d.good,current_value:d.realized,threshold:d.capacity,reason:`${names.get(d.city)} · ${d.good}: ${d.blocked}`,destination:'economy',levers:['Prověřit vstupy','Změnit objednávku','Otevřít pracovní sílu']});
  for(const f of ledger.famous.filter(f=>owned.has(f.city)&&f.created===null))alerts.push({id:`fame:${f.city}:${f.good}`,severity:'opportunity',category:'trade',entity_type:'city',entity_id:f.city,metric:'fame_streak',current_value:f.streak,threshold:3,reason:`${names.get(f.city)} · ${f.good}: ${f.streak} úspěšných tahů k proslulému výrobku.`,destination:'economy',levers:['Zajistit vstupy a vývoz']});
  const priority={critical:0,warning:1,opportunity:2,info:3};alerts.sort((a,b)=>priority[a.severity]-priority[b.severity]||a.id.localeCompare(b.id));
  const cityReports=cities.map(c=>({...ledger.metrics.find(m=>m.city===c.id),id:c.id,name:c.name,cell:c.cell,population:c.population,stability:c.stability*100,workforce:ledger.workforce[c.id],labor:labor.find((l:any)=>l.city===c.id),balances:balances.filter(b=>b.city===c.id),prices:prices.filter(p=>p.city===c.id),hinterlands:ledger.hinterlands.filter(h=>h.city===c.id||h.hub===c.id)}));
  const routes=snapshot.edges.filter(e=>flows.some(f=>f.edges.includes(e.id))).map(e=>({...e,used:sum(flows.filter(f=>f.edges.includes(e.id)),f=>f.qty*Math.max(1,goods.get(f.good)!.bulk)),handled_value:sum(flows.filter(f=>f.edges.includes(e.id)),f=>f.gross_value)}));
  const history=[...(previous?.history||[]).filter(h=>h.turn<snapshot.turn),{turn:snapshot.turn,metrics:Object.fromEntries(metrics.map(m=>[m.key,m.value]))}].slice(-10);
  return {turn:snapshot.turn,player,metrics,alerts,cities:cityReports,producers,labor,flows:flows.map(f=>({...f,source_name:names.get(f.source)||'Zahraniční dodavatel',destination_name:names.get(f.destination)||'Zahraniční odběratel'})),goods:snapshot.goods,famous:ledger.famous.filter(f=>owned.has(f.city)),routes,prices,history};
}
