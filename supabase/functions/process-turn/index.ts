import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { computeStructuralBonuses, getOpenBordersBonuses, hasActiveEmbargo, getTradeEfficiencyModifier, type DiplomaticPact } from "../_shared/physics.ts";

/**
 * process-turn v3: HYBRID NETWORK ECONOMY
 *
 * Macro totals from compute-economy-flow (world-tick step 12f) provide
 * realm-level aggregates, but per-city outcomes are now driven by the
 * node/route network layer:
 *
 * 1. Each city resolves production/demand against its linked province_node
 * 2. Node isolation, flow_role, and connectivity create per-city modifiers
 * 3. Trade routes are validated through the province graph; regulators take tolls
 * 4. Anomalies (isolation, trade boom, blockade) generate game_events
 */

// --- Per-capita demand constants ---
const DEMAND_PER_CAPITA = { peasants: 0.005, burghers: 0.010, clerics: 0.008 };
const DEMAND_PER_CAPITA_FLAT = 0.006;
const RATION_DEMAND_MULT: Record<string, number> = {
  equal: 1.0, elite: 0.95, austerity: 0.80, sacrifice: 1.15,
};

function computeCityDemand(city: any): number {
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

// Flow role production multipliers: how well a node converts its base production
const FLOW_ROLE_PRODUCTION_MULT: Record<string, number> = {
  hub: 0.8, gateway: 0.9, regulator: 0.7, producer: 1.2, neutral: 1.0,
};

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ── BFS pathfinding on route graph ──
function findRoutePath(
  fromNodeId: string,
  toNodeId: string,
  adjacency: Map<string, Array<{ neighbor: string; routeId: string; controlState: string }>>,
): { path: string[]; blocked: boolean } | null {
  if (fromNodeId === toNodeId) return { path: [fromNodeId], blocked: false };
  const visited = new Set<string>();
  const queue: Array<{ node: string; path: string[]; blocked: boolean }> = [
    { node: fromNodeId, path: [fromNodeId], blocked: false },
  ];
  visited.add(fromNodeId);

  while (queue.length > 0) {
    const { node, path, blocked } = queue.shift()!;
    const neighbors = adjacency.get(node) || [];
    for (const { neighbor, controlState } of neighbors) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      const isBlocked = controlState === "blocked" || controlState === "embargoed";
      const newPath = [...path, neighbor];
      if (neighbor === toNodeId) return { path: newPath, blocked: blocked || isBlocked };
      queue.push({ node: neighbor, path: newPath, blocked: blocked || isBlocked });
    }
  }
  return null; // No path
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

    // ── Load realm resources ──
    let { data: realm } = await supabase
      .from("realm_resources").select("*")
      .eq("session_id", sessionId).eq("player_name", playerName).maybeSingle();

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
    const newEvents: Array<{ event_type: string; note: string; importance: string; city_id?: string; reference?: any }> = [];

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

    // ── Load network layer: nodes linked to cities + routes + supply state ──
    const [nodesRes, routesRes, supplyRes] = await Promise.all([
      supabase.from("province_nodes")
        .select("id, city_id, node_type, flow_role, production_output, wealth_output, capacity_score, importance_score, incoming_production, connectivity_score, route_access_factor, isolation_penalty, controlled_by, toll_rate, throughput_military, province_id")
        .eq("session_id", sessionId),
      supabase.from("province_routes")
        .select("id, node_a, node_b, control_state, capacity_value, damage_level")
        .eq("session_id", sessionId),
      supabase.from("supply_chain_state")
        .select("node_id, connected_to_capital, isolation_turns, supply_level, hop_distance")
        .eq("session_id", sessionId).eq("turn_number", currentTurn),
    ]);

    const allNodes = nodesRes.data || [];
    const allRoutes = routesRes.data || [];
    const supplyStates = supplyRes.data || [];

    // Build city→node map and supply map
    const cityNodeMap = new Map<string, any>();
    const nodeMap = new Map<string, any>();
    for (const n of allNodes) {
      nodeMap.set(n.id, n);
      if (n.city_id) cityNodeMap.set(n.city_id, n);
    }
    const supplyMap = new Map<string, any>();
    for (const s of supplyStates) supplyMap.set(s.node_id, s);

    // Build route adjacency for pathfinding
    const adjacency = new Map<string, Array<{ neighbor: string; routeId: string; controlState: string }>>();
    for (const r of allRoutes) {
      const a = r.node_a;
      const b = r.node_b;
      if (!adjacency.has(a)) adjacency.set(a, []);
      if (!adjacency.has(b)) adjacency.set(b, []);
      adjacency.get(a)!.push({ neighbor: b, routeId: r.id, controlState: r.control_state || "open" });
      adjacency.get(b)!.push({ neighbor: a, routeId: r.id, controlState: r.control_state || "open" });
    }

    // ── Load infrastructure ──
    let { data: infra } = await supabase.from("realm_infrastructure").select("*")
      .eq("session_id", sessionId).eq("player_name", playerName).maybeSingle();
    if (!infra) {
      const { data: newInfra } = await supabase.from("realm_infrastructure").insert({
        session_id: sessionId, player_name: playerName,
      }).select().single();
      infra = newInfra;
    }

    // ── Load civ identity ──
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
      .select("city_id, stability_modifier").eq("session_id", sessionId).eq("status", "completed")
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

    let activePopModifier = 0, maxMobModifier = 0, taxRateModifier = 0;
    let grainRationModifier = 0, tradeRestriction = 0;

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
    // WORKFORCE & MANPOWER
    // ══════════════════════════════════════════
    const ACTIVE_POP_WEIGHTS = { peasants: 1.0, burghers: 0.7, clerics: 0.2 };
    let activePopRaw = 0, totalPopulation = 0;
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
    const mobRate = realm.mobilization_rate || 0.1;
    const mobilized = Math.floor(effectiveActivePop * mobRate);
    const workforce = effectiveActivePop - mobilized;
    const workforceRatio = effectiveActivePop > 0 ? workforce / effectiveActivePop : 1;

    // ══════════════════════════════════════════
    // ARMY UPKEEP
    // ══════════════════════════════════════════
    const { data: stacks } = await supabase.from("military_stacks")
      .select("id, unit_count, maintenance_cost")
      .eq("session_id", sessionId).eq("owner_player", playerName);

    let armyProductionUpkeep = 0, armyWealthUpkeep = 0;
    for (const s of (stacks || [])) {
      const men = s.unit_count || 0;
      armyProductionUpkeep += Math.ceil(men / 500);
      armyWealthUpkeep += Math.ceil(men / 100);
    }

    // ══════════════════════════════════════════════════════════════
    // ▶ PER-CITY NETWORK ECONOMY: PRODUCTION vs DEMAND
    // Each city resolves its own food balance based on its linked
    // province_node's production, isolation, and connectivity.
    // ══════════════════════════════════════════════════════════════
    const grainRationMult = 1 + (grainRationModifier / 100);
    let globalGrainReserve = realm.grain_reserve || 0;
    let famineCityCount = 0;
    let totalDemand = 0;
    let totalCityProduction = 0;

    // Per-city breakdown for reporting
    const cityEconResults: Array<{
      cityId: string; cityName: string;
      nodeProduction: number; demand: number; balance: number;
      isolationPenalty: number; famine: boolean;
    }> = [];

    for (const city of myCities) {
      const cityDemand = Math.max(1, Math.round(computeCityDemand(city) * grainRationMult));
      totalDemand += cityDemand;

      // Find linked node
      const node = cityNodeMap.get(city.id);
      let cityProduction = 0;
      let isolationPenalty = 0;

      if (node) {
        // Node-driven production: production_output includes isolation from compute-economy-flow
        cityProduction = node.production_output || 0;
        // Add incoming production from minor nodes feeding this major node
        cityProduction += (node.incoming_production || 0) * 0.5;
        // Flow role bonus
        const roleMult = FLOW_ROLE_PRODUCTION_MULT[node.flow_role] || 1.0;
        cityProduction *= roleMult;
        isolationPenalty = node.isolation_penalty || 0;

        // Supply chain state: further reduce if disconnected
        const supply = supplyMap.get(node.id);
        if (supply && !supply.connected_to_capital) {
          const isoTurns = supply.isolation_turns || 0;
          const supplyMult = Math.max(0.3, 1 - isoTurns * 0.1);
          cityProduction *= supplyMult;

          // Generate isolation event after 3+ turns
          if (isoTurns >= 3) {
            newEvents.push({
              event_type: "city_isolated",
              note: `${city.name} je ${isoTurns} kol odříznuto od hlavního města. Zásobování selhává, produkce klesá na ${Math.round(supplyMult * 100)}%.`,
              importance: isoTurns >= 5 ? "critical" : "important",
              city_id: city.id,
              reference: { isolation_turns: isoTurns, supply_mult: supplyMult, node_id: node.id },
            });
          }
        }
      } else {
        // No linked node: fallback to share of macro production
        const cityShare = totalPopulation > 0 ? (city.population_total || 0) / totalPopulation : 1 / Math.max(1, myCities.length);
        cityProduction = totalProduction * cityShare;
      }

      totalCityProduction += cityProduction;

      // Per-city balance
      const cityBalance = cityProduction - cityDemand;
      const cityFamine = cityBalance < 0 && globalGrainReserve <= 0;

      if (cityBalance >= 0) {
        // Surplus goes to global reserve
        globalGrainReserve += cityBalance * 0.5; // Half goes to reserve, half consumed
      } else {
        // Deficit drains from global reserve
        globalGrainReserve += cityBalance; // negative
      }

      if (cityFamine) {
        famineCityCount++;
        const newStability = Math.max(0, (city.city_stability || 50) - 5);
        const deathToll = Math.floor((city.population_total || 0) * 0.05);
        await supabase.from("cities").update({
          city_stability: newStability,
          population_peasants: Math.max(0, (city.population_peasants || 0) - Math.floor(deathToll * 0.8)),
          population_burghers: Math.max(0, (city.population_burghers || 0) - Math.floor(deathToll * 0.2)),
          famine_turn: true,
          famine_consecutive_turns: (city.famine_consecutive_turns || 0) + 1,
        }).eq("id", city.id);

        logEntries.push(`⚠️ Hladomor v ${city.name}! Ztráta ${deathToll} obyvatel.`);
        newEvents.push({
          event_type: "famine",
          note: `Hladomor zachvátil ${city.name}. Produkce uzlu (${cityProduction.toFixed(1)}) nestačí na pokrytí poptávky (${cityDemand}). Zemřelo ${deathToll} obyvatel.`,
          importance: "critical",
          city_id: city.id,
          reference: { production: cityProduction, demand: cityDemand, death_toll: deathToll, isolation: isolationPenalty },
        });
      } else {
        if (city.famine_turn) {
          await supabase.from("cities").update({ famine_turn: false, famine_consecutive_turns: 0 }).eq("id", city.id);
        }
      }

      // Generate trade boom event for highly productive nodes
      if (node && node.wealth_output > 5 && node.flow_role === "hub") {
        newEvents.push({
          event_type: "trade_boom",
          note: `Obchodní centrum ${city.name} zažívá rozkvět. Bohatství uzlu: ${node.wealth_output.toFixed(1)}, konektivita: ${(node.connectivity_score || 0).toFixed(2)}.`,
          importance: "normal",
          city_id: city.id,
          reference: { wealth_output: node.wealth_output, connectivity: node.connectivity_score, flow_role: node.flow_role },
        });
      }

      cityEconResults.push({
        cityId: city.id, cityName: city.name,
        nodeProduction: Math.round(cityProduction * 10) / 10,
        demand: cityDemand, balance: Math.round(cityBalance * 10) / 10,
        isolationPenalty: Math.round(isolationPenalty * 100),
        famine: cityFamine,
      });
    }

    // Small empire buffer
    if (myCities.length <= 3) globalGrainReserve += 10;
    // Army upkeep from global reserve
    globalGrainReserve -= armyProductionUpkeep;
    // Cap
    globalGrainReserve = Math.max(0, Math.min(granaryCapacity, globalGrainReserve));

    const netProduction = totalCityProduction - totalDemand - armyProductionUpkeep;

    // ══════════════════════════════════════════════════════════════
    // ▶ WEALTH: TRADE ROUTES WITH GRAPH VALIDATION & INTERCEPCION
    // Trade routes are validated through the province graph.
    // Regulator nodes along the path take tolls.
    // Blocked nodes interrupt trade.
    // ══════════════════════════════════════════════════════════════
    const taxMult = 1 + (taxRateModifier / 100);
    const wealthIncome = Math.max(0, Math.round(totalWealth * taxMult));
    const sportFundingPct = realm.sport_funding_pct || 0;
    let newGoldReserve = (realm.gold_reserve || 0) + wealthIncome - armyWealthUpkeep;

    // Load diplomatic pacts
    const { data: rawPacts } = await supabase.from("diplomatic_pacts").select("*")
      .eq("session_id", sessionId)
      .or(`party_a.eq.${playerName},party_b.eq.${playerName}`)
      .in("status", ["active", "expired", "broken"]);
    const allPacts: DiplomaticPact[] = (rawPacts || []) as DiplomaticPact[];

    // Load active trade routes
    const { data: activeTradeRoutes } = await supabase.from("trade_routes")
      .select("id, from_player, to_player, resource_type, amount_per_turn, return_resource_type, return_amount, gold_per_turn, route_safety, start_node_id, end_node_id, from_city_id, to_city_id")
      .eq("session_id", sessionId).eq("status", "active")
      .or(`from_player.eq.${playerName},to_player.eq.${playerName}`);

    let tradeGoldDelta = 0;
    let totalTollsPaid = 0;

    for (const route of (activeTradeRoutes || [])) {
      const otherPlayer = route.from_player === playerName ? route.to_player : route.from_player;
      if (hasActiveEmbargo(allPacts, playerName, otherPlayer)) {
        logEntries.push(`🚫 Obchod s ${otherPlayer} blokován embargem`);
        continue;
      }
      const pactMod = getTradeEfficiencyModifier(allPacts, playerName, otherPlayer);
      const lawTradeReduction = Math.min(1, tradeRestriction / 100);
      let efficiency = (1 + pactMod) * (1 - lawTradeReduction);
      const safety = (route.route_safety ?? 80) / 100;

      // ── Graph validation: check if route path exists and is not blocked ──
      let routeBlocked = false;
      let tollTotal = 0;

      // Resolve node IDs: prefer explicit start/end_node_id, fallback to city→node map
      const startNodeId = route.start_node_id || (route.from_city_id ? cityNodeMap.get(route.from_city_id)?.id : null);
      const endNodeId = route.end_node_id || (route.to_city_id ? cityNodeMap.get(route.to_city_id)?.id : null);

      if (startNodeId && endNodeId) {
        const pathResult = findRoutePath(startNodeId, endNodeId, adjacency);

        if (!pathResult) {
          // No path exists — trade route is severed
          logEntries.push(`🚫 Obchodní trasa s ${otherPlayer} přerušena — žádná cesta v grafu`);
          routeBlocked = true;

          newEvents.push({
            event_type: "trade_route_severed",
            note: `Obchodní trasa mezi ${playerName} a ${otherPlayer} byla přerušena — neexistuje průchozí cesta v síti.`,
            importance: "important",
            reference: { from: startNodeId, to: endNodeId, other_player: otherPlayer },
          });
        } else if (pathResult.blocked) {
          // Path exists but goes through blocked/embargoed segment
          logEntries.push(`⚠️ Obchodní trasa s ${otherPlayer} prochází blokovaným úsekem`);
          efficiency *= 0.3; // Severely reduced but not zero (smuggling)

          newEvents.push({
            event_type: "trade_route_impeded",
            note: `Obchodní trasa s ${otherPlayer} prochází blokovaným koridorem — efektivita snížena na 30%.`,
            importance: "normal",
            reference: { path: pathResult.path, other_player: otherPlayer },
          });
        } else {
          // Path is open — calculate tolls from regulator nodes along the way
          for (const nodeId of pathResult.path) {
            const pathNode = nodeMap.get(nodeId);
            if (!pathNode) continue;
            // Regulators and fortresses collect tolls
            if (pathNode.flow_role === "regulator" || pathNode.node_type === "fortress") {
              const tollRate = pathNode.toll_rate || 0;
              if (tollRate > 0) {
                // Toll is a percentage of trade value
                const goldPerTurn = route.gold_per_turn || route.amount_per_turn || 0;
                const toll = Math.round(goldPerTurn * tollRate * 0.01);
                tollTotal += toll;
              }
            }
            // If a node on the path belongs to a hostile player, reduce efficiency
            if (pathNode.controlled_by && pathNode.controlled_by !== playerName && pathNode.controlled_by !== otherPlayer) {
              efficiency *= 0.8; // Foreign territory penalty
            }
          }
        }
      }

      if (routeBlocked) continue;

      // Apply tolls
      totalTollsPaid += tollTotal;

      // ── Trade value calculation ──
      if (route.gold_per_turn) {
        tradeGoldDelta += Math.round((route.gold_per_turn || 0) * efficiency) - tollTotal;
      }
      const isSender = route.from_player === playerName;
      if (route.resource_type && route.amount_per_turn) {
        const amt = route.amount_per_turn || 0;
        if (isSender) {
          tradeGoldDelta -= Math.round(amt * 0.5);
          const recvAmt = Math.round((route.return_amount || 0) * efficiency * safety);
          tradeGoldDelta += Math.round(recvAmt * 0.5) - tollTotal;
        } else {
          tradeGoldDelta += Math.round(amt * efficiency * safety * 0.5) - tollTotal;
          tradeGoldDelta -= Math.round((route.return_amount || 0) * 0.5);
        }
      }
    }

    newGoldReserve += tradeGoldDelta;
    if (tradeGoldDelta !== 0) logEntries.push(`Obchod: ${tradeGoldDelta >= 0 ? "+" : ""}${tradeGoldDelta} zlata`);
    if (totalTollsPaid > 0) logEntries.push(`🏛️ Mýtné: -${totalTollsPaid} zlata`);

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
          budget: newBudget, fan_base: (assoc.fan_base || 0) + repFanGrowth,
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
    const logisticCapacity = Math.max(5, Math.round(totalCapacity * 2) + (infra?.roads_level || 0) * 2);

    // ══════════════════════════════════════════
    // FACTION SATISFACTION
    // ══════════════════════════════════════════
    const { data: factions } = await supabase.from("city_factions").select("*")
      .in("city_id", cityIds.length > 0 ? cityIds : ["00000000-0000-0000-0000-000000000000"]);
    if (factions) {
      for (const f of factions) {
        const city = myCities.find(c => c.id === f.city_id);
        if (!city) continue;

        let satDrift = 0, loyDrift = 0;
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
          satDrift += (city.military_garrison || 0) > 100 ? 2 : (city.military_garrison || 0) < 20 ? -3 : 0;
        }

        // ▶ Per-city production bonus from node network
        const cityEcon = cityEconResults.find(r => r.cityId === city.id);
        if (cityEcon) {
          if (cityEcon.balance > cityEcon.demand * 0.5) satDrift += 2; // City has surplus
          else if (cityEcon.famine) satDrift -= 5; // City-specific famine
          else if (cityEcon.balance < 0) satDrift -= 2; // Deficit but covered by reserve
        }

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
    // PERSIST NODE ANOMALY EVENTS
    // ══════════════════════════════════════════
    // Deduplicate: only create events that haven't been created this turn
    for (const evt of newEvents) {
      await supabase.from("game_events").insert({
        session_id: sessionId,
        event_type: evt.event_type,
        player: playerName,
        actor_type: "system",
        note: evt.note,
        importance: evt.importance,
        confirmed: true,
        truth_state: "canon",
        turn_number: currentTurn,
        city_id: evt.city_id || null,
        reference: evt.reference || {},
      });
    }

    // ══════════════════════════════════════════
    // UPDATE REALM RESOURCES
    // ══════════════════════════════════════════
    await supabase.from("realm_resources").update({
      grain_reserve: globalGrainReserve,
      granary_capacity: granaryCapacity,
      manpower_pool: manpowerPool,
      logistic_capacity: logisticCapacity,
      last_processed_turn: currentTurn,
      last_turn_grain_prod: Math.round(totalCityProduction),
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
      { type: "food", income: Math.round(totalCityProduction), upkeep: totalDemand + armyProductionUpkeep },
      { type: "wealth", income: wealthIncome, upkeep: armyWealthUpkeep + sportFundingExpense + totalTollsPaid },
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
      description: `Kolo ${currentTurn}: ⚒️${totalCityProduction.toFixed(0)} 💰${totalWealth.toFixed(0)} 🏛️${totalCapacity.toFixed(0)} | pop ${totalPopulation} | manpower ${manpowerPool}`,
      metadata: {
        total_production: totalCityProduction,
        total_wealth: totalWealth,
        total_capacity: totalCapacity,
        total_importance: totalImportance,
        demand: totalDemand,
        net_production: netProduction,
        grain_reserve: globalGrainReserve,
        gold_reserve: newGoldReserve,
        manpower_pool: manpowerPool,
        famine_cities: famineCityCount,
        workforce_ratio: workforceRatio,
        trade_gold: tradeGoldDelta,
        tolls_paid: totalTollsPaid,
        events_generated: newEvents.length,
        city_economy: cityEconResults,
      },
    });

    return new Response(JSON.stringify({
      ok: true, turn: currentTurn,
      summary: {
        totalProduction: totalCityProduction, totalWealth, totalCapacity, totalImportance,
        demand: totalDemand, netProduction,
        grainReserve: globalGrainReserve, granaryCapacity,
        goldReserve: newGoldReserve,
        manpowerPool, logisticCapacity, totalPopulation,
        famineCities: famineCityCount,
        tradeGoldDelta, tollsPaid: totalTollsPaid,
        eventsGenerated: newEvents.length,
        cityEconomy: cityEconResults,
        lawEffects: { taxRateModifier, grainRationModifier, tradeRestriction },
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
