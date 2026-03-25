/**
 * Always-visible SVG overlay that renders route corridors as colored lines
 * through hex centers on the world map.
 */
import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { supabase } from "@/integrations/supabase/client";

const HEX_SIZE = 38;
const SQRT3 = Math.sqrt(3);
function hexToPixel(q: number, r: number) {
  return { x: HEX_SIZE * (SQRT3 * q + (SQRT3 / 2) * r), y: HEX_SIZE * 1.5 * r };
}

const ROUTE_TYPE_COLORS: Record<string, string> = {
  land_road:      "hsl(45, 55%, 50%)",
  caravan_route:  "hsl(35, 65%, 48%)",
  river_route:    "hsl(200, 65%, 55%)",
  sea_lane:       "hsl(210, 75%, 50%)",
  mountain_pass:  "hsl(25, 40%, 45%)",
  road:           "hsl(45, 45%, 48%)",
  caravan:        "hsl(35, 55%, 42%)",
  river:          "hsl(200, 55%, 50%)",
  pass:           "hsl(25, 30%, 42%)",
  fortified_corridor: "hsl(0, 45%, 48%)",
};

const ROUTE_TYPE_DASH: Record<string, string | undefined> = {
  river_route: "5,3",
  river: "5,3",
  sea_lane: "8,4",
  mountain_pass: "3,3",
  pass: "3,3",
};

interface RouteData {
  id: string;
  node_a: string;
  node_b: string;
  route_type: string;
  control_state: string;
  capacity_value: number;
  upgrade_level: number;
}

interface FlowPathData {
  route_id: string | null;
  node_a: string;
  node_b: string;
  flow_type: string;
  hex_path: Array<{ q: number; r: number; cost: number }>;
}

interface NodePos {
  id: string;
  hex_q: number;
  hex_r: number;
}

interface Props {
  sessionId: string;
  offsetX: number;
  offsetY: number;
}

const RouteCorridorsOverlay = memo(({ sessionId, offsetX, offsetY }: Props) => {
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [flowPaths, setFlowPaths] = useState<FlowPathData[]>([]);
  const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  const loadData = useCallback(async () => {
    const [routesRes, flowRes, nodesRes] = await Promise.all([
      supabase.from("province_routes")
        .select("id, node_a, node_b, route_type, control_state, capacity_value, upgrade_level")
        .eq("session_id", sessionId),
      supabase.from("flow_paths")
        .select("route_id, node_a, node_b, flow_type, hex_path")
        .eq("session_id", sessionId),
      supabase.from("province_nodes")
        .select("id, hex_q, hex_r")
        .eq("session_id", sessionId)
        .eq("is_active", true),
    ]);
    if (routesRes.data) setRoutes(routesRes.data as RouteData[]);
    if (flowRes.data) setFlowPaths(flowRes.data as FlowPathData[]);
    if (nodesRes.data) {
      const m = new Map<string, { x: number; y: number }>();
      for (const n of nodesRes.data as NodePos[]) {
        const pos = hexToPixel(n.hex_q, n.hex_r);
        m.set(n.id, { x: pos.x + offsetX, y: pos.y + offsetY });
      }
      setNodePositions(m);
    }
  }, [sessionId, offsetX, offsetY]);

  useEffect(() => { loadData(); }, [loadData]);

  // Build route_id → hex_path lookup (first match per route)
  const routeHexPaths = useMemo(() => {
    const m = new Map<string, FlowPathData["hex_path"]>();
    for (const fp of flowPaths) {
      if (fp.route_id && fp.hex_path && fp.hex_path.length >= 2 && !m.has(fp.route_id)) {
        m.set(fp.route_id, fp.hex_path);
      }
    }
    return m;
  }, [flowPaths]);

  // Render lines
  const routeElements = useMemo(() => {
    const elements: React.ReactNode[] = [];

    for (const route of routes) {
      if (route.control_state === "blocked") continue;

      const color = ROUTE_TYPE_COLORS[route.route_type] || "hsl(45, 40%, 45%)";
      const dash = ROUTE_TYPE_DASH[route.route_type];
      const baseWidth = 1.0 + route.upgrade_level * 0.3 + (route.capacity_value > 6 ? 0.4 : 0);
      const opacity = route.control_state === "damaged" ? 0.3 : 0.5;

      // Prefer hex path from flow_paths
      const hexPath = routeHexPaths.get(route.id);

      if (hexPath && hexPath.length >= 2) {
        // Render as polyline through hex centers
        const points = hexPath.map(h => {
          const p = hexToPixel(h.q, h.r);
          return `${p.x + offsetX},${p.y + offsetY}`;
        }).join(" ");

        elements.push(
          <polyline
            key={route.id}
            points={points}
            fill="none"
            stroke={color}
            strokeWidth={baseWidth}
            strokeOpacity={opacity}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dash}
            style={{ pointerEvents: "none" }}
          />
        );
      } else {
        // Fallback: interpolate hex centers between nodes
        const posA = nodePositions.get(route.node_a);
        const posB = nodePositions.get(route.node_b);
        if (!posA || !posB) continue;

        elements.push(
          <line
            key={route.id}
            x1={posA.x} y1={posA.y}
            x2={posB.x} y2={posB.y}
            stroke={color}
            strokeWidth={baseWidth}
            strokeOpacity={opacity}
            strokeLinecap="round"
            strokeDasharray={dash}
            style={{ pointerEvents: "none" }}
          />
        );
      }
    }

    return elements;
  }, [routes, routeHexPaths, nodePositions, offsetX, offsetY]);

  if (routes.length === 0) return null;

  return (
    <g className="route-corridors-overlay" style={{ pointerEvents: "none" }}>
      {routeElements}
    </g>
  );
});

RouteCorridorsOverlay.displayName = "RouteCorridorsOverlay";
export default RouteCorridorsOverlay;
