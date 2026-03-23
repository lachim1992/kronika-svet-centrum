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

// ─── FULL COLUMN MAP (auto-extracted from types.ts) ──────

export const DB_TABLE_COLUMNS: Record<string, string[]> = {
  academies: ["id","academy_type","association_id","building_id","city_id","color_primary","color_secondary","corruption","created_at","crowd_popularity","description","elite_favor","emblem_url","fan_base","founded_turn","infrastructure","is_gladiatorial","last_training_turn","motto","name","nutrition","people_favor","player_name","profile_athletics","profile_brutality","profile_combat","profile_culture","profile_strategy","reputation","revolt_risk","session_id","status","total_champions","total_fatalities","total_graduates","trainer_level","training_cycle_turns","training_philosophy","updated_at"],
  academy_rankings: ["id","academy_id","champions","created_at","international_participations","prestige","rank_position","score","session_id","survivors","turn_number","victories"],
  academy_students: ["id","academy_id","agility","bio","charisma","created_at","endurance","graduate_type","graduation_turn","great_person_id","name","player_name","portrait_url","promoted_to_participant_id","session_id","specialty","status","strength","tactics","training_started_turn","traits"],
  action_queue: ["id","action_data","action_type","completes_at","created_at","created_turn","execute_on_turn","player_name","session_id","started_at","status"],
  ai_factions: ["id","created_at","disposition","faction_name","goals","is_active","personality","resources_snapshot","session_id"],
  ai_world_summaries: ["id","created_at","faction_name","key_facts","session_id","summary_text","summary_type","turn_range_from","turn_range_to"],
  battle_lobbies: ["id","attacker_formation","attacker_player","attacker_ready","attacker_speech","attacker_speech_feedback","attacker_speech_modifier","attacker_stack_id","battle_id","created_at","defender_city_id","defender_formation","defender_player","defender_ready","defender_speech","defender_speech_feedback","defender_speech_modifier","defender_stack_id","resolved_at","session_id","status","surrender_accepted","surrender_offered_by","surrender_terms","turn_number","updated_at"],
  battles: ["id","attacker_morale_snapshot","attacker_stack_id","attacker_strength_snapshot","biome","casualties_attacker","casualties_defender","created_at","defender_city_id","defender_morale_snapshot","defender_stack_id","defender_strength_snapshot","fortification_bonus","luck_roll","post_action","resolved_at","result","seed","session_id","speech_morale_modifier","speech_text","turn_number"],
  building_templates: ["id","build_turns","category","cost_iron","cost_stone","cost_wealth","cost_wood","created_at","description","effects","flavor_text","image_prompt","is_unique","level_data","max_level","name","required_settlement_level"],
  chronicle_entries: ["id","created_at","epoch_style","event_id","references","session_id","source_type","text","turn_from","turn_to"],
  chronicle_mentions: ["id","created_at","entity_id","entity_type","entry_id","session_id"],
  cities: ["id","birth_rate","city_description_cached","city_description_last_turn","city_stability","created_at","culture_id","custom_layers","death_rate","devastated_round","development_level","disease_level","epidemic_active","epidemic_turn_start","famine_consecutive_turns","famine_severity","famine_turn","flavor_prompt","founded_round","hosting_count","housing_capacity","influence_score","irrigation_level","is_capital","labor_allocation","language_id","last_migration_in","last_migration_out","last_tick_at","last_turn_grain_cons","last_turn_grain_prod","last_turn_iron_prod","last_turn_special_prod","last_turn_stone_prod","last_turn_wood_prod","legitimacy","level","local_grain_reserve","local_granary_capacity","local_renown","market_level","max_districts","migration_pressure","military_garrison","mobility_rate","name","overcrowding_ratio","owner_player","population_burghers","population_clerics","population_peasants","population_total","population_warriors","province","province_id","province_q","province_r","ration_policy","ruins_note","session_id","settlement_level","special_resource_type","status","tags","temple_level","uprising_cooldown_until","vulnerability_score"],
  city_buildings: ["id","architectural_style","build_duration","build_started_turn","building_tags","category","city_id","completed_turn","cost_iron","cost_stone","cost_wealth","cost_wood","created_at","current_level","description","effects","flavor_text","founding_myth","image_prompt","image_url","is_ai_generated","is_arena","is_wonder","level_data","max_level","name","session_id","status","template_id","wonder_id"],
  city_districts: ["id","build_cost_stone","build_cost_wealth","build_cost_wood","build_started_turn","build_turns","burgher_attraction","city_id","cleric_attraction","completed_turn","created_at","current_population","description","district_type","grain_modifier","image_url","influence_modifier","military_attraction","name","peasant_attraction","population_capacity","production_modifier","session_id","stability_modifier","status","wealth_modifier"],
  city_factions: ["id","city_id","created_at","current_demand","demand_urgency","description","faction_type","is_active","leader_appointed_turn","leader_name","leader_trait","loyalty","power","satisfaction","session_id","updated_at"],
  city_policies: ["id","city_id","created_at","description","enacted_by","enacted_turn","faction_impact","grain_effect","is_active","legitimacy_effect","policy_category","policy_key","policy_value","production_effect","session_id","stability_effect","wealth_effect"],
  city_rumors: ["id","city_id","city_name","created_at","created_by","draft_expires_turn","entity_refs","is_draft","related_event_id","related_world_event_id","session_id","text","tone_tag","turn_number"],
  city_states: ["id","created_at","influence_p1","influence_p2","mood","name","session_id","type"],
  city_uprisings: ["id","advisor_analysis","chosen_concession","city_id","created_at","crowd_text","demands","effects_applied","escalation_level","player_name","player_response_text","resolved_turn","session_id","status","turn_triggered","updated_at"],
  game_sessions: ["id","created_at","current_turn","mode","name","phase","status","turn_closed_p1","turn_closed_p2","updated_at","world_type"],
  game_players: ["id","created_at","faith","grain_reserve","granary_capacity","iron","player_name","production_reserve","session_id","special_resource","stone","turn_closed","updated_at","wealth","wood","horses","military_capacity","mobilization_rate","population_total","production_capacity","production_flow","session_name","total_influence","total_tension","war_exhaustion"],
  game_memberships: ["id","created_at","player_name","role","session_id","user_id"],
  game_events: ["id","city_id","created_at","data","event_type","player_name","session_id","turn_number","visibility"],
  provinces: ["id","biome_primary","city_count","created_at","name","owner_player","session_id","terrain_primary","total_population","total_production","total_stability","total_tension","total_wealth","updated_at"],
  hex_map: ["id","biome","city_id","climate_zone","continent","created_at","elevation","explored_by","fertility","has_road","is_coastal","moisture","owner_player","q","r","region_id","session_id","terrain"],
  province_nodes: ["id","attraction","building_effects","capacity_modifier","city_id","created_at","hex_q","hex_r","label","node_role","node_score","session_id"],
  province_routes: ["id","building_effects","cost","created_at","flow_capacity","node_a","node_b","path_dirty","session_id"],
  flow_paths: ["id","created_at","hex_path","route_id","session_id","updated_at"],
  regions: ["id","climate","continent","created_at","description","name","owner_player","session_id"],
  military_stacks: ["id","created_at","current_hex_q","current_hex_r","morale","movement_points","name","origin_city_id","owner_player","session_id","stack_type","status","total_strength","updated_at","visibility"],
  military_units: ["id","count","created_at","equipment","stack_id","strength","unit_type","updated_at"],
  battles: ["id","attacker_morale_snapshot","attacker_stack_id","attacker_strength_snapshot","biome","casualties_attacker","casualties_defender","created_at","defender_city_id","defender_morale_snapshot","defender_stack_id","defender_strength_snapshot","fortification_bonus","luck_roll","post_action","resolved_at","result","seed","session_id","speech_morale_modifier","speech_text","turn_number"],
  battle_lobbies: ["id","attacker_formation","attacker_player","attacker_ready","attacker_speech","attacker_speech_feedback","attacker_speech_modifier","attacker_stack_id","battle_id","created_at","defender_city_id","defender_formation","defender_player","defender_ready","defender_speech","defender_speech_feedback","defender_speech_modifier","defender_stack_id","resolved_at","session_id","status","surrender_accepted","surrender_offered_by","surrender_terms","turn_number","updated_at"],
  travel_orders: ["id","created_at","destination_q","destination_r","hex_path","session_id","stack_id","status","updated_at"],
  trade_agreements: ["id","created_at","ended_turn","player_a","player_b","route_bonus","session_id","started_turn","status","terms","updated_at"],
  wonders: ["id","city_id","created_at","description","image_prompt","image_url","name","owner_player","session_id","status","turn_started","updated_at"],
  declarations: ["id","ai_generated","created_at","declaration_type","effects","epic_text","original_text","player_name","session_id","source_notes","status","target_city_ids","target_empire_ids","title","tone","turn_number","visibility"],
  diplomatic_pacts: ["id","accepted_turn","ai_narrative","created_at","effects","ended_turn","expires_turn","pact_type","party_a","party_b","proclamation_text","proposed_by","proposed_turn","session_id","status","target_party","updated_at"],
  diplomatic_memory: ["id","created_at","decay_rate","detail","faction_a","faction_b","importance","is_active","memory_type","session_id","source_event_id","turn_number"],
  diplomatic_relations: ["id","betrayal_score","cooperation_score","created_at","dependency","faction_a","faction_b","fear","grievance","ideological_alignment","last_updated_turn","overall_disposition","session_id","trust","updated_at"],
  great_persons: ["id","bio","city_id","created_at","death_turn","era_text","is_active","name","person_type","player_name","portrait_url","session_id","traits"],
  laws: ["id","created_at","description","effects","enacted_by","enacted_turn","is_active","law_key","law_name","session_id"],
  cultures: ["id","created_at","description","name","session_id","values_text"],
  languages: ["id","created_at","family","name","session_id","script"],
  chronicle_entries: ["id","created_at","epoch_style","event_id","references","session_id","source_type","text","turn_from","turn_to"],
  chronicle_mentions: ["id","created_at","entity_id","entity_type","entry_id","session_id"],
  wiki_entries: ["id","created_at","entity_id","entity_name","entity_type","image_prompt","image_url","owner_player","saga","session_id","summary","updated_at"],
  city_rumors: ["id","city_id","city_name","created_at","created_by","draft_expires_turn","entity_refs","is_draft","related_event_id","related_world_event_id","session_id","text","tone_tag","turn_number"],
  world_events: ["id","affected_cities","affected_players","created_at","description","effects","event_type","name","resolved_turn","session_id","severity","turn_number"],
  ai_world_summaries: ["id","created_at","faction_name","key_facts","session_id","summary_text","summary_type","turn_range_from","turn_range_to"],
  country_narratives: ["id","ai_generated_text","created_at","era_text","player_name","session_id","turn_number"],
  world_foundations: ["id","created_at","cultural_notes","era","factions_json","geography","premise","session_id","special_rules","starting_year","tone","world_name"],
  profiles: ["id","avatar_url","created_at","is_premium","updated_at","username"],
  user_roles: ["id","role","user_id"],
  simulation_log: ["id","created_at","error_message","session_id","status","turn_from","turn_to"],
  secret_objectives: ["id","completed","completed_turn","created_at","description","objective_type","player_name","session_id"],
  server_configs: ["id","config_key","config_value","created_at","session_id"],
  olympiad_editions: ["id","bid_deadline_turn","created_at","disciplines","edition_number","host_city_id","host_player","session_id","status","turn_number"],
  league_teams: ["id","city_id","color_primary","color_secondary","created_at","emblem_url","is_active","name","player_name","session_id","sport_type","tier"],
  sports_associations: ["id","created_at","description","discipline","name","session_id","tier","updated_at"],
  academies: ["id","academy_type","association_id","building_id","city_id","color_primary","color_secondary","corruption","created_at","crowd_popularity","description","elite_favor","emblem_url","fan_base","founded_turn","infrastructure","is_gladiatorial","last_training_turn","motto","name","nutrition","people_favor","player_name","profile_athletics","profile_brutality","profile_combat","profile_culture","profile_strategy","reputation","revolt_risk","session_id","status","total_champions","total_fatalities","total_graduates","trainer_level","training_cycle_turns","training_philosophy","updated_at"],
  academy_students: ["id","academy_id","agility","bio","charisma","created_at","endurance","graduate_type","graduation_turn","great_person_id","name","player_name","portrait_url","promoted_to_participant_id","session_id","specialty","status","strength","tactics","training_started_turn","traits"],
  academy_rankings: ["id","academy_id","champions","created_at","international_participations","prestige","rank_position","score","session_id","survivors","turn_number","victories"],
};
