import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UNIT_WEIGHTS: Record<string, number> = {
  INFANTRY: 1.0, ARCHERS: 1.1, CAVALRY: 1.3, SIEGE: 0.9,
};

const BIOME_DEFENSE_BONUS: Record<string, number> = {
  mountains: 0.25, forest: 0.15, swamp: 0.10, hills: 0.10,
  desert: -0.05, plains: 0, sea: -0.10, tundra: 0.05,
};

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

async function applyCasualties(supabase: any, compositions: any[], totalCasualties: number) {
  const totalManpower = compositions.reduce((s: number, c: any) => s + (c.manpower || 0), 0);
  if (totalManpower <= 0) return;
  for (const comp of compositions) {
    const ratio = (comp.manpower || 0) / totalManpower;
    const losses = Math.min(comp.manpower || 0, Math.round(totalCasualties * ratio));
    const newManpower = Math.max(0, (comp.manpower || 0) - losses);
    await supabase.from("military_stack_composition").update({ manpower: newManpower }).eq("id", comp.id);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, attacker_stack_id, defender_city_id, defender_stack_id, speech_text, speech_morale_modifier, seed, biome: inputBiome, player_name, current_turn } = await req.json();

    if (!session_id || !attacker_stack_id) {
      return new Response(JSON.stringify({ error: "Missing session_id or attacker_stack_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const speechMorale = speech_morale_modifier || 0;
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

    // Apply speech morale modifier
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

    // Determine defender
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
        defenderMorale = dStack.morale || 50;
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

    const attackerCivFort = civBonuses.fortification_bonus || 0;

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

    // Defense multipliers
    const biomeMod = BIOME_DEFENSE_BONUS[biome] || 0;
    const totalDefenseMultiplier = 1 + fortificationBonus + biomeMod;
    const effectiveDefenderStrength = Math.round(defenderStrength * totalDefenseMultiplier);

    const attackerFortBonus = defender_city_id ? 0 : attackerCivFort * 0.5;
    const effectiveAttackerBase = Math.round(attackerStrength * (1 + attackerFortBonus));

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

    // Apply casualties
    await applyCasualties(supabase, attackerStack.military_stack_composition || [], casualtiesAttacker);
    if (defenderComps.length > 0) {
      await applyCasualties(supabase, defenderComps, Math.round(casualtiesDefender * 0.7));
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
        morale: Math.max(0, Math.min(100, (defenderStack.morale || 50) + moraleShiftDefender)),
      }).eq("id", defenderStack.id);
    }

    const needsDecision = result === "decisive_victory" || result === "victory" || result === "pyrrhic_victory";

    // Write battle record
    const { data: battleRecord, error: battleErr } = await supabase.from("battles").insert({
      session_id, turn_number: turnNumber,
      attacker_stack_id, defender_stack_id: defender_stack_id || null, defender_city_id: defender_city_id || null,
      attacker_strength_snapshot: attackerStrength, defender_strength_snapshot: effectiveDefenderStrength,
      attacker_morale_snapshot: attackerMorale, defender_morale_snapshot: defenderMorale,
      speech_text: speech_text || null, speech_morale_modifier: speechMorale,
      biome, fortification_bonus: fortificationBonus, seed: battleSeed, luck_roll: luckRoll,
      result, casualties_attacker: casualtiesAttacker, casualties_defender: casualtiesDefender,
      post_action: needsDecision ? "pending_decision" : null,
      resolved_at: new Date().toISOString(),
    }).select("id").single();

    if (battleErr) {
      return new Response(JSON.stringify({ error: "Failed to save battle record: " + battleErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
    await supabase.from("game_events").insert({
      session_id, player: player_name || attackerStack.player_name,
      event_type: "battle", turn_number: turnNumber,
      note: `Bitva: ${attackerStack.name} vs ${defenderCity?.name || "armáda"}. Výsledek: ${result}. Ztráty: ${casualtiesAttacker}/${casualtiesDefender}.`,
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
            ? `Vojsko „${attackerStack.name}" zvítězilo v bitvě u ${defenderCity.name}. Padlo ${casualtiesDefender} obránců.`
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
        text: `**Bitva u ${defenderCity?.name || "neznámého místa"} (rok ${turnNumber}):** Armáda „${attackerStack.name}" se střetla s ${defenderCity ? `obránci města ${defenderCity.name}` : "nepřátelskou armádou"}. Výsledek: ${resultLabel[result] || result}. Padlých útočníků: ${casualtiesAttacker}, obránců: ${casualtiesDefender}.`,
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

    return new Response(JSON.stringify({
      ok: true,
      battle_id: battleRecord?.id,
      result,
      result_label: RESULT_LABELS[result] || result,
      attacker_name: attackerStack.name,
      defender_name: defenderCity?.name || defenderStack?.name || "nepřítel",
      attacker_strength: attackerStrength,
      defender_strength: effectiveDefenderStrength,
      casualties_attacker: casualtiesAttacker,
      casualties_defender: casualtiesDefender,
      luck_roll: luckRoll,
      needs_decision: needsDecision && !!defender_city_id,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("resolve-battle error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
