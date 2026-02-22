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

// Settlement-level production constants
const SETTLEMENT_PRODUCTION: Record<string, { grain: number; wood: number; special: number }> = {
  HAMLET:   { grain: 8,  wood: 6, special: 2 },
  TOWNSHIP: { grain: 10, wood: 7, special: 3 },
  CITY:     { grain: 12, wood: 8, special: 4 },
  POLIS:    { grain: 14, wood: 9, special: 5 },
};

const FORMATION_MULT: Record<string, number> = {
  UNIT: 1.0, LEGION: 1.1, ARMY: 1.2,
};

// Wealth income formula: base per city + population tax + burgher trade bonus + settlement tier
const SETTLEMENT_WEALTH: Record<string, number> = {
  HAMLET: 1, TOWNSHIP: 2, CITY: 4, POLIS: 6,
};

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
      .ilike("owner_player", playerName);

    const myCities = cities || [];
    const chronicleEntries: string[] = [];

    // Compute granary/stables capacity from infrastructure
    const granaryCapacity = 500 * (infra?.granary_level || 1) * (infra?.granaries_count || 1);
    const stablesCapacity = 100 * (infra?.stables_level || 1) * (infra?.stables_count || 1);

    // 2b) Recompute settlement layers
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

    // 3) Settlement-based resource production
    const mobilizationPenalty = 1 - realm.mobilization_rate * 0.5;

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
        const specialType = roll < 25 ? "IRON" : roll < 50 ? "STONE" : "NONE";
        const { data: newProfile } = await supabase.from("settlement_resource_profiles").insert({
          city_id: city.id,
          produces_grain: true,
          produces_wood: true,
          special_resource_type: specialType,
          base_grain: prodConsts.grain,
          base_wood: prodConsts.wood,
          base_special: specialType !== "NONE" ? prodConsts.special : 0,
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

      const cityGrainBase = profile ? profile.base_grain : prodConsts.grain;
      const cityGrain = Math.round(cityGrainBase * mobilizationPenalty);
      totalGrainProd += cityGrain;

      const cityWood = profile ? profile.base_wood : prodConsts.wood;
      totalWoodProd += cityWood;

      const specialType = profile?.special_resource_type || "NONE";
      const citySpecial = specialType !== "NONE" ? (profile ? profile.base_special : prodConsts.special) : 0;
      if (specialType === "STONE") totalStoneProd += citySpecial;
      if (specialType === "IRON") totalIronProd += citySpecial;

      await supabase.from("cities").update({
        last_turn_grain_prod: cityGrain,
        last_turn_wood_prod: cityWood,
        last_turn_special_prod: citySpecial,
        special_resource_type: specialType,
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
        if (city.famine_turn) {
          await supabase.from("cities").update({
            famine_turn: false,
            famine_severity: 0,
          }).eq("id", city.id);
          city.famine_turn = false;
          city.famine_severity = 0;
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

            await supabase.from("cities").update({
              famine_turn: true,
              famine_severity: allocDeficit,
              city_stability: newStab,
              population_total: newPop,
              local_grain_reserve: city.local_grain_reserve,
              vulnerability_score: city.vulnerability_score,
            }).eq("id", city.id);

            city.famine_turn = true;
            city.population_total = newPop;
            city.city_stability = newStab;

            chronicleEntries.push(`⚠️ HLADOMOR v ${city.name}: deficit ${allocDeficit}, populace -${popLoss} (${newPop}), stabilita ${newStab}`);
            remaining -= allocDeficit;
          }
        }

        // Cities NOT hit by famine should have famine cleared
        for (const city of myCities) {
          if (!city.famine_turn) {
            await supabase.from("cities").update({
              famine_turn: false, famine_severity: 0,
            }).eq("id", city.id);
          }
        }
      } else {
        // Deficit covered by reserves — no famine
        for (const city of myCities) {
          if (city.famine_turn) {
            await supabase.from("cities").update({
              famine_turn: false, famine_severity: 0,
            }).eq("id", city.id);
            city.famine_turn = false;
            city.famine_severity = 0;
          }
        }
        chronicleEntries.push(`Deficit obilí ${deficit} pokryt ze zásob (zbývá ${grainReserve})`);
      }
    }

    chronicleEntries.push(`Obilí: produkce ${totalGrainProd}, spotřeba ${totalConsumption}, bilance ${netGrain >= 0 ? "+" : ""}${netGrain}, zásoby ${grainReserve}/${granaryCapacity}`);
    chronicleEntries.push(`Suroviny: Dřevo +${totalWoodProd}, Kámen +${totalStoneProd}, Železo +${totalIronProd}`);

    // 6) Population growth (only for non-famine cities, famine cities already lost pop above)
    for (const city of myCities) {
      if (city.famine_turn) continue; // famine cities already handled

      const baseGrowth = 0.01;
      const stabilityFactor = (city.city_stability - 50) / 200;
      const warFactor = (city.status === "besieged" || city.status === "devastated") ? -0.02 : 0;
      let netGrowthRate = baseGrowth + stabilityFactor + warFactor;
      netGrowthRate = Math.max(-0.03, Math.min(0.05, netGrowthRate));
      
      const delta = Math.round(city.population_total * netGrowthRate);
      const newPop = Math.max(200, city.population_total + delta);

      await supabase.from("cities").update({
        population_total: newPop,
      }).eq("id", city.id);

      city.population_total = newPop;

      if (Math.abs(delta) > 5) {
        chronicleEntries.push(`${city.name}: populace ${delta > 0 ? "+" : ""}${delta} (${newPop})`);
      }
    }

    // 7) Manpower pool
    const totalPopulation = myCities.reduce((s, c) => s + c.population_total, 0);
    const totalPeasants = myCities.reduce((s, c) => s + (c.population_peasants || 0), 0);
    const manpowerPool = Math.round(totalPeasants * realm.mobilization_rate);

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
          chronicleEntries.push(`Armáda "${stack.name}": síla ${oldPower} → ${newPower}`);
        }
      }
    }

    // 10) Update realm resources
    const newWoodReserve = (realm.wood_reserve || 0) + totalWoodProd;
    const newStoneReserve = (realm.stone_reserve || 0) + totalStoneProd;
    const newIronReserve = (realm.iron_reserve || 0) + totalIronProd;

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
      famine_city_count: famineCityCount,
      updated_at: new Date().toISOString(),
    }).eq("id", realm.id);

    // 11) Write chronicle summary
    if (chronicleEntries.length > 0) {
      const summaryText = `**Shrnutí kola ${currentTurn} — ${playerName}**\n\n` + chronicleEntries.join("\n");
      await supabase.from("chronicle_entries").insert({
        session_id: sessionId,
        turn_from: currentTurn,
        turn_to: currentTurn,
        text: summaryText,
      });
    }

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
      food: totalConsumption,
      wood: 0,
      stone: 0,
      iron: 0,
      wealth: 0,
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
      const newStockpile = Math.max(0, (res.stockpile || 0) + (res.income || 0) - (res.upkeep || 0));
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
    chronicleEntries.push(`Příjmy: ${incomeSummary}`);

    // Write to world_action_log
    await supabase.from("world_action_log").insert({
      session_id: sessionId,
      turn_number: currentTurn,
      player_name: playerName,
      action_type: "turn_processing",
      description: `Kolo ${currentTurn} zpracováno: obilí ${netGrain >= 0 ? "+" : ""}${netGrain}, pop ${totalPopulation}, manpower ${manpowerPool}. Income: ${incomeSummary}`,
      metadata: {
        grain_prod: totalGrainProd,
        grain_consumption: totalConsumption,
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
