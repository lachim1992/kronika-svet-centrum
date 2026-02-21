import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function hashSeed(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return ((h >>> 0) % 1000000) / 1000000;
}

const NEIGHBORS = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
];

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

function macroHeightWave(q: number, r: number, worldSeed: string): number {
  const s1 = hashSeed(worldSeed + ":wave1");
  const s2 = hashSeed(worldSeed + ":wave2");
  const s3 = hashSeed(worldSeed + ":wave3");
  const wave1 = Math.sin((q * 0.3 + s1 * 100) * 0.1) * 20;
  const wave2 = Math.cos((r * 0.25 + s2 * 100) * 0.12) * 15;
  const wave3 = Math.sin(((q + r) * 0.2 + s3 * 100) * 0.08) * 10;
  return 50 + wave1 + wave2 + wave3;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { session_id, hex_ids } = await req.json();
    if (!session_id || !hex_ids || !Array.isArray(hex_ids) || hex_ids.length === 0) {
      return new Response(JSON.stringify({ error: "session_id and hex_ids[] required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Get world seed
    const { data: session } = await sb.from("game_sessions").select("world_seed").eq("id", session_id).single();
    if (!session?.world_seed) {
      return new Response(JSON.stringify({ error: "No world_seed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const worldSeed = session.world_seed;

    // Fetch target hexes
    const { data: hexes } = await sb.from("province_hexes").select("*").in("id", hex_ids);
    if (!hexes || hexes.length === 0) {
      return new Response(JSON.stringify({ updated: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch all hexes in session for neighbor lookup
    const { data: allHexes } = await sb.from("province_hexes")
      .select("q, r, mean_height, moisture_band, temp_band, biome_family")
      .eq("session_id", session_id).limit(2000);
    const hexMap = new Map<string, any>();
    for (const h of (allHexes || [])) hexMap.set(`${h.q},${h.r}`, h);

    const updated: any[] = [];

    for (const hex of hexes) {
      const { q, r, mean_height } = hex;

      // Recompute bands from macro waves
      let moistureBand = macroMoistureWave(q, r, worldSeed);
      let tempBand = macroTempWave(q, r, worldSeed);

      // Neighbor continuity (Δ ≤ 1)
      const nbs: any[] = [];
      for (const [dq, dr] of NEIGHBORS) {
        const nb = hexMap.get(`${q + dq},${r + dr}`);
        if (nb) nbs.push(nb);
      }
      for (const nb of nbs) {
        if (Math.abs(moistureBand - nb.moisture_band) > 1)
          moistureBand = nb.moisture_band + Math.sign(moistureBand - nb.moisture_band);
        if (Math.abs(tempBand - nb.temp_band) > 1)
          tempBand = nb.temp_band + Math.sign(tempBand - nb.temp_band);
      }
      moistureBand = Math.max(0, Math.min(4, moistureBand));
      tempBand = Math.max(0, Math.min(4, tempBand));

      // Biome
      let biomeFamily = determineBiome(mean_height, moistureBand, tempBand);
      const neighborBiomes = nbs.map(n => n.biome_family);
      biomeFamily = enforceTransition(biomeFamily, neighborBiomes);

      // Coastal
      let coastal = false;
      if (biomeFamily !== "sea") {
        for (const nb of nbs) {
          if (nb.mean_height < 10) { coastal = true; break; }
        }
        if (!coastal) {
          for (const [dq, dr] of NEIGHBORS) {
            const nk = `${q + dq},${r + dr}`;
            if (hexMap.has(nk)) continue;
            const nMacro = macroHeightWave(q + dq, r + dr, worldSeed);
            const nMicro = (hashSeed(`${worldSeed}:${q + dq}:${r + dr}:micro`) - 0.5) * 20;
            if (Math.max(0, Math.min(100, Math.round(nMacro + nMicro))) < 10) { coastal = true; break; }
          }
        }
      }

      // Update
      await sb.from("province_hexes").update({
        moisture_band: moistureBand,
        temp_band: tempBand,
        biome_family: biomeFamily,
        coastal,
      }).eq("id", hex.id);

      updated.push({ ...hex, moisture_band: moistureBand, temp_band: tempBand, biome_family: biomeFamily, coastal });
    }

    return new Response(JSON.stringify({ updated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
