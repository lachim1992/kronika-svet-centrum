import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages, type PageResult } from "@/lib/atlas/paging";
import type { MarketRow } from "@/lib/atlas/market";
import type { DbRecipe } from "@/lib/atlas/chains";

/** Read-only Atlas reads. Selects list explicit columns; hidden geology tables/columns are never requested. */
export const HEX_SAFE_COLUMNS = "q, r, grid_x, grid_y, biome_family, has_river, coastal, mean_height, is_passable, forest_density, owner_player, province_id";
const sb = supabase as any;

export type AtlasGood = { key: string; display_name: string; description: string | null; icon: string | null; category: string | null; production_stage: string | null; demand_basket: string | null; base_price_numeric: number | null; storable: boolean | null };

export function useAtlasCatalog() {
  return useQuery({
    queryKey: ["atlas", "catalog"], staleTime: 5 * 60_000,
    queryFn: async () => {
      const goods = await fetchAllPages<AtlasGood>((f, t) => sb.from("goods").select("key, display_name, description, icon, category, production_stage, demand_basket, base_price_numeric, storable").order("key").range(f, t));
      const recipes = await fetchAllPages<DbRecipe>((f, t) => sb.from("production_recipes").select("recipe_key, output_good_key, output_quantity, input_items, required_role, required_tags, labor_cost, description").order("recipe_key").range(f, t));
      return { goods, recipes };
    },
  });
}

export function useWorldMarket(sessionId: string) {
  return useQuery({
    queryKey: ["atlas", "market", sessionId], enabled: !!sessionId, staleTime: 30_000,
    queryFn: async () => {
      const latest = await sb.from("city_market_summary").select("turn_number").eq("session_id", sessionId).order("turn_number", { ascending: false }).limit(1);
      if (latest.error) return { rows: [] as MarketRow[], complete: false, error: latest.error.message as string | null, snapshotTurn: null as number | null, nodes: new Map<string, string>() };
      const snapshotTurn: number | null = latest.data?.[0]?.turn_number ?? null;
      if (snapshotTurn == null) return { rows: [], complete: true, error: null, snapshotTurn, nodes: new Map() };
      const rows: PageResult<MarketRow> = await fetchAllPages((f, t) => sb.from("city_market_summary").select("city_node_id, good_key, supply_volume, demand_volume, price_numeric, turn_number").eq("session_id", sessionId).eq("turn_number", snapshotTurn).order("id").range(f, t));
      const nodes = await fetchAllPages<{ id: string; city_id: string | null; name: string | null }>((f, t) => sb.from("province_nodes").select("id, city_id, name").eq("session_id", sessionId).not("city_id", "is", null).order("id").range(f, t));
      return { ...rows, complete: rows.complete && nodes.complete, error: rows.error || nodes.error, snapshotTurn, nodes: new Map(nodes.rows.map(n => [n.id, n.city_id || ""])) };
    },
  });
}

export function useAtlasTerritory(sessionId: string, playerName: string) {
  return useQuery({
    queryKey: ["atlas", "territory", sessionId, playerName], enabled: !!sessionId && !!playerName, staleTime: 30_000,
    queryFn: async () => {
      const [hexes, parcels, surveys, roads] = await Promise.all([
        fetchAllPages<any>((f, t) => sb.from("province_hexes").select(HEX_SAFE_COLUMNS).eq("session_id", sessionId).order("id").range(f, t)),
        fetchAllPages<any>((f, t) => sb.from("tile_parcels").select("id, grid_x, grid_y, parcel_index, sub_biome, elevation, buildable, capacity_slots, status, land_use, city_id, owner_player, claim_kind, building_id").eq("session_id", sessionId).eq("owner_player", playerName).order("id").range(f, t)),
        fetchAllPages<any>((f, t) => sb.from("macro_surveys").select("grid_x, grid_y, level, findings, surveyed_turn, landmark_name").eq("session_id", sessionId).eq("player_name", playerName).order("id").range(f, t)),
        fetchAllPages<any>((f, t) => sb.from("road_segments").select("id, from_x, from_y, to_x, to_y, level, status").eq("session_id", sessionId).eq("owner_player", playerName).order("id").range(f, t)),
      ]);
      return { hexes, parcels, surveys, roads };
    },
  });
}
