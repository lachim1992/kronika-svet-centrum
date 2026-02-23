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

// Hex coords for settlements — simple grid avoiding collisions
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
      max_players: 6,
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
        description: "Generate a complete world for a strategy chronicle game",
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
                },
                required: ["name", "description", "ruler", "is_player"],
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
                },
                required: ["name", "state_idx", "terrain", "description"],
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
                },
                required: ["name", "province_idx", "type", "founded_year", "description"],
              },
            },
            persons: {
              type: "array",
              description: "10 notable persons: leaders, generals, merchants, spies, priests",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  person_type: { type: "string" },
                  faction: { type: "string", description: "player name who owns this person" },
                  born_year: { type: "integer" },
                  died_year: { type: "integer", description: "null if alive" },
                  bio: { type: "string" },
                  flavor_trait: { type: "string" },
                  home_city_name: { type: "string" },
                },
                required: ["name", "person_type", "faction", "born_year", "bio"],
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
                  image_prompt: { type: "string" },
                },
                required: ["name", "province_idx", "description"],
              },
            },
            events: {
              type: "array",
              description: "20 historical events across years 1-25",
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
              description: "20 battles across years 1-25",
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
            chronicles: {
              type: "array",
              description: "30 chronicle entries covering 25 years of history",
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
              description: "30+ court whispers & field reports linked to entities",
              items: {
                type: "object",
                properties: {
                  year: { type: "integer" },
                  text: { type: "string" },
                  tone_tag: { type: "string", enum: ["neutral", "warning", "intrigue", "celebration"] },
                  related_city_name: { type: "string" },
                },
                required: ["year", "text", "tone_tag"],
              },
            },
          },
          required: ["ai_players", "states", "provinces", "settlements", "persons", "wonders", "events", "battles", "chronicles", "rumors"],
        },
      },
    };

    const styleLabel = epochStyle === "myty" ? "mytologický" : epochStyle === "moderni" ? "moderní zpravodajský" : "středověký kronikářský";

    const aiResult = await callAI(
      apiKey,
      [
        {
          role: "system",
          content: `Jsi tvůrce fantasy/historických světů pro strategickou kronikářskou hru. Generuješ kompletní svět po 25 letech existence.
Všechny texty MUSÍ být v češtině. Jména mohou být fantasy/historická.
Styl: ${styleLabel}.
KRITICKÉ: Všechny entity musí být vzájemně propojené. Bitvy odkazují na konkrétní velitele a lokace. Události ovlivňují konkrétní města a osoby. Zvěsti odkazují na reálné entity.
Hráčova civilizace: "${nationPrompt || "neuvedeno"}" — hráč "${playerName}" vlastní první stát.
AI hráči vlastní druhý stát a jsou nezávislí aktéři.`,
        },
        {
          role: "user",
          content: `Vygeneruj kompletní svět: "${worldPrompt}"

Požadavky:
- 2 státy: #0 patří hráči "${playerName}", #1 je AI rivalský stát
- 3 AI hráče s unikátními jmény, národy a osobnostmi
- 8 provincií (4 na stát), state_idx = 0 nebo 1
- 24 sídel: pro každou provincii přesně 1 CITY, 1 HAMLET, 1 CASTLE. Různé roky založení (1-20).
- 10 osobností: vůdci, generálové, kupci, kněží, špióni. Různé roky narození. Někteří mrtví (died_year <= 25). faction = jméno hráče kterému patří.
- 4 divy světa v různých provinciích
- 20 událostí rozložených přes roky 1-25 (founding, trade, diplomatic, cultural, disaster, rebellion)
- 20 bitev rozložených přes roky 1-25 s veliteli a výsledky
- 30 kronikových zápisů pokrývajících roky 1-25 s turn_from/turn_to
- 30+ zvěstí (drby, tajemství, varování) navázaných na konkrétní města

DŮLEŽITÉ: affected_players a faction musí používat přesná jména: "${playerName}" nebo jména AI hráčů.
Kroniky musí používat skutečná jména míst, osob a událostí z vygenerovaných dat.
Zvěsti musí odkazovat na related_city_name které existuje v settlements.`,
        },
      ],
      [toolSchema],
      { type: "function", function: { name: "create_world" } }
    );

    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("AI did not return structured data");
    const world = JSON.parse(toolCall.function.arguments);

    // Validate minimum data
    if (!world.states?.length || !world.provinces?.length || !world.settlements?.length) {
      throw new Error("AI returned incomplete world data");
    }

    // ===== 3. INSERT PLAYERS =====
    const aiPlayerNames = (world.ai_players || []).map((ap: any) => ap.name);
    const allPlayers = [playerName, ...aiPlayerNames];

    // Human player
    await supabase.from("game_players").insert({
      session_id: sessionId, player_name: playerName, player_number: 1, user_id: userId,
    });
    await supabase.from("game_memberships").insert({
      user_id: userId, session_id: sessionId, player_name: playerName, role: "admin",
    });

    // AI players
    const aiPlayerInserts = aiPlayerNames.map((name: string, i: number) => ({
      session_id: sessionId, player_name: name, player_number: i + 2,
    }));
    if (aiPlayerInserts.length) await supabase.from("game_players").insert(aiPlayerInserts);

    // Civilizations
    const civInserts = [
      { session_id: sessionId, player_name: playerName, civ_name: nationPrompt || playerName, is_ai: false },
      ...(world.ai_players || []).map((ap: any) => ({
        session_id: sessionId, player_name: ap.name, civ_name: ap.civ_name,
        is_ai: true, ai_personality: ap.personality, core_myth: ap.core_myth || null,
      })),
    ];
    await supabase.from("civilizations").insert(civInserts);

    // Player resources for all players
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

    // ===== 6. INSERT SETTLEMENTS (CITIES) =====
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

    // ===== 9. INSERT EVENTS + WORLD_EVENTS =====
    const gameEventInserts: any[] = [];
    const worldEventInserts: any[] = [];

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

    for (const b of (world.battles || [])) {
      const cityId = cityIdMap[b.location_name] || null;
      gameEventInserts.push({
        session_id: sessionId,
        event_type: "battle",
        player: b.attacker_faction || playerName,
        location: b.location_name,
        note: b.description,
        turn_number: b.year || 1,
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
        created_turn: b.year || 1,
        date: `Rok ${b.year}`,
        status: "published",
        affected_players: [b.attacker_faction, b.defender_faction].filter(Boolean),
        location_id: cityId,
      });
    }

    if (gameEventInserts.length) await supabase.from("game_events").insert(gameEventInserts);
    if (worldEventInserts.length) await supabase.from("world_events").insert(worldEventInserts);

    // ===== 10. INSERT CHRONICLES =====
    const chronicleInserts = (world.chronicles || []).map((ch: any) => ({
      session_id: sessionId,
      text: ch.text,
      epoch_style: epochStyle,
      turn_from: ch.turn_from || 1,
      turn_to: ch.turn_to || 25,
    }));
    if (chronicleInserts.length) await supabase.from("chronicle_entries").insert(chronicleInserts);

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
        turn_number: r.year || 1,
        created_by: "system",
      };
    });
    if (rumorInserts.length) await supabase.from("city_rumors").insert(rumorInserts);

    // ===== 12. UPDATE WIKI ENTRIES (triggers may have created shells) =====
    // Update cities wiki
    for (const s of world.settlements) {
      const cId = cityIdMap[s.name];
      if (!cId) continue;
      const pIdx = s.province_idx ?? 0;
      const stateIdx = world.provinces[pIdx]?.state_idx ?? 0;
      await supabase.from("wiki_entries")
        .update({ summary: (s.description || "").substring(0, 200), ai_description: s.description, tags: s.tags || [] })
        .eq("session_id", sessionId).eq("entity_id", cId);
    }
    // Update countries wiki
    for (let i = 0; i < world.states.length; i++) {
      if (!countryIds[i]) continue;
      await supabase.from("wiki_entries")
        .update({ summary: (world.states[i].description || "").substring(0, 200), ai_description: world.states[i].description, tags: world.states[i].tags || [] })
        .eq("session_id", sessionId).eq("entity_id", countryIds[i]);
    }
    // Update provinces wiki
    for (let i = 0; i < world.provinces.length; i++) {
      const pId = provinceMap[i]?.id;
      if (!pId) continue;
      await supabase.from("wiki_entries")
        .update({ summary: (world.provinces[i].description || "").substring(0, 200), ai_description: world.provinces[i].description, tags: world.provinces[i].tags || [] })
        .eq("session_id", sessionId).eq("entity_id", pId);
    }
    // Update persons wiki
    for (const p of world.persons || []) {
      const pId = personIdMap[p.name];
      if (!pId) continue;
      await supabase.from("wiki_entries")
        .update({ summary: (p.bio || "").substring(0, 200), ai_description: p.bio, tags: [p.person_type, p.flavor_trait].filter(Boolean) })
        .eq("session_id", sessionId).eq("entity_id", pId);
    }

    // Insert wiki entries for wonders (no trigger for these might exist)
    const { data: wondersData } = await supabase.from("wonders").select("id, name").eq("session_id", sessionId);
    for (const wd of wondersData || []) {
      const wDef = (world.wonders || []).find((w: any) => w.name === wd.name);
      // Check if wiki entry exists
      const { data: existing } = await supabase.from("wiki_entries")
        .select("id").eq("session_id", sessionId).eq("entity_id", wd.id).maybeSingle();
      if (existing) {
        await supabase.from("wiki_entries").update({
          summary: (wDef?.description || "").substring(0, 200), ai_description: wDef?.description,
          tags: ["wonder"], image_prompt: wDef?.image_prompt || null,
        }).eq("id", existing.id);
      } else {
        await supabase.from("wiki_entries").insert({
          session_id: sessionId, entity_type: "wonder", entity_id: wd.id,
          entity_name: wd.name, owner_player: playerName,
          summary: (wDef?.description || "").substring(0, 200), ai_description: wDef?.description,
          tags: ["wonder"], image_prompt: wDef?.image_prompt || null,
        });
      }
    }

    // ===== 13. INSERT WORLD MEMORIES =====
    const memoryInserts = [
      ...world.states.map((s: any) => ({
        session_id: sessionId, text: `Stát ${s.name}: ${(s.description || "").substring(0, 100)}`,
        approved: true, category: "tradition", created_round: 1,
      })),
      ...(world.wonders || []).map((w: any) => ({
        session_id: sessionId, text: `Div světa ${w.name}: ${w.memory_fact || (w.description || "").substring(0, 80)}`,
        approved: true, category: "tradition", created_round: 1,
      })),
    ];
    if (memoryInserts.length) await supabase.from("world_memories").insert(memoryInserts);

    // ===== 14. INSERT FEED ITEMS =====
    const feedInserts = [
      ...(world.events || []).slice(0, 10).map((e: any) => ({
        session_id: sessionId, turn_number: e.year || 1, feed_type: "news",
        content: e.title || e.description?.substring(0, 100), importance: "normal",
      })),
      ...(world.battles || []).slice(0, 5).map((b: any) => ({
        session_id: sessionId, turn_number: b.year || 1, feed_type: "news",
        content: `Bitva: ${b.name}`, importance: "high",
      })),
    ];
    if (feedInserts.length) await supabase.from("world_feed_items").insert(feedInserts);

    // ===== 15. GAME STYLE SETTINGS =====
    await supabase.from("game_style_settings").insert({
      session_id: sessionId,
      default_style_preset: "medieval_illumination",
      lore_bible: worldPrompt,
      prompt_rules: `Tón: ${styleLabel}. Svět: ${worldPrompt.substring(0, 200)}`,
    });

    // ===== 16. DISCOVERIES for human player =====
    const discoveryInserts: any[] = [];
    // Discover own provinces and cities
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

    // ===== DONE =====
    await supabase.from("game_sessions").update({ init_status: "ready" }).eq("id", sessionId);

    return new Response(JSON.stringify({ sessionId, roomCode }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-promo-world error:", e);
    // Cleanup on failure
    if (sessionId) {
      await supabase.from("game_sessions").update({ init_status: "failed" }).eq("id", sessionId).catch(() => {});
    }
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
