/**
 * Canonical catalogue of the 40 food map resources (design: docs/design/food-resources-v1.md).
 *
 * SINGLE AUTHORITY for: which food resources exist, on which micro sub-biomes they may occur (P0 per
 * sub-biome), their climate window (temp/moisture bands 0..4), hard water/altitude conditions, their
 * historical origin region, the harvest good, the harvesting structure and the processing chain to a
 * final-use good. productionCatalog.ts derives its food goods/recipes from this file; worldgen, survey,
 * atlas, farm fields and seeds must read it instead of keeping their own lists.
 *
 * Semantics (never conflate):
 *  - chance()  = ecological potential of a micro parcel, NOT a revealed or harvested resource;
 *  - wild fauna/populations != domesticated herd; growing suitability != planted field;
 *  - a water resource lives on water parcels; the harvesting building stands on an adjacent BUILDABLE parcel.
 *
 * VERSION 1. Do not change the list of 40; append new versions instead.
 */

export const FOOD_RESOURCES_VERSION = 1;

export type FoodGroup = 'cereal' | 'legume' | 'tuber' | 'vegetable' | 'fruit' | 'livestock' | 'poultry' | 'fish' | 'apiary';
export type OriginRegion = 'west_eurasia' | 'east_asia' | 'south_asia' | 'africa' | 'americas' | 'widespread';
export type WaterNeed = 'none' | 'freshwater' | 'saltwater' | 'salt_or_brackish' | 'groundwater' | 'drinking';
export type HarvestBuilding = 'Farma' | 'Rýžoviště' | 'Vinice' | 'Rybářství';

export interface FoodResource {
  n: number;
  key: string;
  label: string;
  group: FoodGroup;
  /** P0 per micro sub-biome (0..1). Sub-biomes not listed are hard-invalid (0). */
  biomes: Record<string, number>;
  /** Inclusive climate windows (bands 0..4). null = climate-independent (water resources). */
  temp: [number, number] | null;
  moisture: [number, number] | null;
  water: WaterNeed;
  /** Max normalized elevation (0..1) allowed; undefined = no limit. */
  maxElevation?: number;
  origin: OriginRegion;
  /** Raw harvest good key. */
  good: string;
  building: HarvestBuilding;
  /** Harvest recipe key (source role, no inputs). */
  harvest: string;
  harvestQty: number;
}

const T = (a: number, b: number): [number, number] => [a, b];
const f = (n: number, key: string, label: string, group: FoodGroup, biomes: Record<string, number>,
  temp: [number, number] | null, moisture: [number, number] | null, water: WaterNeed, origin: OriginRegion,
  building: HarvestBuilding = 'Farma', harvestQty = 3, maxElevation?: number): FoodResource => ({
  n, key, label, group, temp, moisture, water, origin, building, maxElevation,
  biomes: Object.fromEntries(Object.entries(biomes).map(([k, v]) => [k, v / 100])),
  // The map source is a living colony; its market harvest is honey, not an edible beehive.
  good: key === 'bees' ? 'food_honey' : `food_${key}`, harvest: `harvest_food_${key}`, harvestQty,
});

export const FOOD_RESOURCES: FoodResource[] = [
  f(1, 'wheat', 'Pšenice', 'cereal', { fertile_flat: 42, fertile_silt: 32, raised_bank: 20, clearing: 10 }, T(1, 4), T(2, 4), 'none', 'west_eurasia'),
  f(2, 'barley', 'Ječmen', 'cereal', { grassland: 32, dry_flat: 26, fertile_flat: 22, terrace: 14, hillock: 10 }, T(1, 4), T(1, 3), 'none', 'west_eurasia'),
  f(3, 'rye', 'Žito', 'cereal', { frozen_flat: 28, clearing: 20, sheltered_hollow: 18, grassland: 15, ridge_woods: 10 }, T(0, 3), T(2, 4), 'none', 'west_eurasia'),
  f(4, 'oats', 'Oves', 'cereal', { grassland: 26, clearing: 22, sheltered_hollow: 20, ridge_woods: 14, fertile_flat: 12 }, T(0, 3), T(2, 4), 'none', 'west_eurasia'),
  f(5, 'millet', 'Proso', 'cereal', { dry_flat: 32, grassland: 18, hillock: 12, oasis_edge: 10, fertile_flat: 8 }, T(2, 4), T(0, 2), 'none', 'east_asia'),
  f(6, 'sorghum', 'Čirok', 'cereal', { dry_flat: 36, grassland: 20, oasis_edge: 18, clearing: 10, sand_flat: 8 }, T(3, 4), T(0, 2), 'none', 'africa'),
  f(7, 'rice', 'Rýže', 'cereal', { reed_marsh: 40, fertile_silt: 32, river_bank: 28, shallow_dip: 18, raised_bank: 12 }, T(3, 4), T(3, 4), 'freshwater', 'east_asia', 'Rýžoviště'),
  f(8, 'maize', 'Kukuřice', 'cereal', { fertile_flat: 34, fertile_silt: 28, clearing: 18, river_bank: 16, grassland: 10 }, T(2, 4), T(2, 4), 'none', 'americas'),
  f(9, 'teff', 'Tef', 'cereal', { terrace: 24, sheltered_hollow: 18, hillock: 14, pass_floor: 10, fertile_flat: 10 }, T(2, 4), T(1, 3), 'none', 'africa'),
  f(10, 'lentils', 'Čočka', 'legume', { terrace: 24, fertile_flat: 18, sheltered_hollow: 16, dry_flat: 14, hillock: 10 }, T(2, 4), T(1, 3), 'none', 'west_eurasia'),
  f(11, 'chickpeas', 'Cizrna', 'legume', { terrace: 28, dry_flat: 22, hillock: 16, fertile_flat: 14, sheltered_hollow: 10 }, T(2, 4), T(1, 2), 'none', 'west_eurasia'),
  f(12, 'peas', 'Hrách', 'legume', { fertile_flat: 24, fertile_silt: 20, clearing: 18, grassland: 12, raised_bank: 10 }, T(1, 3), T(2, 4), 'none', 'west_eurasia'),
  f(13, 'fava_beans', 'Bob obecný', 'legume', { fertile_silt: 22, fertile_flat: 20, sheltered_hollow: 16, creek_bank: 12, terrace: 10 }, T(1, 3), T(2, 4), 'none', 'west_eurasia'),
  f(14, 'common_beans', 'Fazole', 'legume', { fertile_flat: 22, clearing: 18, sheltered_hollow: 18, river_bank: 16, fertile_silt: 14 }, T(2, 4), T(2, 4), 'none', 'americas'),
  f(15, 'cowpeas', 'Vigna (cowpea)', 'legume', { dry_flat: 30, grassland: 18, oasis_edge: 16, clearing: 12, sand_flat: 8 }, T(3, 4), T(1, 3), 'none', 'africa'),
  f(16, 'soybeans', 'Sója', 'legume', { fertile_silt: 22, fertile_flat: 20, clearing: 16, river_bank: 14, raised_bank: 10 }, T(2, 4), T(2, 4), 'none', 'east_asia'),
  f(17, 'peanuts', 'Podzemnice', 'legume', { dry_flat: 26, sand_flat: 22, terrace: 12, oasis_edge: 10, hillock: 8 }, T(3, 4), T(1, 3), 'none', 'americas'),
  f(18, 'potatoes', 'Brambory', 'tuber', { sheltered_hollow: 26, terrace: 16, hillock: 14, pass_floor: 12, fertile_flat: 10, frozen_flat: 8 }, T(0, 2), T(2, 4), 'none', 'americas'),
  f(19, 'sweet_potatoes', 'Batáty', 'tuber', { clearing: 20, fertile_flat: 18, river_bank: 16, thick_canopy: 16, sheltered_hollow: 12 }, T(3, 4), T(2, 4), 'none', 'americas'),
  f(20, 'cassava', 'Maniok', 'tuber', { thick_canopy: 28, clearing: 18, river_bank: 16, fertile_silt: 14, sheltered_hollow: 10 }, T(3, 4), T(3, 4), 'none', 'americas'),
  f(21, 'yams', 'Jamy', 'tuber', { thick_canopy: 25, clearing: 18, fertile_silt: 16, river_bank: 14, sheltered_hollow: 10 }, T(3, 4), T(3, 4), 'none', 'africa'),
  f(22, 'taro', 'Taro', 'tuber', { reed_marsh: 35, boggy_dip: 22, river_bank: 25, fertile_silt: 18, shallow_dip: 12 }, T(3, 4), T(3, 4), 'freshwater', 'south_asia'),
  f(23, 'squash', 'Tykve', 'vegetable', { fertile_flat: 22, clearing: 18, sheltered_hollow: 16, river_bank: 14, grassland: 10 }, T(2, 4), T(2, 4), 'none', 'americas'),
  f(24, 'onions', 'Cibule', 'vegetable', { fertile_silt: 26, fertile_flat: 22, raised_bank: 16, river_bank: 12, terrace: 10 }, T(1, 4), T(1, 3), 'none', 'west_eurasia'),
  f(25, 'cabbage', 'Zelí', 'vegetable', { fertile_flat: 22, fertile_silt: 22, creek_bank: 18, sheltered_hollow: 14, clearing: 12 }, T(0, 3), T(2, 4), 'none', 'west_eurasia'),
  f(26, 'bananas_plantains', 'Banány a plantainy', 'fruit', { thick_canopy: 28, river_bank: 20, fertile_silt: 16, clearing: 12, sheltered_hollow: 10 }, T(3, 4), T(3, 4), 'none', 'south_asia', 'Farma', 3, 0.45),
  f(27, 'dates', 'Datle', 'fruit', { oasis_edge: 42, sand_flat: 10, dry_flat: 8, dune: 4 }, T(3, 4), T(0, 1), 'groundwater', 'west_eurasia'),
  f(28, 'olives', 'Olivy', 'fruit', { terrace: 26, sheltered_hollow: 20, hillock: 14, shore: 10, dry_flat: 8 }, T(2, 4), T(1, 2), 'none', 'west_eurasia'),
  f(29, 'grapes', 'Vinná réva', 'fruit', { terrace: 28, sheltered_hollow: 22, hillock: 16, fertile_flat: 12, shore: 8 }, T(2, 4), T(1, 3), 'none', 'west_eurasia', 'Vinice'),
  f(30, 'garlic', 'Česnek', 'vegetable', { fertile_flat: 22, fertile_silt: 20, terrace: 16, sheltered_hollow: 12, raised_bank: 10 }, T(1, 4), T(1, 3), 'none', 'west_eurasia'),
  f(31, 'cattle', 'Skot', 'livestock', { grassland: 28, fertile_flat: 16, clearing: 16, river_bank: 12, sheltered_hollow: 10, hillock: 8 }, T(1, 4), T(2, 4), 'drinking', 'west_eurasia', 'Farma', 2),
  f(32, 'sheep', 'Ovce', 'livestock', { grassland: 26, hillock: 20, saddle: 16, pass_floor: 14, frozen_flat: 10, sheltered_hollow: 10 }, T(0, 3), T(1, 3), 'none', 'west_eurasia', 'Farma', 2),
  f(33, 'goats', 'Kozy', 'livestock', { hillock: 26, steep_slope: 20, saddle: 16, terrace: 14, dry_flat: 12, rocky_patch: 10 }, T(2, 4), T(0, 3), 'none', 'west_eurasia', 'Farma', 2),
  f(34, 'pigs', 'Prasata', 'livestock', { thicket: 28, dense_forest: 24, clearing: 18, ridge_woods: 16, reed_marsh: 10 }, T(1, 4), T(2, 4), 'none', 'widespread', 'Farma', 2),
  f(35, 'chickens', 'Slepice', 'poultry', { clearing: 22, grassland: 16, thicket: 14, fertile_flat: 12, sheltered_hollow: 10, thick_canopy: 8 }, T(1, 4), T(1, 4), 'none', 'south_asia', 'Farma', 2),
  f(36, 'ducks_geese', 'Kachny a husy', 'poultry', { reed_marsh: 30, lake: 26, river_bank: 22, boggy_dip: 18, shore: 10 }, T(1, 4), T(3, 4), 'freshwater', 'widespread', 'Farma', 2),
  f(37, 'freshwater_fish', 'Sladkovodní ryby', 'fish', { river_channel: 50, lake: 45, river_bank: 25, creek_bank: 20, harbour_flat: 10 }, null, null, 'freshwater', 'widespread', 'Rybářství'),
  f(38, 'marine_fish', 'Mořské ryby', 'fish', { open_water: 55, shore: 22, harbour_flat: 28 }, null, null, 'saltwater', 'widespread', 'Rybářství'),
  f(39, 'shellfish', 'Měkkýši a korýši', 'fish', { shore: 28, harbour_flat: 24, open_water: 12, river_bank: 8 }, null, null, 'salt_or_brackish', 'widespread', 'Rybářství', 2),
  f(40, 'bees', 'Včelstva', 'apiary', { clearing: 22, sheltered_hollow: 20, thicket: 18, dense_forest: 14, terrace: 12, grassland: 10 }, T(1, 4), T(1, 4), 'none', 'widespread', 'Farma', 1),
];

export const foodResourceByKey = new Map(FOOD_RESOURCES.map((r) => [r.key, r]));
export const foodResourceByHarvest = new Map(FOOD_RESOURCES.map((r) => [r.harvest, r]));

/** Water parcels: never buildable; the harvest structure stands on an adjacent buildable parcel. */
export const WATER_SUB_BIOMES = new Set(['lake', 'river_channel', 'open_water', 'reed_marsh']);
/** Buildable parcels that give a harvesting structure access to an adjacent water resource. */
export const WATER_ACCESS_SUB_BIOMES: Record<'freshwater' | 'saltwater' | 'rice', string[]> = {
  freshwater: ['river_bank', 'creek_bank', 'harbour_flat', 'shore'],
  saltwater: ['shore', 'harbour_flat'],
  rice: ['fertile_silt', 'raised_bank', 'river_bank'],
};

// ─────────────────────────── processing chain ───────────────────────────
export interface FoodGoodDef { key: string; label: string; basket: string; stage: 'raw' | 'processed' | 'final' | 'luxury';
  finalUse: boolean; price: number; storable: boolean; tier: 'mass' | 'refined' }
export interface FoodRecipeDef { key: string; building: string; role: 'source' | 'processing' | 'urban'; tags: string[];
  output: string; qty: number; inputs: { good: string; qty: number; kind?: 'material' | 'operating' }[]; label: string }

const RAW_PRICE: Record<FoodGroup, number> = { cereal: 0.5, legume: 0.6, tuber: 0.5, vegetable: 0.6, fruit: 0.8,
  livestock: 1.0, poultry: 0.9, fish: 0.8, apiary: 2.0 };
// Raw harvest goods are never eaten unprocessed: one need (staple_food) is split, not multiplied.
const RAW_PERISHABLE = new Set<FoodGroup>(['fish', 'livestock', 'poultry', 'fruit', 'vegetable']);

/** New intermediates/finals introduced by v1 (existing flour/olive_oil/wine_standard/preserved_food are reused). */
export const FOOD_DERIVED_GOODS: FoodGoodDef[] = [
  { key: 'milled_rice', label: 'Loupaná rýže', basket: 'staple_food', stage: 'final', finalUse: true, price: 1.2, storable: true, tier: 'mass' },
  { key: 'pulse_groats', label: 'Luštěninové kroupy', basket: 'staple_food', stage: 'processed', finalUse: false, price: 1.0, storable: true, tier: 'mass' },
  { key: 'pulse_stew', label: 'Luštěninová kaše', basket: 'staple_food', stage: 'final', finalUse: true, price: 1.6, storable: false, tier: 'mass' },
  { key: 'cassava_meal', label: 'Odjedovaná maniková mouka', basket: 'staple_food', stage: 'processed', finalUse: false, price: 0.9, storable: true, tier: 'mass' },
  { key: 'cooked_tubers', label: 'Vařené hlízy', basket: 'staple_food', stage: 'final', finalUse: true, price: 1.3, storable: false, tier: 'mass' },
  { key: 'dried_fruit', label: 'Sušené ovoce', basket: 'staple_food', stage: 'final', finalUse: true, price: 2.0, storable: true, tier: 'mass' },
  { key: 'raw_milk', label: 'Mléko', basket: 'staple_food', stage: 'raw', finalUse: false, price: 0.9, storable: false, tier: 'mass' },
  { key: 'dairy_food', label: 'Sýr a tvaroh', basket: 'staple_food', stage: 'final', finalUse: true, price: 2.0, storable: true, tier: 'mass' },
  { key: 'eggs', label: 'Vejce', basket: 'staple_food', stage: 'final', finalUse: true, price: 1.2, storable: false, tier: 'mass' },
  { key: 'seed_oil', label: 'Rostlinný olej', basket: 'variety', stage: 'processed', finalUse: true, price: 2.2, storable: true, tier: 'refined' },
  { key: 'mead', label: 'Medovina', basket: 'feast', stage: 'final', finalUse: true, price: 3.0, storable: true, tier: 'refined' },
];

const ANIMAL_HARVEST_LABEL: Record<string,string> = {
  cattle: 'Hovězí maso', sheep: 'Skopové maso', goats: 'Kozí maso', pigs: 'Vepřové maso',
  chickens: 'Kuřecí maso', ducks_geese: 'Maso vodní drůbeže', bees: 'Med',
};

export const FOOD_RAW_GOODS: FoodGoodDef[] = FOOD_RESOURCES.map((r) => ({
  key: r.good, label: ANIMAL_HARVEST_LABEL[r.key] ?? r.label, basket: r.group === 'apiary' ? 'variety' : 'staple_food', stage: 'raw',
  // Honey and dates are edible as harvested; everything else needs processing.
  finalUse: r.key === 'bees' || r.key === 'dates', price: RAW_PRICE[r.group], storable: !RAW_PERISHABLE.has(r.group) || r.key === 'dates', tier: r.group === 'apiary' ? 'refined' : 'mass',
}));

const P = (key: string, building: string, role: FoodRecipeDef['role'], tags: string[], output: string, qty: number,
  inputs: FoodRecipeDef['inputs'], label: string): FoodRecipeDef => ({ key, building, role, tags, output, qty, inputs, label });
const HEAT = { good: 'charcoal', qty: 1, kind: 'operating' as const };

function processingFor(r: FoodResource): FoodRecipeDef[] {
  const g = r.good;
  switch (r.group) {
    case 'cereal':
      if (r.key === 'rice') return [P('hull_rice', 'Mlýn', 'processing', ['milling'], 'milled_rice', 2, [{ good: g, qty: 3 }], 'Loupání rýže')];
      return [P(`mill_${r.key}`, 'Mlýn', 'processing', ['milling'], 'flour', 2, [{ good: g, qty: 3 }], `Mletí: ${r.label}`)];
    case 'legume': {
      const out = [P(`split_${r.key}`, 'Mlýn', 'processing', ['milling'], 'pulse_groats', 2, [{ good: g, qty: 3 }], `Šrotování: ${r.label}`)];
      if (r.key === 'soybeans' || r.key === 'peanuts')
        out.push(P(`press_${r.key}`, 'Lisovna oleje', 'processing', ['pressing'], 'seed_oil', 1, [{ good: g, qty: 3 }], `Lisování oleje: ${r.label}`));
      return out;
    }
    case 'tuber':
      // Cassava is toxic raw: grating, soaking and pressing are mandatory before cooking.
      if (r.key === 'cassava') return [P('detox_cassava', 'Mlýn', 'processing', ['milling'], 'cassava_meal', 2, [{ good: g, qty: 3 }], 'Odjedování manioku')];
      return [P(`cook_${r.key}`, 'Pekárna', 'urban', ['baking'], 'cooked_tubers', 2, [{ good: g, qty: 3 }, HEAT], `Vaření: ${r.label}`)];
    case 'vegetable':
      if (r.key === 'squash') return [P('cook_squash', 'Pekárna', 'urban', ['baking'], 'cooked_tubers', 2, [{ good: g, qty: 3 }, HEAT], 'Vaření: Tykve')];
      return [P(`preserve_${r.key}`, 'Udírna a solírna', 'processing', ['preserving'], 'preserved_food', 1, [{ good: g, qty: 2 }, HEAT], `Konzervace: ${r.label}`)];
    case 'fruit':
      if (r.key === 'olives') return [P('press_food_olives', 'Lisovna oleje', 'processing', ['pressing'], 'olive_oil', 1, [{ good: g, qty: 2 }], 'Lisování oliv')];
      if (r.key === 'grapes') return [P('press_food_grapes', 'Vinařství', 'urban', ['fermenting'], 'wine_standard', 2, [{ good: g, qty: 3 }], 'Výroba vína')];
      // Sun/air drying: no fuel needed for dates; bananas are smoke-dried.
      return [P(`dry_${r.key}`, 'Udírna a solírna', 'processing', ['preserving'], 'dried_fruit', 1,
        r.key === 'dates' ? [{ good: g, qty: 2 }] : [{ good: g, qty: 3 }, HEAT], `Sušení: ${r.label}`)];
    case 'livestock':
    case 'poultry':
    case 'fish':
      return [P(`cure_${r.key}`, 'Udírna a solírna', 'processing', ['preserving'], 'preserved_food', 2, [{ good: g, qty: 2 }, HEAT], `Uzení / sušení: ${r.label}`)];
    case 'apiary':
      return [P('ferment_mead', 'Vinařství', 'urban', ['fermenting'], 'mead', 1, [{ good: g, qty: 2 }], 'Výroba medoviny')];
  }
}

/** Continuous by-products of living herds/flocks (stocks & reproduction: phase 3). */
const BYPRODUCTS: FoodRecipeDef[] = [
  P('milk_cattle', 'Farma', 'source', ['herding'], 'raw_milk', 3, [], 'Dojení skotu'),
  P('milk_goats', 'Farma', 'source', ['herding'], 'raw_milk', 2, [], 'Dojení koz'),
  P('collect_eggs', 'Farma', 'source', ['herding'], 'eggs', 2, [], 'Sběr vajec'),
  P('make_cheese', 'Pekárna', 'urban', ['baking'], 'dairy_food', 1, [{ good: 'raw_milk', qty: 3 }], 'Sýrařství'),
  P('cook_pulses', 'Pekárna', 'urban', ['baking'], 'pulse_stew', 2, [{ good: 'pulse_groats', qty: 2 }, HEAT], 'Vaření luštěnin'),
  P('bake_cassava', 'Pekárna', 'urban', ['baking'], 'cooked_tubers', 2, [{ good: 'cassava_meal', qty: 2 }, HEAT], 'Pečení manioku'),
];

const HARVEST_TAGS: Record<HarvestBuilding, string[]> = { 'Farma': ['farming'], 'Rýžoviště': ['farming'], 'Vinice': ['farming', 'viticulture'], 'Rybářství': ['fishing'] };

export const FOOD_RECIPES: FoodRecipeDef[] = [
  ...FOOD_RESOURCES.map((r) => P(r.harvest, r.building, 'source',
    r.group === 'livestock' || r.group === 'poultry' ? ['herding'] : HARVEST_TAGS[r.building], r.good, r.harvestQty, [], `Sklizeň: ${r.label}`)),
  ...FOOD_RESOURCES.flatMap(processingFor),
  ...BYPRODUCTS,
];

// ─────────────────────────── ecological chance ───────────────────────────
export interface MicroContext {
  subBiome: string | null | undefined;
  tempBand: number | null | undefined;
  moistureBand: number | null | undefined;
  /** normalized 0..1 */
  elevation?: number | null;
  hasRiver?: boolean;
  coastal?: boolean;
}

function bandFactor(band: number | null | undefined, w: [number, number] | null): number {
  if (!w) return 1;
  if (band == null || !Number.isFinite(band)) return 0; // fail closed: unknown climate yields nothing
  if (band < w[0] || band > w[1]) return 0;
  return band === w[0] || band === w[1] ? (w[0] === w[1] ? 1 : 0.75) : 1;
}

function waterFactor(r: FoodResource, c: MicroContext): number {
  const sb = c.subBiome ?? '';
  switch (r.water) {
    case 'none': case 'drinking': return r.water === 'drinking' && !(c.hasRiver || c.coastal || /bank|lake|marsh|dip|oasis/.test(sb)) ? 0.5 : 1;
    case 'freshwater': return c.hasRiver || /river|creek|lake|marsh|boggy|dip|silt|raised_bank/.test(sb) ? 1 : 0;
    case 'saltwater': return c.coastal || /open_water|shore|harbour/.test(sb) ? 1 : 0;
    case 'salt_or_brackish': return c.coastal || (c.hasRiver && /river_bank/.test(sb)) || /shore|harbour|open_water/.test(sb) ? 1 : 0;
    case 'groundwater': return sb === 'oasis_edge' || c.hasRiver ? 1 : 0;
  }
}

/** Ecological probability (0..1) that `resource` occurs on a micro parcel. Hard-invalid conditions return 0. */
export function foodResourceChance(r: FoodResource, c: MicroContext): number {
  const p0 = r.biomes[c.subBiome ?? ''] ?? 0;
  if (!p0) return 0;
  if (r.maxElevation != null && c.elevation != null && c.elevation > r.maxElevation) return 0;
  const p = p0 * bandFactor(c.tempBand, r.temp) * bandFactor(c.moistureBand, r.moisture) * waterFactor(r, c);
  return Math.max(0, Math.min(1, p));
}

/** FNV-1a → [0,1). Private world seed must stay server-side (survey spoilers). */
export function foodHash(seed: string, key: string, x: number, y: number): number {
  let h = 0x811c9dc5;
  const s = `${seed}|food|${key}|${x},${y}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h / 0x100000000;
}

/**
 * Deterministic occurrence: hash(seed, resource, microXY) < chance × originFactor.
 * originFactor (0..1) is supplied by worldgen per region so crops do not appear everywhere merely because
 * the climate fits; cities spread them later by seed/trade.
 */
export function foodResourcePresent(seed: string, r: FoodResource, x: number, y: number, c: MicroContext, originFactor = 1): boolean {
  return foodHash(seed, r.key, x, y) < foodResourceChance(r, c) * Math.max(0, Math.min(1, originFactor));
}

/** All potential resources of a parcel with their chance (for atlas "possible", never "revealed"). */
export function foodPotentials(c: MicroContext): { key: string; label: string; chance: number }[] {
  return FOOD_RESOURCES.map((r) => ({ key: r.key, label: r.label, chance: foodResourceChance(r, c) }))
    .filter((x) => x.chance > 0).sort((a, b) => b.chance - a.chance);
}
