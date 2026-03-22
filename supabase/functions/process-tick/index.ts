import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeRouteTraversalProgress } from "../_shared/physics.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * process-tick: HOUSEKEEPING ONLY
 * 
 * Responsibilities:
 * - Complete pending action_queue items
 * - Complete arrived travel_orders
 * - Reset expired time_pools
 * - Auto-delegate inactive players
 *
 * Does NOT handle: population growth, influence, tension, rebellion, economy.
 * Those belong to world-tick (physics) and process-turn (economy).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Support both single-session call and cron (all persistent sessions)
    let sessionIds: string[] = [];
    try {
      const body = await req.json();
      if (body?.sessionId) sessionIds = [body.sessionId];
    } catch { /* empty body from cron */ }

    if (sessionIds.length === 0) {
      const { data: configs } = await supabase
        .from("server_config")
        .select("session_id");
      sessionIds = (configs || []).map((c: any) => c.session_id);
    }

    const results: Record<string, any> = {};
    const now = new Date().toISOString();

    for (const sessionId of sessionIds) {
      const tickResult: any = {
        completedActions: 0,
        arrivedOrders: 0,
      };

      // 1. Complete pending actions
      const { data: completedActions } = await supabase
        .from("action_queue")
        .update({ status: "completed" })
        .eq("session_id", sessionId)
        .eq("status", "pending")
        .lte("completes_at", now)
        .select("id");
      tickResult.completedActions = (completedActions || []).length;

      // 2. Complete travel orders
      const { data: arrivedOrders } = await supabase
        .from("travel_orders")
        .update({ status: "arrived" })
        .eq("session_id", sessionId)
        .eq("status", "in_transit")
        .lte("arrives_at", now)
        .select("id, entity_id, to_province_id");

      for (const order of arrivedOrders || []) {
        if (order.entity_id && order.to_province_id) {
          await supabase.from("military_stacks")
            .update({ province_id: order.to_province_id })
            .eq("id", order.entity_id);
        }
      }
      tickResult.arrivedOrders = (arrivedOrders || []).length;

      // 3. Route-based army traversal (strategic movement)
      const { data: travelingStacks } = await supabase
        .from("military_stacks")
        .select("id, travel_progress, travel_departed_turn, travel_route_id, travel_target_node_id")
        .eq("session_id", sessionId)
        .eq("is_active", true)
        .not("travel_route_id", "is", null);

      let routeArrivals = 0;
      for (const stack of (travelingStacks || [])) {
        if (!stack.travel_route_id) continue;

        const { data: route } = await supabase
          .from("province_routes")
          .select("capacity_value, route_type, control_state, metadata")
          .eq("id", stack.travel_route_id)
          .single();

        if (!route) continue;

        // Get current turn from game session
        const { data: sess } = await supabase
          .from("game_sessions")
          .select("current_turn")
          .eq("id", sessionId)
          .single();

        const currentTurn = sess?.current_turn || 0;

        const { newProgress, arrived } = computeRouteTraversalProgress(
          { id: stack.id, travel_progress: stack.travel_progress || 0, travel_departed_turn: stack.travel_departed_turn },
          route,
          currentTurn,
        );

        if (arrived) {
          // Move stack to target node, clear travel state
          const updatePayload: any = {
            travel_progress: 1.0,
            current_node_id: stack.travel_target_node_id,
            travel_route_id: null,
            travel_target_node_id: null,
            travel_departed_turn: null,
          };

          // Also update province_id if target node has one
          if (stack.travel_target_node_id) {
            const { data: targetNode } = await supabase
              .from("province_nodes")
              .select("province_id")
              .eq("id", stack.travel_target_node_id)
              .single();
            if (targetNode?.province_id) {
              updatePayload.province_id = targetNode.province_id;
            }
          }

          await supabase.from("military_stacks").update(updatePayload).eq("id", stack.id);
          routeArrivals++;
        } else {
          await supabase.from("military_stacks")
            .update({ travel_progress: newProgress })
            .eq("id", stack.id);
        }
      }
      tickResult.routeArrivals = routeArrivals;

      // 4. Reset expired time pools
      await supabase
        .from("time_pools")
        .update({ used_minutes: 0, resets_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })
        .eq("session_id", sessionId)
        .lte("resets_at", now);

      // 5. Check inactivity & auto-delegate
      const { data: config } = await supabase.from("server_config")
        .select("inactivity_threshold_hours, delegation_enabled")
        .eq("session_id", sessionId).single();

      if (config?.delegation_enabled) {
        const thresholdMs = (config.inactivity_threshold_hours || 48) * 60 * 60 * 1000;
        const cutoff = new Date(Date.now() - thresholdMs).toISOString();
        await supabase.from("player_activity")
          .update({ is_delegated: true, delegated_to: "AI" })
          .eq("session_id", sessionId)
          .eq("is_delegated", false)
          .lt("last_action_at", cutoff);
      }

      results[sessionId] = tickResult;
    }

    return new Response(JSON.stringify({ ok: true, processed: sessionIds.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
