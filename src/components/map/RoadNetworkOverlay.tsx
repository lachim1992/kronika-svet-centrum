/**
 * SVG overlay: road network rendered strictly from server-computed flow_paths.
 * This guarantees that road visualization matches the economy/flow corridors 1:1.
 */
import { useState, useEffect, useCallback, useMemo, memo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { emitRouteClick } from "@/lib/worldMapBus";

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
  tier: RoadTier;
  path: Array<{ q: number; r: number }>;
  name: string;
}

interface NodeInfo {
  id: string;
  name: string;
  node_tier: string;
}

interface RouteInfo {
  id: string;
  node_a: string;
  node_b: string;
  control_state: string;
  name: string | null;
}

interface FlowPathRow {
  route_id: string | null;
  hex_path: Array<{ q: number; r: number; cost?: number }> | null;
  total_cost: number | null;
  path_length: number | null;
}

interface Props {
  sessionId: string;
  offsetX: number;
  offsetY: number;
  visible: boolean;
}

const RoadNetworkOverlay = memo(({ sessionId, offsetX, offsetY, visible }: Props) => {
  const [roads, setRoads] = useState<RoadSegment[]>([]);
  const recomputeAttemptedRef = useRef(false);

  const loadRoads = useCallback(async () => {
    if (!visible) return;

    const [nodesRes, routesRes, flowPathsRes] = await Promise.all([
      supabase
        .from("province_nodes")
        .select("id, name, node_tier")
        .eq("session_id", sessionId)
        .eq("is_active", true),
      supabase
        .from("province_routes")
        .select("id, node_a, node_b, control_state, name")
        .eq("session_id", sessionId),
      supabase
        .from("flow_paths")
        .select("route_id, hex_path, total_cost, path_length")
        .eq("session_id", sessionId),
    ]);

    const nodes = (nodesRes.data || []) as NodeInfo[];
    const routes = (routesRes.data || []) as RouteInfo[];
    const flowPaths = (flowPathsRes.data || []) as FlowPathRow[];

    const nodeMap = new Map<string, NodeInfo>();
    for (const n of nodes) nodeMap.set(n.id, n);

    const flowPathByRoute = new Map<string, { path: Array<{ q: number; r: number }>; score: number }>();
    for (const fp of flowPaths) {
      if (!fp.route_id || !fp.hex_path || fp.hex_path.length < 2) continue;

      const candidatePath = fp.hex_path.map((h) => ({ q: h.q, r: h.r }));
      const candidateScore = (fp.total_cost ?? Number.MAX_SAFE_INTEGER) * 1000 + (fp.path_length ?? Number.MAX_SAFE_INTEGER);
      const current = flowPathByRoute.get(fp.route_id);

      if (!current || candidateScore < current.score) {
        flowPathByRoute.set(fp.route_id, { path: candidatePath, score: candidateScore });
      }
    }

    const roadSegments: RoadSegment[] = [];
    let missingPathRoutes = 0;

    for (const route of routes) {
      if (route.control_state === "blocked") continue;

      const nA = nodeMap.get(route.node_a);
      const nB = nodeMap.get(route.node_b);
      if (!nA || !nB) continue;

      const pathEntry = flowPathByRoute.get(route.id);
      const path = pathEntry?.path;
      if (!path || path.length < 2) {
        missingPathRoutes += 1;
        continue;
      }

      let tier: RoadTier = "micro";
      if (nA.node_tier === "major" && nB.node_tier === "major") tier = "major";
      else if (nA.node_tier === "major" || nB.node_tier === "major") tier = "minor";
      else if (nA.node_tier === "minor" || nB.node_tier === "minor") tier = "micro";

      const displayName = route.name?.trim() || `Via ${nA.name} – ${nB.name}`;
      roadSegments.push({ id: route.id, tier, path, name: displayName });
    }

    setRoads(roadSegments);

    // If we have routes without flow paths, trigger one forced recompute and reload once.
    if (missingPathRoutes > 0 && !recomputeAttemptedRef.current) {
      recomputeAttemptedRef.current = true;
      await supabase.functions.invoke("compute-hex-flows", {
        body: { session_id: sessionId, force_all: true },
      });
      await loadRoads();
    }
  }, [sessionId, visible]);

  useEffect(() => {
    void loadRoads();
  }, [loadRoads]);

  const roadElements = useMemo(() => {
    if (!visible || roads.length === 0) return null;

    const tierOrder: Record<RoadTier, number> = { micro: 0, minor: 1, major: 2 };
    const sorted = [...roads].sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier]);

    return sorted.map((road) => {
      const style = ROAD_STYLES[road.tier];
      const points = road.path
        .map((p) => {
          const px = hexToPixel(p.q, p.r);
          return `${px.x + offsetX},${px.y + offsetY}`;
        })
        .join(" ");

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
