import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, playerName, currentTurn, worldFoundation, existingRegions } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not set");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const existingNames = (existingRegions || []).map((r: any) => r.name).join(", ");

    const prompt = `You are a world-building AI for a civilization strategy game.

World: "${worldFoundation?.world_name || "Unknown"}"
Premise: "${worldFoundation?.premise || ""}"
Tone: "${worldFoundation?.tone || "mythic"}"
Existing regions: ${existingNames || "none"}
Explorer: ${playerName}
Current turn: ${currentTurn}

Generate a NEW frontier region that has just been discovered. It must be NPC-controlled.
The region should feel like unexplored territory beyond the known world.

Return JSON with this exact structure:
{
  "region": {
    "name": "string - evocative region name",
    "biome": "coast|mountains|plains|desert|forest|swamp|tundra|volcanic",
    "description": "2-3 sentences describing geography and atmosphere",
    "owner_player": null
  },
  "cities": [
    {
      "name": "string - city name",
      "level": "Osada|Město|Pevnost",
      "description": "1 sentence about the city"
    }
  ],
  "rulers": [
    {
      "name": "string - ruler/notable person name",
      "person_type": "Vládce|Generál|Mudrc|Obchodník",
      "bio": "1-2 sentences",
      "flavor_trait": "short trait"
    }
  ],
  "history": "2-3 sentences of region history",
  "rumors": [
    "short rumor text about this region",
    "another rumor"
  ],
  "eventTitle": "Discovery of [Region Name]",
  "eventDescription": "1 sentence describing the discovery event",
  "feedItem": "A gossip-style news item about the discovery (1-2 sentences)"
}

Generate 1-3 cities and 1-2 rulers. Make names feel authentic to the world tone.
Do NOT use names from existing regions.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.9,
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI error:", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const raw = aiData.choices?.[0]?.message?.content || "";
    
    // Extract JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in AI response");
    const generated = JSON.parse(jsonMatch[0]);

    // 1. Create region
    const { data: region, error: regErr } = await supabase.from("regions").insert({
      session_id: sessionId,
      name: generated.region.name,
      biome: generated.region.biome || "plains",
      description: generated.region.description,
      owner_player: null,
      discovered_turn: currentTurn,
      discovered_by: playerName,
      is_homeland: false,
    }).select().single();

    if (regErr) throw regErr;

    // 2. Create cities inside region
    const createdCities = [];
    for (const city of (generated.cities || [])) {
      const { data: c } = await supabase.from("cities").insert({
        session_id: sessionId,
        name: city.name,
        owner_player: "NPC",
        level: city.level || "Osada",
        founded_round: currentTurn,
        flavor_prompt: city.description,
        status: "ok",
      }).select().single();
      if (c) createdCities.push(c);
    }

    // 3. Create rulers/persons
    for (const ruler of (generated.rulers || [])) {
      await supabase.from("great_persons").insert({
        session_id: sessionId,
        name: ruler.name,
        person_type: ruler.person_type || "Vládce",
        player_name: "NPC",
        bio: ruler.bio,
        flavor_trait: ruler.flavor_trait,
        born_round: Math.max(1, currentTurn - 5),
        city_id: createdCities[0]?.id || null,
      });
    }

    // 4. Create world event
    const slug = `discovery-${generated.region.name.toLowerCase().replace(/\s+/g, "-")}-t${currentTurn}`;
    const { data: worldEvent } = await supabase.from("world_events").insert({
      session_id: sessionId,
      title: generated.eventTitle || `Objevení ${generated.region.name}`,
      slug,
      description: generated.eventDescription || `${playerName} discovered the region of ${generated.region.name}.`,
      event_category: "exploration",
      status: "published",
      created_turn: currentTurn,
      created_by_type: "system",
      affected_players: [playerName],
      participants: [{ type: "player", name: playerName }, { type: "region", name: generated.region.name }],
    }).select().single();

    // 5. Create feed item
    await supabase.from("world_feed_items").insert({
      session_id: sessionId,
      turn_number: currentTurn,
      content: generated.feedItem || `Zvědové ${playerName} hlásí nové země za hranicemi — ${generated.region.name}!`,
      feed_type: "gossip",
      importance: "high",
      linked_event_id: worldEvent?.id || null,
      references: [{ type: "region", id: region.id, label: generated.region.name }],
    });

    // 6. Create chronicle entry
    await supabase.from("chronicle_entries").insert({
      session_id: sessionId,
      text: `V roce ${currentTurn} byly za hranicemi objeveny nové země — ${generated.region.name}. ${generated.history || ""}`,
      turn_from: currentTurn,
      turn_to: currentTurn,
      references: [{ type: "region", id: region.id, label: generated.region.name }],
    });

    // 7. Create rumors for nearby cities
    for (const rumor of (generated.rumors || [])) {
      if (createdCities[0]) {
        await supabase.from("city_rumors").insert({
          session_id: sessionId,
          city_id: createdCities[0].id,
          city_name: createdCities[0].name,
          text: rumor,
          turn_number: currentTurn,
          tone_tag: "mysterious",
          entity_refs: [{ type: "region", id: region.id, label: generated.region.name }],
        });
      }
    }

    // 8. Create expedition record
    await supabase.from("expeditions").insert({
      session_id: sessionId,
      player_name: playerName,
      expedition_type: "explore",
      status: "completed",
      launched_turn: currentTurn,
      resolved_turn: currentTurn,
      result_region_id: region.id,
      narrative: generated.history,
    });

    return new Response(JSON.stringify({
      region,
      cities: createdCities,
      eventId: worldEvent?.id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("explore-region error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
