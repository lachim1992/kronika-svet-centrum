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
      await supabase.from("server_config").update({ economic_params: economic }).eq("id", existingCfg.id);
    } else {
      await supabase.from("server_config").insert({ session_id: sessionId, economic_params: economic });
    }

    const isCheapStart = economic.world_gen_mode === "cheap_start";
    const topProfilesCount = economic.top_profiles_count || 3;

    // Determine world params based on size
    const sizeConfig: Record<string, { factions: number; cities: number; regions: number; historyYears: number; legendaryEvents: number }> = {
      small:  { factions: 3, cities: 5,  regions: 2, historyYears: 10, legendaryEvents: 5 },
      medium: { factions: 5, cities: 12, regions: 4, historyYears: 25, legendaryEvents: 6 },
      large:  { factions: 7, cities: 20, regions: 6, historyYears: 50, legendaryEvents: 7 },
    };
    const config = sizeConfig[worldSize] || sizeConfig.small;

    // ═══════════════════════════════════════════════
    // AI PROMPT — enforce Country → Region → City thematic hierarchy
    // ═══════════════════════════════════════════════
    const systemPrompt = `Jsi generátor světa pro civilizační strategickou hru. Tvým úkolem je vytvořit kompletní, tematicky koherentní svět.

HLAVNÍ PRAVIDLA:
- Vše generuj v ČEŠTINĚ.
- Existuje JEDEN společný stát (country), do kterého patří VŠECHNY frakce na začátku.
- Regiony musí tematicky, vizuálně i jmenně korespondovat se státem a jeho kulturou.
- Města pod regiony musí tematicky odpovídat danému kraji — jména, perky, popisy.
- Každý region musí mít bohatý encyklopedický popis (4-6 vět), který zahrnuje geografii, klima, obyvatele, tradice.
- Každé město musí mít popis odpovídající svému regionu.
- Každá frakce musí mít unikátní osobnost, kulturu a cíle.

LEGENDÁRNÍ UDÁLOSTI (${config.legendaryEvents}):
- Vygeneruj ${config.legendaryEvents} legendárních historických událostí, které formovaly svět.
- Mohou to být bitvy, korunovace králů, katastrofy, zázraky, objevy, vzestupy a pády říší.
- Každá událost musí mít bohatý narativní popis (3-5 vět), rok, místo a zúčastněné frakce.
- Tyto události budou tvořit základ pro kroniky, ságy a pověsti — musí být epické a zapamatovatelné.
- Legendární události slouží jako legitimizační základ pro vládnoucí rody a tradice.

Odpověz POUZE voláním funkce generate_world.`;

    const userPrompt = `SVĚT: ${worldName}
PREMISA: ${premise}
TÓN: ${tone}
STYL VÍTĚZSTVÍ: ${victoryStyle}
HRÁČ: ${playerName}
${realmName ? `ŘÍŠE HRÁČE: ${realmName}` : ""}
${cultureName ? `KULTURA: ${cultureName}` : ""}

POŽADAVKY:
- 1 společný stát (country) se jménem, popisem a historií
- ${config.factions} AI frakcí (+ 1 hráčova frakce = ${config.factions + 1} celkem)
- ${config.regions} regionů tematicky propojených se státem
- ${config.cities} měst rozdělených mezi frakce, tematicky odpovídajících regionům
- ${config.legendaryEvents} legendárních historických událostí
- Každý region musí mít alespoň 1 provincii
- Každé město musí mít přiřazenou provincii (provinceName)

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
            description: "Generate a complete game world with country, factions, regions, provinces, cities, legendary events, and history.",
            parameters: {
              type: "object",
              properties: {
                country: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Name of the common country/state" },
                    description: { type: "string", description: "4-6 sentence encyclopedia article about the country in Czech" },
                    motto: { type: "string", description: "National motto or guiding principle" },
                  },
                  required: ["name", "description"],
                  additionalProperties: false,
                },
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
                      description: { type: "string", description: "4-6 sentence encyclopedia article about this region in Czech" },
                      controlledBy: { type: "string", description: "Faction name that controls this region" },
                      isPlayerHomeland: { type: "boolean" },
                      imagePrompt: { type: "string", description: "English image prompt for region illustration, medieval manuscript style" },
                      provinces: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            name: { type: "string" },
                            description: { type: "string", description: "2-3 sentence description of the province" },
                          },
                          required: ["name", "description"],
                          additionalProperties: false,
                        },
                        description: "Provinces within this region (at least 1)",
                      },
                    },
                    required: ["name", "biome", "description", "controlledBy", "isPlayerHomeland", "imagePrompt", "provinces"],
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
                      provinceName: { type: "string", description: "Name of the province this city belongs to" },
                      level: { type: "string", enum: ["Osada", "Vesnice", "Město", "Velkoměsto"] },
                      tags: { type: "array", items: { type: "string" } },
                      description: { type: "string", description: "2-4 sentence description matching the region's theme" },
                    },
                    required: ["name", "ownerFaction", "regionName", "provinceName", "level", "description"],
                    additionalProperties: false,
                  },
                },
                legendaryEvents: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      year: { type: "integer", description: "Negative = before founding, positive = year" },
                      title: { type: "string", description: "Epic event title in Czech" },
                      description: { type: "string", description: "3-5 sentence narrative description in Czech" },
                      eventType: { type: "string", enum: ["war", "coronation", "disaster", "miracle", "discovery", "founding", "treaty", "cultural"] },
                      involvedFactions: { type: "array", items: { type: "string" } },
                      location: { type: "string" },
                      imagePrompt: { type: "string", description: "English image prompt for event illustration" },
                      legacyImpact: { type: "string", description: "How this event affects current politics, legends, and legitimacy (1-2 sentences, Czech)" },
                    },
                    required: ["year", "title", "description", "eventType", "involvedFactions", "location", "imagePrompt", "legacyImpact"],
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
              required: ["country", "factions", "regions", "cities", "legendaryEvents", "history", "worldMemories"],
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

    // ═══════════════════════════════════════════════════════════
    // DETERMINISTIC GENERATION ORDER:
    // A) Country (single shared state)
    // B) Civilizations/Factions
    // C) Regions (with wiki entries)
    // D) Provinces (with wiki entries)
    // E) Cities (with wiki entries)
    // F) Legendary Events (world_events + wiki entries)
    // G) History events (game_events only, minor)
    // H) World memories, rumors, feed, chronicle
    // ═══════════════════════════════════════════════════════════

    let factionsCreated = 0;
    let citiesCreated = 0;
    let eventsCreated = 0;
    let regionsCreated = 0;
    let provincesCreated = 0;
    let countriesCreated = 0;
    let wikiEntriesCreated = 0;
    let rumorsCreated = 0;
    let legendaryEventsCreated = 0;

    const factionPlayerMap: Record<string, string> = {};

    // ═══ STEP A: Create the shared country ═══
    const countryInfo = world.country || { name: worldName, description: premise };
    const { data: countryRow } = await supabase.from("countries").insert({
      session_id: sessionId,
      name: countryInfo.name,
      description: countryInfo.description || null,
      ruler_player: null, // shared state
    }).select("id").single();

    const countryId = countryRow?.id || null;
    if (countryId) {
      countriesCreated++;
      // Wiki entry for country
      await supabase.from("wiki_entries").upsert({
        session_id: sessionId,
        entity_type: "country",
        entity_id: countryId,
        entity_name: countryInfo.name,
        owner_player: "system",
        summary: `${countryInfo.name} — společný stát tohoto světa.`,
        ai_description: countryInfo.description || null,
        image_prompt: `A medieval illuminated manuscript illustration of the kingdom of ${countryInfo.name}, panoramic landscape`,
        updated_at: new Date().toISOString(),
        references: { generated: true, mode: "world_init" },
      } as any, { onConflict: "session_id,entity_type,entity_id" });
      wikiEntriesCreated++;
    }

    // ═══ STEP B: Create civilizations + ai_factions + resources for ALL ═══
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
      }

      // Create player_resources for ALL factions (player + AI)
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

      // Create realm_resources for ALL factions
      await supabase.from("realm_resources").insert({
        session_id: sessionId,
        player_name: factionPlayerName,
        grain_reserve: 20,
        wood_reserve: 10,
        stone_reserve: 5,
        iron_reserve: 3,
        gold_reserve: 100,
        stability: 70,
        granary_capacity: 500,
        mobilization_rate: 0.1,
      });

      factionsCreated++;
    }

    // ═══ STEP C: Create regions with wiki entries ═══
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
        country_id: countryId,
      }).select("id").single();

      if (regRow) {
        regionIdMap[region.name] = regRow.id;

        // Wiki entry for region
        await supabase.from("wiki_entries").upsert({
          session_id: sessionId,
          entity_type: "region",
          entity_id: regRow.id,
          entity_name: region.name,
          owner_player: ownerPlayer,
          summary: `${region.name} — ${region.biome} region ve státě ${countryInfo.name}.`,
          ai_description: region.description || null,
          image_prompt: region.imagePrompt || `A medieval illuminated manuscript illustration of ${region.name}, ${region.biome} landscape`,
          updated_at: new Date().toISOString(),
          references: { generated: true, mode: "world_init", biome: region.biome },
        } as any, { onConflict: "session_id,entity_type,entity_id" });
        wikiEntriesCreated++;
      }
      regionsCreated++;
    }

    // ═══ STEP D: Create provinces with wiki entries ═══
    const provinceIdMap: Record<string, string> = {};
    const provinceRegionMap: Record<string, string> = {};

    for (const region of world.regions || []) {
      const regionId = regionIdMap[region.name];
      const ownerPlayer = factionPlayerMap[region.controlledBy] || playerName;
      const regionProvinces = region.provinces || [];

      if (regionProvinces.length === 0) {
        regionProvinces.push({ name: `${region.name} – Centrální provincie`, description: `Hlavní provincie regionu ${region.name}.` });
      }

      for (const prov of regionProvinces) {
        const { data: provRow } = await supabase.from("provinces").insert({
          session_id: sessionId,
          name: prov.name,
          description: prov.description || null,
          region_id: regionId || null,
          owner_player: ownerPlayer,
        }).select("id").single();

        if (provRow) {
          provinceIdMap[prov.name] = provRow.id;
          provinceRegionMap[prov.name] = region.name;

          // Wiki entry for province
          await supabase.from("wiki_entries").upsert({
            session_id: sessionId,
            entity_type: "province",
            entity_id: provRow.id,
            entity_name: prov.name,
            owner_player: ownerPlayer,
            summary: `${prov.name} — provincie v regionu ${region.name}.`,
            ai_description: prov.description || null,
            updated_at: new Date().toISOString(),
            references: { generated: true, mode: "world_init", regionName: region.name },
          } as any, { onConflict: "session_id,entity_type,entity_id" });
          wikiEntriesCreated++;
        }
        provincesCreated++;
      }
    }

    // Helper: find best province for a city
    const findProvinceId = (city: any): string | null => {
      if (city.provinceName && provinceIdMap[city.provinceName]) return provinceIdMap[city.provinceName];
      if (city.regionName) {
        for (const [provName, regName] of Object.entries(provinceRegionMap)) {
          if (regName === city.regionName) return provinceIdMap[provName];
        }
      }
      return Object.values(provinceIdMap)[0] || null;
    };

    // ═══ STEP E: Create cities with wiki entries ═══
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

    // Population ranges by level: capital gets highest, randomized
    const POP_RANGES: Record<string, { min: number; max: number }> = {
      Velkoměsto: { min: 1200, max: 1600 },
      Město:      { min: 800,  max: 1200 },
      Vesnice:    { min: 400,  max: 700 },
      Osada:      { min: 300,  max: 600 },
    };
    const SETTLEMENT_MAP: Record<string, string> = {
      Velkoměsto: "POLIS", Město: "CITY", Vesnice: "TOWNSHIP", Osada: "HAMLET",
    };
    const POP_TEMPLATES: Record<string, { peasants: number; burghers: number; clerics: number }> = {
      HAMLET:   { peasants: 0.80, burghers: 0.15, clerics: 0.05 },
      TOWNSHIP: { peasants: 0.60, burghers: 0.30, clerics: 0.10 },
      CITY:     { peasants: 0.40, burghers: 0.40, clerics: 0.20 },
      POLIS:    { peasants: 0.20, burghers: 0.55, clerics: 0.25 },
    };

    // Track first city per player (capital = highest pop)
    const playerFirstCity = new Set<string>();

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
      const provinceId = findProvinceId(city);

      // Randomize population
      const level = city.level || "Osada";
      const isCapital = !playerFirstCity.has(ownerPlayer);
      if (isCapital) playerFirstCity.add(ownerPlayer);

      const range = POP_RANGES[level] || POP_RANGES.Osada;
      let popTotal: number;
      if (isCapital) {
        // Capital: highest range + bonus
        popTotal = range.max + Math.floor(Math.random() * 200);
      } else {
        popTotal = range.min + Math.floor(Math.random() * (range.max - range.min));
      }

      const settlementLevel = SETTLEMENT_MAP[level] || "HAMLET";
      const template = POP_TEMPLATES[settlementLevel];
      const popPeasants = Math.round(popTotal * template.peasants);
      const popBurghers = Math.round(popTotal * template.burghers);
      const popClerics = popTotal - popPeasants - popBurghers;

      const { data: cityRow, error: cityErr } = await supabase.from("cities").insert({
        session_id: sessionId,
        name: cityName,
        owner_player: ownerPlayer,
        level,
        tags: city.tags || [],
        province: city.provinceName || city.regionName || null,
        province_id: provinceId,
        city_description_cached: city.description || null,
        flavor_prompt: city.description || null,
        founded_round: 1,
        province_q: coords.q,
        province_r: coords.r,
        city_stability: 60 + Math.floor(Math.random() * 15),
        influence_score: 0,
        population_total: popTotal,
        population_peasants: popPeasants,
        population_burghers: popBurghers,
        population_clerics: popClerics,
        settlement_level: settlementLevel,
      }).select("id").single();

      if (cityErr) { console.error("City insert error:", cityErr); continue; }

      const cityId = cityRow!.id;
      createdCityIds.push(cityId);
      createdCityRows.push({
        id: cityId, name: cityName, ownerPlayer, description: city.description,
        regionName: city.regionName, provinceName: city.provinceName,
        level, q: coords.q, r: coords.r, isPlayer: isPlayerCity,
      });

      // Wiki entry for city
      const levelLabel = city.level || "Osada";
      const regionPart = city.regionName ? ` v regionu ${city.regionName}` : "";
      await supabase.from("wiki_entries").upsert({
        session_id: sessionId,
        entity_type: "city",
        entity_id: cityId,
        entity_name: cityName,
        owner_player: ownerPlayer,
        summary: `${cityName} je ${levelLabel.toLowerCase()}${regionPart}, pod správou ${ownerPlayer}.`,
        ai_description: city.description || null,
        updated_at: new Date().toISOString(),
        references: { generated: !!city.description, mode: isCheapStart ? "cheap_start" : "full_start" },
      } as any, { onConflict: "session_id,entity_type,entity_id" });
      wikiEntriesCreated++;

      citiesCreated++;
      cityIndex++;
    }

    // ═══ STEP F: Legendary Events → world_events + wiki entries ═══
    const legendaryEventIds: string[] = [];
    for (const evt of world.legendaryEvents || []) {
      const slug = `legendary-${evt.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").substring(0, 60)}-${Date.now()}`;
      const involvedPlayers = (evt.involvedFactions || []).map((f: string) => factionPlayerMap[f] || f);
      const participants = (evt.involvedFactions || []).map((f: string) => ({
        type: "faction", name: f, player: factionPlayerMap[f] || f,
      }));

      const { data: weRow } = await supabase.from("world_events").insert({
        session_id: sessionId,
        title: evt.title,
        slug,
        summary: evt.description.substring(0, 200),
        description: evt.description,
        date: `Rok ${evt.year}`,
        event_category: evt.eventType,
        status: "published",
        created_turn: 1,
        created_by_type: "system",
        affected_players: involvedPlayers,
        participants,
        tags: ["legendary", evt.eventType],
        ai_image_prompt: evt.imagePrompt || null,
      } as any).select("id").single();

      if (weRow) {
        legendaryEventIds.push(weRow.id);
        legendaryEventsCreated++;

        // Wiki entry for legendary event
        await supabase.from("wiki_entries").upsert({
          session_id: sessionId,
          entity_type: "event",
          entity_id: weRow.id,
          entity_name: evt.title,
          owner_player: "system",
          summary: evt.description.substring(0, 200),
          ai_description: `${evt.description}\n\n**Odkaz:** ${evt.legacyImpact || ""}`,
          image_prompt: evt.imagePrompt || null,
          updated_at: new Date().toISOString(),
          references: { generated: true, mode: "legendary", year: evt.year, eventType: evt.eventType },
        } as any, { onConflict: "session_id,entity_type,entity_id" });
        wikiEntriesCreated++;

        // Also create a mirrored game_event for the turn engine
        await supabase.from("game_events").insert({
          session_id: sessionId,
          event_type: evt.eventType || "other",
          player: involvedPlayers[0] || "system",
          turn_number: Math.max(1, Math.abs(evt.year)),
          confirmed: true,
          note: evt.description,
          location: evt.location || null,
          result: evt.title,
          importance: "high",
          truth_state: "canon",
        });
        eventsCreated++;
      }
    }

    // ═══ STEP G: Minor history events (game_events only) ═══
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

    // ═══ STEP H: World memories, rumors, feed, chronicle ═══

    // World memories
    for (const memory of world.worldMemories || []) {
      await supabase.from("world_memories").insert({
        session_id: sessionId, text: memory, category: "tradition", status: "approved", source_turn: 1,
      } as any);
    }

    // Add legendary event legacy impacts as world memories
    for (const evt of world.legendaryEvents || []) {
      if (evt.legacyImpact) {
        await supabase.from("world_memories").insert({
          session_id: sessionId, text: `${evt.title}: ${evt.legacyImpact}`, category: "historical_scar", status: "approved", source_turn: 1,
        } as any);
      }
    }

    // City rumors
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
      content: `Věk zakládání začíná. V zemi ${countryInfo.name} vznikají nové říše a města.`,
      feed_type: "gossip", importance: "high",
    } as any);

    // Feed items for legendary events
    for (const evt of world.legendaryEvents || []) {
      await supabase.from("world_feed_items").insert({
        session_id: sessionId, turn_number: 1,
        content: `Bardi zpívají o ${evt.title}. ${(evt.description || "").substring(0, 100)}…`,
        feed_type: "gossip", importance: "high",
      } as any);
    }

    // Founding events for top cities
    const topCities = createdCityRows.slice(0, Math.min(5, createdCityRows.length));
    for (const city of topCities) {
      await supabase.from("world_feed_items").insert({
        session_id: sessionId, turn_number: 1,
        content: `Město ${city.name} bylo založeno v regionu ${city.regionName || worldName}.`,
        feed_type: "gossip", importance: "normal",
      } as any);
    }

    // Chronicle entry incorporating legendary events
    const legendaryNames = (world.legendaryEvents || []).map((e: any) => e.title).join(", ");
    await supabase.from("chronicle_entries").insert({
      session_id: sessionId,
      text: `Věk zakládání – V prvním roce letopočtu byly založeny základy civilizací ve státě ${countryInfo.name}. ${citiesCreated} měst vzniklo v ${regionsCreated} regionech a ${provincesCreated} provinciích. ${legendaryNames ? `Legendy praví o událostech, jež formovaly svět: ${legendaryNames}.` : ""} ${premise}`,
      epoch_style: "kroniky", turn_from: 1, turn_to: 1,
    });

    // AI wiki profiles for top cities
    let citiesToGenerate: any[] = [];
    if (isCheapStart) {
      const playerCity = createdCityRows.find(c => c.isPlayer);
      const playerQ = playerCity?.q ?? 0;
      const playerR = playerCity?.r ?? 0;
      const hexDist = (c: any) => {
        const dq = c.q - playerQ;
        const dr = c.r - playerR;
        return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
      };
      const sorted = [...createdCityRows].sort((a, b) => hexDist(a) - hexDist(b));
      citiesToGenerate = sorted.slice(0, topProfilesCount);
    } else {
      citiesToGenerate = [...createdCityRows];
    }

    const WIKI_BATCH = 3;
    let wikiGenerated = 0;
    let wikiFailed = 0;

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

    // Also generate wiki images for regions (batch, best effort)
    const regionEntries = Object.entries(regionIdMap);
    for (let i = 0; i < regionEntries.length; i += WIKI_BATCH) {
      const batch = regionEntries.slice(i, i + WIKI_BATCH);
      await Promise.allSettled(
        batch.map(([regionName, regionId]) => {
          const region = (world.regions || []).find((r: any) => r.name === regionName);
          return fetch(`${supabaseUrl}/functions/v1/generate-entity-media`, {
            method: "POST",
            headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId, entityId: regionId, entityType: "region", entityName: regionName,
              kind: "cover",
              imagePrompt: region?.imagePrompt || `A medieval illuminated manuscript illustration of ${regionName}, ${region?.biome || "landscape"}`,
              createdBy: "world-generate",
            }),
          }).then(async (res) => {
            if (res.ok) {
              const mediaData = await res.json();
              if (mediaData.imageUrl) {
                await supabase.from("wiki_entries")
                  .update({ image_url: mediaData.imageUrl } as any)
                  .eq("session_id", sessionId)
                  .eq("entity_type", "region")
                  .eq("entity_id", regionId);
              }
            }
          }).catch(err => console.warn("Region image gen failed:", regionName, err));
        })
      );
    }

    // World summary
    await supabase.from("ai_world_summaries").insert({
      session_id: sessionId, summary_type: "world_state",
      turn_range_from: 1, turn_range_to: 1,
      summary_text: `Stát ${countryInfo.name}: ${premise}. ${factionsCreated} frakcí, ${citiesCreated} měst, ${regionsCreated} regionů, ${provincesCreated} provincií. ${legendaryEventsCreated} legendárních událostí, ${eventsCreated} historických záznamů.`,
      key_facts: world.worldMemories || [],
    });

    // Upsert game_style_settings
    const stylePayload = {
      session_id: sessionId,
      lore_bible: [
        `Svět: ${worldName}`, `Stát: ${countryInfo.name}`, `Premisa: ${premise}`, `Tón: ${tone}`, `Styl vítězství: ${victoryStyle}`,
        realmName ? `Říše hráče: ${realmName}` : "",
        cultureName ? `Kultura: ${cultureName}` : "",
        languageName ? `Jazyk: ${languageName}` : "",
        legendaryNames ? `Legendární události: ${legendaryNames}` : "",
      ].filter(Boolean).join("\n"),
      prompt_rules: JSON.stringify({
        world_vibe: tone,
        writing_style: tone === "realistic" ? "political-chronicle" : tone === "mythic" ? "epic-saga" : "narrative",
        constraints: tone === "realistic" ? "avoid random magic unless selected" : "",
        language_name: languageName || "",
        culture_name: cultureName || "",
        player_realm_name: realmName || "",
        country_name: countryInfo.name,
      }),
      updated_at: new Date().toISOString(),
    };
    await supabase.from("game_style_settings").upsert(stylePayload, { onConflict: "session_id" });

    // ═══ CLEANUP: Delete orphan wiki_entries ═══
    const { data: allWiki } = await supabase
      .from("wiki_entries")
      .select("id, entity_id, entity_type")
      .eq("session_id", sessionId)
      .eq("entity_type", "city");

    let orphansDeleted = 0;
    if (allWiki) {
      const validCityIds = new Set(createdCityIds);
      for (const w of allWiki) {
        if (!validCityIds.has(w.entity_id)) {
          await supabase.from("wiki_entries").delete().eq("id", w.id);
          orphansDeleted++;
        }
      }
    }

    // ═══ Create diplomacy rooms between player and each AI faction ═══
    let diplomacyRoomsCreated = 0;
    for (const faction of (world.factions || [])) {
      if (faction.isPlayer) continue;
      const factionPlayerName = factionPlayerMap[faction.name] || faction.name;
      try {
        await supabase.from("diplomacy_rooms").insert({
          session_id: sessionId,
          room_type: "player_ai",
          participant_a: playerName,
          participant_b: factionPlayerName,
        });
        diplomacyRoomsCreated++;

        // Send an introductory message from the AI faction
        const { data: roomData } = await supabase.from("diplomacy_rooms")
          .select("id")
          .eq("session_id", sessionId)
          .eq("participant_a", playerName)
          .eq("participant_b", factionPlayerName)
          .single();

        if (roomData) {
          const disposition = faction.dispositionToPlayer || 0;
          const greeting = disposition > 30
            ? `Zdravíme vás, vládce ${realmName || playerName}. Doufáme v plodnou spolupráci mezi našimi národy.`
            : disposition < -30
            ? `Bereme na vědomí vaši existenci, ${playerName}. Nečekejte od nás přátelství.`
            : `Pozdravujeme vás, ${playerName}. Naše frakce ${faction.name} je připravena jednat.`;

          await supabase.from("diplomacy_messages").insert({
            room_id: roomData.id,
            sender: factionPlayerName,
            sender_type: "ai",
            message_text: greeting,
            secrecy: "PRIVATE",
          });
        }
      } catch (e) {
        console.warn("Diplomacy room creation failed for", faction.name, e);
      }
    }

    // Set session ready
    await supabase.from("game_sessions").update({ current_turn: 1, init_status: "ready" }).eq("id", sessionId);

    // Logging
    await supabase.from("world_action_log").insert({
      session_id: sessionId, player_name: "system", turn_number: 1, action_type: "other",
      description: `AI svět vygenerován: ${countriesCreated} stát, ${factionsCreated} frakcí, ${citiesCreated} měst, ${regionsCreated} regionů, ${provincesCreated} provincií, ${legendaryEventsCreated} legendárních událostí, ${eventsCreated} hist. událostí, ${wikiEntriesCreated} wiki, ${wikiGenerated} AI profilů, ${rumorsCreated} pověstí.`,
    });

    await supabase.from("simulation_log").insert({
      session_id: sessionId, year_start: 1, year_end: 1,
      events_generated: eventsCreated + legendaryEventsCreated, scope: "world_generate_init", triggered_by: "ai_wizard",
    });

    // Generate hexes around player start (2-ring = 19 hexes)
    try {
      const hexPositions = [
        [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
        [2, 0], [-2, 0], [0, 2], [0, -2], [2, -2], [-2, 2], [2, -1], [-2, 1], [1, 1], [-1, -1], [1, -2], [-1, 2],
      ];
      const hexResults = await Promise.all(hexPositions.map(([q, r]) =>
        fetch(`${supabaseUrl}/functions/v1/generate-hex`, {
          method: "POST",
          headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, q, r }),
        }).then(res => res.ok ? res.json() : null).catch(() => null)
      ));

      // Create discovery records for ALL players on the generated hexes
      const allPlayerNames = Object.values(factionPlayerMap);
      const discoveryRows: any[] = [];
      for (const hex of hexResults) {
        if (!hex?.id) continue;
        for (const pn of allPlayerNames) {
          discoveryRows.push({
            session_id: sessionId,
            player_name: pn,
            entity_type: "province_hex",
            entity_id: hex.id,
            source: "world_init",
          });
        }
      }
      if (discoveryRows.length > 0) {
        // Batch insert discoveries, ignore duplicates
        const DISC_BATCH = 100;
        for (let i = 0; i < discoveryRows.length; i += DISC_BATCH) {
          await supabase.from("discoveries").upsert(
            discoveryRows.slice(i, i + DISC_BATCH),
            { onConflict: "session_id,player_name,entity_type,entity_id" }
          );
        }
      }
    } catch (hexErr) {
      console.warn("Hex generation warning:", hexErr);
    }

    return new Response(JSON.stringify({
      factionsCreated, citiesCreated, regionsCreated, provincesCreated, countriesCreated,
      eventsCreated, legendaryEventsCreated,
      memoriesCreated: (world.worldMemories?.length || 0) + (world.legendaryEvents?.length || 0),
      wikiEntriesCreated, wikiProfilesGenerated: wikiGenerated,
      rumorsCreated, orphansDeleted, mode: economic.world_gen_mode,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("world-generate-init error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
