// Authoritative writer for stack moves.
// Used by both command-dispatch (player MOVE_STACK) and ai-faction-turn (AI move_army).
// Performs validation + atomic conditional update against (start_q, start_r) to prevent races.

import {
  type Hex,
  type HexInfo,
  buildRoadEdgeIndex,
  computeAllowedMove,
  hexKey,
} from "./movement.ts";

export type ApplyStackMoveResult =
  | { ok: true; stackId: string; finalHex: Hex; allowedSteps: number; usedRoadBonus: boolean }
  | { ok: false; error: string; code: string };

export async function applyStackMove(
  supabase: any,
  args: {
    sessionId: string;
    stackId: string;
    plannedPath: Hex[];
    actorName: string;
    bypassMovedThisTurn?: boolean;
  },
): Promise<ApplyStackMoveResult> {
  const { sessionId, stackId, plannedPath, actorName, bypassMovedThisTurn } = args;

  if (!Array.isArray(plannedPath) || plannedPath.length < 2) {
    return { ok: false, error: "Plánovaná cesta musí mít alespoň 2 hexy.", code: "PATH_TOO_SHORT" };
  }

  // Load stack
  const { data: stack, error: stackErr } = await supabase
    .from("military_stacks")
    .select("id, player_name, hex_q, hex_r, grid_x, grid_y, moved_this_turn, is_deployed")
    .eq("id", stackId)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (stackErr || !stack) return { ok: false, error: "Stack nenalezen.", code: "STACK_NOT_FOUND" };
  if (stack.player_name !== actorName) return { ok: false, error: "Tento stack není tvůj.", code: "NOT_OWNER" };
  if (!bypassMovedThisTurn && stack.moved_this_turn) {
    return { ok: false, error: "Tato jednotka se již tento tah přesunula.", code: "ALREADY_MOVED" };
  }

  const { data: foundation } = await supabase
    .from("world_foundations")
    .select("grid_kind")
    .eq("session_id", sessionId)
    .maybeSingle();
  const gridKind = foundation?.grid_kind === "square4" ? "square4" : "hex6";
  const stackQ = gridKind === "square4" ? stack.grid_x : stack.hex_q;
  const stackR = gridKind === "square4" ? stack.grid_y : stack.hex_r;
  if (typeof stackQ !== "number" || typeof stackR !== "number") {
    return { ok: false, error: "Stack nemá platnou pozici pro tento typ mapy.", code: "POSITION_MISSING" };
  }

  // Server validates: path[0] === current position in the world's topology.
  const start = plannedPath[0];
  if (start.q !== stackQ || start.r !== stackR) {
    return { ok: false, error: "Plánovaná cesta nezačíná na pozici stacku.", code: "PATH_START_MISMATCH" };
  }

  // Load all hexes on the planned path (max 3)
  const qList = plannedPath.map(h => h.q);
  const rList = plannedPath.map(h => h.r);
  const minQ = Math.min(...qList) - 1, maxQ = Math.max(...qList) + 1;
  const minR = Math.min(...rList) - 1, maxR = Math.max(...rList) + 1;

  let terrainQuery = supabase
    .from("province_hexes")
    .select("q, r, grid_x, grid_y, biome_family, is_passable, has_river, has_bridge")
    .eq("session_id", sessionId);
  terrainQuery = gridKind === "square4"
    ? terrainQuery.gte("grid_x", minQ).lte("grid_x", maxQ).gte("grid_y", minR).lte("grid_y", maxR)
    : terrainQuery.gte("q", minQ).lte("q", maxQ).gte("r", minR).lte("r", maxR);
  const { data: hexRows } = await terrainQuery;

  const lookup = new Map<string, HexInfo>();
  for (const h of (hexRows || [])) {
    const q = gridKind === "square4" ? h.grid_x : h.q;
    const r = gridKind === "square4" ? h.grid_y : h.r;
    if (typeof q === "number" && typeof r === "number") lookup.set(hexKey(q, r), { ...h, q, r });
  }

  const roadEdges = await buildRoadEdgeIndex(supabase, sessionId, gridKind);
  const allowed = computeAllowedMove(plannedPath, lookup, roadEdges, gridKind);

  if (allowed.allowedSteps === 0) {
    return {
      ok: false,
      error: `Pohyb zablokován: ${allowed.blockedReason ?? "neznámý důvod"}`,
      code: `BLOCKED_${(allowed.blockedReason ?? "unknown").toUpperCase()}`,
    };
  }

  // Atomic conditional update — guards against concurrent writers.
  const positionUpdate = gridKind === "square4"
    ? { grid_x: allowed.finalHex.q, grid_y: allowed.finalHex.r, hex_q: allowed.finalHex.q, hex_r: allowed.finalHex.r, moved_this_turn: true }
    : { hex_q: allowed.finalHex.q, hex_r: allowed.finalHex.r, moved_this_turn: true };
  let updateQuery = supabase
    .from("military_stacks")
    .update(positionUpdate)
    .eq("id", stackId)
    .eq("session_id", sessionId);
  updateQuery = gridKind === "square4"
    ? updateQuery.eq("grid_x", stackQ).eq("grid_y", stackR)
    : updateQuery.eq("hex_q", stackQ).eq("hex_r", stackR);
  const { data: updated, error: updErr } = await updateQuery.select("id").maybeSingle();

  if (updErr) return { ok: false, error: `Move failed: ${updErr.message}`, code: "WRITE_FAILED" };
  if (!updated) {
    return { ok: false, error: "Stack mezitím přesunul jiný proces.", code: "RACE_LOST" };
  }

  return {
    ok: true,
    stackId,
    finalHex: allowed.finalHex,
    allowedSteps: allowed.allowedSteps,
    usedRoadBonus: allowed.usedRoadBonus,
  };
}
