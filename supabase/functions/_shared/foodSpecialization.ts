/**
 * Food site specializations (phase 3+4). Pure rules shared by command-dispatch, economyAdapter, parcelEconomy and the map UI.
 * Three distinct states, never conflated:
 *  - potential   = foodResourceChance (ecology, atlas only);
 *  - discovered  = own micro_surveys finding `food:<key>` (server-computed with foodResourcePresent × origin factor);
 *  - established = food_specializations row (one crop/herd per site), yielding after ESTABLISH_TURNS.
 * A site runs exactly ONE food harvest; it replaces the template's legacy crop recipes, so the site's jobs and
 * capacity budget is shared, never stacked.
 */
import { FOOD_RESOURCES, foodResourceByKey, foodResourceChance, foodHash, WATER_SUB_BIOMES, type FoodResource, type FoodGroup, type MicroContext } from './foodResources.ts';

/** Single-crop recipes of the pre-v1 rural templates; a food specialization replaces them on its site. */
export const LEGACY_CROP_RECIPES = new Set(['harvest_wheat', 'harvest_barley', 'harvest_rice', 'herd_cattle', 'harvest_grapes', 'catch_fish']);
/** Living-herd by-products: no slaughter, no herd depletion. */
export const FOOD_BYPRODUCT: Record<string, string> = { cattle: 'milk_cattle', goats: 'milk_goats', chickens: 'collect_eggs' };
export const FOOD_BYPRODUCT_RECIPES = new Set(Object.values(FOOD_BYPRODUCT));

const PERENNIAL = new Set(['olives', 'grapes', 'dates', 'bananas_plantains']);
export function establishTurns(r: FoodResource): number {
  if (PERENNIAL.has(r.key)) return 3;
  return r.group === 'livestock' ? 2 : r.group === 'fish' ? 0 : 1;
}

/** Lv1 site capacity per harvest group (output units/turn before staffing). */
const BASE: Record<FoodGroup, number> = { cereal: 2.2, legume: 2, tuber: 2.4, vegetable: 2, fruit: 1.4, livestock: 1, poultry: 1.2, fish: 1.8, apiary: 0.5 };
export const FOOD_RURAL_BASE: Record<string, number> = {
  ...Object.fromEntries(FOOD_RESOURCES.map((r) => [r.harvest, BASE[r.group]])),
  milk_cattle: 1.5, milk_goats: 1, collect_eggs: 1,
};
/** Crops that profit from attached farm fields (same bonus as legacy field crops). */
export const FOOD_FIELD_RECIPES = new Set(FOOD_RESOURCES.filter((r) => ['cereal', 'legume', 'tuber', 'vegetable'].includes(r.group)).map((r) => r.harvest));

/**
 * Reservoir regrowth per turn (share of capacity). Crops are re-sown every year (1); herds/flocks are FINITE
 * populations: the reservoir is the animals, harvest = slaughter, regrowth = reproduction; by-products never
 * deplete the herd. Wild fish stocks and hives regrow partially.
 */
export function foodRegrowth(recipe: string): number | null {
  if (FOOD_BYPRODUCT_RECIPES.has(recipe)) return 1;
  const r = FOOD_RESOURCES.find((x) => x.harvest === recipe); if (!r) return null;
  return r.group === 'livestock' ? 0.12 : r.group === 'poultry' ? 0.3 : r.group === 'fish' ? 0.2 : r.group === 'apiary' ? 0.35 : 1;
}

/** Recipe keys a site actually runs with this specialization (null spec = template unchanged). */
export function foodSiteRecipes(baseKeys: string[], specializationKeys: string[], resourceKey: string | null | undefined): string[] {
  const r = resourceKey ? foodResourceByKey.get(resourceKey) : undefined;
  if (!r || !specializationKeys.includes(r.harvest)) return baseKeys;
  const keep = baseKeys.filter((k) => !LEGACY_CROP_RECIPES.has(k));
  const by = FOOD_BYPRODUCT[r.key];
  return [...keep, r.harvest, ...(by && specializationKeys.includes(by) ? [by] : [])];
}

/** Regional origin: crops cluster around their historical home instead of appearing wherever climate fits. */
export function foodOriginFactor(seed: string, r: FoodResource, mx: number, my: number): number {
  if (r.origin === 'widespread') return 1;
  const cx = Math.floor(mx / 48), cy = Math.floor(my / 48); // ~8x8 macro squares per origin cell
  return foodHash(seed, `origin:${r.origin}`, cx, cy) < 0.45 ? 1 : 0.3;
}

/** Server-only survey truth: food resources present on this micro square. */
export function foodSurveyFindings(seed: string, mx: number, my: number, c: MicroContext) {
  return FOOD_RESOURCES.filter((r) => foodHash(seed, r.key, mx, my) < foodResourceChance(r, c) * foodOriginFactor(seed, r, mx, my))
    .map((r) => ({ kind: `food:${r.key}`, good: r.good, label: r.label, implemented: true, certain: false, food: true }));
}

export const isFoodFinding = (f: any, key: string) => f?.kind === `food:${key}`;

/** Why this specialization is not allowed (null = ok). Server re-checks everything; UI only previews. */
export function specializationReason(input: {
  resourceKey: string; siteOwner: string | null; siteClaim: string | null; player: string; specializationKeys: string[];
  siteMicro: [number, number]; sourceMicro: [number, number]; sourceSubBiome: string | null; discoveredAtSource: boolean;
}): string | null {
  const r = foodResourceByKey.get(input.resourceKey);
  if (!r) return 'Neznámý zdroj potravin.';
  if (input.siteOwner !== input.player || input.siteClaim !== 'worked') return 'Specializovat lze jen stavbu na políčku, které obdělává tvé město.';
  if (!input.specializationKeys.includes(r.harvest)) return `Tato stavba nemůže pěstovat/chovat: ${r.label}.`;
  const d = Math.abs(input.siteMicro[0] - input.sourceMicro[0]) + Math.abs(input.siteMicro[1] - input.sourceMicro[1]);
  if (d > 1) return 'Zdroj musí ležet přímo na políčku stavby nebo na sousedním políčku.';
  if (d === 1 && !WATER_SUB_BIOMES.has(input.sourceSubBiome ?? '')) return 'Ze sousedního políčka lze využít jen vodní zdroj (ryby, vodní ptactvo, rýže).';
  if (!input.discoveredAtSource) return `Nejdřív musíš průzkumem najít ${r.label.toLowerCase()} na zdrojovém políčku.`;
  return null;
}
