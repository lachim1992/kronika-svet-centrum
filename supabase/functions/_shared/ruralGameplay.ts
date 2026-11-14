import { ruralPopulationForWorld, RURAL_MOBILE_SHARE, type RuralCell, type RuralPopulationRow } from './ruralPopulation.ts';

export type RuralState = RuralPopulationRow & { last_resolved_turn: number };
export type ControlledCell = { q: number; r: number; grid_x?: number; grid_y?: number; owner_player?: string | null; province_id?: string | null; is_passable?: boolean };
export type RuralDestination = { id: string; owner: string; cell: string; province_id?: string | null; population: number; housing: number; stability: number; food: number; vacancies: number };
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

/** Cardinal connected, owned, passable province catchments. Each cell has exactly one destination.
 * Legacy capitals may have a stale/missing grid seat; in that case seed the BFS at the nearest
 * passable cell in the city's own province instead of silently dropping its entire hinterland. */
export function ruralCatchments(cells: ControlledCell[], cities: Pick<RuralDestination, 'id' | 'owner' | 'cell' | 'province_id'>[]) {
  const byCell = new Map(cells.filter(c => c.is_passable !== false).map(c => [key(c.grid_x ?? c.q, c.grid_y ?? c.r), c]));
  const best = new Map<string, { city: string; distance: number }>();
  const distance = (a: string, b: string) => {
    const [ax,ay] = a.split(',').map(Number), [bx,by] = b.split(',').map(Number);
    return Math.abs(ax-bx)+Math.abs(ay-by);
  };
  for (const city of [...cities].sort((a,b) => a.id.localeCompare(b.id))) {
    const exact = byCell.get(city.cell);
    const exactMatches = exact?.owner_player === city.owner && (!city.province_id || exact.province_id === city.province_id);
    const candidates = [...byCell.entries()]
      .filter(([,h]) => h.owner_player === city.owner && (!city.province_id || h.province_id === city.province_id))
      .sort((a,b) => distance(a[0],city.cell)-distance(b[0],city.cell) || a[0].localeCompare(b[0]));
    const homeCell = exactMatches ? city.cell : candidates[0]?.[0];
    if (!homeCell) continue;
    const home = byCell.get(homeCell)!;
    const provinceId = city.province_id ?? home.province_id ?? null;
    const queue = [{ cell: homeCell, distance: distance(homeCell,city.cell) }], seen = new Set([homeCell]);
    for (const at of queue) {
      const prev = best.get(at.cell);
      if (!prev || at.distance < prev.distance) best.set(at.cell, { city: city.id, distance: at.distance });
      const [x,y] = at.cell.split(',').map(Number);
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const next = key(x+dx,y+dy), h = byCell.get(next);
        if (!seen.has(next) && h?.owner_player === city.owner && (h.province_id ?? null) === provinceId) {
          seen.add(next); queue.push({ cell: next, distance: at.distance+1 });
        }
      }
    }
  }
  return new Map([...best].map(([cell, v]) => [cell, v.city]));
}

/** Aggregate catchment residents once per cell; no cell can feed two city markets. */
export function aggregateRuralPopulationByCity(catchments: Map<string,string>, populationByCell: Map<string,number>) {
  const totals = new Map<string,number>();
  for (const [cell,city] of catchments) {
    const residents = integer(populationByCell.get(cell) ?? 0);
    if (residents > 0) totals.set(city,(totals.get(city) ?? 0)+residents);
  }
  return totals;
}

export function ruralTurn(seed: string, cells: (RuralCell & ControlledCell)[], existing: RuralState[], cities: RuralDestination[], turn: number) {
  const baseline = new Map(existing.map(r => [key(r.q,r.r), r]));
  for (const row of ruralPopulationForWorld(seed,cells)) if (!baseline.has(key(row.q,row.r))) baseline.set(key(row.q,row.r), { ...row, last_resolved_turn: turn-1 });
  const attached = ruralCatchments(cells,cities), immigration: Record<string,number> = {}, flows: { q:number;r:number;city:string;people:number }[] = [];
  const room = new Map(cities.map(c => [c.id, c.stability >= 60 && c.food >= 0.9 ? Math.min(integer(c.housing-c.population),integer(c.vacancies)) : 0]));
  const updated = [...baseline.values()].sort((a,b) => a.q-b.q || a.r-b.r).map(before => {
    if (before.last_resolved_turn >= turn) return { ...before };
    const row = advanceRural(before,turn), terrain = cells.find(c=>c.q===row.q&&c.r===row.r);
    const city = attached.get(key(terrain?.grid_x??row.q,terrain?.grid_y??row.r));
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