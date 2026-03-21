import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const axialDist = (q1: number, r1: number, q2: number, r2: number) => {
  const dq = q1 - q2, dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
};

interface Node {
  id: string;
  province_id: string;
  node_type: string;
  name: string;
  hex_q: number;
  hex_r: number;
  strategic_value: number;
  economic_value: number;
  defense_value: number;
  mobility_relevance: number;
  supply_relevance: number;
  metadata: Record<string, any>;
}

interface Route {
  session_id: string;
  node_a: string;
  node_b: string;
  route_type: string;
  capacity_value: number;
  military_relevance: number;
  economic_relevance: number;
  vulnerability_score: number;
  control_state: string;
  build_cost: number;
  upgrade_level: number;
  metadata: Record<string, any>;
}

/* Determine route type from node types and terrain */
function inferRouteType(a: Node, b: Node, sameProv: boolean): string {
  if (a.node_type === "port" && b.node_type === "port") return "sea_lane";
  if (a.node_type === "port" || b.node_type === "port") {
    // Port to inland within same province = land_road, cross-province port = sea_lane
    if (!sameProv && (a.node_type === "port" && b.node_type === "port")) return "sea_lane";
  }
  if (a.node_type === "pass" || b.node_type === "pass") return "mountain_pass";
  if (a.node_type === "trade_hub" || b.node_type === "trade_hub") return "caravan_route";
  // Check if either node is on a river (metadata)
  if (a.metadata?.biome === "wetland" || b.metadata?.biome === "wetland") return "river_route";
  return "land_road";
}

/* Calculate route metrics from node properties */
function calcMetrics(a: Node, b: Node, dist: number, routeType: string): Partial<Route> {
  const avgEcon = Math.round((a.economic_value + b.economic_value) / 2);
  const avgMil = Math.round((a.strategic_value + b.strategic_value) / 2);
  const avgDef = Math.round((a.defense_value + b.defense_value) / 2);

  // Longer routes = more vulnerable, less capacity
  const distFactor = Math.min(dist / 5, 3);
  const capacity = Math.max(1, 10 - Math.round(distFactor * 2));
  const vulnerability = Math.min(10, Math.round(2 + distFactor * 2));

  const buildCostMap: Record<string, number> = {
    land_road: 50, river_route: 30, sea_lane: 20, mountain_pass: 80, caravan_route: 60,
  };

  return {
    capacity_value: capacity,
    military_relevance: avgMil,
    economic_relevance: avgEcon,
    vulnerability_score: vulnerability,
    build_cost: buildCostMap[routeType] || 50,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Load nodes, adjacency
    const [nodesRes, adjRes] = await Promise.all([
      sb.from("province_nodes")
        .select("id, province_id, node_type, name, hex_q, hex_r, strategic_value, economic_value, defense_value, mobility_relevance, supply_relevance, metadata")
        .eq("session_id", session_id),
      sb.from("province_adjacency")
        .select("province_a, province_b")
        .eq("session_id", session_id),
    ]);

    const nodes: Node[] = (nodesRes.data || []).map((n: any) => ({
      ...n, metadata: n.metadata || {},
    }));
    const adjacency = adjRes.data || [];

    if (nodes.length === 0) {
      return new Response(JSON.stringify({ ok: true, routes_created: 0, reason: "no nodes" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build adjacency set for province pairs
    const adjSet = new Set<string>();
    for (const a of adjacency) {
      adjSet.add(`${a.province_a}|${a.province_b}`);
      adjSet.add(`${a.province_b}|${a.province_a}`);
    }

    // Index nodes by province
    const nodesByProv: Record<string, Node[]> = {};
    for (const n of nodes) {
      if (!nodesByProv[n.province_id]) nodesByProv[n.province_id] = [];
      nodesByProv[n.province_id].push(n);
    }

    const routeKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;
    const routeSet = new Set<string>();
    const routes: Route[] = [];

    const addRoute = (a: Node, b: Node, sameProv: boolean) => {
      const key = routeKey(a.id, b.id);
      if (routeSet.has(key)) return;
      routeSet.add(key);

      const dist = axialDist(a.hex_q, a.hex_r, b.hex_q, b.hex_r);
      const routeType = inferRouteType(a, b, sameProv);
      const metrics = calcMetrics(a, b, dist, routeType);

      routes.push({
        session_id,
        node_a: a.id < b.id ? a.id : b.id,
        node_b: a.id < b.id ? b.id : a.id,
        route_type: routeType,
        capacity_value: metrics.capacity_value!,
        military_relevance: metrics.military_relevance!,
        economic_relevance: metrics.economic_relevance!,
        vulnerability_score: metrics.vulnerability_score!,
        control_state: "open",
        build_cost: metrics.build_cost!,
        upgrade_level: 0,
        metadata: { distance: dist, cross_province: !sameProv },
      });
    };

    // === STRATEGY 1: Intra-province backbone ===
    // Connect primary_city to every other node in same province
    for (const [provId, pNodes] of Object.entries(nodesByProv)) {
      const primary = pNodes.find(n => n.node_type === "primary_city");
      if (!primary) continue;
      for (const n of pNodes) {
        if (n.id === primary.id) continue;
        addRoute(primary, n, true);
      }
      // Connect fortress to pass if both exist (defense corridor)
      const fort = pNodes.find(n => n.node_type === "fortress");
      const pass = pNodes.find(n => n.node_type === "pass");
      if (fort && pass) addRoute(fort, pass, true);

      // Connect trade_hub to resource_node (supply chain)
      const hub = pNodes.find(n => n.node_type === "trade_hub");
      const res = pNodes.find(n => n.node_type === "resource_node");
      if (hub && res) addRoute(hub, res, true);
    }

    // === STRATEGY 2: Cross-province connections ===
    for (const adj of adjacency) {
      const nodesA = nodesByProv[adj.province_a] || [];
      const nodesB = nodesByProv[adj.province_b] || [];
      if (nodesA.length === 0 || nodesB.length === 0) continue;

      // Connect primary cities across adjacent provinces (backbone corridor)
      const cityA = nodesA.find(n => n.node_type === "primary_city");
      const cityB = nodesB.find(n => n.node_type === "primary_city");
      if (cityA && cityB) addRoute(cityA, cityB, false);

      // Connect passes across provinces (chokepoint link)
      const passA = nodesA.find(n => n.node_type === "pass");
      const passB = nodesB.find(n => n.node_type === "pass");
      if (passA && passB) {
        const dist = axialDist(passA.hex_q, passA.hex_r, passB.hex_q, passB.hex_r);
        if (dist < 12) addRoute(passA, passB, false);
      }
      // Pass connects to nearest city across border
      if (passA && cityB) addRoute(passA, cityB, false);
      if (passB && cityA) addRoute(passB, cityA, false);

      // Connect trade hubs across provinces (caravan route)
      const hubA = nodesA.find(n => n.node_type === "trade_hub");
      const hubB = nodesB.find(n => n.node_type === "trade_hub");
      if (hubA && hubB) addRoute(hubA, hubB, false);
      // Trade hub to nearest city across border
      if (hubA && cityB) addRoute(hubA, cityB, false);
      if (hubB && cityA) addRoute(hubB, cityA, false);
    }

    // === STRATEGY 3: Sea lanes between all ports ===
    const ports = nodes.filter(n => n.node_type === "port");
    for (let i = 0; i < ports.length; i++) {
      for (let j = i + 1; j < ports.length; j++) {
        const dist = axialDist(ports[i].hex_q, ports[i].hex_r, ports[j].hex_q, ports[j].hex_r);
        // Only connect ports within reasonable range (avoid global mesh)
        if (dist < 20) {
          addRoute(ports[i], ports[j], ports[i].province_id === ports[j].province_id);
        }
      }
    }

    // Delete old routes and insert new
    await sb.from("province_routes").delete().eq("session_id", session_id);

    const BATCH = 50;
    for (let i = 0; i < routes.length; i += BATCH) {
      const { error } = await sb.from("province_routes").insert(routes.slice(i, i + BATCH));
      if (error) console.error("Insert batch error:", error);
    }

    // Compute centrality stats
    const nodeDegree: Record<string, number> = {};
    for (const r of routes) {
      nodeDegree[r.node_a] = (nodeDegree[r.node_a] || 0) + 1;
      nodeDegree[r.node_b] = (nodeDegree[r.node_b] || 0) + 1;
    }
    const maxDegree = Math.max(...Object.values(nodeDegree), 0);
    const chokepoints = Object.entries(nodeDegree)
      .filter(([, d]) => d >= maxDegree * 0.7)
      .map(([id]) => nodes.find(n => n.id === id)?.name || id);

    const byType = routes.reduce((acc, r) => {
      acc[r.route_type] = (acc[r.route_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return new Response(JSON.stringify({
      ok: true,
      routes_created: routes.length,
      by_type: byType,
      chokepoints,
      max_degree: maxDegree,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("compute-province-routes error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
