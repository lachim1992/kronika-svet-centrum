/**
 * rumor-generate: Event-driven rumor generation from world truth.
 *
 * Called after turn processing. Collects recent events, battles, wiki updates,
 * tensions, and world memories, then uses AI to produce 7-15 contextual rumors
 * ("šeptandy") per turn.
 *
 * Supports "reminder" rumors that reference older events in cyclical fashion.
 *
 * Input: { sessionId, turnNumber, playerName }
 */

import { createAIContext, invokeAI, corsHeaders, jsonResponse, errorResponse, getServiceClient } from "../_shared/ai-context.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, turnNumber, playerName } = await req.json();
    if (!sessionId || !turnNumber) return errorResponse("Missing sessionId or turnNumber", 400);

    const supabase = getServiceClient();

    // ── Dedupe: check if already generated for this turn ──
    const { data: existingLog } = await supabase
      .from("rumor_generation_log")
      .select("id")
      .eq("session_id", sessionId)
      .eq("turn_number", turnNumber)
      .maybeSingle();

    if (existingLog) {
      return jsonResponse({ ok: true, skipped: true, reason: "already_generated" });
    }

    // ── Gather world state data ──
    const recentWindow = Math.max(1, turnNumber - 2); // last 3 turns
    const olderWindow = Math.max(1, turnNumber - 10); // for reminders

    const [
      { data: recentEvents },
      { data: recentBattles },
      { data: recentDeclarations },
      { data: tensions },
      { data: worldMemories },
      { data: wikiEntities },
      { data: cities },
      { data: greatPersons },
      { data: wonders },
      { data: uprisings },
      { data: olderEvents },
    ] = await Promise.all([
      supabase.from("game_events").select("id, event_type, player, note, location, result, importance, turn_number, city_id, truth_state")
        .eq("session_id", sessionId).gte("turn_number", recentWindow).eq("confirmed", true).order("turn_number", { ascending: false }).limit(30),
      supabase.from("battles").select("id, attacker_stack_id, defender_stack_id, defender_city_id, result, casualties_attacker, casualties_defender, turn_number, biome")
        .eq("session_id", sessionId).gte("turn_number", recentWindow).limit(10),
      supabase.from("declarations").select("id, player_name, declaration_type, title, original_text, tone, turn_number")
        .eq("session_id", sessionId).gte("turn_number", recentWindow).eq("status", "published").limit(10),
      supabase.from("civ_tensions").select("player_a, player_b, total_tension, crisis_triggered, war_roll_triggered, turn_number")
        .eq("session_id", sessionId).eq("turn_number", turnNumber).limit(10),
      supabase.from("world_memories").select("id, text, category, location_name")
        .eq("session_id", sessionId).eq("approved", true).limit(20),
      supabase.from("wiki_entries").select("id, entity_type, entity_name, entity_id, owner_player")
        .eq("session_id", sessionId).limit(30),
      supabase.from("cities").select("id, name, owner_player, population_total, city_stability, famine_turn, famine_consecutive_turns, status")
        .eq("session_id", sessionId),
      supabase.from("great_persons").select("id, name, role, player_name, status")
        .eq("session_id", sessionId).eq("status", "alive").limit(10),
      supabase.from("wonders").select("id, name, status, city_id, owner_player")
        .eq("session_id", sessionId).limit(10),
      supabase.from("city_uprisings").select("id, city_id, status, escalation_level, turn_triggered")
        .eq("session_id", sessionId).in("status", ["pending", "escalated"]).limit(5),
      // Older events for "reminder" rumors
      supabase.from("game_events").select("id, event_type, player, note, location, result, importance, turn_number")
        .eq("session_id", sessionId).gte("turn_number", olderWindow).lt("turn_number", recentWindow)
        .eq("confirmed", true).eq("importance", "major").order("turn_number", { ascending: false }).limit(10),
    ]);

    // ── Build compact context for AI ──
    const eventsSummary = (recentEvents || []).map(e => ({
      id: e.id, type: e.event_type, player: e.player, note: e.note?.substring(0, 120),
      location: e.location, result: e.result, importance: e.importance, turn: e.turn_number,
    }));

    const battlesSummary = (recentBattles || []).map(b => ({
      id: b.id, result: b.result, casualties_atk: b.casualties_attacker,
      casualties_def: b.casualties_defender, turn: b.turn_number, biome: b.biome,
    }));

    const citySummary = (cities || []).map(c => ({
      id: c.id, name: c.name, owner: c.owner_player, pop: c.population_total,
      stability: c.city_stability, famine: c.famine_turn, famineTurns: c.famine_consecutive_turns,
      status: c.status,
    }));

    const tensionSummary = (tensions || []).map(t => ({
      a: t.player_a, b: t.player_b, tension: t.total_tension,
      crisis: t.crisis_triggered, war: t.war_roll_triggered,
    }));

    const olderEventsSummary = (olderEvents || []).map(e => ({
      id: e.id, type: e.event_type, player: e.player, note: e.note?.substring(0, 80),
      turn: e.turn_number, importance: e.importance,
    }));

    const wikiSummary = (wikiEntities || []).slice(0, 15).map(w => ({
      id: w.entity_id, type: w.entity_type, name: w.entity_name,
    }));

    const totalSources = eventsSummary.length + battlesSummary.length + (tensions || []).length;

    // ── Determine target rumor count (7-15 based on source density) ──
    const targetCount = Math.min(15, Math.max(7, Math.round(totalSources * 0.8 + 3)));

    // ── AI generation ──
    const ctx = await createAIContext(sessionId, turnNumber, supabase);

    const systemPrompt = `Jsi síť šeptandů, zvědů a klepáren ve středověkém světě. Generuješ krátké zvěsti (rumors), které kolují v tavernách, na tržištích a u dvorů.

PRAVIDLA:
- Každá zvěst MUSÍ odkazovat na skutečné entity a události z poskytnutých dat.
- Nikdy nevymýšlej nová jména, města, nebo události. Používej POUZE data z kontextu.
- Zvěsti začínají frázemi jako "Povídá se...", "Z tržiště zaznívá...", "U dvora šeptají...", "Vojáci si šuškají...", "Kupci hlásí..."
- Zvěsti mají být krátké (1-3 věty), imerzivní, v duchu epochy.
- Rozlišuj perspektivu: sedlák vidí jinak než šlechtic, kupec jinak než špeh.
- Pokud jsou starší události (reminders), piš je jako vzpomínky: "Stále se vzpomíná na...", "Už X kol uplynulo od..."

KATEGORIE: war, politics, economy, society, mystery
SCOPE: local, regional, world
BIAS: propaganda, merchant, peasant, spy, noble, clergy
TONE: ominous, hopeful, cynical, urgent, nostalgic, fearful, proud

Vrať JSON pole s přesně ${targetCount} zvěstmi. Formát:
[{
  "category": "war",
  "scope": "regional",
  "confidence": 75,
  "bias": "spy",
  "tone": "ominous",
  "short_text": "Krátký text zvěsti (1-3 věty)",
  "expanded_text": "Volitelný rozšířený text (2-4 věty, nebo null)",
  "entity_refs": { "event_ids": ["uuid"], "city_ids": ["uuid"], "battle_ids": [], "wiki_ids": [], "person_ids": [] },
  "is_reminder": false,
  "reminder_of_turn": null
}]

DŮLEŽITÉ:
- Zahrň 1-3 "reminder" zvěsti odkazující na starší události (is_reminder: true, reminder_of_turn: číslo kola).
- Pokryj různé kategorie — ne všechny zvěsti o válce.
- Confidence: 30-50 pro neověřené fámy, 60-80 pro spolehlivé zprávy, 90+ pro očividná fakta.`;

    const userPrompt = `Aktuální kolo: ${turnNumber}

NEDÁVNÉ UDÁLOSTI (posledních ${turnNumber - recentWindow + 1} kol):
${JSON.stringify(eventsSummary, null, 1)}

BITVY:
${JSON.stringify(battlesSummary, null, 1)}

DEKLARACE:
${JSON.stringify((recentDeclarations || []).map(d => ({ id: d.id, player: d.player_name, type: d.declaration_type, title: d.title, tone: d.tone, turn: d.turn_number })), null, 1)}

MĚSTA:
${JSON.stringify(citySummary, null, 1)}

TENZE:
${JSON.stringify(tensionSummary, null, 1)}

VZPOURY:
${JSON.stringify((uprisings || []).map(u => ({ id: u.id, city_id: u.city_id, level: u.escalation_level, turn: u.turn_triggered })), null, 1)}

WIKI ENTITY:
${JSON.stringify(wikiSummary, null, 1)}

VÝZNAMNÉ OSOBNOSTI:
${JSON.stringify((greatPersons || []).map(p => ({ id: p.id, name: p.name, role: p.role, player: p.player_name })), null, 1)}

DIVY:
${JSON.stringify((wonders || []).map(w => ({ id: w.id, name: w.name, status: w.status })), null, 1)}

PAMĚŤ SVĚTA:
${JSON.stringify((worldMemories || []).slice(0, 10).map(m => ({ text: m.text, category: m.category, location: m.location_name })), null, 1)}

STARŠÍ VÝZNAMNÉ UDÁLOSTI (pro připomínky):
${JSON.stringify(olderEventsSummary, null, 1)}

Generuj ${targetCount} zvěstí. Vrať POUZE validní JSON pole.`;

    const aiResult = await invokeAI(ctx, {
      model: "google/gemini-2.5-flash",
      systemPrompt,
      userPrompt,
      maxTokens: 4000,
    });

    if (!aiResult.ok) {
      console.error("AI rumor generation failed:", aiResult.error);
      return jsonResponse({ ok: false, error: aiResult.error, debug: aiResult.debug });
    }

    // ── Parse AI response ──
    let rumors: any[] = [];
    const rawData = aiResult.data;

    if (Array.isArray(rawData)) {
      rumors = rawData;
    } else if (rawData?.content) {
      // Try to extract JSON array from content string
      const match = rawData.content.match(/\[[\s\S]*\]/);
      if (match) {
        try { rumors = JSON.parse(match[0]); } catch { /* ignore */ }
      }
    } else if (Array.isArray(rawData?.rumors)) {
      rumors = rawData.rumors;
    }

    if (!Array.isArray(rumors) || rumors.length === 0) {
      console.error("No valid rumors parsed from AI response");
      return jsonResponse({ ok: false, error: "AI returned no valid rumors", raw: rawData });
    }

    // ── Validate and insert rumors ──
    const validCityIds = new Set((cities || []).map(c => c.id));
    const validEventIds = new Set([...(recentEvents || []).map(e => e.id), ...(olderEvents || []).map(e => e.id)]);
    const validBattleIds = new Set((recentBattles || []).map(b => b.id));

    let insertedCount = 0;
    for (const rumor of rumors) {
      if (!rumor.short_text || typeof rumor.short_text !== "string") continue;

      // Clean entity_refs — only keep valid IDs
      const refs = rumor.entity_refs || {};
      const cleanRefs = {
        event_ids: (refs.event_ids || []).filter((id: string) => validEventIds.has(id)),
        city_ids: (refs.city_ids || []).filter((id: string) => validCityIds.has(id)),
        battle_ids: (refs.battle_ids || []).filter((id: string) => validBattleIds.has(id)),
        wiki_ids: refs.wiki_ids || [],
        person_ids: refs.person_ids || [],
      };

      // Generate source_hash for dedupe
      const refString = JSON.stringify(cleanRefs) + rumor.short_text.substring(0, 50);
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(refString));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const sourceHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("").substring(0, 40);

      try {
        await supabase.from("rumors").insert({
          session_id: sessionId,
          turn_number: turnNumber,
          category: rumor.category || "society",
          scope: rumor.scope || "local",
          confidence: Math.max(0, Math.min(100, rumor.confidence || 50)),
          bias: rumor.bias || "peasant",
          tone: rumor.tone || "neutral",
          short_text: rumor.short_text,
          expanded_text: rumor.expanded_text || null,
          entity_refs: cleanRefs,
          source_hash: sourceHash,
          is_reminder: rumor.is_reminder || false,
          reminder_of_turn: rumor.reminder_of_turn || null,
        });
        insertedCount++;
      } catch (insertErr) {
        // Likely dedupe collision — skip
        console.warn("Rumor insert skipped (dedupe?):", (insertErr as Error).message);
      }
    }

    // ── Log generation ──
    try {
      await supabase.from("rumor_generation_log").insert({
        session_id: sessionId,
        turn_number: turnNumber,
        rumors_generated: insertedCount,
        source_events_count: totalSources,
      });
    } catch { /* non-critical */ }

    return jsonResponse({
      ok: true,
      generated: insertedCount,
      targetCount,
      totalSources,
      debug: aiResult.debug,
    });

  } catch (err) {
    console.error("rumor-generate error:", err);
    return errorResponse(err instanceof Error ? err.message : "Unknown error");
  }
});
