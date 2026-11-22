import { materialRequirement, quoteConstruction } from "../../../supabase/functions/_shared/constructionMaterials";

const LABEL = { wood: "🪵 dřevo", stone: "🪨 kámen", iron: "⛓️ železo" } as const;

/** Server-mirror quote: what the construction reserve (materials already used up at turn close) covers. */
export function constructionQuote(realm: any, costs: { cost_wood?: number; cost_stone?: number; cost_iron?: number }) {
  const total = (costs.cost_wood || 0) + (costs.cost_stone || 0) + (costs.cost_iron || 0);
  return quoteConstruction(realm?.construction_reserve_composition, realm?.production_reserve, materialRequirement(costs, total));
}

export function ConstructionMaterialQuote({ realm, costs }: { realm: any; costs: { cost_wood?: number; cost_stone?: number; cost_iron?: number } }) {
  const q = constructionQuote(realm, costs);
  const lines = q.lines.filter(l => l.required > 0);
  if (!lines.length) return null;
  return (
    <div className="flex gap-1 flex-wrap text-[9px]" title="Z dřeva a kamene, které se už při uzavření tahu přesunuly do stavební zásoby. Ze skladu města se při stavbě nic dalšího neodebírá. Železo se platí ze společné zásoby, ne ze skladu železa.">
      {lines.map(l => (
        <span key={l.material} className={l.status === "shortage" ? "text-destructive" : "text-muted-foreground"}>
          {LABEL[l.material]} {l.required}{l.status === "shortage" ? " – chybí" : ""}{!l.physical ? " (ze společné zásoby)" : ""}
        </span>
      ))}
    </div>
  );
}
