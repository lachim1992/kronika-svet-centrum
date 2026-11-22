// Regional settlement economy — STAGE 1, read-only DERIVED PROJECTION.
//
// A "regional settlement" here is NOT a persisted entity. It is a deterministic projection of
// one macro cell's rural pool (hex_population, already folded in by economyAdapter as
// producer.ruralLabor) plus the rural-labour producers (worked-parcel sites) that the canonical
// goodsEconomy solver staffed from that pool in the committed turn.
//
// PROVENANCE (all from the owner-scoped management report, i.e. the committed ledger):
//   rural_population / workforce / employed  ← producer diagnostics (rural_population,
//       rural_workforce, rural_workforce_employed) — the solver's own cell-pool allocation.
//       Counted ONCE per cell; the city's urban labour pool never includes these people.
//   gross output / revenue / value added / operating surplus ← diagnostics.realized + margin.
//   local demand ← city balances.demand × (cell rural pop / city market population). The adapter
//       folds rural households into the city basket, so this is an ATTRIBUTED share, not a
//       second demand line.
//   tax base ← value added; NOT collected tax. No rural tax pillar exists in the fiscal path.
//   logistics ← diagnostics.factors.logistics / blocked; missing data = 'unknown', never 100 %.
//
// Building reserve report: physical construction goods in balances.stored × the solver's own
// construction_efficiency. production_reserve (already-converted points) is reported separately
// and NEVER summed with the physical stock's point equivalent.
// Nothing here writes, mints gold or adds reserve income.

export type Availability = 'connected' | 'partial' | 'blocked' | 'unknown';
export interface SettlementProducer { producer: string; recipe: string | null; good: string; capacity: number; realized: number; blocked: string | null; transport_mode: string | null; freight_factor: number | null; base_freight_factor: number | null; village_level: number | null }
export interface RegionalSettlement {
  id: string; kind: 'projection' | 'village'; village: { id: string; name: string; level: number; founded_turn: number; parcel_id: string } | null; cell: string; city: string; cities: string[]; province_id: string | null;
  rural_population: number | null; workforce: number | null; employed: number; unemployed: number | null;
  jobs: number; producers: SettlementProducer[];
  gross_output_units: number; revenue: number | null; value_added: number | null; operating_surplus: number | null;
  attributed_demand_units: number | null; demand_attribution: 'population_share_of_city_basket'; tax_base: number | null; tax_collected: null;
  logistics: Availability; reasons: string[];
  /** Committed-turn output attributable to the village's footpath bonus (0 when none applied). */
  village_freight_gain_units: number;
}
const num = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const has = (v: unknown) => v != null && Number.isFinite(Number(v));

/** realized × (applied − base) / applied, only where the village bonus actually applied to a freight recipe. */
export function villageGain(ps: any[]): number {
  return ps.reduce((s, p) => { const t = p?.parcel?.transport; const a = num(t?.applied), b = num(t?.base_factor);
    return has(t?.village_level) && a > b && a > 0 ? s + num(p.realized) * (a - b) / a : s; }, 0);
}
export function regionalSettlements(report: { producers?: any[]; labor?: any[]; cities?: any[] }, cityMeta: { id: string; province_id?: string | null }[] = []): RegionalSettlement[] {
  const byCell = new Map<string, any[]>();
  for (const p of report.producers || []) {
    if (p?.labor_origin !== 'rural' || !p.parcel) continue;
    const cell = `${p.parcel.grid_x},${p.parcel.grid_y}`;
    byCell.set(cell, [...(byCell.get(cell) || []), p]);
  }
  const demandOf = (city: string) => (report.cities || []).find((c: any) => c.id === city || c.city === city)?.balances
    ?.reduce((s: number, b: any) => s + num(b.demand), 0) ?? null;
  const laborOf = (city: string) => (report.labor || []).find((l: any) => l.city === city);
  return [...byCell.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cell, ps]) => {
    const jobsBy = new Map<string, number>();
    for (const p of ps) jobsBy.set(p.city, (jobsBy.get(p.city) || 0) + num(p.jobs_capacity));
    const city = [...jobsBy.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    const popRow = ps.find(p => has(p.rural_population));
    const pop = popRow ? num(popRow.rural_population) : null, workforce = popRow && has(popRow.rural_workforce) ? num(popRow.rural_workforce) : null;
    const employed = ps.reduce((s, p) => s + num(p.rural_workforce_employed), 0), jobs = ps.reduce((s, p) => s + num(p.jobs_capacity), 0);
    const margins = ps.map(p => p.margin).filter(Boolean);
    const sumM = (k: string) => margins.length === ps.length ? margins.reduce((s, m) => s + num(m[k]), 0) : null;
    const value_added = sumM('value_added');
    const l = laborOf(city), cityDemand = demandOf(city), marketPop = num(l?.population);
    const attributed = pop != null && cityDemand != null && marketPop > 0 ? cityDemand * Math.min(1, pop / marketPop) : null;
    const logs = ps.map(p => p.blocked === 'missing_local_delivery_route' ? 0 : has(p.factors?.logistics) ? num(p.factors.logistics) : null);
    const logistics: Availability = logs.some(x => x == null) ? 'unknown' : logs.every(x => x! <= 0) ? 'blocked' : logs.every(x => x! >= 0.999) ? 'connected' : 'partial';
    const realized = ps.reduce((s, p) => s + num(p.realized), 0), capacity = ps.reduce((s, p) => s + num(p.capacity), 0);
    const reasons: string[] = [];
    if (workforce != null && employed >= workforce - 1e-9 && jobs > employed) reasons.push(`Chybí lidé: ${Math.round(jobs - employed)} míst neobsazeno, venkovská pracovní síla je vyčerpána.`);
    if (workforce != null && employed < workforce && jobs <= employed + 1e-9) reasons.push(`Chybí pracovní místa: ${Math.round(workforce - employed)} venkovanů bez práce — postavte další venkovské místo na obdělávané parcele.`);
    for (const b of [...new Set(ps.map(p => p.blocked).filter(Boolean))]) reasons.push(`Výroba blokována: ${b}.`);
    if (capacity > 0 && realized < capacity * 0.999 && !ps.some(p => p.blocked)) reasons.push(`Využito ${Math.round(realized / capacity * 100)} % kapacity (omezení vstupy, prací nebo dopravou).`);
    if (logistics === 'unknown') reasons.push('Dopravní dostupnost nelze z dat tahu odvodit.');
    reasons.push('Daň z osady se zatím nevybírá: fiskální cesta nemá venkovský daňový pilíř; zobrazená základna je jen přidaná hodnota.');
    return { id: `projection:${cell}`, kind: 'projection', village: null, cell, city, cities: [...jobsBy.keys()].sort(),
      province_id: cityMeta.find(c => c.id === city)?.province_id ?? null,
      rural_population: pop, workforce, employed, unemployed: workforce == null ? null : Math.max(0, workforce - employed), jobs,
      producers: ps.map(p => { const t = p.parcel?.transport; return { producer: p.producer, recipe: p.recipe?.key ?? null, good: p.good, capacity: num(p.capacity), realized: num(p.realized), blocked: p.blocked ?? null,
        transport_mode: t?.mode ?? null, freight_factor: has(t?.applied) ? num(t.applied) : null, base_freight_factor: has(t?.base_factor) && has(t?.village_level) && num(t?.applied) > 0 ? num(t.base_factor) : null, village_level: has(t?.village_level) ? num(t.village_level) : null }; }),
      village_freight_gain_units: villageGain(ps),
      gross_output_units: realized, revenue: sumM('revenue'), value_added, operating_surplus: sumM('operating_surplus'),
      attributed_demand_units: attributed, demand_attribution: 'population_share_of_city_basket', tax_base: value_added, tax_collected: null, logistics, reasons };
  });
}

export const CONSTRUCTION_GOODS = ['raw_timber', 'raw_stone', 'lumber', 'stone_blocks', 'construction_materials'] as const;
export interface ReserveLine { city: string; good: string; stored: number; efficiency: number | null; point_equivalent: number | null; availability: Availability }
export interface BuildingReserveReport { lines: ReserveLine[]; physical_units: Record<string, number>; convertible_points: number | null; converted_reserve: number | null; note: string }

/** Derived only. Same-city stock is available to that city's builds; cross-city transfer is 'unknown'. */
export function buildingReserveReport(balances: any[], convertedReserve: number | null): BuildingReserveReport {
  const lines: ReserveLine[] = balances.filter(b => (CONSTRUCTION_GOODS as readonly string[]).includes(b.good) && num(b.stored) > 0)
    .map(b => { const eff = has(b.construction_efficiency) ? num(b.construction_efficiency) : null;
      return { city: b.city, good: b.good, stored: num(b.stored), efficiency: eff, point_equivalent: eff == null ? null : num(b.stored) * eff, availability: 'unknown' as Availability }; })
    .sort((a, b) => a.city.localeCompare(b.city) || a.good.localeCompare(b.good));
  const physical_units: Record<string, number> = {};
  for (const l of lines) physical_units[l.good] = (physical_units[l.good] || 0) + l.stored;
  const convertible_points = lines.some(l => l.point_equivalent == null) ? null : lines.reduce((s, l) => s + l.point_equivalent!, 0);
  return { lines, physical_units, convertible_points, converted_reserve: convertedReserve,
    note: 'Bodový ekvivalent je jen alternativní vyjádření fyzické zásoby, ne další příjem; převedená rezerva je samostatná a nesčítá se. Konkrétní stavby dál vyžadují konkrétní suroviny.' };
}

/**
 * Stage 2: overlay persisted villages (rural_settlements) on the committed-turn projection.
 * Joined by macro cell — the same key the solver uses for the shared rural pool — so a village
 * never adds people or a second staffing pass. A village with no rural site yet is listed with
 * zero output and an explicit reason, never with invented numbers.
 */
export function withPersistedVillages(rows: RegionalSettlement[], villages: { id: string; city_id: string; parcel_id: string; grid_x: number; grid_y: number; name: string; level: number; founded_turn: number }[]): RegionalSettlement[] {
  const byCell = new Map(villages.map(v => [`${v.grid_x},${v.grid_y}`, v]));
  const out = rows.map(r => { const v = byCell.get(r.cell); if (!v) return r; byCell.delete(r.cell);
    return { ...r, id: `village:${v.id}`, kind: 'village' as const, village: { id: v.id, name: v.name, level: v.level, founded_turn: v.founded_turn, parcel_id: v.parcel_id } }; });
  for (const [cell, v] of byCell) out.push({ id: `village:${v.id}`, kind: 'village', village: { id: v.id, name: v.name, level: v.level, founded_turn: v.founded_turn, parcel_id: v.parcel_id },
    cell, city: v.city_id, cities: [v.city_id], province_id: null, village_freight_gain_units: 0, rural_population: null, workforce: null, employed: 0, unemployed: null, jobs: 0, producers: [],
    gross_output_units: 0, revenue: null, value_added: null, operating_surplus: null, attributed_demand_units: null, demand_attribution: 'population_share_of_city_basket',
    tax_base: null, tax_collected: null, logistics: 'unknown',
    reasons: ['Vesnice zatím nemá venkovské výrobní místo v uzavřeném tahu — postavte ho na obdělávané parcele v tomto poli. Místo bez cesty a dál než sousední pole od města nic neodveze (doprava 0 %) a vesnice to nezmění.', 'Daň z osady se zatím nevybírá.'] });
  return out.sort((a, b) => a.cell.localeCompare(b.cell));
}
