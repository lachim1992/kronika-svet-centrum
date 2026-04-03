import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
  if (moisture <= 1 && temp >= 3) return "desert";
  if (moisture >= 3 && height < 25) return "swamp";
  if (moisture >= 3) return "forest";
  return "plains";
}

// --- Biome transition enforcement ---
// desert↔forest without plains in between is forbidden
function enforceTransition(
  myBiome: string,
  neighborBiomes: string[]
): string {
  if (myBiome === "desert" && neighborBiomes.includes("forest")) return "plains";
  if (myBiome === "forest" && neighborBiomes.includes("desert")) return "plains";
  return myBiome;
}

// --- Macro wave for large-scale terrain features ---
function macroHeightWave(q: number, r: number, worldSeed: string): number {
  const s1 = hashSeed(worldSeed + ":wave1");
  const s2 = hashSeed(worldSeed + ":wave2");
  const s3 = hashSeed(worldSeed + ":wave3");
  const wave1 = Math.sin((q * 0.3 + s1 * 100) * 0.1) * 20;
  const wave2 = Math.cos((r * 0.25 + s2 * 100) * 0.12) * 15;
  const wave3 = Math.sin(((q + r) * 0.2 + s3 * 100) * 0.08) * 10;
  return 50 + wave1 + wave2 + wave3;
}

// --- Macro waves for moisture and temperature (slow-varying) ---
function macroMoistureWave(q: number, r: number, worldSeed: string): number {
  const s1 = hashSeed(worldSeed + ":moist_w1");
  const s2 = hashSeed(worldSeed + ":moist_w2");
  const wave1 = Math.sin((q * 0.15 + s1 * 80) * 0.09) * 1.5;
  const wave2 = Math.cos((r * 0.18 + s2 * 80) * 0.11) * 1.0;
  const micro = (hashSeed(`${worldSeed}:${q}:${r}:moist_micro`) - 0.5) * 0.8;
  return Math.max(0, Math.min(4, Math.round(2 + wave1 + wave2 + micro)));
}

function macroTempWave(q: number, r: number, worldSeed: string): number {
  const s1 = hashSeed(worldSeed + ":temp_w1");
  const s2 = hashSeed(worldSeed + ":temp_w2");
  const wave1 = Math.sin((r * 0.12 + s1 * 90) * 0.1) * 1.5;
  const wave2 = Math.cos((q * 0.14 + s2 * 90) * 0.08) * 1.0;
  const micro = (hashSeed(`${worldSeed}:${q}:${r}:temp_micro`) - 0.5) * 0.8;
  return Math.max(0, Math.min(4, Math.round(2 + wave1 + wave2 + micro)));
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
      .select("q, r, mean_height, moisture_band, temp_band, biome_family")
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

    // Climate bands via macro waves (slow-varying)
    let moistureBand = macroMoistureWave(q, r, worldSeed);
    let tempBand = macroTempWave(q, r, worldSeed);

    // Enforce neighbor band continuity (Δ ≤ 1)
    if (neighbors && neighbors.length > 0) {
      for (const nb of neighbors) {
        if (Math.abs(moistureBand - nb.moisture_band) > 1) {
          moistureBand = nb.moisture_band + Math.sign(moistureBand - nb.moisture_band);
        }
        if (Math.abs(tempBand - nb.temp_band) > 1) {
          tempBand = nb.temp_band + Math.sign(tempBand - nb.temp_band);
        }
      }
      moistureBand = Math.max(0, Math.min(4, moistureBand));
      tempBand = Math.max(0, Math.min(4, tempBand));
    }

    // Biome + transition enforcement
    let biomeFamily = determineBiome(meanHeight, moistureBand, tempBand);
    const neighborBiomes = (neighbors || []).map((n: any) => n.biome_family);
    biomeFamily = enforceTransition(biomeFamily, neighborBiomes);

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

    // ── Generate resource_deposits based on biome ──
    const BIOME_RESOURCE_MAP: Record<string, Array<{ key: string; yield_range: [number, number]; quality_range: [number, number]; chance: number }>> = {
      plains:    [{ key: "wheat", yield_range: [4,8], quality_range: [40,80], chance: 0.8 }, { key: "flax", yield_range: [2,5], quality_range: [40,70], chance: 0.3 }, { key: "cattle", yield_range: [1,4], quality_range: [50,80], chance: 0.4 }],
      forest:    [{ key: "timber", yield_range: [4,8], quality_range: [50,90], chance: 0.9 }, { key: "game", yield_range: [2,4], quality_range: [40,70], chance: 0.5 }, { key: "resin", yield_range: [1,3], quality_range: [50,80], chance: 0.3 }, { key: "herbs", yield_range: [1,3], quality_range: [40,70], chance: 0.3 }],
      hills:     [{ key: "stone", yield_range: [3,7], quality_range: [50,90], chance: 0.7 }, { key: "iron_ore", yield_range: [2,5], quality_range: [40,80], chance: 0.5 }, { key: "copper_ore", yield_range: [1,4], quality_range: [40,80], chance: 0.3 }, { key: "sheep", yield_range: [2,5], quality_range: [50,80], chance: 0.4 }],
      mountains: [{ key: "iron_ore", yield_range: [3,7], quality_range: [50,90], chance: 0.6 }, { key: "stone", yield_range: [3,6], quality_range: [60,95], chance: 0.7 }, { key: "gold_ore", yield_range: [1,3], quality_range: [40,80], chance: 0.15 }, { key: "gems_raw", yield_range: [1,2], quality_range: [50,90], chance: 0.1 }],
      desert:    [{ key: "salt", yield_range: [2,5], quality_range: [50,90], chance: 0.5 }, { key: "incense_raw", yield_range: [1,3], quality_range: [60,90], chance: 0.2 }],
      swamp:     [{ key: "clay", yield_range: [3,6], quality_range: [40,70], chance: 0.6 }, { key: "herbs", yield_range: [2,4], quality_range: [50,80], chance: 0.5 }, { key: "fish", yield_range: [2,5], quality_range: [40,70], chance: 0.4 }],
      tundra:    [{ key: "furs", yield_range: [2,4], quality_range: [60,90], chance: 0.5 }, { key: "stone", yield_range: [1,4], quality_range: [40,70], chance: 0.3 }],
    };

    // Coastal bonus
    const COASTAL_RESOURCES = [
      { key: "fish", yield_range: [3,7] as [number,number], quality_range: [50,80] as [number,number], chance: 0.7 },
      { key: "salt", yield_range: [1,4] as [number,number], quality_range: [50,80] as [number,number], chance: 0.3 },
    ];

    const deposits: Array<{ resource_type_key: string; yield_per_turn: number; quality: number }> = [];
    const biomeResources = BIOME_RESOURCE_MAP[biomeFamily] || [];
    
    for (const res of biomeResources) {
      const roll = hashSeed(`${hexSeed}:res:${res.key}`);
      if (roll < res.chance) {
        const yieldVal = res.yield_range[0] + Math.round(hashSeed(`${hexSeed}:yield:${res.key}`) * (res.yield_range[1] - res.yield_range[0]));
        const qualityVal = res.quality_range[0] + Math.round(hashSeed(`${hexSeed}:qual:${res.key}`) * (res.quality_range[1] - res.quality_range[0]));
        deposits.push({ resource_type_key: res.key, yield_per_turn: yieldVal, quality: qualityVal });
      }
    }

    // Coastal extras
    if (coastal) {
      for (const res of COASTAL_RESOURCES) {
        const roll = hashSeed(`${hexSeed}:coast:${res.key}`);
        if (roll < res.chance && !deposits.find(d => d.resource_type_key === res.key)) {
          const yieldVal = res.yield_range[0] + Math.round(hashSeed(`${hexSeed}:cyield:${res.key}`) * (res.yield_range[1] - res.yield_range[0]));
          const qualityVal = res.quality_range[0] + Math.round(hashSeed(`${hexSeed}:cqual:${res.key}`) * (res.quality_range[1] - res.quality_range[0]));
          deposits.push({ resource_type_key: res.key, yield_per_turn: yieldVal, quality: qualityVal });
        }
      }
    }

    // Insert hex with resource_deposits
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
        resource_deposits: deposits.length > 0 ? deposits : null,
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
