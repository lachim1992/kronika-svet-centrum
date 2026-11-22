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
export const FOOD_BYPRODUCT: Record<string, string> = { cattle: 'milk_cattle', goats: 'milk_goats', chickens: 'collect_eggs', sheep: 'shear_sheep' };
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
  milk_cattle: 1.5, milk_goats: 1, collect_eggs: 1, shear_sheep: 1.25,
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

// ── Starter stock (seed / breeding stock / hives) ──────────────────────────────────────────────
/** Groups that can be imported as seed or breeding stock; wild fish cannot be "planted". */
export const STARTER_KIT_GROUPS = new Set<FoodGroup>(['cereal', 'legume', 'tuber', 'vegetable', 'fruit', 'livestock', 'poultry', 'apiary']);
const KIT_COST: Partial<Record<FoodGroup, number>> = { cereal: 8, legume: 8, tuber: 8, vegetable: 8, fruit: 20, livestock: 40, poultry: 15, apiary: 20 };
/** Gold paid from the state treasury for a starter kit (imported seed/stock); null = not importable. */
export function starterKitCost(r: FoodResource): number | null { return STARTER_KIT_GROUPS.has(r.group) ? KIT_COST[r.group]! : null; }
/** A kit may only be planted where the climate/biome actually allows the species (no deadlock without a find, no impossible crops). */
export function starterKitReason(r: FoodResource | undefined, c: MicroContext): string | null {
  if (!r) return 'Neznámý zdroj potravin.';
  if (starterKitCost(r) == null) return 'Divoké ryby nelze dovézt jako osivo či chovný materiál.';
  if (foodResourceChance(r, c) <= 0) return `${r.label}: na tomto políčku tomu nesvědčí podnebí ani půda.`;
  return null;
}

// ── Living herds, flocks and bee colonies ──────────────────────────────────────────────────────
/** Carrying capacity in herd units per unit of site output capacity (pasture/forage incl. attached fields). */
export const HERD_CARRYING_PER_CAPACITY = 6;
/** Breeding stock never slaughtered (share of carrying capacity). */
export const HERD_BREEDING_FLOOR = 0.3;
/** Opening herd as share of carrying capacity: own found wild stock vs imported starter kit. */
export const HERD_OPENING = { found: 0.25, starter_kit: 0.1 } as const;
const FEMALE_SHARE = 0.5;
const BIRTHS_PER_FEMALE: Partial<Record<FoodGroup, number>> = { livestock: 0.5, poultry: 1.2, apiary: 0.8 };
export type HerdRole = 'slaughter' | 'byproduct' | 'colony';
/** Which living population a recipe draws on (null = not a herd recipe). */
export function herdRole(recipe: string): { role: HerdRole; resource: FoodResource; harvest: string } | null {
  for (const r of FOOD_RESOURCES) {
    if (!['livestock', 'poultry', 'apiary'].includes(r.group)) continue;
    if (r.harvest === recipe) return { role: r.group === 'apiary' ? 'colony' : 'slaughter', resource: r, harvest: r.harvest };
    if (FOOD_BYPRODUCT[r.key] === recipe) return { role: 'byproduct', resource: r, harvest: r.harvest };
  }
  return null;
}
/** Reproduction: births limited by females (half the herd) and by remaining pasture (logistic, never above K). */
export function herdGrowth(herd: number, carrying: number, group: FoodGroup): number {
  if (!(herd > 0) || !(carrying > 0)) return 0;
  const births = FEMALE_SHARE * herd * (BIRTHS_PER_FEMALE[group] ?? 0.4) * Math.max(0, 1 - herd / carrying);
  return Math.min(carrying, herd + births);
}
/** Output this turn from the living population. Slaughter keeps breeding stock; milk/eggs/honey scale with living animals/colonies. */
export function herdOutput(role: HerdRole, herd: number, carrying: number, capacity: number): number {
  if (!(herd > 0) || !(carrying > 0)) return 0;
  if (role === 'slaughter') return Math.max(0, Math.min(capacity, herd - HERD_BREEDING_FLOOR * carrying));
  return capacity * Math.min(1, herd / carrying);
}
