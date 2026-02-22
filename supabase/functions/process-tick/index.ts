import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Support both single-session call and cron (all persistent sessions)
    let sessionIds: string[] = [];
    try {
      const body = await req.json();
      if (body?.sessionId) sessionIds = [body.sessionId];
    } catch { /* empty body from cron */ }

    if (sessionIds.length === 0) {
      const { data: configs } = await supabase
        .from("server_config")
        .select("session_id");
      sessionIds = (configs || []).map((c: any) => c.session_id);
    }

    const results: Record<string, any> = {};
    const now = new Date().toISOString();

    for (const sessionId of sessionIds) {
      const tickResult: any = {
        completedActions: 0,
        arrivedOrders: 0,
        generatedEvents: 0,
        citiesUpdated: 0,
        tensionsUpdated: 0,
        eventsCreated: 0,
      };

      // ═══════════════════════════════════════════
      // PHASE 0: HOUSEKEEPING (original process-tick)
      // ═══════════════════════════════════════════

      // Complete pending actions
      const { data: completedActions } = await supabase
        .from("action_queue")
        .update({ status: "completed" })
        .eq("session_id", sessionId)
        .eq("status", "pending")
        .lte("completes_at", now)
        .select("id");
      tickResult.completedActions = (completedActions || []).length;

      // Complete travel orders
      const { data: arrivedOrders } = await supabase
        .from("travel_orders")
        .update({ status: "arrived" })
        .eq("session_id", sessionId)
        .eq("status", "in_transit")
        .lte("arrives_at", now)
        .select("id, entity_id, to_province_id");

      for (const order of arrivedOrders || []) {
        if (order.entity_id && order.to_province_id) {
          await supabase.from("military_stacks")
            .update({ province_id: order.to_province_id })
            .eq("id", order.entity_id);
        }
      }
      tickResult.arrivedOrders = (arrivedOrders || []).length;

      // Reset expired time pools
      await supabase
        .from("time_pools")
        .update({ used_minutes: 0, resets_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })
        .eq("session_id", sessionId)
        .lte("resets_at", now);

      // Check inactivity & auto-delegate
      const { data: config } = await supabase.from("server_config")
        .select("inactivity_threshold_hours, delegation_enabled")
        .eq("session_id", sessionId).single();

      if (config?.delegation_enabled) {
        const thresholdMs = (config.inactivity_threshold_hours || 48) * 60 * 60 * 1000;
        const cutoff = new Date(Date.now() - thresholdMs).toISOString();
        await supabase.from("player_activity")
          .update({ is_delegated: true, delegated_to: "AI" })
          .eq("session_id", sessionId)
          .eq("is_delegated", false)
          .lt("last_action_at", cutoff);
      }

      // ═══════════════════════════════════════════
      // PHASE A: SETTLEMENT GROWTH (deterministic)
      // ═══════════════════════════════════════════

      const { data: session } = await supabase.from("game_sessions")
        .select("current_turn").eq("id", sessionId).single();
      const turnNumber = session?.current_turn || 1;

      const [
        { data: cities },
        { data: militaryStacks },
        { data: tradeLogs },
        { data: declarations },
        { data: treaties },
        { data: provinces },
      ] = await Promise.all([
        supabase.from("cities").select("*").eq("session_id", sessionId),
        supabase.from("military_stacks").select("*").eq("session_id", sessionId).eq("is_active", true),
        supabase.from("trade_log").select("*").eq("session_id", sessionId).order("created_at", { ascending: false }).limit(100),
        supabase.from("declarations").select("*").eq("session_id", sessionId).eq("status", "published"),
        supabase.from("game_events").select("*").eq("session_id", sessionId).in("event_type", ["treaty", "alliance", "war", "betrayal"]),
        supabase.from("provinces").select("*").eq("session_id", sessionId),
      ]);

      const allCities = cities || [];
      const allTrades = tradeLogs || [];
      const allStacks = militaryStacks || [];
      const allTreaties = treaties || [];
      const allDeclarations = declarations || [];
      const allProvinces = provinces || [];

      // Collect unique owner names
      const ownerNames = [...new Set(allCities.map((c: any) => c.owner_player).filter(Boolean))];

      // Deterministic seed for this tick
      const tickSeed = turnNumber * 31 + sessionId.charCodeAt(0) * 7;

      for (const city of allCities) {
        if (city.status !== "ok") continue;

        // Base growth
        let growthDelta = 1;

        // Famine penalty
        if (city.famine_turn) growthDelta -= 2;

        // Low stability penalty
        if ((city.city_stability || 70) < 30) growthDelta -= 1;

        // Trade route bonus: count trades involving this city's owner in recent logs
        const ownerTrades = allTrades.filter((t: any) =>
          t.from_player === city.owner_player || t.to_player === city.owner_player
        );
        if (ownerTrades.length > 0) growthDelta += 1;

        // Apply population change (scale by current pop)
        const popMultiplier = Math.max(0.005, growthDelta * 0.01);
        const popChange = Math.round(city.population_total * popMultiplier);
        const newPop = Math.max(50, city.population_total + popChange);

        // Stability drift toward 60 baseline
        let newStability = city.city_stability || 70;
        if (newStability > 60) newStability -= 1;
        else if (newStability < 60) newStability += 1;

        // Development level grows slowly with population milestones
        let newDev = city.development_level || 1;
        if (newPop > 500 && newDev < 2) newDev = 2;
        if (newPop > 2000 && newDev < 3) newDev = 3;
        if (newPop > 5000 && newDev < 4) newDev = 4;
        if (newPop > 10000 && newDev < 5) newDev = 5;

        // Update city
        const peasantRatio = city.population_peasants / Math.max(1, city.population_total);
        const burgherRatio = city.population_burghers / Math.max(1, city.population_total);
        const clericRatio = city.population_clerics / Math.max(1, city.population_total);

        await supabase.from("cities").update({
          population_total: newPop,
          population_peasants: Math.round(newPop * peasantRatio),
          population_burghers: Math.round(newPop * burgherRatio),
          population_clerics: Math.round(newPop * clericRatio),
          city_stability: Math.max(0, Math.min(100, newStability)),
          development_level: newDev,
          last_tick_at: now,
        }).eq("id", city.id);

        tickResult.citiesUpdated++;
      }

      // ═══════════════════════════════════════════
      // PHASE B: INFLUENCE SCORE (deterministic)
      // ═══════════════════════════════════════════

      // Normalize helpers
      const maxMil = Math.max(1, ...allStacks.map((s: any) => s.power || 0));
      const totalTradeVol = Math.max(1, allTrades.reduce((s: number, t: any) => s + (t.amount || 0), 0));

      for (const city of allCities) {
        if (city.status !== "ok") continue;

        // Owner's military power (normalized)
        const ownerStacks = allStacks.filter((s: any) => s.player_name === city.owner_player);
        const milPower = ownerStacks.reduce((s: number, st: any) => s + (st.power || 0), 0);
        const normMil = milPower / maxMil;

        // Owner's trade volume (normalized)
        const ownerTradeVol = allTrades
          .filter((t: any) => t.from_player === city.owner_player || t.to_player === city.owner_player)
          .reduce((s: number, t: any) => s + (t.amount || 0), 0);
        const normTrade = ownerTradeVol / totalTradeVol;

        // Stability (normalized 0-1)
        const normStability = (city.city_stability || 70) / 100;

        // Development level (normalized, max 5)
        const normDev = (city.development_level || 1) / 5;

        const influenceScore = 0.4 * normMil + 0.3 * normTrade + 0.2 * normStability + 0.1 * normDev;

        await supabase.from("cities").update({
          influence_score: Math.round(influenceScore * 1000) / 1000,
        }).eq("id", city.id);
      }

      // Aggregate influence per owner into civ_influence (upsert)
      for (const owner of ownerNames) {
        const ownerCities = allCities.filter((c: any) => c.owner_player === owner && c.status === "ok");
        const ownerStacks = allStacks.filter((s: any) => s.player_name === owner);
        const ownerProvs = allProvinces.filter((p: any) => p.owner_player === owner);

        const militaryScore = ownerStacks.reduce((s: number, st: any) => s + (st.power || 0), 0);
        const tradeScore = ownerCities.reduce((s: number, c: any) => s + (c.population_burghers || 0), 0);
        const territorialScore = ownerProvs.length * 20 + ownerCities.length * 10;
        const avgStability = ownerCities.length > 0
          ? ownerCities.reduce((s: number, c: any) => s + (c.city_stability || 70), 0) / ownerCities.length : 50;

        // Get previous reputation
        const { data: prevInf } = await supabase.from("civ_influence")
          .select("reputation_score")
          .eq("session_id", sessionId)
          .eq("player_name", owner)
          .order("turn_number", { ascending: false })
          .limit(1)
          .maybeSingle();

        const reputationScore = prevInf ? Number(prevInf.reputation_score) * 0.95 : 0;
        const totalInfluence = militaryScore * 0.25 + tradeScore * 0.2 + territorialScore * 0.2 +
          avgStability * 0.1 + reputationScore * 0.1;

        await supabase.from("civ_influence").upsert({
          session_id: sessionId,
          player_name: owner,
          turn_number: turnNumber,
          military_score: Math.round(militaryScore),
          trade_score: Math.round(tradeScore),
          territorial_score: Math.round(territorialScore),
          law_stability_score: Math.round(avgStability * 10) / 10,
          reputation_score: Math.round(reputationScore * 10) / 10,
          total_influence: Math.round(totalInfluence * 10) / 10,
        }, { onConflict: "session_id,player_name,turn_number" });
      }

      // ═══════════════════════════════════════════
      // PHASE C: TENSION MATRIX (deterministic)
      // ═══════════════════════════════════════════

      const CRISIS_THRESHOLD = 70;
      const WAR_THRESHOLD = 90;

      for (let i = 0; i < ownerNames.length; i++) {
        for (let j = i + 1; j < ownerNames.length; j++) {
          const civA = ownerNames[i];
          const civB = ownerNames[j];

          // Border proximity: shared provinces
          const citiesA = allCities.filter((c: any) => c.owner_player === civA);
          const citiesB = allCities.filter((c: any) => c.owner_player === civB);
          const provIdsA = new Set(citiesA.map((c: any) => c.province_id).filter(Boolean));
          const provIdsB = new Set(citiesB.map((c: any) => c.province_id).filter(Boolean));
          const sharedProvs = [...provIdsA].filter(id => provIdsB.has(id));
          // Also check same macro_region via provinces
          const regionsA = new Set(allProvinces.filter((p: any) => provIdsA.has(p.id)).map((p: any) => p.macro_region_id).filter(Boolean));
          const regionsB = new Set(allProvinces.filter((p: any) => provIdsB.has(p.id)).map((p: any) => p.macro_region_id).filter(Boolean));
          const sharedRegions = [...regionsA].filter(id => regionsB.has(id));
          const borderProximity = sharedProvs.length * 15 + sharedRegions.length * 5;

          // Military imbalance
          const milA = allStacks.filter((s: any) => s.player_name === civA).reduce((s: number, st: any) => s + (st.power || 0), 0);
          const milB = allStacks.filter((s: any) => s.player_name === civB).reduce((s: number, st: any) => s + (st.power || 0), 0);
          const militaryDiff = Math.abs(milA - milB) * 0.1;

          // Broken treaties
          const brokenCount = allTreaties.filter((e: any) =>
            e.event_type === "betrayal" &&
            ((e.player === civA && e.note?.includes(civB)) || (e.player === civB && e.note?.includes(civA)))
          ).length;
          const brokenTreaties = brokenCount * 20;

          // Trade embargo from declarations
          const embargoCount = allDeclarations.filter((d: any) =>
            d.declaration_type === "embargo" &&
            ((d.player_name === civA && d.original_text?.includes(civB)) ||
             (d.player_name === civB && d.original_text?.includes(civA)))
          ).length;
          const tradeEmbargo = embargoCount * 15;

          // Trade dependency imbalance
          const tradeAtoB = allTrades.filter((t: any) => t.from_player === civA && t.to_player === civB)
            .reduce((s: number, t: any) => s + (t.amount || 0), 0);
          const tradeBtoA = allTrades.filter((t: any) => t.from_player === civB && t.to_player === civA)
            .reduce((s: number, t: any) => s + (t.amount || 0), 0);
          const tradeImbalance = Math.abs(tradeAtoB - tradeBtoA) * 0.05;

          const totalTension = borderProximity + militaryDiff + brokenTreaties + tradeEmbargo + tradeImbalance;
          const crisisTriggered = totalTension >= CRISIS_THRESHOLD;
          const warRollTriggered = totalTension >= WAR_THRESHOLD;

          let warRollResult = null;
          if (warRollTriggered) {
            const seed = tickSeed + civA.length * 7 + civB.length * 13;
            warRollResult = (seed % 100) / 100;
          }

          await supabase.from("civ_tensions").upsert({
            session_id: sessionId,
            player_a: civA,
            player_b: civB,
            turn_number: turnNumber,
            border_proximity: borderProximity,
            military_diff: Math.round(militaryDiff * 10) / 10,
            broken_treaties: brokenTreaties,
            trade_embargo: tradeEmbargo,
            total_tension: Math.round(totalTension * 10) / 10,
            crisis_triggered: crisisTriggered,
            war_roll_triggered: warRollTriggered,
            war_roll_result: warRollResult,
          }, { onConflict: "session_id,player_a,player_b,turn_number" });

          tickResult.tensionsUpdated++;

          // ── Crisis event generation ──
          if (crisisTriggered) {
            await supabase.from("game_events").insert({
              session_id: sessionId,
              event_type: "crisis",
              player: "Systém",
              note: `Diplomatická krize mezi ${civA} a ${civB}! Tenze: ${Math.round(totalTension)}.`,
              importance: "critical",
              confirmed: true,
              turn_number: turnNumber,
            });
            tickResult.eventsCreated++;
          }

          // ── War trigger (probabilistic via deterministic seed) ──
          if (warRollTriggered && warRollResult !== null && warRollResult > 0.7) {
            await supabase.from("game_events").insert({
              session_id: sessionId,
              event_type: "war",
              player: "Systém",
              note: `Válka mezi ${civA} a ${civB}! Tenze: ${Math.round(totalTension)}, hod: ${Math.round(warRollResult * 100)}%.`,
              importance: "critical",
              confirmed: true,
              turn_number: turnNumber,
            });

            // Also insert a declaration record
            await supabase.from("declarations").insert({
              session_id: sessionId,
              player_name: "Systém",
              original_text: `Válka mezi ${civA} a ${civB} vypukla kvůli neúnosné tenzi (${Math.round(totalTension)}).`,
              declaration_type: "war_declaration",
              tone: "Aggressive",
              turn_number: turnNumber,
              status: "published",
            });

            tickResult.eventsCreated++;
          }
        }
      }

      // ═══════════════════════════════════════════
      // PHASE D: AUTO-GENERATE CRISIS EVENTS (famine/rebellion)
      // ═══════════════════════════════════════════

      // Famine crisis
      const famineCities = allCities.filter((c: any) => c.famine_turn);
      if (famineCities.length >= 3) {
        const famineRoll = ((tickSeed + 41) % 100) / 100;
        if (famineRoll < 0.3) {
          await supabase.from("game_events").insert({
            session_id: sessionId,
            event_type: "crisis",
            player: "Systém",
            note: `Rozsáhlý hladomor zasáhl ${famineCities.length} měst. Lid se bouří.`,
            location: famineCities[0]?.name,
            importance: "critical",
            confirmed: true,
            turn_number: turnNumber,
          });
          tickResult.eventsCreated++;
        }
      }

      // Rebellion in unstable cities
      const unstableCities = allCities.filter((c: any) => (c.city_stability || 70) < 30 && c.status === "ok");
      for (const city of unstableCities) {
        const stability = city.city_stability || 70;
        const rebelSeed = tickSeed + city.name.length * 7 + 23;
        const rebelRoll = (rebelSeed % 100) / 100;
        const rebelThreshold = stability < 15 ? 0.4 : 0.7;

        if (rebelRoll < rebelThreshold) {
          const popLoss = Math.round(city.population_total * 0.1);
          await supabase.from("cities").update({
            city_stability: Math.max(5, stability - 15),
            population_total: Math.max(50, city.population_total - popLoss),
          }).eq("id", city.id);

          await supabase.from("game_events").insert({
            session_id: sessionId,
            event_type: "rebellion",
            player: "Systém",
            note: `Vzpoura v ${city.name}! Stabilita: ${stability}%. Ztráta ${popLoss} obyvatel.`,
            location: city.name,
            importance: "critical",
            confirmed: true,
            turn_number: turnNumber,
            city_id: city.id,
          });
          tickResult.eventsCreated++;
        }
      }

      // ═══════════════════════════════════════════
      // PHASE E: LOGGING
      // ═══════════════════════════════════════════

      await supabase.from("simulation_log").insert({
        session_id: sessionId,
        year_start: turnNumber,
        year_end: turnNumber,
        events_generated: tickResult.eventsCreated,
        scope: "world_physics_tick",
        triggered_by: "cron",
      });

      results[sessionId] = tickResult;
    }

    return new Response(JSON.stringify({ ok: true, processed: sessionIds.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
