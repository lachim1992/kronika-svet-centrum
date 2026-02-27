import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  computeSettlementGrowth, distributePopLayers,
  computeInfluence, computeTension, evaluateRebellion,
  clampReputation, REPUTATION_DELTAS, REPUTATION_DECAY,
  CRISIS_THRESHOLD, WAR_THRESHOLD, SETTLEMENT_LEVEL_THRESHOLDS,
  type CityForGrowth, type InfluenceInput,
} from "../_shared/physics.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper: supabase insert returns a PromiseLike without .catch() in edge runtime
async function safeInsert(query: any) {
  try { await query; } catch (_) { /* non-critical */ }
}

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
      { data: aiFactions },
      { data: cityStates },
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
      supabase.from("ai_factions").select("*").eq("session_id", sessionId).eq("is_active", true),
      supabase.from("city_states").select("*").eq("session_id", sessionId),
    ]);

    // Include AI faction names in player list for influence/tension calculations
    const playerNames = (players || []).map((p: any) => p.player_name);
    const aiFactionNames = (aiFactions || []).map((f: any) => f.faction_name);
    const allActorNames = [...new Set([...playerNames, ...aiFactionNames])];

    // ========== 2. SETTLEMENT GROWTH (shared physics) ==========
    const growthResults: any[] = [];
    const settlementUpgrades: any[] = [];
    for (const city of (cities || [])) {
      const result = computeSettlementGrowth(city as CityForGrowth);
      if (result.delta !== 0 || result.settlementUpgrade) {
        const layers = distributePopLayers(
          result.newPop, city.population_total,
          city.population_peasants, city.population_burghers, city.population_clerics
        );
        const updatePayload: any = {
          population_total: result.newPop,
          population_peasants: layers.peasants,
          population_burghers: layers.burghers,
          population_clerics: layers.clerics,
          city_stability: result.newStability,
          development_level: result.newDev,
        };

        // ── Settlement level auto-upgrade ──
        if (result.settlementUpgrade) {
          const up = result.settlementUpgrade;
          updatePayload.settlement_level = up.newLevel;
          updatePayload.level = up.newLabel;
          updatePayload.housing_capacity = up.newHousingCapacity;
          updatePayload.max_districts = up.newMaxDistricts;

          settlementUpgrades.push({
            cityId: city.id, cityName: city.name, owner: city.owner_player,
            oldLevel: up.oldLevel, newLevel: up.newLevel, newLabel: up.newLabel,
            population: result.newPop,
          });
        }

        await supabase.from("cities").update(updatePayload).eq("id", city.id);
        growthResults.push({ city: city.name, change: result.delta, newPop: result.newPop });
      }
    }
    results.settlement_growth = growthResults;

    // ── Create events, chronicles, rumors for settlement upgrades ──
    for (const up of settlementUpgrades) {
      const oldLabel = SETTLEMENT_LEVEL_THRESHOLDS.find(t => t.level === up.oldLevel)?.label || up.oldLevel;
      const eventNote = `${up.cityName} povýšeno z ${oldLabel} na ${up.newLabel} (populace: ${up.population.toLocaleString()}).`;

      // game_event
      const { data: evt } = await supabase.from("game_events").insert({
        session_id: sessionId, event_type: "settlement_upgrade", player: up.owner,
        actor_type: "system", note: eventNote, turn_number: turnNumber,
        confirmed: true, truth_state: "canon", importance: "critical",
        city_id: up.cityId,
        reference: { old_level: up.oldLevel, new_level: up.newLevel, new_label: up.newLabel, population: up.population },
      }).select("id").single();

      // chronicle_entry
      if (evt?.id) {
        await supabase.from("chronicle_entries").insert({
          session_id: sessionId, text: `Slavný den pro ${up.cityName}! ${oldLabel} se rozrostlo na ${up.newLabel}, když počet obyvatel překročil ${up.population.toLocaleString()} duší.`,
          event_id: evt.id, source_type: "system", turn_from: turnNumber, turn_to: turnNumber,
        });
      }

      // city_rumor
      await supabase.from("city_rumors").insert({
        session_id: sessionId, city_id: up.cityId, city_name: up.cityName,
        text: `Lid šeptá, že ${up.cityName} se stalo ${up.newLabel}! Stavitelé se sjíždějí z celého kraje, obchodníci se předhánějí o místa na tržišti.`,
        tone_tag: "celebratory", turn_number: turnNumber, created_by: "system", is_draft: false,
      });
    }
    results.settlement_upgrades = settlementUpgrades;

    // ========== 3. INFLUENCE CALCULATION (shared physics) ==========
    const influenceResults: any[] = [];
    for (const pName of allActorNames) {
      const prev = (prevInfluence || []).find((i: any) => i.player_name === pName);
      const result = computeInfluence({
        playerName: pName,
        cities: cities || [],
        stacks: militaryStacks || [],
        laws: laws || [],
        provinces: provinces || [],
        treaties: treaties || [],
        previousReputation: prev ? Number(prev.reputation_score) : 0,
      });

      const record = { session_id: sessionId, turn_number: turnNumber, ...result };
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
        await safeInsert(supabase.from("world_memories").insert({
          session_id: sessionId,
          text: `V roce ${turnNumber} byla uzavřena aliance: ${evt.note || evt.player}.`,
          category: "tradice",
          approved: true,
        }));

        await safeInsert(supabase.from("chronicle_entries").insert({
          session_id: sessionId,
          text: `**Nová aliance (rok ${turnNumber}):** ${evt.note || `${evt.player} uzavřel spojenectví.`}`,
          epoch_style: "kroniky",
          turn_from: turnNumber,
          turn_to: turnNumber,
          event_id: evt.id,
          source_type: "system",
        }));

        // Alliance boosts reputation
        reputationDeltas[evt.player] = (reputationDeltas[evt.player] || 0) + 10;
      }

      if (evt.event_type === "betrayal") {
        await safeInsert(supabase.from("world_memories").insert({
          session_id: sessionId,
          text: `V roce ${turnNumber} došlo ke zradě: ${evt.note || evt.player}.`,
          category: "historická jizva",
          approved: true,
        }));

        await safeInsert(supabase.from("chronicle_entries").insert({
          session_id: sessionId,
          text: `**Zrada (rok ${turnNumber}):** ${evt.note || `${evt.player} porušil důvěru.`} Svět nezapomíná.`,
          epoch_style: "kroniky",
          turn_from: turnNumber,
          turn_to: turnNumber,
          event_id: evt.id,
          source_type: "system",
        }));

        // Betrayal devastates reputation
        reputationDeltas[evt.player] = (reputationDeltas[evt.player] || 0) - 25;
      }

      if (evt.event_type === "treaty") {
        await safeInsert(supabase.from("world_memories").insert({
          session_id: sessionId,
          text: `V roce ${turnNumber} byla podepsána smlouva: ${evt.note || evt.player}.`,
          category: "tradice",
          approved: true,
        }));

        reputationDeltas[evt.player] = (reputationDeltas[evt.player] || 0) + 5;
      }
    }

    results.memory_events_processed = (recentKeyEvents || []).length;

    // ========== 5. TENSION CALCULATION (shared physics) ==========
    const tensionResults: any[] = [];

    for (let i = 0; i < allActorNames.length; i++) {
      for (let j = i + 1; j < allActorNames.length; j++) {
        const pA = allActorNames[i];
        const pB = allActorNames[j];

        const citiesA = (cities || []).filter((c: any) => c.owner_player === pA);
        const citiesB = (cities || []).filter((c: any) => c.owner_player === pB);
        const milA = influenceResults.find(r => r.player_name === pA)?.military_score || 0;
        const milB = influenceResults.find(r => r.player_name === pB)?.military_score || 0;

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

        const tensionRecord = { session_id: sessionId, turn_number: turnNumber, ...tension };
        await supabase.from("civ_tensions").upsert(tensionRecord, {
          onConflict: "session_id,player_a,player_b,turn_number",
        });
        tensionResults.push(tensionRecord);

        // ===== AUTO-GENERATE EVENTS + MEMORY LINKS =====
        if (tension.crisis_triggered) {
          const { data: crisisEvt } = await supabase.from("game_events").insert({
            session_id: sessionId, event_type: "crisis", player: "Systém",
            note: `Diplomatická krize mezi ${pA} a ${pB}! Tenze dosáhla ${Math.round(tension.total_tension)}.`,
            importance: "critical", confirmed: true, turn_number: turnNumber,
          }).select("id").single();
          await safeInsert(supabase.from("world_memories").insert({
            session_id: sessionId,
            text: `V roce ${turnNumber} vypukla diplomatická krize mezi ${pA} a ${pB} (tenze: ${Math.round(tension.total_tension)}).`,
            category: "historická jizva", approved: true,
          }));
          await safeInsert(supabase.from("chronicle_entries").insert({
            session_id: sessionId,
            text: `**Diplomatická krize (rok ${turnNumber}):** Napětí mezi říšemi ${pA} a ${pB} dosáhlo bodu zlomu. Tenze: ${Math.round(tension.total_tension)}. Vyslanci obou stran opustili jednací stoly.`,
            epoch_style: "kroniky", turn_from: turnNumber, turn_to: turnNumber,
            event_id: crisisEvt?.id || null,
            source_type: "system",
          }));
          reputationDeltas[pA] = (reputationDeltas[pA] || 0) + REPUTATION_DELTAS.crisis_participant;
          reputationDeltas[pB] = (reputationDeltas[pB] || 0) + REPUTATION_DELTAS.crisis_participant;
        }

        if (tension.war_roll_triggered && tension.war_roll_result !== null && tension.war_roll_result > 0.7) {
          const { data: warEvt } = await supabase.from("game_events").insert({
            session_id: sessionId, event_type: "war", player: "Systém",
            note: `Válka mezi ${pA} a ${pB} je nevyhnutelná! Tenze: ${Math.round(tension.total_tension)}, hod: ${Math.round(tension.war_roll_result * 100)}%.`,
            importance: "critical", confirmed: true, turn_number: turnNumber,
          }).select("id").single();
          await safeInsert(supabase.from("world_memories").insert({
            session_id: sessionId,
            text: `V roce ${turnNumber} vypukla válka mezi ${pA} a ${pB}. Svět se zachvěl.`,
            category: "historická jizva", approved: true,
          }));
          await safeInsert(supabase.from("chronicle_entries").insert({
            session_id: sessionId,
            text: `**Vyhlášení války (rok ${turnNumber}):** Po dlouhém napětí (tenze ${Math.round(tension.total_tension)}) vypukl otevřený konflikt mezi ${pA} a ${pB}. Vojska obou stran se dala do pohybu.`,
            epoch_style: "kroniky", turn_from: turnNumber, turn_to: turnNumber,
            event_id: warEvt?.id || null,
            source_type: "system",
          }));
          reputationDeltas[pA] = (reputationDeltas[pA] || 0) + REPUTATION_DELTAS.war_aggressor;
          reputationDeltas[pB] = (reputationDeltas[pB] || 0) + REPUTATION_DELTAS.war_defender;
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
        // Workforce modifiers (active_pop_modifier, max_mobilization_modifier)
        // These are read at process-turn time from active laws, no world-tick action needed.
        // Just log them for visibility.
        if (effect.type === "active_pop_modifier" || effect.type === "max_mobilization_modifier") {
          lawResults.push({ law: law.law_name, effect: effect.type, value: effect.value, applied: true, note: "Applied in process-turn" });
        }
      }
    }
    results.laws_applied = lawResults;

    // ========== 7. TREATY STABILITY EVALUATION ==========
    const treatyResults: any[] = [];
    // Check all active treaties - if tension between treaty parties is high, treaty may break
    const activeTreaties = (treaties || []).filter((e: any) => e.event_type === "treaty" || e.event_type === "alliance");
    for (const treaty of activeTreaties) {
      const partyA = treaty.player;
      // Try to extract party B from note
      const partyB = allActorNames.find(n => n !== partyA && treaty.note?.includes(n));
      if (!partyB) continue;

      const tensionBetween = tensionResults.find(t =>
        (t.player_a === partyA && t.player_b === partyB) ||
        (t.player_a === partyB && t.player_b === partyA)
      );
      const tensionLevel = tensionBetween ? tensionBetween.total_tension : 0;

      // Treaty breaks if tension > 50 (deterministic based on turn seed)
      if (tensionLevel > 50) {
        const breakSeed = turnNumber * 17 + partyA.length * 3 + partyB.length * 11;
        const breakRoll = (breakSeed % 100) / 100;
        const breakThreshold = tensionLevel > 70 ? 0.3 : 0.6; // Higher tension = easier to break

        if (breakRoll < breakThreshold) {
          // Treaty breaks!
          const { data: breakEvt } = await supabase.from("game_events").insert({
            session_id: sessionId,
            event_type: "betrayal",
            player: "Systém",
            note: `Smlouva mezi ${partyA} a ${partyB} se rozpadla pod tíhou napětí (tenze: ${Math.round(tensionLevel)}).`,
            importance: "critical",
            confirmed: true,
            turn_number: turnNumber,
          }).select("id").single();

          await safeInsert(supabase.from("world_memories").insert({
            session_id: sessionId,
            text: `V roce ${turnNumber} se rozpadla smlouva mezi ${partyA} a ${partyB}.`,
            category: "historická jizva",
            approved: true,
          }));

          await safeInsert(supabase.from("chronicle_entries").insert({
            session_id: sessionId,
            text: `**Rozpad smlouvy (rok ${turnNumber}):** Pod tíhou narůstajícího napětí (${Math.round(tensionLevel)}) se dohoda mezi ${partyA} a ${partyB} rozpadla. Důvěra byla pošlapána.`,
            epoch_style: "kroniky",
            turn_from: turnNumber,
            turn_to: turnNumber,
            event_id: breakEvt?.id || null,
            source_type: "system",
          }));

          reputationDeltas[partyA] = (reputationDeltas[partyA] || 0) - 10;
          reputationDeltas[partyB] = (reputationDeltas[partyB] || 0) - 10;

          treatyResults.push({ partyA, partyB, tension: tensionLevel, broken: true });
        } else {
          treatyResults.push({ partyA, partyB, tension: tensionLevel, broken: false, strained: true });
        }
      }
    }
    results.treaty_stability = treatyResults;

    // ========== 8. REBELLION EVALUATION ==========
    const rebellionResults: any[] = [];
    for (const city of (cities || [])) {
      if (city.status !== "ok") continue;
      const stability = city.city_stability || 70;

      // Rebellion chance increases as stability drops below 30
      if (stability < 30) {
        const rebelSeed = turnNumber * 23 + city.name.length * 7;
        const rebelRoll = (rebelSeed % 100) / 100;
        const rebelThreshold = stability < 15 ? 0.4 : 0.7; // Very low stability = high rebel chance

        if (rebelRoll < rebelThreshold) {
          // Rebellion!
          const popLoss = Math.round(city.population_total * 0.1);
          const newStability = Math.max(5, stability - 15);

          await supabase.from("cities").update({
            city_stability: newStability,
            population_total: Math.max(50, city.population_total - popLoss),
          }).eq("id", city.id);

          const { data: rebelEvt } = await supabase.from("game_events").insert({
            session_id: sessionId,
            event_type: "rebellion",
            player: "Systém",
            note: `Vzpoura v ${city.name}! Lid se bouří proti ${city.owner_player}. Ztráta ${popLoss} obyvatel.`,
            importance: "critical",
            confirmed: true,
            turn_number: turnNumber,
            location: city.name,
            city_id: city.id,
          }).select("id").single();

          await safeInsert(supabase.from("world_memories").insert({
            session_id: sessionId,
            text: `V roce ${turnNumber} vypukla vzpoura v ${city.name} (stabilita: ${stability}%).`,
            category: "historická jizva",
            city_id: city.id,
            approved: true,
          }));

          await safeInsert(supabase.from("chronicle_entries").insert({
            session_id: sessionId,
            text: `**Vzpoura (rok ${turnNumber}):** Lid města ${city.name} povstal proti vládě ${city.owner_player}. Stabilita klesla na ${newStability}%, ${popLoss} obyvatel uprchlo.`,
            epoch_style: "kroniky",
            turn_from: turnNumber,
            turn_to: turnNumber,
            event_id: rebelEvt?.id || null,
            source_type: "system",
          }));

          reputationDeltas[city.owner_player] = (reputationDeltas[city.owner_player] || 0) - 8;
          rebellionResults.push({ city: city.name, owner: city.owner_player, stability, popLoss, rebelled: true });
        } else {
          rebellionResults.push({ city: city.name, owner: city.owner_player, stability, rebelled: false, unrest: true });
        }
      }
    }
    results.rebellions = rebellionResults;

    // ========== 9. NPC / CITY-STATE AUTONOMOUS DIPLOMACY ==========
    const npcResults: any[] = [];
    for (const cs of (cityStates || [])) {
      // City-states shift influence toward the stronger neighbor
      const influenceDiff = (cs.influence_p1 || 0) - (cs.influence_p2 || 0);
      
      // Drift toward strongest nearby actor based on total influence
      const sortedInfluence = [...influenceResults].sort((a, b) => b.total_influence - a.total_influence);
      if (sortedInfluence.length >= 2) {
        const drift = Math.round(sortedInfluence[0].total_influence * 0.02);
        const updates: any = {};
        // Simple: strongest gets +drift on p1, weaker on p2
        if (sortedInfluence[0].player_name === playerNames[0]) {
          updates.influence_p1 = Math.min(100, (cs.influence_p1 || 0) + drift);
        } else {
          updates.influence_p2 = Math.min(100, (cs.influence_p2 || 0) + drift);
        }

        // Mood shifts based on world tension
        const avgTension = tensionResults.length > 0
          ? tensionResults.reduce((s, t) => s + t.total_tension, 0) / tensionResults.length
          : 0;
        if (avgTension > 60) updates.mood = "Nepokojný";
        else if (avgTension > 30) updates.mood = "Opatrný";
        else updates.mood = "Neutrální";

        await supabase.from("city_states").update(updates).eq("id", cs.id);
        npcResults.push({ cityState: cs.name, drift, mood: updates.mood || cs.mood });
      }
    }
    results.npc_diplomacy = npcResults;

    // ========== 10. APPLY FINAL REPUTATION DELTAS ==========
    // (Treaty breaks and rebellions may have added new deltas)
    for (const [playerName, delta] of Object.entries(reputationDeltas)) {
      if (delta === 0) continue;
      const existingRep = reputationResults.find(r => r.player === playerName);
      if (existingRep) continue; // Already applied in step 5a
      
      const inf = influenceResults.find(r => r.player_name === playerName);
      if (inf) {
        const newRep = Math.max(-100, Math.min(100, (inf.reputation_score || 0) + delta));
        await supabase.from("civ_influence").update({
          reputation_score: Math.round(newRep * 10) / 10,
        }).eq("session_id", sessionId).eq("player_name", playerName).eq("turn_number", turnNumber);
        reputationResults.push({ player: playerName, delta, newRep });
      }
    }
    results.reputation_changes = reputationResults;

    // (economy recompute runs next, then final tick update)

    // ========== 11. ECONOMY — handled by process-turn, NOT here ==========
    // economy-recompute removed; process-turn is the single economy engine.

    // ========== FINALIZE TICK ==========
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
