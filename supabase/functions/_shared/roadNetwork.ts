/**
 * Shared road network module — canonical road tiers, cardinal-grid path utilities,
 * terrain/river costing, and a capacity-aware road+river graph with shortest-path
 * and reservation helpers.
 *
 * Self-contained: no imports from other project modules, so it can be duplicated
 * verbatim (as a thin `.ts`-extension wrapper) into `supabase/functions/_shared`
 * for Deno edge functions. Keep both copies in sync when editing.
 */

// ═══════════════════════════════════════════════════════════════════════════
// ROAD TIERS
// ═══════════════════════════════════════════════════════════════════════════

export type RoadTierKey = "trail" | "road" | "paved" | "highway";

export interface RoadTierDefinition {
  key: RoadTierKey;
  level: number;
  label: string;
  /** One-time construction cost per grid edge. */
  cost: { gold: number; production: number };
  /** Turns required to build one edge of this tier. */
  buildTurns: number;
  /** Upkeep paid per turn per edge. */
  maintenance: { gold: number; production: number };
  /** Units of goods/troops that may move through the edge per turn. */
  capacity: number;
  /** Movement speed multiplier applied to the base travel time (higher = faster). */
  speed: number;
  /** Movement friction: multiplies traversal cost; lower is better. */
  friction: number;
}

/** Canonical tier table — single source of truth for road stats across the app. */
export const ROAD_TIERS: readonly RoadTierDefinition[] = [
  {
    key: "trail",
    level: 1,
    label: "Trail",
    cost: { gold: 30, production: 20 },
    buildTurns: 1,
    maintenance: { gold: 1, production: 0 },
    capacity: 4,
    speed: 1.0,
    friction: 1.0,
  },
  {
    key: "road",
    level: 2,
    label: "Road",
    cost: { gold: 65, production: 45 },
    buildTurns: 2,
    maintenance: { gold: 3, production: 1 },
    capacity: 10,
    speed: 1.5,
    friction: 0.65,
  },
  {
    key: "paved",
    level: 3,
    label: "Paved Road",
    cost: { gold: 120, production: 80 },
    buildTurns: 3,
    maintenance: { gold: 6, production: 3 },
    capacity: 20,
    speed: 2.0,
    friction: 0.4,
  },
  {
    key: "highway",
    level: 4,
    label: "Highway",
    cost: { gold: 220, production: 150 },
    buildTurns: 5,
    maintenance: { gold: 12, production: 6 },
    capacity: 40,
    speed: 2.75,
    friction: 0.25,
  },
] as const;

const ROAD_TIER_BY_KEY = new Map(ROAD_TIERS.map(t => [t.key, t]));
const ROAD_TIER_BY_LEVEL = new Map(ROAD_TIERS.map(t => [t.level, t]));

export function roadTierByKey(key: RoadTierKey): RoadTierDefinition {
  const tier = ROAD_TIER_BY_KEY.get(key);
  if (!tier) throw new Error(`Unknown road tier key: ${key}`);
  return tier;
}

export function roadTierByLevel(level: number): RoadTierDefinition {
  const tier = ROAD_TIER_BY_LEVEL.get(level);
  if (!tier) throw new Error(`Unknown road tier level: ${level}`);
  return tier;
}

export function nextRoadTier(key: RoadTierKey): RoadTierDefinition | null {
  const current = roadTierByKey(key);
  return ROAD_TIER_BY_LEVEL.get(current.level + 1) ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CARDINAL GRID PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════

export interface GridCell {
  x: number;
  y: number;
}

export type CardinalDirection = "north" | "south" | "east" | "west";

export interface CardinalStep {
  dx: number;
  dy: number;
  direction: CardinalDirection;
}

/** The four cardinal steps, in a fixed, deterministic order. */
export const CARDINAL_STEPS: readonly CardinalStep[] = [
  { dx: 1, dy: 0, direction: "east" },
  { dx: -1, dy: 0, direction: "west" },
  { dx: 0, dy: 1, direction: "south" },
  { dx: 0, dy: -1, direction: "north" },
];

export const OPPOSITE_DIRECTION: Record<CardinalDirection, CardinalDirection> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
};

/** Stable string key for a grid cell, usable as a Map/Set key. */
export function cellKey(cell: GridCell): string {
  return `${cell.x},${cell.y}`;
}

export function cellFromKey(key: string): GridCell {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}

export function cellsEqual(a: GridCell, b: GridCell): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Canonical, order-independent key for the edge between two cells. */
export function edgeKey(a: GridCell, b: GridCell): string {
  const ak = cellKey(a);
  const bk = cellKey(b);
  return ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
}

export function manhattanDistance(a: GridCell, b: GridCell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** True if `a` and `b` are exactly one cardinal step apart. */
export function isCardinalAdjacent(a: GridCell, b: GridCell): boolean {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
}

/** Returns the cardinal step that goes from `a` to `b`, or null if not adjacent. */
export function cardinalStepBetween(a: GridCell, b: GridCell): CardinalStep | null {
  if (!isCardinalAdjacent(a, b)) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return CARDINAL_STEPS.find(step => step.dx === dx && step.dy === dy) ?? null;
}

/** The four cardinal neighbours of a cell, in fixed step order. */
export function cardinalNeighbours(cell: GridCell): GridCell[] {
  return CARDINAL_STEPS.map(step => ({ x: cell.x + step.dx, y: cell.y + step.dy }));
}

// ── Path validation ──

export interface PathValidationResult {
  valid: boolean;
  /** Reason for failure, or null when valid. */
  reason: "empty" | "non_adjacent_step" | "repeated_cell" | null;
  /** Index of the offending step, if applicable. */
  atIndex?: number;
}

/**
 * Validates that `path` is a sequence of cardinally-adjacent cells with no
 * revisits (simple path). A single-cell path is valid.
 */
export function validateCardinalPath(path: GridCell[], opts: { allowRevisit?: boolean } = {}): PathValidationResult {
  if (!path || path.length === 0) return { valid: false, reason: "empty" };
  const seen = new Set<string>([cellKey(path[0])]);
  for (let i = 1; i < path.length; i++) {
    if (!isCardinalAdjacent(path[i - 1], path[i])) {
      return { valid: false, reason: "non_adjacent_step", atIndex: i };
    }
    const key = cellKey(path[i]);
    if (!opts.allowRevisit && seen.has(key)) {
      return { valid: false, reason: "repeated_cell", atIndex: i };
    }
    seen.add(key);
  }
  return { valid: true, reason: null };
}

/** Total cardinal-step length of a path (number of edges, not cells). */
export function pathLength(path: GridCell[]): number {
  return Math.max(0, path.length - 1);
}

/** Normalizes a path into its ordered list of canonical edge keys. */
export function pathToEdgeKeys(path: GridCell[]): string[] {
  const keys: string[] = [];
  for (let i = 1; i < path.length; i++) keys.push(edgeKey(path[i - 1], path[i]));
  return keys;
}

// ═══════════════════════════════════════════════════════════════════════════
// TERRAIN & RIVER COSTING
// ═══════════════════════════════════════════════════════════════════════════

export type TerrainKind =
  | "plains" | "hills" | "forest" | "swamp" | "desert" | "tundra" | "mountains" | "sea";

/** Movement/build friction multiplier per terrain family (1.0 = baseline plains). */
export const TERRAIN_FRICTION: Record<TerrainKind, number> = {
  plains: 1.0,
  hills: 1.3,
  forest: 1.4,
  desert: 1.2,
  tundra: 1.35,
  swamp: 1.8,
  mountains: 2.5,
  sea: Infinity,
};

/** Extra build cost multiplier per terrain family (construction, not travel). */
export const TERRAIN_BUILD_MULTIPLIER: Record<TerrainKind, number> = {
  plains: 1.0,
  hills: 1.25,
  forest: 1.35,
  desert: 1.15,
  tundra: 1.3,
  swamp: 1.9,
  mountains: 2.2,
  sea: Infinity,
};

export const IMPASSABLE_TERRAIN: ReadonlySet<TerrainKind> = new Set(["sea", "mountains"]);

export function isTerrainPassable(terrain: TerrainKind): boolean {
  return !IMPASSABLE_TERRAIN.has(terrain);
}

export function terrainFriction(terrain: TerrainKind): number {
  return TERRAIN_FRICTION[terrain] ?? 1.0;
}

/** Extra one-time cost of bridging a road over one river crossing. */
export const RIVER_BRIDGE_COST = { gold: 45, production: 30 };

/** Extra ongoing friction applied when a road segment crosses a river without a bridge. */
export const RIVER_FORD_FRICTION_PENALTY = 0.75;

/**
 * Cost (gold/production) to build one road edge of `tier` across `terrain`,
 * optionally crossing `riverCrossings` river channels (each needs a bridge).
 */
export function computeRoadEdgeCost(
  tier: RoadTierDefinition,
  terrain: TerrainKind,
  riverCrossings = 0,
): { gold: number; production: number } {
  const buildMult = TERRAIN_BUILD_MULTIPLIER[terrain] ?? 1.0;
  return {
    gold: Math.round(tier.cost.gold * buildMult + riverCrossings * RIVER_BRIDGE_COST.gold),
    production: Math.round(tier.cost.production * buildMult + riverCrossings * RIVER_BRIDGE_COST.production),
  };
}

/**
 * Effective travel-time cost of moving across a single edge of `tier` over `terrain`,
 * accounting for the tier's own friction/speed and terrain friction. A `bridged`
 * river crossing removes the ford penalty.
 */
export function computeEdgeTravelCost(
  tier: RoadTierDefinition,
  terrain: TerrainKind,
  opts: { riverCrossing?: boolean; bridged?: boolean } = {},
): number {
  if (!isTerrainPassable(terrain)) return Infinity;
  let cost = tier.friction * terrainFriction(terrain) / tier.speed;
  if (opts.riverCrossing && !opts.bridged) cost *= 1 + RIVER_FORD_FRICTION_PENALTY;
  return cost;
}

// ═══════════════════════════════════════════════════════════════════════════
// ROAD + RIVER GRAPH
// ═══════════════════════════════════════════════════════════════════════════

export interface RoadEdgeState {
  a: GridCell;
  b: GridCell;
  tier: RoadTierKey;
  /** Terrain cost basis of the edge (usually the terrain of the destination cell). */
  terrain: TerrainKind;
  riverCrossing?: boolean;
  bridged?: boolean;
  /** Total capacity per turn (defaults to the tier's capacity). */
  capacity?: number;
  /** Capacity already reserved this turn/tick. */
  reserved?: number;
}

interface InternalEdge {
  key: string;
  a: string;
  b: string;
  cell_a: GridCell;
  cell_b: GridCell;
  tier: RoadTierKey;
  terrain: TerrainKind;
  riverCrossing: boolean;
  bridged: boolean;
  capacity: number;
  reserved: number;
  travelCost: number;
}

export interface ReservationResult {
  ok: boolean;
  /** Edge key that failed capacity check, if any. */
  blockedAt?: string;
}

/**
 * A capacity-aware road (+ river) graph over a cardinal grid. Nodes are implicit
 * grid cells; edges are added explicitly (roads actually built between adjacent cells).
 */
export class RoadGraph {
  private edges = new Map<string, InternalEdge>();
  private adjacency = new Map<string, Set<string>>();

  private link(a: string, b: string) {
    if (!this.adjacency.has(a)) this.adjacency.set(a, new Set());
    if (!this.adjacency.has(b)) this.adjacency.set(b, new Set());
    this.adjacency.get(a)!.add(b);
    this.adjacency.get(b)!.add(a);
  }

  /** Add or replace a road edge. Throws if the two cells are not cardinally adjacent. */
  addEdge(edge: RoadEdgeState): void {
    if (!isCardinalAdjacent(edge.a, edge.b)) {
      throw new Error(`RoadGraph.addEdge: ${cellKey(edge.a)} and ${cellKey(edge.b)} are not cardinally adjacent`);
    }
    const tier = roadTierByKey(edge.tier);
    const key = edgeKey(edge.a, edge.b);
    const capacity = edge.capacity ?? tier.capacity;
    const travelCost = computeEdgeTravelCost(tier, edge.terrain, {
      riverCrossing: edge.riverCrossing,
      bridged: edge.bridged,
    });
    this.edges.set(key, {
      key,
      a: cellKey(edge.a),
      b: cellKey(edge.b),
      cell_a: edge.a,
      cell_b: edge.b,
      tier: edge.tier,
      terrain: edge.terrain,
      riverCrossing: !!edge.riverCrossing,
      bridged: !!edge.bridged,
      capacity,
      reserved: edge.reserved ?? 0,
      travelCost,
    });
    this.link(cellKey(edge.a), cellKey(edge.b));
  }

  removeEdge(a: GridCell, b: GridCell): void {
    const key = edgeKey(a, b);
    const edge = this.edges.get(key);
    if (!edge) return;
    this.edges.delete(key);
    this.adjacency.get(edge.a)?.delete(edge.b);
    this.adjacency.get(edge.b)?.delete(edge.a);
  }

  hasEdge(a: GridCell, b: GridCell): boolean {
    return this.edges.has(edgeKey(a, b));
  }

  getEdge(a: GridCell, b: GridCell): RoadEdgeState | null {
    const edge = this.edges.get(edgeKey(a, b));
    if (!edge) return null;
    return {
      a: edge.cell_a, b: edge.cell_b, tier: edge.tier, terrain: edge.terrain,
      riverCrossing: edge.riverCrossing, bridged: edge.bridged,
      capacity: edge.capacity, reserved: edge.reserved,
    };
  }

  remainingCapacity(a: GridCell, b: GridCell): number {
    const edge = this.edges.get(edgeKey(a, b));
    if (!edge) return 0;
    return Math.max(0, edge.capacity - edge.reserved);
  }

  neighboursOf(cell: GridCell): GridCell[] {
    const set = this.adjacency.get(cellKey(cell));
    if (!set) return [];
    return [...set].map(cellFromKey);
  }

  get edgeCount(): number {
    return this.edges.size;
  }

  /**
   * Dijkstra shortest path by travel-time cost. When `requiredCapacity` is set,
   * edges without enough remaining capacity are treated as unusable.
   */
  shortestPath(
    start: GridCell,
    goal: GridCell,
    opts: { requiredCapacity?: number } = {},
  ): { path: GridCell[]; cost: number } | null {
    const startKey = cellKey(start);
    const goalKey = cellKey(goal);
    if (!this.adjacency.has(startKey) || !this.adjacency.has(goalKey)) return null;
    if (startKey === goalKey) return { path: [start], cost: 0 };

    const dist = new Map<string, number>([[startKey, 0]]);
    const prev = new Map<string, string>();
    const visited = new Set<string>();
    // Simple binary-heap-free priority queue (fine for typical map sizes).
    const queue = new Set<string>([startKey]);

    while (queue.size > 0) {
      let current: string | null = null;
      let currentDist = Infinity;
      for (const node of queue) {
        const d = dist.get(node) ?? Infinity;
        if (d < currentDist) { currentDist = d; current = node; }
      }
      if (current === null) break;
      queue.delete(current);
      if (visited.has(current)) continue;
      visited.add(current);
      if (current === goalKey) break;

      for (const neighbourKey of this.adjacency.get(current) ?? []) {
        if (visited.has(neighbourKey)) continue;
        const edge = this.edges.get(current < neighbourKey ? `${current}|${neighbourKey}` : `${neighbourKey}|${current}`);
        if (!edge) continue;
        if (opts.requiredCapacity && edge.capacity - edge.reserved < opts.requiredCapacity) continue;
        const alt = currentDist + edge.travelCost;
        if (alt < (dist.get(neighbourKey) ?? Infinity)) {
          dist.set(neighbourKey, alt);
          prev.set(neighbourKey, current);
          queue.add(neighbourKey);
        }
      }
    }

    if (!dist.has(goalKey) || dist.get(goalKey) === Infinity) return null;

    const path: GridCell[] = [];
    let cursor: string | undefined = goalKey;
    while (cursor) {
      path.unshift(cellFromKey(cursor));
      if (cursor === startKey) break;
      cursor = prev.get(cursor);
    }
    if (path.length === 0 || !cellsEqual(path[0], start)) return null;
    return { path, cost: dist.get(goalKey)! };
  }

  /** Reserve `amount` of capacity along every edge of `path`. All-or-nothing. */
  reserve(path: GridCell[], amount: number): ReservationResult {
    const check = validateCardinalPath(path, { allowRevisit: true });
    if (!check.valid) return { ok: false, blockedAt: `invalid_path:${check.reason}` };
    for (let i = 1; i < path.length; i++) {
      const key = edgeKey(path[i - 1], path[i]);
      const edge = this.edges.get(key);
      if (!edge || edge.capacity - edge.reserved < amount) {
        return { ok: false, blockedAt: key };
      }
    }
    for (let i = 1; i < path.length; i++) {
      const key = edgeKey(path[i - 1], path[i]);
      this.edges.get(key)!.reserved += amount;
    }
    return { ok: true };
  }

  /** Release a previously-made reservation of `amount` along `path`. */
  release(path: GridCell[], amount: number): void {
    for (let i = 1; i < path.length; i++) {
      const key = edgeKey(path[i - 1], path[i]);
      const edge = this.edges.get(key);
      if (edge) edge.reserved = Math.max(0, edge.reserved - amount);
    }
  }

  /** Reset all reservations to zero (e.g. at the start of a new turn). */
  clearReservations(): void {
    for (const edge of this.edges.values()) edge.reserved = 0;
  }
}
