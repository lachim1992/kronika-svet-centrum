/**
 * FUEL GUIDANCE — read-only interpretation of the canonical ledger (goodsEconomy diagnostics[].fuel,
 * balances, snapshot). Never writes, never creates stock, never recomputes production. Feeds:
 *  - Ekonomika (owner-scoped management report: report.fuel_guidance + alerts),
 *  - Economy Dev Mode (economy-dev-snapshot: fuel_guidance),
 *  - AI (chooseFuelBuild → normal BUILD_BUILDING command, validated by command-dispatch).
 */
export interface FuelRemedy {
  kind: 'build' | 'import';
  /** Canonical building template name (build) or supplier city id (import). */
  target: string;
  recipe?: string; good: string; feasible: boolean; reason: string;
}
export interface FuelWarning {
  city: string; owner: string; producers: string[]; coverage: number; lost_output: number;
  missing_goods: string[]; stocks: Record<string, number>;
  suppliers: { city: string; good: string; stored: number; same_owner: boolean }[];
  chain: string[]; remedies: FuelRemedy[];
}
const MIN = 0.01;
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

export const FUEL_CHAIN = {
  peat: { building: 'Rašeliniště', recipe: 'cut_peat', chain: 'Rašeliniště / cut_peat → peat' },
  charcoal: { building: 'Uhlířství', recipe: 'burn_charcoal', input: 'raw_timber',
    chain: 'Dřevorubecký tábor / fell_timber → raw_timber → Uhlířství / burn_charcoal → charcoal' },
} as const;

export function fuelGuidance(snapshot: any, ledger: any): FuelWarning[] {
  const cities = new Map<string, any>((snapshot?.cities || []).map((c: any) => [c.id, c]));
  const producers = new Map<string, any>((snapshot?.producers || []).map((p: any) => [p.id, p]));
  const stored = (city: string, good: string) =>
    n((ledger?.balances || []).find((b: any) => b.city === city && b.good === good)?.stored);
  const produced = (city: string, good: string) => (ledger?.diagnostics || []).some((d: any) =>
    d.good === good && n(d.realized) > MIN && producers.get(d.producer)?.city === city);
  const byCity = new Map<string, { ids: string[]; batch: number; unfueled: number; lost: number; goods: Set<string> }>();
  for (const d of ledger?.diagnostics || []) {
    const f = d?.fuel, p = producers.get(d.producer);
    if (!f || !p || n(f.coverage) >= 1 - 1e-9) continue;
    const e = byCity.get(p.city) || { ids: [], batch: 0, unfueled: 0, lost: 0, goods: new Set<string>() };
    e.ids.push(d.producer); e.batch += n(f.batch); e.unfueled += n(f.unfueled); e.lost += n(f.lost_output);
    for (const i of p.recipe?.inputs || []) if (i.kind === 'operating' && i.fallback != null) e.goods.add(i.good);
    byCity.set(p.city, e);
  }
  const out: FuelWarning[] = [];
  for (const [cityId, e] of [...byCity].sort((a, b) => a[0].localeCompare(b[0]))) {
    const c = cities.get(cityId); if (!c) continue;
    const goods = [...e.goods].sort();
    const stocks: Record<string, number> = {};
    for (const g of [...goods, 'raw_timber']) stocks[g] = stored(cityId, g);
    const suppliers = [...cities.values()].filter(s => s.id !== cityId).flatMap(s => goods
      .map(g => ({ city: s.id, good: g, stored: stored(s.id, g), same_owner: s.owner === c.owner })))
      .filter(s => s.stored > MIN).sort((a, b) => Number(b.same_owner) - Number(a.same_owner) || b.stored - a.stored || a.city.localeCompare(b.city));
    const timber = stocks.raw_timber > MIN || produced(cityId, 'raw_timber');
    const remedies: FuelRemedy[] = [];
    if (goods.includes('peat')) remedies.push({ kind: 'build', target: FUEL_CHAIN.peat.building, recipe: FUEL_CHAIN.peat.recipe, good: 'peat', feasible: true,
      reason: 'Zdrojová stavba bez vstupů; rašelina se těží přímo.' });
    if (goods.includes('charcoal')) remedies.push({ kind: 'build', target: FUEL_CHAIN.charcoal.building, recipe: FUEL_CHAIN.charcoal.recipe, good: 'charcoal', feasible: timber,
      reason: timber ? 'Město má vlastní dřevo (zásoba nebo těžba).' : 'Chybí dřevo: nejdřív Dřevorubecký tábor, jinak uhlířství nemá co pálit.' });
    for (const s of suppliers.slice(0, 3)) remedies.push({ kind: 'import', target: s.city, good: s.good, feasible: true,
      reason: `${cities.get(s.city)?.name || s.city} má ${s.stored.toFixed(1)} ks, ale palivo nedorazilo — chybí použitelná trasa nebo obchod${s.same_owner ? '' : ' (cizí říše)'}.` });
    out.push({ city: cityId, owner: c.owner, producers: e.ids.sort(), coverage: e.batch > 0 ? (e.batch - e.unfueled) / e.batch : 1,
      lost_output: e.lost, missing_goods: goods, stocks, suppliers: suppliers.slice(0, 5),
      chain: goods.map(g => (FUEL_CHAIN as any)[g]?.chain).filter(Boolean), remedies });
  }
  return out;
}

/** Deterministic AI pick: charcoal where own timber exists, else peat; only templates that exist. */
export function chooseFuelBuild(warnings: FuelWarning[], owner: string, templates: Set<string>, cityName: (id: string) => string | undefined) {
  for (const w of warnings.filter(w => w.owner === owner).sort((a, b) => b.lost_output - a.lost_output || a.city.localeCompare(b.city))) {
    const builds = w.remedies.filter(r => r.kind === 'build' && r.feasible && templates.has(r.target.toLowerCase()));
    const pick = builds.find(r => r.good === 'charcoal') || builds.find(r => r.good === 'peat');
    const name = cityName(w.city);
    if (pick && name) return { city: w.city, cityName: name, buildingName: pick.target, good: pick.good };
  }
  return null;
}
