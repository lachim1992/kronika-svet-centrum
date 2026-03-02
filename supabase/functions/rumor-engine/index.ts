/**
 * rumor-engine — Generates localized rumors reacting to major events.
 * 
 * Uses createAIContext for premise injection (style, vibe, constraints).
 * Preserves domain logic: proximity detection, batch processing, DB inserts.
 */

import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse, getServiceClient } from "../_shared/ai-context.ts";

const MAJOR_EVENT_TYPES = new Set([
  "battle", "raid", "war", "diplomacy", "wonder", "plague", "disaster",
  "assassination", "coronation", "found_settlement", "upgrade_city",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, eventId, eventType, currentTurn, isPlayerEvent } = await req.json();
    const sb = getServiceClient();

    // 1) Load the event
    const { data: event } = await sb.from("game_events").select("*").eq("id", eventId).single();
    if (!event) return jsonResponse({ error: "Event not found", generated: 0 });

    // 2) Skip non-major events
    const isMajor = MAJOR_EVENT_TYPES.has(event.event_type) || event.importance === "legendary" || event.importance === "memorable";
    if (!isMajor) return jsonResponse({ skipped: true, reason: "not_major", generated: 0 });

    // 3) Find the event's city and province
    const eventCityId = event.city_id || event.attacker_city_id || event.defender_city_id;
    let eventCity: any = null;
    if (eventCityId) {
      const { data } = await sb.from("cities").select("*").eq("id", eventCityId).single();
      eventCity = data;
    }

    // 4) Find nearby cities (same province + same session)
    const { data: allCities } = await sb.from("cities").select("*").eq("session_id", sessionId);
    if (!allCities?.length) return jsonResponse({ generated: 0, reason: "no_cities" });

    const targetCities: Array<{ id: string; name: string; owner_player: string; proximity: string }> = [];
    for (const city of allCities) {
      const { data: existing } = await sb.from("city_rumors")
        .select("id").eq("city_id", city.id).eq("related_event_id", eventId).limit(1);
      if (existing && existing.length > 0) continue;

      let proximity = "distant";
      if (city.id === eventCityId) {
        proximity = "local";
      } else if (eventCity && city.province_id && city.province_id === eventCity.province_id) {
        proximity = "same_province";
      } else if (eventCity && city.province === eventCity.province) {
        proximity = "same_province";
      }

      if (proximity === "local" || proximity === "same_province") {
        targetCities.push({ id: city.id, name: city.name, owner_player: city.owner_player, proximity });
      }
    }

    const citiesToProcess = targetCities.slice(0, 5);
    if (citiesToProcess.length === 0) return jsonResponse({ generated: 0, reason: "no_nearby_cities_without_rumors" });

    // 5) Load premise context
    const ctx = await createAIContext(sessionId, currentTurn || event.turn_number, sb);

    // 6) Batch AI call
    const cityList = citiesToProcess.map(c =>
      `- ${c.name} (vládce: ${c.owner_player}, blízkost: ${c.proximity === "local" ? "místo události" : "stejná provincie"})`
    ).join("\n");

    const eventDesc = [
      `Typ: ${event.event_type}`, `Hráč: ${event.player}`,
      event.location ? `Místo: ${event.location}` : null,
      event.result ? `Výsledek: ${event.result}` : null,
      event.casualties ? `Ztráty: ${event.casualties}` : null,
      event.note ? `Poznámka: ${event.note}` : null,
      event.treaty_type ? `Smlouva: ${event.treaty_type}` : null,
      event.terms_summary ? `Podmínky: ${event.terms_summary}` : null,
    ].filter(Boolean).join("\n");

    const result = await invokeAI(ctx, {
      systemPrompt: `Jsi síť šeptandů, obchodníků a běžných obyvatel ve starověkém světě.
Pro každé město generuješ 1-2 LOKÁLNÍ ZVĚSTI reagující na nedávnou událost.

PRAVIDLA:
- Každá zvěst 1-3 věty, z perspektivy běžných lidí daného města.
- Města blíže události mají silnější, detailnější reakce.
- Zvěsti musí logicky reagovat na typ události (bitva → strach; obchod → naděje).
- Přidej emocionální tón: fear, pride, grief, hope, anger, joy, suspicion.
- Zmiňuj konkrétní jména měst a vládců.
- Výstup v češtině.
- Odpověz POUZE voláním funkce generate_batch_rumors.`,
      userPrompt: `UDÁLOST (rok ${event.turn_number}):\n${eventDesc}\n\nMĚSTA K VYGENEROVÁNÍ ZVĚSTÍ:\n${cityList}`,
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
                    city_name: { type: "string" },
                    rumors: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          text: { type: "string" },
                          tone: { type: "string", enum: ["fear", "pride", "grief", "hope", "anger", "joy", "suspicion", "neutral"] },
                        },
                        required: ["text", "tone"], additionalProperties: false,
                      },
                    },
                  },
                  required: ["city_name", "rumors"], additionalProperties: false,
                },
              },
            },
            required: ["city_rumors"], additionalProperties: false,
          },
        },
      }],
      toolChoice: { type: "function", function: { name: "generate_batch_rumors" } },
    });

    if (!result.ok) {
      if (result.status === 429) return jsonResponse({ error: "Rate limit" }, 429);
      if (result.status === 402) return jsonResponse({ error: "Payment required" }, 402);
      return jsonResponse({ generated: 0, error: result.error, debug: result.debug });
    }

    // 7) Insert rumors into database
    let totalGenerated = 0;
    for (const cityRumors of result.data?.city_rumors || []) {
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

    return jsonResponse({ generated: totalGenerated, cities: citiesToProcess.length, debug: result.debug });
  } catch (e) {
    console.error("rumor-engine error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
