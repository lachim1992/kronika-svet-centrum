import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // 1) Load player's cities
    const { data: cities } = await supabase.from("cities").select("*")
      .eq("session_id", session_id).ilike("owner_player", player_name);
    if (!cities || cities.length === 0) {
      return new Response(JSON.stringify({ error: "No cities found" }), { status: 404, headers: corsHeaders });
    }

    const cityIds = cities.map(c => c.id);

    // 2) Load settlement resource profiles
    const { data: profiles } = await supabase.from("settlement_resource_profiles").select("*")
      .in("city_id", cityIds);
    const profileMap: Record<string, any> = {};
    for (const p of (profiles || [])) profileMap[p.city_id] = p;

    // 3) Load realm_resources
    const { data: realm } = await supabase.from("realm_resources").select("*")
      .eq("session_id", session_id).ilike("player_name", player_name).maybeSingle();
    const mobilizationRate = realm?.mobilization_rate ?? 0.1;

    // 4) Compute production per city
    const mobilizationPenalty = 1 - mobilizationRate * 0.5;
    const earlyBuffer = cities.length <= 3 ? 10 : 0;

    let totalGrainProd = 0, totalWoodProd = 0, totalStoneProd = 0, totalIronProd = 0;

    for (const city of cities) {
      const prof = profileMap[city.id];
      if (!prof) continue;

      const cityGrain = Math.round(prof.base_grain * mobilizationPenalty);
      const cityWood = prof.produces_wood ? prof.base_wood : 0;
      let cityStone = 0, cityIron = 0;
      if (prof.special_resource_type === "STONE") cityStone = prof.base_special;
      if (prof.special_resource_type === "IRON") cityIron = prof.base_special;

      totalGrainProd += cityGrain;
      totalWoodProd += cityWood;
      totalStoneProd += cityStone;
      totalIronProd += cityIron;

      // Update city cached production
      await supabase.from("cities").update({
        last_turn_grain_prod: cityGrain,
        last_turn_wood_prod: cityWood,
        last_turn_special_prod: cityStone + cityIron,
      }).eq("id", city.id);
    }

    totalGrainProd += earlyBuffer;

    // 5) Compute consumption per city (class-based formula)
    let totalGrainCons = 0;
    for (const city of cities) {
      const peas = city.population_peasants || 0;
      const burg = city.population_burghers || 0;
      const cler = city.population_clerics || 0;
      const cons = (peas + burg + cler) > 0
        ? Math.round(peas * 0.3 + burg * 0.6 + cler * 0.5)
        : Math.round(city.population_total * 0.4);
      totalGrainCons += cons;

      await supabase.from("cities").update({ last_turn_grain_cons: cons }).eq("id", city.id);
    }

    const netGrain = totalGrainProd - totalGrainCons;

    // 6) Update player_resources
    const resourceUpdates = [
      { type: "food", income: totalGrainProd, upkeep: totalGrainCons },
      { type: "wood", income: totalWoodProd, upkeep: 0 },
      { type: "stone", income: totalStoneProd, upkeep: 0 },
      { type: "iron", income: totalIronProd, upkeep: 0 },
    ];

    for (const ru of resourceUpdates) {
      const { data: existing } = await supabase.from("player_resources").select("id")
        .eq("session_id", session_id).ilike("player_name", player_name)
        .eq("resource_type", ru.type).maybeSingle();

      if (existing) {
        await supabase.from("player_resources").update({
          income: ru.income, upkeep: ru.upkeep, updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await supabase.from("player_resources").insert({
          session_id, player_name, resource_type: ru.type,
          income: ru.income, upkeep: ru.upkeep, stockpile: 0,
        });
      }
    }

    // 7) Update realm_resources aggregates
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

    // 8) Log to world_action_log (best-effort, table may not exist)
    try {
      await supabase.from("world_action_log").insert({
        session_id,
        player_name,
        action_type: "economy_recompute",
        details: JSON.stringify({
          grain_prod: totalGrainProd, grain_cons: totalGrainCons, net: netGrain,
          wood: totalWoodProd, stone: totalStoneProd, iron: totalIronProd,
        }),
      });
    } catch (_) { /* ignore if table doesn't exist */ }

    return new Response(JSON.stringify({
      ok: true,
      grain_prod: totalGrainProd,
      grain_cons: totalGrainCons,
      net_food: netGrain,
      wood: totalWoodProd,
      stone: totalStoneProd,
      iron: totalIronProd,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
