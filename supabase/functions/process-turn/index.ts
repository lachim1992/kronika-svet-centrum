import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { computeStructuralBonuses, getOpenBordersBonuses, hasActiveEmbargo, getTradeEfficiencyModifier, computePrestigeEffects, type DiplomaticPact } from "../_shared/physics.ts";

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

// ═══════════════════════════════════════════════════════════════
// CIVILIZATIONAL ECONOMY CONSTANTS
// Population layers drive economy:
//   Peasants → Production (food, raw materials)
//   Burghers → Wealth (trade, crafts, tax)
//   Warriors → Combat quality + discipline
//   Clerics  → Capacity (administration) + Faith
// ═══════════════════════════════════════════════════════════════

// Per-capita demand (food consumption)
const DEMAND_PER_CAPITA = { peasants: 0.005, burghers: 0.010, clerics: 0.008, warriors: 0.012 };
const DEMAND_PER_CAPITA_FLAT = 0.006;
const RATION_DEMAND_MULT: Record<string, number> = {
  equal: 1.0, elite: 0.95, austerity: 0.80, sacrifice: 1.15,
};

// Per-capita economic contribution
const PRODUCTION_PER_PEASANT = 0.012;  // Peasants are primary producers
const PRODUCTION_PER_BURGHER = 0.003;  // Burghers produce some crafts
const WEALTH_PER_BURGHER = 0.015;      // Burghers are primary wealth generators
const WEALTH_PER_PEASANT = 0.002;      // Peasants contribute market surplus
const CAPACITY_PER_CLERIC = 0.010;     // Clerics administrate
const CAPACITY_PER_BURGHER = 0.004;    // Burghers contribute infrastructure
const FAITH_PER_CLERIC = 0.008;        // Clerics generate faith
const FAITH_PER_WARRIOR = 0.002;       // Warriors contribute discipline/order

// Mobilization penalties (% of mobilized manpower)
const MOB_PRODUCTION_PENALTY_RATE = 0.15; // Each mobilized man costs 15% of a peasant's production
const MOB_WEALTH_PENALTY_RATE = 0.08;     // Mobilization disrupts trade

// Supply strain: army_size / capacity
const SUPPLY_STRAIN_THRESHOLDS = {
  healthy: 0.6,    // Below 60% → no penalty
  stressed: 0.8,   // 60-80% → minor morale/attrition
  strained: 1.0,   // 80-100% → significant penalties
  collapsing: 1.5, // >100% → supply collapse
};

// Strategic resource unlock bonuses (expanded to all 11)
const STRATEGIC_TIER_BONUSES: Record<string, Record<number, any>> = {
  iron: { 1: { combat_mult: 1.05 }, 2: { combat_mult: 1.12, heavy_infantry: true }, 3: { combat_mult: 1.20, elite_units: true } },
  horses: { 1: { mobility: 1.1 }, 2: { cavalry_doctrine: true, mobility: 1.2 }, 3: { cavalry_doctrine: true, mobility: 1.35 } },
  salt: { 1: { supply_bonus: 0.05 }, 2: { supply_bonus: 0.12 }, 3: { supply_bonus: 0.20 } },
  copper: { 1: { wealth_mult: 1.05 }, 2: { wealth_mult: 1.10 }, 3: { wealth_mult: 1.15 } },
  gold: { 1: { mercenary_access: true, wealth_mult: 1.08 }, 2: { wealth_mult: 1.15 }, 3: { wealth_mult: 1.25 } },
  marble: { 1: { build_cost_mult: 0.90, cultural_prestige: 2 }, 2: { build_cost_mult: 0.80, cultural_prestige: 5 }, 3: { build_cost_mult: 0.70, cultural_prestige: 10 } },
  gems: { 1: { wealth_mult: 1.05, faith_bonus: 1 }, 2: { wealth_mult: 1.10, faith_bonus: 3 }, 3: { wealth_mult: 1.15, faith_bonus: 5 } },
  timber: { 1: { travel_cost_mult: 0.90 }, 2: { travel_cost_mult: 0.80, naval: true }, 3: { travel_cost_mult: 0.70, naval_dominance: true } },
  obsidian: { 1: { combat_mult: 1.05, faith_bonus: 1 }, 2: { combat_mult: 1.10, faith_bonus: 3 }, 3: { combat_mult: 1.15, faith_bonus: 5 } },
  silk: { 1: { wealth_mult: 1.05, diplomacy_bonus: 1 }, 2: { wealth_mult: 1.10, diplomacy_bonus: 3 }, 3: { wealth_mult: 1.20, diplomacy_bonus: 5 } },
  incense: { 1: { faith_bonus: 2, wealth_mult: 1.03 }, 2: { faith_bonus: 5, stability_bonus: 2 }, 3: { faith_bonus: 8, stability_bonus: 5 } },
};

function computeCityDemand(city: any): number {
  const peas = city.population_peasants || 0;
  const burg = city.population_burghers || 0;
  const cler = city.population_clerics || 0;
  const warr = city.population_warriors || 0;
  const rationMult = RATION_DEMAND_MULT[city.ration_policy] || 1.0;
  if (peas + burg + cler + warr > 0) {
    return Math.round(
      (peas * DEMAND_PER_CAPITA.peasants +
       burg * DEMAND_PER_CAPITA.burghers +
       cler * DEMAND_PER_CAPITA.clerics +
       warr * DEMAND_PER_CAPITA.warriors) * rationMult
    );
  }
  return Math.round((city.population_total || 0) * DEMAND_PER_CAPITA_FLAT * rationMult);
}

// Per-city population-driven economy
function computeCityLayerEconomy(city: any, buildingEffects: Record<string, number>) {
  const peas = city.population_peasants || 0;
  const burg = city.population_burghers || 0;
  const cler = city.population_clerics || 0;
  const warr = city.population_warriors || 0;

  // Building multipliers (from completed buildings in this city)
  const prodMult = 1 + (buildingEffects.production_modifier || 0) / 100;
  const wealthMult = 1 + (buildingEffects.wealth_modifier || 0) / 100;
  const capacityMult = 1 + (buildingEffects.capacity_modifier || 0) / 100;
  const faithMult = 1 + (buildingEffects.faith_modifier || 0) / 100;

  // Temple level boosts faith
  const templeBonus = 1 + (city.temple_level || 0) * 0.15;

  // Market level boosts wealth
  const marketBonus = 1 + (city.market_level || 0) * 0.12;

  return {
    production: (peas * PRODUCTION_PER_PEASANT + burg * PRODUCTION_PER_BURGHER) * prodMult,
    wealth: (burg * WEALTH_PER_BURGHER + peas * WEALTH_PER_PEASANT) * wealthMult * marketBonus,
    capacity: (cler * CAPACITY_PER_CLERIC + burg * CAPACITY_PER_BURGHER) * capacityMult,
    faith: (cler * FAITH_PER_CLERIC + warr * FAITH_PER_WARRIOR) * faithMult * templeBonus,
    warriorRatio: (city.population_total || 1) > 0 ? warr / (city.population_total || 1) : 0,
  };
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
    const { sessionId, playerName, recalcOnly } = await req.json();
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

    // Idempotency — skip for recalcOnly (always recompute)
    if (!recalcOnly && realm.last_processed_turn >= currentTurn) {
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

    // ── GOODS ECONOMY LAYER (from compute-trade-flows v4.2) ──
    const goodsProductionValue = realm.goods_production_value || 0;
    const goodsSupplyVolume = realm.goods_supply_volume || 0;
    const goodsWealthFiscal = realm.goods_wealth_fiscal || 0;
    // v4.2: Market share economy — no more legacy blend
    const wealthDomesticComponent = realm.wealth_domestic_component || 0;
    const wealthMarketShare = realm.wealth_market_share || 0;

    logEntries.push(`⚒️ Produkce: ${totalProduction.toFixed(1)} | 💰 Bohatství: ${totalWealth.toFixed(1)} | 🏛️ Kapacita: ${totalCapacity.toFixed(1)}`);
    if (goodsProductionValue > 0) {
      logEntries.push(`📦 Goods v4.2: produkce=${goodsProductionValue.toFixed(1)} zásoby=${goodsSupplyVolume.toFixed(1)} fiskál=${goodsWealthFiscal.toFixed(1)} domestic=${wealthDomesticComponent.toFixed(1)} market=${wealthMarketShare.toFixed(1)}`);
    }

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
    // Capacity-based building speed: if too many active projects, some may be delayed
    const activeBuildingCount = (allBuildings || []).length;
    const capacityBuildLimit = Math.max(2, Math.floor(totalCapacity / 5 + 2)); // Minimum 2 projects at full speed
    const capacityOverload = activeBuildingCount > capacityBuildLimit;
    if (capacityOverload) {
      logEntries.push(`🏛️ Kapacita přetížena: ${activeBuildingCount} staveb vs limit ${capacityBuildLimit} — stavby zpomaleny`);
    }

    for (const b of (allBuildings || [])) {
      // Marble reduces build duration, capacity overload increases it
      const baseDuration = b.build_duration || 1;
      const adjustedDuration = Math.max(1, Math.round(baseDuration * (capacityOverload ? 1.5 : 1.0)));
      const finishTurn = (b.build_started_turn || 0) + adjustedDuration;
      if (currentTurn >= finishTurn) {
        await supabase.from("city_buildings").update({ status: "completed", completed_turn: currentTurn }).eq("id", b.id);
        completedCount++;
        const cityName = myCities.find(c => c.id === b.city_id)?.name || "?";
        logEntries.push(`🏗️ Stavba "${b.name}" v ${cityName} dokončena!`);
      }
    }

    // ══════════════════════════════════════════
    // BUILDING EFFECTS (per-city aggregate)
    // ══════════════════════════════════════════
    const { data: completedBuildings } = await supabase.from("city_buildings")
      .select("city_id, effects").eq("session_id", sessionId).eq("status", "completed")
      .in("city_id", cityIds.length > 0 ? cityIds : ["00000000-0000-0000-0000-000000000000"]);

    // Per-city building effects map
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
    // WORKFORCE & MANPOWER (with warriors)
    // ══════════════════════════════════════════
    const ACTIVE_POP_WEIGHTS = { peasants: 1.0, burghers: 0.7, clerics: 0.2, warriors: 0.9 };
    let activePopRaw = 0, totalPopulation = 0, totalWarriors = 0;
    for (const city of myCities) {
      if (city.status && city.status !== "ok") continue;
      totalPopulation += city.population_total || 0;
      totalWarriors += city.population_warriors || 0;
      activePopRaw += (city.population_peasants || 0) * ACTIVE_POP_WEIGHTS.peasants
                    + (city.population_burghers || 0) * ACTIVE_POP_WEIGHTS.burghers
                    + (city.population_clerics || 0) * ACTIVE_POP_WEIGHTS.clerics
                    + (city.population_warriors || 0) * ACTIVE_POP_WEIGHTS.warriors;
    }
    activePopRaw = Math.floor(activePopRaw);
    const effectiveRatio = Math.max(0.1, Math.min(0.9, 0.5 + activePopModifier));
    const effectiveActivePop = Math.floor(activePopRaw * effectiveRatio);
    const mobRate = realm.mobilization_rate || 0.1;
    const mobilized = Math.floor(effectiveActivePop * mobRate);
    const workforce = effectiveActivePop - mobilized;
    const workforceRatio = effectiveActivePop > 0 ? workforce / effectiveActivePop : 1;
    const warriorRatio = totalPopulation > 0 ? totalWarriors / totalPopulation : 0;

    // Mobilization penalties on economy
    const mobProductionPenalty = mobilized * MOB_PRODUCTION_PENALTY_RATE;
    const mobWealthPenalty = mobilized * MOB_WEALTH_PENALTY_RATE;

    // ══════════════════════════════════════════
    // ARMY UPKEEP + SUPPLY STRAIN + CONSTRUCTION TICK (Stage 7)
    // Upkeep parity: 0.3% gold + 0.4% food per soldier
    // Over-mobilization: ×1.5 upkeep when soft trigger crossed (>10% pop mobilized)
    // ══════════════════════════════════════════
    const { data: stacks } = await supabase.from("military_stacks")
      .select("id, unit_count, soldiers, maintenance_cost, morale, combat_power, assignment, assigned_route_id, construction_progress")
      .eq("session_id", sessionId).eq("owner_player", playerName);

    // Soft over-mobilization trigger (10% pop). Hard 20% cap is enforced on MOBILIZE command.
    const totalSoldiers = (stacks || []).reduce((sum, s) => sum + (s.soldiers || s.unit_count || 0), 0);
    const overMobilized = totalPopulation > 0 && totalSoldiers > Math.floor(totalPopulation * 0.10);
    const upkeepMult = overMobilized ? 1.5 : 1.0;

    let totalArmySize = 0, armyProductionUpkeep = 0, armyWealthUpkeep = 0;
    for (const s of (stacks || [])) {
      const men = s.soldiers || s.unit_count || 0;
      totalArmySize += men;
      // Parity formula: 0.3% gold + 0.4% food per soldier (× over-mobilization mult)
      armyProductionUpkeep += Math.ceil(men * 0.004 * upkeepMult);
      armyWealthUpkeep += Math.ceil(men * 0.003 * upkeepMult);
    }

    // Supply strain = army_size / logistic_capacity
    const currentCapacity = Math.max(5, totalCapacity * 2 + (infra?.roads_level || 0) * 2);
    const supplyStrain = currentCapacity > 0 ? totalArmySize / (currentCapacity * 100) : 0;

    // ── Construction tick: LABOR powers all under_construction routes for this player ──
    // Each route progresses every turn proportionally to its allocated labor (assigned at BUILD_ROUTE).
    // Optional military stack assignment provides a small engineering bonus.
    const ENGINEERING_MULT: Record<string, number> = {
      trail: 1.2, road: 1.0, paved: 0.6, harbor_link: 0.8,
      land_road: 1.0, river_route: 1.1, sea_lane: 0.9, mountain_pass: 0.5, caravan_route: 1.0,
    };

    const { data: playerRoutesUC } = await supabase.from("province_routes")
      .select("id, route_type, construction_state, metadata")
      .eq("session_id", sessionId)
      .eq("construction_state", "under_construction");

    const myUCRoutes = (playerRoutesUC || []).filter(r => ((r.metadata as any)?.built_by) === playerName);

    for (const route of myUCRoutes) {
      const md = (route.metadata || {}) as any;
      const totalWork = Number(md.total_work || 0);
      const currentProgress = Number(md.progress || 0);
      if (totalWork <= 0) continue;

      const allocatedLabor = Number(md.assigned_labor || md.assigned_soldiers || 0);
      // Stacks may still be assigned for a small bonus, but are no longer required.
      const assignedStacks = (stacks || []).filter(
        s => s.assigned_route_id === route.id && s.assignment === "construction",
      );
      const soldierBonus = assignedStacks.reduce((sum, s) => sum + (s.soldiers || s.unit_count || 0), 0);

      const engMult = ENGINEERING_MULT[route.route_type as string] ?? 1.0;
      const baseLaborTick = Math.max(2, Math.round(allocatedLabor * 0.20));
      const workThisTurn = Math.max(1, Math.round((baseLaborTick + soldierBonus * 0.5) * engMult));
      const newProgress = Math.min(totalWork, currentProgress + workThisTurn);
      const willComplete = newProgress >= totalWork;

      if (!willComplete) {
        await supabase.from("province_routes").update({
          metadata: { ...md, progress: newProgress, last_tick_turn: currentTurn },
        }).eq("id", route.id);
        continue;
      }

      // Atomic state-transition guard: only the under_construction → complete transition
      // mutates the row, so a parallel tick cannot emit duplicate route_completed events.
      const { data: completedRows } = await supabase
        .from("province_routes")
        .update({
          construction_state: "complete",
          path_dirty: true,
          completed_at: new Date().toISOString(),
          metadata: { ...md, progress: newProgress, last_tick_turn: currentTurn },
        })
        .eq("id", route.id)
        .eq("construction_state", "under_construction")
        .select("id, construction_generation, node_a, node_b, route_type");

      const transitioned = (completedRows || [])[0];
      if (!transitioned) continue; // someone else already completed it

      if (assignedStacks.length > 0) {
        for (const s of assignedStacks) {
          await supabase.from("military_stacks").update({
            assignment: "idle", assigned_route_id: null,
            construction_progress: (s.construction_progress || 0) + Math.round((s.soldiers || s.unit_count || 0) * engMult),
          }).eq("id", s.id);
        }
      }

      // Idempotent route_completed event (UNIQUE index on session+route_id+construction_generation).
      await supabase.from("game_events").insert({
        session_id: sessionId,
        turn_number: currentTurn,
        event_type: "route_completed",
        player: playerName,
        note: `Stavba cesty dokončena (${route.route_type}).`,
        importance: "normal",
        confirmed: true,
        reference: {
          route_id: route.id,
          construction_generation: transitioned.construction_generation ?? 1,
          route_type: route.route_type,
          node_a: transitioned.node_a,
          node_b: transitioned.node_b,
        },
      } as any);

      // Player-facing construction event (separate, not idempotency-locked).
      newEvents.push({
        session_id: sessionId, turn_number: currentTurn,
        event_type: "construction", player_name: playerName,
        note: `Stavba cesty dokončena (${route.route_type}). Pracovní síla se vrací k běžným úkolům.`,
        importance: "normal", reference: { route_id: route.id, route_type: route.route_type },
      } as any);
    }

    // ══════════════════════════════════════════════════════════════
    // ▶ PER-CITY CIVILIZATIONAL ECONOMY
    // Each city's economy emerges from:
    //   1. Population layers (peasants→prod, burghers→wealth, clerics→capacity/faith)
    //   2. Node network (connectivity, isolation, flow role)
    //   3. Buildings (per-city multipliers)
    //   4. Mobilization penalties
    // ══════════════════════════════════════════════════════════════
    const grainRationMult = 1 + (grainRationModifier / 100);
    let globalGrainReserve = realm.grain_reserve || 0;
    let famineCityCount = 0;
    let totalDemand = 0;
    let totalCityProduction = 0;
    let totalCityWealth = 0;
    let totalCityCapacity = 0;
    let totalFaith = 0;

    // ══════════════════════════════════════════
    // STRATEGIC RESOURCE BONUSES (all 11 types)
    // ══════════════════════════════════════════
    const strategicBonuses = {
      combat_mult: 1.0,
      wealth_mult: 1.0,
      faith_bonus: 0,
      supply_bonus: 0,
      stability_bonus: 0,
      build_cost_mult: 1.0,
      travel_cost_mult: 1.0,
      mobility: 1.0,
      diplomacy_bonus: 0,
    };
    const resourceKeys = ["iron", "horses", "salt", "copper", "gold", "marble", "gems", "timber", "obsidian", "silk", "incense"];
    const tierColumns: Record<string, string> = {
      iron: "strategic_iron_tier", horses: "strategic_horses_tier", salt: "strategic_salt_tier",
      copper: "strategic_copper_tier", gold: "strategic_gold_tier", marble: "strategic_marble_tier",
      gems: "strategic_gems_tier", timber: "strategic_timber_tier", obsidian: "strategic_obsidian_tier",
      silk: "strategic_silk_tier", incense: "strategic_incense_tier",
    };
    for (const rk of resourceKeys) {
      const tier = realm[tierColumns[rk]] || 0;
      if (tier <= 0) continue;
      const bonus = STRATEGIC_TIER_BONUSES[rk]?.[tier];
      if (!bonus) continue;
      if (bonus.combat_mult) strategicBonuses.combat_mult *= bonus.combat_mult;
      if (bonus.wealth_mult) strategicBonuses.wealth_mult *= bonus.wealth_mult;
      if (bonus.faith_bonus) strategicBonuses.faith_bonus += bonus.faith_bonus;
      if (bonus.supply_bonus) strategicBonuses.supply_bonus += bonus.supply_bonus;
      if (bonus.stability_bonus) strategicBonuses.stability_bonus += bonus.stability_bonus;
      if (bonus.build_cost_mult) strategicBonuses.build_cost_mult *= bonus.build_cost_mult;
      if (bonus.travel_cost_mult) strategicBonuses.travel_cost_mult *= bonus.travel_cost_mult;
      if (bonus.mobility) strategicBonuses.mobility = Math.max(strategicBonuses.mobility, bonus.mobility);
      if (bonus.diplomacy_bonus) strategicBonuses.diplomacy_bonus += bonus.diplomacy_bonus;
    }
    logEntries.push(`🎖️ Suroviny: ⚔️×${strategicBonuses.combat_mult.toFixed(2)} 💰×${strategicBonuses.wealth_mult.toFixed(2)} ⛪+${strategicBonuses.faith_bonus} 🌾+${(strategicBonuses.supply_bonus * 100).toFixed(0)}%`);

    // ══════════════════════════════════════════
    // PRESTIGE EFFECTS (from physics.ts)
    // ══════════════════════════════════════════
    const prestigeEffects = computePrestigeEffects(
      realm.military_prestige || 0,
      realm.economic_prestige || 0,
      realm.cultural_prestige || 0,
    );
    logEntries.push(`⭐ Prestiž: morále+${prestigeEffects.moraleBonus} obchod×${prestigeEffects.tradeMultiplier.toFixed(2)} stab+${prestigeEffects.stabilityBonus} růst+${(prestigeEffects.popGrowthBonus * 100).toFixed(1)}%`);

    // ══════════════════════════════════════════
    // LABOR ALLOCATION MODIFIERS (per-city averaged)
    // ══════════════════════════════════════════
    let avgFarming = 0, avgCrafting = 0, avgScribes = 0, avgMaintenance = 0;
    let laborCityCount = 0;
    for (const city of myCities) {
      const labor = (city.labor_allocation && typeof city.labor_allocation === "object") ? city.labor_allocation as any : null;
      if (labor && (labor.farming || labor.crafting || labor.scribes || labor.maintenance)) {
        avgFarming += (labor.farming || 25);
        avgCrafting += (labor.crafting || 25);
        avgScribes += (labor.scribes || 25);
        avgMaintenance += (labor.maintenance || 25);
        laborCityCount++;
      }
    }
    if (laborCityCount > 0) {
      avgFarming /= laborCityCount;
      avgCrafting /= laborCityCount;
      avgScribes /= laborCityCount;
      avgMaintenance /= laborCityCount;
    } else {
      avgFarming = 25; avgCrafting = 25; avgScribes = 25; avgMaintenance = 25;
    }
    // Labor modifiers: deviation from 25% baseline (each ±1% = ±2% effect)
    const laborGrainMult = 1 + (avgFarming - 25) * 0.02;
    const laborWealthMult = 1 + (avgCrafting - 25) * 0.02;
    const laborCapacityMult = 1 + (avgScribes - 25) * 0.02;
    const laborStabilityBonus = (avgMaintenance - 25) * 0.1; // ±2.5 stability per tick
    logEntries.push(`👷 Práce: 🌾×${laborGrainMult.toFixed(2)} 💰×${laborWealthMult.toFixed(2)} 🏛️×${laborCapacityMult.toFixed(2)} stab${laborStabilityBonus >= 0 ? "+" : ""}${laborStabilityBonus.toFixed(1)}`);

    // Per-city breakdown for reporting
    const cityEconResults: Array<{
      cityId: string; cityName: string;
      nodeProduction: number; layerProduction: number;
      layerWealth: number; layerCapacity: number; layerFaith: number;
      demand: number; balance: number;
      isolationPenalty: number; famine: boolean;
    }> = [];

    for (const city of myCities) {
      const cityDemand = Math.max(1, Math.round(computeCityDemand(city) * grainRationMult));
      totalDemand += cityDemand;

      // ── Population layer economy ──
      const bldgEff = cityBuildingEffects[city.id] || {};
      const layers = computeCityLayerEconomy(city, bldgEff);

      // ── Node network production ──
      const node = cityNodeMap.get(city.id);
      let nodeProduction = 0;
      let isolationPenalty = 0;

      if (node) {
        nodeProduction = node.production_output || 0;
        nodeProduction += (node.incoming_production || 0) * 0.5;
        const roleMult = FLOW_ROLE_PRODUCTION_MULT[node.flow_role] || 1.0;
        nodeProduction *= roleMult;
        isolationPenalty = node.isolation_penalty || 0;

        const supply = supplyMap.get(node.id);
        if (supply && !supply.connected_to_capital) {
          const isoTurns = supply.isolation_turns || 0;
          const supplyMult = Math.max(0.3, 1 - isoTurns * 0.1);
          nodeProduction *= supplyMult;
          // Isolation also hits wealth and capacity
          layers.wealth *= supplyMult;
          layers.capacity *= Math.max(0.5, supplyMult);

          if (isoTurns >= 3) {
            newEvents.push({
              event_type: "city_isolated",
              note: `${city.name} je ${isoTurns} kol odříznuto od hlavního města. Zásobování selhává.`,
              importance: isoTurns >= 5 ? "critical" : "important",
              city_id: city.id,
              reference: { isolation_turns: isoTurns, supply_mult: supplyMult, node_id: node.id },
            });
          }
        }
      } else {
        const cityShare = totalPopulation > 0 ? (city.population_total || 0) / totalPopulation : 1 / Math.max(1, myCities.length);
        nodeProduction = totalProduction * cityShare;
      }

      // v4.2: No more legacy/goods blend — production uses node layers + goods production directly
      const cityPopShare = totalPopulation > 0 ? (city.population_total || 0) / totalPopulation : 1 / Math.max(1, myCities.length);
      const goodsCityProduction = goodsProductionValue * cityPopShare;
      const cityProduction = (nodeProduction + layers.production) * laborGrainMult + goodsCityProduction;

      // v4.2: City wealth comes from Pillar 2 (domestic + market share), distributed by market level
      const totalMarketLevelAll = myCities.reduce((s, c) => s + (c.market_level || 1), 0) || 1;
      const cityMarketShare = (city.market_level || 1) / totalMarketLevelAll;
      const cityWealth = layers.wealth * laborWealthMult * strategicBonuses.wealth_mult * prestigeEffects.tradeMultiplier;
      const cityCapacity = layers.capacity * laborCapacityMult;
      const cityFaith = layers.faith + strategicBonuses.faith_bonus * 0.1; // Strategic faith distributed per-city

      // Apply labor stability + strategic stability + prestige stability to city
      const stabilityDelta = laborStabilityBonus + strategicBonuses.stability_bonus * 0.1 + prestigeEffects.stabilityBonus * 0.1;
      if (Math.abs(stabilityDelta) > 0.05) {
        const currentStab = city.city_stability || 50;
        const newStab = Math.max(0, Math.min(100, currentStab + stabilityDelta));
        if (Math.round(newStab) !== Math.round(currentStab)) {
          await supabase.from("cities").update({ city_stability: Math.round(newStab) }).eq("id", city.id);
        }
      }

      totalCityProduction += cityProduction;
      totalCityWealth += cityWealth;
      totalCityCapacity += cityCapacity;
      totalFaith += cityFaith;

      // Per-city food balance
      const cityBalance = cityProduction - cityDemand;
      const cityFamine = cityBalance < 0 && globalGrainReserve <= 0;

      if (cityBalance >= 0) {
        globalGrainReserve += cityBalance * 0.5;
      } else {
        globalGrainReserve += cityBalance;
      }

      if (cityFamine) {
        famineCityCount++;
        const newStability = Math.max(0, (city.city_stability || 50) - 5);
        const deathToll = Math.floor((city.population_total || 0) * 0.05);
        await supabase.from("cities").update({
          city_stability: newStability,
          population_peasants: Math.max(0, (city.population_peasants || 0) - Math.floor(deathToll * 0.7)),
          population_burghers: Math.max(0, (city.population_burghers || 0) - Math.floor(deathToll * 0.15)),
          population_warriors: Math.max(0, (city.population_warriors || 0) - Math.floor(deathToll * 0.1)),
          population_clerics: Math.max(0, (city.population_clerics || 0) - Math.floor(deathToll * 0.05)),
          famine_turn: true,
          famine_consecutive_turns: (city.famine_consecutive_turns || 0) + 1,
        }).eq("id", city.id);

        logEntries.push(`⚠️ Hladomor v ${city.name}! Ztráta ${deathToll} obyvatel.`);
        newEvents.push({
          event_type: "famine",
          note: `Hladomor zachvátil ${city.name}. Produkce (${cityProduction.toFixed(1)}) nestačí na pokrytí poptávky (${cityDemand}). Zemřelo ${deathToll} obyvatel.`,
          importance: "critical",
          city_id: city.id,
          reference: { production: cityProduction, demand: cityDemand, death_toll: deathToll, isolation: isolationPenalty },
        });
      } else {
        if (city.famine_turn) {
          await supabase.from("cities").update({ famine_turn: false, famine_consecutive_turns: 0 }).eq("id", city.id);
        }
      }

      // Trade boom event for hub nodes
      if (node && layers.wealth > 3 && node.flow_role === "hub") {
        newEvents.push({
          event_type: "trade_boom",
          note: `Obchodní centrum ${city.name} zažívá rozkvět. Bohatství: ${layers.wealth.toFixed(1)}.`,
          importance: "normal",
          city_id: city.id,
          reference: { wealth: layers.wealth, flow_role: node.flow_role },
        });
      }

      cityEconResults.push({
        cityId: city.id, cityName: city.name,
        nodeProduction: Math.round(nodeProduction * 10) / 10,
        layerProduction: Math.round(layers.production * 10) / 10,
        layerWealth: Math.round(layers.wealth * 10) / 10,
        layerCapacity: Math.round(layers.capacity * 10) / 10,
        layerFaith: Math.round(layers.faith * 10) / 10,
        demand: cityDemand,
        balance: Math.round((cityProduction - cityDemand) * 10) / 10,
        isolationPenalty: Math.round(isolationPenalty * 100),
        famine: cityFamine,
      });
    }

    // ══════════════════════════════════════════════════════════════
    // ▶ POPULATION GROWTH & DEMOGRAPHICS
    // NOTE: Growth is handled by commit-turn/runWorldTickEvents via
    // computeSettlementGrowth() from _shared/physics.ts.
    // Removed from here to prevent duplicate growth.
    // ══════════════════════════════════════════════════════════════

    // Apply mobilization penalties to totals
    totalCityProduction = Math.max(0, totalCityProduction - mobProductionPenalty);
    totalCityWealth = Math.max(0, totalCityWealth - mobWealthPenalty);

    // v4.2: Goods supply supplements grain reserve directly (no blend)
    if (goodsSupplyVolume > 0) {
      const goodsSupplyBonus = Math.round(goodsSupplyVolume);
      globalGrainReserve += goodsSupplyBonus;
      logEntries.push(`📦 Goods zásoby: +${goodsSupplyBonus}`);
    }
    // Small empire buffer
    if (myCities.length <= 3) globalGrainReserve += 10;
    // Strategic salt supply bonus
    if (strategicBonuses.supply_bonus > 0) {
      const saltBonus = Math.round(globalGrainReserve * strategicBonuses.supply_bonus);
      globalGrainReserve += saltBonus;
      logEntries.push(`🧂 Solný bonus: +${saltBonus} zásob`);
    }
    // Army upkeep from global reserve
    globalGrainReserve -= armyProductionUpkeep;
    // Cap (salt also increases granary capacity)
    const adjustedGranary = Math.round(granaryCapacity * (1 + strategicBonuses.supply_bonus));
    globalGrainReserve = Math.max(0, Math.min(adjustedGranary, globalGrainReserve));

    const netProduction = totalCityProduction - totalDemand - armyProductionUpkeep;

    // ══════════════════════════════════════════════════════════════
    // ▶ WEALTH: 4-Pillar Model (unified, no magic blend)
    //   1. Population Tax   — flat per-capita levy
    //   2. Domestic Market   — capital market mechanism (compute-economy-flow)
    //   3. Goods Fiscal      — tax_market + tax_transit + tax_extraction + capture
    //   4. Route Commerce    — secondary wealth from trade corridor volume
    // ══════════════════════════════════════════════════════════════
    const ROUTE_COMMERCE_RATE = 0.05;        // Tuning knob: wealth per unit of effective route capacity

    const taxMult = 1 + (taxRateModifier / 100);
    // Strategic resource wealth multipliers
    const copperMult = STRATEGIC_TIER_BONUSES.copper[realm.strategic_copper_tier || 0]?.wealth_mult || 1.0;
    const goldMult = STRATEGIC_TIER_BONUSES.gold[realm.strategic_gold_tier || 0]?.wealth_mult || 1.0;

    // ── Pillar 1: Population Tax (centrální odvod) ──
    const populationTaxBase = totalCityWealth * copperMult * goldMult;
    const pillarPopTax = Math.round(populationTaxBase * taxMult * 10) / 10;

    // ── Pillar 2: Trade & Market (v4.2 — from compute-trade-flows) ──
    // domestic_component * 0.4 + market_share * 0.6
    const PILLAR2_DOMESTIC_WEIGHT = 0.4;
    const PILLAR2_MARKET_WEIGHT = 0.6;
    const pillarDomesticMarket = Math.round(
      (wealthDomesticComponent * PILLAR2_DOMESTIC_WEIGHT + wealthMarketShare * PILLAR2_MARKET_WEIGHT) * 10
    ) / 10;

    // ── Pillar 3: Goods Fiscal (already computed by compute-trade-flows) ──
    const goodsTaxMarketPillar = realm.tax_market || 0;
    const goodsTaxTransitPillar = realm.tax_transit || 0;
    const goodsTaxExtractionPillar = realm.tax_extraction || 0;
    const goodsCapturePillar = realm.commercial_capture || 0;
    const pillarGoodsFiscal = Math.round((goodsTaxMarketPillar + goodsTaxTransitPillar + goodsTaxExtractionPillar + goodsCapturePillar) * 10) / 10;

    // ── Pillar 4: Route Commerce (monetizace průtoku tras) ──
    let pillarRouteCommerce = 0;
    const playerRoutes = allRoutes.filter(r => {
      const nodeA = nodeMap.get(r.node_a);
      const nodeB = nodeMap.get(r.node_b);
      return (nodeA?.controlled_by === playerName || nodeB?.controlled_by === playerName);
    });
    for (const route of playerRoutes) {
      const damagePenalty = Math.min((route.damage_level || 0) * 0.1, 0.9);
      const effectiveCapacity = (route.capacity_value || 0) * (1 - damagePenalty);
      // Control factor: both ends owned = 1.0, one end = 0.5, contested = 0.25
      const nodeA = nodeMap.get(route.node_a);
      const nodeB = nodeMap.get(route.node_b);
      const ownA = nodeA?.controlled_by === playerName;
      const ownB = nodeB?.controlled_by === playerName;
      const controlFactor = (ownA && ownB) ? 1.0 : (ownA || ownB) ? 0.5 : 0.25;
      // Economic relevance from connected nodes
      const econRelevance = Math.max(nodeA?.importance_score || 0, nodeB?.importance_score || 0) * 0.1 + 0.5;
      pillarRouteCommerce += effectiveCapacity * econRelevance * controlFactor * ROUTE_COMMERCE_RATE;
    }
    pillarRouteCommerce = Math.round(pillarRouteCommerce * 10) / 10;

    // ── Total Wealth Income ──
    const totalWealthIncome = pillarPopTax + pillarDomesticMarket + pillarGoodsFiscal + pillarRouteCommerce;
    const wealthIncome = Math.max(0, Math.round(totalWealthIncome));
    const combinedWealth = totalWealthIncome; // For backward compat references
    const sportFundingPct = realm.sport_funding_pct || 0;
    let newGoldReserve = (realm.gold_reserve || 0) + wealthIncome - armyWealthUpkeep;

    logEntries.push(`💰 Wealth 4-pilíře: Pop=${pillarPopTax} Trh=${pillarDomesticMarket} Goods=${pillarGoodsFiscal} Trasy=${pillarRouteCommerce} → celkem=${wealthIncome}`);

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
    // ══════════════════════════════════════════
    // MANPOWER (warriors contribute elite officers)
    // ══════════════════════════════════════════
    let manpowerGrowth = 0;
    for (const c of myCities) {
      // Peasants provide bulk manpower, warriors provide quality
      manpowerGrowth += Math.floor((c.population_peasants || 0) * 0.015);
      manpowerGrowth += Math.floor((c.population_warriors || 0) * 0.005); // Small elite contribution
    }
    const mobilizationSpeed = civIdentity?.mobilization_speed || 1.0;
    manpowerGrowth = Math.floor(manpowerGrowth * mobilizationSpeed);
    const manpowerPool = (realm.manpower_pool || 0) + manpowerGrowth;

    // ══════════════════════════════════════════
    // CAPACITY → LOGISTICS (layers + nodes)
    // ══════════════════════════════════════════
    const logisticCapacity = Math.max(5,
      Math.round(totalCapacity * 2 + totalCityCapacity) + (infra?.roads_level || 0) * 2
    );

    // ══════════════════════════════════════════
    // FAITH (new axis: clerics + temples)
    // ══════════════════════════════════════════
    const currentFaith = realm.faith || 0;
    // Faith grows from clerics + strategic bonuses (gems, obsidian, incense), decays naturally
    const faithDecay = Math.max(0, currentFaith * 0.02); // 2% natural decay
    const faithGrowth = totalFaith + strategicBonuses.faith_bonus - faithDecay;
    const newFaith = Math.max(0, Math.min(100, currentFaith + faithGrowth));
    // Faith effects: morale bonus, mobilization willingness, rebellion threshold
    const faithMoraleMult = 1 + newFaith * 0.003; // Up to +30% morale at faith=100
    const faithMobWillingness = newFaith > 50 ? 0.05 : (newFaith < 20 ? -0.05 : 0);
    // Faith raises rebellion threshold (high faith = people tolerate more instability)
    const faithStabilityBuffer = Math.round(newFaith * 0.1); // Up to +10 stability buffer

    // ══════════════════════════════════════════
    // APPLY FAITH & STRATEGIC COMBAT TO MILITARY
    // ══════════════════════════════════════════
    if ((stacks || []).length > 0 && (faithMoraleMult > 1.001 || strategicBonuses.combat_mult > 1.001 || prestigeEffects.moraleBonus > 0)) {
      for (const s of (stacks || [])) {
        const currentMorale = s.morale ?? 70;
        // Faith morale: drift toward faith-based ceiling
        const faithMoraleCeiling = Math.min(100, 60 + newFaith * 0.4); // 60-100 based on faith
        const moraleDrift = currentMorale < faithMoraleCeiling ? Math.min(3, faithMoraleCeiling - currentMorale) : 0;
        const prestigeMoraleDrift = prestigeEffects.moraleBonus * 0.2; // Prestige slowly boosts morale
        const newMorale = Math.max(0, Math.min(100, Math.round(currentMorale + moraleDrift + prestigeMoraleDrift)));

        // Strategic combat power bonus (iron, obsidian)
        const basePower = s.combat_power || s.unit_count || 0;
        const adjustedPower = Math.round(basePower * strategicBonuses.combat_mult);

        if (newMorale !== currentMorale || adjustedPower !== basePower) {
          await supabase.from("military_stacks").update({
            morale: newMorale,
            combat_power: adjustedPower,
          }).eq("id", s.id);
        }
      }
      logEntries.push(`⚔️ Armáda: morále×${faithMoraleMult.toFixed(2)} síla×${strategicBonuses.combat_mult.toFixed(2)} prestiž+${prestigeEffects.moraleBonus}`);
    }

    // ══════════════════════════════════════════
    // SUPPLY STRAIN EVENTS
    // ══════════════════════════════════════════
    if (supplyStrain > SUPPLY_STRAIN_THRESHOLDS.collapsing) {
      newEvents.push({
        event_type: "supply_collapse",
        note: `Zásobování armády kolabuje! Armáda (${totalArmySize} mužů) přesahuje logistickou kapacitu (${Math.round(currentCapacity * 100)}). Očekávejte ztráty a dezerci.`,
        importance: "critical",
        reference: { army_size: totalArmySize, capacity: currentCapacity, strain: supplyStrain },
      });
    } else if (supplyStrain > SUPPLY_STRAIN_THRESHOLDS.strained) {
      newEvents.push({
        event_type: "supply_strained",
        note: `Zásobovací linie jsou pod tlakem. Armáda operuje na ${Math.round(supplyStrain * 100)}% kapacity.`,
        importance: "important",
        reference: { army_size: totalArmySize, capacity: currentCapacity, strain: supplyStrain },
      });
    }

    // Mobilization unrest event
    if (mobRate > 0.25 && faithMobWillingness <= 0) {
      newEvents.push({
        event_type: "mobilization_pressure",
        note: `Vysoká mobilizace (${Math.round(mobRate * 100)}%) způsobuje nepokoje. ${newFaith < 30 ? "Nízká víra zhoršuje situaci." : ""}`,
        importance: mobRate > 0.4 ? "critical" : "important",
        reference: { mobilization_rate: mobRate, faith: newFaith, production_penalty: mobProductionPenalty },
      });
    }

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
    // PRESTIGE COMPUTATION (6 sub-types, hybrid)
    // ══════════════════════════════════════════
    // Military prestige: army size, battles won, strategic nodes
    const { data: battlesWon } = await supabase.from("battles")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .or(`attacker_stack_id.in.(${(stacks || []).map((s: any) => s.id).join(",")})`);
    const battlesWonCount = battlesWon || 0;
    const militaryPrestige = Math.min(100,
      Math.floor(totalArmySize / 500) +  // +1 per 500 soldiers
      (typeof battlesWonCount === 'number' ? battlesWonCount * 5 : 0) +  // +5 per victory
      Math.floor((realm.strategic_iron_tier || 0) * 2) +
      Math.floor((realm.strategic_horses_tier || 0) * 2) +
      Math.floor((realm.strategic_obsidian_tier || 0) * 3)
    );

    // Cultural prestige: wonders, unique buildings, academies
    const { data: wonderCount } = await supabase.from("city_buildings")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId).eq("is_wonder", true).eq("status", "completed")
      .in("city_id", cityIds.length > 0 ? cityIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data: uniqueCount } = await supabase.from("city_buildings")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId).eq("is_ai_generated", true).eq("status", "completed")
      .in("city_id", cityIds.length > 0 ? cityIds : ["00000000-0000-0000-0000-000000000000"]);
    const polisCount = myCities.filter(c => c.settlement_level === "polis" || c.settlement_level === "metropolis").length;
    const culturalPrestige = Math.min(100,
      (typeof wonderCount === 'number' ? wonderCount : 0) * 20 +
      (typeof uniqueCount === 'number' ? uniqueCount : 0) * 3 +
      polisCount * 5 +
      Math.floor((realm.strategic_marble_tier || 0) * 3) +
      Math.floor((realm.strategic_gems_tier || 0) * 2)
    );

    // Economic prestige: wealth flow, trade routes, market levels
    const activeTradeCount = (activeTradeRoutes || []).length;
    const totalMarketLevel = myCities.reduce((s, c) => s + (c.market_level || 0), 0);
    const economicPrestige = Math.min(100,
      Math.floor(wealthIncome / 10) +
      activeTradeCount * 2 +
      totalMarketLevel +
      Math.floor((realm.strategic_copper_tier || 0) * 1) +
      Math.floor((realm.strategic_gold_tier || 0) * 4) +
      Math.floor((realm.strategic_silk_tier || 0) * 3)
    );

    // Sport prestige: from existing sport_prestige + academies
    const { data: acadCount } = await supabase.from("academies")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId).eq("player_name", playerName);
    const sportPrestige = Math.min(100,
      (realm.sport_prestige || 0) +
      (typeof acadCount === 'number' ? acadCount : 0) * 2
    );

    // Geopolitical prestige: provinces, alliances, city states
    const { data: provCount } = await supabase.from("provinces")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId).eq("owner_player", playerName);
    const allianceCount = allPacts.filter(p => p.pact_type === "alliance" && p.status === "active").length;
    const vassalCount = allPacts.filter(p => p.pact_type === "vassalage" && p.status === "active").length;
    const geopoliticalPrestige = Math.min(100,
      (typeof provCount === 'number' ? provCount : 0) +
      allianceCount * 3 +
      vassalCount * 5
    );

    // Technological prestige: strategic resource diversity + infrastructure
    const stratTiers = [
      realm.strategic_iron_tier, realm.strategic_horses_tier, realm.strategic_salt_tier,
      realm.strategic_copper_tier, realm.strategic_gold_tier, realm.strategic_marble_tier,
      realm.strategic_gems_tier, realm.strategic_timber_tier, realm.strategic_obsidian_tier,
      realm.strategic_silk_tier, realm.strategic_incense_tier,
    ].filter((t: number) => (t || 0) > 0);
    const technologicalPrestige = Math.min(100,
      stratTiers.length * 3 +  // +3 per unique resource type
      stratTiers.reduce((s: number, t: number) => s + (t || 0), 0) * 2 +  // +2 per tier level
      (infra?.roads_level || 0) * 2 +
      Math.floor(logisticCapacity / 10)
    );

    // ══════════════════════════════════════════
    // PRESTIGE THRESHOLD BONUSES (hybrid: continuous + milestone)
    // ══════════════════════════════════════════
    const totalPrestige = militaryPrestige + culturalPrestige + economicPrestige +
      sportPrestige + geopoliticalPrestige + technologicalPrestige;

    // Continuous bonuses: +0.1% wealth per prestige point, +0.05% stability
    const prestigeWealthBonus = Math.round(wealthIncome * totalPrestige * 0.001);
    newGoldReserve += prestigeWealthBonus;

    // Milestone bonuses applied as events
    const prevPrestige = (realm.military_prestige || 0) + (realm.cultural_prestige || 0) +
      (realm.economic_prestige || 0) + (realm.sport_prestige || 0) +
      (realm.geopolitical_prestige || 0) + (realm.technological_prestige || 0);

    const PRESTIGE_MILESTONES = [
      { threshold: 20, label: "Regionální", event: "prestige_milestone" },
      { threshold: 50, label: "Kontinentální", event: "prestige_milestone" },
      { threshold: 100, label: "Světová velmoc", event: "prestige_milestone" },
      { threshold: 200, label: "Legendární", event: "prestige_milestone" },
    ];
    for (const ms of PRESTIGE_MILESTONES) {
      if (totalPrestige >= ms.threshold && prevPrestige < ms.threshold) {
        newEvents.push({
          event_type: ms.event,
          note: `Vaše říše dosáhla statusu "${ms.label}" s celkovou prestiží ${totalPrestige}!`,
          importance: "critical",
          reference: { total_prestige: totalPrestige, tier: ms.label },
        });
      }
    }

    // ══════════════════════════════════════════
    // UPDATE REALM RESOURCES (with faith + prestige + supply strain + mobilization penalties)
    // ══════════════════════════════════════════
    // Production reserve accumulation: totalCityProduction (net of army upkeep) added each turn
    const productionIncome = Math.max(0, Math.round(totalCityProduction - armyProductionUpkeep));
    const newProductionReserve = Math.max(0, (realm.production_reserve || 0) + productionIncome);

    // ── Goods economy: fiscal data now handled by 4-pillar model (pillar 3) ──
    // No longer adding goodsFiscalBonus separately — it's already in wealthIncome.
    const goodsRetention = realm.commercial_retention || 0;

    // ── Demand basket feedback → city stability & population ──
    // Load demand baskets computed by compute-trade-flows
    const { data: demandBaskets } = await supabase.from("demand_baskets")
      .select("city_id, basket_type, satisfaction, deficit_volume")
      .eq("session_id", sessionId);

    if (demandBaskets && demandBaskets.length > 0) {
      // Group by city
      const basketsByCity = new Map<string, any[]>();
      for (const b of demandBaskets) {
        const arr = basketsByCity.get(b.city_id) || [];
        arr.push(b);
        basketsByCity.set(b.city_id, arr);
      }

      for (const city of myCities) {
        const baskets = basketsByCity.get(city.id) || [];
        if (baskets.length === 0) continue;

        // Avg satisfaction across all baskets
        const avgSat = baskets.reduce((s: number, b: any) => s + (b.satisfaction || 0), 0) / baskets.length;
        // Staple food satisfaction drives population
        const stapleSat = baskets.find((b: any) => b.basket_type === "staple_food")?.satisfaction || 0;
        // Ritual satisfaction drives faith
        const ritualSat = baskets.find((b: any) => b.basket_type === "ritual")?.satisfaction || 0;

        // Stability drift from demand fulfillment
        let stabilityDrift = 0;
        if (avgSat > 0.8) stabilityDrift = 2;      // Well-supplied
        else if (avgSat > 0.5) stabilityDrift = 0;  // OK
        else if (avgSat > 0.3) stabilityDrift = -2;  // Under-supplied
        else stabilityDrift = -5;                      // Critical shortage

        // Population growth modifier from staple fulfillment
        let popGrowthMod = 0;
        if (stapleSat > 0.8) popGrowthMod = 0.002;   // +0.2% bonus growth
        else if (stapleSat < 0.3) popGrowthMod = -0.003; // -0.3% growth penalty

        // Apply stability drift
        const newStability = Math.max(0, Math.min(100, (city.city_stability || 50) + stabilityDrift));
        const popDelta = Math.round((city.population_total || 0) * popGrowthMod);

        if (stabilityDrift !== 0 || popDelta !== 0) {
          const updates: any = {};
          if (stabilityDrift !== 0) updates.city_stability = newStability;
          if (popDelta !== 0) {
            updates.population_total = Math.max(10, (city.population_total || 0) + popDelta);
            updates.population_peasants = Math.max(5, (city.population_peasants || 0) + Math.round(popDelta * 0.6));
          }
          await supabase.from("cities").update(updates).eq("id", city.id);
        }

        // Generate events for critical shortages
        if (avgSat < 0.3) {
          newEvents.push({
            event_type: "goods_shortage_crisis",
            note: `${city.name}: Kritický nedostatek goods — spokojenost basketů ${Math.round(avgSat * 100)}%. Stabilita klesá.`,
            importance: "critical",
            city_id: city.id,
            reference: { satisfaction: avgSat, staple: stapleSat, stability_drift: stabilityDrift },
          });
        }

        // Ritual satisfaction → faith bonus
        if (ritualSat > 0.7) {
          const ritualFaithBonus = ritualSat * 2;
          // Will be added to faith below
          newEvents.push({
            event_type: "ritual_economy_strong",
            note: `${city.name}: Silná rituální ekonomika — chrámové zásobování na ${Math.round(ritualSat * 100)}%.`,
            importance: "minor",
            city_id: city.id,
            reference: { ritual_satisfaction: ritualSat, faith_bonus: ritualFaithBonus },
          });
        }
      }
    }

    // ── Guild level progression ──
    const { data: guildNodes } = await supabase.from("province_nodes")
      .select("id, guild_level, specialization_scores, city_id, controlled_by, name")
      .eq("session_id", sessionId)
      .eq("controlled_by", playerName)
      .not("guild_level", "is", null);

    if (guildNodes) {
      for (const gn of guildNodes) {
        const guildLevel = gn.guild_level || 0;
        const scores = (gn.specialization_scores || {}) as Record<string, number>;
        const totalSpec = Object.values(scores).reduce((s, v) => s + v, 0);

        // Guild levels up when specialization accumulates enough
        // Thresholds: level 1→2 at 10 spec, 2→3 at 30, 3→4 at 60, 4→5 at 100
        const thresholds = [0, 10, 30, 60, 100];
        let newLevel = guildLevel;
        for (let lvl = guildLevel + 1; lvl <= 5; lvl++) {
          if (totalSpec >= (thresholds[lvl - 1] || 999)) newLevel = lvl;
          else break;
        }

        if (newLevel > guildLevel) {
          await supabase.from("province_nodes").update({ guild_level: newLevel }).eq("id", gn.id);
          
          newEvents.push({
            event_type: "guild_established",
            note: `Cech v "${gn.name}" dosáhl úrovně ${newLevel}! Kvalita produkce se zvyšuje.`,
            importance: newLevel >= 4 ? "critical" : "important",
            reference: { node_id: gn.id, guild_level: newLevel, specialization: totalSpec },
          });

          // Famous goods emergence at guild level 4+
          if (newLevel >= 4) {
            const topBranch = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
            if (topBranch) {
              newEvents.push({
                event_type: "famous_good_created",
                note: `"${gn.name}" je nyní proslulé svou produkcí "${topBranch[0]}"! Přitahuje obchodníky a zvyšuje prestiž.`,
                importance: "critical",
                reference: { node_id: gn.id, branch: topBranch[0], mastery: topBranch[1], guild_level: newLevel },
              });
            }
          }
        }
      }
    }

    // Pop tax derived from goods layer (kept for backward compat in computed_modifiers)
    const goodsPopTax = Math.round(totalPopulation * 0.002 * (1 + myCities.filter(c => c.settlement_level === "polis" || c.settlement_level === "metropolis").length * 0.1));

    await supabase.from("realm_resources").update({
      grain_reserve: Math.round(globalGrainReserve),
      granary_capacity: adjustedGranary,
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
      production_reserve: newProductionReserve,
      famine_city_count: famineCityCount,
      faith: Math.round(newFaith * 100) / 100,
      faith_growth: Math.round(faithGrowth * 100) / 100,
      warrior_ratio: Math.round(warriorRatio * 1000) / 1000,
      supply_strain: Math.round(supplyStrain * 1000) / 1000,
      mobilization_production_penalty: Math.round(mobProductionPenalty * 10) / 10,
      mobilization_wealth_penalty: Math.round(mobWealthPenalty * 10) / 10,
      // ── Stage 7: explicit manpower & military upkeep ledger ──
      manpower_available: Math.max(0, manpowerPool - totalSoldiers),
      manpower_mobilized: totalSoldiers,
      over_mobilized: overMobilized,
      military_gold_upkeep: armyWealthUpkeep,
      military_food_upkeep: armyProductionUpkeep,
      last_turn_faith_delta: Math.round(faithGrowth * 100) / 100,
      // Goods economy fiscal columns (fix: was tax_pop, correct column is tax_population)
      tax_population: goodsPopTax,
      // ── 4-Pillar Wealth Breakdown ──
      wealth_pop_tax: pillarPopTax,
      wealth_domestic_market: pillarDomesticMarket,
      goods_wealth_fiscal: pillarGoodsFiscal,
      wealth_route_commerce: pillarRouteCommerce,
      // Prestige sub-types
      military_prestige: militaryPrestige,
      cultural_prestige: culturalPrestige,
      economic_prestige: economicPrestige,
      sport_prestige: sportPrestige,
      geopolitical_prestige: geopoliticalPrestige,
      technological_prestige: technologicalPrestige,
      // All computed gameplay modifiers for UI display
      computed_modifiers: {
        strategic: {
          combat_mult: Math.round(strategicBonuses.combat_mult * 1000) / 1000,
          wealth_mult: Math.round(strategicBonuses.wealth_mult * 1000) / 1000,
          faith_bonus: strategicBonuses.faith_bonus,
          supply_bonus: Math.round(strategicBonuses.supply_bonus * 1000) / 1000,
          stability_bonus: strategicBonuses.stability_bonus,
          build_cost_mult: Math.round(strategicBonuses.build_cost_mult * 1000) / 1000,
          travel_cost_mult: Math.round(strategicBonuses.travel_cost_mult * 1000) / 1000,
          mobility: strategicBonuses.mobility,
          diplomacy_bonus: strategicBonuses.diplomacy_bonus,
        },
        prestige: {
          morale_bonus: prestigeEffects.moraleBonus,
          recruit_discount: Math.round(prestigeEffects.recruitDiscount * 1000) / 1000,
          trade_multiplier: Math.round(prestigeEffects.tradeMultiplier * 1000) / 1000,
          build_discount: Math.round(prestigeEffects.buildDiscount * 1000) / 1000,
          stability_bonus: prestigeEffects.stabilityBonus,
          pop_growth_bonus: Math.round(prestigeEffects.popGrowthBonus * 10000) / 10000,
          tension_reduction: Math.round(prestigeEffects.tensionReduction * 100) / 100,
        },
        faith: {
          morale_mult: Math.round(faithMoraleMult * 1000) / 1000,
          mob_willingness: faithMobWillingness,
          stability_buffer: faithStabilityBuffer,
        },
        labor: {
          grain_mult: Math.round(laborGrainMult * 1000) / 1000,
          wealth_mult: Math.round(laborWealthMult * 1000) / 1000,
          capacity_mult: Math.round(laborCapacityMult * 1000) / 1000,
          stability_bonus: Math.round(laborStabilityBonus * 10) / 10,
        },
        capacity: {
          build_limit: capacityBuildLimit,
          active_projects: activeBuildingCount,
          overloaded: capacityOverload,
        },
        goods_economy: {
          tax_pop: goodsPopTax,
          tax_market: Math.round(goodsTaxMarketPillar * 10) / 10,
          tax_transit: Math.round(goodsTaxTransitPillar * 10) / 10,
          tax_extraction: Math.round(goodsTaxExtractionPillar * 10) / 10,
          capture: Math.round(goodsCapturePillar * 10) / 10,
          retention: Math.round(goodsRetention * 1000) / 1000,
        },
        wealth_breakdown: {
          pop_tax: pillarPopTax,
          domestic_market: pillarDomesticMarket,
          goods_fiscal: pillarGoodsFiscal,
          route_commerce: pillarRouteCommerce,
          total_income: Math.round(totalWealthIncome * 10) / 10,
          army_upkeep: armyWealthUpkeep,
          tolls: totalTollsPaid,
          sport_funding: sportFundingExpense,
        },
      },
      updated_at: new Date().toISOString(),
    }).eq("id", realm.id);

    // ══════════════════════════════════════════
    // PLAYER_RESOURCES back-compat write REMOVED (Sprint 1, Krok 1)
    // Canonical state is in realm_resources (updated above).
    // See DEPRECATION.md + docs/architecture/legacy-writer-audit.md
    // ══════════════════════════════════════════

    // ══════════════════════════════════════════
    // LOG
    // ══════════════════════════════════════════
    await supabase.from("world_action_log").insert({
      session_id: sessionId, turn_number: currentTurn, player_name: playerName,
      action_type: "turn_processing",
      description: `Kolo ${currentTurn}: ⚒️${totalCityProduction.toFixed(0)} 💰${wealthIncome} 🏛️${logisticCapacity} ⛪${newFaith.toFixed(0)} | pop ${totalPopulation} | ⚔${totalWarriors} | manpower ${manpowerPool}`,
      metadata: {
        total_production: totalCityProduction,
        total_wealth: combinedWealth,
        total_capacity: logisticCapacity,
        total_importance: totalImportance,
        demand: totalDemand,
        net_production: netProduction,
        grain_reserve: globalGrainReserve,
        gold_reserve: newGoldReserve,
        manpower_pool: manpowerPool,
        famine_cities: famineCityCount,
        workforce_ratio: workforceRatio,
        warrior_ratio: warriorRatio,
        faith: newFaith,
        faith_growth: faithGrowth,
        supply_strain: supplyStrain,
        army_size: totalArmySize,
        mobilization_penalties: { production: mobProductionPenalty, wealth: mobWealthPenalty },
        trade_gold: tradeGoldDelta,
        tolls_paid: totalTollsPaid,
        events_generated: newEvents.length,
        city_economy: cityEconResults,
      },
    });

    return new Response(JSON.stringify({
      ok: true, turn: currentTurn,
      summary: {
        totalProduction: totalCityProduction, totalWealth: combinedWealth,
        totalCapacity: logisticCapacity, totalImportance,
        demand: totalDemand, netProduction,
        grainReserve: globalGrainReserve, granaryCapacity,
        goldReserve: newGoldReserve,
        manpowerPool, logisticCapacity, totalPopulation,
        faith: newFaith, faithGrowth,
        warriorRatio, supplyStrain,
        famineCities: famineCityCount,
        tradeGoldDelta, tollsPaid: totalTollsPaid,
        eventsGenerated: newEvents.length,
        cityEconomy: cityEconResults,
        lawEffects: { taxRateModifier, grainRationModifier, tradeRestriction },
        mobPenalties: { production: mobProductionPenalty, wealth: mobWealthPenalty },
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
