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

    // ═══ 0) Server config + economic params ═══
    const defaultEconomic = {
      world_gen_mode: "cheap_start",
      auto_generate_city_profiles: false,
      auto_generate_top_city_profiles: true,
      top_profiles_count: 3,
      lazy_generate_on_open: true,
      dev_unlock_premium: true,
    };

    const { data: existingCfg } = await sb.from("server_config")
      .select("id, economic_params").eq("session_id", sessionId).maybeSingle();

    let economic = { ...defaultEconomic };
    if (existingCfg) {
      const stored = existingCfg.economic_params as Record<string, unknown> || {};
      economic = { ...defaultEconomic, ...stored };
      await sb.from("server_config").update({ economic_params: economic }).eq("id", existingCfg.id);
    } else {
      await sb.from("server_config").insert({ session_id: sessionId, economic_params: economic, admin_user_id: session.created_by });
    }

    const isCheapStart = economic.world_gen_mode === "cheap_start";
    const topProfilesCount = economic.top_profiles_count || 3;

    // 3. Generate world seed
    const worldSeed = crypto.randomUUID();
    await sb.from("game_sessions").update({ world_seed: worldSeed }).eq("id", sessionId);

    // Size config for multiplayer
    const config = {
      cities: Math.max(8, playerCount * 3),
      persons: Math.max(10, playerCount * 4),
      wonders: Math.max(4, playerCount + 2),
      preHistoryEvents: Math.max(10, playerCount * 3),
      battles: Math.max(10, playerCount * 4),
      rumors: Math.max(30, playerCount * 10),
      aiFactions: Math.max(2, playerCount),
    };

    // ═══ AI GENERATION ═══
    let world: any = null;
    const styleLabel = tone === "realistic" ? "politická kronika" : tone === "mythic" ? "epická sága" : "středověká kronika";

    if (LOVABLE_API_KEY) {
      const playerDescs = civConfigs.map((c: any) =>
        `${c.player_name} (${c.realm_name || "neznámá říše"}): ${c.civ_description || "neznámý národ"}, biom: ${c.homeland_biome}, sídlo: ${c.settlement_name}`
      ).join("\n");

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
7. Každý region musí mít alespoň 1 provincii s názvem a popisem.

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

DŮLEŽITÉ: Hráčské frakce MUSÍ mít isPlayer=true a playerName musí přesně odpovídat player_name hráče. Startovní města hráčů MUSÍ odpovídat jejich zadaným názvům sídel.`;

      // Tool schema
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
                    dispositionToPlayer: { type: "integer", description: "-100 to 100" },
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
                    isStartingCity: { type: "boolean" },
                    forPlayerName: { type: "string" },
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

      const MAX_RETRIES = 2;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          console.log(`[mp-world-generate] AI attempt ${attempt + 1}/${MAX_RETRIES + 1}...`);
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
              // Validate critical arrays exist
              const requiredArrays = ["persons", "wonders", "preHistoryEvents", "battles", "factions", "cities", "regions"];
              let allValid = true;
              for (const key of requiredArrays) {
                if (!world[key] || !Array.isArray(world[key]) || world[key].length === 0) {
                  console.warn(`[mp-world-generate] WARNING: AI returned empty/missing '${key}' array (${JSON.stringify(world[key]?.length ?? 'undefined')})`);
                  allValid = false;
                } else {
                  console.log(`[mp-world-generate] ✓ ${key}: ${world[key].length} items`);
                }
              }
              if (allValid || attempt === MAX_RETRIES) {
                if (!allValid) console.warn(`[mp-world-generate] Proceeding with partial data after ${MAX_RETRIES + 1} attempts`);
                break; // Success or last attempt
              } else {
                console.warn(`[mp-world-generate] Incomplete data, retrying...`);
                world = null; // Reset for retry
              }
            } else {
              console.warn(`[mp-world-generate] No tool call in response, attempt ${attempt + 1}`);
              if (attempt === MAX_RETRIES) break;
            }
          } else {
            const errText = await response.text();
            console.error(`[mp-world-generate] AI failed (attempt ${attempt + 1}):`, response.status, errText.substring(0, 500));
            if (attempt === MAX_RETRIES) break;
            // Wait before retry
            await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          }
        } catch (e) {
          console.warn(`[mp-world-generate] AI error (attempt ${attempt + 1}):`, e);
          if (attempt === MAX_RETRIES) break;
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        }
      }
    }

    // ═══════════════════════════════════════════════════════
    // DETERMINISTIC ENTITY CREATION (aligned with singleplayer)
    // ═══════════════════════════════════════════════════════

    const counters = { factions: 0, cities: 0, events: 0, regions: 0, provinces: 0, countries: 0, wiki: 0, rumors: 0, legendary: 0, persons: 0, wonders: 0, battles: 0, links: 0 };
    const factionPlayerMap: Record<string, string> = {};
    const cityIdMap: Record<string, string> = {};
    const personIdMap: Record<string, string> = {};
    const usedHexes = new Set<string>();

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
        image_prompt: countryInfo.image_prompt || `A medieval illuminated manuscript illustration of the kingdom of ${countryInfo.name}`,
        updated_at: new Date().toISOString(),
        references: { generated: true, mode: "mp_world_init" },
      } as any, { onConflict: "session_id,entity_type,entity_id" });
      counters.wiki++;
    }

    // ═══ STEP B: Civilizations + AI Factions + Resources ═══
    for (const cfg of civConfigs) {
      factionPlayerMap[cfg.realm_name || cfg.player_name] = cfg.player_name;
    }

    for (const faction of world?.factions || []) {
      let factionPlayerName: string;
      if (faction.isPlayer) {
        factionPlayerName = faction.playerName || faction.name;
        const matchedCfg = civConfigs.find((c: any) => c.player_name === factionPlayerName || c.realm_name === faction.name);
        if (matchedCfg) factionPlayerName = matchedCfg.player_name;
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
        const disposition: Record<string, number> = {};
        for (const cfg of civConfigs) {
          disposition[cfg.player_name] = faction.dispositionToPlayer || 0;
        }
        await sb.from("ai_factions").insert({
          session_id: sessionId, faction_name: faction.name, personality: faction.personality,
          disposition, goals: faction.goals || [], is_active: true,
        });
      }

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
        gold_reserve: 100, stability: 70, granary_capacity: 500, mobilization_rate: 0.1,
      });

      counters.factions++;
    }

    // Ensure all real players have factions even if AI missed them
    for (const cfg of civConfigs) {
      if (!Object.values(factionPlayerMap).includes(cfg.player_name)) {
        factionPlayerMap[cfg.realm_name || cfg.player_name] = cfg.player_name;
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
            gold_reserve: 100, stability: 70, granary_capacity: 500, mobilization_rate: 0.1,
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
          image_prompt: region.imagePrompt || `A medieval illuminated manuscript illustration of ${region.name}, ${region.biome} landscape`,
          updated_at: new Date().toISOString(),
          references: { generated: true, mode: "mp_world_init", biome: region.biome },
        } as any, { onConflict: "session_id,entity_type,entity_id" });
        counters.wiki++;
      }
      counters.regions++;
    }

    // ═══ STEP D: Provinces with hex layout (same as SP) ═══
    const provinceIdMap: Record<string, string> = {};
    const provinceRegionMap: Record<string, string> = {};
    const PROV_SPACING = 5;
    const provinceCenterOffsets: { q: number; r: number }[] = [
      { q: 0, r: 0 },
      { q: PROV_SPACING, r: 0 },
      { q: -PROV_SPACING, r: 0 },
      { q: Math.floor(PROV_SPACING / 2), r: PROV_SPACING },
      { q: -Math.floor(PROV_SPACING / 2), r: -PROV_SPACING },
      { q: Math.floor(PROV_SPACING / 2), r: -PROV_SPACING },
      { q: -Math.floor(PROV_SPACING / 2), r: PROV_SPACING },
      { q: PROV_SPACING * 2, r: 0 },
      { q: -PROV_SPACING * 2, r: 0 },
      { q: PROV_SPACING, r: PROV_SPACING },
      { q: -PROV_SPACING, r: -PROV_SPACING },
      { q: PROV_SPACING, r: -PROV_SPACING },
    ];

    function hexRing(cq: number, cr: number, radius: number): { q: number; r: number }[] {
      if (radius === 0) return [{ q: cq, r: cr }];
      const results: { q: number; r: number }[] = [];
      const dirs = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
      let q = cq + dirs[4][0] * radius;
      let r = cr + dirs[4][1] * radius;
      for (let d = 0; d < 6; d++) {
        for (let s = 0; s < radius; s++) {
          results.push({ q, r });
          q += dirs[d][0]; r += dirs[d][1];
        }
      }
      return results;
    }

    function province19Hexes(cq: number, cr: number): { q: number; r: number }[] {
      return [{ q: cq, r: cr }, ...hexRing(cq, cr, 1), ...hexRing(cq, cr, 2)];
    }

    let provColorIndex = 0;
    const allProvinceHexEntries: any[] = [];

    for (const region of world?.regions || []) {
      const regionId = regionIdMap[region.name];
      const ownerPlayer = factionPlayerMap[region.controlledBy] || civConfigs[0].player_name;
      const regionProvinces = region.provinces || [];
      if (regionProvinces.length === 0) {
        regionProvinces.push({ name: `${region.name} – Centrální`, description: `Hlavní provincie regionu ${region.name}.` });
      }

      for (const prov of regionProvinces) {
        const centerOffset = provinceCenterOffsets[provColorIndex] || { q: provColorIndex * PROV_SPACING, r: 0 };
        const isNeutral = !factionPlayerMap[region.controlledBy];

        const { data: provRow } = await sb.from("provinces").insert({
          session_id: sessionId, name: prov.name, description: prov.description || null,
          region_id: regionId || null, owner_player: ownerPlayer,
          center_q: centerOffset.q, center_r: centerOffset.r,
          color_index: provColorIndex, is_neutral: isNeutral,
        }).select("id").single();

        if (provRow) {
          provinceIdMap[prov.name] = provRow.id;
          provinceRegionMap[prov.name] = region.name;

          // Generate 19 hex entries for this province
          const hexes19 = province19Hexes(centerOffset.q, centerOffset.r);
          for (const h of hexes19) {
            allProvinceHexEntries.push({
              session_id: sessionId, q: h.q, r: h.r, province_id: provRow.id,
            });
          }

          await sb.from("wiki_entries").upsert({
            session_id: sessionId, entity_type: "province", entity_id: provRow.id,
            entity_name: prov.name, owner_player: ownerPlayer,
            summary: `${prov.name} — provincie v regionu ${region.name}.`,
            ai_description: prov.description || null,
            updated_at: new Date().toISOString(),
            references: { generated: true, mode: "mp_world_init", regionName: region.name },
          } as any, { onConflict: "session_id,entity_type,entity_id" });
          counters.wiki++;
        }
        provColorIndex++;
        counters.provinces++;
      }
    }

    // Helper: find province for city
    const findProvinceId = (city: any): string | null => {
      if (city.provinceName && provinceIdMap[city.provinceName]) return provinceIdMap[city.provinceName];
      if (city.regionName) {
        for (const [provName, regName] of Object.entries(provinceRegionMap)) {
          if (regName === city.regionName) return provinceIdMap[provName];
        }
      }
      return Object.values(provinceIdMap)[0] || null;
    };

    // Get province center coords
    const getProvinceCenter = (provId: string): { q: number; r: number } => {
      for (const entry of allProvinceHexEntries) {
        if (entry.province_id === provId) return { q: entry.q, r: entry.r };
      }
      return { q: 0, r: 0 };
    };

    // Place city within province bounds
    const provincePlacedHexes = new Map<string, Set<string>>();
    const placeCityInProvince = (provId: string): { q: number; r: number } => {
      const center = getProvinceCenter(provId);
      if (!provincePlacedHexes.has(provId)) provincePlacedHexes.set(provId, new Set());
      const placed = provincePlacedHexes.get(provId)!;
      const candidates = province19Hexes(center.q, center.r);
      for (const c of candidates) {
        const key = `${c.q},${c.r}`;
        if (!placed.has(key) && !usedHexes.has(key)) {
          placed.add(key);
          usedHexes.add(key);
          return c;
        }
      }
      return center;
    };

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

    const playerFirstCity = new Set<string>();
    const createdCityRows: any[] = [];
    let cityIndex = 0;

    for (const city of world?.cities || []) {
      const ownerFactionName = city.ownerFaction;
      const ownerPlayer = factionPlayerMap[ownerFactionName] || civConfigs[0].player_name;
      const isStartingCity = city.isStartingCity && city.forPlayerName;
      const cfgForPlayer = isStartingCity ? playerConfigMap[city.forPlayerName] : null;

      const provinceId = findProvinceId(city);
      let coords: { q: number; r: number };
      if (provinceId) {
        coords = placeCityInProvince(provinceId);
      } else {
        coords = { q: cityIndex * 3, r: 0 };
        usedHexes.add(`${coords.q},${coords.r}`);
      }

      const cityName = cfgForPlayer ? (cfgForPlayer.settlement_name || city.name) : city.name;
      const level = city.level || "Osada";
      const isCapital = !playerFirstCity.has(ownerPlayer);
      if (isCapital) playerFirstCity.add(ownerPlayer);

      const range = POP_RANGES[level] || POP_RANGES.Osada;
      const popTotal = isCapital ? range.max + Math.floor(Math.random() * 200) : range.min + Math.floor(Math.random() * (range.max - range.min));
      const settlementLevel = SETTLEMENT_MAP[level] || "HAMLET";
      const template = POP_TEMPLATES[settlementLevel];
      const popPeasants = Math.round(popTotal * template.peasants);
      const popBurghers = Math.round(popTotal * template.burghers);
      const popClerics = popTotal - popPeasants - popBurghers;

      const { data: cityRow } = await sb.from("cities").insert({
        session_id: sessionId, name: cityName, owner_player: ownerPlayer, level,
        tags: city.tags || [], province: city.provinceName || city.regionName || null,
        province_id: provinceId, city_description_cached: city.description || null,
        flavor_prompt: city.description || null, founded_round: 1,
        province_q: Math.round(coords.q), province_r: Math.round(coords.r),
        city_stability: 60 + Math.floor(Math.random() * 15),
        population_total: popTotal, population_peasants: popPeasants,
        population_burghers: popBurghers, population_clerics: popClerics,
        settlement_level: settlementLevel,
      }).select("id").single();

      if (cityRow) {
        cityIdMap[cityName] = cityRow.id;
        if (cityName !== city.name) cityIdMap[city.name] = cityRow.id;

        createdCityRows.push({
          id: cityRow.id, name: cityName, ownerPlayer, description: city.description,
          regionName: city.regionName, provinceName: city.provinceName,
          level, q: coords.q, r: coords.r, isPlayer: !!cfgForPlayer,
        });

        await sb.from("wiki_entries").upsert({
          session_id: sessionId, entity_type: "city", entity_id: cityRow.id,
          entity_name: cityName, owner_player: ownerPlayer,
          summary: `${cityName} je ${level.toLowerCase()} v regionu ${city.regionName || worldName}, pod správou ${ownerPlayer}.`,
          ai_description: city.description || null, image_prompt: city.imagePrompt || null,
          updated_at: new Date().toISOString(),
          references: { generated: true, mode: "mp_world_init" },
        } as any, { onConflict: "session_id,entity_type,entity_id" });
        counters.wiki++;

        await sb.from("game_events").insert({
          session_id: sessionId, event_type: "founding", player: ownerPlayer,
          note: `${ownerPlayer} založil osadu ${cityName}.`, turn_number: 1,
          confirmed: true, importance: "high", city_id: cityRow.id,
        });

        await sb.from("discoveries").upsert([
          { session_id: sessionId, player_name: ownerPlayer, entity_type: "city", entity_id: cityRow.id, source: "founded" },
        ], { onConflict: "session_id,player_name,entity_type,entity_id" });

        counters.cities++;
      }
      cityIndex++;
    }

    // Ensure all players have starting cities
    for (const cfg of civConfigs) {
      if (!playerFirstCity.has(cfg.player_name)) {
        // Find a province for this player
        let provId: string | null = null;
        for (const [provName, regName] of Object.entries(provinceRegionMap)) {
          const region = (world?.regions || []).find((r: any) => r.name === regName);
          if (region && factionPlayerMap[region.controlledBy] === cfg.player_name) {
            provId = provinceIdMap[provName];
            break;
          }
        }
        const coords = provId ? placeCityInProvince(provId) : { q: cityIndex * 3, r: 0 };

        const { data: cityRow } = await sb.from("cities").insert({
          session_id: sessionId, name: cfg.settlement_name || `Město ${cfg.player_name}`,
          owner_player: cfg.player_name, level: "Osada", settlement_level: "HAMLET",
          founded_round: 1, province_q: coords.q, province_r: coords.r, province_id: provId,
          population_total: 1000, population_peasants: 800, population_burghers: 150, population_clerics: 50,
          flavor_prompt: cfg.civ_description || null,
        }).select("id").single();
        if (cityRow) {
          cityIdMap[cfg.settlement_name || `Město ${cfg.player_name}`] = cityRow.id;
          createdCityRows.push({
            id: cityRow.id, name: cfg.settlement_name, ownerPlayer: cfg.player_name,
            q: coords.q, r: coords.r, isPlayer: true,
          });
          await sb.from("discoveries").upsert([
            { session_id: sessionId, player_name: cfg.player_name, entity_type: "city", entity_id: cityRow.id, source: "founded" },
          ], { onConflict: "session_id,player_name,entity_type,entity_id" });
          await sb.from("game_events").insert({
            session_id: sessionId, event_type: "founding", player: cfg.player_name,
            note: `${cfg.player_name} založil osadu ${cfg.settlement_name}.`, turn_number: 1,
            confirmed: true, importance: "high", city_id: cityRow.id,
          });
        }
        playerFirstCity.add(cfg.player_name);
        cityIndex++;
      }
    }

    // Ensure all AI factions also have at least one starting city
    for (const faction of world?.factions || []) {
      if (faction.isPlayer) continue; // players handled above
      const factionPlayer = factionPlayerMap[faction.name] || faction.name;
      if (playerFirstCity.has(factionPlayer)) continue; // already has a city

      // Find a province for this AI faction
      let provId: string | null = null;
      for (const [provName, regName] of Object.entries(provinceRegionMap)) {
        const region = (world?.regions || []).find((r: any) => r.name === regName);
        if (region && factionPlayerMap[region.controlledBy] === factionPlayer) {
          provId = provinceIdMap[provName];
          break;
        }
      }
      const coords = provId ? placeCityInProvince(provId) : { q: cityIndex * 3, r: 0 };

      const aiFactionCityName = `Sídlo ${faction.name}`;
      const { data: cityRow } = await sb.from("cities").insert({
        session_id: sessionId, name: aiFactionCityName,
        owner_player: factionPlayer, level: "Osada", settlement_level: "HAMLET",
        founded_round: 1, province_q: Math.round(coords.q), province_r: Math.round(coords.r), province_id: provId,
        population_total: 800, population_peasants: 640, population_burghers: 120, population_clerics: 40,
        city_stability: 65, flavor_prompt: `Hlavní sídlo AI frakce ${faction.name}.`,
      }).select("id").single();

      if (cityRow) {
        cityIdMap[aiFactionCityName] = cityRow.id;
        createdCityRows.push({
          id: cityRow.id, name: aiFactionCityName, ownerPlayer: factionPlayer,
          q: coords.q, r: coords.r, isPlayer: false,
        });
        await sb.from("discoveries").upsert([
          { session_id: sessionId, player_name: factionPlayer, entity_type: "city", entity_id: cityRow.id, source: "founded" },
        ], { onConflict: "session_id,player_name,entity_type,entity_id" });
        await sb.from("game_events").insert({
          session_id: sessionId, event_type: "founding", player: factionPlayer,
          note: `AI frakce ${faction.name} založila osadu ${aiFactionCityName}.`, turn_number: 1,
          confirmed: true, importance: "medium", city_id: cityRow.id,
        });
        counters.cities++;
      }
      playerFirstCity.add(factionPlayer);
      cityIndex++;
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
          ai_description: `${battle.description}\n\n**Útočník:** ${battle.attackerCommander} (${battle.attackerFaction})\n**Obránce:** ${battle.defenderCommander} (${battle.defenderFaction})\n**Výsledek:** ${battle.outcome}\n**Ztráty:** ${battle.casualties || "neznámé"}`,
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

    // ═══ STEP K: Pre-history chronicle + founding chronicle + CHRONICLE ZERO ═══
    if (world?.preHistoryChronicle) {
      await sb.from("chronicle_entries").insert({
        session_id: sessionId, text: world.preHistoryChronicle,
        epoch_style: "kroniky", turn_from: 0, turn_to: 0, source_type: "system",
      });
    }

    const legendaryNames = (world?.preHistoryEvents || []).map((e: any) => e.title).slice(0, 5).join(", ");
    await sb.from("chronicle_entries").insert({
      session_id: sessionId,
      text: `Věk zakládání – V prvním roce letopočtu byly založeny základy civilizací ve státě ${countryInfo.name}. ${counters.cities} měst, ${counters.persons} osobností, ${counters.wonders} divů světa. ${legendaryNames ? `Legendy praví o: ${legendaryNames}.` : ""} ${premise}`,
      epoch_style: "kroniky", turn_from: 1, turn_to: 1, source_type: "founding",
    });

    // Chronicle Zero — Epic prolog (2nd AI call)
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

    // World feed items
    await sb.from("world_feed_items").insert({
      session_id: sessionId, turn_number: 1,
      content: `Věk zakládání začíná. V zemi ${countryInfo.name} vznikají nové říše.`,
      feed_type: "gossip", importance: "high",
    } as any);

    for (const evt of (world?.preHistoryEvents || []).slice(0, 5)) {
      await sb.from("world_feed_items").insert({
        session_id: sessionId, turn_number: 0,
        content: `Z dávných legend: ${evt.title}`,
        feed_type: "gossip", importance: "high",
      } as any);
    }

    for (const city of createdCityRows.slice(0, 5)) {
      await sb.from("world_feed_items").insert({
        session_id: sessionId, turn_number: 1,
        content: `Město ${city.name} bylo založeno v regionu ${city.regionName || worldName}.`,
        feed_type: "gossip", importance: "normal",
      } as any);
    }

    // Diplomacy rooms between all players + AI greetings
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

    for (const faction of world?.factions || []) {
      if (faction.isPlayer) continue;
      const factionPlayerName = factionPlayerMap[faction.name] || faction.name;
      for (const pName of playerNames) {
        try {
          await sb.from("diplomacy_rooms").insert({
            session_id: sessionId, room_type: "player_ai",
            participant_a: pName, participant_b: factionPlayerName,
          });

          // AI greeting message
          const { data: roomData } = await sb.from("diplomacy_rooms")
            .select("id").eq("session_id", sessionId)
            .eq("participant_a", pName).eq("participant_b", factionPlayerName).single();

          if (roomData) {
            const disposition = faction.dispositionToPlayer || 0;
            const greeting = disposition > 30
              ? `Zdravíme vás, vládce. Doufáme v plodnou spolupráci.`
              : disposition < -30
              ? `Bereme na vědomí vaši existenci. Nečekejte přátelství.`
              : `Pozdravujeme. Frakce ${faction.name} je připravena jednat.`;

            await sb.from("diplomacy_messages").insert({
              room_id: roomData.id, sender: factionPlayerName,
              sender_type: "ai", message_text: greeting, secrecy: "PRIVATE",
            });
          }
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
        player_count: playerCount, country_name: countryInfo.name,
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

    // Simulation log
    await sb.from("simulation_log").insert({
      session_id: sessionId, year_start: 1, year_end: 1,
      events_generated: counters.events, scope: "mp_world_init",
      triggered_by: "mp-world-generate",
    });

    // ═══ STEP N: Generate hexes for ALL province territories + discoveries ═══
    try {
      const allHexPositions = new Set<string>();
      for (const entry of allProvinceHexEntries) {
        allHexPositions.add(`${entry.q},${entry.r}`);
      }

      const hexPositionArray = Array.from(allHexPositions).map(k => {
        const [q, r] = k.split(",").map(Number);
        return { q, r };
      });

      // Generate hexes in batches via generate-hex function
      const HEX_BATCH = 10;
      const allGeneratedHexIds: { id: string; q: number; r: number }[] = [];
      for (let i = 0; i < hexPositionArray.length; i += HEX_BATCH) {
        const batch = hexPositionArray.slice(i, i + HEX_BATCH);
        const hexResults = await Promise.all(batch.map(({ q, r }) =>
          fetch(`${supabaseUrl}/functions/v1/generate-hex`, {
            method: "POST",
            headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: sessionId, q, r }),
          }).then(res => res.ok ? res.json() : null).catch(() => null)
        ));
        for (const hex of hexResults) {
          if (hex?.id) allGeneratedHexIds.push({ id: hex.id, q: hex.q, r: hex.r });
        }
      }

      // Link generated hexes to their provinces
      for (const hex of allGeneratedHexIds) {
        const provEntry = allProvinceHexEntries.find(
          (e: any) => e.q === hex.q && e.r === hex.r
        );
        if (provEntry) {
          await sb.from("province_hexes")
            .update({ province_id: provEntry.province_id })
            .eq("id", hex.id);
        }
      }

      // Create discoveries for ALL players for ALL province hexes
      const allPlayerNames = [...new Set(Object.values(factionPlayerMap))];
      const discoveryRows: any[] = [];
      for (const hex of allGeneratedHexIds) {
        for (const pn of allPlayerNames) {
          discoveryRows.push({
            session_id: sessionId, player_name: pn,
            entity_type: "province_hex", entity_id: hex.id, source: "world_init",
          });
        }
      }
      if (discoveryRows.length > 0) {
        for (let i = 0; i < discoveryRows.length; i += 100) {
          await sb.from("discoveries").upsert(
            discoveryRows.slice(i, i + 100),
            { onConflict: "session_id,player_name,entity_type,entity_id" }
          );
        }
      }

      console.log(`Generated ${allGeneratedHexIds.length} hexes, ${discoveryRows.length} discoveries`);
    } catch (hexErr) {
      console.warn("Hex generation warning:", hexErr);
    }

    // ═══ STEP O: Wiki profiles + entity images (best effort) ═══
    let wikiGenerated = 0;
    try {
      let citiesToGenerate: any[] = [];
      if (isCheapStart) {
        citiesToGenerate = createdCityRows.slice(0, topProfilesCount);
      } else {
        citiesToGenerate = [...createdCityRows];
      }

      const WIKI_BATCH = 3;
      for (let i = 0; i < citiesToGenerate.length; i += WIKI_BATCH) {
        const batch = citiesToGenerate.slice(i, i + WIKI_BATCH);
        const results = await Promise.allSettled(
          batch.map(city =>
            fetch(`${supabaseUrl}/functions/v1/wiki-generate`, {
              method: "POST",
              headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                entityType: "city", entityName: city.name, entityId: city.id,
                sessionId, ownerPlayer: city.ownerPlayer,
                context: { regionName: city.regionName, description: city.description, worldName, premise, tone },
              }),
            }).then(async (res) => { if (!res.ok) throw new Error(`wiki-generate ${res.status}`); return res.json(); })
          )
        );
        for (const r of results) { if (r.status === "fulfilled") wikiGenerated++; }
      }

      // Region images
      const regionEntries = Object.entries(regionIdMap);
      for (let i = 0; i < regionEntries.length; i += WIKI_BATCH) {
        const batch = regionEntries.slice(i, i + WIKI_BATCH);
        await Promise.allSettled(
          batch.map(([regionName, regionId]) => {
            const region = (world?.regions || []).find((r: any) => r.name === regionName);
            return fetch(`${supabaseUrl}/functions/v1/generate-entity-media`, {
              method: "POST",
              headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId, entityId: regionId, entityType: "region", entityName: regionName,
                kind: "cover",
                imagePrompt: region?.imagePrompt || `A medieval illuminated manuscript illustration of ${regionName}`,
                createdBy: "mp-world-generate",
              }),
            }).then(async (res) => {
              if (res.ok) {
                const d = await res.json();
                if (d.imageUrl) await sb.from("wiki_entries").update({ image_url: d.imageUrl } as any)
                  .eq("session_id", sessionId).eq("entity_type", "region").eq("entity_id", regionId);
              }
            }).catch(err => console.warn("Region image failed:", regionName, err));
          })
        );
      }

      // Person & wonder images
      const imageTargets: { entityId: string; entityType: string; entityName: string; imagePrompt: string; kind: string }[] = [];
      for (const p of world?.persons || []) {
        const pId = personIdMap[p.name];
        if (pId && p.imagePrompt) imageTargets.push({ entityId: pId, entityType: "person", entityName: p.name, imagePrompt: p.imagePrompt, kind: "portrait" });
      }
      for (const w of world?.wonders || []) {
        const { data: wd } = await sb.from("wonders").select("id").eq("session_id", sessionId).eq("name", w.name).maybeSingle();
        if (wd && w.imagePrompt) imageTargets.push({ entityId: wd.id, entityType: "wonder", entityName: w.name, imagePrompt: w.imagePrompt, kind: "cover" });
      }

      for (let i = 0; i < imageTargets.length; i += 4) {
        const batch = imageTargets.slice(i, i + 4);
        await Promise.allSettled(batch.map(t =>
          fetch(`${supabaseUrl}/functions/v1/generate-entity-media`, {
            method: "POST",
            headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId, entityId: t.entityId, entityType: t.entityType, entityName: t.entityName,
              kind: t.kind, imagePrompt: t.imagePrompt, createdBy: "mp-world-generate",
            }),
          }).catch(e => console.warn(`Image gen failed: ${t.entityName}`, e))
        ));
      }
    } catch (mediaErr) {
      console.warn("Wiki/media generation warning:", mediaErr);
    }

    // Action log
    await sb.from("world_action_log").insert({
      session_id: sessionId, player_name: "system", turn_number: 1, action_type: "other",
      description: `MP svět s hlubokou prehistorií: ${counters.countries} stát, ${counters.factions} frakcí, ${counters.cities} měst, ${counters.regions} regionů, ${counters.provinces} provincií, ${counters.persons} osobností, ${counters.wonders} divů, ${counters.legendary} prehistorických událostí, ${counters.battles} bitev, ${counters.events} událostí, ${counters.links} propojení, ${counters.wiki} wiki, ${wikiGenerated} AI profilů, ${counters.rumors} pověstí.`,
    });

    // ═══ Extract structured civ identity for all players (fire & forget) ═══
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    for (const cfg of civConfigs) {
      const { data: civ } = await sb.from("civilizations")
        .select("core_myth, cultural_quirk, architectural_style")
        .eq("session_id", sessionId).eq("player_name", cfg.player_name).maybeSingle();

      fetch(`${SUPABASE_URL}/functions/v1/extract-civ-identity`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          sessionId,
          playerName: cfg.player_name,
          civDescription: cfg.civ_description || "",
          coreMythText: civ?.core_myth || null,
          culturalQuirkText: civ?.cultural_quirk || null,
          architecturalStyleText: civ?.architectural_style || null,
        }),
      }).catch(e => console.warn("civ identity extraction failed for", cfg.player_name, e));
    }

    // Log final counters for debugging
    console.log(`[mp-world-generate] COMPLETE for ${sessionId}:`, JSON.stringify(counters));

    // Auto-backfill if persons/wonders/events are missing but chronicle exists
    if (counters.persons === 0 && counters.wonders === 0 && counters.legendary === 0) {
      console.warn(`[mp-world-generate] WARNING: No prehistory entities created! Triggering auto-backfill...`);
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      fetch(`${SUPABASE_URL}/functions/v1/backfill-prehistory`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ sessionId }),
      }).catch(e => console.warn("Auto-backfill trigger failed:", e));
    }

    // Mark session as ready
    await sb.from("game_sessions").update({ init_status: "ready", current_turn: 1 }).eq("id", sessionId);

    return new Response(JSON.stringify({
      ok: true,
      playersInitialized: playerCount,
      counters,
      wikiProfilesGenerated: wikiGenerated,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("mp-world-generate error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
