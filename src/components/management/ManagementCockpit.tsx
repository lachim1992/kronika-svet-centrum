import {useState} from 'react';
import {useManagementReport} from '@/hooks/useManagementReport';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import type {Metric,ManagementAlert} from '../../../supabase/functions/_shared/management';

const fmt=(n:number|null)=>n===null?'—':n.toLocaleString('cs-CZ',{maximumFractionDigits:1});
export function TrendBadge({metric}:{metric:Metric}){
  if(metric.previous===null||metric.value===null)return <span className="text-xs text-muted-foreground">Bez srovnání</span>;
  const delta=metric.value-metric.previous;
  return <span className={`text-xs ${delta<0?'text-amber-600':delta>0?'text-emerald-600':'text-muted-foreground'}`}>{delta>0?'↑ +':delta<0?'↓ ':'→ '}{fmt(delta)} oproti minulému tahu</span>;
}
export function MetricCard({metric,onExplain}:{metric:Metric;onExplain:()=>void}){
  return <button onClick={onExplain} className="text-left rounded-xl border border-border/60 bg-card p-4 space-y-2 hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" aria-label={`Vysvětlit: ${metric.label}`}>
    <span className="block text-xs text-muted-foreground">{metric.label}</span><span className="block text-2xl font-display font-semibold">{fmt(metric.value)} <small className="text-xs font-normal text-muted-foreground">{metric.unit}</small></span>
    <TrendBadge metric={metric}/><span className="block text-[10px] text-primary">Původ a vysvětlení →</span>
  </button>;
}
export function ExplainMetricDrawer({metric,onClose,onEntityClick}:{metric:Metric|null;onClose:()=>void;onEntityClick?:(type:string,id:string)=>void}){
  return <Dialog open={!!metric} onOpenChange={open=>!open&&onClose()}><DialogContent className="max-w-2xl max-h-[85vh] overflow-auto"><DialogHeader><DialogTitle>{metric?.label}</DialogTitle><DialogDescription>{metric?.definition}</DialogDescription></DialogHeader>
    {metric&&<><p className="text-3xl font-semibold">{fmt(metric.value)} <small className="text-sm">{metric.unit}</small></p><TrendBadge metric={metric}/>{metric.assumption&&<p className="text-sm text-muted-foreground">{metric.assumption}</p>}
    <p className="text-sm">Předchozí tah: {fmt(metric.previous)}</p><h4 className="font-semibold">Příspěvky a zdrojové řádky</h4>
    {metric.sources.length===0?<p className="text-sm text-muted-foreground">Poměrový ukazatel; způsob výpočtu je uveden výše.</p>:metric.sources.slice().sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)).map(s=><div key={s.id} className="flex items-center justify-between gap-3 border-b py-2 text-sm"><span>{s.label}</span><span className="font-mono">{fmt(s.value)}</span>{s.city&&onEntityClick&&<Button size="sm" variant="ghost" onClick={()=>onEntityClick('city',s.city!)}>Město</Button>}</div>)}</>}
  </DialogContent></Dialog>;
}
const severityLabel={critical:'Kritické',warning:'Omezení',opportunity:'Příležitost',info:'Informace'};
export function BottleneckCard({alert,onOpen}:{alert:ManagementAlert;onOpen?:()=>void}){
  return <article className={`rounded-lg border-l-4 p-3 bg-muted/25 ${alert.severity==='critical'?'border-l-destructive':alert.severity==='warning'?'border-l-amber-500':alert.severity==='opportunity'?'border-l-emerald-500':'border-l-blue-500'}`}>
    <div className="flex items-start justify-between gap-3"><div><span className="text-[10px] uppercase tracking-wide font-semibold">{severityLabel[alert.severity]}</span><p className="text-sm">{alert.reason}</p></div>{onOpen&&<Button variant="outline" size="sm" onClick={onOpen}>Prověřit</Button>}</div>
    <p className="mt-2 text-xs text-muted-foreground">Možnosti: {alert.levers.join(' · ')}</p>
  </article>;
}
export function ActionPreviewCard({title,rows,assumption}:{title:string;rows:{label:string;before:number;after:number;unit:string}[];assumption:string}){
  return <aside className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-2"><h4 className="font-semibold">{title}</h4>{rows.map(r=><div key={r.label} className="flex justify-between gap-4 text-sm"><span>{r.label}</span><span>{fmt(r.before)} → {fmt(r.after)} {r.unit}</span></div>)}<p className="text-xs text-muted-foreground">Odhad: {assumption}</p></aside>;
}
type Props={sessionId:string;playerName:string;currentTurn:number;mode?:'home'|'economy'|'city'|'army'|'council';cityId?:string;onEntityClick?:(type:string,id:string)=>void;onTabChange?:(tab:string)=>void};
export default function ManagementCockpit({sessionId,playerName,currentTurn,mode='home',cityId,onEntityClick,onTabChange}:Props){
  const {data:reportResult,isLoading,error}=useManagementReport(sessionId,playerName,currentTurn),[explained,setExplained]=useState<Metric|null>(null);
  const report=reportResult?.report??null;
  if(isLoading)return <p className="text-sm text-muted-foreground" role="status">Načítám stav říše pro tah {currentTurn}…</p>;
  if(error)return <p role="alert" className="text-sm text-destructive">Přehled není dostupný: {String(error)}</p>;
  if(!report)return <p className="text-sm text-muted-foreground">Ekonomická bilance bude k dispozici po uzavření tahu {currentTurn}.</p>;
  const keys=mode==='economy'?['value_added','gross_output','final_consumption','exports','imports','trade_turnover','blocked_percent','construction_incoming']:mode==='army'?['soldiers','workforce','food_coverage','net_fiscal']:['treasury','net_fiscal','food_coverage','workforce','construction_stock','value_added'];
  const alerts=report.alerts.filter(a=>!cityId||a.entity_id===cityId).slice(0,5);
  const city=report.cities.find(c=>c.id===cityId);
  return <section className="space-y-4" aria-label="Řízení podle ekonomické bilance">
    {alerts.length>0&&<div className="space-y-2"><h3 className="font-display font-semibold">Vyžaduje pozornost</h3>{alerts.map(a=><BottleneckCard key={a.id} alert={a} onOpen={onEntityClick?()=>onEntityClick(a.entity_type,a.entity_id):onTabChange?()=>onTabChange(a.destination):undefined}/>)}</div>}
    {mode!=='council'&&!city&&<div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">{keys.map(key=>report.metrics.find(m=>m.key===key)).filter((m):m is Metric=>!!m).map(m=><MetricCard key={m.key} metric={m} onExplain={()=>setExplained(m)}/>)}</div>}
    {city&&<div className="rounded-xl border p-4 space-y-3"><h3 className="font-semibold">{city.name} · úroveň centra {city.tier}</h3><p className="text-sm">Role: {city.roles.join(', ')||'Místní sídlo'}</p><div className="grid grid-cols-2 md:grid-cols-3 gap-3">{[['Přidaná hodnota',city.local_value_added],['Obsloužený obchod',city.handled_trade_value],['Reexport',city.reexport_value],['Sběr ze zázemí',city.aggregation_importance],['Tranzit',city.transit_importance],['Obyvatelstvo zázemí',city.hinterland_population]].map(([label,value])=><div key={label as string}><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold">{fmt(Number(value))}</p></div>)}</div>
      <details><summary className="cursor-pointer text-sm">Zboží a jeho použití</summary><div className="space-y-2 mt-2">{city.balances.map((b:any)=><div key={b.good} className="text-xs border-t pt-2"><b>{b.good}</b> · spotřeba {fmt(b.consumed_household+b.consumed_state)} · vstupy {fmt(b.consumed_as_input)} · dovoz {fmt(b.imported)} · vývoz {fmt(b.exported)} · sklad {fmt(b.stored)} · chybí {fmt(b.unmet_demand)}</div>)}</div></details></div>}
    <p className="text-[10px] text-muted-foreground">Bilance posledního uzavřeného tahu {report.turn}{report.turn!==currentTurn?` (hraje se tah ${currentTurn})`:''}. Prázdné srovnání znamená, že předchozí údaj není dostupný.</p>
    <ExplainMetricDrawer metric={explained} onClose={()=>setExplained(null)} onEntityClick={onEntityClick}/>
  </section>;
}
