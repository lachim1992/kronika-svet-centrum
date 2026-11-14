import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import ProvenanceBadge, { AtlasCard } from "./ProvenanceBadge";
import { buildChain, catalogMismatch, usesOf, type ChainNode } from "@/lib/atlas/chains";
import type { DbRecipe } from "@/lib/atlas/chains";
import type { AtlasGood } from "@/hooks/useAtlasData";
import { BASKET_DEMAND } from "@/lib/atlas/canon";
import { fmt } from "@/lib/atlas/provenance";

function Node({ node, names, onPick, depth = 0 }: { node: ChainNode; names: Map<string, string>; onPick: (g: string) => void; depth?: number }) {
  const label = names.get(node.good) || node.good;
  return <div className={depth ? "ml-3 border-l border-border/60 pl-3" : ""}>
    <button type="button" onClick={() => onPick(node.good)} className="text-sm font-medium text-foreground hover:text-primary">{label}</button>
    {node.cycle && <span className="ml-2 text-[10px] text-muted-foreground">(cyklus — již výše)</span>}
    {node.depthCut && <span className="ml-2 text-[10px] text-muted-foreground">(další úroveň zkrácena)</span>}
    {!node.cycle && !node.depthCut && node.recipes.length === 0 && <span className="ml-2 text-[10px] text-muted-foreground">— žádný recept: přírodní zdroj nebo dovoz</span>}
    {node.recipes.map(r => <div key={r.recipe.recipe_key} className="mt-1 rounded-md bg-muted/30 p-2 text-xs">
      <p><span className="font-mono">{r.recipe.recipe_key}</span> → {fmt(r.recipe.output_quantity)} ks · práce {fmt(r.recipe.labor_cost)} · role {r.recipe.required_role || "—"}</p>
      <p className="text-muted-foreground">Budovy: {r.producers.length ? r.producers.map(p => `${p.building} (úr. ${p.level})`).join(", ") : <span className="text-destructive">žádná v katalogu staveb</span>}{r.recipe.required_tags?.length ? ` · vyžaduje: ${r.recipe.required_tags.join(", ")}` : ""}</p>
      {r.inputs.length === 0 && <p className="text-muted-foreground">Bez vstupů — zdroj na poli.</p>}
      {r.inputs.map(i => <div key={i.input.good} className="mt-1"><span className="text-muted-foreground">{fmt(i.input.qty)}× {i.input.kind ? `[${i.input.kind}] ` : ""}</span><Node node={i.node} names={names} onPick={onPick} depth={depth + 1} /></div>)}
    </div>)}
  </div>;
}

export default function AtlasChains({ goods, recipes, focus, onFocus }: { goods: AtlasGood[]; recipes: DbRecipe[]; focus: string | null; onFocus: (g: string) => void }) {
  const [q, setQ] = useState("");
  const names = useMemo(() => new Map(goods.map(g => [g.key, `${g.icon || ""} ${g.display_name}`.trim()])), [goods]);
  const target = focus || goods.find(g => g.production_stage === "final")?.key || goods[0]?.key || null;
  const tree = useMemo(() => target ? buildChain(target, recipes) : null, [target, recipes]);
  const mismatch = useMemo(() => catalogMismatch(recipes, new Set(goods.map(g => g.key))), [recipes, goods]);
  const pick = goods.filter(g => `${g.display_name} ${g.key}`.toLowerCase().includes(q.toLowerCase()));
  const good = goods.find(g => g.key === target);
  return <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
    <AtlasCard title="Vyberte produkt">
      <Input aria-label="Hledat produkt" placeholder="Hledat…" value={q} onChange={e => setQ(e.target.value)} className="mb-2 h-9" />
      <ul className="max-h-[60vh] space-y-0.5 overflow-y-auto">{pick.map(g => <li key={g.key}><button type="button" aria-pressed={g.key === target} onClick={() => onFocus(g.key)}
        className={`w-full rounded px-2 py-1 text-left text-sm ${g.key === target ? "bg-primary/15 text-primary" : "hover:bg-muted/50"}`}>{names.get(g.key)}</button></li>)}</ul>
    </AtlasCard>
    <div className="space-y-4">
      {tree && <AtlasCard title={`Odkud se bere: ${names.get(tree.good) || tree.good}`} aside={<ProvenanceBadge status="confirmed" source="recepty v databázi" />}>
        {good && <p className="mb-2 text-xs text-muted-foreground">Uspokojuje koš: {BASKET_DEMAND[good.demand_basket || ""]?.label || good.demand_basket || "—"}</p>}
        <Node node={tree} names={names} onPick={onFocus} />
      </AtlasCard>}
      {target && <AtlasCard title="Kam dál putuje">
        {usesOf(target, recipes).length === 0 ? <p className="text-xs text-muted-foreground">Žádný recept ho nespotřebovává — jde přímo do spotřeby.</p> :
        <ul className="flex flex-wrap gap-2">{usesOf(target, recipes).map(r => <li key={r.recipe_key}><button type="button" onClick={() => onFocus(r.output_good_key)} className="rounded-md border border-border/60 px-2 py-1 text-xs hover:border-primary/50">{r.recipe_key} → {names.get(r.output_good_key) || r.output_good_key}</button></li>)}</ul>}
      </AtlasCard>}
      {(mismatch.noBuilding.length > 0 || mismatch.missingInDb.length > 0 || mismatch.unknownGoods.length > 0) && <AtlasCard title="Nesoulad katalogu" aside={<ProvenanceBadge status="derived" />}>
        <ul className="space-y-1 text-xs text-muted-foreground">
          {mismatch.noBuilding.length > 0 && <li>Recepty bez budovy v katalogu staveb: {mismatch.noBuilding.join(", ")}</li>}
          {mismatch.missingInDb.length > 0 && <li>Recepty budov, které v databázi chybí: {mismatch.missingInDb.join(", ")}</li>}
          {mismatch.unknownGoods.length > 0 && <li>Zboží v receptech, které není v katalogu: {mismatch.unknownGoods.join(", ")}</li>}
        </ul>
      </AtlasCard>}
    </div>
  </div>;
}
