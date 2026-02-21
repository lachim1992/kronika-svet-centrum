import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// --- Deterministic hash (djb2-based, returns 0..1 float) ---
function hashSeed(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return ((h >>> 0) % 1000000) / 1000000;
}

function hashInt(str: string, min: number, max: number): number {
  return Math.floor(hashSeed(str) * (max - min + 1)) + min;
}

// --- Axial hex neighbors ---
const NEIGHBORS = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
];

function getNeighborCoords(q: number, r: number) {
  return NEIGHBORS.map(([dq, dr]) => ({ q: q + dq, r: r + dr }));
}

// --- Biome determination ---
function determineBiome(
  height: number,
  moisture: number,
  temp: number
): string {
  if (height < 10) return "sea";
  if (height > 80) return "mountains";
  if (height > 65) return "hills";
  if (temp <= 1 && moisture <= 1) return "tundra";
  if (temp >= 3 && moisture <= 1) return "desert";
  if (moisture >= 3 && height < 25) return "swamp";
  if (moisture >= 2 && temp >= 2) return "forest";
  return "plains";
}

// --- Macro wave for large-scale terrain features ---
function macroHeightWave(q: number, r: number, worldSeed: string): number {
  const s1 = hashSeed(worldSeed + ":wave1");
  const s2 = hashSeed(worldSeed + ":wave2");
  const s3 = hashSeed(worldSeed + ":wave3");

  // Multiple overlapping sine waves for natural-feeling terrain
  const wave1 = Math.sin((q * 0.3 + s1 * 100) * 0.1) * 20;
  const wave2 = Math.cos((r * 0.25 + s2 * 100) * 0.12) * 15;
  const wave3 = Math.sin(((q + r) * 0.2 + s3 * 100) * 0.08) * 10;

  return 50 + wave1 + wave2 + wave3;
}

// --- Quantize for macroregion bands ---
function quantize(value: number, bands: number): number {
  return Math.min(bands - 1, Math.max(0, Math.floor(value / (100 / bands))));
}

// --- Region naming ---
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
    let session_id: string | null = null;
    let q: number | undefined;
    let r: number | undefined;

    if (req.method === "GET") {
      const url = new URL(req.url);
      session_id = url.searchParams.get("session_id") || url.searchParams.get("world_id");
      const qStr = url.searchParams.get("q");
      const rStr = url.searchParams.get("r");
      if (qStr !== null) q = parseInt(qStr, 10);
      if (rStr !== null) r = parseInt(rStr, 10);
    } else {
      const body = await req.json();
      session_id = body.session_id || body.world_id;
      q = body.q;
      r = body.r;
    }

    if (!session_id || q === undefined || r === undefined || isNaN(q) || isNaN(r)) {
      return new Response(
        JSON.stringify({ error: "session_id (or world_id), q, r required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Helper: enrich hex with macro_region object
    async function enrichHex(hex: any) {
      if (hex.macro_region_id) {
        const { data: mr } = await sb
          .from("macro_regions")
          .select("*")
          .eq("id", hex.macro_region_id)
          .maybeSingle();
        return { ...hex, macro_region: mr || null };
      }
      return { ...hex, macro_region: null };
    }

    // Check if hex already exists
    const { data: existing } = await sb
      .from("province_hexes")
      .select("*")
      .eq("session_id", session_id)
      .eq("q", q)
      .eq("r", r)
      .maybeSingle();

    if (existing) {
      const enriched = await enrichHex(existing);
      return new Response(JSON.stringify(enriched), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get world_seed (create if missing)
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
      await sb
        .from("game_sessions")
        .update({ world_seed: worldSeed })
        .eq("id", session_id);
    }

    // Generate deterministic hex seed
    const hexSeed = `${worldSeed}:${q}:${r}`;

    // Compute height with macro wave + micro noise
    const macroH = macroHeightWave(q, r, worldSeed);
    const microNoise = (hashSeed(hexSeed + ":micro") - 0.5) * 20;
    let meanHeight = Math.round(Math.max(0, Math.min(100, macroH + microNoise)));

    // Enforce neighbor continuity (Δ ≤ 15)
    const neighborCoords = getNeighborCoords(q, r);
    const { data: neighbors } = await sb
      .from("province_hexes")
      .select("q, r, mean_height")
      .eq("session_id", session_id)
      .or(
        neighborCoords
          .map((n) => `and(q.eq.${n.q},r.eq.${n.r})`)
          .join(",")
      );

    const MAX_DELTA = 15;
    if (neighbors && neighbors.length > 0) {
      for (const nb of neighbors) {
        const diff = meanHeight - nb.mean_height;
        if (Math.abs(diff) > MAX_DELTA) {
          meanHeight = nb.mean_height + Math.sign(diff) * MAX_DELTA;
        }
      }
      meanHeight = Math.max(0, Math.min(100, meanHeight));
    }

    // Climate bands
    const moistureBand = hashInt(hexSeed + ":moisture", 0, 4);
    const tempBand = hashInt(hexSeed + ":temp", 0, 4);

    // Biome
    const biomeFamily = determineBiome(meanHeight, moistureBand, tempBand);

    // Coastal detection
    let coastal = false;
    if (biomeFamily !== "sea" && neighbors && neighbors.length > 0) {
      // Check existing neighbors for sea
      for (const nb of neighbors) {
        if (nb.mean_height < 10) {
          coastal = true;
          break;
        }
      }
    }
    // Also check non-existing neighbors via prediction
    if (!coastal && biomeFamily !== "sea") {
      for (const nc of neighborCoords) {
        const alreadyChecked = neighbors?.some(
          (n) => n.q === nc.q && n.r === nc.r
        );
        if (alreadyChecked) continue;
        const nSeed = `${worldSeed}:${nc.q}:${nc.r}`;
        const nMacro = macroHeightWave(nc.q, nc.r, worldSeed);
        const nMicro = (hashSeed(nSeed + ":micro") - 0.5) * 20;
        const nHeight = Math.max(0, Math.min(100, Math.round(nMacro + nMicro)));
        if (nHeight < 10) {
          coastal = true;
          break;
        }
      }
    }

    // Macroregion
    const elevBand = quantize(meanHeight, 5);
    const climBand = quantize(tempBand * 25, 5);
    const moistBand = quantize(moistureBand * 25, 5);
    const regionKey = `e${elevBand}_c${climBand}_m${moistBand}`;

    let macroRegionId: string | null = null;

    const { data: existingRegion } = await sb
      .from("macro_regions")
      .select("id")
      .eq("session_id", session_id)
      .eq("region_key", regionKey)
      .maybeSingle();

    if (existingRegion) {
      macroRegionId = existingRegion.id;
    } else {
      const { data: newRegion } = await sb
        .from("macro_regions")
        .insert({
          session_id,
          region_key: regionKey,
          name: regionName(elevBand, climBand, moistBand),
          elevation_band: elevBand,
          climate_band: climBand,
          moisture_band: moistBand,
        })
        .select("id")
        .single();
      if (newRegion) macroRegionId = newRegion.id;
    }

    // Insert hex
    const { data: hex, error } = await sb
      .from("province_hexes")
      .insert({
        session_id,
        q,
        r,
        seed: hexSeed,
        mean_height: meanHeight,
        moisture_band: moistureBand,
        temp_band: tempBand,
        biome_family: biomeFamily,
        coastal,
        macro_region_id: macroRegionId,
      })
      .select()
      .single();

    if (error) {
      // Handle race condition (unique constraint)
      if (error.code === "23505") {
        const { data: raceHex } = await sb
          .from("province_hexes")
          .select("*")
          .eq("session_id", session_id)
          .eq("q", q)
          .eq("r", r)
          .single();
        const enrichedRace = await enrichHex(raceHex);
        return new Response(JSON.stringify(enrichedRace), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw error;
    }

    const enrichedHex = await enrichHex(hex);
    return new Response(JSON.stringify(enrichedHex), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
