// Deterministic primary-investment remedy (no LLM). Late-game saves starve because cities grow
// while no new farms/wells are built (TEST01 t67, TEST02 t27: thousands idle, `source_empty`).
// This picks ONE real, validated building (cost + jobs paid by command-dispatch) for the owner's
// worst-covered critical need — only where idle workers exist to staff it. Never adds output itself.
import { subsistenceRows } from './subsistence.ts';

export interface SubsistenceBuildPick { city: string; cityName: string; buildingName: string; basket: 'staple_food' | 'drinking_water' | 'fuel'; coverage: number }
const coverageOf = (balances: any[], keys: Set<string>, city: string) => {
  const bs = balances.filter(b => b.city === city && keys.has(b.good));
  const d = bs.reduce((s, b) => s + Number(b.demand || 0), 0), u = bs.reduce((s, b) => s + Number(b.unmet_demand || 0), 0);
  return d > 0 ? 1 - u / d : 1;
};
export const SUBSISTENCE_BUILD = { threshold: 0.9, fuelThreshold: 0.6, minIdleWorkers: 25 } as const;

export function chooseSubsistenceBuild(ledger: any, owner: string, templates: Set<string>,
  cityName: (id: string) => string | undefined): SubsistenceBuildPick | null {
  const cities = (ledger?.snapshot?.cities || []).filter((c: any) => c.owner === owner);
  const goods = ledger?.snapshot?.goods || [], balances = ledger?.balances || [], labor = ledger?.labor || [];
  const keys = (b: string) => new Set<string>(goods.filter((g: any) => g.basket === b).map((g: any) => g.key));
  const has = (n: string) => templates.has(n.toLowerCase());
  const rows = subsistenceRows(cities.map((c: any) => ({ id: c.id, population: Number(c.population) || 0 })), balances, goods, labor);
  const cands: SubsistenceBuildPick[] = [];
  for (const c of cities) {
    const l = labor.find((x: any) => x.city === c.id), r = rows.find(x => x.city === c.id);
    const idle = l ? Number(l.available_workforce) - Number(l.employed_total) : 0;
    const name = cityName(c.id);
    if (!name || idle < SUBSISTENCE_BUILD.minIdleWorkers) continue; // no one to staff it — building would not help
    const water = coverageOf(balances, keys('drinking_water'), c.id), food = r ? 1 - r.food_deficit_ratio : 1;
    const fuel = coverageOf(balances, keys('fuel'), c.id);
    if (water < SUBSISTENCE_BUILD.threshold && has('Studna')) cands.push({ city: c.id, cityName: name, buildingName: 'Studna', basket: 'drinking_water', coverage: water });
    if (food < SUBSISTENCE_BUILD.threshold) {
      const b = c.coastal && has('Rybářství') ? 'Rybářství' : has('Farma') ? 'Farma' : null;
      if (b) cands.push({ city: c.id, cityName: name, buildingName: b, basket: 'staple_food', coverage: food });
    }
    if (fuel < SUBSISTENCE_BUILD.fuelThreshold && has('Rašeliniště')) cands.push({ city: c.id, cityName: name, buildingName: 'Rašeliniště', basket: 'fuel', coverage: fuel + 0.2 });
  }
  cands.sort((a, b) => a.coverage - b.coverage || a.city.localeCompare(b.city));
  return cands[0] || null;
}
