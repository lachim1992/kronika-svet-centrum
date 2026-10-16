// Náklady výroby + Specifické zboží (admin, read-only). All values come from the
// economy-dev-snapshot v2 response (costs/specific). Unmodelled components are
// shown as "nedostupné", never as 0; contribution margin is never called profit.
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import ProducerCostDetails from "@/components/economy/ProducerCostDetails";
import { Grid } from "./Grid";
import { compareCosts, type EconomyDevSnapshot, type CostRow, type CostComponent } from "@/lib/economyDevSnapshot";

const f = (x: number | null | undefined, d = 3) => (x == null || !Number.isFinite(x) ? "—" : Math.abs(x) >= 1000 ? x.toFixed(0) : x.toFixed(d));
const pct = (x: number | null | undefined) => (x == null ? "—" : `${(x * 100).toFixed(0)} %`);
const NA = ({ why }: { why: string }) => <span className="text-muted-foreground italic" title={why}>nedostupné</span>;
const val = (x: number | null, why: string) => (x == null ? <NA why={why} /> : f(x));
const PROV: Record<string, string> = { producer_exact: "přesně (výrobce)", city_level: "městská úroveň", planned_estimate: "plánovaný odhad", imputed: "odhad, nikoli výplata", unavailable: "nedostupné" };
const SRC = "economy_turn_ledgers.result.diagnostics[].margin ⨝ snapshot.producers ⨝ prices";
const MAX_DEPTH = 6;

type SetP = (key: string, value: string | null) => void;
interface Props { s: EconomyDevSnapshot; cn: (id: string) => string; match: (c?: string, g?: string, e?: string) => boolean; sp: URLSearchParams; setP: SetP; setMany: (kv: Record<string, string | null>) => void }

function Comp({ c }: { c: CostComponent }) {
  return <tr className="border-t"><td className="px-2">{c.label}</td><td className="px-2 tabular-nums">{c.status === "unavailable" ? <NA why={c.reason || ""} /> : f(c.per_unit, 4)}</td>
    <td className="px-2">{c.status}</td><td className="px-2">{PROV[c.provenance]}</td><td className="px-2 text-muted-foreground">{c.source_path}{c.reason ? ` — ${c.reason}` : ""}</td></tr>;
}

export function Costs({ s, cn, match, sp, setP, setMany }: Props) {
  const rows = s.costs?.rows || [];
  const activeOnly = sp.get("edv_active") === "1";
  const prodId = sp.get("edv_prod"), pa = sp.get("edv_pa"), pb = sp.get("edv_pb"), good = sp.get("edv_good") || "", city = sp.get("edv_city") || "";
  const path = (sp.get("edv_path") || "").split(",").filter(Boolean);
  const filtered = rows.filter((r) => match(r.city, r.output_good, r.producer) && (!activeOnly || r.active));
  const byId = new Map(rows.map((r) => [r.producer, r]));
  const sel = prodId ? byId.get(prodId) : undefined;
  const A = pa ? byId.get(pa) : undefined, B = pb ? byId.get(pb) : undefined;
  const ranked = good ? rows.filter((r) => r.output_good === good).sort((x, y) => (x.comparable_unit_cost ?? Infinity) - (y.comparable_unit_cost ?? Infinity)) : [];
  const open = (r: CostRow) => setMany({ edv_prod: r.producer, edv_city: r.city, edv_good: r.output_good });
  const ab = (r: CostRow) => <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
    <Button size="sm" variant={pa === r.producer ? "default" : "outline"} className="h-5 px-1 text-[10px]" onClick={() => setP("edv_pa", pa === r.producer ? null : r.producer)}>A</Button>
    <Button size="sm" variant={pb === r.producer ? "default" : "outline"} className="h-5 px-1 text-[10px]" onClick={() => setP("edv_pb", pb === r.producer ? null : r.producer)}>B</Button></span>;
  return (
    <div className="space-y-3">
      <div className="border rounded p-2 text-muted-foreground space-y-1">
        <p><b>Srovnatelný známý náklad</b> = materiálový náklad na 1 ks výstupu tak, jak ho ocenil engine (diagnostics.margin: místní vstupy místní cenou, dovezené landed cenou nákupu). Není to plný ekonomický náklad.</p>
        <p>A/B/C a odhad mezd jsou v detailu podle uložené verze účtu výrobce. Odpisy budov, režie a daně výrobce zůstávají nedostupné. B opotřebení je již ve vstupech, znovu se nepřičítá. Marže = <b>materiálová/příspěvková marže</b>, ne hotovostní zisk.</p>
      </div>
      <label className="flex items-center gap-1"><Switch checked={activeOnly} onCheckedChange={(v) => setP("edv_active", v ? "1" : null)} /> jen aktivní výroba (realized &gt; 0)</label>
      <Grid source={SRC} capped={s.costs} rows={filtered} onRow={open}
        cols={[["A/B", ab], ["Říše", (r) => r.realm || "—"], ["Město", (r) => cn(r.city)], ["Uzel", (r) => (r.node || "—").slice(0, 8)], ["Výrobce", (r) => r.producer.slice(0, 8)], ["Receptura", (r) => r.recipe],
          ["Výstup", (r) => r.output_good], ["Varianta", (r) => r.famous_name ? `★ ${r.famous_name}` : <NA why={r.variant_note} />], ["Plán", (r) => f(r.planned_output)], ["Skutečně", (r) => f(r.realized)], ["Kapacita", (r) => f(r.capacity)], ["Využití", (r) => pct(r.utilization)],
          ["Známý náklad/ks", (r) => val(r.comparable_unit_cost, "výrobce nic nevyrobil nebo chybí margin.inputs")], ["Pořadí", (r) => r.rank ? `${r.rank}/${r.rank_of}` : "—"], ["Místní vstupy/ks", (r) => val(r.local_input_unit_cost, "není skutečný náklad")], ["Dovoz/ks", (r) => val(r.remote_input_unit_cost, "není skutečný náklad")],
          ["Doprava/ks", (r) => val(r.transport_unit, r.components[2].reason || "")], ["Mýto/ks", (r) => val(r.tolls_unit, r.components[3].reason || "")], ["Riziko+ztráty/ks", (r) => r.risk_unit == null || r.loss_unit == null ? <NA why={r.components[5].reason || ""} /> : f(r.risk_unit + r.loss_unit)],
          ["Plán. odhad/ks", (r) => r.planned_material_unit_cost == null ? <NA why="chybí nebo nedostupný plánovaný vstup" /> : <span title="plánovaný odhad, ne skutečnost">≈{f(r.planned_material_unit_cost)}</span>],
          ["Úplnost", (r) => <Badge variant={r.completeness === "unavailable" ? "destructive" : "outline"} title={`chybí: ${r.missing.join(", ")}`}>{r.completeness}</Badge>], ["Míst. cena", (r) => f(r.local_price)], ["Ocenění výstupu", (r) => f(r.valuation_price)],
          ["Mat. marže/ks", (r) => val(r.contribution_margin_unit, "nevyrobeno")], ["Oček. marže (proxy)", (r) => f(r.expected_margin_proxy)], ["Původ", (r) => PROV[r.provenance]], ["v", (r) => r.diagnostic_version], ["Blok", (r) => r.blocked || "—"]]} />

      {good && <div className="border rounded p-2 space-y-1">
        <p className="font-semibold">Žebříček lokalit pro {good} podle srovnatelného známého nákladu</p>
        {ranked.map((r) => <p key={r.producer} className="font-mono">{r.rank ? `#${r.rank}` : "—"} {cn(r.city)} · {r.recipe} · {r.comparable_unit_cost == null ? (r.planned_material_unit_cost != null ? `skutečný náklad nedostupný (plán ≈${f(r.planned_material_unit_cost)})` : "nedostupné") : f(r.comparable_unit_cost)} · {r.completeness}{r.missing.length ? ` (chybí ${r.missing.join(", ")})` : ""}</p>)}
        <p className="text-muted-foreground">Nejnižší známý náklad ≠ skutečně nejlevnější: žebříček nezahrnuje odhad mezd, odpisy budov, režii ani daně{new Set(ranked.filter((r) => r.rank).map((r) => r.missing.join())).size > 1 ? "; navíc se úplnost mezi lokalitami liší" : ""}.</p>
      </div>}

      {(A || B) && <Compare A={A} B={B} cn={cn} />}
      {sel && <Bom row={sel} s={s} cn={cn} path={path} setMany={setMany} />}
      {city && good && <PriceExplain s={s} cn={cn} city={city} good={good} />}
    </div>
  );
}

function Compare({ A, B, cn }: { A?: CostRow; B?: CostRow; cn: (id: string) => string }) {
  if (!A || !B) return <p className="text-muted-foreground border rounded p-2">Proč levnější? Vyberte tlačítky A a B dva řádky.</p>;
  const c = compareCosts(A, B);
  return (
    <div className="border rounded p-2 space-y-1">
      <p className="font-semibold">Proč levnější? A = {cn(A.city)} ({A.recipe}) · B = {cn(B.city)} ({B.recipe})</p>
      {c.warnings.map((w) => <p key={w} className="text-destructive">⚠ {w}</p>)}
      <p className="font-mono">Známý náklad/ks: A {f(c.total_a)} · B {f(c.total_b)} · Δ(B−A) {f(c.total_delta)} · přiřazeno {f(c.attributed)} · nevysvětlené reziduum {f(c.residual, 6)}</p>
      {c.total_delta == null ? <p className="text-muted-foreground">Rozpad se nevytváří — chybí skutečný náklad aspoň jedné strany.</p> :
        <table className="text-[11px]"><thead><tr>{["Složka", "A", "B", "Δ", "stav"].map((h) => <th key={h} className="px-2 text-left">{h}</th>)}</tr></thead>
          <tbody>{c.lines.map((l) => <tr key={l.key} className={`border-t ${c.largest.advantage?.key === l.key ? "bg-primary/10" : c.largest.disadvantage?.key === l.key ? "bg-destructive/10" : ""}`}>
            <td className="px-2">{l.label}</td><td className="px-2 tabular-nums">{f(l.a, 4)}</td><td className="px-2 tabular-nums">{f(l.b, 4)}</td><td className="px-2 tabular-nums">{f(l.delta, 4)}</td><td className="px-2">{l.status}</td></tr>)}</tbody></table>}
      <p>Nepřiřaditelné (nedostupné): {c.unattributable.join(", ") || "—"}</p>
      <p>Koeficienty vstupů na 1 ks: {c.quantities.map((q) => `${q.good} A ${f(q.per_output_a)} / B ${f(q.per_output_b)}`).join(" · ") || "bez vstupů"}</p>
      <p>Produktivita (oddělená od cen): využití A {pct(c.productivity.utilization_a)} / B {pct(c.productivity.utilization_b)}, výstup A {f(c.productivity.realized_a)} / B {f(c.productivity.realized_b)}</p>
      {c.largest.advantage && <p>Největší výhoda B: {c.largest.advantage.label} ({f(c.largest.advantage.delta, 4)})</p>}
      {c.largest.disadvantage && <p>Největší nevýhoda B: {c.largest.disadvantage.label} (+{f(c.largest.disadvantage.delta, 4)})</p>}
    </div>
  );
}

function Bom({ row, s, cn, path, setMany }: { row: CostRow; s: EconomyDevSnapshot; cn: (id: string) => string; path: string[]; setMany: Props["setMany"] }) {
  const costs = s.costs?.rows || [];
  const cityIds = new Set((s.cities || []).map((c) => c.id));
  const goUp = (good: string, src: string | null) => {
    if (path.includes(good) || path.length >= MAX_DEPTH) return;
    const city = src && cityIds.has(src) ? src : row.city;
    const target = costs.find((c) => c.city === city && c.output_good === good) || costs.find((c) => c.output_good === good && c.active) || costs.find((c) => c.output_good === good);
    setMany({ edv_good: good, edv_city: target?.city ?? city, edv_prod: target?.producer ?? null, edv_path: [...path, row.output_good].join(",") });
  };
  const downstream = costs.filter((c) => c.bom.some((b) => b.good === row.output_good));
  const demand = (s.demand?.rows || []).filter((d) => d.good === row.output_good && d.city === row.city);
  const cat = (s.catalogueRecipes || []).find((r) => r.key === row.recipe);
  const known = row.bom.reduce((a, b) => a + (b.contribution_per_output ?? 0), 0);
  return (
    <div className="border rounded p-2 space-y-1">
      <p className="font-semibold">BOM: {row.recipe} @ {cn(row.city)} → {row.output_good} (dávka {row.batch_output} ks; výrobce {row.producer})</p>
      <ProducerCostDetails margin={row.canonical_margin as Record<string, unknown> | null | undefined} showSource />
      {path.length > 0 && <p className="text-muted-foreground">Cesta (max {MAX_DEPTH}): {path.join(" → ")} → {row.output_good} <Button size="sm" variant="ghost" className="h-5" onClick={() => setMany({ edv_path: null })}>vymazat</Button></p>}
      {cat && <p className="text-muted-foreground">Katalog: {cat.inputs.map((i) => `${i.qty} ${i.good}`).join(" + ") || "bez vstupů"} → {cat.qty} {cat.output} (role {cat.role})</p>}
      {!row.bom.length ? <p>Zdrojová receptura bez vstupů — materiálový náklad 0 (známý), ostatní složky nedostupné.</p> :
      <div className="overflow-auto"><table className="text-[11px]"><thead><tr>{["Vstup", "/dávku", "/ks", "potřeba", "dodáno", "spotřeba", "místně", "dovoz", "míst. cena", "plán zdroj", "plán ks", "skut. zdroj", "skut. landed", "zdroj", "doprava", "mýto", "clo", "riziko", "ztráty", "příspěvek/ks", "původ", "pozn."].map((h) => <th key={h} className="px-1 text-left whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody>{row.bom.map((b) => <tr key={b.good} className="border-t">
          <td className="px-1"><button className={`underline ${path.includes(b.good) ? "opacity-50" : ""}`} disabled={path.includes(b.good) || path.length >= MAX_DEPTH} title={path.includes(b.good) ? "cyklus — zastaveno" : "otevřít výrobu vstupu"} onClick={() => goUp(b.good, b.actual_source && b.actual_source !== "local" ? b.actual_source : b.planned_source)}>{b.good}</button></td>
          <td className="px-1">{b.qty_per_batch}</td><td className="px-1">{f(b.per_output_unit)}</td><td className="px-1">{f(b.required)}</td><td className="px-1">{f(b.supplied)}</td><td className="px-1">{f(b.consumed)}</td>
          <td className="px-1">{f(b.local_qty)}</td><td className="px-1">{f(b.imported_qty)}</td><td className="px-1">{f(b.local_unit_price)}</td>
          <td className="px-1">{b.planned_source ? (b.planned_source === "local" ? "místní" : cn(b.planned_source)) : "—"}{b.planned_available === false ? " (nedostupné)" : ""}</td><td className="px-1">{b.planned_unit_cost == null ? "—" : `≈${f(b.planned_unit_cost)}`}</td>
          <td className="px-1">{b.actual_source ? (b.actual_source === "local" ? "místní" : cn(b.actual_source)) : <NA why={b.note || ""} />}</td><td className="px-1">{b.actual_unit_cost == null ? (b.actual_source === "local" ? "—" : <NA why={b.note || "nic nedovezeno"} />) : f(b.actual_unit_cost)}</td>
          {(["source", "transport", "tolls", "tariff", "risk", "loss_cost"] as const).map((k) => <td key={k} className="px-1">{b.actual_parts ? f(b.actual_parts[k], 4) : (b.imported_qty ?? 0) > 0 ? <NA why="ledger v1 bez rozpadu" /> : "—"}</td>)}
          <td className="px-1">{f(b.contribution_per_output, 4)}</td><td className="px-1">{PROV[b.provenance]}</td><td className="px-1 text-muted-foreground">{b.note || ""}{b.cheaper_supplier ? ` levnější: ${cn(b.cheaper_supplier.city)} @ ${f(b.cheaper_supplier.landed)}` : ""}</td></tr>)}</tbody></table></div>}
      <p className="font-mono">Známý materiál/ks: {row.comparable_unit_cost == null ? "nedostupné" : `${f(row.comparable_unit_cost, 4)} (Σ příspěvků ${f(known, 4)}, reziduum ${f((row.comparable_unit_cost ?? 0) - known, 6)})`} · chybí: {row.missing.join(", ")}</p>
      <details><summary className="cursor-pointer">Složky nákladu</summary><table className="text-[11px]"><tbody>{row.components.map((c) => <Comp key={c.key} c={c} />)}</tbody></table></details>
      <p className="font-semibold mt-1">Následní uživatelé {row.output_good}</p>
      {downstream.map((d) => <p key={d.producer} className="text-muted-foreground"><button className="underline" onClick={() => setMany({ edv_prod: d.producer, edv_city: d.city, edv_good: d.output_good, edv_path: null })}>{cn(d.city)} · {d.recipe}</button> (realizováno {f(d.realized)})</p>)}
      {!downstream.length && <p className="text-muted-foreground">Žádná receptura v tomto světě {row.output_good} nespotřebovává.</p>}
      {demand.map((d) => <p key={d.channel} className="text-muted-foreground">Poptávka {cn(d.city)} · {d.channel}: {f(d.quantity)} (nenaplněno {f(d.unmet)})</p>)}
      <p className="text-[10px] text-muted-foreground">Zdroj: {row.source_paths.join(", ")} · diagnostic v{row.diagnostic_version}</p>
    </div>
  );
}

function PriceExplain({ s, cn, city, good }: { s: EconomyDevSnapshot; cn: (id: string) => string; city: string; good: string }) {
  const p = s.prices?.rows.find((x) => x.city === city && x.good === good);
  const prods = (s.costs?.rows || []).filter((c) => c.city === city && c.output_good === good);
  const dem = (s.demand?.rows || []).filter((d) => d.city === city && d.good === good);
  const acc = s.cities?.find((c) => c.id === city)?.accounts;
  const fl = (s.flows?.rows || []).filter((x) => x.destination === city && x.good === good);
  return (
    <div className="border rounded p-2 grid md:grid-cols-2 gap-2">
      <div><p className="font-semibold">A. Výrobní ekonomika</p>
        {prods.length ? prods.map((c) => <p key={c.producer}>{c.recipe}: známý materiál/ks {c.comparable_unit_cost == null ? "nedostupné" : f(c.comparable_unit_cost)}, mat. marže/ks {f(c.contribution_margin_unit)} ({c.completeness})</p>) : <p className="text-muted-foreground">V {cn(city)} se {good} nevyrábí.</p>}</div>
      <div><p className="font-semibold">B. Tvorba místní ceny (result.prices)</p>
        {p ? <><p className="font-mono">{f(p.base_price)} base × {f(p.scarcity_factor)} vzácnost × {f(p.quality_factor)} kvalita × {f(p.fame_factor)} fame = {f(p.local_price)}</p>
          <p className="text-muted-foreground">Vzácnost z pokrytí {f(p.coverage)} (nabídka {f(p.supply)} / potřeba {f(p.demand)}), substituovatelnost {f(p.substitutability)}; kvalita = 1 + kvalita×qualityPremium; fame jen u slavného (město, zboží). Vysoká cena neznamená vysoký náklad.</p></> : <NA why="žádný cenový řádek" />}</div>
      <div><p className="font-semibold">C. Kupující / WTP</p>
        {dem.map((d) => <p key={d.channel}>{d.channel}: {f(d.quantity)}, nenaplněno {f(d.unmet)}{d.fame != null ? `, fame ${f(d.fame)} z ${d.fame_origin ? cn(d.fame_origin) : "?"} (${d.fame_reachable ? "dosažitelné" : "nedosažitelné"})` : ""}</p>)}
        <p>Affordability města {f(acc?.affordability as number)}, kupní síla {f(acc?.purchasing_power as number)} · rozpočet po kanálu: <NA why="engine ukládá affordability jen po městech" /></p></div>
      <div><p className="font-semibold">D. Obchod (result.flows)</p>
        {fl.length ? fl.map((x) => <p key={x.index} className="font-mono">{cn(x.source)}: {f(x.source_price)} zdroj + {f(x.transport_cost)} doprava + {f(x.tolls)} mýto/clo, ztráta {f(x.loss_qty)} ks → landed {f(x.landed_unit_cost)}/ks</p>) : <p className="text-muted-foreground">Žádný realizovaný dovoz {good} do {cn(city)} (nula).</p>}</div>
    </div>
  );
}

export function Specific({ s, cn, sp, setP }: Props) {
  const rows = s.specific || [];
  const sel = rows.find((r) => r.id === sp.get("edv_variant"));
  const goodsWithProd = new Set((s.goods || []).filter((g) => g.produced > 0).map((g) => g.good));
  return (
    <div className="space-y-2">
      <div className="border rounded p-2 text-muted-foreground">
        <p><b>Sémantika:</b> goodsEconomy vede bilance, ceny a toky jen pro generické zboží. „Slavné zboží“ je atribut dvojice (město, zboží) v result.famous (fame, streak, created) a ovlivňuje jen fame_factor ceny a WTP spotřebitelů z dosažitelného původu. good_variants je globální katalog, který engine nečte — varianty se nevyrábějí, nemají množství ani cenu.</p>
        <p>Tento ledger: {rows.filter((r) => r.kind === "famous").length} slavných záznamů, {rows.filter((r) => r.kind === "variant").length} katalogových variant.</p>
      </div>
      <Grid source="result.famous, result.flows[].famous, result.productChoice, good_variants" rows={rows} onRow={(r) => setP("edv_variant", r.id)}
        empty="Žádné specifické zboží ani katalogové varianty."
        cols={[["Název", (r) => r.display_name], ["Typ", (r) => r.kind === "famous" ? "slavné" : "varianta"], ["Generické", (r) => r.generic_good], ["Původ", (r) => r.origin_city ? cn(r.origin_city) : "—"],
          ["Stav", (r) => r.status.join(", ")], ["Generická výroba v původu", (r) => r.kind === "variant" ? <NA why="varianta se nesleduje" /> : f(r.generic_produced_at_origin)],
          ["Generické zboží vyráběno ve světě", (r) => goodsWithProd.has(r.generic_good) ? "ano" : "ne"], ["Fame", (r) => f(r.fame)], ["Q mod.", (r) => f(r.quality_modifier)], ["Prestiž mod.", (r) => f(r.prestige_modifier)],
          ["Cena specif.", () => <NA why="engine neukládá cenu pro variantu/slavné zboží; jen fame_factor na generické ceně" />]]} />
      {sel && <div className="border rounded p-2 space-y-1">
        <p className="font-semibold">{sel.display_name} <code className="text-[10px]">{sel.id}</code></p>
        <p className="text-destructive">{sel.limitation}</p>
        <p>Generické zboží {sel.generic_good}; stav: {sel.status.join(", ")}; samostatně sledováno: {sel.tracked_separately ? "ano" : "ne"}</p>
        {sel.kind === "famous" && <>
          <p>Původ {sel.origin_city ? cn(sel.origin_city) : "—"} ({sel.realm}), fame {f(sel.fame)}, streak {f(sel.streak)}, vznik tah {sel.created_turn ?? "—"}, kvalita {f(sel.quality)}</p>
          <p>Cena: base {f(sel.base_price)}, místní generická {f(sel.local_generic_price)}, fame_factor {f(sel.fame_factor)} · specifická cena <NA why="neukládá se" /></p>
          <p>Prémie platí v: {sel.premium_cities.map((c) => `${cn(c.city)} (${c.reachable ? "dosažitelné" : "nedosažitelné"})`).join(", ") || "nikde"}</p>
          <p>Slavné toky: {sel.famous_flows.map((x) => `#${x.index} → ${cn(x.destination)} ${f(x.delivered)} ks @ ${f(x.source_price)}`).join("; ") || "žádné"}</p>
          <p>Výrobci: {sel.producers.map((p) => p.slice(0, 8)).join(", ") || "—"} · materiál/ks {sel.unit_material_cost == null ? "nedostupné" : f(sel.unit_material_cost)} ({sel.cost_completeness ?? "—"})</p>
        </>}
        <p>Následné receptury ({sel.generic_good}): {sel.downstream_recipes.join(", ") || "žádné"}</p>
        <p className="text-[10px] text-muted-foreground">Zdroj: {sel.source_paths.join(", ")}</p>
      </div>}
    </div>
  );
}
