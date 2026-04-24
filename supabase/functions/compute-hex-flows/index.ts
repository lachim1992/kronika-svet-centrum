import { createClient } from "npm:@supabase/supabase-js@2";
import {
  hexTraversalCost, computeFlowPath,
  type HexCostContext, type FlowPathInput,
} from "../_shared/physics.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const HEX_PAGE_SIZE = 1000;

const axialDist = (q1: number, r1: number, q2: number, r2: number) => {
  const dq = q1 - q2;
  const dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
};

const isAdjacentStep = (
  a: { q: number; r: number },
  b: { q: number; r: number },
) => axialDist(a.q, a.r, b.q, b.r) === 1;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, force_all, player_name } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 1. Load all hexes for this session (paged)
    const hexRows: any[] = [];
    for (let from = 0; ; from += HEX_PAGE_SIZE) {
      const to = from + HEX_PAGE_SIZE - 1;
      const { data: pageRows, error: hexErr } = await sb
        .from("province_hexes")
        .select("id, q, r, biome_family, mean_height, has_river, has_bridge, is_passable, coastal")
        .eq("session_id", session_id)
        .order("id", { ascending: true })
        .range(from, to);

      if (hexErr) throw hexErr;
      if (!pageRows || pageRows.length === 0) break;

      hexRows.push(...pageRows);
      if (pageRows.length < HEX_PAGE_SIZE) break;
    }

    const hexMap = new Map<string, any>();
    for (const h of (hexRows || [])) {
      hexMap.set(`${h.q},${h.r}`, h);
    }

    // 2. Load nodes (with fortress & control info)
    const { data: nodes } = await sb
      .from("province_nodes")
      .select("id, hex_q, hex_r, node_type, controlled_by, fortification_level, cumulative_trade_flow")
      .eq("session_id", session_id)
      .eq("is_active", true);

    // Build fortress/control lookup by hex
    const hexControl = new Map<string, { controlled_by: string | null; has_fortress: boolean; trade_density: number }>();
    for (const n of (nodes || [])) {
      const k = `${n.hex_q},${n.hex_r}`;
      const existing = hexControl.get(k);
      hexControl.set(k, {
        controlled_by: n.controlled_by,
        has_fortress: (existing?.has_fortress ?? false) || (n.fortification_level || 0) >= 2 || n.node_type === "fortress",
        trade_density: Math.min(100, (n.cumulative_trade_flow || 0) * 0.5),
      });
    }

    // 3. Load routes — only dirty ones unless force_all
    let routeQuery = sb
      .from("province_routes")
      .select("id, node_a, node_b, route_type, control_state")
      .eq("session_id", session_id);

    if (!force_all) {
      routeQuery = routeQuery.eq("path_dirty", true);
    }

    const { data: routes } = await routeQuery;

    if (!routes || routes.length === 0) {
      return new Response(JSON.stringify({ ok: true, paths_computed: 0, reason: "no dirty routes" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Build node lookup
    const nodeMap = new Map<string, { id: string; hex_q: number; hex_r: number }>();
    for (const n of (nodes || [])) {
      nodeMap.set(n.id, { id: n.id, hex_q: n.hex_q, hex_r: n.hex_r });
    }

    // 5. Build hex cost function
    const buildCostFn = (forPlayer: string | null) => (q: number, r: number): number => {
      const k = `${q},${r}`;
      const hex = hexMap.get(k);
      if (!hex) {
        // Unknown hex is not traversable for canonical route generation.
        return Infinity;
      }

      const ctrl = hexControl.get(k);
      const ctx: HexCostContext = {
        biome_family: hex.biome_family || "plains",
        mean_height: hex.mean_height || 0.5,
        has_river: hex.has_river || false,
        has_bridge: hex.has_bridge || false,
        is_passable: hex.is_passable !== false,
        coastal: hex.coastal || false,
        infrastructure_level: 0, // TODO: could come from road improvements
        controlled_by: ctrl?.controlled_by ?? null,
        has_fortress: ctrl?.has_fortress ?? false,
        is_contested: false,
        trade_density: ctrl?.trade_density ?? 0,
      };

      return hexTraversalCost(ctx, forPlayer);
    };

    // 6. Compute paths for each route
    const costFn = buildCostFn(player_name || null);
    const flowPathRows: any[] = [];
    const routeUpdates: Array<{ id: string; hex_path_cost: number; hex_bottleneck_q: number | null; hex_bottleneck_r: number | null; hex_path_length: number; path_dirty: boolean; last_path_turn: number }> = [];
    let failedPaths = 0;
    let rejectedNonAdjacentPaths = 0;

    for (const route of routes) {
      const nodeA = nodeMap.get(route.node_a);
      const nodeB = nodeMap.get(route.node_b);
      if (!nodeA || !nodeB) continue;

      // Skip blocked routes
      if (route.control_state === "blocked") continue;

      const input: FlowPathInput = {
        nodeA, nodeB,
        routeId: route.id,
        flowType: route.route_type || "trade",
      };

      const result = computeFlowPath(input, costFn, 50);

      if (!result) {
        failedPaths++;
        continue;
      }

      let hasInvalidStep = false;
      for (let i = 1; i < result.hex_path.length; i++) {
        if (!isAdjacentStep(result.hex_path[i - 1], result.hex_path[i])) {
          hasInvalidStep = true;
          break;
        }
      }
      if (hasInvalidStep) {
        rejectedNonAdjacentPaths++;
        failedPaths++;
        continue;
      }

      flowPathRows.push({
        session_id,
        route_id: route.id,
        node_a: result.node_a,
        node_b: result.node_b,
        flow_type: result.flow_type,
        hex_path: result.hex_path,
        total_cost: result.total_cost,
        bottleneck_hex: result.bottleneck,
        bottleneck_cost: result.bottleneck?.cost ?? 0,
        path_length: result.path_length,
        computed_turn: 0, // will be set by caller
        is_dirty: false,
      });

      routeUpdates.push({
        id: route.id,
        hex_path_cost: result.total_cost,
        hex_bottleneck_q: result.bottleneck?.q ?? null,
        hex_bottleneck_r: result.bottleneck?.r ?? null,
        hex_path_length: result.path_length,
        path_dirty: false,
        last_path_turn: 0,
      });
    }

    // 7. Upsert flow_paths
    const BATCH = 30;
    for (let i = 0; i < flowPathRows.length; i += BATCH) {
      await sb.from("flow_paths").upsert(
        flowPathRows.slice(i, i + BATCH),
        { onConflict: "session_id,node_a,node_b,flow_type" },
      );
    }

    // 8. Update route aggregates
    for (const upd of routeUpdates) {
      const { id, ...fields } = upd;
      await sb.from("province_routes").update(fields).eq("id", id);
    }

    return new Response(JSON.stringify({
      ok: true,
      paths_computed: flowPathRows.length,
      failed_paths: failedPaths,
      rejected_non_adjacent_paths: rejectedNonAdjacentPaths,
      total_routes_processed: routes.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("compute-hex-flows error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
