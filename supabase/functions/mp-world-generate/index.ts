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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // 1. Load session & world foundation
    const { data: session } = await sb.from("game_sessions").select("*").eq("id", sessionId).single();
    if (!session) throw new Error("Session not found");

    const { data: foundation } = await sb.from("world_foundations").select("*").eq("session_id", sessionId).single();
    if (!foundation) throw new Error("World foundation not found");

    // 2. Load all player civ configs
    const { data: civConfigs } = await sb.from("player_civ_configs").select("*").eq("session_id", sessionId);
    if (!civConfigs || civConfigs.length < 2) throw new Error("Need at least 2 players with civ configs");

    const playerCount = civConfigs.length;
    const worldName = foundation.world_name || "Neznámý svět";
    const premise = foundation.premise || "";
    const tone = foundation.tone || "narrative";
    const victoryStyle = foundation.victory_style || "influence";

    // 3. Generate world seed & hex map
    const worldSeed = crypto.randomUUID();
    await sb.from("game_sessions").update({ world_seed: worldSeed }).eq("id", sessionId);

    const MAP_RADIUS = 17;
    const spawnPositions = calculateSpawnPositions(playerCount, MAP_RADIUS);

    // Generate hex map
    const hexBatch: any[] = [];
    const seed = hashSeed(worldSeed);
    for (let q = -MAP_RADIUS; q <= MAP_RADIUS; q++) {
      for (let r = -MAP_RADIUS; r <= MAP_RADIUS; r++) {
        if (Math.abs(q + r) > MAP_RADIUS) continue;
        const hex = generateHexData(q, r, seed, worldSeed);
        hexBatch.push({
          session_id: sessionId, q, r, seed: worldSeed,
          mean_height: hex.mean_height, biome_family: hex.biome_family,
          coastal: hex.coastal, moisture_band: hex.moisture_band, temp_band: hex.temp_band,
        });
      }
    }
    const HEX_BATCH_SIZE = 200;
    for (let i = 0; i < hexBatch.length; i += HEX_BATCH_SIZE) {
      await sb.from("province_hexes").upsert(hexBatch.slice(i, i + HEX_BATCH_SIZE), { onConflict: "session_id,q,r" });
    }

    // 4. Set spawn biomes
    for (let i = 0; i < civConfigs.length; i++) {
      const cfg = civConfigs[i];
      const spawn = spawnPositions[i];
      await sb.from("province_hexes")
        .update({ biome_family: mapBiomeName(cfg.homeland_biome) })
        .eq("session_id", sessionId).eq("q", spawn.q).eq("r", spawn.r);
    }

    // 5. AI GENERATION — full world with persons, wonders, battles, prehistory (same as singleplayer)
    const playerDescs = civConfigs.map((c: any) =>
      `${c.player_name} (${c.realm_name || "neznámá říše"}): ${c.civ_description || "neznámý národ"}, biom: ${c.homeland_biome}, sídlo: ${c.settlement_name}`
    ).join("\n");

    const styleLabel = tone === "realistic" ? "politická kronika" : tone === "mythic" ? "epická sága" : "středověká kronika";

    // Size config for multiplayer (slightly smaller per player but richer overall)
    const config = {
      cities: Math.max(8, playerCount * 3),
      persons: Math.max(10, playerCount * 4),
      wonders: Math.max(4, playerCount + 2),
      preHistoryEvents: Math.max(10, playerCount * 3),
      battles: Math.max(10, playerCount * 4),
      rumors: Math.max(30, playerCount * 10),
      aiFactions: Math.max(2, playerCount),
    };

    let world: any = null;

    if (LOVABLE_API_KEY) {
      const systemPrompt = `Jsi generátor světa pro civilizační strategickou hru s ${playerCount} hráči. Tvým úkolem je vytvořit kompletní, tematicky koherentní svět S HLUBOKOU PREHISTORIÍ.

HLAVNÍ PRAVIDLA:
- Vše generuj v ČEŠTINĚ. Jména mohou být fantasy/historická.
- Existuje JEDEN společný stát (country), do kterého patří VŠECHNY frakce na začátku.
- Všichni hráči jsou SKUTEČNÍ hráči (ne AI frakce). Navíc přidej ${config.aiFactions} AI frakcí.
- Styl vyprávění: ${styleLabel}.

KRITICKÉ POŽADAVKY NA PROVÁZANOST:
1. Svět musí mít BOHATOU PREHISTORII — legendy, mýty, proroctví, dávné bitvy, zakladatele.
2. Všechny entity MUSÍ být VZÁJEMNĚ PROPOJENÉ:
   - Každá bitva MUSÍ odkazovat na konkrétního velitele z persons.
   - Prehistorické události MUSÍ odkazovat na osobnosti a místa.
   - Zvěsti MUSÍ odkazovat na reálná města.
   - Divy světa MUSÍ být spjaty s konkrétním městem a osobností.
3. Osobnosti MUSÍ zahrnovat:
   - LEGENDÁRNÍ POSTAVY z prehistorie (záporné roky narození).
   - SOUČASNÉ postavy — generály, kupce, kněze, špiony.
   - Každá osoba MUSÍ mít detailní bio propojené s konkrétními událostmi.
4. Pre-history events tvoří KOHERENTNÍ MYTOLOGII.
5. Divy: některé mohou být zničené (status=destroyed).
6. KAŽDÝ hráč musí mít alespoň 1 město (jejich startovní sídlo) + další města v jejich regionech.

Odpověz POUZE voláním funkce generate_world.`;

      const userPrompt = `SVĚT: ${worldName}
PREMISA: ${premise}
TÓN: ${tone}
STYL VÍTĚZSTVÍ: ${victoryStyle}

HRÁČI (${playerCount}):
${playerDescs}

POŽADAVKY:
- 1 společný stát (country)
- ${config.aiFactions} AI frakcí navíc k ${playerCount} hráčským frakcím
- ${playerCount} regionů (1 domovina pro každého hráče) + 1-2 neutrální regiony
- ${config.cities} měst (min ${playerCount} startovních sídel hráčů + AI a neutrální města)
- ${config.persons} osobností: polovina LEGENDÁRNÍCH z prehistorie, zbytek současných
- ${config.wonders} divů světa: min 2 zničené
- ${config.preHistoryEvents} prehistorických událostí (roky -100 až -1)
- ${config.battles} bitev: min 5 legendárních + zbytek v roce 0-1
- pre_history_chronicle: 500-800 slov
- ${config.rumors} zvěstí
- lore_bible: 200-400 slov
- 5-10 history events pro rok 1

DŮLEŽITÉ: Hráčské frakce MUSÍ mít isPlayer=true a jméno musí přesně odpovídat player_name hráče. Startovní města hráčů MUSÍ odpovídat jejich zadaným názvům sídel.`;

      // Tool schema (same as singleplayer)
      const toolSchema = {
        type: "function",
        function: {
          name: "generate_world",
          description: "Generate a complete multiplayer game world with deep interconnected prehistory.",
          parameters: {
            type: "object",
            properties: {
              country: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  image_prompt: { type: "string" },
                },
                required: ["name", "description", "image_prompt"],
                additionalProperties: false,
              },
              factions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    playerName: { type: "string", description: "Exact player_name for player factions, faction name for AI" },
                    personality: { type: "string", enum: ["aggressive", "diplomatic", "mercantile", "isolationist", "expansionist"] },
                    description: { type: "string" },
                    coreMith: { type: "string" },
                    architecturalStyle: { type: "string" },
                    culturalQuirk: { type: "string" },
                    isPlayer: { type: "boolean" },
                    goals: { type: "array", items: { type: "string" } },
                  },
                  required: ["name", "playerName", "personality", "description", "isPlayer", "goals"],
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
                    controlledBy: { type: "string", description: "Faction name" },
                    isPlayerHomeland: { type: "boolean" },
                    imagePrompt: { type: "string" },
                    provinces: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: { name: { type: "string" }, description: { type: "string" } },
                        required: ["name", "description"],
                        additionalProperties: false,
                      },
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
                    provinceName: { type: "string" },
                    level: { type: "string", enum: ["Osada", "Vesnice", "Město", "Velkoměsto"] },
                    tags: { type: "array", items: { type: "string" } },
                    description: { type: "string" },
                    imagePrompt: { type: "string" },
                    isStartingCity: { type: "boolean", description: "True if this is a player's starting settlement" },
                    forPlayerName: { type: "string", description: "player_name if isStartingCity" },
                  },
                  required: ["name", "ownerFaction", "regionName", "provinceName", "level", "description", "imagePrompt"],
                  additionalProperties: false,
                },
              },
              persons: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    personType: { type: "string", enum: ["Generál", "Kupec", "Kněz", "Prorok", "Zakladatel", "Špión", "Válečník", "Učenec", "Vládce"] },
                    ownerFaction: { type: "string" },
                    bornYear: { type: "integer" },
                    diedYear: { type: "integer" },
                    bio: { type: "string" },
                    flavorTrait: { type: "string" },
                    homeCityName: { type: "string" },
                    imagePrompt: { type: "string" },
                    exceptionalPrompt: { type: "string" },
                  },
                  required: ["name", "personType", "ownerFaction", "bornYear", "bio", "imagePrompt", "homeCityName"],
                  additionalProperties: false,
                },
              },
              wonders: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    cityName: { type: "string" },
                    ownerFaction: { type: "string" },
                    description: { type: "string" },
                    bonus: { type: "string" },
                    status: { type: "string", enum: ["completed", "destroyed"] },
                    destroyedStory: { type: "string" },
                    builderPersonName: { type: "string" },
                    imagePrompt: { type: "string" },
                    memoryFact: { type: "string" },
                  },
                  required: ["name", "cityName", "ownerFaction", "description", "status", "imagePrompt", "memoryFact"],
                  additionalProperties: false,
                },
              },
              preHistoryEvents: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    year: { type: "integer" },
                    title: { type: "string" },
                    description: { type: "string" },
                    eventType: { type: "string", enum: ["founding", "battle", "prophecy", "cataclysm", "migration", "divine", "betrayal", "alliance", "discovery", "war", "coronation"] },
                    location: { type: "string" },
                    involvedFactions: { type: "array", items: { type: "string" } },
                    relatedPersonNames: { type: "array", items: { type: "string" } },
                    imagePrompt: { type: "string" },
                    legacyImpact: { type: "string" },
                  },
                  required: ["year", "title", "description", "eventType", "location", "involvedFactions", "legacyImpact", "imagePrompt"],
                  additionalProperties: false,
                },
              },
              battles: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    year: { type: "integer" },
                    name: { type: "string" },
                    locationName: { type: "string" },
                    attackerCommander: { type: "string" },
                    defenderCommander: { type: "string" },
                    attackerFaction: { type: "string" },
                    defenderFaction: { type: "string" },
                    outcome: { type: "string" },
                    casualties: { type: "string" },
                    description: { type: "string" },
                  },
                  required: ["year", "name", "locationName", "attackerCommander", "defenderCommander", "attackerFaction", "defenderFaction", "outcome", "description"],
                  additionalProperties: false,
                },
              },
              historyEvents: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    eventType: { type: "string", enum: ["war", "alliance", "founding", "discovery", "disaster", "cultural", "trade", "coronation"] },
                    involvedFactions: { type: "array", items: { type: "string" } },
                    location: { type: "string" },
                  },
                  required: ["title", "description", "eventType", "involvedFactions"],
                  additionalProperties: false,
                },
              },
              preHistoryChronicle: { type: "string" },
              rumors: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    toneTag: { type: "string", enum: ["neutral", "warning", "intrigue", "celebration", "alarming", "mysterious"] },
                    relatedCityName: { type: "string" },
                    turnNumber: { type: "integer" },
                  },
                  required: ["text", "toneTag", "relatedCityName", "turnNumber"],
                  additionalProperties: false,
                },
              },
              loreBible: { type: "string" },
              worldMemories: { type: "array", items: { type: "string" } },
            },
            required: ["country", "factions", "regions", "cities", "persons", "wonders", "preHistoryEvents", "battles", "historyEvents", "preHistoryChronicle", "rumors", "loreBible", "worldMemories"],
            additionalProperties: false,
          },
        },
      };

      try {
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            tools: [toolSchema],
            tool_choice: { type: "function", function: { name: "generate_world" } },
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall) {
            world = JSON.parse(toolCall.function.arguments);
          }
        } else {
          console.warn("AI world gen failed:", response.status, await response.text());
        }
      } catch (e) {
        console.warn("AI world generation failed:", e);
      }
    }

    // ═══════════════════════════════════════════════════════
    // DETERMINISTIC ENTITY CREATION (same order as singleplayer)
    // ═══════════════════════════════════════════════════════

    const counters = { factions: 0, cities: 0, events: 0, regions: 0, provinces: 0, countries: 0, wiki: 0, rumors: 0, legendary: 0, persons: 0, wonders: 0, battles: 0, links: 0 };
    const factionPlayerMap: Record<string, string> = {};
    const cityIdMap: Record<string, string> = {};
    const personIdMap: Record<string, string> = {};

    // Map player configs by player_name for quick lookup
    const playerConfigMap: Record<string, any> = {};
    for (const cfg of civConfigs) {
      playerConfigMap[cfg.player_name] = cfg;
    }

    // ═══ STEP A: Country ═══
    const countryInfo = world?.country || { name: worldName, description: premise, image_prompt: "" };
    const { data: countryRow } = await sb.from("countries").insert({
      session_id: sessionId, name: countryInfo.name,
      description: countryInfo.description || null, ai_description: countryInfo.description || null,
      image_prompt: countryInfo.image_prompt || null,
    }).select("id").single();
    const countryId = countryRow?.id || null;
    if (countryId) {
      counters.countries++;
      await sb.from("wiki_entries").upsert({
        session_id: sessionId, entity_type: "country", entity_id: countryId,
        entity_name: countryInfo.name, owner_player: "system",
        summary: `${countryInfo.name} — společný stát tohoto světa.`,
        ai_description: countryInfo.description || null,
        image_prompt: countryInfo.image_prompt || null,
        updated_at: new Date().toISOString(),
        references: { generated: true, mode: "mp_world_init" },
      } as any, { onConflict: "session_id,entity_type,entity_id" });
      counters.wiki++;
    }

    // ═══ STEP B: Civilizations + AI Factions + Resources ═══
    // First, ensure all real players are mapped
    for (const cfg of civConfigs) {
      factionPlayerMap[cfg.realm_name || cfg.player_name] = cfg.player_name;
    }

    for (const faction of world?.factions || []) {
      let factionPlayerName: string;
      if (faction.isPlayer) {
        // Match to actual player
        factionPlayerName = faction.playerName || faction.name;
        // Try to find matching config
        const matchedCfg = civConfigs.find((c: any) => c.player_name === factionPlayerName || c.realm_name === faction.name);
        if (matchedCfg) {
          factionPlayerName = matchedCfg.player_name;
        }
      } else {
        factionPlayerName = faction.name;
      }
      factionPlayerMap[faction.name] = factionPlayerName;

      await sb.from("civilizations").insert({
        session_id: sessionId, player_name: factionPlayerName, civ_name: faction.name,
        core_myth: faction.coreMith || null, architectural_style: faction.architecturalStyle || null,
        cultural_quirk: faction.culturalQuirk || null, is_ai: !faction.isPlayer,
        ai_personality: faction.isPlayer ? null : faction.personality,
      });

      if (!faction.isPlayer) {
        await sb.from("ai_factions").insert({
          session_id: sessionId, faction_name: faction.name, personality: faction.personality,
          disposition: Object.fromEntries(civConfigs.map((c: any) => [c.player_name, 0])),
          goals: faction.goals || [], is_active: true,
        });
      }

      // Resources for all factions
      for (const rt of ["food", "wood", "stone", "iron", "wealth"]) {
        await sb.from("player_resources").insert({
          session_id: sessionId, player_name: factionPlayerName, resource_type: rt,
          income: rt === "food" ? 6 : rt === "wood" ? 4 : rt === "stone" ? 3 : rt === "iron" ? 2 : 3,
          upkeep: rt === "food" ? 3 : rt === "wood" ? 1 : rt === "wealth" ? 1 : 0,
          stockpile: rt === "food" ? 20 : rt === "wood" ? 10 : rt === "stone" ? 5 : rt === "iron" ? 3 : 10,
        });
      }

      await sb.from("realm_resources").insert({
        session_id: sessionId, player_name: factionPlayerName,
        grain_reserve: 20, wood_reserve: 10, stone_reserve: 5, iron_reserve: 3,
        gold_reserve: 100, stability: 70, granary_capacity: 500,
      });

      counters.factions++;
    }

    // Ensure all real players have factions even if AI missed them
    for (const cfg of civConfigs) {
      if (!factionPlayerMap[cfg.realm_name || cfg.player_name] || !Object.values(factionPlayerMap).includes(cfg.player_name)) {
        factionPlayerMap[cfg.realm_name || cfg.player_name] = cfg.player_name;
        // Check if civ already created
        const { data: existingCiv } = await sb.from("civilizations")
          .select("id").eq("session_id", sessionId).eq("player_name", cfg.player_name).maybeSingle();
        if (!existingCiv) {
          await sb.from("civilizations").insert({
            session_id: sessionId, player_name: cfg.player_name,
            civ_name: cfg.realm_name || cfg.player_name, is_ai: false,
          });
          for (const rt of ["food", "wood", "stone", "iron", "wealth"]) {
            await sb.from("player_resources").insert({
              session_id: sessionId, player_name: cfg.player_name, resource_type: rt,
              income: rt === "food" ? 6 : rt === "wood" ? 4 : rt === "stone" ? 3 : rt === "iron" ? 2 : 3,
              upkeep: rt === "food" ? 3 : rt === "wood" ? 1 : rt === "wealth" ? 1 : 0,
              stockpile: rt === "food" ? 20 : rt === "wood" ? 10 : rt === "stone" ? 5 : rt === "iron" ? 3 : 10,
            });
          }
          await sb.from("realm_resources").insert({
            session_id: sessionId, player_name: cfg.player_name,
            grain_reserve: 20, wood_reserve: 10, stone_reserve: 5, iron_reserve: 3,
            gold_reserve: 100, stability: 70, granary_capacity: 500,
          });
        }
      }
    }

    // ═══ STEP C: Regions with wiki ═══
    const regionIdMap: Record<string, string> = {};
    for (const region of world?.regions || []) {
      const ownerPlayer = factionPlayerMap[region.controlledBy] || civConfigs[0].player_name;
      const { data: regRow } = await sb.from("regions").insert({
        session_id: sessionId, name: region.name, description: region.description,
        biome: region.biome, owner_player: ownerPlayer, is_homeland: region.isPlayerHomeland || false,
        discovered_turn: 1, discovered_by: ownerPlayer, country_id: countryId,
      }).select("id").single();

      if (regRow) {
        regionIdMap[region.name] = regRow.id;
        await sb.from("wiki_entries").upsert({
          session_id: sessionId, entity_type: "region", entity_id: regRow.id,
          entity_name: region.name, owner_player: ownerPlayer,
          summary: `${region.name} — ${region.biome} region ve státě ${countryInfo.name}.`,
          ai_description: region.description || null,
          image_prompt: region.imagePrompt || null,
          updated_at: new Date().toISOString(),
          references: { generated: true, mode: "mp_world_init" },
        } as any, { onConflict: "session_id,entity_type,entity_id" });
        counters.wiki++;
      }
      counters.regions++;
    }

    // ═══ STEP D: Provinces ═══
    const provinceIdMap: Record<string, string> = {};
    for (const region of world?.regions || []) {
      const ownerPlayer = factionPlayerMap[region.controlledBy] || civConfigs[0].player_name;
      for (const prov of region.provinces || []) {
        const { data: provRow } = await sb.from("provinces").insert({
          session_id: sessionId, name: prov.name, description: prov.description || null,
          region_id: regionIdMap[region.name] || null, owner_player: ownerPlayer,
        }).select("id").single();
        if (provRow) {
          provinceIdMap[prov.name] = provRow.id;
          await sb.from("wiki_entries").upsert({
            session_id: sessionId, entity_type: "province", entity_id: provRow.id,
            entity_name: prov.name, owner_player: ownerPlayer,
            summary: `${prov.name} — provincie v regionu ${region.name}.`,
            ai_description: prov.description || null,
            updated_at: new Date().toISOString(),
            references: { generated: true, mode: "mp_world_init" },
          } as any, { onConflict: "session_id,entity_type,entity_id" });
          counters.wiki++;
        }
        counters.provinces++;
      }
    }

    // ═══ STEP E: Cities ═══
    const POP_RANGES: Record<string, { min: number; max: number }> = {
      Velkoměsto: { min: 1200, max: 1600 }, Město: { min: 800, max: 1200 },
      Vesnice: { min: 400, max: 700 }, Osada: { min: 300, max: 600 },
    };
    const SETTLEMENT_MAP: Record<string, string> = {
      Velkoměsto: "POLIS", Město: "CITY", Vesnice: "TOWNSHIP", Osada: "HAMLET",
    };
    const POP_TEMPLATES: Record<string, { peasants: number; burghers: number; clerics: number }> = {
      HAMLET: { peasants: 0.80, burghers: 0.15, clerics: 0.05 },
      TOWNSHIP: { peasants: 0.60, burghers: 0.30, clerics: 0.10 },
      CITY: { peasants: 0.40, burghers: 0.40, clerics: 0.20 },
      POLIS: { peasants: 0.20, burghers: 0.55, clerics: 0.25 },
    };

    // Track which players got their starting city
    const playerStartingCityCreated = new Set<string>();
    let citySpawnIndex = 0;

    for (const city of world?.cities || []) {
      const ownerFactionName = city.ownerFaction;
      const ownerPlayer = factionPlayerMap[ownerFactionName] || civConfigs[0].player_name;
      const isStartingCity = city.isStartingCity && city.forPlayerName;
      const cfgForPlayer = isStartingCity ? playerConfigMap[city.forPlayerName] : null;

      // Determine coords: starting cities use spawn positions
      let coords: { q: number; r: number };
      if (cfgForPlayer && !playerStartingCityCreated.has(cfgForPlayer.player_name)) {
        const playerIdx = civConfigs.findIndex((c: any) => c.player_name === cfgForPlayer.player_name);
        coords = spawnPositions[playerIdx] || spawnPositions[0];
        playerStartingCityCreated.add(cfgForPlayer.player_name);
      } else {
        // Non-starting cities: place around the map
        coords = { q: (citySpawnIndex * 4) % MAP_RADIUS - MAP_RADIUS / 2, r: Math.floor(citySpawnIndex / 5) * 4 - MAP_RADIUS / 2 };
      }
      citySpawnIndex++;

      const cityName = cfgForPlayer ? (cfgForPlayer.settlement_name || city.name) : city.name;
      const level = city.level || "Osada";
      const range = POP_RANGES[level] || POP_RANGES.Osada;
      const popTotal = range.min + Math.floor(Math.random() * (range.max - range.min));
      const settlementLevel = SETTLEMENT_MAP[level] || "HAMLET";
      const template = POP_TEMPLATES[settlementLevel];

      const provinceId = provinceIdMap[city.provinceName] || Object.values(provinceIdMap)[0] || null;

      const { data: cityRow } = await sb.from("cities").insert({
        session_id: sessionId, name: cityName, owner_player: ownerPlayer, level,
        tags: city.tags || [], province: city.provinceName || city.regionName || null,
        province_id: provinceId, city_description_cached: city.description || null,
        flavor_prompt: city.description || null, founded_round: 1,
        province_q: Math.round(coords.q), province_r: Math.round(coords.r),
        city_stability: 60 + Math.floor(Math.random() * 15),
        population_total: popTotal,
        population_peasants: Math.round(popTotal * template.peasants),
        population_burghers: Math.round(popTotal * template.burghers),
        population_clerics: popTotal - Math.round(popTotal * template.peasants) - Math.round(popTotal * template.burghers),
        settlement_level: settlementLevel,
        culture_id: cfgForPlayer ? null : null,
        language_id: cfgForPlayer ? null : null,
      }).select("id").single();

      if (cityRow) {
        cityIdMap[cityName] = cityRow.id;
        if (cityName !== city.name) cityIdMap[city.name] = cityRow.id;

        // Wiki entry
        await sb.from("wiki_entries").upsert({
          session_id: sessionId, entity_type: "city", entity_id: cityRow.id,
          entity_name: cityName, owner_player: ownerPlayer,
          summary: `${cityName} je ${level.toLowerCase()} pod správou ${ownerPlayer}.`,
          ai_description: city.description || null, image_prompt: city.imagePrompt || null,
          updated_at: new Date().toISOString(),
          references: { generated: true, mode: "mp_world_init" },
        } as any, { onConflict: "session_id,entity_type,entity_id" });
        counters.wiki++;

        // Founding event
        await sb.from("game_events").insert({
          session_id: sessionId, event_type: "founding", player: ownerPlayer,
          note: `${ownerPlayer} založil osadu ${cityName}.`, turn_number: 1,
          confirmed: true, importance: "high", city_id: cityRow.id,
        });

        // Discoveries
        await sb.from("discoveries").upsert([
          { session_id: sessionId, player_name: ownerPlayer, entity_type: "city", entity_id: cityRow.id, source: "founded" },
        ], { onConflict: "session_id,player_name,entity_type,entity_id" });

        counters.cities++;
      }
    }

    // Ensure all players have starting cities even if AI missed them
    for (const cfg of civConfigs) {
      if (!playerStartingCityCreated.has(cfg.player_name)) {
        const playerIdx = civConfigs.indexOf(cfg);
        const spawn = spawnPositions[playerIdx];
        const { data: cityRow } = await sb.from("cities").insert({
          session_id: sessionId, name: cfg.settlement_name || `Město ${cfg.player_name}`,
          owner_player: cfg.player_name, level: "Osada", settlement_level: "HAMLET",
          founded_round: 1, province_q: spawn.q, province_r: spawn.r,
          population_total: 1000, population_peasants: 800, population_burghers: 150, population_clerics: 50,
          flavor_prompt: cfg.civ_description || null,
        }).select("id").single();
        if (cityRow) {
          cityIdMap[cfg.settlement_name || `Město ${cfg.player_name}`] = cityRow.id;
          await sb.from("discoveries").upsert([
            { session_id: sessionId, player_name: cfg.player_name, entity_type: "city", entity_id: cityRow.id, source: "founded" },
          ], { onConflict: "session_id,player_name,entity_type,entity_id" });
          await sb.from("game_events").insert({
            session_id: sessionId, event_type: "founding", player: cfg.player_name,
            note: `${cfg.player_name} založil osadu ${cfg.settlement_name}.`, turn_number: 1,
            confirmed: true, importance: "high", city_id: cityRow.id,
          });
        }
        playerStartingCityCreated.add(cfg.player_name);
      }
    }

    // Discover nearby hexes for all players
    for (let i = 0; i < civConfigs.length; i++) {
      const cfg = civConfigs[i];
      const spawn = spawnPositions[i];
      const { data: nearbyHexes } = await sb.from("province_hexes")
        .select("id").eq("session_id", sessionId)
        .gte("q", spawn.q - 3).lte("q", spawn.q + 3)
        .gte("r", spawn.r - 3).lte("r", spawn.r + 3);
      if (nearbyHexes) {
        const hexDisc = nearbyHexes.map(h => ({
          session_id: sessionId, player_name: cfg.player_name,
          entity_type: "hex", entity_id: h.id, source: "starting_area",
        }));
        if (hexDisc.length > 0) {
          await sb.from("discoveries").upsert(hexDisc, { onConflict: "session_id,player_name,entity_type,entity_id" });
        }
      }
    }

    // ═══ STEP F: Great Persons with wiki + entity_links ═══
    for (const person of world?.persons || []) {
      const ownerPlayer = factionPlayerMap[person.ownerFaction] || civConfigs[0].player_name;
      const homeCityId = cityIdMap[person.homeCityName] || null;
      const isAlive = !person.diedYear || person.diedYear > 0;

      const { data: personRow } = await sb.from("great_persons").insert({
        session_id: sessionId, name: person.name, person_type: person.personType || "Generál",
        player_name: ownerPlayer, born_round: person.bornYear || -50,
        died_round: person.diedYear || null, bio: person.bio || null,
        flavor_trait: person.flavorTrait || null, is_alive: isAlive,
        city_id: homeCityId, image_prompt: person.imagePrompt || null,
        exceptional_prompt: person.exceptionalPrompt || null,
      }).select("id").single();

      if (personRow) {
        personIdMap[person.name] = personRow.id;
        counters.persons++;

        await sb.from("wiki_entries").upsert({
          session_id: sessionId, entity_type: "person", entity_id: personRow.id,
          entity_name: person.name, owner_player: ownerPlayer,
          summary: (person.bio || "").substring(0, 200),
          ai_description: person.bio || null, image_prompt: person.imagePrompt || null,
          tags: [person.personType, person.flavorTrait].filter(Boolean),
          updated_at: new Date().toISOString(),
          references: { generated: true, mode: "mp_world_init", bornYear: person.bornYear },
        } as any, { onConflict: "session_id,entity_type,entity_id" });
        counters.wiki++;

        if (homeCityId) {
          await sb.from("entity_links").insert({
            session_id: sessionId, from_entity_id: personRow.id, from_entity_type: "person",
            to_entity_id: homeCityId, to_entity_type: "city", link_type: "resides_in",
            label: `${person.name} pochází z ${person.homeCityName}`,
          });
          counters.links++;
        }
      }
    }

    // ═══ STEP G: Wonders with wiki + entity_links ═══
    for (const wonder of world?.wonders || []) {
      const ownerPlayer = factionPlayerMap[wonder.ownerFaction] || civConfigs[0].player_name;
      const cityId = cityIdMap[wonder.cityName] || null;

      const { data: wonderRow } = await sb.from("wonders").insert({
        session_id: sessionId, name: wonder.name, owner_player: ownerPlayer,
        city_name: wonder.cityName || null, description: wonder.description,
        bonus: wonder.bonus || null, memory_fact: wonder.memoryFact || null,
        image_prompt: wonder.imagePrompt || null, status: wonder.status || "completed",
      }).select("id").single();

      if (wonderRow) {
        counters.wonders++;
        const statusLabel = wonder.status === "destroyed" ? " (zničen)" : "";
        const fullDesc = wonder.status === "destroyed" && wonder.destroyedStory
          ? `${wonder.description}\n\n**Zánik:** ${wonder.destroyedStory}` : wonder.description;

        await sb.from("wiki_entries").upsert({
          session_id: sessionId, entity_type: "wonder", entity_id: wonderRow.id,
          entity_name: wonder.name, owner_player: ownerPlayer,
          summary: `${wonder.name}${statusLabel} — div světa v ${wonder.cityName || "neznámém městě"}.`,
          ai_description: fullDesc, image_prompt: wonder.imagePrompt || null,
          tags: ["wonder", wonder.status || "completed"],
          updated_at: new Date().toISOString(),
          references: { generated: true, mode: "mp_world_init" },
        } as any, { onConflict: "session_id,entity_type,entity_id" });
        counters.wiki++;

        if (cityId) {
          await sb.from("entity_links").insert({
            session_id: sessionId, from_entity_id: wonderRow.id, from_entity_type: "wonder",
            to_entity_id: cityId, to_entity_type: "city", link_type: "located_in",
            label: `${wonder.name} stojí v ${wonder.cityName}`,
          });
          counters.links++;
        }
        if (wonder.builderPersonName && personIdMap[wonder.builderPersonName]) {
          await sb.from("entity_links").insert({
            session_id: sessionId, from_entity_id: wonderRow.id, from_entity_type: "wonder",
            to_entity_id: personIdMap[wonder.builderPersonName], to_entity_type: "person",
            link_type: "built_by", label: `Postaveno osobností ${wonder.builderPersonName}`,
          });
          counters.links++;
        }
      }
    }

    // ═══ STEP H: Pre-history events ═══
    for (const evt of world?.preHistoryEvents || []) {
      const involvedPlayers = (evt.involvedFactions || []).map((f: string) => factionPlayerMap[f] || f);
      const cityId = cityIdMap[evt.location] || null;
      const slug = `prehistory-${Math.abs(evt.year)}-${crypto.randomUUID().substring(0, 8)}`;

      const { data: weRow } = await sb.from("world_events").insert({
        session_id: sessionId, title: evt.title, slug, summary: evt.description.substring(0, 200),
        description: evt.description, date: `Rok ${evt.year} (před počátkem paměti)`,
        event_category: evt.eventType, status: "published", created_turn: 0,
        created_by_type: "system", affected_players: involvedPlayers,
        tags: ["legendary", "prehistory", evt.eventType],
        ai_image_prompt: evt.imagePrompt || null, location_id: cityId,
      } as any).select("id").single();

      if (weRow) {
        counters.legendary++;
        await sb.from("wiki_entries").upsert({
          session_id: sessionId, entity_type: "event", entity_id: weRow.id,
          entity_name: evt.title, owner_player: "system",
          summary: evt.description.substring(0, 200),
          ai_description: `${evt.description}\n\n**Odkaz do současnosti:** ${evt.legacyImpact || ""}`,
          image_prompt: evt.imagePrompt || null, tags: ["legendary", evt.eventType],
          updated_at: new Date().toISOString(),
          references: { generated: true, mode: "legendary", year: evt.year },
        } as any, { onConflict: "session_id,entity_type,entity_id" });
        counters.wiki++;

        await sb.from("game_events").insert({
          session_id: sessionId, event_type: evt.eventType || "other",
          player: involvedPlayers[0] || "system", turn_number: 0,
          confirmed: true, note: evt.description, location: evt.location || null,
          result: evt.title, importance: "high", truth_state: "canon", city_id: cityId,
        });
        counters.events++;

        for (const personName of evt.relatedPersonNames || []) {
          const personId = personIdMap[personName];
          if (personId) {
            await sb.from("entity_links").insert({
              session_id: sessionId, from_entity_id: weRow.id, from_entity_type: "event",
              to_entity_id: personId, to_entity_type: "person", link_type: "involved",
              label: `${personName} se účastnil: ${evt.title}`,
            });
            counters.links++;
          }
        }
        if (cityId) {
          await sb.from("entity_links").insert({
            session_id: sessionId, from_entity_id: weRow.id, from_entity_type: "event",
            to_entity_id: cityId, to_entity_type: "city", link_type: "located_in",
            label: `${evt.title} se odehrála v ${evt.location}`,
          });
          counters.links++;
        }
      }
    }

    // ═══ STEP I: Battles ═══
    for (const battle of world?.battles || []) {
      const cityId = cityIdMap[battle.locationName] || null;
      const turnNum = battle.year <= 0 ? 0 : battle.year;
      const dateLabel = battle.year <= 0 ? `Rok ${battle.year} (před počátkem paměti)` : `Rok ${battle.year}`;
      const attackerPlayer = factionPlayerMap[battle.attackerFaction] || battle.attackerFaction;
      const defenderPlayer = factionPlayerMap[battle.defenderFaction] || battle.defenderFaction;
      const slug = `battle-${Math.abs(battle.year)}-${crypto.randomUUID().substring(0, 8)}`;

      const { data: weRow } = await sb.from("world_events").insert({
        session_id: sessionId, title: `Bitva: ${battle.name}`, slug,
        summary: battle.description.substring(0, 200), description: battle.description,
        date: dateLabel, event_category: "battle", status: "published", created_turn: turnNum,
        created_by_type: "system", affected_players: [attackerPlayer, defenderPlayer].filter(Boolean),
        tags: ["battle", ...(turnNum === 0 ? ["legendary", "prehistory"] : [])],
        location_id: cityId,
      } as any).select("id").single();

      await sb.from("game_events").insert({
        session_id: sessionId, event_type: "battle", player: attackerPlayer,
        location: battle.locationName, note: battle.description,
        turn_number: turnNum, confirmed: true, importance: "high",
        city_id: cityId, result: battle.outcome, casualties: battle.casualties || null,
        truth_state: "canon",
      });
      counters.events++;
      counters.battles++;

      if (weRow) {
        await sb.from("wiki_entries").upsert({
          session_id: sessionId, entity_type: "event", entity_id: weRow.id,
          entity_name: `Bitva: ${battle.name}`, owner_player: "system",
          summary: battle.description.substring(0, 200),
          ai_description: `${battle.description}\n\n**Útočník:** ${battle.attackerCommander} (${battle.attackerFaction})\n**Obránce:** ${battle.defenderCommander} (${battle.defenderFaction})\n**Výsledek:** ${battle.outcome}`,
          tags: ["battle"],
          updated_at: new Date().toISOString(),
          references: { generated: true, mode: "battle", year: battle.year },
        } as any, { onConflict: "session_id,entity_type,entity_id" });
        counters.wiki++;

        const attackerId = personIdMap[battle.attackerCommander];
        const defenderId = personIdMap[battle.defenderCommander];
        if (attackerId) {
          await sb.from("entity_links").insert({
            session_id: sessionId, from_entity_id: weRow.id, from_entity_type: "event",
            to_entity_id: attackerId, to_entity_type: "person", link_type: "commander",
            label: `${battle.attackerCommander} velel útoku v bitvě ${battle.name}`,
          });
          counters.links++;
        }
        if (defenderId) {
          await sb.from("entity_links").insert({
            session_id: sessionId, from_entity_id: weRow.id, from_entity_type: "event",
            to_entity_id: defenderId, to_entity_type: "person", link_type: "commander",
            label: `${battle.defenderCommander} bránil v bitvě ${battle.name}`,
          });
          counters.links++;
        }
        if (cityId) {
          await sb.from("entity_links").insert({
            session_id: sessionId, from_entity_id: weRow.id, from_entity_type: "event",
            to_entity_id: cityId, to_entity_type: "city", link_type: "battle_site",
            label: `Bitva ${battle.name} se odehrála u ${battle.locationName}`,
          });
          counters.links++;
        }
      }
    }

    // ═══ STEP J: History events (year 1) ═══
    for (const event of world?.historyEvents || []) {
      const involvedPlayers = (event.involvedFactions || []).map((f: string) => factionPlayerMap[f] || f);
      const cityId = cityIdMap[event.location || ""] || null;
      await sb.from("game_events").insert({
        session_id: sessionId, event_type: event.eventType || "other",
        player: involvedPlayers[0] || "system", turn_number: 1,
        confirmed: true, note: event.description, location: event.location || null,
        result: event.title, importance: "normal", truth_state: "canon", city_id: cityId,
      });
      await sb.from("world_events").insert({
        session_id: sessionId, title: event.title,
        slug: `evt-1-${crypto.randomUUID().substring(0, 8)}`,
        summary: event.description.substring(0, 200), description: event.description,
        date: "Rok 1", event_category: event.eventType, status: "published",
        created_turn: 1, created_by_type: "system", affected_players: involvedPlayers,
        location_id: cityId,
      } as any);
      counters.events++;
    }

    // ═══ STEP K: Pre-history chronicle + Chronicle Zero ═══
    if (world?.preHistoryChronicle) {
      await sb.from("chronicle_entries").insert({
        session_id: sessionId, text: world.preHistoryChronicle,
        epoch_style: "kroniky", turn_from: 0, turn_to: 0, source_type: "system",
      });
    }

    // Chronicle Zero with full sidebar
    if (LOVABLE_API_KEY && world) {
      try {
        const personsSummary = (world.persons || []).map((p: any) => `${p.name} (${p.personType}, rok ${p.bornYear}${p.diedYear ? `, † ${p.diedYear}` : ""}): ${p.bio}`).join("\n");
        const wondersSummary = (world.wonders || []).map((w: any) => `${w.name} (${w.status}) v ${w.cityName}: ${w.description}${w.destroyedStory ? ` Zánik: ${w.destroyedStory}` : ""}`).join("\n");
        const battlesSummary = (world.battles || []).map((b: any) => `Rok ${b.year} — ${b.name} u ${b.locationName}: ${b.attackerCommander} vs ${b.defenderCommander}. ${b.outcome}.`).join("\n");
        const preHistorySummary = (world.preHistoryEvents || []).map((e: any) => `Rok ${e.year} — ${e.title}: ${e.description}`).join("\n");
        const factionsSummary = (world.factions || []).map((f: any) => `${f.name}: ${f.description}`).join("\n");

        const c0Res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: `Jsi dvorní kronikář. Napiš epický prolog (2000+ slov, česky) pro multiplayer svět. Zmíň VŠECHNY osobnosti, bitvy, divy a prehistorické události. Styl: ${tone === "realistic" ? "politický kronikářský" : "epický mýtický"}. Nepoužívej nadpisy. Odpověz POUZE voláním funkce write_chronicle_zero.`,
              },
              {
                role: "user",
                content: `SVĚT: ${worldName}\nSTÁT: ${countryInfo.name}\nPREMISA: ${premise}\nLORE: ${world.loreBible || ""}\n\nOSOBNOSTI:\n${personsSummary}\n\nDIVY:\n${wondersSummary}\n\nBITVY:\n${battlesSummary}\n\nPREHISTORIE:\n${preHistorySummary}\n\nFRAKCE:\n${factionsSummary}`,
              },
            ],
            tools: [{
              type: "function",
              function: {
                name: "write_chronicle_zero",
                description: "Write epic Chronicle Zero",
                parameters: {
                  type: "object",
                  properties: {
                    chronicle_text: { type: "string" },
                    title: { type: "string" },
                  },
                  required: ["chronicle_text", "title"],
                  additionalProperties: false,
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "write_chronicle_zero" } },
            max_tokens: 16000,
          }),
        });

        if (c0Res.ok) {
          const c0Data = await c0Res.json();
          const c0ToolCall = c0Data.choices?.[0]?.message?.tool_calls?.[0];
          if (c0ToolCall) {
            const c0Result = JSON.parse(c0ToolCall.function.arguments);
            const chronicleText = c0Result.chronicle_text || c0Result.chronicleText || "";
            const chronicleTitle = c0Result.title || "Kronika Počátku";

            if (chronicleText.length > 500) {
              const sidebarData = {
                persons: (world.persons || []).map((p: any) => ({
                  name: p.name, type: p.personType, bornYear: p.bornYear,
                  diedYear: p.diedYear || null, faction: p.ownerFaction,
                  id: personIdMap[p.name] || null,
                })),
                wonders: (world.wonders || []).map((w: any) => ({
                  name: w.name, city: w.cityName, status: w.status,
                })),
                battles: (world.battles || []).map((b: any) => ({
                  name: b.name, year: b.year, location: b.locationName,
                  attacker: b.attackerCommander, defender: b.defenderCommander,
                  outcome: b.outcome,
                })),
                preHistoryEvents: (world.preHistoryEvents || []).map((e: any) => ({
                  title: e.title, year: e.year, type: e.eventType,
                })),
                factions: (world.factions || []).map((f: any) => ({
                  name: f.name, personality: f.personality, isPlayer: f.isPlayer,
                })),
                civilizations: civConfigs.map((c: any) => ({ name: c.realm_name || c.player_name, player: c.player_name })),
              };

              await sb.from("chronicle_entries").insert({
                session_id: sessionId, text: chronicleText, epoch_style: "kroniky",
                turn_from: 0, turn_to: 0, source_type: "chronicle_zero",
                references: { title: chronicleTitle, sidebar: sidebarData, wordCount: chronicleText.split(/\s+/).length },
              });
              console.log(`Chronicle Zero generated: ${chronicleText.split(/\s+/).length} words`);
            }
          }
        }
      } catch (e) {
        console.warn("Chronicle Zero generation error (non-fatal):", e);
      }
    }

    // ═══ STEP L: Rumors, world memories, feed, diplomacy ═══
    const allCityNames = Object.keys(cityIdMap);
    for (const rumor of world?.rumors || []) {
      const cName = rumor.relatedCityName && cityIdMap[rumor.relatedCityName]
        ? rumor.relatedCityName
        : allCityNames[Math.floor(Math.random() * allCityNames.length)] || "";
      const cId = cityIdMap[cName] || Object.values(cityIdMap)[0] || null;
      if (cId) {
        await sb.from("city_rumors").insert({
          session_id: sessionId, city_id: cId, city_name: cName,
          text: rumor.text, tone_tag: rumor.toneTag || "neutral",
          turn_number: rumor.turnNumber || 1, created_by: "system",
        });
        counters.rumors++;
      }
    }

    for (const memory of world?.worldMemories || []) {
      await sb.from("world_memories").insert({
        session_id: sessionId, text: memory, category: "tradition", status: "approved", source_turn: 1,
      } as any);
    }

    for (const evt of world?.preHistoryEvents || []) {
      if (evt.legacyImpact) {
        await sb.from("world_memories").insert({
          session_id: sessionId, text: `${evt.title}: ${evt.legacyImpact}`,
          category: "historical_scar", status: "approved", source_turn: 0,
        } as any);
      }
    }

    for (const wonder of world?.wonders || []) {
      if (wonder.memoryFact) {
        await sb.from("world_memories").insert({
          session_id: sessionId, text: `Div světa ${wonder.name}: ${wonder.memoryFact}`,
          category: "tradition", status: "approved", source_turn: 0,
        } as any);
      }
    }

    // World feed
    await sb.from("world_feed_items").insert({
      session_id: sessionId, turn_number: 1,
      content: `Věk zakládání začíná. V zemi ${countryInfo.name} vznikají nové říše.`,
      feed_type: "gossip", importance: "high",
    } as any);

    // Diplomacy rooms between all players
    const playerNames = civConfigs.map((c: any) => c.player_name);
    for (let i = 0; i < playerNames.length; i++) {
      for (let j = i + 1; j < playerNames.length; j++) {
        try {
          await sb.from("diplomacy_rooms").insert({
            session_id: sessionId, room_type: "player_player",
            participant_a: playerNames[i], participant_b: playerNames[j],
          });
        } catch (e) { console.warn("Diplomacy room failed:", e); }
      }
    }

    // AI faction diplomacy rooms
    for (const faction of world?.factions || []) {
      if (faction.isPlayer) continue;
      for (const pName of playerNames) {
        try {
          await sb.from("diplomacy_rooms").insert({
            session_id: sessionId, room_type: "player_ai",
            participant_a: pName, participant_b: factionPlayerMap[faction.name] || faction.name,
          });
        } catch (e) { console.warn("AI diplomacy room failed:", e); }
      }
    }

    // ═══ STEP M: World premise + lore bible + style settings ═══
    const loreBible = world?.loreBible || premise;
    const writingStyle = tone === "realistic" ? "political-chronicle" : tone === "mythic" ? "epic-saga" : "narrative";

    await sb.from("world_premise").insert({
      session_id: sessionId, seed: null, epoch_style: "kroniky",
      cosmology: "", narrative_rules: {}, economic_bias: "balanced",
      war_bias: "neutral", lore_bible: loreBible,
      world_vibe: tone || "narrative", writing_style: writingStyle,
      constraints: tone === "realistic" ? "avoid random magic unless selected" : "",
      version: 1, is_active: true,
    });

    const legendaryNames = (world?.preHistoryEvents || []).map((e: any) => e.title).slice(0, 5).join(", ");
    await sb.from("game_style_settings").upsert({
      session_id: sessionId,
      lore_bible: [
        `Svět: ${worldName}`, `Stát: ${countryInfo.name}`, `Premisa: ${premise}`, `Tón: ${tone}`,
        ...civConfigs.map((c: any) => `Hráč ${c.player_name}: ${c.realm_name} — ${c.civ_description || ""}`),
        legendaryNames ? `Legendy: ${legendaryNames}` : "",
        `\n--- LORE BIBLE ---\n${loreBible}`,
      ].filter(Boolean).join("\n"),
      prompt_rules: JSON.stringify({
        world_vibe: tone, writing_style: writingStyle,
        player_count: playerCount,
        country_name: countryInfo.name,
      }),
      updated_at: new Date().toISOString(),
    }, { onConflict: "session_id" });

    // World summary
    await sb.from("ai_world_summaries").insert({
      session_id: sessionId, summary_type: "world_state",
      turn_range_from: 0, turn_range_to: 1,
      summary_text: `Stát ${countryInfo.name}: ${premise}. ${counters.factions} frakcí, ${counters.cities} měst, ${counters.persons} osobností, ${counters.wonders} divů, ${counters.legendary} prehistorických událostí, ${counters.battles} bitev, ${counters.links} propojení.`,
      key_facts: world?.worldMemories || [],
    });

    // Server config
    const { data: existingConfig } = await sb.from("server_config").select("id").eq("session_id", sessionId).maybeSingle();
    if (!existingConfig) {
      await sb.from("server_config").insert({ session_id: sessionId, admin_user_id: session.created_by });
    }

    // Simulation log
    await sb.from("simulation_log").insert({
      session_id: sessionId, year_start: 1, year_end: 1,
      events_generated: counters.events, scope: "mp_world_init",
      triggered_by: "mp-world-generate",
    });

    // Mark session as ready
    await sb.from("game_sessions").update({ init_status: "ready" }).eq("id", sessionId);

    return new Response(JSON.stringify({
      ok: true,
      playersInitialized: playerCount,
      hexesGenerated: hexBatch.length,
      counters,
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
  const spawnRadius = Math.floor(mapRadius * 0.6);
  const positions: { q: number; r: number }[] = [];
  for (let i = 0; i < playerCount; i++) {
    const angle = (2 * Math.PI * i) / playerCount - Math.PI / 2;
    const x = Math.round(spawnRadius * Math.cos(angle));
    const y = Math.round(spawnRadius * Math.sin(angle));
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

function generateHexData(q: number, r: number, seed: number, _worldSeed: string) {
  const noise = pseudoRandom(seed, q, r);
  const distFromCenter = Math.sqrt(q * q + r * r + q * r);
  const maxDist = 17;
  const edgeFactor = distFromCenter / maxDist;
  let mean_height = noise * 0.7 + (1 - edgeFactor) * 0.3;
  if (edgeFactor > 0.85) mean_height *= 0.3;
  const latNorm = (r + maxDist) / (2 * maxDist);
  const temp_band = Math.round(latNorm * 4);
  const moistNoise = pseudoRandom(seed + 1, q, r);
  const moisture_band = Math.round(moistNoise * 4);
  const coastal = edgeFactor > 0.75 && edgeFactor < 0.88;
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
    plains: "plains", coast: "coast", mountains: "mountain",
    forest: "forest", desert: "desert", tundra: "tundra", volcanic: "highland",
  };
  return map[biome] || "grassland";
}
