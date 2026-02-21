import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, playerName, worldName, premise, tone, victoryStyle, worldSize, tier } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Determine world params based on size
    const sizeConfig: Record<string, { factions: number; cities: number; regions: number; historyYears: number }> = {
      small:  { factions: 3, cities: 5,  regions: 2, historyYears: 10 },
      medium: { factions: 5, cities: 12, regions: 4, historyYears: 25 },
      large:  { factions: 7, cities: 20, regions: 6, historyYears: 50 },
    };
    const config = sizeConfig[worldSize] || sizeConfig.small;

    // Free tier limits
    const effectiveHistoryYears = tier === "premium" ? config.historyYears : Math.min(config.historyYears, 10);
    const effectiveFactions = tier === "premium" ? config.factions : Math.min(config.factions, 3);

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
- ${effectiveFactions} AI frakcí (+ 1 hráčova frakce = ${effectiveFactions + 1} celkem)
- ${config.regions} regionů
- ${config.cities} měst rozdělených mezi frakce
- ${effectiveHistoryYears} let pre-historie (klíčové události)

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

    // Map faction names to player names for DB
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

        // Init AI faction resources
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

    // 3) Create cities
    for (const city of world.cities || []) {
      const ownerPlayer = factionPlayerMap[city.ownerFaction] || playerName;
      const regionId = regionIdMap[city.regionName] || null;

      await supabase.from("cities").insert({
        session_id: sessionId,
        name: city.name,
        owner_player: ownerPlayer,
        level: city.level || "Osada",
        tags: city.tags || [],
        province: city.regionName,
        city_description_cached: city.description || null,
        founded_round: 1,
      });

      citiesCreated++;
    }

    // 4) Create pre-history events
    for (const event of world.history || []) {
      const slug = `history-y${event.year}-${event.title.toLowerCase().replace(/\s+/g, "-").substring(0, 30)}`;
      
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
        session_id: sessionId,
        text: memory,
        category: "tradition",
        status: "approved",
        source_turn: 1,
      } as any);
    }

    // 6) Create initial world summary
    await supabase.from("ai_world_summaries").insert({
      session_id: sessionId,
      summary_type: "world_state",
      turn_range_from: 1,
      turn_range_to: 1,
      summary_text: `Svět ${worldName}: ${premise}. ${factionsCreated} frakcí, ${citiesCreated} měst, ${regionsCreated} regionů. ${eventsCreated} historických událostí.`,
      key_facts: world.worldMemories || [],
    });

    // 7) Set session turn to 1 (after pre-history)
    await supabase.from("game_sessions").update({ current_turn: 1 }).eq("id", sessionId);

    // 8) Log
    await supabase.from("world_action_log").insert({
      session_id: sessionId,
      player_name: "system",
      turn_number: 1,
      action_type: "other",
      description: `AI svět vygenerován: ${factionsCreated} frakcí, ${citiesCreated} měst, ${regionsCreated} regionů, ${eventsCreated} historických událostí.`,
    });

    return new Response(JSON.stringify({
      factionsCreated,
      citiesCreated,
      regionsCreated,
      eventsCreated,
      memoriesCreated: world.worldMemories?.length || 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("world-generate-init error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
