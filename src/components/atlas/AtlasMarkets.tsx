import { useState } from "react";
import { Input } from "@/components/ui/input";
import ProvenanceBadge, { AtlasCard } from "./ProvenanceBadge";
import { fmt } from "@/lib/atlas/provenance";
import type { WorldMarket } from "@/lib/atlas/market";
import type { AtlasGood } from "@/hooks/useAtlasData";

export function MarketStatus({ market }: { market: WorldMarket | null }) {
  if (!market) return <ProvenanceBadge status="unavailable" source="načítání" />;
  if (market.status === "error") return <ProvenanceBadge status="unavailable" source={`chyba čtení: ${market.error}`} />;
  if (market.status === "incomplete") return <ProvenanceBadge status="unavailable" source="neúplná data" />;
  if (market.status === "empty") return <ProvenanceBadge status="unavailable" source="žádný snapshot trhu" />;
  return <ProvenanceBadge status="derived" source={market.ageLabel} />;
}

export default function AtlasMarkets({ market, goods, report, reportTurn }: { market: WorldMarket | null; goods: AtlasGood[]; report: any; reportTurn: number | null }) {
  const [q, setQ] = useState("");
  const names = new Map(goods.map(g => [g.key, g.display_name]));
  const base = new Map(goods.map(g => [g.key, g.base_price_numeric]));
  const rows = (market?.goods || []).filter(g => `${g.good} ${names.get(g.good) || ""}`.toLowerCase().includes(q.toLowerCase()));
  const myPrices = (report?.prices || []) as any[];
  return <div className="space-y-4">
    <AtlasCard title="Světové trhy" aside={<MarketStatus market={market} />}>
      <p className="mb-2 text-xs text-muted-foreground">Cena = průměr městských cen vážený poptávkou. Trhů: {market?.status === "ok" ? market.marketCount : "—"}. {market?.stale && market.status === "ok" ? "Snapshot je starší než minulý tah." : ""}</p>
      {market?.status !== "ok" ? <p className="text-sm text-muted-foreground">Souhrn nelze sestavit — data trhu nejsou úplná nebo ještě nevznikla. Nejde o nulové ceny.</p> : <>
        <Input aria-label="Hledat na trhu" placeholder="Hledat zboží…" value={q} onChange={e => setQ(e.target.value)} className="mb-2 h-9 max-w-xs" />
        <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="text-left text-muted-foreground"><tr><th className="py-1">Zboží</th><th>Základní</th><th>Světová</th><th>Nabídka</th><th>Poptávka</th><th>Bilance</th><th>Trhy</th></tr></thead>
          <tbody>{rows.map(g => <tr key={g.good} className="border-t border-border/50">
            <td className="py-1.5">{names.get(g.good) || g.good}</td><td>{fmt(base.get(g.good) ?? null)}</td>
            <td>{g.weightedPrice == null ? <ProvenanceBadge status="unavailable" /> : fmt(g.weightedPrice)}</td>
            <td>{fmt(g.supply)}</td><td>{fmt(g.demand)}</td>
            <td className={g.balance < 0 ? "text-destructive" : ""}>{g.balance < 0 ? "nedostatek " : "přebytek "}{fmt(Math.abs(g.balance))}</td><td>{g.markets}</td>
          </tr>)}</tbody></table></div></>}
    </AtlasCard>
    <AtlasCard title="Moje městské ceny" aside={report ? <ProvenanceBadge status="actual" source={`hlášení tahu ${reportTurn}`} /> : <ProvenanceBadge status="unavailable" source="žádné uzavřené hlášení" />}>
      {!report ? <p className="text-sm text-muted-foreground">Osobní ceny se objeví po uzavření tahu.</p> :
      <div className="max-h-[50vh] overflow-auto"><table className="w-full text-xs"><thead className="text-left text-muted-foreground"><tr><th className="py-1">Město</th><th>Zboží</th><th>Místní</th><th>Základní</th><th>Poptávka</th><th>Nabídka</th><th>Dovoz</th></tr></thead>
        <tbody>{myPrices.filter(p => (p.demand || p.supply) && `${p.good} ${names.get(p.good) || ""} ${p.city_name}`.toLowerCase().includes(q.toLowerCase())).map(p => <tr key={`${p.city}:${p.good}`} className="border-t border-border/50">
          <td className="py-1">{p.city_name}</td><td>{names.get(p.good) || p.good}</td><td>{fmt(p.local_price)}</td><td>{fmt(p.base_price)}</td><td>{fmt(p.demand)}</td><td>{fmt(p.supply)}</td><td>{fmt(p.imported)}</td>
        </tr>)}</tbody></table></div>}
    </AtlasCard>
    <AtlasCard title="Moje obchodní toky" aside={report ? <ProvenanceBadge status="actual" source={`tah ${reportTurn}`} /> : undefined}>
      {!report ? <p className="text-sm text-muted-foreground">Nedostupné.</p> : (report.flows || []).length === 0 ? <p className="text-sm text-muted-foreground">V posledním uzavřeném tahu žádné toky.</p> :
      <ul className="space-y-1 text-xs">{(report.flows as any[]).slice(0, 60).map((f, i) => <li key={i}>{names.get(f.good) || f.good}: {fmt(f.quantity ?? f.qty ?? null)} ks · hodnota {fmt(f.gross_value ?? null)} {f.reason ? `· ${f.reason}` : ""}</li>)}</ul>}
    </AtlasCard>
  </div>;
}
