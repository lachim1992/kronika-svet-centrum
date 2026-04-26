import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  computeSettlementGrowth, distributePopLayers,
  computeInfluence, computeTension, evaluateRebellion,
  clampReputation, REPUTATION_DELTAS, REPUTATION_DECAY,
  CRISIS_THRESHOLD, WAR_THRESHOLD, SETTLEMENT_LEVEL_THRESHOLDS,
  computeProvinceControl, computeIsolationPenalty,
  computeNodeFlows, computeSupplyChain,
  URBANIZATION_THRESHOLDS,
  classifyNode, computeNodeScore, computeCollapseSeverity,
  computeLegitimacyDrift, computeMigrationPressure, resolveMigration,
  type NodeClass,
  type CityForGrowth, type InfluenceInput,
  type NodeControlEntry, type IsolationInput,
  type FlowNode, type FlowRoute, type FlowCity,
  type SupplyChainInput,
} from "../_shared/physics.ts";
import { computeSocialMobility, computeLaborModifiers } from "../_shared/demographics.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    // ========== 1b. FETCH CULTURAL DATA + PRESTIGE (Games & Academies) ==========
    const [
      { data: gamesResults },
      { data: academiesData },
      { data: hostCities },
      { data: concludedFestivals },
      { data: realmResources },
    ] = await Promise.all([
      supabase.from("games_results").select("participant_id, medal").eq("session_id", sessionId),
      supabase.from("academies").select("player_name, reputation, fan_base").eq("session_id", sessionId),
      supabase.from("cities").select("owner_player, hosting_count").eq("session_id", sessionId),
      supabase.from("games_festivals").select("host_player, best_athlete_id, concluded_turn, status")
        .eq("session_id", sessionId).eq("status", "concluded"),
      supabase.from("realm_resources").select("player_name, military_prestige, economic_prestige, cultural_prestige")
        .eq("session_id", sessionId),
    ]);

    const { data: allParticipants } = await supabase.from("games_participants")
      .select("id, player_name").eq("session_id", sessionId);
    const partPlayerMap = new Map((allParticipants || []).map((p: any) => [p.id, p.player_name]));

    const culturalDataMap: Record<string, { totalMedals: number; goldMedals: number; hostingCount: number; avgAcademyReputation: number }> = {};
    for (const pName of allActorNames) {
      const playerMedals = (gamesResults || []).filter((r: any) => r.medal && partPlayerMap.get(r.participant_id) === pName);
      const totalMedals = playerMedals.length;
      const goldMedals = playerMedals.filter((r: any) => r.medal === "gold").length;
      const playerHostCities = (hostCities || []).filter((c: any) => c.owner_player === pName);
      const hostingCount = playerHostCities.reduce((s: number, c: any) => s + (c.hosting_count || 0), 0);
      const playerAcademies = (academiesData || []).filter((a: any) => a.player_name === pName);
      const avgAcademyReputation = playerAcademies.length > 0
        ? playerAcademies.reduce((s: number, a: any) => s + (a.reputation || 0), 0) / playerAcademies.length
        : 0;
      culturalDataMap[pName] = { totalMedals, goldMedals, hostingCount, avgAcademyReputation };
    }

    // Build prestige data map
    const prestigeDataMap: Record<string, { military_prestige: number; economic_prestige: number; cultural_prestige: number }> = {};
    for (const r of (realmResources || [])) {
      prestigeDataMap[r.player_name] = {
        military_prestige: r.military_prestige || 0,
        economic_prestige: r.economic_prestige || 0,
        cultural_prestige: r.cultural_prestige || 0,
      };
    }

    // ========== 1c. GAMES REPUTATION DELTAS ==========
    const gamesRepDeltas: Record<string, number> = {};
    for (const fest of (concludedFestivals || [])) {
      if (fest.concluded_turn === turnNumber || fest.concluded_turn === turnNumber - 1) {
        if (fest.host_player) {
          gamesRepDeltas[fest.host_player] = (gamesRepDeltas[fest.host_player] || 0) + 8;
        }
        if (fest.best_athlete_id) {
          const champPart = (allParticipants || []).find((p: any) => p.id === fest.best_athlete_id);
          if (champPart) {
            gamesRepDeltas[champPart.player_name] = (gamesRepDeltas[champPart.player_name] || 0) + 5;
          }
        }
      }
    }

    // ========== 2. SETTLEMENT GROWTH (shared physics) ==========
    const growthResults: any[] = [];
    const settlementUpgrades: any[] = [];
    for (const city of (cities || [])) {
      const result = computeSettlementGrowth(city as CityForGrowth);
      if (result.delta !== 0 || result.settlementUpgrade) {
        const layers = distributePopLayers(
          result.newPop, city.population_total,
          city.population_peasants, city.population_burghers, city.population_clerics,
          city.population_warriors
        );
        const updatePayload: any = {
          population_total: result.newPop,
          population_peasants: layers.peasants,
          population_burghers: layers.burghers,
          population_clerics: layers.clerics,
          population_warriors: layers.warriors,
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
        culturalData: culturalDataMap[pName] || { totalMedals: 0, goldMedals: 0, hostingCount: 0, avgAcademyReputation: 0 },
        prestigeData: prestigeDataMap[pName] || { military_prestige: 0, economic_prestige: 0, cultural_prestige: 0 },
      });
      const record = { session_id: sessionId, turn_number: turnNumber, ...result };
      await supabase.from("civ_influence").upsert(record, {
        onConflict: "session_id,player_name,turn_number",
      });
      influenceResults.push(record);
    }
    results.influence = influenceResults;

    // ========== 3b. FAN_BASE → GARRISON MORALE BOOST ==========
    // Academies with high fan_base boost morale of military garrisons in their cities
    const garrisonBoosts: any[] = [];
    for (const acad of (academiesData || [])) {
      if (!acad.fan_base || acad.fan_base < 10) continue;
      // Find cities owned by this player
      const playerCities = (cities || []).filter((c: any) => c.owner_player === acad.player_name);
      const moraleBoost = Math.min(5, Math.round(acad.fan_base / 20)); // fan_base 20→+1, 100→+5
      if (moraleBoost <= 0) continue;
      for (const city of playerCities) {
        // Boost garrison stacks in this city's province
        const cityStacks = (militaryStacks || []).filter((s: any) =>
          s.player_name === acad.player_name && s.current_hex_q === city.province_q && s.current_hex_r === city.province_r
        );
        for (const stack of cityStacks) {
          await supabase.from("military_stacks").update({
            morale: Math.min(100, (stack.morale || 70) + moraleBoost),
          }).eq("id", stack.id);
        }
        if (cityStacks.length > 0) {
          garrisonBoosts.push({ city: city.name, player: acad.player_name, boost: moraleBoost, stacks: cityStacks.length });
        }
      }
    }
    results.garrison_morale_boosts = garrisonBoosts;

    // ========== 4. SCAN RECENT KEY EVENTS FOR MEMORY LINKS ==========
    const { data: recentKeyEvents } = await supabase.from("game_events")
      .select("*")
      .eq("session_id", sessionId)
      .eq("turn_number", turnNumber)
      .eq("confirmed", true)
      .in("event_type", ["alliance", "betrayal", "treaty"]);

    const reputationDeltas: Record<string, number> = { ...gamesRepDeltas };

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

        const prestigeA = prestigeDataMap[pA] || { military_prestige: 0, economic_prestige: 0, cultural_prestige: 0 };
        const prestigeB = prestigeDataMap[pB] || { military_prestige: 0, economic_prestige: 0, cultural_prestige: 0 };
        const totalPrestigeA = prestigeA.military_prestige + prestigeA.economic_prestige + prestigeA.cultural_prestige;
        const totalPrestigeB = prestigeB.military_prestige + prestigeB.economic_prestige + prestigeB.cultural_prestige;

        const tension = computeTension({
          sessionId, turnNumber, playerA: pA, playerB: pB,
          citiesA, citiesB, militaryScoreA: milA, militaryScoreB: milB,
          brokenTreatyCount, embargoCount, totalPrestigeA, totalPrestigeB,
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

    // ========== 8. REBELLION EVALUATION (with Faith suppression) ==========
    // Fetch realm faith data for rebellion suppression
    const { data: allRealmRes } = await supabase.from("realm_resources")
      .select("player_name, faith, warrior_ratio")
      .eq("session_id", sessionId);
    const realmFaithMap: Record<string, { faith: number; warriorRatio: number }> = {};
    for (const r of (allRealmRes || [])) {
      realmFaithMap[r.player_name] = { faith: r.faith || 0, warriorRatio: r.warrior_ratio || 0 };
    }

    const rebellionResults: any[] = [];
    for (const city of (cities || [])) {
      if (city.status !== "ok") continue;
      const stability = city.city_stability || 70;

      // Rebellion chance increases as stability drops below 30
      if (stability < 30) {
        const rebelSeed = turnNumber * 23 + city.name.length * 7;
        const rebelRoll = (rebelSeed % 100) / 100;
        let rebelThreshold = stability < 15 ? 0.4 : 0.7;

        // Faith suppresses rebellion: high faith = higher threshold (harder to rebel)
        const ownerFaith = realmFaithMap[city.owner_player]?.faith || 0;
        const ownerWarriors = realmFaithMap[city.owner_player]?.warriorRatio || 0;
        rebelThreshold += ownerFaith * 0.003; // Faith 100 → +0.3 (strong suppression)
        rebelThreshold += ownerWarriors * 0.5; // Warriors 10% → +0.05 (military presence)
        // Temple level in city also helps
        rebelThreshold += (city.temple_level || 0) * 0.03;

        if (rebelRoll < rebelThreshold) {
          // Rebellion!
          const popLoss = Math.round(city.population_total * 0.1);
          const newStability = Math.max(5, stability - 15);

          await supabase.from("cities").update({
            city_stability: newStability,
            population_total: Math.max(50, city.population_total - popLoss),
          }).eq("id", city.id);

          const faithNote = ownerFaith > 50 ? " Víra lidu pomáhá tlumit nepokoje." : ownerFaith < 20 ? " Slabá víra přiživuje vzpouru." : "";
          const { data: rebelEvt } = await supabase.from("game_events").insert({
            session_id: sessionId,
            event_type: "rebellion",
            player: "Systém",
            note: `Vzpoura v ${city.name}! Lid se bouří proti ${city.owner_player}. Ztráta ${popLoss} obyvatel.${faithNote}`,
            importance: "critical",
            confirmed: true,
            turn_number: turnNumber,
            location: city.name,
            city_id: city.id,
          }).select("id").single();

          await safeInsert(supabase.from("world_memories").insert({
            session_id: sessionId,
            text: `V roce ${turnNumber} vypukla vzpoura v ${city.name} (stabilita: ${stability}%, víra: ${ownerFaith.toFixed(0)}).`,
            category: "historická jizva",
            city_id: city.id,
            approved: true,
          }));

          await safeInsert(supabase.from("chronicle_entries").insert({
            session_id: sessionId,
            text: `**Vzpoura (rok ${turnNumber}):** Lid města ${city.name} povstal proti vládě ${city.owner_player}. Stabilita klesla na ${newStability}%, ${popLoss} obyvatel uprchlo.${faithNote}`,
            epoch_style: "kroniky",
            turn_from: turnNumber,
            turn_to: turnNumber,
            event_id: rebelEvt?.id || null,
            source_type: "system",
          }));

          reputationDeltas[city.owner_player] = (reputationDeltas[city.owner_player] || 0) - 8;
          rebellionResults.push({ city: city.name, owner: city.owner_player, stability, popLoss, rebelled: true, faith: ownerFaith });
        } else {
          rebellionResults.push({ city: city.name, owner: city.owner_player, stability, rebelled: false, unrest: true, faith: ownerFaith });
        }
      }
    }
    results.rebellions = rebellionResults;

    // ========== 8b. LEGITIMACY DRIFT (Phase 4 dead metric) ==========
    const legitimacyResults: any[] = [];
    // Fetch active policies for legitimacy_effect
    const { data: allPolicies } = await supabase.from("city_policies")
      .select("city_id, legitimacy_effect")
      .eq("session_id", sessionId).eq("is_active", true);

    // Fetch demand satisfaction from city_market_summary (latest turn)
    const { data: marketSummaries } = await supabase.from("city_market_summary")
      .select("city_node_id, supply_volume, demand_volume")
      .eq("session_id", sessionId).eq("turn_number", turnNumber);

    // Map city_id → demand_satisfaction via province_nodes
    const { data: cityNodes } = await supabase.from("province_nodes")
      .select("id, city_id").eq("session_id", sessionId).not("city_id", "is", null);
    const nodeToCity = new Map((cityNodes || []).map((n: any) => [n.id, n.city_id]));
    const citySatisfaction: Record<string, number> = {};
    for (const ms of (marketSummaries || [])) {
      const cityId = nodeToCity.get(ms.city_node_id);
      if (!cityId) continue;
      const sat = ms.demand_volume > 0 ? Math.min(1, ms.supply_volume / ms.demand_volume) : 0.5;
      citySatisfaction[cityId] = (citySatisfaction[cityId] || 0) + sat;
    }
    // Average per city (multiple goods)
    const cityGoodsCounts: Record<string, number> = {};
    for (const ms of (marketSummaries || [])) {
      const cityId = nodeToCity.get(ms.city_node_id);
      if (cityId) cityGoodsCounts[cityId] = (cityGoodsCounts[cityId] || 0) + 1;
    }
    for (const cid of Object.keys(citySatisfaction)) {
      citySatisfaction[cid] /= (cityGoodsCounts[cid] || 1);
    }

    for (const city of (cities || [])) {
      if (city.status !== "ok") continue;

      const policyLegSum = (allPolicies || [])
        .filter((p: any) => p.city_id === city.id)
        .reduce((s: number, p: any) => s + (p.legitimacy_effect || 0), 0);

      const wasConqueredRecently = city.devastated_round != null && (turnNumber - city.devastated_round) <= 5;

      const legResult = computeLegitimacyDrift({
        currentLegitimacy: city.legitimacy || 50,
        famine_consecutive_turns: city.famine_consecutive_turns || 0,
        temple_level: city.temple_level || 0,
        demand_satisfaction: citySatisfaction[city.id] ?? 0.5,
        was_conquered_recently: wasConqueredRecently,
        policy_legitimacy_sum: policyLegSum,
      });

      // Apply legitimacy + downstream stability effect
      const newStability = Math.max(0, Math.min(100, (city.city_stability || 70) + legResult.stabilityEffect));

      await supabase.from("cities").update({
        legitimacy: legResult.newLegitimacy,
        city_stability: newStability,
      }).eq("id", city.id);

      legitimacyResults.push({
        city: city.name, drift: legResult.drift,
        newLegitimacy: legResult.newLegitimacy,
        stabilityEffect: legResult.stabilityEffect,
      });
    }
    results.legitimacy = legitimacyResults;

    // ========== 8c. MIGRATION PRESSURE + RESOLUTION (Phase 4 dead metric) ==========
    const migrationPressureResults: any[] = [];
    const migrationCitiesData: Array<{
      id: string; name: string; owner_player: string;
      population_total: number; population_peasants: number;
      migration_pressure: number; housing_capacity: number;
    }> = [];

    for (const city of (cities || [])) {
      if (city.status !== "ok") continue;

      const mp = computeMigrationPressure({
        famine_severity: city.famine_severity || 0,
        overcrowding_ratio: city.overcrowding_ratio || 0,
        city_stability: city.city_stability || 70,
        epidemic_active: city.epidemic_active || false,
        market_level: city.market_level || 0,
        housing_capacity: city.housing_capacity || 500,
        population_total: city.population_total || 0,
      });

      await supabase.from("cities").update({
        migration_pressure: mp.pressure,
      }).eq("id", city.id);

      migrationPressureResults.push({ city: city.name, ...mp });
      migrationCitiesData.push({
        id: city.id, name: city.name, owner_player: city.owner_player,
        population_total: city.population_total, population_peasants: city.population_peasants,
        migration_pressure: mp.pressure, housing_capacity: city.housing_capacity || 500,
      });
    }

    // Resolve actual migration flows
    const migrationFlows = resolveMigration(migrationCitiesData);
    for (const flow of migrationFlows) {
      // Deduct from source
      await supabase.from("cities").update({
        population_total: Math.max(50, (migrationCitiesData.find(c => c.id === flow.from_city_id)?.population_total || 0) - flow.migrants),
        population_peasants: Math.max(0, (migrationCitiesData.find(c => c.id === flow.from_city_id)?.population_peasants || 0) - flow.migrants),
        last_migration_out: flow.migrants,
      }).eq("id", flow.from_city_id);

      // Add to destination
      await supabase.from("cities").update({
        population_total: (migrationCitiesData.find(c => c.id === flow.to_city_id)?.population_total || 0) + flow.migrants,
        population_peasants: (migrationCitiesData.find(c => c.id === flow.to_city_id)?.population_peasants || 0) + flow.migrants,
        last_migration_in: flow.migrants,
      }).eq("id", flow.to_city_id);

      // Generate event for significant migration
      if (flow.migrants > 50) {
        await safeInsert(supabase.from("world_events").insert({
          session_id: sessionId, turn_number: turnNumber,
          event_type: "migration",
          title: `Migrace z ${flow.from_city_name} do ${flow.to_city_name}`,
          description: `${flow.migrants} obyvatel se přesunulo z ${flow.from_city_name} do ${flow.to_city_name}.`,
          severity: "minor", status: "active",
        }));
      }
    }
    results.migration_pressure = migrationPressureResults;
    results.migration_flows = migrationFlows;

    // ========== 8d. LABOR ALLOCATION → SOCIAL MOBILITY + MODIFIERS (Phase 4 dead metric) ==========
    const laborResults: any[] = [];
    for (const city of (cities || [])) {
      if (city.status !== "ok") continue;

      const labor = (city.labor_allocation as any) || {};
      const laborMods = computeLaborModifiers(labor);

      // Apply social mobility
      const mobilityResult = computeSocialMobility({
        population_peasants: city.population_peasants || 0,
        population_burghers: city.population_burghers || 0,
        population_clerics: city.population_clerics || 0,
        population_total: city.population_total || 0,
        market_level: city.market_level || 0,
        temple_level: city.temple_level || 0,
        labor_allocation: labor,
        city_stability: city.city_stability || 70,
      });

      // Apply irrigation from canal allocation
      const newIrrigation = Math.min(10, (city.irrigation_level || 0) + laborMods.canal_mod);

      await supabase.from("cities").update({
        population_peasants: mobilityResult.new_peasants,
        population_burghers: mobilityResult.new_burghers,
        population_clerics: mobilityResult.new_clerics,
        mobility_rate: mobilityResult.mobility_rate,
        irrigation_level: newIrrigation,
      }).eq("id", city.id);

      laborResults.push({
        city: city.name,
        mobility: mobilityResult.mobility_rate,
        farming_mod: laborMods.farming_mod,
        crafting_mod: laborMods.crafting_mod,
        canal_mod: laborMods.canal_mod,
        peasants_to_burghers: mobilityResult.peasants_to_burghers,
        burghers_to_clerics: mobilityResult.burghers_to_clerics,
      });
    }
    results.labor_allocation = laborResults;

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

    // ========== 12. PROVINCE CONTROL (strategic graph) ==========
    const provinceControlResults: any[] = [];
    try {
      const [
        graphNodesResp,
        graphRoutesResp,
      ] = await Promise.all([
        supabase.from("province_nodes").select("id, province_id, node_type, controlled_by, strategic_value, economic_value, defense_value, is_major, population, city_id, throughput_military, toll_rate, cumulative_trade_flow, urbanization_score, hinterland_level, resource_output, flow_role, parent_node_id, infrastructure_level, name, hex_q, hex_r, strategic_resource_type, fortification_level, wealth_output, production_output, sacred_influence, connectivity_score").eq("session_id", sessionId),
        supabase.from("province_routes").select("node_a, node_b, control_state, capacity_value, damage_level, safety_value, speed_value").eq("session_id", sessionId),
      ]);
      const graphNodes: any[] = (graphNodesResp.data as any[]) || [];
      const graphRoutes: any[] = (graphRoutesResp.data as any[]) || [];

      if (graphNodes && graphNodes.length > 0) {
        // 12a. Recalculate province control from node ownership
        const uniqueProvinceIds = [...new Set(graphNodes.map((n: any) => n.province_id).filter(Boolean))];
        for (const provId of uniqueProvinceIds) {
          const controlResult = computeProvinceControl(
            provId,
            graphNodes.map((n: any) => ({
              id: n.id,
              province_id: n.province_id,
              node_type: n.node_type,
              controlled_by: n.controlled_by,
              strategic_value: n.strategic_value || 1,
              economic_value: n.economic_value || 0,
              defense_value: n.defense_value || 0,
            })),
          );

          await supabase.from("provinces").update({
            control_player: controlResult.control_player,
            control_scores: controlResult.control_scores,
          }).eq("id", provId);

          provinceControlResults.push({
            province: provId,
            control_player: controlResult.control_player,
            dominance: controlResult.dominance,
          });

          // Persist control snapshot
          const provNodes = graphNodes.filter((n: any) => n.province_id === provId);
          const controlledNodes = provNodes.filter((n: any) => n.controlled_by === controlResult.control_player);
          const totalSV = provNodes.reduce((s: number, n: any) => s + (n.strategic_value || 0), 0);
          const contested = Object.keys(controlResult.control_scores).length > 1 && controlResult.dominance < 0.75;

          await supabase.from("province_control_snapshots").upsert({
            session_id: sessionId,
            province_id: provId,
            turn_number: turnNumber,
            control_player: controlResult.control_player,
            dominance: controlResult.dominance,
            control_scores: controlResult.control_scores,
            total_strategic_value: totalSV,
            node_count: provNodes.length,
            controlled_node_count: controlledNodes.length,
            contested,
          }, { onConflict: "session_id,province_id,turn_number" });
        }

        // 12b. Compute isolation penalty per player
        const isolationResults: any[] = [];
        const routesForIsolation = (graphRoutes || []).map((r: any) => ({
          node_a: r.node_a,
          node_b: r.node_b,
          control_state: r.control_state || "open",
        }));
        const nodesForIsolation = graphNodes.map((n: any) => ({
          id: n.id,
          province_id: n.province_id,
          controlled_by: n.controlled_by,
          node_type: n.node_type,
        }));

        for (const actorName of allActorNames) {
          const isolation = computeIsolationPenalty({
            playerName: actorName,
            nodes: nodesForIsolation,
            routes: routesForIsolation,
          });

          if (isolation.penalty > 0) {
            await supabase.from("realm_resources").update({
              isolation_penalty: isolation.penalty,
            }).eq("session_id", sessionId).eq("player_name", actorName);
          }

          isolationResults.push({
            player: actorName,
            penalty: isolation.penalty,
            connected: isolation.connectedNodes,
            total: isolation.totalNodes,
          });
        }

        results.province_control = provinceControlResults;
        results.isolation = isolationResults;

        // 12c. Compute node flow state (network economy) with regulation & urbanization
        try {
          const flowNodes: FlowNode[] = graphNodes.map((n: any) => ({
            id: n.id,
            node_type: n.node_type,
            controlled_by: n.controlled_by,
            population: n.population || 0,
            economic_value: n.economic_value || 0,
            infrastructure_level: n.infrastructure_level || 0,
            is_major: n.is_major ?? false,
            parent_node_id: n.parent_node_id,
            city_id: n.city_id,
            throughput_military: n.throughput_military ?? 1.0,
            toll_rate: n.toll_rate ?? 0.0,
            cumulative_trade_flow: n.cumulative_trade_flow ?? 0,
            urbanization_score: n.urbanization_score ?? 0,
            hinterland_level: n.hinterland_level ?? 0,
            resource_output: (n.resource_output as Record<string, number>) || {},
            flow_role: n.flow_role || "neutral",
          }));

          const flowRoutes: FlowRoute[] = (graphRoutes || []).map((r: any) => ({
            node_a: r.node_a,
            node_b: r.node_b,
            capacity_value: r.capacity_value || 5,
            control_state: r.control_state || "open",
            damage_level: r.damage_level || 0,
            speed_value: r.speed_value || 5,
            safety_value: r.safety_value || 5,
          }));

          // Fetch cities linked to nodes
          const cityNodeIds = graphNodes.filter((n: any) => n.city_id).map((n: any) => n.city_id);
          let flowCities: FlowCity[] = [];
          if (cityNodeIds.length > 0) {
            const { data: citiesData } = await supabase.from("cities")
              .select("id, last_turn_grain_prod, last_turn_wood_prod, last_turn_stone_prod, last_turn_iron_prod, development_level, market_level")
              .in("id", cityNodeIds);
            flowCities = (citiesData || []).map((c: any) => ({
              id: c.id,
              last_turn_grain_prod: c.last_turn_grain_prod || 0,
              last_turn_wood_prod: c.last_turn_wood_prod || 0,
              last_turn_stone_prod: c.last_turn_stone_prod || 0,
              last_turn_iron_prod: c.last_turn_iron_prod || 0,
              development_level: c.development_level || 0,
              market_level: c.market_level || 0,
            }));
          }

          const flowResults = computeNodeFlows(flowNodes, flowRoutes, flowCities);

          // Batch upsert flow state
          if (flowResults.length > 0) {
            const rows = flowResults.map(f => ({
              session_id: sessionId,
              node_id: f.node_id,
              turn_number: turnNumber,
              grain_production: f.grain_production,
              wood_production: f.wood_production,
              stone_production: f.stone_production,
              iron_production: f.iron_production,
              wealth_production: f.wealth_production,
              incoming_trade: f.incoming_trade,
              outgoing_trade: f.outgoing_trade,
              incoming_supply: f.incoming_supply,
              outgoing_supply: f.outgoing_supply,
              prosperity_score: f.prosperity_score,
              congestion_score: f.congestion_score,
              throughput_score: f.throughput_score,
              isolation_penalty: f.isolation_penalty,
            }));

            const BATCH = 50;
            for (let i = 0; i < rows.length; i += BATCH) {
              await supabase.from("node_flow_state").upsert(
                rows.slice(i, i + BATCH),
                { onConflict: "session_id,node_id,turn_number" },
              );
            }
          }

          // 12c-ii. Apply urbanization: accumulate trade flow + grow hinterland
          const { URBANIZATION_THRESHOLDS } = await import("../_shared/physics.ts");
          const urbanUpdates: any[] = [];
          const spawnNodes: any[] = [];

          for (const f of flowResults) {
            if (f.urbanization_delta <= 0) continue;
            const gn = graphNodes.find((n: any) => n.id === f.node_id);
            if (!gn) continue;

            const newCumFlow = (gn.cumulative_trade_flow || 0) + f.trade_flow_delta;
            const newUrbanScore = (gn.urbanization_score || 0) + f.urbanization_delta;
            const currentHL = gn.hinterland_level || 0;

            // Check if urbanization crossed a threshold → spawn new minor node
            const nextThreshold = URBANIZATION_THRESHOLDS.find((t: any) => t.level === currentHL + 1);
            let newHL = currentHL;
            if (nextThreshold && newUrbanScore >= nextThreshold.threshold) {
              newHL = nextThreshold.level;
              // Prepare spawn of new minor node
              spawnNodes.push({
                session_id: sessionId,
                province_id: gn.province_id,
                parent_node_id: gn.id,
                node_type: nextThreshold.spawns,
                name: `${nextThreshold.label} u ${gn.name || "uzlu"}`,
                hex_q: (gn.hex_q || 0) + (newHL % 2 === 0 ? 1 : -1),
                hex_r: (gn.hex_r || 0) + (newHL % 2 === 0 ? 0 : 1),
                controlled_by: gn.controlled_by,
                is_major: false,
                is_active: true,
                strategic_value: 1,
                economic_value: newHL * 2,
                population: newHL * 50,
                flow_role: "producer",
                resource_output: nextThreshold.spawns === "village_cluster"
                  ? { grain: 3, wood: 1 }
                  : nextThreshold.spawns === "resource_node"
                    ? { wood: 2, stone: 2, iron: 1 }
                    : { wealth: 3 },
              });
            }

            // Also update resource_output for toll-earning regulators
            const tollBonus = f.toll_income > 0 ? { wealth: Math.min(5, Math.floor(f.toll_income * 0.3)) } : {};

            urbanUpdates.push({
              id: gn.id,
              cumulative_trade_flow: newCumFlow,
              urbanization_score: newUrbanScore,
              hinterland_level: newHL,
              ...(Object.keys(tollBonus).length > 0 ? {
                resource_output: { ...(gn.resource_output || {}), ...tollBonus },
              } : {}),
            });
          }

          // Batch apply urbanization updates
          for (const upd of urbanUpdates) {
            const { id, ...fields } = upd;
            await supabase.from("province_nodes").update(fields).eq("id", id);
          }

          // Spawn new minor nodes from urbanization
          if (spawnNodes.length > 0) {
            await supabase.from("province_nodes").insert(spawnNodes);
          }

          results.node_flows = {
            computed: flowResults.length,
            urbanization_updates: urbanUpdates.length,
            spawned_nodes: spawnNodes.length,
          };

          // 12c-iii. Node classification + scoring
          try {
            // Build adjacency for choke detection
            const adjCount: Record<string, number> = {};
            for (const r of graphRoutes) {
              adjCount[r.node_a] = (adjCount[r.node_a] || 0) + 1;
              adjCount[r.node_b] = (adjCount[r.node_b] || 0) + 1;
            }
            // Detect chokes: nodes where removal would disconnect parts of graph
            const chokeIds = new Set<string>();
            for (const n of graphNodes) {
              if ((n as any).is_major && (adjCount[n.id] || 0) <= 2 && (adjCount[n.id] || 0) >= 1) {
                chokeIds.add(n.id);
              }
            }

            const classUpdates: Array<{ id: string; node_class: string; node_score: number; collapse_severity: number; food_value: number; faith_output: number; sacred_influence: number }> = [];

            for (const gn of graphNodes) {
              const fr = flowResults.find(f => f.node_id === gn.id);
              const grainProd = fr?.grain_production || 0;

              // Classify
              const nodeClass = classifyNode({
                id: gn.id,
                node_type: gn.node_type || "settlement",
                flow_role: gn.flow_role || "producer",
                is_major: gn.is_major,
                strategic_resource_type: gn.strategic_resource_type,
                fortification_level: gn.fortification_level || 0,
                defense_value: gn.defense_value || 0,
                wealth_output: gn.wealth_output || 0,
                production_output: gn.production_output || 0,
                cumulative_trade_flow: gn.cumulative_trade_flow || 0,
                food_value: grainProd,
                sacred_influence: gn.sacred_influence || 0,
                connectivity_score: gn.connectivity_score || 0,
                hex_q: gn.hex_q || 0,
                hex_r: gn.hex_r || 0,
                routeCount: adjCount[gn.id] || 0,
                isChoke: chokeIds.has(gn.id),
              });

              // Score
              const score = computeNodeScore({
                cumulative_trade_flow: gn.cumulative_trade_flow || 0,
                wealth_output: gn.wealth_output || 0,
                connectivity_score: gn.connectivity_score || 0,
                routeCount: adjCount[gn.id] || 0,
                food_value: grainProd,
                isChoke: chokeIds.has(gn.id),
                fortification_level: gn.fortification_level || 0,
                defense_value: gn.defense_value || 0,
                throughput_military: gn.throughput_military || 0,
                strategic_resource_type: gn.strategic_resource_type,
                strategic_resource_tier: gn.strategic_resource_tier || 0,
                sacred_influence: gn.sacred_influence || 0,
                faith_output: gn.faith_output || 0,
                hex_terrain_defense: (gn.defense_value || 0) * 0.5,
              });

              const severity = computeCollapseSeverity(nodeClass, gn.importance_score || 0);

              classUpdates.push({
                id: gn.id,
                node_class: nodeClass,
                node_score: score,
                collapse_severity: severity,
                food_value: grainProd,
                faith_output: gn.faith_output || 0,
                sacred_influence: gn.sacred_influence || 0,
              });
            }

            // Batch update
            const CLASS_BATCH = 50;
            for (let i = 0; i < classUpdates.length; i += CLASS_BATCH) {
              for (const upd of classUpdates.slice(i, i + CLASS_BATCH)) {
                const { id, ...fields } = upd;
                await supabase.from("province_nodes").update(fields).eq("id", id);
              }
            }

            results.node_classification = { classified: classUpdates.length };
          } catch (classErr) {
            console.warn("Node classification non-fatal:", classErr);
          }
        } catch (flowErr) {
          console.warn("Node flow computation non-fatal:", flowErr);
          results.node_flow_error = (flowErr as Error).message;
        }

        // 12d. Compute per-node supply chain
        try {
          const supplyRoutes = (graphRoutes || []).map((r: any) => ({
            node_a: r.node_a,
            node_b: r.node_b,
            control_state: r.control_state || "open",
            capacity_value: r.capacity_value || 5,
            damage_level: r.damage_level || 0,
            safety_value: r.safety_value || 5,
          }));
          const supplyNodes = graphNodes.map((n: any) => ({
            id: n.id,
            node_type: n.node_type,
            controlled_by: n.controlled_by,
            economic_value: n.economic_value || 0,
            population: n.population || 0,
          }));

          const supplyResults: any[] = [];
          for (const actorName of allActorNames) {
            // Fetch previous turn's isolation state
            const { data: prevState } = await supabase
              .from("supply_chain_state")
              .select("node_id, isolation_turns")
              .eq("session_id", sessionId)
              .eq("turn_number", turnNumber - 1);

            const chainResults = computeSupplyChain({
              playerName: actorName,
              nodes: supplyNodes,
              routes: supplyRoutes,
              previousState: (prevState || []).map((p: any) => ({
                node_id: p.node_id,
                isolation_turns: p.isolation_turns || 0,
              })),
            });

            if (chainResults.length > 0) {
              const rows = chainResults.map(r => ({
                session_id: sessionId,
                node_id: r.node_id,
                turn_number: turnNumber,
                connected_to_capital: r.connected_to_capital,
                isolation_turns: r.isolation_turns,
                supply_level: r.supply_level,
                route_quality: r.route_quality,
                production_modifier: r.production_modifier,
                stability_modifier: r.stability_modifier,
                morale_modifier: r.morale_modifier,
                supply_source_node_id: r.supply_source_node_id,
                hop_distance: r.hop_distance,
              }));

              const BATCH = 50;
              for (let i = 0; i < rows.length; i += BATCH) {
                await supabase.from("supply_chain_state").upsert(
                  rows.slice(i, i + BATCH),
                  { onConflict: "session_id,node_id,turn_number" },
                );
              }

              // Apply stability/morale penalties to cities linked to isolated nodes
              const isolatedNodes = chainResults.filter(r => !r.connected_to_capital);
              for (const isoNode of isolatedNodes) {
                const linkedNode = graphNodes.find((n: any) => n.id === isoNode.node_id && n.city_id);
                if (linkedNode?.city_id) {
                  const { data: cityData } = await supabase.from("cities").select("city_stability").eq("id", linkedNode.city_id).single();
                  if (cityData) {
                    await supabase.from("cities").update({
                      city_stability: Math.max(0, cityData.city_stability + isoNode.stability_modifier),
                    }).eq("id", linkedNode.city_id);
                  }
                }
              }

              supplyResults.push({ player: actorName, nodes: chainResults.length, isolated: isolatedNodes.length });
            }
          }
          results.supply_chain = supplyResults;

          // 12e. Enrich province control snapshots with supply health & route access
          try {
            const uniqueProvIds = [...new Set(graphNodes.map((n: any) => n.province_id).filter(Boolean))];
            for (const provId of uniqueProvIds) {
              const provNodeIds = graphNodes.filter((n: any) => n.province_id === provId).map((n: any) => n.id);
              // Collect all supply results for this province's nodes
              const allChainResults = supplyResults.flatMap((sr: any) => sr.chainResults || []);
              // Fallback: compute from persisted data
              const { data: snapSupply } = await supabase.from("supply_chain_state")
                .select("supply_level, connected_to_capital")
                .eq("session_id", sessionId).eq("turn_number", turnNumber)
                .in("node_id", provNodeIds);
              if (snapSupply && snapSupply.length > 0) {
                const avgSupply = snapSupply.reduce((s: number, r: any) => s + (r.supply_level || 0), 0) / snapSupply.length;
                const connectedRatio = snapSupply.filter((r: any) => r.connected_to_capital).length / snapSupply.length;
                // Route access: ratio of open routes touching this province
                const provRoutes = (graphRoutes || []).filter((r: any) =>
                  provNodeIds.includes(r.node_a) || provNodeIds.includes(r.node_b)
                );
                const openRoutes = provRoutes.filter((r: any) => r.control_state === "open" || !r.control_state);
                const routeAccess = provRoutes.length > 0 ? openRoutes.length / provRoutes.length : 1.0;

                await supabase.from("province_control_snapshots").update({
                  supply_health: Math.round(avgSupply / 10 * 100) / 100,
                  route_access_score: Math.round(routeAccess * 100) / 100,
                }).eq("session_id", sessionId).eq("province_id", provId).eq("turn_number", turnNumber);
              }
            }
          } catch (enrichErr) {
            console.warn("Snapshot enrichment non-fatal:", enrichErr);
          }
        } catch (scErr) {
          console.warn("Supply chain computation non-fatal:", scErr);
          results.supply_chain_error = (scErr as Error).message;
        }

        // 12e½. Compute hex-based flow paths (dirty flag + every 5 turns)
        try {
          const forceAll = turnNumber % 5 === 0;
          const { data: hexFlowData, error: hexFlowErr } = await supabase.functions.invoke("compute-hex-flows", {
            body: { session_id: sessionId, force_all: forceAll },
          });
          if (hexFlowErr) {
            console.warn("compute-hex-flows error:", hexFlowErr);
            results.hex_flows = { error: hexFlowErr.message };
          } else {
            results.hex_flows = {
              paths_computed: hexFlowData?.paths_computed || 0,
              failed_paths: hexFlowData?.failed_paths || 0,
            };
          }
        } catch (hfErr) {
          console.warn("Hex flow computation non-fatal:", hfErr);
          results.hex_flows_error = (hfErr as Error).message;
        }

        // 12f. Compute macro economy flow (Production / Wealth / Capacity)
        try {
          const { data: econFlowData, error: econFlowErr } = await supabase.functions.invoke("compute-economy-flow", {
            body: { session_id: sessionId, turn_number: turnNumber, save_history: true },
          });
          if (econFlowErr) {
            console.warn("compute-economy-flow error:", econFlowErr);
            results.economy_flow = { error: econFlowErr.message };
          } else {
            results.economy_flow = {
              nodes_computed: econFlowData?.nodes_computed || 0,
              realm_updates: econFlowData?.realm_updates || 0,
              totals: econFlowData?.totals_by_player || {},
            };
          }
        } catch (efErr) {
          console.warn("Economy flow computation non-fatal:", efErr);
          results.economy_flow_error = (efErr as Error).message;
        }
      }
    } catch (graphErr) {
      console.warn("Province graph computation non-fatal:", graphErr);
      results.province_control_error = (graphErr as Error).message;
    }

    // ========== NODE INFLUENCE DECAY (Patch 11) ==========
    try {
      const { data: influences } = await supabase
        .from("node_influence")
        .select("session_id, player_name, node_id, economic_influence, political_influence, military_pressure, resistance")
        .eq("session_id", sessionId);

      const { data: tradeLinks } = await supabase
        .from("node_trade_links")
        .select("player_name, node_id, link_status")
        .eq("session_id", sessionId);

      const linkMap = new Map<string, string>();
      (tradeLinks || []).forEach((l: any) => linkMap.set(`${l.player_name}:${l.node_id}`, l.link_status));

      // Detect recent military pressure (this turn) via world_action_log
      const { data: recentActions } = await supabase
        .from("world_action_log")
        .select("player_name, action_type, payload")
        .eq("session_id", sessionId)
        .gte("turn_number", turnNumber)
        .in("action_type", ["APPLY_MILITARY_PRESSURE", "APPLY_PRESSURE"]);

      const pressuredThisTurn = new Set<string>();
      (recentActions || []).forEach((a: any) => {
        const nid = a.payload?.node_id;
        if (nid) pressuredThisTurn.add(`${a.player_name}:${nid}`);
      });

      let decayCount = 0;
      for (const inf of (influences || [])) {
        const key = `${inf.player_name}:${inf.node_id}`;
        const link = linkMap.get(key) || "none";
        const hasTrade = ["trade_open", "protected", "vassalized", "annexed"].includes(link);
        const isAnnexed = link === "annexed";
        if (isAnnexed) continue;

        const econDecay = hasTrade ? 0 : 2;
        const polDecay = 3;
        const milDecay = pressuredThisTurn.has(key) ? 0 : 5;
        const resistanceRegen = pressuredThisTurn.has(key) ? 0 : 1;

        const newEcon = Math.max(0, Number(inf.economic_influence) - econDecay);
        const newPol = Math.max(0, Number(inf.political_influence) - polDecay);
        const newMil = Math.max(0, Number(inf.military_pressure) - milDecay);
        const newRes = Math.min(100, Number(inf.resistance) + resistanceRegen);

        await supabase.from("node_influence").update({
          economic_influence: newEcon,
          political_influence: newPol,
          military_pressure: newMil,
          resistance: newRes,
        }).eq("session_id", sessionId).eq("player_name", inf.player_name).eq("node_id", inf.node_id);
        decayCount++;
      }
      results.node_influence_decay = { processed: decayCount };
    } catch (decayErr) {
      console.warn("Node influence decay non-fatal:", decayErr);
      results.node_influence_decay_error = (decayErr as Error).message;
    }

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
