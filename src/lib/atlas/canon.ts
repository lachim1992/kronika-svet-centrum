/**
 * Thin client re-export of canonical economy contracts. No logic lives here:
 * Atlas must read the same tables the engine uses (parity test in atlas-canon.test.ts).
 */
export { BASKET_DEMAND, BASKET_GROUPS, type BasketDemandSpec } from "../../../supabase/functions/_shared/demandModel.ts";
export { PRODUCT_META, substitutionEfficiency, type ProductMeta } from "../../../supabase/functions/_shared/productMarket.ts";
export { PRODUCTION_BUILDINGS, producersOfRecipe } from "../../../supabase/functions/_shared/productionCatalog.ts";
export { parcelPotential, type EconomicParcel, type ParcelTerrain } from "../../../supabase/functions/_shared/parcelEconomy.ts";
