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
import { checkTerritoryAccess, loadDiplomacyState, loadHexOwners } from "./diplomacyEnforcement.ts";

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
    .select("id, player_name, controller_player, hex_q, hex_r, grid_x, grid_y, moved_this_turn, is_deployed")
    .eq("id", stackId)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (stackErr || !stack) return { ok: false, error: "Stack nenalezen.", code: "STACK_NOT_FOUND" };
  if (stack.player_name !== actorName && stack.controller_player !== actorName) return { ok: false, error: "Tento stack není tvůj.", code: "NOT_OWNER" };
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

  // Phase 6 — diplomatic passage. Foreign land in peacetime needs open borders or an alliance.
  const traversed = plannedPath.slice(1, allowed.allowedSteps + 1);
  if (traversed.length > 0) {
    const [{ pacts, wars }, owners] = await Promise.all([
      loadDiplomacyState(supabase, sessionId),
      loadHexOwners(supabase, sessionId, traversed, gridKind),
    ]);
    const access = checkTerritoryAccess(pacts, wars, actorName, owners);
    if (access.ok === false) {
      return { ok: false, error: access.error, code: "BLOCKED_NO_PASSAGE" };
    }
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

// ── Micro-square movement (square4 worlds) ─────────────────────────────
import { type Micro, type MicroTerrain, MOVE_BUDGET, defaultArmyParcel, microKey, microOf, tileOfMicro, validateMicroPath } from "./microMovement.ts";

export type ApplyMicroMoveResult =
  | { ok: true; stackId: string; final: Micro; gridX: number; gridY: number; parcelIndex: number; spent: number; steps: number }
  | { ok: false; error: string; code: string };

const MICRO_BLOCK_TEXT: Record<string, string> = {
  too_short: "Cesta musí mít alespoň jeden krok.",
  not_adjacent: "Cesta přeskakuje políčka.",
  impassable: "Cesta vede přes vodu nebo řeku bez mostu.",
  over_budget: "Na tuto vzdálenost armáda za jedno kolo nedojde.",
};

/** Loads terrain (macro biome, sub-biome, completed road cells) for every micro square of the given tiles. */
export async function loadMicroTerrain(supabase: any, sessionId: string, path: Micro[]): Promise<(m: Micro) => MicroTerrain | undefined> {
  const tiles = path.map(tileOfMicro);
  const minX = Math.min(...tiles.map(t => t.gridX)), maxX = Math.max(...tiles.map(t => t.gridX));
  const minY = Math.min(...tiles.map(t => t.gridY)), maxY = Math.max(...tiles.map(t => t.gridY));
  const [{ data: hexes, error: hexErr }, { data: parcels, error: parErr }, { data: roads, error: roadErr }] = await Promise.all([
    supabase.from("province_hexes").select("grid_x, grid_y, biome_family, is_passable").eq("session_id", sessionId)
      .gte("grid_x", minX).lte("grid_x", maxX).gte("grid_y", minY).lte("grid_y", maxY),
    supabase.from("tile_parcels").select("grid_x, grid_y, parcel_index, sub_biome").eq("session_id", sessionId)
      .gte("grid_x", minX).lte("grid_x", maxX).gte("grid_y", minY).lte("grid_y", maxY).limit(5000),
    supabase.from("road_segments").select("sub_path_cells").eq("session_id", sessionId).eq("status", "completed").limit(5000),
  ]);
  if (hexErr || parErr || roadErr) throw new Error("Terén pro pohyb se nepodařilo načíst.");
  const macro = new Map<string, { biome: string | null; passable: boolean | null }>();
  for (const h of hexes || []) macro.set(`${h.grid_x},${h.grid_y}`, { biome: h.biome_family, passable: h.is_passable });
  const sub = new Map<string, string>();
  for (const p of parcels || []) sub.set(microKey(microOf(p.grid_x, p.grid_y, p.parcel_index)), p.sub_biome);
  const road = new Set<string>();
  for (const r of roads || []) for (const c of (Array.isArray(r.sub_path_cells) ? r.sub_path_cells : [])) {
    if ([c?.gridX, c?.gridY, c?.parcelX, c?.parcelY].every((v: unknown) => typeof v === "number")) road.add(`${c.gridX * 6 + c.parcelX},${c.gridY * 6 + c.parcelY}`);
  }
  return (m: Micro) => {
    const t = tileOfMicro(m);
    const mac = macro.get(`${t.gridX},${t.gridY}`);
    if (!mac) return undefined;
    return { macroBiome: mac.biome, macroPassable: mac.passable, subBiome: sub.get(microKey(m)) ?? null, road: road.has(microKey(m)) };
  };
}

export async function applyStackMicroMove(
  supabase: any,
  args: { sessionId: string; stackId: string; microPath: Micro[]; actorName: string },
): Promise<ApplyMicroMoveResult> {
  const { sessionId, stackId, actorName } = args;
  const microPath = (Array.isArray(args.microPath) ? args.microPath : [])
    .filter(m => Number.isInteger(m?.x) && Number.isInteger(m?.y)).map(m => ({ x: m.x, y: m.y }));
  if (microPath.length < 2 || microPath.length > MOVE_BUDGET / 10 + 1) {
    return { ok: false, error: MICRO_BLOCK_TEXT.too_short, code: "PATH_INVALID" };
  }
  const { data: stack, error: stackErr } = await supabase.from("military_stacks")
    .select("id, player_name, controller_player, grid_x, grid_y, hex_q, hex_r, parcel_index, moved_this_turn")
    .eq("id", stackId).eq("session_id", sessionId).maybeSingle();
  if (stackErr || !stack) return { ok: false, error: "Armáda nenalezena.", code: "STACK_NOT_FOUND" };
  if (stack.player_name !== actorName && stack.controller_player !== actorName) return { ok: false, error: "Tato armáda není tvoje.", code: "NOT_OWNER" };
  // Passage rights are the owner's, even when a controller gives the order.
  const ownerName = stack.player_name;
  if (stack.moved_this_turn) return { ok: false, error: "Tato armáda se už v tomto kole pohnula.", code: "ALREADY_MOVED" };
  const legacyGrid = typeof stack.grid_x !== "number" || typeof stack.grid_y !== "number";
  if (legacyGrid) {
    // Armies recruited before the square grid kept only hex_q/hex_r (same as grid_x/grid_y on square maps); the UI shows them there.
    if (typeof stack.hex_q !== "number" || typeof stack.hex_r !== "number") return { ok: false, error: "Armáda nemá pozici na mapě.", code: "POSITION_MISSING" };
    stack.grid_x = stack.hex_q; stack.grid_y = stack.hex_r;
  }
  const startParcel = stack.parcel_index ?? defaultArmyParcel(stack.id);
  const start = microOf(stack.grid_x, stack.grid_y, startParcel);
  if (microPath[0].x !== start.x || microPath[0].y !== start.y) return { ok: false, error: "Cesta nezačíná u armády.", code: "PATH_START_MISMATCH" };

  let terrainAt;
  try { terrainAt = await loadMicroTerrain(supabase, sessionId, microPath); }
  catch (e) { return { ok: false, error: (e as Error).message, code: "TERRAIN_UNAVAILABLE" }; }
  const check = validateMicroPath(microPath, terrainAt);
  if (check.ok === false) return { ok: false, error: MICRO_BLOCK_TEXT[check.reason], code: `BLOCKED_${check.reason.toUpperCase()}` };

  const startTile = `${stack.grid_x},${stack.grid_y}`;
  const traversed = Array.from(new Map(microPath.slice(1).map(tileOfMicro)
    .map(t => [`${t.gridX},${t.gridY}`, { q: t.gridX, r: t.gridY }])).entries())
    .filter(([k]) => k !== startTile).map(([, v]) => v);
  if (traversed.length) {
    const [{ pacts, wars }, owners] = await Promise.all([
      loadDiplomacyState(supabase, sessionId),
      loadHexOwners(supabase, sessionId, traversed, "square4"),
    ]);
    const access = checkTerritoryAccess(pacts, wars, ownerName, owners);
    if (access.ok === false) return { ok: false, error: access.error, code: "BLOCKED_NO_PASSAGE" };
  }

  const final = microPath[microPath.length - 1];
  const dest = tileOfMicro(final);
  let upd = supabase.from("military_stacks")
    .update({ grid_x: dest.gridX, grid_y: dest.gridY, hex_q: dest.gridX, hex_r: dest.gridY, parcel_index: dest.parcelIndex, moved_this_turn: true })
    .eq("id", stackId).eq("session_id", sessionId).eq("moved_this_turn", false);
  upd = legacyGrid ? upd.is("grid_x", null).eq("hex_q", stack.grid_x).eq("hex_r", stack.grid_y) : upd.eq("grid_x", stack.grid_x).eq("grid_y", stack.grid_y);
  upd = stack.parcel_index === null ? upd.is("parcel_index", null) : upd.eq("parcel_index", stack.parcel_index);
  const { data: updated, error: updErr } = await upd.select("id").maybeSingle();
  if (updErr) return { ok: false, error: `Přesun selhal: ${updErr.message}`, code: "WRITE_FAILED" };
  if (!updated) return { ok: false, error: "Armádu mezitím přesunul jiný proces.", code: "RACE_LOST" };
  return { ok: true, stackId, final, gridX: dest.gridX, gridY: dest.gridY, parcelIndex: dest.parcelIndex, spent: check.spent, steps: check.steps };
}
