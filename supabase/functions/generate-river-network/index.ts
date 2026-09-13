import { createClient } from "npm:@supabase/supabase-js@2";
import { buildRiverNetwork, type RiverCell } from "../_shared/riverNetwork.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/**
 * generate-river-network — recomputes the river system of one world on the square grid.
 * Rivers run from highland sources to the nearest water body; every touched cell gets
 * has_river + river_direction. Sub-parcels of the affected cells are dropped so the
 * channel is redrawn from the new data on next open.
 * Body: { session_id }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = String(body?.session_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return json({ error: "session_id je povinné" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: session } = await sb.from("game_sessions").select("id, world_seed").eq("id", sessionId).maybeSingle();
    if (!session) return json({ error: "Svět nenalezen" }, 404);

    const rows: Array<{
      id: string;
      grid_x: number | null;
      grid_y: number | null;
      q: number;
      r: number;
      mean_height: number | null;
      biome_family: string | null;
      has_river: boolean | null;
    }> = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb.from("province_hexes")
        .select("id, grid_x, grid_y, q, r, mean_height, biome_family, has_river")
        .eq("session_id", sessionId)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    if (rows.length === 0) return json({ error: "Mapa ještě není vygenerovaná" }, 400);

    const cells: RiverCell[] = rows.map((row) => ({
      gridX: row.grid_x ?? row.q,
      gridY: row.grid_y ?? row.r,
      elevation: Number(row.mean_height ?? 40),
      isWater: (row.biome_family || "").toLowerCase() === "sea" || Number(row.mean_height ?? 40) < 8,
    }));

    const network = buildRiverNetwork(String(session.world_seed ?? sessionId), cells);

    const updates = rows.map((row, index) => {
      const cell = cells[index];
      const direction = network.cells.get(`${cell.gridX},${cell.gridY}`) ?? null;
      return { row, hasRiver: Boolean(direction) && !cell.isWater, direction };
    });

    let changed = 0;
    for (const update of updates) {
      const current = Boolean(update.row.has_river);
      if (current === update.hasRiver) continue;
      const { error } = await sb.from("province_hexes")
        .update({ has_river: update.hasRiver, river_direction: update.hasRiver ? update.direction : null })
        .eq("id", update.row.id);
      if (error) throw error;
      changed += 1;
    }

    // Sub-parcels are derived from cell terrain — drop them so the new water layout is drawn.
    const { error: wipeError } = await sb.from("tile_parcels").delete().eq("session_id", sessionId);
    if (wipeError) throw wipeError;
    await sb.from("cities").update({ founded_parcel_index: null }).eq("session_id", sessionId);

    return json({
      ok: true,
      cells: rows.length,
      riverSources: network.riverCount,
      riverCells: updates.filter((u) => u.hasRiver).length,
      changed,
    });
  } catch (error) {
    console.error("generate-river-network error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
