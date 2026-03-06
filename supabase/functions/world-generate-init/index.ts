import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { computeStructuralBonuses } from "../_shared/physics.ts";

/** Lightweight alias for world-generate-init usage */
function computeStructuralBonusesInline(identity: any) {
  return computeStructuralBonuses(identity);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, playerName, worldName, premise, tone, victoryStyle, worldSize, tier, settlementName, cultureName, languageName, realmName, factionConfigs, terrainParams: userTerrainParams, mapWidth: userMapWidth, mapHeight: userMapHeight } = await req.json();

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
    const sizeConfig: Record<string, { factions: number; cities: number; regions: number; persons: number; wonders: number; preHistoryEvents: number; battles: number; rumors: number; mapW: number; mapH: number }> = {
      small:  { factions: 3, cities: 5,  regions: 2, persons: 7,  wonders: 4, preHistoryEvents: 10, battles: 12, rumors: 30, mapW: 21, mapH: 21 },
      medium: { factions: 5, cities: 12, regions: 4, persons: 10, wonders: 5, preHistoryEvents: 12, battles: 15, rumors: 40, mapW: 31, mapH: 31 },
      large:  { factions: 7, cities: 20, regions: 6, persons: 15, wonders: 7, preHistoryEvents: 15, battles: 20, rumors: 50, mapW: 41, mapH: 41 },
    };
    const config = sizeConfig[worldSize] || sizeConfig.small;

    // ═══════════════════════════════════════════════
    // AI PROMPT — Rich interconnected world with deep prehistory
    // ═══════════════════════════════════════════════
    const styleLabel = tone === "realistic" ? "politická kronika" : tone === "mythic" ? "epická sága" : "středověká kronika";

    const systemPrompt = `Jsi generátor světa pro civilizační strategickou hru. Tvým úkolem je vytvořit kompletní, tematicky koherentní svět S HLUBOKOU PREHISTORIÍ.

HLAVNÍ PRAVIDLA:
- Vše generuj v ČEŠTINĚ. Jména mohou být fantasy/historická.
- Každá frakce má VLASTNÍ stát (country), region a provincii — jsou to nezávislé entity.
- Regiony musí tematicky korespondovat s danou frakcí a její kulturou.
- Města pod regiony musí tematicky odpovídat danému kraji.
- VŠECHNA města začínají jako OSADY (hamlet) — žádné velké město na startu!
- Styl vyprávění: ${styleLabel}.

KRITICKÉ POŽADAVKY NA PROVÁZANOST:
1. Svět musí mít BOHATOU PREHISTORII — legendy, mýty, proroctví, dávné bitvy, zakladatele.
2. Všechny entity MUSÍ být VZÁJEMNĚ PROPOJENÉ:
   - Každá bitva MUSÍ odkazovat na konkrétního velitele z persons (attacker_commander, defender_commander).
   - Každý generál/vojevůdce z persons MUSÍ být zmíněn alespoň v jedné bitvě.
   - Prehistorické události MUSÍ odkazovat na osobnosti (related_person_names) a místa (location).
   - Zvěsti MUSÍ odkazovat na reálná města a prehistorické legendy.
   - Divy světa MUSÍ být spjaty s konkrétním městem a osobností (kdo je postavil/zničil).
3. Osobnosti MUSÍ zahrnovat:
   - LEGENDÁRNÍ POSTAVY z prehistorie (záporné roky narození) — praotce, proroky, dávné válečníky, mytické zakladatele.
   - SOUČASNÉ postavy — generály, kupce, kněze, špiony.
   - Každá osoba MUSÍ mít detailní bio propojené s konkrétními událostmi a místy.
4. Pre-history events tvoří KOHERENTNÍ MYTOLOGII — na sebe navazují, vysvětlují rivalit a tradice.
5. Divy: některé mohou být zničené (status=destroyed) s příběhem o jejich zániku.
6. Lore Bible musí shrnout celou mytologii světa.
7. pre_history_chronicle: 500-800 slov v kronikářském stylu, shrnující VŠECHNY prehistorické události, osoby a bitvy.

GEOGRAPHY BLUEPRINT — KLÍČOVÉ:
8. MUSÍŠ vygenerovat GEOGRAPHY — kompletní fyzický popis světa jako strukturovaná data.
   - Mapa má rozměr ${config.mapW}x${config.mapH} hexů, střed je (0,0). Souřadnice jsou od -${Math.floor(config.mapW/2)} do +${Math.floor(config.mapW/2)}.
   - Pohoří: definuj hřbety (ridges) jako linie se souřadnicemi start→konec. Pohoří tvoří přírodní bariéry mezi frakcemi.
   - Řeky: definuj hlavní řeky od pramene k ústí (sourceQ/R → mouthQ/R). Řeky jsou NEPROSTUPNÉ bariéry.
   - Biomové zóny: definuj klimatické oblasti kolem sídel frakcí (les, poušť, tundra...). Musí odpovídat popisu regionu.
   - Každý geografický prvek MUSÍ mít JMÉNO v češtině a musí korespondovat s narativem (lore, bitvami, ságami).
   - Příklad: pokud píšeš o "Bitvě u Veleříčky", musí existovat řeka "Veleříčka" v geography.
   - Continent shape: pangaea/archipelago/two_continents/crescent — vyber co odpovídá narativu.

LOGICKÁ POSLOUPNOST:
- Roky prehistorie jsou záporné (-100 až -1), "před počátkem paměti".
- Rok 0 = přelom, počátek letopočtu.
- Rok 1 = aktuální tah, kdy hra začíná.
- Všechny entity v roce 1 musí dávat logickou posloupnost z prehistorie.

Odpověz POUZE voláním funkce generate_world.`;

    // Build faction config instructions for the prompt
    const factionCount = factionConfigs?.length || config.factions;
    let factionInstructions = "";
    if (factionConfigs && factionConfigs.length > 0) {
      factionInstructions = "\nKONFIGURACE AI FRAKCÍ (hráčem zadaná — MUSÍŠ respektovat):\n";
      factionConfigs.forEach((fc: any, idx: number) => {
        const parts = [`Frakce ${idx + 1}:`];
        if (fc.name) parts.push(`Název: "${fc.name}"`);
        if (fc.personality) parts.push(`Osobnost: ${fc.personality}`);
        if (fc.focus) parts.push(`Zaměření: ${fc.focus}`);
        if (fc.description) parts.push(`Popis: ${fc.description}`);
        factionInstructions += parts.join(" | ") + "\n";
      });
      factionInstructions += "Pokud hráč nezadal název, vymysli vhodný. Osobnost a zaměření MUSÍ odpovídat zadání.\n";
    }

    const userPrompt = `SVĚT: ${worldName}
PREMISA: ${premise}
TÓN: ${tone}
STYL VÍTĚZSTVÍ: ${victoryStyle}
HRÁČ: ${playerName}
${realmName ? `ŘÍŠE HRÁČE: ${realmName}` : ""}
${cultureName ? `KULTURA: ${cultureName}` : ""}
${languageName ? `JAZYK: ${languageName}` : ""}
${factionInstructions}
POŽADAVKY:
- Každá frakce (${factionCount + 1} celkem) má VLASTNÍ stát (country) se jménem, popisem a image_prompt
- ${factionCount} AI frakcí (+ 1 hráčova frakce = ${factionCount + 1} celkem)
- ${config.regions} regionů tematicky propojených se státem, každý s alespoň 1 provincií
- ${config.cities} měst rozdělených mezi frakce
- ${config.persons} osobností: minimálně polovina LEGENDÁRNÍCH z prehistorie (born_year záporný), zbytek současných. Každý s detailním bio, image_prompt, a vazbou na místo/událost.
- ${config.wonders} divů světa: minimálně 2 zničené (destroyed) s příběhem zániku. Každý vázán na město a osobnost.
- ${config.preHistoryEvents} prehistorických událostí (roky -100 až -1): mýty, legendy, založení, proroctví, bitvy, katastrofy. Každá s legacy_impact a vazbami na osoby.
- ${config.battles} bitev: minimálně 5 LEGENDÁRNÍCH (záporné roky) + zbytek v roce 0-1. KAŽDÁ s veliteli z persons.
- pre_history_chronicle: "Před počátkem paměti" (500-800 slov), středověký kronikářský styl.
- ${config.rumors} zvěstí: minimálně třetina o prehistorii, zbytek o současnosti. Všechny navázané na konkrétní města.
- lore_bible: 200-400 slov shrnutí celé mytologie světa.
- 5-10 history events pro rok 1 (současný stav světa).
- GEOGRAPHY BLUEPRINT: Mapa ${config.mapW}x${config.mapH} hexů (střed 0,0). Definuj:
  * ridges: 2-5 pohoří jako linie (x1,y1 → x2,y2)
  * rivers: 2-4 hlavní řeky (pramen → ústí v hex souřadnicích)
  * biomeZones: 1 zóna za každý region (biom + centrum + poloměr)
  * continentShape: tvar pevniny
  * climateGradient: rozložení klimatu

DŮLEŽITÉ: affected_players/faction MUSÍ používat přesná jména frakcí. Bitvy MUSÍ mít commanders z persons. Geografie MUSÍ odpovídat narativu.`;

    // ═══════════════════════════════════════════════
    // TOOL SCHEMA — expanded with persons, wonders, battles, prehistory
    // ═══════════════════════════════════════════════
    const toolSchema = {
      type: "function",
      function: {
        name: "generate_world",
        description: "Generate a complete game world with deep interconnected prehistory.",
        parameters: {
          type: "object",
          properties: {
            countries: {
              type: "array",
              description: "One country per faction. Each faction has its own sovereign state.",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string", description: "4-6 sentence encyclopedia article in Czech" },
                  motto: { type: "string" },
                  factionName: { type: "string", description: "Which faction this country belongs to" },
                  image_prompt: { type: "string", description: "English prompt for medieval illuminated illustration" },
                },
                required: ["name", "description", "factionName", "image_prompt"],
                additionalProperties: false,
              },
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
                  dispositionToPlayer: { type: "integer", description: "-100 to 100" },
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
                  description: { type: "string", description: "4-6 sentence encyclopedia article in Czech" },
                  controlledBy: { type: "string" },
                  isPlayerHomeland: { type: "boolean" },
                  imagePrompt: { type: "string" },
                  provinces: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        description: { type: "string" },
                      },
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
                  level: { type: "string", enum: ["Osada"], description: "All starting cities MUST be Osada (hamlet)" },
                  tags: { type: "array", items: { type: "string" } },
                  description: { type: "string" },
                  imagePrompt: { type: "string" },
                },
                required: ["name", "ownerFaction", "regionName", "provinceName", "level", "description", "imagePrompt"],
                additionalProperties: false,
              },
            },
            persons: {
              type: "array",
              description: "Notable persons: leaders, generals, merchants, priests, prophets, founders. At least half must be legendary pre-history figures (born_year < 0).",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  personType: { type: "string", enum: ["Generál", "Kupec", "Kněz", "Prorok", "Zakladatel", "Špión", "Válečník", "Učenec", "Vládce"] },
                  ownerFaction: { type: "string", description: "Faction name" },
                  bornYear: { type: "integer", description: "Negative for pre-history figures" },
                  diedYear: { type: "integer", description: "Null if alive. Use negative for pre-history deaths." },
                  bio: { type: "string", description: "Detailed 3-5 sentence biography referencing specific events, battles, and places" },
                  flavorTrait: { type: "string" },
                  homeCityName: { type: "string" },
                  imagePrompt: { type: "string", description: "English prompt for medieval illuminated portrait" },
                  exceptionalPrompt: { type: "string", description: "What makes this person exceptional (1 sentence)" },
                },
                required: ["name", "personType", "ownerFaction", "bornYear", "bio", "imagePrompt", "homeCityName"],
                additionalProperties: false,
              },
            },
            wonders: {
              type: "array",
              description: "World wonders. At least 2 should be destroyed with a story of their demise.",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  cityName: { type: "string", description: "City where this wonder is/was located" },
                  ownerFaction: { type: "string" },
                  description: { type: "string", description: "3-5 sentence description of the wonder" },
                  bonus: { type: "string", description: "Game effect" },
                  status: { type: "string", enum: ["completed", "destroyed"], description: "destroyed = ancient ruin" },
                  destroyedStory: { type: "string", description: "How it was destroyed (only for destroyed wonders)" },
                  builderPersonName: { type: "string", description: "Person who built/commissioned this wonder" },
                  imagePrompt: { type: "string" },
                  memoryFact: { type: "string", description: "World memory fact about this wonder" },
                },
                required: ["name", "cityName", "ownerFaction", "description", "status", "imagePrompt", "memoryFact"],
                additionalProperties: false,
              },
            },
            preHistoryEvents: {
              type: "array",
              description: "Legendary events from BEFORE recorded history (years -100 to -1). Must form coherent mythology.",
              items: {
                type: "object",
                properties: {
                  year: { type: "integer", description: "Negative year" },
                  title: { type: "string" },
                  description: { type: "string", description: "3-5 sentences" },
                  eventType: { type: "string", enum: ["founding", "battle", "prophecy", "cataclysm", "migration", "divine", "betrayal", "alliance", "discovery", "war", "coronation"] },
                  location: { type: "string", description: "City name" },
                  involvedFactions: { type: "array", items: { type: "string" } },
                  relatedPersonNames: { type: "array", items: { type: "string" }, description: "Person names from persons array involved in this event" },
                  imagePrompt: { type: "string" },
                  legacyImpact: { type: "string", description: "How this event still affects the world in year 1 (1-2 sentences)" },
                },
                required: ["year", "title", "description", "eventType", "location", "involvedFactions", "legacyImpact", "imagePrompt"],
                additionalProperties: false,
              },
            },
            battles: {
              type: "array",
              description: "Battles: at least 5 legendary (negative years) + rest around year 0-1. ALL must reference commanders from persons array.",
              items: {
                type: "object",
                properties: {
                  year: { type: "integer" },
                  name: { type: "string" },
                  locationName: { type: "string", description: "City name where battle took place" },
                  attackerCommander: { type: "string", description: "Person name from persons array" },
                  defenderCommander: { type: "string", description: "Person name from persons array" },
                  attackerFaction: { type: "string" },
                  defenderFaction: { type: "string" },
                  outcome: { type: "string" },
                  casualties: { type: "string" },
                  description: { type: "string", description: "3-5 sentences describing the battle" },
                },
                required: ["year", "name", "locationName", "attackerCommander", "defenderCommander", "attackerFaction", "defenderFaction", "outcome", "description"],
                additionalProperties: false,
              },
            },
            historyEvents: {
              type: "array",
              description: "5-10 events for year 1 (current world state), logically following from prehistory",
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
            preHistoryChronicle: {
              type: "string",
              description: "500-800 word Czech chronicle entry: 'Před počátkem paměti'. Medieval chronicler style, referencing ALL pre-history events, key persons, battles, and wonders. Must read as coherent mythological history.",
            },
            rumors: {
              type: "array",
              description: "Court whispers & field reports. At least 1/3 must reference pre-history legends. All must reference real city names.",
              items: {
                type: "object",
                properties: {
                  text: { type: "string", description: "1-3 sentences, Czech" },
                  toneTag: { type: "string", enum: ["neutral", "warning", "intrigue", "celebration", "alarming", "mysterious"] },
                  relatedCityName: { type: "string" },
                  turnNumber: { type: "integer", description: "0 for pre-history rumors, 1 for current" },
                },
                required: ["text", "toneTag", "relatedCityName", "turnNumber"],
                additionalProperties: false,
              },
            },
            loreBible: {
              type: "string",
              description: "200-400 word summary of the world's core lore, mythology, and themes. Reference for all future AI generation.",
            },
            worldMemories: {
              type: "array",
              items: { type: "string" },
              description: "Key world facts and traditions",
            },
            geography: {
              type: "object",
              description: "Physical geography blueprint for procedural map generation. Coordinates are hex axial coords, map center = (0,0).",
              properties: {
                ridges: {
                  type: "array",
                  description: "Mountain ridges as line segments. 2-5 ridges that form natural barriers.",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Czech name of the mountain range" },
                      x1: { type: "number" }, y1: { type: "number" },
                      x2: { type: "number" }, y2: { type: "number" },
                      width: { type: "number", description: "Width in hexes (2-5)" },
                      strength: { type: "number", description: "0.5-0.9" },
                    },
                    required: ["name", "x1", "y1", "x2", "y2"],
                    additionalProperties: false,
                  },
                },
                rivers: {
                  type: "array",
                  description: "Major rivers from source (mountains/hills) to mouth (sea/lake). 2-4 rivers.",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Czech name of the river" },
                      sourceQ: { type: "integer" }, sourceR: { type: "integer" },
                      mouthQ: { type: "integer" }, mouthR: { type: "integer" },
                      importance: { type: "integer", description: "1=minor, 2=major, 3=great river" },
                    },
                    required: ["name", "sourceQ", "sourceR", "mouthQ", "mouthR"],
                    additionalProperties: false,
                  },
                },
                biomeZones: {
                  type: "array",
                  description: "Biome zones around faction homelands. One per region.",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Czech name of the geographic area" },
                      centerQ: { type: "integer" }, centerR: { type: "integer" },
                      radius: { type: "integer", description: "Radius in hexes (3-8)" },
                      biome: { type: "string", enum: ["plains", "forest", "hills", "desert", "swamp", "tundra"] },
                      strength: { type: "number", description: "0.5-0.9" },
                    },
                    required: ["name", "centerQ", "centerR", "radius", "biome"],
                    additionalProperties: false,
                  },
                },
                continentShape: { type: "string", enum: ["pangaea", "archipelago", "two_continents", "crescent"], description: "Overall continent layout" },
                climateGradient: { type: "string", enum: ["north_cold", "south_cold", "equatorial", "uniform"], description: "Temperature gradient direction" },
                oceanPattern: { type: "string", enum: ["central_sea", "border_ocean", "inland_lakes"], description: "Ocean/water layout" },
              },
              required: ["ridges", "rivers", "biomeZones", "continentShape"],
              additionalProperties: false,
            },
          },
          required: ["countries", "factions", "regions", "cities", "persons", "wonders", "preHistoryEvents", "battles", "historyEvents", "preHistoryChronicle", "rumors", "loreBible", "worldMemories", "geography"],
          additionalProperties: false,
        },
      },
    };

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

    if (!response.ok) {
      const t = await response.text();
      console.error("AI error:", response.status, t);
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const world = JSON.parse(toolCall.function.arguments);

    // ═══════════════════════════════════════════════════════════
    // DETERMINISTIC GENERATION ORDER:
    // A) Country
    // B) Civilizations/Factions + Resources
    // C) Regions (with wiki)
    // D) Provinces (with wiki)
    // E) Cities (with wiki)
    // F) Great Persons (with wiki + entity_links)
    // G) Wonders (with wiki + entity_links)
    // H) Pre-history events → world_events + wiki + entity_links
    // I) Battles → game_events + world_events + entity_links
    // J) History events (year 1)
    // K) Pre-history chronicle
    // L) Rumors, world memories, feed, diplomacy
    // M) World premise + lore bible + style settings
    // N) Wiki profiles, images, hex gen
    // ═══════════════════════════════════════════════════════════

    const counters = { factions: 0, cities: 0, events: 0, regions: 0, provinces: 0, countries: 0, wiki: 0, rumors: 0, legendary: 0, persons: 0, wonders: 0, battles: 0, links: 0 };

    const factionPlayerMap: Record<string, string> = {};
    const cityIdMap: Record<string, string> = {};
    const personIdMap: Record<string, string> = {};

    // ═══ STEP A: Countries (one per faction) ═══
    const countryIdMap: Record<string, string> = {};
    const countriesList = world.countries || [{ name: worldName, description: premise, image_prompt: "", factionName: "__default__" }];
    for (const countryInfo of countriesList) {
      const { data: countryRow } = await supabase.from("countries").insert({
        session_id: sessionId,
        name: countryInfo.name,
        description: countryInfo.description || null,
        ai_description: countryInfo.description || null,
        image_prompt: countryInfo.image_prompt || null,
        ruler_player: null, // will be set after factions are created
      }).select("id").single();

      if (countryRow) {
        countryIdMap[countryInfo.factionName] = countryRow.id;
        counters.countries++;
        await supabase.from("wiki_entries").upsert({
          session_id: sessionId, entity_type: "country", entity_id: countryRow.id,
          entity_name: countryInfo.name, owner_player: "system",
          summary: `${countryInfo.name} — suverénní stát.`,
          ai_description: countryInfo.description || null,
          image_prompt: countryInfo.image_prompt || `A medieval illuminated manuscript illustration of the kingdom of ${countryInfo.name}`,
          updated_at: new Date().toISOString(),
          references: { generated: true, mode: "world_init" },
        } as any, { onConflict: "session_id,entity_type,entity_id" });
        counters.wiki++;
      }
    }

    // ═══ STEP B: Civilizations + AI Factions + Resources ═══
    // Phase 1: Create civilizations, AI factions, and extract civ_identity for AI
    const factionDataList: { faction: any; factionPlayerName: string; isPlayer: boolean }[] = [];

    let factionIndex = 0;
    for (const faction of world.factions || []) {
      const factionPlayerName = faction.isPlayer ? playerName : faction.name;
      factionPlayerMap[faction.name] = factionPlayerName;

      await supabase.from("civilizations").insert({
        session_id: sessionId, player_name: factionPlayerName, civ_name: faction.name,
        core_myth: faction.coreMith || null, architectural_style: faction.architecturalStyle || null,
        cultural_quirk: faction.culturalQuirk || null, is_ai: !faction.isPlayer,
        ai_personality: faction.isPlayer ? null : faction.personality,
      });

      // Set ruler_player on this faction's country
      const factionCountryId = countryIdMap[faction.name] || countryIdMap["__default__"];
      if (factionCountryId) {
        await supabase.from("countries").update({ ruler_player: factionPlayerName }).eq("id", factionCountryId);
      }

      if (!faction.isPlayer) {
        await supabase.from("ai_factions").insert({
          session_id: sessionId, faction_name: faction.name, personality: faction.personality,
          disposition: { [playerName]: faction.dispositionToPlayer || 0 },
          goals: faction.goals || [], is_active: true,
        });
        // Register AI faction as game_player (no user_id)
        await supabase.from("game_players").insert({
          session_id: sessionId, player_name: factionPlayerName,
          player_number: factionIndex + 1,
        }).catch(() => {}); // Ignore duplicate

        // Extract civ_identity for AI factions (generates unit names + modifiers from personality/description)
        try {
          const aiCivDesc = `${faction.description || ""}\nOsobnost: ${faction.personality || "neutrální"}\nCíle: ${(faction.goals || []).join(", ")}`;
          await supabase.functions.invoke("extract-civ-identity", {
            body: {
              sessionId,
              playerName: factionPlayerName,
              civDescription: aiCivDesc,
              coreMythText: faction.coreMith || null,
              culturalQuirkText: faction.culturalQuirk || null,
              architecturalStyleText: faction.architecturalStyle || null,
            },
          });
        } catch (e) {
          console.warn(`AI civ_identity extraction failed for ${factionPlayerName}:`, e);
        }
      }

      factionDataList.push({ faction, factionPlayerName, isPlayer: faction.isPlayer });
      counters.factions++;
      factionIndex++;
    }

    // Phase 2: Create initial resources WITH civ_identity modifiers applied
    for (const { faction, factionPlayerName } of factionDataList) {
      // Load civ_identity modifiers (may have been created above for AI, or earlier in lobby for human)
      const { data: civId } = await supabase.from("civ_identity")
        .select("grain_modifier, wood_modifier, stone_modifier, iron_modifier, wealth_modifier, stability_modifier")
        .eq("session_id", sessionId).eq("player_name", factionPlayerName).maybeSingle();

      // Apply modifiers to base income values
      const gm = civId?.grain_modifier || 0;   // e.g. 0.1 = +10%
      const wm = civId?.wood_modifier || 0;
      const sm = civId?.stone_modifier || 0;
      const im = civId?.iron_modifier || 0;
      const wlm = civId?.wealth_modifier || 0;
      const stab = civId?.stability_modifier || 0;

      const baseIncome = { food: 6, wood: 4, stone: 3, iron: 2, wealth: 3 };
      const baseUpkeep = { food: 3, wood: 1, stone: 0, iron: 0, wealth: 1 };
      const baseStockpile = { food: 20, wood: 10, stone: 5, iron: 3, wealth: 10 };

      // Modify income by civ_identity multiplier (e.g. grain_modifier=0.1 → food income * 1.1)
      const modifiedIncome: Record<string, number> = {
        food: Math.round(baseIncome.food * (1 + gm)),
        wood: Math.round(baseIncome.wood * (1 + wm)),
        stone: Math.round(baseIncome.stone * (1 + sm)),
        iron: Math.round(baseIncome.iron * (1 + im)),
        wealth: Math.round(baseIncome.wealth * (1 + wlm)),
      };

      for (const rt of ["food", "wood", "stone", "iron", "wealth"] as const) {
        await supabase.from("player_resources").insert({
          session_id: sessionId, player_name: factionPlayerName, resource_type: rt,
          income: modifiedIncome[rt],
          upkeep: baseUpkeep[rt],
          stockpile: baseStockpile[rt],
        });
      }

      await supabase.from("realm_resources").insert({
        session_id: sessionId, player_name: factionPlayerName,
        grain_reserve: 20, wood_reserve: 10, stone_reserve: 5, iron_reserve: 3,
        gold_reserve: 100, stability: Math.max(40, Math.min(100, 70 + stab)), granary_capacity: 500, mobilization_rate: 0.1,
      });
    }

    // ═══ STEP C: Regions with wiki ═══
    const regionIdMap: Record<string, string> = {};
    for (const region of world.regions || []) {
      const ownerPlayer = factionPlayerMap[region.controlledBy] || playerName;
      const { data: regRow } = await supabase.from("regions").insert({
        session_id: sessionId, name: region.name, description: region.description,
        biome: region.biome, owner_player: ownerPlayer, is_homeland: region.isPlayerHomeland || false,
        discovered_turn: 1, discovered_by: ownerPlayer, country_id: countryIdMap[region.controlledBy] || countryIdMap["__default__"] || null,
      }).select("id").single();

      if (regRow) {
        regionIdMap[region.name] = regRow.id;
        await supabase.from("wiki_entries").upsert({
          session_id: sessionId, entity_type: "region", entity_id: regRow.id,
          entity_name: region.name, owner_player: ownerPlayer,
          summary: `${region.name} — ${region.biome} region.`,
          ai_description: region.description || null,
          image_prompt: region.imagePrompt || `A medieval illuminated manuscript illustration of ${region.name}, ${region.biome} landscape`,
          updated_at: new Date().toISOString(),
          references: { generated: true, mode: "world_init", biome: region.biome },
        } as any, { onConflict: "session_id,entity_type,entity_id" });
        counters.wiki++;
      }
      counters.regions++;
    }

    // ═══ STEP D-pre: Generate batch hex map FIRST to get terrain + start positions ═══
    let mapStartPositions: { q: number; r: number }[] = [];
    {
      const { data: wfData } = await supabase.from("world_foundations")
        .select("map_width, map_height")
        .eq("session_id", sessionId)
        .maybeSingle();
      const mapWidth = (wfData as any)?.map_width || 21;
      const mapHeight = (wfData as any)?.map_height || 21;

      // ── Build terrain_params from AI geography blueprint ──
      const geoBlueprint = world.geography || {};
      const terrainParams: any = {};

      // Continent shape → continentCount + landRatio
      const shapeMap: Record<string, { continents: number; land: number }> = {
        pangaea: { continents: 1, land: 0.65 },
        two_continents: { continents: 2, land: 0.55 },
        archipelago: { continents: 5, land: 0.40 },
        crescent: { continents: 2, land: 0.50 },
      };
      const shape = shapeMap[geoBlueprint.continentShape] || shapeMap.two_continents;
      terrainParams.continentCount = shape.continents;
      terrainParams.targetLandRatio = shape.land;

      // Pass full blueprint for ridges, rivers, biome zones
      if (geoBlueprint.ridges || geoBlueprint.rivers || geoBlueprint.biomeZones) {
        terrainParams.geoBlueprint = {
          ridges: geoBlueprint.ridges || [],
          rivers: geoBlueprint.rivers || [],
          biomeZones: geoBlueprint.biomeZones || [],
          continentShape: geoBlueprint.continentShape,
          climateGradient: geoBlueprint.climateGradient,
          oceanPattern: geoBlueprint.oceanPattern,
        };
      }

      console.log(`Pre-generating batch map: ${mapWidth}x${mapHeight} with geo blueprint: ${(geoBlueprint.ridges || []).length} ridges, ${(geoBlueprint.rivers || []).length} rivers, ${(geoBlueprint.biomeZones || []).length} biome zones`);
      const mapRes = await fetch(`${supabaseUrl}/functions/v1/generate-world-map`, {
        method: "POST",
        headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, width: mapWidth, height: mapHeight, terrain_params: terrainParams }),
      });
      if (mapRes.ok) {
        const mapData = await mapRes.json();
        console.log(`Map generated: ${mapData.hexCount} hexes, startPositions: ${mapData.startPositions?.length}`);
        mapStartPositions = mapData.startPositions || [];
      } else {
        console.warn("Batch map pre-generation failed:", await mapRes.text());
      }
    }

    // ═══ Load hex terrain for terrain-aware placement ═══
    const { data: allHexTerrain } = await supabase
      .from("province_hexes")
      .select("q, r, biome_family, is_passable, has_river")
      .eq("session_id", sessionId)
      .limit(5000);
    const hexTerrainMap = new Map<string, { biome: string; passable: boolean; hasRiver: boolean }>();
    for (const h of allHexTerrain || []) {
      hexTerrainMap.set(`${h.q},${h.r}`, {
        biome: h.biome_family,
        passable: h.is_passable !== false,
        hasRiver: h.has_river === true,
      });
    }
    const CITY_ALLOWED = new Set(["plains", "hills", "forest", "swamp"]);
    console.log(`Loaded ${hexTerrainMap.size} hex terrain entries for placement`);

    // ═══ STEP D: Provinces with wiki + hex layout ═══
    const provinceIdMap: Record<string, string> = {};
    const provinceRegionMap: Record<string, string> = {};

    // Use startPositions from map generation for province centers (terrain-aware)
    const PROV_SPACING = 5;
    const fallbackOffsets: { q: number; r: number }[] = [
      { q: 0, r: 0 }, { q: PROV_SPACING, r: 0 }, { q: -PROV_SPACING, r: 0 },
      { q: Math.floor(PROV_SPACING / 2), r: PROV_SPACING },
      { q: -Math.floor(PROV_SPACING / 2), r: -PROV_SPACING },
      { q: Math.floor(PROV_SPACING / 2), r: -PROV_SPACING },
      { q: -Math.floor(PROV_SPACING / 2), r: PROV_SPACING },
      { q: PROV_SPACING * 2, r: 0 }, { q: -PROV_SPACING * 2, r: 0 },
      { q: PROV_SPACING, r: PROV_SPACING }, { q: -PROV_SPACING, r: -PROV_SPACING },
      { q: PROV_SPACING, r: -PROV_SPACING },
    ];
    const provinceCenterOffsets = mapStartPositions.length > 0 ? mapStartPositions : fallbackOffsets;

    // Generate ring hexes
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

    /** Get candidate hexes for a province — only passable land hexes */
    function provinceValidHexes(cq: number, cr: number): { q: number; r: number }[] {
      const candidates = [
        { q: cq, r: cr },
        ...hexRing(cq, cr, 1),
        ...hexRing(cq, cr, 2),
        ...hexRing(cq, cr, 3), // extend to ring 3 for fallback
      ];
      return candidates.filter(h => {
        const t = hexTerrainMap.get(`${h.q},${h.r}`);
        if (!t) return false;
        if (!t.passable) return false; // sea, mountains
        if (t.hasRiver) return false;  // rivers are impassable barriers
        return true;
      });
    }

    // Build faction → color index map (same faction = same color on map)
    const factionColorMap = new Map<string, number>();
    let factionColorIdx = 0;
    for (const faction of world.factions || []) {
      const fp = factionPlayerMap[faction.name] || faction.name;
      if (!factionColorMap.has(fp)) {
        factionColorMap.set(fp, factionColorIdx++);
      }
    }

    let provPositionIndex = 0;
    const allProvinceHexEntries: any[] = [];

    for (const region of world.regions || []) {
      const regionId = regionIdMap[region.name];
      const ownerPlayer = factionPlayerMap[region.controlledBy] || playerName;
      const ownerColor = factionColorMap.get(ownerPlayer) ?? provPositionIndex;
      const regionProvinces = region.provinces || [];
      if (regionProvinces.length === 0) {
        regionProvinces.push({ name: `${region.name} – Centrální`, description: `Hlavní provincie regionu ${region.name}.` });
      }

      for (const prov of regionProvinces) {
        const centerOffset = provinceCenterOffsets[provPositionIndex] || { q: provPositionIndex * PROV_SPACING, r: 0 };
        const isNeutral = !factionPlayerMap[region.controlledBy];

        const { data: provRow } = await supabase.from("provinces").insert({
          session_id: sessionId, name: prov.name, description: prov.description || null,
          region_id: regionId || null, owner_player: ownerPlayer,
          center_q: centerOffset.q, center_r: centerOffset.r,
          color_index: ownerColor, is_neutral: isNeutral,
        }).select("id").single();

        if (provRow) {
          provinceIdMap[prov.name] = provRow.id;
          provinceRegionMap[prov.name] = region.name;

          // Link only passable hexes to this province
          const validHexes = provinceValidHexes(centerOffset.q, centerOffset.r);
          // Take at most 19 hexes (center + 2 rings worth)
          const assignedHexes = validHexes.slice(0, 19);
          console.log(`Province ${prov.name}: ${assignedHexes.length} valid hexes of ${validHexes.length} candidates (owner: ${ownerPlayer})`);

          for (const h of assignedHexes) {
            allProvinceHexEntries.push({
              session_id: sessionId, q: h.q, r: h.r, province_id: provRow.id,
            });
            await supabase.from("province_hexes")
              .update({ province_id: provRow.id, owner_player: ownerPlayer })
              .eq("session_id", sessionId)
              .eq("q", h.q)
              .eq("r", h.r);
          }

          await supabase.from("wiki_entries").upsert({
            session_id: sessionId, entity_type: "province", entity_id: provRow.id,
            entity_name: prov.name, owner_player: ownerPlayer,
            summary: `${prov.name} — provincie v regionu ${region.name}.`,
            ai_description: prov.description || null,
            updated_at: new Date().toISOString(),
            references: { generated: true, mode: "world_init", regionName: region.name },
          } as any, { onConflict: "session_id,entity_type,entity_id" });
          counters.wiki++;
        }
        provPositionIndex++;
        counters.provinces++;
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

    // Get province center coords for city placement
    const getProvinceCenter = (provId: string): { q: number; r: number } => {
      for (const entry of allProvinceHexEntries) {
        // The first hex entry per province is the center
        if (entry.province_id === provId) return { q: entry.q, r: entry.r };
      }
      return { q: 0, r: 0 };
    };

    // Place city within province bounds — ONLY on valid biomes
    const usedHexes = new Set<string>();
    const provincePlacedHexes = new Map<string, Set<string>>();
    const placeCityInProvince = (provId: string): { q: number; r: number } => {
      const center = getProvinceCenter(provId);
      if (!provincePlacedHexes.has(provId)) provincePlacedHexes.set(provId, new Set());
      const placed = provincePlacedHexes.get(provId)!;
      
      // Try hexes that belong to this province and have city-allowed biomes
      const candidates = provinceValidHexes(center.q, center.r);
      for (const c of candidates) {
        const key = `${c.q},${c.r}`;
        if (placed.has(key) || usedHexes.has(key)) continue;
        const terrain = hexTerrainMap.get(key);
        if (!terrain || !CITY_ALLOWED.has(terrain.biome)) continue;
        placed.add(key);
        usedHexes.add(key);
        return c;
      }
      // Fallback — return center (should still be valid from startPositions)
      console.warn(`No valid city hex in province ${provId}, falling back to center`);
      return center;
    };

    const POP_RANGES: Record<string, { min: number; max: number }> = {
      Velkoměsto: { min: 1200, max: 1600 }, Město: { min: 800, max: 1200 },
      Vesnice: { min: 300, max: 480 }, Osada: { min: 250, max: 480 },
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
    for (const city of world.cities || []) {
      const ownerPlayer = factionPlayerMap[city.ownerFaction] || playerName;
      const isPlayerCity = ownerPlayer === playerName;
      const provinceId = findProvinceId(city);
      // Place city within its province's hex area
      let coords: { q: number; r: number };
      if (provinceId) {
        coords = placeCityInProvince(provinceId);
      } else {
        coords = { q: cityIndex * 3, r: 0 };
        usedHexes.add(`${coords.q},${coords.r}`);
      }

      const cityName = (isPlayerCity && cityIndex === 0 && settlementName) ? settlementName : city.name;
      // FORCE all starting cities to Osada/HAMLET regardless of AI choice
      const level = "Osada";
      const isCapital = !playerFirstCity.has(ownerPlayer);
      if (isCapital) playerFirstCity.add(ownerPlayer);

      const range = POP_RANGES.Osada;
      const popTotal = range.min + Math.floor(Math.random() * (range.max - range.min));
      const settlementLevel = "HAMLET";
      const template = POP_TEMPLATES[settlementLevel];
      const popPeasants = Math.round(popTotal * template.peasants);
      const popBurghers = Math.round(popTotal * template.burghers);
      const popClerics = popTotal - popPeasants - popBurghers;

      const { data: cityRow, error: cityErr } = await supabase.from("cities").insert({
        session_id: sessionId, name: cityName, owner_player: ownerPlayer, level,
        tags: city.tags || [], province: city.provinceName || city.regionName || null,
        province_id: provinceId, city_description_cached: city.description || null,
        flavor_prompt: city.description || null, founded_round: 1,
        province_q: coords.q, province_r: coords.r,
        city_stability: 60 + Math.floor(Math.random() * 15),
        population_total: popTotal, population_peasants: popPeasants,
        population_burghers: popBurghers, population_clerics: popClerics,
        settlement_level: settlementLevel,
      }).select("id").single();

      if (cityErr) { console.error("City insert error:", cityErr); continue; }
      const cityId = cityRow!.id;
      cityIdMap[cityName] = cityId;
      // Also map original AI name if we renamed
      if (cityName !== city.name) cityIdMap[city.name] = cityId;

      createdCityRows.push({
        id: cityId, name: cityName, ownerPlayer, description: city.description,
        regionName: city.regionName, provinceName: city.provinceName,
        level, q: coords.q, r: coords.r, isPlayer: isPlayerCity,
      });

      await supabase.from("wiki_entries").upsert({
        session_id: sessionId, entity_type: "city", entity_id: cityId,
        entity_name: cityName, owner_player: ownerPlayer,
        summary: `${cityName} je ${level.toLowerCase()} v regionu ${city.regionName || worldName}, pod správou ${ownerPlayer}.`,
        ai_description: city.description || null,
        image_prompt: city.imagePrompt || null,
        updated_at: new Date().toISOString(),
        references: { generated: true, mode: "world_init" },
      } as any, { onConflict: "session_id,entity_type,entity_id" });
      counters.wiki++;
      counters.cities++;
      cityIndex++;

      // ═══ SEED STADIUM + 3 LEAGUE TEAMS for AI faction capital cities ═══
      if (!isPlayerCity && isCapital) {
        try {
          const { data: stadiumRow } = await supabase.from("city_buildings").insert({
            session_id: sessionId, city_id: cityId, name: `Stadion ${cityName}`,
            category: "cultural", description: `Sportovní stadion ve městě ${cityName}.`,
            status: "completed", build_duration: 0, build_started_turn: 0, completed_turn: 1,
            current_level: 1, max_level: 3, cost_wood: 0, cost_stone: 0, cost_iron: 0, cost_wealth: 0,
            is_arena: false, is_ai_generated: false, is_wonder: false,
            building_tags: ["stadium"],
            effects: { stability: 2, influence: 3, population_capacity: 50 },
            level_data: [{ level: 1, name: "Závodiště", effects: { influence: 3, stability: 2 }, cost_mult: 1, unlock: "Ligový tým" }],
            flavor_text: "Písek arény pamatuje první zápasy zakladatelů.",
          }).select("id").single();
          counters.buildings = (counters.buildings || 0) + 1;

          // Generate 3 teams with 11 players each
          if (stadiumRow) {
            const TEAM_PREFIXES = ["Legie", "Gladiátoři", "Válečníci", "Štíty", "Orel", "Drakouni", "Krkavci", "Titáni", "Býci", "Blesky"];
            const TEAM_COLORS = [
              { p: "#4a90d9", s: "#1a1a2e" }, { p: "#10b981", s: "#0f172a" }, { p: "#dc2626", s: "#1c1917" },
              { p: "#8b5cf6", s: "#1e1b4b" }, { p: "#f59e0b", s: "#1c1917" }, { p: "#374151", s: "#f9fafb" },
            ];
            const FIRST_NAMES = [
              "Aethon","Brutus","Cassian","Darius","Eneas","Felix","Gaius","Hector",
              "Icarus","Julius","Kaelen","Leon","Marcus","Nero","Orion","Primus",
              "Quintus","Rex","Servius","Titus","Ulric","Varro","Xander","Zeno",
              "Ajax","Balthus","Corvus","Drago","Erebus","Falco","Gryphon","Hadrian",
            ];
            const POSITIONS = [
              { pos: "goalkeeper", count: 1 }, { pos: "defender", count: 4 },
              { pos: "midfielder", count: 3 }, { pos: "attacker", count: 3 },
            ];
            const baseRating = 30 + Math.floor((popTotal / 200) * 3);
            const usedPrefixes = new Set<string>();

            for (let ti = 0; ti < 3; ti++) {
              let prefix: string;
              do { prefix = TEAM_PREFIXES[Math.floor(Math.random() * TEAM_PREFIXES.length)]; } while (usedPrefixes.has(prefix));
              usedPrefixes.add(prefix);
              const colors = TEAM_COLORS[(ti + (cityIndex % 3)) % TEAM_COLORS.length];

              const { data: teamRow } = await supabase.from("league_teams").insert({
                session_id: sessionId, city_id: cityId, stadium_building_id: stadiumRow.id,
                player_name: ownerPlayer, team_name: `${prefix} ${cityName}`,
                motto: `Za slávu ${cityName}!`,
                color_primary: colors.p, color_secondary: colors.s,
                attack_rating: baseRating + Math.floor(Math.random() * 20) - 10,
                defense_rating: baseRating + Math.floor(Math.random() * 20) - 10,
                tactics_rating: baseRating + Math.floor(Math.random() * 15) - 7,
                discipline_rating: baseRating + Math.floor(Math.random() * 15) - 7,
                popularity: Math.floor(popTotal / 300),
                fan_base: Math.floor(popTotal / 15),
              }).select("id").single();

              if (teamRow) {
                const usedNames = new Set<string>();
                const playerRows: any[] = [];
                for (const posGroup of POSITIONS) {
                  for (let pi = 0; pi < posGroup.count; pi++) {
                    let pName: string;
                    do { pName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]; } while (usedNames.has(pName));
                    usedNames.add(pName);
                    const isCap = posGroup.pos === "midfielder" && pi === 0;
                    playerRows.push({
                      session_id: sessionId, team_id: teamRow.id, name: pName,
                      position: posGroup.pos, is_captain: isCap,
                      strength: 35 + Math.floor(Math.random() * 30),
                      speed: 35 + Math.floor(Math.random() * 30),
                      technique: 35 + Math.floor(Math.random() * 30),
                      stamina: 40 + Math.floor(Math.random() * 25),
                      aggression: 25 + Math.floor(Math.random() * 30),
                      leadership: isCap ? 70 + Math.floor(Math.random() * 20) : Math.floor(Math.random() * 40),
                    });
                  }
                }
                await supabase.from("league_players").insert(playerRows);
              }
            }
          }
        } catch (e) { console.error("Stadium/team seed error:", e); }
      }
    }

    // ═══ STEP F: Great Persons with wiki + entity_links ═══
    for (const person of world.persons || []) {
      const ownerPlayer = factionPlayerMap[person.ownerFaction] || playerName;
      const homeCityId = cityIdMap[person.homeCityName] || null;
      const isAlive = !person.diedYear || person.diedYear > 0;

      const { data: personRow } = await supabase.from("great_persons").insert({
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

        // Wiki entry
        await supabase.from("wiki_entries").upsert({
          session_id: sessionId, entity_type: "person", entity_id: personRow.id,
          entity_name: person.name, owner_player: ownerPlayer,
          summary: (person.bio || "").substring(0, 200),
          ai_description: person.bio || null,
          image_prompt: person.imagePrompt || null,
          tags: [person.personType, person.flavorTrait].filter(Boolean),
          updated_at: new Date().toISOString(),
          references: { generated: true, mode: "world_init", bornYear: person.bornYear },
        } as any, { onConflict: "session_id,entity_type,entity_id" });
        counters.wiki++;

        // Entity link: person → home city
        if (homeCityId) {
          await supabase.from("entity_links").insert({
            session_id: sessionId, from_entity_id: personRow.id, from_entity_type: "person",
            to_entity_id: homeCityId, to_entity_type: "city", link_type: "resides_in",
            label: `${person.name} pochází z ${person.homeCityName}`,
          });
          counters.links++;
        }
      }
    }

    // ═══ STEP G: Wonders with wiki + entity_links ═══
    for (const wonder of world.wonders || []) {
      const ownerPlayer = factionPlayerMap[wonder.ownerFaction] || playerName;
      const cityId = cityIdMap[wonder.cityName] || null;

      const { data: wonderRow } = await supabase.from("wonders").insert({
        session_id: sessionId, name: wonder.name, owner_player: ownerPlayer,
        city_name: wonder.cityName || null, description: wonder.description,
        bonus: wonder.bonus || null, memory_fact: wonder.memoryFact || null,
        image_prompt: wonder.imagePrompt || null, status: wonder.status || "completed",
      }).select("id").single();

      if (wonderRow) {
        counters.wonders++;

        // Wiki entry
        const statusLabel = wonder.status === "destroyed" ? " (zničen)" : "";
        const fullDesc = wonder.status === "destroyed" && wonder.destroyedStory
          ? `${wonder.description}\n\n**Zánik:** ${wonder.destroyedStory}`
          : wonder.description;

        await supabase.from("wiki_entries").upsert({
          session_id: sessionId, entity_type: "wonder", entity_id: wonderRow.id,
          entity_name: wonder.name, owner_player: ownerPlayer,
          summary: `${wonder.name}${statusLabel} — div světa v ${wonder.cityName || "neznámém městě"}.`,
          ai_description: fullDesc,
          image_prompt: wonder.imagePrompt || null,
          tags: ["wonder", wonder.status || "completed"],
          updated_at: new Date().toISOString(),
          references: { generated: true, mode: "world_init" },
        } as any, { onConflict: "session_id,entity_type,entity_id" });
        counters.wiki++;

        // Entity link: wonder → city
        if (cityId) {
          await supabase.from("entity_links").insert({
            session_id: sessionId, from_entity_id: wonderRow.id, from_entity_type: "wonder",
            to_entity_id: cityId, to_entity_type: "city", link_type: "located_in",
            label: `${wonder.name} stojí v ${wonder.cityName}`,
          });
          counters.links++;
        }

        // Entity link: wonder → builder person
        if (wonder.builderPersonName && personIdMap[wonder.builderPersonName]) {
          await supabase.from("entity_links").insert({
            session_id: sessionId, from_entity_id: wonderRow.id, from_entity_type: "wonder",
            to_entity_id: personIdMap[wonder.builderPersonName], to_entity_type: "person",
            link_type: "built_by", label: `Postaveno osobností ${wonder.builderPersonName}`,
          });
          counters.links++;
        }
      }
    }

    // ═══ STEP H: Pre-history events → world_events + wiki + entity_links ═══
    const preHistoryEventIds: string[] = [];
    for (const evt of world.preHistoryEvents || []) {
      const involvedPlayers = (evt.involvedFactions || []).map((f: string) => factionPlayerMap[f] || f);
      const cityId = cityIdMap[evt.location] || null;
      const slug = `prehistory-${Math.abs(evt.year)}-${crypto.randomUUID().substring(0, 8)}`;

      const { data: weRow } = await supabase.from("world_events").insert({
        session_id: sessionId, title: evt.title, slug, summary: evt.description.substring(0, 200),
        description: evt.description, date: `Rok ${evt.year} (před počátkem paměti)`,
        event_category: evt.eventType, status: "published", created_turn: 0,
        created_by_type: "system", affected_players: involvedPlayers,
        participants: (evt.involvedFactions || []).map((f: string) => ({ type: "faction", name: f, player: factionPlayerMap[f] || f })),
        tags: ["legendary", "prehistory", evt.eventType],
        ai_image_prompt: evt.imagePrompt || null, location_id: cityId,
      } as any).select("id").single();

      if (weRow) {
        preHistoryEventIds.push(weRow.id);
        counters.legendary++;

        // Wiki entry for event
        await supabase.from("wiki_entries").upsert({
          session_id: sessionId, entity_type: "event", entity_id: weRow.id,
          entity_name: evt.title, owner_player: "system",
          summary: evt.description.substring(0, 200),
          ai_description: `${evt.description}\n\n**Odkaz do současnosti:** ${evt.legacyImpact || ""}`,
          image_prompt: evt.imagePrompt || null,
          tags: ["legendary", evt.eventType],
          updated_at: new Date().toISOString(),
          references: { generated: true, mode: "legendary", year: evt.year },
        } as any, { onConflict: "session_id,entity_type,entity_id" });
        counters.wiki++;

        // game_event mirror
        await supabase.from("game_events").insert({
          session_id: sessionId, event_type: evt.eventType || "other",
          player: involvedPlayers[0] || "system", turn_number: 0,
          confirmed: true, note: evt.description, location: evt.location || null,
          result: evt.title, importance: "high", truth_state: "canon",
          city_id: cityId,
        });
        counters.events++;

        // Entity links: event → persons
        for (const personName of evt.relatedPersonNames || []) {
          const personId = personIdMap[personName];
          if (personId) {
            await supabase.from("entity_links").insert({
              session_id: sessionId, from_entity_id: weRow.id, from_entity_type: "event",
              to_entity_id: personId, to_entity_type: "person", link_type: "involved",
              label: `${personName} se účastnil: ${evt.title}`,
            });
            counters.links++;
          }
        }

        // Entity link: event → city
        if (cityId) {
          await supabase.from("entity_links").insert({
            session_id: sessionId, from_entity_id: weRow.id, from_entity_type: "event",
            to_entity_id: cityId, to_entity_type: "city", link_type: "located_in",
            label: `${evt.title} se odehrála v ${evt.location}`,
          });
          counters.links++;
        }
      }
    }

    // ═══ STEP I: Battles → game_events + world_events + entity_links ═══
    for (const battle of world.battles || []) {
      const cityId = cityIdMap[battle.locationName] || null;
      const turnNum = battle.year <= 0 ? 0 : battle.year;
      const dateLabel = battle.year <= 0 ? `Rok ${battle.year} (před počátkem paměti)` : `Rok ${battle.year}`;
      const attackerPlayer = factionPlayerMap[battle.attackerFaction] || battle.attackerFaction;
      const defenderPlayer = factionPlayerMap[battle.defenderFaction] || battle.defenderFaction;
      const slug = `battle-${Math.abs(battle.year)}-${crypto.randomUUID().substring(0, 8)}`;

      // world_event
      const { data: weRow } = await supabase.from("world_events").insert({
        session_id: sessionId, title: `Bitva: ${battle.name}`, slug,
        summary: battle.description.substring(0, 200), description: battle.description,
        date: dateLabel, event_category: "battle", status: "published", created_turn: turnNum,
        created_by_type: "system",
        affected_players: [attackerPlayer, defenderPlayer].filter(Boolean),
        tags: ["battle", ...(turnNum === 0 ? ["legendary", "prehistory"] : [])],
        location_id: cityId,
      } as any).select("id").single();

      // game_event
      await supabase.from("game_events").insert({
        session_id: sessionId, event_type: "battle", player: attackerPlayer,
        location: battle.locationName, note: battle.description,
        turn_number: turnNum, confirmed: true, importance: "high",
        city_id: cityId, result: battle.outcome, casualties: battle.casualties || null,
        truth_state: "canon",
      });
      counters.events++;
      counters.battles++;

      // Wiki entry for battle
      if (weRow) {
        await supabase.from("wiki_entries").upsert({
          session_id: sessionId, entity_type: "event", entity_id: weRow.id,
          entity_name: `Bitva: ${battle.name}`, owner_player: "system",
          summary: battle.description.substring(0, 200),
          ai_description: `${battle.description}\n\n**Útočník:** ${battle.attackerCommander} (${battle.attackerFaction})\n**Obránce:** ${battle.defenderCommander} (${battle.defenderFaction})\n**Výsledek:** ${battle.outcome}\n**Ztráty:** ${battle.casualties || "neznámé"}`,
          tags: ["battle"],
          updated_at: new Date().toISOString(),
          references: { generated: true, mode: "battle", year: battle.year },
        } as any, { onConflict: "session_id,entity_type,entity_id" });
        counters.wiki++;

        // Entity links: battle → commanders
        const attackerId = personIdMap[battle.attackerCommander];
        const defenderId = personIdMap[battle.defenderCommander];
        if (attackerId) {
          await supabase.from("entity_links").insert({
            session_id: sessionId, from_entity_id: weRow.id, from_entity_type: "event",
            to_entity_id: attackerId, to_entity_type: "person", link_type: "commander",
            label: `${battle.attackerCommander} velel útoku v bitvě ${battle.name}`,
          });
          counters.links++;
        }
        if (defenderId) {
          await supabase.from("entity_links").insert({
            session_id: sessionId, from_entity_id: weRow.id, from_entity_type: "event",
            to_entity_id: defenderId, to_entity_type: "person", link_type: "commander",
            label: `${battle.defenderCommander} bránil v bitvě ${battle.name}`,
          });
          counters.links++;
        }
        // Link to city
        if (cityId) {
          await supabase.from("entity_links").insert({
            session_id: sessionId, from_entity_id: weRow.id, from_entity_type: "event",
            to_entity_id: cityId, to_entity_type: "city", link_type: "battle_site",
            label: `Bitva ${battle.name} se odehrála u ${battle.locationName}`,
          });
          counters.links++;
        }
      }
    }

    // ═══ STEP J: History events (year 1) ═══
    for (const event of world.historyEvents || []) {
      const involvedPlayers = (event.involvedFactions || []).map((f: string) => factionPlayerMap[f] || f);
      const cityId = cityIdMap[event.location || ""] || null;
      await supabase.from("game_events").insert({
        session_id: sessionId, event_type: event.eventType || "other",
        player: involvedPlayers[0] || "system", turn_number: 1,
        confirmed: true, note: event.description, location: event.location || null,
        result: event.title, importance: "normal", truth_state: "canon", city_id: cityId,
      });

      await supabase.from("world_events").insert({
        session_id: sessionId, title: event.title,
        slug: `evt-1-${crypto.randomUUID().substring(0, 8)}`,
        summary: event.description.substring(0, 200), description: event.description,
        date: "Rok 1", event_category: event.eventType, status: "published",
        created_turn: 1, created_by_type: "system", affected_players: involvedPlayers,
        location_id: cityId,
      } as any);
      counters.events++;
    }

    // ═══ STEP K: Pre-history chronicle + founding chronicle + CHRONICLE ZERO (epic prolog) ═══
    if (world.preHistoryChronicle) {
      await supabase.from("chronicle_entries").insert({
        session_id: sessionId, text: world.preHistoryChronicle,
        epoch_style: "kroniky", turn_from: 0, turn_to: 0,
        source_type: "system",
      });
    }

    const legendaryNames = (world.preHistoryEvents || []).map((e: any) => e.title).slice(0, 5).join(", ");
    await supabase.from("chronicle_entries").insert({
      session_id: sessionId,
      text: `Věk zakládání – V prvním roce letopočtu byly založeny základy civilizací ve státě ${countryInfo.name}. ${counters.cities} měst, ${counters.persons} osobností, ${counters.wonders} divů světa. ${legendaryNames ? `Legendy praví o: ${legendaryNames}.` : ""} ${premise}`,
      epoch_style: "kroniky", turn_from: 1, turn_to: 1,
      source_type: "founding",
    });

    // ═══ CHRONICLE ZERO — Epic 2000+ word prolog ═══
    // Second AI call with ALL generated entity data for comprehensive prolog
    try {
      const personsSummary = (world.persons || []).map((p: any) => `${p.name} (${p.personType}, rok ${p.bornYear}${p.diedYear ? `, † ${p.diedYear}` : ""}): ${p.bio}`).join("\n");
      const wondersSummary = (world.wonders || []).map((w: any) => `${w.name} (${w.status}) v ${w.cityName}: ${w.description}${w.destroyedStory ? ` Zánik: ${w.destroyedStory}` : ""}`).join("\n");
      const battlesSummary = (world.battles || []).map((b: any) => `Rok ${b.year} — ${b.name} u ${b.locationName}: ${b.attackerCommander} vs ${b.defenderCommander}. ${b.outcome}. ${b.description}`).join("\n");
      const preHistorySummary = (world.preHistoryEvents || []).map((e: any) => `Rok ${e.year} — ${e.title} (${e.eventType}): ${e.description} Odkaz: ${e.legacyImpact}`).join("\n");
      const citiesSummary = (world.cities || []).map((c: any) => `${c.name} (${c.level}, ${c.ownerFaction}): ${c.description}`).join("\n");
      const regionsSummary = (world.regions || []).map((r: any) => `${r.name} (${r.biome}): ${r.description}`).join("\n");
      const factionsSummary = (world.factions || []).map((f: any) => `${f.name}: ${f.description}${f.coreMith ? ` Mýtus: ${f.coreMith}` : ""}`).join("\n");

      const chronicle0SystemPrompt = `Jsi dvorní kronikář, který píše velký úvodní prolog do kroniky světa. Tvůj text je PRVNÍ, co hráč přečte — musí ho vtáhnout do světa.

PRAVIDLA:
1. Piš v ČEŠTINĚ, v ${tone === "realistic" ? "politickém kronikářském" : tone === "mythic" ? "epickém mýtickém" : "středověkém kronikářském"} stylu.
2. Text musí mít MINIMÁLNĚ 2000 slov (ideálně 2500-3000).
3. MUSÍŠ zmínit VŠECHNY osobnosti, bitvy, divy světa a prehistorické události — žádnou nevynechej.
4. Text musí mít logickou strukturu: od stvoření/počátku → přes dávné věky → legendární bitvy → vzestup a pád říší → současný stav.
5. Propojuj entity navzájem: generálové velí v bitvách, stavitelé budují divy, proroci ovlivňují události.
6. Používej dramatické obraty, proroctví, citáty legendárních postav.
7. Závěr musí naznačit, že nyní začíná NOVÝ věk — hráčův věk.
8. Nepoužívej nadpisy ani formátování — piš jako plynulý kronikářský text s odstavci.

Odpověz POUZE voláním funkce write_chronicle_zero.`;

      const chronicle0UserPrompt = `SVĚT: ${worldName}
STÁT: ${countryInfo.name}
PREMISA: ${premise}
LORE BIBLE: ${world.loreBible || ""}

OSOBNOSTI (${(world.persons || []).length}):
${personsSummary}

DIVY SVĚTA (${(world.wonders || []).length}):
${wondersSummary}

BITVY (${(world.battles || []).length}):
${battlesSummary}

PREHISTORICKÉ UDÁLOSTI (${(world.preHistoryEvents || []).length}):
${preHistorySummary}

FRAKCE (${(world.factions || []).length}):
${factionsSummary}

REGIONY (${(world.regions || []).length}):
${regionsSummary}

MĚSTA (${(world.cities || []).length}):
${citiesSummary}

Napiš EPICKÝ PROLOG o minimálně 2000 slovech, který zmíní VŠECHNY výše uvedené entity a vytvoří koherentní příběh od počátku světa až po současnost.`;

      const chronicle0Response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: chronicle0SystemPrompt },
            { role: "user", content: chronicle0UserPrompt },
          ],
          tools: [{
            type: "function",
            function: {
              name: "write_chronicle_zero",
              description: "Write the epic Chronicle Zero prolog",
              parameters: {
                type: "object",
                properties: {
                  chronicle_text: { type: "string", description: "The full 2000+ word epic prolog text in Czech" },
                  title: { type: "string", description: "Title of the chronicle (e.g. 'Kronika Počátku' or similar)" },
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

      if (chronicle0Response.ok) {
        const c0Data = await chronicle0Response.json();
        const c0ToolCall = c0Data.choices?.[0]?.message?.tool_calls?.[0];
        if (c0ToolCall) {
          const c0Result = JSON.parse(c0ToolCall.function.arguments);
          const chronicleText = c0Result.chronicle_text || c0Result.chronicleText || "";
          const chronicleTitle = c0Result.title || "Kronika Počátku";

          if (chronicleText.length > 500) {
            // Build entity sidebar data
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
            };

            // Save as chronicle_zero entry
            await supabase.from("chronicle_entries").insert({
              session_id: sessionId,
              text: chronicleText,
              epoch_style: "kroniky",
              turn_from: 0,
              turn_to: 0,
              source_type: "chronicle_zero",
              references: { title: chronicleTitle, sidebar: sidebarData, wordCount: chronicleText.split(/\s+/).length },
            });

            console.log(`Chronicle Zero generated: ${chronicleText.split(/\s+/).length} words, title: ${chronicleTitle}`);
          } else {
            console.warn("Chronicle Zero text too short, skipping:", chronicleText.length);
          }
        }
      } else {
        console.warn("Chronicle Zero AI call failed:", chronicle0Response.status);
      }
    } catch (c0Err) {
      console.warn("Chronicle Zero generation error (non-fatal):", c0Err);
    }

    // ═══ STEP L: Rumors, world memories, feed, diplomacy ═══

    // Rumors from AI (rich, pre-history aware)
    const allCityNames = Object.keys(cityIdMap);
    for (const rumor of world.rumors || []) {
      const cName = rumor.relatedCityName && cityIdMap[rumor.relatedCityName]
        ? rumor.relatedCityName
        : allCityNames[Math.floor(Math.random() * allCityNames.length)] || "";
      const cId = cityIdMap[cName] || Object.values(cityIdMap)[0] || null;
      if (cId) {
        await supabase.from("city_rumors").insert({
          session_id: sessionId, city_id: cId, city_name: cName,
          text: rumor.text, tone_tag: rumor.toneTag || "neutral",
          turn_number: rumor.turnNumber || 1, created_by: "system",
        });
        counters.rumors++;
      }
    }

    // World memories
    for (const memory of world.worldMemories || []) {
      await supabase.from("world_memories").insert({
        session_id: sessionId, text: memory, category: "tradition", status: "approved", source_turn: 1,
      } as any);
    }

    // Legacy impacts as historical scars
    for (const evt of world.preHistoryEvents || []) {
      if (evt.legacyImpact) {
        await supabase.from("world_memories").insert({
          session_id: sessionId, text: `${evt.title}: ${evt.legacyImpact}`,
          category: "historical_scar", status: "approved", source_turn: 0,
        } as any);
      }
    }

    // Wonder memories
    for (const wonder of world.wonders || []) {
      if (wonder.memoryFact) {
        await supabase.from("world_memories").insert({
          session_id: sessionId, text: `Div světa ${wonder.name}: ${wonder.memoryFact}`,
          category: "tradition", status: "approved", source_turn: 0,
        } as any);
      }
    }

    // World feed items
    await supabase.from("world_feed_items").insert({
      session_id: sessionId, turn_number: 1,
      content: `Věk zakládání začíná. V zemi ${countryInfo.name} vznikají nové říše.`,
      feed_type: "gossip", importance: "high",
    } as any);

    // Feed for pre-history events
    for (const evt of (world.preHistoryEvents || []).slice(0, 5)) {
      await supabase.from("world_feed_items").insert({
        session_id: sessionId, turn_number: 0,
        content: `Z dávných legend: ${evt.title}`,
        feed_type: "gossip", importance: "high",
      } as any);
    }

    // Feed for top cities
    for (const city of createdCityRows.slice(0, 5)) {
      await supabase.from("world_feed_items").insert({
        session_id: sessionId, turn_number: 1,
        content: `Město ${city.name} bylo založeno v regionu ${city.regionName || worldName}.`,
        feed_type: "gossip", importance: "normal",
      } as any);
    }

    // Diplomacy rooms
    let diplomacyRoomsCreated = 0;
    for (const faction of (world.factions || [])) {
      if (faction.isPlayer) continue;
      const factionPlayerName = factionPlayerMap[faction.name] || faction.name;
      try {
        await supabase.from("diplomacy_rooms").insert({
          session_id: sessionId, room_type: "player_ai",
          participant_a: playerName, participant_b: factionPlayerName,
        });
        diplomacyRoomsCreated++;

        const { data: roomData } = await supabase.from("diplomacy_rooms")
          .select("id").eq("session_id", sessionId)
          .eq("participant_a", playerName).eq("participant_b", factionPlayerName).single();

        if (roomData) {
          const disposition = faction.dispositionToPlayer || 0;
          const greeting = disposition > 30
            ? `Zdravíme vás, vládce ${realmName || playerName}. Doufáme v plodnou spolupráci.`
            : disposition < -30
            ? `Bereme na vědomí vaši existenci, ${playerName}. Nečekejte přátelství.`
            : `Pozdravujeme, ${playerName}. Frakce ${faction.name} je připravena jednat.`;

          await supabase.from("diplomacy_messages").insert({
            room_id: roomData.id, sender: factionPlayerName,
            sender_type: "ai", message_text: greeting, secrecy: "PRIVATE",
          });
        }
      } catch (e) { console.warn("Diplomacy room failed for", faction.name, e); }
    }

    // ═══ STEP M: World premise + lore bible + style settings ═══
    const loreBible = world.loreBible || premise;
    const writingStyle = tone === "realistic" ? "political-chronicle" : tone === "mythic" ? "epic-saga" : "narrative";

    // Create world_premise (canonical source of truth for AI)
    const geoBlueprintForStorage = world.geography || {};
    await supabase.from("world_premise").insert({
      session_id: sessionId,
      seed: null, // will be set by session
      epoch_style: "kroniky",
      cosmology: "",
      narrative_rules: {},
      economic_bias: "balanced",
      war_bias: "neutral",
      lore_bible: loreBible,
      world_vibe: tone || "narrative",
      writing_style: writingStyle,
      constraints: tone === "realistic" ? "avoid random magic unless selected" : "",
      version: 1,
      is_active: true,
      geography_blueprint: geoBlueprintForStorage,
    });

    // Style settings
    await supabase.from("game_style_settings").upsert({
      session_id: sessionId,
      lore_bible: [
        `Svět: ${worldName}`, `Stát: ${countryInfo.name}`, `Premisa: ${premise}`, `Tón: ${tone}`,
        realmName ? `Říše: ${realmName}` : "", cultureName ? `Kultura: ${cultureName}` : "",
        languageName ? `Jazyk: ${languageName}` : "", legendaryNames ? `Legendy: ${legendaryNames}` : "",
        `\n--- LORE BIBLE ---\n${loreBible}`,
      ].filter(Boolean).join("\n"),
      prompt_rules: JSON.stringify({
        world_vibe: tone, writing_style: writingStyle,
        constraints: tone === "realistic" ? "avoid random magic unless selected" : "",
        language_name: languageName || "", culture_name: cultureName || "",
        player_realm_name: realmName || "", country_name: countryInfo.name,
      }),
      updated_at: new Date().toISOString(),
    }, { onConflict: "session_id" });

    // ═══ STEP N: Wiki profiles, images, hex gen ═══

    // AI wiki profiles for top cities
    let wikiGenerated = 0;
    let citiesToGenerate: any[] = [];
    if (isCheapStart) {
      const playerCity = createdCityRows.find(c => c.isPlayer);
      const pq = playerCity?.q ?? 0, pr = playerCity?.r ?? 0;
      const hexDist = (c: any) => (Math.abs(c.q - pq) + Math.abs(c.q - pq + c.r - pr) + Math.abs(c.r - pr)) / 2;
      citiesToGenerate = [...createdCityRows].sort((a, b) => hexDist(a) - hexDist(b)).slice(0, topProfilesCount);
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
            headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
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

    // Region images (best effort)
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
              imagePrompt: region?.imagePrompt || `A medieval illuminated manuscript illustration of ${regionName}`,
              createdBy: "world-generate",
            }),
          }).then(async (res) => {
            if (res.ok) {
              const d = await res.json();
              if (d.imageUrl) await supabase.from("wiki_entries").update({ image_url: d.imageUrl } as any)
                .eq("session_id", sessionId).eq("entity_type", "region").eq("entity_id", regionId);
            }
          }).catch(err => console.warn("Region image failed:", regionName, err));
        })
      );
    }

    // Person & wonder images (best effort, batched)
    const imageTargets: { entityId: string; entityType: string; entityName: string; imagePrompt: string; kind: string }[] = [];
    for (const p of world.persons || []) {
      const pId = personIdMap[p.name];
      if (pId && p.imagePrompt) imageTargets.push({ entityId: pId, entityType: "person", entityName: p.name, imagePrompt: p.imagePrompt, kind: "portrait" });
    }
    for (const w of world.wonders || []) {
      const { data: wd } = await supabase.from("wonders").select("id").eq("session_id", sessionId).eq("name", w.name).maybeSingle();
      if (wd && w.imagePrompt) imageTargets.push({ entityId: wd.id, entityType: "wonder", entityName: w.name, imagePrompt: w.imagePrompt, kind: "cover" });
    }

    for (let i = 0; i < imageTargets.length; i += 4) {
      const batch = imageTargets.slice(i, i + 4);
      await Promise.allSettled(batch.map(t =>
        fetch(`${supabaseUrl}/functions/v1/generate-entity-media`, {
          method: "POST",
          headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId, entityId: t.entityId, entityType: t.entityType, entityName: t.entityName,
            kind: t.kind, imagePrompt: t.imagePrompt, createdBy: "world-generate",
          }),
        }).catch(e => console.warn(`Image gen failed: ${t.entityName}`, e))
      ));
    }

    // World summary
    await supabase.from("ai_world_summaries").insert({
      session_id: sessionId, summary_type: "world_state",
      turn_range_from: 0, turn_range_to: 1,
      summary_text: `Stát ${countryInfo.name}: ${premise}. ${counters.factions} frakcí, ${counters.cities} měst, ${counters.regions} regionů, ${counters.provinces} provincií, ${counters.persons} osobností, ${counters.wonders} divů, ${counters.legendary} prehistorických událostí, ${counters.battles} bitev, ${counters.links} propojení.`,
      key_facts: world.worldMemories || [],
    });

    // Orphan cleanup
    const { data: allWiki } = await supabase.from("wiki_entries")
      .select("id, entity_id, entity_type").eq("session_id", sessionId).eq("entity_type", "city");
    let orphansDeleted = 0;
    if (allWiki) {
      const validCityIds = new Set(Object.values(cityIdMap));
      for (const w of allWiki) {
        if (!validCityIds.has(w.entity_id)) {
          await supabase.from("wiki_entries").delete().eq("id", w.id);
          orphansDeleted++;
        }
      }
    }

    // ═══ PROVINCE HEX DISCOVERIES ═══
    // Map already generated in STEP D-pre. Province hexes already linked in STEP D.
    // Now create discoveries for each player's province hexes.
    try {
      const allPlayerNames = Object.values(factionPlayerMap);
      for (const pn of allPlayerNames) {
        const playerProvEntries = allProvinceHexEntries.filter((e: any) => {
          for (const region of world.regions || []) {
            const ownerPlayer = factionPlayerMap[region.controlledBy] || playerName;
            if (ownerPlayer !== pn) continue;
            for (const prov of region.provinces || []) {
              if (provinceIdMap[prov.name] === e.province_id) return true;
            }
          }
          return false;
        });

        if (playerProvEntries.length === 0) continue;

        const coords = playerProvEntries.map((e: any) => `and(q.eq.${e.q},r.eq.${e.r})`);
        const COORD_BATCH = 50;
        for (let i = 0; i < coords.length; i += COORD_BATCH) {
          const batch = coords.slice(i, i + COORD_BATCH);
          const { data: hexData } = await supabase.from("province_hexes")
            .select("id")
            .eq("session_id", sessionId)
            .or(batch.join(","));

          if (hexData && hexData.length > 0) {
            const discRows = hexData.map((h: any) => ({
              session_id: sessionId, player_name: pn, entity_type: "province_hex",
              entity_id: h.id, source: "world_init",
            }));
            await supabase.from("discoveries").upsert(discRows, {
              onConflict: "session_id,player_name,entity_type,entity_id",
            });
          }
        }
      }
    } catch (hexErr) { console.warn("Hex discovery warning:", hexErr); }

    // ═══ Extract structured civ identity (AWAIT so we can apply structural bonuses to cities) ═══
    const { data: civForIdentity } = await supabase.from("civilizations")
      .select("core_myth, cultural_quirk, architectural_style")
      .eq("session_id", sessionId).eq("player_name", playerName).maybeSingle();

    const { data: civCfgForIdentity } = await supabase.from("player_civ_configs")
      .select("civ_description")
      .eq("session_id", sessionId).eq("player_name", playerName).maybeSingle();

    if (civCfgForIdentity?.civ_description) {
      try {
        const { data: extractResult } = await supabase.functions.invoke("extract-civ-identity", {
          body: {
            sessionId,
            playerName,
            civDescription: civCfgForIdentity.civ_description,
            coreMythText: civForIdentity?.core_myth || null,
            culturalQuirkText: civForIdentity?.cultural_quirk || null,
            architecturalStyleText: civForIdentity?.architectural_style || null,
          },
        });

        // Apply structural bonuses to all player cities at game start
        if (extractResult?.ok) {
          const { data: identity } = await supabase.from("civ_identity")
            .select("urban_style, society_structure, military_doctrine, economic_focus, initial_burgher_ratio, initial_cleric_ratio, stability_modifier")
            .eq("session_id", sessionId).eq("player_name", playerName).maybeSingle();

          if (identity) {
            // Compute structural bonuses
            const sb = computeStructuralBonusesInline(identity);
            const { data: playerCities } = await supabase.from("cities")
              .select("id, population_total, population_peasants, population_burghers, population_clerics, city_stability, housing_capacity")
              .eq("session_id", sessionId).eq("owner_player", playerName);

            for (const c of (playerCities || [])) {
              const pop = c.population_total;
              // Adjust population ratios with structural + numeric bonuses
              const burgherShift = sb.burgher_ratio_bonus + (identity.initial_burgher_ratio || 0);
              const clericShift = sb.cleric_ratio_bonus + (identity.initial_cleric_ratio || 0);
              const basePeasantRatio = 0.80;
              const baseBurgherRatio = 0.15;
              const baseClericRatio = 0.05;
              const adjBurgher = Math.max(0.05, Math.min(0.6, baseBurgherRatio + burgherShift));
              const adjCleric = Math.max(0.02, Math.min(0.4, baseClericRatio + clericShift));
              const adjPeasant = Math.max(0.1, 1 - adjBurgher - adjCleric);
              const newBurghers = Math.round(pop * adjBurgher);
              const newClerics = Math.round(pop * adjCleric);
              const newPeasants = pop - newBurghers - newClerics;

              // Housing capacity with structural multiplier
              const baseHousing = c.housing_capacity || 500;
              const adjHousing = Math.round(baseHousing * sb.housing_capacity_mult);

              // Stability with structural bonus
              const adjStability = Math.max(0, Math.min(100, (c.city_stability || 60) + sb.stability_bonus + (identity.stability_modifier || 0)));

              await supabase.from("cities").update({
                population_peasants: newPeasants,
                population_burghers: newBurghers,
                population_clerics: newClerics,
                housing_capacity: adjHousing,
                city_stability: adjStability,
              }).eq("id", c.id);
            }
          }
        }
      } catch (e) {
        console.warn("civ identity extraction failed:", e);
      }
    }

    // Set session ready
    await supabase.from("game_sessions").update({ current_turn: 1, init_status: "ready" }).eq("id", sessionId);

    // Logging
    await supabase.from("world_action_log").insert({
      session_id: sessionId, player_name: "system", turn_number: 1, action_type: "other",
      description: `AI svět s hlubokou prehistorií: ${counters.countries} stát, ${counters.factions} frakcí, ${counters.cities} měst, ${counters.regions} regionů, ${counters.provinces} provincií, ${counters.persons} osobností, ${counters.wonders} divů, ${counters.legendary} prehistorických událostí, ${counters.battles} bitev, ${counters.events} událostí, ${counters.links} propojení, ${counters.wiki} wiki, ${wikiGenerated} AI profilů, ${counters.rumors} pověstí.`,
    });

    await supabase.from("simulation_log").insert({
      session_id: sessionId, year_start: 0, year_end: 1,
      events_generated: counters.events + counters.legendary + counters.battles,
      scope: "world_generate_init", triggered_by: "ai_wizard",
    });

    return new Response(JSON.stringify({
      ...counters, wikiProfilesGenerated: wikiGenerated, orphansDeleted,
      mode: economic.world_gen_mode, diplomacyRoomsCreated,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("world-generate-init error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
