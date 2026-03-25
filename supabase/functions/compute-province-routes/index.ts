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
  node_tier: string | null;
  node_subtype: string | null;
  name: string;
  hex_q: number;
  hex_r: number;
  strategic_value: number;
  economic_value: number;
  defense_value: number;
  parent_node_id: string | null;
  is_major: boolean;
  flow_role: string;
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

function inferRouteType(a: Node, b: Node): string {
  if (a.node_type === "port" && b.node_type === "port") return "sea_lane";
  if (a.node_type === "port" || b.node_type === "port") return "sea_lane";
  if (a.node_type === "pass" || b.node_type === "pass") return "mountain_pass";
  if (a.node_type === "trade_hub" || b.node_type === "trade_hub") return "caravan_route";
  return "land_road";
}

function calcMetrics(a: Node, b: Node, dist: number, routeType: string): Partial<Route> {
  const distFactor = Math.min(dist / 5, 3);
  const capacity = Math.max(1, 10 - Math.round(distFactor * 2));
  const vulnerability = Math.min(10, Math.round(2 + distFactor * 2));
  const buildCostMap: Record<string, number> = {
    land_road: 50, river_route: 30, sea_lane: 20, mountain_pass: 80, caravan_route: 60,
  };
  return {
    capacity_value: capacity,
    military_relevance: Math.round((a.strategic_value + b.strategic_value) / 2),
    economic_relevance: Math.round((a.economic_value + b.economic_value) / 2),
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

    const [nodesRes, adjRes] = await Promise.all([
      sb.from("province_nodes")
        .select("id, province_id, node_type, node_tier, node_subtype, name, hex_q, hex_r, strategic_value, economic_value, defense_value, parent_node_id, is_major, flow_role, metadata")
        .eq("session_id", session_id),
      sb.from("province_adjacency")
        .select("province_a, province_b")
        .eq("session_id", session_id),
    ]);

    const nodes: Node[] = (nodesRes.data || []).map((n: any) => ({ ...n, metadata: n.metadata || {} }));
    const adjacency = adjRes.data || [];

    if (nodes.length === 0) {
      return new Response(JSON.stringify({ ok: true, routes_created: 0, reason: "no nodes" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Index
    const nodeById = new Map(nodes.map(n => [n.id, n]));
    const nodesByProv: Record<string, Node[]> = {};
    for (const n of nodes) {
      if (!nodesByProv[n.province_id]) nodesByProv[n.province_id] = [];
      nodesByProv[n.province_id].push(n);
    }

    const routeKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;
    const routeSet = new Set<string>();
    const routes: Route[] = [];

    const addRoute = (a: Node, b: Node, meta?: Record<string, any>) => {
      const key = routeKey(a.id, b.id);
      if (routeSet.has(key)) return;
      routeSet.add(key);
      const dist = axialDist(a.hex_q, a.hex_r, b.hex_q, b.hex_r);
      const routeType = inferRouteType(a, b);
      const metrics = calcMetrics(a, b, dist, routeType);
      const sameProv = a.province_id === b.province_id;
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
        metadata: { distance: dist, cross_province: !sameProv, tier_link: meta?.tier_link || "peer", ...meta },
      });
    };

    // ═══════════════════════════════════════
    // STRATEGY 1: HIERARCHY BACKBONE (micro→minor→major)
    // ═══════════════════════════════════════
    for (const n of nodes) {
      if (n.parent_node_id) {
        const parent = nodeById.get(n.parent_node_id);
        if (parent) addRoute(n, parent, { tier_link: `${n.node_tier || "?"}→${parent.node_tier || "?"}` });
      }
    }

    // ═══════════════════════════════════════
    // STRATEGY 2: INTRA-PROVINCE major↔major backbone
    // ═══════════════════════════════════════
    for (const [, pNodes] of Object.entries(nodesByProv)) {
      const majors = pNodes.filter(n => n.is_major || n.node_tier === "major");
      // Connect all majors in same province
      for (let i = 0; i < majors.length; i++) {
        for (let j = i + 1; j < majors.length; j++) {
          addRoute(majors[i], majors[j], { tier_link: "major↔major" });
        }
      }
      // Connect minor nodes to each other if they share the same parent
      const minors = pNodes.filter(n => n.node_tier === "minor");
      const byParent: Record<string, Node[]> = {};
      for (const m of minors) {
        const pk = m.parent_node_id || "_none";
        if (!byParent[pk]) byParent[pk] = [];
        byParent[pk].push(m);
      }
      for (const siblings of Object.values(byParent)) {
        if (siblings.length < 2) continue;
        // Connect siblings within reasonable distance
        for (let i = 0; i < siblings.length; i++) {
          for (let j = i + 1; j < siblings.length; j++) {
            const dist = axialDist(siblings[i].hex_q, siblings[i].hex_r, siblings[j].hex_q, siblings[j].hex_r);
            if (dist < 10) addRoute(siblings[i], siblings[j], { tier_link: "minor↔minor" });
          }
        }
      }
    }

    // ═══════════════════════════════════════
    // STRATEGY 3: CROSS-PROVINCE (major↔major, pass↔city)
    // ═══════════════════════════════════════
    for (const adj of adjacency) {
      const nodesA = nodesByProv[adj.province_a] || [];
      const nodesB = nodesByProv[adj.province_b] || [];
      if (nodesA.length === 0 || nodesB.length === 0) continue;

      const majorsA = nodesA.filter(n => n.is_major || n.node_tier === "major");
      const majorsB = nodesB.filter(n => n.is_major || n.node_tier === "major");

      // Connect nearest major↔major across border
      let bestPair: [Node, Node] | null = null, bestDist = Infinity;
      for (const a of majorsA) {
        for (const b of majorsB) {
          const d = axialDist(a.hex_q, a.hex_r, b.hex_q, b.hex_r);
          if (d < bestDist) { bestDist = d; bestPair = [a, b]; }
        }
      }
      if (bestPair) addRoute(bestPair[0], bestPair[1], { tier_link: "cross_major" });

      // Pass/trade_hub cross-connections
      const passA = nodesA.find(n => n.node_type === "pass");
      const passB = nodesB.find(n => n.node_type === "pass");
      if (passA && passB) addRoute(passA, passB, { tier_link: "cross_pass" });

      const hubA = nodesA.find(n => n.node_type === "trade_hub");
      const hubB = nodesB.find(n => n.node_type === "trade_hub");
      if (hubA && hubB) addRoute(hubA, hubB, { tier_link: "cross_trade" });

      // Pass → nearest major across border
      if (passA && majorsB.length > 0) {
        const nearest = majorsB.sort((a, b) => axialDist(passA.hex_q, passA.hex_r, a.hex_q, a.hex_r) - axialDist(passA.hex_q, passA.hex_r, b.hex_q, b.hex_r))[0];
        addRoute(passA, nearest, { tier_link: "cross_pass_major" });
      }
      if (passB && majorsA.length > 0) {
        const nearest = majorsA.sort((a, b) => axialDist(passB.hex_q, passB.hex_r, a.hex_q, a.hex_r) - axialDist(passB.hex_q, passB.hex_r, b.hex_q, b.hex_r))[0];
        addRoute(passB, nearest, { tier_link: "cross_pass_major" });
      }
    }

    // ═══════════════════════════════════════
    // STRATEGY 4: SEA LANES (port↔port within range)
    // ═══════════════════════════════════════
    const ports = nodes.filter(n => n.node_type === "port");
    for (let i = 0; i < ports.length; i++) {
      for (let j = i + 1; j < ports.length; j++) {
        const dist = axialDist(ports[i].hex_q, ports[i].hex_r, ports[j].hex_q, ports[j].hex_r);
        if (dist < 20) addRoute(ports[i], ports[j], { tier_link: "sea_lane" });
      }
    }

    // Delete old and insert new
    await sb.from("province_routes").delete().eq("session_id", session_id);
    const BATCH = 50;
    for (let i = 0; i < routes.length; i += BATCH) {
      const { error } = await sb.from("province_routes").insert(routes.slice(i, i + BATCH));
      if (error) console.error("Insert batch error:", error);
    }

    // Stats
    const nodeDegree: Record<string, number> = {};
    for (const r of routes) {
      nodeDegree[r.node_a] = (nodeDegree[r.node_a] || 0) + 1;
      nodeDegree[r.node_b] = (nodeDegree[r.node_b] || 0) + 1;
    }
    const maxDegree = Math.max(...Object.values(nodeDegree), 0);
    const byType = routes.reduce((acc, r) => { acc[r.route_type] = (acc[r.route_type] || 0) + 1; return acc; }, {} as Record<string, number>);
    const byTierLink = routes.reduce((acc, r) => {
      const tl = (r.metadata as any)?.tier_link || "unknown";
      acc[tl] = (acc[tl] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return new Response(JSON.stringify({
      ok: true,
      routes_created: routes.length,
      by_type: byType,
      by_tier_link: byTierLink,
      max_degree: maxDegree,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("compute-province-routes error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
