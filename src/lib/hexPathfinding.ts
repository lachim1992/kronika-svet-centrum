/**
 * Client-side A* hex pathfinding for route preview.
 * Mirrors the server-side logic in _shared/physics.ts.
 */

/** Biome family → base traversal cost (resistance).
 * Plains = lowest, then forest, hills, desert, mountains, ocean.
 * Corridors naturally follow plains → forests → hills.
 */
export const BIOME_TRAVERSAL_COST: Record<string, number> = {
  plains: 1.0,
  grassland: 1.0,
  river_valley: 1.0,
  delta: 1.0,
  coastal: 1.2,
  steppe: 1.3,
  wetland: 1.8,
  forest: 2.0,
  dense_forest: 3.0,
  hills: 3.5,
  swamp: 4.0,
  tundra: 4.5,
  desert: 6.0,
  mountain: 12.0,
  ocean: 50.0,
};

export interface HexData {
  q: number;
  r: number;
  biome_family: string;
  mean_height?: number;
  has_river?: boolean;
  has_bridge?: boolean;
  is_passable?: boolean;
  coastal?: boolean;
}

export interface PathNode {
  q: number;
  r: number;
  /** Node type if a strategic node exists here */
  node_type?: string;
}

export interface AStarResult {
  path: Array<{ q: number; r: number; cost: number }>;
  totalCost: number;
  bottleneck: { q: number; r: number; cost: number } | null;
  pathLength: number;
}

const HEX_NEIGHBORS = [
  { dq: 1, dr: 0 }, { dq: -1, dr: 0 },
  { dq: 0, dr: 1 }, { dq: 0, dr: -1 },
  { dq: 1, dr: -1 }, { dq: -1, dr: 1 },
];

function hexDist(q1: number, r1: number, q2: number, r2: number): number {
  const dq = q1 - q2, dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

/**
 * Build a hex cost function from raw hex data + node positions.
 * Pass nodes on mountain/hill hexes reduce cost to ~forest level.
 */
export function buildHexCostFn(
  hexes: HexData[],
  passNodeHexes?: Set<string>,
): (q: number, r: number) => number {
  const hexMap = new Map<string, HexData>();
  for (const h of hexes) hexMap.set(`${h.q},${h.r}`, h);

  return (q: number, r: number): number => {
    const k = `${q},${r}`;
    const hex = hexMap.get(k);
    if (!hex) return 5.0; // Unknown frontier hex

    if (hex.is_passable === false) return Infinity;

    let cost = BIOME_TRAVERSAL_COST[hex.biome_family] ?? 2.0;

    // Mountain pass node reduces mountain/hill cost
    if (passNodeHexes?.has(k) && (hex.biome_family === "mountain" || hex.biome_family === "hills")) {
      cost = 2.0;
    }

    // Height penalty
    const height = hex.mean_height ?? 0.5;
    if (height > 0.7) cost += (height - 0.7) * 5;

    // River crossing without bridge
    if (hex.has_river && !hex.has_bridge) cost += 3.0;

    // Coastal slight bonus
    if (hex.coastal) cost *= 0.9;

    return Math.round(cost * 100) / 100;
  };
}

/**
 * A* shortest path between two hexes.
 * Returns null if no path found within maxRange.
 */
export function astarHexPath(
  startQ: number, startR: number,
  endQ: number, endR: number,
  hexCostFn: (q: number, r: number) => number,
  maxRange: number = 50,
): AStarResult | null {
  const key = (q: number, r: number) => `${q},${r}`;
  const startKey = key(startQ, startR);
  const endKey = key(endQ, endR);

  if (startKey === endKey) {
    return { path: [{ q: startQ, r: startR, cost: 0 }], totalCost: 0, bottleneck: null, pathLength: 0 };
  }

  const gScore = new Map<string, number>();
  const prev = new Map<string, string>();
  const visited = new Set<string>();

  const pq: Array<{ q: number; r: number; g: number; f: number }> = [];

  gScore.set(startKey, 0);
  pq.push({ q: startQ, r: startR, g: 0, f: hexDist(startQ, startR, endQ, endR) });

  while (pq.length > 0) {
    pq.sort((a, b) => a.f - b.f);
    const current = pq.shift()!;
    const ck = key(current.q, current.r);

    if (visited.has(ck)) continue;
    visited.add(ck);

    if (ck === endKey) break;

    for (const { dq, dr } of HEX_NEIGHBORS) {
      const nq = current.q + dq;
      const nr = current.r + dr;
      const nk = key(nq, nr);

      if (visited.has(nk)) continue;
      if (hexDist(nq, nr, startQ, startR) > maxRange) continue;

      const edgeCost = hexCostFn(nq, nr);
      if (edgeCost === Infinity || edgeCost <= 0) continue;

      const tentativeG = current.g + edgeCost;
      if (tentativeG < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, tentativeG);
        prev.set(nk, ck);
        pq.push({ q: nq, r: nr, g: tentativeG, f: tentativeG + hexDist(nq, nr, endQ, endR) });
      }
    }
  }

  if (!gScore.has(endKey)) return null;

  const path: Array<{ q: number; r: number; cost: number }> = [];
  let cur: string | undefined = endKey;
  while (cur) {
    const [q, r] = cur.split(",").map(Number);
    path.unshift({ q, r, cost: cur === startKey ? 0 : hexCostFn(q, r) });
    cur = prev.get(cur);
  }

  let bottleneck: AStarResult["bottleneck"] = null;
  let maxCost = 0;
  for (const step of path) {
    if (step.cost > maxCost) {
      maxCost = step.cost;
      bottleneck = step;
    }
  }

  return {
    path,
    totalCost: gScore.get(endKey)!,
    bottleneck,
    pathLength: path.length,
  };
}
