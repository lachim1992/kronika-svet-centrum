import type { IndustrialInput } from '../../../supabase/functions/_shared/goodsEconomy';
import { INDUSTRIAL_INPUT_FIELDS } from '@/lib/economyFieldContract';

const reasons:Record<string,string>={missing_supplier:'chybí dodavatel',trade_blocked:'válečná blokáda',route_unreachable:'nedosažitelná cesta',route_capacity:'vyčerpaná kapacita trasy',source_retained:'zdroj chrání zásobu pro obyvatele',landed_cost_or_partial_supply:'cena dopravy nebo částečná nabídka'};
export default function IndustrialInputsPanel({rows,name}:{rows?:IndustrialInput[];name:(id:string)=>string}){
  if(!rows)return <p className="text-xs text-muted-foreground">Průmyslové vstupy: starší zpráva neobsahuje rozpis.</p>;
  return <details open><summary className="font-semibold cursor-pointer">Průmyslové materiály A ({rows.length})</summary>
    <div className="overflow-auto"><table className="text-xs w-full"><caption className="text-left text-muted-foreground">Zdroj: goodsEconomy.industrialInputs · plán není spotřeba · B opotřebení a C palivo v účtu výrobce</caption>
      <thead><tr>{INDUSTRIAL_INPUT_FIELDS.map(f=><th key={f.key} className="p-2 text-left" title={f.source}>{f.label}</th>)}</tr></thead>
      <tbody>{rows.map(r=><tr className="border-t" key={`${r.producer}:${r.good}`}>{INDUSTRIAL_INPUT_FIELDS.map(f=>{
        const v=r[f.key as keyof IndustrialInput];const text=v==null?'—':typeof v==='number'?v.toLocaleString('cs-CZ',{maximumFractionDigits:3}):f.key==='city'||f.key==='supplier'?name(v):f.key==='blocked'?reasons[v]||v:v;
        return <td key={f.key} className="p-2">{text}</td>;
      })}</tr>)}</tbody>
    </table></div></details>;
}