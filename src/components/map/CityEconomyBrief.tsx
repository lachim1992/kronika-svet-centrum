import { useMemo } from "react";
import { useManagementReport } from "@/hooks/useManagementReport";

/**
 * CITY ECONOMY AT A GLANCE (read-only).
 * Everything the player needs when clicking a settlement on the map: what it makes, what it needs,
 * where those inputs come from, what is missing, who works and who cannot find work. Purely derived
 * from the closed-turn management report — this panel never computes or writes economy data.
 */
const fmt = (value: unknown, digits = 0) => Number(value || 0).toLocaleString("cs-CZ", { maximumFractionDigits: digits });
const pct = (value: unknown) => `${Math.round(Number(value || 0) * 100)} %`;

const SECTORS: Record<string, string> = {
  farming: "Zemědělství", crafting: "Řemesla", logistics: "Doprava a obchod",
  administration: "Správa", admin: "Správa", extraction: "Těžba",
};
const BLOCKED: Record<string, string> = {
  no_workers: "chybí pracovníci", missing_inputs: "vstupy nikde nejsou",
  missing_input_route: "vstupy existují, chybí cesta", missing_inputs_or_route: "chybí vstupy nebo cesta",
  missing_local_delivery_route: "chybí cesta do města", missing_recipe_inputs: "chybí zadané vstupy",
  capacity_labor_or_staffing: "chybí kapacita nebo lidé",
};

interface Props {
  sessionId: string;
  playerName: string;
  currentTurn: number;
  cityId: string;
  nameOf?: (id: string) => string;
  freeParcels?: number;
  treasury?: { gold: number; production: number };
}

export default function CityEconomyBrief({ sessionId, playerName, currentTurn, cityId, nameOf, freeParcels = 0, treasury }: Props) {
  const { data, isLoading } = useManagementReport(sessionId, playerName, currentTurn);
  const report: any = data?.report ?? null;

  const view = useMemo(() => {
    if (!report) return null;
    const city = (report.cities || []).find((c: any) => c.id === cityId) || null;
    const labor = (report.labor || []).find((l: any) => l.city === cityId) || null;
    const lines = (report.producers || []).filter((p: any) => p.city === cityId);
    // One row per structure, not per recipe line: a mill running four recipes is one crew.
    const structures = Object.values(lines.reduce((acc: Record<string, any>, p: any) => {
      const id = String(p.producer).split(":")[0];
      const s = acc[id] ||= { id, goods: [] as string[], jobs: 0, employed: 0, realized: 0, potential: 0,
        inputs: [] as any[], suppliers: [] as string[], reasons: [] as string[] };
      if (!s.goods.includes(p.good)) s.goods.push(p.good);
      s.jobs += Number(p.jobs_capacity || 0);
      s.employed += Number(p.employed || 0);
      s.realized += Number(p.realized || 0);
      s.potential += Number(p.potential_output || 0);
      for (const i of p.inputs || []) {
        const found = s.inputs.find((x: any) => x.good === i.good);
        if (found) { found.required += Number(i.required || 0); found.supplied += Number(i.supplied || 0); }
        else s.inputs.push({ good: i.good, required: Number(i.required || 0), supplied: Number(i.supplied || 0) });
      }
      for (const i of p.margin?.inputs || []) if (i.chosen_supplier && !s.suppliers.includes(i.chosen_supplier)) s.suppliers.push(i.chosen_supplier);
      const reason = p.bottleneck ? `úzké místo: ${p.bottleneck}` : BLOCKED[p.blocked] || p.blocked || "";
      if (reason && !s.reasons.includes(reason)) s.reasons.push(reason);
      return acc;
    }, {})) as any[];
    const balances: any[] = city?.balances || [];
    const missing = balances.filter(b => Number(b.unmet_demand || 0) > 0.01)
      .sort((a, b) => Number(b.unmet_demand) - Number(a.unmet_demand)).slice(0, 6);
    const surplus = balances.filter(b => Number(b.stored || 0) > 0.01)
      .sort((a, b) => Number(b.stored) - Number(a.stored)).slice(0, 6);
    const demand = balances.filter(b => Number(b.demand || 0) > 0.01)
      .sort((a, b) => Number(b.demand) - Number(a.demand)).slice(0, 6);
    return { city, labor, structures, missing, surplus, demand };
  }, [report, cityId]);

  const name = (id: string) => nameOf?.(id) || (report?.cities || []).find((c: any) => c.id === id)?.name || "jiné město";

  if (isLoading) return <p className="text-[11px] text-muted-foreground">Načítám hospodářství města…</p>;
  if (!view) return <p className="text-[11px] text-muted-foreground">Hospodářský přehled bude k dispozici po uzavření tahu {currentTurn}.</p>;

  const { city, labor, structures, missing, surplus, demand } = view;
  const stranded = Number(labor?.structural_unemployed || 0);

  return <div className="space-y-4">
    {/* EMPLOYMENT */}
    <section className="space-y-2">
      <h4 className="text-xs font-semibold uppercase text-primary">Práce ve městě</h4>
      {labor ? <>
        <div className="grid grid-cols-4 gap-1 text-center text-[11px]">
          {[["Místa", labor.jobs_capacity], ["Pracuje", labor.employed_total],
            ["Bez práce", labor.unemployed_total], ["Prázdná místa", labor.vacancies_total]].map(([l, v]) =>
            <div key={String(l)} className="rounded border border-border/60 p-1">
              <strong className="block text-foreground">{fmt(v)}</strong><span className="text-muted-foreground">{l}</span>
            </div>)}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Zaměstnanost {pct(labor.employment_rate)} · lidé dokážou přejít do jiného oboru z {pct(labor.labor_mobility)} ·
          přeškoleno {fmt(labor.retrained)} lidí
        </p>
        {stranded > 1 && <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px]">
          <p className="font-medium text-amber-200">{fmt(stranded)} lidí je bez práce, přesto jsou místa prázdná</p>
          <p className="mt-1 text-muted-foreground">
            Sedlák neumí kovat a kovář neseje. Pomáhá: postavit cech (výcvik řemesel), rozšířit správu města,
            postavit trh nebo sklad, zvýšit stabilitu — nebo stavět tam, kde lidé zbývají.
          </p>
        </div>}
        <table className="w-full text-[11px]">
          <thead><tr className="text-muted-foreground">{["Odvětví", "Lidé", "Místa", "Pracuje", "Prázdná"].map(h =>
            <th key={h} className="p-1 text-right font-normal first:text-left">{h}</th>)}</tr></thead>
          <tbody>{Object.entries(labor.sectors || {}).map(([sector, s]: any) => <tr key={sector} className="border-t border-border/50">
            <td className="p-1">{SECTORS[sector] || sector}</td>
            {[Number(s.labor_supply || 0) + Number(s.transferred_in || 0), s.jobs_capacity, s.employed, s.vacancies].map((v, i) =>
              <td key={i} className="p-1 text-right">{fmt(v)}</td>)}
          </tr>)}</tbody>
        </table>
      </> : <p className="text-[11px] text-muted-foreground">Toto město nepatří tvé říši — pracovní data nejsou k dispozici.</p>}
    </section>

    {/* PRODUCTION */}
    <section className="space-y-2">
      <h4 className="text-xs font-semibold uppercase text-primary">Co město vyrábí</h4>
      {structures.length ? <div className="space-y-2">
        {structures.map(s => <div key={s.id} className="rounded border border-border/60 p-2 text-[11px]">
          <div className="flex justify-between gap-2">
            <span className="font-medium">{s.goods.join(", ")}</span>
            <span>{fmt(s.realized, 1)} / {fmt(s.potential, 1)} jednotek</span>
          </div>
          <p className="text-muted-foreground">Obsazenost {fmt(s.employed)} / {fmt(s.jobs)} lidí ({pct(s.jobs > 0 ? s.employed / s.jobs : 0)})</p>
          {s.inputs.length > 0 && <p className="text-muted-foreground">
            Potřebuje: {s.inputs.map((i: any) => `${i.good} ${fmt(i.supplied, 1)}/${fmt(i.required, 1)}`).join(" · ")}
          </p>}
          {s.suppliers.length > 0 && <p className="text-muted-foreground">Vstupy bere z: {s.suppliers.map((id: string) => name(id)).join(", ")}</p>}
          {s.reasons.length > 0 && <p className="text-amber-300">Brání: {s.reasons.join(", ")}</p>}
        </div>)}
      </div> : <p className="text-[11px] text-muted-foreground">Ve městě nestojí žádná výrobní stavba — bez ní vzniká jen poptávka.</p>}
    </section>

    {/* SHORTAGES / DEMAND / SURPLUS */}
    <section className="grid gap-2 text-[11px] sm:grid-cols-3">
      <div className="rounded border border-border/60 p-2">
        <p className="mb-1 font-medium">Chybí</p>
        {missing.length ? missing.map(b => <div key={b.good} className="flex justify-between text-muted-foreground"><span>{b.good}</span><span>{fmt(b.unmet_demand, 1)}</span></div>)
          : <p className="text-muted-foreground">Nic nechybí.</p>}
      </div>
      <div className="rounded border border-border/60 p-2">
        <p className="mb-1 font-medium">Nejvíc poptává</p>
        {demand.length ? demand.map(b => <div key={b.good} className="flex justify-between text-muted-foreground"><span>{b.good}</span><span>{fmt(b.demand, 1)}</span></div>)
          : <p className="text-muted-foreground">Bez poptávky.</p>}
      </div>
      <div className="rounded border border-border/60 p-2">
        <p className="mb-1 font-medium">Přebývá na skladě</p>
        {surplus.length ? surplus.map(b => <div key={b.good} className="flex justify-between text-muted-foreground"><span>{b.good}</span><span>{fmt(b.stored, 1)}</span></div>)
          : <p className="text-muted-foreground">Sklady jsou prázdné.</p>}
      </div>
    </section>

    {/* WHAT CAN BE BUILT */}
    <section className="space-y-1">
      <h4 className="text-xs font-semibold uppercase text-primary">Kolik můžeš postavit</h4>
      <p className="text-[11px] text-muted-foreground">
        Volných parcel {fmt(freeParcels)}
        {treasury ? ` · v pokladně ${fmt(treasury.gold)} zlata a ${fmt(treasury.production)} produkce` : ""}.
        {city ? ` Stabilita ${fmt(city.stability)} %.` : ""}
      </p>
      <p className="text-[10px] text-muted-foreground">Data z uzavřeného tahu {report.turn}.</p>
    </section>
  </div>;
}
