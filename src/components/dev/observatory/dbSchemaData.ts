/**
 * Static DB schema map for Chronicle Observatory.
 * Defines all tables, key columns, and foreign key relationships.
 */

export interface DBTable {
  name: string;
  category: "core" | "military" | "economy" | "narrative" | "social" | "meta" | "league" | "spatial";
  keyColumns: string[];
  columnCount: number;
  hasRLS: boolean;
  description: string;
}

export interface DBRelation {
  from: string;
  fromCol: string;
  to: string;
  toCol: string;
}

export const DB_TABLES: DBTable[] = [
  // CORE
  { name: "game_sessions", category: "core", keyColumns: ["id", "current_turn", "status", "mode"], columnCount: 12, hasRLS: true, description: "Herní relace — hlavní kontejner" },
  { name: "game_players", category: "core", keyColumns: ["session_id", "player_name", "turn_closed", "resources"], columnCount: 25, hasRLS: true, description: "Hráčské stavy a suroviny per turn" },
  { name: "game_memberships", category: "core", keyColumns: ["user_id", "session_id", "player_name", "role"], columnCount: 6, hasRLS: true, description: "Propojení auth user → herní relace" },
  { name: "profiles", category: "core", keyColumns: ["id", "username", "is_premium"], columnCount: 6, hasRLS: true, description: "Uživatelské profily" },
  { name: "user_roles", category: "core", keyColumns: ["user_id", "role"], columnCount: 3, hasRLS: true, description: "Admin/moderátor role" },
  { name: "game_events", category: "core", keyColumns: ["session_id", "turn_number", "event_type", "data"], columnCount: 10, hasRLS: true, description: "Kanonický event log (event sourcing)" },
  { name: "world_foundations", category: "core", keyColumns: ["session_id", "world_name", "premise", "tone"], columnCount: 12, hasRLS: true, description: "Nastavení světa (premisa, frakce)" },
  { name: "action_queue", category: "core", keyColumns: ["session_id", "player_name", "action_type", "status"], columnCount: 10, hasRLS: true, description: "Fronta akcí (stavba, výzkum, cestování)" },

  // SPATIAL
  { name: "cities", category: "spatial", keyColumns: ["session_id", "owner_player", "population_total", "city_stability"], columnCount: 65, hasRLS: true, description: "Města — hlavní entity s 65+ sloupci" },
  { name: "provinces", category: "spatial", keyColumns: ["session_id", "name", "owner_player", "total_tension"], columnCount: 15, hasRLS: true, description: "Provincie — agregace měst" },
  { name: "hex_map", category: "spatial", keyColumns: ["session_id", "q", "r", "terrain", "biome"], columnCount: 18, hasRLS: true, description: "Hexová mapa světa" },
  { name: "province_nodes", category: "spatial", keyColumns: ["session_id", "city_id", "node_role", "node_score"], columnCount: 12, hasRLS: true, description: "Ekonomické uzly (Hub/Gateway/Regulator)" },
  { name: "province_routes", category: "spatial", keyColumns: ["session_id", "node_a", "node_b", "cost"], columnCount: 8, hasRLS: true, description: "Obchodní trasy mezi uzly" },
  { name: "flow_paths", category: "spatial", keyColumns: ["session_id", "route_id", "hex_path"], columnCount: 6, hasRLS: true, description: "Hexové cesty tras" },
  { name: "regions", category: "spatial", keyColumns: ["session_id", "name", "owner_player"], columnCount: 8, hasRLS: true, description: "Regiony (větší než provincie)" },

  // ECONOMY
  { name: "city_buildings", category: "economy", keyColumns: ["city_id", "name", "category", "status", "effects"], columnCount: 25, hasRLS: true, description: "Budovy ve městech" },
  { name: "city_districts", category: "economy", keyColumns: ["city_id", "district_type", "population_capacity"], columnCount: 20, hasRLS: true, description: "Městské čtvrti" },
  { name: "building_templates", category: "economy", keyColumns: ["name", "category", "effects", "cost_wood"], columnCount: 15, hasRLS: false, description: "Šablony budov (read-only)" },
  { name: "wonders", category: "economy", keyColumns: ["session_id", "name", "city_id", "status"], columnCount: 12, hasRLS: true, description: "Divy světa" },
  { name: "trade_agreements", category: "economy", keyColumns: ["session_id", "player_a", "player_b", "status"], columnCount: 10, hasRLS: true, description: "Obchodní dohody" },

  // MILITARY
  { name: "military_stacks", category: "military", keyColumns: ["session_id", "owner_player", "total_strength", "morale"], columnCount: 15, hasRLS: true, description: "Vojenské skupiny" },
  { name: "military_units", category: "military", keyColumns: ["stack_id", "unit_type", "count", "strength"], columnCount: 10, hasRLS: true, description: "Jednotky ve skupinách" },
  { name: "battles", category: "military", keyColumns: ["session_id", "result", "casualties_attacker", "casualties_defender"], columnCount: 20, hasRLS: true, description: "Záznamy bitev" },
  { name: "battle_lobbies", category: "military", keyColumns: ["session_id", "status", "attacker_player", "defender_player"], columnCount: 22, hasRLS: true, description: "Přípravné lobby bitev" },
  { name: "travel_orders", category: "military", keyColumns: ["session_id", "stack_id", "destination_q", "destination_r"], columnCount: 10, hasRLS: true, description: "Příkazy k přesunu armád" },

  // SOCIAL
  { name: "city_factions", category: "social", keyColumns: ["city_id", "faction_type", "power", "satisfaction"], columnCount: 15, hasRLS: true, description: "Městské frakce (měšťané, klerici...)" },
  { name: "city_policies", category: "social", keyColumns: ["city_id", "policy_key", "policy_value", "is_active"], columnCount: 14, hasRLS: true, description: "Politiky měst" },
  { name: "city_uprisings", category: "social", keyColumns: ["session_id", "city_id", "status", "severity"], columnCount: 10, hasRLS: true, description: "Povstání ve městech" },
  { name: "ai_factions", category: "social", keyColumns: ["session_id", "faction_name", "personality", "goals"], columnCount: 9, hasRLS: true, description: "AI řízené frakce" },
  { name: "declarations", category: "social", keyColumns: ["session_id", "declaration_type", "from_player", "to_player"], columnCount: 12, hasRLS: true, description: "Diplomatické deklarace" },
  { name: "diplomatic_pacts", category: "social", keyColumns: ["session_id", "player_a", "player_b", "pact_type"], columnCount: 10, hasRLS: true, description: "Diplomatické pakty" },
  { name: "diplomatic_memory", category: "social", keyColumns: ["session_id", "from_player", "to_player", "memory_type"], columnCount: 10, hasRLS: true, description: "AI paměť diplomatických interakcí" },
  { name: "great_persons", category: "social", keyColumns: ["session_id", "name", "person_type", "player_name"], columnCount: 12, hasRLS: true, description: "Velké osobnosti" },
  { name: "laws", category: "social", keyColumns: ["session_id", "law_key", "enacted_by", "is_active"], columnCount: 10, hasRLS: true, description: "Zákony říší" },
  { name: "cultures", category: "social", keyColumns: ["session_id", "name", "traits"], columnCount: 8, hasRLS: true, description: "Kulturní identity" },
  { name: "languages", category: "social", keyColumns: ["session_id", "name", "family"], columnCount: 6, hasRLS: true, description: "Jazyky" },

  // NARRATIVE
  { name: "chronicle_entries", category: "narrative", keyColumns: ["session_id", "text", "turn_from", "source_type"], columnCount: 10, hasRLS: true, description: "Kroniky — AI generované záznamy" },
  { name: "chronicle_mentions", category: "narrative", keyColumns: ["entry_id", "entity_type", "entity_id"], columnCount: 5, hasRLS: true, description: "Zmínky entit v kronikách" },
  { name: "wiki_entries", category: "narrative", keyColumns: ["session_id", "entity_type", "entity_id", "summary"], columnCount: 12, hasRLS: true, description: "Encyklopedické záznamy" },
  { name: "city_rumors", category: "narrative", keyColumns: ["session_id", "city_id", "text", "tone_tag"], columnCount: 14, hasRLS: true, description: "Městské zvěsti" },
  { name: "world_events", category: "narrative", keyColumns: ["session_id", "event_type", "severity", "turn_number"], columnCount: 12, hasRLS: true, description: "Světové události (krize, katastrofy)" },
  { name: "ai_world_summaries", category: "narrative", keyColumns: ["session_id", "summary_type", "summary_text"], columnCount: 8, hasRLS: true, description: "AI komprimované souhrny" },
  { name: "country_narratives", category: "narrative", keyColumns: ["session_id", "player_name", "era_text"], columnCount: 6, hasRLS: true, description: "Narativní přehled říší" },

  // LEAGUE
  { name: "academies", category: "league", keyColumns: ["session_id", "city_id", "name", "reputation"], columnCount: 35, hasRLS: true, description: "Akademie (gladiátoři, sportovci)" },
  { name: "academy_students", category: "league", keyColumns: ["academy_id", "name", "specialty", "status"], columnCount: 18, hasRLS: true, description: "Studenti akademií" },
  { name: "league_teams", category: "league", keyColumns: ["session_id", "city_id", "name", "tier"], columnCount: 12, hasRLS: true, description: "Sportovní týmy" },
  { name: "sports_associations", category: "league", keyColumns: ["session_id", "name", "discipline"], columnCount: 8, hasRLS: true, description: "Sportovní asociace" },
  { name: "olympiad_editions", category: "league", keyColumns: ["session_id", "edition_number", "host_city_id"], columnCount: 10, hasRLS: true, description: "Olympijské edice" },

  // META
  { name: "simulation_log", category: "meta", keyColumns: ["session_id", "turn_from", "turn_to", "status"], columnCount: 6, hasRLS: true, description: "Log simulací (prevence překryvů)" },
  { name: "secret_objectives", category: "meta", keyColumns: ["session_id", "player_name", "objective_type"], columnCount: 8, hasRLS: true, description: "Tajné cíle hráčů" },
  { name: "server_configs", category: "meta", keyColumns: ["session_id", "config_key", "config_value"], columnCount: 5, hasRLS: true, description: "Serverová konfigurace her" },
];

export const DB_RELATIONS: DBRelation[] = [
  // Core
  { from: "game_players", fromCol: "session_id", to: "game_sessions", toCol: "id" },
  { from: "game_memberships", fromCol: "session_id", to: "game_sessions", toCol: "id" },
  { from: "game_events", fromCol: "session_id", to: "game_sessions", toCol: "id" },
  { from: "world_foundations", fromCol: "session_id", to: "game_sessions", toCol: "id" },
  { from: "action_queue", fromCol: "session_id", to: "game_sessions", toCol: "id" },

  // Spatial
  { from: "cities", fromCol: "session_id", to: "game_sessions", toCol: "id" },
  { from: "cities", fromCol: "province_id", to: "provinces", toCol: "id" },
  { from: "cities", fromCol: "culture_id", to: "cultures", toCol: "id" },
  { from: "cities", fromCol: "language_id", to: "languages", toCol: "id" },
  { from: "provinces", fromCol: "session_id", to: "game_sessions", toCol: "id" },
  { from: "hex_map", fromCol: "session_id", to: "game_sessions", toCol: "id" },
  { from: "province_nodes", fromCol: "session_id", to: "game_sessions", toCol: "id" },
  { from: "province_nodes", fromCol: "city_id", to: "cities", toCol: "id" },
  { from: "province_routes", fromCol: "node_a", to: "province_nodes", toCol: "id" },
  { from: "province_routes", fromCol: "node_b", to: "province_nodes", toCol: "id" },

  // Economy
  { from: "city_buildings", fromCol: "city_id", to: "cities", toCol: "id" },
  { from: "city_districts", fromCol: "city_id", to: "cities", toCol: "id" },
  { from: "city_buildings", fromCol: "template_id", to: "building_templates", toCol: "id" },
  { from: "wonders", fromCol: "city_id", to: "cities", toCol: "id" },

  // Military
  { from: "military_stacks", fromCol: "session_id", to: "game_sessions", toCol: "id" },
  { from: "military_units", fromCol: "stack_id", to: "military_stacks", toCol: "id" },
  { from: "battles", fromCol: "attacker_stack_id", to: "military_stacks", toCol: "id" },
  { from: "battles", fromCol: "defender_stack_id", to: "military_stacks", toCol: "id" },
  { from: "battle_lobbies", fromCol: "session_id", to: "game_sessions", toCol: "id" },

  // Social
  { from: "city_factions", fromCol: "city_id", to: "cities", toCol: "id" },
  { from: "city_policies", fromCol: "city_id", to: "cities", toCol: "id" },
  { from: "city_uprisings", fromCol: "city_id", to: "cities", toCol: "id" },
  { from: "ai_factions", fromCol: "session_id", to: "game_sessions", toCol: "id" },
  { from: "declarations", fromCol: "session_id", to: "game_sessions", toCol: "id" },
  { from: "diplomatic_pacts", fromCol: "session_id", to: "game_sessions", toCol: "id" },
  { from: "great_persons", fromCol: "session_id", to: "game_sessions", toCol: "id" },

  // Narrative
  { from: "chronicle_entries", fromCol: "session_id", to: "game_sessions", toCol: "id" },
  { from: "chronicle_entries", fromCol: "event_id", to: "game_events", toCol: "id" },
  { from: "chronicle_mentions", fromCol: "entry_id", to: "chronicle_entries", toCol: "id" },
  { from: "wiki_entries", fromCol: "session_id", to: "game_sessions", toCol: "id" },
  { from: "city_rumors", fromCol: "city_id", to: "cities", toCol: "id" },
  { from: "world_events", fromCol: "session_id", to: "game_sessions", toCol: "id" },
  { from: "city_rumors", fromCol: "related_event_id", to: "game_events", toCol: "id" },
  { from: "city_rumors", fromCol: "related_world_event_id", to: "world_events", toCol: "id" },

  // League
  { from: "academies", fromCol: "city_id", to: "cities", toCol: "id" },
  { from: "academy_students", fromCol: "academy_id", to: "academies", toCol: "id" },
  { from: "league_teams", fromCol: "city_id", to: "cities", toCol: "id" },
  { from: "academies", fromCol: "association_id", to: "sports_associations", toCol: "id" },
  { from: "olympiad_editions", fromCol: "session_id", to: "game_sessions", toCol: "id" },
];

export const CATEGORY_COLORS: Record<DBTable["category"], { bg: string; border: string }> = {
  core:      { bg: "#1e3a5f", border: "#3b82f6" },
  spatial:   { bg: "#166534", border: "#22c55e" },
  economy:   { bg: "#854d0e", border: "#eab308" },
  military:  { bg: "#991b1b", border: "#ef4444" },
  social:    { bg: "#581c87", border: "#a855f7" },
  narrative: { bg: "#0e4a5c", border: "#06b6d4" },
  league:    { bg: "#78350f", border: "#f97316" },
  meta:      { bg: "#374151", border: "#9ca3af" },
};
