import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UNIT_WEIGHTS: Record<string, number> = {
  MILITIA: 0.8, PROFESSIONAL: 1.3,
  // Legacy compat
  INFANTRY: 1.0, ARCHERS: 1.1, CAVALRY: 1.3, SIEGE: 0.9,
};

const BIOME_DEFENSE_BONUS: Record<string, number> = {
  mountains: 0.25, forest: 0.15, swamp: 0.10, hills: 0.10,
  desert: -0.05, plains: 0, sea: -0.10, tundra: 0.05,
};

// ═══ FORMATION ROCK-PAPER-SCISSORS ═══
// ASSAULT > SIEGE, DEFENSIVE > ASSAULT, FLANK > DEFENSIVE, SIEGE > city (special)
const FORMATION_MATCHUPS: Record<string, Record<string, number>> = {
  ASSAULT:   { ASSAULT: 0, DEFENSIVE: -0.15, FLANK: 0.10, SIEGE: 0.15 },
  DEFENSIVE: { ASSAULT: 0.15, DEFENSIVE: 0, FLANK: -0.15, SIEGE: 0.05 },
  FLANK:     { ASSAULT: -0.10, DEFENSIVE: 0.15, FLANK: 0, SIEGE: 0.05 },
  SIEGE:     { ASSAULT: -0.15, DEFENSIVE: -0.05, FLANK: -0.05, SIEGE: 0 },
};

const FORMATION_BASE_BONUSES: Record<string, { attack: number; defense: number; fortIgnore: number }> = {
  ASSAULT:   { attack: 0.15, defense: -0.10, fortIgnore: 0 },
  DEFENSIVE: { attack: -0.05, defense: 0.20, fortIgnore: 0 },
  FLANK:     { attack: 0.10, defense: 0, fortIgnore: 0.50 },
  SIEGE:     { attack: -0.10, defense: -0.05, fortIgnore: 0 },
};

// SIEGE gets +30% vs cities
const SIEGE_CITY_BONUS = 0.30;

function seededRandom(seed: number): number {
  let s = seed;
  s = ((s >>> 16) ^ s) * 0x45d9f3b | 0;
  s = ((s >>> 16) ^ s) * 0x45d9f3b | 0;
  s = (s >>> 16) ^ s;
  return (s & 0x7fffffff) / 0x7fffffff;
}

function computeStackStrength(compositions: any[], morale: number, formationType: string): number {
  let raw = 0;
  for (const comp of compositions) {
    const weight = UNIT_WEIGHTS[comp.unit_type] || 1.0;
    const quality = comp.quality || 50;
    raw += (comp.manpower || 0) * weight * (0.5 + quality / 100);
  }
  const moraleMult = 0.75 + (morale / 100) * 0.5;
  const formationMult = ({ UNIT: 1.0, LEGION: 1.1, ARMY: 1.2 }[formationType] || 1.0);
  return Math.round(raw * moraleMult * formationMult);
}

function computeCityDefenseStrength(city: any): number {
  const garrison = city.military_garrison || 0;
  const peasantMilitia = Math.floor((city.population_peasants || 0) * 0.1);
  const stabilityMult = 0.5 + (city.city_stability || 50) / 200;
  return Math.round((garrison * 1.5 + peasantMilitia) * stabilityMult);
}

async function applyCasualties(supabase: any, compositions: any[], totalCasualties: number): Promise<number> {
  const totalManpower = compositions.reduce((s: number, c: any) => s + (c.manpower || 0), 0);
  if (totalManpower <= 0) return 0;
  let remainingManpower = 0;
  for (const comp of compositions) {
    const ratio = (comp.manpower || 0) / totalManpower;
    const losses = Math.min(comp.manpower || 0, Math.round(totalCasualties * ratio));
    const newManpower = Math.max(0, (comp.manpower || 0) - losses);
    remainingManpower += newManpower;
    await supabase.from("military_stack_composition").update({ manpower: newManpower }).eq("id", comp.id);
  }
  return remainingManpower;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      session_id, attacker_stack_id, defender_city_id, defender_stack_id,
      speech_text, speech_morale_modifier,
      defender_speech_text, defender_speech_morale_modifier,
      attacker_formation: inputAttackerFormation,
      defender_formation: inputDefenderFormation,
      seed, biome: inputBiome, player_name, current_turn,
      lobby_id,
      battle_context: inputBattleContext,
      node_id: inputNodeId,
      route_id: inputRouteId,
    } = await req.json();

    if (!session_id || !attacker_stack_id) {
      return new Response(JSON.stringify({ error: "Missing session_id or attacker_stack_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const attackerFormation = inputAttackerFormation || "ASSAULT";
    const defenderFormation = inputDefenderFormation || "DEFENSIVE";
    const speechMorale = speech_morale_modifier || 0;
    const defenderSpeechMorale = defender_speech_morale_modifier || 0;
    const battleSeed = seed || Date.now();
    const turnNumber = current_turn || 1;

    // Load attacker stack with compositions
    const { data: attackerStack } = await supabase
      .from("military_stacks")
      .select("*, military_stack_composition(*)")
      .eq("id", attacker_stack_id)
      .single();

    if (!attackerStack || !attackerStack.is_active) {
      return new Response(JSON.stringify({ error: "Attacker stack not found or inactive" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Apply attacker speech morale
    const speechAdjustedMorale = Math.max(0, Math.min(100, (attackerStack.morale || 50) + speechMorale));
    if (speechMorale !== 0) {
      await supabase.from("military_stacks").update({ morale: speechAdjustedMorale }).eq("id", attackerStack.id);
      attackerStack.morale = speechAdjustedMorale;
    }
    const attackerMorale = speechAdjustedMorale;

    // Load attacker civ bonuses
    const { data: attackerCiv } = await supabase.from("civilizations").select("civ_bonuses")
      .eq("session_id", session_id).eq("player_name", attackerStack.player_name).maybeSingle();
    const civBonuses = (attackerCiv?.civ_bonuses as Record<string, number>) || {};

    const attackerStrength = computeStackStrength(
      attackerStack.military_stack_composition || [],
      attackerMorale,
      attackerStack.formation_type
    );

    // ── Determine defender ──
    let defenderStrength = 0;
    let defenderMorale = 50;
    let defenderComps: any[] = [];
    let defenderCity: any = null;
    let defenderStack: any = null;
    let biome = inputBiome || "plains";
    let fortificationBonus = 0;

    if (defender_stack_id) {
      const { data: dStack } = await supabase
        .from("military_stacks")
        .select("*, military_stack_composition(*)")
        .eq("id", defender_stack_id)
        .single();
      if (dStack) {
        defenderStack = dStack;
        // Apply defender speech morale
        defenderMorale = Math.max(0, Math.min(100, (dStack.morale || 50) + defenderSpeechMorale));
        if (defenderSpeechMorale !== 0) {
          await supabase.from("military_stacks").update({ morale: defenderMorale }).eq("id", dStack.id);
        }
        defenderComps = dStack.military_stack_composition || [];
        defenderStrength = computeStackStrength(defenderComps, defenderMorale, dStack.formation_type);
      }
    }

    // Load defender civ bonuses
    const defenderCivPlayer = defender_city_id
      ? (await supabase.from("cities").select("owner_player").eq("id", defender_city_id).maybeSingle())?.data?.owner_player
      : defenderStack?.player_name;
    let defenderCivBonuses: Record<string, number> = {};
    if (defenderCivPlayer) {
      const { data: defCiv } = await supabase.from("civilizations").select("civ_bonuses")
        .eq("session_id", session_id).eq("player_name", defenderCivPlayer).maybeSingle();
      defenderCivBonuses = (defCiv?.civ_bonuses as Record<string, number>) || {};
    }

    if (defender_city_id) {
      const { data: dCity } = await supabase.from("cities").select("*").eq("id", defender_city_id).single();
      if (dCity) {
        defenderCity = dCity;
        defenderStrength += computeCityDefenseStrength(dCity);
        defenderMorale = Math.max(defenderMorale, dCity.city_stability || 50);
        const fortMap: Record<string, number> = { HAMLET: 0.05, TOWNSHIP: 0.10, CITY: 0.20, POLIS: 0.30 };
        fortificationBonus = (fortMap[dCity.settlement_level] || 0) + (defenderCivBonuses.fortification_bonus || 0);

        const { data: hex } = await supabase.from("province_hexes")
          .select("biome_family")
          .eq("session_id", session_id).eq("q", dCity.province_q).eq("r", dCity.province_r)
          .maybeSingle();
        if (hex) biome = hex.biome_family || biome;
      }
    }

    // ═══ FORMATION BONUSES ═══
    const atkFormBonus = FORMATION_BASE_BONUSES[attackerFormation] || { attack: 0, defense: 0, fortIgnore: 0 };
    const defFormBonus = FORMATION_BASE_BONUSES[defenderFormation] || { attack: 0, defense: 0, fortIgnore: 0 };
    const matchupBonus = (FORMATION_MATCHUPS[attackerFormation] || {})[defenderFormation] || 0;

    // ═══ NODE FORTIFICATION BONUS ═══
    let nodeFortBonus = 0;
    const battleContext = inputBattleContext || "field_battle";
    if (inputNodeId && (battleContext === "node_siege" || defender_city_id)) {
      const { data: bNode } = await supabase.from("province_nodes")
        .select("fortification_level, defense_value")
        .eq("id", inputNodeId).maybeSingle();
      if (bNode) {
        nodeFortBonus = (bNode.fortification_level || 0) * 0.10 + (bNode.defense_value || 0) * 0.02;
      }
    }

    // ═══ AMBUSH BONUS ═══
    let ambushBonus = 0;
    if (battleContext === "route_ambush") {
      ambushBonus = 0.20; // 20% surprise attack bonus
    }

    // Fort ignore from FLANK
    const effectiveFortification = (fortificationBonus + nodeFortBonus) * (1 - atkFormBonus.fortIgnore);

    // SIEGE city bonus
    const siegeCityBonus = (attackerFormation === "SIEGE" && defender_city_id) ? SIEGE_CITY_BONUS : 0;

    // Defense multipliers
    const biomeMod = BIOME_DEFENSE_BONUS[biome] || 0;
    const defTerrainMult = defenderFormation === "DEFENSIVE" ? 1.5 : 1.0;
    const totalDefenseMultiplier = 1 + effectiveFortification + (biomeMod * defTerrainMult) + defFormBonus.defense;
    const effectiveDefenderStrength = Math.round(defenderStrength * totalDefenseMultiplier);

    // Attack multipliers
    const attackerCivFort = defender_city_id ? 0 : (civBonuses.fortification_bonus || 0) * 0.5;
    const effectiveAttackerBase = Math.round(attackerStrength * (1 + attackerCivFort + atkFormBonus.attack + matchupBonus + siegeCityBonus + ambushBonus));

    // RNG
    const rng = seededRandom(battleSeed);
    const luckRoll = (rng - 0.5) * 0.30;
    const finalAttackerStrength = Math.round(effectiveAttackerBase * (1 + luckRoll));

    // Result
    const ratio = effectiveDefenderStrength > 0 ? finalAttackerStrength / effectiveDefenderStrength : 999;
    let result: string;
    let casualtyRateAttacker: number;
    let casualtyRateDefender: number;

    if (ratio >= 2.0) { result = "decisive_victory"; casualtyRateAttacker = 0.05; casualtyRateDefender = 0.60; }
    else if (ratio >= 1.3) { result = "victory"; casualtyRateAttacker = 0.15; casualtyRateDefender = 0.40; }
    else if (ratio >= 0.8) { result = "pyrrhic_victory"; casualtyRateAttacker = 0.30; casualtyRateDefender = 0.30; }
    else if (ratio >= 0.5) { result = "defeat"; casualtyRateAttacker = 0.40; casualtyRateDefender = 0.15; }
    else { result = "rout"; casualtyRateAttacker = 0.60; casualtyRateDefender = 0.05; }

    const attackerTotalManpower = (attackerStack.military_stack_composition || [])
      .reduce((s: number, c: any) => s + (c.manpower || 0), 0);
    const defenderTotalManpower = defenderComps
      .reduce((s: number, c: any) => s + (c.manpower || 0), 0)
      + (defenderCity ? (defenderCity.military_garrison || 0) : 0);

    const casualtiesAttacker = Math.round(attackerTotalManpower * casualtyRateAttacker);
    const casualtiesDefender = Math.round(defenderTotalManpower * casualtyRateDefender);

    // Apply casualties and check for destruction + UPDATE STACK SSOT (unit_count, power)
    const attackerOriginalUnits = attackerStack.unit_count || attackerTotalManpower;
    const attackerRemaining = await applyCasualties(supabase, attackerStack.military_stack_composition || [], casualtiesAttacker);
    const attackerLost = Math.max(0, attackerOriginalUnits - attackerRemaining);
    if (attackerRemaining <= 0) {
      await supabase.from("military_stacks").update({ is_active: false, is_deployed: false, unit_count: 0, power: 0, soldiers: 0 }).eq("id", attackerStack.id);
    } else {
      // Recompute power = manpower * morale_factor (simple SSOT formula)
      const newPower = Math.round(attackerRemaining * (0.5 + (attackerMorale + (result.includes("victory") ? 5 : -10)) / 200));
      await supabase.from("military_stacks").update({ unit_count: attackerRemaining, power: Math.max(1, newPower), soldiers: attackerRemaining }).eq("id", attackerStack.id);
    }
    // Release manpower_committed on attacker realm
    if (attackerLost > 0 && attackerStack.player_name) {
      const { data: realm } = await supabase.from("realm_resources").select("manpower_committed, manpower_pool").eq("session_id", session_id).eq("player_name", attackerStack.player_name).maybeSingle();
      if (realm) {
        await supabase.from("realm_resources").update({
          manpower_committed: Math.max(0, (realm.manpower_committed || 0) - attackerLost),
        }).eq("session_id", session_id).eq("player_name", attackerStack.player_name);
      }
    }

    let defenderStackRemaining = -1;
    if (defenderComps.length > 0 && defenderStack) {
      const defenderOriginalUnits = defenderStack.unit_count || defenderComps.reduce((s: number, c: any) => s + (c.manpower || 0), 0);
      defenderStackRemaining = await applyCasualties(supabase, defenderComps, Math.round(casualtiesDefender * 0.7));
      const defenderLost = Math.max(0, defenderOriginalUnits - defenderStackRemaining);
      if (defenderStackRemaining <= 0) {
        await supabase.from("military_stacks").update({ is_active: false, is_deployed: false, unit_count: 0, power: 0, soldiers: 0 }).eq("id", defenderStack.id);
      } else {
        const newPower = Math.round(defenderStackRemaining * (0.5 + (defenderMorale + (result.includes("victory") ? -15 : 5)) / 200));
        await supabase.from("military_stacks").update({ unit_count: defenderStackRemaining, power: Math.max(1, newPower), soldiers: defenderStackRemaining }).eq("id", defenderStack.id);
      }
      if (defenderLost > 0 && defenderStack.player_name) {
        const { data: dRealm } = await supabase.from("realm_resources").select("manpower_committed").eq("session_id", session_id).eq("player_name", defenderStack.player_name).maybeSingle();
        if (dRealm) {
          await supabase.from("realm_resources").update({
            manpower_committed: Math.max(0, (dRealm.manpower_committed || 0) - defenderLost),
          }).eq("session_id", session_id).eq("player_name", defenderStack.player_name);
        }
      }
    }
    if (defenderCity) {
      const garrisonLoss = Math.min(defenderCity.military_garrison || 0, Math.round(casualtiesDefender * 0.3));
      const popLoss = Math.round(casualtiesDefender * 0.1);
      const stabLoss = result.includes("victory") ? Math.min(30, Math.round(casualtiesDefender / 10)) : 5;
      await supabase.from("cities").update({
        military_garrison: Math.max(0, (defenderCity.military_garrison || 0) - garrisonLoss),
        population_total: Math.max(100, (defenderCity.population_total || 0) - popLoss),
        city_stability: Math.max(0, (defenderCity.city_stability || 50) - stabLoss),
      }).eq("id", defenderCity.id);
    }

    // Morale shifts
    const moraleShiftAttacker = result.includes("victory") ? 5 : -10;
    const moraleShiftDefender = result.includes("victory") ? -15 : 5;
    await supabase.from("military_stacks").update({
      morale: Math.max(0, Math.min(100, attackerMorale + moraleShiftAttacker)),
    }).eq("id", attackerStack.id);
    if (defenderStack) {
      await supabase.from("military_stacks").update({
        morale: Math.max(0, Math.min(100, defenderMorale + moraleShiftDefender)),
      }).eq("id", defenderStack.id);
    }

    const needsDecision = result === "decisive_victory" || result === "victory" || result === "pyrrhic_victory";

    // Write battle record
    const { data: battleRecord, error: battleErr } = await supabase.from("battles").insert({
      session_id, turn_number: turnNumber,
      attacker_stack_id, defender_stack_id: defender_stack_id || null, defender_city_id: defender_city_id || null,
      attacker_strength_snapshot: effectiveAttackerBase, defender_strength_snapshot: effectiveDefenderStrength,
      attacker_morale_snapshot: attackerMorale, defender_morale_snapshot: defenderMorale,
      speech_text: speech_text || null, speech_morale_modifier: speechMorale,
      biome, fortification_bonus: effectiveFortification, seed: battleSeed, luck_roll: luckRoll,
      result, casualties_attacker: casualtiesAttacker, casualties_defender: casualtiesDefender,
      post_action: needsDecision ? "pending_decision" : null,
      resolved_at: new Date().toISOString(),
    }).select("id").single();

    if (battleErr) {
      return new Response(JSON.stringify({ error: "Failed to save battle record: " + battleErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Update lobby if provided
    if (lobby_id && battleRecord) {
      await supabase.from("battle_lobbies").update({
        status: "resolved", battle_id: battleRecord.id, resolved_at: new Date().toISOString(),
      }).eq("id", lobby_id);
    }

    // ═══ POST-BATTLE NODE/ROUTE CONTROL TRANSFER ═══
    const isVictory = result === "decisive_victory" || result === "victory" || result === "pyrrhic_victory";

    // Node control transfer after siege victory
    if (isVictory && inputNodeId && battleContext === "node_siege") {
      const attackerPlayer = player_name || attackerStack.player_name;
      await supabase.from("province_nodes").update({
        controlled_by: attackerPlayer,
        besieged_by: null,
        besieging_stack_id: null,
        siege_turn_start: null,
        garrison_strength: 0,
      }).eq("id", inputNodeId);

      await supabase.from("game_events").insert({
        session_id, player: attackerPlayer, event_type: "node_captured",
        turn_number: turnNumber, confirmed: true, truth_state: "canon",
        note: `Uzel dobyt po bitvě!`, importance: "critical",
      });
    }

    // Route unblocking after blockade battle victory
    if (isVictory && inputRouteId && battleContext === "route_blockade") {
      await supabase.from("province_routes").update({
        control_state: "open",
        blocked_by: [],
      }).eq("id", inputRouteId);
    }

    // ═══ CITY OCCUPATION (Phase 1 of 2-phase conquest) ═══
    // Vítězství v městské bitvě → 3-tahová okupace. Po 3 tazích bez liberation = anexe.
    if (isVictory && defenderCity && (result === "decisive_victory" || result === "victory")) {
      const attackerPlayer = player_name || attackerStack.player_name;
      const occupationLoyalty = result === "decisive_victory" ? 25 : 15;
      await supabase.from("cities").update({
        occupied_by: attackerPlayer,
        occupation_turn: turnNumber,
        liberation_deadline_turn: turnNumber + 3,
        occupation_loyalty: occupationLoyalty,
        // Production drop on occupation: stability halved
        city_stability: Math.max(10, Math.round((defenderCity.city_stability || 50) * 0.5)),
      }).eq("id", defenderCity.id);

      await supabase.from("game_events").insert({
        session_id, player: attackerPlayer, event_type: "city_occupied",
        turn_number: turnNumber, confirmed: true, truth_state: "canon",
        note: `Město ${defenderCity.name} je okupováno! Liberation deadline: rok ${turnNumber + 3}.`,
        importance: "critical",
      });
    }

    // Clear battle context on stacks
    await supabase.from("military_stacks").update({ battle_context: null }).eq("id", attacker_stack_id);
    if (defender_stack_id) {
      await supabase.from("military_stacks").update({ battle_context: null }).eq("id", defender_stack_id);
    }


    // Post-battle decision
    if (needsDecision && defender_city_id) {
      await supabase.from("action_queue").insert({
        session_id, player_name: player_name || attackerStack.player_name,
        action_type: "post_battle_decision", status: "pending",
        action_data: {
          battle_id: battleRecord?.id, attacker_stack_id,
          defender_city_id, result,
          casualties_attacker: casualtiesAttacker, casualties_defender: casualtiesDefender,
        },
        completes_at: new Date().toISOString(), created_turn: turnNumber,
      });
    }

    // Game event
    const formationNote = `Formace: ${attackerFormation} vs ${defenderFormation}.`;
    await supabase.from("game_events").insert({
      session_id, player: player_name || attackerStack.player_name,
      event_type: "battle", turn_number: turnNumber,
      note: `Bitva: ${attackerStack.name} vs ${defenderCity?.name || defenderStack?.name || "armáda"}. ${formationNote} Výsledek: ${result}. Ztráty: ${casualtiesAttacker}/${casualtiesDefender}.`,
      result, importance: result === "decisive_victory" ? "critical" : "normal",
    });

    // Cascade: City rumor
    if (defenderCity) {
      try {
        const isVictory = result.includes("victory");
        await supabase.from("city_rumors").insert({
          session_id, city_id: defenderCity.id, city_name: defenderCity.name,
          turn_number: turnNumber,
          text: isVictory
            ? `Vojsko „${attackerStack.name}" (formace ${attackerFormation}) zvítězilo v bitvě u ${defenderCity.name}. Padlo ${casualtiesDefender} obránců.`
            : `Obránci ${defenderCity.name} statečně odrazili útok armády „${attackerStack.name}". Nepřítel utrpěl ${casualtiesAttacker} ztrát.`,
          tone_tag: isVictory ? "alarming" : "triumphant",
          created_by: "system",
        });
      } catch (_) { /* non-critical */ }
    }

    // Cascade: Chronicle entry
    try {
      const resultLabel: Record<string, string> = {
        decisive_victory: "drtivé vítězství útočníka", victory: "vítězství útočníka",
        pyrrhic_victory: "pyrrhovo vítězství", defeat: "porážka útočníka", rout: "zničující porážka útočníka",
      };
      await supabase.from("chronicle_entries").insert({
        session_id,
        text: `**Bitva u ${defenderCity?.name || "neznámého místa"} (rok ${turnNumber}):** Armáda „${attackerStack.name}" (${attackerFormation}) se střetla s ${defenderCity ? `obránci města ${defenderCity.name}` : `armádou „${defenderStack?.name || "nepřítel"}"`} (${defenderFormation}). Výsledek: ${resultLabel[result] || result}. Padlých útočníků: ${casualtiesAttacker}, obránců: ${casualtiesDefender}.`,
        epoch_style: "kroniky", turn_from: turnNumber, turn_to: turnNumber, source_type: "system",
      });
    } catch (_) { /* non-critical */ }

    // Cascade: Faction loyalty impact
    if (defenderCity && (result === "decisive_victory" || result === "victory" || result === "pyrrhic_victory")) {
      try {
        const { data: cityFactions } = await supabase.from("city_factions")
          .select("id, loyalty, satisfaction, faction_type")
          .eq("city_id", defenderCity.id).eq("is_active", true);
        for (const f of (cityFactions || [])) {
          const loyaltyLoss = f.faction_type === "military" ? 15 : 8;
          const satLoss = result === "decisive_victory" ? 15 : 8;
          await supabase.from("city_factions").update({
            loyalty: Math.max(0, (f.loyalty || 50) - loyaltyLoss),
            satisfaction: Math.max(0, (f.satisfaction || 50) - satLoss),
          }).eq("id", f.id);
        }
      } catch (_) { /* non-critical */ }
    }

    // Cascade: Stability ripple
    if (defenderCity && (result === "decisive_victory" || result === "victory")) {
      try {
        const { data: nearbyCities } = await supabase.from("cities")
          .select("id, city_stability")
          .eq("session_id", session_id).eq("owner_player", defenderCity.owner_player)
          .neq("id", defenderCity.id);
        const rippleLoss = result === "decisive_victory" ? 5 : 3;
        for (const nc of (nearbyCities || [])) {
          await supabase.from("cities").update({ city_stability: Math.max(0, (nc.city_stability || 70) - rippleLoss) }).eq("id", nc.id);
        }
      } catch (_) { /* non-critical */ }
    }

    const RESULT_LABELS: Record<string, string> = {
      decisive_victory: "Drtivé vítězství", victory: "Vítězství",
      pyrrhic_victory: "Pyrrhovo vítězství", defeat: "Porážka", rout: "Rozprášení",
    };

    const attackerDestroyed = attackerRemaining <= 0;
    const defenderDestroyed = defenderStack && defenderStackRemaining === 0;

    // Chronicle destroyed armies
    if (attackerDestroyed || defenderDestroyed) {
      try {
        const destroyedName = attackerDestroyed ? attackerStack.name : defenderStack?.name;
        const victorName = attackerDestroyed ? (defenderCity?.name || defenderStack?.name || "obránce") : attackerStack.name;
        await supabase.from("chronicle_entries").insert({
          session_id,
          text: `**Zničení armády (rok ${turnNumber}):** Armáda „${destroyedName}" byla zcela zničena v bitvě s ${victorName}. Žádný voják nepřežil.`,
          epoch_style: "kroniky", turn_from: turnNumber, turn_to: turnNumber, source_type: "system",
        });
      } catch (_) { /* non-critical */ }
    }

    // ═══ MILITARY MERIT: Record significant battle achievements ═══
    const isSignificant = result === "decisive_victory" || 
      (result === "victory" && casualtiesDefender > 200) ||
      (result === "pyrrhic_victory" && casualtiesAttacker > 300);
    
    if (isSignificant) {
      try {
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        const attackerPlayer = player_name || attackerStack.player_name;
        const defenderName = defenderCity?.name || defenderStack?.name || "nepřítel";
        const totalCasualties = casualtiesAttacker + casualtiesDefender;

        const meritTitle = result === "decisive_victory"
          ? `Drtivé vítězství u ${defenderName}`
          : result === "pyrrhic_victory"
            ? `Pyrrhovo vítězství u ${defenderName}`
            : `Velká bitva u ${defenderName}`;

        const meritDesc = result === "decisive_victory"
          ? `Armáda „${attackerStack.name}" drtivě porazila ${defenderName}. Celkem ${totalCasualties} padlých, z toho ${casualtiesDefender} obránců. ${attackerFormation} formace se ukázala jako klíčová.`
          : result === "pyrrhic_victory"
            ? `Armáda „${attackerStack.name}" zvítězila u ${defenderName}, ale za strašlivou cenu — ${casualtiesAttacker} vlastních padlých. Krvavé vítězství, které zanechalo hluboké jizvy.`
            : `Armáda „${attackerStack.name}" porazila ${defenderName} v krvavé bitvě s ${totalCasualties} celkovými ztrátami.`;

        let imageUrl: string | null = null;
        if (LOVABLE_API_KEY) {
          try {
            const imgPrompt = `Epic ancient battle scene: ${result === "decisive_victory" ? "a commander on horseback triumphantly surveying a decisive battlefield victory" : "a bloody pyrrhic battlefield with exhausted victorious soldiers among the fallen"}. Dramatic oil painting, golden and crimson lighting, ancient Greek/Roman style.`;
            const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash-image",
                messages: [{ role: "user", content: `Generate ONE dramatic battle scene image: ${imgPrompt} Do not include any text.` }],
                modalities: ["image", "text"],
              }),
            });
            if (aiResp.ok) {
              const aiData = await aiResp.json();
              const imgData = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
              if (imgData) {
                const base64 = imgData.replace(/^data:image\/\w+;base64,/, "");
                const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
                const fn = `battle-${crypto.randomUUID()}.png`;
                const { error: upErr } = await supabase.storage.from("building-images")
                  .upload(`records/${fn}`, bytes, { contentType: "image/png", upsert: true });
                if (!upErr) {
                  const { data: urlD } = supabase.storage.from("building-images").getPublicUrl(`records/${fn}`);
                  imageUrl = urlD?.publicUrl || null;
                }
              }
            }
          } catch (_) {}
        }

        // Create world event
        const { data: worldEvt } = await supabase.from("world_events").insert({
          session_id,
          event_type: "military_merit",
          title: meritTitle,
          description: meritDesc,
          impact: result === "decisive_victory" ? "high" : "medium",
          turn_number: turnNumber,
          image_url: imageUrl,
          tags: ["military", result],
        }).select("id").maybeSingle();

        // Wiki entry
        const wikiBody = `## ${meritTitle}\n\n${meritDesc}\n\n**Formace útočníka:** ${attackerFormation}\n**Formace obránce:** ${defenderFormation}\n**Ztráty:** ${casualtiesAttacker} (útočník) / ${casualtiesDefender} (obránce)`;
        await supabase.from("wiki_entries").insert({
          session_id,
          entity_type: "event",
          entity_id: worldEvt?.id || battleRecord?.id || crypto.randomUUID(),
          entity_name: meritTitle,
          summary: meritDesc,
          body_md: wikiBody,
          image_url: imageUrl,
          source_turn: turnNumber,
        });

        // Save record
        await supabase.from("game_records").insert({
          session_id,
          record_type: "military_merit",
          category: "military",
          entity_id: attacker_stack_id,
          entity_name: attackerStack.name,
          entity_type: "army",
          player_name: attackerPlayer,
          title: meritTitle,
          description: meritDesc,
          battle_id: battleRecord?.id,
          score: totalCasualties,
          margin: casualtiesDefender - casualtiesAttacker,
          image_url: imageUrl,
          world_event_id: worldEvt?.id,
          turn_number: turnNumber,
        });
      } catch (meritErr) {
        console.error("Military merit failed:", meritErr);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      battle_id: battleRecord?.id,
      result,
      result_label: RESULT_LABELS[result] || result,
      attacker_name: attackerStack.name,
      defender_name: defenderCity?.name || defenderStack?.name || "nepřítel",
      attacker_strength: effectiveAttackerBase,
      defender_strength: effectiveDefenderStrength,
      attacker_formation: attackerFormation,
      defender_formation: defenderFormation,
      formation_matchup_bonus: matchupBonus,
      casualties_attacker: casualtiesAttacker,
      casualties_defender: casualtiesDefender,
      luck_roll: luckRoll,
      needs_decision: needsDecision && !!defender_city_id,
      attacker_destroyed: attackerDestroyed,
      defender_destroyed: !!defenderDestroyed,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("resolve-battle error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
