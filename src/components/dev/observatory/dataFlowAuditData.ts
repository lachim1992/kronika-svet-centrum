/**
 * Static audit: who writes/reads each key DB column.
 * UPDATED 2026-04: Full v4.1 goods pipeline, Phase 4 social metrics,
 * migration, legitimacy, labor allocation.
 */

export type Writer = "process-turn" | "world-tick" | "commit-turn" | "command-dispatch" | "UI" | "generate-civ-start" | "process-tick" | "city-seed" | "ai-faction-turn" | "council-session" | "collapse-chain" | "world-generate-init" | "declaration-effects" | "resolve-battle" | "compute-economy-flow" | "compute-province-nodes" | "check-victory" | "law-process" | "chronicle" | "wiki-generate" | "rumor-engine" | "backfill-wiki" | "academy-tick" | "games-resolve" | "explore-hex" | "backfill-economy-tags" | "compute-trade-flows" | "compute-hex-flows" | "compute-province-routes" | "recompute-all";

export type Reader = "process-turn" | "world-tick" | "commit-turn" | "UI" | "AI context" | "ai-faction-turn" | "council-session" | "check-victory" | "chronicle" | "compute-economy-flow" | "compute-province-nodes" | "cityprofile" | "resolve-battle" | "EconomyTab" | "compute-trade-flows";

export interface DataFlowEntry {
  table: string;
  column: string;
  writers: Writer[];
  readers: Reader[];
  liveUsed: boolean;
  notes?: string;
  /** Action recommendation for dead/unused columns */
  action?: "remove" | "implement" | "reserved";
}

export const DATA_FLOW_AUDIT: DataFlowEntry[] = [
  // === CITIES - core columns ===
  { table: "cities", column: "population_total", writers: ["process-turn", "generate-civ-start"], readers: ["UI", "EconomyTab", "process-turn", "world-tick", "AI context", "check-victory"], liveUsed: true, notes: "Růst: base_rate(1.2%)×food×stability×housing. 4 třídy." },
  { table: "cities", column: "population_peasants", writers: ["process-turn", "generate-civ-start"], readers: ["UI", "EconomyTab", "process-turn", "compute-economy-flow"], liveUsed: true },
  { table: "cities", column: "population_burghers", writers: ["process-turn", "generate-civ-start"], readers: ["UI", "EconomyTab", "compute-economy-flow"], liveUsed: true },
  { table: "cities", column: "population_clerics", writers: ["process-turn", "generate-civ-start"], readers: ["UI", "EconomyTab", "compute-economy-flow"], liveUsed: true },
  { table: "cities", column: "population_warriors", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "cities", column: "city_stability", writers: ["world-tick"], readers: ["UI", "EconomyTab", "world-tick", "AI context", "resolve-battle"], liveUsed: true },
  { table: "cities", column: "local_grain_reserve", writers: ["process-turn"], readers: ["UI", "EconomyTab", "process-turn"], liveUsed: true },
  { table: "cities", column: "famine_turn", writers: ["process-turn"], readers: ["UI", "EconomyTab", "world-tick", "process-turn"], liveUsed: true },
  { table: "cities", column: "famine_severity", writers: ["process-turn"], readers: ["world-tick", "process-turn"], liveUsed: true },
  { table: "cities", column: "ration_policy", writers: ["UI"], readers: ["process-turn"], liveUsed: true },
  { table: "cities", column: "labor_allocation", writers: ["UI"], readers: ["world-tick"], liveUsed: true, notes: "✅ Phase 4: farming→food_mod, crafting→prod_mod, canal→irrigation, scribes→mobility" },
  { table: "cities", column: "legitimacy", writers: ["world-tick"], readers: ["UI", "world-tick"], liveUsed: true, notes: "✅ Phase 4: drift dle demand_sat, famine, temple, conquest. Downstream: stabilita, rebelie." },
  { table: "cities", column: "local_renown", writers: ["world-tick", "games-resolve"], readers: ["UI", "check-victory"], liveUsed: true },
  { table: "cities", column: "influence_score", writers: ["world-tick"], readers: ["UI", "check-victory"], liveUsed: true },
  { table: "cities", column: "migration_pressure", writers: ["world-tick"], readers: ["world-tick"], liveUsed: true, notes: "✅ Phase 4: push/pull → resolveMigration()" },
  { table: "cities", column: "last_migration_in", writers: ["world-tick"], readers: ["UI"], liveUsed: true, notes: "✅ Phase 4: počet imigrantů z resolveMigration()" },
  { table: "cities", column: "last_migration_out", writers: ["world-tick"], readers: ["UI"], liveUsed: true, notes: "✅ Phase 4: počet emigrantů z resolveMigration()" },
  { table: "cities", column: "disease_level", writers: ["world-tick"], readers: ["world-tick"], liveUsed: true },
  { table: "cities", column: "vulnerability_score", writers: ["world-tick"], readers: ["AI context", "ai-faction-turn"], liveUsed: true },
  { table: "cities", column: "development_level", writers: ["world-tick"], readers: ["UI"], liveUsed: true },
  { table: "cities", column: "housing_capacity", writers: ["world-tick", "generate-civ-start"], readers: ["world-tick", "process-turn"], liveUsed: true },
  { table: "cities", column: "military_garrison", writers: ["world-tick", "resolve-battle"], readers: ["world-tick", "UI", "EconomyTab"], liveUsed: true },
  { table: "cities", column: "settlement_level", writers: ["process-turn"], readers: ["UI", "EconomyTab", "world-tick"], liveUsed: true },
  { table: "cities", column: "special_resource_type", writers: ["generate-civ-start", "world-generate-init"], readers: ["UI", "compute-province-nodes"], liveUsed: true },
  { table: "cities", column: "overcrowding_ratio", writers: ["world-tick"], readers: ["world-tick"], liveUsed: true },
  { table: "cities", column: "market_level", writers: ["world-tick"], readers: ["compute-economy-flow", "process-turn"], liveUsed: true },
  { table: "cities", column: "temple_level", writers: ["world-tick"], readers: ["UI", "EconomyTab", "process-turn"], liveUsed: true },
  { table: "cities", column: "birth_rate", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "cities", column: "death_rate", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "cities", column: "irrigation_level", writers: ["world-tick"], readers: ["process-turn"], liveUsed: true },
  { table: "cities", column: "famine_consecutive_turns", writers: ["process-turn"], readers: ["world-tick"], liveUsed: true, notes: "Used in legitimacy drift and migration push" },
  { table: "cities", column: "epidemic_active", writers: ["world-tick"], readers: ["world-tick"], liveUsed: true, notes: "Migration push factor" },

  // === REALM_RESOURCES ===
  { table: "realm_resources", column: "total_production", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "total_wealth", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "total_capacity", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "total_importance", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "grain_reserve", writers: ["process-turn"], readers: ["UI", "EconomyTab", "process-turn"], liveUsed: true },
  { table: "realm_resources", column: "gold_reserve", writers: ["process-turn"], readers: ["UI", "EconomyTab", "process-turn"], liveUsed: true },
  { table: "realm_resources", column: "production_reserve", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "faith", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "faith_growth", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "mobilization_rate", writers: ["command-dispatch"], readers: ["process-turn", "world-tick", "UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "military_prestige", writers: ["process-turn", "resolve-battle"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "cultural_prestige", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "economic_prestige", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "sport_prestige", writers: ["games-resolve"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "geopolitical_prestige", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "technological_prestige", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "strategic_iron_tier", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "strategic_horses_tier", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "strategic_salt_tier", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "last_turn_grain_prod", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "last_turn_grain_cons", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "last_turn_grain_net", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "granary_capacity", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "famine_city_count", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "goods_production_value", writers: ["compute-economy-flow"], readers: ["process-turn", "UI"], liveUsed: true, notes: "v4.1: Goods layer production aggregate" },
  { table: "realm_resources", column: "goods_supply_volume", writers: ["compute-economy-flow"], readers: ["process-turn", "UI"], liveUsed: true, notes: "v4.1: Goods layer supply aggregate" },
  { table: "realm_resources", column: "goods_wealth_fiscal", writers: ["compute-economy-flow"], readers: ["process-turn", "UI"], liveUsed: true, notes: "v4.1: Goods layer fiscal aggregate" },
  { table: "realm_resources", column: "economy_version", writers: ["compute-economy-flow"], readers: ["process-turn"], liveUsed: true, notes: "v4.1: 3=legacy, 4=goods blend" },
  { table: "realm_resources", column: "computed_modifiers", writers: ["compute-economy-flow"], readers: ["UI"], liveUsed: true, notes: "JSON with goods_economy detail for tooltips" },

  // === PROVINCE_NODES ===
  { table: "province_nodes", column: "production_output", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab", "compute-economy-flow"], liveUsed: true },
  { table: "province_nodes", column: "wealth_output", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "province_nodes", column: "capacity_score", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "province_nodes", column: "importance_score", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab", "AI context"], liveUsed: true },
  { table: "province_nodes", column: "connectivity_score", writers: ["compute-economy-flow"], readers: ["compute-economy-flow"], liveUsed: true },
  { table: "province_nodes", column: "isolation_penalty", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "province_nodes", column: "flow_role", writers: ["compute-province-nodes"], readers: ["compute-economy-flow", "UI", "EconomyTab"], liveUsed: true },
  { table: "province_nodes", column: "strategic_resource_type", writers: ["compute-province-nodes", "explore-hex"], readers: ["UI", "EconomyTab", "compute-economy-flow"], liveUsed: true },
  { table: "province_nodes", column: "strategic_resource_tier", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "province_nodes", column: "incoming_production", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "province_nodes", column: "capability_tags", writers: ["compute-province-nodes", "UI", "backfill-economy-tags"], readers: ["compute-economy-flow", "UI", "EconomyTab"], liveUsed: true, notes: "v4.1: Recipe matching key" },
  { table: "province_nodes", column: "production_role", writers: ["compute-province-nodes", "UI"], readers: ["compute-economy-flow", "UI"], liveUsed: true, notes: "v4.1: source/processing/urban/guild" },
  { table: "province_nodes", column: "guild_level", writers: ["UI"], readers: ["compute-economy-flow", "UI", "EconomyTab"], liveUsed: true, notes: "v4.1: 0-5, quality/famous/export" },
  { table: "province_nodes", column: "specialization_scores", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },

  // === NODE_INVENTORY ===
  { table: "node_inventory", column: "good_key", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab", "compute-trade-flows"], liveUsed: true },
  { table: "node_inventory", column: "quantity", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab", "compute-trade-flows"], liveUsed: true },
  { table: "node_inventory", column: "quality_band", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },

  // === DEMAND_BASKETS ===
  { table: "demand_baskets", column: "basket_type", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab", "compute-trade-flows"], liveUsed: true },
  { table: "demand_baskets", column: "satisfaction", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab", "process-turn", "world-tick"], liveUsed: true, notes: "Used by legitimacy drift" },
  { table: "demand_baskets", column: "deficit_volume", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab", "compute-trade-flows"], liveUsed: true },

  // === TRADE_FLOWS ===
  { table: "trade_flows", column: "flow_volume", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "trade_flows", column: "pressure_score", writers: ["compute-economy-flow"], readers: ["UI"], liveUsed: true },
  { table: "trade_flows", column: "flow_status", writers: ["compute-economy-flow"], readers: ["UI"], liveUsed: true },

  // === CITY_MARKET_SUMMARY ===
  { table: "city_market_summary", column: "supply_volume", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "city_market_summary", column: "demand_volume", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "city_market_summary", column: "domestic_share", writers: ["compute-economy-flow"], readers: ["UI"], liveUsed: true },
  { table: "city_market_summary", column: "price_band", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "city_market_summary", column: "price_numeric", writers: ["compute-economy-flow"], readers: ["UI"], liveUsed: true },

  // === PROVINCES ===
  { table: "provinces", column: "total_tension", writers: ["world-tick"], readers: ["UI", "world-tick", "AI context"], liveUsed: true },
  { table: "provinces", column: "stability_avg", writers: ["world-tick"], readers: ["UI"], liveUsed: true },

  // === MILITARY ===
  { table: "military_stacks", column: "total_strength", writers: ["command-dispatch", "resolve-battle"], readers: ["UI", "EconomyTab", "resolve-battle", "AI context"], liveUsed: true },
  { table: "military_stacks", column: "morale", writers: ["world-tick", "resolve-battle"], readers: ["UI", "resolve-battle"], liveUsed: true },
  { table: "military_stacks", column: "military_stack_composition", writers: ["command-dispatch"], readers: ["UI", "EconomyTab"], liveUsed: true },

  // === DISCOVERIES ===
  { table: "discoveries", column: "entity_type", writers: ["explore-hex"], readers: ["UI"], liveUsed: true },

  // === NARRATIVE ===
  { table: "chronicle_entries", column: "text", writers: ["chronicle"], readers: ["UI", "AI context"], liveUsed: true },
  { table: "wiki_entries", column: "summary", writers: ["wiki-generate", "backfill-wiki"], readers: ["UI", "AI context"], liveUsed: true },
  { table: "city_rumors", column: "text", writers: ["rumor-engine"], readers: ["UI", "chronicle", "AI context"], liveUsed: true },
  { table: "diplomatic_memory", column: "memory_type", writers: ["declaration-effects", "council-session"], readers: ["AI context", "ai-faction-turn"], liveUsed: true },

  // === INFRASTRUCTURE ===
  { table: "province_routes", column: "path_dirty", writers: ["world-tick", "UI"], readers: ["compute-province-routes", "compute-hex-flows"], liveUsed: true, notes: "Trigger-based dirty flag" },
  { table: "province_routes", column: "capacity_value", writers: ["compute-province-routes"], readers: ["compute-economy-flow", "process-turn"], liveUsed: true },
  { table: "flow_paths", column: "hex_path", writers: ["compute-hex-flows"], readers: ["UI", "compute-economy-flow"], liveUsed: true },

  // === GOODS ===
  { table: "goods", column: "key", writers: ["world-generate-init"], readers: ["compute-economy-flow", "UI"], liveUsed: true, notes: "Static goods catalog (45 entries)" },
  { table: "production_recipes", column: "required_tags", writers: ["world-generate-init"], readers: ["compute-economy-flow"], liveUsed: true, notes: "Static recipe definitions" },
];

// Summary stats
export function getAuditSummary() {
  const total = DATA_FLOW_AUDIT.length;
  const deadColumns = DATA_FLOW_AUDIT.filter(e => !e.liveUsed);
  const noReaders = DATA_FLOW_AUDIT.filter(e => e.readers.length === 0);
  const uiOnly = DATA_FLOW_AUDIT.filter(e => e.readers.length === 1 && e.readers[0] === "UI" && !e.liveUsed);
  const fakeColumns = DATA_FLOW_AUDIT.filter(e => e.notes?.includes("FAKE"));
  const withActions = DATA_FLOW_AUDIT.filter(e => e.action);

  return { total, deadColumns, noReaders, uiOnly, fakeColumns, withActions };
}
