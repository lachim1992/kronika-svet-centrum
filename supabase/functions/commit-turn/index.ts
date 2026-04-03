import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  computeSettlementGrowth, distributePopLayers,
  computeInfluence, computeTension, evaluateRebellion,
  REPUTATION_DELTAS, REPUTATION_DECAY,
  computeTraitTensionModifier, computeTraitInfluenceModifier,
  evaluateMythAlignment, TRAIT_INTENSITY_THRESHOLD,
  TRAIT_DECAY_PER_TURN, TRAIT_DECAY_GRACE_TURNS,
  computeStructuralBonuses,
  type CityForGrowth,
} from "../_shared/physics.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const { sessionId, playerName, skipNarrative } = await req.json();
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

        // ═══ DIPLOMATIC RELATIONS PROJECTION ═══
        await projectDiplomaticRelations(
          supabase, sessionId, turnNumber,
          tickResults.tensionRecords || [],
          tickResults.influenceRecords || [],
          tickResults.emittedEventsCount > 0 ? true : false,
        );
        await populateDiplomaticMemory(supabase, sessionId, turnNumber);
        await syncDispositionFromRelations(supabase, sessionId);

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
    // 3b. DIPLOMATIC PACTS — expiration, defense pact auto-war, condemnation effects
    // ═══════════════════════════════════════════
    try {
      // Expire pacts that have passed their expires_turn
      const { data: expiringPacts } = await supabase.from("diplomatic_pacts")
        .select("id, pact_type, party_a, party_b")
        .eq("session_id", sessionId).eq("status", "active")
        .lte("expires_turn", turnNumber)
        .not("expires_turn", "is", null);

      let pactsExpired = 0;
      for (const p of (expiringPacts || [])) {
        await supabase.from("diplomatic_pacts").update({ status: "expired" }).eq("id", p.id);
        pactsExpired++;
        // If open_borders expired, log it
        if (p.pact_type === "open_borders") {
          await safeInsert(supabase.from("chronicle_entries").insert({
            session_id: sessionId, turn_from: turnNumber, turn_to: turnNumber,
            text: `🌍 Dohoda o otevření hranic mezi ${p.party_a} a ${p.party_b} vypršela.`,
            source_type: "system",
          }));
        }
      }

      // Defense pact auto-war: check new wars this turn, trigger allies
      const { data: newWars } = await supabase.from("war_declarations")
        .select("id, declaring_player, target_player")
        .eq("session_id", sessionId).eq("declared_turn", turnNumber).eq("status", "active");

      const { data: activePacts } = await supabase.from("diplomatic_pacts")
        .select("id, party_a, party_b, pact_type, effects")
        .eq("session_id", sessionId).eq("status", "active").eq("pact_type", "defense_pact");

      let autoWarsTriggered = 0;
      for (const war of (newWars || [])) {
        // Find defense pacts of the defender
        const defenderPacts = (activePacts || []).filter((p: any) =>
          p.party_a === war.target_player || p.party_b === war.target_player
        );
        for (const pact of defenderPacts) {
          const ally = pact.party_a === war.target_player ? pact.party_b : pact.party_a;
          if (ally === war.declaring_player) continue; // Can't auto-war against yourself

          // Check if ally already at war with attacker
          const { data: existingWar } = await supabase.from("war_declarations")
            .select("id").eq("session_id", sessionId)
            .or(`and(declaring_player.eq.${ally},target_player.eq.${war.declaring_player}),and(declaring_player.eq.${war.declaring_player},target_player.eq.${ally})`)
            .eq("status", "active").maybeSingle();

          if (!existingWar) {
            await supabase.from("war_declarations").insert({
              session_id: sessionId, declaring_player: ally, target_player: war.declaring_player,
              declared_turn: turnNumber, status: "active",
              manifest_text: `${ally} vstupuje do války na obranu spojence ${war.target_player} v souladu s obranným paktem.`,
              stability_penalty_applied: true,
            });
            await safeInsert(supabase.from("chronicle_entries").insert({
              session_id: sessionId, turn_from: turnNumber, turn_to: turnNumber,
              text: `🛡️ ${ally} vstupuje do války proti ${war.declaring_player} na obranu spojence ${war.target_player} — obranný pakt v platnosti.`,
              source_type: "system",
            }));
            autoWarsTriggered++;
          }
        }
      }

      results.diplomaticPacts = { expired: pactsExpired, autoWarsTriggered };
    } catch (e) {
      console.error("Diplomatic pacts processing error:", e);
      results.diplomaticPacts = { error: (e as Error).message };
    }

    // ═══════════════════════════════════════════
    // 3c. TRADE OFFERS — AI evaluation + expiration
    // ═══════════════════════════════════════════
    try {
      const TRADE_OFFER_EXPIRY_TURNS = 3;
      let offersExpired = 0;
      let offersAccepted = 0;
      let offersRejected = 0;

      // 1) Expire old pending offers
      const { data: staleOffers } = await supabase.from("trade_offers")
        .select("id, from_player, to_player, turn_number")
        .eq("session_id", sessionId).eq("status", "pending")
        .lte("turn_number", turnNumber - TRADE_OFFER_EXPIRY_TURNS);

      for (const offer of (staleOffers || [])) {
        await supabase.from("trade_offers").update({
          status: "expired", responded_at: new Date().toISOString(),
        }).eq("id", offer.id);
        offersExpired++;
      }

      // 2) AI factions evaluate pending offers addressed to them
      const { data: aiFactionsList } = await supabase.from("ai_factions")
        .select("faction_name, disposition, personality")
        .eq("session_id", sessionId).eq("is_active", true);

      const aiFactionNames2 = new Set((aiFactionsList || []).map((f: any) => f.faction_name));

      const { data: pendingForAI } = await supabase.from("trade_offers")
        .select("*")
        .eq("session_id", sessionId).eq("status", "pending")
        .gt("turn_number", turnNumber - TRADE_OFFER_EXPIRY_TURNS);

      for (const offer of (pendingForAI || [])) {
        if (!aiFactionNames2.has(offer.to_player)) continue; // Only AI evaluates here

        const aiFaction = (aiFactionsList || []).find((f: any) => f.faction_name === offer.to_player);
        if (!aiFaction) continue;

        // Get AI faction resources
        const { data: aiRealm } = await supabase.from("realm_resources")
          .select("gold_reserve, grain_reserve, production_reserve")
          .eq("session_id", sessionId).eq("player_name", offer.to_player).maybeSingle();

        // Simple evaluation: does the AI need what's offered and can afford what's requested?
        const offerR = offer.offer_resources || {};
        const reqR = offer.request_resources || {};
        const offerType = Object.keys(offerR)[0] || "gold";
        const offerAmt = offerR[offerType] || 0;
        const reqType = Object.keys(reqR)[0] || "gold";
        const reqAmt = reqR[reqType] || 0;

        const resMap: Record<string, string> = {
          gold: "gold_reserve", grain: "grain_reserve",
          production: "production_reserve", wealth: "gold_reserve",
        };

        const aiHasRequested = (aiRealm?.[resMap[reqType] as keyof typeof aiRealm] as number || 0);
        const canAfford = aiHasRequested >= reqAmt * (offer.duration_turns || 1);

        // Disposition check
        const disp = (aiFaction.disposition as any) || {};
        const towardsOfferer = disp[offer.from_player] ?? 0;
        const isHostile = towardsOfferer < -30;

        // Value ratio check (is this a fair trade?)
        const valueRatio = offerAmt > 0 && reqAmt > 0 ? reqAmt / offerAmt : 999;
        const isFair = valueRatio <= 3; // Accept up to 3:1 ratio

        const shouldAccept = canAfford && isFair && !isHostile;

        if (shouldAccept) {
          // Resolve city→node for graph-based trade validation
          const [fromNodeRes, toNodeRes] = await Promise.all([
            supabase.from("province_nodes").select("id").eq("session_id", sessionId).eq("city_id", offer.from_city_id).maybeSingle(),
            supabase.from("province_nodes").select("id").eq("session_id", sessionId).eq("city_id", offer.to_city_id).maybeSingle(),
          ]);

          // Accept: create trade route + update offer
          await supabase.from("trade_routes").insert({
            session_id: sessionId,
            from_city_id: offer.from_city_id,
            to_city_id: offer.to_city_id,
            from_player: offer.from_player,
            to_player: offer.to_player,
            resource_type: offerType,
            amount_per_turn: offerAmt,
            return_resource_type: reqType,
            return_amount: reqAmt,
            duration_turns: offer.duration_turns,
            started_turn: turnNumber,
            expires_turn: offer.duration_turns ? turnNumber + offer.duration_turns : null,
            status: "active",
            start_node_id: fromNodeRes.data?.id || null,
            end_node_id: toNodeRes.data?.id || null,
          });
          await supabase.from("trade_offers").update({
            status: "accepted", responded_at: new Date().toISOString(),
          }).eq("id", offer.id);

          await safeInsert(supabase.from("chronicle_entries").insert({
            session_id: sessionId, turn_from: turnNumber, turn_to: turnNumber,
            text: `📜 ${offer.to_player} přijal obchodní nabídku od ${offer.from_player}: ${offerAmt}× ${offerType} za ${reqAmt}× ${reqType}.`,
            source_type: "system",
          }));
          offersAccepted++;
        } else {
          // Reject
          await supabase.from("trade_offers").update({
            status: "rejected", responded_at: new Date().toISOString(),
          }).eq("id", offer.id);

          const reason = isHostile ? "nepřátelské vztahy" : !canAfford ? "nedostatek zdrojů" : "nevýhodné podmínky";
          await safeInsert(supabase.from("chronicle_entries").insert({
            session_id: sessionId, turn_from: turnNumber, turn_to: turnNumber,
            text: `❌ ${offer.to_player} odmítl obchodní nabídku od ${offer.from_player} (${reason}).`,
            source_type: "system",
          }));
          offersRejected++;
        }
      }

      // 3) Expire finished trade routes
      const { data: expiredRoutes } = await supabase.from("trade_routes")
        .select("id, from_player, to_player")
        .eq("session_id", sessionId).eq("status", "active")
        .lte("expires_turn", turnNumber)
        .not("expires_turn", "is", null);

      let routesExpired = 0;
      for (const route of (expiredRoutes || [])) {
        await supabase.from("trade_routes").update({ status: "expired" }).eq("id", route.id);
        await safeInsert(supabase.from("chronicle_entries").insert({
          session_id: sessionId, turn_from: turnNumber, turn_to: turnNumber,
          text: `📦 Obchodní trasa mezi ${route.from_player} a ${route.to_player} vypršela.`,
          source_type: "system",
        }));
        routesExpired++;
      }

      results.tradeProcessing = { offersExpired, offersAccepted, offersRejected, routesExpired };
    } catch (e) {
      console.error("Trade processing error:", e);
      results.tradeProcessing = { error: (e as Error).message };
    }

    // ═══════════════════════════════════════════
    // 4. ADVANCE TURN FIRST (prevents stuck state on timeout)
    // ═══════════════════════════════════════════
    await safeInsert(supabase.from("turn_summaries").insert({
      session_id: sessionId,
      turn_number: turnNumber,
      status: "closed",
      closed_at: new Date().toISOString(),
      closed_by: playerName,
    }));

    await supabase.from("game_sessions")
      .update({ current_turn: turnNumber + 1, turn_closed_p1: false, turn_closed_p2: false })
      .eq("id", sessionId);

    // Reset player turn_closed flags
    await supabase.from("game_players")
      .update({ turn_closed: false })
      .eq("session_id", sessionId);

    await safeInsert(supabase.from("world_action_log").insert({
      session_id: sessionId,
      player_name: playerName,
      turn_number: turnNumber,
      action_type: "commit_turn",
      description: `Kolo ${turnNumber} uzavřeno serverově. Pokračuje rok ${turnNumber + 1}.`,
    }));

    // ═══════════════════════════════════════════
    // 4b. RECOMPUTE ROUTES + HEX FLOWS + ECONOMY FLOW
    // Ensures new nodes built between turns get connected before economy runs.
    // ═══════════════════════════════════════════
    try {
      // Always recompute routes to pick up any new nodes
      const { data: routesRes, error: routesErr } = await supabase.functions.invoke("compute-province-routes", {
        body: { session_id: sessionId },
      });
      if (routesErr) console.warn("compute-province-routes warning:", routesErr.message);
      results.routes = routesRes || { error: routesErr?.message };

      // Recompute hex flows (force_all since routes were rebuilt)
      const { data: preFlowRes, error: preFlowErr } = await supabase.functions.invoke("compute-hex-flows", {
        body: { session_id: sessionId, force_all: true },
      });
      if (preFlowErr) console.warn("compute-hex-flows pre-economy warning:", preFlowErr.message);
      results.preHexFlows = preFlowRes || { error: preFlowErr?.message };

      // Now compute economy flow with fresh topology
      await supabase.functions.invoke("compute-economy-flow", {
        body: { sessionId },
      });
      results.economyFlow = { ok: true };

      // Goods economy: compute trade flows (recipes → inventory → market → flows)
      try {
        const { data: tfRes, error: tfErr } = await supabase.functions.invoke("compute-trade-flows", {
          body: { session_id: sessionId, turn_number: turnNumber + 1 },
        });
        if (tfErr) console.warn("compute-trade-flows warning:", tfErr.message);
        results.tradeFlows = tfRes || { error: tfErr?.message };
      } catch (tfE) {
        console.warn("compute-trade-flows warning:", (tfE as Error).message);
        results.tradeFlows = { error: (tfE as Error).message };
      }
    } catch (e) {
      console.warn("Route/flow/economy chain warning:", (e as Error).message);
      results.economyFlow = { error: (e as Error).message };
    }

    // ═══════════════════════════════════════════
    // 5. PROCESS TURN (economy for all players + AI factions)
    // ═══════════════════════════════════════════
    try {
      const { data: allPlayers } = await supabase.from("game_players")
        .select("player_name").eq("session_id", sessionId);

      const { data: activeFactions } = await supabase.from("ai_factions")
        .select("faction_name").eq("session_id", sessionId).eq("is_active", true);
      const aiFactionNames = (activeFactions || []).map((f: any) => f.faction_name);

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
    // 5b. STRATEGIC GRAPH RECOMPUTE (hex flows + collapse chain)
    // Recompute flow paths for dirty routes, then check for collapse.
    // ═══════════════════════════════════════════
    try {
      // Check if any dirty routes exist
      const { count: dirtyCount } = await supabase.from("province_routes")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId)
        .eq("path_dirty", true);

      if (dirtyCount && dirtyCount > 0) {
        const { data: flowResult, error: flowErr } = await supabase.functions.invoke("compute-hex-flows", {
          body: { session_id: sessionId },
        });
        if (flowErr) console.warn("compute-hex-flows error:", flowErr.message);
        results.hexFlows = flowResult || { error: flowErr?.message };
      } else {
        results.hexFlows = { skipped: true, reason: "no dirty routes" };
      }

      // Run collapse chain detection
      const { data: collapseResult, error: collapseErr } = await supabase.functions.invoke("collapse-chain", {
        body: { session_id: sessionId },
      });
      if (collapseErr) console.warn("collapse-chain error:", collapseErr.message);
      results.collapseChain = collapseResult || { error: collapseErr?.message };
    } catch (e) {
      console.error("Strategic graph recompute error:", e);
      results.strategicGraph = { error: (e as Error).message };
    }

    // ═══════════════════════════════════════════
    // 6. NON-CRITICAL BACKGROUND TASKS
    // Use EdgeRuntime.waitUntil to avoid CPU timeout.
    // Turn is already advanced, economy processed — these are best-effort.
    // ═══════════════════════════════════════════

    const backgroundResults: Record<string, any> = {};

    const backgroundWork = async () => {
      // ─── 6a. AUTO-GENERATE CHRONICLES ───
      if (skipNarrative) {
        backgroundResults.chronicles = { skipped: true, reason: "skipNarrative" };
        backgroundResults.worldHistory = { skipped: true, reason: "skipNarrative" };
        backgroundResults.playerChronicles = { skipped: true, reason: "skipNarrative" };
      } else try {
        const closedTurn = turnNumber;

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
        const enrichment = { battles, declarations, completedBuildings, rumors };

        if (confirmedEvents.length > 0 || battles.length > 0 || declarations.length > 0) {
          const { data: existingChronicle } = await supabase.from("chronicle_entries")
            .select("id").eq("session_id", sessionId)
            .eq("turn_from", closedTurn).eq("turn_to", closedTurn)
            .eq("source_type", "chronicle").maybeSingle();

          // World Chronicle
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
                  sessionId, round: closedTurn, confirmedEvents,
                  annotations: annotationsForTurn.filter((a: any) => a.visibility !== "private"),
                  worldMemories: approvedMemories, ...enrichment,
                },
              });

              if (wcData?.chronicleText) {
                await supabase.from("chronicle_entries").insert({
                  session_id: sessionId, turn_from: closedTurn, turn_to: closedTurn,
                  text: `📜 Rok ${closedTurn}\n\n${wcData.chronicleText}`,
                  source_type: "chronicle", epoch_style: session.epoch_style || "kroniky",
                });
                if (wcData.newSuggestedMemories?.length) {
                  for (const mem of wcData.newSuggestedMemories) {
                    await safeInsert(supabase.from("world_memories").insert({
                      session_id: sessionId, text: typeof mem === "string" ? mem : mem.text || "",
                      approved: false, category: typeof mem === "object" ? mem.category : "general",
                    }));
                  }
                }
              }
            } catch (wcErr) { console.error("Auto world-chronicle error:", wcErr); }
          }

          // Player Chronicles
          try {
            const { data: allPlayersForChron } = await supabase.from("game_players")
              .select("player_name").eq("session_id", sessionId);
            const { data: allCivs } = await supabase.from("civilizations")
              .select("player_name, civ_name").eq("session_id", sessionId);
            const { data: allCities } = await supabase.from("cities")
              .select("name, level, province, owner_player").eq("session_id", sessionId);
            const { data: existingWorldEvents } = await supabase.from("world_events")
              .select("id, title, date, summary").eq("session_id", sessionId);

            for (const p of (allPlayersForChron || [])) {
              const { data: existingChapter } = await supabase.from("player_chronicle_chapters")
                .select("id").eq("session_id", sessionId).eq("player_name", p.player_name)
                .gte("to_turn", closedTurn).lte("from_turn", closedTurn).maybeSingle();
              if (existingChapter) continue;

              const playerEvents = confirmedEvents.filter((e: any) => e.player === p.player_name || e.player === "Systém");
              const playerDeclarations = declarations.filter((d: any) => d.player_name === p.player_name);
              if (playerEvents.length === 0 && battles.length === 0 && playerDeclarations.length === 0) continue;

              const civ = (allCivs || []).find((c: any) => c.player_name === p.player_name);
              const playerCities = (allCities || []).filter((c: any) => c.owner_player === p.player_name)
                .map((c: any) => ({ name: c.name, level: c.level, province: c.province }));
              const rivalEvents = confirmedEvents.filter((e: any) => e.player !== p.player_name && e.player !== "Systém")
                .map((e: any) => `${e.player}: ${e.event_type}${e.note ? ` — ${e.note}` : ""}`);

              try {
                const { data: pcData } = await supabase.functions.invoke("player-chronicle", {
                  body: {
                    sessionId, playerName: p.player_name, civName: civ?.civ_name,
                    events: playerEvents, playerCities,
                    playerMemories: approvedMemories.map((m: any) => m.text),
                    rivalInfo: rivalEvents, fromTurn: closedTurn, toTurn: closedTurn,
                    existingWorldEvents: existingWorldEvents || [],
                    battles, declarations: playerDeclarations,
                    completedBuildings: completedBuildings.filter((b: any) => playerCities.some((c: any) => c.name)),
                    rumors,
                  },
                });
                if (pcData?.chapterText) {
                  await supabase.from("player_chronicle_chapters").insert({
                    session_id: sessionId, player_name: p.player_name,
                    chapter_title: pcData.chapterTitle || `Rok ${closedTurn}`,
                    chapter_text: pcData.chapterText, from_turn: closedTurn, to_turn: closedTurn,
                    epoch_style: session.epoch_style || "kroniky", references: [],
                  });
                }
              } catch (pcErr) { console.error(`Player chronicle for ${p.player_name} error:`, pcErr); }
            }
          } catch (pcAllErr) { console.error("Auto player-chronicles error:", pcAllErr); }

          // World History
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
                    sessionId, events: canonEvents,
                    worldMemories: approvedMemories.map((m: any) => m.text),
                    fromTurn: closedTurn, toTurn: closedTurn,
                    existingWorldEvents: existingWorldEvents || [], ...enrichment,
                  },
                });
                if (whData?.chapterText) {
                  await supabase.from("world_history_chapters").insert({
                    session_id: sessionId, chapter_title: whData.chapterTitle || `Rok ${closedTurn}`,
                    chapter_text: whData.chapterText, from_turn: closedTurn, to_turn: closedTurn,
                    epoch_style: session.epoch_style || "kroniky", references: [],
                  });
                }
              }
            }
          } catch (whErr) { console.error("Auto world-history error:", whErr); }
        }
      } catch (chronErr) { console.error("Chronicle auto-generation error:", chronErr); }

      // ═══ 8. WIKI EVENT REFS ═══
      try {
        const closedTurnForRefs = turnNumber;
        const [
          { data: turnEventsForRefs },
          { data: turnBattlesForRefs },
          { data: turnUprisings },
        ] = await Promise.all([
          supabase.from("game_events").select("id, event_type, city_id, location, note, importance, player")
            .eq("session_id", sessionId).eq("turn_number", closedTurnForRefs).eq("confirmed", true),
          supabase.from("battles").select("id, result, defender_city_id, casualties_attacker, casualties_defender")
            .eq("session_id", sessionId).eq("turn_number", closedTurnForRefs),
          supabase.from("city_uprisings").select("id, city_id, status, escalation_level")
            .eq("session_id", sessionId).eq("turn_triggered", closedTurnForRefs),
        ]);

        const refsToInsert: any[] = [];
        const impactScores: Record<string, number> = {};
        const IMPACT_MAP: Record<string, number> = {
          battle: 5, uprising: 4, founding: 3, conquest: 5,
          wonder_built: 4, famine: 3, disaster: 4, trade: 1,
          build: 1, explore: 1, expand: 2, diplomacy: 2,
        };

        for (const evt of (turnEventsForRefs || [])) {
          if (evt.city_id) {
            refsToInsert.push({
              session_id: sessionId, entity_id: evt.city_id, entity_type: "city",
              ref_type: "event", ref_id: evt.id,
              ref_label: `${evt.event_type}: ${(evt.note || "").substring(0, 80)}`,
              turn_number: closedTurnForRefs, impact_score: IMPACT_MAP[evt.event_type] || 1,
              meta: { event_type: evt.event_type, importance: evt.importance },
            });
            impactScores[evt.city_id] = (impactScores[evt.city_id] || 0) + (IMPACT_MAP[evt.event_type] || 1);
          }
        }
        for (const battle of (turnBattlesForRefs || [])) {
          if (battle.defender_city_id) {
            refsToInsert.push({
              session_id: sessionId, entity_id: battle.defender_city_id, entity_type: "city",
              ref_type: "battle", ref_id: battle.id, ref_label: `Bitva: ${battle.result}`,
              turn_number: closedTurnForRefs, impact_score: 5,
              meta: { result: battle.result, casualties_a: battle.casualties_attacker, casualties_d: battle.casualties_defender },
            });
            impactScores[battle.defender_city_id] = (impactScores[battle.defender_city_id] || 0) + 5;
          }
        }
        for (const uprising of (turnUprisings || [])) {
          refsToInsert.push({
            session_id: sessionId, entity_id: uprising.city_id, entity_type: "city",
            ref_type: "uprising", ref_id: uprising.id,
            ref_label: `Vzpoura (eskalace ${uprising.escalation_level})`,
            turn_number: closedTurnForRefs, impact_score: 4,
            meta: { status: uprising.status, escalation: uprising.escalation_level },
          });
          impactScores[uprising.city_id] = (impactScores[uprising.city_id] || 0) + 4;
        }

        if (refsToInsert.length > 0) {
          await supabase.from("wiki_event_refs").upsert(refsToInsert, {
            onConflict: "session_id,entity_id,ref_type,ref_id", ignoreDuplicates: true,
          });
        }

        // Wiki enrichment
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
              const { data: wiki } = await supabase.from("wiki_entries")
                .select("last_enriched_turn").eq("session_id", sessionId).eq("entity_id", entityId).maybeSingle();
              const lastEnriched = (wiki as any)?.last_enriched_turn || 0;
              const { count: newRefsCount } = await supabase.from("wiki_event_refs")
                .select("id", { count: "exact", head: true })
                .eq("session_id", sessionId).eq("entity_id", entityId).gt("turn_number", lastEnriched);
              const hasTriggerEvent = (turnEventsForRefs || []).some((e: any) =>
                e.city_id === entityId && triggerTypes.includes(e.event_type)
              ) || (turnBattlesForRefs || []).some((b: any) => b.defender_city_id === entityId)
                || (turnUprisings || []).some((u: any) => u.city_id === entityId);
              if ((newRefsCount || 0) >= minEvents || hasTriggerEvent) enrichTargets.push(entityId);
            }
          }
          for (const entityId of enrichTargets.slice(0, 5)) {
            try {
              await supabase.functions.invoke("wiki-enrich", {
                body: { sessionId, entityId, entityType: "city", turnNumber: closedTurnForRefs },
              });
            } catch (e) { console.error(`Wiki enrich for ${entityId} failed:`, e); }
          }
        }
      } catch (e) { console.error("Wiki event refs error:", e); }

      // ═══ 8b. RUMOR GENERATION ═══
      if (!skipNarrative) {
        try {
          await supabase.functions.invoke("rumor-generate", {
            body: { sessionId, turnNumber, playerName },
          });
        } catch (e) { console.error("Rumor generation error:", e); }
      }

      // ═══ 8c. GAMES & FESTIVALS ═══
      try {
        const nextTurn = turnNumber + 1;
        const OLYMPIC_PERIOD = 20;

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
            } catch (gaErr) { console.error("Auto games-announce error:", gaErr); }
          }
        }

        // Auto-bid AI factions
        const { data: candidacyFestivals } = await supabase.from("games_festivals")
          .select("id, candidacy_deadline_turn")
          .eq("session_id", sessionId).eq("status", "candidacy");

        for (const cf of (candidacyFestivals || [])) {
          const { data: aiFacs } = await supabase.from("ai_factions")
            .select("faction_name").eq("session_id", sessionId).eq("is_active", true);

          for (const fac of (aiFacs || [])) {
            const { count: existingBid } = await supabase.from("games_bids")
              .select("id", { count: "exact", head: true })
              .eq("festival_id", cf.id).eq("player_name", fac.faction_name);
            if (existingBid && existingBid > 0) continue;

            const { data: facCities } = await supabase.from("cities")
              .select("id, name, influence_score, development_level, city_stability, population_total, hosting_count, owner_player")
              .eq("session_id", sessionId).eq("owner_player", fac.faction_name)
              .in("status", ["ok", "active"]).order("influence_score", { ascending: false });

            const bestCity = (facCities || [])[0];
            if (!bestCity) continue;

            const { data: arena } = await supabase.from("city_buildings")
              .select("id").eq("city_id", bestCity.id).eq("session_id", sessionId)
              .eq("status", "completed").eq("is_arena", true).maybeSingle();

            const arenaBonus = arena ? 30 : -20;
            const culturalScore = bestCity.influence_score * 2;
            const logisticsScore = bestCity.development_level * 10 + bestCity.city_stability;
            const legacyBonus = (bestCity.hosting_count || 0) * 8;
            const popBonus = Math.log((bestCity.population_total || 1) + 1) * 3;
            const totalBidScore = Math.max(1, culturalScore + logisticsScore + arenaBonus + legacyBonus + popBonus);

            await supabase.from("games_bids").insert({
              session_id: sessionId, festival_id: cf.id, player_name: fac.faction_name,
              city_id: bestCity.id, gold_invested: 0,
              pitch_text: `${bestCity.name} se uchází o pořadatelství Velkých her jménem ${fac.faction_name}.${arena ? "" : " (bez arény)"}`,
              cultural_score: culturalScore, logistics_score: logisticsScore,
              stability_score: bestCity.city_stability, hosting_legacy_bonus: legacyBonus,
              total_bid_score: totalBidScore, is_winner: false,
            });
          }
        }

        // Auto-select host
        for (const cf of (candidacyFestivals || [])) {
          if (cf.candidacy_deadline_turn && turnNumber >= cf.candidacy_deadline_turn) {
            try {
              await supabase.functions.invoke("games-select-host", {
                body: { session_id: sessionId, festival_id: cf.id, turn_number: turnNumber },
              });
            } catch (shErr) { console.error(`Auto select-host ${cf.id}:`, shErr); }
          }
        }

        // Auto-qualify AI factions
        const { data: nominationFestivals } = await supabase.from("games_festivals")
          .select("id, announced_turn, finals_turn")
          .eq("session_id", sessionId).eq("status", "nomination");

        for (const nf of (nominationFestivals || [])) {
          const { data: allSessionPlayers } = await supabase.from("realm_resources")
            .select("player_name").eq("session_id", sessionId);

          for (const sp of (allSessionPlayers || [])) {
            if (sp.player_name === playerName) continue;
            const { count: existingCount } = await supabase.from("games_participants")
              .select("id", { count: "exact", head: true })
              .eq("festival_id", nf.id).eq("player_name", sp.player_name);
            if (existingCount && existingCount > 0) continue;

            try {
              const { data: simData } = await supabase.functions.invoke("games-qualify", {
                body: { session_id: sessionId, player_name: sp.player_name, festival_id: nf.id, action: "simulate" },
              });
              if (simData?.results && simData.results.length > 0) {
                const top3 = simData.results.slice(0, 3).map((r: any) => r.student_id);
                await supabase.functions.invoke("games-qualify", {
                  body: { session_id: sessionId, player_name: sp.player_name, festival_id: nf.id, action: "select", selected_student_ids: top3 },
                });
              }
            } catch (qErr) { console.error(`Auto-qualify ${sp.player_name}:`, qErr); }
          }
        }

        // Advance festivals to finals
        const { data: festivalsToAdvance } = await supabase.from("games_festivals")
          .select("id, is_global, announced_turn, finals_turn")
          .eq("session_id", sessionId).in("status", ["nomination", "qualifying"]);
        for (const fest of (festivalsToAdvance || [])) {
          const resolveAt = fest.finals_turn || (fest.announced_turn + 2);
          if (turnNumber >= resolveAt) {
            try { await supabase.from("games_festivals").update({ status: "finals" }).eq("id", fest.id); }
            catch (grErr) { console.error(`Games advance ${fest.id}:`, grErr); }
          }
        }
      } catch (e) { console.error("Games processing error:", e); }

      // ═══ 8d-pre. SPHAERA LEAGUE ═══
      try {
        const { count: activeTeamCount } = await supabase.from("league_teams")
          .select("id", { count: "exact", head: true })
          .eq("session_id", sessionId).eq("is_active", true);
        if (activeTeamCount && activeTeamCount >= 2) {
          await supabase.functions.invoke("league-play-batch", {
            body: { session_id: sessionId, player_name: playerName, rounds: 5 },
          });
        }
      } catch (e) { console.error("League play-batch error:", e); }

      // ═══ 8d. ACADEMY TICK ═══
      try {
        const { data: academyPlayers } = await supabase.from("game_players")
          .select("player_name").eq("session_id", sessionId);
        const { data: academyAIFactions } = await supabase.from("ai_factions")
          .select("faction_name").eq("session_id", sessionId).eq("is_active", true);
        const academyEntities = new Set<string>();
        for (const p of (academyPlayers || [])) academyEntities.add(p.player_name);
        for (const f of (academyAIFactions || [])) academyEntities.add(f.faction_name);
        for (const pName of academyEntities) {
          try {
            await supabase.functions.invoke("academy-tick", {
              body: { session_id: sessionId, player_name: pName, turn_number: turnNumber + 1 },
            });
          } catch (atErr) { console.error(`Academy tick for ${pName}:`, atErr); }
        }
      } catch (e) { console.error("Academy tick error:", e); }

      // ═══ 9. AI HISTORY COMPRESSION ═══
      if (isAIMode) {
        try {
          await supabase.functions.invoke("ai-compress-history", {
            body: { sessionId, currentTurn: turnNumber + 1, tier: session.tier || "free" },
          });
        } catch (e) { console.error("History compression error:", e); }
      }

      // ═══ 10. VICTORY CHECK ═══
      try {
        await supabase.functions.invoke("check-victory", {
          body: { sessionId, playerName },
        });
      } catch (e) { console.error("Victory check error:", e); }
    };

    // Schedule background work — function returns immediately
    // @ts-ignore: EdgeRuntime is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(backgroundWork());
    } else {
      // Fallback: run inline (for testing/older runtime)
      try { await backgroundWork(); } catch (e) { console.error("Background work error:", e); }
    }

    return new Response(JSON.stringify({
      ok: true,
      turnClosed: turnNumber,
      newTurn: turnNumber + 1,
      results,
      backgroundScheduled: true,
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
    // Compute structural bonuses from urban_style, society_structure, etc.
    const structural = computeStructuralBonuses(ci as any);
    // Merge: numeric + structural bonuses combined ADDITIVELY
    // Production multipliers are handled by process-turn with unified logic
    civBonusMap[civ.player_name] = {
      growth_modifier: (ci?.pop_growth_modifier ?? ci?.grain_modifier ?? legacy.growth_modifier ?? 0) + structural.pop_growth_bonus,
      stability_modifier: (ci?.stability_modifier ?? legacy.stability_modifier ?? 0) + structural.stability_bonus,
      legitimacy_base: (legacy.legitimacy_base ?? 0) + structural.legitimacy_bonus,
      diplomacy_modifier: ci?.diplomacy_modifier ?? (ci?.trade_modifier ? ci.trade_modifier * 50 : legacy.diplomacy_modifier ?? 0),
      trade_modifier: ci?.wealth_modifier ?? ci?.trade_modifier ?? legacy.trade_modifier ?? 0,
      morale_modifier: (ci?.morale_modifier ?? legacy.morale_modifier ?? 0) + structural.morale_bonus,
      fortification_bonus: (ci?.fortification_bonus ?? legacy.fortification_bonus ?? 0) + structural.defense_bonus,
      cavalry_bonus: ci?.cavalry_bonus ?? 0,
      research_modifier: ci?.research_modifier ?? 0,
      siege_bonus: structural.siege_bonus,
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
        city.population_peasants, city.population_burghers, city.population_clerics,
        city.population_warriors
      );
      cityEvents.push({
        cityId: city.id,
        updates: {
          population_total: adjustedNewPop,
          population_peasants: layers.peasants,
          population_burghers: layers.burghers,
          population_clerics: layers.clerics,
          population_warriors: layers.warriors,
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

// ═══════════════════════════════════════════════════════════════
// DIPLOMATIC RELATIONS PROJECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Projects multi-dimensional diplomatic relations from:
 * - existing tensions
 * - diplomatic pacts
 * - diplomatic memory
 * - trade routes
 * - war declarations
 */
async function projectDiplomaticRelations(
  supabase: any, sessionId: string, turnNumber: number,
  tensionRecords: any[], influenceRecords: any[], hasNewEvents: boolean,
) {
  // Load all current data sources
  const [
    { data: pacts },
    { data: wars },
    { data: memories },
    { data: tradeRoutes },
    { data: existingRelations },
    { data: allFactions },
  ] = await Promise.all([
    supabase.from("diplomatic_pacts").select("*").eq("session_id", sessionId).eq("status", "active"),
    supabase.from("war_declarations").select("*").eq("session_id", sessionId).eq("status", "active"),
    supabase.from("diplomatic_memory").select("*").eq("session_id", sessionId).eq("is_active", true),
    supabase.from("trade_routes").select("*").eq("session_id", sessionId).eq("is_active", true),
    supabase.from("diplomatic_relations").select("*").eq("session_id", sessionId),
    supabase.from("ai_factions").select("faction_name").eq("session_id", sessionId).eq("is_active", true),
  ]);

  // Collect all actor names from influence records
  const allActors = [...new Set(influenceRecords.map((r: any) => r.player_name))];
  const factionNames = new Set((allFactions || []).map((f: any) => f.faction_name));

  // Build relations for every pair
  for (let i = 0; i < allActors.length; i++) {
    for (let j = i + 1; j < allActors.length; j++) {
      const fA = allActors[i];
      const fB = allActors[j];

      // Get existing relation or create base
      const existing = (existingRelations || []).find((r: any) =>
        (r.faction_a === fA && r.faction_b === fB) || (r.faction_a === fB && r.faction_b === fA)
      );

      let trust = existing?.trust ?? 0;
      let fear = existing?.fear ?? 0;
      let grievance = existing?.grievance ?? 0;
      let dependency = existing?.dependency ?? 0;
      let ideological_alignment = existing?.ideological_alignment ?? 0;
      let cooperation_score = existing?.cooperation_score ?? 0;
      let betrayal_score = existing?.betrayal_score ?? 0;

      // ── Pact effects on trust/cooperation ──
      const pairPacts = (pacts || []).filter((p: any) =>
        (p.party_a === fA && p.party_b === fB) || (p.party_a === fB && p.party_b === fA)
      );
      for (const p of pairPacts) {
        switch (p.pact_type) {
          case "alliance": trust += 15; cooperation_score += 10; fear -= 5; break;
          case "defense_pact": trust += 10; cooperation_score += 8; fear -= 3; break;
          case "open_borders": trust += 5; cooperation_score += 5; break;
          case "embargo": trust -= 15; grievance += 10; cooperation_score -= 10; break;
          case "condemnation": trust -= 10; grievance += 5; break;
        }
      }

      // ── War effects ──
      const atWar = (wars || []).some((w: any) =>
        (w.declaring_player === fA && w.target_player === fB) ||
        (w.declaring_player === fB && w.target_player === fA)
      );
      if (atWar) {
        trust -= 30;
        fear += 15;
        grievance += 20;
        cooperation_score -= 20;
      }

      // ── Trade routes = dependency + cooperation ──
      const pairTrades = (tradeRoutes || []).filter((t: any) =>
        (t.player_a === fA && t.player_b === fB) || (t.player_a === fB && t.player_b === fA)
      );
      dependency += pairTrades.length * 5;
      cooperation_score += pairTrades.length * 3;
      trust += pairTrades.length * 2;

      // ── Memory effects ──
      const pairMemories = (memories || []).filter((m: any) =>
        (m.faction_a === fA && m.faction_b === fB) || (m.faction_a === fB && m.faction_b === fA)
      );
      for (const m of pairMemories) {
        const weight = m.importance || 1;
        // Decay: reduce effective weight based on age
        const age = turnNumber - (m.turn_number || 0);
        const decayedWeight = Math.max(0.1, weight - (age * (m.decay_rate || 0.05)));

        switch (m.memory_type) {
          case "betrayal": betrayal_score += Math.round(decayedWeight * 10); trust -= Math.round(decayedWeight * 8); grievance += Math.round(decayedWeight * 5); break;
          case "broken_promise": betrayal_score += Math.round(decayedWeight * 5); trust -= Math.round(decayedWeight * 5); grievance += Math.round(decayedWeight * 3); break;
          case "aid": trust += Math.round(decayedWeight * 8); cooperation_score += Math.round(decayedWeight * 5); grievance -= Math.round(decayedWeight * 2); break;
          case "cooperation": cooperation_score += Math.round(decayedWeight * 5); trust += Math.round(decayedWeight * 3); break;
          case "refused_help": trust -= Math.round(decayedWeight * 3); grievance += Math.round(decayedWeight * 3); break;
          case "threat": fear += Math.round(decayedWeight * 8); trust -= Math.round(decayedWeight * 3); break;
          case "war": grievance += Math.round(decayedWeight * 10); fear += Math.round(decayedWeight * 5); trust -= Math.round(decayedWeight * 10); break;
          case "peace": trust += Math.round(decayedWeight * 5); grievance -= Math.round(decayedWeight * 3); break;
          case "trade_success": cooperation_score += Math.round(decayedWeight * 3); trust += Math.round(decayedWeight * 2); dependency += Math.round(decayedWeight * 2); break;
          case "trade_refusal": trust -= Math.round(decayedWeight * 2); break;
        }
      }

      // ── Tension effects on fear ──
      const tensionRec = tensionRecords.find((t: any) =>
        (t.player_a === fA && t.player_b === fB) || (t.player_a === fB && t.player_b === fA)
      );
      if (tensionRec) {
        fear += Math.round((tensionRec.total_tension || 0) * 0.3);
      }

      // ── Military imbalance = fear for weaker party ──
      const infA = influenceRecords.find((r: any) => r.player_name === fA);
      const infB = influenceRecords.find((r: any) => r.player_name === fB);
      const milDiff = Math.abs((infA?.military_score || 0) - (infB?.military_score || 0));
      fear += Math.round(milDiff * 0.1);

      // Clamp all values to [-100, 100]
      const clamp = (v: number) => Math.max(-100, Math.min(100, v));
      trust = clamp(trust);
      fear = clamp(fear);
      grievance = clamp(grievance);
      dependency = clamp(dependency);
      ideological_alignment = clamp(ideological_alignment);
      cooperation_score = clamp(cooperation_score);
      betrayal_score = clamp(betrayal_score);

      // Compute overall disposition as weighted sum
      const overall_disposition = clamp(Math.round(
        trust * 0.3 + cooperation_score * 0.2 - grievance * 0.2 - fear * 0.1 - betrayal_score * 0.15 + dependency * 0.05
      ));

      // Upsert relation
      const canonicalA = fA < fB ? fA : fB;
      const canonicalB = fA < fB ? fB : fA;

      await supabase.from("diplomatic_relations").upsert({
        session_id: sessionId,
        faction_a: canonicalA,
        faction_b: canonicalB,
        trust, fear, grievance, dependency,
        ideological_alignment, cooperation_score, betrayal_score,
        overall_disposition,
        last_updated_turn: turnNumber,
      }, { onConflict: "session_id,faction_a,faction_b" });
    }
  }
}

/**
 * Populate diplomatic_memory from multiple sources:
 * 1. game_events with bilateral references
 * 2. diplomatic_pacts created/broken this turn
 * 3. war_declarations created this turn
 * 4. diplomacy_messages with diplomatic actions (ultimata, proposals)
 */
async function populateDiplomaticMemory(supabase: any, sessionId: string, turnNumber: number) {
  const memoryEntries: any[] = [];

  // ── 1. Game events with bilateral references ──
  const { data: events } = await supabase.from("game_events")
    .select("id, event_type, player, note, reference, turn_number, importance")
    .eq("session_id", sessionId).eq("turn_number", turnNumber).eq("confirmed", true)
    .in("event_type", ["war", "betrayal", "alliance", "treaty", "crisis", "trade", "diplomacy", "conquest", "peace"]);

  for (const evt of (events || [])) {
    const ref = evt.reference as any || {};
    const memoryTypeMap: Record<string, string> = {
      war: "war", betrayal: "betrayal", alliance: "cooperation",
      treaty: "cooperation", crisis: "threat", trade: "trade_success",
      conquest: "war", peace: "peace", diplomacy: "cooperation",
    };
    const memType = memoryTypeMap[evt.event_type] || "neutral";
    const importanceMap: Record<string, number> = { critical: 3, major: 2, normal: 1 };
    const imp = importanceMap[evt.importance] || 1;
    const partyA = ref.playerA || ref.partyA || ref.declaring_player || evt.player;
    const partyB = ref.playerB || ref.partyB || ref.target_player;
    if (!partyA || !partyB || partyA === "Systém") continue;
    memoryEntries.push({
      session_id: sessionId, faction_a: partyA, faction_b: partyB,
      memory_type: memType, detail: (evt.note || "").substring(0, 500),
      turn_number: turnNumber, importance: imp,
      decay_rate: memType === "betrayal" ? 0.02 : memType === "war" ? 0.03 : 0.05,
      source_event_id: evt.id,
    });
  }

  // ── 2. Diplomatic pacts created this turn ──
  const { data: recentPacts } = await supabase.from("diplomatic_pacts")
    .select("id, party_a, party_b, pact_type, status, created_at")
    .eq("session_id", sessionId);

  for (const p of (recentPacts || [])) {
    // Check if created within last few minutes (same turn cycle)
    const createdAt = new Date(p.created_at).getTime();
    const now = Date.now();
    if (now - createdAt > 5 * 60 * 1000) continue; // skip old pacts

    const pactMemType: Record<string, string> = {
      alliance: "cooperation", defense_pact: "cooperation",
      open_borders: "cooperation", embargo: "threat",
      condemnation: "threat", trade: "trade_success",
    };
    const memType = pactMemType[p.pact_type] || "cooperation";
    const importance = p.pact_type === "alliance" ? 2 : 1;

    // Check if memory already exists for this pact
    const existingKey = `pact_${p.id}`;
    const alreadyExists = memoryEntries.some(m =>
      m.faction_a === p.party_a && m.faction_b === p.party_b && m.detail?.includes(p.pact_type)
    );
    if (alreadyExists) continue;

    memoryEntries.push({
      session_id: sessionId, faction_a: p.party_a, faction_b: p.party_b,
      memory_type: memType, detail: `Uzavřen pakt: ${p.pact_type} mezi ${p.party_a} a ${p.party_b}`,
      turn_number: turnNumber, importance,
      decay_rate: p.pact_type === "alliance" ? 0.02 : 0.04,
    });
  }

  // ── 3. War declarations this turn ──
  const { data: wars } = await supabase.from("war_declarations")
    .select("id, declaring_player, target_player, declared_turn, status")
    .eq("session_id", sessionId).eq("declared_turn", turnNumber);

  for (const w of (wars || [])) {
    memoryEntries.push({
      session_id: sessionId, faction_a: w.declaring_player, faction_b: w.target_player,
      memory_type: "war", detail: `${w.declaring_player} vyhlásil válku ${w.target_player}`,
      turn_number: turnNumber, importance: 3,
      decay_rate: 0.02,
    });
  }

  // ── 4. Diplomacy messages with action tags (ultimata, proposals) ──
  const { data: rooms } = await supabase.from("diplomacy_rooms")
    .select("id, participant_a, participant_b")
    .eq("session_id", sessionId);

  if (rooms?.length) {
    const roomIds = rooms.map((r: any) => r.id);
    const { data: msgs } = await supabase.from("diplomacy_messages")
      .select("id, room_id, sender, message_text, created_at")
      .in("room_id", roomIds)
      .order("created_at", { ascending: false }).limit(50);

    for (const msg of (msgs || [])) {
      const createdAt = new Date(msg.created_at).getTime();
      const now = Date.now();
      if (now - createdAt > 5 * 60 * 1000) continue;

      const room = rooms.find((r: any) => r.id === msg.room_id);
      if (!room) continue;
      const otherParty = room.participant_a === msg.sender ? room.participant_b : room.participant_a;
      const text = msg.message_text || "";

      if (text.includes("[ULTIMÁTUM]")) {
        memoryEntries.push({
          session_id: sessionId, faction_a: msg.sender, faction_b: otherParty,
          memory_type: "threat", detail: `Ultimátum: ${text.substring(0, 200)}`,
          turn_number: turnNumber, importance: 2, decay_rate: 0.03,
        });
      } else if (text.includes("[OBCHODNÍ DOHODA]") || text.includes("[OBRANNÝ PAKT]")) {
        memoryEntries.push({
          session_id: sessionId, faction_a: msg.sender, faction_b: otherParty,
          memory_type: "cooperation", detail: `Návrh dohody: ${text.substring(0, 200)}`,
          turn_number: turnNumber, importance: 1, decay_rate: 0.05,
        });
      } else if (text.includes("[PŘIJATO]")) {
        memoryEntries.push({
          session_id: sessionId, faction_a: msg.sender, faction_b: otherParty,
          memory_type: "cooperation", detail: `Přijetí dohody: ${text.substring(0, 200)}`,
          turn_number: turnNumber, importance: 2, decay_rate: 0.03,
        });
      }
    }
  }

  // Deduplicate by faction_a + faction_b + memory_type (keep highest importance)
  const dedupMap = new Map<string, any>();
  for (const m of memoryEntries) {
    const key = `${m.faction_a}|${m.faction_b}|${m.memory_type}|${m.turn_number}`;
    const existing = dedupMap.get(key);
    if (!existing || m.importance > existing.importance) {
      dedupMap.set(key, m);
    }
  }

  const finalEntries = Array.from(dedupMap.values());
  if (finalEntries.length > 0) {
    await supabase.from("diplomatic_memory").insert(finalEntries);
  }
}

/**
 * Sync ai_factions.disposition from diplomatic_relations for backwards compatibility.
 */
async function syncDispositionFromRelations(supabase: any, sessionId: string) {
  const { data: aiFactions } = await supabase.from("ai_factions")
    .select("id, faction_name, disposition")
    .eq("session_id", sessionId).eq("is_active", true);

  if (!aiFactions?.length) return;

  const { data: relations } = await supabase.from("diplomatic_relations")
    .select("faction_a, faction_b, overall_disposition")
    .eq("session_id", sessionId);

  for (const ai of aiFactions) {
    const newDisp: Record<string, number> = { ...(ai.disposition as Record<string, number> || {}) };

    for (const rel of (relations || [])) {
      if (rel.faction_a === ai.faction_name) {
        newDisp[rel.faction_b] = rel.overall_disposition;
      } else if (rel.faction_b === ai.faction_name) {
        newDisp[rel.faction_a] = rel.overall_disposition;
      }
    }

    await supabase.from("ai_factions").update({ disposition: newDisp }).eq("id", ai.id);
  }
}
