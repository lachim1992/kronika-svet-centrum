import { describe, expect, it } from "vitest";
import {
  CARDINAL_STEPS,
  ROAD_TIERS,
  RoadGraph,
  cardinalNeighbours,
  cardinalStepBetween,
  cellKey,
  computeEdgeTravelCost,
  computeRoadEdgeCost,
  edgeKey,
  isCardinalAdjacent,
  isTerrainPassable,
  manhattanDistance,
  nextRoadTier,
  pathToEdgeKeys,
  roadTierByKey,
  roadTierByLevel,
  validateCardinalPath,
} from "@/lib/roadNetwork";

describe("road tiers", () => {
  it("defines an ascending tier ladder with increasing capacity and speed, decreasing friction", () => {
    for (let i = 1; i < ROAD_TIERS.length; i++) {
      const prev = ROAD_TIERS[i - 1];
      const cur = ROAD_TIERS[i];
      expect(cur.level).toBe(prev.level + 1);
      expect(cur.capacity).toBeGreaterThan(prev.capacity);
      expect(cur.speed).toBeGreaterThan(prev.speed);
      expect(cur.friction).toBeLessThan(prev.friction);
      expect(cur.cost.gold).toBeGreaterThan(prev.cost.gold);
      expect(cur.maintenance.gold).toBeGreaterThanOrEqual(prev.maintenance.gold);
    }
  });

  it("looks up tiers by key and level consistently", () => {
    const byKey = roadTierByKey("paved");
    const byLevel = roadTierByLevel(3);
    expect(byKey).toEqual(byLevel);
  });

  it("returns the next tier or null at the top", () => {
    expect(nextRoadTier("trail")?.key).toBe("road");
    expect(nextRoadTier("highway")).toBeNull();
  });

  it("throws on unknown tier lookups", () => {
    expect(() => roadTierByKey("dirt" as any)).toThrow();
    expect(() => roadTierByLevel(99)).toThrow();
  });
});

describe("cardinal grid utilities", () => {
  it("exposes exactly four cardinal steps", () => {
    expect(CARDINAL_STEPS).toHaveLength(4);
    const dirs = new Set(CARDINAL_STEPS.map(s => s.direction));
    expect(dirs).toEqual(new Set(["north", "south", "east", "west"]));
  });

  it("computes manhattan distance", () => {
    expect(manhattanDistance({ x: 0, y: 0 }, { x: 3, y: -2 })).toBe(5);
  });

  it("detects cardinal adjacency but rejects diagonals and far cells", () => {
    expect(isCardinalAdjacent({ x: 1, y: 1 }, { x: 2, y: 1 })).toBe(true);
    expect(isCardinalAdjacent({ x: 1, y: 1 }, { x: 2, y: 2 })).toBe(false);
    expect(isCardinalAdjacent({ x: 1, y: 1 }, { x: 3, y: 1 })).toBe(false);
  });

  it("finds the cardinal step between adjacent cells", () => {
    const step = cardinalStepBetween({ x: 1, y: 1 }, { x: 1, y: 2 });
    expect(step?.direction).toBe("south");
    expect(cardinalStepBetween({ x: 1, y: 1 }, { x: 2, y: 2 })).toBeNull();
  });

  it("produces four cardinal neighbours in fixed order", () => {
    expect(cardinalNeighbours({ x: 5, y: 5 })).toEqual([
      { x: 6, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 6 }, { x: 5, y: 4 },
    ]);
  });

  it("builds a canonical, order-independent edge key", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 1, y: 0 };
    expect(edgeKey(a, b)).toBe(edgeKey(b, a));
    expect(edgeKey(a, b)).toBe(`${cellKey(a)}|${cellKey(b)}`);
  });
});

describe("path validation", () => {
  it("accepts a valid cardinal path", () => {
    const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
    expect(validateCardinalPath(path)).toEqual({ valid: true, reason: null });
  });

  it("rejects an empty path", () => {
    expect(validateCardinalPath([]).valid).toBe(false);
  });

  it("rejects a diagonal jump", () => {
    const path = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    const result = validateCardinalPath(path);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("non_adjacent_step");
    expect(result.atIndex).toBe(1);
  });

  it("rejects a revisited cell unless explicitly allowed", () => {
    const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }];
    expect(validateCardinalPath(path).valid).toBe(false);
    expect(validateCardinalPath(path, { allowRevisit: true }).valid).toBe(true);
  });

  it("converts a path into ordered canonical edge keys", () => {
    const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
    expect(pathToEdgeKeys(path)).toEqual([edgeKey(path[0], path[1]), edgeKey(path[1], path[2])]);
  });
});

describe("terrain and river costing", () => {
  it("marks sea and mountains impassable, other terrain passable", () => {
    expect(isTerrainPassable("plains")).toBe(true);
    expect(isTerrainPassable("mountains")).toBe(false);
    expect(isTerrainPassable("sea")).toBe(false);
  });

  it("scales build cost by terrain difficulty and river bridges", () => {
    const tier = roadTierByKey("road");
    const plainsCost = computeRoadEdgeCost(tier, "plains");
    const swampCost = computeRoadEdgeCost(tier, "swamp");
    const bridgedCost = computeRoadEdgeCost(tier, "plains", 1);
    expect(swampCost.gold).toBeGreaterThan(plainsCost.gold);
    expect(bridgedCost.gold).toBeGreaterThan(plainsCost.gold);
  });

  it("returns infinite travel cost over impassable terrain", () => {
    const tier = roadTierByKey("road");
    expect(computeEdgeTravelCost(tier, "sea")).toBe(Infinity);
  });

  it("penalizes an unbridged river crossing relative to a bridged one", () => {
    const tier = roadTierByKey("road");
    const forded = computeEdgeTravelCost(tier, "plains", { riverCrossing: true, bridged: false });
    const bridged = computeEdgeTravelCost(tier, "plains", { riverCrossing: true, bridged: true });
    const none = computeEdgeTravelCost(tier, "plains");
    expect(forded).toBeGreaterThan(bridged);
    expect(bridged).toBe(none);
  });

  it("higher tiers reduce travel cost on the same terrain", () => {
    const trail = computeEdgeTravelCost(roadTierByKey("trail"), "hills");
    const paved = computeEdgeTravelCost(roadTierByKey("paved"), "hills");
    expect(paved).toBeLessThan(trail);
  });
});

describe("RoadGraph", () => {
  function buildLine(): RoadGraph {
    const graph = new RoadGraph();
    graph.addEdge({ a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, tier: "road", terrain: "plains" });
    graph.addEdge({ a: { x: 1, y: 0 }, b: { x: 2, y: 0 }, tier: "road", terrain: "plains" });
    graph.addEdge({ a: { x: 2, y: 0 }, b: { x: 3, y: 0 }, tier: "trail", terrain: "hills" });
    return graph;
  }

  it("rejects edges between non-adjacent cells", () => {
    const graph = new RoadGraph();
    expect(() => graph.addEdge({ a: { x: 0, y: 0 }, b: { x: 2, y: 0 }, tier: "road", terrain: "plains" }))
      .toThrow();
  });

  it("stores edges bidirectionally with default tier capacity", () => {
    const graph = buildLine();
    expect(graph.hasEdge({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true);
    expect(graph.hasEdge({ x: 1, y: 0 }, { x: 0, y: 0 })).toBe(true);
    expect(graph.remainingCapacity({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(roadTierByKey("road").capacity);
  });

  it("finds the shortest path across a simple line graph", () => {
    const graph = buildLine();
    const result = graph.shortestPath({ x: 0, y: 0 }, { x: 3, y: 0 });
    expect(result).not.toBeNull();
    expect(result!.path).toEqual([
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 },
    ]);
    expect(result!.cost).toBeGreaterThan(0);
  });

  it("returns null when start or goal is not part of the graph", () => {
    const graph = buildLine();
    expect(graph.shortestPath({ x: 0, y: 0 }, { x: 99, y: 99 })).toBeNull();
  });

  it("prefers a faster paved detour over a slower direct trail", () => {
    const graph = new RoadGraph();
    graph.addEdge({ a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, tier: "trail", terrain: "swamp" });
    graph.addEdge({ a: { x: 1, y: 0 }, b: { x: 2, y: 0 }, tier: "trail", terrain: "swamp" });

    graph.addEdge({ a: { x: 0, y: 0 }, b: { x: 0, y: 1 }, tier: "paved", terrain: "plains" });
    graph.addEdge({ a: { x: 0, y: 1 }, b: { x: 1, y: 1 }, tier: "paved", terrain: "plains" });
    graph.addEdge({ a: { x: 1, y: 1 }, b: { x: 2, y: 1 }, tier: "paved", terrain: "plains" });
    graph.addEdge({ a: { x: 2, y: 1 }, b: { x: 2, y: 0 }, tier: "paved", terrain: "plains" });

    const result = graph.shortestPath({ x: 0, y: 0 }, { x: 2, y: 0 });
    expect(result).not.toBeNull();
    expect(result!.path).toEqual([
      { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 0 },
    ]);
  });

  it("excludes edges without enough remaining capacity when required", () => {
    const graph = buildLine();
    graph.reserve([{ x: 0, y: 0 }, { x: 1, y: 0 }], roadTierByKey("road").capacity);
    const blocked = graph.shortestPath({ x: 0, y: 0 }, { x: 2, y: 0 }, { requiredCapacity: 1 });
    expect(blocked).toBeNull();
    const unconstrained = graph.shortestPath({ x: 0, y: 0 }, { x: 2, y: 0 });
    expect(unconstrained).not.toBeNull();
  });

  it("reserves and releases capacity along a path atomically", () => {
    const graph = buildLine();
    const capacity = roadTierByKey("road").capacity;
    const first = graph.reserve([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], capacity);
    expect(first.ok).toBe(true);
    expect(graph.remainingCapacity({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(0);

    const overCommit = graph.reserve([{ x: 0, y: 0 }, { x: 1, y: 0 }], 1);
    expect(overCommit.ok).toBe(false);
    expect(overCommit.blockedAt).toBe(edgeKey({ x: 0, y: 0 }, { x: 1, y: 0 }));

    graph.release([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], capacity);
    expect(graph.remainingCapacity({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(capacity);
  });

  it("clears all reservations at once", () => {
    const graph = buildLine();
    graph.reserve([{ x: 0, y: 0 }, { x: 1, y: 0 }], 2);
    graph.clearReservations();
    expect(graph.remainingCapacity({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(roadTierByKey("road").capacity);
  });

  it("rejects reservation over an invalid (non-adjacent) path", () => {
    const graph = buildLine();
    const result = graph.reserve([{ x: 0, y: 0 }, { x: 2, y: 0 }], 1);
    expect(result.ok).toBe(false);
  });
});
