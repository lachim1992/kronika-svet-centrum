import { GOODS } from './productionCatalog.ts';

/** All new economy coefficients live here. Quantities and monetary values stay separate. */
export const ECONOMY = {
  epsilon: 1e-8, minLot: 0.01, transportUnitCost: 0.12, waterBulkEfficiency: 0.18,
  transshipmentCost: 0.15, reserveTurns: 0.25, householdRate: 0.012,
  irrigationGain: 0.1, qualityPremium: 0.15, localReach: 8, regionalReach: 24,
  merchantMargin: 0.05, hubDistanceExponent: 1.4, warehouseCapacity: 25,
  marketPull: 3, storagePull: 0.1, adminPull: 0.5, centralityPull: 2,
  fameTurns: 3, fameGain: 8, fameDecay: 12, fameMinOutput: 2, fameMinExport: 1,
  fameMinQuality: 2, fameSpecialization: 0.4, famePremium: 0.25, fameDemand: 0.003,
  populationDemand: 0.01, armyDemand: 0.004, maxProductionPasses: 16,
  guildProductivity: 0.15, riverFriction: 0.8, riverCapacity: 70,
  priceScarcityGain: 1.4, priceGlutRelief: 0.35, priceFloor: 0.45, priceCeiling: 3.2,
  priceStorageRelief: 0.05, priceRiskCost: 0.04, arbitrageMargin: 0.03,

  /** Industrial inputs travel further than household shopping: factories pay for reach. */
  inputReachBonus: 2.5,
  famePrestige: 0.1,
  sectors: { farming: 0.4, crafting: 0.3, administration: 0.1, logistics: 0.2 },
  /**
   * TRUE household-consumption baskets only. Tools are durable operational support of industry
   * and construction materials belong to building sites, so neither is a household basket any
   * more (see demandModel.ts for the canonical demand classes).
   */
  householdBaskets: ['staple_food', 'basic_clothing', 'fuel', 'drinking_water'],
  capexGoods: ['stone_blocks', 'lumber', 'construction_materials'],
  /**
   * LABOR ECONOMY. Population supplies labour, never goods. A structure declares how many
   * workers it can employ (jobs_capacity); the city labour market fills those jobs from the
   * civilian workforce of the relevant sector. Staffing then scales potential output.
   *
   * jobs_capacity = capacity × allocation × recipe.labor / recipe.qty × workersPerLaborUnit
   * (one canonical interpretation; capacity already carries the level scaling)
   *
   * HEADCOUNT SCALE. One labour unit is a whole work crew, not one person, so the jobs a
   * structure declares are real headcounts. Calibration: a level-1 production centre asks
   * ~2-3 labour units, i.e. ~40-60 people; one residential quarter (250 inhabitants → ~125
   * economically active) therefore staffs roughly two production centres, and higher levels
   * raise both the headcount and the output through levelCapacityScale.
   */
  workersPerLaborUnit: 20,
  /** Capacity multiplier per structure level: Lv1 = 1, Lv2 = 1.8, Lv3 = 3, … */
  levelCapacityScale: [1, 1.8, 3, 4.2, 5.4],
  /**
   * Households no longer emit tradeable market goods. Population creates labour and demand;
   * physical goods come only from structures, districts and production nodes.
   */
  householdProduction: false,
} as const;
/** Existing city allocations use percentages and the historical scribes/canal keys. */
export function normalizeLabor(value: Record<string, number> = {}) {
  if (!Object.keys(value).length) return { ...ECONOMY.sectors };
  const values = { farming: value.farming ?? 0, crafting: value.crafting ?? 0,
    administration: value.administration ?? value.scribes ?? 0,
    logistics: value.logistics ?? value.maintenance ?? value.canal ?? 0 };
  const total = Object.values(values).reduce((s, n) => s + Math.max(0, Number(n) || 0), 0);
  return Object.fromEntries(Object.entries(values).map(([k, n]) => [k, total ? Math.max(0, Number(n) || 0) / total : 0]));
}
/**
 * Explicit final-use metadata comes from goods.friction_profile.final_use; the catalog mirror
 * is the canonical fallback and this legacy list is only the last resort for unknown keys.
 */
export const INDUSTRIAL_INPUTS = [
  'raw_ore', 'raw_fiber', 'raw_hide', 'raw_stone', 'raw_timber', 'raw_olives', 'raw_grapes',
  'raw_incense', 'yarn', 'leather', 'iron_ingot', 'copper_ingot', 'flour',
];
/** Catalog-derived final-use / household classification (no stale aliases). */
export const GOOD_FINAL_USE: Record<string, boolean> = Object.fromEntries(GOODS.map((g) => [g.key, g.finalUse]));
export const GOOD_HOUSEHOLD: Record<string, boolean> = Object.fromEntries(GOODS.map((g) => [g.key, g.household]));
/** Household subsistence baseline per basket, derived from the catalog. */
export const HOUSEHOLD_GOODS: Record<string, string[]> = GOODS.filter((g) => g.household)
  .reduce((acc: Record<string, string[]>, g) => { (acc[g.basket] ||= []).push(g.key); return acc; }, {});
export const DEMAND_WEIGHTS: Record<string, Record<string,number>> = {
  staple_food:{peasants:1,burghers:0.6,clerics:0.3,warriors:0.8},
  basic_clothing:{peasants:0.4,burghers:0.7,clerics:0.5,warriors:0.3},
  tools:{peasants:0.7,burghers:0.5,clerics:0.2,warriors:0.4},
  fuel:{peasants:0.6,burghers:0.5,clerics:0.3,warriors:0.4},
  drinking_water:{peasants:0.8,burghers:0.7,clerics:0.5,warriors:0.6},
  storage_logistics:{peasants:0.2,burghers:0.8,clerics:0.3,warriors:0.3},
  admin_supplies:{peasants:0.1,burghers:0.4,clerics:0.7,warriors:0.2},
  construction:{peasants:0.3,burghers:0.6,clerics:0.4,warriors:0.3},
  metalwork:{peasants:0.5,burghers:0.7,clerics:0.2,warriors:0.4},
  military_supply:{peasants:0.1,burghers:0.2,clerics:0.1,warriors:1},
  luxury_clothing:{peasants:0.05,burghers:0.5,clerics:0.3,warriors:0.6},
  feast:{peasants:0.1,burghers:0.6,clerics:0.4,warriors:0.4},
  variety:{peasants:0.3,burghers:0.7,clerics:0.4,warriors:0.3},
};
export type Sector = keyof typeof ECONOMY.sectors;
export const IDEOLOGIES = {
  customary_local: { retention: 0.6, merchantFriction: 1.8, reach: 0.6, tariff: 0, quality: 1, statePriority: 1, imports: 1 },
  open_merchant: { retention: 0.1, merchantFriction: 0.7, reach: 1.6, tariff: 0, quality: 1, statePriority: 1, imports: 1 },
  guild_chartered: { retention: 0.3, merchantFriction: 1, reach: 1, tariff: 0.03, quality: 1.1, statePriority: 1, imports: 1 },
  crown_mercantile: { retention: 0.2, merchantFriction: 1, reach: 1.2, tariff: 0.1, quality: 1, statePriority: 1.5, imports: 0.7 },
  palace_commanded: { retention: 0.5, merchantFriction: 1.5, reach: 0.7, tariff: 0, quality: 1, statePriority: 2, imports: 1 },
};
export const BASKET_SECTOR: Record<string, Sector> = {
  staple_food: 'farming', drinking_water: 'farming', fuel: 'farming', basic_clothing: 'crafting',
  tools: 'crafting', metalwork: 'crafting', military_supply: 'crafting', luxury_clothing: 'crafting',
  feast: 'crafting', variety: 'crafting', construction: 'crafting', admin_supplies: 'administration', storage_logistics: 'logistics',
};
/**
 * PRODUCTION PRIORITY weight only (auto production orders, build catalogue previews).
 * It is NO LONGER a demand model: demand classes live in demandModel.ts.
 */
export const BASKET_TIER: Record<string, number> = { staple_food:1, basic_clothing:1, tools:1, fuel:1,
  drinking_water:2, storage_logistics:2, admin_supplies:2, construction:3, metalwork:3,
  military_supply:4, variety:5, luxury_clothing:6, feast:6 };
