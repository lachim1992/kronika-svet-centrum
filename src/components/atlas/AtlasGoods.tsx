import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import ProvenanceBadge, { AtlasCard } from "./ProvenanceBadge";
import { BASKET_DEMAND, producersOfRecipe } from "@/lib/atlas/canon";
import type { DbRecipe } from "@/lib/atlas/chains";
import { fmt } from "@/lib/atlas/provenance";
import type { AtlasGood } from "@/hooks/useAtlasData";
import type { WorldMarket } from "@/lib/atlas/market";

export const STAGE_LABEL: Record<string, string> = { raw: "Surovina", processed: "Zpracované", final: "Konečný výrobek", luxury: "Luxus" };
const ROLE: Record<string, string> = { raw: "mezivstup nebo přímá spotřeba", processed: "mezivstup pro další výrobu", final: "pro domácnosti a stát", luxury: "volitelná spotřeba" };

export default function AtlasGoods({ goods, recipes, market, onOpenChain }: { goods: AtlasGood[]; recipes: DbRecipe[]; market: WorldMarket | null; onOpenChain: (good: string) => void }) {
  const [q, setQ] = useState(""); const [stage, setStage] = useState("all"); const [basket, setBasket] = useState("all");
  const list = useMemo(() => goods.filter(g => (stage === "all" || g.production_stage === stage) && (basket === "all" || g.demand_basket === basket)
    && (`${g.display_name} ${g.key} ${g.description || ""}`).toLowerCase().includes(q.toLowerCase())), [goods, q, stage, basket]);
  const buildingsByGood = useMemo(() => {
    const m = new Map<string, string[]>();
    recipes.forEach(r => producersOfRecipe(r.recipe_key).forEach(p => {
      const label = `${p.building} (úr. ${p.level})`; const list = m.get(r.output_good_key) || [];
      if (!list.includes(label)) list.push(label); m.set(r.output_good_key, list);
    }));
    return m;
  }, [recipes]);
  const world = new Map((market?.goods || []).map(g => [g.good, g]));
  return <AtlasCard title={`Suroviny a zboží (${list.length}/${goods.length})`} aside={<ProvenanceBadge status="confirmed" source="katalog zboží" />}>
    <div className="mb-3 flex flex-wrap gap-2">
      <Input aria-label="Hledat zboží" placeholder="Hledat zboží…" value={q} onChange={e => setQ(e.target.value)} className="h-9 max-w-xs" />
      <select aria-label="Fáze" value={stage} onChange={e => setStage(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
        <option value="all">Všechny fáze</option>{Object.entries(STAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <select aria-label="Koš" value={basket} onChange={e => setBasket(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
        <option value="all">Všechny koše</option>{Object.entries(BASKET_DEMAND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
    </div>
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {list.map(g => { const w = world.get(g.key); return <button key={g.key} type="button" onClick={() => onOpenChain(g.key)}
        className="rounded-lg border border-border/60 bg-background/40 p-3 text-left transition-colors hover:border-primary/50">
        <div className="flex items-start justify-between gap-2"><p className="font-medium">{g.icon} {g.display_name}</p>
          <span className="text-[10px] uppercase text-muted-foreground">{STAGE_LABEL[g.production_stage || ""] || g.production_stage || "?"}</span></div>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{g.description || "Bez popisu."}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Koš: {BASKET_DEMAND[g.demand_basket || ""]?.label || g.demand_basket || "—"} · {ROLE[g.production_stage || ""] || "—"} · {g.storable ? "skladovatelné" : "podléhavé"}</p>
        <p className="mt-1 text-[11px]"><span className="font-semibold text-primary">Budova:</span> {(buildingsByGood.get(g.key) || []).join(", ") || <span className="text-muted-foreground">žádná budova tento produkt nevyrábí</span>}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span>Základní cena {fmt(g.base_price_numeric)}</span><ProvenanceBadge status={g.base_price_numeric == null ? "unavailable" : "confirmed"} />
          <span>Světová {fmt(w?.weightedPrice ?? null)}</span><ProvenanceBadge status={w?.weightedPrice == null ? "unavailable" : "derived"} source={w && market?.snapshotTurn != null ? `tah ${market.snapshotTurn}` : undefined} />
        </div>
      </button>; })}
    </div>
  </AtlasCard>;
}
