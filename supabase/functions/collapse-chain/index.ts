import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Collapse Chain Execution
 * 
 * Detects when a key node is lost/destroyed/captured and applies
 * cascading effects to connected cities:
 * - Trade Hub loss → wealth crash on dependent cities
 * - Food Basin loss → famine escalation
 * - Sacred Node loss → unrest spike
 * - Chokepoint loss → strategic isolation
 * 
 * Called from commit-turn or manually from dev tools.
 */

interface CollapseEvent {
  node_id: string;
  node_type: string;
  node_name: string;
  collapse_reason: "captured" | "destroyed" | "abandoned" | "blockaded";
  previous_owner: string;
  new_owner?: string;
}

// Severity tiers based on node importance
function collapseSeverity(strategicValue: number, economicValue: number, isMajor: boolean): "minor" | "moderate" | "severe" | "catastrophic" {
  const score = strategicValue * 0.4 + economicValue * 0.6;
  if (!isMajor || score < 3) return "minor";
  if (score < 6) return "moderate";
  if (score < 9) return "severe";
  return "catastrophic";
}

const SEVERITY_MULTIPLIER = { minor: 0.25, moderate: 0.5, severe: 0.75, catastrophic: 1.0 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id, events, turn_number } = await req.json() as {
      session_id: string;
      events?: CollapseEvent[];
      turn_number: number;
    };
    if (!session_id) throw new Error("session_id required");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // If no explicit events, auto-detect from recent node changes
    let collapseEvents: CollapseEvent[] = events || [];

    if (collapseEvents.length === 0) {
      // Detect nodes that became inactive or changed owner this turn
      const { data: changedNodes } = await sb
        .from("game_events")
        .select("event_type, note, result, location, player")
        .eq("session_id", session_id)
        .eq("turn_number", turn_number)
        .eq("confirmed", true)
        .in("event_type", ["node_captured", "node_destroyed", "city_captured", "siege_won"]);

      // Also check for nodes with supply_level = 0 (isolated)
      const { data: isolatedNodes } = await sb
        .from("supply_chain_state")
        .select("node_id")
        .eq("session_id", session_id)
        .eq("connected_to_capital", false)
        .gte("isolation_turns", 3);

      if (isolatedNodes && isolatedNodes.length > 0) {
        const nodeIds = isolatedNodes.map(n => n.node_id);
        const { data: nodeDetails } = await sb
          .from("province_nodes")
          .select("id, node_type, name, controlled_by")
          .eq("session_id", session_id)
          .in("id", nodeIds);

        for (const n of (nodeDetails || [])) {
          collapseEvents.push({
            node_id: n.id,
            node_type: n.node_type,
            node_name: n.name,
            collapse_reason: "blockaded",
            previous_owner: n.controlled_by || "unknown",
          });
        }
      }
    }

    if (collapseEvents.length === 0) {
      return new Response(JSON.stringify({ ok: true, collapses: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load node details for severity calculation
    const nodeIds = collapseEvents.map(e => e.node_id);
    const { data: nodesData } = await sb
      .from("province_nodes")
      .select("id, node_type, name, hex_q, hex_r, strategic_value, economic_value, is_major, city_id, production_output, wealth_output")
      .eq("session_id", session_id)
      .in("id", nodeIds);

    const nodeMap = new Map<string, typeof nodesData extends (infer T)[] | null ? T : never>();
    for (const n of (nodesData || [])) nodeMap.set(n.id, n);

    // Load connected routes to find affected cities
    const { data: routes } = await sb
      .from("province_routes")
      .select("id, node_a, node_b, route_type, capacity_value")
      .eq("session_id", session_id);

    // Load all nodes for city lookup
    const { data: allNodes } = await sb
      .from("province_nodes")
      .select("id, city_id, name, node_type, controlled_by")
      .eq("session_id", session_id)
      .eq("is_active", true);

    const allNodeMap = new Map<string, any>();
    for (const n of (allNodes || [])) allNodeMap.set(n.id, n);

    // Process each collapse event
    const results: any[] = [];
    const gameEvents: any[] = [];
    const cityUpdates: Map<string, { stability: number; wealth: number; famine: number; unrest: string | null }> = new Map();

    for (const evt of collapseEvents) {
      const node = nodeMap.get(evt.node_id);
      if (!node) continue;

      const severity = collapseSeverity(node.strategic_value, node.economic_value, node.is_major);
      const mult = SEVERITY_MULTIPLIER[severity];

      // Find all cities connected to this node (within 2 hops)
      const connectedNodeIds = new Set<string>();
      const connectedCityIds = new Set<string>();

      // Direct connections
      for (const r of (routes || [])) {
        if (r.node_a === evt.node_id) connectedNodeIds.add(r.node_b);
        if (r.node_b === evt.node_id) connectedNodeIds.add(r.node_a);
      }
      // Second hop
      for (const r of (routes || [])) {
        if (connectedNodeIds.has(r.node_a)) connectedNodeIds.add(r.node_b);
        if (connectedNodeIds.has(r.node_b)) connectedNodeIds.add(r.node_a);
      }

      // Collect city IDs from connected nodes
      for (const nid of connectedNodeIds) {
        const cn = allNodeMap.get(nid);
        if (cn?.city_id && cn.controlled_by === evt.previous_owner) {
          connectedCityIds.add(cn.city_id);
        }
      }
      // Also the node's own city
      if (node.city_id) connectedCityIds.add(node.city_id);

      // Apply effects based on node type
      const collapseType = getCollapseType(node.node_type);

      for (const cityId of connectedCityIds) {
        const existing = cityUpdates.get(cityId) || { stability: 0, wealth: 0, famine: 0, unrest: null };

        switch (collapseType) {
          case "wealth_crash":
            existing.wealth -= Math.round(15 * mult);
            existing.stability -= Math.round(5 * mult);
            break;
          case "famine":
            existing.famine += Math.round(3 * mult);
            existing.stability -= Math.round(10 * mult);
            break;
          case "unrest":
            existing.stability -= Math.round(20 * mult);
            existing.unrest = `Ztráta ${node.name}`;
            break;
          case "isolation":
            existing.stability -= Math.round(8 * mult);
            existing.wealth -= Math.round(5 * mult);
            break;
        }

        cityUpdates.set(cityId, existing);
      }

      // Log collapse event
      gameEvents.push({
        session_id,
        event_type: `collapse_${collapseType}`,
        player: evt.previous_owner,
        turn_number,
        confirmed: true,
        note: `${severity.toUpperCase()} collapse: ${evt.node_name} (${collapseType}) - ${evt.collapse_reason}. Affects ${connectedCityIds.size} cities.`,
        importance: severity === "catastrophic" ? 10 : severity === "severe" ? 8 : severity === "moderate" ? 5 : 3,
        location: node.name,
      });

      results.push({
        node: evt.node_name,
        type: collapseType,
        severity,
        affectedCities: connectedCityIds.size,
        reason: evt.collapse_reason,
      });
    }

    // Apply city updates
    for (const [cityId, effects] of cityUpdates) {
      const updates: Record<string, any> = {};
      if (effects.stability !== 0) {
        // Fetch current stability, apply delta with floor at 0
        const { data: city } = await sb.from("cities").select("city_stability, local_grain_reserve, famine_consecutive_turns").eq("id", cityId).single();
        if (city) {
          updates.city_stability = Math.max(0, Math.min(100, city.city_stability + effects.stability));
          if (effects.famine > 0) {
            updates.famine_consecutive_turns = (city.famine_consecutive_turns || 0) + effects.famine;
            updates.famine_turn = true;
          }
          if (effects.wealth < 0) {
            updates.local_grain_reserve = Math.max(0, city.local_grain_reserve + effects.wealth);
          }
        }
      }
      if (Object.keys(updates).length > 0) {
        await sb.from("cities").update(updates).eq("id", cityId);
      }
    }

    // Also update realm_resources for wealth crashes
    const playerWealthLoss = new Map<string, number>();
    for (const [cityId, effects] of cityUpdates) {
      if (effects.wealth < 0) {
        const { data: city } = await sb.from("cities").select("owner_player").eq("id", cityId).single();
        if (city) {
          playerWealthLoss.set(city.owner_player, (playerWealthLoss.get(city.owner_player) || 0) + effects.wealth);
        }
      }
    }
    for (const [player, loss] of playerWealthLoss) {
      const { data: res } = await sb.from("realm_resources").select("gold_reserve").eq("session_id", session_id).eq("player_name", player).single();
      if (res) {
        await sb.from("realm_resources").update({ gold_reserve: Math.max(0, res.gold_reserve + loss) }).eq("session_id", session_id).eq("player_name", player);
      }
    }

    // Insert game events
    if (gameEvents.length > 0) {
      await sb.from("game_events").insert(gameEvents);
    }

    // Mark affected routes as dirty for flow recalc
    if (nodeIds.length > 0) {
      await sb.from("province_routes")
        .update({ path_dirty: true })
        .eq("session_id", session_id)
        .or(nodeIds.map(id => `node_a.eq.${id},node_b.eq.${id}`).join(","));
    }

    return new Response(JSON.stringify({ ok: true, collapses: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[collapse-chain] error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getCollapseType(nodeType: string): "wealth_crash" | "famine" | "unrest" | "isolation" {
  switch (nodeType) {
    case "trade_hub": case "port": case "logistic_hub": return "wealth_crash";
    case "resource_node": case "village_cluster": return "famine";
    case "religious_center": return "unrest";
    case "fortress": case "pass": return "isolation";
    default: return "wealth_crash";
  }
}
