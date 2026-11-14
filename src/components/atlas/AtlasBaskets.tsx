import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import ProvenanceBadge, { AtlasCard } from "./ProvenanceBadge";
import { BASKET_DEMAND, PRODUCT_META, substitutionEfficiency } from "@/lib/atlas/canon";
import { fmt } from "@/lib/atlas/provenance";
import type { AtlasGood } from "@/hooks/useAtlasData";

export const CLASS_LABEL: Record<string, string> = { critical_need: "Kritická potřeba", basic_need: "Základní potřeba", operational: "Provoz výroby", civic: "Správa a instituce", development: "Výstavba", military: "Vojsko", discretionary: "Volitelná spotřeba", luxury: "Luxus", intermediate_only: "Jen polotovar" };
const DRIVER_LABEL: Record<string, string> = { household_need: "domácnosti (potřeba)", household_discretionary: "domácnosti (volitelné)", industrial_operational: "výroba", institutional: "úřady", construction: "stavby", military: "armády" };

/** Products of one basket with substitution efficiency against the basket's reference (first) product. */
export function basketProducts(basket: string, goods: AtlasGood[]) {
  const members = goods.filter(g => g.demand_basket === basket);
  const ref = members[0];
  const nutritionOnly = BASKET_DEMAND[basket]?.class === "critical_need";
  const meta = (g: AtlasGood) => ({ key: g.key, basket, substitutability: PRODUCT_META[g.key]?.substitutability ?? 0.5 });
  return members.map(g => ({ good: g, meta: PRODUCT_META[g.key] ?? null, efficiency: ref ? substitutionEfficiency(meta(ref), meta(g), { nutritionOnly }) : null, nutritionOnly }));
}

export default function AtlasBaskets({ goods, onOpenChain }: { goods: AtlasGood[]; onOpenChain: (good: string) => void }) {
  const [q, setQ] = useState(""); const [selected, setSelected] = useState<string>("staple_food");
  const keys = useMemo(() => Object.keys(BASKET_DEMAND).filter(k => `${k} ${BASKET_DEMAND[k].label} ${BASKET_DEMAND[k].group}`.toLowerCase().includes(q.toLowerCase())), [q]);
  const spec = BASKET_DEMAND[selected]; const products = basketProducts(selected, goods);
  return <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
    <AtlasCard title={`Spotřební koše (${Object.keys(BASKET_DEMAND).length})`}>
      <Input aria-label="Hledat koš" placeholder="Hledat koš…" value={q} onChange={e => setQ(e.target.value)} className="mb-2 h-9" />
      <ul className="space-y-1">{keys.map(k => <li key={k}><button type="button" aria-pressed={k === selected} onClick={() => setSelected(k)}
        className={`w-full rounded-md border px-3 py-2 text-left text-sm ${k === selected ? "border-primary/50 bg-primary/10" : "border-transparent hover:bg-muted/50"}`}>
        <span className="font-medium">{BASKET_DEMAND[k].label}</span><span className="block text-[11px] text-muted-foreground">{CLASS_LABEL[BASKET_DEMAND[k].class]} · {BASKET_DEMAND[k].group}</span>
      </button></li>)}</ul>
    </AtlasCard>
    {spec && <AtlasCard title={spec.label} aside={<ProvenanceBadge status="confirmed" source="model poptávky" />}>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <p><span className="text-muted-foreground">Třída:</span> {CLASS_LABEL[spec.class]}</p>
        <p><span className="text-muted-foreground">Základní potřeba:</span> {spec.basicNeeds ? "ano" : "ne"}</p>
        <p><span className="text-muted-foreground">Poptávku tvoří:</span> {spec.drivers.length ? spec.drivers.map(d => DRIVER_LABEL[d] || d).join(", ") : "jen navazující recepty"}</p>
        <p><span className="text-muted-foreground">Priorita upozornění:</span> {spec.alert}</p>
        <p className="sm:col-span-2"><span className="text-muted-foreground">Při nedostatku:</span> {spec.consequence}</p>
      </div>
      <h4 className="mt-4 mb-2 text-sm font-medium">Produkty v koši ({products.length})</h4>
      {products.length === 0 ? <p className="text-xs text-muted-foreground">Katalog zboží nemá pro tento koš žádný produkt.</p> :
      <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="text-left text-muted-foreground"><tr><th className="py-1">Produkt</th><th>Funkční hodnota</th><th>Zaměnitelnost</th><th>Účinnost náhrady</th><th /></tr></thead>
        <tbody>{products.map(p => <tr key={p.good.key} className="border-t border-border/50">
          <td className="py-1.5">{p.good.icon} {p.good.display_name}</td>
          <td>{fmt(p.meta?.functional_value ?? null)}</td><td>{fmt(p.meta?.substitutability ?? null)}</td>
          <td>{p.meta ? fmt(p.efficiency) : <ProvenanceBadge status="unavailable" />}</td>
          <td><button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => onOpenChain(p.good.key)}>řetězec</button></td>
        </tr>)}</tbody></table></div>}
      <p className="mt-2 text-[11px] text-muted-foreground">Účinnost = kolik potřeby pokryje 1 jednotka vůči prvnímu produktu koše. {products[0]?.nutritionOnly ? "U kritického jídla se počítá jen výživa; chuť ovlivňuje volbu, ne přežití." : "Zahrnuje zaměnitelnost i funkční hodnotu."}</p>
    </AtlasCard>}
  </div>;
}
