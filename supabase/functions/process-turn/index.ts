import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

import { SETTLEMENT_TEMPLATES, SETTLEMENT_WEALTH } from "../_shared/physics.ts";

const UNIT_WEIGHTS: Record<string, number> = {
  INFANTRY: 1.0, ARCHERS: 1.1, CAVALRY: 1.3, SIEGE: 0.9,
};

const BIOME_DEFENSE_BONUS: Record<string, number> = {
  mountains: 0.25, forest: 0.15, swamp: 0.10, hills: 0.10,
  desert: -0.05, plains: 0, sea: -0.10, tundra: 0.05,
};

/** Deterministic RNG from seed, returns value in [0, 1) */
function seededRandom(seed: number): number {
  let s = seed;
  s = ((s >>> 16) ^ s) * 0x45d9f3b | 0;
  s = ((s >>> 16) ^ s) * 0x45d9f3b | 0;
  s = (s >>> 16) ^ s;
  return (s & 0x7fffffff) / 0x7fffffff;
}

/** Compute stack combat strength from compositions */
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

/** Compute implicit city defense strength (no stack) */
function computeCityDefenseStrength(city: any): number {
  const garrison = city.military_garrison || 0;
  const peasantMilitia = Math.floor((city.population_peasants || 0) * 0.1);
  const stabilityMult = 0.5 + (city.city_stability || 50) / 200; // 0.5-1.0
  return Math.round((garrison * 1.5 + peasantMilitia) * stabilityMult);
}

/** Apply casualties proportionally to compositions */
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

// Settlement-level production constants
const SETTLEMENT_PRODUCTION: Record<string, { grain: number; wood: number; stone: number; iron_special: number }> = {
  HAMLET:   { grain: 8,  wood: 6, stone: 2, iron_special: 2 },
  TOWNSHIP: { grain: 10, wood: 7, stone: 3, iron_special: 3 },
  CITY:     { grain: 12, wood: 8, stone: 4, iron_special: 4 },
  POLIS:    { grain: 14, wood: 9, stone: 5, iron_special: 5 },
};

const FORMATION_MULT: Record<string, number> = {
  UNIT: 1.0, LEGION: 1.1, ARMY: 1.2,
};

// Wealth income formula: base per city + population tax + burgher trade bonus + settlement tier
// Wealth income uses SETTLEMENT_WEALTH from shared physics

// --- GRAIN CONSUMPTION per capita (balanced to match production) ---
// A HAMLET (pop 1000, grain prod 8) should consume ~6 grain → 0.006 per capita base
// Burghers consume more (trade/luxury), clerics moderate, peasants least
const CONSUMPTION_PER_CAPITA = {
  peasants: 0.005,
  burghers: 0.010,
  clerics: 0.008,
};
// Fallback: if no layer data, use flat rate
const CONSUMPTION_PER_CAPITA_FLAT = 0.006;

function computeGrainConsumption(city: any): number {
  const peas = city.population_peasants || 0;
  const burg = city.population_burghers || 0;
  const cler = city.population_clerics || 0;
  if (peas + burg + cler > 0) {
    return Math.round(
      peas * CONSUMPTION_PER_CAPITA.peasants +
      burg * CONSUMPTION_PER_CAPITA.burghers +
      cler * CONSUMPTION_PER_CAPITA.clerics
    );
  }
  return Math.round((city.population_total || 0) * CONSUMPTION_PER_CAPITA_FLAT);
}

function computeWealthIncome(cities: any[]): number {
  let total = 0;
  for (const c of cities) {
    if (c.status && c.status !== "ok") continue;
    const tierBase = SETTLEMENT_WEALTH[c.settlement_level] || 1;
    const popTax = Math.floor((c.population_total || 0) / 500);
    const burgherTrade = Math.floor((c.population_burghers || 0) / 200);
    total += tierBase + popTax + burgherTrade;
  }
  return total;
}

// Simple deterministic hash for seeding
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId, playerName } = await req.json();
    if (!sessionId || !playerName) throw new Error("Missing sessionId or playerName");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1) Load realm resources
    let { data: realm } = await supabase
      .from("realm_resources")
      .select("*")
      .eq("session_id", sessionId)
      .eq("player_name", playerName)
      .maybeSingle();

    if (!realm) {
      const { data: newRealm } = await supabase.from("realm_resources").insert({
        session_id: sessionId, player_name: playerName,
      }).select().single();
      realm = newRealm;
    }

    // Load session for current turn
    const { data: session } = await supabase.from("game_sessions").select("current_turn").eq("id", sessionId).single();
    const currentTurn = session?.current_turn || 1;

    // Load civ DNA bonuses for this player
    const { data: civRow } = await supabase
      .from("civilizations")
      .select("civ_bonuses, architectural_style, cultural_quirk")
      .eq("session_id", sessionId)
      .eq("player_name", playerName)
      .maybeSingle();
    const civBonuses: Record<string, number> = (civRow?.civ_bonuses as Record<string, number>) || {};

    // Idempotency check
    if (realm.last_processed_turn >= currentTurn) {
      return new Response(JSON.stringify({ 
        ok: true, skipped: true, 
        message: `Turn ${currentTurn} already processed for ${playerName}` 
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load infrastructure
    let { data: infra } = await supabase
      .from("realm_infrastructure")
      .select("*")
      .eq("session_id", sessionId)
      .eq("player_name", playerName)
      .maybeSingle();

    if (!infra) {
      const { data: newInfra } = await supabase.from("realm_infrastructure").insert({
        session_id: sessionId, player_name: playerName,
      }).select().single();
      infra = newInfra;
    }

    // 2) Load cities
    const { data: cities } = await supabase
      .from("cities")
      .select("*")
      .eq("session_id", sessionId)
      .eq("owner_player", playerName);

    const myCities = cities || [];
    const logEntries: string[] = [];

    // ═══ BUILDING COMPLETION ═══
    // Complete buildings whose build time has elapsed
    const { data: allBuildings } = await supabase
      .from("city_buildings")
      .select("*")
      .eq("session_id", sessionId)
      .eq("status", "building")
      .in("city_id", myCities.length > 0 ? myCities.map(c => c.id) : ["00000000-0000-0000-0000-000000000000"]);

    let completedCount = 0;
    for (const b of (allBuildings || [])) {
      const finishTurn = (b.build_started_turn || 0) + (b.build_duration || 1);
      if (currentTurn >= finishTurn) {
        await supabase.from("city_buildings").update({
          status: "completed",
          completed_turn: currentTurn,
        }).eq("id", b.id);
        completedCount++;
        const cityName = myCities.find(c => c.id === b.city_id)?.name || "?";
        logEntries.push(`🏗️ Stavba "${b.name}" v ${cityName} dokončena!`);
      }
    }
    if (completedCount > 0) {
      logEntries.push(`Celkem dokončeno ${completedCount} staveb`);
    }

    // ═══ BUILDING EFFECTS ═══
    // Load ALL completed buildings for this player's cities to sum up economic bonuses
    const { data: completedBuildings } = await supabase
      .from("city_buildings")
      .select("city_id, effects")
      .eq("session_id", sessionId)
      .eq("status", "completed")
      .in("city_id", myCities.length > 0 ? myCities.map(c => c.id) : ["00000000-0000-0000-0000-000000000000"]);

    // Aggregate building effects per city and globally
    const cityBuildingEffects: Record<string, Record<string, number>> = {};
    const globalBuildingEffects: Record<string, number> = {};
    for (const b of (completedBuildings || [])) {
      const eff = b.effects as Record<string, number> | null;
      if (!eff) continue;
      if (!cityBuildingEffects[b.city_id]) cityBuildingEffects[b.city_id] = {};
      for (const [k, v] of Object.entries(eff)) {
        if (typeof v !== "number") continue;
        cityBuildingEffects[b.city_id][k] = (cityBuildingEffects[b.city_id][k] || 0) + v;
        globalBuildingEffects[k] = (globalBuildingEffects[k] || 0) + v;
      }
    }

    if (Object.keys(globalBuildingEffects).length > 0) {
      const effStr = Object.entries(globalBuildingEffects)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${k}:+${v}`)
        .join(", ");
      logEntries.push(`Bonusy ze staveb: ${effStr}`);
    }

    // Compute granary/stables capacity from infrastructure
    const granaryCapacity = 500 * (infra?.granary_level || 1) * (infra?.granaries_count || 1);
    const stablesCapacity = 100 * (infra?.stables_level || 1) * (infra?.stables_count || 1);

    // Settlement layers are computed by world-tick (shared physics). 
    // process-turn trusts those values and only handles economy.

    // ═══ WORKFORCE SYSTEM ═══
    // Active pop = peasants*1.0 + burghers*0.7 + clerics*0.2
    // Effective active pop = active_pop_raw * active_pop_ratio (default 0.5, modified by laws)
    // Workforce = effective_active_pop - mobilized
    // Production multiplier = workforce_ratio = workforce / effective_active_pop

    const ACTIVE_POP_WEIGHTS = { peasants: 1.0, burghers: 0.7, clerics: 0.2 };
    const DEFAULT_ACTIVE_POP_RATIO = 0.5;
    const DEFAULT_MAX_MOBILIZATION = 0.3;

    // Read law modifiers for workforce
    const { data: activeLaws } = await supabase.from("laws").select("structured_effects, player_name")
      .eq("session_id", sessionId).eq("player_name", playerName).eq("is_active", true);

    let activePopModifier = 0;
    let maxMobModifier = 0;
    for (const law of (activeLaws || [])) {
      const effects = law.structured_effects as any[];
      if (!Array.isArray(effects)) continue;
      for (const eff of effects) {
        if (eff.type === "active_pop_modifier") activePopModifier += (eff.value || 0);
        if (eff.type === "max_mobilization_modifier") maxMobModifier += (eff.value || 0);
      }
    }

    let activePopRaw = 0;
    for (const city of myCities) {
      if (city.status && city.status !== "ok") continue;
      activePopRaw += (city.population_peasants || 0) * ACTIVE_POP_WEIGHTS.peasants
                    + (city.population_burghers || 0) * ACTIVE_POP_WEIGHTS.burghers
                    + (city.population_clerics || 0) * ACTIVE_POP_WEIGHTS.clerics;
    }
    activePopRaw = Math.floor(activePopRaw);

    const effectiveRatio = Math.max(0.1, Math.min(0.9, DEFAULT_ACTIVE_POP_RATIO + activePopModifier));
    const effectiveActivePop = Math.floor(activePopRaw * effectiveRatio);
    const maxMob = Math.max(0.05, Math.min(0.5, DEFAULT_MAX_MOBILIZATION + maxMobModifier));
    // Soft cap: allow mobilization above maxMob but apply production penalty
    const mobRate = realm.mobilization_rate || 0.1;
    const isOverMob = mobRate > maxMob;
    const mobilized = Math.floor(effectiveActivePop * mobRate);
    const workforce = effectiveActivePop - mobilized;
    const workforceRatio = effectiveActivePop > 0 ? workforce / effectiveActivePop : 1;
    // Over-mob penalty: each % over cap = 2% production penalty
    const overMobPenalty = isOverMob ? Math.min(0.8, (mobRate - maxMob) * 2) : 0;
    const effectiveWorkforceRatio = Math.max(0.05, workforceRatio * (1 - overMobPenalty));

    logEntries.push(`Workforce: active_pop_raw=${activePopRaw}, effective=${effectiveActivePop} (ratio ${effectiveRatio}), workforce=${workforce}, mobilized=${mobilized}, workforceRatio=${workforceRatio.toFixed(2)}, overMobPenalty=${(overMobPenalty*100).toFixed(0)}%, effectiveWR=${effectiveWorkforceRatio.toFixed(2)}`);

    // 3) Settlement-based resource production (ALL resources scaled by workforce_ratio)
    const cityIds = myCities.map(c => c.id);
    const { data: profiles } = await supabase
      .from("settlement_resource_profiles")
      .select("*")
      .in("city_id", cityIds.length > 0 ? cityIds : ["00000000-0000-0000-0000-000000000000"]);

    const profileMap: Record<string, any> = {};
    for (const p of (profiles || [])) {
      profileMap[p.city_id] = p;
    }

    // Auto-create missing profiles
    for (const city of myCities) {
      if (!profileMap[city.id]) {
        const prodConsts = SETTLEMENT_PRODUCTION[city.settlement_level] || SETTLEMENT_PRODUCTION.HAMLET;
        const seed = Math.abs(hashCode(city.id));
        const roll = seed % 100;
        const specialType = roll < 30 ? "IRON" : "NONE";
        const { data: newProfile } = await supabase.from("settlement_resource_profiles").insert({
          city_id: city.id,
          produces_grain: true,
          produces_wood: true,
          special_resource_type: specialType,
          base_grain: prodConsts.grain,
          base_wood: prodConsts.wood,
          base_special: specialType === "IRON" ? prodConsts.iron_special : 0,
          founded_seed: city.id,
        }).select().single();
        if (newProfile) profileMap[city.id] = newProfile;
      }
    }

    let totalGrainProd = 0;
    let totalWoodProd = 0;
    let totalStoneProd = 0;
    let totalIronProd = 0;

    for (const city of myCities) {
      const profile = profileMap[city.id];
      const prodConsts = SETTLEMENT_PRODUCTION[city.settlement_level] || SETTLEMENT_PRODUCTION.HAMLET;
      const bldgEff = cityBuildingEffects[city.id] || {};

      const cityGrainBase = profile ? profile.base_grain : prodConsts.grain;
      const cityGrain = Math.round(cityGrainBase * effectiveWorkforceRatio) + (bldgEff.food_income || 0);
      totalGrainProd += cityGrain;

      const cityWoodBase = profile ? profile.base_wood : prodConsts.wood;
      const cityWood = Math.round(cityWoodBase * effectiveWorkforceRatio) + (bldgEff.wood_income || 0);
      totalWoodProd += cityWood;

      // Stone scaled by workforce + building bonus
      const cityStone = Math.round(prodConsts.stone * effectiveWorkforceRatio) + (bldgEff.stone_income || 0);
      totalStoneProd += cityStone;

      // Iron scaled by workforce (only for IRON cities) + building bonus
      const specialType = profile?.special_resource_type || "NONE";
      const cityIronBase = specialType === "IRON" ? (profile ? profile.base_special : prodConsts.iron_special) : 0;
      const cityIron = Math.round(cityIronBase * effectiveWorkforceRatio) + (bldgEff.iron_income || 0);
      totalIronProd += cityIron;

      // Apply stability bonus from buildings (clamp 0-100)
      if (bldgEff.stability_bonus && bldgEff.stability_bonus > 0) {
        const newStab = Math.min(100, (city.city_stability || 70) + bldgEff.stability_bonus);
        if (newStab !== city.city_stability) {
          city.city_stability = newStab;
        }
      }

      // Apply influence bonus from buildings
      if (bldgEff.influence_bonus && bldgEff.influence_bonus > 0) {
        const newInfluence = Math.min(1000, (city.influence_score || 0) + bldgEff.influence_bonus);
        city.influence_score = newInfluence;
      }

      // Apply population growth from buildings (added to population_total)
      if (bldgEff.population_growth && bldgEff.population_growth > 0) {
        const growthAmount = Math.round(bldgEff.population_growth * (city.population_total || 100) / 100);
        if (growthAmount > 0) {
          city.population_total = (city.population_total || 100) + growthAmount;
          city.population_peasants = (city.population_peasants || 50) + Math.round(growthAmount * 0.6);
          city.population_burghers = (city.population_burghers || 20) + Math.round(growthAmount * 0.3);
          city.population_clerics = (city.population_clerics || 5) + Math.round(growthAmount * 0.1);
        }
      }

      // Apply defense bonus from buildings (added to military_garrison)
      if (bldgEff.defense_bonus && bldgEff.defense_bonus > 0) {
        city.military_garrison = (city.military_garrison || 0) + bldgEff.defense_bonus;
      }

      await supabase.from("cities").update({
        last_turn_grain_prod: cityGrain,
        last_turn_wood_prod: cityWood,
        last_turn_stone_prod: cityStone,
        last_turn_iron_prod: cityIron,
        last_turn_special_prod: cityIron,
        special_resource_type: specialType,
        city_stability: city.city_stability,
        influence_score: city.influence_score,
        population_total: city.population_total,
        population_peasants: city.population_peasants,
        population_burghers: city.population_burghers,
        population_clerics: city.population_clerics,
        military_garrison: city.military_garrison,
      }).eq("id", city.id);
    }

    // 4) Grain consumption (balanced per-capita formula)
    let totalConsumption = 0;
    for (const city of myCities) {
      const cityCons = computeGrainConsumption(city);
      totalConsumption += cityCons;
      await supabase.from("cities").update({ last_turn_grain_cons: cityCons }).eq("id", city.id);
      city._cachedCons = cityCons;
    }

    // Early-game buffer: small realms get a bonus
    const earlyGameBuffer = myCities.length <= 3 ? 10 : 0;
    totalGrainProd += earlyGameBuffer;

    if (totalConsumption < 0) totalConsumption = Math.abs(totalConsumption);

    // 5) Update granary reserves — FAMINE LOGIC
    const netGrain = totalGrainProd - totalConsumption;
    let grainReserve = realm.grain_reserve || 0;
    let famineActive = false;

    if (netGrain >= 0) {
      // === SURPLUS: no famine, fill reserves ===
      const addToReserve = Math.min(netGrain, granaryCapacity - grainReserve);
      grainReserve += addToReserve;

      // Clear famine from ALL cities (surplus = no famine)
      for (const city of myCities) {
        if (city.famine_turn || city.famine_consecutive_turns > 0) {
          await supabase.from("cities").update({
            famine_turn: false,
            famine_severity: 0,
            famine_consecutive_turns: 0,
          }).eq("id", city.id);
          city.famine_turn = false;
          city.famine_severity = 0;
          city.famine_consecutive_turns = 0;
        }
      }
    } else {
      // === DEFICIT: drain reserves first ===
      const deficit = Math.abs(netGrain);
      const taken = Math.min(deficit, grainReserve);
      grainReserve -= taken;
      const remainingDeficit = deficit - taken;

      if (remainingDeficit > 0) {
        // === FAMINE: reserves depleted and still deficit ===
        famineActive = true;

        // Distribute famine across cities by vulnerability
        for (const city of myCities) {
          const vuln = (100 - city.city_stability) * 0.5
            + (1 - city.local_grain_reserve / Math.max(city.local_granary_capacity, 1)) * 20
            + ({ HAMLET: 10, TOWNSHIP: 8, CITY: 6, POLIS: 5 }[city.settlement_level] || 10);
          city.vulnerability_score = vuln;
        }

        const sorted = [...myCities].sort((a, b) => b.vulnerability_score - a.vulnerability_score);
        let remaining = remainingDeficit;

        for (const city of sorted) {
          if (remaining <= 0) break;
          const cityCons = city._cachedCons || computeGrainConsumption(city);
          const cityNeed = Math.max(0, cityCons - (city.local_grain_reserve || 0));
          const allocDeficit = Math.min(remaining, cityNeed);

          if (city.local_grain_reserve > 0) {
            const localUsed = Math.min(city.local_grain_reserve, allocDeficit);
            city.local_grain_reserve -= localUsed;
          }

          if (allocDeficit > 0) {
            // Famine effects: stability loss + 5% population loss
            const stabLoss = Math.min(20, Math.max(5, Math.round(allocDeficit / 2)));
            const newStab = Math.max(0, city.city_stability - stabLoss);
            const popLoss = Math.round(city.population_total * 0.05);
            const newPop = Math.max(100, city.population_total - popLoss);

            // Track consecutive famine turns
            const prevConsecutive = city.famine_consecutive_turns || 0;
            const newConsecutive = prevConsecutive + 1;

            await supabase.from("cities").update({
              famine_turn: true,
              famine_severity: allocDeficit,
              famine_consecutive_turns: newConsecutive,
              city_stability: newStab,
              population_total: newPop,
              local_grain_reserve: city.local_grain_reserve,
              vulnerability_score: city.vulnerability_score,
            }).eq("id", city.id);

            city.famine_turn = true;
            city.famine_consecutive_turns = newConsecutive;
            city.population_total = newPop;
            city.city_stability = newStab;

            logEntries.push(`⚠️ HLADOMOR v ${city.name}: deficit ${allocDeficit}, populace -${popLoss} (${newPop}), stabilita ${newStab}, kolo hladomoru ${newConsecutive}/5`);

            // ═══ UPRISING TRIGGER: 5 consecutive famine turns ═══
            const UPRISING_THRESHOLD = 5;
            if (newConsecutive >= UPRISING_THRESHOLD) {
              // Check cooldown — skip if city is still protected
              const cooldownUntil = city.uprising_cooldown_until || 0;
              if (currentTurn <= cooldownUntil) {
                logEntries.push(`⏳ Vzpoura v ${city.name} blokována cooldownem (do roku ${cooldownUntil})`);
              } else {
              // Check if there's already an active uprising for this city
              const { data: existingUprising } = await supabase
                .from("city_uprisings")
                .select("id, escalation_level")
                .eq("city_id", city.id)
                .in("status", ["pending", "escalated"])
                .maybeSingle();

              if (!existingUprising) {
                // Create new uprising
                await supabase.from("city_uprisings").insert({
                  session_id: sessionId,
                  city_id: city.id,
                  player_name: playerName,
                  turn_triggered: currentTurn,
                  escalation_level: 1,
                  status: "pending",
                  demands: JSON.stringify([
                    { type: "pay_wealth", label: "Vyplatit lid", cost_percent: 30 },
                    { type: "open_stores", label: "Otevřít královské zásoby" },
                    { type: "cede_city", label: "Vzdát se města" },
                    { type: "abdicate", label: "Odstoupit z trůnu" },
                  ]),
                });

                // Log as game event
                await supabase.from("game_events").insert({
                  session_id: sessionId,
                  event_type: "rebellion",
                  player: playerName,
                  note: `Vzpoura v ${city.name}! Po ${newConsecutive} kolech hladomoru se lid bouří a žádá okamžitou nápravu.`,
                  importance: "critical",
                  confirmed: true,
                  turn_number: currentTurn,
                  city_id: city.id,
                });

                // Chronicle entry
                try {
                  await supabase.from("chronicle_entries").insert({
                    session_id: sessionId,
                    text: `**Vzpoura lidu (rok ${currentTurn}):** V ${city.name} propukla vzpoura hladovějícího lidu. Po ${newConsecutive} letech strádání obyvatelé obklíčili palác a žádají okamžitou nápravu.`,
                    epoch_style: "kroniky",
                    turn_from: currentTurn,
                    turn_to: currentTurn,
                    source_type: "system",
                  });
                } catch (_) { /* non-critical */ }

                logEntries.push(`🔥 VZPOURA v ${city.name}! Lid žádá okamžitou nápravu po ${newConsecutive} kolech hladomoru.`);
              } else if (existingUprising.escalation_level < 3) {
                // Escalate existing uprising
                const newLevel = existingUprising.escalation_level + 1;
                await supabase.from("city_uprisings").update({
                  escalation_level: newLevel,
                  status: "escalated",
                  demands: JSON.stringify([
                    { type: "pay_wealth", label: "Vyplatit lid", cost_percent: 30 + newLevel * 20 },
                    { type: "open_stores", label: "Otevřít královské zásoby" },
                    { type: "cede_city", label: "Vzdát se města" },
                    { type: "abdicate", label: "Odstoupit z trůnu" },
                    ...(newLevel >= 3 ? [{ type: "forced_secession", label: "Město se odtrhne samo" }] : []),
                  ]),
                }).eq("id", existingUprising.id);

                logEntries.push(`🔥 ESKALACE vzpoury v ${city.name}! Úroveň ${newLevel}`);
              }
              } // end cooldown else
            }

            remaining -= allocDeficit;
          }
        }

        // Cities NOT hit by famine should have famine cleared
        for (const city of myCities) {
          if (!city.famine_turn) {
            await supabase.from("cities").update({
              famine_turn: false, famine_severity: 0, famine_consecutive_turns: 0,
            }).eq("id", city.id);
          }
        }
      } else {
        // Deficit covered by reserves — no famine
        for (const city of myCities) {
          if (city.famine_turn || city.famine_consecutive_turns > 0) {
            await supabase.from("cities").update({
              famine_turn: false, famine_severity: 0, famine_consecutive_turns: 0,
            }).eq("id", city.id);
            city.famine_turn = false;
            city.famine_severity = 0;
            city.famine_consecutive_turns = 0;
          }
        }
        logEntries.push(`Deficit obilí ${deficit} pokryt ze zásob (zbývá ${grainReserve})`);
      }
    }

    logEntries.push(`Obilí: produkce ${totalGrainProd}, spotřeba ${totalConsumption}, bilance ${netGrain >= 0 ? "+" : ""}${netGrain}, zásoby ${grainReserve}/${granaryCapacity}`);
    logEntries.push(`Suroviny: Dřevo +${totalWoodProd}, Kámen +${totalStoneProd}, Železo +${totalIronProd}`);

    // 6) Population growth — handled by world-tick (shared physics), NOT here.
    // process-turn only handles economy (production, consumption, famine, stockpiles).

    // 7) Manpower pool — uses workforce system + building manpower bonuses
    const totalPopulation = myCities.reduce((s, c) => s + c.population_total, 0);
    const manpowerBonusFromBuildings = globalBuildingEffects.manpower_bonus || 0;
    const manpowerPool = effectiveActivePop + manpowerBonusFromBuildings;

    // 8) Logistic capacity
    const logisticCapacity = realm.horses_reserve + Math.round((infra?.slavery_factor || 0) * 100);

    // 9) Military power recomputation
    const { data: stacks } = await supabase
      .from("military_stacks")
      .select("*, military_stack_composition(*)")
      .eq("session_id", sessionId)
      .eq("player_name", playerName)
      .eq("is_active", true);

    const totalBurghers = myCities.reduce((s, c) => s + (c.population_burghers || 0), 0);
    const burgherRatio = totalPopulation > 0 ? totalBurghers / totalPopulation : 0;
    const qualityBonus = Math.round(burgherRatio * 30);

    for (const stack of (stacks || [])) {
      let generalSkill = 0;
      if (stack.general_id) {
        const { data: gen } = await supabase.from("generals").select("skill").eq("id", stack.general_id).maybeSingle();
        generalSkill = gen?.skill || 50;
      }

      let powerComponent = 0;
      for (const comp of (stack.military_stack_composition || [])) {
        const weight = UNIT_WEIGHTS[comp.unit_type] || 1.0;
        const quality = Math.max(0, Math.min(100, 50 + qualityBonus + (generalSkill - 50) / 5));
        powerComponent += comp.manpower * weight * (0.5 + quality / 100);
        await supabase.from("military_stack_composition").update({ quality: Math.round(quality) }).eq("id", comp.id);
      }

      const generalMult = stack.general_id ? 1 + generalSkill / 200 : 1.0;
      const moraleMult = 0.75 + (stack.morale / 100) * 0.5;
      const formationMult = FORMATION_MULT[stack.formation_type] || 1.0;
      const newPower = Math.round(powerComponent * generalMult * moraleMult * formationMult);

      const oldPower = stack.power || 0;
      if (Math.abs(newPower - oldPower) > oldPower * 0.05 || oldPower === 0) {
        await supabase.from("military_stacks").update({ power: newPower }).eq("id", stack.id);
        if (oldPower > 0) {
          logEntries.push(`Armáda "${stack.name}": síla ${oldPower} → ${newPower}`);
        }
      }
    }

    // ═══ RESET moved_this_turn FOR ALL DEPLOYED STACKS ═══
    await supabase.from("military_stacks")
      .update({ moved_this_turn: false })
      .eq("session_id", sessionId)
      .eq("player_name", playerName)
      .eq("is_deployed", true);

    // ═══ BATTLE RESOLUTION ═══
    // Resolve all pending battle actions from action_queue
    const { data: pendingBattles } = await supabase
      .from("action_queue")
      .select("*")
      .eq("session_id", sessionId)
      .eq("player_name", playerName)
      .eq("action_type", "battle")
      .eq("status", "pending");

    for (const battleAction of (pendingBattles || [])) {
      try {
        const bd = battleAction.action_data as any;
        const attackerStackId = bd.attacker_stack_id;
        const defenderCityId = bd.defender_city_id;
        const defenderStackId = bd.defender_stack_id;
        const speechMorale = bd.speech_morale_modifier || 0;
        const battleSeed = bd.seed || Date.now();

        // Load attacker stack with compositions
        const { data: attackerStack } = await supabase
          .from("military_stacks")
          .select("*, military_stack_composition(*)")
          .eq("id", attackerStackId)
          .single();

        if (!attackerStack || !attackerStack.is_active) {
          await supabase.from("action_queue").update({ status: "cancelled" }).eq("id", battleAction.id);
          continue;
        }

        // Apply speech morale modifier PERMANENTLY to the stack (clamped 0-100)
        const speechAdjustedMorale = Math.max(0, Math.min(100, (attackerStack.morale || 50) + speechMorale));
        if (speechMorale !== 0) {
          await supabase.from("military_stacks").update({ morale: speechAdjustedMorale }).eq("id", attackerStack.id);
          attackerStack.morale = speechAdjustedMorale; // update local ref
        }
        const attackerMorale = speechAdjustedMorale;
        const attackerStrength = computeStackStrength(
          attackerStack.military_stack_composition || [],
          attackerMorale,
          attackerStack.formation_type
        );

        // Determine defender strength
        let defenderStrength = 0;
        let defenderMorale = 50;
        let defenderComps: any[] = [];
        let defenderCity: any = null;
        let defenderStack: any = null;
        let biome = bd.biome || "plains";
        let fortificationBonus = 0;

        if (defenderStackId) {
          const { data: dStack } = await supabase
            .from("military_stacks")
            .select("*, military_stack_composition(*)")
            .eq("id", defenderStackId)
            .single();
          if (dStack) {
            defenderStack = dStack;
            defenderMorale = dStack.morale || 50;
            defenderComps = dStack.military_stack_composition || [];
            defenderStrength = computeStackStrength(defenderComps, defenderMorale, dStack.formation_type);
          }
        }

        // Load defender's civ bonuses for fortification
        const defenderPlayer = defenderStackId
          ? (await supabase.from("military_stacks").select("player_name").eq("id", defenderStackId).maybeSingle())?.data?.player_name
          : null;
        const defenderCivPlayer = defenderCityId
          ? (await supabase.from("cities").select("owner_player").eq("id", defenderCityId).maybeSingle())?.data?.owner_player
          : defenderPlayer;
        let defenderCivBonuses: Record<string, number> = {};
        if (defenderCivPlayer) {
          const { data: defCiv } = await supabase.from("civilizations").select("civ_bonuses").eq("session_id", sessionId).eq("player_name", defenderCivPlayer).maybeSingle();
          defenderCivBonuses = (defCiv?.civ_bonuses as Record<string, number>) || {};
        }

        // Apply attacker's civ fortification bonus (50% in field battles)
        const attackerCivFort = civBonuses.fortification_bonus || 0;

        if (defenderCityId) {
          const { data: dCity } = await supabase
            .from("cities")
            .select("*")
            .eq("id", defenderCityId)
            .single();
          if (dCity) {
            defenderCity = dCity;
            // Add implicit city defense
            defenderStrength += computeCityDefenseStrength(dCity);
            defenderMorale = Math.max(defenderMorale, dCity.city_stability || 50);
            // Fortification from settlement level + defender's civ DNA bonus (full)
            const fortMap: Record<string, number> = { HAMLET: 0.05, TOWNSHIP: 0.10, CITY: 0.20, POLIS: 0.30 };
            fortificationBonus = (fortMap[dCity.settlement_level] || 0) + (defenderCivBonuses.fortification_bonus || 0);

            // Load hex biome
            const { data: hex } = await supabase
              .from("province_hexes")
              .select("biome_family")
              .eq("session_id", sessionId)
              .eq("q", dCity.province_q)
              .eq("r", dCity.province_r)
              .maybeSingle();
            if (hex) biome = hex.biome_family || biome;
          }
        }

        // Apply biome defense bonus
        const biomeMod = BIOME_DEFENSE_BONUS[biome] || 0;
        const totalDefenseMultiplier = 1 + fortificationBonus + biomeMod;
        const effectiveDefenderStrength = Math.round(defenderStrength * totalDefenseMultiplier);

        // Apply attacker's civ fortification bonus (50% in field, full in city siege as attacker advantage is separate)
        const attackerFortBonus = defenderCityId ? 0 : attackerCivFort * 0.5; // field battle only
        const effectiveAttackerBase = Math.round(attackerStrength * (1 + attackerFortBonus));

        // RNG luck roll: ±15% from seed
        const rng = seededRandom(battleSeed);
        const luckRoll = (rng - 0.5) * 0.30; // -0.15 to +0.15

        // Apply luck to attacker strength (using civ-adjusted base)
        const finalAttackerStrength = Math.round(effectiveAttackerBase * (1 + luckRoll));

        // Determine result
        const ratio = effectiveDefenderStrength > 0 ? finalAttackerStrength / effectiveDefenderStrength : 999;
        let result: string;
        let casualtyRateAttacker: number;
        let casualtyRateDefender: number;

        if (ratio >= 2.0) {
          result = "decisive_victory";
          casualtyRateAttacker = 0.05;
          casualtyRateDefender = 0.60;
        } else if (ratio >= 1.3) {
          result = "victory";
          casualtyRateAttacker = 0.15;
          casualtyRateDefender = 0.40;
        } else if (ratio >= 0.8) {
          result = "pyrrhic_victory";
          casualtyRateAttacker = 0.30;
          casualtyRateDefender = 0.30;
        } else if (ratio >= 0.5) {
          result = "defeat";
          casualtyRateAttacker = 0.40;
          casualtyRateDefender = 0.15;
        } else {
          result = "rout";
          casualtyRateAttacker = 0.60;
          casualtyRateDefender = 0.05;
        }

        const attackerTotalManpower = (attackerStack.military_stack_composition || [])
          .reduce((s: number, c: any) => s + (c.manpower || 0), 0);
        const defenderTotalManpower = defenderComps
          .reduce((s: number, c: any) => s + (c.manpower || 0), 0)
          + (defenderCity ? (defenderCity.military_garrison || 0) : 0);

        const casualtiesAttacker = Math.round(attackerTotalManpower * casualtyRateAttacker);
        const casualtiesDefender = Math.round(defenderTotalManpower * casualtyRateDefender);

        // Apply casualties to attacker
        await applyCasualties(supabase, attackerStack.military_stack_composition || [], casualtiesAttacker);

        // Apply casualties to defender stack
        if (defenderComps.length > 0) {
          await applyCasualties(supabase, defenderComps, Math.round(casualtiesDefender * 0.7));
        }
        // Apply garrison/pop losses to defender city
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

        // Morale shifts (based on CURRENT morale which already includes speech modifier)
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

        // Determine if post-battle decision needed
        const needsDecision = result === "decisive_victory" || result === "victory" || result === "pyrrhic_victory";

        // Use the turn when the battle was queued, not the current processing turn
        const battleTurnNumber = battleAction.created_turn || currentTurn;

        // Write battle record FIRST (before marking action as completed)
        const { data: battleRecord, error: battleInsertErr } = await supabase.from("battles").insert({
          session_id: sessionId,
          turn_number: battleTurnNumber,
          attacker_stack_id: attackerStackId,
          defender_stack_id: defenderStackId || null,
          defender_city_id: defenderCityId || null,
          attacker_strength_snapshot: attackerStrength,
          defender_strength_snapshot: effectiveDefenderStrength,
          attacker_morale_snapshot: attackerMorale,
          defender_morale_snapshot: defenderMorale,
          speech_text: bd.speech_text || null,
          speech_morale_modifier: speechMorale,
          biome,
          fortification_bonus: fortificationBonus,
          seed: battleSeed,
          luck_roll: luckRoll,
          result,
          casualties_attacker: casualtiesAttacker,
          casualties_defender: casualtiesDefender,
          post_action: needsDecision ? "pending_decision" : null,
          resolved_at: new Date().toISOString(),
        }).select("id").single();

        if (battleInsertErr) {
          console.error("Battle record insert FAILED:", battleInsertErr.message, JSON.stringify(battleInsertErr));
          logEntries.push(`⚠️ CHYBA: Nepodařilo se uložit bitevní záznam: ${battleInsertErr.message}`);
          // Leave action as pending for retry next turn
          continue;
        }

        // Mark battle action as completed ONLY after successful battle record insert
        await supabase.from("action_queue").update({ status: "completed" }).eq("id", battleAction.id);

        // ═══ CREATE POST-BATTLE DECISION in action_queue ═══
        if (needsDecision && defenderCityId) {
          await supabase.from("action_queue").insert({
            session_id: sessionId,
            player_name: playerName,
            action_type: "post_battle_decision",
            status: "pending",
            action_data: {
              battle_id: battleRecord?.id || null,
              attacker_stack_id: attackerStackId,
              defender_city_id: defenderCityId,
              result,
              casualties_attacker: casualtiesAttacker,
              casualties_defender: casualtiesDefender,
            },
            completes_at: new Date().toISOString(),
            created_turn: battleTurnNumber,
          });
          logEntries.push(`📋 Rozhodnutí po bitvě: čeká na hráče (${result})`);
        }

        // Log game event
        await supabase.from("game_events").insert({
          session_id: sessionId,
          player: playerName,
          event_type: "battle",
          turn_number: currentTurn,
          note: `Bitva: ${attackerStack.name} vs ${defenderCity?.name || "armáda"}. Výsledek: ${result}. Ztráty: ${casualtiesAttacker}/${casualtiesDefender}.`,
          result,
          importance: result === "decisive_victory" ? "critical" : "normal",
        });

        // ═══ BATTLE CONSEQUENCES CASCADE ═══

        // 1. City rumor about the battle
        if (defenderCity) {
          try {
            const isVictory = result.includes("victory");
            await supabase.from("city_rumors").insert({
              session_id: sessionId,
              city_id: defenderCity.id,
              city_name: defenderCity.name,
              turn_number: currentTurn,
              text: isVictory
                ? `Vojsko „${attackerStack.name}" zvítězilo v bitvě u ${defenderCity.name}. Padlo ${casualtiesDefender} obránců. Město se chvěje nejistotou.`
                : `Obránci ${defenderCity.name} statečně odrazili útok armády „${attackerStack.name}". Nepřítel utrpěl ${casualtiesAttacker} ztrát.`,
              tone_tag: isVictory ? "alarming" : "triumphant",
              created_by: "system",
            });
          } catch (_) { /* non-critical */ }
        }

        // 2. Chronicle entry for the battle
        try {
          const resultLabel: Record<string, string> = {
            decisive_victory: "drtivé vítězství útočníka",
            victory: "vítězství útočníka",
            pyrrhic_victory: "pyrrhovo vítězství",
            defeat: "porážka útočníka",
            rout: "zničující porážka útočníka",
          };
          await supabase.from("chronicle_entries").insert({
            session_id: sessionId,
            text: `**Bitva u ${defenderCity?.name || "neznámého místa"} (rok ${currentTurn}):** Armáda „${attackerStack.name}" se střetla s ${defenderCity ? `obránci města ${defenderCity.name}` : "nepřátelskou armádou"}. Výsledek: ${resultLabel[result] || result}. Padlých útočníků: ${casualtiesAttacker}, obránců: ${casualtiesDefender}. ${result === "decisive_victory" ? "Tato bitva otřásla celým krajem." : ""}`,
            epoch_style: "kroniky",
            turn_from: currentTurn,
            turn_to: currentTurn,
            source_type: "system",
          });
        } catch (_) { /* non-critical */ }

        // 3. Faction loyalty impact in defending city (attacker victory damages defender factions)
        if (defenderCity && (result === "decisive_victory" || result === "victory" || result === "pyrrhic_victory")) {
          try {
            const { data: cityFactions } = await supabase.from("city_factions")
              .select("id, loyalty, satisfaction, faction_type")
              .eq("city_id", defenderCity.id)
              .eq("is_active", true);
            for (const f of (cityFactions || [])) {
              const loyaltyLoss = f.faction_type === "military" ? 15 : 8;
              const satLoss = result === "decisive_victory" ? 15 : 8;
              await supabase.from("city_factions").update({
                loyalty: Math.max(0, (f.loyalty || 50) - loyaltyLoss),
                satisfaction: Math.max(0, (f.satisfaction || 50) - satLoss),
              }).eq("id", f.id);
            }
            logEntries.push(`🏛️ Frakce v ${defenderCity.name}: loajalita a spokojenost sníženy po bitvě`);
          } catch (_) { /* non-critical */ }
        }

        // 4. Stability ripple: nearby cities of the defender lose stability
        if (defenderCity && (result === "decisive_victory" || result === "victory")) {
          try {
            const { data: nearbyCities } = await supabase.from("cities")
              .select("id, name, city_stability")
              .eq("session_id", sessionId)
              .eq("owner_player", defenderCity.owner_player)
              .neq("id", defenderCity.id);
            const rippleLoss = result === "decisive_victory" ? 5 : 3;
            for (const nc of (nearbyCities || [])) {
              const newStab = Math.max(0, (nc.city_stability || 70) - rippleLoss);
              await supabase.from("cities").update({ city_stability: newStab }).eq("id", nc.id);
            }
            if ((nearbyCities || []).length > 0) {
              logEntries.push(`📉 Porážka u ${defenderCity.name} otřásla stabilitou ${(nearbyCities || []).length} dalších měst (-${rippleLoss})`);
            }
          } catch (_) { /* non-critical */ }
        }

        logEntries.push(`⚔️ Bitva: ${attackerStack.name} → ${defenderCity?.name || "nepřítel"}: ${result} (ztráty ${casualtiesAttacker}/${casualtiesDefender}, luck ${(luckRoll * 100).toFixed(0)}%)`);
      } catch (battleErr) {
        console.error("Battle resolve error:", battleErr);
        await supabase.from("action_queue").update({ status: "cancelled" }).eq("id", battleAction.id);
        logEntries.push(`⚠️ Chyba při řešení bitvy: ${battleErr.message || "unknown"}`);
      }
    }

    // ═══ TRADE ROUTE PROCESSING ═══
    // Process active trade routes where this player is sender (outgoing) or receiver (incoming)
    const { data: activeRoutes } = await supabase
      .from("trade_routes")
      .select("*")
      .eq("session_id", sessionId)
      .eq("status", "active")
      .or(`from_player.eq.${playerName},to_player.eq.${playerName}`);

    let tradeGoldDelta = 0;
    let tradeGrainDelta = 0;
    let tradeWoodDelta = 0;
    let tradeStoneDelta = 0;
    let tradeIronDelta = 0;
    const tradeLogParts: string[] = [];

    const TRADE_RES_MAP: Record<string, string> = {
      gold: "gold", grain: "grain", wood: "wood", stone: "stone", iron: "iron",
    };

    function applyTradeDelta(res: string, amount: number) {
      switch (res) {
        case "gold": tradeGoldDelta += amount; break;
        case "grain": tradeGrainDelta += amount; break;
        case "wood": tradeWoodDelta += amount; break;
        case "stone": tradeStoneDelta += amount; break;
        case "iron": tradeIronDelta += amount; break;
      }
    }

    for (const route of (activeRoutes || [])) {
      // Check expiration
      if (route.expires_turn && currentTurn >= route.expires_turn) {
        await supabase.from("trade_routes").update({ status: "expired" }).eq("id", route.id);
        tradeLogParts.push(`Trasa ${route.id.slice(0, 6)} vypršela`);
        continue;
      }

      const isSender = route.from_player === playerName;
      const routeSafety = route.route_safety || 1;
      const efficiency = Math.min(1.0, 0.7 + routeSafety * 0.2);

      // ═══ TRADE RAID RISK ═══
      // Low safety = higher chance of ambush. Safety 1 = 5%, Safety 0 = 25%
      const raidChance = Math.max(0.02, 0.25 - routeSafety * 0.20);
      const raidSeed = hashCode(`${route.id}-${currentTurn}-raid`);
      const raidRoll = (raidSeed % 1000) / 1000;
      if (raidRoll < raidChance) {
        // Raid! Lose this turn's goods and generate rumor
        const lostAmount = isSender ? route.amount_per_turn : Math.round(route.amount_per_turn * efficiency);
        tradeLogParts.push(`⚠️ Přepadení trasy ${route.id.slice(0, 6)}! Ztráta ${lostAmount} ${route.resource_type}`);

        // Reduce safety after raid
        const newSafety = Math.max(0, routeSafety - 0.2);
        await supabase.from("trade_routes").update({ route_safety: newSafety }).eq("id", route.id);

        // Generate rumor about the raid
        try {
          const fromCityId = route.from_city_id;
          if (fromCityId) {
            const { data: fromCity } = await supabase.from("cities").select("name").eq("id", fromCityId).maybeSingle();
            await supabase.from("city_rumors").insert({
              session_id: sessionId,
              city_id: fromCityId,
              city_name: fromCity?.name || "?",
              turn_number: currentTurn,
              text: `Obchodní karavana na trase z ${fromCity?.name || "?"} byla přepadena lupiči! Ztraceno ${lostAmount} ${route.resource_type}.`,
              tone_tag: "alarming",
              created_by: "system",
            });
          }
        } catch (_) { /* non-critical */ }

        // Log game event for the raid
        try {
          await supabase.from("game_events").insert({
            session_id: sessionId,
            player: playerName,
            event_type: "trade_raid",
            turn_number: currentTurn,
            note: `Přepadení obchodní trasy! Ztráta ${lostAmount} ${route.resource_type}.`,
            importance: "normal",
            confirmed: true,
          });
        } catch (_) { /* non-critical */ }

        continue; // Skip normal trade processing for this route this turn
      }

      if (isSender) {
        // Sender loses resource_type, gains return_resource_type
        applyTradeDelta(route.resource_type, -route.amount_per_turn);
        if (route.return_resource_type && route.return_amount > 0) {
          const received = Math.round(route.return_amount * efficiency);
          applyTradeDelta(route.return_resource_type, received);
        }
      } else {
        // Receiver gains resource_type, loses return_resource_type
        const received = Math.round(route.amount_per_turn * efficiency);
        applyTradeDelta(route.resource_type, received);
        if (route.return_resource_type && route.return_amount > 0) {
          applyTradeDelta(route.return_resource_type, -route.return_amount);
        }
      }
    }

    if (tradeGoldDelta !== 0 || tradeGrainDelta !== 0 || tradeWoodDelta !== 0 || tradeStoneDelta !== 0 || tradeIronDelta !== 0) {
      const parts: string[] = [];
      if (tradeGoldDelta !== 0) parts.push(`zlato ${tradeGoldDelta >= 0 ? "+" : ""}${tradeGoldDelta}`);
      if (tradeGrainDelta !== 0) parts.push(`obilí ${tradeGrainDelta >= 0 ? "+" : ""}${tradeGrainDelta}`);
      if (tradeWoodDelta !== 0) parts.push(`dřevo ${tradeWoodDelta >= 0 ? "+" : ""}${tradeWoodDelta}`);
      if (tradeStoneDelta !== 0) parts.push(`kámen ${tradeStoneDelta >= 0 ? "+" : ""}${tradeStoneDelta}`);
      if (tradeIronDelta !== 0) parts.push(`železo ${tradeIronDelta >= 0 ? "+" : ""}${tradeIronDelta}`);
      logEntries.push(`🔄 Obchod: ${parts.join(", ")}`);
    }
    if (tradeLogParts.length > 0) {
      logEntries.push(`Obchodní trasy: ${tradeLogParts.join("; ")}`);
    }

    // 10) Update realm resources + gold (including trade deltas)
    const newWoodReserve = Math.max(0, (realm.wood_reserve || 0) + totalWoodProd + tradeWoodDelta);
    const newStoneReserve = Math.max(0, (realm.stone_reserve || 0) + totalStoneProd + tradeStoneDelta);
    const newIronReserve = Math.max(0, (realm.iron_reserve || 0) + totalIronProd + tradeIronDelta);

    // Gold & food army upkeep: 1 gold per 100 troops, 1 food per 500 troops
    let wealthUpkeep = 0;
    let armyFoodUpkeep = 0;
    for (const stack of (stacks || [])) {
      const stackManpower = (stack.military_stack_composition || [])
        .reduce((sum: number, c: any) => sum + (c.manpower ?? 0), 0);
      wealthUpkeep += Math.ceil(stackManpower / 100);
      armyFoodUpkeep += Math.ceil(stackManpower / 500);
    }

    // Subtract army food from grain reserve (after settlement consumption)
    grainReserve = Math.max(0, grainReserve - armyFoodUpkeep);

    // Apply trade grain delta
    grainReserve = Math.max(0, grainReserve + tradeGrainDelta);

    const wealthIncome = computeWealthIncome(myCities) + (globalBuildingEffects.wealth_income || 0);
    const newGoldReserve = Math.max(0, (realm.gold_reserve || 0) + wealthIncome - wealthUpkeep + tradeGoldDelta);

    const famineCityCount = myCities.filter(c => c.famine_turn).length;

    await supabase.from("realm_resources").update({
      grain_reserve: grainReserve,
      granary_capacity: granaryCapacity,
      stables_capacity: stablesCapacity,
      manpower_pool: manpowerPool,
      logistic_capacity: logisticCapacity,
      last_processed_turn: currentTurn,
      last_turn_grain_prod: totalGrainProd,
      last_turn_grain_cons: totalConsumption,
      last_turn_grain_net: netGrain,
      last_turn_wood_prod: totalWoodProd,
      last_turn_stone_prod: totalStoneProd,
      last_turn_iron_prod: totalIronProd,
      wood_reserve: newWoodReserve,
      stone_reserve: newStoneReserve,
      iron_reserve: newIronReserve,
      gold_reserve: newGoldReserve,
      famine_city_count: famineCityCount,
      updated_at: new Date().toISOString(),
    }).eq("id", realm.id);

    // 11) Write economy summary to world_action_log (NOT chronicle — chronicle is for narrative events only)
    // Chronicle entries are now strictly derived from game_events with event_id FK.

    // 13) Recompute player_resources incomes from settlement profiles
    const resourceTypes = ["food", "wood", "stone", "iron", "wealth"];
    const incomes: Record<string, number> = {
      food: totalGrainProd,
      wood: totalWoodProd,
      stone: totalStoneProd,
      iron: totalIronProd,
      wealth: computeWealthIncome(myCities),
    };
    const upkeeps: Record<string, number> = {
      food: totalConsumption + armyFoodUpkeep,
      wood: 0,
      stone: 0,
      iron: 0,
      wealth: wealthUpkeep,
    };

    for (const resType of resourceTypes) {
      const income = incomes[resType] || 0;
      const upkeep = upkeeps[resType] || 0;

      const { data: updated } = await supabase
        .from("player_resources")
        .update({
          income,
          upkeep,
          updated_at: new Date().toISOString(),
        })
        .eq("session_id", sessionId)
        .eq("player_name", playerName)
        .eq("resource_type", resType)
        .select("id, stockpile, last_applied_turn");

      if (!updated || updated.length === 0) {
        await supabase.from("player_resources").insert({
          session_id: sessionId,
          player_name: playerName,
          resource_type: resType,
          income,
          upkeep,
          stockpile: 0,
          last_applied_turn: 0,
        });
      }
    }

    // Apply stockpile increments (idempotent via last_applied_turn)
    const { data: allResources } = await supabase
      .from("player_resources")
      .select("*")
      .eq("session_id", sessionId)
      .eq("player_name", playerName);

    for (const res of (allResources || [])) {
      if (res.last_applied_turn >= currentTurn) continue;
      let newStockpile: number;
      if (res.resource_type === "wealth") {
        // Wealth stockpile = gold_reserve (single source of truth)
        newStockpile = newGoldReserve;
      } else {
        newStockpile = Math.max(0, (res.stockpile || 0) + (res.income || 0) - (res.upkeep || 0));
      }
      await supabase.from("player_resources").update({
        stockpile: newStockpile,
        last_applied_turn: currentTurn,
        updated_at: new Date().toISOString(),
      }).eq("id", res.id);
    }

    const incomeSummary = resourceTypes
      .filter(r => (incomes[r] || 0) > 0)
      .map(r => `${r}+${incomes[r]}`)
      .join(" ");
    logEntries.push(`Příjmy: ${incomeSummary}`);

    // Write to world_action_log
    await supabase.from("world_action_log").insert({
      session_id: sessionId,
      turn_number: currentTurn,
      player_name: playerName,
      action_type: "turn_processing",
      description: `Kolo ${currentTurn} zpracováno: obilí ${netGrain >= 0 ? "+" : ""}${netGrain}, pop ${totalPopulation}, manpower ${manpowerPool}. Army food upkeep: ${armyFoodUpkeep}. ${incomeSummary}`,
      metadata: {
        grain_prod: totalGrainProd,
        grain_consumption: totalConsumption,
        army_food_upkeep: armyFoodUpkeep,
        army_gold_upkeep: wealthUpkeep,
        net_grain: netGrain,
        grain_reserve: grainReserve,
        manpower_pool: manpowerPool,
        famine_active: famineActive,
        famine_city_count: famineCityCount,
        incomes,
      },
    });

    return new Response(JSON.stringify({
      ok: true,
      turn: currentTurn,
      summary: {
        grainProduction: totalGrainProd,
        grainConsumption: totalConsumption,
        netGrain,
        grainReserve,
        granaryCapacity,
        manpowerPool,
        manpowerCommitted: realm.manpower_committed,
        logisticCapacity,
        totalPopulation,
        famineActive,
        famineCityCount,
        logEntries: logEntries.length,
        armyFoodUpkeep,
        armyGoldUpkeep: wealthUpkeep,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
