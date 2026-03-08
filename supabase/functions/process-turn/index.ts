import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { SETTLEMENT_TEMPLATES, SETTLEMENT_WEALTH, computePrestigeEffects, getOpenBordersBonuses, hasActiveEmbargo, getTradeEfficiencyModifier, computeStructuralBonuses, type DiplomaticPact } from "../_shared/physics.ts";

/**
 * Compute UNIFIED production multipliers: numeric civ_identity modifiers (%) + structural category bonuses
 * merged into a single multiplier per resource. Logic: base × (1 + numeric% + (structural - 1))
 * This ensures additive stacking between both bonus sources, then one multiplication.
 */
function computeUnifiedMults(civIdentity: any, grainMod: number, woodMod: number, stoneMod: number, ironMod: number, wealthMod: number): { grain: number; wood: number; stone: number; iron: number; wealth: number } {
  const sb = civIdentity ? computeStructuralBonuses(civIdentity) : null;
  // Structural bonuses are multipliers centered on 1.0 (e.g., 1.2 = +20%)
  // Convert to additive percentages and combine with numeric modifiers
  const structGrain = sb ? (sb.grain_production_mult - 1) * 100 : 0;
  const structWood = sb ? (sb.wood_production_mult - 1) * 100 : 0;
  const structStone = sb ? (sb.stone_production_mult - 1) * 100 : 0;
  const structIron = sb ? (sb.iron_production_mult - 1) * 100 : 0;
  const structWealth = sb ? (sb.wealth_production_mult - 1) * 100 : 0;

  return {
    grain: 1 + (grainMod + structGrain) / 100,
    wood: 1 + (woodMod + structWood) / 100,
    stone: 1 + (stoneMod + structStone) / 100,
    iron: 1 + (ironMod + structIron) / 100,
    wealth: 1 + (wealthMod + structWealth) / 100,
  };
}

const UNIT_WEIGHTS: Record<string, number> = {
  MILITIA: 0.8, PROFESSIONAL: 1.3,
  // Legacy compat
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
function computeStackStrength(compositions: any[], morale: number, formationType: string, cavalryBonus = 0): number {
  let raw = 0;
  for (const comp of compositions) {
    let weight = UNIT_WEIGHTS[comp.unit_type] || 1.0;
    // Apply civ cavalry bonus to CAVALRY units
    if (comp.unit_type === "CAVALRY" && cavalryBonus > 0) {
      weight *= (1 + cavalryBonus);
    }
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

// Ration policy modifiers for grain consumption
const RATION_CONSUMPTION_MULT: Record<string, number> = {
  equal: 1.0,
  elite: 0.95,      // slightly less total (elite eats better but fewer get fed)
  austerity: 0.80,  // significant savings
  sacrifice: 1.15,  // extra grain burned as offerings
};

function computeGrainConsumption(city: any): number {
  const peas = city.population_peasants || 0;
  const burg = city.population_burghers || 0;
  const cler = city.population_clerics || 0;
  const rationMult = RATION_CONSUMPTION_MULT[city.ration_policy] || 1.0;
  if (peas + burg + cler > 0) {
    return Math.round(
      (peas * CONSUMPTION_PER_CAPITA.peasants +
       burg * CONSUMPTION_PER_CAPITA.burghers +
       cler * CONSUMPTION_PER_CAPITA.clerics) * rationMult
    );
  }
  return Math.round((city.population_total || 0) * CONSUMPTION_PER_CAPITA_FLAT * rationMult);
}

function computeWealthIncome(cities: any[], districtEffectsMap: Record<string, Record<string, number>> = {}): number {
  let total = 0;
  for (const c of cities) {
    if (c.status && c.status !== "ok") continue;
    const tierBase = SETTLEMENT_WEALTH[c.settlement_level] || 1;
    const popTax = Math.floor((c.population_total || 0) / 500);
    const burgherTrade = Math.floor((c.population_burghers || 0) / 200);
    // Labor: crafting % boosts wealth
    const labor = (c.labor_allocation && typeof c.labor_allocation === "object") ? c.labor_allocation : {};
    const craftingBonus = Math.round((labor.crafting || 0) / 100 * 5); // up to +4 wealth
    // Infrastructure: market_level +4 wealth/level
    const marketBonus = (c.market_level || 0) * 4;
    // District wealth modifiers
    const distEff = districtEffectsMap[c.id] || {};
    const distWealth = distEff.wealth_modifier || 0;
    total += tierBase + popTax + burgherTrade + craftingBonus + marketBonus + distWealth;
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

    // Load unified civ_identity modifiers (single source of truth for faction bonuses)
    const { data: civIdentity } = await supabase
      .from("civ_identity")
      .select("grain_modifier, wood_modifier, stone_modifier, iron_modifier, wealth_modifier, production_modifier, trade_modifier, stability_modifier, morale_modifier, mobilization_speed, pop_growth_modifier, cavalry_bonus, fortification_bonus, urban_style, society_structure, military_doctrine, economic_focus")
      .eq("session_id", sessionId)
      .eq("player_name", playerName)
      .maybeSingle();
    // Backwards compat: also load old civ_bonuses as fallback
    const { data: civRow } = await supabase
      .from("civilizations")
      .select("civ_bonuses")
      .eq("session_id", sessionId)
      .eq("player_name", playerName)
      .maybeSingle();
    const civBonuses: Record<string, number> = (civRow?.civ_bonuses as Record<string, number>) || {};
    // Effective modifiers: prefer civ_identity, fallback to civBonuses
    const grainMod = civIdentity?.grain_modifier ?? civBonuses.growth_modifier ?? 0;
    const woodMod = civIdentity?.wood_modifier ?? civBonuses.production_modifier ?? 0;
    const stoneMod = civIdentity?.stone_modifier ?? 0;
    const ironMod = civIdentity?.iron_modifier ?? 0;
    const wealthMod = civIdentity?.wealth_modifier ?? civBonuses.trade_modifier ?? 0;

    // Unified multipliers: numeric% + structural% combined additively, then applied once
    const uMult = computeUnifiedMults(civIdentity, grainMod, woodMod, stoneMod, ironMod, wealthMod);

    // Idempotency check
    if (realm.last_processed_turn >= currentTurn) {
      return new Response(JSON.stringify({ 
        ok: true, skipped: true, 
        message: `Turn ${currentTurn} already processed for ${playerName} (Last: ${realm.last_processed_turn})` 
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

    // 2) Load cities + diplomatic pacts
    const [{ data: cities }, { data: rawPacts }] = await Promise.all([
      supabase.from("cities").select("*").eq("session_id", sessionId).eq("owner_player", playerName),
      supabase.from("diplomatic_pacts").select("*").eq("session_id", sessionId)
        .or(`party_a.eq.${playerName},party_b.eq.${playerName}`)
        .in("status", ["active", "expired", "broken"]),
    ]);
    const allPacts: DiplomaticPact[] = (rawPacts || []) as DiplomaticPact[];
    const openBordersBonuses = getOpenBordersBonuses(allPacts, playerName);

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

    // Compute granary/stables capacity from infrastructure + building effects
    const infraGranary = 500 * (infra?.granary_level || 1) * (infra?.granaries_count || 1);
    const buildingGranaryBonus = globalBuildingEffects["granary_capacity"] || 0;
    const granaryCapacity = infraGranary + buildingGranaryBonus;
    const stablesCapacity = 100 * (infra?.stables_level || 1) * (infra?.stables_count || 1);
    if (buildingGranaryBonus > 0) {
      logEntries.push(`Sýpka: základ ${infraGranary} + budovy +${buildingGranaryBonus} = ${granaryCapacity}`);
    }

    // ═══ DISTRICT EFFECTS ═══
    // Load completed districts for all cities and aggregate modifiers
    const { data: completedDistricts } = await supabase
      .from("city_districts")
      .select("city_id, grain_modifier, wealth_modifier, production_modifier, stability_modifier, influence_modifier")
      .eq("session_id", sessionId)
      .eq("status", "completed")
      .in("city_id", myCities.length > 0 ? myCities.map(c => c.id) : ["00000000-0000-0000-0000-000000000000"]);

    const cityDistrictEffects: Record<string, Record<string, number>> = {};
    for (const d of (completedDistricts || [])) {
      if (!cityDistrictEffects[d.city_id]) cityDistrictEffects[d.city_id] = {};
      const eff = cityDistrictEffects[d.city_id];
      eff.grain_modifier = (eff.grain_modifier || 0) + (d.grain_modifier || 0);
      eff.wealth_modifier = (eff.wealth_modifier || 0) + (d.wealth_modifier || 0);
      eff.production_modifier = (eff.production_modifier || 0) + (d.production_modifier || 0);
      eff.stability_modifier = (eff.stability_modifier || 0) + (d.stability_modifier || 0);
      eff.influence_modifier = (eff.influence_modifier || 0) + (d.influence_modifier || 0);
    }

    // ═══ DISTRICT COMPLETION ═══
    const { data: buildingDistricts } = await supabase
      .from("city_districts")
      .select("*")
      .eq("session_id", sessionId)
      .eq("status", "building")
      .in("city_id", myCities.length > 0 ? myCities.map(c => c.id) : ["00000000-0000-0000-0000-000000000000"]);

    for (const d of (buildingDistricts || [])) {
      const finishTurn = (d.build_started_turn || 0) + (d.build_turns || 1);
      if (currentTurn >= finishTurn) {
        await supabase.from("city_districts").update({
          status: "completed",
          completed_turn: currentTurn,
        }).eq("id", d.id);
        const cityName = myCities.find(c => c.id === d.city_id)?.name || "?";
        logEntries.push(`🏘️ Čtvrť "${d.name}" v ${cityName} dokončena!`);
      }
    }

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
    let taxRateModifier = 0;       // % gold income modifier
    let grainRationModifier = 0;   // % grain consumption modifier
    let tradeRestriction = 0;      // % trade income penalty
    const lawEffectsLog: string[] = [];

    for (const law of (activeLaws || [])) {
      const effects = law.structured_effects as any[];
      if (!Array.isArray(effects)) continue;
      for (const eff of effects) {
        if (eff.type === "active_pop_modifier") { activePopModifier += (eff.value || 0); lawEffectsLog.push(`${eff.type}: ${eff.value}`); }
        if (eff.type === "max_mobilization_modifier") { maxMobModifier += (eff.value || 0); lawEffectsLog.push(`${eff.type}: ${eff.value}`); }
        if (eff.type === "tax_rate_percent") { taxRateModifier += (eff.value || 0); lawEffectsLog.push(`tax_rate_percent: ${eff.value}%`); }
        if (eff.type === "grain_ration_modifier") { grainRationModifier += (eff.value || 0); lawEffectsLog.push(`grain_ration: ${eff.value}%`); }
        if (eff.type === "trade_restriction") { tradeRestriction += (eff.value || 0); lawEffectsLog.push(`trade_restriction: ${eff.value}%`); }
      }
    }
    if (lawEffectsLog.length > 0) logEntries.push(`Zákony: ${lawEffectsLog.join(", ")}`);

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
        }).select().single();
        profileMap[city.id] = newProfile;
      }
    }

    let totalGrainProd = 0;
    let totalWoodProd = 0;
    let totalStoneProd = 0;
    let totalIronProd = 0;

    // Per-city production snapshot for DB update
    const cityProdSnapshot: Record<string, { grain: number; wood: number; stone: number; iron: number; special: number }> = {};

    // Buffer for small empires (prevent death spiral)
    if (myCities.length <= 3) {
      totalGrainProd += 10;
      logEntries.push("Malá říše: +10 buffer obilí");
    }

    for (const city of myCities) {
      if (city.status && city.status !== "ok") {
        cityProdSnapshot[city.id] = { grain: 0, wood: 0, stone: 0, iron: 0, special: 0 };
        continue;
      }
      const prof = profileMap[city.id];
      if (!prof) {
        cityProdSnapshot[city.id] = { grain: 0, wood: 0, stone: 0, iron: 0, special: 0 };
        continue;
      }

      const distEff = cityDistrictEffects[city.id] || {};
      const buildEff = cityBuildingEffects[city.id] || {};

      let cityGrain = 0, cityWood = 0, cityStone = 0, cityIron = 0;

      // Grain
      let grain = (prof.base_grain || 0) + (distEff.grain_modifier || 0);
      grain *= uMult.grain;
      grain *= effectiveWorkforceRatio;
      cityGrain = Math.max(0, Math.round(grain));
      totalGrainProd += cityGrain;

      // Wood
      if (prof.produces_wood) {
        let wood = (prof.base_wood || 0);
        wood *= uMult.wood;
        wood *= effectiveWorkforceRatio;
        cityWood = Math.max(0, Math.round(wood));
        totalWoodProd += cityWood;
      }

      // Stone
      const prodConsts = SETTLEMENT_PRODUCTION[city.settlement_level] || SETTLEMENT_PRODUCTION.HAMLET;
      let stone = prodConsts.stone;
      stone *= uMult.stone;
      stone *= effectiveWorkforceRatio;
      cityStone = Math.max(0, Math.round(stone));
      totalStoneProd += cityStone;

      // Iron
      if (prof.special_resource_type === "IRON") {
        let iron = (prof.base_special || 0);
        iron *= uMult.iron;
        iron *= effectiveWorkforceRatio;
        cityIron = Math.max(0, Math.round(iron));
        totalIronProd += cityIron;
      }

      cityProdSnapshot[city.id] = { grain: cityGrain, wood: cityWood, stone: cityStone, iron: cityIron, special: cityIron };

      // Production modifier (general industry)
      if ((prof.production_bonus || 0) > 0 || (distEff.production_modifier || 0) > 0) {
        // Just logged for now
      }
    }

    // 4) Consumption (modified by grain_ration_modifier law)
    const grainRationMult = 1 + (grainRationModifier / 100); // e.g. -10 → 0.9x consumption
    let totalConsumption = 0;
    for (const city of myCities) {
      let consumption = computeGrainConsumption(city);
      consumption = Math.max(1, Math.round(consumption * grainRationMult));
      totalConsumption += consumption;
      const snap = cityProdSnapshot[city.id] || { grain: 0, wood: 0, stone: 0, iron: 0, special: 0 };
      await supabase.from("cities").update({
        last_turn_grain_cons: consumption,
        last_turn_grain_prod: snap.grain,
        last_turn_wood_prod: snap.wood,
        last_turn_stone_prod: snap.stone,
        last_turn_iron_prod: snap.iron,
        last_turn_special_prod: snap.special,
      }).eq("id", city.id);
    }
    if (grainRationModifier !== 0) logEntries.push(`Příděl: spotřeba obilí ${grainRationModifier > 0 ? "+" : ""}${grainRationModifier}% → ×${grainRationMult.toFixed(2)}`);

    // Army Upkeep
    const { data: stacks } = await supabase.from("military_stacks")
      .select("id, army_name, unit_count, maintenance_cost")
      .eq("session_id", sessionId).eq("owner_player", playerName);
    
    let armyFoodUpkeep = 0;
    let armyGoldUpkeep = 0; // Wealth upkeep is separate
    for (const s of (stacks || [])) {
      // 1 gold per 100 men, 1 food per 500 men
      const men = s.unit_count || 0;
      armyGoldUpkeep += Math.ceil(men / 100);
      armyFoodUpkeep += Math.ceil(men / 500);
    }

    // Sport Funding Expense (Gold)
    const sportFundingPct = realm.sport_funding_pct || 0;
    const wealthUpkeep = armyGoldUpkeep; // Base upkeep
    // Sport funding is taken from reserves, handled below

    // 5) Net Calculation
    const netGrain = totalGrainProd - totalConsumption - armyFoodUpkeep;
    let grainReserve = (realm.grain_reserve || 0) + netGrain;
    let famineActive = false;
    let famineCityCount = 0;

    // Famine Check
    if (grainReserve < 0) {
      grainReserve = 0;
      famineActive = true;
      logEntries.push("⚠️ Hladomor! Zásoby obilí vyčerpány.");
      
      // Apply famine effects to cities
      for (const city of myCities) {
        // Famine reduces stability and kills population
        const newStability = Math.max(0, (city.city_stability || 50) - 5);
        const deathToll = Math.floor((city.population_total || 0) * 0.05); // 5% die
        await supabase.from("cities").update({
          city_stability: newStability,
          population_peasants: Math.max(0, (city.population_peasants || 0) - Math.floor(deathToll * 0.8)),
          population_burghers: Math.max(0, (city.population_burghers || 0) - Math.floor(deathToll * 0.2)),
          famine_turn: true,
          famine_consecutive_turns: (city.famine_consecutive_turns || 0) + 1,
        }).eq("id", city.id);
        famineCityCount++;
      }
    } else {
      // Recovery
      for (const city of myCities) {
        if (city.famine_turn) {
          await supabase.from("cities").update({ famine_turn: false, famine_consecutive_turns: 0 }).eq("id", city.id);
        }
      }
    }

    // Cap Granary
    if (grainReserve > granaryCapacity) {
      const lost = grainReserve - granaryCapacity;
      grainReserve = granaryCapacity;
      logEntries.push(`Sýpky plné. ${lost} obilí ztraceno/shnilo.`);
    }

    // 6) Other Resources
    // Wood/Stone/Iron accumulate, no hard cap usually (or high cap)
    // Assume standard storage limits? For now, unlimited or high limit
    let newWoodReserve = (realm.wood_reserve || 0) + totalWoodProd;
    let newStoneReserve = (realm.stone_reserve || 0) + totalStoneProd;
    let newIronReserve = (realm.iron_reserve || 0) + totalIronProd;

    // Wealth — unified multiplier + open borders trade efficiency bonus + tax law modifier
    const openBordersTradeBonus = openBordersBonuses.trade_efficiency_bonus || 0;
    const taxMult = 1 + (taxRateModifier / 100); // e.g. +10 → 1.1x gold income
    const baseWealthIncome = Math.round(computeWealthIncome(myCities, cityDistrictEffects) * uMult.wealth * (1 + openBordersTradeBonus));
    const wealthIncome = Math.max(0, Math.round(baseWealthIncome * taxMult));
    let newGoldReserve = (realm.gold_reserve || 0) + wealthIncome - wealthUpkeep;
    if (taxRateModifier !== 0) logEntries.push(`Daňový zákon: příjem zlata ${taxRateModifier > 0 ? "+" : ""}${taxRateModifier}% (${baseWealthIncome}→${wealthIncome})`);

    // ═══ TRADE ROUTES: Resource transfers + embargo check ═══
    const { data: activeTradeRoutes } = await supabase.from("trade_routes")
      .select("id, from_player, to_player, resource_type, amount_per_turn, return_resource_type, return_amount, gold_per_turn, route_safety")
      .eq("session_id", sessionId).eq("status", "active")
      .or(`from_player.eq.${playerName},to_player.eq.${playerName}`);

    let tradeRouteIncome = 0;
    let tradeGrainDelta = 0;
    let tradeWoodDelta = 0;
    let tradeStoneDelta = 0;
    let tradeIronDelta = 0;

    const resFieldMap: Record<string, string> = {
      gold: "gold", grain: "grain", wood: "wood", stone: "stone", iron: "iron",
    };

    for (const route of (activeTradeRoutes || [])) {
      const otherPlayer = route.from_player === playerName ? route.to_player : route.from_player;
      if (hasActiveEmbargo(allPacts, playerName, otherPlayer)) {
        logEntries.push(`🚫 Obchodní cesta s ${otherPlayer} blokována embargem`);
        continue;
      }

      const pactMod = getTradeEfficiencyModifier(allPacts, playerName, otherPlayer);
      const lawTradeReduction = Math.min(1, tradeRestriction / 100);
      const efficiency = (1 + pactMod) * (1 - lawTradeReduction);
      const safety = (route.route_safety ?? 80) / 100;

      // Legacy gold_per_turn support
      if (route.gold_per_turn && !route.resource_type) {
        const routeIncome = Math.max(0, Math.round((route.gold_per_turn || 0) * efficiency));
        tradeRouteIncome += routeIncome;
        continue;
      }

      const isSender = route.from_player === playerName;
      const isReceiver = route.to_player === playerName;

      // Sender sends resource_type, receives return_resource_type
      // Receiver receives resource_type, sends return_resource_type
      if (isSender) {
        // Pay: resource_type × amount_per_turn
        const sendType = route.resource_type;
        const sendAmt = route.amount_per_turn || 0;
        // Receive: return_resource_type × return_amount (with efficiency & safety)
        const recvType = route.return_resource_type;
        const recvAmt = Math.round((route.return_amount || 0) * efficiency * safety);

        if (sendType && sendAmt > 0) {
          if (sendType === "gold") tradeRouteIncome -= sendAmt;
          else if (sendType === "grain") tradeGrainDelta -= sendAmt;
          else if (sendType === "wood") tradeWoodDelta -= sendAmt;
          else if (sendType === "stone") tradeStoneDelta -= sendAmt;
          else if (sendType === "iron") tradeIronDelta -= sendAmt;
          logEntries.push(`📤 Obchod s ${otherPlayer}: odesláno ${sendAmt}× ${sendType}`);
        }
        if (recvType && recvAmt > 0) {
          if (recvType === "gold") tradeRouteIncome += recvAmt;
          else if (recvType === "grain") tradeGrainDelta += recvAmt;
          else if (recvType === "wood") tradeWoodDelta += recvAmt;
          else if (recvType === "stone") tradeStoneDelta += recvAmt;
          else if (recvType === "iron") tradeIronDelta += recvAmt;
          logEntries.push(`📥 Obchod s ${otherPlayer}: přijato ${recvAmt}× ${recvType}`);
        }
      } else if (isReceiver) {
        // Receive: resource_type (with efficiency & safety)
        const recvType = route.resource_type;
        const recvAmt = Math.round((route.amount_per_turn || 0) * efficiency * safety);
        // Pay: return_resource_type
        const sendType = route.return_resource_type;
        const sendAmt = route.return_amount || 0;

        if (recvType && recvAmt > 0) {
          if (recvType === "gold") tradeRouteIncome += recvAmt;
          else if (recvType === "grain") tradeGrainDelta += recvAmt;
          else if (recvType === "wood") tradeWoodDelta += recvAmt;
          else if (recvType === "stone") tradeStoneDelta += recvAmt;
          else if (recvType === "iron") tradeIronDelta += recvAmt;
          logEntries.push(`📥 Obchod s ${otherPlayer}: přijato ${recvAmt}× ${recvType}`);
        }
        if (sendType && sendAmt > 0) {
          if (sendType === "gold") tradeRouteIncome -= sendAmt;
          else if (sendType === "grain") tradeGrainDelta -= sendAmt;
          else if (sendType === "wood") tradeWoodDelta -= sendAmt;
          else if (sendType === "stone") tradeStoneDelta -= sendAmt;
          else if (sendType === "iron") tradeIronDelta -= sendAmt;
          logEntries.push(`📤 Obchod s ${otherPlayer}: odesláno ${sendAmt}× ${sendType}`);
        }
      }

      if (lawTradeReduction > 0) logEntries.push(`🚫 Obchodní omezení: ${otherPlayer} −${Math.round(lawTradeReduction * 100)}%`);
    }

    // Apply trade deltas to reserves
    newGoldReserve += tradeRouteIncome;
    grainReserve += tradeGrainDelta;
    if (tradeGrainDelta !== 0) logEntries.push(`Obchod obilí: ${tradeGrainDelta > 0 ? "+" : ""}${tradeGrainDelta}`);
    if (tradeRouteIncome !== 0) logEntries.push(`Obchod zlato: ${tradeRouteIncome > 0 ? "+" : ""}${tradeRouteIncome}`);
    
    // Sport Funding (Percent of reserve) → goes to association budgets
    const sportFundingExpense = Math.floor(Math.max(0, newGoldReserve) * (sportFundingPct / 100));
    newGoldReserve -= sportFundingExpense;

    // ═══ ASSOCIATION ECONOMICS (per-turn) ═══
    // Revenue: fan_base income, reputation sponsorship, sport funding
    // Costs: player salaries, team upkeep
    const { data: playerAssocs } = await supabase.from("sports_associations")
      .select("id, budget, fan_base, reputation, association_type, player_name")
      .eq("session_id", sessionId).eq("player_name", playerName);

    if (playerAssocs && playerAssocs.length > 0) {
      // Distribute sport funding proportionally across associations
      const fundingPerAssoc = playerAssocs.length > 0 ? Math.floor(sportFundingExpense / playerAssocs.length) : 0;

      for (const assoc of playerAssocs) {
        // Revenue streams
        const fanIncome = Math.round((assoc.fan_base || 0) * 0.08);     // 0.08 per fan
        const repIncome = Math.round((assoc.reputation || 0) * 0.4);    // 0.4 per reputation
        const fundingIncome = fundingPerAssoc;
        const totalIncome = fanIncome + repIncome + fundingIncome;

        // Costs
        const { data: assocTeams } = await supabase.from("league_teams")
          .select("id").eq("session_id", sessionId).eq("association_id", assoc.id).eq("is_active", true);
        const teamCount = assocTeams?.length || 0;
        const { count: playerCount } = await supabase.from("league_players")
          .select("id", { count: "exact", head: true })
          .in("team_id", (assocTeams || []).map((t: any) => t.id))
          .eq("is_dead", false);
        const salaries = (playerCount || 0) * 2;    // 2 gold per player
        const teamUpkeep = teamCount * 5;            // 5 gold per team
        const totalCosts = salaries + teamUpkeep;

        const netBudget = totalIncome - totalCosts;
        const newBudget = Math.max(0, (assoc.budget || 0) + netBudget);

        // Fan base passive growth from reputation (baseline growth)
        const repFanGrowth = assoc.reputation >= 30 ? Math.floor(assoc.reputation / 30) : 0;
        const newFanBase = (assoc.fan_base || 0) + repFanGrowth;

        await supabase.from("sports_associations").update({
          budget: newBudget,
          fan_base: newFanBase,
        }).eq("id", assoc.id);

        if (netBudget !== 0) {
          logEntries.push(`${assoc.association_type === 'sphaera' ? '⚔️' : assoc.association_type === 'olympic' ? '🏟️' : '💀'} ${assoc.association_type}: příjem ${totalIncome} (fanoušci ${fanIncome}, reputace ${repIncome}, dotace ${fundingIncome}), náklady ${totalCosts} → bilance ${netBudget >= 0 ? '+' : ''}${netBudget}`);
        }
      }
    }

    if (newGoldReserve < 0) newGoldReserve = 0; // Debt? For now floor at 0

    // 6.5) Update Manpower
    // Manpower grows based on population (1% of peasants per turn)
    // Capped by infrastructure (barracks etc? or just pop)
    // Using realm.mobilization_rate for recruitment, here we just replenish the pool
    let manpowerGrowth = 0;
    let totalPopulation = 0;
    for (const c of myCities) {
      totalPopulation += c.population_total || 0;
      manpowerGrowth += Math.floor((c.population_peasants || 0) * 0.015);
    }
    const mobilizationSpeed = civIdentity?.mobilization_speed || 1.0;
    manpowerGrowth = Math.floor(manpowerGrowth * mobilizationSpeed);
    const manpowerPool = (realm.manpower_pool || 0) + manpowerGrowth; // Simple accumulation for now

    // Logistics
    const logisticCapacity = 5 + (infra.roads_level || 0) * 2;

    // 7) Update realm resources
    // Update city factions
    // Simple faction logic: satisfaction drifts towards 50, modified by taxes/ration/events
    const { data: factions } = await supabase.from("city_factions").select("*").in("city_id", cityIds);
    if (factions) {
      for (const f of factions) {
        // Find city
        const city = myCities.find(c => c.id === f.city_id);
        if (!city) continue;
        
        let satDrift = 0;
        let loyDrift = 0;

        // Ration impact
        if (city.ration_policy === "austerity") satDrift -= 2;
        if (city.ration_policy === "elite" && f.faction_type !== "burghers") satDrift -= 1;
        if (city.ration_policy === "extra") satDrift += 2; // hypothetical

        // District impacts on factions
        const distEff = cityDistrictEffects[city.id] || {};
        // Map faction type to district attr (peasants -> peasant_attraction?)
        // Actually distEff has no direct faction mapping in this scope, assume generic satisfaction from stability
        // distEff.stability_modifier
        if ((distEff.stability_modifier || 0) > 0) satDrift += 1;

        // Specific district attraction -> satisfaction
        // We aggregated modifiers, not raw attractions. 
        // Let's use simple logic: if city has 'theater' (cultural), burghers happy. 
        // This requires loading tags. Simplified for now.
        const attrKey = f.faction_type === "peasants" ? "peasant_attraction" : 
                        f.faction_type === "burghers" ? "burgher_attraction" :
                        f.faction_type === "clergy" ? "cleric_attraction" : "military_attraction";
        
        // Check if district effects have this key (they don't in current SELECT). 
        // Skip detailed attraction logic for this optimization pass.
        if (typeof distEff[attrKey] === "number" && distEff[attrKey] > 0) {
          satDrift += Math.min(5, Math.round(distEff[attrKey] / 2));
        }

        // Labor allocation impact
        const labor = (city.labor_allocation && typeof city.labor_allocation === "object") ? city.labor_allocation : {};
        if (f.faction_type === "peasants") {
          satDrift += (labor.farming || 0) > 50 ? 2 : (labor.farming || 0) < 30 ? -3 : 0;
        } else if (f.faction_type === "burghers") {
          satDrift += (labor.crafting || 0) > 30 ? 2 : (labor.crafting || 0) < 15 ? -2 : 0;
        } else if (f.faction_type === "clergy") {
          satDrift += (labor.scribes || 0) > 10 ? 2 : -1;
          satDrift += (city.temple_level || 0) >= 3 ? 2 : 0;
        } else if (f.faction_type === "military") {
          const garrison = city.military_garrison || 0;
          satDrift += garrison > 100 ? 2 : garrison < 20 ? -3 : 0;
        }

        // Stability-based loyalty drift
        loyDrift += city.city_stability > 60 ? 1 : city.city_stability < 30 ? -3 : 0;

        // Clamp
        const newSat = Math.max(0, Math.min(100, (f.satisfaction || 50) + satDrift));
        const newLoy = Math.max(0, Math.min(100, (f.loyalty || 50) + loyDrift));

        // Demand generation: if satisfaction drops below 35, generate a demand
        let newDemand = f.current_demand;
        let newUrgency = f.demand_urgency || 0;
        if (newSat < 35 && !f.current_demand) {
          const demands: Record<string, string[]> = {
            peasants: ["Víc obilí pro lid!", "Snížit daně!", "Otevřít sýpky!"],
            burghers: ["Investovat do tržiště!", "Více stavebních projektů!", "Podpora obchodu!"],
            clergy: ["Stavba chrámu!", "Více písařů!", "Oběť bohům!"],
            military: ["Vyzbrojit posádku!", "Zvýšit žold!", "Nová kasárna!"],
          };
          const options = demands[f.faction_type] || ["Požadujeme změnu!"];
          const pick = (currentTurn + hashCode(f.id)) % options.length;
          newDemand = options[pick];
          newUrgency = 1;
        } else if (f.current_demand) {
          if (newSat >= 50) {
            // Demand resolved naturally
            newDemand = null;
            newUrgency = 0;
          } else {
            newUrgency = Math.min(10, (f.demand_urgency || 0) + 1);
          }
        }

        // Update faction power from demographics
        const pop = city.population_total || 1;
        let newPower = f.power;
        if (f.faction_type === "peasants") newPower = Math.round(((city.population_peasants || 0) / pop) * 40);
        else if (f.faction_type === "burghers") newPower = Math.round(((city.population_burghers || 0) / pop) * 40);
        else if (f.faction_type === "clergy") newPower = Math.round(((city.population_clerics || 0) / pop) * 40);
        else if (f.faction_type === "military") newPower = Math.min(20, Math.round((city.military_garrison || 0) / 50));

        await supabase.from("city_factions").update({
          satisfaction: newSat,
          loyalty: newLoy,
          power: newPower,
          current_demand: newDemand,
          demand_urgency: newUrgency,
        }).eq("id", f.id);
      }
    }

    // ═══ SPORT & ACADEMY ═══
    // Auto-generation removed — academies and associations are player-created only.
    // Sport funding expense is still deducted from gold above.

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
      wealth: wealthIncome,
    };
    const upkeeps: Record<string, number> = {
      food: totalConsumption + armyFoodUpkeep,
      wood: 0,
      stone: 0,
      iron: 0,
      wealth: wealthUpkeep + sportFundingExpense,
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
        sport_funding_expense: sportFundingExpense,
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
        lawEffects: { taxRateModifier, grainRationModifier, tradeRestriction, activePopModifier, maxMobModifier },
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
