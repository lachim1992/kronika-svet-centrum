import { useState } from 'react';
import { useManagementReport } from '@/hooks/useManagementReport';
import type { resolveGoodsEconomy } from '../../../supabase/functions/_shared/goodsEconomy';
type Ledger=ReturnType<typeof resolveGoodsEconomy>;
const fmt=(n:number)=>Number(n||0).toLocaleString('cs-CZ',{maximumFractionDigits:2});
const labels:Record<string,string>={production_input:'Výrobní vstupy',household_consumption:'Spotřeba',hub_aggregation:'Sběr do centra',regional_redistribution:'Regionální rozvoz',military_supply:'Armáda',state_redistribution:'Stát',famous_good_demand:'Proslulé výrobky',external_export:'Vnější export'};
export default function PhysicalEconomyPanel({sessionId,cities,playerName,currentTurn}:{sessionId:string;cities:any[];playerName:string;currentTurn:number}){
  const [city,setCity]=useState(''),[reason,setReason]=useState('');
  const {data:reportResult,error,isLoading}=useManagementReport(sessionId,playerName,currentTurn);
  const report=reportResult?.report??null;
  if(error)return <p role="alert" className="text-sm text-destructive">{String(error)}</p>;
  if(isLoading)return <p className="text-sm">Načítám bilanci zboží…</p>;
  if(!report)return <p className="text-sm">Fyzická bilance bude k dispozici po uzavření tahu {currentTurn}.</p>;
  const ledger={balances:report.cities.flatMap(c=>c.balances),flows:report.flows,metrics:report.cities,famous:report.famous,diagnostics:report.producers} as Pick<Ledger,'balances'|'flows'|'metrics'|'famous'|'diagnostics'>;
  const name=(id:string)=>cities.find(c=>c.id===id)?.name||id;
  const balances=ledger.balances.filter(b=>!city||b.city===city),flows=ledger.flows.filter(f=>(!city||f.source===city||f.destination===city||f.via_hubs.includes(city))&&(!reason||f.reason===reason));
  const points=flows.flatMap(f=>f.path).map(p=>p.split(',').map(Number)).filter(p=>p.every(Number.isFinite));
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(0,...xs),minY=Math.min(0,...ys),w=Math.max(1,...xs)-minX,h=Math.max(1,...ys)-minY;
  const project=(cell:string)=>{const [x,y]=cell.split(',').map(Number);return `${20+(x-minX)*560/w},${20+(y-minY)*260/h}`;};
  return <section className="space-y-4 rounded-xl border p-4">
    <h3 className="font-semibold">Fyzická ekonomika a původ hodnot</h3>
    <p className="text-xs text-muted-foreground">Údaje z uzavřeného tahu {report.turn}.</p>
    <div className="flex flex-wrap gap-3">
      <label>Město <select className="bg-background border rounded p-1" value={city} onChange={e=>setCity(e.target.value)}><option value="">Všechna</option>{cities.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Důvod toku <select className="bg-background border rounded p-1" value={reason} onChange={e=>setReason(e.target.value)}><option value="">Všechny</option>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    </div>
    <div className="overflow-auto"><table className="text-xs w-full"><caption className="text-left mb-2">Potřeby, výroba, spotřeba a zásoby — fyzické jednotky za tah</caption>
      <thead><tr>{['Město / zboží','Potřeba','Domácnosti','Uzly','Budovy','Čtvrti','Vstupy','Spotřeba','Dovoz','Vývoz','Sklad','Ztráty','CAPEX','Chybí','Kvalita','Přidaná hodnota'].map(x=><th className="p-2 text-right" key={x}>{x}</th>)}</tr></thead>
      <tbody>{balances.map(b=><tr className="border-t" key={`${b.city}:${b.good}`}><td>{name(b.city)} / {b.good}</td>{[b.demand,b.produced_household,b.produced_node,b.produced_facility,b.produced_district,b.consumed_as_input,b.consumed_household+b.consumed_state,b.imported,b.exported,b.stored,b.lost_spoilage,b.capex,b.unmet_demand,b.quality,b.gross_output_value-b.intermediate_value].map((n,i)=><td className="text-right p-2" key={i}>{fmt(n)}</td>)}</tr>)}</tbody>
    </table></div>
    <details open><summary className="font-semibold cursor-pointer">Mapa toků ({flows.length})</summary>
      <svg viewBox="0 0 600 300" role="img" aria-label="Fyzické trasy vybraných ekonomických toků" className="w-full max-h-80 border rounded bg-muted/20">
        {flows.map((f,i)=><polyline key={i} points={f.path.map(project).join(' ')} fill="none" stroke={f.reason==='production_input'?'#e6a23c':f.famous?'#b268df':'#45a5b7'} strokeWidth="2" opacity="0.7"><title>{name(f.source)} → {name(f.destination)}: {f.good} {fmt(f.qty)} ({labels[f.reason]||f.reason})</title></polyline>)}
      </svg>
      <div className="max-h-80 overflow-auto">{flows.map((f,i)=><div key={i} className="text-xs border-b py-2"><b>{name(f.source)} → {name(f.destination)} · {f.good}</b> · {labels[f.reason]||f.reason}<br/>
        {fmt(f.qty)} jednotek, dodáno {fmt(f.delivered)}, kvalita {fmt(f.quality)} · hrubá hodnota {fmt(f.gross_value)}, doprava {fmt(f.transport_cost)}, mýto {fmt(f.tolls)}, čistá hodnota {fmt(f.net_value)}<br/>
        Přes centra: {f.via_hubs.map(name).join(' → ')||'—'} · cesta: {f.path.join(' → ')}{f.famous&&` · značka ${f.famous}`}</div>)}</div>
    </details>
    <details><summary className="font-semibold cursor-pointer">Význam měst a spádovost</summary>{ledger.metrics.filter(m=>!city||m.city===city).map(m=><div key={m.city} className="text-xs border-b py-3">
      <b>{name(m.city)} · T{m.tier} · {m.roles.join(', ')}</b><p title="Výroba je hodnota výstupu, sběr je příchozí agregace, tranzit jsou fyzické cesty přes město. Význam neposkytuje výrobní bonus.">
        Výroba {fmt(m.production_importance)} · Sběr {fmt(m.aggregation_importance)} · Tranzit {fmt(m.transit_importance)} · Strategie {fmt(m.strategic_importance)} · Poptávka {fmt(m.demand_importance)} · Správa {fmt(m.administrative_importance)}</p>
      <p>Obsloužená hodnota {fmt(m.handled_trade_value)} · Reexport {fmt(m.reexport_value)} · Populace zázemí {fmt(m.hinterland_population)} · Síťové napojení {m.network_centrality}</p>
    </div>)}</details>
    <details><summary className="font-semibold cursor-pointer">Proslulé výrobky a kandidáti</summary>{ledger.famous.length===0?<p className="text-sm">Zatím žádný výrobek nesplnil podmínky.</p>:ledger.famous.filter(f=>!city||f.city===city).map(f=><div key={`${f.city}:${f.good}`} className="text-xs py-2 border-b"><b>{f.name}</b> · {name(f.city)} · {f.good} · kvalita {fmt(f.quality)} · věhlas {f.fame} · souvislé úspěšné tahy {f.streak} · vznik {f.created??'kandidát'}<p>Nutné: specializace, cech, kvalita, výrazný vstup, opakovaná výroba a úspěšný vývoz.</p></div>)}</details>
    <details><summary className="font-semibold cursor-pointer">Výrobní omezení</summary>{ledger.diagnostics.map(d=><p className="text-xs py-1" key={d.producer}>{d.producer} → {d.good}: kapacita {fmt(d.capacity)}, výstup {fmt(d.realized)} · {d.blocked||Object.entries(d.factors).map(([k,v])=>`${k} ${fmt(v*100)} %`).join(' · ')}</p>)}</details>
  </section>;
}
