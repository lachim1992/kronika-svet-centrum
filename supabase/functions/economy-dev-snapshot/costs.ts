import { consumedPerBatch } from '../_shared/inputKinds.ts';
// Pure, read-only cost / bill-of-materials / specific-goods projection over one
// goods ledger (economy_turn_ledgers.result). No formula is re-derived: every
// cost is the engine's own valuation (diagnostics[].margin, written by
// goodsEconomy) or the AUTO planner's expectedInputSources (planned estimate).
// Components the engine does not model are reported as unavailable, never 0.
// Self-contained (no imports) so the admin UI can reuse compareCosts().

type Num = number;
const n = (x: unknown): Num => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const fin = (x: unknown): Num | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const EPS = 1e-9;
const k = (city: string, good: string) => `${city}::${good}`;

export const LANDED_PARTS = ["source", "transport", "tolls", "tariff", "risk", "loss_cost"] as const;
export type LandedPart = typeof LANDED_PARTS[number];
export type LandedParts = Record<LandedPart, Num>;

/** One input line of diagnostics[].margin.inputs (goodsEconomy). v2 adds landed_parts/ranked_suppliers. */
export interface MarginLine { good: string; qty: Num; price: Num; local_price: Num; imported_qty: Num; landed_unit_cost: Num | null;
  chosen_supplier: string | null; cheaper_supplier: { city: string; landed: Num } | null;
  landed_parts?: LandedParts | null; ranked_suppliers?: ({ city: string; landed: Num } & Partial<LandedParts>)[] | null }
export interface MarginBlock { cost?: Num; revenue?: Num; margin?: Num; margin_ratio?: Num; auto_flag?: string | null;
  unit_input_cost?: Num; unit_output_price?: Num; inputs?: MarginLine[]; diagnostic_version?: number;
  expected_margin_proxy?: Num | null; order?: string }

export interface CostInputProducer { id: string; city: string; node: string; channel: string; recipe: { key: string; good: string; qty: Num; inputs: { good: string; qty: Num }[] };
  capacity: Num; expectedMarginProxy?: Num; expectedInputSources?: Record<string, { cost: Num; source: string; available: boolean }> }
export interface CostInputDiag { producer: string; realized: Num; potential_output?: Num; inputs?: { good: string; required: Num; supplied: Num }[];
  blocked: string | null; bottleneck?: string | null; margin?: MarginBlock }
export interface CostInputPrice { city: string; good: string; base_price: Num; local_price: Num; scarcity_factor: Num; quality_factor: Num; fame_factor: Num; coverage: Num }
export interface FameEntry { city: string; good: string; name?: string; fame?: Num; streak?: Num; created?: number | null; quality?: Num; turn?: number }

export type Provenance = "producer_exact" | "city_level" | "planned_estimate" | "unavailable";
export type ComponentStatus = "known" | "zero" | "unavailable";
export interface CostComponent { key: string; label: string; per_unit: Num | null; status: ComponentStatus; provenance: Provenance; source_path: string; reason?: string }

export interface BomInput { good: string; qty_per_batch: Num; per_output_unit: Num; required: Num | null; supplied: Num | null;
  consumed: Num | null; local_qty: Num | null; imported_qty: Num | null; local_unit_price: Num | null;
  planned_source: string | null; planned_unit_cost: Num | null; planned_available: boolean | null;
  actual_source: string | null; actual_unit_cost: Num | null; actual_parts: LandedParts | null;
  delivered_unit_price: Num | null; contribution_per_output: Num | null; provenance: Provenance; cheaper_supplier: { city: string; landed: Num } | null;
  ranked_suppliers: ({ city: string; landed: Num } & Partial<LandedParts>)[] | null; note: string | null }

export interface CostRow { producer: string; realm: string | null; city: string; node: string; channel: string; recipe: string;
  output_good: string; variant: null; variant_note: string; famous_name: string | null;
  batch_output: Num; capacity: Num; planned_output: Num | null; realized: Num; utilization: Num | null; active: boolean;
  comparable_unit_cost: Num | null; material_unit_cost: Num | null; local_input_unit_cost: Num | null; remote_input_unit_cost: Num | null;
  planned_material_unit_cost: Num | null; planned_complete: boolean | null;
  transport_unit: Num | null; tolls_unit: Num | null; tariff_unit: Num | null; risk_unit: Num | null; loss_unit: Num | null;
  components: CostComponent[]; completeness: "complete" | "partial" | "unavailable"; missing: string[];
  local_price: Num | null; base_price: Num | null; scarcity_factor: Num | null; quality_factor: Num | null; fame_factor: Num | null; coverage: Num | null;
  valuation_price: Num | null; revenue: Num | null; contribution_margin: Num | null; contribution_margin_unit: Num | null;
  expected_margin_proxy: Num | null; provenance: Provenance; diagnostic_version: number; blocked: string | null;
  rank: number | null; rank_of: number; bom: BomInput[]; source_paths: string[] }

/** Components the current engine never stores per producer — always unavailable, never 0. */
export const UNMODELLED: { key: string; label: string; reason: string }[] = [
  { key: "labor", label: "Práce (mzdy)", reason: "goodsEconomy nemodeluje mzdy; práce jen omezuje kapacitu (staffing_ratio)" },
  { key: "capital", label: "Kapitál / odpisy", reason: "engine neúčtuje odpisy výrobci; city_capital_stock je jen městský agregát" },
  { key: "overhead", label: "Režie / údržba budovy", reason: "údržba budov se neúčtuje na výrobce (žádné pole v ledgeru)" },
  { key: "tool_wear", label: "Opotřebení nástrojů", reason: "opotřebení nástrojů je spotřeba na úrovni města, ne výrobce" },
  { key: "taxes", label: "Daně", reason: "daně účtuje process-turn po říších (realm_resources), ne po výrobci" },
];

export function buildCosts(a: { producers: CostInputProducer[]; diagnostics: CostInputDiag[]; prices: CostInputPrice[];
  famous: FameEntry[]; owners: Map<string, string> }): CostRow[] {
  const diagBy = new Map(a.diagnostics.map((d) => [d.producer, d]));
  const priceBy = new Map(a.prices.map((p) => [k(p.city, p.good), p]));
  const fameBy = new Map(a.famous.map((f) => [k(f.city, f.good), f]));
  const rows: CostRow[] = a.producers.map((p) => {
    const d = diagBy.get(p.id); const m = d?.margin; const realized = n(d?.realized); const batch = Math.max(EPS, n(p.recipe.qty));
    const version = m?.diagnostic_version ?? 1; const pr = priceBy.get(k(p.city, p.recipe.good));
    const lines = m?.inputs || []; const hasInputs = (p.recipe.inputs || []).length > 0; const active = realized > EPS;
    let local = 0, remote = 0, partsKnown = true; const parts: LandedParts = { source: 0, transport: 0, tolls: 0, tariff: 0, risk: 0, loss_cost: 0 };
    let plannedSum = 0, plannedComplete: boolean | null = hasInputs ? true : null;
    const bom: BomInput[] = (p.recipe.inputs || []).map((i) => {
      const line = lines.find((l) => l.good === i.good); const di = d?.inputs?.find((x) => x.good === i.good); const es = p.expectedInputSources?.[i.good];
      const per = consumedPerBatch(i as any) / batch; /* B factor: wear only */ const plannedCost = es && es.available ? fin(es.cost) : null;
      if (plannedCost == null) plannedComplete = false; else plannedSum += per * plannedCost;
      let consumed: Num | null = null, imp: Num | null = null, loc: Num | null = null, contrib: Num | null = null, aParts: LandedParts | null = null;
      let prov: Provenance = es ? "planned_estimate" : "unavailable"; let note: string | null = null;
      if (active && line) {
        consumed = n(line.qty); imp = Math.min(consumed, n(line.imported_qty)); loc = consumed - imp; prov = "producer_exact";
        const impCost = imp * n(line.landed_unit_cost ?? line.local_price); const locCost = loc * n(line.local_price);
        local += locCost; remote += impCost; contrib = (impCost + locCost) / realized;
        if (imp > EPS) {
          if (line.landed_parts) { aParts = line.landed_parts; for (const pk of LANDED_PARTS) parts[pk] += imp * n(line.landed_parts[pk]); }
          else { partsKnown = false; note = "ledger v1: landed cost jen souhrnně, bez rozpadu doprava/mýto/riziko"; }
        }
      } else if (active && !line) note = "chybí margin.inputs pro tento vstup";
      else note = d?.blocked ? `nevyrobeno: ${d.blocked}` : "nevyrobeno — skutečný nákup neexistuje";
      return { good: i.good, qty_per_batch: n(i.qty), per_output_unit: per, required: di ? n(di.required) : null, supplied: di ? n(di.supplied) : null,
        consumed, local_qty: loc, imported_qty: imp, local_unit_price: line ? n(line.local_price) : null,
        planned_source: es?.source ?? null, planned_unit_cost: plannedCost, planned_available: es ? es.available : null,
        actual_source: line && imp != null && imp > EPS ? line.chosen_supplier : (line && active ? "local" : null),
        actual_unit_cost: line && imp != null && imp > EPS ? fin(line.landed_unit_cost) : null, actual_parts: aParts,
        delivered_unit_price: line && active ? n(line.price) : null, contribution_per_output: contrib, provenance: prov,
        cheaper_supplier: line?.cheaper_supplier ?? null, ranked_suppliers: line?.ranked_suppliers ?? null, note };
    });
    const materialKnown = active ? (!hasInputs || (lines.length > 0 && bom.every((b) => b.provenance === "producer_exact"))) : false;
    const material = materialKnown ? (hasInputs ? (local + remote) / realized : 0) : null;
    const perUnit = (x: Num) => (materialKnown ? x / realized : null);
    const anyImport = bom.some((b) => n(b.imported_qty) > EPS);
    const comp = (key: LandedPart, label: string): CostComponent => {
      if (!materialKnown) return { key, label, per_unit: null, status: "unavailable", provenance: "unavailable", source_path: "diagnostics[].margin.inputs[].landed_parts", reason: active ? "chybí margin.inputs" : "výrobce nic nevyrobil" };
      if (!anyImport) return { key, label, per_unit: 0, status: "zero", provenance: "producer_exact", source_path: "diagnostics[].margin.inputs[].imported_qty", reason: "žádný dovezený vstup" };
      if (!partsKnown) return { key, label, per_unit: null, status: "unavailable", provenance: "unavailable", source_path: "diagnostics[].margin.inputs[].landed_parts", reason: "ledger v1 neukládá rozpad landed cost" };
      const v = parts[key] / realized; return { key, label, per_unit: v, status: v > EPS ? "known" : "zero", provenance: "producer_exact", source_path: "diagnostics[].margin.inputs[].landed_parts" };
    };
    const components: CostComponent[] = [
      materialKnown ? { key: "local_inputs", label: "Místní vstupy (ocenění místní cenou)", per_unit: perUnit(local), status: local > EPS ? "known" : "zero", provenance: "producer_exact", source_path: "diagnostics[].margin.inputs[].local_price × (qty − imported_qty)" }
        : { key: "local_inputs", label: "Místní vstupy", per_unit: null, status: "unavailable", provenance: "unavailable", source_path: "diagnostics[].margin.inputs", reason: active ? "chybí margin.inputs" : "výrobce nic nevyrobil" },
      comp("source", "Dovoz — cena u zdroje"), comp("transport", "Dovoz — doprava"), comp("tolls", "Dovoz — mýta"), comp("tariff", "Dovoz — clo"),
      comp("risk", "Dovoz — riziko"), comp("loss_cost", "Dovoz — ztráty na cestě"),
      ...UNMODELLED.map((u): CostComponent => ({ key: u.key, label: u.label, per_unit: null, status: "unavailable", provenance: "unavailable", source_path: "—", reason: u.reason })),
    ];
    const missing = components.filter((c) => c.status === "unavailable").map((c) => c.key);
    const fame = fameBy.get(k(p.city, p.recipe.good));
    return { producer: p.id, realm: a.owners.get(p.city) ?? null, city: p.city, node: p.node, channel: p.channel, recipe: p.recipe.key,
      output_good: p.recipe.good, variant: null, variant_note: "goodsEconomy nevede varianty — výstup je generické zboží",
      famous_name: fame && fame.created != null ? fame.name ?? null : null,
      batch_output: n(p.recipe.qty), capacity: n(p.capacity), planned_output: d?.potential_output != null ? n(d.potential_output) : null, realized,
      utilization: n(p.capacity) > EPS ? realized / n(p.capacity) : null, active,
      comparable_unit_cost: material, material_unit_cost: material, local_input_unit_cost: perUnit(local), remote_input_unit_cost: perUnit(remote),
      planned_material_unit_cost: hasInputs ? (plannedComplete ? plannedSum : null) : (p.expectedInputSources ? 0 : null), planned_complete: plannedComplete,
      transport_unit: components[2].per_unit, tolls_unit: components[3].per_unit, tariff_unit: components[4].per_unit, risk_unit: components[5].per_unit, loss_unit: components[6].per_unit,
      components, completeness: material == null ? "unavailable" : missing.length ? "partial" : "complete", missing,
      local_price: pr ? n(pr.local_price) : null, base_price: pr ? n(pr.base_price) : null, scarcity_factor: pr ? n(pr.scarcity_factor) : null,
      quality_factor: pr ? n(pr.quality_factor) : null, fame_factor: pr ? n(pr.fame_factor) : null, coverage: pr ? n(pr.coverage) : null,
      valuation_price: m?.unit_output_price != null ? n(m.unit_output_price) : null, revenue: m?.revenue != null ? n(m.revenue) : null,
      contribution_margin: m?.margin != null ? n(m.margin) : null, contribution_margin_unit: m?.margin != null && active ? n(m.margin) / realized : null,
      expected_margin_proxy: fin(m?.expected_margin_proxy ?? p.expectedMarginProxy), provenance: material != null ? "producer_exact" : (plannedComplete ? "planned_estimate" : "unavailable"),
      diagnostic_version: version, blocked: d?.blocked ?? (active ? null : d?.bottleneck ?? null), rank: null, rank_of: 0, bom,
      source_paths: ["snapshot.producers[id].recipe", "diagnostics[producer].margin", "snapshot.producers[id].expectedInputSources", "prices[city,good]"] };
  });
  // Rank per output good by comparable known (material) cost. Rank is NOT a full-cost ranking.
  const byGood = new Map<string, CostRow[]>();
  for (const r of rows) if (r.comparable_unit_cost != null) { const arr = byGood.get(r.output_good) || []; arr.push(r); byGood.set(r.output_good, arr); }
  for (const arr of byGood.values()) { arr.sort((x, y) => n(x.comparable_unit_cost) - n(y.comparable_unit_cost) || x.city.localeCompare(y.city)); arr.forEach((r, i) => { r.rank = i + 1; r.rank_of = arr.length; }); }
  return rows;
}

export interface CostDeltaLine { key: string; label: string; a: Num | null; b: Num | null; delta: Num | null; status: "attributed" | "unavailable" }
export interface CostComparison { a: string; b: string; comparable: boolean; warnings: string[]; total_a: Num | null; total_b: Num | null; total_delta: Num | null;
  lines: CostDeltaLine[]; attributed: Num | null; residual: Num | null; unattributable: string[];
  quantities: { good: string; per_output_a: Num | null; per_output_b: Num | null }[];
  productivity: { utilization_a: Num | null; utilization_b: Num | null; realized_a: Num; realized_b: Num };
  largest: { advantage: CostDeltaLine | null; disadvantage: CostDeltaLine | null } }

/** Decompose B − A known material unit cost by input and landed component. Never fills gaps. */
export function compareCosts(a: CostRow, b: CostRow): CostComparison {
  const warnings: string[] = [];
  if (a.output_good !== b.output_good) warnings.push(`Různé výstupy: ${a.output_good} vs ${b.output_good}`);
  if (a.recipe !== b.recipe) warnings.push(`Různé receptury: ${a.recipe} vs ${b.recipe} — rozdíl obsahuje i rozdíl koeficientů`);
  if (a.completeness !== b.completeness || a.missing.join() !== b.missing.join()) warnings.push("Různá úplnost nákladů — nelze tvrdit, které místo je skutečně levnější");
  if (a.comparable_unit_cost == null || b.comparable_unit_cost == null) warnings.push("Alespoň jedna strana nemá známý skutečný náklad (plánovaný odhad se neporovnává jako skutečnost)");
  const goods = [...new Set([...a.bom.map((x) => x.good), ...b.bom.map((x) => x.good)])];
  const lines: CostDeltaLine[] = [];
  const push = (key: string, label: string, va: Num | null, vb: Num | null) =>
    lines.push({ key, label, a: va, b: vb, delta: va != null && vb != null ? vb - va : null, status: va != null && vb != null ? "attributed" : "unavailable" });
  const split = (r: CostRow, good: string) => {
    const x = r.bom.find((i) => i.good === good); if (!x) return { local: 0, parts: Object.fromEntries(LANDED_PARTS.map((p) => [p, 0])) as LandedParts, lump: 0, known: r.comparable_unit_cost != null };
    if (x.provenance !== "producer_exact" || !(r.realized > EPS)) return null;
    const local = n(x.local_qty) * n(x.local_unit_price) / r.realized; const imp = n(x.imported_qty);
    if (imp > EPS && !x.actual_parts) return { local, parts: null, lump: imp * n(x.actual_unit_cost) / r.realized, known: true };
    const parts = Object.fromEntries(LANDED_PARTS.map((p) => [p, imp * n(x.actual_parts?.[p]) / r.realized])) as LandedParts;
    return { local, parts, lump: 0, known: true };
  };
  for (const g of goods) {
    const sa = a.comparable_unit_cost != null ? split(a, g) : null, sb = b.comparable_unit_cost != null ? split(b, g) : null;
    push(`${g}:local`, `${g} — místní ocenění`, sa ? sa.local : null, sb ? sb.local : null);
    if (sa?.parts && sb?.parts) for (const p of LANDED_PARTS) { if (Math.abs(sa.parts[p]) + Math.abs(sb.parts[p]) > EPS) push(`${g}:${p}`, `${g} — dovoz ${p}`, sa.parts[p], sb.parts[p]); }
    else {
      const la = sa ? (sa.parts ? LANDED_PARTS.reduce((s, p) => s + sa.parts![p], 0) : sa.lump) : null;
      const lb = sb ? (sb.parts ? LANDED_PARTS.reduce((s, p) => s + sb.parts![p], 0) : sb.lump) : null;
      if (n(la) + n(lb) > EPS || la == null || lb == null) push(`${g}:import`, `${g} — dovoz (landed souhrnně, bez rozpadu)`, la, lb);
    }
  }
  const total_delta = a.comparable_unit_cost != null && b.comparable_unit_cost != null ? b.comparable_unit_cost - a.comparable_unit_cost : null;
  const attributed = total_delta == null ? null : lines.reduce((s, l) => s + n(l.delta), 0);
  const att = lines.filter((l) => l.status === "attributed" && Math.abs(n(l.delta)) > EPS).sort((x, y) => n(x.delta) - n(y.delta));
  return { a: a.producer, b: b.producer, comparable: warnings.length === 0, warnings, total_a: a.comparable_unit_cost, total_b: b.comparable_unit_cost, total_delta,
    lines, attributed, residual: total_delta == null || attributed == null ? null : total_delta - attributed,
    unattributable: [...new Set([...a.missing, ...b.missing])],
    quantities: goods.map((g) => ({ good: g, per_output_a: a.bom.find((x) => x.good === g)?.per_output_unit ?? null, per_output_b: b.bom.find((x) => x.good === g)?.per_output_unit ?? null })),
    productivity: { utilization_a: a.utilization, utilization_b: b.utilization, realized_a: a.realized, realized_b: b.realized },
    largest: { advantage: att[0] && n(att[0].delta) < 0 ? att[0] : null, disadvantage: att.length && n(att[att.length - 1].delta) > 0 ? att[att.length - 1] : null } };
}

export interface VariantCatalogueRow { id: string; parent_good_key: string; variant_key: string; display_name: string;
  quality_modifier: Num | null; prestige_modifier: Num | null; cultural_origin: string | null }
export type SpecificStatus = "catalogue_only" | "eligible" | "produced" | "stocked" | "traded" | "consumed" | "famous";
export interface SpecificGoodRow { id: string; kind: "famous" | "variant"; display_name: string; generic_good: string;
  origin_city: string | null; realm: string | null; fame_origin: string | null; status: SpecificStatus[];
  tracked_separately: boolean; limitation: string; producers: string[];
  generic_produced_at_origin: Num | null; generic_opening: Num | null; generic_closing: Num | null; generic_consumed: Num | null;
  famous_flows: { index: number; destination: string; delivered: Num; source_price: Num; destination_wtp: Num | null }[];
  quality: Num | null; fame: Num | null; streak: Num | null; created_turn: number | null; quality_modifier: Num | null; prestige_modifier: Num | null;
  base_price: Num | null; local_generic_price: Num | null; fame_factor: Num | null; specific_price: null;
  premium_cities: { city: string; fame: Num | null; reachable: boolean }[]; unit_material_cost: Num | null; cost_completeness: string | null;
  downstream_recipes: string[]; source_paths: string[] }

export function buildSpecific(a: { famous: FameEntry[]; variants: VariantCatalogueRow[]; owners: Map<string, string>;
  balances: { city: string; good: string; opening: Num; stored: Num; consumed_household: Num; consumed_state: Num; consumed_as_input: Num; produced_household: Num; produced_node: Num; produced_facility: Num; produced_district: Num }[];
  flows: { good: string; source: string; destination: string; delivered: Num; source_price: Num; destination_wtp?: Num; famous: string | null }[];
  choice: { city: string; good: string; fame?: Num; fame_origin?: string | null }[]; prices: CostInputPrice[]; costs: CostRow[];
  recipesUsing: (good: string) => string[] }): SpecificGoodRow[] {
  const bal = new Map(a.balances.map((b) => [k(b.city, b.good), b])); const price = new Map(a.prices.map((p) => [k(p.city, p.good), p]));
  const LIM = "goodsEconomy vede bilance, ceny a toky jen pro generické zboží; slavné zboží je atribut (město, zboží) — množství níže jsou GENERICKÁ";
  const famousRows: SpecificGoodRow[] = a.famous.map((f) => {
    const b = bal.get(k(f.city, f.good)); const pr = price.get(k(f.city, f.good));
    const produced = b ? n(b.produced_household) + n(b.produced_node) + n(b.produced_facility) + n(b.produced_district) : null;
    const fl = a.flows.map((x, index) => ({ x, index })).filter(({ x }) => x.famous === k(f.city, f.good) || (x.famous && x.famous.startsWith(f.city + "::") && x.good === f.good));
    const prem = a.choice.filter((c) => c.good === f.good && c.fame_origin === f.city)
      .map((c) => ({ city: c.city, fame: fin(c.fame), reachable: c.city === f.city || fl.some(({ x }) => x.destination === c.city) }));
    const costs = a.costs.filter((c) => c.city === f.city && c.output_good === f.good && c.active);
    const status: SpecificStatus[] = [];
    if (n(f.streak) > 0) status.push("eligible"); if (f.created != null && n(f.fame) > 0) status.push("famous");
    if (n(produced) > EPS) status.push("produced"); if (b && n(b.stored) > EPS) status.push("stocked");
    if (fl.length) status.push("traded"); if (prem.length) status.push("consumed");
    return { id: `famous:${f.city}::${f.good}`, kind: "famous", display_name: f.name || `${f.city}: ${f.good}`, generic_good: f.good,
      origin_city: f.city, realm: a.owners.get(f.city) ?? null, fame_origin: f.city, status, tracked_separately: false, limitation: LIM,
      producers: costs.map((c) => c.producer), generic_produced_at_origin: produced, generic_opening: b ? n(b.opening) : null, generic_closing: b ? n(b.stored) : null,
      generic_consumed: b ? n(b.consumed_household) + n(b.consumed_state) + n(b.consumed_as_input) : null,
      famous_flows: fl.map(({ x, index }) => ({ index, destination: x.destination, delivered: n(x.delivered), source_price: n(x.source_price), destination_wtp: fin(x.destination_wtp) })),
      quality: fin(f.quality), fame: fin(f.fame), streak: fin(f.streak), created_turn: f.created ?? null, quality_modifier: null, prestige_modifier: null,
      base_price: pr ? n(pr.base_price) : null, local_generic_price: pr ? n(pr.local_price) : null, fame_factor: pr ? n(pr.fame_factor) : null, specific_price: null,
      premium_cities: prem, unit_material_cost: costs.length === 1 ? costs[0].comparable_unit_cost : null, cost_completeness: costs.length === 1 ? costs[0].completeness : null,
      downstream_recipes: a.recipesUsing(f.good), source_paths: ["result.famous", "result.flows[].famous", "result.productChoice[].fame_origin", "result.prices[].fame_factor"] };
  });
  const variantRows: SpecificGoodRow[] = a.variants.map((v) => ({ id: v.id, kind: "variant", display_name: v.display_name, generic_good: v.parent_good_key,
    origin_city: null, realm: null, fame_origin: null, status: ["catalogue_only"], tracked_separately: false,
    limitation: "Katalogová varianta (good_variants). goodsEconomy ji nečte ani nevyrábí; žádné množství, cena ani tok varianty neexistuje.",
    producers: [], generic_produced_at_origin: null, generic_opening: null, generic_closing: null, generic_consumed: null, famous_flows: [],
    quality: null, fame: null, streak: null, created_turn: null, quality_modifier: fin(v.quality_modifier), prestige_modifier: fin(v.prestige_modifier),
    base_price: null, local_generic_price: null, fame_factor: null, specific_price: null, premium_cities: [], unit_material_cost: null, cost_completeness: null,
    downstream_recipes: a.recipesUsing(v.parent_good_key), source_paths: ["good_variants (globální katalog)"] }));
  return [...famousRows, ...variantRows];
}
