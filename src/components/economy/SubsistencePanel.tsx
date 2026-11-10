import EconomyFieldList from "./EconomyFieldList";
import { FOOD_STATUS_LABEL, LABOR_FIELDS, producerLimit } from "@/lib/economyFieldContract";
import { Badge } from "@/components/ui/badge";

type Row = { city: string; food_status: string; food_deficit_ratio: number };
/** Shared by the Economy tab and Economy Dev Mode: canonical labour + food status + producer limits. */
export default function SubsistencePanel({ subsistence, labor, producers, name, showSource = false }: {
  subsistence?: Row[]; labor?: any[]; producers?: any[]; name: (id: string) => string; showSource?: boolean;
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
            <EconomyFieldList row={l} fields={LABOR_FIELDS} showSource={showSource} />
          </div>
        );
      })}
      {limited.length > 0 && <table className="text-xs w-full"><caption className="text-left">Provozy pod potenciálem a hlavní důvod</caption>
        <thead><tr>{["Provoz", "Zboží", "Vyrobeno", "Potenciál", "Zaměstnaní / místa", "Důvod"].map(h => <th key={h} className="p-1 text-left">{h}</th>)}</tr></thead>
        <tbody>{limited.map(({ p, why }) => <tr key={p.producer} className="border-t">
          <td className="p-1">{p.producer}</td><td className="p-1">{p.good}</td>
          <td className="p-1">{Number(p.realized || 0).toFixed(2)}</td><td className="p-1">{p.potential_output != null ? Number(p.potential_output).toFixed(2) : "—"}</td>
          <td className="p-1">{p.employed != null ? `${Number(p.employed).toFixed(1)} / ${p.jobs_capacity ?? "—"}` : "—"}</td><td className="p-1">{why}</td></tr>)}</tbody></table>}
    </details>
  );
}
