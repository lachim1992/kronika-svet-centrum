import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAJOR_EVENT_TYPES = new Set([
  "battle", "raid", "war", "diplomacy", "wonder", "plague", "disaster",
  "assassination", "coronation", "found_settlement", "upgrade_city",
]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, eventId, eventType, currentTurn, epochStyle, isPlayerEvent } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) Load the event
    const { data: event } = await sb.from("game_events").select("*").eq("id", eventId).single();
    if (!event) {
      return new Response(JSON.stringify({ error: "Event not found", generated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Skip non-major events
    const isMajor = MAJOR_EVENT_TYPES.has(event.event_type) || event.importance === "legendary" || event.importance === "memorable";
    if (!isMajor) {
      return new Response(JSON.stringify({ skipped: true, reason: "not_major", generated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) Find the event's city and province
    const eventCityId = event.city_id || event.attacker_city_id || event.defender_city_id;
    let eventCity: any = null;
    if (eventCityId) {
      const { data } = await sb.from("cities").select("*").eq("id", eventCityId).single();
      eventCity = data;
    }

    // 4) Find nearby cities (same province + same session)
    const { data: allCities } = await sb.from("cities").select("*").eq("session_id", sessionId);
    if (!allCities?.length) {
      return new Response(JSON.stringify({ generated: 0, reason: "no_cities" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine which cities get rumors
    const targetCities: Array<{ id: string; name: string; owner_player: string; proximity: string }> = [];

    for (const city of allCities) {
      // Skip if city already has rumors for this event
      const { data: existing } = await sb.from("city_rumors")
        .select("id")
        .eq("city_id", city.id)
        .eq("related_event_id", eventId)
        .limit(1);
      if (existing && existing.length > 0) continue;

      let proximity = "distant";
      if (city.id === eventCityId) {
        proximity = "local";
      } else if (eventCity && city.province_id && city.province_id === eventCity.province_id) {
        proximity = "same_province";
      } else if (eventCity && city.province === eventCity.province) {
        proximity = "same_province";
      }

      // Only include local and same-province cities for MVP
      if (proximity === "local" || proximity === "same_province") {
        targetCities.push({ id: city.id, name: city.name, owner_player: city.owner_player, proximity });
      }
    }

    // Limit to max 5 cities per event
    const citiesToProcess = targetCities.slice(0, 5);

    if (citiesToProcess.length === 0) {
      return new Response(JSON.stringify({ generated: 0, reason: "no_nearby_cities_without_rumors" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5) If no AI key, create placeholder rumors
    if (!LOVABLE_API_KEY) {
      let count = 0;
      for (const city of citiesToProcess) {
        await sb.from("city_rumors").insert({
          session_id: sessionId,
          city_id: city.id,
          city_name: city.name,
          related_event_id: eventId,
          text: `V ${city.name} se šeptá o nedávných událostech...`,
          tone_tag: "neutral",
          created_by: "system",
          is_draft: !!isPlayerEvent,
          draft_expires_turn: isPlayerEvent ? (currentTurn || event.turn_number) + 5 : null,
          turn_number: currentTurn || event.turn_number,
        });
        count++;
      }
      return new Response(JSON.stringify({ generated: count, placeholder: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6) Batch AI call for all cities at once (cost efficient)
    const cityList = citiesToProcess.map(c =>
      `- ${c.name} (vládce: ${c.owner_player}, blízkost: ${c.proximity === "local" ? "místo události" : "stejná provincie"})`
    ).join("\n");

    const eventDesc = [
      `Typ: ${event.event_type}`,
      `Hráč: ${event.player}`,
      event.location ? `Místo: ${event.location}` : null,
      event.result ? `Výsledek: ${event.result}` : null,
      event.casualties ? `Ztráty: ${event.casualties}` : null,
      event.note ? `Poznámka: ${event.note}` : null,
      event.treaty_type ? `Smlouva: ${event.treaty_type}` : null,
      event.terms_summary ? `Podmínky: ${event.terms_summary}` : null,
    ].filter(Boolean).join("\n");

    const systemPrompt = `Jsi síť šeptandů, obchodníků a běžných obyvatel ve starověkém světě.
Pro každé město generuješ 1-2 LOKÁLNÍ ZVĚSTI reagující na nedávnou událost.

PRAVIDLA:
- Každá zvěst 1-3 věty, z perspektivy běžných lidí daného města.
- Města blíže události mají silnější, detailnější reakce.
- Zvěsti musí logicky reagovat na typ události (bitva → ranění, strach; obchod → naděje, zisky).
- Přidej emocionální tón: fear, pride, grief, hope, anger, joy, suspicion.
- Zmiňuj konkrétní jména měst a vládců kde relevantní.
- Styl: ${epochStyle || "kroniky"}.
- Výstup v češtině.
- Odpověz POUZE voláním funkce generate_batch_rumors.`;

    const userPrompt = `UDÁLOST (rok ${event.turn_number}):
${eventDesc}

MĚSTA K VYGENEROVÁNÍ ZVĚSTÍ:
${cityList}`;

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
            name: "generate_batch_rumors",
            description: "Generate localized rumors for multiple cities reacting to a nearby event.",
            parameters: {
              type: "object",
              properties: {
                city_rumors: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      city_name: { type: "string", description: "Name of the city" },
                      rumors: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            text: { type: "string", description: "Rumor text in Czech, 1-3 sentences" },
                            tone: { type: "string", enum: ["fear", "pride", "grief", "hope", "anger", "joy", "suspicion", "neutral"] },
                          },
                          required: ["text", "tone"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["city_name", "rumors"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["city_rumors"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_batch_rumors" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Payment required" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("AI gateway error: " + status);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const result = JSON.parse(toolCall.function.arguments);
    let totalGenerated = 0;

    // 7) Insert rumors into database
    for (const cityRumors of result.city_rumors || []) {
      const targetCity = citiesToProcess.find(c => c.name === cityRumors.city_name);
      if (!targetCity) continue;

      for (const rumor of cityRumors.rumors || []) {
        await sb.from("city_rumors").insert({
          session_id: sessionId,
          city_id: targetCity.id,
          city_name: targetCity.name,
          related_event_id: eventId,
          text: rumor.text,
          tone_tag: rumor.tone || "neutral",
          created_by: "system",
          is_draft: !!isPlayerEvent,
          draft_expires_turn: isPlayerEvent ? (currentTurn || event.turn_number) + 5 : null,
          turn_number: currentTurn || event.turn_number,
          entity_refs: [],
        });
        totalGenerated++;
      }
    }

    return new Response(JSON.stringify({ generated: totalGenerated, cities: citiesToProcess.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("rumor-engine error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
