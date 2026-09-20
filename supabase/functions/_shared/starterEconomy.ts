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
  /**
   * Jobs the structure offers at level 1. Canonical calibration: a producing structure employs
   * ~100 people at level 1 and doubles per level (ECONOMY.levelCapacityScale), together with
   * its physical throughput.
   */
  jobsCapacity: number;
};

export const STARTER_FARM: StarterContract = {
  name: 'Záhumenkové hospodářství', category: 'economic',
  description: 'Základní obživa osady: pole a pastvina s vlastní pracovní silou.',
  recipeKeys: ['harvest_wheat'], roles: ['source'], tags: ['farming', 'herding'],
  basketOutputs: { staple_food: 3 }, jobsCapacity: 100,
};
export const STARTER_FISHERY: StarterContract = {
  name: 'Osadní rybářství', category: 'economic',
  description: 'Základní obživa osady u vody: rybářské pruty, sítě a sušárna.',
  recipeKeys: ['catch_fish'], roles: ['source'], tags: ['fishing'],
  basketOutputs: { staple_food: 3 }, jobsCapacity: 100,
};
export const STARTER_WELL: StarterContract = {
  name: 'Osadní studna', category: 'infrastructure',
  description: 'Zdroj pitné vody pro obyvatele osady.',
  recipeKeys: ['draw_water'], roles: ['producer'], tags: ['farming'],
  basketOutputs: { drinking_water: 2 }, jobsCapacity: 100,
};
export const STARTER_STORAGE: StarterContract = {
  name: 'Osadní sklad', category: 'economic',
  description: 'Sýpka a sklad, kde osada uchová úrodu a zásoby.',
  recipeKeys: ['build_granary'], roles: ['producer'], tags: ['construction'],
  basketOutputs: { storage_logistics: 1 }, jobsCapacity: 100,
};


export const starterBundle = (nearWater: boolean): StarterContract[] =>
  [nearWater ? STARTER_FISHERY : STARTER_FARM, STARTER_WELL, STARTER_STORAGE];

/**
 * A seeded settlement must actually be able to feed and water itself with the people it has.
 * Throughput therefore scales with population (one "unit" of the bundle per ~150 souls), while
 * the declared crew stays inside the settlement's own workforce — a hamlet of 100 cannot staff
 * a 100-job production centre, and an unstaffable structure produces nothing.
 */
export const starterUnitsFor = (population: number): number =>
  Math.max(1, Math.round((Number(population) || 0) / 150));

/** Crew a settlement of this size can really field for one starter structure. */
export const starterJobsFor = (population: number): number =>
  Math.max(10, Math.round((Number(population) || 0) * 0.12));

const scalesWithPopulation = (c: StarterContract) => c !== STARTER_STORAGE;

const effectsOf = (c: StarterContract, population: number) => {
  const units = scalesWithPopulation(c) ? starterUnitsFor(population) : 1;
  const outputs = Object.fromEntries(
    Object.entries(c.basketOutputs).map(([k, v]) => [k, v * units]),
  );
  return {
    recipe_keys: c.recipeKeys, production_roles: c.roles, capability_tags: c.tags,
    basket_outputs: outputs, jobs_capacity: starterJobsFor(population) * units,
    starter_economy: true,
  };
};


export type StarterReport = {
  city: string; city_name: string; added: string[]; existing: string[]; upgraded: string[]; level: number;
};

/**
 * Ensures every listed city owns the minimal explicit production bundle, sized to its
 * population. Returns what was added or upgraded (or, with dryRun, what would change).
 */
export async function ensureStarterEconomy(
  sb: any,
  sessionId: string,
  options: { cityId?: string; turnNumber?: number; dryRun?: boolean } = {},
): Promise<StarterReport[]> {
  let cityQuery = sb.from('cities')
    .select('id, name, grid_x, grid_y, population_total').eq('session_id', sessionId);
  if (options.cityId) cityQuery = cityQuery.eq('id', options.cityId);
  const [{ data: cities }, { data: buildings }, { data: hexes }] = await Promise.all([
    cityQuery,
    sb.from('city_buildings').select('id, city_id, name, effects, current_level').eq('session_id', sessionId),
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
  const upgrades: { id: string; level: number }[] = [];
  const reports: StarterReport[] = [];
  for (const city of (cities || []).sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)))) {
    const own = (buildings || []).filter((b: any) => b.city_id === city.id);
    const bundle = starterBundle(near(Number(city.grid_x) || 0, Number(city.grid_y) || 0));
    const level = starterLevelFor(Number(city.population_total) || 0);
    const added: string[] = [], existing: string[] = [], upgraded: string[] = [];
    for (const contract of bundle) {
      const target = scalesWithPopulation(contract) ? level : 1;
      const match = own.find((b: any) => b.name === contract.name ||
        (b.effects?.recipe_keys || []).some((k: string) => contract.recipeKeys.includes(k)));
      if (match) {
        existing.push(contract.name);
        // Only ever raise a starter structure — a player upgrade must never be reverted.
        if ((Number(match.current_level) || 1) < target) {
          upgrades.push({ id: match.id, level: target });
          upgraded.push(contract.name);
        }
        continue;
      }
      added.push(contract.name);
      rows.push({
        session_id: sessionId, city_id: city.id, name: contract.name, category: contract.category,
        description: contract.description, effects: effectsOf(contract), status: 'completed',
        current_level: target, max_level: 3, build_duration: 1,
        build_started_turn: options.turnNumber ?? 1, completed_turn: options.turnNumber ?? 1,
      });
    }
    reports.push({ city: city.id, city_name: city.name, added, existing, upgraded, level });
  }
  if (!options.dryRun) {
    if (rows.length) await sb.from('city_buildings').insert(rows);
    for (const u of upgrades) {
      await sb.from('city_buildings').update({ current_level: u.level }).eq('id', u.id);
    }
  }
  return reports;

}
