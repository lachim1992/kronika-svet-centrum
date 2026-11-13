import { parcelTransport, siteSpecs, FREIGHT_RECIPES, type RuralContext } from './ruralSites.ts';
import type { Producer } from './goodsEconomy.ts';

/** Physical potential, not output. Only the goods solver can harvest it with staffed labour. */
export interface EconomicParcel {
  id: string; grid_x: number; grid_y: number; parcel_index: number; sub_biome: string;
  buildable: boolean; status: string; city_id: string | null; owner_player: string | null;
  land_use?: string | null; elevation?: number; capacity_slots: number;
}
export interface ParcelTerrain { grid_x?: number; grid_y?: number; q: number; r: number;
  biome_family?: string; has_river?: boolean; coastal?: boolean; is_passable?: boolean; forest_density?: number }
export interface ParcelEcology { [producer: string]: number }
export const PARCEL_ECONOMY_VERSION = 1;
const woodland = /forest|woods|canopy|thicket/;
const rocky = /rock|gravel|slope|shelf|ridge|hillock|terrace/;
const fertile = /fertile|grass|clearing|sheltered|raised_bank|creek_bank|shore|harbour/;
const dead = /water|channel|dune|sand|frozen|permafrost/;
/** No sea-as-drinking-water; diagonal access requires a passable cardinal path. */
export function parcelPotential(p: EconomicParcel, terrain: ParcelTerrain[], turn = 1) {
  const home = terrain.find(h => (h.grid_x ?? h.q) === p.grid_x && (h.grid_y ?? h.r) === p.grid_y);
  if (!p.buildable || p.status === 'blocked' || dead.test(p.sub_biome) || !home || home.is_passable === false)
    return [] as { recipe: string; capacity: number; jobs: number; renewable: boolean }[];
  const natural = !p.land_use || ['open','wild','foraging','forestry','civic'].includes(p.land_use);
  if (!natural || p.land_use === 'civic') return [];
  const nearby = terrain.filter(h => Math.abs((h.grid_x ?? h.q) - p.grid_x) + Math.abs((h.grid_y ?? h.r) - p.grid_y) <= 1 && h.is_passable !== false);
  // A diagonal river requires a passable two-step foot access, not a diagonal teleport.
  const diagonal = terrain.filter(h => Math.abs((h.grid_x??h.q)-p.grid_x)===1 && Math.abs((h.grid_y??h.r)-p.grid_y)===1 && h.is_passable!==false && h.has_river
    && nearby.some(mid => ((mid.grid_x??mid.q)===(h.grid_x??h.q)&&(mid.grid_y??mid.r)===p.grid_y) || ((mid.grid_x??mid.q)===p.grid_x&&(mid.grid_y??mid.r)===(h.grid_y??h.r))));
  const river = [...nearby,...diagonal].some(h => h.has_river && !/^(sea|ocean|water)$/.test(h.biome_family || ''));
  const season = [1, 0.95, 0.8, 0.95][Math.floor(Math.max(0, turn - 1) / 5) % 4];
  const relief = Math.max(0.5, 1 - Math.max(0, Number(p.elevation || 0) - 70) / 100);
  const scale = Math.min(1.5, Math.max(0, p.capacity_slots) / 2) * relief;
  const out: { recipe: string; capacity: number; jobs: number; renewable: boolean }[] = [];
  const add = (recipe: string, cap: number, jobs: number, renewable = true) => out.push({ recipe, capacity: cap * scale, jobs, renewable });
  if (woodland.test(p.sub_biome)) add('fell_timber', 1.8, 4);
  else if (/grassland|fertile_flat/.test(p.sub_biome)) add('fell_timber', 0.45, 2); // hedgerow wood, not a forest-sized supply
  if (rocky.test(p.sub_biome)) add('quarry_stone', 1.2, 4, false);
  if (fertile.test(p.sub_biome)) add('gather_wild_seeds', 0.55 * season, 3);
  if (woodland.test(p.sub_biome) || fertile.test(p.sub_biome)) add('hunt_game', 0.25 * season, 2);
  if (/boggy|marsh|silt/.test(p.sub_biome)) add('cut_peat', 0.9, 3, false);
  if (river) add('draw_river_water', 0.75, 3);
  if (/shore|harbour|creek_bank/.test(p.sub_biome) && (home.coastal || river)) add('catch_fish', 1.5 * season, 4);
  return out;
}

/** Each parcel/resource has its own stable identity and finite ecological reservoir.
 * Reservoir is derived from the last COMMITTED ledger, never from a refresh projection.
 * Regrowth is 10% of annual capacity; mining/peat do not regrow. */
export function parcelProducers(parcels: EconomicParcel[], terrain: ParcelTerrain[],
  cities: { id: string; owner: string; cell: string }[], recipes: Map<string, any>, turn: number,
  prior: ParcelEcology = {}, rural: RuralContext = {}): Producer[] {
  const siteByParcel = new Map((rural.sites || []).map(s => [s.parcelId, s]));
  const out: Producer[] = [], seen = new Set<string>();
  for (const p of [...parcels].sort((a,b) => a.id.localeCompare(b.id))) {
    const city = cities.find(c => c.id === p.city_id && c.owner === p.owner_player);
    if (!city || !['claimed','occupied'].includes(p.status)) continue;
    // Local collection only: expanded cells must remain cardinally connected through this city's claims.
    const owned = new Set(parcels.filter(x => x.city_id === city.id && x.owner_player === city.owner && ['claimed','occupied'].includes(x.status)).map(x => `${x.grid_x},${x.grid_y}`));
    const reach = new Set([city.cell]), queue = [city.cell];
    for (const cell of queue) { const [x,y] = cell.split(',').map(Number);
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const next = `${x+dx},${y+dy}`;
        if (owned.has(next) && !reach.has(next)) { reach.add(next); queue.push(next); } }
    }
    if (!reach.has(`${p.grid_x},${p.grid_y}`)) continue;
    const site = siteByParcel.get(p.id);
    const { specs } = siteSpecs(parcelPotential(p, terrain, turn), site && site.owner === city.owner ? site : undefined, p.grid_x, p.grid_y, rural.deposits);
    const transport = rural.roads ? parcelTransport(`${p.grid_x},${p.grid_y}`, city.cell, rural.roads, city.owner) : { factor: 1, mode: 'local' as const };
    for (const raw of specs) {
      // Freight applies at the point of entry: only what can be hauled is harvested (no phantom stock).
      const factor = FREIGHT_RECIPES.has(raw.recipe) ? transport.factor : 1;
      const spec = { ...raw, capacity: raw.capacity * factor };
      if (spec.capacity <= 0) continue;
      const r = recipes.get(spec.recipe); if (!r) throw new Error(`Missing parcel recipe ${spec.recipe}`);
      const id = `parcel:${p.id}:${spec.recipe}`; if (seen.has(id)) continue; seen.add(id);
      const water = spec.recipe === 'draw_river_water';
      const initial = raw.capacity * (spec.renewable ? 5 : 40);
      // Coppiced woodland replenishes faster than wild food/game; finite pressure still caps extraction.
      const regrowth = spec.recipe === 'fell_timber' ? 0.35 : 0.1;
      const remaining = water ? spec.capacity : Math.min(initial, Math.max(0, prior[id] ?? initial) + (spec.renewable ? spec.capacity * regrowth : 0));
      out.push({ id, city: city.id, channel: 'facility', capacity: Math.min(spec.capacity, remaining), jobs: spec.jobs,
        recipe: { key: r.recipe_key, good: r.output_good_key, qty: Number(r.output_quantity), inputs: [], labor: Number(r.labor_cost), quality: 0, minQuality: 0 },
        allocation: 1, staffing: 1, logistics: 1, mastery: 1, source: true, distinctive: false,
        parcel: { id: p.id, grid_x: p.grid_x, grid_y: p.grid_y, index: p.parcel_index, sub_biome: p.sub_biome,
          potential: raw.capacity, reservoir: remaining, renewable: spec.renewable, water,
          transport: { ...transport, applied: factor }, site: raw.site || false } as any,
      });
    }
  }
  return out;
}

export function parcelClosing(producers: Producer[], diagnostics: { producer: string; realized: number }[]): ParcelEcology {
  return Object.fromEntries(producers.filter(p => p.parcel).map(p => [p.id,
    Math.max(0, Number(p.parcel?.reservoir || 0) - Number(diagnostics.find(d => d.producer === p.id)?.realized || 0))]));
}

/** Hand processing in the existing occupied civic seat. Paid in labour and physically
 * consumed BOM, never an extra raw-material→reserve credit. Dedicated industry scales better. */
export function parcelWorkshops(parcels: EconomicParcel[], cities: {id:string;owner:string}[], recipes:Map<string,any>): Producer[] {
  return cities.flatMap(c => {
    const seat=parcels.find(p=>p.city_id===c.id&&p.owner_player===c.owner&&p.status==='occupied'&&p.land_use==='civic');
    if(!seat) return [];
    return ['saw_timber','cut_stone','burn_charcoal'].map(key=>{
      const r=recipes.get(key); if(!r) throw new Error(`Missing processing recipe ${key}`);
      return {id:`parcel-workshop:${seat.id}:${key}`,city:c.id,channel:'facility' as const,capacity:key==='burn_charcoal'?1.5:0.6,jobs:3,
        recipe:{key,good:r.output_good_key,qty:Number(r.output_quantity),inputs:(r.input_items||[]).map((i:any)=>({good:i.key??i.good_key,qty:Number(i.qty)})),labor:Number(r.labor_cost),quality:0,minQuality:0},
        allocation:1,staffing:1,logistics:1,mastery:1,source:false,distinctive:false};
    });
  });
}