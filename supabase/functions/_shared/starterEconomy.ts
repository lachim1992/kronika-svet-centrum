/**
 * STARTER SETTLEMENT ECONOMY
 *
 * Population is not a goods producer. A settlement therefore survives because it owns
 * real productive structures with jobs, capacity and explicit recipes — never because
 * inhabitants magically emit market goods.
 *
 * This helper is idempotent: it adds the missing part of the minimal bundle and nothing
 * else. It never mutates population, treasury, inventories or fiscal state, and it can be
 * run in dryRun mode to report exactly what it would add to legacy saves.
 */

type StarterContract = {
  name: string;
  category: string;
  description: string;
  recipeKeys: string[];
  roles: string[];
  tags: string[];
  basketOutputs: Record<string, number>;
  /** Jobs the structure offers at level 1; level scaling is ECONOMY.levelCapacityScale. */
  jobsCapacity: number;
};

export const STARTER_FARM: StarterContract = {
  name: 'Záhumenkové hospodářství', category: 'economic',
  description: 'Základní obživa osady: pole a pastvina s vlastní pracovní silou.',
  recipeKeys: ['harvest_wheat'], roles: ['source'], tags: ['farming', 'herding'],
  basketOutputs: { staple_food: 3 }, jobsCapacity: 80,
};
export const STARTER_FISHERY: StarterContract = {
  name: 'Osadní rybářství', category: 'economic',
  description: 'Základní obživa osady u vody: rybářské pruty, sítě a sušárna.',
  recipeKeys: ['catch_fish'], roles: ['source'], tags: ['fishing'],
  basketOutputs: { staple_food: 3 }, jobsCapacity: 60,
};
export const STARTER_WELL: StarterContract = {
  name: 'Osadní studna', category: 'infrastructure',
  description: 'Zdroj pitné vody pro obyvatele osady.',
  recipeKeys: ['draw_water'], roles: ['producer'], tags: ['farming'],
  basketOutputs: { drinking_water: 2 }, jobsCapacity: 10,
};
export const STARTER_STORAGE: StarterContract = {
  name: 'Osadní sklad', category: 'economic',
  description: 'Sýpka a sklad, kde osada uchová úrodu a zásoby.',
  recipeKeys: ['build_granary'], roles: ['producer'], tags: ['construction'],
  basketOutputs: { storage_logistics: 1 }, jobsCapacity: 15,
};

export const starterBundle = (nearWater: boolean): StarterContract[] =>
  [nearWater ? STARTER_FISHERY : STARTER_FARM, STARTER_WELL, STARTER_STORAGE];

const effectsOf = (c: StarterContract) => ({
  recipe_keys: c.recipeKeys, production_roles: c.roles, capability_tags: c.tags,
  basket_outputs: c.basketOutputs, jobs_capacity: c.jobsCapacity, starter_economy: true,
});

export type StarterReport = { city: string; city_name: string; added: string[]; existing: string[] };

/**
 * Ensures every listed city owns the minimal explicit production bundle.
 * Returns what was added (or, with dryRun, what would be added).
 */
export async function ensureStarterEconomy(
  sb: any,
  sessionId: string,
  options: { cityId?: string; turnNumber?: number; dryRun?: boolean } = {},
): Promise<StarterReport[]> {
  let cityQuery = sb.from('cities').select('id, name, grid_x, grid_y').eq('session_id', sessionId);
  if (options.cityId) cityQuery = cityQuery.eq('id', options.cityId);
  const [{ data: cities }, { data: buildings }, { data: hexes }] = await Promise.all([
    cityQuery,
    sb.from('city_buildings').select('id, city_id, name, effects').eq('session_id', sessionId),
    sb.from('province_hexes').select('q, r, has_river, biome_family').eq('session_id', sessionId),
  ]);
  const water = new Set((hexes || [])
    .filter((h: any) => h.has_river || /water|ocean|sea|lake|coast/i.test(h.biome_family || ''))
    .map((h: any) => `${h.q},${h.r}`));
  const near = (x: number, y: number) => {
    for (let dq = -1; dq <= 1; dq++) for (let dr = -1; dr <= 1; dr++) if (water.has(`${x + dq},${y + dr}`)) return true;
    return false;
  };
  const rows: any[] = [];
  const reports: StarterReport[] = [];
  for (const city of (cities || []).sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)))) {
    const own = (buildings || []).filter((b: any) => b.city_id === city.id);
    const bundle = starterBundle(near(Number(city.grid_x) || 0, Number(city.grid_y) || 0));
    const added: string[] = [], existing: string[] = [];
    for (const contract of bundle) {
      const has = own.some((b: any) => b.name === contract.name ||
        (b.effects?.recipe_keys || []).some((k: string) => contract.recipeKeys.includes(k)));
      if (has) { existing.push(contract.name); continue; }
      added.push(contract.name);
      rows.push({
        session_id: sessionId, city_id: city.id, name: contract.name, category: contract.category,
        description: contract.description, effects: effectsOf(contract), status: 'completed',
        current_level: 1, max_level: 3, build_duration: 1,
        build_started_turn: options.turnNumber ?? 1, completed_turn: options.turnNumber ?? 1,
      });
    }
    reports.push({ city: city.id, city_name: city.name, added, existing });
  }
  if (rows.length && !options.dryRun) await sb.from('city_buildings').insert(rows);
  return reports;
}
