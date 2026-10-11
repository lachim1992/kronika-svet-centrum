// Pure, read-only projection of one committed/derived goods ledger row
// (economy_turn_ledgers.result written by goodsEconomy via process-turn /
// refresh-economy). No economy formula is recomputed here: every quantity is
// copied or summed from canonical ledger fields; diagnostics are invariant checks.

export const SCHEMA_VERSION = "economy-dev-snapshot/1";
export const TOL = 1e-6;
export const ROW_LIMIT = 2000;

type Num = number;
const n = (x: unknown): Num => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const k = (city: string, good: string) => `${city}::${good}`;

export interface LedgerBalance {
  city: string; good: string; opening: Num; produced_household: Num; produced_node: Num; produced_facility: Num;
  produced_district: Num; consumed_household: Num; consumed_state: Num; consumed_as_input: Num; imported: Num;
  exported: Num; stored: Num; lost_spoilage: Num; unmet_demand: Num; demand: Num; quality: Num;
  gross_output_value: Num; intermediate_value: Num; extraction_value: Num; capex: Num;
}
export interface LedgerFlow {
  good: string; source: string; destination: string; qty: Num; delivered: Num; quality: Num; gross_value: Num;
  transport_cost: Num; tolls: Num; net_value: Num; reason: string; path: string[]; edges: string[]; via_hubs: string[];
  famous: string | null; source_price: Num; destination_price: Num; destination_wtp?: Num; expected_margin: Num;
}
export interface LedgerPrice { city: string; good: string; base_price: Num; local_price: Num; scarcity_factor: Num;
  quality_factor: Num; fame_factor: Num; coverage: Num; demand: Num; supply: Num; imported: Num; substitutability: Num }
export interface LedgerDemand { city: string; good: string; total: Num; channels: Record<string, Num> }
export interface LedgerDiagnostic { producer: string; good: string; capacity: Num; realized: Num; factors: Record<string, Num>;
  jobs_capacity?: Num; employed?: Num; staffing_ratio?: Num; potential_output?: Num;
  inputs?: { good: string; required: Num; supplied: Num }[]; bottleneck?: string | null; blocked: string | null;
  margin?: { cost?: Num; revenue?: Num; margin?: Num; margin_ratio?: Num; auto_flag?: string | null; unit_input_cost?: Num; unit_output_price?: Num } }
export interface SnapshotProducer { id: string; city: string; node: string; cell?: string; channel: string; order?: string;
  source: boolean; capacity: Num; allocation?: Num; autoFlag?: string | null; expectedMarginProxy?: Num;
  recipe: { key: string; good: string; qty: Num; labor?: Num; inputs: { good: string; qty: Num }[] };
  expectedInputSources?: Record<string, { cost: Num; source: string; available: boolean }> }
export interface SnapshotCity { id: string; name: string; owner: string; cell: string; population?: Num }
export interface SnapshotEdge { id: string; from: string; to: string; capacity: Num; mode?: string; cost?: Num; risk?: Num; toll?: Num }
export interface ProductChoiceRow { city: string; good: string; basket?: string; subbasket?: string; fame?: Num;
  fame_origin?: string | null; price?: Num; share?: Num; total?: Num; preference?: Num }
export interface CityAccountRow { city: string; city_gdp?: Num; goods_value_added?: Num; service_value_added?: Num;
  household_income?: Num; disposable_income?: Num; purchasing_power?: Num; price_index?: Num; real_purchasing_power?: Num;
  affordability?: Num; prosperity?: Num; capital_stock?: Num; physical_need_coverage?: Num; proxy?: boolean;
  diversity?: Record<string, { index: Num; effective: Num }>; [k: string]: unknown }
export interface LedgerResult {
  balances?: LedgerBalance[]; flows?: LedgerFlow[]; prices?: LedgerPrice[]; demand?: LedgerDemand[];
  diagnostics?: LedgerDiagnostic[]; metrics?: { city: string; roles?: string[]; [k: string]: unknown }[];
  productChoice?: ProductChoiceRow[]; cityAccounts?: CityAccountRow[]; famous?: { city: string; good: string }[];
  budgetMode?: string;
  snapshot?: { turn?: number; cities?: SnapshotCity[]; producers?: SnapshotProducer[]; edges?: SnapshotEdge[];
    fame?: { city: string; good: string }[]; blockedTrade?: unknown[] };
}

export const producedOf = (b: LedgerBalance) => n(b.produced_household) + n(b.produced_node) + n(b.produced_facility) + n(b.produced_district);
/** Conservation residual using the engine's own ledger identity (capex is a physical sink). */
export const residualOf = (b: LedgerBalance) =>
  n(b.opening) + producedOf(b) + n(b.imported) - n(b.consumed_household) - n(b.consumed_state) - n(b.consumed_as_input)
  - n(b.exported) - n(b.lost_spoilage) - n(b.capex) - n(b.stored);

export interface Totals { opening: Num; produced: Num; imported: Num; consumed_household: Num; consumed_state: Num;
  consumed_as_input: Num; exported: Num; lost_spoilage: Num; capex: Num; closing: Num; demand: Num; unmet: Num;
  served: Num; residual: Num; gross_output_value: Num; intermediate_value: Num }
const emptyTotals = (): Totals => ({ opening: 0, produced: 0, imported: 0, consumed_household: 0, consumed_state: 0,
  consumed_as_input: 0, exported: 0, lost_spoilage: 0, capex: 0, closing: 0, demand: 0, unmet: 0, served: 0, residual: 0,
  gross_output_value: 0, intermediate_value: 0 });
export function addTotals(t: Totals, b: LedgerBalance) {
  t.opening += n(b.opening); t.produced += producedOf(b); t.imported += n(b.imported);
  t.consumed_household += n(b.consumed_household); t.consumed_state += n(b.consumed_state);
  t.consumed_as_input += n(b.consumed_as_input); t.exported += n(b.exported); t.lost_spoilage += n(b.lost_spoilage);
  t.capex += n(b.capex); t.closing += n(b.stored); t.demand += n(b.demand); t.unmet += n(b.unmet_demand);
  t.served += Math.max(0, n(b.demand) - n(b.unmet_demand)); t.residual += residualOf(b);
  t.gross_output_value += n(b.gross_output_value); t.intermediate_value += n(b.intermediate_value);
  return t;
}

export interface GoodRow extends Totals { good: string; demand_household: Num; demand_industrial: Num; demand_construction: Num;
  demand_state: Num; demand_other: Num; coverage: Num | null; price_avg: Num | null; price_min: Num | null; price_max: Num | null;
  trade_value: Num; producing_cities: Num; demanding_cities: Num }

export interface ProducerRow { id: string; city: string; node: string; channel: string; order: string | null; recipe: string;
  output_good: string; inputs: { good: string; qty_per_run: Num; required: Num | null; supplied: Num | null;
    expected_source: string | null; expected_cost: Num | null; expected_available: boolean | null }[];
  capacity: Num; potential_output: Num | null; realized: Num; utilization: Num | null; jobs_capacity: Num | null;
  employed: Num | null; staffing_ratio: Num | null; allocation: Num | null; input_coverage: Num | null;
  cost: Num | null; revenue: Num | null; margin: Num | null; auto_flag: string | null; lost: Num; lost_reason: string | null;
  factors: Record<string, Num>; diagnostic_found: boolean }

export interface DemandRow { city: string; good: string; channel: string; quantity: Num; local_price: Num | null;
  city_good_demand: Num; city_good_unmet: Num; imported: Num; fulfilled_local: Num; fulfilled_import: Num; unmet: Num;
  coverage: Num | null; provenance: string; basket: string | null; subbasket: string | null; fame: Num | null;
  fame_origin: string | null; fame_reachable: boolean | null }

export interface FlowRow extends LedgerFlow { index: number; landed_unit_cost: Num | null; loss_qty: Num;
  edge_capacity: { id: string; capacity: Num | null; used_total: Num }[]; planned: { producer: string; expected_cost: Num; expected_source: string }[] }

export interface Anomaly { id: string; severity: "broken" | "warning" | "info"; check: string; message: string;
  entity: Record<string, string>; observed: unknown; expected: string; filter: { tab: string; city?: string; good?: string; producer?: string; flow?: number } }

const CHANNEL_CATEGORY: Record<string, string> = {
  household_need: "household", household_discretionary: "household", fame: "household",
  industrial_operational: "industrial", construction: "construction", institutional: "state", military: "state",
};

export function buildSnapshot(result: LedgerResult, prevAccounts: CityAccountRow[] | null) {
  const balances = result.balances || []; const flows = result.flows || []; const prices = result.prices || [];
  const demand = result.demand || []; const diags = result.diagnostics || [];
  const snap = result.snapshot || {}; const producers = snap.producers || []; const cities = snap.cities || [];
  const edges = snap.edges || []; const choice = result.productChoice || [];
  const balanceBy = new Map(balances.map((b) => [k(b.city, b.good), b]));
  const priceBy = new Map(prices.map((p) => [k(p.city, p.good), p]));
  const cityIds = new Set(cities.map((c) => c.id));

  // Goods matrix — every good with a ledger balance row is kept, including all-zero goods.
  const goodsMap = new Map<string, GoodRow>();
  for (const b of balances) {
    let g = goodsMap.get(b.good);
    if (!g) { g = { ...emptyTotals(), good: b.good, demand_household: 0, demand_industrial: 0, demand_construction: 0, demand_state: 0,
      demand_other: 0, coverage: null, price_avg: null, price_min: null, price_max: null, trade_value: 0, producing_cities: 0, demanding_cities: 0 };
      goodsMap.set(b.good, g); }
    addTotals(g, b);
    if (producedOf(b) > TOL) g.producing_cities++;
    if (n(b.demand) > TOL) g.demanding_cities++;
  }
  for (const d of demand) { const g = goodsMap.get(d.good); if (!g) continue;
    for (const [ch, q] of Object.entries(d.channels || {})) {
      const cat = CHANNEL_CATEGORY[ch] || "other";
      if (cat === "household") g.demand_household += n(q); else if (cat === "industrial") g.demand_industrial += n(q);
      else if (cat === "construction") g.demand_construction += n(q); else if (cat === "state") g.demand_state += n(q); else g.demand_other += n(q);
    } }
  const priceAgg = new Map<string, { w: Num; s: Num; min: Num; max: Num; cnt: Num }>();
  for (const p of prices) { const a = priceAgg.get(p.good) || { w: 0, s: 0, min: Infinity, max: -Infinity, cnt: 0 };
    const w = n(p.demand) + n(p.supply); a.w += w; a.s += w * n(p.local_price); a.cnt++;
    a.min = Math.min(a.min, n(p.local_price)); a.max = Math.max(a.max, n(p.local_price)); priceAgg.set(p.good, a); }
  for (const f of flows) { const g = goodsMap.get(f.good); if (g) g.trade_value += n(f.gross_value); }
  for (const g of goodsMap.values()) {
    const a = priceAgg.get(g.good);
    if (a && a.cnt) { g.price_min = a.min; g.price_max = a.max; g.price_avg = a.w > TOL ? a.s / a.w : null; }
    g.coverage = g.demand > TOL ? g.served / g.demand : null;
  }
  const goodsRows = [...goodsMap.values()].sort((a, b) => a.good.localeCompare(b.good));

  // Producers — snapshot producer joined 1:1 with its resolver diagnostic.
  const diagBy = new Map(diags.map((d) => [d.producer, d]));
  const producerRows: ProducerRow[] = producers.map((p) => {
    const d = diagBy.get(p.id);
    const inputs = (p.recipe.inputs || []).map((i) => { const di = d?.inputs?.find((x) => x.good === i.good);
      const es = p.expectedInputSources?.[i.good];
      return { good: i.good, qty_per_run: n(i.qty), required: di ? n(di.required) : null, supplied: di ? n(di.supplied) : null,
        expected_source: es?.source ?? null, expected_cost: es ? (Number.isFinite(es.cost) ? es.cost : null) : null,
        expected_available: es ? es.available : null }; });
    const req = inputs.reduce((s, i) => s + n(i.required), 0), sup = inputs.reduce((s, i) => s + n(i.supplied), 0);
    const realized = n(d?.realized); const cap = n(p.capacity);
    const ceiling = d?.potential_output != null ? n(d.potential_output) : cap;
    const lost = Math.max(0, Math.max(cap, ceiling) - realized);
    return { id: p.id, city: p.city, node: p.node, channel: p.channel, order: p.order ?? null, recipe: p.recipe.key,
      output_good: p.recipe.good, inputs, capacity: cap, potential_output: d?.potential_output ?? null, realized,
      utilization: cap > TOL ? realized / cap : null, jobs_capacity: d?.jobs_capacity ?? null, employed: d?.employed ?? null,
      staffing_ratio: d?.staffing_ratio ?? null, allocation: p.allocation ?? null,
      input_coverage: inputs.length && req > TOL ? sup / req : null,
      cost: d?.margin?.cost ?? null, revenue: d?.margin?.revenue ?? null, margin: d?.margin?.margin ?? null,
      auto_flag: d?.margin?.auto_flag ?? p.autoFlag ?? null, lost,
      lost_reason: lost > TOL ? (d?.blocked || d?.bottleneck || (d ? "factors" : "no_diagnostic")) : null,
      factors: d?.factors || {}, diagnostic_found: !!d };
  });

  // Demand — per city × good × canonical channel; physical fulfilment split is at city×good level in the ledger.
  const famousOrigins = new Set((result.famous || snap.fame || []).map((f) => k(f.city, f.good)));
  const famousInbound = new Map<string, Set<string>>();
  for (const f of flows) if (f.famous) { const s = famousInbound.get(k(f.destination, f.good)) || new Set(); s.add(f.source); famousInbound.set(k(f.destination, f.good), s); }
  const choiceBy = new Map(choice.map((c) => [k(c.city, c.good), c]));
  const demandRows: DemandRow[] = [];
  for (const d of demand) {
    const b = balanceBy.get(k(d.city, d.good)); const pr = priceBy.get(k(d.city, d.good)); const ch = choiceBy.get(k(d.city, d.good));
    const total = n(b?.demand), unmet = n(b?.unmet_demand), served = Math.max(0, total - unmet);
    const imported = n(b?.imported); // ledger records transit loss as import + loss
    const fromImport = Math.min(served, Math.max(0, n(b?.imported)));
    const origin = ch?.fame_origin ?? null;
    const reach = origin ? (origin === d.city || famousInbound.get(k(d.city, d.good))?.has(origin) || false) : null;
    for (const [channel, q] of Object.entries(d.channels || {})) {
      if (!(n(q) > TOL)) continue; const share = total > TOL ? n(q) / total : 0;
      demandRows.push({ city: d.city, good: d.good, channel, quantity: n(q), local_price: pr ? n(pr.local_price) : null,
        city_good_demand: total, city_good_unmet: unmet, imported, fulfilled_import: fromImport * share,
        fulfilled_local: (served - fromImport) * share, unmet: unmet * share, coverage: total > TOL ? served / total : null,
        provenance: CHANNEL_CATEGORY[channel] || "other", basket: ch?.basket ?? null, subbasket: ch?.subbasket ?? null,
        fame: ch?.fame ?? null, fame_origin: origin, fame_reachable: reach });
    }
  }

  // Flows with edge capacity usage (bulk-weighted reservation is engine-internal; we report raw qty sums per edge).
  const edgeBy = new Map(edges.map((e) => [e.id, e])); const edgeUse = new Map<string, Num>();
  for (const f of flows) for (const e of f.edges || []) edgeUse.set(e, (edgeUse.get(e) || 0) + n(f.qty));
  const plannedBy = new Map<string, { producer: string; expected_cost: Num; expected_source: string }[]>();
  for (const p of producers) for (const [good, es] of Object.entries(p.expectedInputSources || {})) {
    if (!es.available || es.source === 'local') continue; const key = `${es.source}>${p.city}::${good}`;
    const arr = plannedBy.get(key) || []; arr.push({ producer: p.id, expected_cost: es.cost, expected_source: es.source }); plannedBy.set(key, arr); }
  const flowRows: FlowRow[] = flows.map((f, index) => ({ ...f, index,
    landed_unit_cost: n(f.delivered) > TOL ? (n(f.qty) * n(f.source_price) + n(f.transport_cost) + n(f.tolls)) / n(f.delivered) : null,
    loss_qty: n(f.qty) - n(f.delivered),
    edge_capacity: (f.edges || []).map((id) => ({ id, capacity: edgeBy.has(id) ? n(edgeBy.get(id)!.capacity) : null, used_total: edgeUse.get(id) || 0 })),
    planned: plannedBy.get(`${f.source}>${f.destination}::${f.good}`) || [] }));

  // City balance — canonical accounts and metrics copied as-is; deltas vs previous committed turn's accounts.
  const accBy = new Map((result.cityAccounts || []).map((a) => [a.city, a]));
  const prevBy = new Map((prevAccounts || []).map((a) => [a.city, a]));
  const metBy = new Map((result.metrics || []).map((m) => [m.city, m]));
  const cityRows = cities.map((c) => {
    const t = emptyTotals(); const bs = balances.filter((b) => b.city === c.id); for (const b of bs) addTotals(t, b);
    const shortages = bs.filter((b) => n(b.unmet_demand) > TOL).sort((a, b) => n(b.unmet_demand) - n(a.unmet_demand)).slice(0, 5)
      .map((b) => ({ good: b.good, unmet: n(b.unmet_demand), demand: n(b.demand) }));
    const surpluses = bs.map((b) => ({ good: b.good, surplus: n(b.stored) + n(b.exported) - n(b.opening) })).filter((x) => x.surplus > TOL)
      .sort((a, b) => b.surplus - a.surplus).slice(0, 5);
    const bottlenecks = producerRows.filter((p) => p.city === c.id && p.lost_reason && p.inputs.length)
      .flatMap((p) => p.inputs.filter((i) => i.required != null && n(i.supplied) + TOL < n(i.required)).map((i) => ({ producer: p.id, good: i.good, required: n(i.required), supplied: n(i.supplied) })))
      .slice(0, 5);
    const acc = accBy.get(c.id) || null; const prev = prevBy.get(c.id) || null;
    return { id: c.id, name: c.name, owner: c.owner, cell: c.cell, population: c.population ?? null, totals: t,
      accounts: acc, gdp_delta: acc && prev ? n(acc.city_gdp) - n(prev.city_gdp) : null,
      roles: (metBy.get(c.id)?.roles as string[] | undefined) ?? null, shortages, surpluses, bottlenecks };
  });

  const world = emptyTotals(); for (const b of balances) addTotals(world, b);
  const anomalies = runChecks({ balances, flows: flowRows, producers: producerRows, demand, cityIds, prices, choice, famousOrigins, famousInbound, edgeBy });
  return { goods: goodsRows, producers: producerRows, demand: demandRows, flows: flowRows, cities: cityRows, world, anomalies,
    edges: edges.map((e) => ({ id: e.id, from: e.from, to: e.to, capacity: n(e.capacity), used: edgeUse.get(e.id) || 0 })) };
}

interface CheckInput { balances: LedgerBalance[]; flows: FlowRow[]; producers: ProducerRow[]; demand: LedgerDemand[];
  cityIds: Set<string>; prices: LedgerPrice[]; choice: ProductChoiceRow[]; famousOrigins: Set<string>;
  famousInbound: Map<string, Set<string>>; edgeBy: Map<string, SnapshotEdge> }

export function runChecks(i: CheckInput): Anomaly[] {
  const out: Anomaly[] = []; let seq = 0;
  const push = (a: Omit<Anomaly, "id">) => out.push({ ...a, id: `${a.check}#${seq++}` });
  const seen = new Set<string>();
  for (const b of i.balances) {
    const key = k(b.city, b.good);
    if (seen.has(key)) push({ severity: "broken", check: "duplicate_balance_key", message: "Duplicitní bilance město×zboží", entity: { city: b.city, good: b.good }, observed: key, expected: "jedinečný klíč", filter: { tab: "goods", city: b.city, good: b.good } });
    seen.add(key);
    const r = residualOf(b);
    if (Math.abs(r) > 1e-4 * Math.max(1, n(b.opening) + producedOf(b) + n(b.imported)))
      push({ severity: "broken", check: "conservation_mismatch", message: "Nesouhlasí hmotnostní bilance", entity: { city: b.city, good: b.good }, observed: { residual: r }, expected: "opening+produkce+dovoz−spotřeba−vstupy−vývoz−ztráty−CAPEX = closing", filter: { tab: "goods", city: b.city, good: b.good } });
    for (const f of ["opening", "stored", "imported", "exported", "demand", "unmet_demand", "consumed_household", "consumed_as_input"] as const)
      if (n(b[f]) < -TOL) push({ severity: "broken", check: "negative_quantity", message: `Záporná hodnota ${f}`, entity: { city: b.city, good: b.good }, observed: b[f], expected: "≥ 0", filter: { tab: "goods", city: b.city, good: b.good } });
    if (n(b.unmet_demand) > n(b.demand) + TOL) push({ severity: "broken", check: "unmet_above_demand", message: "Nenaplněná poptávka větší než poptávka", entity: { city: b.city, good: b.good }, observed: { unmet: b.unmet_demand, demand: b.demand }, expected: "unmet ≤ demand", filter: { tab: "demand", city: b.city, good: b.good } });
    if (!i.cityIds.has(b.city)) push({ severity: "broken", check: "orphan_city", message: "Bilance odkazuje na město mimo snapshot", entity: { city: b.city }, observed: b.city, expected: "město v session", filter: { tab: "goods", good: b.good } });
  }
  for (const p of i.prices) if (n(p.local_price) < 0) push({ severity: "broken", check: "negative_price", message: "Záporná cena", entity: { city: p.city, good: p.good }, observed: p.local_price, expected: "≥ 0", filter: { tab: "goods", good: p.good } });
  for (const p of i.producers) {
    if (p.realized > p.capacity + TOL && p.capacity > 0) push({ severity: "broken", check: "production_above_capacity", message: "Výroba nad kapacitou", entity: { producer: p.id, city: p.city }, observed: { realized: p.realized, capacity: p.capacity }, expected: "realized ≤ capacity", filter: { tab: "producers", producer: p.id } });
    if (p.realized > TOL && p.inputs.length && p.inputs.some((x) => x.supplied != null && n(x.supplied) <= TOL))
      push({ severity: "broken", check: "output_without_input", message: "Výstup bez dodaného vstupu", entity: { producer: p.id, city: p.city }, observed: p.inputs, expected: "každý vstup > 0 při výrobě", filter: { tab: "producers", producer: p.id } });
    if (p.realized > TOL && p.capacity <= TOL) push({ severity: "broken", check: "output_without_capacity", message: "Výstup bez kapacity", entity: { producer: p.id }, observed: p.realized, expected: "capacity > 0", filter: { tab: "producers", producer: p.id } });
    if (!p.diagnostic_found) push({ severity: "info", check: "producer_without_diagnostic", message: "Producent bez diagnostiky resolveru", entity: { producer: p.id }, observed: null, expected: "diagnostika pro každého producenta", filter: { tab: "producers", producer: p.id } });
    for (const x of p.inputs) {
      if (x.expected_available === false && p.realized > TOL) push({ severity: "broken", check: "auto_unavailable_input_produced", message: "Vyrobeno, ač plán označil vstup jako nedostupný", entity: { producer: p.id, good: x.good }, observed: p.realized, expected: "0 při nedostupném vstupu", filter: { tab: "producers", producer: p.id } });
      if (x.expected_available === true && x.expected_cost == null) push({ severity: "warning", check: "auto_infinite_cost", message: "Dostupný vstup s nekonečnou cenou", entity: { producer: p.id, good: x.good }, observed: x.expected_cost, expected: "konečná landed cena", filter: { tab: "producers", producer: p.id } });
    }
  }
  const flowKeys = new Set<string>();
  for (const f of i.flows) {
    const key = `${f.source}>${f.destination}::${f.good}::${f.reason}`;
    if (flowKeys.has(key)) push({ severity: "warning", check: "duplicate_flow_key", message: "Opakovaný tok se stejným klíčem", entity: { flow: String(f.index) }, observed: key, expected: "jeden tok na klíč nebo vysvětlení", filter: { tab: "flows", flow: f.index } });
    flowKeys.add(key);
    if (!i.cityIds.has(f.source) || !i.cityIds.has(f.destination)) push({ severity: "broken", check: "orphan_flow_endpoint", message: "Tok mimo města session", entity: { flow: String(f.index) }, observed: { source: f.source, destination: f.destination }, expected: "obě města v session", filter: { tab: "flows", flow: f.index } });
    if (f.delivered > f.qty + TOL || f.qty < -TOL) push({ severity: "broken", check: "flow_quantity", message: "Dodáno více než odesláno", entity: { flow: String(f.index) }, observed: { qty: f.qty, delivered: f.delivered }, expected: "0 ≤ delivered ≤ qty", filter: { tab: "flows", flow: f.index } });
    for (const e of f.edge_capacity) {
      if (e.capacity == null) push({ severity: "warning", check: "flow_unknown_edge", message: "Hrana toku chybí ve snapshotu", entity: { flow: String(f.index), edge: e.id }, observed: e.id, expected: "hrana ve snapshot.edges", filter: { tab: "flows", flow: f.index } });
      // Engine reserves qty×max(1,bulk) per edge, so raw qty above capacity is a definite violation.
      else if (e.used_total > e.capacity + TOL) push({ severity: "broken", check: "flow_beyond_capacity", message: "Tok přes kapacitu hrany", entity: { flow: String(f.index), edge: e.id }, observed: { used: e.used_total, capacity: e.capacity }, expected: "Σqty ≤ capacity", filter: { tab: "flows", flow: f.index } });
    }
    if (f.planned.length) for (const pl of f.planned) if (f.landed_unit_cost != null && Math.abs(pl.expected_cost - f.landed_unit_cost) > 0.05 * Math.max(1, f.landed_unit_cost))
      push({ severity: "warning", check: "planned_vs_actual_cost", message: "Plánovaná landed cena se liší od skutečné", entity: { flow: String(f.index), producer: pl.producer }, observed: { expected: pl.expected_cost, actual: f.landed_unit_cost }, expected: "|expected − actual| ≤ 5 %", filter: { tab: "flows", flow: f.index } });
    if (f.famous) { const [oc] = f.famous.split("::"); if (oc !== f.source) push({ severity: "broken", check: "famous_origin_mismatch", message: "Slavné zboží z jiného než původního města", entity: { flow: String(f.index) }, observed: { famous: f.famous, source: f.source }, expected: "famous origin = source", filter: { tab: "flows", flow: f.index } }); }
  }
  // Planned remote supplier with no realized delivery → surfaced (not hidden) as a sourcing gap.
  for (const p of i.producers) for (const x of p.inputs) if (x.expected_available && x.expected_source && x.expected_source !== 'local' && x.expected_source !== p.city && p.realized > TOL) {
    const got = i.flows.some((f) => f.source === x.expected_source && f.destination === p.city && f.good === x.good);
    if (!got) push({ severity: "warning", check: "planned_supplier_not_realized", message: "Plánovaný vzdálený dodavatel nedodal", entity: { producer: p.id, good: x.good, supplier: x.expected_source }, observed: { realized_flow: false }, expected: "tok dodavatel → město", filter: { tab: "chain", city: p.city, good: p.output_good } });
  }
  for (const d of i.demand) if (!d.channels || !Object.keys(d.channels).length) push({ severity: "warning", check: "demand_without_provenance", message: "Poptávka bez kanálu", entity: { city: d.city, good: d.good }, observed: d.total, expected: "≥1 kanál", filter: { tab: "demand", city: d.city, good: d.good } });
  for (const c of i.choice) if (n(c.fame) > 1 + TOL) {
    const origin = c.fame_origin;
    if (!origin) push({ severity: "broken", check: "fame_without_origin", message: "Fame modifikátor bez fame_origin", entity: { city: c.city, good: c.good }, observed: c.fame, expected: "fame_origin vyplněn", filter: { tab: "demand", city: c.city, good: c.good } });
    else if (!i.famousOrigins.has(k(origin, c.good))) push({ severity: "broken", check: "fame_origin_not_famous", message: "fame_origin není slavný původ", entity: { city: c.city, good: c.good, origin }, observed: origin, expected: "origin v ledger.famous", filter: { tab: "demand", city: c.city, good: c.good } });
  }
  return out;
}
