// Canonical per-city subsistence readout for the Economy tab and Economy Dev Mode.
// Food status uses the SAME helper and the SAME staple basket sums as process-turn
// (balances demand/unmet of staple_food goods), so UI can never disagree with the turn.
import { foodShortageImpact } from './foodShortage.ts';

export type FoodStatus = 'ok' | 'minor' | 'rationing' | 'famine';
export interface SubsistenceRow {
  city: string; population: number; food_demand: number; food_unmet: number; food_deficit_ratio: number;
  food_status: FoodStatus; critical_priority_employed: number | null; available_workforce: number | null;
  employed_total: number | null; jobs_capacity: number | null;
}
export function subsistenceRows(
  cities: { id: string; population: number }[],
  balances: { city: string; good: string; demand: number; unmet_demand: number }[],
  goods: { key: string; basket: string }[],
  labor: any[] = [],
): SubsistenceRow[] {
  const staple = new Set(goods.filter(g => g.basket === 'staple_food').map(g => g.key));
  return cities.map(c => {
    const bs = balances.filter(b => b.city === c.id && staple.has(b.good));
    const demand = bs.reduce((s, b) => s + Number(b.demand || 0), 0), unmet = bs.reduce((s, b) => s + Number(b.unmet_demand || 0), 0);
    const f = foodShortageImpact(c.population, demand, unmet);
    const l = labor.find((x: any) => x.city === c.id);
    return { city: c.id, population: c.population, food_demand: demand, food_unmet: unmet, food_deficit_ratio: f.ratio,
      food_status: f.famine ? 'famine' : f.minor ? 'rationing' : f.ratio > 0 ? 'minor' : 'ok',
      critical_priority_employed: l?.critical_priority_employed ?? null, available_workforce: l?.available_workforce ?? null,
      employed_total: l?.employed_total ?? null, jobs_capacity: l?.jobs_capacity ?? null };
  });
}
