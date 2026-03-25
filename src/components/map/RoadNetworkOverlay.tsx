/**
 * SVG overlay: hex-traced road network connecting all nodes.
 * Uses server-computed flow_paths from DB (same paths used by RouteCorridorsOverlay)
 * to ensure roads and economic flows are always visually aligned.
 * Falls back to parent_node_id relationships with client-side A* only for
 * connections that have no DB flow path.
 */
import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { astarHexPath, buildHexCostFn, type HexData as PathHexData } from "@/lib/hexPathfinding";

const HEX_SIZE = 38;
const SQRT3 = Math.sqrt(3);
function hexToPixel(q: number, r: number) {
  return { x: HEX_SIZE * (SQRT3 * q + (SQRT3 / 2) * r), y: HEX_SIZE * 1.5 * r };
}

/** Road visual style by tier connection */
const ROAD_STYLES = {
  major: { width: 3.0, color: "hsl(35, 50%, 45%)", dash: undefined, label: "Hlavní silnice" },
  minor: { width: 2.0, color: "hsl(35, 40%, 40%)", dash: "6,3", label: "Vedlejší cesta" },
  micro: { width: 1.2, color: "hsl(35, 30%, 38%)", dash: "3,3", label: "Stezka" },
} as const;

type RoadTier = keyof typeof ROAD_STYLES;

interface RoadSegment {
  id: string;
  nodeA: string;
  nodeB: string;
  tier: RoadTier;
  path: Array<{ q: number; r: number }>;
}

interface NodeInfo {
  id: string;
  hex_q: number;
  hex_r: number;
  node_tier: string;
  parent_node_id: string | null;
  name: string;
}

interface Props {
  sessionId: string;
  offsetX: number;
  offsetY: number;
  visible: boolean;
}

const RoadNetworkOverlay = memo(({ sessionId, offsetX, offsetY, visible }: Props) => {
  const [roads, setRoads] = useState<RoadSegment[]>([]);
  const [loading, setLoading] = useState(false);

  const computeRoads = useCallback(async () => {
    if (!visible) return;
    setLoading(true);

    try {
      // Fetch nodes, flow_paths from DB, and routes in parallel
      const [nodesRes, flowPathsRes, routesRes, hexesRes] = await Promise.all([
        supabase.from("province_nodes")
          .select("id, hex_q, hex_r, node_tier, parent_node_id, name")
          .eq("session_id", sessionId)
          .eq("is_active", true),
        supabase.from("flow_paths")
          .select("route_id, node_a, node_b, hex_path")
          .eq("session_id", sessionId),
        supabase.from("province_routes")
          .select("id, node_a, node_b, route_type")
          .eq("session_id", sessionId),
        supabase.from("province_hexes")
          .select("q, r, biome_family, mean_height, has_river, has_bridge, is_passable, coastal, province_id")
          .eq("session_id", sessionId)
          .not("province_id", "is", null),
      ]);

      const nodes: NodeInfo[] = (nodesRes.data || []) as NodeInfo[];
      const flowPaths = flowPathsRes.data || [];
      const routes = routesRes.data || [];
      const rawHexes = hexesRes.data || [];

      if (nodes.length < 2) {
        setRoads([]);
        return;
      }

      // Build node lookup
      const nodeMap = new Map<string, NodeInfo>();
      for (const n of nodes) nodeMap.set(n.id, n);

      // Build flow_paths lookup by route_id (first match per route)
      const flowPathByRoute = new Map<string, Array<{ q: number; r: number }>>();
      for (const fp of flowPaths) {
        if (fp.route_id && fp.hex_path && (fp.hex_path as any[]).length >= 2 && !flowPathByRoute.has(fp.route_id)) {
          flowPathByRoute.set(fp.route_id, (fp.hex_path as Array<{ q: number; r: number }>));
        }
      }

      // Also build flow_paths lookup by node pair (for parent relationships without routes)
      const flowPathByPair = new Map<string, Array<{ q: number; r: number }>>();
      for (const fp of flowPaths) {
        if (fp.hex_path && (fp.hex_path as any[]).length >= 2) {
          const pairKey = [fp.node_a, fp.node_b].sort().join("__");
          if (!flowPathByPair.has(pairKey)) {
            flowPathByPair.set(pairKey, (fp.hex_path as Array<{ q: number; r: number }>));
          }
        }
      }

      // Determine all connections: routes + parent relationships
      const edges = new Map<string, { nodeA: string; nodeB: string; routeId?: string }>();
      const addEdge = (a: string, b: string, routeId?: string) => {
        const key = [a, b].sort().join("__");
        if (!edges.has(key)) {
          edges.set(key, { nodeA: a, nodeB: b, routeId });
        } else if (routeId && !edges.get(key)!.routeId) {
          edges.get(key)!.routeId = routeId;
        }
      };

      for (const r of routes) {
        if (nodeMap.has(r.node_a) && nodeMap.has(r.node_b)) {
          addEdge(r.node_a, r.node_b, r.id);
        }
      }
      for (const n of nodes) {
        if (n.parent_node_id && nodeMap.has(n.parent_node_id)) {
          addEdge(n.id, n.parent_node_id);
        }
      }

      // Build client-side A* cost function as fallback for edges without flow_paths
      let fallbackCostFn: ((q: number, r: number) => number) | null = null;
      const buildFallback = () => {
        if (fallbackCostFn) return fallbackCostFn;
        if (rawHexes.length === 0) return null;
        const hexDataArr: PathHexData[] = rawHexes.map(h => ({
          q: h.q, r: h.r,
          biome_family: (h as any).biome_family || "plains",
          mean_height: (h as any).mean_height ?? 0.5,
          has_river: (h as any).has_river ?? false,
          has_bridge: (h as any).has_bridge ?? false,
          is_passable: (h as any).is_passable !== false,
          coastal: (h as any).coastal ?? false,
        }));
        const knownHexes = new Set(rawHexes.map(h => `${h.q},${h.r}`));
        const baseCostFn = buildHexCostFn(hexDataArr);
        fallbackCostFn = (q: number, r: number): number => {
          if (!knownHexes.has(`${q},${r}`)) return Infinity;
          return baseCostFn(q, r);
        };
        return fallbackCostFn;
      };

      // Compute road segments
      const roadSegments: RoadSegment[] = [];

      for (const [edgeKey, edge] of edges) {
        const nA = nodeMap.get(edge.nodeA);
        const nB = nodeMap.get(edge.nodeB);
        if (!nA || !nB) continue;

        // Determine road tier
        const tierA = nA.node_tier;
        const tierB = nB.node_tier;
        let roadTier: RoadTier = "micro";
        if (tierA === "major" && tierB === "major") roadTier = "major";
        else if (tierA === "major" || tierB === "major") roadTier = "minor";
        else if (tierA === "minor" || tierB === "minor") roadTier = "micro";

        // Priority 1: Use flow_path from DB (route-based)
        let path: Array<{ q: number; r: number }> | null = null;
        if (edge.routeId) {
          path = flowPathByRoute.get(edge.routeId) || null;
        }

        // Priority 2: Use flow_path from DB (pair-based)
        if (!path) {
          path = flowPathByPair.get(edgeKey) || null;
        }

        // Priority 3: Client-side A* fallback
        if (!path) {
          const costFn = buildFallback();
          if (costFn) {
            const result = astarHexPath(nA.hex_q, nA.hex_r, nB.hex_q, nB.hex_r, costFn, 60);
            if (result && result.path.length > 0) {
              path = result.path.map(p => ({ q: p.q, r: p.r }));
            }
          }
        }

        // Final fallback: straight line
        if (!path) {
          path = [{ q: nA.hex_q, r: nA.hex_r }, { q: nB.hex_q, r: nB.hex_r }];
        }

        roadSegments.push({ id: edgeKey, nodeA: edge.nodeA, nodeB: edge.nodeB, tier: roadTier, path });
      }

      setRoads(roadSegments);
    } catch (e) {
      console.error("RoadNetworkOverlay: compute error", e);
    } finally {
      setLoading(false);
    }
  }, [sessionId, visible]);

  useEffect(() => { computeRoads(); }, [computeRoads]);

  // Convert paths to SVG polylines
  const roadElements = useMemo(() => {
    if (!visible || roads.length === 0) return null;

    const tierOrder: Record<RoadTier, number> = { micro: 0, minor: 1, major: 2 };
    const sorted = [...roads].sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier]);

    return sorted.map(road => {
      const style = ROAD_STYLES[road.tier];
      const points = road.path.map(p => {
        const px = hexToPixel(p.q, p.r);
        return `${px.x + offsetX},${px.y + offsetY}`;
      }).join(" ");

      return (
        <polyline
          key={`road-${road.id}`}
          points={points}
          fill="none"
          stroke={style.color}
          strokeWidth={style.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={style.dash}
          opacity={0.85}
          style={{ pointerEvents: "none" }}
        />
      );
    });
  }, [roads, offsetX, offsetY, visible]);

  if (!visible) return null;

  return <g className="road-network-layer">{roadElements}</g>;
});

RoadNetworkOverlay.displayName = "RoadNetworkOverlay";
export default RoadNetworkOverlay;
export { ROAD_STYLES };
