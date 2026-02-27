/**
 * Backfill Prehistory — Retroactively extract structured entities
 * (persons, battles, events, wonders) from Chronicle Zero text
 * and write them to DB tables + wiki.
 *
 * Called manually via admin panel when prehistory data is missing.
 */

import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse, getServiceClient } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId } = await req.json();
    if (!sessionId) return errorResponse("Missing sessionId", 400);

    const sb = getServiceClient();

    // 1. Load Chronicle Zero text
    const { data: c0 } = await sb.from("chronicle_entries")
      .select("text, references")
      .eq("session_id", sessionId)
      .eq("source_type", "chronicle_zero")
      .maybeSingle();

    if (!c0?.text) return errorResponse("No Chronicle Zero found for this session", 404);

    // 2. Check if entities already exist
    const [personsRes, wondersRes, eventsRes] = await Promise.all([
      sb.from("great_persons").select("id").eq("session_id", sessionId).limit(1),
      sb.from("wonders").select("id").eq("session_id", sessionId).limit(1),
      sb.from("world_events").select("id").eq("session_id", sessionId).eq("event_category", "battle").limit(1),
    ]);

    const alreadyHasData = (personsRes.data?.length || 0) + (wondersRes.data?.length || 0) + (eventsRes.data?.length || 0) > 0;
    if (alreadyHasData) {
      return jsonResponse({ skipped: true, message: "Prehistory data already exists" });
    }

    // 3. Load session context
    const { data: session } = await sb.from("game_sessions").select("epoch_style").eq("id", sessionId).single();
    const { data: cities } = await sb.from("cities").select("id, name, owner_player").eq("session_id", sessionId);
    const cityNames = (cities || []).map(c => c.name);
    const cityIdMap: Record<string, string> = {};
    for (const c of cities || []) cityIdMap[c.name] = c.id;

    // Get all player names
    const { data: civs } = await sb.from("civilizations").select("player_name, civ_name").eq("session_id", sessionId);
    const playerNames = (civs || []).map(c => c.player_name);
    const factionMap: Record<string, string> = {};
    for (const c of civs || []) factionMap[c.civ_name] = c.player_name;

    // 4. AI extraction from Chronicle Zero text
    const ctx = await createAIContext(sessionId, undefined, sb);

    const result = await invokeAI(ctx, {
      model: "google/gemini-2.5-flash",
      systemPrompt: `Jsi analytik herního světa. Na základě epického prologu (Kroniky 0) extrahuj VŠECHNY zmíněné entity.
Extrahuj POUZE entity, které jsou EXPLICITNĚ zmíněny v textu. Nevymýšlej nic navíc.
Pro každou entitu uveď přesné jméno jak je v textu.

Existující města: ${cityNames.join(", ")}
Existující frakce/hráči: ${playerNames.join(", ")}`,
      userPrompt: `Analyzuj tento text Kroniky 0 a extrahuj všechny zmíněné entity:\n\n"${c0.text}"`,
      tools: [{
        type: "function",
        function: {
          name: "extract_prehistory",
          description: "Extract structured entities from Chronicle Zero text",
          parameters: {
            type: "object",
            properties: {
              persons: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    personType: { type: "string", enum: ["Generál", "Kupec", "Kněz", "Prorok", "Zakladatel", "Válečník", "Učenec", "Vládce", "Věštec"] },
                    bio: { type: "string", description: "Brief bio based on the text" },
                    bornYear: { type: "integer", description: "Negative number for prehistoric" },
                    diedYear: { type: "integer", description: "Null if alive or unknown" },
                    relatedFaction: { type: "string", description: "Which faction/civilization they relate to" },
                    relatedCityName: { type: "string" },
                    flavorTrait: { type: "string" },
                    imagePrompt: { type: "string" },
                  },
                  required: ["name", "personType", "bio", "bornYear", "imagePrompt"],
                },
              },
              battles: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    year: { type: "integer" },
                    description: { type: "string" },
                    locationName: { type: "string" },
                    attackerName: { type: "string", description: "Commander or faction name" },
                    defenderName: { type: "string" },
                    outcome: { type: "string" },
                  },
                  required: ["name", "year", "description", "outcome"],
                },
              },
              events: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    year: { type: "integer" },
                    description: { type: "string" },
                    eventType: { type: "string", enum: ["founding", "battle", "prophecy", "cataclysm", "migration", "divine", "betrayal", "alliance", "discovery", "war", "coronation"] },
                    location: { type: "string" },
                    involvedFactions: { type: "array", items: { type: "string" } },
                    legacyImpact: { type: "string" },
                    imagePrompt: { type: "string" },
                  },
                  required: ["title", "year", "description", "eventType", "legacyImpact"],
                },
              },
              wonders: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                    cityName: { type: "string" },
                    status: { type: "string", enum: ["completed", "destroyed"] },
                    destroyedStory: { type: "string" },
                    builderPersonName: { type: "string" },
                    imagePrompt: { type: "string" },
                    memoryFact: { type: "string" },
                  },
                  required: ["name", "description", "status", "imagePrompt", "memoryFact"],
                },
              },
            },
            required: ["persons", "battles", "events", "wonders"],
          },
        },
      }],
      toolChoice: { type: "function", function: { name: "extract_prehistory" } },
      maxTokens: 8000,
    });

    if (!result.ok) {
      console.error("Backfill AI extraction failed:", result.error);
      return errorResponse("AI extraction failed: " + (result.error || "unknown"));
    }

    const extracted = result.data;
    const counters = { persons: 0, battles: 0, events: 0, wonders: 0, wiki: 0, links: 0 };
    const personIdMap: Record<string, string> = {};

    // 5. Write persons
    for (const person of extracted.persons || []) {
      const ownerPlayer = factionMap[person.relatedFaction || ""] || playerNames[0] || "system";
      const homeCityId = person.relatedCityName ? cityIdMap[person.relatedCityName] || null : null;
      const isAlive = !person.diedYear || person.diedYear > 0;

      const { data: row } = await sb.from("great_persons").insert({
        session_id: sessionId, name: person.name, person_type: person.personType,
        player_name: ownerPlayer, born_round: person.bornYear || -50,
        died_round: person.diedYear || null, bio: person.bio,
        flavor_trait: person.flavorTrait || null, is_alive: isAlive,
        city_id: homeCityId, image_prompt: person.imagePrompt,
      }).select("id").single();

      if (row) {
        personIdMap[person.name] = row.id;
        counters.persons++;

        await sb.from("wiki_entries").upsert({
          session_id: sessionId, entity_type: "person", entity_id: row.id,
          entity_name: person.name, owner_player: ownerPlayer,
          summary: (person.bio || "").substring(0, 200),
          ai_description: person.bio, image_prompt: person.imagePrompt,
          tags: [person.personType, person.flavorTrait].filter(Boolean),
          updated_at: new Date().toISOString(),
          references: { generated: true, mode: "backfill_prehistory", bornYear: person.bornYear },
        } as any, { onConflict: "session_id,entity_type,entity_id" });
        counters.wiki++;

        if (homeCityId) {
          await sb.from("entity_links").insert({
            session_id: sessionId, from_entity_id: row.id, from_entity_type: "person",
            to_entity_id: homeCityId, to_entity_type: "city", link_type: "resides_in",
            label: `${person.name} pochází z ${person.relatedCityName}`,
          });
          counters.links++;
        }
      }
    }

    // 6. Write pre-history events
    for (const evt of extracted.events || []) {
      const cityId = evt.location ? cityIdMap[evt.location] || null : null;
      const involvedPlayers = (evt.involvedFactions || []).map((f: string) => factionMap[f] || f);
      const slug = `prehistory-backfill-${Math.abs(evt.year)}-${crypto.randomUUID().substring(0, 8)}`;

      const { data: weRow } = await sb.from("world_events").insert({
        session_id: sessionId, title: evt.title, slug,
        summary: evt.description.substring(0, 200), description: evt.description,
        date: `Rok ${evt.year} (před počátkem paměti)`,
        event_category: evt.eventType, status: "published", created_turn: 0,
        created_by_type: "system", affected_players: involvedPlayers,
        tags: ["legendary", "prehistory", evt.eventType],
        ai_image_prompt: evt.imagePrompt || null, location_id: cityId,
      } as any).select("id").single();

      if (weRow) {
        counters.events++;

        await sb.from("game_events").insert({
          session_id: sessionId, event_type: evt.eventType || "other",
          player: involvedPlayers[0] || "system", turn_number: 0,
          confirmed: true, note: evt.description, location: evt.location || null,
          result: evt.title, importance: "high", truth_state: "canon", city_id: cityId,
        });

        await sb.from("wiki_entries").upsert({
          session_id: sessionId, entity_type: "event", entity_id: weRow.id,
          entity_name: evt.title, owner_player: "system",
          summary: evt.description.substring(0, 200),
          ai_description: `${evt.description}\n\n**Odkaz do současnosti:** ${evt.legacyImpact || ""}`,
          image_prompt: evt.imagePrompt || null, tags: ["legendary", evt.eventType],
          updated_at: new Date().toISOString(),
          references: { generated: true, mode: "backfill_prehistory", year: evt.year },
        } as any, { onConflict: "session_id,entity_type,entity_id" });
        counters.wiki++;

        if (evt.legacyImpact) {
          await sb.from("world_memories").insert({
            session_id: sessionId, text: `${evt.title}: ${evt.legacyImpact}`,
            category: "historical_scar", status: "approved", source_turn: 0,
          } as any);
        }
      }
    }

    // 7. Write battles
    for (const battle of extracted.battles || []) {
      const cityId = battle.locationName ? cityIdMap[battle.locationName] || null : null;
      const turnNum = battle.year <= 0 ? 0 : battle.year;
      const slug = `battle-backfill-${Math.abs(battle.year)}-${crypto.randomUUID().substring(0, 8)}`;

      const { data: weRow } = await sb.from("world_events").insert({
        session_id: sessionId, title: `Bitva: ${battle.name}`, slug,
        summary: battle.description.substring(0, 200), description: battle.description,
        date: `Rok ${battle.year}`, event_category: "battle", status: "published",
        created_turn: turnNum, created_by_type: "system",
        tags: ["battle", "legendary", "prehistory"],
        location_id: cityId,
      } as any).select("id").single();

      await sb.from("game_events").insert({
        session_id: sessionId, event_type: "battle", player: battle.attackerName || "system",
        location: battle.locationName || null, note: battle.description,
        turn_number: turnNum, confirmed: true, importance: "high",
        result: battle.outcome, truth_state: "canon", city_id: cityId,
      });
      counters.battles++;

      if (weRow) {
        await sb.from("wiki_entries").upsert({
          session_id: sessionId, entity_type: "event", entity_id: weRow.id,
          entity_name: `Bitva: ${battle.name}`, owner_player: "system",
          summary: battle.description.substring(0, 200),
          ai_description: `${battle.description}\n\n**Útočník:** ${battle.attackerName || "neznámý"}\n**Obránce:** ${battle.defenderName || "neznámý"}\n**Výsledek:** ${battle.outcome}`,
          tags: ["battle", "legendary"],
          updated_at: new Date().toISOString(),
          references: { generated: true, mode: "backfill_prehistory", year: battle.year },
        } as any, { onConflict: "session_id,entity_type,entity_id" });
        counters.wiki++;

        // Link commanders
        const attackerId = personIdMap[battle.attackerName || ""];
        const defenderId = personIdMap[battle.defenderName || ""];
        if (attackerId) {
          await sb.from("entity_links").insert({
            session_id: sessionId, from_entity_id: weRow.id, from_entity_type: "event",
            to_entity_id: attackerId, to_entity_type: "person", link_type: "commander",
          });
          counters.links++;
        }
        if (defenderId) {
          await sb.from("entity_links").insert({
            session_id: sessionId, from_entity_id: weRow.id, from_entity_type: "event",
            to_entity_id: defenderId, to_entity_type: "person", link_type: "commander",
          });
          counters.links++;
        }
      }
    }

    // 8. Write wonders
    for (const wonder of extracted.wonders || []) {
      const ownerPlayer = playerNames[0] || "system";
      const cityId = wonder.cityName ? cityIdMap[wonder.cityName] || null : null;

      const { data: wonderRow } = await sb.from("wonders").insert({
        session_id: sessionId, name: wonder.name, owner_player: ownerPlayer,
        city_name: wonder.cityName || null, description: wonder.description,
        memory_fact: wonder.memoryFact || null, image_prompt: wonder.imagePrompt || null,
        status: wonder.status || "completed",
      }).select("id").single();

      if (wonderRow) {
        counters.wonders++;

        const fullDesc = wonder.status === "destroyed" && wonder.destroyedStory
          ? `${wonder.description}\n\n**Zánik:** ${wonder.destroyedStory}` : wonder.description;

        await sb.from("wiki_entries").upsert({
          session_id: sessionId, entity_type: "wonder", entity_id: wonderRow.id,
          entity_name: wonder.name, owner_player: ownerPlayer,
          summary: `${wonder.name} — div světa.`,
          ai_description: fullDesc, image_prompt: wonder.imagePrompt || null,
          tags: ["wonder", wonder.status || "completed"],
          updated_at: new Date().toISOString(),
          references: { generated: true, mode: "backfill_prehistory" },
        } as any, { onConflict: "session_id,entity_type,entity_id" });
        counters.wiki++;

        if (cityId) {
          await sb.from("entity_links").insert({
            session_id: sessionId, from_entity_id: wonderRow.id, from_entity_type: "wonder",
            to_entity_id: cityId, to_entity_type: "city", link_type: "located_in",
          });
          counters.links++;
        }

        if (wonder.builderPersonName && personIdMap[wonder.builderPersonName]) {
          await sb.from("entity_links").insert({
            session_id: sessionId, from_entity_id: wonderRow.id, from_entity_type: "wonder",
            to_entity_id: personIdMap[wonder.builderPersonName], to_entity_type: "person",
            link_type: "built_by",
          });
          counters.links++;
        }

        if (wonder.memoryFact) {
          await sb.from("world_memories").insert({
            session_id: sessionId, text: `Div světa ${wonder.name}: ${wonder.memoryFact}`,
            category: "tradition", status: "approved", source_turn: 0,
          } as any);
        }
      }
    }

    // Update Chronicle Zero sidebar with new entity IDs
    const sidebarData = {
      persons: (extracted.persons || []).map((p: any) => ({
        name: p.name, type: p.personType, bornYear: p.bornYear,
        diedYear: p.diedYear || null, id: personIdMap[p.name] || null,
      })),
      wonders: (extracted.wonders || []).map((w: any) => ({
        name: w.name, city: w.cityName, status: w.status,
      })),
      battles: (extracted.battles || []).map((b: any) => ({
        name: b.name, year: b.year, location: b.locationName,
        outcome: b.outcome,
      })),
      events: (extracted.events || []).map((e: any) => ({
        title: e.title, year: e.year, type: e.eventType,
      })),
    };

    await sb.from("chronicle_entries")
      .update({ references: { ...(c0.references as any || {}), sidebar: sidebarData, backfilled: true } })
      .eq("session_id", sessionId)
      .eq("source_type", "chronicle_zero");

    console.log(`Backfill complete for ${sessionId}:`, counters);
    return jsonResponse({ success: true, counters });
  } catch (e) {
    console.error("backfill-prehistory error:", e);
    return errorResponse(e instanceof Error ? e.message : "Unknown error");
  }
});
