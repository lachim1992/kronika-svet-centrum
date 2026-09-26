/**
 * BUILD CATALOG PANEL — the single construction panel of the map.
 *
 * Every buildable thing (obytné čtvrti, výrobní zóny, budovy, subuzly) comes from the
 * canonical catalog (`@/lib/buildCatalog`), which merges building_templates, district
 * blueprints, subnode definitions and the production contract. This component only
 * renders those values — it never computes its own economy numbers.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Info, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  buildCatalog, matchesQuery, BUILD_CATEGORY_ORDER, BUILD_CATEGORY_LABELS, goodLabel, ROLE_LABELS,
  type CatalogItem, type RecipeRow, type TemplateRow, type BuildCategory,
} from "@/lib/buildCatalog";

interface Props {
  templates: TemplateRow[];
  /** Currently running build action key (`building:<id>`, `district:<key>`, `subnode:<key>`). */
  busyKey: string | null;
  /** Why the selected parcel accepts nothing at all. */
  parcelBlock: string | null;
  ownCity: boolean;
  cityName?: string;
  /** Free production-district slots from the city's housing. */
  freeDistrictSlots: number;
  /** Does the inspected cell touch a river or the coast? */
  hasWater: boolean;
  treasury: { gold: number; production: number };
  subnodeBlockReason: (key: string) => string | null;
  basketOptions: (districtKey: string) => { key: string; label: string }[];
  spriteFor: (item: CatalogItem) => string;
  devMode?: boolean;
  onBuild: (item: CatalogItem, basketKey?: string) => void;
}

const fmt = (v: number) => (Math.round(v * 10) / 10).toLocaleString("cs-CZ");

export function BuildCatalogPanel(props: Props) {
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [query, setQuery] = useState("");
  const [availability, setAvailability] = useState<"all" | "now" | "blocked">("all");
  const [open, setOpen] = useState<Record<string, boolean>>({ housing: true, source: true });
  const [detail, setDetail] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    void supabase.from("production_recipes")
      .select("recipe_key,output_good_key,output_quantity,labor_cost,input_items,required_role,required_tags,min_quality_input,quality_output_bonus,description")
      .then(({ data }) => { if (alive && data) setRecipes(data as unknown as RecipeRow[]); });
    return () => { alive = false; };
  }, []);

  const catalog = useMemo(() => buildCatalog({ templates: props.templates, recipes }), [props.templates, recipes]);

  /** Hard blocker — the parcel or the treasury refuses this build right now. */
  const blockedBy = (item: CatalogItem): string | null => {
    if (item.kind === "subnode") return props.subnodeBlockReason(item.refId);
    if (props.parcelBlock) return props.parcelBlock;
    if (!props.ownCity) return "Nedostupné: stavět lze jen na parcele vlastního města";
    if (item.kind === "district" && item.category === "district" && props.freeDistrictSlots <= 0)
      return "Nedostupné: žádná volná obytná kapacita — postav nejdřív obytnou čtvrť";
    // Same hard rule and wording as the server (buildValidation.WATER_REASON).
    if (item.requirements.includes("Řeka nebo pobřeží") && !props.hasWater)
      return "Nedostupné: tato stavba potřebuje řeku nebo pobřeží.";
    if (props.treasury.gold < item.cost.gold)
      return `Nedostupné: chybí zlato (${item.cost.gold})`;
    return null;
  };

  /** Soft warning — postavit lze, ale plný výkon to zatím mít nebude. */
  const warningFor = (item: CatalogItem): string | null => {
    if (item.productive && item.recipes.some(r => r.inputs.length > 0))
      return "Potřebuje dodávky vstupů — bez dodavatele nebo cesty bude vyrábět méně.";
    return null;
  };

  const filtered = useMemo(() => catalog.filter(item => {
    if (!matchesQuery(item, query)) return false;
    const blocked = !!blockedBy(item);
    return availability === "all" || (availability === "now" ? !blocked : blocked);
  }), [catalog, query, availability, props.parcelBlock, props.ownCity, props.freeDistrictSlots, props.treasury.gold, props.hasWater]);

  const groups = useMemo(() => {
    const map = new Map<BuildCategory, CatalogItem[]>();
    for (const item of filtered) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category)!.push(item);
    }
    return BUILD_CATEGORY_ORDER.filter(c => map.has(c)).map(c => [c, map.get(c)!] as const);
  }, [filtered]);

  const selected = catalog.find(i => i.key === detail) || null;

  const costLine = (item: CatalogItem) => [
    item.cost.gold ? `${item.cost.gold} zlata` : null,
    item.cost.production ? `${item.cost.production} produkce` : null,
    item.cost.wood ? `${item.cost.wood} dřeva` : null,
    item.cost.stone ? `${item.cost.stone} kamene` : null,
    item.cost.iron ? `${item.cost.iron} železa` : null,
    `${item.buildTurns} t.`,
  ].filter(Boolean).join(" · ");

  return <div className="space-y-2">
    <div className="sticky top-0 z-10 space-y-2 bg-background/95 pb-2 pt-1 backdrop-blur">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Hledat (mouka, železo, bydlení…)"
            className="h-7 pl-7 text-xs" />
        </div>
        <span className="text-[10px] text-muted-foreground">{filtered.length}</span>
      </div>
      <div className="flex gap-1">
        {([["all", "Vše"], ["now", "Lze postavit"], ["blocked", "Nedostupné"]] as const).map(([key, label]) => (
          <Button key={key} size="sm" variant={availability === key ? "default" : "outline"}
            className="h-6 flex-1 px-1 text-[10px]" onClick={() => setAvailability(key)}>{label}</Button>
        ))}
      </div>
      {props.cityName && <p className="text-[10px] text-muted-foreground">Staví se pro {props.cityName} · volné výrobní zóny: {props.freeDistrictSlots}</p>}
    </div>

    {groups.map(([category, items]) => {
      const expanded = open[category] ?? false;
      return <div key={category} className="rounded border border-border/60">
        <button type="button" className="flex w-full items-center gap-1 px-2 py-1 text-left"
          onClick={() => setOpen(c => ({ ...c, [category]: !expanded }))}>
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span className="flex-1 text-xs font-medium">{BUILD_CATEGORY_LABELS[category].label}</span>
          <span className="text-[10px] text-muted-foreground">{items.length}</span>
        </button>
        {expanded && <div className="space-y-2 px-2 pb-2">
          <p className="text-[10px] text-muted-foreground">{BUILD_CATEGORY_LABELS[category].hint}</p>
          {items.map(item => {
            const blocked = blockedBy(item);
            const warning = warningFor(item);
            const basketChoices = item.kind === "district" && item.category === "district" ? props.basketOptions(item.refId) : [];
            const picked = pick[item.key] || basketChoices[0]?.key;
            return <div key={item.key} className="rounded border border-border/60 p-2">
              <div className="flex items-start gap-2">
                <img src={props.spriteFor(item)} alt="" className="h-8 w-8 shrink-0 object-contain" />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-xs font-medium">{item.name}</p>
                  <p className="text-[10px] text-muted-foreground">{item.purpose}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{costLine(item)}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {item.housing ? <Badge variant="secondary" className="px-1 py-0 text-[9px]">+{item.housing} bydlení</Badge> : null}
                    {item.jobsLevel1 ? <Badge variant="secondary" className="px-1 py-0 text-[9px]">{fmt(item.jobsLevel1)} pracovních míst</Badge> : null}
                    {item.capacityLevel1 ? <Badge variant="outline" className="px-1 py-0 text-[9px]">kapacita {fmt(item.capacityLevel1)}</Badge> : null}
                    {item.maxLevel > 1 ? <Badge variant="outline" className="px-1 py-0 text-[9px]">až úroveň {item.maxLevel}</Badge> : null}
                    {item.requirements.map(r => <Badge key={r} variant="outline" className="px-1 py-0 text-[9px]">{r}</Badge>)}
                  </div>
                </div>
                <Button size="icon" variant="ghost" className="h-6 w-6" title="Detail"
                  onClick={() => setDetail(current => current === item.key ? null : item.key)}>
                  <Info className="h-3 w-3" />
                </Button>
              </div>
              {basketChoices.length > 0 && <select className="mt-2 h-7 w-full rounded border border-input bg-background px-1 text-[11px]"
                value={picked} onChange={e => setPick(c => ({ ...c, [item.key]: e.target.value }))}>
                {basketChoices.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>}
              <div className="mt-2 flex items-center gap-2">
                <Button size="sm" className="h-7 flex-1 px-2 text-[11px]" disabled={!!blocked || !!props.busyKey}
                  title={blocked || undefined} onClick={() => props.onBuild(item, picked)}>
                  {props.busyKey === item.key ? <Loader2 className="h-3 w-3 animate-spin" /> : "Postavit"}
                </Button>
              </div>
              {blocked && <p className="mt-1 text-[10px] text-amber-400">{blocked}</p>}
              {!blocked && warning && <p className="mt-1 text-[10px] text-muted-foreground">{warning}</p>}
            </div>;
          })}
        </div>}
      </div>;
    })}

    {selected && <div className="rounded border border-primary/50 bg-background/70 p-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{selected.name}</p>
          <p className="text-[10px] text-muted-foreground">{BUILD_CATEGORY_LABELS[selected.category].label}
            {selected.role ? ` · ${ROLE_LABELS[selected.role] || selected.role}` : ""}</p>
        </div>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setDetail(null)}>Zavřít</Button>
      </div>
      {selected.description && <p className="mt-1 text-[11px] text-muted-foreground">{selected.description}</p>}
      <p className="mt-1 text-[11px]">{selected.purpose}</p>

      {selected.recipes.length > 0 && <div className="mt-2">
        <p className="text-[11px] font-medium">Výroba (možnosti, ne postup za sebou)</p>
        <div className="mt-1 space-y-1">{selected.recipes.map(r => <div key={r.key} className="rounded bg-muted/40 p-1">
          <p className="text-[11px]">
            {r.inputs.length ? r.inputs.map(i => `${i.qty}× ${goodLabel(i.good)}`).join(" + ") : "bez vstupů"}
            {" → "}{r.outputQty}× {goodLabel(r.output)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            práce {r.labor} · od úrovně {r.unlockLevel}
            {r.minQuality ? ` · min. kvalita vstupu ${r.minQuality}` : ""}
            {r.qualityBonus ? ` · kvalita výstupu +${r.qualityBonus}` : ""}
            {props.devMode ? ` · ${r.key}` : ""}
          </p>
        </div>)}</div>
      </div>}

      {selected.levels.length > 1 && <div className="mt-2">
        <p className="text-[11px] font-medium">Úrovně</p>
        <table className="mt-1 w-full text-[10px]">
          <thead className="text-muted-foreground"><tr><th className="text-left">Úroveň</th><th className="text-right">Kapacita</th><th className="text-right">Práce</th><th className="text-left pl-2">Nové recepty</th></tr></thead>
          <tbody>{selected.levels.map(l => <tr key={l.level} className="border-t border-border/40">
            <td>{l.level}</td>
            <td className="text-right">{fmt(l.capacity)}</td>
            <td className="text-right">{l.jobs === undefined ? "—" : fmt(l.jobs)}</td>
            <td className="pl-2">{l.unlocks.length ? l.unlocks.map(k => goodLabel(selected.recipes.find(r => r.key === k)?.output || k)).join(", ") : "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>}

      {Object.keys(selected.baskets).length > 0 && <p className="mt-2 text-[10px] text-muted-foreground">
        Pokrývá potřeby: {Object.entries(selected.baskets).map(([k, v]) => `${k} ${fmt(Number(v))}`).join(" · ")}
      </p>}
      {selected.requirements.length > 0 && <p className="mt-1 text-[10px] text-muted-foreground">Požadavky: {selected.requirements.join(" · ")}</p>}
      {selected.dataGaps.length > 0 && <p className="mt-1 text-[10px] text-amber-400">{selected.dataGaps.join(" ")}</p>}
      {props.devMode && <p className="mt-1 text-[10px] text-muted-foreground">{selected.key} · tags: {selected.tags.join(", ") || "—"}</p>}
    </div>}
  </div>;
}

export default BuildCatalogPanel;
