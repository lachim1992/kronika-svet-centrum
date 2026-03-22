import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ═══════════════════════════════════════════════════════════════
// Chronicle Economic Model v1 — Flow-based macro economy
// 3 layers: PRODUCTION, WEALTH, CAPACITY
// ═══════════════════════════════════════════════════════════════

/** Base production values by node_type */
const BASE_PRODUCTION: Record<string, number> = {
  resource_node: 8,
  village_cluster: 6,
  primary_city: 4,
  secondary_city: 3,
  port: 5,
  fortress: 1,
  trade_hub: 2,
  pass: 0,
  religious_center: 2,
  logistic_hub: 3,
};

/** Base trade_efficiency multiplier by flow_role */
const ROLE_TRADE_EFFICIENCY: Record<string, number> = {
  hub: 1.0,
  gateway: 0.8,
  regulator: 0.6,
  producer: 0.3,
  neutral: 0.2,
};

/** Strategic resource tier thresholds: how many nodes = which tier */
const STRATEGIC_TIER_THRESHOLDS = [0, 1, 3, 6];

function computeTier(count: number): number {
  for (let i = STRATEGIC_TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (count >= STRATEGIC_TIER_THRESHOLDS[i]) return i;
  }
  return 0;
}

interface NodeData {
  id: string;
  session_id: string;
  province_id: string;
  node_type: string;
  flow_role: string;
  is_major: boolean;
  parent_node_id: string | null;
  controlled_by: string | null;
  city_id: string | null;
  population: number;
  infrastructure_level: number;
  urbanization_score: number;
  hinterland_level: number;
  cumulative_trade_flow: number;
  throughput_military: number;
  toll_rate: number;
  strategic_value: number;
  economic_value: number;
  defense_value: number;
  resource_output: Record<string, number>;
  metadata: Record<string, any> | null;
  // Existing supply chain data
  development_level: number;
  stability_factor: number;
}

interface RouteData {
  id: string;
  node_a: string;
  node_b: string;
  capacity_value: number;
  control_state: string;
  damage_level: number;
  speed_value: number;
  safety_value: number;
}

interface SupplyState {
  node_id: string;
  connected_to_capital: boolean;
  hop_distance: number;
  isolation_turns: number;
  supply_level: number;
  route_quality: number;
}

// ── PRODUCTION ──────────────────────────────────────────────────
// production_output = base_value * development_level * stability * route_access_factor
// For city-linked nodes: add demographic bonus from peasants
function computeNodeProduction(node: NodeData, routeAccess: number, cityData?: any): number {
  const base = BASE_PRODUCTION[node.node_type] ?? 2;
  const dev = Math.max(0.1, node.development_level || 1.0);
  const stab = Math.max(0.1, node.stability_factor || 1.0);
  const access = Math.max(0.1, routeAccess);
  let production = base * dev * stab * access;
  // Demographic bonus: peasants drive production
  if (cityData) {
    const peasants = cityData.population_peasants || 0;
    const burghers = cityData.population_burghers || 0;
    production += (peasants * 0.008 + burghers * 0.002);
  }
  return production;
}

// ── WEALTH ──────────────────────────────────────────────────────
// wealth_gain = incoming_production * trade_efficiency * connectivity_score
// For city-linked nodes: add burgher-driven wealth
function computeNodeWealth(
  incomingProduction: number,
  tradeEfficiency: number,
  connectivityScore: number,
  cityData?: any,
): number {
  let wealth = incomingProduction * tradeEfficiency * Math.max(0.1, connectivityScore);
  if (cityData) {
    const burghers = cityData.population_burghers || 0;
    const marketBonus = 1 + (cityData.market_level || 0) * 0.12;
    wealth += burghers * 0.01 * marketBonus;
  }
  return wealth;
}

// ── CAPACITY ────────────────────────────────────────────────────
// capacity = population * infrastructure_level * connectivity_score
function computeNodeCapacity(
  population: number,
  infrastructureLevel: number,
  connectivityScore: number,
): number {
  const pop = Math.max(1, population);
  const infra = Math.max(0.1, infrastructureLevel);
  const conn = Math.max(0.1, connectivityScore);
  // Normalize: per 1000 pop → 1.0 base
  return (pop / 1000) * infra * conn;
}

// ── IMPORTANCE ──────────────────────────────────────────────────
// importance = flow_volume + centrality + wealth + strategic_value
function computeImportance(
  production: number,
  wealth: number,
  centrality: number,
  strategicValue: number,
): number {
  return production * 0.3 + wealth * 0.3 + centrality * 0.2 + strategicValue * 0.2;
}

// ── ROUTE ACCESS FACTOR ─────────────────────────────────────────
// How well-connected is this node via routes?
function computeRouteAccess(
  nodeId: string,
  routes: RouteData[],
): number {
  const connectedRoutes = routes.filter(
    r => (r.node_a === nodeId || r.node_b === nodeId) && r.control_state !== "blocked",
  );
  if (connectedRoutes.length === 0) return 0.3; // Isolated but not zero

  let totalCapacity = 0;
  for (const r of connectedRoutes) {
    const damageMult = 1 - (r.damage_level || 0) * 0.1;
    totalCapacity += (r.capacity_value || 5) * Math.max(0.1, damageMult);
  }
  // Normalize: 1 route with cap 5 → ~0.7, 3+ routes → ~1.0+
  return Math.min(1.5, 0.3 + totalCapacity / 15);
}

// ── CONNECTIVITY SCORE ──────────────────────────────────────────
// How central is this node in the graph?
function computeConnectivity(
  nodeId: string,
  routes: RouteData[],
  totalNodes: number,
): number {
  const connectedRoutes = routes.filter(
    r => (r.node_a === nodeId || r.node_b === nodeId) && r.control_state !== "blocked",
  );
  const degree = connectedRoutes.length;
  // Normalize degree by sqrt of total nodes
  return Math.min(2.0, degree / Math.max(1, Math.sqrt(totalNodes)));
}

// ── ISOLATION PENALTY ───────────────────────────────────────────
function applyIsolationPenalty(
  production: number,
  wealth: number,
  capacity: number,
  supply: SupplyState | undefined,
): { production: number; wealth: number; capacity: number; penalty: number } {
  if (!supply || supply.connected_to_capital) {
    return { production, wealth, capacity, penalty: 0 };
  }
  // Disconnected from capital
  const isolationFactor = Math.min(supply.isolation_turns, 5);
  const pMult = Math.max(0.2, 1 - isolationFactor * 0.08); // min 60% at 5 turns
  const wMult = Math.max(0.3, 1 - isolationFactor * 0.06);
  const cMult = Math.max(0.1, 1 - isolationFactor * 0.10);
  return {
    production: production * pMult,
    wealth: wealth * wMult,
    capacity: capacity * cMult,
    penalty: 1 - pMult,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, turn_number, save_history } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── FETCH DATA ────────────────────────────────────────────
    const [nodesRes, routesRes, supplyRes, citiesRes] = await Promise.all([
      sb.from("province_nodes")
        .select("id, session_id, province_id, node_type, flow_role, is_major, parent_node_id, controlled_by, city_id, population, infrastructure_level, urbanization_score, hinterland_level, cumulative_trade_flow, throughput_military, toll_rate, strategic_value, economic_value, defense_value, resource_output, metadata, development_level, stability_factor")
        .eq("session_id", session_id),
      sb.from("province_routes")
        .select("id, node_a, node_b, capacity_value, control_state, damage_level, speed_value, safety_value")
        .eq("session_id", session_id),
      sb.from("supply_chain_state")
        .select("node_id, connected_to_capital, hop_distance, isolation_turns, supply_level, route_quality")
        .eq("session_id", session_id),
      sb.from("cities")
        .select("id, population_total, population_peasants, population_burghers, population_clerics, population_warriors, market_level, temple_level")
        .eq("session_id", session_id),
    ]);

    const nodes: NodeData[] = (nodesRes.data || []).map((n: any) => ({
      ...n,
      resource_output: n.resource_output || {},
      metadata: n.metadata || {},
      development_level: n.development_level || 1.0,
      stability_factor: n.stability_factor || 1.0,
    }));
    const routes: RouteData[] = routesRes.data || [];
    const supplyMap = new Map<string, SupplyState>();
    for (const s of (supplyRes.data || [])) supplyMap.set(s.node_id, s as SupplyState);

    // Build city demographics map for city-linked nodes
    const cityMap = new Map<string, any>();
    for (const c of (citiesRes.data || [])) cityMap.set(c.id, c);

    // ── NODE INDEX ─────────────────────────────────────────────
    const nodeMap = new Map<string, NodeData>();
    for (const n of nodes) nodeMap.set(n.id, n);

    // ── COMPUTE PER-NODE ───────────────────────────────────────
    const nodeResults: Array<{
      id: string;
      production_output: number;
      wealth_output: number;
      capacity_score: number;
      importance_score: number;
      incoming_production: number;
      connectivity_score: number;
      route_access_factor: number;
      trade_efficiency: number;
      isolation_penalty: number;
    }> = [];

    // Phase 1: compute raw production for all nodes
    const rawProduction = new Map<string, number>();
    for (const node of nodes) {
      const routeAccess = computeRouteAccess(node.id, routes);
      const prod = computeNodeProduction(node, routeAccess);
      rawProduction.set(node.id, prod);
    }

    // Phase 2: aggregate production into major nodes
    const majorIncoming = new Map<string, number>();
    for (const node of nodes) {
      if (node.is_major) {
        majorIncoming.set(node.id, rawProduction.get(node.id) || 0);
      }
    }
    // Minor nodes feed their production to parent
    for (const node of nodes) {
      if (!node.is_major && node.parent_node_id) {
        const parentProd = majorIncoming.get(node.parent_node_id) || 0;
        const nodeProd = rawProduction.get(node.id) || 0;
        // Throughput from parent's regulation
        const parent = nodeMap.get(node.parent_node_id);
        const throughput = parent ? (parent.throughput_military || 1.0) : 1.0;
        majorIncoming.set(node.parent_node_id, parentProd + nodeProd * throughput);
      }
    }

    // Phase 3: compute wealth, capacity, importance per node
    for (const node of nodes) {
      const routeAccess = computeRouteAccess(node.id, routes);
      const connectivity = computeConnectivity(node.id, routes, nodes.length);
      const production = rawProduction.get(node.id) || 0;
      const incoming = node.is_major ? (majorIncoming.get(node.id) || 0) : production;
      const tradeEff = ROLE_TRADE_EFFICIENCY[node.flow_role] || 0.2;

      let wealth = node.is_major
        ? computeNodeWealth(incoming, tradeEff, connectivity)
        : computeNodeWealth(production * 0.1, tradeEff * 0.5, connectivity);

      let capacity = computeNodeCapacity(node.population, node.infrastructure_level, connectivity);

      // Apply isolation
      const supply = supplyMap.get(node.id);
      const isolated = applyIsolationPenalty(production, wealth, capacity, supply);
      const finalProd = isolated.production;
      wealth = isolated.wealth;
      capacity = isolated.capacity;

      const importance = computeImportance(finalProd, wealth, connectivity, node.strategic_value);

      nodeResults.push({
        id: node.id,
        production_output: Math.round(finalProd * 100) / 100,
        wealth_output: Math.round(wealth * 100) / 100,
        capacity_score: Math.round(capacity * 100) / 100,
        importance_score: Math.round(importance * 100) / 100,
        incoming_production: Math.round(incoming * 100) / 100,
        connectivity_score: Math.round(connectivity * 100) / 100,
        route_access_factor: Math.round(routeAccess * 100) / 100,
        trade_efficiency: Math.round(tradeEff * 100) / 100,
        isolation_penalty: Math.round(isolated.penalty * 100) / 100,
      });
    }

    // ── PERSIST NODE RESULTS ──────────────────────────────────
    const BATCH = 50;
    for (let i = 0; i < nodeResults.length; i += BATCH) {
      const batch = nodeResults.slice(i, i + BATCH);
      for (const nr of batch) {
        await sb.from("province_nodes").update({
          production_output: nr.production_output,
          wealth_output: nr.wealth_output,
          capacity_score: nr.capacity_score,
          importance_score: nr.importance_score,
          incoming_production: nr.incoming_production,
          connectivity_score: nr.connectivity_score,
          route_access_factor: nr.route_access_factor,
          trade_efficiency: nr.trade_efficiency,
          isolation_penalty: nr.isolation_penalty,
        }).eq("id", nr.id);
      }
    }

    // ── SAVE HISTORY ──────────────────────────────────────────
    if (save_history && turn_number) {
      const histRows = nodeResults.map(nr => ({
        session_id,
        node_id: nr.id,
        turn_number,
        production_output: nr.production_output,
        wealth_output: nr.wealth_output,
        capacity_score: nr.capacity_score,
        importance_score: nr.importance_score,
        incoming_production: nr.incoming_production,
        connectivity_score: nr.connectivity_score,
        isolation_penalty: nr.isolation_penalty,
      }));
      for (let i = 0; i < histRows.length; i += BATCH) {
        await sb.from("node_economy_history").insert(histRows.slice(i, i + BATCH));
      }
    }

    // ── AGGREGATE PER PLAYER → realm_resources ────────────────
    const playerTotals = new Map<string, {
      production: number; wealth: number; capacity: number; importance: number;
      iron: number; horses: number; salt: number; copper: number; gold_res: number;
    }>();

    for (const node of nodes) {
      const player = node.controlled_by;
      if (!player) continue;
      const nr = nodeResults.find(r => r.id === node.id);
      if (!nr) continue;

      if (!playerTotals.has(player)) {
        playerTotals.set(player, {
          production: 0, wealth: 0, capacity: 0, importance: 0,
          iron: 0, horses: 0, salt: 0, copper: 0, gold_res: 0,
        });
      }
      const pt = playerTotals.get(player)!;
      pt.production += nr.production_output;
      pt.wealth += nr.wealth_output;
      pt.capacity += nr.capacity_score;
      pt.importance += nr.importance_score;

      // Count strategic resource nodes
      const resType = node.metadata?.resource_type || node.metadata?.strategic_resource;
      if (resType === "iron" || resType === "mineral") pt.iron++;
      if (resType === "horses") pt.horses++;
      if (resType === "salt") pt.salt++;
      if (resType === "copper") pt.copper++;
      if (resType === "gold_deposit") pt.gold_res++;
    }

    const realmUpdates: any[] = [];
    for (const [player, totals] of playerTotals) {
      const update = {
        total_production: Math.round(totals.production * 100) / 100,
        total_wealth: Math.round(totals.wealth * 100) / 100,
        total_capacity: Math.round(totals.capacity * 100) / 100,
        total_importance: Math.round(totals.importance * 100) / 100,
        strategic_iron_tier: computeTier(totals.iron),
        strategic_horses_tier: computeTier(totals.horses),
        strategic_salt_tier: computeTier(totals.salt),
        strategic_copper_tier: computeTier(totals.copper),
        strategic_gold_tier: computeTier(totals.gold_res),
      };
      await sb.from("realm_resources").update(update)
        .eq("session_id", session_id).eq("player_name", player);
      realmUpdates.push({ player, ...update });
    }

    // ── RESPONSE ──────────────────────────────────────────────
    const summary = {
      ok: true,
      nodes_computed: nodeResults.length,
      realm_updates: realmUpdates.length,
      history_saved: save_history ? nodeResults.length : 0,
      totals_by_player: Object.fromEntries(
        Array.from(playerTotals.entries()).map(([p, t]) => [p, {
          production: Math.round(t.production),
          wealth: Math.round(t.wealth),
          capacity: Math.round(t.capacity),
          importance: Math.round(t.importance),
        }]),
      ),
      top_nodes: nodeResults
        .sort((a, b) => b.importance_score - a.importance_score)
        .slice(0, 5)
        .map(n => ({ id: n.id, importance: n.importance_score, prod: n.production_output, wealth: n.wealth_output })),
    };

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("compute-economy-flow error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
