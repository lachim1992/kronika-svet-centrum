import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, turnNumber } = await req.json();
    if (!sessionId || !turnNumber) {
      return new Response(JSON.stringify({ error: "Missing sessionId or turnNumber" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check for duplicate tick
    const { data: existingTick } = await supabase
      .from("world_tick_log")
      .select("id")
      .eq("session_id", sessionId)
      .eq("turn_number", turnNumber)
      .maybeSingle();

    if (existingTick) {
      return new Response(JSON.stringify({ error: "Tick already processed", tickId: existingTick.id }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create tick log entry
    const { data: tickLog } = await supabase
      .from("world_tick_log")
      .insert({ session_id: sessionId, turn_number: turnNumber, status: "running" })
      .select("id")
      .single();

    const tickId = tickLog?.id;
    const results: Record<string, any> = {};

    // ========== 1. FETCH ALL GAME STATE ==========
    const [
      { data: players },
      { data: cities },
      { data: militaryStacks },
      { data: declarations },
      { data: diplomacyRooms },
      { data: treaties },
      { data: laws },
      { data: provinces },
      { data: prevInfluence },
    ] = await Promise.all([
      supabase.from("game_players").select("*").eq("session_id", sessionId),
      supabase.from("cities").select("*").eq("session_id", sessionId),
      supabase.from("military_stacks").select("*, military_stack_composition(*)").eq("session_id", sessionId).eq("is_active", true),
      supabase.from("declarations").select("*").eq("session_id", sessionId).eq("status", "published"),
      supabase.from("diplomacy_rooms").select("*").eq("session_id", sessionId),
      supabase.from("game_events").select("*").eq("session_id", sessionId).in("event_type", ["treaty", "alliance", "war", "betrayal"]),
      supabase.from("laws").select("*").eq("session_id", sessionId).eq("is_active", true),
      supabase.from("provinces").select("*").eq("session_id", sessionId),
      supabase.from("civ_influence").select("*").eq("session_id", sessionId).eq("turn_number", turnNumber - 1),
    ]);

    const playerNames = (players || []).map((p: any) => p.player_name);

    // ========== 2. SETTLEMENT GROWTH ==========
    const growthResults: any[] = [];
    for (const city of (cities || [])) {
      if (city.status !== "ok") continue;

      const stabilityFactor = (city.city_stability || 70) / 100;
      const growthRate = city.famine_turn ? -0.02 : 0.01 * stabilityFactor;
      const popChange = Math.round(city.population_total * growthRate);

      if (popChange !== 0) {
        const newPop = Math.max(50, city.population_total + popChange);
        const peasantRatio = city.population_peasants / Math.max(1, city.population_total);
        const burgherRatio = city.population_burghers / Math.max(1, city.population_total);
        const clericRatio = city.population_clerics / Math.max(1, city.population_total);

        await supabase.from("cities").update({
          population_total: newPop,
          population_peasants: Math.round(newPop * peasantRatio),
          population_burghers: Math.round(newPop * burgherRatio),
          population_clerics: Math.round(newPop * clericRatio),
        }).eq("id", city.id);

        growthResults.push({ city: city.name, change: popChange, newPop });
      }
    }
    results.settlement_growth = growthResults;

    // ========== 3. INFLUENCE CALCULATION ==========
    const influenceResults: any[] = [];
    for (const pName of playerNames) {
      const myCities = (cities || []).filter((c: any) => c.owner_player === pName);
      const myStacks = (militaryStacks || []).filter((s: any) => s.player_name === pName);
      const myLaws = (laws || []).filter((l: any) => l.player_name === pName);
      const myProvinces = (provinces || []).filter((p: any) => p.owner_player === pName);

      // Military score: total power of active stacks
      const militaryScore = myStacks.reduce((sum: number, s: any) => sum + (s.power || 0), 0);

      // Trade score: population-based proxy (burghers drive trade)
      const tradeScore = myCities.reduce((sum: number, c: any) => sum + (c.population_burghers || 0), 0);

      // Diplomatic score: count treaties/alliances involving this player
      const diplomaticEvents = (treaties || []).filter((e: any) =>
        e.player === pName || (e.note && e.note.includes(pName))
      );
      const diplomaticScore = diplomaticEvents.length * 10;

      // Territorial score: number of provinces + cities
      const territorialScore = myProvinces.length * 20 + myCities.length * 10;

      // Law stability: active laws count * avg city stability
      const avgStability = myCities.length > 0
        ? myCities.reduce((sum: number, c: any) => sum + (c.city_stability || 70), 0) / myCities.length
        : 50;
      const lawStabilityScore = myLaws.length * 5 + avgStability * 0.5;

      // Reputation: carried from previous turn with decay
      const prev = (prevInfluence || []).find((i: any) => i.player_name === pName);
      const reputationScore = prev ? Number(prev.reputation_score) * 0.9 : 0;

      const totalInfluence = militaryScore * 0.25 + tradeScore * 0.2 + diplomaticScore * 0.15 +
        territorialScore * 0.2 + lawStabilityScore * 0.1 + reputationScore * 0.1;

      const record = {
        session_id: sessionId,
        player_name: pName,
        turn_number: turnNumber,
        military_score: Math.round(militaryScore),
        trade_score: Math.round(tradeScore),
        diplomatic_score: Math.round(diplomaticScore),
        territorial_score: Math.round(territorialScore),
        law_stability_score: Math.round(lawStabilityScore * 10) / 10,
        reputation_score: Math.round(reputationScore * 10) / 10,
        total_influence: Math.round(totalInfluence * 10) / 10,
      };

      await supabase.from("civ_influence").upsert(record, {
        onConflict: "session_id,player_name,turn_number",
      });

      influenceResults.push(record);
    }
    results.influence = influenceResults;

    // ========== 4. SCAN RECENT KEY EVENTS FOR MEMORY LINKS ==========
    const { data: recentKeyEvents } = await supabase.from("game_events")
      .select("*")
      .eq("session_id", sessionId)
      .eq("turn_number", turnNumber)
      .eq("confirmed", true)
      .in("event_type", ["alliance", "betrayal", "treaty"]);

    const reputationDeltas: Record<string, number> = {};

    // Process alliance/betrayal events into memories + chronicles
    for (const evt of (recentKeyEvents || [])) {
      if (evt.event_type === "alliance") {
        await supabase.from("world_memories").insert({
          session_id: sessionId,
          fact_text: `V roce ${turnNumber} byla uzavřena aliance: ${evt.note || evt.player}.`,
          category: "tradice",
          location_type: "world",
          location_name: "Svět",
          approved: true,
        }).catch(() => {});

        await supabase.from("chronicle_entries").insert({
          session_id: sessionId,
          text: `**Nová aliance (rok ${turnNumber}):** ${evt.note || `${evt.player} uzavřel spojenectví.`}`,
          epoch_style: "kroniky",
          turn_from: turnNumber,
          turn_to: turnNumber,
        }).catch(() => {});

        // Alliance boosts reputation
        reputationDeltas[evt.player] = (reputationDeltas[evt.player] || 0) + 10;
      }

      if (evt.event_type === "betrayal") {
        await supabase.from("world_memories").insert({
          session_id: sessionId,
          fact_text: `V roce ${turnNumber} došlo ke zradě: ${evt.note || evt.player}.`,
          category: "historická jizva",
          location_type: "world",
          location_name: "Svět",
          approved: true,
        }).catch(() => {});

        await supabase.from("chronicle_entries").insert({
          session_id: sessionId,
          text: `**Zrada (rok ${turnNumber}):** ${evt.note || `${evt.player} porušil důvěru.`} Svět nezapomíná.`,
          epoch_style: "kroniky",
          turn_from: turnNumber,
          turn_to: turnNumber,
        }).catch(() => {});

        // Betrayal devastates reputation
        reputationDeltas[evt.player] = (reputationDeltas[evt.player] || 0) - 25;
      }

      if (evt.event_type === "treaty") {
        await supabase.from("world_memories").insert({
          session_id: sessionId,
          fact_text: `V roce ${turnNumber} byla podepsána smlouva: ${evt.note || evt.player}.`,
          category: "tradice",
          location_type: "world",
          location_name: "Svět",
          approved: true,
        }).catch(() => {});

        reputationDeltas[evt.player] = (reputationDeltas[evt.player] || 0) + 5;
      }
    }

    results.memory_events_processed = (recentKeyEvents || []).length;

    // ========== 5. TENSION CALCULATION ==========
    const tensionResults: any[] = [];
    const CRISIS_THRESHOLD = 60;
    const WAR_THRESHOLD = 85;

    for (let i = 0; i < playerNames.length; i++) {
      for (let j = i + 1; j < playerNames.length; j++) {
        const pA = playerNames[i];
        const pB = playerNames[j];

        // Border proximity: shared province borders (cities in same or adjacent provinces)
        const citiesA = (cities || []).filter((c: any) => c.owner_player === pA);
        const citiesB = (cities || []).filter((c: any) => c.owner_player === pB);
        const provIdsA = new Set(citiesA.map((c: any) => c.province_id).filter(Boolean));
        const provIdsB = new Set(citiesB.map((c: any) => c.province_id).filter(Boolean));
        // Shared provinces = direct border
        const sharedProvs = [...provIdsA].filter(id => provIdsB.has(id));
        const borderProximity = sharedProvs.length * 15 + Math.min(provIdsA.size, provIdsB.size) * 2;

        // Military difference
        const milA = influenceResults.find(r => r.player_name === pA)?.military_score || 0;
        const milB = influenceResults.find(r => r.player_name === pB)?.military_score || 0;
        const militaryDiff = Math.abs(milA - milB) * 0.1;

        // Broken treaties: events involving both players
        const brokenTreaties = (treaties || []).filter((e: any) =>
          e.event_type === "betrayal" &&
          ((e.player === pA && e.note?.includes(pB)) || (e.player === pB && e.note?.includes(pA)))
        ).length * 20;

        // Trade embargo: declarations of embargo between players
        const tradeEmbargo = (declarations || []).filter((d: any) =>
          d.declaration_type === "embargo" &&
          ((d.player_name === pA && d.original_text?.includes(pB)) ||
           (d.player_name === pB && d.original_text?.includes(pA)))
        ).length * 15;

        // Conflicting alliances
        const alliancesA = (treaties || []).filter((e: any) =>
          e.event_type === "alliance" && (e.player === pA || e.note?.includes(pA))
        ).map((e: any) => e.player === pA ? e.note : e.player);
        const alliancesB = (treaties || []).filter((e: any) =>
          e.event_type === "alliance" && (e.player === pB || e.note?.includes(pB))
        ).map((e: any) => e.player === pB ? e.note : e.player);
        // If A is allied with someone B is at war with (simplified)
        const conflictingAlliances = 0; // TODO: cross-reference wars with alliances

        const totalTension = borderProximity + militaryDiff + brokenTreaties + tradeEmbargo + conflictingAlliances;
        const crisisTriggered = totalTension >= CRISIS_THRESHOLD;
        const warRollTriggered = totalTension >= WAR_THRESHOLD;
        let warRollResult = null;

        if (warRollTriggered) {
          // Deterministic-ish roll based on turn + player names
          const seed = turnNumber * 31 + pA.length * 7 + pB.length * 13;
          warRollResult = (seed % 100) / 100;
        }

        const tensionRecord = {
          session_id: sessionId,
          player_a: pA,
          player_b: pB,
          turn_number: turnNumber,
          border_proximity: borderProximity,
          military_diff: Math.round(militaryDiff * 10) / 10,
          broken_treaties: brokenTreaties,
          trade_embargo: tradeEmbargo,
          conflicting_alliances: conflictingAlliances,
          total_tension: Math.round(totalTension * 10) / 10,
          crisis_triggered: crisisTriggered,
          war_roll_triggered: warRollTriggered,
          war_roll_result: warRollResult,
        };

        await supabase.from("civ_tensions").upsert(tensionRecord, {
          onConflict: "session_id,player_a,player_b,turn_number",
        });

        tensionResults.push(tensionRecord);

        // ===== AUTO-GENERATE EVENTS + MEMORY LINKS =====
        if (crisisTriggered) {
          const crisisNote = `Diplomatická krize mezi ${pA} a ${pB}! Tenze dosáhla ${Math.round(totalTension)}.`;
          await supabase.from("game_events").insert({
            session_id: sessionId,
            event_type: "crisis",
            player: "Systém",
            note: crisisNote,
            importance: "critical",
            confirmed: true,
            turn_number: turnNumber,
          });

          // Memory: crisis
          await supabase.from("world_memories").insert({
            session_id: sessionId,
            fact_text: `V roce ${turnNumber} vypukla diplomatická krize mezi ${pA} a ${pB} (tenze: ${Math.round(totalTension)}).`,
            category: "historická jizva",
            location_type: "world",
            location_name: "Svět",
            approved: true,
          }).catch(() => {});

          // Chronicle: crisis
          await supabase.from("chronicle_entries").insert({
            session_id: sessionId,
            text: `**Diplomatická krize (rok ${turnNumber}):** Napětí mezi říšemi ${pA} a ${pB} dosáhlo bodu zlomu. Tenze: ${Math.round(totalTension)}. Vyslanci obou stran opustili jednací stoly.`,
            epoch_style: "kroniky",
            turn_from: turnNumber,
            turn_to: turnNumber,
          }).catch(() => {});

          // Reputation penalty for both sides
          reputationDeltas[pA] = (reputationDeltas[pA] || 0) - 5;
          reputationDeltas[pB] = (reputationDeltas[pB] || 0) - 5;
        }

        if (warRollTriggered && warRollResult !== null && warRollResult > 0.7) {
          const warNote = `Válka mezi ${pA} a ${pB} je nevyhnutelná! Tenze: ${Math.round(totalTension)}, hod: ${Math.round(warRollResult * 100)}%.`;
          await supabase.from("game_events").insert({
            session_id: sessionId,
            event_type: "war",
            player: "Systém",
            note: warNote,
            importance: "critical",
            confirmed: true,
            turn_number: turnNumber,
          });

          // Memory: war
          await supabase.from("world_memories").insert({
            session_id: sessionId,
            fact_text: `V roce ${turnNumber} vypukla válka mezi ${pA} a ${pB}. Svět se zachvěl.`,
            category: "historická jizva",
            location_type: "world",
            location_name: "Svět",
            approved: true,
          }).catch(() => {});

          // Chronicle: war
          await supabase.from("chronicle_entries").insert({
            session_id: sessionId,
            text: `**Vyhlášení války (rok ${turnNumber}):** Po dlouhém napětí (tenze ${Math.round(totalTension)}) vypukl otevřený konflikt mezi ${pA} a ${pB}. Vojska obou stran se dala do pohybu.`,
            epoch_style: "kroniky",
            turn_from: turnNumber,
            turn_to: turnNumber,
          }).catch(() => {});

          // Heavy reputation penalty
          reputationDeltas[pA] = (reputationDeltas[pA] || 0) - 15;
          reputationDeltas[pB] = (reputationDeltas[pB] || 0) - 10;
        }
      }
    }
    results.tensions = tensionResults;

    // ========== 5a. APPLY REPUTATION DELTAS ==========
    const reputationResults: any[] = [];
    for (const [playerName, delta] of Object.entries(reputationDeltas)) {
      if (delta === 0) continue;
      // Find this turn's influence record and update reputation
      const inf = influenceResults.find(r => r.player_name === playerName);
      if (inf) {
        const newRep = Math.max(-100, Math.min(100, (inf.reputation_score || 0) + delta));
        const newTotal = inf.total_influence + (delta * 0.1);
        await supabase.from("civ_influence").update({
          reputation_score: Math.round(newRep * 10) / 10,
          total_influence: Math.round(newTotal * 10) / 10,
        }).eq("session_id", sessionId).eq("player_name", playerName).eq("turn_number", turnNumber);
        reputationResults.push({ player: playerName, delta, newRep });
      }
    }
    results.reputation_changes = reputationResults;

    // ========== 6. APPLY LAW MODIFIERS ==========
    const lawResults: any[] = [];
    for (const law of (laws || [])) {
      const effects = law.structured_effects as any[];
      if (!Array.isArray(effects)) continue;

      for (const effect of effects) {
        if (effect.type === "tax_change" && effect.value) {
          // Modify city stability based on tax level
          const targetCities = (cities || []).filter((c: any) => c.owner_player === law.player_name);
          for (const city of targetCities) {
            const stabilityChange = effect.value > 0 ? -2 : 1; // Higher taxes = less stability
            await supabase.from("cities").update({
              city_stability: Math.max(0, Math.min(100, (city.city_stability || 70) + stabilityChange)),
            }).eq("id", city.id);
          }
          lawResults.push({ law: law.law_name, effect: effect.type, applied: true });
        }
        if (effect.type === "military_funding" && effect.value) {
          // Boost morale of stacks
          const stacks = (militaryStacks || []).filter((s: any) => s.player_name === law.player_name);
          for (const stack of stacks) {
            await supabase.from("military_stacks").update({
              morale: Math.min(100, (stack.morale || 70) + 3),
            }).eq("id", stack.id);
          }
          lawResults.push({ law: law.law_name, effect: effect.type, applied: true });
        }
        if (effect.type === "civil_reform") {
          // Boost stability
          const targetCities = (cities || []).filter((c: any) => c.owner_player === law.player_name);
          for (const city of targetCities) {
            await supabase.from("cities").update({
              city_stability: Math.min(100, (city.city_stability || 70) + 3),
            }).eq("id", city.id);
          }
          lawResults.push({ law: law.law_name, effect: effect.type, applied: true });
        }
      }
    }
    results.laws_applied = lawResults;

    // ========== 7. FINALIZE TICK ==========
    await supabase.from("world_tick_log").update({
      status: "completed",
      finished_at: new Date().toISOString(),
      results,
    }).eq("id", tickId);

    return new Response(JSON.stringify({ ok: true, tickId, turnNumber, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("world-tick error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
