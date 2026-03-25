/**
 * SVG overlay: hex-traced road network connecting all nodes.
 * Uses client-side A* pathfinding to route roads through hex centers,
 * preferring easier terrain (plains > forest > hills > mountains).
 * Roads only traverse known/discovered territory.
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
      // Fetch nodes and hex data in parallel
      const [nodesRes, hexesRes, routesRes] = await Promise.all([
        supabase.from("province_nodes")
          .select("id, hex_q, hex_r, node_tier, parent_node_id, name")
          .eq("session_id", sessionId)
          .eq("is_active", true),
        supabase.from("province_hexes")
          .select("q, r, biome_family, mean_height, has_river, has_bridge, is_passable, coastal, province_id")
          .eq("session_id", sessionId)
          .not("province_id", "is", null),
        supabase.from("province_routes")
          .select("id, node_a, node_b, route_type")
          .eq("session_id", sessionId),
      ]);

      const nodes: NodeInfo[] = (nodesRes.data || []) as NodeInfo[];
      const rawHexes = (hexesRes.data || []) as Array<{
        q: number; r: number; biome_family: string;
        mean_height: number | null; has_river: boolean | null;
        has_bridge: boolean | null; is_passable: boolean | null; coastal: boolean | null;
      }>;
      const routes = routesRes.data || [];

      if (nodes.length < 2 || rawHexes.length === 0) {
        setRoads([]);
        return;
      }

      // Build hex cost function from actual hex data
      const hexDataArr: PathHexData[] = rawHexes.map(h => ({
        q: h.q, r: h.r,
        biome_family: h.biome_family || "plains",
        mean_height: h.mean_height ?? 0.5,
        has_river: h.has_river ?? false,
        has_bridge: h.has_bridge ?? false,
        is_passable: h.is_passable !== false,
        coastal: h.coastal ?? false,
      }));

      // Set of known hex coords for territory constraint
      const knownHexes = new Set(rawHexes.map(h => `${h.q},${h.r}`));

      // Build cost function that returns Infinity for unknown territory
      const baseCostFn = buildHexCostFn(hexDataArr);
      const costFn = (q: number, r: number): number => {
        if (!knownHexes.has(`${q},${r}`)) return Infinity;
        return baseCostFn(q, r);
      };

      // Build node lookup
      const nodeMap = new Map<string, NodeInfo>();
      for (const n of nodes) nodeMap.set(n.id, n);

      // Determine connections: use existing routes + parent relationships
      const edges = new Set<string>();
      const addEdge = (a: string, b: string) => {
        const key = [a, b].sort().join("__");
        edges.add(key);
      };

      // From routes
      for (const r of routes) {
        if (nodeMap.has(r.node_a) && nodeMap.has(r.node_b)) {
          addEdge(r.node_a, r.node_b);
        }
      }

      // From parent relationships
      for (const n of nodes) {
        if (n.parent_node_id && nodeMap.has(n.parent_node_id)) {
          addEdge(n.id, n.parent_node_id);
        }
      }

      // Compute A* paths for each edge
      const roadSegments: RoadSegment[] = [];
      const edgeArr = Array.from(edges);

      for (const edgeKey of edgeArr) {
        const [idA, idB] = edgeKey.split("__");
        const nA = nodeMap.get(idA);
        const nB = nodeMap.get(idB);
        if (!nA || !nB) continue;

        // Determine road tier based on node tiers
        const tierA = nA.node_tier;
        const tierB = nB.node_tier;
        let roadTier: RoadTier = "micro";
        if (tierA === "major" && tierB === "major") roadTier = "major";
        else if (tierA === "major" || tierB === "major") roadTier = "minor";
        else if (tierA === "minor" || tierB === "minor") roadTier = "micro";

        const result = astarHexPath(nA.hex_q, nA.hex_r, nB.hex_q, nB.hex_r, costFn, 60);
        if (result && result.path.length > 0) {
          roadSegments.push({
            id: edgeKey,
            nodeA: idA,
            nodeB: idB,
            tier: roadTier,
            path: result.path.map(p => ({ q: p.q, r: p.r })),
          });
        }
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

    // Sort: micro first (bottom), then minor, then major (top)
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
