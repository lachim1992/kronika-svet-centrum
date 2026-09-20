/**
 * Canonical mirror of the physical production chain (goods -> recipes -> producing structures).
 *
 * The database stays the source of truth for balancing numbers. This module is the
 * explicit CONTRACT used by the economy adapter and by the automated audits:
 *   - which structure may run which recipe (no name-regex magic),
 *   - which goods are household/final-use versus industrial intermediates,
 *   - that every catalog good has at least one reachable production path.
 *
 * Any migration that changes goods, recipes or building production metadata must keep
 * this file in sync; `auditProductionCatalog()` is executed by the test-suite.
 */

export type ProductionRole = 'source' | 'processing' | 'urban' | 'guild' | 'producer';

export interface CatalogRecipe {
  key: string;
  role: ProductionRole;
  tags: string[];
  inputs: { good: string; qty: number }[];
  output: string;
  qty: number;
}

export interface CatalogGood {
  key: string;
  basket: string;
  stage: 'raw' | 'processed' | 'final' | 'luxury';
  /** May satisfy household/state demand directly. Industrial intermediates must be false. */
  finalUse: boolean;
  /** Household subsistence baseline good for its basket. */
  household: boolean;
}

export interface BuildingContract {
  name: string;
  category: 'economic' | 'infrastructure';
  roles: ProductionRole[];
  tags: string[];
  /** Cumulative recipe unlocks per level: levels[0] = level 1, levels[1] = adds at level 2, ... */
  levels: string[][];
  /** Coastal or river cell required (deterministic geography prerequisite). */
  requiresWater?: boolean;
}

// ───────────────────────────── goods ─────────────────────────────
// finalUse=false marks true industrial intermediates: they are traded as production
// inputs, never as household consumption.
export const GOODS: CatalogGood[] = [
  { key: 'raw_grain', basket: 'staple_food', stage: 'raw', finalUse: true, household: true },
  { key: 'raw_fish', basket: 'staple_food', stage: 'raw', finalUse: true, household: false },
  { key: 'raw_meat', basket: 'staple_food', stage: 'raw', finalUse: true, household: false },
  { key: 'raw_olives', basket: 'staple_food', stage: 'raw', finalUse: false, household: false },
  { key: 'raw_grapes', basket: 'variety', stage: 'raw', finalUse: false, household: false },
  { key: 'raw_fiber', basket: 'basic_clothing', stage: 'raw', finalUse: false, household: false },
  { key: 'raw_hide', basket: 'basic_clothing', stage: 'raw', finalUse: false, household: false },
  { key: 'raw_ore', basket: 'metalwork', stage: 'raw', finalUse: false, household: false },
  { key: 'raw_stone', basket: 'construction', stage: 'raw', finalUse: false, household: false },
  { key: 'raw_timber', basket: 'construction', stage: 'raw', finalUse: false, household: false },
  { key: 'raw_incense', basket: 'admin_supplies', stage: 'raw', finalUse: false, household: false },
  { key: 'peat', basket: 'fuel', stage: 'raw', finalUse: true, household: true },
  { key: 'well_water', basket: 'drinking_water', stage: 'raw', finalUse: true, household: true },
  { key: 'charcoal', basket: 'fuel', stage: 'processed', finalUse: true, household: false },
  { key: 'flour', basket: 'staple_food', stage: 'processed', finalUse: false, household: false },
  { key: 'yarn', basket: 'basic_clothing', stage: 'processed', finalUse: false, household: false },
  { key: 'leather', basket: 'basic_clothing', stage: 'processed', finalUse: false, household: false },
  { key: 'iron_ingot', basket: 'tools', stage: 'processed', finalUse: false, household: false },
  { key: 'copper_ingot', basket: 'tools', stage: 'processed', finalUse: false, household: false },
  { key: 'lumber', basket: 'construction', stage: 'processed', finalUse: true, household: false },
  { key: 'stone_blocks', basket: 'construction', stage: 'processed', finalUse: true, household: false },
  { key: 'olive_oil', basket: 'variety', stage: 'processed', finalUse: true, household: false },
  { key: 'granary_storage', basket: 'storage_logistics', stage: 'processed', finalUse: true, household: false },
  { key: 'scribed_documents', basket: 'admin_supplies', stage: 'processed', finalUse: true, household: false },
  { key: 'baked_staples', basket: 'staple_food', stage: 'final', finalUse: true, household: false },
  { key: 'baked_refined', basket: 'feast', stage: 'final', finalUse: true, household: false },
  { key: 'preserved_food', basket: 'staple_food', stage: 'final', finalUse: true, household: false },
  { key: 'textile_basic', basket: 'basic_clothing', stage: 'final', finalUse: true, household: true },
  { key: 'textile_fine', basket: 'luxury_clothing', stage: 'final', finalUse: true, household: false },
  { key: 'metalwork_tools', basket: 'tools', stage: 'final', finalUse: true, household: true },
  { key: 'construction_materials', basket: 'construction', stage: 'final', finalUse: true, household: false },
  { key: 'pottery', basket: 'variety', stage: 'final', finalUse: true, household: false },
  { key: 'arms_basic', basket: 'military_supply', stage: 'final', finalUse: true, household: false },
  { key: 'wine_standard', basket: 'feast', stage: 'final', finalUse: true, household: false },
  { key: 'feast_goods', basket: 'feast', stage: 'luxury', finalUse: true, household: false },
  { key: 'wine_luxury', basket: 'feast', stage: 'luxury', finalUse: true, household: false },
  { key: 'fine_arms', basket: 'military_supply', stage: 'luxury', finalUse: true, household: false },
  { key: 'jewelry', basket: 'luxury_clothing', stage: 'luxury', finalUse: true, household: false },
  { key: 'ritual_goods', basket: 'admin_supplies', stage: 'luxury', finalUse: true, household: false },
];

// ───────────────────────────── recipes ─────────────────────────────
const r = (
  key: string, role: ProductionRole, tags: string[], output: string, qty: number,
  inputs: [string, number][] = [],
): CatalogRecipe => ({ key, role, tags, output, qty, inputs: inputs.map(([good, q]) => ({ good, qty: q })) });

export const RECIPES: CatalogRecipe[] = [
  // source (root extraction — zero inputs)
  r('harvest_wheat', 'source', ['farming'], 'raw_grain', 3),
  r('harvest_barley', 'source', ['farming'], 'raw_grain', 2),
  r('harvest_rice', 'source', ['farming'], 'raw_grain', 3),
  r('harvest_flax', 'source', ['farming'], 'raw_fiber', 2),
  r('harvest_olives', 'source', ['farming'], 'raw_olives', 2),
  r('harvest_grapes', 'source', ['farming', 'viticulture'], 'raw_grapes', 3),
  r('herd_cattle', 'source', ['herding'], 'raw_meat', 2),
  r('herd_sheep', 'source', ['herding'], 'raw_fiber', 2),
  r('skin_cattle', 'source', ['herding'], 'raw_hide', 1),
  r('catch_fish', 'source', ['fishing'], 'raw_fish', 3),
  r('mine_iron', 'source', ['mining'], 'raw_ore', 2),
  r('mine_copper', 'source', ['mining'], 'raw_ore', 2),
  r('mine_gold', 'source', ['mining'], 'raw_ore', 1),
  r('quarry_stone', 'source', ['quarrying'], 'raw_stone', 3),
  r('quarry_marble', 'source', ['quarrying'], 'raw_stone', 2),
  r('fell_timber', 'source', ['logging'], 'raw_timber', 3),
  r('fell_cedar', 'source', ['logging'], 'raw_timber', 2),
  r('gather_incense', 'source', ['gathering'], 'raw_incense', 2),
  // producer (root or light crafts)
  r('cut_peat', 'producer', ['gathering'], 'peat', 2),
  r('draw_water', 'producer', ['farming'], 'well_water', 4),
  r('burn_charcoal', 'producer', ['logging'], 'charcoal', 3, [['raw_timber', 2]]),
  r('build_granary', 'producer', ['construction'], 'granary_storage', 2, [['lumber', 2]]),
  r('scribe_documents', 'producer', ['crafting'], 'scribed_documents', 1, [['raw_hide', 1]]),
  // processing (raw -> intermediate)
  r('mill_grain', 'processing', ['milling'], 'flour', 2, [['raw_grain', 3]]),
  r('preserve_fish', 'processing', ['preserving'], 'preserved_food', 2, [['raw_fish', 2]]),
  r('preserve_food', 'processing', ['preserving'], 'preserved_food', 2, [['raw_meat', 1], ['raw_grain', 1]]),
  r('tan_leather', 'processing', ['tanning'], 'leather', 1, [['raw_hide', 2]]),
  r('spin_yarn', 'processing', ['spinning'], 'yarn', 2, [['raw_fiber', 2]]),
  r('smelt_iron', 'processing', ['smelting'], 'iron_ingot', 1, [['raw_ore', 2]]),
  r('smelt_copper', 'processing', ['smelting'], 'copper_ingot', 1, [['raw_ore', 2]]),
  r('saw_timber', 'processing', ['sawing'], 'lumber', 2, [['raw_timber', 3]]),
  r('cut_stone', 'processing', ['stonecutting'], 'stone_blocks', 2, [['raw_stone', 3]]),
  r('press_olives', 'processing', ['pressing'], 'olive_oil', 1, [['raw_olives', 2]]),
  // urban (final goods)
  r('bake_staples', 'urban', ['baking'], 'baked_staples', 2, [['flour', 2]]),
  r('bake_refined', 'urban', ['baking'], 'baked_refined', 1, [['flour', 2], ['olive_oil', 1]]),
  r('weave_basic', 'urban', ['weaving'], 'textile_basic', 2, [['yarn', 2]]),
  r('weave_fine', 'urban', ['weaving'], 'textile_fine', 1, [['yarn', 3]]),
  r('forge_tools', 'urban', ['smithing'], 'metalwork_tools', 2, [['iron_ingot', 1], ['lumber', 1]]),
  r('forge_arms', 'urban', ['smithing', 'armoring'], 'arms_basic', 1, [['iron_ingot', 2], ['leather', 1]]),
  r('leather_armor', 'urban', ['armoring'], 'arms_basic', 1, [['leather', 2], ['copper_ingot', 1]]),
  r('build_materials', 'urban', ['construction'], 'construction_materials', 2, [['lumber', 1], ['stone_blocks', 1]]),
  r('make_pottery', 'urban', ['crafting'], 'pottery', 2, [['raw_stone', 1]]),
  r('press_wine', 'urban', ['fermenting'], 'wine_standard', 2, [['raw_grapes', 3]]),
  // guild (luxury / master craft)
  r('build_luxury', 'guild', ['construction', 'master_craft'], 'construction_materials', 3, [['stone_blocks', 2], ['lumber', 2]]),
  r('prepare_feast', 'guild', ['baking', 'master_craft'], 'feast_goods', 1, [['baked_refined', 1], ['wine_standard', 1], ['olive_oil', 1]]),
  r('forge_fine_arms', 'guild', ['smithing', 'master_craft'], 'fine_arms', 1, [['iron_ingot', 2], ['leather', 1]]),
  r('craft_jewelry', 'guild', ['master_craft'], 'jewelry', 1, [['raw_ore', 2]]),
  r('craft_ritual', 'guild', ['ritual_craft'], 'ritual_goods', 1, [['raw_incense', 1], ['olive_oil', 1]]),
  r('embroider_fine', 'guild', ['weaving', 'master_craft'], 'textile_fine', 1, [['textile_basic', 2]]),
  r('age_wine', 'guild', ['fermenting', 'master_craft'], 'wine_luxury', 1, [['wine_standard', 2]]),
];

// ───────────────────────── producing structures ─────────────────────────
export const PRODUCTION_BUILDINGS: BuildingContract[] = [
  // root sources
  { name: 'Farma', category: 'economic', roles: ['source'], tags: ['farming', 'herding'],
    levels: [['harvest_wheat', 'harvest_barley', 'herd_cattle'], ['harvest_rice', 'harvest_flax', 'herd_sheep'], ['skin_cattle', 'harvest_olives']] },
  { name: 'Rybářství', category: 'economic', roles: ['source'], tags: ['fishing'], requiresWater: true,
    levels: [['catch_fish'], [], []] },
  { name: 'Důl', category: 'economic', roles: ['source'], tags: ['mining'],
    levels: [['mine_iron'], ['mine_copper'], ['mine_gold']] },
  { name: 'Kamenolom', category: 'economic', roles: ['source'], tags: ['quarrying'],
    levels: [['quarry_stone'], [], ['quarry_marble']] },
  { name: 'Dřevorubecký tábor', category: 'economic', roles: ['source'], tags: ['logging'],
    levels: [['fell_timber'], [], ['fell_cedar']] },
  { name: 'Vinice', category: 'economic', roles: ['source'], tags: ['farming', 'viticulture'],
    levels: [['harvest_grapes'], [], []] },
  { name: 'Rašeliniště', category: 'economic', roles: ['producer', 'source'], tags: ['gathering'],
    levels: [['cut_peat'], ['gather_incense'], []] },
  { name: 'Studna', category: 'infrastructure', roles: ['producer'], tags: ['farming'],
    levels: [['draw_water'], [], []] },
  { name: 'Akvadukt', category: 'infrastructure', roles: ['producer'], tags: ['farming'],
    levels: [['draw_water'], [], []] },
  // processing
  { name: 'Mlýn', category: 'economic', roles: ['processing'], tags: ['milling'],
    levels: [['mill_grain'], [], []] },
  { name: 'Udírna a solírna', category: 'economic', roles: ['processing'], tags: ['preserving'],
    levels: [['preserve_food'], ['preserve_fish'], []] },
  { name: 'Koželužna', category: 'economic', roles: ['processing'], tags: ['tanning'],
    levels: [['tan_leather'], [], []] },
  { name: 'Přádelna', category: 'economic', roles: ['processing'], tags: ['spinning'],
    levels: [['spin_yarn'], [], []] },
  { name: 'Huť', category: 'economic', roles: ['processing'], tags: ['smelting'],
    levels: [['smelt_iron'], ['smelt_copper'], []] },
  { name: 'Pila', category: 'economic', roles: ['processing'], tags: ['sawing'],
    levels: [['saw_timber'], [], []] },
  { name: 'Kamenictví', category: 'economic', roles: ['processing'], tags: ['stonecutting'],
    levels: [['cut_stone'], [], []] },
  { name: 'Lisovna oleje', category: 'economic', roles: ['processing'], tags: ['pressing'],
    levels: [['press_olives'], [], []] },
  { name: 'Uhlířství', category: 'economic', roles: ['producer'], tags: ['logging'],
    levels: [['burn_charcoal'], [], []] },
  { name: 'Písařská dílna', category: 'economic', roles: ['producer'], tags: ['crafting'],
    levels: [['scribe_documents'], [], []] },
  { name: 'Sýpka', category: 'economic', roles: ['producer'], tags: ['construction'],
    levels: [['build_granary'], [], []] },
  // final goods
  { name: 'Pekárna', category: 'economic', roles: ['urban', 'guild'], tags: ['baking', 'master_craft'],
    levels: [['bake_staples'], ['bake_refined'], ['prepare_feast']] },
  { name: 'Tkalcovna', category: 'economic', roles: ['urban', 'guild'], tags: ['weaving', 'master_craft'],
    levels: [['weave_basic'], ['weave_fine'], ['embroider_fine']] },
  { name: 'Kovárna', category: 'economic', roles: ['urban'], tags: ['smithing'],
    levels: [['forge_tools'], [], []] },
  { name: 'Zbrojířská dílna', category: 'economic', roles: ['urban', 'guild'], tags: ['smithing', 'armoring', 'master_craft'],
    levels: [['forge_arms'], ['leather_armor'], ['forge_fine_arms']] },
  { name: 'Stavební dílna', category: 'economic', roles: ['urban', 'guild'], tags: ['construction', 'master_craft'],
    levels: [['build_materials'], [], ['build_luxury']] },
  { name: 'Hrnčířská dílna', category: 'economic', roles: ['urban'], tags: ['crafting'],
    levels: [['make_pottery'], [], []] },
  { name: 'Vinařství', category: 'economic', roles: ['urban', 'guild'], tags: ['fermenting', 'master_craft'],
    levels: [['press_wine'], [], ['age_wine']] },
  { name: 'Klenotnická dílna', category: 'economic', roles: ['guild'], tags: ['master_craft'],
    levels: [['craft_jewelry'], [], []] },
  { name: 'Chrámová dílna', category: 'economic', roles: ['guild'], tags: ['ritual_craft'],
    levels: [['craft_ritual'], [], []] },
];

export const recipeByKey = new Map(RECIPES.map((x) => [x.key, x]));
export const goodByKey = new Map(GOODS.map((g) => [g.key, g]));

/** Master recipes are eligible for an origin brand; no dependence on input-name substrings. */
export const DISTINCTIVE_RECIPE_KEYS = new Set(RECIPES.filter(r => r.role === 'guild').map(r => r.key));

/** Cumulative recipe whitelist a structure runs at the given level (1-based). */
export function recipesForLevel(contract: BuildingContract, level: number): string[] {
  return contract.levels.slice(0, Math.max(1, level)).flat();
}

/** Structures (with the level needed) able to run a recipe. */
export function producersOfRecipe(recipeKey: string): { building: string; level: number }[] {
  const out: { building: string; level: number }[] = [];
  for (const b of PRODUCTION_BUILDINGS) {
    const level = b.levels.findIndex((keys) => keys.includes(recipeKey));
    if (level >= 0) out.push({ building: b.name, level: level + 1 });
  }
  return out;
}

export interface ReachabilityEntry {
  good: string;
  reachable: boolean;
  /** Human readable chain from root source to the good. */
  path: string[];
  blocker: string | null;
}

/** Recursively traces every good back to zero-input root recipes owned by a real structure. */
export function goodReachability(): ReachabilityEntry[] {
  const memo = new Map<string, ReachabilityEntry>();
  const resolve = (good: string, stack: string[]): ReachabilityEntry => {
    const cached = memo.get(good);
    if (cached) return cached;
    if (stack.includes(good)) return { good, reachable: false, path: [...stack, good], blocker: 'production_cycle' };
    const recipes = RECIPES.filter((x) => x.output === good);
    if (!recipes.length) {
      const entry = { good, reachable: false, path: [], blocker: 'no_recipe' };
      memo.set(good, entry); return entry;
    }
    let best: ReachabilityEntry | null = null;
    for (const recipe of recipes) {
      const structures = producersOfRecipe(recipe.key);
      if (!structures.length) { best ??= { good, reachable: false, path: [recipe.key], blocker: `no_structure_for:${recipe.key}` }; continue; }
      const inputs = recipe.inputs.map((i) => resolve(i.good, [...stack, good]));
      const missing = inputs.find((i) => !i.reachable);
      if (missing) { best ??= { good, reachable: false, path: [recipe.key], blocker: missing.blocker }; continue; }
      const structure = structures[0];
      const path = [...inputs.flatMap((i) => i.path), `${structure.building} (lvl ${structure.level}) / ${recipe.key} -> ${good}`];
      best = { good, reachable: true, path, blocker: null };
      break;
    }
    const entry = best ?? { good, reachable: false, path: [], blocker: 'unreachable' };
    memo.set(good, entry); return entry;
  };
  return GOODS.map((g) => resolve(g.key, []));
}

/** Static contract audit. Returns a list of human readable violations (empty = healthy). */
export function auditProductionCatalog(): string[] {
  const errors: string[] = [];
  for (const recipe of RECIPES) {
    if (!goodByKey.has(recipe.output)) errors.push(`recipe ${recipe.key} outputs unknown good ${recipe.output}`);
    for (const input of recipe.inputs) {
      if (!goodByKey.has(input.good)) errors.push(`recipe ${recipe.key} consumes unknown good ${input.good}`);
    }
    if (recipe.role === 'source' && recipe.inputs.length) errors.push(`source recipe ${recipe.key} must have no inputs`);
    if (!producersOfRecipe(recipe.key).length) errors.push(`recipe ${recipe.key} has no producing structure`);
  }
  for (const building of PRODUCTION_BUILDINGS) {
    for (const key of recipesForLevel(building, building.levels.length)) {
      const recipe = recipeByKey.get(key);
      if (!recipe) { errors.push(`${building.name} references unknown recipe ${key}`); continue; }
      if (!building.roles.includes(recipe.role)) errors.push(`${building.name} may not run ${key}: role ${recipe.role} not allowed`);
      const missing = recipe.tags.filter((t) => !building.tags.includes(t));
      if (missing.length) errors.push(`${building.name} lacks tags [${missing.join(',')}] required by ${key}`);
    }
  }
  for (const entry of goodReachability()) {
    if (!entry.reachable) errors.push(`good ${entry.good} is not producible: ${entry.blocker}`);
  }
  return errors;
}
