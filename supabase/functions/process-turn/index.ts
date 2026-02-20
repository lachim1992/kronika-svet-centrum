import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Settlement templates
const SETTLEMENT_TEMPLATES: Record<string, { peasants: number; burghers: number; clerics: number }> = {
  HAMLET:   { peasants: 0.80, burghers: 0.15, clerics: 0.05 },
  TOWNSHIP: { peasants: 0.60, burghers: 0.30, clerics: 0.10 },
  CITY:     { peasants: 0.40, burghers: 0.40, clerics: 0.20 },
  POLIS:    { peasants: 0.20, burghers: 0.55, clerics: 0.25 },
};

const UNIT_WEIGHTS: Record<string, number> = {
  INFANTRY: 1.0, ARCHERS: 1.1, CAVALRY: 1.3, SIEGE: 0.9,
};

const FORMATION_MULT: Record<string, number> = {
  UNIT: 1.0, LEGION: 1.1, ARMY: 1.2,
};

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
      // Auto-create realm resources
      const { data: newRealm } = await supabase.from("realm_resources").insert({
        session_id: sessionId, player_name: playerName,
      }).select().single();
      realm = newRealm;
    }

    // Load session for current turn
    const { data: session } = await supabase.from("game_sessions").select("current_turn").eq("id", sessionId).single();
    const currentTurn = session?.current_turn || 1;

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
    const chronicleEntries: string[] = [];

    // Compute granary/stables capacity from infrastructure
    const granaryCapacity = 500 * (infra?.granary_level || 1) * (infra?.granaries_count || 1);
    const stablesCapacity = 100 * (infra?.stables_level || 1) * (infra?.stables_count || 1);

    // 2) Recompute settlement layers
    for (const city of myCities) {
      if (city.custom_layers) continue;
      const template = SETTLEMENT_TEMPLATES[city.settlement_level] || SETTLEMENT_TEMPLATES.HAMLET;
      const pop = city.population_total;
      const peasants = Math.round(pop * template.peasants);
      const burghers = Math.round(pop * template.burghers);
      const clerics = pop - peasants - burghers;
      
      await supabase.from("cities").update({
        population_peasants: peasants,
        population_burghers: burghers,
        population_clerics: clerics,
      }).eq("id", city.id);

      city.population_peasants = peasants;
      city.population_burghers = burghers;
      city.population_clerics = clerics;
    }

    // 3) Population growth
    for (const city of myCities) {
      const baseGrowth = 0.01;
      const stabilityFactor = (city.city_stability - 50) / 200;
      const foodFactor = city.famine_turn ? -0.02 : 0.01;
      const warFactor = (city.status === "besieged" || city.status === "devastated") ? -0.02 : 0;
      let netGrowth = baseGrowth + stabilityFactor + foodFactor + warFactor;
      netGrowth = Math.max(-0.05, Math.min(0.05, netGrowth));
      
      const delta = Math.round(city.population_total * netGrowth);
      const newPop = Math.max(200, city.population_total + delta);
      
      // Store per-city cached grain metrics
      const cityGrainProd = Math.round((city.population_peasants || 0) * 0.02);
      const cityGrainCons = Math.round(newPop * 0.015);

      await supabase.from("cities").update({
        population_total: newPop,
        famine_turn: false,
        famine_severity: 0,
        last_turn_grain_prod: cityGrainProd,
        last_turn_grain_cons: cityGrainCons,
      }).eq("id", city.id);

      city.population_total = newPop;

      if (Math.abs(delta) > city.population_total * 0.01) {
        chronicleEntries.push(`${city.name}: populace ${delta > 0 ? "+" : ""}${delta} (${newPop})`);
      }
    }

    // 4) Manpower pool
    const totalPeasants = myCities.reduce((s, c) => s + c.population_peasants, 0);
    const manpowerPool = Math.round(totalPeasants * realm.mobilization_rate);

    // 5) Grain production (with mobilization penalty)
    const mobilizationPenalty = 1 - realm.mobilization_rate;
    let totalGrainProd = 0;
    for (const city of myCities) {
      const cityGrain = Math.round(city.population_peasants * 0.02);
      totalGrainProd += cityGrain;
    }
    totalGrainProd = Math.round(totalGrainProd * mobilizationPenalty);

    // 6) Grain consumption
    let totalConsumption = 0;
    for (const city of myCities) {
      totalConsumption += Math.round(city.population_total * 0.015);
    }

    // 7) Update granary reserves
    const netGrain = totalGrainProd - totalConsumption;
    let grainReserve = realm.grain_reserve;
    let famineDeficit = 0;

    if (netGrain >= 0) {
      const addToReserve = Math.min(netGrain, granaryCapacity - grainReserve);
      grainReserve += addToReserve;
    } else {
      const deficit = Math.abs(netGrain);
      const taken = Math.min(deficit, grainReserve);
      grainReserve -= taken;
      famineDeficit = deficit - taken;
    }

    chronicleEntries.push(`Obilí: produkce ${totalGrainProd}, spotřeba ${totalConsumption}, bilance ${netGrain >= 0 ? "+" : ""}${netGrain}, zásoby ${grainReserve}/${granaryCapacity}`);

    // 8) Famine distribution
    if (famineDeficit > 0) {
      // Compute vulnerability scores
      for (const city of myCities) {
        const vuln = (100 - city.city_stability) * 0.5
          + (1 - city.local_grain_reserve / Math.max(city.local_granary_capacity, 1)) * 20
          + ({ HAMLET: 10, TOWNSHIP: 8, CITY: 6, POLIS: 5 }[city.settlement_level] || 10);
        city.vulnerability_score = vuln;
      }

      // Sort by vulnerability DESC
      const sorted = [...myCities].sort((a, b) => b.vulnerability_score - a.vulnerability_score);
      let remaining = famineDeficit;

      for (const city of sorted) {
        if (remaining <= 0) break;
        const cityConsumption = Math.round(city.population_total * 0.015);
        const cityNeed = Math.max(0, cityConsumption - city.local_grain_reserve);
        let allocDeficit = Math.min(remaining, cityNeed);

        // Use local reserves first
        if (city.local_grain_reserve > 0) {
          const localUsed = Math.min(city.local_grain_reserve, allocDeficit);
          city.local_grain_reserve -= localUsed;
          allocDeficit -= localUsed;
        }

        if (allocDeficit > 0) {
          const stabLoss = Math.min(20, Math.max(5, Math.round(allocDeficit / 10)));
          const newStab = Math.max(0, city.city_stability - stabLoss);
          
          await supabase.from("cities").update({
            famine_turn: true,
            famine_severity: allocDeficit,
            city_stability: newStab,
            local_grain_reserve: city.local_grain_reserve,
            vulnerability_score: city.vulnerability_score,
          }).eq("id", city.id);

          chronicleEntries.push(`⚠️ HLADOMOR v ${city.name}: deficit ${allocDeficit}, stabilita ${newStab}`);
          remaining -= allocDeficit;
        }
      }
    }

    // 9) Logistic capacity
    const logisticCapacity = realm.horses_reserve + Math.round((infra?.slavery_factor || 0) * 100);

    // 10) Military power recomputation
    const { data: stacks } = await supabase
      .from("military_stacks")
      .select("*, military_stack_composition(*)")
      .eq("session_id", sessionId)
      .eq("player_name", playerName)
      .eq("is_active", true);

    const totalPopulation = myCities.reduce((s, c) => s + c.population_total, 0);
    const totalBurghers = myCities.reduce((s, c) => s + c.population_burghers, 0);
    const burgherRatio = totalPopulation > 0 ? totalBurghers / totalPopulation : 0;
    const qualityBonus = Math.round(burgherRatio * 30);

    for (const stack of (stacks || [])) {
      // Load general
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

        // Update quality on composition
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
          chronicleEntries.push(`Armáda "${stack.name}": síla ${oldPower} → ${newPower}`);
        }
      }
    }

    // 11) Update realm resources + cached turn summary
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
      famine_city_count: famineDeficit > 0 ? myCities.filter(c => c.famine_turn).length : 0,
      updated_at: new Date().toISOString(),
    }).eq("id", realm.id);

    // 12) Write chronicle summary
    if (chronicleEntries.length > 0) {
      const summaryText = `**Shrnutí kola ${currentTurn} — ${playerName}**\n\n` + chronicleEntries.join("\n");
      await supabase.from("chronicle_entries").insert({
        session_id: sessionId,
        turn_from: currentTurn,
        turn_to: currentTurn,
        text: summaryText,
      });
    }

    // Write to world_action_log
    await supabase.from("world_action_log").insert({
      session_id: sessionId,
      turn_number: currentTurn,
      player_name: playerName,
      action_type: "turn_processing",
      description: `Kolo ${currentTurn} zpracováno: obilí ${netGrain >= 0 ? "+" : ""}${netGrain}, pop ${totalPopulation}, manpower ${manpowerPool}`,
      metadata: {
        grain_prod: totalGrainProd,
        grain_consumption: totalConsumption,
        net_grain: netGrain,
        grain_reserve: grainReserve,
        manpower_pool: manpowerPool,
        famine_deficit: famineDeficit,
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
        famineDeficit,
        chronicleEntries: chronicleEntries.length,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
