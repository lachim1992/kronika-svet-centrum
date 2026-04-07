/**
 * Static audit: who writes/reads each key DB column.
 * Based on codebase analysis of edge functions, UI components, and engine logic.
 *
 * UPDATED 2026-03: Reflects unified economy, population growth engine,
 * capacity limits, faith bonuses, prestige sub-types, workforce system.
 */

export type Writer = "process-turn" | "world-tick" | "commit-turn" | "command-dispatch" | "UI" | "generate-civ-start" | "process-tick" | "city-seed" | "ai-faction-turn" | "council-session" | "collapse-chain" | "world-generate-init" | "declaration-effects" | "resolve-battle" | "compute-economy-flow" | "compute-province-nodes" | "check-victory" | "law-process" | "chronicle" | "wiki-generate" | "rumor-engine" | "backfill-wiki" | "academy-tick" | "games-resolve" | "explore-hex" | "backfill-economy-tags";

export type Reader = "process-turn" | "world-tick" | "commit-turn" | "UI" | "AI context" | "ai-faction-turn" | "council-session" | "check-victory" | "chronicle" | "compute-economy-flow" | "compute-province-nodes" | "cityprofile" | "resolve-battle" | "EconomyTab";

export interface DataFlowEntry {
  table: string;
  column: string;
  writers: Writer[];
  readers: Reader[];
  liveUsed: boolean;
  notes?: string;
}

export const DATA_FLOW_AUDIT: DataFlowEntry[] = [
  // === CITIES - core columns ===
  { table: "cities", column: "population_total", writers: ["process-turn", "generate-civ-start"], readers: ["UI", "EconomyTab", "process-turn", "world-tick", "AI context", "check-victory"], liveUsed: true, notes: "Růst: base_rate(1.2%)×food×stability×housing. 4 třídy." },
  { table: "cities", column: "population_peasants", writers: ["process-turn", "generate-civ-start"], readers: ["UI", "EconomyTab", "process-turn", "compute-economy-flow"], liveUsed: true, notes: "55% růstu. Active_pop weight: 1.0. Produkce obilí." },
  { table: "cities", column: "population_burghers", writers: ["process-turn", "generate-civ-start"], readers: ["UI", "EconomyTab", "compute-economy-flow"], liveUsed: true, notes: "20%+market_level růstu. Active_pop weight: 0.7. +wealth." },
  { table: "cities", column: "population_clerics", writers: ["process-turn", "generate-civ-start"], readers: ["UI", "EconomyTab", "compute-economy-flow"], liveUsed: true, notes: "10%+temple_level růstu. Active_pop weight: 0.2. +faith +capacity." },
  { table: "cities", column: "population_warriors", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true, notes: "Dle garrison. Nezapočítávají se do active_pop." },
  { table: "cities", column: "city_stability", writers: ["world-tick"], readers: ["UI", "EconomyTab", "world-tick", "AI context", "resolve-battle"], liveUsed: true, notes: "Base 50. −5%/hladomor. +0.2%/víra. Pod 30%=rebelie." },
  { table: "cities", column: "local_grain_reserve", writers: ["process-turn"], readers: ["UI", "EconomyTab", "process-turn"], liveUsed: true },
  { table: "cities", column: "famine_turn", writers: ["process-turn"], readers: ["UI", "EconomyTab", "world-tick", "process-turn"], liveUsed: true },
  { table: "cities", column: "famine_severity", writers: ["process-turn"], readers: ["world-tick", "process-turn"], liveUsed: true },
  { table: "cities", column: "ration_policy", writers: ["UI"], readers: ["process-turn"], liveUsed: true, notes: "Přímá hráčská akce → engine ji čte" },
  { table: "cities", column: "labor_allocation", writers: ["UI"], readers: ["world-tick"], liveUsed: true, notes: "✅ Fáze 4: world-tick volá computeSocialMobility() + computeLaborModifiers(). farming→food_mod, crafting→prod_mod, canal→irrigation, scribes→mobilita." },
  { table: "cities", column: "legitimacy", writers: ["world-tick"], readers: ["UI", "world-tick"], liveUsed: true, notes: "✅ Fáze 4: computeLegitimacyDrift(). Drift dle demand_satisfaction, famine, temple, conquest, policies. Downstream: stabilita, rebelie práh." },
  { table: "cities", column: "local_renown", writers: ["world-tick", "games-resolve"], readers: ["UI", "check-victory"], liveUsed: true },
  { table: "cities", column: "influence_score", writers: ["world-tick"], readers: ["UI", "check-victory"], liveUsed: true },
  { table: "cities", column: "migration_pressure", writers: ["world-tick"], readers: ["world-tick"], liveUsed: true, notes: "✅ Fáze 4: computeMigrationPressure(). Push: hladomor, přelidnění, nestabilita, epidemie. Pull: stabilita, trh, housing. Spouští resolveMigration()." },
  { table: "cities", column: "disease_level", writers: ["world-tick"], readers: ["world-tick"], liveUsed: true, notes: "Interní engine loop — spouští epidemie" },
  { table: "cities", column: "vulnerability_score", writers: ["world-tick"], readers: ["AI context", "ai-faction-turn"], liveUsed: true, notes: "AI-only: identifikace slabých míst" },
  { table: "cities", column: "development_level", writers: ["world-tick"], readers: ["UI"], liveUsed: true, notes: "Nyní vizualizován v PopulationPanel s progress bary k next level" },
  { table: "cities", column: "housing_capacity", writers: ["world-tick", "generate-civ-start"], readers: ["world-tick", "process-turn"], liveUsed: true, notes: "housing_mult = min(1.0, capacity/pop) v růstu" },
  { table: "cities", column: "military_garrison", writers: ["world-tick", "resolve-battle"], readers: ["world-tick", "UI", "EconomyTab"], liveUsed: true },
  { table: "cities", column: "settlement_level", writers: ["process-turn"], readers: ["UI", "EconomyTab", "world-tick"], liveUsed: true, notes: "Auto-upgrade: 100→VILLAGE, 500→TOWNSHIP, 2000→TOWN, 8000→CITY, 20000→POLIS" },
  { table: "cities", column: "special_resource_type", writers: ["generate-civ-start", "world-generate-init"], readers: ["UI", "compute-province-nodes"], liveUsed: true, notes: "Narativní efekty — mechanické odemčení přes tiered access" },
  { table: "cities", column: "overcrowding_ratio", writers: ["world-tick"], readers: ["world-tick"], liveUsed: true },
  { table: "cities", column: "market_level", writers: ["world-tick"], readers: ["compute-economy-flow", "process-turn"], liveUsed: true, notes: "Ovlivňuje % měšťanů při růstu" },
  { table: "cities", column: "temple_level", writers: ["world-tick"], readers: ["UI", "EconomyTab", "process-turn"], liveUsed: true, notes: "+0.5 víry/level/kolo. Ovlivňuje % kleriků při růstu." },
  { table: "cities", column: "birth_rate", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "cities", column: "death_rate", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "cities", column: "irrigation_level", writers: ["world-tick"], readers: ["process-turn"], liveUsed: true, notes: "Multiplikátor produkce obilí" },

  // === REALM_RESOURCES ===
  { table: "realm_resources", column: "total_production", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true, notes: "Produkce — pilíř 1/6" },
  { table: "realm_resources", column: "total_wealth", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true, notes: "Bohatství — pilíř 2/6" },
  { table: "realm_resources", column: "total_capacity", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true, notes: "Kapacita — pilíř 4/6. Limituje projekty(cap/5), trasy(cap/3), provincie(cap/10)." },
  { table: "realm_resources", column: "total_importance", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "grain_reserve", writers: ["process-turn"], readers: ["UI", "EconomyTab", "process-turn"], liveUsed: true, notes: "Zásoby — pilíř 3/6" },
  { table: "realm_resources", column: "gold_reserve", writers: ["process-turn"], readers: ["UI", "EconomyTab", "process-turn"], liveUsed: true },
  { table: "realm_resources", column: "production_reserve", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "faith", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true, notes: "Víra — pilíř 5/6. +0.5% morálka/bod, +0.2% stabilita/bod." },
  { table: "realm_resources", column: "faith_growth", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "mobilization_rate", writers: ["command-dispatch"], readers: ["process-turn", "world-tick", "UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "military_prestige", writers: ["process-turn", "resolve-battle"], readers: ["UI", "EconomyTab"], liveUsed: true, notes: "Prestiž sub-typ 1/6" },
  { table: "realm_resources", column: "cultural_prestige", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true, notes: "Prestiž sub-typ 2/6" },
  { table: "realm_resources", column: "economic_prestige", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true, notes: "Prestiž sub-typ 3/6" },
  { table: "realm_resources", column: "sport_prestige", writers: ["games-resolve"], readers: ["UI", "EconomyTab"], liveUsed: true, notes: "Prestiž sub-typ 4/6" },
  { table: "realm_resources", column: "geopolitical_prestige", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true, notes: "Prestiž sub-typ 5/6" },
  { table: "realm_resources", column: "technological_prestige", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true, notes: "Prestiž sub-typ 6/6" },
  { table: "realm_resources", column: "strategic_iron_tier", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true, notes: "Tiered access: 0-3" },
  { table: "realm_resources", column: "strategic_horses_tier", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "strategic_salt_tier", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "last_turn_grain_prod", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "last_turn_grain_cons", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "last_turn_grain_net", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "granary_capacity", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "realm_resources", column: "famine_city_count", writers: ["process-turn"], readers: ["UI", "EconomyTab"], liveUsed: true },

  // === PROVINCE_NODES ===
  { table: "province_nodes", column: "production_output", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab", "compute-economy-flow"], liveUsed: true },
  { table: "province_nodes", column: "wealth_output", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "province_nodes", column: "capacity_score", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "province_nodes", column: "importance_score", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab", "AI context"], liveUsed: true },
  { table: "province_nodes", column: "connectivity_score", writers: ["compute-economy-flow"], readers: ["compute-economy-flow"], liveUsed: true },
  { table: "province_nodes", column: "isolation_penalty", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true, notes: "A* pathfinding k hlavnímu městu" },
  { table: "province_nodes", column: "flow_role", writers: ["compute-province-nodes"], readers: ["compute-economy-flow", "UI", "EconomyTab"], liveUsed: true },
  { table: "province_nodes", column: "strategic_resource_type", writers: ["compute-province-nodes", "explore-hex"], readers: ["UI", "EconomyTab", "compute-economy-flow"], liveUsed: true, notes: "Odhalováno explore-hex. 11 typů." },
  { table: "province_nodes", column: "strategic_resource_tier", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "province_nodes", column: "incoming_production", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true, notes: "Minor→major flow: 50% produkce" },

  // === PROVINCES ===
  { table: "provinces", column: "total_tension", writers: ["world-tick"], readers: ["UI", "world-tick", "AI context"], liveUsed: true },
  { table: "provinces", column: "stability_avg", writers: ["world-tick"], readers: ["UI"], liveUsed: true },

  // === MILITARY ===
  { table: "military_stacks", column: "total_strength", writers: ["command-dispatch", "resolve-battle"], readers: ["UI", "EconomyTab", "resolve-battle", "AI context"], liveUsed: true },
  { table: "military_stacks", column: "morale", writers: ["world-tick", "resolve-battle"], readers: ["UI", "resolve-battle"], liveUsed: true },
  { table: "military_stacks", column: "military_stack_composition", writers: ["command-dispatch"], readers: ["UI", "EconomyTab"], liveUsed: true, notes: "Per-unit manpower → upkeep calc" },

  // === DISCOVERIES ===
  { table: "discoveries", column: "entity_type", writers: ["explore-hex"], readers: ["UI"], liveUsed: true, notes: "Fog-of-war reveal: strategic_resource discoveries" },

  // === PROVINCE_NODES — goods economy fields ===
  { table: "province_nodes", column: "capability_tags", writers: ["compute-province-nodes", "UI"], readers: ["compute-economy-flow", "UI", "EconomyTab"], liveUsed: true, notes: "Klíč pro matchování production_recipes. Hydratováno backfill-economy-tags." },
  { table: "province_nodes", column: "production_role", writers: ["compute-province-nodes", "UI"], readers: ["compute-economy-flow", "UI"], liveUsed: true, notes: "source/processing/urban/guild — filtr receptů" },
  { table: "province_nodes", column: "guild_level", writers: ["UI"], readers: ["compute-economy-flow", "UI", "EconomyTab"], liveUsed: true, notes: "0-5. Ovlivňuje kvalitu, famous goods, export reach." },
  { table: "province_nodes", column: "specialization_scores", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true, notes: "Kumulativní produkční historie per branch" },

  // === NODE_INVENTORY ===
  { table: "node_inventory", column: "good_key", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true, notes: "Výstup receptu — klíč do goods tabulky" },
  { table: "node_inventory", column: "quantity", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "node_inventory", column: "quality_band", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },

  // === DEMAND_BASKETS ===
  { table: "demand_baskets", column: "basket_type", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true, notes: "staple_food, tools, construction, military, ritual, luxury..." },
  { table: "demand_baskets", column: "satisfaction", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab", "process-turn"], liveUsed: true, notes: "0.0-1.0 — klíč pro trade pressure a stabilitu" },
  { table: "demand_baskets", column: "deficit_volume", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },

  // === TRADE_FLOWS ===
  { table: "trade_flows", column: "flow_volume", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true, notes: "Objem obchodu mezi městy" },
  { table: "trade_flows", column: "pressure_score", writers: ["compute-economy-flow"], readers: ["UI"], liveUsed: true },
  { table: "trade_flows", column: "flow_status", writers: ["compute-economy-flow"], readers: ["UI"], liveUsed: true, notes: "latent/trial/active/dominant/blocked" },

  // === CITY_MARKET_SUMMARY ===
  { table: "city_market_summary", column: "supply_volume", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "city_market_summary", column: "demand_volume", writers: ["compute-economy-flow"], readers: ["UI", "EconomyTab"], liveUsed: true },
  { table: "city_market_summary", column: "domestic_share", writers: ["compute-economy-flow"], readers: ["UI"], liveUsed: true },

  // === NARRATIVE ===
  { table: "chronicle_entries", column: "text", writers: ["chronicle"], readers: ["UI", "AI context"], liveUsed: true },
  { table: "wiki_entries", column: "summary", writers: ["wiki-generate", "backfill-wiki"], readers: ["UI", "AI context"], liveUsed: true },
  { table: "city_rumors", column: "text", writers: ["rumor-engine"], readers: ["UI", "chronicle", "AI context"], liveUsed: true },
  { table: "diplomatic_memory", column: "memory_type", writers: ["declaration-effects", "council-session"], readers: ["AI context", "ai-faction-turn"], liveUsed: true },
];

// Summary stats
export function getAuditSummary() {
  const total = DATA_FLOW_AUDIT.length;
  const deadColumns = DATA_FLOW_AUDIT.filter(e => !e.liveUsed);
  const noReaders = DATA_FLOW_AUDIT.filter(e => e.readers.length === 0);
  const uiOnly = DATA_FLOW_AUDIT.filter(e => e.readers.length === 1 && e.readers[0] === "UI" && !e.liveUsed);
  const fakeColumns = DATA_FLOW_AUDIT.filter(e => e.notes?.includes("FAKE"));

  return { total, deadColumns, noReaders, uiOnly, fakeColumns };
}
