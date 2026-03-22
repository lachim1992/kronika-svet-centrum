import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { computeStructuralBonuses, getOpenBordersBonuses, hasActiveEmbargo, getTradeEfficiencyModifier, type DiplomaticPact } from "../_shared/physics.ts";

/**
 * process-turn v2: MACRO FLOW ECONOMY
 *
 * Production / Wealth / Capacity are computed by compute-economy-flow (world-tick step 12f).
 * This function reads those totals and handles:
 * - Building & district completion
 * - Population demand vs production flow → famine
 * - Wealth accumulation (from flow) minus upkeep
 * - Capacity → logistics & army limits
 * - Trade routes (simplified flow adjustments)
 * - Faction satisfaction
 * - Associations economics
 * - Manpower growth
 */

// --- Population demand: how much "production flow" a population needs ---
const DEMAND_PER_CAPITA = {
  peasants: 0.005,
  burghers: 0.010,
  clerics: 0.008,
};
const DEMAND_PER_CAPITA_FLAT = 0.006;

const RATION_DEMAND_MULT: Record<string, number> = {
  equal: 1.0,
  elite: 0.95,
  austerity: 0.80,
  sacrifice: 1.15,
};

function computeProductionDemand(city: any): number {
  const peas = city.population_peasants || 0;
  const burg = city.population_burghers || 0;
  const cler = city.population_clerics || 0;
  const rationMult = RATION_DEMAND_MULT[city.ration_policy] || 1.0;
  if (peas + burg + cler > 0) {
    return Math.round(
      (peas * DEMAND_PER_CAPITA.peasants +
       burg * DEMAND_PER_CAPITA.burghers +
       cler * DEMAND_PER_CAPITA.clerics) * rationMult
    );
  }
  return Math.round((city.population_total || 0) * DEMAND_PER_CAPITA_FLAT * rationMult);
}

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

    // ── Load realm resources (contains macro totals from flow engine) ──
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

    const { data: session } = await supabase.from("game_sessions").select("current_turn").eq("id", sessionId).single();
    const currentTurn = session?.current_turn || 1;

    // Idempotency
    if (realm.last_processed_turn >= currentTurn) {
      return new Response(JSON.stringify({
        ok: true, skipped: true,
        message: `Turn ${currentTurn} already processed for ${playerName}`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const logEntries: string[] = [];

    // ── MACRO FLOW TOTALS (from compute-economy-flow) ──
    const totalProduction = realm.total_production || 0;
    const totalWealth = realm.total_wealth || 0;
    const totalCapacity = realm.total_capacity || 0;
    const totalImportance = realm.total_importance || 0;
    logEntries.push(`⚒️ Produkce: ${totalProduction.toFixed(1)} | 💰 Bohatství: ${totalWealth.toFixed(1)} | 🏛️ Kapacita: ${totalCapacity.toFixed(1)}`);

    // ── Load cities ──
    const { data: cities } = await supabase.from("cities").select("*")
      .eq("session_id", sessionId).eq("owner_player", playerName);
    const myCities = cities || [];
    const cityIds = myCities.map(c => c.id);

    // ── Load infrastructure ──
    let { data: infra } = await supabase.from("realm_infrastructure").select("*")
      .eq("session_id", sessionId).eq("player_name", playerName).maybeSingle();
    if (!infra) {
      const { data: newInfra } = await supabase.from("realm_infrastructure").insert({
        session_id: sessionId, player_name: playerName,
      }).select().single();
      infra = newInfra;
    }

    // ── Load civ identity for structural bonuses ──
    const { data: civIdentity } = await supabase.from("civ_identity")
      .select("mobilization_speed, cavalry_bonus, fortification_bonus")
      .eq("session_id", sessionId).eq("player_name", playerName).maybeSingle();

    // ══════════════════════════════════════════
    // BUILDING COMPLETION
    // ══════════════════════════════════════════
    const { data: allBuildings } = await supabase.from("city_buildings").select("*")
      .eq("session_id", sessionId).eq("status", "building")
      .in("city_id", cityIds.length > 0 ? cityIds : ["00000000-0000-0000-0000-000000000000"]);

    let completedCount = 0;
    for (const b of (allBuildings || [])) {
      const finishTurn = (b.build_started_turn || 0) + (b.build_duration || 1);
      if (currentTurn >= finishTurn) {
        await supabase.from("city_buildings").update({ status: "completed", completed_turn: currentTurn }).eq("id", b.id);
        completedCount++;
        const cityName = myCities.find(c => c.id === b.city_id)?.name || "?";
        logEntries.push(`🏗️ Stavba "${b.name}" v ${cityName} dokončena!`);
      }
    }

    // ══════════════════════════════════════════
    // BUILDING EFFECTS (aggregate)
    // ══════════════════════════════════════════
    const { data: completedBuildings } = await supabase.from("city_buildings")
      .select("city_id, effects").eq("session_id", sessionId).eq("status", "completed")
      .in("city_id", cityIds.length > 0 ? cityIds : ["00000000-0000-0000-0000-000000000000"]);

    const globalBuildingEffects: Record<string, number> = {};
    for (const b of (completedBuildings || [])) {
      const eff = b.effects as Record<string, number> | null;
      if (!eff) continue;
      for (const [k, v] of Object.entries(eff)) {
        if (typeof v !== "number") continue;
        globalBuildingEffects[k] = (globalBuildingEffects[k] || 0) + v;
      }
    }

    // Granary capacity (still relevant as production buffer)
    const infraGranary = 500 * (infra?.granary_level || 1) * (infra?.granaries_count || 1);
    const buildingGranaryBonus = globalBuildingEffects["granary_capacity"] || 0;
    const granaryCapacity = infraGranary + buildingGranaryBonus;

    // ══════════════════════════════════════════
    // DISTRICT COMPLETION
    // ══════════════════════════════════════════
    const { data: buildingDistricts } = await supabase.from("city_districts").select("*")
      .eq("session_id", sessionId).eq("status", "building")
      .in("city_id", cityIds.length > 0 ? cityIds : ["00000000-0000-0000-0000-000000000000"]);

    for (const d of (buildingDistricts || [])) {
      const finishTurn = (d.build_started_turn || 0) + (d.build_turns || 1);
      if (currentTurn >= finishTurn) {
        await supabase.from("city_districts").update({ status: "completed", completed_turn: currentTurn }).eq("id", d.id);
        const cityName = myCities.find(c => c.id === d.city_id)?.name || "?";
        logEntries.push(`🏘️ Čtvrť "${d.name}" v ${cityName} dokončena!`);
      }
    }

    // ══════════════════════════════════════════
    // DISTRICT EFFECTS
    // ══════════════════════════════════════════
    const { data: completedDistricts } = await supabase.from("city_districts")
      .select("city_id, stability_modifier")
      .eq("session_id", sessionId).eq("status", "completed")
      .in("city_id", cityIds.length > 0 ? cityIds : ["00000000-0000-0000-0000-000000000000"]);

    const cityDistrictEffects: Record<string, Record<string, number>> = {};
    for (const d of (completedDistricts || [])) {
      if (!cityDistrictEffects[d.city_id]) cityDistrictEffects[d.city_id] = {};
      cityDistrictEffects[d.city_id].stability_modifier =
        (cityDistrictEffects[d.city_id].stability_modifier || 0) + (d.stability_modifier || 0);
    }

    // ══════════════════════════════════════════
    // LAW EFFECTS
    // ══════════════════════════════════════════
    const { data: activeLaws } = await supabase.from("laws").select("structured_effects")
      .eq("session_id", sessionId).eq("player_name", playerName).eq("is_active", true);

    let activePopModifier = 0;
    let maxMobModifier = 0;
    let taxRateModifier = 0;
    let grainRationModifier = 0;
    let tradeRestriction = 0;

    for (const law of (activeLaws || [])) {
      const effects = law.structured_effects as any[];
      if (!Array.isArray(effects)) continue;
      for (const eff of effects) {
        if (eff.type === "active_pop_modifier") activePopModifier += (eff.value || 0);
        if (eff.type === "max_mobilization_modifier") maxMobModifier += (eff.value || 0);
        if (eff.type === "tax_rate_percent") taxRateModifier += (eff.value || 0);
        if (eff.type === "grain_ration_modifier") grainRationModifier += (eff.value || 0);
        if (eff.type === "trade_restriction") tradeRestriction += (eff.value || 0);
      }
    }

    // ══════════════════════════════════════════
    // WORKFORCE (still needed for mobilization/manpower)
    // ══════════════════════════════════════════
    const ACTIVE_POP_WEIGHTS = { peasants: 1.0, burghers: 0.7, clerics: 0.2 };
    let activePopRaw = 0;
    let totalPopulation = 0;
    for (const city of myCities) {
      if (city.status && city.status !== "ok") continue;
      totalPopulation += city.population_total || 0;
      activePopRaw += (city.population_peasants || 0) * ACTIVE_POP_WEIGHTS.peasants
                    + (city.population_burghers || 0) * ACTIVE_POP_WEIGHTS.burghers
                    + (city.population_clerics || 0) * ACTIVE_POP_WEIGHTS.clerics;
    }
    activePopRaw = Math.floor(activePopRaw);
    const effectiveRatio = Math.max(0.1, Math.min(0.9, 0.5 + activePopModifier));
    const effectiveActivePop = Math.floor(activePopRaw * effectiveRatio);
    const maxMob = Math.max(0.05, Math.min(0.5, 0.3 + maxMobModifier));
    const mobRate = realm.mobilization_rate || 0.1;
    const mobilized = Math.floor(effectiveActivePop * mobRate);
    const workforce = effectiveActivePop - mobilized;
    const workforceRatio = effectiveActivePop > 0 ? workforce / effectiveActivePop : 1;

    // ══════════════════════════════════════════
    // PRODUCTION vs DEMAND → FAMINE CHECK
    // Production comes from flow engine (total_production on realm_resources)
    // Demand comes from population needs
    // ══════════════════════════════════════════
    let totalDemand = 0;
    const grainRationMult = 1 + (grainRationModifier / 100);
    for (const city of myCities) {
      totalDemand += Math.max(1, Math.round(computeProductionDemand(city) * grainRationMult));
    }

    // Army upkeep in production terms
    const { data: stacks } = await supabase.from("military_stacks")
      .select("id, unit_count, maintenance_cost")
      .eq("session_id", sessionId).eq("owner_player", playerName);

    let armyProductionUpkeep = 0;
    let armyWealthUpkeep = 0;
    for (const s of (stacks || [])) {
      const men = s.unit_count || 0;
      armyProductionUpkeep += Math.ceil(men / 500); // food equivalent
      armyWealthUpkeep += Math.ceil(men / 100); // gold equivalent
    }

    const netProduction = totalProduction - totalDemand - armyProductionUpkeep;
    // Small empire buffer
    const buffer = myCities.length <= 3 ? 10 : 0;

    // Grain reserve acts as "production buffer" — surplus accumulates, deficit drains
    let grainReserve = (realm.grain_reserve || 0) + netProduction + buffer;
    let famineActive = false;
    let famineCityCount = 0;

    if (grainReserve < 0) {
      grainReserve = 0;
      famineActive = true;
      logEntries.push("⚠️ Hladomor! Produkční tok nestačí na pokrytí spotřeby.");
      for (const city of myCities) {
        const newStability = Math.max(0, (city.city_stability || 50) - 5);
        const deathToll = Math.floor((city.population_total || 0) * 0.05);
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
      for (const city of myCities) {
        if (city.famine_turn) {
          await supabase.from("cities").update({ famine_turn: false, famine_consecutive_turns: 0 }).eq("id", city.id);
        }
      }
    }

    // Cap production buffer
    if (grainReserve > granaryCapacity) {
      grainReserve = granaryCapacity;
    }

    // ══════════════════════════════════════════
    // WEALTH ACCUMULATION
    // Wealth income from flow engine + law modifiers
    // ══════════════════════════════════════════
    const taxMult = 1 + (taxRateModifier / 100);
    const wealthIncome = Math.max(0, Math.round(totalWealth * taxMult));
    const sportFundingPct = realm.sport_funding_pct || 0;
    let newGoldReserve = (realm.gold_reserve || 0) + wealthIncome - armyWealthUpkeep;

    // ══════════════════════════════════════════
    // TRADE ROUTES (simplified — wealth adjustments only)
    // ══════════════════════════════════════════
    const { data: rawPacts } = await supabase.from("diplomatic_pacts").select("*")
      .eq("session_id", sessionId)
      .or(`party_a.eq.${playerName},party_b.eq.${playerName}`)
      .in("status", ["active", "expired", "broken"]);
    const allPacts: DiplomaticPact[] = (rawPacts || []) as DiplomaticPact[];

    const { data: activeTradeRoutes } = await supabase.from("trade_routes")
      .select("id, from_player, to_player, resource_type, amount_per_turn, return_resource_type, return_amount, gold_per_turn, route_safety")
      .eq("session_id", sessionId).eq("status", "active")
      .or(`from_player.eq.${playerName},to_player.eq.${playerName}`);

    let tradeGoldDelta = 0;
    for (const route of (activeTradeRoutes || [])) {
      const otherPlayer = route.from_player === playerName ? route.to_player : route.from_player;
      if (hasActiveEmbargo(allPacts, playerName, otherPlayer)) {
        logEntries.push(`🚫 Obchod s ${otherPlayer} blokován embargem`);
        continue;
      }
      const pactMod = getTradeEfficiencyModifier(allPacts, playerName, otherPlayer);
      const lawTradeReduction = Math.min(1, tradeRestriction / 100);
      const efficiency = (1 + pactMod) * (1 - lawTradeReduction);
      const safety = (route.route_safety ?? 80) / 100;

      // All trade routes now exchange wealth (gold)
      if (route.gold_per_turn) {
        tradeGoldDelta += Math.round((route.gold_per_turn || 0) * efficiency);
      }
      // Resource-based routes convert to wealth equivalent
      const isSender = route.from_player === playerName;
      if (route.resource_type && route.amount_per_turn) {
        const amt = route.amount_per_turn || 0;
        if (isSender) {
          // Sending costs wealth (production diverted)
          tradeGoldDelta -= Math.round(amt * 0.5);
          // Receiving return
          const recvAmt = Math.round((route.return_amount || 0) * efficiency * safety);
          tradeGoldDelta += Math.round(recvAmt * 0.5);
        } else {
          // Receiving goods adds wealth
          tradeGoldDelta += Math.round(amt * efficiency * safety * 0.5);
          // Sending return costs wealth
          tradeGoldDelta -= Math.round((route.return_amount || 0) * 0.5);
        }
      }
    }
    newGoldReserve += tradeGoldDelta;
    if (tradeGoldDelta !== 0) logEntries.push(`Obchod: ${tradeGoldDelta >= 0 ? "+" : ""}${tradeGoldDelta} zlata`);

    // Sport Funding
    const sportFundingExpense = Math.floor(Math.max(0, newGoldReserve) * (sportFundingPct / 100));
    newGoldReserve -= sportFundingExpense;

    // ══════════════════════════════════════════
    // ASSOCIATION ECONOMICS (per-turn)
    // ══════════════════════════════════════════
    const { data: playerAssocs } = await supabase.from("sports_associations")
      .select("id, budget, fan_base, reputation, association_type, player_name")
      .eq("session_id", sessionId).eq("player_name", playerName);

    if (playerAssocs && playerAssocs.length > 0) {
      const fundingPerAssoc = Math.floor(sportFundingExpense / playerAssocs.length);
      for (const assoc of playerAssocs) {
        const fanIncome = Math.round((assoc.fan_base || 0) * 0.08);
        const repIncome = Math.round((assoc.reputation || 0) * 0.4);
        const totalIncome = fanIncome + repIncome + fundingPerAssoc;

        const { data: assocTeams } = await supabase.from("league_teams")
          .select("id").eq("session_id", sessionId).eq("association_id", assoc.id).eq("is_active", true);
        const teamCount = assocTeams?.length || 0;
        const { count: playerCount } = await supabase.from("league_players")
          .select("id", { count: "exact", head: true })
          .in("team_id", (assocTeams || []).map((t: any) => t.id))
          .eq("is_dead", false);
        const totalCosts = (playerCount || 0) * 2 + teamCount * 5;
        const netBudget = totalIncome - totalCosts;
        const newBudget = Math.max(0, (assoc.budget || 0) + netBudget);
        const repFanGrowth = assoc.reputation >= 30 ? Math.floor(assoc.reputation / 30) : 0;

        await supabase.from("sports_associations").update({
          budget: newBudget,
          fan_base: (assoc.fan_base || 0) + repFanGrowth,
        }).eq("id", assoc.id);
      }
    }

    if (newGoldReserve < 0) newGoldReserve = 0;

    // ══════════════════════════════════════════
    // MANPOWER
    // ══════════════════════════════════════════
    let manpowerGrowth = 0;
    for (const c of myCities) {
      manpowerGrowth += Math.floor((c.population_peasants || 0) * 0.015);
    }
    const mobilizationSpeed = civIdentity?.mobilization_speed || 1.0;
    manpowerGrowth = Math.floor(manpowerGrowth * mobilizationSpeed);
    const manpowerPool = (realm.manpower_pool || 0) + manpowerGrowth;

    // ══════════════════════════════════════════
    // CAPACITY → LOGISTICS
    // ══════════════════════════════════════════
    // Capacity from flow engine determines logistic capacity
    const logisticCapacity = Math.max(5, Math.round(totalCapacity * 2) + (infra?.roads_level || 0) * 2);

    // ══════════════════════════════════════════
    // FACTION SATISFACTION
    // ══════════════════════════════════════════
    const { data: factions } = await supabase.from("city_factions").select("*").in("city_id", cityIds.length > 0 ? cityIds : ["00000000-0000-0000-0000-000000000000"]);
    if (factions) {
      for (const f of factions) {
        const city = myCities.find(c => c.id === f.city_id);
        if (!city) continue;

        let satDrift = 0;
        let loyDrift = 0;

        if (city.ration_policy === "austerity") satDrift -= 2;
        if (city.ration_policy === "elite" && f.faction_type !== "burghers") satDrift -= 1;

        const distEff = cityDistrictEffects[city.id] || {};
        if ((distEff.stability_modifier || 0) > 0) satDrift += 1;

        const labor = (city.labor_allocation && typeof city.labor_allocation === "object") ? city.labor_allocation : {} as any;
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

        // Production flow bonus: high production → factions happier
        if (totalProduction > totalDemand * 1.5) satDrift += 2;
        else if (famineActive) satDrift -= 5;

        loyDrift += city.city_stability > 60 ? 1 : city.city_stability < 30 ? -3 : 0;

        const newSat = Math.max(0, Math.min(100, (f.satisfaction || 50) + satDrift));
        const newLoy = Math.max(0, Math.min(100, (f.loyalty || 50) + loyDrift));

        let newDemand = f.current_demand;
        let newUrgency = f.demand_urgency || 0;
        if (newSat < 35 && !f.current_demand) {
          const demands: Record<string, string[]> = {
            peasants: ["Víc jídla pro lid!", "Snížit daně!", "Otevřít sýpky!"],
            burghers: ["Investovat do tržiště!", "Více stavebních projektů!", "Podpora obchodu!"],
            clergy: ["Stavba chrámu!", "Více písařů!", "Oběť bohům!"],
            military: ["Vyzbrojit posádku!", "Zvýšit žold!", "Nová kasárna!"],
          };
          const options = demands[f.faction_type] || ["Požadujeme změnu!"];
          newDemand = options[(currentTurn + hashCode(f.id)) % options.length];
          newUrgency = 1;
        } else if (f.current_demand) {
          if (newSat >= 50) { newDemand = null; newUrgency = 0; }
          else newUrgency = Math.min(10, (f.demand_urgency || 0) + 1);
        }

        const pop = city.population_total || 1;
        let newPower = f.power;
        if (f.faction_type === "peasants") newPower = Math.round(((city.population_peasants || 0) / pop) * 40);
        else if (f.faction_type === "burghers") newPower = Math.round(((city.population_burghers || 0) / pop) * 40);
        else if (f.faction_type === "clergy") newPower = Math.round(((city.population_clerics || 0) / pop) * 40);
        else if (f.faction_type === "military") newPower = Math.min(20, Math.round((city.military_garrison || 0) / 50));

        await supabase.from("city_factions").update({
          satisfaction: newSat, loyalty: newLoy, power: newPower,
          current_demand: newDemand, demand_urgency: newUrgency,
        }).eq("id", f.id);
      }
    }

    // ══════════════════════════════════════════
    // UPDATE REALM RESOURCES
    // ══════════════════════════════════════════
    await supabase.from("realm_resources").update({
      grain_reserve: grainReserve,
      granary_capacity: granaryCapacity,
      manpower_pool: manpowerPool,
      logistic_capacity: logisticCapacity,
      last_processed_turn: currentTurn,
      // Legacy fields — derived from macro layers for backward compat
      last_turn_grain_prod: Math.round(totalProduction),
      last_turn_grain_cons: totalDemand,
      last_turn_grain_net: Math.round(netProduction),
      last_turn_wood_prod: 0,
      last_turn_stone_prod: 0,
      last_turn_iron_prod: 0,
      gold_reserve: newGoldReserve,
      famine_city_count: famineCityCount,
      updated_at: new Date().toISOString(),
    }).eq("id", realm.id);

    // ══════════════════════════════════════════
    // UPDATE PLAYER_RESOURCES (backward compat)
    // ══════════════════════════════════════════
    const resourceUpdates = [
      { type: "food", income: Math.round(totalProduction), upkeep: totalDemand + armyProductionUpkeep },
      { type: "wealth", income: wealthIncome, upkeep: armyWealthUpkeep + sportFundingExpense },
    ];
    for (const ru of resourceUpdates) {
      const { data: existing } = await supabase.from("player_resources")
        .update({ income: ru.income, upkeep: ru.upkeep, updated_at: new Date().toISOString() })
        .eq("session_id", sessionId).eq("player_name", playerName).eq("resource_type", ru.type)
        .select("id, stockpile, last_applied_turn");
      if (!existing || existing.length === 0) {
        await supabase.from("player_resources").insert({
          session_id: sessionId, player_name: playerName,
          resource_type: ru.type, income: ru.income, upkeep: ru.upkeep, stockpile: 0, last_applied_turn: 0,
        });
      }
    }

    // Apply stockpile (idempotent via last_applied_turn)
    const { data: allResources } = await supabase.from("player_resources").select("*")
      .eq("session_id", sessionId).eq("player_name", playerName);
    for (const res of (allResources || [])) {
      if (res.last_applied_turn >= currentTurn) continue;
      let newStockpile: number;
      if (res.resource_type === "wealth") newStockpile = newGoldReserve;
      else newStockpile = Math.max(0, (res.stockpile || 0) + (res.income || 0) - (res.upkeep || 0));
      await supabase.from("player_resources").update({
        stockpile: newStockpile, last_applied_turn: currentTurn, updated_at: new Date().toISOString(),
      }).eq("id", res.id);
    }

    // ══════════════════════════════════════════
    // LOG
    // ══════════════════════════════════════════
    await supabase.from("world_action_log").insert({
      session_id: sessionId, turn_number: currentTurn, player_name: playerName,
      action_type: "turn_processing",
      description: `Kolo ${currentTurn}: ⚒️${totalProduction.toFixed(0)} 💰${totalWealth.toFixed(0)} 🏛️${totalCapacity.toFixed(0)} | pop ${totalPopulation} | manpower ${manpowerPool}`,
      metadata: {
        total_production: totalProduction,
        total_wealth: totalWealth,
        total_capacity: totalCapacity,
        total_importance: totalImportance,
        demand: totalDemand,
        net_production: netProduction,
        grain_reserve: grainReserve,
        gold_reserve: newGoldReserve,
        manpower_pool: manpowerPool,
        famine_active: famineActive,
        workforce_ratio: workforceRatio,
      },
    });

    return new Response(JSON.stringify({
      ok: true, turn: currentTurn,
      summary: {
        totalProduction, totalWealth, totalCapacity, totalImportance,
        demand: totalDemand, netProduction,
        grainReserve, granaryCapacity,
        goldReserve: newGoldReserve,
        manpowerPool, logisticCapacity, totalPopulation,
        famineActive, famineCityCount,
        lawEffects: { taxRateModifier, grainRationModifier, tradeRestriction },
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
