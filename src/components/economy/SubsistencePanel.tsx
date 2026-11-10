import EconomyFieldList from "./EconomyFieldList";
import { FOOD_STATUS_LABEL, LABOR_FIELDS, PARCEL_FIELDS, producerLimit, subsistenceSources } from "@/lib/economyFieldContract";
import { Badge } from "@/components/ui/badge";

type Row = { city: string; food_status: string; food_deficit_ratio: number };
/** Shared by the Economy tab and Economy Dev Mode: canonical labour + food status + producer limits. */
export default function SubsistencePanel({ subsistence, labor, producers, name, showSource = false, guidance }: {
  subsistence?: Row[]; labor?: any[]; producers?: any[]; name: (id: string) => string; showSource?: boolean;
  guidance?: { city: string; buildingName: string; basket: string; coverage: number; cost_wealth: number; output: number; idle_workers: number }[];
}) {
  if (!subsistence?.length && !labor?.length) return null;
  const limited = (producers || []).map(p => ({ p, why: producerLimit(p) })).filter(x => x.why);
  return (
    <details open className="rounded-lg border p-3 space-y-2">
      <summary className="font-semibold cursor-pointer">Obživa, pracovní síla a omezení výroby</summary>
      {(labor || []).map(l => {
        const s = subsistence?.find(x => x.city === l.city);
        return (
          <div key={l.city} className="space-y-1 border-t pt-2">
            <div className="flex items-center gap-2 text-sm font-medium">{name(l.city)}
              {s && <Badge variant={s.food_status === "famine" ? "destructive" : s.food_status === "rationing" ? "secondary" : "outline"}>
                {FOOD_STATUS_LABEL[s.food_status] ?? s.food_status}{s.food_deficit_ratio > 0 ? ` · chybí ${Math.round(s.food_deficit_ratio * 100)} %` : ""}</Badge>}
            </div>
            {(() => { const src = subsistenceSources(producers, l.city); return src.length > 0 && <div className="text-xs text-muted-foreground">
              Zdroje: {src.map((x, i) => <span key={i}>{i > 0 && " · "}{x.kind === "water" ? "voda" : "jídlo"} — <b className="text-foreground">{x.label}</b> {x.realized.toFixed(2)}/tah{x.employed != null ? ` (${x.employed.toFixed(1)}/${x.jobs ?? "—"} prac.)` : ""}</span>)}
            </div>; })()}
            <EconomyFieldList row={l} fields={LABOR_FIELDS} showSource={showSource} />
          </div>
        );
      })}
      {(guidance || []).length > 0 && <div className="border-t pt-2 space-y-1">
        <div className="text-sm font-medium">Doporučená stavba (stavíte sami)</div>
        {(guidance || []).map(g => <div key={g.city + g.buildingName} className="text-xs">
          {name(g.city)}: <b>{g.buildingName}</b> — {g.basket === "staple_food" ? "jídlo" : g.basket === "drinking_water" ? "voda" : "palivo"} pokryto {Math.round(g.coverage * 100)} %;
          {" "}cena {g.cost_wealth} zlata, výnos až {g.output}/tah při plném obsazení, volných pracovníků {Math.round(g.idle_workers)}.
        </div>)}
      </div>}
      {(producers || []).some(p=>p.parcel) && <details className="border-t pt-2">
        <summary className="text-sm font-medium cursor-pointer">Sběr a těžba z městských pozemků</summary>
        <div className="overflow-x-auto"><table className="text-xs w-full">
          <thead><tr><th className="p-1 text-left">Město / zdroj</th>{PARCEL_FIELDS.map(f=><th className="p-1 text-left" key={f.key}>{f.label}</th>)}<th>Vybráno / tah</th><th>Pracovníci / místa</th></tr></thead>
          <tbody>{(producers || []).filter(p=>p.parcel).map(p=><tr key={p.producer} className="border-t">
            <td className="p-1">{name(p.city)} · {p.good}</td>{PARCEL_FIELDS.map(f=><td key={f.key} className="p-1">{typeof p.parcel[f.key]==='number'?p.parcel[f.key].toFixed(2):String(p.parcel[f.key]??'—')}</td>)}
            <td className="p-1">{Number(p.realized||0).toFixed(2)}</td><td className="p-1">{Number(p.employed||0).toFixed(1)} / {p.jobs_capacity??'—'}</td>
          </tr>)}</tbody>
        </table></div>
      </details>}
      {limited.length > 0 && <table className="text-xs w-full"><caption className="text-left">Provozy pod potenciálem a hlavní důvod</caption>
        <thead><tr>{["Provoz", "Zboží", "Vyrobeno", "Potenciál", "Zaměstnaní / místa", "Důvod"].map(h => <th key={h} className="p-1 text-left">{h}</th>)}</tr></thead>
        <tbody>{limited.map(({ p, why }) => <tr key={p.producer} className="border-t">
          <td className="p-1">{p.producer}</td><td className="p-1">{p.good}</td>
          <td className="p-1">{Number(p.realized || 0).toFixed(2)}</td><td className="p-1">{p.potential_output != null ? Number(p.potential_output).toFixed(2) : "—"}</td>
          <td className="p-1">{p.employed != null ? `${Number(p.employed).toFixed(1)} / ${p.jobs_capacity ?? "—"}` : "—"}</td><td className="p-1">{why}</td></tr>)}</tbody></table>}
    </details>
  );
}
