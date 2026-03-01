import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Deterministic hash (same as generate-hex) ──
function hashSeed(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return ((h >>> 0) % 1000000) / 1000000;
}

// ── Macro waves (same as generate-hex for consistency) ──
function macroHeightWave(q: number, r: number, worldSeed: string): number {
  const s1 = hashSeed(worldSeed + ":wave1");
  const s2 = hashSeed(worldSeed + ":wave2");
  const s3 = hashSeed(worldSeed + ":wave3");
  const wave1 = Math.sin((q * 0.3 + s1 * 100) * 0.1) * 20;
  const wave2 = Math.cos((r * 0.25 + s2 * 100) * 0.12) * 15;
  const wave3 = Math.sin(((q + r) * 0.2 + s3 * 100) * 0.08) * 10;
  return 50 + wave1 + wave2 + wave3;
}

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

function determineBiome(height: number, moisture: number, temp: number): string {
  if (height < 10) return "sea";
  if (height > 80) return "mountains";
  if (height > 65) return "hills";
  if (temp <= 1 && moisture <= 1) return "tundra";
  if (moisture <= 1 && temp >= 3) return "desert";
  if (moisture >= 3 && height < 25) return "swamp";
  if (moisture >= 3) return "forest";
  return "plains";
}

function enforceTransition(myBiome: string, neighborBiomes: string[]): string {
  if (myBiome === "desert" && neighborBiomes.includes("forest")) return "plains";
  if (myBiome === "forest" && neighborBiomes.includes("desert")) return "plains";
  return myBiome;
}

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

/**
 * Generate all hexes for an NxN hex map in a single batch.
 * Uses the same deterministic algorithm as generate-hex for consistency.
 * 
 * The hex grid uses offset coordinates where:
 * - q ranges from -halfW to +halfW
 * - r ranges from -halfH to +halfH
 * This creates a rectangular hex grid centered on (0,0).
 */
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

    // Check if hexes already exist for this session
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

    const halfW = Math.floor(mapW / 2);
    const halfH = Math.floor(mapH / 2);

    // Phase 1: Compute all hex data in memory
    type HexRow = {
      session_id: string; q: number; r: number; seed: string;
      mean_height: number; moisture_band: number; temp_band: number;
      biome_family: string; coastal: boolean; macro_region_id: string | null;
    };

    const hexGrid = new Map<string, {
      meanHeight: number; moistureBand: number; tempBand: number; biomeFamily: string;
    }>();

    // First pass: compute raw terrain values
    for (let q = -halfW; q <= halfW; q++) {
      for (let r = -halfH; r <= halfH; r++) {
        const hexSeed = `${worldSeed}:${q}:${r}`;
        const macroH = macroHeightWave(q, r, worldSeed);
        const microNoise = (hashSeed(hexSeed + ":micro") - 0.5) * 20;
        let meanHeight = Math.round(Math.max(0, Math.min(100, macroH + microNoise)));

        let moistureBand = macroMoistureWave(q, r, worldSeed);
        let tempBand = macroTempWave(q, r, worldSeed);

        hexGrid.set(`${q},${r}`, { meanHeight, moistureBand, tempBand, biomeFamily: "" });
      }
    }

    // Second pass: enforce neighbor continuity + biome determination
    const MAX_DELTA = 15;
    // Do multiple smoothing passes for better coherence
    for (let pass = 0; pass < 3; pass++) {
      for (let q = -halfW; q <= halfW; q++) {
        for (let r = -halfH; r <= halfH; r++) {
          const key = `${q},${r}`;
          const cell = hexGrid.get(key)!;
          const nbs: typeof cell[] = [];

          for (const [dq, dr] of NEIGHBORS) {
            const nb = hexGrid.get(`${q + dq},${r + dr}`);
            if (nb) nbs.push(nb);
          }

          if (nbs.length > 0) {
            for (const nb of nbs) {
              const diff = cell.meanHeight - nb.meanHeight;
              if (Math.abs(diff) > MAX_DELTA) {
                cell.meanHeight = nb.meanHeight + Math.sign(diff) * MAX_DELTA;
              }
              if (Math.abs(cell.moistureBand - nb.moistureBand) > 1) {
                cell.moistureBand = nb.moistureBand + Math.sign(cell.moistureBand - nb.moistureBand);
              }
              if (Math.abs(cell.tempBand - nb.tempBand) > 1) {
                cell.tempBand = nb.tempBand + Math.sign(cell.tempBand - nb.tempBand);
              }
            }
            cell.meanHeight = Math.max(0, Math.min(100, cell.meanHeight));
            cell.moistureBand = Math.max(0, Math.min(4, cell.moistureBand));
            cell.tempBand = Math.max(0, Math.min(4, cell.tempBand));
          }
        }
      }
    }

    // Third pass: biome determination + transition enforcement
    for (let q = -halfW; q <= halfW; q++) {
      for (let r = -halfH; r <= halfH; r++) {
        const cell = hexGrid.get(`${q},${r}`)!;
        let biome = determineBiome(cell.meanHeight, cell.moistureBand, cell.tempBand);

        const neighborBiomes: string[] = [];
        for (const [dq, dr] of NEIGHBORS) {
          const nb = hexGrid.get(`${q + dq},${r + dr}`);
          if (nb && nb.biomeFamily) neighborBiomes.push(nb.biomeFamily);
        }
        biome = enforceTransition(biome, neighborBiomes);
        cell.biomeFamily = biome;
      }
    }

    // Phase 2: Create macro regions in batch
    const regionKeySet = new Set<string>();
    for (const [, cell] of hexGrid) {
      const elevBand = quantize(cell.meanHeight, 5);
      const climBand = quantize(cell.tempBand * 25, 5);
      const moistBand = quantize(cell.moistureBand * 25, 5);
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

    // Insert regions in batch
    if (regionRows.length > 0) {
      const { data: insertedRegions } = await sb
        .from("macro_regions")
        .upsert(regionRows, { onConflict: "session_id,region_key" })
        .select("id, region_key");
      for (const r of insertedRegions || []) {
        regionIdMap.set(r.region_key, r.id);
      }
    }

    // Phase 3: Build hex rows + coastal detection
    const hexRows: HexRow[] = [];
    for (let q = -halfW; q <= halfW; q++) {
      for (let r = -halfH; r <= halfH; r++) {
        const cell = hexGrid.get(`${q},${r}`)!;
        const hexSeed = `${worldSeed}:${q}:${r}`;

        // Coastal detection
        let coastal = false;
        if (cell.biomeFamily !== "sea") {
          for (const [dq, dr] of NEIGHBORS) {
            const nb = hexGrid.get(`${q + dq},${r + dr}`);
            if (nb && nb.meanHeight < 10) { coastal = true; break; }
            if (!nb) {
              // Edge of map — predict
              const nSeed = `${worldSeed}:${q + dq}:${r + dr}`;
              const nMacro = macroHeightWave(q + dq, r + dr, worldSeed);
              const nMicro = (hashSeed(nSeed + ":micro") - 0.5) * 20;
              if (Math.max(0, Math.min(100, Math.round(nMacro + nMicro))) < 10) {
                coastal = true; break;
              }
            }
          }
        }

        // Macro region
        const elevBand = quantize(cell.meanHeight, 5);
        const climBand = quantize(cell.tempBand * 25, 5);
        const moistBand = quantize(cell.moistureBand * 25, 5);
        const regionKey = `e${elevBand}_c${climBand}_m${moistBand}`;

        hexRows.push({
          session_id,
          q, r,
          seed: hexSeed,
          mean_height: cell.meanHeight,
          moisture_band: cell.moistureBand,
          temp_band: cell.tempBand,
          biome_family: cell.biomeFamily,
          coastal,
          macro_region_id: regionIdMap.get(regionKey) || null,
        });
      }
    }

    // Phase 4: Batch insert hexes (in chunks of 500)
    const BATCH_SIZE = 500;
    let insertedCount = 0;
    for (let i = 0; i < hexRows.length; i += BATCH_SIZE) {
      const batch = hexRows.slice(i, i + BATCH_SIZE);
      const { error } = await sb.from("province_hexes").upsert(batch, {
        onConflict: "session_id,q,r",
      });
      if (error) {
        console.error(`Batch insert error at offset ${i}:`, error);
        // Try individual inserts for this batch
        for (const row of batch) {
          await sb.from("province_hexes").upsert(row, { onConflict: "session_id,q,r" });
        }
      }
      insertedCount += batch.length;
    }

    // Phase 5: Find good starting positions for factions
    // Criteria: land hex (not sea/mountains), at least 60% of halfW from center,
    // spread evenly around the map
    const landHexes: { q: number; r: number; score: number }[] = [];
    for (const [key, cell] of hexGrid) {
      if (cell.biomeFamily === "sea" || cell.biomeFamily === "mountains") continue;
      const [q, r] = key.split(",").map(Number);
      const dist = Math.sqrt(q * q + r * r);
      // Prefer hexes not too close to center, not too close to edge
      const idealDist = Math.min(halfW, halfH) * 0.5;
      const distScore = 1 - Math.abs(dist - idealDist) / idealDist;
      // Prefer plains/hills
      const biomeScore = cell.biomeFamily === "plains" ? 1 : cell.biomeFamily === "hills" ? 0.8 : cell.biomeFamily === "forest" ? 0.7 : 0.5;
      landHexes.push({ q, r, score: distScore * 0.6 + biomeScore * 0.4 });
    }

    // Sort by score descending
    landHexes.sort((a, b) => b.score - a.score);

    // Pick well-spread positions
    const MIN_SPACING = Math.max(6, Math.floor(Math.min(halfW, halfH) * 0.4));
    const startPositions: { q: number; r: number }[] = [];
    
    for (const candidate of landHexes) {
      if (startPositions.length >= 8) break; // max 8 factions
      const tooClose = startPositions.some(p => {
        const dq = candidate.q - p.q;
        const dr = candidate.r - p.r;
        return Math.sqrt(dq * dq + dr * dr) < MIN_SPACING;
      });
      if (!tooClose) startPositions.push({ q: candidate.q, r: candidate.r });
    }

    return new Response(JSON.stringify({
      hexCount: insertedCount,
      mapWidth: mapW,
      mapHeight: mapH,
      startPositions,
      macroRegions: regionRows.length,
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
