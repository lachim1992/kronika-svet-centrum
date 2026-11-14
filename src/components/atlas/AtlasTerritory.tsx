import { useMemo } from "react";
import ProvenanceBadge, { AtlasCard } from "./ProvenanceBadge";
import { parcelPotential } from "@/lib/atlas/canon";
import { fmt } from "@/lib/atlas/provenance";
import { deriveOpportunities } from "@/lib/atlas/opportunities";
import { indexParcelProducers } from "@/lib/parcelActual";
import type { DbRecipe } from "@/lib/atlas/chains";
import type { AtlasGood } from "@/hooks/useAtlasData";

const KIND: Record<string, string> = { fertile_soil: "Úrodná půda", iron: "Železo", copper: "Měď", gold: "Zlato", stone: "Kámen", clay: "Jíl", salt: "Sůl", timber: "Dřevo" };
const BIOME_HINT: Record<string, string> = { forest: "dřevo, lov", plains: "obilí, sběr", grassland: "obilí, pastva", hills: "kámen, možná rudy", mountains: "kámen, možná rudy", wetland: "rašelina", marsh: "rašelina", desert: "málo zdrojů", coast: "ryby" };

export default function AtlasTerritory({ territory, report, reportTurn, recipes, goods }: { territory: any; report: any; reportTurn: number | null; recipes: DbRecipe[]; goods: AtlasGood[] }) {
  const names = new Map(goods.map(g => [g.key, g.display_name]));
  const outOf = new Map(recipes.map(r => [r.recipe_key, r.output_good_key]));
  const hexes = territory?.hexes; const parcels = territory?.parcels; const surveys = territory?.surveys; const roads = territory?.roads;
  const mine = useMemo(() => (hexes?.rows || []).filter((h: any) => h.owner_player && parcels?.rows?.some((p: any) => p.grid_x === h.grid_x && p.grid_y === h.grid_y)), [hexes, parcels]);
  const actual = useMemo(() => indexParcelProducers(report?.producers), [report]);
  const potentials = useMemo(() => (parcels?.rows || []).map((p: any) => ({ parcel: p, pot: hexes?.complete ? parcelPotential(p, hexes.rows) : [] })), [parcels, hexes]);
  const potRecipes = new Set<string>(potentials.flatMap((x: any) => x.pot.map((p: any) => p.recipe)));
  const opps = deriveOpportunities(report, recipes, potRecipes);
  const biomes = new Map<string, number>(); for (const h of mine) biomes.set(h.biome_family, (biomes.get(h.biome_family) || 0) + 1);
  const incomplete = [hexes, parcels, surveys, roads].some(r => r && !r.complete);
  return <div className="space-y-4">
    {incomplete && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">Část dat území se nenačetla úplně; souhrny níže mohou chybět.</p>}
    <div className="grid gap-4 md:grid-cols-3">
      <AtlasCard title="Moje pole" aside={<ProvenanceBadge status="confirmed" />}><p className="text-2xl">{mine.length}</p><p className="text-xs text-muted-foreground">makropolí s vaší parcelou · {parcels?.rows?.length ?? "—"} mikroparcel · {roads?.rows?.length ?? "—"} úseků cest</p></AtlasCard>
      <AtlasCard title="Biomy" aside={<ProvenanceBadge status="derived" source="obecný přírodní potenciál" />}>
        <ul className="space-y-1 text-xs">{[...biomes.entries()].map(([b, n]) => <li key={b}>{b} × {n} — <span className="text-muted-foreground">{BIOME_HINT[b] || "bez obecné nápovědy"}</span></li>)}</ul>
      </AtlasCard>
      <AtlasCard title="Průzkum" aside={<ProvenanceBadge status="confirmed" source="vaše průzkumy" />}>
        {!surveys?.rows?.length ? <p className="text-xs text-muted-foreground">Žádné průzkumy. Ložiska se ukážou až po průzkumu.</p> :
        <ul className="space-y-1 text-xs">{surveys.rows.map((s: any) => <li key={`${s.grid_x},${s.grid_y}`}>[{s.grid_x}, {s.grid_y}] úr. {s.level}: {(s.findings || []).map((f: any) => `${KIND[f.kind] || f.kind}${f.hint ? " (náznak)" : f.grade != null ? ` st. ${f.grade}` : ""}`).join(", ") || "nic"}</li>)}</ul>}
      </AtlasCard>
    </div>
    <AtlasCard title="Mikroparcely: potenciál vs. skutečný provoz">
      <p className="mb-2 text-xs text-muted-foreground">Potenciál ukazuje, co by pole mohlo dát. Skutečný výnos je z hlášení tahu {reportTurn ?? "—"}.</p>
      <div className="max-h-[50vh] overflow-auto"><table className="w-full text-xs"><thead className="text-left text-muted-foreground"><tr><th className="py-1">Parcela</th><th>Krajina</th><th>Využití</th><th>Potenciál</th><th>Skutečně</th></tr></thead>
        <tbody>{potentials.map(({ parcel, pot }: any) => { const act = actual.get(parcel.id); return <tr key={parcel.id} className="border-t border-border/50 align-top">
          <td className="py-1">[{parcel.grid_x},{parcel.grid_y}] #{parcel.parcel_index + 1}</td><td>{parcel.sub_biome}</td><td>{parcel.claim_kind === "worked" ? "obdělávané" : parcel.claim_kind === "urban" ? "městské" : parcel.status}</td>
          <td>{pot.length ? pot.map((p: any) => `${names.get(outOf.get(p.recipe) || "") || p.recipe} ${fmt(p.capacity)}`).join(", ") : "—"} {pot.length > 0 && <ProvenanceBadge status="potential" />}</td>
          <td>{!report ? <ProvenanceBadge status="unavailable" /> : act?.length ? <>{act.map(a => `${names.get(a.good) || a.good} ${fmt(a.realized)}`).join(", ")} <ProvenanceBadge status="actual" /></> : "0 — neobsazeno nebo bez práce"}</td>
        </tr>; })}</tbody></table></div>
    </AtlasCard>
    <AtlasCard title="Doložené příležitosti" aside={report ? <ProvenanceBadge status="actual" source={`hlášení tahu ${reportTurn}`} /> : <ProvenanceBadge status="unavailable" />}>
      {!report ? <p className="text-sm text-muted-foreground">Bez uzavřeného hlášení nelze nic doložit.</p> : opps.length === 0 ? <p className="text-sm text-muted-foreground">Hlášení nyní neukazuje neuspokojenou poptávku s blokovaným dovozem.</p> :
      <ul className="space-y-2">{opps.map(o => <li key={`${o.city}:${o.good}`} className="rounded-md border border-border/60 p-2 text-xs">
        <p className="font-medium">{names.get(o.good) || o.good} · {o.city} <span className="ml-1 text-muted-foreground">({o.certainty})</span></p>
        <p>Proč: {o.reason}{o.unmet != null ? ` · chybí ${fmt(o.unmet)}` : ""}</p>
        <p>Cena místní {fmt(o.localPrice)} / základní {fmt(o.basePrice)} · zisk: {o.margin == null ? "nelze spolehlivě vyčíslit" : fmt(o.margin)}</p>
        <p className="text-muted-foreground">Překážka: {o.blocker}</p>
      </li>)}</ul>}
    </AtlasCard>
  </div>;
}
