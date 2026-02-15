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
      chronicle_entries: {
        Row: {
          created_at: string
          epoch_style: string
          id: string
          session_id: string
          text: string
        }
        Insert: {
          created_at?: string
          epoch_style?: string
          id?: string
          session_id: string
          text: string
        }
        Update: {
          created_at?: string
          epoch_style?: string
          id?: string
          session_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "chronicle_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          created_at: string
          devastated_round: number | null
          flavor_prompt: string | null
          founded_round: number
          id: string
          level: string
          name: string
          owner_player: string
          province: string | null
          province_id: string | null
          ruins_note: string | null
          session_id: string
          status: string
          tags: string[] | null
        }
        Insert: {
          created_at?: string
          devastated_round?: number | null
          flavor_prompt?: string | null
          founded_round?: number
          id?: string
          level?: string
          name: string
          owner_player: string
          province?: string | null
          province_id?: string | null
          ruins_note?: string | null
          session_id: string
          status?: string
          tags?: string[] | null
        }
        Update: {
          created_at?: string
          devastated_round?: number | null
          flavor_prompt?: string | null
          founded_round?: number
          id?: string
          level?: string
          name?: string
          owner_player?: string
          province?: string | null
          province_id?: string | null
          ruins_note?: string | null
          session_id?: string
          status?: string
          tags?: string[] | null
        }
        Relationships: [
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
      civilizations: {
        Row: {
          architectural_style: string | null
          civ_name: string
          core_myth: string | null
          created_at: string
          cultural_quirk: string | null
          id: string
          player_name: string
          session_id: string
        }
        Insert: {
          architectural_style?: string | null
          civ_name?: string
          core_myth?: string | null
          created_at?: string
          cultural_quirk?: string | null
          id?: string
          player_name: string
          session_id: string
        }
        Update: {
          architectural_style?: string | null
          civ_name?: string
          core_myth?: string | null
          created_at?: string
          cultural_quirk?: string | null
          id?: string
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
      declarations: {
        Row: {
          created_at: string
          declaration_type: string
          epic_text: string | null
          id: string
          original_text: string
          player_name: string
          session_id: string
          turn_number: number
        }
        Insert: {
          created_at?: string
          declaration_type?: string
          epic_text?: string | null
          id?: string
          original_text: string
          player_name: string
          session_id: string
          turn_number?: number
        }
        Update: {
          created_at?: string
          declaration_type?: string
          epic_text?: string | null
          id?: string
          original_text?: string
          player_name?: string
          session_id?: string
          turn_number?: number
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
      entity_traits: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_name: string
          entity_type: string
          id: string
          is_active: boolean
          session_id: string
          source_event_id: string | null
          source_turn: number
          trait_category: string
          trait_text: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_name: string
          entity_type: string
          id?: string
          is_active?: boolean
          session_id: string
          source_event_id?: string | null
          source_turn?: number
          trait_category: string
          trait_text: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_name?: string
          entity_type?: string
          id?: string
          is_active?: boolean
          session_id?: string
          source_event_id?: string | null
          source_turn?: number
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
      event_narratives: {
        Row: {
          created_at: string
          epoch_style: string
          event_id: string
          id: string
          is_canon: boolean
          key_quotes: string[] | null
          narrative_text: string
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
      game_players: {
        Row: {
          created_at: string
          id: string
          player_name: string
          player_number: number
          session_id: string
          turn_closed: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          player_name: string
          player_number: number
          session_id: string
          turn_closed?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          player_name?: string
          player_number?: number
          session_id?: string
          turn_closed?: boolean
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
          current_era: string
          current_turn: number
          epoch_style: string
          id: string
          max_players: number
          player1_name: string
          player2_name: string
          room_code: string
          turn_closed_p1: boolean
          turn_closed_p2: boolean
        }
        Insert: {
          created_at?: string
          current_era?: string
          current_turn?: number
          epoch_style?: string
          id?: string
          max_players?: number
          player1_name?: string
          player2_name?: string
          room_code: string
          turn_closed_p1?: boolean
          turn_closed_p2?: boolean
        }
        Update: {
          created_at?: string
          current_era?: string
          current_turn?: number
          epoch_style?: string
          id?: string
          max_players?: number
          player1_name?: string
          player2_name?: string
          room_code?: string
          turn_closed_p1?: boolean
          turn_closed_p2?: boolean
        }
        Relationships: []
      }
      great_persons: {
        Row: {
          born_round: number
          city_id: string | null
          created_at: string
          died_round: number | null
          flavor_trait: string | null
          id: string
          is_alive: boolean
          name: string
          person_type: string
          player_name: string
          session_id: string
        }
        Insert: {
          born_round?: number
          city_id?: string | null
          created_at?: string
          died_round?: number | null
          flavor_trait?: string | null
          id?: string
          is_alive?: boolean
          name: string
          person_type?: string
          player_name: string
          session_id: string
        }
        Update: {
          born_round?: number
          city_id?: string | null
          created_at?: string
          died_round?: number | null
          flavor_trait?: string | null
          id?: string
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
      military_capacity: {
        Row: {
          army_name: string
          army_type: string
          created_at: string
          id: string
          iron_cost: number
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
      player_resources: {
        Row: {
          created_at: string
          id: string
          income: number
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
      provinces: {
        Row: {
          capital_city_id: string | null
          created_at: string
          id: string
          name: string
          owner_player: string
          session_id: string
        }
        Insert: {
          capital_city_id?: string | null
          created_at?: string
          id?: string
          name: string
          owner_player: string
          session_id: string
        }
        Update: {
          capital_city_id?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_player?: string
          session_id?: string
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
            foreignKeyName: "provinces_session_id_fkey"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
