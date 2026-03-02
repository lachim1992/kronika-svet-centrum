import { createClient } from "npm:@supabase/supabase-js@2";
import { generateWorldTerrain, hashSeed } from "../_shared/terrain.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

function quantize(value: number, bands: number): number {
  return Math.min(bands - 1, Math.max(0, Math.floor(value / (100 / bands))));
}

const ELEVATION_NAMES = ["Nížiny", "Pahorkatina", "Vysočina", "Horstvo", "Velehory"];
const CLIMATE_NAMES = ["Arktická", "Chladná", "Mírná", "Teplá", "Tropická"];
const MOISTURE_NAMES = ["Suchá", "Sušší", "Vlhká", "Deštná", "Mokřadní"];

function regionName(elev: number, clim: number, moist: number): string {
  return `${CLIMATE_NAMES[clim]} ${ELEVATION_NAMES[elev]} – ${MOISTURE_NAMES[moist]}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { session_id, width, height } = await req.json();

    if (!session_id || !width || !height) {
      return new Response(
        JSON.stringify({ error: "session_id, width, height required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mapW = Math.min(Math.max(width, 11), 61);
    const mapH = Math.min(Math.max(height, 11), 61);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get or create world_seed
    const { data: session } = await sb
      .from("game_sessions")
      .select("id, world_seed")
      .eq("id", session_id)
      .single();

    if (!session) {
      return new Response(
        JSON.stringify({ error: "Session not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let worldSeed = session.world_seed;
    if (!worldSeed) {
      worldSeed = crypto.randomUUID();
      await sb.from("game_sessions").update({ world_seed: worldSeed }).eq("id", session_id);
    }

    // Check if hexes already exist
    const { count: existingCount } = await sb
      .from("province_hexes")
      .select("id", { count: "exact", head: true })
      .eq("session_id", session_id);

    if ((existingCount || 0) > 50) {
      return new Response(
        JSON.stringify({ message: "Map already generated", hexCount: existingCount }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Generate terrain using shared module ──
    console.log(`Generating ${mapW}x${mapH} map with seed: ${worldSeed}`);
    const map = generateWorldTerrain(worldSeed, mapW, mapH);
    console.log(`Generated ${map.hexes.length} hexes, land ratio: ${(map.stats.landRatio * 100).toFixed(1)}%`);

    // ── Create macro regions ──
    const regionKeySet = new Set<string>();
    for (const hex of map.hexes) {
      const elevBand = quantize(hex.meanHeight, 5);
      const climBand = quantize(hex.tempBand * 25, 5);
      const moistBand = quantize(hex.moistureBand * 25, 5);
      regionKeySet.add(`e${elevBand}_c${climBand}_m${moistBand}`);
    }

    const regionIdMap = new Map<string, string>();
    const regionRows = Array.from(regionKeySet).map(key => {
      const [e, c, m] = key.match(/e(\d+)_c(\d+)_m(\d+)/)!.slice(1).map(Number);
      return {
        session_id,
        region_key: key,
        name: regionName(e, c, m),
        elevation_band: e,
        climate_band: c,
        moisture_band: m,
      };
    });

    if (regionRows.length > 0) {
      const { data: insertedRegions } = await sb
        .from("macro_regions")
        .upsert(regionRows, { onConflict: "session_id,region_key" })
        .select("id, region_key");
      for (const r of insertedRegions || []) {
        regionIdMap.set(r.region_key, r.id);
      }
    }

    // ── Build DB rows ──
    const hexRows = map.hexes.map(hex => {
      const elevBand = quantize(hex.meanHeight, 5);
      const climBand = quantize(hex.tempBand * 25, 5);
      const moistBand = quantize(hex.moistureBand * 25, 5);
      const regionKey = `e${elevBand}_c${climBand}_m${moistBand}`;

      return {
        session_id,
        q: hex.q,
        r: hex.r,
        seed: hex.seed,
        mean_height: hex.meanHeight,
        moisture_band: hex.moistureBand,
        temp_band: hex.tempBand,
        biome_family: hex.biomeFamily,
        coastal: hex.coastal,
        has_river: hex.hasRiver,
        river_direction: hex.riverDirection,
        is_passable: hex.isPassable,
        movement_cost: hex.movementCost,
        has_bridge: false,
        macro_region_id: regionIdMap.get(regionKey) || null,
      };
    });

    // ── Batch insert (chunks of 500) ──
    const BATCH_SIZE = 500;
    let insertedCount = 0;
    for (let i = 0; i < hexRows.length; i += BATCH_SIZE) {
      const batch = hexRows.slice(i, i + BATCH_SIZE);
      const { error } = await sb.from("province_hexes").upsert(batch, {
        onConflict: "session_id,q,r",
      });
      if (error) {
        console.error(`Batch insert error at offset ${i}:`, error);
        for (const row of batch) {
          await sb.from("province_hexes").upsert(row, { onConflict: "session_id,q,r" });
        }
      }
      insertedCount += batch.length;
    }

    return new Response(JSON.stringify({
      hexCount: insertedCount,
      mapWidth: mapW,
      mapHeight: mapH,
      startPositions: map.startPositions,
      macroRegions: regionRows.length,
      riverCount: map.rivers.length,
      stats: map.stats,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-world-map error:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
