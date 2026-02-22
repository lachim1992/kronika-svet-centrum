import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, playerName, worldName, premise, tone, victoryStyle, worldSize, tier, settlementName, cultureName, languageName, realmName } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ═══════════════════════════════════════════════
    // 0) Read / seed economic config flags
    // ═══════════════════════════════════════════════
    const defaultEconomic = {
      world_gen_mode: "cheap_start",
      auto_generate_city_profiles: false,
      auto_generate_top_city_profiles: true,
      top_profiles_count: 3,
      lazy_generate_on_open: true,
      dev_unlock_premium: true,
    };

    const { data: existingCfg } = await supabase
      .from("server_config")
      .select("id, economic_params")
      .eq("session_id", sessionId)
      .maybeSingle();

    let economic = { ...defaultEconomic };
    if (existingCfg) {
      const stored = existingCfg.economic_params as Record<string, unknown> || {};
      economic = { ...defaultEconomic, ...stored };
      // Merge defaults into existing row
      await supabase.from("server_config").update({ economic_params: economic }).eq("id", existingCfg.id);
    } else {
      await supabase.from("server_config").insert({
        session_id: sessionId,
        economic_params: economic,
      });
    }

    const isCheapStart = economic.world_gen_mode === "cheap_start";
    const topProfilesCount = economic.top_profiles_count || 3;

    // Determine world params based on size
    const sizeConfig: Record<string, { factions: number; cities: number; regions: number; historyYears: number }> = {
      small:  { factions: 3, cities: 5,  regions: 2, historyYears: 10 },
      medium: { factions: 5, cities: 12, regions: 4, historyYears: 25 },
      large:  { factions: 7, cities: 20, regions: 6, historyYears: 50 },
    };
    const config = sizeConfig[worldSize] || sizeConfig.small;

    const systemPrompt = `Jsi generátor světa pro civilizační strategickou hru. Tvým úkolem je vytvořit kompletní svět na základě zadané premisy.

PRAVIDLA:
- Vše generuj v ČEŠTINĚ.
- Svět musí být koherentní a navzájem propojený.
- Každá frakce musí mít unikátní osobnost, kulturu a cíle.
- Historie musí obsahovat konflikty, aliance, vzestupy a pády.
- Hráčova frakce ("${playerName}") musí být jednou z frakcí — nech ji neutrální, hráč si ji dotvoří.
- Města musí mít smysluplná jména odpovídající kultuře frakce.
- Regiony musí mít různé biomy a strategickou hodnotu.

Odpověz POUZE voláním funkce generate_world.`;

    const userPrompt = `SVĚT: ${worldName}
PREMISA: ${premise}
TÓN: ${tone}
STYL VÍTĚZSTVÍ: ${victoryStyle}
HRÁČ: ${playerName}

POŽADAVKY:
- ${config.factions} AI frakcí (+ 1 hráčova frakce = ${config.factions + 1} celkem)
- ${config.regions} regionů
- ${config.cities} měst rozdělených mezi frakce
- ${config.historyYears} let pre-historie (klíčové události)

Generuj kompletní svět.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_world",
            description: "Generate a complete game world with factions, regions, cities, and history.",
            parameters: {
              type: "object",
              properties: {
                factions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      personality: { type: "string", enum: ["aggressive", "diplomatic", "mercantile", "isolationist", "expansionist"] },
                      description: { type: "string" },
                      coreMith: { type: "string" },
                      architecturalStyle: { type: "string" },
                      culturalQuirk: { type: "string" },
                      isPlayer: { type: "boolean" },
                      goals: { type: "array", items: { type: "string" } },
                      dispositionToPlayer: { type: "integer", description: "Attitude toward player: -100 to 100" },
                    },
                    required: ["name", "personality", "description", "isPlayer", "goals", "dispositionToPlayer"],
                    additionalProperties: false,
                  },
                },
                regions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      biome: { type: "string", enum: ["plains", "coast", "mountains", "forest", "desert", "tundra", "volcanic"] },
                      description: { type: "string" },
                      controlledBy: { type: "string", description: "Faction name that controls this region" },
                      isPlayerHomeland: { type: "boolean" },
                    },
                    required: ["name", "biome", "description", "controlledBy", "isPlayerHomeland"],
                    additionalProperties: false,
                  },
                },
                cities: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      ownerFaction: { type: "string" },
                      regionName: { type: "string" },
                      level: { type: "string", enum: ["Osada", "Vesnice", "Město", "Velkoměsto"] },
                      tags: { type: "array", items: { type: "string" } },
                      description: { type: "string" },
                    },
                    required: ["name", "ownerFaction", "regionName", "level"],
                    additionalProperties: false,
                  },
                },
                history: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      year: { type: "integer" },
                      title: { type: "string" },
                      description: { type: "string" },
                      eventType: { type: "string", enum: ["war", "alliance", "founding", "discovery", "disaster", "cultural", "trade"] },
                      involvedFactions: { type: "array", items: { type: "string" } },
                      location: { type: "string" },
                    },
                    required: ["year", "title", "description", "eventType", "involvedFactions"],
                    additionalProperties: false,
                  },
                },
                worldMemories: {
                  type: "array",
                  items: { type: "string" },
                  description: "Key world facts and traditions that define this world",
                },
              },
              required: ["factions", "regions", "cities", "history", "worldMemories"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_world" } },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI error:", response.status, t);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const world = JSON.parse(toolCall.function.arguments);

    // === PERSIST TO DATABASE ===

    let factionsCreated = 0;
    let citiesCreated = 0;
    let eventsCreated = 0;
    let regionsCreated = 0;
    let wikiEntriesCreated = 0;
    let rumorsCreated = 0;

    const factionPlayerMap: Record<string, string> = {};

    // 1) Create civilizations + ai_factions
    for (const faction of world.factions || []) {
      const factionPlayerName = faction.isPlayer ? playerName : faction.name;
      factionPlayerMap[faction.name] = factionPlayerName;

      await supabase.from("civilizations").insert({
        session_id: sessionId,
        player_name: factionPlayerName,
        civ_name: faction.name,
        core_myth: faction.coreMith || null,
        architectural_style: faction.architecturalStyle || null,
        cultural_quirk: faction.culturalQuirk || null,
        is_ai: !faction.isPlayer,
        ai_personality: faction.isPlayer ? null : faction.personality,
      });

      if (!faction.isPlayer) {
        await supabase.from("ai_factions").insert({
          session_id: sessionId,
          faction_name: faction.name,
          personality: faction.personality,
          disposition: { [playerName]: faction.dispositionToPlayer || 0 },
          goals: faction.goals || [],
          is_active: true,
        });

        for (const rt of ["food", "wood", "stone", "iron", "wealth"]) {
          await supabase.from("player_resources").insert({
            session_id: sessionId,
            player_name: factionPlayerName,
            resource_type: rt,
            income: rt === "food" ? 6 : rt === "wood" ? 4 : rt === "stone" ? 3 : rt === "iron" ? 2 : 3,
            upkeep: rt === "food" ? 3 : rt === "wood" ? 1 : rt === "wealth" ? 1 : 0,
            stockpile: rt === "food" ? 20 : rt === "wood" ? 10 : rt === "stone" ? 5 : rt === "iron" ? 3 : 10,
          });
        }
      }

      factionsCreated++;
    }

    // 2) Create regions
    const regionIdMap: Record<string, string> = {};
    for (const region of world.regions || []) {
      const ownerPlayer = factionPlayerMap[region.controlledBy] || playerName;
      const { data: regRow } = await supabase.from("regions").insert({
        session_id: sessionId,
        name: region.name,
        description: region.description,
        biome: region.biome,
        owner_player: ownerPlayer,
        is_homeland: region.isPlayerHomeland || false,
        discovered_turn: 1,
        discovered_by: ownerPlayer,
      }).select("id").single();

      if (regRow) regionIdMap[region.name] = regRow.id;
      regionsCreated++;
    }

    // 3) Create cities with clustered hex coordinates
    const usedHexes = new Set<string>();
    const createdCityIds: string[] = [];
    const createdCityRows: any[] = [];

    const placeCityHex = (index: number): { q: number; r: number } => {
      if (index === 0) return { q: 0, r: 0 };
      const ring = Math.floor((index - 1) / 6) + 1;
      const pos = (index - 1) % 6;
      const directions = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
      const dir = directions[pos];
      let q = dir[0] * ring * 2;
      let r = dir[1] * ring * 2;
      const offset = Math.floor(index / 7);
      q += offset % 2;
      r += (offset + 1) % 2;
      let key = `${q},${r}`;
      let attempts = 0;
      while (usedHexes.has(key) && attempts < 20) { q += 1; attempts++; key = `${q},${r}`; }
      return { q, r };
    };

    let cityIndex = 0;
    for (const city of world.cities || []) {
      const ownerPlayer = factionPlayerMap[city.ownerFaction] || playerName;
      const isPlayerCity = ownerPlayer === playerName;

      let coords: { q: number; r: number };
      if (isPlayerCity && cityIndex === 0) {
        coords = { q: 0, r: 0 };
      } else {
        coords = placeCityHex(cityIndex);
      }
      usedHexes.add(`${coords.q},${coords.r}`);

      const cityName = (isPlayerCity && cityIndex === 0 && settlementName) ? settlementName : city.name;

      const { data: cityRow, error: cityErr } = await supabase.from("cities").insert({
        session_id: sessionId,
        name: cityName,
        owner_player: ownerPlayer,
        level: city.level || "Osada",
        tags: city.tags || [],
        province: city.regionName,
        city_description_cached: city.description || null,
        founded_round: 1,
        province_q: coords.q,
        province_r: coords.r,
        city_stability: 60 + Math.floor(Math.random() * 15),
        influence_score: 0,
      }).select("id").single();

      if (cityErr) { console.error("City insert error:", cityErr); continue; }

      const cityId = cityRow!.id;
      createdCityIds.push(cityId);
      createdCityRows.push({
        id: cityId, name: cityName, ownerPlayer, description: city.description,
        regionName: city.regionName, level: city.level || "Osada",
        q: coords.q, r: coords.r, isPlayer: isPlayerCity,
      });
      citiesCreated++;
      cityIndex++;
    }

    // 4) Create pre-history events
    for (const event of world.history || []) {
      await supabase.from("game_events").insert({
        session_id: sessionId,
        event_type: event.eventType || "other",
        player: event.involvedFactions?.[0] ? (factionPlayerMap[event.involvedFactions[0]] || "system") : "system",
        turn_number: Math.max(1, event.year),
        confirmed: true,
        note: event.description,
        location: event.location || null,
        result: event.title,
        importance: "normal",
        truth_state: "canon",
      });
      eventsCreated++;
    }

    // 5) Create world memories
    for (const memory of world.worldMemories || []) {
      await supabase.from("world_memories").insert({
        session_id: sessionId, text: memory, category: "tradition", status: "approved", source_turn: 1,
      } as any);
    }

    // ═══════════════════════════════════════════════
    // 6) SEED WIKI ENTRIES — cheap_start vs full_start
    // ═══════════════════════════════════════════════

    // Helper: generate a NON-AI stub summary from city fields
    const stubSummary = (c: any): string => {
      const levelLabel = c.level || "Osada";
      const regionPart = c.regionName ? ` v regionu ${c.regionName}` : "";
      const descPart = c.description ? ` ${c.description}` : "";
      return `${c.name} je ${levelLabel.toLowerCase()}${regionPart}, pod správou ${c.ownerPlayer}.${descPart ? descPart.substring(0, 120) : ""}`;
    };

    // Insert wiki_entries rows for ALL cities with stub summaries
    for (const city of createdCityRows) {
      await supabase.from("wiki_entries").upsert({
        session_id: sessionId,
        entity_type: "city",
        entity_id: city.id,
        entity_name: city.name,
        owner_player: city.ownerPlayer,
        summary: stubSummary(city),
        ai_description: null, // Will be filled for top cities only in cheap_start
        updated_at: new Date().toISOString(),
        references: { generated: false, mode: isCheapStart ? "cheap_start" : "full_start", ts: new Date().toISOString() },
      } as any, { onConflict: "session_id,entity_type,entity_id" });
      wikiEntriesCreated++;
    }

    // Determine which cities get full AI profiles
    let citiesToGenerate: any[] = [];

    if (isCheapStart) {
      // Find player's home city (first player city = 0,0)
      const playerCity = createdCityRows.find(c => c.isPlayer);
      const playerQ = playerCity?.q ?? 0;
      const playerR = playerCity?.r ?? 0;

      // Sort all cities by hex distance from player home
      const hexDist = (c: any) => {
        const dq = c.q - playerQ;
        const dr = c.r - playerR;
        return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
      };
      const sorted = [...createdCityRows].sort((a, b) => hexDist(a) - hexDist(b));
      citiesToGenerate = sorted.slice(0, topProfilesCount);
      console.log(`cheap_start: generating AI profiles for ${citiesToGenerate.length}/${createdCityRows.length} cities`);
    } else {
      // full_start: generate for all
      citiesToGenerate = [...createdCityRows];
    }

    // Generate AI profiles for selected cities
    const WIKI_BATCH = 3;
    let wikiGenerated = 0;
    let wikiFailed = 0;
    const wikiStartTime = Date.now();

    for (let i = 0; i < citiesToGenerate.length; i += WIKI_BATCH) {
      const batch = citiesToGenerate.slice(i, i + WIKI_BATCH);
      const results = await Promise.allSettled(
        batch.map(city =>
          fetch(`${supabaseUrl}/functions/v1/wiki-generate`, {
            method: "POST",
            headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              entityType: "city", entityName: city.name, entityId: city.id,
              sessionId, ownerPlayer: city.ownerPlayer,
              context: { regionName: city.regionName, description: city.description, worldName, premise, tone },
            }),
          }).then(async (res) => {
            if (!res.ok) throw new Error(`wiki-generate ${res.status}`);
            return res.json();
          })
        )
      );

      for (const r of results) {
        if (r.status === "fulfilled") wikiGenerated++;
        else { wikiFailed++; console.error("Wiki gen failed:", r.reason); }
      }
    }

    // Log wiki generation stats
    await supabase.from("simulation_log").insert({
      session_id: sessionId, year_start: 1, year_end: 1,
      events_generated: wikiGenerated, scope: "seed_city_profiles",
      triggered_by: isCheapStart ? "cheap_start" : "full_start",
    }).catch(() => {});

    console.log(`Wiki generation (${economic.world_gen_mode}): ${wikiGenerated} ok, ${wikiFailed} failed, ${Date.now() - wikiStartTime}ms`);

    // City rumors: 3-5 per city
    const rumorTemplates = [
      (cn: string) => `Obchodníci tvrdí, že ${cn} skrývá tajné zásoby zlata.`,
      (cn: string) => `Šeptá se, že v ${cn} se chystá převrat.`,
      (cn: string) => `Poutníci z ${cn} přinášejí zvěsti o záhadných úkazech na nebi.`,
      (cn: string) => `Stráže ${cn} údajně zesílily hlídky na hradbách.`,
      (cn: string) => `V hospodách ${cn} se mluví o blížící se válce.`,
      (cn: string) => `Kupci z ${cn} nabízejí vzácné koření za neslýchané ceny.`,
      (cn: string) => `Z ${cn} přichází zprávy o nové nemoci, která kosí dobytek.`,
      (cn: string) => `Říká se, že vůdce ${cn} jedná s cizí mocností.`,
    ];

    for (const city of createdCityRows) {
      const rumorCount = 3 + Math.floor(Math.random() * 3);
      const shuffled = [...rumorTemplates].sort(() => Math.random() - 0.5);
      for (let i = 0; i < Math.min(rumorCount, shuffled.length); i++) {
        await supabase.from("city_rumors").insert({
          session_id: sessionId, city_id: city.id, city_name: city.name,
          text: shuffled[i](city.name),
          tone_tag: ["neutral", "ominous", "hopeful", "mysterious"][Math.floor(Math.random() * 4)],
          turn_number: 1, created_by: "system",
        });
        rumorsCreated++;
      }
    }

    // World feed items
    await supabase.from("world_feed_items").insert({
      session_id: sessionId, turn_number: 1,
      content: `Věk zakládání začíná. V zemi ${worldName} vznikají nové říše a města.`,
      feed_type: "gossip", importance: "high",
    } as any);

    // Chronicle entry
    await supabase.from("chronicle_entries").insert({
      session_id: sessionId,
      text: `Věk zakládání – V prvním roce letopočtu byly založeny základy civilizací ve světě ${worldName}. ${citiesCreated} měst vzniklo v ${regionsCreated} regionech. ${premise}`,
      epoch_style: "kroniky", turn_from: 1, turn_to: 1,
    });

    // Founding events for top cities
    const topCities = createdCityRows.slice(0, Math.min(5, createdCityRows.length));
    for (const city of topCities) {
      await supabase.from("world_feed_items").insert({
        session_id: sessionId, turn_number: 1,
        content: `Město ${city.name} bylo založeno v regionu ${city.regionName || worldName}.`,
        feed_type: "gossip", importance: "normal",
      } as any);
    }

    // 7) World summary
    await supabase.from("ai_world_summaries").insert({
      session_id: sessionId, summary_type: "world_state",
      turn_range_from: 1, turn_range_to: 1,
      summary_text: `Svět ${worldName}: ${premise}. ${factionsCreated} frakcí, ${citiesCreated} měst, ${regionsCreated} regionů. ${eventsCreated} historických událostí.`,
      key_facts: world.worldMemories || [],
    });

    // 8) Upsert game_style_settings
    const stylePayload = {
      session_id: sessionId,
      lore_bible: [
        `Svět: ${worldName}`, `Premisa: ${premise}`, `Tón: ${tone}`, `Styl vítězství: ${victoryStyle}`,
        realmName ? `Říše hráče: ${realmName}` : "",
        cultureName ? `Kultura: ${cultureName}` : "",
        languageName ? `Jazyk: ${languageName}` : "",
      ].filter(Boolean).join("\n"),
      prompt_rules: JSON.stringify({
        world_vibe: tone,
        writing_style: tone === "realistic" ? "political-chronicle" : tone === "mythic" ? "epic-saga" : "narrative",
        constraints: tone === "realistic" ? "avoid random magic unless selected" : "",
        language_name: languageName || "",
        culture_name: cultureName || "",
        player_realm_name: realmName || "",
      }),
      updated_at: new Date().toISOString(),
    };
    await supabase.from("game_style_settings").upsert(stylePayload, { onConflict: "session_id" });

    // Set session ready
    await supabase.from("game_sessions").update({ current_turn: 1, init_status: "ready" }).eq("id", sessionId);

    // 9) Log
    await supabase.from("world_action_log").insert({
      session_id: sessionId, player_name: "system", turn_number: 1, action_type: "other",
      description: `AI svět vygenerován (${economic.world_gen_mode}): ${factionsCreated} frakcí, ${citiesCreated} měst, ${regionsCreated} regionů, ${eventsCreated} událostí, ${wikiGenerated}/${citiesCreated} wiki profilů, ${rumorsCreated} pověstí.`,
    });

    // 10) simulation_log
    await supabase.from("simulation_log").insert({
      session_id: sessionId, year_start: 1, year_end: 1,
      events_generated: eventsCreated, scope: "world_generate_init", triggered_by: "ai_wizard",
    });

    // 11) Generate hexes around player start
    try {
      const hexPositions = [
        [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
        [2, 0], [-2, 0], [0, 2], [0, -2], [2, -2], [-2, 2], [2, -1], [-2, 1], [1, 1], [-1, -1], [1, -2], [-1, 2],
      ];
      await Promise.all(hexPositions.map(([q, r]) =>
        fetch(`${supabaseUrl}/functions/v1/generate-hex`, {
          method: "POST",
          headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, q, r }),
        }).catch(() => null)
      ));
    } catch (hexErr) {
      console.warn("Hex generation warning:", hexErr);
    }

    return new Response(JSON.stringify({
      factionsCreated, citiesCreated, regionsCreated, eventsCreated,
      memoriesCreated: world.worldMemories?.length || 0,
      wikiEntriesCreated, wikiProfilesGenerated: wikiGenerated,
      rumorsCreated, mode: economic.world_gen_mode,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("world-generate-init error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
