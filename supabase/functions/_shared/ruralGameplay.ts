import { ruralPopulationForWorld, RURAL_MOBILE_SHARE, type RuralCell, type RuralPopulationRow } from './ruralPopulation.ts';

export type RuralState = RuralPopulationRow & { last_resolved_turn: number };
export type ControlledCell = { q: number; r: number; grid_x?: number; grid_y?: number; owner_player?: string | null; province_id?: string | null; is_passable?: boolean; movement_cost?: number; access_score?: number | null };
export type RuralDestination = { id: string; owner: string; cell: string; province_id?: string | null; population: number; housing: number; stability: number; food: number; water?: number; vacancies: number };
export type RuralRoad = { from_x: number; from_y: number; to_x: number; to_y: number; owner_player?: string | null; status?: string };
const key = (q: number, r: number) => `${q},${r}`;
const integer = (n: number) => Math.max(0, Math.floor(Number(n) || 0));
export const RURAL_WORKFORCE_SHARE = 0.5;

export interface RuralConditions { food?: number; water?: number }
const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));

/** One logistic step, even for an old baseline; never catches up missed turns.
 * Food and water satisfaction from the attached city market affect births and deaths.
 * Missing market observations are neutral, not a synthetic famine. */
export function advanceRural(row: RuralState, turn: number, conditions: RuralConditions = {}): RuralState {
  if (row.last_resolved_turn >= turn) return { ...row };
  const cap = integer(row.carrying_capacity), pop = integer(row.rural_population);
  const food = clamp01(conditions.food ?? 1), water = clamp01(conditions.water ?? 1);
  const birthsRate = 0.02 * (0.4 + 0.6 * food) * (0.75 + 0.25 * water);
  const scarcityDeaths = (1 - food) * 0.015 + (1 - water) * 0.01;
  const births = Math.floor(pop * birthsRate);
  const deaths = Math.floor(pop * (0.01 + 0.01 * (cap > 0 ? pop / cap : 1) + scarcityDeaths));
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

function roadDistancesFrom(city: RuralDestination, roads: RuralRoad[]) {
  const graph = new Map<string, string[]>();
  for (const road of roads) {
    if (road.status && road.status !== 'completed') continue;
    if (road.owner_player && road.owner_player !== city.owner) continue;
    const a = key(road.from_x, road.from_y), b = key(road.to_x, road.to_y);
    if (!graph.has(a)) graph.set(a, []);
    if (!graph.has(b)) graph.set(b, []);
    graph.get(a)!.push(b); graph.get(b)!.push(a);
  }
  const distance = new Map<string, number>([[city.cell, 0]]), queue = [city.cell];
  for (let i=0;i<queue.length;i++) {
    const at=queue[i], nextDistance=(distance.get(at)||0)+1;
    for (const next of (graph.get(at)||[]).sort()) if (!distance.has(next)) {
      distance.set(next,nextDistance); queue.push(next);
    }
  }
  return distance;
}

/** One deterministic world step. Rural growth responds to catchment food/water coverage;
 * migration is capped at 3% per source cell and reduced by poor transport access. */
export function ruralTurn(seed: string, cells: (RuralCell & ControlledCell)[], existing: RuralState[],
  cities: RuralDestination[], turn: number, roads: RuralRoad[] = []) {
  const baseline = new Map(existing.map(r => [key(r.q,r.r), r]));
  for (const row of ruralPopulationForWorld(seed,cells)) if (!baseline.has(key(row.q,row.r))) baseline.set(key(row.q,row.r), { ...row, last_resolved_turn: turn-1 });
  const attached = ruralCatchments(cells,cities), immigration: Record<string,number> = {}, flows: { q:number;r:number;city:string;people:number }[] = [];
  const cityById = new Map(cities.map(c=>[c.id,c]));
  const roadDistances = new Map(cities.map(c=>[c.id,roadDistancesFrom(c,roads)]));
  const cellByCoord = new Map(cells.map(c=>[key(c.q,c.r),c]));
  const room = new Map(cities.map(c => [c.id,
    c.stability >= 60 && c.food >= 0.9 && (c.water ?? 1) >= 0.85
      ? Math.min(integer(c.housing-c.population),integer(c.vacancies)) : 0]));
  const updated = [...baseline.values()].sort((a,b) => a.q-b.q || a.r-b.r).map(before => {
    if (before.last_resolved_turn >= turn) return { ...before };
    const terrain = cellByCoord.get(key(before.q,before.r));
    const x=terrain?.grid_x??before.q, y=terrain?.grid_y??before.r;
    const cityId = attached.get(key(x,y));
    const destination = cityId ? cityById.get(cityId) : undefined;
    const row = advanceRural(before,turn,{food:destination?.food ?? 1,water:destination?.water ?? 1});
    if (!cityId || !destination) return row;
    const [cityX,cityY]=destination.cell.split(',').map(Number);
    const directDistance=Math.abs(x-cityX)+Math.abs(y-cityY);
    const access=clamp01(terrain?.access_score ?? 1);
    const movementPenalty=1/Math.sqrt(Math.max(1,integer(terrain?.movement_cost ?? 1)));
    const routeMap=roadDistances.get(cityId);
    const roadConnected=routeMap?.has(key(x,y))===true;
    const transport=clamp01(access*movementPenalty*(roadConnected?1:0.65/(1+directDistance*0.03)));
    const vacancyPull=0.55+0.45*clamp01(destination.vacancies/Math.max(1,destination.population*0.1));
    const people=Math.min(row.mobile_population,Math.floor(row.rural_population*0.03*transport*vacancyPull),room.get(cityId)||0);
    if (people > 0) {
      row.rural_population -= people;
      row.mobile_population = Math.max(0,row.mobile_population-Math.min(row.mobile_population,people));
      room.set(cityId,(room.get(cityId)||0)-people); immigration[cityId]=(immigration[cityId]||0)+people;
      flows.push({q:row.q,r:row.r,city:cityId,people});
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
    const mobileTaken=Math.min(integer(r.mobile_population),take); return { ...r, rural_population:r.rural_population-take, mobile_population:Math.min(Math.max(0,r.rural_population-take),Math.max(0,integer(r.mobile_population)-mobileTaken)) };
  });
}