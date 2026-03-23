/**
 * Static audit: who writes/reads each key DB column.
 * Based on codebase analysis of edge functions, UI components, and engine logic.
 */

export type Writer = "process-turn" | "world-tick" | "commit-turn" | "command-dispatch" | "UI" | "generate-civ-start" | "process-tick" | "city-seed" | "ai-faction-turn" | "council-session" | "collapse-chain" | "world-generate-init" | "declaration-effects" | "resolve-battle" | "compute-economy-flow" | "compute-province-nodes" | "check-victory" | "law-process" | "chronicle" | "wiki-generate" | "rumor-engine" | "backfill-wiki" | "academy-tick" | "games-resolve";

export type Reader = "process-turn" | "world-tick" | "commit-turn" | "UI" | "AI context" | "ai-faction-turn" | "council-session" | "check-victory" | "chronicle" | "compute-economy-flow" | "compute-province-nodes" | "cityprofile" | "resolve-battle";

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
  { table: "cities", column: "population_total", writers: ["world-tick", "process-turn", "generate-civ-start"], readers: ["UI", "process-turn", "world-tick", "AI context", "check-victory"], liveUsed: true },
  { table: "cities", column: "city_stability", writers: ["world-tick"], readers: ["UI", "world-tick", "AI context", "resolve-battle"], liveUsed: true },
  { table: "cities", column: "local_grain_reserve", writers: ["process-turn"], readers: ["UI", "process-turn"], liveUsed: true },
  { table: "cities", column: "famine_turn", writers: ["process-turn"], readers: ["UI", "world-tick", "process-turn"], liveUsed: true },
  { table: "cities", column: "famine_severity", writers: ["process-turn"], readers: ["world-tick", "process-turn"], liveUsed: true },
  { table: "cities", column: "ration_policy", writers: ["UI"], readers: ["process-turn"], liveUsed: true, notes: "Přímá hráčská akce → engine ji čte" },
  { table: "cities", column: "labor_allocation", writers: ["UI"], readers: [], liveUsed: false, notes: "⚠️ FAKE: UI zapisuje, ale NIKDO to nečte" },
  { table: "cities", column: "legitimacy", writers: ["world-tick"], readers: ["UI"], liveUsed: false, notes: "⚠️ Zobrazuje se, ale nemá downstream efekt" },
  { table: "cities", column: "local_renown", writers: ["world-tick", "games-resolve"], readers: ["UI", "check-victory"], liveUsed: true },
  { table: "cities", column: "influence_score", writers: ["world-tick"], readers: ["UI", "check-victory"], liveUsed: true },
  { table: "cities", column: "migration_pressure", writers: ["world-tick"], readers: [], liveUsed: false, notes: "⚠️ Počítá se, ale nikde se nečte" },
  { table: "cities", column: "disease_level", writers: ["world-tick"], readers: ["world-tick"], liveUsed: true, notes: "Interní engine loop — spouští epidemie" },
  { table: "cities", column: "vulnerability_score", writers: ["world-tick"], readers: ["AI context", "ai-faction-turn"], liveUsed: true, notes: "AI-only: identifikace slabých míst" },
  { table: "cities", column: "development_level", writers: ["world-tick"], readers: ["UI"], liveUsed: false, notes: "⚠️ Zobrazuje se, ale chybí urbanizační milníky v UI" },
  { table: "cities", column: "housing_capacity", writers: ["world-tick", "generate-civ-start"], readers: ["world-tick"], liveUsed: true },
  { table: "cities", column: "military_garrison", writers: ["world-tick", "resolve-battle"], readers: ["world-tick", "UI"], liveUsed: true },
  { table: "cities", column: "settlement_level", writers: ["world-tick"], readers: ["UI", "world-tick"], liveUsed: true },
  { table: "cities", column: "special_resource_type", writers: ["generate-civ-start", "world-generate-init"], readers: ["UI", "compute-province-nodes"], liveUsed: true, notes: "Narativní efekty — mechanické odemčení chybí" },
  { table: "cities", column: "overcrowding_ratio", writers: ["world-tick"], readers: ["world-tick"], liveUsed: true },
  { table: "cities", column: "market_level", writers: ["world-tick"], readers: ["compute-economy-flow"], liveUsed: true },

  // === GAME_PLAYERS ===
  { table: "game_players", column: "grain", writers: ["process-turn"], readers: ["UI", "process-turn"], liveUsed: true },
  { table: "game_players", column: "production", writers: ["process-turn"], readers: ["UI", "process-turn"], liveUsed: true },
  { table: "game_players", column: "wealth", writers: ["process-turn", "compute-economy-flow"], readers: ["UI", "process-turn"], liveUsed: true },
  { table: "game_players", column: "capacity", writers: ["process-turn"], readers: ["UI"], liveUsed: false, notes: "⚠️ Zobrazuje se, ale NEMÁ mechanický dopad" },
  { table: "game_players", column: "faith", writers: ["process-turn"], readers: ["UI"], liveUsed: false, notes: "⚠️ Zobrazuje se, chybí prahové efekty" },
  { table: "game_players", column: "iron", writers: ["process-turn"], readers: ["UI"], liveUsed: false, notes: "⚠️ Strategická surovina — chybí unlock mechanika" },
  { table: "game_players", column: "horses", writers: ["process-turn"], readers: ["UI"], liveUsed: false, notes: "⚠️ Strategická surovina — chybí unlock mechanika" },
  { table: "game_players", column: "mobilization_rate", writers: ["command-dispatch"], readers: ["process-turn", "world-tick", "UI"], liveUsed: true },
  { table: "game_players", column: "prestige", writers: ["world-tick"], readers: ["UI"], liveUsed: false, notes: "⚠️ Dead metric — žádný downstream" },

  // === PROVINCE_NODES ===
  { table: "province_nodes", column: "node_score", writers: ["compute-province-nodes"], readers: ["AI context", "compute-economy-flow"], liveUsed: true, notes: "AI-only, hráč nevidí" },
  { table: "province_nodes", column: "node_role", writers: ["compute-province-nodes"], readers: ["compute-economy-flow", "UI"], liveUsed: true },
  { table: "province_nodes", column: "flow_throughput", writers: ["compute-economy-flow"], readers: ["UI"], liveUsed: true },

  // === PROVINCES ===
  { table: "provinces", column: "total_tension", writers: ["world-tick"], readers: ["UI", "world-tick", "AI context"], liveUsed: true },
  { table: "provinces", column: "stability_avg", writers: ["world-tick"], readers: ["UI"], liveUsed: true },

  // === MILITARY ===
  { table: "military_stacks", column: "total_strength", writers: ["command-dispatch", "resolve-battle"], readers: ["UI", "resolve-battle", "AI context"], liveUsed: true },
  { table: "military_stacks", column: "morale", writers: ["world-tick", "resolve-battle"], readers: ["UI", "resolve-battle"], liveUsed: true },

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
