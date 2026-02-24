import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callAI(apiKey: string, messages: any[], tools?: any[], toolChoice?: any) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages,
      ...(tools ? { tools, tool_choice: toolChoice } : {}),
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI ${res.status}: ${t.substring(0, 200)}`);
  }
  return res.json();
}

const HEX_COORDS: [number, number][] = [
  [0,0],[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1],
  [0,2],[1,2],[2,2],[3,2],[0,3],[1,3],[2,3],[3,3],
  [0,4],[1,4],[2,4],[3,4],[0,5],[1,5],[2,5],[3,5],
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("LOVABLE_API_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  let sessionId = "";

  try {
    const { worldPrompt, nationPrompt, playerName, userId, epochStyle = "kroniky" } = await req.json();
    if (!worldPrompt || !playerName || !userId) throw new Error("Missing required fields");

    const roomCode = crypto.randomUUID().substring(0, 6).toUpperCase();
    sessionId = crypto.randomUUID();

    // ===== 1. CREATE SESSION =====
    const { error: sessErr } = await supabase.from("game_sessions").insert({
      id: sessionId,
      room_code: roomCode,
      player1_name: playerName,
      current_turn: 25,
      max_players: 10,
      created_by: userId,
      epoch_style: epochStyle,
      game_mode: "tb_multi",
      init_status: "generating",
      world_seed: crypto.randomUUID(),
    });
    if (sessErr) throw new Error(`Session: ${sessErr.message}`);

    await supabase.from("world_foundations").insert({
      session_id: sessionId,
      world_name: worldPrompt.substring(0, 60) || "Promo Svět",
      premise: worldPrompt,
      tone: "mythic",
      victory_style: "story",
      created_by: userId,
    });

    // ===== 2. AI CALL — GENERATE ENTIRE WORLD =====
    const toolSchema = {
      type: "function",
      function: {
        name: "create_world",
        description: "Generate a complete world for a strategy chronicle game with deep pre-history",
        parameters: {
          type: "object",
          properties: {
            ai_players: {
              type: "array",
              description: "3 AI player characters",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  civ_name: { type: "string" },
                  personality: { type: "string" },
                  core_myth: { type: "string" },
                },
                required: ["name", "civ_name", "personality"],
              },
            },
            states: {
              type: "array",
              description: "2 kingdoms/states",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  ruler: { type: "string" },
                  tags: { type: "array", items: { type: "string" } },
                  is_player: { type: "boolean" },
                  image_prompt: { type: "string", description: "English prompt for a medieval illuminated map/crest illustration of this kingdom" },
                },
                required: ["name", "description", "ruler", "is_player", "image_prompt"],
              },
            },
            provinces: {
              type: "array",
              description: "8 provinces (4 per state), state_idx 0 or 1",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  state_idx: { type: "integer" },
                  terrain: { type: "string" },
                  description: { type: "string" },
                  tags: { type: "array", items: { type: "string" } },
                  image_prompt: { type: "string", description: "English prompt for a medieval illuminated landscape illustration of this province" },
                },
                required: ["name", "state_idx", "terrain", "description", "image_prompt"],
              },
            },
            settlements: {
              type: "array",
              description: "24 settlements: per province 1 CITY, 1 HAMLET, 1 CASTLE. founded_year in 1..20",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  province_idx: { type: "integer" },
                  type: { type: "string", enum: ["CITY", "HAMLET", "CASTLE"] },
                  founded_year: { type: "integer" },
                  description: { type: "string" },
                  tags: { type: "array", items: { type: "string" } },
                  image_prompt: { type: "string", description: "English prompt for a medieval illuminated illustration of this settlement" },
                },
                required: ["name", "province_idx", "type", "founded_year", "description", "image_prompt"],
              },
            },
            persons: {
              type: "array",
              description: "At least 10 notable persons: leaders, generals, merchants, spies, priests, prophets, founders. At least 5 must be legendary pre-history figures.",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  person_type: { type: "string" },
                  faction: { type: "string", description: "player name who owns this person" },
                  born_year: { type: "integer", description: "Can be negative for pre-history figures (e.g. -50)" },
                  died_year: { type: "integer", description: "null if alive" },
                  bio: { type: "string", description: "Detailed 3-5 sentence biography" },
                  flavor_trait: { type: "string" },
                  home_city_name: { type: "string" },
                  image_prompt: { type: "string", description: "English prompt for a medieval illuminated portrait of this person" },
                },
                required: ["name", "person_type", "faction", "born_year", "bio", "image_prompt"],
              },
            },
            wonders: {
              type: "array",
              description: "4 world wonders in different provinces",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  province_idx: { type: "integer" },
                  city_name: { type: "string" },
                  description: { type: "string" },
                  bonus: { type: "string" },
                  memory_fact: { type: "string" },
                  image_prompt: { type: "string", description: "English prompt for a medieval illuminated illustration of this wonder" },
                },
                required: ["name", "province_idx", "description", "image_prompt"],
              },
            },
            pre_history_events: {
              type: "array",
              description: "10-15 legendary events from BEFORE recorded history (years -100 to 0). These are myths, legends, founding stories, ancient battles, prophecies, and cataclysms that shaped the world. They must reference persons, places, and each other to form a coherent mythology.",
              items: {
                type: "object",
                properties: {
                  year: { type: "integer", description: "Negative year, e.g. -80, -50, -20" },
                  title: { type: "string" },
                  description: { type: "string", description: "3-5 sentences describing this legendary event" },
                  event_type: { type: "string", enum: ["founding", "battle", "prophecy", "cataclysm", "migration", "divine", "betrayal", "alliance", "discovery"] },
                  location_name: { type: "string", description: "Settlement name where this happened" },
                  affected_players: { type: "array", items: { type: "string" } },
                  importance: { type: "string", enum: ["high", "critical"] },
                  legacy_impact: { type: "string", description: "How this event still affects the world in year 25" },
                  related_person_name: { type: "string", description: "Name of person involved (from persons array)" },
                },
                required: ["year", "title", "description", "event_type", "location_name", "importance", "legacy_impact"],
              },
            },
            events: {
              type: "array",
              description: "20 historical events across years 1-25, must logically follow from pre_history_events",
              items: {
                type: "object",
                properties: {
                  year: { type: "integer" },
                  title: { type: "string" },
                  description: { type: "string" },
                  event_type: { type: "string" },
                  location_name: { type: "string" },
                  affected_players: { type: "array", items: { type: "string" } },
                  importance: { type: "string", enum: ["normal", "high", "critical"] },
                },
                required: ["year", "title", "description", "event_type", "location_name"],
              },
            },
            battles: {
              type: "array",
              description: "20 battles: 5 legendary pre-history battles (negative years) + 15 across years 1-25. All must reference commanders from persons array.",
              items: {
                type: "object",
                properties: {
                  year: { type: "integer" },
                  name: { type: "string" },
                  location_name: { type: "string" },
                  attacker_commander: { type: "string" },
                  defender_commander: { type: "string" },
                  attacker_faction: { type: "string" },
                  defender_faction: { type: "string" },
                  outcome: { type: "string" },
                  casualties: { type: "string" },
                  description: { type: "string" },
                },
                required: ["year", "name", "location_name", "outcome", "description"],
              },
            },
            pre_history_chronicle: {
              type: "string",
              description: "A 500-800 word Czech chronicle entry for Turn 0: 'Před počátkem paměti'. This is a legendary retelling of all pre-history events, written as if by an ancient chronicler who gathered fragments from oral tradition, ruins, and prophecies. It must reference all pre_history_events, key persons, and battles. Written in medieval chronicle style.",
            },
            chronicles: {
              type: "array",
              description: "30 chronicle entries covering years 1-25 of history",
              items: {
                type: "object",
                properties: {
                  turn_from: { type: "integer" },
                  turn_to: { type: "integer" },
                  text: { type: "string" },
                },
                required: ["turn_from", "turn_to", "text"],
              },
            },
            rumors: {
              type: "array",
              description: "40+ court whispers & field reports. At least 10 must reference pre-history legends. All must reference real city names from settlements. Mix of tones: warnings about ancient curses, celebrations of legendary victories, intrigue about prophecy fulfillment, neutral historical gossip.",
              items: {
                type: "object",
                properties: {
                  year: { type: "integer", description: "Can be 0 for pre-history rumors" },
                  text: { type: "string", description: "1-3 sentences starting with 'Povídá se...', 'Šušká se...', 'V ulicích se proslýchá...' etc." },
                  tone_tag: { type: "string", enum: ["neutral", "warning", "intrigue", "celebration"] },
                  related_city_name: { type: "string" },
                },
                required: ["year", "text", "tone_tag", "related_city_name"],
              },
            },
            lore_bible: {
              type: "string",
              description: "A 200-300 word summary of the world's core lore, mythology, and themes. This serves as the reference document for all future AI generation in this world.",
            },
          },
          required: ["ai_players", "states", "provinces", "settlements", "persons", "wonders", "pre_history_events", "events", "battles", "pre_history_chronicle", "chronicles", "rumors", "lore_bible"],
        },
      },
    };

    const styleLabel = epochStyle === "myty" ? "mytologický" : epochStyle === "moderni" ? "moderní zpravodajský" : "středověký kronikářský";

    const aiResult = await callAI(
      apiKey,
      [
        {
          role: "system",
          content: `Jsi tvůrce fantasy/historických světů pro strategickou kronikářskou hru. Generuješ kompletní svět po 25 letech existence S HLUBOKOU PREHISTORIÍ.
Všechny texty MUSÍ být v češtině. Jména mohou být fantasy/historická.
Styl: ${styleLabel}.

KRITICKÉ POŽADAVKY:
1. Svět musí mít BOHATOU PREHISTORII — legendy, mýty, proroctví, dávné bitvy a zakladatele, kteří formovali svět PŘED rokem 1.
2. Všechny entity musí být VZÁJEMNĚ PROPOJENÉ. Bitvy odkazují na konkrétní velitele z persons. Události ovlivňují konkrétní města. Zvěsti odkazují na reálné entity a prehistorické legendy.
3. Osobnosti musí zahrnovat LEGENDÁRNÍ POSTAVY z prehistorie (záporné roky narození) — praotce, proroky, dávné válečníky, mytické zakladatele.
4. Pre-history events tvoří KOHERENTNÍ MYTOLOGII — události na sebe navazují, vysvětlují existenci států, rivalit a tradic.
5. Zvěsti musí reflektovat prehistorii — šepoty o dávných kletbách, proroctvích, ztracených artefaktech.
6. Každá entita (město, provincie, stát, osoba, div) MUSÍ mít image_prompt v angličtině pro ilustraci ve stylu středověkých iluminovaných rukopisů.
7. Lore Bible musí shrnout celou mytologii světa.

Hráčova civilizace: "${nationPrompt || "neuvedeno"}" — hráč "${playerName}" vlastní první stát.
AI hráči vlastní druhý stát a jsou nezávislí aktéři.`,
        },
        {
          role: "user",
          content: `Vygeneruj kompletní svět: "${worldPrompt}"

Požadavky:
- 2 státy: #0 patří hráči "${playerName}", #1 je AI rivalský stát. Oba s image_prompt.
- 3 AI hráče s unikátními jmény, národy a osobnostmi
- 8 provincií (4 na stát), state_idx = 0 nebo 1. Každá s image_prompt.
- 24 sídel: pro každou provincii přesně 1 CITY, 1 HAMLET, 1 CASTLE. Různé roky založení (1-20). Každé s image_prompt.
- MINIMÁLNĚ 10 osobností: 5+ LEGENDÁRNÍCH postav z prehistorie (born_year záporný), + současní vůdci, generálové, kupci, kněží. Všechny s image_prompt a detailním bio.
- 4 divy světa v různých provinciích, s image_prompt
- 10-15 PREHISTORICKÝCH UDÁLOSTÍ (roky -100 až 0): mýty, legendy, založení, proroctví, dávné bitvy, katastrofy. Každá s legacy_impact.
- 20 událostí rozložených přes roky 1-25 logicky navazujících na prehistorii
- 20 bitev: 5 legendárních (záporné roky) + 15 přes roky 1-25. S veliteli z persons.
- pre_history_chronicle: Kronika "Před počátkem paměti" (500-800 slov), středověký styl, shrnující veškeré prehistorické události.
- 30 kronikových zápisů pokrývajících roky 1-25
- 40+ zvěstí: 10+ o prehistorii, zbytek o současnosti. Všechny navázané na konkrétní related_city_name z settlements.
- lore_bible: 200-300 slov shrnutí celé mytologie světa.

DŮLEŽITÉ: affected_players a faction musí používat přesná jména: "${playerName}" nebo jména AI hráčů.
Kroniky musí používat skutečná jména míst, osob a událostí z vygenerovaných dat.`,
        },
      ],
      [toolSchema],
      { type: "function", function: { name: "create_world" } }
    );

    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("AI did not return structured data");
    const world = JSON.parse(toolCall.function.arguments);

    if (!world.states?.length || !world.provinces?.length || !world.settlements?.length) {
      throw new Error("AI returned incomplete world data");
    }

    // ===== 3. INSERT PLAYERS =====
    const aiPlayerNames = (world.ai_players || []).map((ap: any) => ap.name);
    const allPlayers = [playerName, ...aiPlayerNames];

    await supabase.from("game_players").insert({
      session_id: sessionId, player_name: playerName, player_number: 1, user_id: userId,
    });
    await supabase.from("game_memberships").insert({
      user_id: userId, session_id: sessionId, player_name: playerName, role: "admin",
    });

    const aiPlayerInserts = aiPlayerNames.map((name: string, i: number) => ({
      session_id: sessionId, player_name: name, player_number: i + 2,
    }));
    if (aiPlayerInserts.length) await supabase.from("game_players").insert(aiPlayerInserts);

    const civInserts = [
      { session_id: sessionId, player_name: playerName, civ_name: nationPrompt || playerName, is_ai: false },
      ...(world.ai_players || []).map((ap: any) => ({
        session_id: sessionId, player_name: ap.name, civ_name: ap.civ_name,
        is_ai: true, ai_personality: ap.personality, core_myth: ap.core_myth || null,
      })),
    ];
    await supabase.from("civilizations").insert(civInserts);

    // Player resources
    const resourceInserts: any[] = [];
    const rtDefaults: Record<string, any> = {
      food: { income: 4, upkeep: 2, stockpile: 10 },
      wood: { income: 3, upkeep: 1, stockpile: 5 },
      stone: { income: 2, upkeep: 0, stockpile: 3 },
      iron: { income: 1, upkeep: 0, stockpile: 2 },
      wealth: { income: 2, upkeep: 1, stockpile: 5 },
    };
    for (const pn of allPlayers) {
      for (const [rt, vals] of Object.entries(rtDefaults)) {
        resourceInserts.push({ session_id: sessionId, player_name: pn, resource_type: rt, ...vals });
      }
    }
    await supabase.from("player_resources").insert(resourceInserts);

    // ===== 4. INSERT COUNTRIES =====
    const getOwner = (stateIdx: number) => {
      const s = world.states[stateIdx];
      return s?.is_player ? playerName : (aiPlayerNames[0] || playerName);
    };

    const countryInserts = world.states.map((s: any) => ({
      id: crypto.randomUUID(),
      session_id: sessionId,
      name: s.name,
      ruler_player: s.is_player ? playerName : aiPlayerNames[0],
      description: s.description,
      ai_description: s.description,
      image_prompt: s.image_prompt || null,
      tags: s.tags || [],
    }));
    const { data: countriesData } = await supabase.from("countries").insert(countryInserts).select("id");
    const countryIds = countriesData?.map((c: any) => c.id) || [];

    // ===== 5. INSERT REGIONS & PROVINCES =====
    const regionInserts = world.provinces.map((p: any, i: number) => ({
      id: crypto.randomUUID(),
      session_id: sessionId,
      name: `Region ${p.name}`,
      description: p.description,
      ai_description: p.description,
      owner_player: getOwner(p.state_idx || 0),
      biome: p.terrain || "plains",
      is_homeland: true,
      discovered_turn: 1,
      discovered_by: getOwner(p.state_idx || 0),
      country_id: countryIds[p.state_idx || 0] || countryIds[0] || null,
      tags: p.tags || [],
    }));
    const { data: regionsData } = await supabase.from("regions").insert(regionInserts).select("id");
    const regionIds = regionsData?.map((r: any) => r.id) || [];

    const provinceInserts = world.provinces.map((p: any, i: number) => ({
      id: crypto.randomUUID(),
      session_id: sessionId,
      name: p.name,
      owner_player: getOwner(p.state_idx || 0),
      region_id: regionIds[i] || null,
      description: p.description,
      ai_description: p.description,
      tags: p.tags || [],
    }));
    const { data: provincesData } = await supabase.from("provinces").insert(provinceInserts).select("id, name");
    const provinceMap: Record<number, { id: string; name: string }> = {};
    provincesData?.forEach((p: any, i: number) => { provinceMap[i] = { id: p.id, name: world.provinces[i]?.name || p.name }; });

    // ===== 6. INSERT SETTLEMENTS =====
    const cityInserts = world.settlements.map((s: any, i: number) => {
      const pIdx = s.province_idx ?? 0;
      const stateIdx = world.provinces[pIdx]?.state_idx ?? 0;
      const owner = getOwner(stateIdx);
      const coord = HEX_COORDS[i] || [i % 6, Math.floor(i / 6)];
      const levelMap: Record<string, string> = { CITY: "Město", HAMLET: "Osada", CASTLE: "Hrad" };
      return {
        id: crypto.randomUUID(),
        session_id: sessionId,
        name: s.name,
        owner_player: owner,
        province: provinceMap[pIdx]?.name || "",
        province_id: provinceMap[pIdx]?.id || null,
        level: levelMap[s.type] || "Osada",
        settlement_level: s.type || "HAMLET",
        founded_round: s.founded_year || 1,
        tags: s.tags || [],
        flavor_prompt: s.description,
        status: "ok",
        province_q: coord[0],
        province_r: coord[1],
      };
    });
    const { data: citiesData } = await supabase.from("cities").insert(cityInserts).select("id, name");
    const cityIdMap: Record<string, string> = {};
    citiesData?.forEach((c: any) => { cityIdMap[c.name] = c.id; });

    // ===== 7. INSERT PERSONS =====
    const personInserts = (world.persons || []).map((p: any) => ({
      id: crypto.randomUUID(),
      session_id: sessionId,
      name: p.name,
      person_type: p.person_type || "Generál",
      player_name: allPlayers.includes(p.faction) ? p.faction : playerName,
      born_round: p.born_year || 1,
      died_round: p.died_year || null,
      bio: p.bio,
      flavor_trait: p.flavor_trait || null,
      is_alive: !p.died_year || p.died_year > 25,
      city_id: cityIdMap[p.home_city_name || ""] || null,
      image_prompt: p.image_prompt || null,
    }));
    const { data: personsData } = await supabase.from("great_persons").insert(personInserts).select("id, name");
    const personIdMap: Record<string, string> = {};
    personsData?.forEach((p: any) => { personIdMap[p.name] = p.id; });

    // ===== 8. INSERT WONDERS =====
    const wonderInserts = (world.wonders || []).map((w: any) => {
      const pIdx = w.province_idx ?? 0;
      const stateIdx = world.provinces[pIdx]?.state_idx ?? 0;
      return {
        session_id: sessionId,
        name: w.name,
        owner_player: getOwner(stateIdx),
        city_name: w.city_name || null,
        description: w.description,
        bonus: w.bonus || null,
        memory_fact: w.memory_fact || null,
        image_prompt: w.image_prompt || null,
        status: "completed",
      };
    });
    if (wonderInserts.length) await supabase.from("wonders").insert(wonderInserts);

    // ===== 9. INSERT ALL EVENTS (pre-history + history) + WORLD_EVENTS =====
    const gameEventInserts: any[] = [];
    const worldEventInserts: any[] = [];

    // Pre-history events (year <= 0)
    for (const evt of (world.pre_history_events || [])) {
      const cityId = cityIdMap[evt.location_name] || null;
      gameEventInserts.push({
        session_id: sessionId,
        event_type: evt.event_type || "founding",
        player: (evt.affected_players || [])[0] || playerName,
        location: evt.location_name,
        note: evt.description,
        turn_number: 0, // All pre-history stored as turn 0
        confirmed: true,
        importance: evt.importance || "high",
        city_id: cityId,
      });
      worldEventInserts.push({
        session_id: sessionId,
        title: evt.title,
        slug: `prehistory-${Math.abs(evt.year)}-${crypto.randomUUID().substring(0, 8)}`,
        summary: evt.description,
        event_category: evt.event_type || "founding",
        created_turn: 0,
        date: `Rok ${evt.year} (před počátkem paměti)`,
        status: "published",
        affected_players: evt.affected_players || [],
        location_id: cityId,
      });
    }

    // Regular events (years 1-25)
    for (const evt of (world.events || [])) {
      const cityId = cityIdMap[evt.location_name] || null;
      gameEventInserts.push({
        session_id: sessionId,
        event_type: evt.event_type || "general",
        player: (evt.affected_players || [])[0] || playerName,
        location: evt.location_name,
        note: evt.description,
        turn_number: evt.year || 1,
        confirmed: true,
        importance: evt.importance || "normal",
        city_id: cityId,
      });
      worldEventInserts.push({
        session_id: sessionId,
        title: evt.title,
        slug: `evt-${evt.year}-${crypto.randomUUID().substring(0, 8)}`,
        summary: evt.description,
        event_category: evt.event_type || "general",
        created_turn: evt.year || 1,
        date: `Rok ${evt.year}`,
        status: "published",
        affected_players: evt.affected_players || [],
        location_id: cityId,
      });
    }

    // Battles (including pre-history)
    for (const b of (world.battles || [])) {
      const cityId = cityIdMap[b.location_name] || null;
      const turnNum = b.year <= 0 ? 0 : b.year;
      gameEventInserts.push({
        session_id: sessionId,
        event_type: "battle",
        player: b.attacker_faction || playerName,
        location: b.location_name,
        note: b.description,
        turn_number: turnNum,
        confirmed: true,
        importance: "high",
        city_id: cityId,
        result: b.outcome,
        casualties: b.casualties || null,
      });
      worldEventInserts.push({
        session_id: sessionId,
        title: `Bitva: ${b.name}`,
        slug: `battle-${b.year}-${crypto.randomUUID().substring(0, 8)}`,
        summary: b.description,
        event_category: "battle",
        created_turn: turnNum,
        date: b.year <= 0 ? `Rok ${b.year} (před počátkem paměti)` : `Rok ${b.year}`,
        status: "published",
        affected_players: [b.attacker_faction, b.defender_faction].filter(Boolean),
        location_id: cityId,
      });
    }

    if (gameEventInserts.length) await supabase.from("game_events").insert(gameEventInserts);
    if (worldEventInserts.length) await supabase.from("world_events").insert(worldEventInserts);

    // ===== 10. INSERT CHRONICLES (including pre-history) =====
    const allChronicleInserts: any[] = [];

    // Turn 0 chronicle — "Před počátkem paměti"
    if (world.pre_history_chronicle) {
      allChronicleInserts.push({
        session_id: sessionId,
        text: world.pre_history_chronicle,
        epoch_style: epochStyle,
        turn_from: 0,
        turn_to: 0,
      });
    }

    // Regular chronicles
    for (const ch of (world.chronicles || [])) {
      allChronicleInserts.push({
        session_id: sessionId,
        text: ch.text,
        epoch_style: epochStyle,
        turn_from: ch.turn_from || 1,
        turn_to: ch.turn_to || 25,
      });
    }
    if (allChronicleInserts.length) await supabase.from("chronicle_entries").insert(allChronicleInserts);

    // ===== 11. INSERT RUMORS =====
    const allCityNames = Object.keys(cityIdMap);
    const allCityIdValues = Object.values(cityIdMap);
    const rumorInserts = (world.rumors || []).map((r: any) => {
      const cName = r.related_city_name && cityIdMap[r.related_city_name]
        ? r.related_city_name
        : allCityNames[Math.floor(Math.random() * allCityNames.length)] || "";
      const cId = cityIdMap[cName] || allCityIdValues[0] || crypto.randomUUID();
      return {
        session_id: sessionId,
        city_id: cId,
        city_name: cName,
        text: r.text,
        tone_tag: r.tone_tag || "neutral",
        turn_number: r.year <= 0 ? 0 : (r.year || 1),
        created_by: "system",
      };
    });
    if (rumorInserts.length) await supabase.from("city_rumors").insert(rumorInserts);

    // ===== 12. UPDATE WIKI ENTRIES WITH DESCRIPTIONS AND IMAGE PROMPTS =====
    // Cities
    for (const s of world.settlements) {
      const cId = cityIdMap[s.name];
      if (!cId) continue;
      await supabase.from("wiki_entries")
        .update({
          summary: (s.description || "").substring(0, 200),
          ai_description: s.description,
          tags: s.tags || [],
          image_prompt: s.image_prompt || null,
        })
        .eq("session_id", sessionId).eq("entity_id", cId);
    }
    // Countries
    for (let i = 0; i < world.states.length; i++) {
      if (!countryIds[i]) continue;
      await supabase.from("wiki_entries")
        .update({
          summary: (world.states[i].description || "").substring(0, 200),
          ai_description: world.states[i].description,
          tags: world.states[i].tags || [],
          image_prompt: world.states[i].image_prompt || null,
        })
        .eq("session_id", sessionId).eq("entity_id", countryIds[i]);
    }
    // Provinces
    for (let i = 0; i < world.provinces.length; i++) {
      const pId = provinceMap[i]?.id;
      if (!pId) continue;
      await supabase.from("wiki_entries")
        .update({
          summary: (world.provinces[i].description || "").substring(0, 200),
          ai_description: world.provinces[i].description,
          tags: world.provinces[i].tags || [],
          image_prompt: world.provinces[i].image_prompt || null,
        })
        .eq("session_id", sessionId).eq("entity_id", pId);
    }
    // Persons
    for (const p of world.persons || []) {
      const pId = personIdMap[p.name];
      if (!pId) continue;
      await supabase.from("wiki_entries")
        .update({
          summary: (p.bio || "").substring(0, 200),
          ai_description: p.bio,
          tags: [p.person_type, p.flavor_trait].filter(Boolean),
          image_prompt: p.image_prompt || null,
        })
        .eq("session_id", sessionId).eq("entity_id", pId);
    }
    // Wonders
    const { data: wondersData } = await supabase.from("wonders").select("id, name").eq("session_id", sessionId);
    for (const wd of wondersData || []) {
      const wDef = (world.wonders || []).find((w: any) => w.name === wd.name);
      const { data: existing } = await supabase.from("wiki_entries")
        .select("id").eq("session_id", sessionId).eq("entity_id", wd.id).maybeSingle();
      if (existing) {
        await supabase.from("wiki_entries").update({
          summary: (wDef?.description || "").substring(0, 200),
          ai_description: wDef?.description,
          tags: ["wonder"],
          image_prompt: wDef?.image_prompt || null,
        }).eq("id", existing.id);
      } else {
        await supabase.from("wiki_entries").insert({
          session_id: sessionId, entity_type: "wonder", entity_id: wd.id,
          entity_name: wd.name, owner_player: playerName,
          summary: (wDef?.description || "").substring(0, 200),
          ai_description: wDef?.description,
          tags: ["wonder"],
          image_prompt: wDef?.image_prompt || null,
        });
      }
    }

    // ===== 13. INSERT WORLD MEMORIES (including pre-history legacy impacts) =====
    const memoryInserts: any[] = [
      ...world.states.map((s: any) => ({
        session_id: sessionId, text: `Stát ${s.name}: ${(s.description || "").substring(0, 100)}`,
        approved: true, category: "tradition", created_round: 1,
      })),
      ...(world.wonders || []).map((w: any) => ({
        session_id: sessionId, text: `Div světa ${w.name}: ${w.memory_fact || (w.description || "").substring(0, 80)}`,
        approved: true, category: "tradition", created_round: 1,
      })),
      // Pre-history legacy impacts as historical scars
      ...(world.pre_history_events || []).filter((e: any) => e.legacy_impact).map((e: any) => ({
        session_id: sessionId,
        text: `${e.title}: ${e.legacy_impact}`,
        approved: true,
        category: "historical_scar",
        created_round: 0,
      })),
    ];
    if (memoryInserts.length) await supabase.from("world_memories").insert(memoryInserts);

    // ===== 14. INSERT FEED ITEMS =====
    const feedInserts = [
      // Pre-history gossip
      ...(world.pre_history_events || []).slice(0, 5).map((e: any) => ({
        session_id: sessionId, turn_number: 0, feed_type: "gossip",
        content: `Z dávných legend: ${e.title}`, importance: "high",
      })),
      // Regular events
      ...(world.events || []).slice(0, 10).map((e: any) => ({
        session_id: sessionId, turn_number: e.year || 1, feed_type: "news",
        content: e.title || e.description?.substring(0, 100), importance: "normal",
      })),
      ...(world.battles || []).filter((b: any) => b.year > 0).slice(0, 5).map((b: any) => ({
        session_id: sessionId, turn_number: b.year || 1, feed_type: "news",
        content: `Bitva: ${b.name}`, importance: "high",
      })),
    ];
    if (feedInserts.length) await supabase.from("world_feed_items").insert(feedInserts);

    // ===== 15. GAME STYLE SETTINGS =====
    const loreBible = world.lore_bible || worldPrompt;
    await supabase.from("game_style_settings").insert({
      session_id: sessionId,
      default_style_preset: "medieval_illumination",
      lore_bible: loreBible,
      prompt_rules: JSON.stringify({
        world_vibe: worldPrompt.substring(0, 200),
        writing_style: epochStyle === "myty" ? "epic-saga" : "narrative",
        constraints: `Tón: ${styleLabel}`,
      }),
    });

    // ===== 16. DISCOVERIES =====
    const discoveryInserts: any[] = [];
    for (let i = 0; i < world.provinces.length; i++) {
      const stateIdx = world.provinces[i]?.state_idx ?? 0;
      if (world.states[stateIdx]?.is_player) {
        if (provinceMap[i]?.id) {
          discoveryInserts.push({
            session_id: sessionId, player_name: playerName,
            entity_type: "province", entity_id: provinceMap[i].id, source: "founding",
          });
        }
        if (regionIds[i]) {
          discoveryInserts.push({
            session_id: sessionId, player_name: playerName,
            entity_type: "region", entity_id: regionIds[i], source: "founding",
          });
        }
      }
    }
    for (const s of world.settlements) {
      const pIdx = s.province_idx ?? 0;
      const stateIdx = world.provinces[pIdx]?.state_idx ?? 0;
      if (world.states[stateIdx]?.is_player && cityIdMap[s.name]) {
        discoveryInserts.push({
          session_id: sessionId, player_name: playerName,
          entity_type: "city", entity_id: cityIdMap[s.name], source: "founding",
        });
      }
    }
    if (discoveryInserts.length) await supabase.from("discoveries").insert(discoveryInserts);

    // ===== 17. GENERATE IMAGES FOR KEY ENTITIES (async, best-effort) =====
    // Generate images for wonders, persons (non-avatar), and key cities in parallel batches
    const imageTargets: { entityId: string; entityType: string; entityName: string; imagePrompt: string; owner: string }[] = [];

    // Wonders
    for (const wd of wondersData || []) {
      const wDef = (world.wonders || []).find((w: any) => w.name === wd.name);
      if (wDef?.image_prompt) {
        imageTargets.push({ entityId: wd.id, entityType: "wonder", entityName: wd.name, imagePrompt: wDef.image_prompt, owner: playerName });
      }
    }
    // Persons (portrait, not avatar)
    for (const p of world.persons || []) {
      const pId = personIdMap[p.name];
      if (pId && p.image_prompt) {
        imageTargets.push({ entityId: pId, entityType: "person", entityName: p.name, imagePrompt: p.image_prompt, owner: p.faction || playerName });
      }
    }
    // Capital cities (CITY type only, first 8)
    for (const s of world.settlements.filter((s: any) => s.type === "CITY").slice(0, 8)) {
      const cId = cityIdMap[s.name];
      if (cId && s.image_prompt) {
        imageTargets.push({ entityId: cId, entityType: "city", entityName: s.name, imagePrompt: s.image_prompt, owner: getOwner(world.provinces[s.province_idx]?.state_idx ?? 0) });
      }
    }

    // Fire image generation in parallel batches of 4 (best effort, don't block)
    const BATCH_SIZE = 4;
    for (let i = 0; i < imageTargets.length; i += BATCH_SIZE) {
      const batch = imageTargets.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(batch.map(async (t) => {
        try {
          await fetch(`${supabaseUrl}/functions/v1/generate-entity-media`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sessionId,
              entityId: t.entityId,
              entityType: t.entityType,
              entityName: t.entityName,
              kind: t.entityType === "person" ? "portrait" : "cover",
              imagePrompt: t.imagePrompt,
              createdBy: t.owner,
            }),
          });
        } catch (e) {
          console.error(`Image gen failed for ${t.entityName}:`, e);
        }
      }));
    }

    // ===== DONE =====
    await supabase.from("game_sessions").update({ init_status: "ready" }).eq("id", sessionId);

    return new Response(JSON.stringify({ sessionId, roomCode }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-promo-world error:", e);
    if (sessionId) {
      await supabase.from("game_sessions").update({ init_status: "failed" }).eq("id", sessionId).then(() => {}, () => {});
    }
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
