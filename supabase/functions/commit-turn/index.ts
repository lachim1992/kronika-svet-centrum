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
    // 2b. AUTO-RESOLVE UNRESOLVED BATTLE LOBBIES
    // If a player didn't confirm readiness, resolve with current data.
    // ═══════════════════════════════════════════
    try {
      const { data: unresolvedLobbies } = await supabase.from("battle_lobbies")
        .select("*")
        .eq("session_id", sessionId)
        .eq("status", "preparing")
        .eq("turn_number", turnNumber);

      let autoResolved = 0;
      for (const lb of (unresolvedLobbies || [])) {
        try {
          await supabase.functions.invoke("resolve-battle", {
            body: {
              session_id: sessionId,
              player_name: lb.attacker_player,
              current_turn: turnNumber,
              attacker_stack_id: lb.attacker_stack_id,
              defender_city_id: lb.defender_city_id || null,
              defender_stack_id: lb.defender_stack_id || null,
              speech_text: lb.attacker_speech || null,
              speech_morale_modifier: lb.attacker_speech_modifier || 0,
              defender_speech_text: lb.defender_speech || null,
              defender_speech_morale_modifier: lb.defender_speech_modifier || 0,
              attacker_formation: lb.attacker_formation || "ASSAULT",
              defender_formation: lb.defender_formation || "DEFENSIVE",
              seed: Date.now() + autoResolved,
              lobby_id: lb.id,
            },
          });
          autoResolved++;
        } catch (lbErr) {
          console.error(`Auto-resolve lobby ${lb.id}:`, lbErr);
        }
      }
      results.autoResolvedLobbies = { count: autoResolved };
    } catch (e) {
      console.error("Auto-resolve lobbies error:", e);
      results.autoResolvedLobbies = { error: (e as Error).message };
    }

    // ═══════════════════════════════════════════
    // 3. AI FACTIONS — SEQUENTIAL with reactions & battle resolution
    // Each faction acts, then its queued battles are resolved immediately.
    // Factions run in order so later factions see earlier factions' actions.
    // ═══════════════════════════════════════════
    try {
      const { data: aiFactions } = await supabase.from("ai_factions")
        .select("faction_name")
        .eq("session_id", sessionId)
        .eq("is_active", true);

      if (aiFactions && aiFactions.length > 0) {
        let processed = 0;
        const factionResults: Record<string, any> = {};

        for (const faction of aiFactions) {
          try {
            // 3a. AI faction makes decisions
            const { data: factionData } = await supabase.functions.invoke("ai-faction-turn", {
              body: { sessionId, factionName: faction.faction_name },
            });
            factionResults[faction.faction_name] = factionData;
            processed++;

            // 3b. Resolve any battles queued by this faction
            const { data: pendingBattles } = await supabase.from("action_queue")
              .select("id, action_data")
              .eq("session_id", sessionId)
              .eq("player_name", faction.faction_name)
              .eq("action_type", "battle")
              .eq("status", "pending")
              .eq("execute_on_turn", turnNumber);

            for (const battle of (pendingBattles || [])) {
              try {
                const bd = battle.action_data as any;
                await supabase.functions.invoke("resolve-battle", {
                  body: {
                    session_id: sessionId,
                    attacker_stack_id: bd.attacker_stack_id,
                    defender_city_id: bd.defender_city_id || null,
                    defender_stack_id: bd.defender_stack_id || null,
                    speech_text: bd.speech_text || "",
                    speech_morale_modifier: bd.speech_morale_modifier || 0,
                    seed: bd.seed || Date.now(),
                    biome: bd.biome || "plains",
                    current_turn: turnNumber,
                    player_name: faction.faction_name,
                  },
                });
                // Mark battle as resolved
                await supabase.from("action_queue")
                  .update({ status: "completed" })
                  .eq("id", battle.id);
              } catch (battleErr) {
                console.error(`Battle resolution for ${faction.faction_name}:`, battleErr);
                await supabase.from("action_queue")
                  .update({ status: "failed" })
                  .eq("id", battle.id);
              }
            }
          } catch (e) {
            console.error(`AI faction ${faction.faction_name} error:`, e);
          }
        }
        results.aiFactions = { processed, details: factionResults };
      } else {
        results.aiFactions = { skipped: true, reason: "no_active_factions" };
      }
    } catch (e) {
      console.error("AI faction processing error:", e);
      results.aiFactions = { error: (e as Error).message };
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
    // 6. PROCESS TURN (economy for all players + AI factions)
    // ═══════════════════════════════════════════
    try {
      const { data: allPlayers } = await supabase.from("game_players")
        .select("player_name").eq("session_id", sessionId);

      // Also include AI factions that own cities (they need economy processing too)
      const { data: activeFactions } = await supabase.from("ai_factions")
        .select("faction_name").eq("session_id", sessionId).eq("is_active", true);
      const aiFactionNames = (activeFactions || []).map((f: any) => f.faction_name);

      // Combine human players + AI factions, deduplicate
      const allEconEntities = new Set<string>();
      for (const p of (allPlayers || [])) allEconEntities.add(p.player_name);
      for (const name of aiFactionNames) allEconEntities.add(name);

      let econProcessed = 0;
      for (const name of allEconEntities) {
        const { error: ptErr } = await supabase.functions.invoke("process-turn", {
          body: { sessionId, playerName: name },
        });
        if (ptErr) console.warn(`process-turn for ${name}:`, ptErr.message);
        else econProcessed++;
      }
      results.economy = { processed: econProcessed, entities: allEconEntities.size };
    } catch (e) {
      console.error("Process turn error:", e);
      results.economy = { error: (e as Error).message };
    }

    // ═══════════════════════════════════════════
    // 7. AUTO-GENERATE CHRONICLES (all 3 types)
    // ═══════════════════════════════════════════
    // Generate chronicles for the just-closed turn (turnNumber) in the background.
    // Failures are non-critical and won't block turn progression.

    try {
      const closedTurn = turnNumber; // the turn that just ended

      // Fetch ALL data sources for chronicle generation
      const [
        { data: turnEvents },
        { data: turnMemories },
        { data: turnAnnotations },
        { data: turnBattles },
        { data: turnDeclarations },
        { data: turnBuildings },
        { data: turnRumors },
      ] = await Promise.all([
        supabase.from("game_events").select("*").eq("session_id", sessionId)
          .eq("turn_number", closedTurn).eq("confirmed", true),
        supabase.from("world_memories").select("*").eq("session_id", sessionId).eq("approved", true),
        supabase.from("event_annotations").select("*").eq("session_id", sessionId),
        supabase.from("battles").select("*").eq("session_id", sessionId).eq("turn_number", closedTurn),
        supabase.from("declarations").select("*").eq("session_id", sessionId)
          .eq("turn_number", closedTurn).eq("status", "published"),
        supabase.from("city_buildings").select("*").eq("session_id", sessionId)
          .eq("completed_turn", closedTurn).eq("is_ai_generated", true),
        supabase.from("city_rumors").select("*").eq("session_id", sessionId)
          .eq("turn_number", closedTurn).eq("is_draft", false),
      ]);

      const confirmedEvents = turnEvents || [];
      const approvedMemories = (turnMemories || []).map((m: any) => ({ text: m.text, category: m.category }));
      const battles = turnBattles || [];
      const declarations = turnDeclarations || [];
      const completedBuildings = turnBuildings || [];
      const rumors = turnRumors || [];

      // Shared enrichment payload for all generators
      const enrichment = { battles, declarations, completedBuildings, rumors };

      if (confirmedEvents.length > 0 || battles.length > 0 || declarations.length > 0) {
        // Check if chronicle already exists for this turn
        const { data: existingChronicle } = await supabase.from("chronicle_entries")
          .select("id").eq("session_id", sessionId)
          .eq("turn_from", closedTurn).eq("turn_to", closedTurn)
          .eq("source_type", "chronicle").maybeSingle();

        // ─── 7a. WORLD CHRONICLE ───
        if (!existingChronicle) {
          try {
            const annotationsForTurn = (turnAnnotations || []).filter((a: any) =>
              confirmedEvents.some((e: any) => e.id === a.event_id)
            ).map((a: any) => {
              const evt = confirmedEvents.find((e: any) => e.id === a.event_id);
              return { ...a, event_type: evt?.event_type || "unknown" };
            });

            const { data: wcData } = await supabase.functions.invoke("world-chronicle-round", {
              body: {
                sessionId,
                round: closedTurn,
                confirmedEvents,
                annotations: annotationsForTurn.filter((a: any) => a.visibility !== "private"),
                worldMemories: approvedMemories,
                ...enrichment,
              },
            });

            if (wcData?.chronicleText) {
              await supabase.from("chronicle_entries").insert({
                session_id: sessionId,
                turn_from: closedTurn,
                turn_to: closedTurn,
                text: `📜 Rok ${closedTurn}\n\n${wcData.chronicleText}`,
                source_type: "chronicle",
                epoch_style: session.epoch_style || "kroniky",
              });

              // Save suggested memories
              if (wcData.newSuggestedMemories?.length) {
                for (const mem of wcData.newSuggestedMemories) {
                  await safeInsert(supabase.from("world_memories").insert({
                    session_id: sessionId,
                    text: typeof mem === "string" ? mem : mem.text || "",
                    approved: false,
                    category: typeof mem === "object" ? mem.category : "general",
                  }));
                }
              }
            }
            results.worldChronicle = { ok: true, turn: closedTurn };
          } catch (wcErr) {
            console.error("Auto world-chronicle error:", wcErr);
            results.worldChronicle = { error: (wcErr as Error).message };
          }
        } else {
          results.worldChronicle = { skipped: true, reason: "already_exists" };
        }

        // ─── 7b. PLAYER CHRONICLE (for each player) ───
        try {
          const { data: allPlayersForChron } = await supabase.from("game_players")
            .select("player_name").eq("session_id", sessionId);
          const { data: allCivs } = await supabase.from("civilizations")
            .select("player_name, civ_name").eq("session_id", sessionId);
          const { data: allCities } = await supabase.from("cities")
            .select("name, level, province, owner_player").eq("session_id", sessionId);
          const { data: existingWorldEvents } = await supabase.from("world_events")
            .select("id, title, date, summary").eq("session_id", sessionId);

          let playerChronCount = 0;
          for (const p of (allPlayersForChron || [])) {
            const { data: existingChapter } = await supabase.from("player_chronicle_chapters")
              .select("id").eq("session_id", sessionId).eq("player_name", p.player_name)
              .gte("to_turn", closedTurn).lte("from_turn", closedTurn).maybeSingle();

            if (existingChapter) continue;

            const playerEvents = confirmedEvents.filter((e: any) =>
              e.player === p.player_name || e.player === "Systém"
            );
            // Even if no events, player may have battles/declarations
            const playerBattles = battles.filter((b: any) => {
              // Match battles where player's stacks are involved (simplified: check all)
              return true; // All battles are relevant context
            });
            const playerDeclarations = declarations.filter((d: any) => d.player_name === p.player_name);

            if (playerEvents.length === 0 && playerBattles.length === 0 && playerDeclarations.length === 0) continue;

            const civ = (allCivs || []).find((c: any) => c.player_name === p.player_name);
            const playerCities = (allCities || []).filter((c: any) => c.owner_player === p.player_name)
              .map((c: any) => ({ name: c.name, level: c.level, province: c.province }));

            const rivalEvents = confirmedEvents.filter((e: any) =>
              e.player !== p.player_name && e.player !== "Systém"
            ).map((e: any) => `${e.player}: ${e.event_type}${e.note ? ` — ${e.note}` : ""}`);

            try {
              const { data: pcData } = await supabase.functions.invoke("player-chronicle", {
                body: {
                  sessionId,
                  playerName: p.player_name,
                  civName: civ?.civ_name,
                  events: playerEvents,
                  playerCities,
                  playerMemories: approvedMemories.map((m: any) => m.text),
                  rivalInfo: rivalEvents,
                  fromTurn: closedTurn,
                  toTurn: closedTurn,
                  existingWorldEvents: existingWorldEvents || [],
                  battles: playerBattles,
                  declarations: playerDeclarations,
                  completedBuildings: completedBuildings.filter((b: any) => {
                    // Filter buildings for this player's cities
                    return playerCities.some((c: any) => c.name);
                  }),
                  rumors,
                },
              });

              if (pcData?.chapterText) {
                await supabase.from("player_chronicle_chapters").insert({
                  session_id: sessionId,
                  player_name: p.player_name,
                  chapter_title: pcData.chapterTitle || `Rok ${closedTurn}`,
                  chapter_text: pcData.chapterText,
                  from_turn: closedTurn,
                  to_turn: closedTurn,
                  epoch_style: session.epoch_style || "kroniky",
                  references: [],
                });
                playerChronCount++;
              }
            } catch (pcErr) {
              console.error(`Player chronicle for ${p.player_name} error:`, pcErr);
            }
          }
          results.playerChronicles = { generated: playerChronCount };
        } catch (pcAllErr) {
          console.error("Auto player-chronicles error:", pcAllErr);
          results.playerChronicles = { error: (pcAllErr as Error).message };
        }

        // ─── 7c. WORLD HISTORY ───
        try {
          const { data: existingHistory } = await supabase.from("world_history_chapters")
            .select("id").eq("session_id", sessionId)
            .gte("to_turn", closedTurn).lte("from_turn", closedTurn).maybeSingle();

          if (!existingHistory) {
            const { data: existingWorldEvents } = await supabase.from("world_events")
              .select("id, title, date, summary").eq("session_id", sessionId);

            const canonEvents = confirmedEvents.filter((e: any) => e.truth_state === "canon");
            if (canonEvents.length > 0 || battles.length > 0) {
              const { data: whData } = await supabase.functions.invoke("world-history", {
                body: {
                  sessionId,
                  events: canonEvents,
                  worldMemories: approvedMemories.map((m: any) => m.text),
                  fromTurn: closedTurn,
                  toTurn: closedTurn,
                  existingWorldEvents: existingWorldEvents || [],
                  ...enrichment,
                },
              });

              if (whData?.chapterText) {
                await supabase.from("world_history_chapters").insert({
                  session_id: sessionId,
                  chapter_title: whData.chapterTitle || `Rok ${closedTurn}`,
                  chapter_text: whData.chapterText,
                  from_turn: closedTurn,
                  to_turn: closedTurn,
                  epoch_style: session.epoch_style || "kroniky",
                  references: [],
                });
              }
              results.worldHistory = { ok: true, turn: closedTurn };
            } else {
              results.worldHistory = { skipped: true, reason: "no_canon_events" };
            }
          } else {
            results.worldHistory = { skipped: true, reason: "already_exists" };
          }
        } catch (whErr) {
          console.error("Auto world-history error:", whErr);
          results.worldHistory = { error: (whErr as Error).message };
        }
      } else {
        results.chronicles = { skipped: true, reason: "no_events_for_turn" };
      }
    } catch (chronErr) {
      console.error("Chronicle auto-generation error:", chronErr);
      results.chronicles = { error: (chronErr as Error).message };
    }

    // ═══════════════════════════════════════════
    // 8. WIKI EVENT REFS ACCUMULATION (no AI, just structured data)
    // ═══════════════════════════════════════════
    try {
      const closedTurnForRefs = turnNumber;
      // Gather all events from this turn
      const { data: turnEventsForRefs } = await supabase.from("game_events")
        .select("id, event_type, city_id, location, note, importance, player")
        .eq("session_id", sessionId).eq("turn_number", closedTurnForRefs).eq("confirmed", true);

      const { data: turnBattlesForRefs } = await supabase.from("battles")
        .select("id, result, defender_city_id, casualties_attacker, casualties_defender")
        .eq("session_id", sessionId).eq("turn_number", closedTurnForRefs);

      const { data: turnUprisings } = await supabase.from("city_uprisings")
        .select("id, city_id, status, escalation_level")
        .eq("session_id", sessionId).eq("turn_triggered", closedTurnForRefs);

      const refsToInsert: any[] = [];
      const impactScores: Record<string, number> = {};

      const IMPACT_MAP: Record<string, number> = {
        battle: 5, uprising: 4, founding: 3, conquest: 5,
        wonder_built: 4, famine: 3, disaster: 4, trade: 1,
        build: 1, explore: 1, expand: 2, diplomacy: 2,
      };

      // Process events → link to cities
      for (const evt of (turnEventsForRefs || [])) {
        const cityId = evt.city_id;
        if (cityId) {
          refsToInsert.push({
            session_id: sessionId, entity_id: cityId, entity_type: "city",
            ref_type: "event", ref_id: evt.id,
            ref_label: `${evt.event_type}: ${(evt.note || "").substring(0, 80)}`,
            turn_number: closedTurnForRefs,
            impact_score: IMPACT_MAP[evt.event_type] || 1,
            meta: { event_type: evt.event_type, importance: evt.importance },
          });
          impactScores[cityId] = (impactScores[cityId] || 0) + (IMPACT_MAP[evt.event_type] || 1);
        }
      }

      // Process battles → link to defender city
      for (const battle of (turnBattlesForRefs || [])) {
        if (battle.defender_city_id) {
          refsToInsert.push({
            session_id: sessionId, entity_id: battle.defender_city_id, entity_type: "city",
            ref_type: "battle", ref_id: battle.id,
            ref_label: `Bitva: ${battle.result}`,
            turn_number: closedTurnForRefs,
            impact_score: 5,
            meta: { result: battle.result, casualties_a: battle.casualties_attacker, casualties_d: battle.casualties_defender },
          });
          impactScores[battle.defender_city_id] = (impactScores[battle.defender_city_id] || 0) + 5;
        }
      }

      // Process uprisings → link to city
      for (const uprising of (turnUprisings || [])) {
        refsToInsert.push({
          session_id: sessionId, entity_id: uprising.city_id, entity_type: "city",
          ref_type: "uprising", ref_id: uprising.id,
          ref_label: `Vzpoura (eskalace ${uprising.escalation_level})`,
          turn_number: closedTurnForRefs,
          impact_score: 4,
          meta: { status: uprising.status, escalation: uprising.escalation_level },
        });
        impactScores[uprising.city_id] = (impactScores[uprising.city_id] || 0) + 4;
      }

      // Bulk insert refs (ignore duplicates via ON CONFLICT)
      if (refsToInsert.length > 0) {
        await supabase.from("wiki_event_refs").upsert(refsToInsert, {
          onConflict: "session_id,entity_id,ref_type,ref_id",
          ignoreDuplicates: true,
        });
      }

      results.wikiEventRefs = { inserted: refsToInsert.length };

      // ── Check enrichment thresholds ──
      const { data: enrichCfgData } = await supabase.from("server_config")
        .select("economic_params").eq("session_id", sessionId).maybeSingle();
      const enrichCfg = (enrichCfgData as any)?.economic_params?.narrative?.enrichment || {};
      const autoEnrich = enrichCfg.auto_enrich !== false;
      const impactThreshold = enrichCfg.impact_threshold || 3;
      const minEvents = enrichCfg.min_events_for_trigger || 3;
      const triggerTypes = enrichCfg.trigger_types || ["battle", "uprising", "founding", "conquest", "wonder_built", "famine", "disaster"];

      if (autoEnrich) {
        const enrichTargets: string[] = [];
        for (const [entityId, score] of Object.entries(impactScores)) {
          if (score >= impactThreshold) {
            // Check if entity has enough total unreported refs
            const { count } = await supabase.from("wiki_event_refs")
              .select("id", { count: "exact", head: true })
              .eq("session_id", sessionId).eq("entity_id", entityId)
              .gt("turn_number", 0); // all refs
            
            const { data: wiki } = await supabase.from("wiki_entries")
              .select("last_enriched_turn").eq("session_id", sessionId).eq("entity_id", entityId).maybeSingle();
            
            const lastEnriched = (wiki as any)?.last_enriched_turn || 0;
            
            // Count refs since last enrichment
            const { count: newRefsCount } = await supabase.from("wiki_event_refs")
              .select("id", { count: "exact", head: true })
              .eq("session_id", sessionId).eq("entity_id", entityId)
              .gt("turn_number", lastEnriched);

            // Check if any trigger-type events exist
            const hasTriggerEvent = (turnEventsForRefs || []).some((e: any) =>
              e.city_id === entityId && triggerTypes.includes(e.event_type)
            ) || (turnBattlesForRefs || []).some((b: any) => b.defender_city_id === entityId)
              || (turnUprisings || []).some((u: any) => u.city_id === entityId);

            if ((newRefsCount || 0) >= minEvents || hasTriggerEvent) {
              enrichTargets.push(entityId);
            }
          }
        }

        // Trigger enrichment for qualifying entities (max 5 per turn to avoid overload)
        let enriched = 0;
        for (const entityId of enrichTargets.slice(0, 5)) {
          try {
            await supabase.functions.invoke("wiki-enrich", {
              body: { sessionId, entityId, entityType: "city", turnNumber: closedTurnForRefs },
            });
            enriched++;
          } catch (e) {
            console.error(`Wiki enrich for ${entityId} failed:`, e);
          }
        }
        results.wikiEnrichment = { targets: enrichTargets.length, enriched };
      }
    } catch (e) {
      console.error("Wiki event refs accumulation error:", e);
      results.wikiEventRefs = { error: (e as Error).message };
    }

    // ═══════════════════════════════════════════
    // 8b. RUMOR GENERATION (Šeptanda)
    // ═══════════════════════════════════════════
    try {
      const { data: rumorData, error: rumorErr } = await supabase.functions.invoke("rumor-generate", {
        body: { sessionId, turnNumber, playerName },
      });
      if (rumorErr) {
        console.error("Rumor generation error:", rumorErr);
        results.rumors = { error: rumorErr.message };
      } else {
        results.rumors = rumorData;
      }
    } catch (e) {
      console.error("Rumor generation error:", e);
      results.rumors = { error: (e as Error).message };
    }

    // ═══════════════════════════════════════════
    // 8c. GAMES & FESTIVALS — AUTO-ANNOUNCE, AUTO-SELECT HOST, AUTO-RESOLVE
    // ═══════════════════════════════════════════
    try {
      const nextTurn = turnNumber + 1;
      const OLYMPIC_PERIOD = 20;

      // Auto-announce Olympics every OLYMPIC_PERIOD turns (turn 20, 40, 60…)
      if (nextTurn > 0 && nextTurn % OLYMPIC_PERIOD === 0) {
        const { data: activeGlobal } = await supabase.from("games_festivals")
          .select("id").eq("session_id", sessionId).eq("is_global", true)
          .in("status", ["candidacy", "announced", "nomination", "qualifying", "finals"])
          .maybeSingle();

        if (!activeGlobal) {
          try {
            await supabase.functions.invoke("games-announce", {
              body: { session_id: sessionId, player_name: playerName, type: "olympic", turn_number: nextTurn },
            });
            results.gamesAnnounce = { ok: true, turn: nextTurn };
          } catch (gaErr) {
            console.error("Auto games-announce error:", gaErr);
            results.gamesAnnounce = { error: (gaErr as Error).message };
          }
        } else {
          results.gamesAnnounce = { skipped: true, reason: "active_global_exists" };
        }
      }

      // ─── Auto-select host for festivals past candidacy deadline ───
      const { data: candidacyFestivals } = await supabase.from("games_festivals")
        .select("id, candidacy_deadline_turn")
        .eq("session_id", sessionId).eq("status", "candidacy");

      let hostsSelected = 0;
      for (const cf of (candidacyFestivals || [])) {
        if (cf.candidacy_deadline_turn && turnNumber >= cf.candidacy_deadline_turn) {
          try {
            await supabase.functions.invoke("games-select-host", {
              body: { session_id: sessionId, festival_id: cf.id, turn_number: turnNumber },
            });
            hostsSelected++;
          } catch (shErr) {
            console.error(`Auto select-host ${cf.id}:`, shErr);
          }
        }
      }
      results.gamesHostSelection = { selected: hostsSelected };

      // ─── Auto-resolve festivals in nomination/qualifying/finals (2+ turns after nomination) ───
      const { data: festivalsToResolve } = await supabase.from("games_festivals")
        .select("id, is_global, announced_turn, finals_turn")
        .eq("session_id", sessionId)
        .in("status", ["nomination", "qualifying", "finals"]);

      let gamesResolved = 0;
      for (const fest of (festivalsToResolve || [])) {
        // Resolve when we reach or pass the finals_turn, or 2 turns after announcement
        const resolveAt = fest.finals_turn || (fest.announced_turn + 2);
        if (turnNumber >= resolveAt) {
          try {
            await supabase.functions.invoke("games-resolve", {
              body: { session_id: sessionId, festival_id: fest.id, turn_number: turnNumber },
            });
            gamesResolved++;
          } catch (grErr) {
            console.error(`Games resolve ${fest.id}:`, grErr);
          }
        }
      }
      results.gamesResolve = { resolved: gamesResolved };
    } catch (e) {
      console.error("Games processing error:", e);
      results.games = { error: (e as Error).message };
    }

    // ═══════════════════════════════════════════
    // 8d. ACADEMY TICK — auto-create schools, training cycles, funding
    // ═══════════════════════════════════════════
    try {
      // Run academy-tick for each player
      const allPlayers = [
        ...(players || []).map((p: any) => p.player_name),
      ];
      let academyResults: any[] = [];
      for (const pName of allPlayers) {
        try {
          const { data: atData } = await supabase.functions.invoke("academy-tick", {
            body: { session_id: sessionId, player_name: pName, turn_number: turnNumber + 1 },
          });
          academyResults.push({ player: pName, ...atData });
        } catch (atErr) {
          console.error(`Academy tick for ${pName}:`, atErr);
        }
      }
      results.academyTick = { players: academyResults };
    } catch (e) {
      console.error("Academy tick error:", e);
      results.academyTick = { error: (e as Error).message };
    }

    // ═══════════════════════════════════════════
    // 9. AI HISTORY COMPRESSION (AI mode only)
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

    // ═══════════════════════════════════════════
    // 10. VICTORY CHECK
    // ═══════════════════════════════════════════
    try {
      const victoryRes = await supabase.functions.invoke("check-victory", {
        body: { sessionId, playerName },
      });
      results.victory = victoryRes.data || {};
    } catch (e) {
      console.error("Victory check error:", e);
      results.victory = { error: (e as Error).message };
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
    { data: civIdentities },
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
    supabase.from("civ_identity").select("*").eq("session_id", sessionId),
  ]);

  // Build unified civ modifier lookup: prefer civ_identity (AI-generated), fallback to civ_bonuses
  const civIdentityMap: Record<string, any> = {};
  for (const ci of (civIdentities || [])) {
    civIdentityMap[ci.player_name] = ci;
  }
  const civBonusMap: Record<string, Record<string, number>> = {};
  for (const civ of (civilizations || [])) {
    const legacy = (civ.civ_bonuses as Record<string, number>) || {};
    const ci = civIdentityMap[civ.player_name];
    // Merge: civ_identity values take precedence
    civBonusMap[civ.player_name] = {
      growth_modifier: ci?.pop_growth_modifier ?? ci?.grain_modifier ?? legacy.growth_modifier ?? 0,
      stability_modifier: ci?.stability_modifier ?? legacy.stability_modifier ?? 0,
      legitimacy_base: legacy.legitimacy_base ?? 0,
      diplomacy_modifier: ci?.trade_modifier ? ci.trade_modifier * 50 : legacy.diplomacy_modifier ?? 0,
      trade_modifier: ci?.wealth_modifier ?? ci?.trade_modifier ?? legacy.trade_modifier ?? 0,
      morale_modifier: ci?.morale_modifier ?? legacy.morale_modifier ?? 0,
      fortification_bonus: ci?.fortification_bonus ?? legacy.fortification_bonus ?? 0,
      cavalry_bonus: ci?.cavalry_bonus ?? 0,
    };
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

    // Apply civ legitimacy bonus
    const civLegitBonus = ownerBonuses.legitimacy_base || 0;
    const currentLegitimacy = city.legitimacy || 50;
    const adjustedLegitimacy = Math.max(0, Math.min(100, currentLegitimacy + Math.round(civLegitBonus * 0.1)));

    if (adjustedDelta !== 0 || civStabBonus !== 0 || civLegitBonus !== 0) {
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
          legitimacy: adjustedLegitimacy,
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
