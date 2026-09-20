import { computeRouteTraversalProgress } from "./physics.ts";

/**
 * TURN PROGRESS — army traversal, ambushes, sieges and node projects.
 *
 * Phase 4 (legacy removal): this logic used to live in the time-based
 * `process-tick` edge function. The persistent real-time mode is abandoned, so
 * the turn-based parts were extracted here and are now advanced exactly once per
 * turn by commit-turn. The removed parts (action_queue completion, travel_orders,
 * time_pools resets, inactivity auto-delegation) belonged to the tick clock only.
 *
 * OWNERSHIP: physical/military state only. No gold, no population, no history.
 */
export interface TurnProgressResult {
  routeArrivals: number;
  ambushTriggered: number;
  siegeCaptures: number;
  projectsCompleted: number;
}

export async function advanceTurnProgress(
  supabase: any,
  sessionId: string,
  currentTurn: number,
): Promise<TurnProgressResult> {
  const result: TurnProgressResult = {
    routeArrivals: 0, ambushTriggered: 0, siegeCaptures: 0, projectsCompleted: 0,
  };

  // ── 1. Route-based army traversal ──
  const { data: travelingStacks } = await supabase
    .from("military_stacks")
    .select("id, player_name, travel_progress, travel_departed_turn, travel_route_id, travel_target_node_id")
    .eq("session_id", sessionId)
    .eq("is_active", true)
    .not("travel_route_id", "is", null);

  for (const stack of (travelingStacks || [])) {
    if (!stack.travel_route_id) continue;
    const { data: route } = await supabase
      .from("province_routes")
      .select("capacity_value, route_type, control_state, metadata")
      .eq("id", stack.travel_route_id)
      .maybeSingle();
    if (!route) continue;

    const { newProgress, arrived } = computeRouteTraversalProgress(
      { id: stack.id, travel_progress: stack.travel_progress || 0, travel_departed_turn: stack.travel_departed_turn },
      route,
      currentTurn,
    );

    if (!arrived) {
      await supabase.from("military_stacks").update({ travel_progress: newProgress }).eq("id", stack.id);
      continue;
    }

    const updatePayload: Record<string, any> = {
      travel_progress: 1.0,
      current_node_id: stack.travel_target_node_id,
      travel_route_id: null,
      travel_target_node_id: null,
      travel_departed_turn: null,
    };
    if (stack.travel_target_node_id) {
      const { data: targetNode } = await supabase.from("province_nodes")
        .select("province_id").eq("id", stack.travel_target_node_id).maybeSingle();
      if (targetNode?.province_id) updatePayload.province_id = targetNode.province_id;
    }
    await supabase.from("military_stacks").update(updatePayload).eq("id", stack.id);
    result.routeArrivals++;
  }

  // ── 2. Route interception (ambush) ──
  for (const stack of (travelingStacks || [])) {
    if (!stack.travel_route_id) continue;
    const { data: ambushRoute } = await supabase
      .from("province_routes")
      .select("ambush_stack_id")
      .eq("id", stack.travel_route_id)
      .not("ambush_stack_id", "is", null)
      .maybeSingle();
    if (!ambushRoute?.ambush_stack_id) continue;

    const { data: ambushStack } = await supabase
      .from("military_stacks")
      .select("id, player_name, is_active")
      .eq("id", ambushRoute.ambush_stack_id)
      .maybeSingle();
    if (!ambushStack?.is_active) continue;
    if (ambushStack.player_name === stack.player_name) continue;

    await supabase.from("military_stacks").update({
      travel_route_id: null,
      travel_target_node_id: null,
      travel_progress: stack.travel_progress || 0,
      stance: "idle",
      battle_context: "route_ambush",
    }).eq("id", stack.id);

    await supabase.from("province_routes")
      .update({ ambush_stack_id: null }).eq("id", stack.travel_route_id);

    await supabase.from("battle_lobbies").insert({
      session_id: sessionId,
      attacker_player: ambushStack.player_name,
      attacker_stack_id: ambushStack.id,
      defender_player: stack.player_name,
      defender_stack_id: stack.id,
      status: "pending",
      turn_number: currentTurn,
    });

    await supabase.from("game_events").insert({
      session_id: sessionId,
      player: ambushStack.player_name,
      event_type: "battle",
      turn_number: currentTurn,
      note: "Léčka! Armáda byla přepadena na cestě.",
      importance: "critical",
      confirmed: true,
      truth_state: "canon",
    });
    result.ambushTriggered++;
  }

  // ── 3. Siege progression ──
  const { data: besiegedNodes } = await supabase
    .from("province_nodes")
    .select("id, garrison_strength, siege_turn_start, besieging_stack_id, name, controlled_by")
    .eq("session_id", sessionId)
    .not("besieged_by", "is", null);

  for (const node of (besiegedNodes || [])) {
    const garrisonLoss = Math.max(1, Math.floor((node.garrison_strength || 0) * 0.15));
    const newGarrison = Math.max(0, (node.garrison_strength || 0) - garrisonLoss);

    if (newGarrison <= 0 && node.besieging_stack_id) {
      const { data: siegeStack } = await supabase.from("military_stacks")
        .select("player_name").eq("id", node.besieging_stack_id).maybeSingle();
      const newOwner = siegeStack?.player_name || null;

      await supabase.from("province_nodes").update({
        garrison_strength: 0,
        controlled_by: newOwner,
        besieged_by: null,
        besieging_stack_id: null,
        siege_turn_start: null,
      }).eq("id", node.id);

      await supabase.from("military_stacks")
        .update({ stance: "defending" }).eq("id", node.besieging_stack_id);

      await supabase.from("game_events").insert({
        session_id: sessionId,
        player: newOwner || "system",
        event_type: "node_captured",
        turn_number: currentTurn,
        note: `${node.name} padl po obléhání! Nový pán: ${newOwner || "nikdo"}.`,
        importance: "critical",
        confirmed: true,
        truth_state: "canon",
      });
      result.siegeCaptures++;
    } else {
      await supabase.from("province_nodes")
        .update({ garrison_strength: newGarrison }).eq("id", node.id);
    }
  }

  // ── 4. Node project progression ──
  const { data: activeProjects } = await supabase
    .from("node_projects")
    .select("id, project_type, progress, total_turns, node_id, route_id, target_node_id, province_id, initiated_by, name, result_payload")
    .eq("session_id", sessionId)
    .eq("status", "active");

  for (const proj of (activeProjects || [])) {
    const newProgress = (proj.progress || 0) + 1;
    if (newProgress < proj.total_turns) {
      await supabase.from("node_projects").update({ progress: newProgress }).eq("id", proj.id);
      continue;
    }

    await supabase.from("node_projects").update({
      progress: newProgress,
      status: "completed",
      completed_turn: currentTurn,
    }).eq("id", proj.id);

    switch (proj.project_type) {
      case "create_fort":
        if (proj.node_id) {
          await supabase.from("province_nodes").update({
            fortification_level: 3, node_type: "fortress", garrison_strength: 20,
          }).eq("id", proj.node_id);
        }
        break;
      case "create_port":
        if (proj.node_id) {
          await supabase.from("province_nodes").update({
            node_type: "port", infrastructure_level: 2,
          }).eq("id", proj.node_id);
        }
        break;
      case "expand_hub":
        if (proj.node_id) {
          const { data: node } = await supabase.from("province_nodes")
            .select("economic_value, infrastructure_level").eq("id", proj.node_id).maybeSingle();
          if (node) {
            await supabase.from("province_nodes").update({
              economic_value: (node.economic_value || 0) + 5,
              infrastructure_level: (node.infrastructure_level || 0) + 1,
              is_major: true,
            }).eq("id", proj.node_id);
          }
        }
        break;
      case "upgrade_route":
        if (proj.route_id) {
          const { data: route } = await supabase.from("province_routes")
            .select("upgrade_level, capacity_value, speed_value").eq("id", proj.route_id).maybeSingle();
          if (route) {
            await supabase.from("province_routes").update({
              upgrade_level: (route.upgrade_level || 0) + 1,
              capacity_value: (route.capacity_value || 1) + 2,
              speed_value: (route.speed_value || 1) + 1,
            }).eq("id", proj.route_id);
          }
        }
        break;
      case "repair_route":
        if (proj.route_id) {
          await supabase.from("province_routes")
            .update({ damage_level: 0, control_state: "open" }).eq("id", proj.route_id);
        }
        break;
      case "build_route":
        if (proj.route_id) {
          await supabase.from("province_routes")
            .update({ control_state: "open" }).eq("id", proj.route_id);
        }
        break;
    }

    await supabase.from("game_events").insert({
      session_id: sessionId,
      player: proj.initiated_by,
      event_type: "construction",
      turn_number: currentTurn,
      note: `Projekt „${proj.name}" dokončen!`,
      importance: "normal",
      confirmed: true,
      truth_state: "canon",
    });
    result.projectsCompleted++;
  }

  return result;
}
