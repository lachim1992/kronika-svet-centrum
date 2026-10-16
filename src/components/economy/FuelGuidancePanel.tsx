import { AlertTriangle } from "lucide-react";
import type { FuelWarning } from "../../../supabase/functions/_shared/fuelGuidance";

/** Shared by Ekonomika (owner report) and Economy Dev Mode (dev snapshot); renders canonical fuelGuidance only. */
export default function FuelGuidancePanel({ warnings, name, showSource = false }: { warnings?: FuelWarning[] | null; name: (id: string) => string; showSource?: boolean }) {
  if (warnings == null) return <p className="text-xs text-muted-foreground">Palivo pekáren: údaj chybí (ledger před zavedením paliva).</p>;
  if (!warnings.length) return <p className="text-xs text-muted-foreground">Palivo pekáren: všechny pekárny mají palivo.</p>;
  return <section className="space-y-2 rounded-lg border border-destructive/40 p-3" aria-label="Palivo pekáren">
    <h4 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-destructive" />Pekárny bez paliva</h4>
    {showSource && <p className="text-xs text-muted-foreground">Zdroj: economy_turn_ledgers.result.fuelGuidance ← diagnostics[].fuel</p>}
    {warnings.map(w => <div key={w.city} className="text-xs space-y-1 border-t pt-2">
      <p className="font-medium">{name(w.city)} — s palivem {Math.round(w.coverage * 100)} % dávky, ztráta {w.lost_output.toFixed(1)} ks chleba</p>
      <p>Chybí: {w.missing_goods.join(" nebo ")} · zásoby: {Object.entries(w.stocks).map(([g, q]) => `${g} ${q.toFixed(1)}`).join(", ")}</p>
      <p className="text-muted-foreground">Řetězec: {w.chain.join(" | ")}</p>
      <ul className="list-disc pl-4">{w.remedies.map((r, i) => <li key={i} className={r.feasible ? "" : "text-muted-foreground"}>
        {r.kind === "build" ? `Postavit ${r.target}` : `Dovézt ${r.good} z ${name(r.target)}`} — {r.feasible ? "proveditelné" : "zatím ne"}: {r.reason}</li>)}</ul>
    </div>)}
  </section>;
}
