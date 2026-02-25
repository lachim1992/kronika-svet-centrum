import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  computeSettlementGrowth, distributePopLayers,
  computeInfluence, computeTension, evaluateRebellion,
  REPUTATION_DELTAS, REPUTATION_DECAY,
  computeTraitTensionModifier, computeTraitInfluenceModifier,
  evaluateMythAlignment, TRAIT_INTENSITY_THRESHOLD,
  TRAIT_DECAY_PER_TURN, TRAIT_DECAY_GRACE_TURNS,
  type CityForGrowth,
} from "../_shared/physics.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function safeInsert(query: any) {
  try { await query; } catch (_) { /* non-critical */ }
}

/**
 * commit-turn: Server-owned turn progression.
 *
 * Replaces client-side useNextTurn orchestration.
 * Client calls this ONCE. It handles everything:
 *
 * 1. Lock via world_tick_log (idempotent)
 * 2. Compute world physics → emit events to game_events
 * 3. Project events → update cities, civ_tensions, civ_influence
 * 4. Process AI factions (if AI mode)
 * 5. Advance turn counter
 * 6. Process economy for all players
 * 7. Compress history (AI mode)
 *
 * Input: { sessionId, playerName }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, playerName } = await req.json();
    if (!sessionId || !playerName) {
      return new Response(JSON.stringify({ error: "Missing sessionId or playerName" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Get session ──
    const { data: session } = await supabase
      .from("game_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const turnNumber = session.current_turn;
    const isAIMode = session.game_mode === "tb_single_ai";
    const results: Record<string, any> = {};

    // ═══════════════════════════════════════════
    // 1. WORLD TICK (idempotent via world_tick_log)
    // ═══════════════════════════════════════════
    const { data: existingTick } = await supabase
      .from("world_tick_log")
      .select("id")
      .eq("session_id", sessionId)
      .eq("turn_number", turnNumber)
      .maybeSingle();

    if (existingTick) {
      results.worldTick = { skipped: true, reason: "already_processed", tickId: existingTick.id };
    } else {
      // Create tick lock
      const { data: tickLog } = await supabase
        .from("world_tick_log")
        .insert({ session_id: sessionId, turn_number: turnNumber, status: "running" })
        .select("id")
        .single();

      const tickId = tickLog?.id;

      try {
        const tickResults = await runWorldTickEvents(supabase, sessionId, turnNumber);
        results.worldTick = tickResults;

        // Apply projections from emitted events
        await projectCityUpdates(supabase, tickResults.cityEvents || []);
        await projectInfluenceUpdates(supabase, sessionId, turnNumber, tickResults.influenceRecords || []);
        await projectTensionUpdates(supabase, sessionId, turnNumber, tickResults.tensionRecords || []);
        await projectCityStateUpdates(supabase, tickResults.cityStateUpdates || []);

        // Finalize tick
        await supabase.from("world_tick_log").update({
          status: "completed",
          finished_at: new Date().toISOString(),
          results: tickResults,
        }).eq("id", tickId);
      } catch (tickErr) {
        await supabase.from("world_tick_log").update({
          status: "failed",
          finished_at: new Date().toISOString(),
          results: { error: (tickErr as Error).message },
        }).eq("id", tickId);
        console.error("World tick error:", tickErr);
        results.worldTick = { error: (tickErr as Error).message };
      }
    }

    // ═══════════════════════════════════════════
    // 2. PROCESS-TICK (housekeeping)
    // ═══════════════════════════════════════════
    try {
      await supabase.functions.invoke("process-tick", {
        body: { sessionId },
      });
      results.processTick = { ok: true };
    } catch (e) {
      console.error("process-tick error:", e);
      results.processTick = { error: (e as Error).message };
    }

    // ═══════════════════════════════════════════
    // 3. AI FACTIONS (if AI mode)
    // ═══════════════════════════════════════════
    if (isAIMode) {
      try {
        const { data: aiFactions } = await supabase.from("ai_factions")
          .select("faction_name")
          .eq("session_id", sessionId)
          .eq("is_active", true);
        let processed = 0;
        for (const faction of (aiFactions || [])) {
          try {
            await supabase.functions.invoke("ai-faction-turn", {
              body: { sessionId, factionName: faction.faction_name },
            });
            processed++;
          } catch (e) {
            console.error(`AI faction ${faction.faction_name} error:`, e);
          }
        }
        results.aiFactions = { processed };
      } catch (e) {
        console.error("AI faction processing error:", e);
        results.aiFactions = { error: (e as Error).message };
      }
    }

    // ═══════════════════════════════════════════
    // 4. TURN SUMMARY + AUDIT
    // ═══════════════════════════════════════════
    await safeInsert(supabase.from("turn_summaries").insert({
      session_id: sessionId,
      turn_number: turnNumber,
      status: "closed",
      closed_at: new Date().toISOString(),
      closed_by: playerName,
    }));

    await safeInsert(supabase.from("world_action_log").insert({
      session_id: sessionId,
      player_name: playerName,
      turn_number: turnNumber,
      action_type: "commit_turn",
      description: `Kolo ${turnNumber} uzavřeno serverově. Pokračuje rok ${turnNumber + 1}.`,
    }));

    // ═══════════════════════════════════════════
    // 5. ADVANCE TURN
    // ═══════════════════════════════════════════
    await supabase.from("game_sessions")
      .update({ current_turn: turnNumber + 1 })
      .eq("id", sessionId);

    // Reset player turn_closed flags
    await supabase.from("game_players")
      .update({ turn_closed: false })
      .eq("session_id", sessionId);

    // ═══════════════════════════════════════════
    // 6. PROCESS TURN (economy for all players)
    // ═══════════════════════════════════════════
    try {
      const { data: allPlayers } = await supabase.from("game_players")
        .select("player_name").eq("session_id", sessionId);
      let econProcessed = 0;
      for (const p of (allPlayers || [])) {
        const { error: ptErr } = await supabase.functions.invoke("process-turn", {
          body: { sessionId, playerName: p.player_name },
        });
        if (ptErr) console.warn(`process-turn for ${p.player_name}:`, ptErr.message);
        else econProcessed++;
      }
      results.economy = { processed: econProcessed };
    } catch (e) {
      console.error("Process turn error:", e);
      results.economy = { error: (e as Error).message };
    }

    // ═══════════════════════════════════════════
    // 7. AI HISTORY COMPRESSION (AI mode only)
    // ═══════════════════════════════════════════
    if (isAIMode) {
      try {
        await supabase.functions.invoke("ai-compress-history", {
          body: { sessionId, currentTurn: turnNumber + 1, tier: session.tier || "free" },
        });
        results.compression = { ok: true };
      } catch (e) {
        console.error("History compression error:", e);
        results.compression = { error: (e as Error).message };
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      turnClosed: turnNumber,
      newTurn: turnNumber + 1,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("commit-turn error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// WORLD TICK — EVENT EMITTER (compute + append events, NO direct mutations)
// ═══════════════════════════════════════════════════════════════

async function runWorldTickEvents(supabase: any, sessionId: string, turnNumber: number) {
  const results: Record<string, any> = {};
  const emittedEvents: any[] = [];

  // ── Fetch all game state ──
  const [
    { data: players },
    { data: cities },
    { data: militaryStacks },
    { data: declarations },
    { data: treaties },
    { data: laws },
    { data: provinces },
    { data: prevInfluence },
    { data: aiFactions },
    { data: cityStates },
    { data: civilizations },
    { data: entityTraits },
  ] = await Promise.all([
    supabase.from("game_players").select("*").eq("session_id", sessionId),
    supabase.from("cities").select("*").eq("session_id", sessionId),
    supabase.from("military_stacks").select("*, military_stack_composition(*)").eq("session_id", sessionId).eq("is_active", true),
    supabase.from("declarations").select("*").eq("session_id", sessionId).eq("status", "published"),
    supabase.from("game_events").select("*").eq("session_id", sessionId).in("event_type", ["treaty", "alliance", "war", "betrayal"]),
    supabase.from("laws").select("*").eq("session_id", sessionId).eq("is_active", true),
    supabase.from("provinces").select("*").eq("session_id", sessionId),
    supabase.from("civ_influence").select("*").eq("session_id", sessionId).eq("turn_number", turnNumber - 1),
    supabase.from("ai_factions").select("*").eq("session_id", sessionId).eq("is_active", true),
    supabase.from("city_states").select("*").eq("session_id", sessionId),
    supabase.from("civilizations").select("*").eq("session_id", sessionId),
    supabase.from("entity_traits").select("*").eq("session_id", sessionId).eq("is_active", true),
  ]);

  // Build civ bonus lookup
  const civBonusMap: Record<string, Record<string, number>> = {};
  for (const civ of (civilizations || [])) {
    civBonusMap[civ.player_name] = (civ.civ_bonuses as Record<string, number>) || {};
  }

  // Build trait lookup by entity_name (player_name / city name)
  const traitsByActor: Record<string, any[]> = {};
  for (const t of (entityTraits || [])) {
    const key = t.entity_name || "";
    if (!traitsByActor[key]) traitsByActor[key] = [];
    traitsByActor[key].push(t);
  }

  const playerNames = (players || []).map((p: any) => p.player_name);
  const aiFactionNames = (aiFactions || []).map((f: any) => f.faction_name);
  const allActorNames = [...new Set([...playerNames, ...aiFactionNames])];

  // ═══ SETTLEMENT GROWTH → emit events ═══
  const cityEvents: any[] = [];
  for (const city of (cities || [])) {
    // Apply civ DNA growth bonus
    const ownerBonuses = civBonusMap[city.owner_player] || {};
    const growthBonus = ownerBonuses.growth_modifier || 0;

    const growth = computeSettlementGrowth(city as CityForGrowth, {
      hasTrade: growthBonus > 0, // reuse trade factor slot for civ bonus
    });

    // Apply additional civ growth bonus on top
    const civGrowthDelta = growthBonus > 0 ? Math.round(city.population_total * growthBonus) : 0;
    const adjustedNewPop = Math.max(50, growth.newPop + civGrowthDelta);
    const adjustedDelta = adjustedNewPop - city.population_total;

    // Apply civ stability bonus
    const civStabBonus = ownerBonuses.stability_modifier || 0;
    const adjustedStability = Math.max(0, Math.min(100, growth.newStability + civStabBonus));

    if (adjustedDelta !== 0 || civStabBonus !== 0) {
      const layers = distributePopLayers(
        adjustedNewPop, city.population_total,
        city.population_peasants, city.population_burghers, city.population_clerics
      );
      cityEvents.push({
        cityId: city.id,
        updates: {
          population_total: adjustedNewPop,
          population_peasants: layers.peasants,
          population_burghers: layers.burghers,
          population_clerics: layers.clerics,
          city_stability: adjustedStability,
          development_level: growth.newDev,
        },
      });

      if (adjustedDelta !== 0) {
        emittedEvents.push({
          session_id: sessionId, turn_number: turnNumber,
          player: "Systém", actor_type: "system",
          event_type: "city_growth", confirmed: true, truth_state: "canon",
          city_id: city.id,
          note: `Populace ${city.name}: ${city.population_total} → ${adjustedNewPop} (${adjustedDelta > 0 ? "+" : ""}${adjustedDelta}).`,
          importance: "normal",
          reference: { cityId: city.id, cityName: city.name, oldPop: city.population_total, newPop: adjustedNewPop, delta: adjustedDelta, civBonus: civGrowthDelta },
        });
      }
    }
  }
  results.cityEvents = cityEvents;
  results.growthCount = cityEvents.length;

  // ═══ INFLUENCE → compute with trait + civ DNA modifiers ═══
  const influenceRecords: any[] = [];
  for (const pName of allActorNames) {
    const prev = (prevInfluence || []).find((i: any) => i.player_name === pName);
    const inf = computeInfluence({
      playerName: pName,
      cities: cities || [],
      stacks: militaryStacks || [],
      laws: laws || [],
      provinces: provinces || [],
      treaties: treaties || [],
      previousReputation: prev ? Number(prev.reputation_score) : 0,
    });

    // Apply trait-based influence modifiers
    const actorTraits = traitsByActor[pName] || [];
    const traitMods = computeTraitInfluenceModifier(actorTraits);
    inf.diplomatic_score += traitMods.diplomatic;
    inf.military_score += traitMods.military;
    inf.trade_score += traitMods.trade;
    inf.reputation_score += traitMods.reputation;

    // Apply civ DNA diplomacy/trade bonuses to influence
    const civBonus = civBonusMap[pName] || {};
    if (civBonus.diplomacy_modifier) inf.diplomatic_score += civBonus.diplomacy_modifier;
    if (civBonus.trade_modifier) inf.trade_score += Math.round(inf.trade_score * civBonus.trade_modifier);
    if (civBonus.morale_modifier) inf.military_score += civBonus.morale_modifier;

    // Recalculate total
    inf.total_influence =
      inf.military_score * 0.25 +
      inf.trade_score * 0.2 +
      inf.diplomatic_score * 0.15 +
      inf.territorial_score * 0.2 +
      inf.law_stability_score * 0.1 +
      inf.reputation_score * 0.1;
    inf.total_influence = Math.round(inf.total_influence * 10) / 10;

    influenceRecords.push({ session_id: sessionId, turn_number: turnNumber, ...inf });
  }
  results.influenceRecords = influenceRecords;

  // ═══ TENSION → compute, emit events for crises/wars ═══
  const tensionRecords: any[] = [];
  const reputationDeltas: Record<string, number> = {};

  // Process recent key events for reputation
  const { data: recentKeyEvents } = await supabase.from("game_events")
    .select("*").eq("session_id", sessionId).eq("turn_number", turnNumber)
    .eq("confirmed", true).in("event_type", ["alliance", "betrayal", "treaty"]);

  for (const evt of (recentKeyEvents || [])) {
    if (evt.event_type === "alliance") {
      reputationDeltas[evt.player] = (reputationDeltas[evt.player] || 0) + REPUTATION_DELTAS.alliance;
      emittedEvents.push({
        session_id: sessionId, turn_number: turnNumber,
        player: "Systém", actor_type: "system",
        event_type: "memory_link", confirmed: true, truth_state: "canon",
        caused_by_event_id: evt.id,
        note: `Aliance: ${evt.note || evt.player}`,
        importance: "normal",
        reference: { sourceEventId: evt.id, memoryCategory: "tradice" },
      });
    }
    if (evt.event_type === "betrayal") {
      reputationDeltas[evt.player] = (reputationDeltas[evt.player] || 0) + REPUTATION_DELTAS.betrayal;
      emittedEvents.push({
        session_id: sessionId, turn_number: turnNumber,
        player: "Systém", actor_type: "system",
        event_type: "memory_link", confirmed: true, truth_state: "canon",
        caused_by_event_id: evt.id,
        note: `Zrada: ${evt.note || evt.player}`,
        importance: "critical",
        reference: { sourceEventId: evt.id, memoryCategory: "historická jizva" },
      });
    }
    if (evt.event_type === "treaty") {
      reputationDeltas[evt.player] = (reputationDeltas[evt.player] || 0) + REPUTATION_DELTAS.treaty;
    }
  }

  for (let i = 0; i < allActorNames.length; i++) {
    for (let j = i + 1; j < allActorNames.length; j++) {
      const pA = allActorNames[i];
      const pB = allActorNames[j];
      const citiesA = (cities || []).filter((c: any) => c.owner_player === pA);
      const citiesB = (cities || []).filter((c: any) => c.owner_player === pB);
      const milA = influenceRecords.find(r => r.player_name === pA)?.military_score || 0;
      const milB = influenceRecords.find(r => r.player_name === pB)?.military_score || 0;
      const brokenTreatyCount = (treaties || []).filter((e: any) =>
        e.event_type === "betrayal" &&
        ((e.player === pA && e.note?.includes(pB)) || (e.player === pB && e.note?.includes(pA)))
      ).length;
      const embargoCount = (declarations || []).filter((d: any) =>
        d.declaration_type === "embargo" &&
        ((d.player_name === pA && d.original_text?.includes(pB)) ||
         (d.player_name === pB && d.original_text?.includes(pA)))
      ).length;

      const tension = computeTension({
        sessionId, turnNumber, playerA: pA, playerB: pB,
        citiesA, citiesB, militaryScoreA: milA, militaryScoreB: milB,
        brokenTreatyCount, embargoCount,
      });

      // Apply trait-based tension modifiers
      const traitTensionMod = computeTraitTensionModifier(
        traitsByActor[pA] || [], traitsByActor[pB] || [], pA, pB
      );
      tension.total_tension = Math.max(0, tension.total_tension + traitTensionMod);
      // Re-evaluate crisis/war thresholds with trait modifier
      tension.crisis_triggered = tension.total_tension >= 65;
      tension.war_roll_triggered = tension.total_tension >= 88;
      if (tension.war_roll_triggered && !tension.war_roll_result) {
        const seed = turnNumber * 31 + pA.length * 7 + pB.length * 13;
        tension.war_roll_result = (seed % 100) / 100;
      }

      tensionRecords.push({ session_id: sessionId, turn_number: turnNumber, ...tension });

      if (tension.crisis_triggered) {
        emittedEvents.push({
          session_id: sessionId, turn_number: turnNumber,
          player: "Systém", actor_type: "system",
          event_type: "crisis", confirmed: true, truth_state: "canon",
          note: `Diplomatická krize mezi ${pA} a ${pB}! Tenze: ${Math.round(tension.total_tension)}.`,
          importance: "critical",
          reference: { playerA: pA, playerB: pB, tension: tension.total_tension },
        });
        reputationDeltas[pA] = (reputationDeltas[pA] || 0) + REPUTATION_DELTAS.crisis_participant;
        reputationDeltas[pB] = (reputationDeltas[pB] || 0) + REPUTATION_DELTAS.crisis_participant;
      }

      if (tension.war_roll_triggered && tension.war_roll_result !== null && tension.war_roll_result > 0.7) {
        emittedEvents.push({
          session_id: sessionId, turn_number: turnNumber,
          player: "Systém", actor_type: "system",
          event_type: "war", confirmed: true, truth_state: "canon",
          note: `Válka mezi ${pA} a ${pB}! Tenze: ${Math.round(tension.total_tension)}.`,
          importance: "critical",
          reference: { playerA: pA, playerB: pB, tension: tension.total_tension, warRoll: tension.war_roll_result },
        });
        reputationDeltas[pA] = (reputationDeltas[pA] || 0) + REPUTATION_DELTAS.war_aggressor;
        reputationDeltas[pB] = (reputationDeltas[pB] || 0) + REPUTATION_DELTAS.war_defender;
      }
    }
  }
  results.tensionRecords = tensionRecords;

  // ═══ LAW EFFECTS → emit events ═══
  const lawEvents: any[] = [];
  for (const law of (laws || [])) {
    const effects = law.structured_effects as any[];
    if (!Array.isArray(effects)) continue;
    for (const effect of effects) {
      if (effect.type === "tax_change" && effect.value) {
        const targetCities = (cities || []).filter((c: any) => c.owner_player === law.player_name);
        for (const city of targetCities) {
          const stabilityChange = effect.value > 0 ? -2 : 1;
          const newStability = Math.max(0, Math.min(100, (city.city_stability || 70) + stabilityChange));
          cityEvents.push({ cityId: city.id, updates: { city_stability: newStability } });
          lawEvents.push({ law: law.law_name, city: city.name, effect: effect.type });
        }
      }
      if (effect.type === "civil_reform") {
        const targetCities = (cities || []).filter((c: any) => c.owner_player === law.player_name);
        for (const city of targetCities) {
          const newStability = Math.min(100, (city.city_stability || 70) + 3);
          cityEvents.push({ cityId: city.id, updates: { city_stability: newStability } });
          lawEvents.push({ law: law.law_name, city: city.name, effect: effect.type });
        }
      }
      if (effect.type === "military_funding" && effect.value) {
        const stacks = (militaryStacks || []).filter((s: any) => s.player_name === law.player_name);
        for (const stack of stacks) {
          await supabase.from("military_stacks").update({
            morale: Math.min(100, (stack.morale || 70) + 3),
          }).eq("id", stack.id);
        }
        lawEvents.push({ law: law.law_name, effect: effect.type });
      }
    }
  }
  results.lawEvents = lawEvents;

  // ═══ TREATY STABILITY → emit break events ═══
  const activeTreaties = (treaties || []).filter((e: any) => e.event_type === "treaty" || e.event_type === "alliance");
  for (const treaty of activeTreaties) {
    const partyA = treaty.player;
    const partyB = allActorNames.find(n => n !== partyA && treaty.note?.includes(n));
    if (!partyB) continue;

    const tensionBetween = tensionRecords.find(t =>
      (t.player_a === partyA && t.player_b === partyB) ||
      (t.player_a === partyB && t.player_b === partyA)
    );
    const tensionLevel = tensionBetween ? tensionBetween.total_tension : 0;

    if (tensionLevel > 50) {
      const breakSeed = turnNumber * 17 + partyA.length * 3 + partyB.length * 11;
      const breakRoll = (breakSeed % 100) / 100;
      const breakThreshold = tensionLevel > 70 ? 0.3 : 0.6;
      if (breakRoll < breakThreshold) {
        emittedEvents.push({
          session_id: sessionId, turn_number: turnNumber,
          player: "Systém", actor_type: "system",
          event_type: "betrayal", confirmed: true, truth_state: "canon",
          note: `Smlouva mezi ${partyA} a ${partyB} se rozpadla (tenze: ${Math.round(tensionLevel)}).`,
          importance: "critical",
          reference: { partyA, partyB, tension: tensionLevel, treatyBroken: true },
        });
        reputationDeltas[partyA] = (reputationDeltas[partyA] || 0) - 10;
        reputationDeltas[partyB] = (reputationDeltas[partyB] || 0) - 10;
      }
    }
  }

  // ═══ REBELLION → emit events ═══
  for (const city of (cities || [])) {
    const rebellion = evaluateRebellion(city, turnNumber);
    if (rebellion && rebellion.rebelled) {
      cityEvents.push({
        cityId: city.id,
        updates: {
          city_stability: rebellion.newStability,
          population_total: Math.max(50, city.population_total - rebellion.popLoss),
        },
      });
      emittedEvents.push({
        session_id: sessionId, turn_number: turnNumber,
        player: "Systém", actor_type: "system",
        event_type: "rebellion", confirmed: true, truth_state: "canon",
        city_id: city.id, location: city.name,
        note: `Vzpoura v ${city.name}! Ztráta ${rebellion.popLoss} obyvatel.`,
        importance: "critical",
        reference: { cityId: city.id, cityName: city.name, popLoss: rebellion.popLoss, oldStability: rebellion.stability, newStability: rebellion.newStability },
      });
      reputationDeltas[city.owner_player] = (reputationDeltas[city.owner_player] || 0) + REPUTATION_DELTAS.rebellion_owner;
    }
  }

  // ═══ NPC CITY-STATE DIPLOMACY ═══
  const cityStateUpdates: any[] = [];
  for (const cs of (cityStates || [])) {
    const sortedInfluence = [...influenceRecords].sort((a, b) => b.total_influence - a.total_influence);
    if (sortedInfluence.length >= 2) {
      const drift = Math.round(sortedInfluence[0].total_influence * 0.02);
      const updates: any = {};
      if (sortedInfluence[0].player_name === playerNames[0]) {
        updates.influence_p1 = Math.min(100, (cs.influence_p1 || 0) + drift);
      } else {
        updates.influence_p2 = Math.min(100, (cs.influence_p2 || 0) + drift);
      }
      const avgTension = tensionRecords.length > 0
        ? tensionRecords.reduce((s: number, t: any) => s + t.total_tension, 0) / tensionRecords.length
        : 0;
      if (avgTension > 60) updates.mood = "Nepokojný";
      else if (avgTension > 30) updates.mood = "Opatrný";
      else updates.mood = "Neutrální";
      cityStateUpdates.push({ id: cs.id, updates });
    }
  }
  results.cityStateUpdates = cityStateUpdates;

  // ═══ APPLY REPUTATION TO INFLUENCE RECORDS ═══
  for (const [pName, delta] of Object.entries(reputationDeltas)) {
    if (delta === 0) continue;
    const inf = influenceRecords.find((r: any) => r.player_name === pName);
    if (inf) {
      inf.reputation_score = Math.max(-100, Math.min(100, (inf.reputation_score || 0) + delta));
      inf.total_influence = inf.total_influence + (delta * 0.1);
    }
  }

  // ═══ MYTH ALIGNMENT → LEGITIMACY ═══
  const mythResults: any[] = [];
  for (const pName of playerNames) {
    const civ = (civilizations || []).find((c: any) => c.player_name === pName);
    if (!civ?.core_myth) continue;

    const playerTraits = traitsByActor[pName] || [];
    const recentPlayerEvents = (recentKeyEvents || []).filter((e: any) => e.player === pName);

    const mythDelta = evaluateMythAlignment(civ.core_myth, playerTraits, recentPlayerEvents);
    if (mythDelta !== 0) {
      // Apply legitimacy change to all player's cities
      const playerCities = (cities || []).filter((c: any) => c.owner_player === pName);
      for (const city of playerCities) {
        const newLeg = Math.max(0, Math.min(100, (city.legitimacy || 50) + mythDelta));
        cityEvents.push({ cityId: city.id, updates: { legitimacy: newLeg } });
      }
      mythResults.push({ player: pName, mythDelta });

      if (Math.abs(mythDelta) >= 5) {
        emittedEvents.push({
          session_id: sessionId, turn_number: turnNumber,
          player: "Systém", actor_type: "system",
          event_type: "myth_alignment", confirmed: true, truth_state: "canon",
          note: mythDelta > 0
            ? `Činy ${pName} resonují s jejich zakladatelským mýtem. Legitimita stoupá (+${mythDelta}).`
            : `Činy ${pName} se odchylují od jejich zakladatelského mýtu. Legitimita klesá (${mythDelta}).`,
          importance: "normal",
          reference: { player: pName, mythDelta, coreMíth: civ.core_myth?.substring(0, 100) },
        });
      }
    }
  }
  results.mythAlignment = mythResults;

  // ═══ TRAIT DECAY (intensity -1 for old traits without reinforcement) ═══
  const traitDecayResults: any[] = [];
  for (const t of (entityTraits || [])) {
    if (t.intensity <= 1) continue; // Don't decay below 1
    const traitAge = turnNumber - (t.source_turn || 0);
    if (traitAge < TRAIT_DECAY_GRACE_TURNS) continue; // Grace period

    // Decay: reduce intensity by TRAIT_DECAY_PER_TURN
    const newIntensity = Math.max(1, t.intensity - TRAIT_DECAY_PER_TURN);
    if (newIntensity !== t.intensity) {
      await supabase.from("entity_traits").update({ intensity: newIntensity }).eq("id", t.id);
      traitDecayResults.push({ traitId: t.id, entity: t.entity_name, trait: t.trait_text, oldIntensity: t.intensity, newIntensity });
    }
  }
  // Deactivate traits that have been at intensity 1 for too long
  for (const t of (entityTraits || [])) {
    if (t.intensity > 1) continue;
    const traitAge = turnNumber - (t.source_turn || 0);
    if (traitAge > TRAIT_DECAY_GRACE_TURNS * 3) {
      await supabase.from("entity_traits").update({ is_active: false }).eq("id", t.id);
      traitDecayResults.push({ traitId: t.id, entity: t.entity_name, trait: t.trait_text, deactivated: true });
    }
  }
  results.traitDecay = traitDecayResults;

  // ═══ PERSIST ALL EMITTED EVENTS ═══
  if (emittedEvents.length > 0) {
    const { error: evtErr } = await supabase.from("game_events").insert(emittedEvents);
    if (evtErr) console.error("Failed to insert tick events:", evtErr);
  }
  results.emittedEventsCount = emittedEvents.length;

  return results;
}

// ═══════════════════════════════════════════════════════════════
// PROJECTION FUNCTIONS (deterministic, idempotent)
// ═══════════════════════════════════════════════════════════════

async function projectCityUpdates(supabase: any, cityEvents: any[]) {
  // Merge updates per city (last write wins for same field)
  const merged: Record<string, any> = {};
  for (const evt of cityEvents) {
    if (!merged[evt.cityId]) merged[evt.cityId] = {};
    Object.assign(merged[evt.cityId], evt.updates);
  }
  for (const [cityId, updates] of Object.entries(merged)) {
    await supabase.from("cities").update(updates).eq("id", cityId);
  }
}

async function projectInfluenceUpdates(supabase: any, sessionId: string, turnNumber: number, records: any[]) {
  for (const record of records) {
    await supabase.from("civ_influence").upsert(record, {
      onConflict: "session_id,player_name,turn_number",
    });
  }
}

async function projectTensionUpdates(supabase: any, sessionId: string, turnNumber: number, records: any[]) {
  for (const record of records) {
    await supabase.from("civ_tensions").upsert(record, {
      onConflict: "session_id,player_a,player_b,turn_number",
    });
  }
}

async function projectCityStateUpdates(supabase: any, updates: any[]) {
  for (const u of updates) {
    await supabase.from("city_states").update(u.updates).eq("id", u.id);
  }
}
