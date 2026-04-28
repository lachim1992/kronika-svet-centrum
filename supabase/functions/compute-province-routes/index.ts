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

/** Find the nearest node from `candidates` to `target` */
function findNearest(target: Node, candidates: Node[]): Node | null {
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestDist = axialDist(target.hex_q, target.hex_r, best.hex_q, best.hex_r);
  for (let i = 1; i < candidates.length; i++) {
    const d = axialDist(target.hex_q, target.hex_r, candidates[i].hex_q, candidates[i].hex_r);
    if (d < bestDist) { bestDist = d; best = candidates[i]; }
  }
  return best;
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
        .eq("session_id", session_id)
        .eq("is_active", true),
      sb.from("province_adjacency")
        .select("province_a, province_b")
        .eq("session_id", session_id),
    ]);

    const nodes: Node[] = (nodesRes.data || [])
      .map((n: any) => ({ ...n, metadata: n.metadata || {} }))
      .filter((n: Node) => n.node_type !== "pass");
    const adjacency = adjRes.data || [];

    if (nodes.length === 0) {
      return new Response(JSON.stringify({ ok: true, routes_created: 0, reason: "no nodes" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── PROTECTED ROUTES (Etapa 2): load existing non-generated routes
    // (player_built, treaty, event) — these are IMMUTABLE: we never delete or
    // modify them, and we skip generating duplicates between the same node pair.
    const { data: protectedRows } = await sb.from("province_routes")
      .select("id, node_a, node_b, route_origin")
      .eq("session_id", session_id)
      .neq("route_origin", "generated");
    const protectedPairs = new Set<string>();
    for (const r of protectedRows || []) {
      const a = r.node_a as string, b = r.node_b as string;
      protectedPairs.add(a < b ? `${a}|${b}` : `${b}|${a}`);
    }
    const protectedCount = protectedRows?.length ?? 0;

    // Index
    const nodeById = new Map(nodes.map(n => [n.id, n]));
    const nodesByProv: Record<string, Node[]> = {};
    for (const n of nodes) {
      if (!nodesByProv[n.province_id]) nodesByProv[n.province_id] = [];
      nodesByProv[n.province_id].push(n);
    }

    const routeKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;
    const routeSet = new Set<string>(protectedPairs); // pre-seed so we don't duplicate
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
    // STRATEGY 1: HIERARCHY BACKBONE (micro→parent, minor→parent)
    // Each node connects ONLY to its parent — clean tree structure
    // ═══════════════════════════════════════
    for (const n of nodes) {
      if (n.parent_node_id) {
        const parent = nodeById.get(n.parent_node_id);
        if (parent) addRoute(n, parent, { tier_link: `${n.node_tier || "?"}→${parent.node_tier || "?"}` });
      }
    }

    // ═══════════════════════════════════════
    // STRATEGY 2: INTRA-PROVINCE — nearest-neighbor backbone for majors
    // Instead of all-to-all, connect each major to its nearest major (MST-like)
    // ═══════════════════════════════════════
    for (const [, pNodes] of Object.entries(nodesByProv)) {
      const majors = pNodes.filter(n => n.is_major || n.node_tier === "major");
      if (majors.length < 2) continue;

      // Nearest-neighbor chain: connect each major to its closest unconnected major
      const connected = new Set<string>([majors[0].id]);
      const remaining = new Set<string>(majors.slice(1).map(n => n.id));

      while (remaining.size > 0) {
        let bestA: Node | null = null, bestB: Node | null = null, bestDist = Infinity;
        for (const cid of connected) {
          const cNode = nodeById.get(cid)!;
          for (const rid of remaining) {
            const rNode = nodeById.get(rid)!;
            const d = axialDist(cNode.hex_q, cNode.hex_r, rNode.hex_q, rNode.hex_r);
            if (d < bestDist) { bestDist = d; bestA = cNode; bestB = rNode; }
          }
        }
        if (bestA && bestB) {
          addRoute(bestA, bestB, { tier_link: "major↔major" });
          connected.add(bestB.id);
          remaining.delete(bestB.id);
        } else break;
      }

      // Orphan minors (no parent_node_id): connect to nearest major in same province
      const orphanMinors = pNodes.filter(n => n.node_tier === "minor" && !n.parent_node_id);
      for (const m of orphanMinors) {
        const nearest = findNearest(m, majors);
        if (nearest) addRoute(m, nearest, { tier_link: "minor→major_fallback" });
      }

      // Orphan micros (no parent): connect to nearest minor in same province
      const minors = pNodes.filter(n => n.node_tier === "minor");
      const orphanMicros = pNodes.filter(n => n.node_tier === "micro" && !n.parent_node_id);
      for (const mc of orphanMicros) {
        const nearest = findNearest(mc, minors.length > 0 ? minors : majors);
        if (nearest) addRoute(mc, nearest, { tier_link: "micro→minor_fallback" });
      }
    }

    // ═══════════════════════════════════════
    // STRATEGY 3: CROSS-PROVINCE — single nearest major↔major bridge per border
    // ═══════════════════════════════════════
    for (const adj of adjacency) {
      const nodesA = nodesByProv[adj.province_a] || [];
      const nodesB = nodesByProv[adj.province_b] || [];
      if (nodesA.length === 0 || nodesB.length === 0) continue;

      const majorsA = nodesA.filter(n => n.is_major || n.node_tier === "major");
      const majorsB = nodesB.filter(n => n.is_major || n.node_tier === "major");

      // Single nearest major↔major across border
      let bestPair: [Node, Node] | null = null, bestDist = Infinity;
      for (const a of majorsA) {
        for (const b of majorsB) {
          const d = axialDist(a.hex_q, a.hex_r, b.hex_q, b.hex_r);
          if (d < bestDist) { bestDist = d; bestPair = [a, b]; }
        }
      }
      if (bestPair) addRoute(bestPair[0], bestPair[1], { tier_link: "cross_major" });

    }

    // ═══════════════════════════════════════
    // STRATEGY 4: SEA LANES — nearest port only (max dist 12)
    // ═══════════════════════════════════════
    const ports = nodes.filter(n => n.node_type === "port");
    for (const p of ports) {
      // Connect to nearest other port within range
      const others = ports.filter(o => o.id !== p.id && o.province_id !== p.province_id);
      const nearest = findNearest(p, others);
      if (nearest) {
        const d = axialDist(p.hex_q, p.hex_r, nearest.hex_q, nearest.hex_r);
        if (d <= 12) addRoute(p, nearest, { tier_link: "sea_lane" });
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
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
