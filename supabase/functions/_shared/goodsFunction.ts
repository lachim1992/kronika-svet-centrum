/**
 * Economic function catalogue — ONE typed answer to "who may buy this good, from which basket,
 * and what does one unit do". Built deterministically from the canonical production tables
 * (productionCatalog GOODS/RECIPES, foodResources, demandModel baskets, productMarket meta);
 * every rule is explicit, nothing is guessed by name.
 *
 * Contract (enforced by `auditGoodsFunctions`, never silently defaulted):
 *  - every catalogue good has exactly one demand basket and one function row;
 *  - goods with finalUse=false are industrial intermediates: no direct purchase demand from any
 *    basket; they are pulled only by downstream recipes;
 *  - household goods (need/discretionary baskets) and organisation goods (tools, construction,
 *    civic, military) carry an explicit PRODUCT_META profile in their own basket;
 *  - a physical unit belongs to one basket, so it can never satisfy two baskets in one turn;
 *  - cloth and yarn carry an explicit material identity that recipes must preserve.
 */
import { GOODS, RECIPES, type CatalogGood } from './productionCatalog.ts';
import { BASKET_DEMAND } from './demandModel.ts';
import { PRODUCT_META } from './productMarket.ts';
import { FOOD_RESOURCES, type FoodGroup } from './foodResources.ts';

export type GoodUse = 'household_final' | 'household_discretionary' | 'industrial_input' | 'institutional' | 'military' | 'construction' | 'fuel';
export type Purchaser = 'household' | 'industry' | 'state' | 'builder' | 'army' | 'none';
export type Nutrition = FoodGroup | 'dairy' | 'mixed';
export type TextileMaterial = 'flax' | 'hemp' | 'cotton' | 'wool' | 'mixed_fine';

export interface GoodFunction {
  key: string;
  basket: string;
  /** null for intermediates (they never enter product choice). */
  subbasket: string | null;
  uses: GoodUse[];
  /** Bought directly from its basket by `purchaser`; false = only consumed by recipes. */
  direct: boolean;
  purchaser: Purchaser;
  /** Functional unit one physical unit delivers (functional_value of PRODUCT_META). */
  functional_value: number | null;
  nutrition?: Nutrition;
  material?: TextileMaterial;
}

/** Basket class → the single buyer class that may purchase finished goods from that basket. */
const BASKET_PURCHASE: Record<string, { use: GoodUse; purchaser: Purchaser } | null> = {
  critical_need: { use: 'household_final', purchaser: 'household' },
  basic_need: { use: 'household_final', purchaser: 'household' },
  discretionary: { use: 'household_discretionary', purchaser: 'household' },
  luxury: { use: 'household_discretionary', purchaser: 'household' },
  operational: { use: 'industrial_input', purchaser: 'industry' },
  civic: { use: 'institutional', purchaser: 'state' },
  development: { use: 'construction', purchaser: 'builder' },
  military: { use: 'military', purchaser: 'army' },
  intermediate_only: null,
};

/** Explicit material identity of yarn and cloth. `textile_basic`/`yarn` stay the legacy flax line. */
export const TEXTILE_MATERIAL: Record<string, TextileMaterial> = {
  raw_fiber: 'flax', yarn: 'flax', textile_basic: 'flax',
  raw_hemp: 'hemp', hemp_yarn: 'hemp', textile_hemp: 'hemp',
  raw_cotton: 'cotton', cotton_yarn: 'cotton', textile_cotton: 'cotton',
  raw_wool: 'wool', wool_yarn: 'wool', textile_wool: 'wool',
  textile_fine: 'mixed_fine',
};

/** Directly edible staples by nutrition group (explicit; raw crops needing processing are excluded). */
export const NUTRITION: Record<string, Nutrition> = {
  raw_grain: 'cereal', raw_rice: 'cereal', milled_rice: 'cereal', baked_staples: 'cereal',
  raw_fish: 'fish', raw_meat: 'livestock', eggs: 'poultry', dairy_food: 'dairy',
  pulse_stew: 'legume', cooked_tubers: 'tuber', food_dates: 'fruit', dried_fruit: 'fruit',
  preserved_food: 'mixed',
};

/** Goods with a SECOND explicit use besides their basket purchase. */
const EXTRA_USES: Record<string, GoodUse[]> = {
  peat: ['fuel'], charcoal: ['fuel'], raw_coal: ['fuel'],
};

const FOOD_GROUP_BY_GOOD = new Map(FOOD_RESOURCES.map(r => [r.good, r.group]));
const RECIPE_INPUTS = new Set(RECIPES.flatMap(r => r.inputs.map(i => i.good)));

function classify(g: CatalogGood): GoodFunction {
  const spec = BASKET_DEMAND[g.basket];
  const purchase = spec ? BASKET_PURCHASE[spec.class] : null;
  const uses = new Set<GoodUse>();
  const direct = g.finalUse && !!purchase;
  if (direct) uses.add(purchase!.use);
  for (const u of EXTRA_USES[g.key] ?? []) uses.add(u);
  if (RECIPE_INPUTS.has(g.key) || !g.finalUse) uses.add('industrial_input');
  const meta = direct ? PRODUCT_META[g.key] : undefined;
  const nutrition = NUTRITION[g.key] ?? (FOOD_GROUP_BY_GOOD.get(g.key) as Nutrition | undefined);
  return {
    key: g.key, basket: g.basket, subbasket: meta?.subbasket ?? null, uses: [...uses], direct,
    purchaser: direct ? purchase!.purchaser : 'none', functional_value: meta?.functional_value ?? null,
    ...(nutrition ? { nutrition } : {}), ...(TEXTILE_MATERIAL[g.key] ? { material: TEXTILE_MATERIAL[g.key] } : {}),
  };
}

export const GOOD_FUNCTIONS: GoodFunction[] = GOODS.map(classify);
export const goodFunctionByKey = new Map(GOOD_FUNCTIONS.map(f => [f.key, f]));

/**
 * Runtime gate used by the economy adapter: may this good be bought directly from its basket?
 * Catalogue goods follow the catalogue (a DB friction_profile may only RESTRICT, never re-open an
 * intermediate); unknown legacy keys return null so the caller keeps its legacy rule.
 */
export function catalogDirectUse(key: string, dbFinalUse: boolean | undefined): boolean | null {
  const f = goodFunctionByKey.get(key);
  if (!f) return null;
  return f.direct && dbFinalUse !== false;
}

/** Static invariants over the function catalogue. Empty list = healthy. */
export function auditGoodsFunctions(): string[] {
  const errors: string[] = [];
  const dup = (keys: string[], what: string) => {
    const seen = new Set<string>();
    for (const k of keys) { if (seen.has(k)) errors.push(`duplicate ${what} key ${k}`); seen.add(k); }
  };
  dup(GOODS.map(g => g.key), 'good');
  dup(RECIPES.map(r => r.key), 'recipe');
  const goodKeys = new Set(GOODS.map(g => g.key));
  for (const g of GOODS) {
    const spec = BASKET_DEMAND[g.basket];
    if (!spec) { errors.push(`good ${g.key} has unknown basket ${g.basket}`); continue; }
    const f = goodFunctionByKey.get(g.key)!;
    if (!f.uses.length) errors.push(`good ${g.key} has no economic use`);
    if (g.finalUse && !BASKET_PURCHASE[spec.class]) errors.push(`good ${g.key} is finalUse in intermediate-only basket ${g.basket}`);
    if (g.household && !(g.finalUse && (spec.class === 'critical_need' || spec.class === 'basic_need'))) errors.push(`household baseline ${g.key} must be a finalUse need good`);
    const meta = PRODUCT_META[g.key];
    if (f.direct) {
      if (!meta) errors.push(`direct good ${g.key} has no explicit PRODUCT_META profile`);
      else if (meta.basket !== g.basket) errors.push(`PRODUCT_META ${g.key} basket ${meta.basket} != catalogue basket ${g.basket}`);
      else if (!(meta.functional_value > 0)) errors.push(`PRODUCT_META ${g.key} needs functional_value > 0`);
    } else if (meta) {
      errors.push(`intermediate ${g.key} must not carry a consumer PRODUCT_META profile`);
    }
    if (f.purchaser === 'household' && g.basket === 'staple_food' && !NUTRITION[g.key]) errors.push(`edible staple ${g.key} has no explicit nutrition group`);
    if (NUTRITION[g.key] && !f.direct) errors.push(`${g.key} has a nutrition group but is not directly edible`);
  }
  for (const k of Object.keys(PRODUCT_META)) if (!goodKeys.has(k)) errors.push(`PRODUCT_META ${k} is not a catalogue good`);
  for (const k of [...Object.keys(TEXTILE_MATERIAL), ...Object.keys(NUTRITION)]) if (!goodKeys.has(k)) errors.push(`function table references unknown good ${k}`);
  // Material identity: plain yarn/cloth recipes keep their fibre; only fine cloth may mix.
  for (const r of RECIPES) {
    const out = TEXTILE_MATERIAL[r.output];
    if (!out || out === 'mixed_fine') continue;
    for (const i of r.inputs) {
      const m = TEXTILE_MATERIAL[i.good];
      if (m && m !== out) errors.push(`recipe ${r.key} turns ${m} (${i.good}) into ${out} (${r.output})`);
    }
  }
  return errors;
}
