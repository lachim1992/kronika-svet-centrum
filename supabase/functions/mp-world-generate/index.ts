import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId } = await req.json();
    if (!sessionId) throw new Error("Missing sessionId");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // 1. Load session & world foundation
    const { data: session } = await sb.from("game_sessions").select("*").eq("id", sessionId).single();
    if (!session) throw new Error("Session not found");

    const { data: foundation } = await sb.from("world_foundations").select("*").eq("session_id", sessionId).single();
    if (!foundation) throw new Error("World foundation not found");

    // 2. Load all player civ configs
    const { data: civConfigs } = await sb.from("player_civ_configs").select("*").eq("session_id", sessionId);
    if (!civConfigs || civConfigs.length < 2) throw new Error("Need at least 2 players with civ configs");

    const playerCount = civConfigs.length;

    // 3. Generate world seed
    const worldSeed = crypto.randomUUID();
    await sb.from("game_sessions").update({ world_seed: worldSeed }).eq("id", sessionId);

    // 4. Calculate player spawn positions (evenly distributed on 35x35 map)
    const MAP_RADIUS = 17; // 35x35 = radius 17 from center
    const spawnPositions = calculateSpawnPositions(playerCount, MAP_RADIUS);

    // 5. Generate hex map (35x35 = ~1000 hexes in radius 17)
    const hexBatch: any[] = [];
    const seed = hashSeed(worldSeed);

    for (let q = -MAP_RADIUS; q <= MAP_RADIUS; q++) {
      for (let r = -MAP_RADIUS; r <= MAP_RADIUS; r++) {
        if (Math.abs(q + r) > MAP_RADIUS) continue; // Hex grid bounds
        const hex = generateHexData(q, r, seed, worldSeed);
        hexBatch.push({
          session_id: sessionId,
          q,
          r,
          seed: worldSeed,
          mean_height: hex.mean_height,
          biome_family: hex.biome_family,
          coastal: hex.coastal,
          moisture_band: hex.moisture_band,
          temp_band: hex.temp_band,
        });
      }
    }

    // Insert hexes in batches
    const HEX_BATCH_SIZE = 200;
    for (let i = 0; i < hexBatch.length; i += HEX_BATCH_SIZE) {
      const batch = hexBatch.slice(i, i + HEX_BATCH_SIZE);
      await sb.from("province_hexes").upsert(batch, { onConflict: "session_id,q,r" });
    }

    // 6. For each player: create civilization, culture, language, city, resources
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    for (let i = 0; i < civConfigs.length; i++) {
      const cfg = civConfigs[i];
      const spawn = spawnPositions[i];

      // Ensure the spawn hex has a good biome for the player
      await sb.from("province_hexes")
        .update({ biome_family: mapBiomeName(cfg.homeland_biome) })
        .eq("session_id", sessionId)
        .eq("q", spawn.q)
        .eq("r", spawn.r);

      // Create culture
      let cultureId: string | null = null;
      if (cfg.culture_name) {
        const { data: cultureData } = await sb.from("cultures").insert({
          session_id: sessionId,
          name: cfg.culture_name,
          description: `Kultura národa ${cfg.people_name || cfg.player_name}`,
        }).select("id").single();
        if (cultureData) cultureId = cultureData.id;
      }

      // Create language
      let languageId: string | null = null;
      if (cfg.language_name) {
        const { data: langData } = await sb.from("languages").insert({
          session_id: sessionId,
          name: cfg.language_name,
        }).select("id").single();
        if (langData) languageId = langData.id;
      }

      // AI generate civ start data
      let civStartData: any = null;
      if (cfg.civ_description && LOVABLE_API_KEY) {
        try {
          const civRes = await fetch(`${supabaseUrl}/functions/v1/generate-civ-start`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              sessionId,
              playerName: cfg.player_name,
              civDescription: cfg.civ_description,
              worldPremise: foundation.premise,
              tone: foundation.tone,
              biomeName: cfg.homeland_biome,
              settlementName: cfg.settlement_name,
            }),
          });
          if (civRes.ok) {
            civStartData = await civRes.json();
          }
        } catch (e) {
          console.warn("AI civ generation failed for", cfg.player_name, e);
        }
      }

      // Create civilization record
      await sb.from("civilizations").insert({
        session_id: sessionId,
        player_name: cfg.player_name,
        civ_name: cfg.realm_name || cfg.people_name || cfg.player_name,
        is_ai: false,
        core_myth: civStartData?.civilization?.core_myth || null,
        cultural_quirk: civStartData?.civilization?.cultural_quirk || null,
        architectural_style: civStartData?.civilization?.architectural_style || null,
      });

      // Create province
      const { data: provData } = await sb.from("provinces").insert({
        session_id: sessionId,
        name: `${cfg.realm_name || cfg.player_name} – Domovina`,
        owner_player: cfg.player_name,
      }).select("id").single();

      // Create starting city at spawn position
      const stParams = civStartData?.settlement;
      const { data: cityData } = await sb.from("cities").insert({
        session_id: sessionId,
        owner_player: cfg.player_name,
        name: cfg.settlement_name || `Město ${cfg.player_name}`,
        province_id: provData?.id || null,
        province: `${cfg.realm_name || cfg.player_name} – Domovina`,
        level: "Osada",
        settlement_level: "HAMLET",
        founded_round: 1,
        province_q: spawn.q,
        province_r: spawn.r,
        culture_id: cultureId,
        language_id: languageId,
        city_stability: stParams?.city_stability || 65,
        population_total: stParams?.population_total || 1000,
        population_peasants: stParams?.population_peasants || 800,
        population_burghers: stParams?.population_burghers || 150,
        population_clerics: stParams?.population_clerics || 50,
        special_resource_type: stParams?.special_resource_type || "NONE",
        flavor_prompt: stParams?.settlement_flavor || cfg.civ_description || null,
      }).select("id").single();

      // Discover own city
      if (cityData) {
        await sb.from("discoveries").upsert([
          { session_id: sessionId, player_name: cfg.player_name, entity_type: "city", entity_id: cityData.id, source: "founded" },
        ], { onConflict: "session_id,player_name,entity_type,entity_id" });

        // Discover nearby hexes (radius 3 around spawn)
        const { data: nearbyHexes } = await sb.from("province_hexes")
          .select("id")
          .eq("session_id", sessionId)
          .gte("q", spawn.q - 3).lte("q", spawn.q + 3)
          .gte("r", spawn.r - 3).lte("r", spawn.r + 3);

        if (nearbyHexes) {
          const hexDiscoveries = nearbyHexes.map(h => ({
            session_id: sessionId,
            player_name: cfg.player_name,
            entity_type: "hex",
            entity_id: h.id,
            source: "starting_area",
          }));
          if (hexDiscoveries.length > 0) {
            await sb.from("discoveries").upsert(hexDiscoveries, { onConflict: "session_id,player_name,entity_type,entity_id" });
          }
        }
      }

      // Create founding event
      await sb.from("game_events").insert({
        session_id: sessionId,
        event_type: "founding",
        player: cfg.player_name,
        note: `${cfg.player_name} založil osadu ${cfg.settlement_name}.`,
        turn_number: 1,
        confirmed: true,
        importance: "high",
        city_id: cityData?.id || null,
      });

      // Init player resources
      const aiRes = civStartData?.player_resources;
      const defaults: Record<string, { income: number; upkeep: number; stockpile: number }> = {
        food: { income: 4, upkeep: 2, stockpile: 10 },
        wood: { income: 3, upkeep: 1, stockpile: 5 },
        stone: { income: 2, upkeep: 0, stockpile: 3 },
        iron: { income: 1, upkeep: 0, stockpile: 2 },
        wealth: { income: 2, upkeep: 1, stockpile: 5 },
      };
      for (const rt of ["food", "wood", "stone", "iron", "wealth"]) {
        const aiVals = aiRes?.[rt];
        await sb.from("player_resources").insert({
          session_id: sessionId,
          player_name: cfg.player_name,
          resource_type: rt,
          income: aiVals?.income ?? defaults[rt].income,
          upkeep: aiVals?.upkeep ?? defaults[rt].upkeep,
          stockpile: aiVals?.stockpile ?? defaults[rt].stockpile,
        });
      }

      // Init realm resources
      const aiRealm = civStartData?.realm_resources;
      await sb.from("realm_resources").insert({
        session_id: sessionId,
        player_name: cfg.player_name,
        grain_reserve: aiRealm?.grain_reserve ?? 20,
        wood_reserve: aiRealm?.wood_reserve ?? 10,
        stone_reserve: aiRealm?.stone_reserve ?? 5,
        iron_reserve: aiRealm?.iron_reserve ?? 3,
        horses_reserve: aiRealm?.horses_reserve ?? 5,
        gold_reserve: aiRealm?.gold_reserve ?? 100,
        stability: aiRealm?.stability ?? 70,
        granary_capacity: aiRealm?.granary_capacity ?? 500,
        stables_capacity: aiRealm?.stables_capacity ?? 100,
      });
    }

    // 7. Generate Chronicle 0 (world prehistory)
    if (LOVABLE_API_KEY) {
      try {
        const playerDescs = civConfigs.map(c =>
          `${c.player_name} (${c.realm_name}): ${c.civ_description || "neznámý národ"}`
        ).join("\n");

        const chronicleRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: `Jsi kronikář fantasy světa. Napiš epický prolog (800-1500 slov, česky) popisující prahistorii světa před příchodem hráčů. Zahrň:
- Stvoření světa a jeho geografii
- 3-5 legendárních postav prahistorie
- 2-3 dávné konflikty nebo bitvy
- Zmínky o všech civilizacích hráčů jako o rodících se národech
- Mystický/epický tón odpovídající tónu: ${foundation.tone}
Odpověz POUZE textem kroniky, žádný markdown.`,
              },
              {
                role: "user",
                content: `Svět: ${foundation.world_name}
Premisa: ${foundation.premise}
Tón: ${foundation.tone}

Civilizace hráčů:
${playerDescs}`,
              },
            ],
            temperature: 0.8,
            max_tokens: 3000,
          }),
        });

        if (chronicleRes.ok) {
          const chronicleData = await chronicleRes.json();
          const chronicleText = chronicleData.choices?.[0]?.message?.content || "";

          if (chronicleText) {
            await sb.from("chronicle_entries").insert({
              session_id: sessionId,
              text: chronicleText,
              source_type: "chronicle_zero",
              turn_from: -100,
              turn_to: 0,
              references: {
                title: `Kronika Počátku: ${foundation.world_name}`,
                sidebar: {
                  civilizations: civConfigs.map(c => ({ name: c.realm_name || c.player_name, player: c.player_name })),
                },
              },
            });
          }
        }
      } catch (e) {
        console.warn("Chronicle 0 generation failed:", e);
      }
    }

    // 8. Create game_style_settings
    const stylePayload = {
      session_id: sessionId,
      lore_bible: [
        `Svět: ${foundation.world_name}`,
        `Premisa: ${foundation.premise}`,
        `Tón: ${foundation.tone}`,
        `Styl vítězství: ${foundation.victory_style}`,
        ...civConfigs.map(c => `Hráč ${c.player_name}: ${c.realm_name} (${c.people_name || "neznámý lid"}) — ${c.civ_description || ""}`),
      ].filter(Boolean).join("\n"),
      prompt_rules: JSON.stringify({
        world_vibe: foundation.tone,
        writing_style: foundation.tone === "realistic" ? "political-chronicle" : "epic-saga",
        player_count: playerCount,
      }),
      updated_at: new Date().toISOString(),
    };
    await sb.from("game_style_settings").upsert(stylePayload, { onConflict: "session_id" });

    // 9. Ensure server_config exists
    const { data: existingConfig } = await sb.from("server_config").select("id").eq("session_id", sessionId).maybeSingle();
    if (!existingConfig) {
      await sb.from("server_config").insert({
        session_id: sessionId,
        admin_user_id: session.created_by,
      });
    }

    // 10. Log simulation
    await sb.from("simulation_log").insert({
      session_id: sessionId,
      year_start: 1,
      year_end: 1,
      events_generated: civConfigs.length,
      scope: "mp_world_init",
      triggered_by: "mp-world-generate",
    });

    // 11. Mark session as ready
    await sb.from("game_sessions").update({ init_status: "ready" }).eq("id", sessionId);

    return new Response(JSON.stringify({
      ok: true,
      playersInitialized: playerCount,
      hexesGenerated: hexBatch.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("mp-world-generate error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Helpers ──

function calculateSpawnPositions(playerCount: number, mapRadius: number): { q: number; r: number }[] {
  // Place players evenly in a circle at ~60% radius distance from center
  const spawnRadius = Math.floor(mapRadius * 0.6);
  const positions: { q: number; r: number }[] = [];

  for (let i = 0; i < playerCount; i++) {
    const angle = (2 * Math.PI * i) / playerCount - Math.PI / 2;
    // Convert polar to axial hex coords
    const x = Math.round(spawnRadius * Math.cos(angle));
    const y = Math.round(spawnRadius * Math.sin(angle));
    // Axial: q = x, r = y (simplified conversion)
    positions.push({ q: x, r: y });
  }

  return positions;
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const chr = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash);
}

function pseudoRandom(seed: number, q: number, r: number): number {
  let h = seed ^ (q * 374761393 + r * 668265263);
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (Math.abs(h) % 1000) / 1000;
}

function generateHexData(q: number, r: number, seed: number, worldSeed: string) {
  const noise = pseudoRandom(seed, q, r);
  const distFromCenter = Math.sqrt(q * q + r * r + q * r);
  const maxDist = 17;

  // Height: higher near mountains, lower at edges (ocean)
  const edgeFactor = distFromCenter / maxDist;
  let mean_height = noise * 0.7 + (1 - edgeFactor) * 0.3;
  if (edgeFactor > 0.85) mean_height *= 0.3; // Ocean at edges

  // Temperature: cooler at top/bottom
  const latNorm = (r + maxDist) / (2 * maxDist);
  const temp_band = Math.round(latNorm * 4);

  // Moisture
  const moistNoise = pseudoRandom(seed + 1, q, r);
  const moisture_band = Math.round(moistNoise * 4);

  // Coastal: adjacent to ocean
  const coastal = edgeFactor > 0.75 && edgeFactor < 0.88;

  // Biome determination
  let biome_family = "grassland";
  if (mean_height < 0.15) biome_family = "ocean";
  else if (mean_height < 0.25) biome_family = coastal ? "coast" : "wetland";
  else if (mean_height > 0.75) biome_family = "mountain";
  else if (mean_height > 0.6) biome_family = "highland";
  else if (temp_band <= 1 && moisture_band >= 3) biome_family = "taiga";
  else if (temp_band <= 0) biome_family = "tundra";
  else if (temp_band >= 3 && moisture_band <= 1) biome_family = "desert";
  else if (moisture_band >= 3) biome_family = "forest";
  else if (moisture_band >= 2) biome_family = "grassland";
  else biome_family = "plains";

  return { mean_height, biome_family, coastal, moisture_band, temp_band };
}

function mapBiomeName(biome: string): string {
  const map: Record<string, string> = {
    plains: "plains",
    coast: "coast",
    mountains: "mountain",
    forest: "forest",
    desert: "desert",
    tundra: "tundra",
    volcanic: "highland",
  };
  return map[biome] || "grassland";
}
