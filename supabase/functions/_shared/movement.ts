// Shared movement engine — used by both command-dispatch (player) and ai-faction-turn (AI).
// Pure compute. No DB writes. See _shared/stackMovementCommand.ts for the authoritative writer.
//
// Movement rules (Inkrement 1):
//  - base = 1 hex/turn over any passable hex
//  - bonus 2 hex/turn ONLY when both consecutive edges are road-edges of the SAME route_id,
//    that route is construction_state='complete' AND control_state='open',
//    and both edges appear as consecutive entries in flow_paths.hex_path.
//  - hard terrain (mountain, swamp, dense_forest) ends movement upon entry (variant B).
//  - impassable hex is never entered.

export type Hex = { q: number; r: number };

export type HexInfo = {
  q: number;
  r: number;
  biome_family?: string | null;
  is_passable?: boolean | null;
  has_river?: boolean | null;
  has_bridge?: boolean | null;
};

export type RoadEdge = {
  routeId: string;
  complete: boolean;
  open: boolean;
};

export type RoadEdgeIndex = Map<string, RoadEdge>;

export const AXIAL_NEIGHBORS: ReadonlyArray<{ dq: number; dr: number }> = [
  { dq: 1, dr: 0 }, { dq: -1, dr: 0 },
  { dq: 0, dr: 1 }, { dq: 0, dr: -1 },
  { dq: 1, dr: -1 }, { dq: -1, dr: 1 },
];

export const HARD_BIOMES = new Set(["mountains", "mountain", "swamp", "dense_forest"]);

export function hexKey(q: number, r: number): string { return `${q},${r}`; }
export function edgeKey(a: Hex, b: Hex): string {
  // Undirected canonical key
  const ak = `${a.q},${a.r}`;
  const bk = `${b.q},${b.r}`;
  return ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
}

export function hexDistance(a: Hex, b: Hex): number {
  const dq = a.q - b.q, dr = a.r - b.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

export function areAdjacent(a: Hex, b: Hex): boolean {
  return hexDistance(a, b) === 1;
}

export function isHardTerrain(hex?: HexInfo | null): boolean {
  if (!hex || !hex.biome_family) return false;
  return HARD_BIOMES.has(hex.biome_family);
}

export function isImpassable(hex?: HexInfo | null): boolean {
  if (!hex) return false;
  if (hex.is_passable === false) return true;
  if (hex.biome_family === "sea") return true;
  if (hex.biome_family === "mountains" || hex.biome_family === "mountain") return true;
  if (hex.has_river && !hex.has_bridge) return true;
  return false;
}

/**
 * Build an index of road edges from flow_paths rows of complete+open routes.
 * Only consecutive (q,r) pairs in hex_path become edges, tagged with their route_id.
 */
export async function buildRoadEdgeIndex(
  supabase: any,
  sessionId: string,
): Promise<RoadEdgeIndex> {
  const idx: RoadEdgeIndex = new Map();

  // Fetch open+complete routes for this session
  const { data: routes } = await supabase
    .from("province_routes")
    .select("id, construction_state, control_state")
    .eq("session_id", sessionId)
    .eq("construction_state", "complete");

  if (!routes || routes.length === 0) return idx;

  const openRouteIds = new Set<string>();
  for (const r of routes) {
    const ctrl = (r.control_state ?? "open") as string;
    if (ctrl === "open" || ctrl === "" || ctrl == null) openRouteIds.add(r.id);
  }
  if (openRouteIds.size === 0) return idx;

  const { data: flows } = await supabase
    .from("flow_paths")
    .select("route_id, hex_path")
    .eq("session_id", sessionId)
    .in("route_id", Array.from(openRouteIds));

  for (const fp of (flows || [])) {
    const path = fp.hex_path as Array<{ q: number; r: number }> | null;
    if (!Array.isArray(path) || path.length < 2) continue;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      if (typeof a?.q !== "number" || typeof a?.r !== "number") continue;
      if (typeof b?.q !== "number" || typeof b?.r !== "number") continue;
      if (!areAdjacent(a, b)) continue;
      idx.set(edgeKey(a, b), { routeId: fp.route_id, complete: true, open: true });
    }
  }
  return idx;
}

export type AllowedMove = {
  allowedSteps: number;
  finalHex: Hex;
  usedRoadBonus: boolean;
  blockedReason: string | null;
};

/**
 * Validate & evaluate a planned path of length ≤ 3 hexes (start + up to 2 steps).
 * Server caller is responsible for asserting plannedPath[0] equals current stack pos.
 *
 * @param hexLookup map from "q,r" → HexInfo for every hex in the planned path
 */
export function computeAllowedMove(
  plannedPath: Hex[],
  hexLookup: Map<string, HexInfo>,
  roadEdges: RoadEdgeIndex,
): AllowedMove {
  if (!plannedPath || plannedPath.length === 0) {
    return { allowedSteps: 0, finalHex: { q: 0, r: 0 }, usedRoadBonus: false, blockedReason: "empty_path" };
  }
  const start = plannedPath[0];
  if (plannedPath.length === 1) {
    return { allowedSteps: 0, finalHex: start, usedRoadBonus: false, blockedReason: null };
  }

  const step1 = plannedPath[1];
  if (!areAdjacent(start, step1)) {
    return { allowedSteps: 0, finalHex: start, usedRoadBonus: false, blockedReason: "step1_not_adjacent" };
  }
  const step1Info = hexLookup.get(hexKey(step1.q, step1.r));
  if (isImpassable(step1Info)) {
    return { allowedSteps: 0, finalHex: start, usedRoadBonus: false, blockedReason: "step1_impassable" };
  }

  // Step 1 is always allowed if passable
  let allowedSteps = 1;
  let finalHex: Hex = step1;

  // Hard terrain entry → movement ends here
  if (isHardTerrain(step1Info)) {
    return { allowedSteps: 1, finalHex: step1, usedRoadBonus: false, blockedReason: null };
  }

  // Try step 2 with road bonus
  if (plannedPath.length >= 3) {
    const step2 = plannedPath[2];
    if (!areAdjacent(step1, step2)) {
      return { allowedSteps, finalHex, usedRoadBonus: false, blockedReason: "step2_not_adjacent" };
    }
    const step2Info = hexLookup.get(hexKey(step2.q, step2.r));
    if (isImpassable(step2Info)) {
      return { allowedSteps, finalHex, usedRoadBonus: false, blockedReason: "step2_impassable" };
    }

    const e1 = roadEdges.get(edgeKey(start, step1));
    const e2 = roadEdges.get(edgeKey(step1, step2));
    const sameRoute = e1 && e2 && e1.routeId === e2.routeId && e1.complete && e1.open && e2.complete && e2.open;

    if (sameRoute) {
      // Step 2 entry: hard terrain still ends movement (variant B), but step 1 already counted.
      if (isHardTerrain(step2Info)) {
        return { allowedSteps: 1, finalHex: step1, usedRoadBonus: false, blockedReason: "step2_hard_terrain_blocks_bonus" };
      }
      allowedSteps = 2;
      finalHex = step2;
      return { allowedSteps, finalHex, usedRoadBonus: true, blockedReason: null };
    }
    // No bonus → step 2 not taken
    return { allowedSteps, finalHex, usedRoadBonus: false, blockedReason: "no_road_bonus" };
  }

  return { allowedSteps, finalHex, usedRoadBonus: false, blockedReason: null };
}

/**
 * Naive single-step toward target, used by AI when full A* is overkill.
 * Picks the neighbor that minimises hex distance to target and is in hexLookup as passable.
 */
export function stepToward(
  from: Hex,
  target: Hex,
  hexLookup: Map<string, HexInfo>,
): Hex | null {
  let best: Hex | null = null;
  let bestDist = Infinity;
  for (const n of AXIAL_NEIGHBORS) {
    const cand = { q: from.q + n.dq, r: from.r + n.dr };
    const info = hexLookup.get(hexKey(cand.q, cand.r));
    if (info && isImpassable(info)) continue;
    // Allow stepping into unknown hex (no info) to avoid AI getting stuck on map fog;
    // executor will re-validate at write time.
    const d = hexDistance(cand, target);
    if (d < bestDist) { bestDist = d; best = cand; }
  }
  return best;
}

/**
 * Plan a 1- or 2-hex path from `from` toward `target`, respecting passability and
 * road bonus rules. Returns the planned path including start.
 */
export async function planShortHopToward(
  supabase: any,
  sessionId: string,
  from: Hex,
  target: Hex,
): Promise<{ path: Hex[]; usedRoadBonus: boolean }> {
  // Pull a 3-hex radius around `from` to validate up to 2 steps
  const minQ = from.q - 3, maxQ = from.q + 3;
  const minR = from.r - 3, maxR = from.r + 3;

  const { data: hexes } = await supabase
    .from("province_hexes")
    .select("q, r, biome_family, is_passable, has_river, has_bridge")
    .eq("session_id", sessionId)
    .gte("q", minQ).lte("q", maxQ)
    .gte("r", minR).lte("r", maxR);

  const lookup = new Map<string, HexInfo>();
  for (const h of (hexes || [])) lookup.set(hexKey(h.q, h.r), h);

  const step1 = stepToward(from, target, lookup);
  if (!step1) return { path: [from], usedRoadBonus: false };

  const candidate2: Hex[] = [from, step1];
  const step2 = stepToward(step1, target, lookup);
  if (step2 && (step2.q !== from.q || step2.r !== from.r)) candidate2.push(step2);

  const roadEdges = await buildRoadEdgeIndex(supabase, sessionId);
  const allowed = computeAllowedMove(candidate2, lookup, roadEdges);

  const finalPath: Hex[] = [from];
  if (allowed.allowedSteps >= 1) finalPath.push(allowed.finalHex);
  return { path: finalPath, usedRoadBonus: allowed.usedRoadBonus };
}

export function explainMove(
  plannedPath: Hex[],
  hexLookup: Map<string, HexInfo>,
  roadEdges: RoadEdgeIndex,
): { result: AllowedMove; trace: string[] } {
  const trace: string[] = [];
  trace.push(`planned_len=${plannedPath.length}`);
  const result = computeAllowedMove(plannedPath, hexLookup, roadEdges);
  trace.push(`allowedSteps=${result.allowedSteps} usedRoadBonus=${result.usedRoadBonus} blocked=${result.blockedReason ?? "-"}`);
  return { result, trace };
}
