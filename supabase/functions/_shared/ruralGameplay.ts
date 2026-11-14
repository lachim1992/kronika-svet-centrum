import { ruralPopulationForWorld, RURAL_MOBILE_SHARE, type RuralCell, type RuralPopulationRow } from './ruralPopulation.ts';

export type RuralState = RuralPopulationRow & { last_resolved_turn: number };
export type ControlledCell = { q: number; r: number; grid_x?: number; grid_y?: number; owner_player?: string | null; province_id?: string | null };
export type RuralDestination = { id: string; owner: string; cell: string; population: number; housing: number; stability: number; food: number; vacancies: number };
const key = (q: number, r: number) => `${q},${r}`;
const integer = (n: number) => Math.max(0, Math.floor(Number(n) || 0));
export const RURAL_WORKFORCE_SHARE = 0.5;

/** One logistic step, even for an old baseline; never catches up missed turns. */
export function advanceRural(row: RuralState, turn: number): RuralState {
  if (row.last_resolved_turn >= turn) return { ...row };
  const cap = integer(row.carrying_capacity), pop = integer(row.rural_population);
  const births = Math.floor(pop * 0.02);
  const deaths = Math.floor(pop * (0.01 + 0.01 * (cap > 0 ? pop / cap : 1)));
  const next = Math.min(cap, Math.max(0, pop + births - deaths));
  return { ...row, rural_population: next, mobile_population: Math.min(next, Math.floor(next * RURAL_MOBILE_SHARE)), last_resolved_turn: turn };
}

/** Cardinal connected, owned province catchments. Each cell has exactly one destination. */
export function ruralCatchments(cells: ControlledCell[], cities: Pick<RuralDestination, 'id' | 'owner' | 'cell'>[]) {
  const byCell = new Map(cells.map(c => [key(c.grid_x ?? c.q, c.grid_y ?? c.r), c]));
  const best = new Map<string, { city: string; distance: number }>();
  for (const city of [...cities].sort((a,b) => a.id.localeCompare(b.id))) {
    const home = byCell.get(city.cell);
    if (!home || home.owner_player !== city.owner || !home.province_id) continue;
    const queue = [{ cell: city.cell, distance: 0 }], seen = new Set([city.cell]);
    for (const at of queue) {
      const prev = best.get(at.cell);
      if (!prev || at.distance < prev.distance) best.set(at.cell, { city: city.id, distance: at.distance });
      const [x,y] = at.cell.split(',').map(Number);
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const next = key(x+dx,y+dy), h = byCell.get(next);
        if (!seen.has(next) && h?.owner_player === city.owner && h.province_id === home.province_id) {
          seen.add(next); queue.push({ cell: next, distance: at.distance+1 });
        }
      }
    }
  }
  return new Map([...best].map(([cell, v]) => [cell, v.city]));
}

export function ruralTurn(seed: string, cells: (RuralCell & ControlledCell)[], existing: RuralState[], cities: RuralDestination[], turn: number) {
  const baseline = new Map(existing.map(r => [key(r.q,r.r), r]));
  for (const row of ruralPopulationForWorld(seed,cells)) if (!baseline.has(key(row.q,row.r))) baseline.set(key(row.q,row.r), { ...row, last_resolved_turn: turn-1 });
  const attached = ruralCatchments(cells,cities), immigration: Record<string,number> = {}, flows: { q:number;r:number;city:string;people:number }[] = [];
  const room = new Map(cities.map(c => [c.id, c.stability >= 60 && c.food >= 0.9 ? Math.min(integer(c.housing-c.population),integer(c.vacancies)) : 0]));
  const updated = [...baseline.values()].sort((a,b) => a.q-b.q || a.r-b.r).map(before => {
    if (before.last_resolved_turn >= turn) return { ...before };
    const row = advanceRural(before,turn), city = attached.get(key(row.q,row.r));
    const people = city ? Math.min(row.mobile_population, Math.floor(row.rural_population*0.03),room.get(city) || 0) : 0;
    if (city && people > 0) {
      row.rural_population -= people; row.mobile_population = Math.min(row.rural_population, Math.max(0,row.mobile_population-people));
      room.set(city,(room.get(city) || 0)-people); immigration[city]=(immigration[city] || 0)+people;
      flows.push({ q:row.q,r:row.r,city,people });
    }
    return row;
  });
  return { rows:updated, immigration, flows };
}

/** A single shared local pool across all parcel jobs. Rural crews never enter urban factories. */
export function allocateRuralLabor(population: Map<string,number>, producers: { id:string; cell:string; jobs:number }[]) {
  const left = new Map([...population].map(([cell,pop]) => [cell,Math.floor(integer(pop)*RURAL_WORKFORCE_SHARE)]));
  const employed = new Map<string,number>();
  for (const p of [...producers].sort((a,b) => a.id.localeCompare(b.id))) {
    const take = Math.min(Math.max(0,p.jobs),left.get(p.cell) || 0);
    employed.set(p.id,take); left.set(p.cell,(left.get(p.cell) || 0)-take);
  }
  return employed;
}

/** All-or-nothing founding transfer planner; persistence must use an atomic transaction. */
export function foundingTransfer(rows: RuralState[], settlers = 100) {
  if (rows.reduce((s,r) => s+integer(r.rural_population),0) < settlers) throw new Error('Nedostatek místních osadníků');
  let left = settlers;
  return [...rows].sort((a,b) => a.q-b.q || a.r-b.r).map(r => {
    const take = Math.min(left,integer(r.rural_population)); left-=take;
    return { ...r, rural_population:r.rural_population-take, mobile_population:Math.min(r.mobile_population,r.rural_population-take) };
  });
}