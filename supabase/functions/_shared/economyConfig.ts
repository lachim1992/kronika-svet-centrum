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
  famePrestige: 0.1,
  sectors: { farming: 0.4, crafting: 0.3, administration: 0.1, logistics: 0.2 },
  householdBaskets: ['staple_food', 'basic_clothing', 'tools', 'fuel', 'drinking_water', 'construction'],
  capexGoods: ['timber', 'stone_blocks', 'bricks', 'lumber'],
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
export const INDUSTRIAL_INPUTS = ['raw_ore', 'raw_fiber', 'raw_hide', 'yarn', 'iron_ingot', 'copper_ingot', 'flour'];
export const HOUSEHOLD_GOODS: Record<string, string[]> = {
  staple_food: ['grain', 'raw_grain', 'fish'], basic_clothing: ['textile_basic'],
  tools: ['basic_tools'], fuel: ['firewood', 'timber', 'peat'],
  drinking_water: ['well_water'], construction: ['timber', 'raw_stone'],
};
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
  feast: 'crafting', construction: 'crafting', admin_supplies: 'administration', storage_logistics: 'logistics',
};
export const BASKET_TIER: Record<string, number> = { staple_food:1, basic_clothing:1, tools:1, fuel:1,
  drinking_water:2, storage_logistics:2, admin_supplies:2, construction:3, metalwork:3,
  military_supply:4, luxury_clothing:6, feast:6 };
