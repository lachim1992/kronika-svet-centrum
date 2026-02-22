import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ===== CONSTANTS =====
// Scale factor: 1 food unit feeds ~100 population per turn
const POP_TO_FOOD_DIVISOR = 100;
// Class-based consumption weights (per 100 pop)
const CONS_WEIGHT_PEASANT = 0.8;
const CONS_WEIGHT_BURGHER = 1.2;
const CONS_WEIGHT_CLERIC = 1.0;
// Base production per city (fallback when no settlement_resource_profiles)
const BASE_GRAIN_PER_CITY = 30;
const BASE_WOOD_PER_CITY = 5;
// Max net change cap per resource per tick (prevents exponential collapse)
const MAX_NET_CHANGE = 200;
// Floor: resources cannot drop below this
const RESOURCE_FLOOR = 0;
// Stability penalty when food hits zero
const FAMINE_STABILITY_PENALTY = 5;
// Population loss rate when starving (fraction per turn)
const FAMINE_POP_LOSS_RATE = 0.02;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, player_name } = await req.json();
    if (!session_id || !player_name) {
      return new Response(JSON.stringify({ error: "session_id and player_name required" }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1) Load session to get current turn
    const { data: session } = await supabase.from("game_sessions").select("current_turn")
      .eq("id", session_id).single();
    const currentTurn = session?.current_turn ?? 1;

    // 2) Load player's cities
    const { data: cities } = await supabase.from("cities").select("*")
      .eq("session_id", session_id).ilike("owner_player", player_name);
    if (!cities || cities.length === 0) {
      return new Response(JSON.stringify({ error: "No cities found" }), { status: 404, headers: corsHeaders });
    }

    const cityIds = cities.map(c => c.id);

    // 3) Load settlement resource profiles (may be empty)
    const { data: profiles } = await supabase.from("settlement_resource_profiles").select("*")
      .in("city_id", cityIds);
    const profileMap: Record<string, any> = {};
    for (const p of (profiles || [])) profileMap[p.city_id] = p;

    // 4) Load military stacks for upkeep
    const { data: stacks } = await supabase.from("military_stacks")
      .select("*, military_stack_composition(*)")
      .eq("session_id", session_id).ilike("player_name", player_name).eq("is_active", true);

    // 5) Load realm_resources
    const { data: realm } = await supabase.from("realm_resources").select("*")
      .eq("session_id", session_id).ilike("player_name", player_name).maybeSingle();

    // ===== PRODUCTION (per city, then sum) =====
    let totalGrainProd = 0, totalWoodProd = 0, totalStoneProd = 0, totalIronProd = 0;

    for (const city of cities) {
      const prof = profileMap[city.id];
      let cityGrain: number, cityWood: number, cityStone = 0, cityIron = 0;

      if (prof) {
        // Use profile data
        cityGrain = prof.base_grain ?? BASE_GRAIN_PER_CITY;
        cityWood = prof.produces_wood ? (prof.base_wood ?? BASE_WOOD_PER_CITY) : 0;
        if (prof.special_resource_type === "STONE") cityStone = prof.base_special ?? 0;
        if (prof.special_resource_type === "IRON") cityIron = prof.base_special ?? 0;
      } else {
        // Fallback: derive from city stats
        const devLevel = city.development_level ?? 1;
        const popFactor = Math.max(1, Math.floor((city.population_total ?? 1000) / 1000));
        cityGrain = BASE_GRAIN_PER_CITY * devLevel;
        cityWood = BASE_WOOD_PER_CITY * popFactor;
        // Special resources from city column
        if (city.special_resource_type === "STONE") cityStone = 3 * devLevel;
        if (city.special_resource_type === "IRON") cityIron = 2 * devLevel;
      }

      totalGrainProd += cityGrain;
      totalWoodProd += cityWood;
      totalStoneProd += cityStone;
      totalIronProd += cityIron;

      // Cache on city
      await supabase.from("cities").update({
        last_turn_grain_prod: cityGrain,
        last_turn_wood_prod: cityWood,
        last_turn_special_prod: cityStone + cityIron,
      }).eq("id", city.id);
    }

    // ===== CONSUMPTION (per city population, scaled) =====
    let totalGrainCons = 0;
    for (const city of cities) {
      const peas = city.population_peasants ?? 0;
      const burg = city.population_burghers ?? 0;
      const cler = city.population_clerics ?? 0;
      const totalPop = peas + burg + cler;

      // Scaled: divide by POP_TO_FOOD_DIVISOR so 1000 pop ≈ 10 food
      const cons = totalPop > 0
        ? Math.round((peas * CONS_WEIGHT_PEASANT + burg * CONS_WEIGHT_BURGHER + cler * CONS_WEIGHT_CLERIC) / POP_TO_FOOD_DIVISOR)
        : Math.round((city.population_total ?? 1000) / POP_TO_FOOD_DIVISOR);

      totalGrainCons += cons;
      await supabase.from("cities").update({ last_turn_grain_cons: cons }).eq("id", city.id);
    }

    // Military food upkeep: 1 food per 500 troops
    let militaryFoodUpkeep = 0;
    let militaryIronUpkeep = 0;
    for (const stack of (stacks || [])) {
      const totalManpower = (stack.military_stack_composition || [])
        .reduce((sum: number, c: any) => sum + (c.manpower ?? 0), 0);
      militaryFoodUpkeep += Math.ceil(totalManpower / 500);
      militaryIronUpkeep += Math.ceil(totalManpower / 2000);
    }
    totalGrainCons += militaryFoodUpkeep;

    // ===== NET CALCULATION WITH CAP =====
    const rawNetGrain = totalGrainProd - totalGrainCons;
    const rawNetWood = totalWoodProd;
    const rawNetStone = totalStoneProd;
    const rawNetIron = totalIronProd - militaryIronUpkeep;

    const netGrain = Math.max(-MAX_NET_CHANGE, Math.min(MAX_NET_CHANGE, rawNetGrain));
    const netWood = Math.max(-MAX_NET_CHANGE, Math.min(MAX_NET_CHANGE, rawNetWood));
    const netStone = Math.max(-MAX_NET_CHANGE, Math.min(MAX_NET_CHANGE, rawNetStone));
    const netIron = Math.max(-MAX_NET_CHANGE, Math.min(MAX_NET_CHANGE, rawNetIron));

    // ===== APPLY TO STOCKPILE =====
    // Load current stockpiles from player_resources
    const { data: currentResources } = await supabase.from("player_resources").select("*")
      .eq("session_id", session_id).ilike("player_name", player_name);

    const resMap: Record<string, any> = {};
    for (const r of (currentResources || [])) resMap[r.resource_type] = r;

    const resourceUpdates = [
      { type: "food", income: totalGrainProd, upkeep: totalGrainCons, net: netGrain },
      { type: "wood", income: totalWoodProd, upkeep: 0, net: netWood },
      { type: "stone", income: totalStoneProd, upkeep: 0, net: netStone },
      { type: "iron", income: totalIronProd, upkeep: militaryIronUpkeep, net: netIron },
    ];

    const appliedStockpiles: Record<string, number> = {};

    for (const ru of resourceUpdates) {
      const existing = resMap[ru.type];
      const currentStockpile = existing?.stockpile ?? 0;
      // Apply net, enforce floor
      const newStockpile = Math.max(RESOURCE_FLOOR, currentStockpile + ru.net);
      appliedStockpiles[ru.type] = newStockpile;

      if (existing) {
        await supabase.from("player_resources").update({
          income: ru.income,
          upkeep: ru.upkeep,
          stockpile: newStockpile,
          last_applied_turn: currentTurn,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await supabase.from("player_resources").insert({
          session_id, player_name, resource_type: ru.type,
          income: ru.income, upkeep: ru.upkeep,
          stockpile: Math.max(RESOURCE_FLOOR, ru.net),
          last_applied_turn: currentTurn,
        });
      }
    }

    // ===== FAMINE CHECK =====
    const famineCities: string[] = [];
    if (appliedStockpiles.food <= 0 && netGrain < 0) {
      // Apply stability penalty and gradual population loss to each city
      for (const city of cities) {
        const newStability = Math.max(0, (city.city_stability ?? 70) - FAMINE_STABILITY_PENALTY);
        const popLoss = Math.round((city.population_total ?? 0) * FAMINE_POP_LOSS_RATE);
        const newPeasants = Math.max(10, (city.population_peasants ?? 0) - Math.round(popLoss * 0.7));
        const newBurghers = Math.max(5, (city.population_burghers ?? 0) - Math.round(popLoss * 0.2));
        const newClerics = Math.max(2, (city.population_clerics ?? 0) - Math.round(popLoss * 0.1));
        const newTotal = newPeasants + newBurghers + newClerics;

        await supabase.from("cities").update({
          city_stability: newStability,
          population_peasants: newPeasants,
          population_burghers: newBurghers,
          population_clerics: newClerics,
          population_total: newTotal,
          famine_turn: true,
          famine_severity: Math.min(10, (city.famine_severity ?? 0) + 1),
        }).eq("id", city.id);

        famineCities.push(city.name);
      }
    } else {
      // Clear famine if food is positive
      for (const city of cities) {
        if (city.famine_turn) {
          await supabase.from("cities").update({
            famine_turn: false,
            famine_severity: Math.max(0, (city.famine_severity ?? 1) - 1),
          }).eq("id", city.id);
        }
      }
    }

    // ===== UPDATE REALM_RESOURCES =====
    if (realm) {
      await supabase.from("realm_resources").update({
        grain_reserve: appliedStockpiles.food ?? 0,
        last_turn_grain_prod: totalGrainProd,
        last_turn_grain_cons: totalGrainCons,
        last_turn_grain_net: netGrain,
        last_turn_wood_prod: totalWoodProd,
        last_turn_stone_prod: totalStoneProd,
        last_turn_iron_prod: totalIronProd,
        updated_at: new Date().toISOString(),
      }).eq("id", realm.id);
    }

    // ===== DEBUG LOG =====
    const debugLog = {
      player_name,
      turn: currentTurn,
      cities_count: cities.length,
      production: { grain: totalGrainProd, wood: totalWoodProd, stone: totalStoneProd, iron: totalIronProd },
      consumption: { grain_pop: totalGrainCons - militaryFoodUpkeep, grain_military: militaryFoodUpkeep, iron_military: militaryIronUpkeep },
      raw_net: { grain: rawNetGrain, wood: rawNetWood, stone: rawNetStone, iron: rawNetIron },
      capped_net: { grain: netGrain, wood: netWood, stone: netStone, iron: netIron },
      stockpiles: appliedStockpiles,
      famine_cities: famineCities,
    };
    console.log("[ECONOMY]", JSON.stringify(debugLog));

    // Best-effort action log
    try {
      await supabase.from("world_action_log").insert({
        session_id, player_name,
        action_type: "economy_recompute",
        details: JSON.stringify(debugLog),
      });
    } catch (_) { /* ignore */ }

    return new Response(JSON.stringify({
      ok: true, ...debugLog,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("[ECONOMY ERROR]", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
