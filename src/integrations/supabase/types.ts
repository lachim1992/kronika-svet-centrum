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
          id: string
          level: string
          name: string
          owner_player: string
          province: string | null
          session_id: string
          tags: string[] | null
        }
        Insert: {
          created_at?: string
          id?: string
          level?: string
          name: string
          owner_player: string
          province?: string | null
          session_id: string
          tags?: string[] | null
        }
        Update: {
          created_at?: string
          id?: string
          level?: string
          name?: string
          owner_player?: string
          province?: string | null
          session_id?: string
          tags?: string[] | null
        }
        Relationships: [
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
          confirmed: boolean
          created_at: string
          event_type: string
          id: string
          location: string | null
          note: string | null
          player: string
          session_id: string
          turn_number: number
        }
        Insert: {
          confirmed?: boolean
          created_at?: string
          event_type: string
          id?: string
          location?: string | null
          note?: string | null
          player: string
          session_id: string
          turn_number?: number
        }
        Update: {
          confirmed?: boolean
          created_at?: string
          event_type?: string
          id?: string
          location?: string | null
          note?: string | null
          player?: string
          session_id?: string
          turn_number?: number
        }
        Relationships: [
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
      wonders: {
        Row: {
          bonus: string | null
          city_name: string | null
          created_at: string
          description: string | null
          era: string
          id: string
          image_prompt: string | null
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
      world_memories: {
        Row: {
          approved: boolean
          created_at: string
          id: string
          session_id: string
          text: string
        }
        Insert: {
          approved?: boolean
          created_at?: string
          id?: string
          session_id: string
          text: string
        }
        Update: {
          approved?: boolean
          created_at?: string
          id?: string
          session_id?: string
          text?: string
        }
        Relationships: [
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
