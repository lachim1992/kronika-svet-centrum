import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ===== CONSTANTS (must match process-turn) =====
const CONSUMPTION_PER_CAPITA = {
  peasants: 0.005,
  burghers: 0.010,
  clerics: 0.008,
};
const CONSUMPTION_PER_CAPITA_FLAT = 0.006;

const SETTLEMENT_WEALTH: Record<string, number> = {
  HAMLET: 1, TOWNSHIP: 2, CITY: 4, POLIS: 6,
};

const MAX_NET_CHANGE = 200;
const RESOURCE_FLOOR = 0;

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
    total += (SETTLEMENT_WEALTH[c.settlement_level] || 1)
      + Math.floor((c.population_total || 0) / 500)
      + Math.floor((c.population_burghers || 0) / 200);
  }
  return total;
}

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

    const { data: session } = await supabase.from("game_sessions").select("current_turn")
      .eq("id", session_id).single();
    const currentTurn = session?.current_turn ?? 1;

    const { data: cities } = await supabase.from("cities").select("*")
      .eq("session_id", session_id).ilike("owner_player", player_name);
    if (!cities || cities.length === 0) {
      return new Response(JSON.stringify({ error: "No cities found" }), { status: 404, headers: corsHeaders });
    }

    const cityIds = cities.map(c => c.id);

    const { data: profiles } = await supabase.from("settlement_resource_profiles").select("*")
      .in("city_id", cityIds);
    const profileMap: Record<string, any> = {};
    for (const p of (profiles || [])) profileMap[p.city_id] = p;

    // Load military stacks for upkeep
    const { data: stacks } = await supabase.from("military_stacks")
      .select("*, military_stack_composition(*)")
      .eq("session_id", session_id).ilike("player_name", player_name).eq("is_active", true);

    const { data: realm } = await supabase.from("realm_resources").select("*")
      .eq("session_id", session_id).ilike("player_name", player_name).maybeSingle();

    // ===== PRODUCTION =====
    let totalGrainProd = 0, totalWoodProd = 0, totalStoneProd = 0, totalIronProd = 0;
    const BASE_GRAIN = 8, BASE_WOOD = 5;

    for (const city of cities) {
      const prof = profileMap[city.id];
      let cityGrain: number, cityWood: number, cityStone = 0, cityIron = 0;

      if (prof) {
        cityGrain = prof.base_grain ?? BASE_GRAIN;
        cityWood = prof.produces_wood ? (prof.base_wood ?? BASE_WOOD) : 0;
        if (prof.special_resource_type === "STONE") cityStone = prof.base_special ?? 0;
        if (prof.special_resource_type === "IRON") cityIron = prof.base_special ?? 0;
      } else {
        cityGrain = BASE_GRAIN;
        cityWood = BASE_WOOD;
        if (city.special_resource_type === "STONE") cityStone = 3;
        if (city.special_resource_type === "IRON") cityIron = 2;
      }

      totalGrainProd += cityGrain;
      totalWoodProd += cityWood;
      totalStoneProd += cityStone;
      totalIronProd += cityIron;

      await supabase.from("cities").update({
        last_turn_grain_prod: cityGrain,
        last_turn_wood_prod: cityWood,
        last_turn_special_prod: cityStone + cityIron,
      }).eq("id", city.id);
    }

    // Early-game buffer
    if (cities.length <= 3) totalGrainProd += 10;

    // ===== CONSUMPTION (same formula as process-turn) =====
    let totalGrainCons = 0;
    for (const city of cities) {
      const cons = computeGrainConsumption(city);
      totalGrainCons += cons;
      await supabase.from("cities").update({ last_turn_grain_cons: cons }).eq("id", city.id);
    }

    // Military food upkeep: 1 food per 500 troops
    let militaryFoodUpkeep = 0;
    let militaryIronUpkeep = 0;
    let militaryWealthUpkeep = 0;
    for (const stack of (stacks || [])) {
      const totalManpower = (stack.military_stack_composition || [])
        .reduce((sum: number, c: any) => sum + (c.manpower ?? 0), 0);
      militaryFoodUpkeep += Math.ceil(totalManpower / 500);
      militaryIronUpkeep += Math.ceil(totalManpower / 2000);
      militaryWealthUpkeep += Math.ceil(totalManpower / 100);
    }
    totalGrainCons += militaryFoodUpkeep;

    // ===== NET WITH CAP =====
    const netGrain = Math.max(-MAX_NET_CHANGE, Math.min(MAX_NET_CHANGE, totalGrainProd - totalGrainCons));
    const netWood = Math.max(-MAX_NET_CHANGE, Math.min(MAX_NET_CHANGE, totalWoodProd));
    const netStone = Math.max(-MAX_NET_CHANGE, Math.min(MAX_NET_CHANGE, totalStoneProd));
    const netIron = Math.max(-MAX_NET_CHANGE, Math.min(MAX_NET_CHANGE, totalIronProd - militaryIronUpkeep));

    // ===== WEALTH (same formula as process-turn) =====
    const totalWealthIncome = computeWealthIncome(cities);
    const netWealth = Math.max(-MAX_NET_CHANGE, Math.min(MAX_NET_CHANGE, totalWealthIncome - militaryWealthUpkeep));

    // ===== UPDATE player_resources =====
    const { data: currentResources } = await supabase.from("player_resources").select("*")
      .eq("session_id", session_id).ilike("player_name", player_name);
    const resMap: Record<string, any> = {};
    for (const r of (currentResources || [])) resMap[r.resource_type] = r;

    const resourceUpdates = [
      { type: "food", income: totalGrainProd, upkeep: totalGrainCons, net: netGrain },
      { type: "wood", income: totalWoodProd, upkeep: 0, net: netWood },
      { type: "stone", income: totalStoneProd, upkeep: 0, net: netStone },
      { type: "iron", income: totalIronProd, upkeep: militaryIronUpkeep, net: netIron },
      { type: "wealth", income: totalWealthIncome, upkeep: militaryWealthUpkeep, net: netWealth },
    ];

    const appliedStockpiles: Record<string, number> = {};

    for (const ru of resourceUpdates) {
      const existing = resMap[ru.type];
      const currentStockpile = existing?.stockpile ?? 0;
      const newStockpile = Math.max(RESOURCE_FLOOR, currentStockpile + ru.net);
      appliedStockpiles[ru.type] = newStockpile;

      if (existing) {
        await supabase.from("player_resources").update({
          income: ru.income,
          upkeep: ru.upkeep,
          stockpile: ru.type === "wealth" ? (realm?.gold_reserve ?? newStockpile) : newStockpile,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await supabase.from("player_resources").insert({
          session_id, player_name, resource_type: ru.type,
          income: ru.income, upkeep: ru.upkeep,
          stockpile: ru.type === "wealth" ? (realm?.gold_reserve ?? 0) : Math.max(RESOURCE_FLOOR, ru.net),
        });
      }
    }

    // ===== SYNC realm_resources =====
    if (realm) {
      await supabase.from("realm_resources").update({
        last_turn_grain_prod: totalGrainProd,
        last_turn_grain_cons: totalGrainCons,
        last_turn_grain_net: netGrain,
        last_turn_wood_prod: totalWoodProd,
        last_turn_stone_prod: totalStoneProd,
        last_turn_iron_prod: totalIronProd,
        updated_at: new Date().toISOString(),
      }).eq("id", realm.id);
    }

    const debugLog = {
      player_name,
      turn: currentTurn,
      cities_count: cities.length,
      production: { grain: totalGrainProd, wood: totalWoodProd, stone: totalStoneProd, iron: totalIronProd },
      consumption: { grain_pop: totalGrainCons - militaryFoodUpkeep, grain_military: militaryFoodUpkeep, iron_military: militaryIronUpkeep, wealth_military: militaryWealthUpkeep },
      capped_net: { grain: netGrain, wood: netWood, stone: netStone, iron: netIron, wealth: netWealth },
      stockpiles: appliedStockpiles,
    };
    console.log("[ECONOMY-RECOMPUTE]", JSON.stringify(debugLog));

    return new Response(JSON.stringify({ ok: true, ...debugLog }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[ECONOMY-RECOMPUTE ERROR]", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
