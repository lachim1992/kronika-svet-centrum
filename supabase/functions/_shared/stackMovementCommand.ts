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
    .select("id, player_name, hex_q, hex_r, moved_this_turn, is_deployed")
    .eq("id", stackId)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (stackErr || !stack) return { ok: false, error: "Stack nenalezen.", code: "STACK_NOT_FOUND" };
  if (stack.player_name !== actorName) return { ok: false, error: "Tento stack není tvůj.", code: "NOT_OWNER" };
  if (!bypassMovedThisTurn && stack.moved_this_turn) {
    return { ok: false, error: "Tato jednotka se již tento tah přesunula.", code: "ALREADY_MOVED" };
  }

  // Server validates: path[0] === current pos
  const start = plannedPath[0];
  if (start.q !== stack.hex_q || start.r !== stack.hex_r) {
    return { ok: false, error: "Plánovaná cesta nezačíná na pozici stacku.", code: "PATH_START_MISMATCH" };
  }

  // Load all hexes on the planned path (max 3)
  const qList = plannedPath.map(h => h.q);
  const rList = plannedPath.map(h => h.r);
  const minQ = Math.min(...qList) - 1, maxQ = Math.max(...qList) + 1;
  const minR = Math.min(...rList) - 1, maxR = Math.max(...rList) + 1;

  const { data: hexRows } = await supabase
    .from("province_hexes")
    .select("q, r, biome_family, is_passable, has_river, has_bridge")
    .eq("session_id", sessionId)
    .gte("q", minQ).lte("q", maxQ)
    .gte("r", minR).lte("r", maxR);

  const lookup = new Map<string, HexInfo>();
  for (const h of (hexRows || [])) lookup.set(hexKey(h.q, h.r), h);

  const roadEdges = await buildRoadEdgeIndex(supabase, sessionId);
  const allowed = computeAllowedMove(plannedPath, lookup, roadEdges);

  if (allowed.allowedSteps === 0) {
    return {
      ok: false,
      error: `Pohyb zablokován: ${allowed.blockedReason ?? "neznámý důvod"}`,
      code: `BLOCKED_${(allowed.blockedReason ?? "unknown").toUpperCase()}`,
    };
  }

  // Atomic conditional update — guards against concurrent writers.
  const { data: updated, error: updErr } = await supabase
    .from("military_stacks")
    .update({
      hex_q: allowed.finalHex.q,
      hex_r: allowed.finalHex.r,
      moved_this_turn: true,
    })
    .eq("id", stackId)
    .eq("session_id", sessionId)
    .eq("hex_q", stack.hex_q)
    .eq("hex_r", stack.hex_r)
    .select("id")
    .maybeSingle();

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
