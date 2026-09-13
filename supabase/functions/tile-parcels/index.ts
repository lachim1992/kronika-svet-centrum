import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateTileParcels, TILE_PARCEL_COUNT } from "../_shared/tileParcels.ts";
import { seatCityOnParcels } from "../_shared/citySeat.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/**
 * tile-parcels — lazily materializes and returns the 36 sub-parcels of one map cell.
 * The layout is deterministic (session seed + cell terrain), so materializing later never
 * changes what a player already saw.
 * Body: { session_id, grid_x, grid_y }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Přihlášení je vyžadováno" }, 401);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await authClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Neplatná session" }, 401);

    const body = await req.json().catch(() => ({}));
    const sessionId: string = String(body?.session_id ?? "");
    const gridX = Number(body?.grid_x);
    const gridY = Number(body?.grid_y);
    if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !Number.isInteger(gridX) || !Number.isInteger(gridY)) {
      return json({ error: "session_id, grid_x a grid_y jsou povinné" }, 400);
    }

    const { data: membership } = await sb.from("game_memberships")
      .select("id").eq("session_id", sessionId).eq("user_id", user.id).maybeSingle();
    if (!membership) return json({ error: "Nejste členem této hry" }, 403);

    const { data: tile } = await sb.from("province_hexes")
      .select("id, biome_family, elevation, has_river, is_coastal, is_passable, owner_player, grid_x, grid_y")
      .eq("session_id", sessionId).eq("grid_x", gridX).eq("grid_y", gridY).maybeSingle();

    const { data: existing } = await sb.from("tile_parcels")
      .select("*").eq("session_id", sessionId).eq("grid_x", gridX).eq("grid_y", gridY)
      .order("parcel_index");

    let parcels = existing ?? [];
    if (parcels.length < TILE_PARCEL_COUNT) {
      const { data: patch } = await sb.from("province_hexes")
        .select("grid_x, grid_y, biome_family, elevation, has_river, is_coastal, is_passable")
        .eq("session_id", sessionId)
        .gte("grid_x", gridX - 1).lte("grid_x", gridX + 1)
        .gte("grid_y", gridY - 1).lte("grid_y", gridY + 1);
      const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([dx, dy]) => {
          const terrain = (patch ?? []).find((row: { grid_x: number; grid_y: number }) =>
            row.grid_x === gridX + dx && row.grid_y === gridY + dy
          );
          return terrain ? { dx, dy, terrain } : null;
        })
        .filter(Boolean) as Array<{ dx: number; dy: number; terrain: Record<string, unknown> }>;
      const specs = generateTileParcels(sessionId, gridX, gridY, tile ?? {}, neighbours);
      const seen = new Set(parcels.map((p: { parcel_index: number }) => p.parcel_index));
      const rows = specs.filter((spec) => !seen.has(spec.parcelIndex)).map((spec) => ({
        session_id: sessionId,
        grid_x: gridX,
        grid_y: gridY,
        parcel_index: spec.parcelIndex,
        parcel_x: spec.parcelX,
        parcel_y: spec.parcelY,
        sub_biome: spec.subBiome,
        elevation: spec.elevation,
        buildable: spec.buildable,
        build_cost_multiplier: spec.buildCostMultiplier,
        capacity_slots: spec.capacitySlots,
        status: spec.buildable ? "wild" : "blocked",
      }));
      if (rows.length) {
        await sb.from("tile_parcels").upsert(rows, { onConflict: "session_id,grid_x,grid_y,parcel_index" });
      }
      const { data: refreshed } = await sb.from("tile_parcels")
        .select("*").eq("session_id", sessionId).eq("grid_x", gridX).eq("grid_y", gridY)
        .order("parcel_index");
      parcels = refreshed ?? parcels;
    }

    // Self-heal: a city standing on this cell always owns a seat parcel.
    const { data: city } = await sb.from("cities")
      .select("id, name, owner_player, population_total, founded_parcel_index")
      .eq("session_id", sessionId).eq("grid_x", gridX).eq("grid_y", gridY).maybeSingle();
    if (city && !parcels.some((row: { city_id: string | null }) => row.city_id === city.id)) {
      const { data: session } = await sb.from("game_sessions").select("current_turn").eq("id", sessionId).maybeSingle();
      const result = await seatCityOnParcels(sb, {
        sessionId, cityId: city.id, cityName: city.name, ownerPlayer: city.owner_player,
        gridX, gridY, population: Number(city.population_total || 0),
        turnNumber: Number(session?.current_turn || 1),
        preferredIndex: city.founded_parcel_index ?? null,
      });
      if (result.seatIndex !== null && city.founded_parcel_index !== result.seatIndex) {
        await sb.from("cities").update({ founded_parcel_index: result.seatIndex }).eq("id", city.id);
      }
      const { data: healed } = await sb.from("tile_parcels")
        .select("*").eq("session_id", sessionId).eq("grid_x", gridX).eq("grid_y", gridY).order("parcel_index");
      parcels = healed ?? parcels;
    }

    return json({ ok: true, tile: tile ?? null, city: city ?? null, parcels });
  } catch (error) {
    console.error("tile-parcels error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
