export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      action_queue: {
        Row: {
          action_data: Json
          action_type: string
          completes_at: string
          created_at: string | null
          created_turn: number | null
          execute_on_turn: number | null
          id: string
          player_name: string
          session_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          action_data?: Json
          action_type: string
          completes_at: string
          created_at?: string | null
          created_turn?: number | null
          execute_on_turn?: number | null
          id?: string
          player_name: string
          session_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          action_data?: Json
          action_type?: string
          completes_at?: string
          created_at?: string | null
          created_turn?: number | null
          execute_on_turn?: number | null
          id?: string
          player_name?: string
          session_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_queue_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_factions: {
        Row: {
          created_at: string
          disposition: Json
          faction_name: string
          goals: Json
          id: string
          is_active: boolean
          personality: string
          resources_snapshot: Json
          session_id: string
        }
        Insert: {
          created_at?: string
          disposition?: Json
          faction_name: string
          goals?: Json
          id?: string
          is_active?: boolean
          personality?: string
          resources_snapshot?: Json
          session_id: string
        }
        Update: {
          created_at?: string
          disposition?: Json
          faction_name?: string
          goals?: Json
          id?: string
          is_active?: boolean
          personality?: string
          resources_snapshot?: Json
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_factions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_world_summaries: {
        Row: {
          created_at: string
          faction_name: string | null
          id: string
          key_facts: Json
          session_id: string
          summary_text: string
          summary_type: string
          turn_range_from: number | null
          turn_range_to: number | null
        }
        Insert: {
          created_at?: string
          faction_name?: string | null
          id?: string
          key_facts?: Json
          session_id: string
          summary_text: string
          summary_type?: string
          turn_range_from?: number | null
          turn_range_to?: number | null
        }
        Update: {
          created_at?: string
          faction_name?: string | null
          id?: string
          key_facts?: Json
          session_id?: string
          summary_text?: string
          summary_type?: string
          turn_range_from?: number | null
          turn_range_to?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_world_summaries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      battles: {
        Row: {
          attacker_morale_snapshot: number
          attacker_stack_id: string
          attacker_strength_snapshot: number
          biome: string
          casualties_attacker: number
          casualties_defender: number
          created_at: string
          defender_city_id: string | null
          defender_morale_snapshot: number
          defender_stack_id: string | null
          defender_strength_snapshot: number
          fortification_bonus: number
          id: string
          luck_roll: number
          post_action: string | null
          resolved_at: string | null
          result: string
          seed: number
          session_id: string
          speech_morale_modifier: number
          speech_text: string | null
          turn_number: number
        }
        Insert: {
          attacker_morale_snapshot?: number
          attacker_stack_id: string
          attacker_strength_snapshot?: number
          biome?: string
          casualties_attacker?: number
          casualties_defender?: number
          created_at?: string
          defender_city_id?: string | null
          defender_morale_snapshot?: number
          defender_stack_id?: string | null
          defender_strength_snapshot?: number
          fortification_bonus?: number
          id?: string
          luck_roll?: number
          post_action?: string | null
          resolved_at?: string | null
          result?: string
          seed?: number
          session_id: string
          speech_morale_modifier?: number
          speech_text?: string | null
          turn_number?: number
        }
        Update: {
          attacker_morale_snapshot?: number
          attacker_stack_id?: string
          attacker_strength_snapshot?: number
          biome?: string
          casualties_attacker?: number
          casualties_defender?: number
          created_at?: string
          defender_city_id?: string | null
          defender_morale_snapshot?: number
          defender_stack_id?: string | null
          defender_strength_snapshot?: number
          fortification_bonus?: number
          id?: string
          luck_roll?: number
          post_action?: string | null
          resolved_at?: string | null
          result?: string
          seed?: number
          session_id?: string
          speech_morale_modifier?: number
          speech_text?: string | null
          turn_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "battles_attacker_stack_id_fkey"
            columns: ["attacker_stack_id"]
            isOneToOne: false
            referencedRelation: "military_stacks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battles_defender_city_id_fkey"
            columns: ["defender_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battles_defender_stack_id_fkey"
            columns: ["defender_stack_id"]
            isOneToOne: false
            referencedRelation: "military_stacks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "battles_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      building_templates: {
        Row: {
          build_turns: number
          category: string
          cost_iron: number
          cost_stone: number
          cost_wealth: number
          cost_wood: number
          created_at: string
          description: string
          effects: Json
          flavor_text: string | null
          id: string
          image_prompt: string | null
          is_unique: boolean
          name: string
          required_settlement_level: string
        }
        Insert: {
          build_turns?: number
          category?: string
          cost_iron?: number
          cost_stone?: number
          cost_wealth?: number
          cost_wood?: number
          created_at?: string
          description?: string
          effects?: Json
          flavor_text?: string | null
          id?: string
          image_prompt?: string | null
          is_unique?: boolean
          name: string
          required_settlement_level?: string
        }
        Update: {
          build_turns?: number
          category?: string
          cost_iron?: number
          cost_stone?: number
          cost_wealth?: number
          cost_wood?: number
          created_at?: string
          description?: string
          effects?: Json
          flavor_text?: string | null
          id?: string
          image_prompt?: string | null
          is_unique?: boolean
          name?: string
          required_settlement_level?: string
        }
        Relationships: []
      }
      chronicle_entries: {
        Row: {
          created_at: string
          epoch_style: string
          event_id: string | null
          id: string
          references: Json | null
          session_id: string
          source_type: string
          text: string
          turn_from: number | null
          turn_to: number | null
        }
        Insert: {
          created_at?: string
          epoch_style?: string
          event_id?: string | null
          id?: string
          references?: Json | null
          session_id: string
          source_type?: string
          text: string
          turn_from?: number | null
          turn_to?: number | null
        }
        Update: {
          created_at?: string
          epoch_style?: string
          event_id?: string | null
          id?: string
          references?: Json | null
          session_id?: string
          source_type?: string
          text?: string
          turn_from?: number | null
          turn_to?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chronicle_entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "game_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chronicle_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chronicle_mentions: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          entry_id: string
          id: string
          session_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          entry_id: string
          id?: string
          session_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          entry_id?: string
          id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chronicle_mentions_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "chronicle_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chronicle_mentions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          city_description_cached: string | null
          city_description_last_turn: number
          city_stability: number
          created_at: string
          culture_id: string | null
          custom_layers: boolean
          devastated_round: number | null
          development_level: number
          famine_severity: number
          famine_turn: boolean
          flavor_prompt: string | null
          founded_round: number
          id: string
          influence_score: number
          irrigation_level: number
          labor_allocation: Json
          language_id: string | null
          last_tick_at: string | null
          last_turn_grain_cons: number
          last_turn_grain_prod: number
          last_turn_iron_prod: number
          last_turn_special_prod: number
          last_turn_stone_prod: number
          last_turn_wood_prod: number
          legitimacy: number
          level: string
          local_grain_reserve: number
          local_granary_capacity: number
          market_level: number
          max_districts: number
          military_garrison: number
          name: string
          owner_player: string
          population_burghers: number
          population_clerics: number
          population_peasants: number
          population_total: number
          province: string | null
          province_id: string | null
          province_q: number
          province_r: number
          ration_policy: string
          ruins_note: string | null
          session_id: string
          settlement_level: string
          special_resource_type: string
          status: string
          tags: string[] | null
          temple_level: number
          vulnerability_score: number
        }
        Insert: {
          city_description_cached?: string | null
          city_description_last_turn?: number
          city_stability?: number
          created_at?: string
          culture_id?: string | null
          custom_layers?: boolean
          devastated_round?: number | null
          development_level?: number
          famine_severity?: number
          famine_turn?: boolean
          flavor_prompt?: string | null
          founded_round?: number
          id?: string
          influence_score?: number
          irrigation_level?: number
          labor_allocation?: Json
          language_id?: string | null
          last_tick_at?: string | null
          last_turn_grain_cons?: number
          last_turn_grain_prod?: number
          last_turn_iron_prod?: number
          last_turn_special_prod?: number
          last_turn_stone_prod?: number
          last_turn_wood_prod?: number
          legitimacy?: number
          level?: string
          local_grain_reserve?: number
          local_granary_capacity?: number
          market_level?: number
          max_districts?: number
          military_garrison?: number
          name: string
          owner_player: string
          population_burghers?: number
          population_clerics?: number
          population_peasants?: number
          population_total?: number
          province?: string | null
          province_id?: string | null
          province_q?: number
          province_r?: number
          ration_policy?: string
          ruins_note?: string | null
          session_id: string
          settlement_level?: string
          special_resource_type?: string
          status?: string
          tags?: string[] | null
          temple_level?: number
          vulnerability_score?: number
        }
        Update: {
          city_description_cached?: string | null
          city_description_last_turn?: number
          city_stability?: number
          created_at?: string
          culture_id?: string | null
          custom_layers?: boolean
          devastated_round?: number | null
          development_level?: number
          famine_severity?: number
          famine_turn?: boolean
          flavor_prompt?: string | null
          founded_round?: number
          id?: string
          influence_score?: number
          irrigation_level?: number
          labor_allocation?: Json
          language_id?: string | null
          last_tick_at?: string | null
          last_turn_grain_cons?: number
          last_turn_grain_prod?: number
          last_turn_iron_prod?: number
          last_turn_special_prod?: number
          last_turn_stone_prod?: number
          last_turn_wood_prod?: number
          legitimacy?: number
          level?: string
          local_grain_reserve?: number
          local_granary_capacity?: number
          market_level?: number
          max_districts?: number
          military_garrison?: number
          name?: string
          owner_player?: string
          population_burghers?: number
          population_clerics?: number
          population_peasants?: number
          population_total?: number
          province?: string | null
          province_id?: string | null
          province_q?: number
          province_r?: number
          ration_policy?: string
          ruins_note?: string | null
          session_id?: string
          settlement_level?: string
          special_resource_type?: string
          status?: string
          tags?: string[] | null
          temple_level?: number
          vulnerability_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "cities_culture_id_fkey"
            columns: ["culture_id"]
            isOneToOne: false
            referencedRelation: "cultures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cities_language_id_fkey"
            columns: ["language_id"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cities_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "provinces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cities_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      city_buildings: {
        Row: {
          build_duration: number
          build_started_turn: number
          category: string
          city_id: string
          completed_turn: number | null
          cost_iron: number
          cost_stone: number
          cost_wealth: number
          cost_wood: number
          created_at: string
          description: string
          effects: Json
          flavor_text: string | null
          founding_myth: string | null
          id: string
          image_prompt: string | null
          image_url: string | null
          is_ai_generated: boolean
          name: string
          session_id: string
          status: string
          template_id: string | null
        }
        Insert: {
          build_duration?: number
          build_started_turn?: number
          category?: string
          city_id: string
          completed_turn?: number | null
          cost_iron?: number
          cost_stone?: number
          cost_wealth?: number
          cost_wood?: number
          created_at?: string
          description?: string
          effects?: Json
          flavor_text?: string | null
          founding_myth?: string | null
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          is_ai_generated?: boolean
          name: string
          session_id: string
          status?: string
          template_id?: string | null
        }
        Update: {
          build_duration?: number
          build_started_turn?: number
          category?: string
          city_id?: string
          completed_turn?: number | null
          cost_iron?: number
          cost_stone?: number
          cost_wealth?: number
          cost_wood?: number
          created_at?: string
          description?: string
          effects?: Json
          flavor_text?: string | null
          founding_myth?: string | null
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          is_ai_generated?: boolean
          name?: string
          session_id?: string
          status?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "city_buildings_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "city_buildings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "city_buildings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "building_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      city_districts: {
        Row: {
          build_cost_stone: number
          build_cost_wealth: number
          build_cost_wood: number
          build_started_turn: number
          build_turns: number
          burgher_attraction: number
          city_id: string
          cleric_attraction: number
          completed_turn: number | null
          created_at: string
          current_population: number
          description: string | null
          district_type: string
          grain_modifier: number
          id: string
          image_url: string | null
          influence_modifier: number
          military_attraction: number
          name: string
          peasant_attraction: number
          population_capacity: number
          production_modifier: number
          session_id: string
          stability_modifier: number
          status: string
          wealth_modifier: number
        }
        Insert: {
          build_cost_stone?: number
          build_cost_wealth?: number
          build_cost_wood?: number
          build_started_turn?: number
          build_turns?: number
          burgher_attraction?: number
          city_id: string
          cleric_attraction?: number
          completed_turn?: number | null
          created_at?: string
          current_population?: number
          description?: string | null
          district_type?: string
          grain_modifier?: number
          id?: string
          image_url?: string | null
          influence_modifier?: number
          military_attraction?: number
          name?: string
          peasant_attraction?: number
          population_capacity?: number
          production_modifier?: number
          session_id: string
          stability_modifier?: number
          status?: string
          wealth_modifier?: number
        }
        Update: {
          build_cost_stone?: number
          build_cost_wealth?: number
          build_cost_wood?: number
          build_started_turn?: number
          build_turns?: number
          burgher_attraction?: number
          city_id?: string
          cleric_attraction?: number
          completed_turn?: number | null
          created_at?: string
          current_population?: number
          description?: string | null
          district_type?: string
          grain_modifier?: number
          id?: string
          image_url?: string | null
          influence_modifier?: number
          military_attraction?: number
          name?: string
          peasant_attraction?: number
          population_capacity?: number
          production_modifier?: number
          session_id?: string
          stability_modifier?: number
          status?: string
          wealth_modifier?: number
        }
        Relationships: [
          {
            foreignKeyName: "city_districts_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "city_districts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      city_factions: {
        Row: {
          city_id: string
          created_at: string
          current_demand: string | null
          demand_urgency: number
          description: string | null
          faction_type: string
          id: string
          is_active: boolean
          leader_appointed_turn: number | null
          leader_name: string | null
          leader_trait: string | null
          loyalty: number
          power: number
          satisfaction: number
          session_id: string
          updated_at: string
        }
        Insert: {
          city_id: string
          created_at?: string
          current_demand?: string | null
          demand_urgency?: number
          description?: string | null
          faction_type?: string
          id?: string
          is_active?: boolean
          leader_appointed_turn?: number | null
          leader_name?: string | null
          leader_trait?: string | null
          loyalty?: number
          power?: number
          satisfaction?: number
          session_id: string
          updated_at?: string
        }
        Update: {
          city_id?: string
          created_at?: string
          current_demand?: string | null
          demand_urgency?: number
          description?: string | null
          faction_type?: string
          id?: string
          is_active?: boolean
          leader_appointed_turn?: number | null
          leader_name?: string | null
          leader_trait?: string | null
          loyalty?: number
          power?: number
          satisfaction?: number
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "city_factions_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "city_factions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      city_policies: {
        Row: {
          city_id: string
          created_at: string
          description: string | null
          enacted_by: string
          enacted_turn: number
          faction_impact: Json
          grain_effect: number
          id: string
          is_active: boolean
          legitimacy_effect: number
          policy_category: string
          policy_key: string
          policy_value: string
          production_effect: number
          session_id: string
          stability_effect: number
          wealth_effect: number
        }
        Insert: {
          city_id: string
          created_at?: string
          description?: string | null
          enacted_by?: string
          enacted_turn?: number
          faction_impact?: Json
          grain_effect?: number
          id?: string
          is_active?: boolean
          legitimacy_effect?: number
          policy_category?: string
          policy_key?: string
          policy_value?: string
          production_effect?: number
          session_id: string
          stability_effect?: number
          wealth_effect?: number
        }
        Update: {
          city_id?: string
          created_at?: string
          description?: string | null
          enacted_by?: string
          enacted_turn?: number
          faction_impact?: Json
          grain_effect?: number
          id?: string
          is_active?: boolean
          legitimacy_effect?: number
          policy_category?: string
          policy_key?: string
          policy_value?: string
          production_effect?: number
          session_id?: string
          stability_effect?: number
          wealth_effect?: number
        }
        Relationships: [
          {
            foreignKeyName: "city_policies_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "city_policies_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      city_rumors: {
        Row: {
          city_id: string
          city_name: string
          created_at: string
          created_by: string
          draft_expires_turn: number | null
          entity_refs: Json | null
          id: string
          is_draft: boolean
          related_event_id: string | null
          related_world_event_id: string | null
          session_id: string
          text: string
          tone_tag: string
          turn_number: number
        }
        Insert: {
          city_id: string
          city_name: string
          created_at?: string
          created_by?: string
          draft_expires_turn?: number | null
          entity_refs?: Json | null
          id?: string
          is_draft?: boolean
          related_event_id?: string | null
          related_world_event_id?: string | null
          session_id: string
          text: string
          tone_tag?: string
          turn_number?: number
        }
        Update: {
          city_id?: string
          city_name?: string
          created_at?: string
          created_by?: string
          draft_expires_turn?: number | null
          entity_refs?: Json | null
          id?: string
          is_draft?: boolean
          related_event_id?: string | null
          related_world_event_id?: string | null
          session_id?: string
          text?: string
          tone_tag?: string
          turn_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "city_rumors_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "city_rumors_related_event_id_fkey"
            columns: ["related_event_id"]
            isOneToOne: false
            referencedRelation: "game_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "city_rumors_related_world_event_id_fkey"
            columns: ["related_world_event_id"]
            isOneToOne: false
            referencedRelation: "world_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "city_rumors_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      city_states: {
        Row: {
          created_at: string
          id: string
          influence_p1: number
          influence_p2: number
          mood: string
          name: string
          session_id: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          influence_p1?: number
          influence_p2?: number
          mood?: string
          name: string
          session_id: string
          type?: string
        }
        Update: {
          created_at?: string
          id?: string
          influence_p1?: number
          influence_p2?: number
          mood?: string
          name?: string
          session_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "city_states_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      civ_influence: {
        Row: {
          created_at: string
          diplomatic_score: number
          id: string
          law_stability_score: number
          military_score: number
          player_name: string
          reputation_score: number
          session_id: string
          territorial_score: number
          total_influence: number
          trade_score: number
          turn_number: number
        }
        Insert: {
          created_at?: string
          diplomatic_score?: number
          id?: string
          law_stability_score?: number
          military_score?: number
          player_name: string
          reputation_score?: number
          session_id: string
          territorial_score?: number
          total_influence?: number
          trade_score?: number
          turn_number?: number
        }
        Update: {
          created_at?: string
          diplomatic_score?: number
          id?: string
          law_stability_score?: number
          military_score?: number
          player_name?: string
          reputation_score?: number
          session_id?: string
          territorial_score?: number
          total_influence?: number
          trade_score?: number
          turn_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "civ_influence_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      civ_tensions: {
        Row: {
          border_proximity: number
          broken_treaties: number
          conflicting_alliances: number
          created_at: string
          crisis_triggered: boolean
          id: string
          military_diff: number
          player_a: string
          player_b: string
          session_id: string
          total_tension: number
          trade_embargo: number
          turn_number: number
          war_roll_result: number | null
          war_roll_triggered: boolean
        }
        Insert: {
          border_proximity?: number
          broken_treaties?: number
          conflicting_alliances?: number
          created_at?: string
          crisis_triggered?: boolean
          id?: string
          military_diff?: number
          player_a: string
          player_b: string
          session_id: string
          total_tension?: number
          trade_embargo?: number
          turn_number?: number
          war_roll_result?: number | null
          war_roll_triggered?: boolean
        }
        Update: {
          border_proximity?: number
          broken_treaties?: number
          conflicting_alliances?: number
          created_at?: string
          crisis_triggered?: boolean
          id?: string
          military_diff?: number
          player_a?: string
          player_b?: string
          session_id?: string
          total_tension?: number
          trade_embargo?: number
          turn_number?: number
          war_roll_result?: number | null
          war_roll_triggered?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "civ_tensions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      civilizations: {
        Row: {
          ai_personality: string | null
          architectural_style: string | null
          civ_name: string
          core_myth: string | null
          created_at: string
          cultural_quirk: string | null
          id: string
          is_ai: boolean
          player_name: string
          session_id: string
        }
        Insert: {
          ai_personality?: string | null
          architectural_style?: string | null
          civ_name?: string
          core_myth?: string | null
          created_at?: string
          cultural_quirk?: string | null
          id?: string
          is_ai?: boolean
          player_name: string
          session_id: string
        }
        Update: {
          ai_personality?: string | null
          architectural_style?: string | null
          civ_name?: string
          core_myth?: string | null
          created_at?: string
          cultural_quirk?: string | null
          id?: string
          is_ai?: boolean
          player_name?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "civilizations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      council_evaluations: {
        Row: {
          created_at: string
          id: string
          minister_diplomacy: string | null
          minister_interior: string | null
          minister_trade: string | null
          minister_war: string | null
          player_name: string
          round_number: number
          round_summary: string
          session_id: string
          strategic_outlook: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          minister_diplomacy?: string | null
          minister_interior?: string | null
          minister_trade?: string | null
          minister_war?: string | null
          player_name: string
          round_number: number
          round_summary: string
          session_id: string
          strategic_outlook?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          minister_diplomacy?: string | null
          minister_interior?: string | null
          minister_trade?: string | null
          minister_war?: string | null
          player_name?: string
          round_number?: number
          round_summary?: string
          session_id?: string
          strategic_outlook?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "council_evaluations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          ai_description: string | null
          created_at: string
          description: string | null
          id: string
          image_prompt: string | null
          image_url: string | null
          name: string
          ruler_player: string | null
          session_id: string
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          ai_description?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          name: string
          ruler_player?: string | null
          session_id: string
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          ai_description?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          name?: string
          ruler_player?: string | null
          session_id?: string
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "countries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cultures: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          session_id: string
          values_text: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          session_id: string
          values_text?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          session_id?: string
          values_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cultures_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      declarations: {
        Row: {
          ai_generated: boolean
          created_at: string
          declaration_type: string
          effects: Json | null
          epic_text: string | null
          id: string
          original_text: string
          player_name: string
          session_id: string
          source_notes: string | null
          status: string
          target_city_ids: string[] | null
          target_empire_ids: string[] | null
          title: string | null
          tone: string
          turn_number: number
          visibility: string
        }
        Insert: {
          ai_generated?: boolean
          created_at?: string
          declaration_type?: string
          effects?: Json | null
          epic_text?: string | null
          id?: string
          original_text: string
          player_name: string
          session_id: string
          source_notes?: string | null
          status?: string
          target_city_ids?: string[] | null
          target_empire_ids?: string[] | null
          title?: string | null
          tone?: string
          turn_number?: number
          visibility?: string
        }
        Update: {
          ai_generated?: boolean
          created_at?: string
          declaration_type?: string
          effects?: Json | null
          epic_text?: string | null
          id?: string
          original_text?: string
          player_name?: string
          session_id?: string
          source_notes?: string | null
          status?: string
          target_city_ids?: string[] | null
          target_empire_ids?: string[] | null
          title?: string | null
          tone?: string
          turn_number?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "declarations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      diplomacy_messages: {
        Row: {
          created_at: string
          id: string
          leak_chance: number
          message_tag: string | null
          message_text: string
          room_id: string
          secrecy: string
          sender: string
          sender_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          leak_chance?: number
          message_tag?: string | null
          message_text: string
          room_id: string
          secrecy?: string
          sender: string
          sender_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          leak_chance?: number
          message_tag?: string | null
          message_text?: string
          room_id?: string
          secrecy?: string
          sender?: string
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "diplomacy_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "diplomacy_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      diplomacy_rooms: {
        Row: {
          created_at: string
          id: string
          npc_city_state_id: string | null
          participant_a: string
          participant_b: string
          room_type: string
          session_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          npc_city_state_id?: string | null
          participant_a: string
          participant_b: string
          room_type?: string
          session_id: string
        }
        Update: {
          created_at?: string
          id?: string
          npc_city_state_id?: string | null
          participant_a?: string
          participant_b?: string
          room_type?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diplomacy_rooms_npc_city_state_id_fkey"
            columns: ["npc_city_state_id"]
            isOneToOne: false
            referencedRelation: "city_states"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diplomacy_rooms_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      discoveries: {
        Row: {
          discovered_at: string
          entity_id: string
          entity_type: string
          id: string
          player_name: string
          session_id: string
          source: string
        }
        Insert: {
          discovered_at?: string
          entity_id: string
          entity_type: string
          id?: string
          player_name: string
          session_id: string
          source?: string
        }
        Update: {
          discovered_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          player_name?: string
          session_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "discoveries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      encyclopedia_images: {
        Row: {
          created_at: string
          created_by: string
          entity_id: string
          entity_type: string
          id: string
          image_prompt: string | null
          image_url: string
          is_primary: boolean
          kind: string
          model_meta: Json | null
          session_id: string
          source_turn: number | null
          style_preset: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          entity_id: string
          entity_type: string
          id?: string
          image_prompt?: string | null
          image_url: string
          is_primary?: boolean
          kind?: string
          model_meta?: Json | null
          session_id: string
          source_turn?: number | null
          style_preset?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          entity_id?: string
          entity_type?: string
          id?: string
          image_prompt?: string | null
          image_url?: string
          is_primary?: boolean
          kind?: string
          model_meta?: Json | null
          session_id?: string
          source_turn?: number | null
          style_preset?: string
        }
        Relationships: [
          {
            foreignKeyName: "encyclopedia_images_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_contributions: {
        Row: {
          accepted_at: string | null
          ai_expanded_text: string | null
          author_player: string
          content_text: string
          content_type: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          image_prompt: string | null
          image_url: string | null
          session_id: string
          status: string
          title: string | null
          updated_at: string
          vote_threshold: number
          votes_no: string[] | null
          votes_yes: string[] | null
        }
        Insert: {
          accepted_at?: string | null
          ai_expanded_text?: string | null
          author_player: string
          content_text: string
          content_type?: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          session_id: string
          status?: string
          title?: string | null
          updated_at?: string
          vote_threshold?: number
          votes_no?: string[] | null
          votes_yes?: string[] | null
        }
        Update: {
          accepted_at?: string | null
          ai_expanded_text?: string | null
          author_player?: string
          content_text?: string
          content_type?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          session_id?: string
          status?: string
          title?: string | null
          updated_at?: string
          vote_threshold?: number
          votes_no?: string[] | null
          votes_yes?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_contributions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_links: {
        Row: {
          created_at: string
          from_entity_id: string
          from_entity_type: string
          id: string
          label: string | null
          link_type: string
          session_id: string
          to_entity_id: string
          to_entity_type: string
        }
        Insert: {
          created_at?: string
          from_entity_id: string
          from_entity_type: string
          id?: string
          label?: string | null
          link_type?: string
          session_id: string
          to_entity_id: string
          to_entity_type: string
        }
        Update: {
          created_at?: string
          from_entity_id?: string
          from_entity_type?: string
          id?: string
          label?: string | null
          link_type?: string
          session_id?: string
          to_entity_id?: string
          to_entity_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_links_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_stats: {
        Row: {
          entity_id: string
          entity_type: string
          id: string
          session_id: string
          source_turn: number
          stat_key: string
          stat_unit: string | null
          stat_value: string
          updated_at: string
        }
        Insert: {
          entity_id: string
          entity_type: string
          id?: string
          session_id: string
          source_turn?: number
          stat_key: string
          stat_unit?: string | null
          stat_value?: string
          updated_at?: string
        }
        Update: {
          entity_id?: string
          entity_type?: string
          id?: string
          session_id?: string
          source_turn?: number
          stat_key?: string
          stat_unit?: string | null
          stat_value?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_stats_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_traits: {
        Row: {
          created_at: string
          description: string | null
          entity_id: string | null
          entity_name: string
          entity_type: string
          id: string
          intensity: number
          is_active: boolean
          session_id: string
          source_event_id: string | null
          source_id: string | null
          source_turn: number
          source_type: string | null
          trait_category: string
          trait_text: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_name: string
          entity_type: string
          id?: string
          intensity?: number
          is_active?: boolean
          session_id: string
          source_event_id?: string | null
          source_id?: string | null
          source_turn?: number
          source_type?: string | null
          trait_category: string
          trait_text: string
        }
        Update: {
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_name?: string
          entity_type?: string
          id?: string
          intensity?: number
          is_active?: boolean
          session_id?: string
          source_event_id?: string | null
          source_id?: string | null
          source_turn?: number
          source_type?: string | null
          trait_category?: string
          trait_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_traits_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_traits_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "game_events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_annotations: {
        Row: {
          author: string
          created_at: string
          event_id: string
          id: string
          note_text: string
          visibility: string
        }
        Insert: {
          author: string
          created_at?: string
          event_id: string
          id?: string
          note_text: string
          visibility?: string
        }
        Update: {
          author?: string
          created_at?: string
          event_id?: string
          id?: string
          note_text?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_annotations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "game_events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_entity_links: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          event_id: string
          id: string
          link_type: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          event_id: string
          id?: string
          link_type?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_id?: string
          id?: string
          link_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_entity_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "world_events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_narratives: {
        Row: {
          created_at: string
          epoch_style: string
          event_id: string
          id: string
          is_canon: boolean
          key_quotes: string[] | null
          narrative_text: string
          references: Json | null
          version: number
        }
        Insert: {
          created_at?: string
          epoch_style?: string
          event_id: string
          id?: string
          is_canon?: boolean
          key_quotes?: string[] | null
          narrative_text: string
          references?: Json | null
          version?: number
        }
        Update: {
          created_at?: string
          epoch_style?: string
          event_id?: string
          id?: string
          is_canon?: boolean
          key_quotes?: string[] | null
          narrative_text?: string
          references?: Json | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_narratives_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "game_events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_responses: {
        Row: {
          created_at: string
          event_id: string
          id: string
          note: string
          player: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          note: string
          player: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          note?: string
          player?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_responses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "game_events"
            referencedColumns: ["id"]
          },
        ]
      }
      expeditions: {
        Row: {
          created_at: string
          expedition_type: string
          id: string
          launched_turn: number
          narrative: string | null
          player_name: string
          resolved_turn: number | null
          result_region_id: string | null
          session_id: string
          status: string
        }
        Insert: {
          created_at?: string
          expedition_type?: string
          id?: string
          launched_turn: number
          narrative?: string | null
          player_name: string
          resolved_turn?: number | null
          result_region_id?: string | null
          session_id: string
          status?: string
        }
        Update: {
          created_at?: string
          expedition_type?: string
          id?: string
          launched_turn?: number
          narrative?: string | null
          player_name?: string
          resolved_turn?: number | null
          result_region_id?: string | null
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "expeditions_result_region_id_fkey"
            columns: ["result_region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expeditions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      game_events: {
        Row: {
          armies_involved: string[] | null
          attacker_city_id: string | null
          casualties: string | null
          city_id: string | null
          confirmed: boolean
          created_at: string
          defender_city_id: string | null
          devastation_duration: number | null
          event_type: string
          id: string
          importance: string
          location: string | null
          note: string | null
          player: string
          result: string | null
          secondary_city_id: string | null
          session_id: string
          terms_summary: string | null
          treaty_type: string | null
          truth_state: string
          turn_number: number
        }
        Insert: {
          armies_involved?: string[] | null
          attacker_city_id?: string | null
          casualties?: string | null
          city_id?: string | null
          confirmed?: boolean
          created_at?: string
          defender_city_id?: string | null
          devastation_duration?: number | null
          event_type: string
          id?: string
          importance?: string
          location?: string | null
          note?: string | null
          player: string
          result?: string | null
          secondary_city_id?: string | null
          session_id: string
          terms_summary?: string | null
          treaty_type?: string | null
          truth_state?: string
          turn_number?: number
        }
        Update: {
          armies_involved?: string[] | null
          attacker_city_id?: string | null
          casualties?: string | null
          city_id?: string | null
          confirmed?: boolean
          created_at?: string
          defender_city_id?: string | null
          devastation_duration?: number | null
          event_type?: string
          id?: string
          importance?: string
          location?: string | null
          note?: string | null
          player?: string
          result?: string | null
          secondary_city_id?: string | null
          session_id?: string
          terms_summary?: string | null
          treaty_type?: string | null
          truth_state?: string
          turn_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_events_attacker_city_id_fkey"
            columns: ["attacker_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_events_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_events_defender_city_id_fkey"
            columns: ["defender_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_events_secondary_city_id_fkey"
            columns: ["secondary_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      game_memberships: {
        Row: {
          id: string
          joined_at: string
          player_name: string
          role: string
          session_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          player_name: string
          role?: string
          session_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          player_name?: string
          role?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_memberships_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      game_players: {
        Row: {
          created_at: string
          id: string
          player_name: string
          player_number: number
          session_id: string
          turn_closed: boolean
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          player_name: string
          player_number: number
          session_id: string
          turn_closed?: boolean
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          player_name?: string
          player_number?: number
          session_id?: string
          turn_closed?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_players_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      game_sessions: {
        Row: {
          created_at: string
          created_by: string | null
          current_era: string
          current_turn: number
          epoch_style: string
          game_mode: string
          id: string
          init_status: string
          max_players: number
          player1_name: string
          player2_name: string
          room_code: string
          tier: string
          turn_closed_p1: boolean
          turn_closed_p2: boolean
          world_seed: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_era?: string
          current_turn?: number
          epoch_style?: string
          game_mode?: string
          id?: string
          init_status?: string
          max_players?: number
          player1_name?: string
          player2_name?: string
          room_code: string
          tier?: string
          turn_closed_p1?: boolean
          turn_closed_p2?: boolean
          world_seed?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_era?: string
          current_turn?: number
          epoch_style?: string
          game_mode?: string
          id?: string
          init_status?: string
          max_players?: number
          player1_name?: string
          player2_name?: string
          room_code?: string
          tier?: string
          turn_closed_p1?: boolean
          turn_closed_p2?: boolean
          world_seed?: string | null
        }
        Relationships: []
      }
      game_style_settings: {
        Row: {
          default_style_preset: string
          id: string
          lore_bible: string | null
          prompt_rules: string | null
          session_id: string
          updated_at: string
        }
        Insert: {
          default_style_preset?: string
          id?: string
          lore_bible?: string | null
          prompt_rules?: string | null
          session_id: string
          updated_at?: string
        }
        Update: {
          default_style_preset?: string
          id?: string
          lore_bible?: string | null
          prompt_rules?: string | null
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_style_settings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      generals: {
        Row: {
          bio: string | null
          created_at: string
          flavor_trait: string | null
          id: string
          image_prompt: string | null
          image_url: string | null
          name: string
          player_name: string
          session_id: string
          skill: number
          traits: Json | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          flavor_trait?: string | null
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          name: string
          player_name: string
          session_id: string
          skill?: number
          traits?: Json | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          flavor_trait?: string | null
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          name?: string
          player_name?: string
          session_id?: string
          skill?: number
          traits?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "generals_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      great_persons: {
        Row: {
          bio: string | null
          born_round: number
          city_id: string | null
          created_at: string
          died_round: number | null
          exceptional_prompt: string | null
          flavor_trait: string | null
          id: string
          image_prompt: string | null
          image_url: string | null
          is_alive: boolean
          name: string
          person_type: string
          player_name: string
          session_id: string
        }
        Insert: {
          bio?: string | null
          born_round?: number
          city_id?: string | null
          created_at?: string
          died_round?: number | null
          exceptional_prompt?: string | null
          flavor_trait?: string | null
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          is_alive?: boolean
          name: string
          person_type?: string
          player_name: string
          session_id: string
        }
        Update: {
          bio?: string | null
          born_round?: number
          city_id?: string | null
          created_at?: string
          died_round?: number | null
          exceptional_prompt?: string | null
          flavor_trait?: string | null
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          is_alive?: boolean
          name?: string
          person_type?: string
          player_name?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "great_persons_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "great_persons_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      import_sources: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          id: string
          parsed_chronicles_count: number | null
          parsed_events_count: number | null
          raw_text: string
          session_id: string
          source_type: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          parsed_chronicles_count?: number | null
          parsed_events_count?: number | null
          raw_text: string
          session_id: string
          source_type?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          parsed_chronicles_count?: number | null
          parsed_events_count?: number | null
          raw_text?: string
          session_id?: string
          source_type?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_sources_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_reports: {
        Row: {
          created_at: string
          created_round: number
          id: string
          is_rumor_public: boolean
          report_text: string
          secrecy_level: string
          session_id: string
          source_type: string
          target_entity: string
          visible_to: string
        }
        Insert: {
          created_at?: string
          created_round?: number
          id?: string
          is_rumor_public?: boolean
          report_text: string
          secrecy_level?: string
          session_id: string
          source_type?: string
          target_entity: string
          visible_to: string
        }
        Update: {
          created_at?: string
          created_round?: number
          id?: string
          is_rumor_public?: boolean
          report_text?: string
          secrecy_level?: string
          session_id?: string
          source_type?: string
          target_entity?: string
          visible_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_reports_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      languages: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          phonetics: string | null
          session_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          phonetics?: string | null
          session_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          phonetics?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "languages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      laws: {
        Row: {
          ai_epic_text: string | null
          created_at: string
          enacted_turn: number
          full_text: string
          id: string
          is_active: boolean
          law_name: string
          player_name: string
          repealed_turn: number | null
          session_id: string
          structured_effects: Json
        }
        Insert: {
          ai_epic_text?: string | null
          created_at?: string
          enacted_turn?: number
          full_text: string
          id?: string
          is_active?: boolean
          law_name: string
          player_name: string
          repealed_turn?: number | null
          session_id: string
          structured_effects?: Json
        }
        Update: {
          ai_epic_text?: string | null
          created_at?: string
          enacted_turn?: number
          full_text?: string
          id?: string
          is_active?: boolean
          law_name?: string
          player_name?: string
          repealed_turn?: number | null
          session_id?: string
          structured_effects?: Json
        }
        Relationships: [
          {
            foreignKeyName: "laws_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_military_map: {
        Row: {
          id: string
          legacy_id: string
          migrated_at: string
          stack_id: string
        }
        Insert: {
          id?: string
          legacy_id: string
          migrated_at?: string
          stack_id: string
        }
        Update: {
          id?: string
          legacy_id?: string
          migrated_at?: string
          stack_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "legacy_military_map_stack_id_fkey"
            columns: ["stack_id"]
            isOneToOne: false
            referencedRelation: "military_stacks"
            referencedColumns: ["id"]
          },
        ]
      }
      macro_regions: {
        Row: {
          climate_band: number
          created_at: string
          elevation_band: number
          id: string
          moisture_band: number
          name: string
          region_key: string
          session_id: string
        }
        Insert: {
          climate_band?: number
          created_at?: string
          elevation_band?: number
          id?: string
          moisture_band?: number
          name: string
          region_key: string
          session_id: string
        }
        Update: {
          climate_band?: number
          created_at?: string
          elevation_band?: number
          id?: string
          moisture_band?: number
          name?: string
          region_key?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "macro_regions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      military_capacity: {
        Row: {
          army_name: string
          army_type: string
          created_at: string
          id: string
          iron_cost: number
          migrated: boolean
          player_name: string
          session_id: string
          status: string
        }
        Insert: {
          army_name: string
          army_type?: string
          created_at?: string
          id?: string
          iron_cost?: number
          migrated?: boolean
          player_name: string
          session_id: string
          status?: string
        }
        Update: {
          army_name?: string
          army_type?: string
          created_at?: string
          id?: string
          iron_cost?: number
          migrated?: boolean
          player_name?: string
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "military_capacity_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      military_stack_composition: {
        Row: {
          created_at: string
          equipment_level: number
          id: string
          manpower: number
          quality: number
          stack_id: string
          unit_type: string
        }
        Insert: {
          created_at?: string
          equipment_level?: number
          id?: string
          manpower?: number
          quality?: number
          stack_id: string
          unit_type?: string
        }
        Update: {
          created_at?: string
          equipment_level?: number
          id?: string
          manpower?: number
          quality?: number
          stack_id?: string
          unit_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "military_stack_composition_stack_id_fkey"
            columns: ["stack_id"]
            isOneToOne: false
            referencedRelation: "military_stacks"
            referencedColumns: ["id"]
          },
        ]
      }
      military_stacks: {
        Row: {
          created_at: string
          formation_type: string
          general_id: string | null
          hex_q: number
          hex_r: number
          id: string
          image_confirmed: boolean
          image_prompt: string | null
          image_url: string | null
          is_active: boolean
          is_deployed: boolean
          legacy_military_id: string | null
          morale: number
          moved_this_turn: boolean
          name: string
          player_name: string
          power: number
          province_id: string | null
          session_id: string
          sigil_confirmed: boolean
          sigil_prompt: string | null
          sigil_url: string | null
        }
        Insert: {
          created_at?: string
          formation_type?: string
          general_id?: string | null
          hex_q?: number
          hex_r?: number
          id?: string
          image_confirmed?: boolean
          image_prompt?: string | null
          image_url?: string | null
          is_active?: boolean
          is_deployed?: boolean
          legacy_military_id?: string | null
          morale?: number
          moved_this_turn?: boolean
          name: string
          player_name: string
          power?: number
          province_id?: string | null
          session_id: string
          sigil_confirmed?: boolean
          sigil_prompt?: string | null
          sigil_url?: string | null
        }
        Update: {
          created_at?: string
          formation_type?: string
          general_id?: string | null
          hex_q?: number
          hex_r?: number
          id?: string
          image_confirmed?: boolean
          image_prompt?: string | null
          image_url?: string | null
          is_active?: boolean
          is_deployed?: boolean
          legacy_military_id?: string | null
          morale?: number
          moved_this_turn?: boolean
          name?: string
          player_name?: string
          power?: number
          province_id?: string | null
          session_id?: string
          sigil_confirmed?: boolean
          sigil_prompt?: string | null
          sigil_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "military_stacks_general_id_fkey"
            columns: ["general_id"]
            isOneToOne: false
            referencedRelation: "generals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "military_stacks_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "provinces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "military_stacks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      player_activity: {
        Row: {
          created_at: string | null
          delegated_to: string | null
          delegation_style: string | null
          id: string
          is_delegated: boolean
          last_action_at: string | null
          player_name: string
          session_id: string
        }
        Insert: {
          created_at?: string | null
          delegated_to?: string | null
          delegation_style?: string | null
          id?: string
          is_delegated?: boolean
          last_action_at?: string | null
          player_name: string
          session_id: string
        }
        Update: {
          created_at?: string | null
          delegated_to?: string | null
          delegation_style?: string | null
          id?: string
          is_delegated?: boolean
          last_action_at?: string | null
          player_name?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_activity_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      player_chronicle_chapters: {
        Row: {
          chapter_text: string
          chapter_title: string
          created_at: string
          epoch_style: string
          from_turn: number
          id: string
          player_name: string
          references: Json | null
          session_id: string
          to_turn: number
        }
        Insert: {
          chapter_text: string
          chapter_title: string
          created_at?: string
          epoch_style?: string
          from_turn?: number
          id?: string
          player_name: string
          references?: Json | null
          session_id: string
          to_turn?: number
        }
        Update: {
          chapter_text?: string
          chapter_title?: string
          created_at?: string
          epoch_style?: string
          from_turn?: number
          id?: string
          player_name?: string
          references?: Json | null
          session_id?: string
          to_turn?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_chronicle_chapters_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      player_resources: {
        Row: {
          created_at: string
          id: string
          income: number
          last_applied_turn: number
          player_name: string
          resource_type: string
          session_id: string
          stockpile: number
          updated_at: string
          upkeep: number
        }
        Insert: {
          created_at?: string
          id?: string
          income?: number
          last_applied_turn?: number
          player_name: string
          resource_type: string
          session_id: string
          stockpile?: number
          updated_at?: string
          upkeep?: number
        }
        Update: {
          created_at?: string
          id?: string
          income?: number
          last_applied_turn?: number
          player_name?: string
          resource_type?: string
          session_id?: string
          stockpile?: number
          updated_at?: string
          upkeep?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_resources_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          id: string
          is_premium: boolean
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id: string
          is_premium?: boolean
          updated_at?: string
          username?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          is_premium?: boolean
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      province_hexes: {
        Row: {
          biome_family: string
          coastal: boolean
          created_at: string
          id: string
          macro_region_id: string | null
          mean_height: number
          moisture_band: number
          q: number
          r: number
          seed: string
          session_id: string
          temp_band: number
        }
        Insert: {
          biome_family?: string
          coastal?: boolean
          created_at?: string
          id?: string
          macro_region_id?: string | null
          mean_height?: number
          moisture_band?: number
          q: number
          r: number
          seed: string
          session_id: string
          temp_band?: number
        }
        Update: {
          biome_family?: string
          coastal?: boolean
          created_at?: string
          id?: string
          macro_region_id?: string | null
          mean_height?: number
          moisture_band?: number
          q?: number
          r?: number
          seed?: string
          session_id?: string
          temp_band?: number
        }
        Relationships: [
          {
            foreignKeyName: "province_hexes_macro_region_id_fkey"
            columns: ["macro_region_id"]
            isOneToOne: false
            referencedRelation: "macro_regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "province_hexes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      provinces: {
        Row: {
          ai_description: string | null
          capital_city_id: string | null
          created_at: string
          description: string | null
          id: string
          image_prompt: string | null
          image_url: string | null
          name: string
          owner_player: string
          region_id: string | null
          session_id: string
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          ai_description?: string | null
          capital_city_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          name: string
          owner_player: string
          region_id?: string | null
          session_id: string
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          ai_description?: string | null
          capital_city_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          name?: string
          owner_player?: string
          region_id?: string | null
          session_id?: string
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provinces_capital_city_id_fkey"
            columns: ["capital_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provinces_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provinces_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      realm_infrastructure: {
        Row: {
          created_at: string
          granaries_count: number
          granary_level: number
          id: string
          notes: Json | null
          player_name: string
          session_id: string
          slavery_factor: number
          stables_count: number
          stables_level: number
        }
        Insert: {
          created_at?: string
          granaries_count?: number
          granary_level?: number
          id?: string
          notes?: Json | null
          player_name: string
          session_id: string
          slavery_factor?: number
          stables_count?: number
          stables_level?: number
        }
        Update: {
          created_at?: string
          granaries_count?: number
          granary_level?: number
          id?: string
          notes?: Json | null
          player_name?: string
          session_id?: string
          slavery_factor?: number
          stables_count?: number
          stables_level?: number
        }
        Relationships: [
          {
            foreignKeyName: "realm_infrastructure_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      realm_resources: {
        Row: {
          army_sigil_prompt: string | null
          army_sigil_url: string | null
          created_at: string
          famine_city_count: number
          gold_reserve: number
          grain_reserve: number
          granary_capacity: number
          horses_reserve: number
          id: string
          iron_reserve: number
          knowledge: number
          labor_reserve: number
          last_processed_turn: number
          last_turn_grain_cons: number
          last_turn_grain_net: number
          last_turn_grain_prod: number
          last_turn_iron_prod: number
          last_turn_stone_prod: number
          last_turn_wood_prod: number
          logistic_capacity: number
          manpower_committed: number
          manpower_pool: number
          mobilization_rate: number
          player_name: string
          prestige: number
          realm_report_cached: string | null
          realm_report_last_turn: number
          session_id: string
          stability: number
          stables_capacity: number
          stone_reserve: number
          updated_at: string
          wood_reserve: number
        }
        Insert: {
          army_sigil_prompt?: string | null
          army_sigil_url?: string | null
          created_at?: string
          famine_city_count?: number
          gold_reserve?: number
          grain_reserve?: number
          granary_capacity?: number
          horses_reserve?: number
          id?: string
          iron_reserve?: number
          knowledge?: number
          labor_reserve?: number
          last_processed_turn?: number
          last_turn_grain_cons?: number
          last_turn_grain_net?: number
          last_turn_grain_prod?: number
          last_turn_iron_prod?: number
          last_turn_stone_prod?: number
          last_turn_wood_prod?: number
          logistic_capacity?: number
          manpower_committed?: number
          manpower_pool?: number
          mobilization_rate?: number
          player_name: string
          prestige?: number
          realm_report_cached?: string | null
          realm_report_last_turn?: number
          session_id: string
          stability?: number
          stables_capacity?: number
          stone_reserve?: number
          updated_at?: string
          wood_reserve?: number
        }
        Update: {
          army_sigil_prompt?: string | null
          army_sigil_url?: string | null
          created_at?: string
          famine_city_count?: number
          gold_reserve?: number
          grain_reserve?: number
          granary_capacity?: number
          horses_reserve?: number
          id?: string
          iron_reserve?: number
          knowledge?: number
          labor_reserve?: number
          last_processed_turn?: number
          last_turn_grain_cons?: number
          last_turn_grain_net?: number
          last_turn_grain_prod?: number
          last_turn_iron_prod?: number
          last_turn_stone_prod?: number
          last_turn_wood_prod?: number
          logistic_capacity?: number
          manpower_committed?: number
          manpower_pool?: number
          mobilization_rate?: number
          player_name?: string
          prestige?: number
          realm_report_cached?: string | null
          realm_report_last_turn?: number
          session_id?: string
          stability?: number
          stables_capacity?: number
          stone_reserve?: number
          updated_at?: string
          wood_reserve?: number
        }
        Relationships: [
          {
            foreignKeyName: "realm_resources_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      regions: {
        Row: {
          ai_description: string | null
          biome: string | null
          country_id: string | null
          created_at: string
          description: string | null
          discovered_by: string | null
          discovered_turn: number | null
          id: string
          image_prompt: string | null
          image_url: string | null
          is_homeland: boolean | null
          name: string
          owner_player: string | null
          session_id: string
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          ai_description?: string | null
          biome?: string | null
          country_id?: string | null
          created_at?: string
          description?: string | null
          discovered_by?: string | null
          discovered_turn?: number | null
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          is_homeland?: boolean | null
          name: string
          owner_player?: string | null
          session_id: string
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          ai_description?: string | null
          biome?: string | null
          country_id?: string | null
          created_at?: string
          description?: string | null
          discovered_by?: string | null
          discovered_turn?: number | null
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          is_homeland?: boolean | null
          name?: string
          owner_player?: string | null
          session_id?: string
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "regions_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      saga_versions: {
        Row: {
          author_player: string
          book_title: string | null
          chronicler_name: string | null
          created_at: string
          entity_id: string
          entity_type: string
          history_text: string | null
          id: string
          is_ai_generated: boolean
          published_as_book: boolean | null
          saga_text: string
          session_id: string
          source_summary: Json | null
          source_turn: number
          version: number
        }
        Insert: {
          author_player?: string
          book_title?: string | null
          chronicler_name?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          history_text?: string | null
          id?: string
          is_ai_generated?: boolean
          published_as_book?: boolean | null
          saga_text: string
          session_id: string
          source_summary?: Json | null
          source_turn?: number
          version?: number
        }
        Update: {
          author_player?: string
          book_title?: string | null
          chronicler_name?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          history_text?: string | null
          id?: string
          is_ai_generated?: boolean
          published_as_book?: boolean | null
          saga_text?: string
          session_id?: string
          source_summary?: Json | null
          source_turn?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "saga_versions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      secret_objectives: {
        Row: {
          created_at: string
          fulfilled: boolean
          fulfilled_round: number | null
          id: string
          objective_text: string
          player_name: string
          session_id: string
        }
        Insert: {
          created_at?: string
          fulfilled?: boolean
          fulfilled_round?: number | null
          id?: string
          objective_text: string
          player_name: string
          session_id: string
        }
        Update: {
          created_at?: string
          fulfilled?: boolean
          fulfilled_round?: number | null
          id?: string
          objective_text?: string
          player_name?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "secret_objectives_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      server_config: {
        Row: {
          admin_user_id: string | null
          created_at: string | null
          delegation_enabled: boolean
          economic_params: Json
          id: string
          inactivity_threshold_hours: number
          max_players: number
          session_id: string
          tick_interval_seconds: number
          time_scale: number
        }
        Insert: {
          admin_user_id?: string | null
          created_at?: string | null
          delegation_enabled?: boolean
          economic_params?: Json
          id?: string
          inactivity_threshold_hours?: number
          max_players?: number
          session_id: string
          tick_interval_seconds?: number
          time_scale?: number
        }
        Update: {
          admin_user_id?: string | null
          created_at?: string | null
          delegation_enabled?: boolean
          economic_params?: Json
          id?: string
          inactivity_threshold_hours?: number
          max_players?: number
          session_id?: string
          tick_interval_seconds?: number
          time_scale?: number
        }
        Relationships: [
          {
            foreignKeyName: "server_config_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_resource_profiles: {
        Row: {
          base_grain: number
          base_special: number
          base_wood: number
          city_id: string
          created_at: string
          founded_seed: string | null
          id: string
          produces_grain: boolean
          produces_wood: boolean
          special_resource_type: string
          updated_at: string
        }
        Insert: {
          base_grain?: number
          base_special?: number
          base_wood?: number
          city_id: string
          created_at?: string
          founded_seed?: string | null
          id?: string
          produces_grain?: boolean
          produces_wood?: boolean
          special_resource_type?: string
          updated_at?: string
        }
        Update: {
          base_grain?: number
          base_special?: number
          base_wood?: number
          city_id?: string
          created_at?: string
          founded_seed?: string | null
          id?: string
          produces_grain?: boolean
          produces_wood?: boolean
          special_resource_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_resource_profiles_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: true
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      simulation_log: {
        Row: {
          created_at: string
          events_generated: number
          id: string
          scope: string
          session_id: string
          triggered_by: string
          year_end: number
          year_start: number
        }
        Insert: {
          created_at?: string
          events_generated?: number
          id?: string
          scope?: string
          session_id: string
          triggered_by?: string
          year_end: number
          year_start: number
        }
        Update: {
          created_at?: string
          events_generated?: number
          id?: string
          scope?: string
          session_id?: string
          triggered_by?: string
          year_end?: number
          year_start?: number
        }
        Relationships: [
          {
            foreignKeyName: "simulation_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      time_pools: {
        Row: {
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
          pool_name: string
          resets_at: string | null
          session_id: string
          total_minutes: number
          used_minutes: number
        }
        Insert: {
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          pool_name: string
          resets_at?: string | null
          session_id: string
          total_minutes?: number
          used_minutes?: number
        }
        Update: {
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          pool_name?: string
          resets_at?: string | null
          session_id?: string
          total_minutes?: number
          used_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "time_pools_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_log: {
        Row: {
          amount: number
          created_at: string
          from_player: string
          id: string
          note: string | null
          resource_type: string
          session_id: string
          to_player: string
          trade_type: string
          turn_number: number
        }
        Insert: {
          amount: number
          created_at?: string
          from_player: string
          id?: string
          note?: string | null
          resource_type: string
          session_id: string
          to_player: string
          trade_type?: string
          turn_number?: number
        }
        Update: {
          amount?: number
          created_at?: string
          from_player?: string
          id?: string
          note?: string | null
          resource_type?: string
          session_id?: string
          to_player?: string
          trade_type?: string
          turn_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "trade_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_offers: {
        Row: {
          created_at: string
          duration_turns: number | null
          from_city_id: string
          from_player: string
          id: string
          message: string | null
          offer_resources: Json
          request_resources: Json
          responded_at: string | null
          session_id: string
          status: string
          to_city_id: string
          to_player: string
          turn_number: number
        }
        Insert: {
          created_at?: string
          duration_turns?: number | null
          from_city_id: string
          from_player: string
          id?: string
          message?: string | null
          offer_resources?: Json
          request_resources?: Json
          responded_at?: string | null
          session_id: string
          status?: string
          to_city_id: string
          to_player: string
          turn_number?: number
        }
        Update: {
          created_at?: string
          duration_turns?: number | null
          from_city_id?: string
          from_player?: string
          id?: string
          message?: string | null
          offer_resources?: Json
          request_resources?: Json
          responded_at?: string | null
          session_id?: string
          status?: string
          to_city_id?: string
          to_player?: string
          turn_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "trade_offers_from_city_id_fkey"
            columns: ["from_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_offers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_offers_to_city_id_fkey"
            columns: ["to_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_routes: {
        Row: {
          amount_per_turn: number
          created_at: string
          duration_turns: number | null
          expires_turn: number | null
          from_city_id: string
          from_player: string
          id: string
          narrative: string | null
          resource_type: string
          return_amount: number | null
          return_resource_type: string | null
          route_safety: number
          session_id: string
          started_turn: number
          status: string
          to_city_id: string
          to_player: string
        }
        Insert: {
          amount_per_turn?: number
          created_at?: string
          duration_turns?: number | null
          expires_turn?: number | null
          from_city_id: string
          from_player: string
          id?: string
          narrative?: string | null
          resource_type?: string
          return_amount?: number | null
          return_resource_type?: string | null
          route_safety?: number
          session_id: string
          started_turn?: number
          status?: string
          to_city_id: string
          to_player: string
        }
        Update: {
          amount_per_turn?: number
          created_at?: string
          duration_turns?: number | null
          expires_turn?: number | null
          from_city_id?: string
          from_player?: string
          id?: string
          narrative?: string | null
          resource_type?: string
          return_amount?: number | null
          return_resource_type?: string | null
          route_safety?: number
          session_id?: string
          started_turn?: number
          status?: string
          to_city_id?: string
          to_player?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_routes_from_city_id_fkey"
            columns: ["from_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_routes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_routes_to_city_id_fkey"
            columns: ["to_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_orders: {
        Row: {
          arrives_at: string
          created_at: string | null
          departed_at: string | null
          entity_id: string | null
          entity_type: string
          from_province_id: string | null
          id: string
          player_name: string
          session_id: string
          status: string
          to_province_id: string | null
        }
        Insert: {
          arrives_at: string
          created_at?: string | null
          departed_at?: string | null
          entity_id?: string | null
          entity_type?: string
          from_province_id?: string | null
          id?: string
          player_name: string
          session_id: string
          status?: string
          to_province_id?: string | null
        }
        Update: {
          arrives_at?: string
          created_at?: string | null
          departed_at?: string | null
          entity_id?: string | null
          entity_type?: string
          from_province_id?: string | null
          id?: string
          player_name?: string
          session_id?: string
          status?: string
          to_province_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "travel_orders_from_province_id_fkey"
            columns: ["from_province_id"]
            isOneToOne: false
            referencedRelation: "provinces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_orders_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_orders_to_province_id_fkey"
            columns: ["to_province_id"]
            isOneToOne: false
            referencedRelation: "provinces"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_routes: {
        Row: {
          created_at: string | null
          distance_minutes: number
          from_province_id: string | null
          id: string
          is_active: boolean
          session_id: string
          terrain_modifier: number
          to_province_id: string | null
        }
        Insert: {
          created_at?: string | null
          distance_minutes?: number
          from_province_id?: string | null
          id?: string
          is_active?: boolean
          session_id: string
          terrain_modifier?: number
          to_province_id?: string | null
        }
        Update: {
          created_at?: string | null
          distance_minutes?: number
          from_province_id?: string | null
          id?: string
          is_active?: boolean
          session_id?: string
          terrain_modifier?: number
          to_province_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "travel_routes_from_province_id_fkey"
            columns: ["from_province_id"]
            isOneToOne: false
            referencedRelation: "provinces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_routes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_routes_to_province_id_fkey"
            columns: ["to_province_id"]
            isOneToOne: false
            referencedRelation: "provinces"
            referencedColumns: ["id"]
          },
        ]
      }
      turn_summaries: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          session_id: string
          status: string
          summary_text: string | null
          turn_number: number
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          session_id: string
          status?: string
          summary_text?: string | null
          turn_number: number
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          session_id?: string
          status?: string
          summary_text?: string | null
          turn_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "turn_summaries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_type_visuals: {
        Row: {
          created_at: string
          id: string
          image_prompt: string | null
          image_url: string | null
          player_name: string
          session_id: string
          unit_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          player_name: string
          session_id: string
          unit_type: string
        }
        Update: {
          created_at?: string
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          player_name?: string
          session_id?: string
          unit_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_type_visuals_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wiki_entries: {
        Row: {
          ai_description: string | null
          created_at: string
          entity_id: string | null
          entity_name: string
          entity_type: string
          id: string
          image_prompt: string | null
          image_url: string | null
          owner_player: string
          references: Json | null
          session_id: string
          summary: string | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          ai_description?: string | null
          created_at?: string
          entity_id?: string | null
          entity_name: string
          entity_type?: string
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          owner_player: string
          references?: Json | null
          session_id: string
          summary?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          ai_description?: string | null
          created_at?: string
          entity_id?: string | null
          entity_name?: string
          entity_type?: string
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          owner_player?: string
          references?: Json | null
          session_id?: string
          summary?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      wonder_draft_images: {
        Row: {
          created_at: string
          id: string
          image_prompt: string | null
          image_url: string
          wonder_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_prompt?: string | null
          image_url: string
          wonder_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_prompt?: string | null
          image_url?: string
          wonder_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wonder_draft_images_wonder_id_fkey"
            columns: ["wonder_id"]
            isOneToOne: false
            referencedRelation: "wonders"
            referencedColumns: ["id"]
          },
        ]
      }
      wonders: {
        Row: {
          bonus: string | null
          city_name: string | null
          created_at: string
          description: string | null
          era: string
          id: string
          image_prompt: string | null
          image_url: string | null
          memory_fact: string | null
          name: string
          owner_player: string
          session_id: string
          status: string
          updated_at: string
        }
        Insert: {
          bonus?: string | null
          city_name?: string | null
          created_at?: string
          description?: string | null
          era?: string
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          memory_fact?: string | null
          name: string
          owner_player: string
          session_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          bonus?: string | null
          city_name?: string | null
          created_at?: string
          description?: string | null
          era?: string
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          memory_fact?: string | null
          name?: string
          owner_player?: string
          session_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wonders_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      world_action_log: {
        Row: {
          action_type: string
          created_at: string
          description: string
          id: string
          metadata: Json | null
          player_name: string
          session_id: string
          turn_number: number
        }
        Insert: {
          action_type: string
          created_at?: string
          description: string
          id?: string
          metadata?: Json | null
          player_name: string
          session_id: string
          turn_number: number
        }
        Update: {
          action_type?: string
          created_at?: string
          description?: string
          id?: string
          metadata?: Json | null
          player_name?: string
          session_id?: string
          turn_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "world_action_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      world_crises: {
        Row: {
          affected_cities: string[] | null
          created_at: string
          crisis_type: string
          description: string
          id: string
          resolved: boolean
          resolved_round: number | null
          session_id: string
          title: string
          trigger_round: number
        }
        Insert: {
          affected_cities?: string[] | null
          created_at?: string
          crisis_type?: string
          description: string
          id?: string
          resolved?: boolean
          resolved_round?: number | null
          session_id: string
          title: string
          trigger_round?: number
        }
        Update: {
          affected_cities?: string[] | null
          created_at?: string
          crisis_type?: string
          description?: string
          id?: string
          resolved?: boolean
          resolved_round?: number | null
          session_id?: string
          title?: string
          trigger_round?: number
        }
        Relationships: [
          {
            foreignKeyName: "world_crises_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      world_events: {
        Row: {
          affected_players: string[] | null
          ai_image_prompt: string | null
          ai_image_url: string | null
          auto_publish_after_turns: number | null
          created_at: string
          created_by_type: string
          created_by_user_id: string | null
          created_turn: number | null
          date: string | null
          date_precision: string
          description: string | null
          event_category: string
          id: string
          location_id: string | null
          participants: Json
          player_edited: boolean
          references: Json | null
          related_event_ids: string[] | null
          session_id: string
          slug: string
          status: string
          summary: string | null
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          affected_players?: string[] | null
          ai_image_prompt?: string | null
          ai_image_url?: string | null
          auto_publish_after_turns?: number | null
          created_at?: string
          created_by_type?: string
          created_by_user_id?: string | null
          created_turn?: number | null
          date?: string | null
          date_precision?: string
          description?: string | null
          event_category?: string
          id?: string
          location_id?: string | null
          participants?: Json
          player_edited?: boolean
          references?: Json | null
          related_event_ids?: string[] | null
          session_id: string
          slug: string
          status?: string
          summary?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          affected_players?: string[] | null
          ai_image_prompt?: string | null
          ai_image_url?: string | null
          auto_publish_after_turns?: number | null
          created_at?: string
          created_by_type?: string
          created_by_user_id?: string | null
          created_turn?: number | null
          date?: string | null
          date_precision?: string
          description?: string | null
          event_category?: string
          id?: string
          location_id?: string | null
          participants?: Json
          player_edited?: boolean
          references?: Json | null
          related_event_ids?: string[] | null
          session_id?: string
          slug?: string
          status?: string
          summary?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      world_feed_items: {
        Row: {
          content: string
          created_at: string
          feed_type: string
          id: string
          importance: string
          linked_city: string | null
          linked_event_id: string | null
          references: Json | null
          session_id: string
          turn_number: number
        }
        Insert: {
          content: string
          created_at?: string
          feed_type?: string
          id?: string
          importance?: string
          linked_city?: string | null
          linked_event_id?: string | null
          references?: Json | null
          session_id: string
          turn_number: number
        }
        Update: {
          content?: string
          created_at?: string
          feed_type?: string
          id?: string
          importance?: string
          linked_city?: string | null
          linked_event_id?: string | null
          references?: Json | null
          session_id?: string
          turn_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "world_feed_items_linked_event_id_fkey"
            columns: ["linked_event_id"]
            isOneToOne: false
            referencedRelation: "game_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_feed_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      world_foundations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          initial_factions: string[] | null
          premise: string
          session_id: string
          tone: string
          victory_style: string
          world_name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          initial_factions?: string[] | null
          premise: string
          session_id: string
          tone?: string
          victory_style?: string
          world_name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          initial_factions?: string[] | null
          premise?: string
          session_id?: string
          tone?: string
          victory_style?: string
          world_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_foundations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      world_history_chapters: {
        Row: {
          chapter_text: string
          chapter_title: string
          created_at: string
          epoch_style: string
          from_turn: number
          id: string
          references: Json | null
          session_id: string
          to_turn: number
        }
        Insert: {
          chapter_text: string
          chapter_title: string
          created_at?: string
          epoch_style?: string
          from_turn?: number
          id?: string
          references?: Json | null
          session_id: string
          to_turn?: number
        }
        Update: {
          chapter_text?: string
          chapter_title?: string
          created_at?: string
          epoch_style?: string
          from_turn?: number
          id?: string
          references?: Json | null
          session_id?: string
          to_turn?: number
        }
        Relationships: [
          {
            foreignKeyName: "world_history_chapters_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      world_memories: {
        Row: {
          approved: boolean
          category: string
          city_id: string | null
          created_at: string
          created_round: number
          id: string
          province_id: string | null
          session_id: string
          text: string
        }
        Insert: {
          approved?: boolean
          category?: string
          city_id?: string | null
          created_at?: string
          created_round?: number
          id?: string
          province_id?: string | null
          session_id: string
          text: string
        }
        Update: {
          approved?: boolean
          category?: string
          city_id?: string | null
          created_at?: string
          created_round?: number
          id?: string
          province_id?: string | null
          session_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_memories_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_memories_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "provinces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_memories_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      world_tick_log: {
        Row: {
          created_at: string
          finished_at: string | null
          id: string
          results: Json
          session_id: string
          started_at: string
          status: string
          turn_number: number
        }
        Insert: {
          created_at?: string
          finished_at?: string | null
          id?: string
          results?: Json
          session_id: string
          started_at?: string
          status?: string
          turn_number: number
        }
        Update: {
          created_at?: string
          finished_at?: string | null
          id?: string
          results?: Json
          session_id?: string
          started_at?: string
          status?: string
          turn_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "world_tick_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
