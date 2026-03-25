/**
 * Interactive SVG overlay that renders route corridors as colored lines
 * through hex centers on the world map. Hover to highlight & see analytics.
 */
import { useState, useEffect, useCallback, useMemo, memo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ROUTE_TYPE_LABELS,
  CONTROL_STATE_LABELS,
  NODE_TYPE_LABELS,
  FLOW_ROLE_LABELS,
} from "@/lib/strategicGraph";

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
  speed_value: number;
  safety_value: number;
  economic_relevance: number;
  military_relevance: number;
  hex_path_cost: number | null;
  hex_path_length: number | null;
  is_cross_province: boolean;
  vulnerability_score: number;
}

interface FlowPathData {
  route_id: string | null;
  node_a: string;
  node_b: string;
  flow_type: string;
  hex_path: Array<{ q: number; r: number; cost: number }>;
  total_cost: number;
  bottleneck_hex: any;
  bottleneck_cost: number | null;
  path_length: number;
}

interface NodeInfo {
  id: string;
  hex_q: number;
  hex_r: number;
  name: string;
  node_type: string;
  flow_role: string;
  controlled_by: string | null;
  production_output: number;
  wealth_output: number;
  cumulative_trade_flow: number;
}

interface Props {
  sessionId: string;
  offsetX: number;
  offsetY: number;
}

const RouteCorridorsOverlay = memo(({ sessionId, offsetX, offsetY }: Props) => {
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [flowPaths, setFlowPaths] = useState<FlowPathData[]>([]);
  const [nodeMap, setNodeMap] = useState<Map<string, NodeInfo>>(new Map());
  const [hoveredRouteId, setHoveredRouteId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGGElement>(null);

  const loadData = useCallback(async () => {
    const [routesRes, flowRes, nodesRes] = await Promise.all([
      supabase.from("province_routes")
        .select("id, node_a, node_b, route_type, control_state, capacity_value, upgrade_level, speed_value, safety_value, economic_relevance, military_relevance, hex_path_cost, hex_path_length, is_cross_province, vulnerability_score")
        .eq("session_id", sessionId),
      supabase.from("flow_paths")
        .select("route_id, node_a, node_b, flow_type, hex_path, total_cost, bottleneck_hex, bottleneck_cost, path_length")
        .eq("session_id", sessionId),
      supabase.from("province_nodes")
        .select("id, hex_q, hex_r, name, node_type, flow_role, controlled_by, production_output, wealth_output, cumulative_trade_flow")
        .eq("session_id", sessionId)
        .eq("is_active", true),
    ]);
    if (routesRes.data) setRoutes(routesRes.data as RouteData[]);
    if (flowRes.data) setFlowPaths(flowRes.data as FlowPathData[]);
    if (nodesRes.data) {
      const m = new Map<string, NodeInfo>();
      for (const n of nodesRes.data as NodeInfo[]) {
        m.set(n.id, n);
      }
      setNodeMap(m);
    }
  }, [sessionId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Node pixel positions
  const nodePositions = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const [id, n] of nodeMap) {
      const pos = hexToPixel(n.hex_q, n.hex_r);
      m.set(id, { x: pos.x + offsetX, y: pos.y + offsetY });
    }
    return m;
  }, [nodeMap, offsetX, offsetY]);

  // route_id → hex_path lookup
  const routeHexPaths = useMemo(() => {
    const m = new Map<string, FlowPathData>();
    for (const fp of flowPaths) {
      if (fp.route_id && fp.hex_path && (fp.hex_path as any[]).length >= 2 && !m.has(fp.route_id)) {
        m.set(fp.route_id, fp);
      }
    }
    return m;
  }, [flowPaths]);

  // All flow paths for a route (there may be multiple flow types)
  const routeAllFlows = useMemo(() => {
    const m = new Map<string, FlowPathData[]>();
    for (const fp of flowPaths) {
      if (!fp.route_id) continue;
      const arr = m.get(fp.route_id) || [];
      arr.push(fp);
      m.set(fp.route_id, arr);
    }
    return m;
  }, [flowPaths]);

  const hoveredRoute = useMemo(() => {
    if (!hoveredRouteId) return null;
    return routes.find(r => r.id === hoveredRouteId) || null;
  }, [hoveredRouteId, routes]);

  const handleRouteMouseEnter = useCallback((routeId: string, evt: React.MouseEvent) => {
    setHoveredRouteId(routeId);
    setTooltipPos({ x: evt.clientX, y: evt.clientY });
  }, []);

  const handleRouteMouseMove = useCallback((evt: React.MouseEvent) => {
    setTooltipPos({ x: evt.clientX, y: evt.clientY });
  }, []);

  const handleRouteMouseLeave = useCallback(() => {
    setHoveredRouteId(null);
    setTooltipPos(null);
  }, []);

  // Render lines
  const routeElements = useMemo(() => {
    const elements: React.ReactNode[] = [];

    for (const route of routes) {
      if (route.control_state === "blocked") continue;

      const isHovered = route.id === hoveredRouteId;
      const color = ROUTE_TYPE_COLORS[route.route_type] || "hsl(45, 40%, 45%)";
      const dash = ROUTE_TYPE_DASH[route.route_type];
      const baseWidth = 1.0 + route.upgrade_level * 0.3 + (route.capacity_value > 6 ? 0.4 : 0);
      const width = isHovered ? baseWidth + 3 : baseWidth;
      const opacity = isHovered ? 0.95 : (route.control_state === "damaged" ? 0.3 : 0.5);

      const fp = routeHexPaths.get(route.id);

      if (fp && fp.hex_path && (fp.hex_path as any[]).length >= 2) {
        const hexPath = fp.hex_path as Array<{ q: number; r: number }>;
        const points = hexPath.map(h => {
          const p = hexToPixel(h.q, h.r);
          return `${p.x + offsetX},${p.y + offsetY}`;
        }).join(" ");

        // Invisible wide hit area
        elements.push(
          <polyline
            key={`hit-${route.id}`}
            points={points}
            fill="none"
            stroke="transparent"
            strokeWidth={14}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ pointerEvents: "stroke", cursor: "pointer" }}
            onMouseEnter={(e) => handleRouteMouseEnter(route.id, e)}
            onMouseMove={handleRouteMouseMove}
            onMouseLeave={handleRouteMouseLeave}
          />
        );

        // Glow for hovered
        if (isHovered) {
          elements.push(
            <polyline
              key={`glow-${route.id}`}
              points={points}
              fill="none"
              stroke={color}
              strokeWidth={width + 4}
              strokeOpacity={0.3}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: "none" }}
            />
          );
        }

        elements.push(
          <polyline
            key={route.id}
            points={points}
            fill="none"
            stroke={isHovered ? "hsl(50, 100%, 70%)" : color}
            strokeWidth={width}
            strokeOpacity={opacity}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={isHovered ? undefined : dash}
            style={{ pointerEvents: "none", transition: "stroke-width 0.15s, stroke 0.15s" }}
          />
        );
      } else {
        const posA = nodePositions.get(route.node_a);
        const posB = nodePositions.get(route.node_b);
        if (!posA || !posB) continue;

        // Hit area
        elements.push(
          <line
            key={`hit-${route.id}`}
            x1={posA.x} y1={posA.y}
            x2={posB.x} y2={posB.y}
            stroke="transparent"
            strokeWidth={14}
            strokeLinecap="round"
            style={{ pointerEvents: "stroke", cursor: "pointer" }}
            onMouseEnter={(e) => handleRouteMouseEnter(route.id, e)}
            onMouseMove={handleRouteMouseMove}
            onMouseLeave={handleRouteMouseLeave}
          />
        );

        if (isHovered) {
          elements.push(
            <line
              key={`glow-${route.id}`}
              x1={posA.x} y1={posA.y}
              x2={posB.x} y2={posB.y}
              stroke={color}
              strokeWidth={width + 4}
              strokeOpacity={0.3}
              strokeLinecap="round"
              style={{ pointerEvents: "none" }}
            />
          );
        }

        elements.push(
          <line
            key={route.id}
            x1={posA.x} y1={posA.y}
            x2={posB.x} y2={posB.y}
            stroke={isHovered ? "hsl(50, 100%, 70%)" : color}
            strokeWidth={width}
            strokeOpacity={opacity}
            strokeLinecap="round"
            strokeDasharray={isHovered ? undefined : dash}
            style={{ pointerEvents: "none", transition: "stroke-width 0.15s, stroke 0.15s" }}
          />
        );
      }
    }

    return elements;
  }, [routes, routeHexPaths, nodePositions, offsetX, offsetY, hoveredRouteId, handleRouteMouseEnter, handleRouteMouseMove, handleRouteMouseLeave]);

  if (routes.length === 0) return null;

  const nodeA = hoveredRoute ? nodeMap.get(hoveredRoute.node_a) : null;
  const nodeB = hoveredRoute ? nodeMap.get(hoveredRoute.node_b) : null;
  const flows = hoveredRoute ? (routeAllFlows.get(hoveredRoute.id) || []) : [];
  const primaryFlow = hoveredRoute ? routeHexPaths.get(hoveredRoute.id) : null;

  return (
    <>
      <g ref={svgRef} className="route-corridors-overlay">
        {routeElements}
      </g>

      {/* Tooltip rendered as HTML overlay via foreignObject won't work well — use portal-style fixed div */}
      {hoveredRoute && tooltipPos && (
        <foreignObject x={0} y={0} width={1} height={1} style={{ overflow: "visible", pointerEvents: "none" }}>
          <div
            style={{
              position: "fixed",
              left: tooltipPos.x + 16,
              top: tooltipPos.y - 10,
              zIndex: 9999,
              pointerEvents: "none",
              maxWidth: 340,
            }}
          >
            <div className="bg-card/95 backdrop-blur-md border border-border rounded-lg shadow-xl p-3 text-xs space-y-2">
              {/* Header */}
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-sm text-foreground">
                  {ROUTE_TYPE_LABELS[hoveredRoute.route_type] || hoveredRoute.route_type}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                  hoveredRoute.control_state === "open" ? "bg-emerald-500/20 text-emerald-400" :
                  hoveredRoute.control_state === "damaged" ? "bg-amber-500/20 text-amber-400" :
                  hoveredRoute.control_state === "contested" ? "bg-red-500/20 text-red-400" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {CONTROL_STATE_LABELS[hoveredRoute.control_state] || hoveredRoute.control_state}
                </span>
              </div>

              {/* Nodes */}
              <div className="space-y-1 border-t border-border/50 pt-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">A:</span>
                  <span className="font-medium text-foreground">{nodeA?.label || "?"}</span>
                  {nodeA && <span className="text-muted-foreground">({NODE_TYPE_LABELS[nodeA.node_type] || nodeA.node_type})</span>}
                </div>
                <div className="text-center text-muted-foreground">↕</div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">B:</span>
                  <span className="font-medium text-foreground">{nodeB?.label || "?"}</span>
                  {nodeB && <span className="text-muted-foreground">({NODE_TYPE_LABELS[nodeB.node_type] || nodeB.node_type})</span>}
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border/50 pt-1.5">
                <Stat label="Kapacita" value={hoveredRoute.capacity_value} />
                <Stat label="Úroveň" value={`Lv.${hoveredRoute.upgrade_level}`} />
                <Stat label="Rychlost" value={hoveredRoute.speed_value.toFixed(1)} />
                <Stat label="Bezpečnost" value={hoveredRoute.safety_value.toFixed(1)} />
                <Stat label="Ekon. význam" value={hoveredRoute.economic_relevance.toFixed(1)} />
                <Stat label="Voj. význam" value={hoveredRoute.military_relevance.toFixed(1)} />
                {hoveredRoute.hex_path_length != null && (
                  <Stat label="Délka cesty" value={`${hoveredRoute.hex_path_length} hexů`} />
                )}
                {hoveredRoute.hex_path_cost != null && (
                  <Stat label="Cena cesty" value={hoveredRoute.hex_path_cost.toFixed(1)} />
                )}
                {hoveredRoute.is_cross_province && (
                  <span className="col-span-2 text-amber-400 text-[10px]">⚡ Meziprovinční</span>
                )}
              </div>

              {/* Flow analytics */}
              {flows.length > 0 && (
                <div className="border-t border-border/50 pt-1.5 space-y-1">
                  <span className="text-muted-foreground font-semibold text-[10px] uppercase tracking-wider">Toky</span>
                  {flows.map((f, i) => {
                    const fNodeA = nodeMap.get(f.node_a);
                    const fNodeB = nodeMap.get(f.node_b);
                    return (
                      <div key={i} className="bg-muted/40 rounded px-2 py-1 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground capitalize">{f.flow_type}</span>
                          <span className="text-muted-foreground">{f.path_length} hexů · ∑{f.total_cost.toFixed(1)}</span>
                        </div>
                        <div className="text-muted-foreground">
                          {fNodeA?.label || "?"} → {fNodeB?.label || "?"}
                        </div>
                        {f.bottleneck_cost != null && f.bottleneck_cost > 0 && f.bottleneck_hex && (
                          <div className="text-amber-400 text-[10px]">
                            ⚠ Úzké hrdlo: náklady {f.bottleneck_cost.toFixed(1)} na [{(f.bottleneck_hex as any).q},{(f.bottleneck_hex as any).r}]
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Node production context */}
              {(nodeA || nodeB) && (
                <div className="border-t border-border/50 pt-1.5 space-y-0.5">
                  <span className="text-muted-foreground font-semibold text-[10px] uppercase tracking-wider">Produkce uzlů</span>
                  {nodeA && (
                    <div className="flex items-center justify-between">
                      <span className="text-foreground">{nodeA.label}</span>
                      <span className="text-muted-foreground">
                        ⚒️{nodeA.cumulative_production?.toFixed(0) || 0} · 💰{nodeA.cumulative_wealth?.toFixed(0) || 0} · 📦{nodeA.cumulative_trade_flow?.toFixed(0) || 0}
                      </span>
                    </div>
                  )}
                  {nodeB && (
                    <div className="flex items-center justify-between">
                      <span className="text-foreground">{nodeB.label}</span>
                      <span className="text-muted-foreground">
                        ⚒️{nodeB.cumulative_production?.toFixed(0) || 0} · 💰{nodeB.cumulative_wealth?.toFixed(0) || 0} · 📦{nodeB.cumulative_trade_flow?.toFixed(0) || 0}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {hoveredRoute.vulnerability_score > 0 && (
                <div className="text-red-400 text-[10px] border-t border-border/50 pt-1">
                  ⚠ Zranitelnost: {hoveredRoute.vulnerability_score.toFixed(1)}
                </div>
              )}
            </div>
          </div>
        </foreignObject>
      )}
    </>
  );
});

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  );
}

RouteCorridorsOverlay.displayName = "RouteCorridorsOverlay";
export default RouteCorridorsOverlay;
