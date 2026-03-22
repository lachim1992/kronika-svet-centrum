/**
 * SVG overlay layer for strategic nodes, routes, and supply indicators.
 * Rendered inside the WorldHexMap SVG <g> transform group.
 */
import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { NODE_TYPE_LABELS } from "@/lib/strategicGraph";

/* ── Coordinate conversion (must match WorldHexMap) ── */
const HEX_SIZE = 38;
const SQRT3 = Math.sqrt(3);
function hexToPixel(q: number, r: number) {
  return { x: HEX_SIZE * (SQRT3 * q + (SQRT3 / 2) * r), y: HEX_SIZE * 1.5 * r };
}

/* ── Flow type colors ── */
const FLOW_COLORS = {
  production: "hsl(25, 85%, 55%)",   // orange
  wealth:     "hsl(48, 90%, 60%)",   // gold
  supply:     "hsl(145, 60%, 50%)",  // green
  faith:      "hsl(280, 65%, 60%)",  // purple
} as const;

/** Density-based color ramp: low → high traffic */
function densityColor(density: number, maxDensity: number): string {
  const t = maxDensity > 1 ? Math.min(1, (density - 1) / (maxDensity - 1)) : 0;
  // green → yellow → orange → red
  const hue = 120 - t * 120; // 120=green, 60=yellow, 0=red
  const sat = 50 + t * 30;
  const light = 50 - t * 5;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}
function densityWidth(density: number, maxDensity: number, baseWidth: number): number {
  const t = maxDensity > 1 ? Math.min(1, (density - 1) / (maxDensity - 1)) : 0;
  return baseWidth + t * 3; // up to +3px for busiest
}

const FLOW_PARTICLE_SIZES = {
  production: { r: 2.0, rMax: 2.8 },
  wealth:     { r: 1.5, rMax: 2.2 },
  supply:     { r: 1.8, rMax: 2.5 },
  faith:      { r: 1.3, rMax: 2.0 },
};

type FlowType = keyof typeof FLOW_COLORS;

/* ── Visual config ── */
const NODE_ICONS: Record<string, string> = {
  primary_city: "🏛", secondary_city: "🏘", fortress: "🏰", port: "⚓",
  trade_hub: "🏪", pass: "🗻", resource_node: "⛏", village_cluster: "🏡",
  religious_center: "⛪", logistic_hub: "📦",
};
const NODE_RADII: Record<string, number> = {
  primary_city: 14, secondary_city: 11, fortress: 10, port: 10,
  trade_hub: 9, pass: 8, resource_node: 7, village_cluster: 6,
  religious_center: 9, logistic_hub: 9,
};
const ROUTE_COLORS: Record<string, string> = {
  land_road: "hsl(45, 60%, 55%)", river_route: "hsl(200, 70%, 55%)",
  sea_lane: "hsl(210, 80%, 50%)", mountain_pass: "hsl(30, 40%, 50%)",
  caravan_route: "hsl(35, 70%, 50%)", road: "hsl(45, 50%, 50%)",
  caravan: "hsl(35, 60%, 45%)", river: "hsl(200, 60%, 50%)",
  pass: "hsl(30, 30%, 45%)", fortified_corridor: "hsl(0, 50%, 50%)",
};
const CONTROL_STROKE: Record<string, string> = {
  open: "hsl(120, 50%, 55%)", contested: "hsl(45, 80%, 55%)",
  blocked: "hsl(0, 70%, 50%)", damaged: "hsl(30, 60%, 45%)",
  embargoed: "hsl(270, 50%, 50%)",
};
const SUPPLY_COLORS = [
  "hsl(0, 70%, 50%)",   "hsl(15, 70%, 50%)",  "hsl(30, 70%, 50%)",
  "hsl(45, 70%, 50%)",  "hsl(60, 60%, 45%)",  "hsl(80, 50%, 45%)",
  "hsl(100, 50%, 45%)", "hsl(120, 50%, 45%)", "hsl(130, 50%, 50%)",
  "hsl(140, 55%, 50%)", "hsl(150, 60%, 50%)",
];

interface StrategicNode {
  id: string; province_id: string; node_type: string; name: string;
  hex_q: number; hex_r: number; city_id: string | null;
  strategic_value: number; economic_value: number; defense_value: number;
  is_major: boolean; is_active: boolean; controlled_by: string | null;
  garrison_strength: number | null; fortification_level: number;
  infrastructure_level: number; population: number;
  parent_node_id: string | null;
  production_output: number; wealth_output: number; capacity_score: number;
}
interface ProvinceRoute {
  id: string; node_a: string; node_b: string; route_type: string;
  capacity_value: number; control_state: string; upgrade_level: number;
  hex_path_cost: number | null; hex_bottleneck_q: number | null; hex_bottleneck_r: number | null;
  hex_path_length: number | null;
}
interface SupplyState {
  node_id: string; connected_to_capital: boolean; supply_level: number;
  isolation_turns: number; hop_distance: number | null;
  production_modifier: number; stability_modifier: number; morale_modifier: number;
}
interface FlowPath {
  id: string; route_id: string | null; node_a: string; node_b: string;
  flow_type: string; hex_path: Array<{ q: number; r: number; cost: number }>;
  total_cost: number; bottleneck_hex: { q: number; r: number; cost: number } | null;
  path_length: number;
}

interface FlowParticle {
  routeId: string;
  flowType: FlowType;
  fromX: number; fromY: number;
  toX: number; toY: number;
  intensity: number;
  /** SVG path data following hex waypoints */
  svgPath?: string;
}

interface Props {
  sessionId: string;
  offsetX: number;
  offsetY: number;
  visible: boolean;
  onNodeClick?: (node: StrategicNode) => void;
}

const StrategicMapOverlay = memo(({ sessionId, offsetX, offsetY, visible, onNodeClick }: Props) => {
  const [nodes, setNodes] = useState<StrategicNode[]>([]);
  const [routes, setRoutes] = useState<ProvinceRoute[]>([]);
  const [supply, setSupply] = useState<Map<string, SupplyState>>(new Map());
  const [flowPaths, setFlowPaths] = useState<FlowPath[]>([]);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [showHexFlows, setShowHexFlows] = useState(true);

  const loadData = useCallback(async () => {
    const [nodesRes, routesRes, supplyRes, flowPathsRes] = await Promise.all([
      supabase.from("province_nodes")
        .select("id, province_id, node_type, name, hex_q, hex_r, city_id, strategic_value, economic_value, defense_value, is_major, is_active, controlled_by, garrison_strength, fortification_level, infrastructure_level, population, parent_node_id, production_output, wealth_output, capacity_score")
        .eq("session_id", sessionId),
      supabase.from("province_routes")
        .select("id, node_a, node_b, route_type, capacity_value, control_state, upgrade_level, hex_path_cost, hex_bottleneck_q, hex_bottleneck_r, hex_path_length")
        .eq("session_id", sessionId),
      supabase.from("supply_chain_state")
        .select("node_id, connected_to_capital, supply_level, isolation_turns, hop_distance, production_modifier, stability_modifier, morale_modifier")
        .eq("session_id", sessionId)
        .order("turn_number", { ascending: false }),
      supabase.from("flow_paths")
        .select("id, route_id, node_a, node_b, flow_type, hex_path, total_cost, bottleneck_hex, path_length")
        .eq("session_id", sessionId),
    ]);
    if (nodesRes.data) setNodes(nodesRes.data as StrategicNode[]);
    if (routesRes.data) setRoutes(routesRes.data as ProvinceRoute[]);
    if (supplyRes.data) {
      const m = new Map<string, SupplyState>();
      for (const s of supplyRes.data as SupplyState[]) {
        if (!m.has(s.node_id)) m.set(s.node_id, s);
      }
      setSupply(m);
    }
    if (flowPathsRes.data) setFlowPaths(flowPathsRes.data as FlowPath[]);
  }, [sessionId]);

  useEffect(() => { if (visible) loadData(); }, [visible, loadData]);

  // Build node position lookup
  const nodePositions = useMemo(() => {
    const m = new Map<string, { x: number; y: number; node: StrategicNode }>();
    for (const n of nodes) {
      const pos = hexToPixel(n.hex_q, n.hex_r);
      m.set(n.id, { x: pos.x + offsetX, y: pos.y + offsetY, node: n });
    }
    return m;
  }, [nodes, offsetX, offsetY]);

  // Build parent lookup: minor → parent major node
  // Uses parent_node_id if set, else finds nearest major node connected by route
  const parentMap = useMemo(() => {
    const map = new Map<string, string>(); // minor_id → major_id
    const majorIds = new Set(nodes.filter(n => n.is_major).map(n => n.id));
    for (const n of nodes) {
      if (n.is_major) continue;
      // Prefer explicit parent_node_id
      if (n.parent_node_id && majorIds.has(n.parent_node_id)) {
        map.set(n.id, n.parent_node_id);
        continue;
      }
      // Fallback: find nearest connected major via routes
      const connectedMajors = routes
        .filter(r => (r.node_a === n.id || r.node_b === n.id) && r.control_state !== "blocked")
        .map(r => r.node_a === n.id ? r.node_b : r.node_a)
        .filter(id => majorIds.has(id));
      if (connectedMajors.length > 0) {
        // Pick closest by hex distance
        const nPos = hexToPixel(n.hex_q, n.hex_r);
        let best = connectedMajors[0];
        let bestDist = Infinity;
        for (const mid of connectedMajors) {
          const mNode = nodes.find(nn => nn.id === mid);
          if (!mNode) continue;
          const mPos = hexToPixel(mNode.hex_q, mNode.hex_r);
          const d = Math.hypot(mPos.x - nPos.x, mPos.y - nPos.y);
          if (d < bestDist) { bestDist = d; best = mid; }
        }
        map.set(n.id, best);
      }
    }
    return map;
  }, [nodes, routes]);

  // Compute multi-type flow particles per route
  const flowParticles = useMemo(() => {
    const particles: FlowParticle[] = [];

    for (const r of routes) {
      if (r.control_state === "blocked" || r.control_state === "embargoed") continue;
      const posA = nodePositions.get(r.node_a);
      const posB = nodePositions.get(r.node_b);
      if (!posA || !posB) continue;
      const nodeA = posA.node;
      const nodeB = posB.node;

      // Determine direction for PRODUCTION flow: minor→parent, or toward capital (lower hop)
      const aIsMinor = !nodeA.is_major;
      const bIsMinor = !nodeB.is_major;
      const aParent = parentMap.get(nodeA.id);
      const bParent = parentMap.get(nodeB.id);

      // Production: flows from producer → consumer (minor→major parent, or toward capital)
      const prodA = nodeA.production_output || 0;
      const prodB = nodeB.production_output || 0;
      if (prodA > 0 || prodB > 0) {
        let fromId = r.node_a, toId = r.node_b;
        // Minor flows to its parent
        if (aIsMinor && aParent === nodeB.id) { fromId = r.node_a; toId = r.node_b; }
        else if (bIsMinor && bParent === nodeA.id) { fromId = r.node_b; toId = r.node_a; }
        else {
          // Between majors: toward capital (lower hop distance)
          const hopA = supply.get(r.node_a)?.hop_distance ?? 99;
          const hopB = supply.get(r.node_b)?.hop_distance ?? 99;
          if (hopA < hopB) { fromId = r.node_b; toId = r.node_a; }
        }
        const from = nodePositions.get(fromId)!;
        const to = nodePositions.get(toId)!;
        const intensity = Math.min(3, Math.max(1, Math.round((prodA + prodB) / 8)));
        particles.push({ routeId: r.id, flowType: "production", fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, intensity });
      }

      // Wealth: flows along trade routes toward hubs
      const wealthA = nodeA.wealth_output || 0;
      const wealthB = nodeB.wealth_output || 0;
      if (wealthA > 1 || wealthB > 1) {
        // Wealth flows toward the node with higher wealth (trade hub attraction)
        const [fromPos, toPos] = wealthA > wealthB
          ? [posB, posA] : [posA, posB];
        const intensity = Math.min(2, Math.max(1, Math.round((wealthA + wealthB) / 12)));
        particles.push({ routeId: r.id, flowType: "wealth", fromX: fromPos.x, fromY: fromPos.y, toX: toPos.x, toY: toPos.y, intensity });
      }

      // Supply: flows FROM capital outward (reverse of production)
      const supA = supply.get(r.node_a);
      const supB = supply.get(r.node_b);
      const hopA = supA?.hop_distance ?? 99;
      const hopB = supB?.hop_distance ?? 99;
      if ((supA?.connected_to_capital || supB?.connected_to_capital) && Math.abs(hopA - hopB) >= 1) {
        // Supply flows from lower hop (closer to capital) to higher hop
        const [fromPos, toPos] = hopA < hopB ? [posA, posB] : [posB, posA];
        const avgSup = ((supA?.supply_level ?? 5) + (supB?.supply_level ?? 5)) / 2;
        const intensity = avgSup >= 7 ? 2 : 1;
        particles.push({ routeId: r.id, flowType: "supply", fromX: fromPos.x, fromY: fromPos.y, toX: toPos.x, toY: toPos.y, intensity });
      }

      // Faith: flows from religious centers and temples outward
      const isReligiousA = nodeA.node_type === "religious_center";
      const isReligiousB = nodeB.node_type === "religious_center";
      if (isReligiousA || isReligiousB) {
        const [fromPos, toPos] = isReligiousA ? [posA, posB] : [posB, posA];
        particles.push({ routeId: r.id, flowType: "faith", fromX: fromPos.x, fromY: fromPos.y, toX: toPos.x, toY: toPos.y, intensity: 1 });
      }
    }

    return particles;
  }, [routes, nodePositions, supply, parentMap]);

  // Build hex-path SVG polylines from flow_paths data
  const hexFlowSvgPaths = useMemo(() => {
    const result: Array<{ key: string; d: string; flowType: string; totalCost: number; bottleneck: FlowPath["bottleneck_hex"] }> = [];
    for (const fp of flowPaths) {
      if (!fp.hex_path || fp.hex_path.length < 2) continue;
      const points = fp.hex_path.map(h => {
        const px = hexToPixel(h.q, h.r);
        return { x: px.x + offsetX, y: px.y + offsetY };
      });
      const d = `M${points.map(p => `${p.x},${p.y}`).join(" L")}`;
      result.push({ key: `${fp.node_a}-${fp.node_b}-${fp.flow_type}`, d, flowType: fp.flow_type, totalCost: fp.total_cost, bottleneck: fp.bottleneck_hex });
    }
    return result;
  }, [flowPaths, offsetX, offsetY]);

  // Build corridor heatmap from BOTH flow_paths AND route connections
  const hexHeatmap = useMemo(() => {
    const counts = new Map<string, number>();
    // From computed hex paths
    for (const fp of flowPaths) {
      if (!fp.hex_path) continue;
      for (const h of fp.hex_path) {
        const k = `${h.q},${h.r}`;
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    // Fallback: if no hex paths, sample hexes along straight route lines
    if (flowPaths.length === 0) {
      for (const r of routes) {
        const nA = nodes.find(n => n.id === r.node_a);
        const nB = nodes.find(n => n.id === r.node_b);
        if (!nA || !nB) continue;
        // Interpolate hex coordinates between endpoints
        const steps = Math.max(1, Math.round(Math.hypot(nB.hex_q - nA.hex_q, nB.hex_r - nA.hex_r)));
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const q = Math.round(nA.hex_q + (nB.hex_q - nA.hex_q) * t);
          const rr = Math.round(nA.hex_r + (nB.hex_r - nA.hex_r) * t);
          const k = `${q},${rr}`;
          counts.set(k, (counts.get(k) || 0) + 1);
        }
      }
    }
    return counts;
  }, [flowPaths, routes, nodes]);

  // Bottleneck hexes from flow_paths
  const bottleneckHexes = useMemo(() => {
    const result: Array<{ q: number; r: number; cost: number }> = [];
    for (const fp of flowPaths) {
      if (fp.bottleneck_hex && fp.bottleneck_hex.cost > 3) {
        result.push(fp.bottleneck_hex);
      }
    }
    return result;
  }, [flowPaths]);

  // Build fallback hex-snapped SVG path defs for particle animation
  const particlePathDefs = useMemo(() => {
    const pathMap = new Map<string, string>(); // key → SVG path d string
    for (const p of flowParticles) {
      const key = `${p.routeId}-${p.flowType}`;
      if (pathMap.has(key)) continue;
      // Find route to get node endpoints for hex snapping
      const route = routes.find(r => r.id === p.routeId);
      if (!route) {
        pathMap.set(key, `M${p.fromX},${p.fromY} L${p.toX},${p.toY}`);
        continue;
      }
      const nA = nodes.find(n => n.id === route.node_a);
      const nB = nodes.find(n => n.id === route.node_b);
      if (!nA || !nB) {
        pathMap.set(key, `M${p.fromX},${p.fromY} L${p.toX},${p.toY}`);
        continue;
      }
      // Snap interpolation to hex centers, direction matches particle flow
      const steps = Math.max(2, Math.round(Math.hypot(nB.hex_q - nA.hex_q, nB.hex_r - nA.hex_r)));
      const posA = hexToPixel(nA.hex_q, nA.hex_r);
      const fromIsA = Math.abs(p.fromX - (posA.x + offsetX)) < 1 && Math.abs(p.fromY - (posA.y + offsetY)) < 1;
      const fromNode = fromIsA ? nA : nB;
      const toNode = fromIsA ? nB : nA;
      const visited = new Set<string>();
      const pts: string[] = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const q = Math.round(fromNode.hex_q + (toNode.hex_q - fromNode.hex_q) * t);
        const rr = Math.round(fromNode.hex_r + (toNode.hex_r - fromNode.hex_r) * t);
        const k = `${q},${rr}`;
        if (visited.has(k)) continue;
        visited.add(k);
        const px = hexToPixel(q, rr);
        pts.push(`${px.x + offsetX},${px.y + offsetY}`);
      }
      pathMap.set(key, pts.length >= 2 ? `M${pts.join(" L")}` : `M${p.fromX},${p.fromY} L${p.toX},${p.toY}`);
    }
    return pathMap;
  }, [flowParticles, routes, nodes, offsetX, offsetY]);

  // Map route_id → hex flow SVG path for particle animation
  const routeHexPathMap = useMemo(() => {
    const m = new Map<string, string>(); // route_id → SVG path id suffix
    for (const fp of flowPaths) {
      if (fp.route_id && fp.hex_path && fp.hex_path.length >= 2) {
        m.set(`${fp.route_id}-${fp.flow_type}`, `hexflow-${fp.node_a}-${fp.node_b}-${fp.flow_type}`);
      }
    }
    return m;
  }, [flowPaths]);

  if (!visible || nodes.length === 0) return null;

  return (
    <g className="strategic-overlay" style={{ pointerEvents: "auto" }}>
      {/* SVG path defs for particle animation */}
      <defs>
        {/* Hex-based flow paths */}
        {hexFlowSvgPaths.map(hp => (
          <path key={`hfp-${hp.key}`} id={`hexflow-${hp.key}`}
            d={hp.d} fill="none" />
        ))}
        {/* Fallback hex-snapped paths */}
        {Array.from(particlePathDefs.entries()).map(([key, d]) => (
          <path key={`path-${key}`} id={`flow-${key}`}
            d={d} fill="none" />
        ))}
      </defs>

      {/* ── Hex corridor heatmap — color+size by density ── */}
      {(() => {
        const maxD = Math.max(1, ...Array.from(hexHeatmap.values()));
        return Array.from(hexHeatmap.entries()).map(([k, count]) => {
          if (count < 2) return null;
          const [q, r] = k.split(",").map(Number);
          const pos = hexToPixel(q, r);
          const t = Math.min(1, (count - 1) / (maxD - 1 || 1));
          const col = densityColor(count, maxD);
          const rad = HEX_SIZE * (0.3 + t * 0.25);
          return (
            <circle key={`heat-${k}`}
              cx={pos.x + offsetX} cy={pos.y + offsetY}
              r={rad}
              fill={col} opacity={0.12 + t * 0.15}
              style={{ pointerEvents: "none" }} />
          );
        });
      })()}

      {/* ── Bottleneck markers ── */}
      {showHexFlows && bottleneckHexes.map((b, i) => {
        const pos = hexToPixel(b.q, b.r);
        return (
          <g key={`btn-${i}`} style={{ pointerEvents: "none" }}>
            <circle cx={pos.x + offsetX} cy={pos.y + offsetY}
              r={HEX_SIZE * 0.35} fill="none"
              stroke="hsl(0, 70%, 55%)" strokeWidth={1.5} opacity={0.7}
              strokeDasharray="3,2" />
            <text x={pos.x + offsetX} y={pos.y + offsetY + 1}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={8} fill="hsl(0, 70%, 55%)" opacity={0.8}>⚠</text>
          </g>
        );
      })}

      {/* ── Hex flow path polylines ── */}
      {showHexFlows && hexFlowSvgPaths.map(hp => {
        const ft = hp.flowType as FlowType;
        const color = FLOW_COLORS[ft] || FLOW_COLORS.wealth;
        return (
          <path key={`hfline-${hp.key}`} d={hp.d}
            fill="none" stroke={color}
            strokeWidth={1.5} opacity={0.35}
            strokeLinecap="round" strokeLinejoin="round" />
        );
      })}


      {/* Routes — per-segment density coloring */}
      {(() => {
        const maxD = Math.max(1, ...Array.from(hexHeatmap.values()));
        return routes.map(r => {
          const a = nodePositions.get(r.node_a);
          const b = nodePositions.get(r.node_b);
          if (!a || !b) return null;
          const baseColor = ROUTE_COLORS[r.route_type] || "hsl(var(--muted-foreground))";
          const isDamaged = r.control_state === "damaged" || r.control_state === "blocked";
          const baseWidth = 1.5 + r.upgrade_level * 0.5 + (r.capacity_value > 5 ? 1 : 0);
          const dash = isDamaged ? "4,4" : r.route_type === "river_route" || r.route_type === "river" ? "6,3" : undefined;

          // Get hex waypoints (from flow_paths or interpolated)
          let hexWaypoints: Array<{ q: number; r: number }> = [];
          const hexFp = flowPaths.find(fp => fp.route_id === r.id && fp.hex_path && fp.hex_path.length >= 2);
          if (hexFp) {
            hexWaypoints = hexFp.hex_path.map(h => ({ q: h.q, r: h.r }));
          } else {
            const nA = nodes.find(n => n.id === r.node_a);
            const nB = nodes.find(n => n.id === r.node_b);
            if (nA && nB) {
              const steps = Math.max(2, Math.round(Math.hypot(nB.hex_q - nA.hex_q, nB.hex_r - nA.hex_r)));
              const visited = new Set<string>();
              for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const q = Math.round(nA.hex_q + (nB.hex_q - nA.hex_q) * t);
                const rr = Math.round(nA.hex_r + (nB.hex_r - nA.hex_r) * t);
                const k = `${q},${rr}`;
                if (visited.has(k)) continue;
                visited.add(k);
                hexWaypoints.push({ q, r: rr });
              }
            }
          }

          if (hexWaypoints.length < 2) {
            // Ultimate fallback: straight line
            return (
              <g key={r.id}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={baseColor} strokeWidth={baseWidth} opacity={0.6} strokeLinecap="round"
                  strokeDasharray={dash} />
              </g>
            );
          }

          // Render per-segment with density-based color+width
          const segments: React.ReactNode[] = [];
          for (let i = 0; i < hexWaypoints.length - 1; i++) {
            const h1 = hexWaypoints[i];
            const h2 = hexWaypoints[i + 1];
            const p1 = hexToPixel(h1.q, h1.r);
            const p2 = hexToPixel(h2.q, h2.r);
            // Average density of segment endpoints
            const d1 = hexHeatmap.get(`${h1.q},${h1.r}`) || 1;
            const d2 = hexHeatmap.get(`${h2.q},${h2.r}`) || 1;
            const avgD = (d1 + d2) / 2;
            const segColor = avgD >= 2 ? densityColor(avgD, maxD) : baseColor;
            const segWidth = avgD >= 2 ? densityWidth(avgD, maxD, baseWidth) : baseWidth;
            const segOpacity = avgD >= 2 ? 0.5 + Math.min(0.35, (avgD / maxD) * 0.35) : 0.55;
            segments.push(
              <line key={`seg-${r.id}-${i}`}
                x1={p1.x + offsetX} y1={p1.y + offsetY}
                x2={p2.x + offsetX} y2={p2.y + offsetY}
                stroke={segColor} strokeWidth={segWidth} opacity={segOpacity}
                strokeLinecap="round" strokeDasharray={dash} />
            );
          }
          return <g key={r.id}>{segments}</g>;
        });
      })()}

      {/* Flow particles — use hex paths when available, fallback to straight lines */}
      {flowParticles.map((fp, idx) => {
        const key = `${fp.routeId}-${fp.flowType}`;
        const color = FLOW_COLORS[fp.flowType];
        const sizes = FLOW_PARTICLE_SIZES[fp.flowType];
        const offsetMap: Record<FlowType, number> = { production: -3, wealth: -1, supply: 1, faith: 3 };
        const perpOffset = offsetMap[fp.flowType];
        const dx = fp.toX - fp.fromX;
        const dy = fp.toY - fp.fromY;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len * perpOffset;
        const ny = dx / len * perpOffset;

        // Prefer hex-based path for animation
        const hexPathId = routeHexPathMap.get(key);
        const pathRef = hexPathId ? `#${hexPathId}` : `#flow-${key}`;

        return Array.from({ length: fp.intensity }, (_, i) => {
          const dur = `${3.5 + i * 0.8}s`;
          const delay = `${i * 1.0 + idx * 0.15}s`;
          return (
            <g key={`particle-${key}-${i}`} transform={`translate(${nx},${ny})`}>
              <circle r={sizes.r} fill={color} opacity={0.75}>
                <animateMotion dur={dur} begin={delay} repeatCount="indefinite">
                  <mpath xlinkHref={pathRef} />
                </animateMotion>
                <animate attributeName="opacity" values="0;0.85;0.85;0" dur={dur} begin={delay} repeatCount="indefinite" />
                <animate attributeName="r" values={`${sizes.r};${sizes.rMax};${sizes.r}`} dur={dur} begin={delay} repeatCount="indefinite" />
              </circle>
            </g>
          );
        });
      })}

      {/* Nodes */}
      {nodes.filter(n => n.is_active).map(n => {
        const pos = nodePositions.get(n.id);
        if (!pos) return null;
        const r = NODE_RADII[n.node_type] || 8;
        const sup = supply.get(n.id);
        const supplyLevel = sup?.supply_level ?? 10;
        const isIsolated = sup?.connected_to_capital === false;
        const isHovered = hoveredNode === n.id;
        const icon = NODE_ICONS[n.node_type] || "📍";
        const parent = parentMap.get(n.id);
        const isMinor = !n.is_major;

        return (
          <g key={n.id}
            onPointerEnter={() => setHoveredNode(n.id)}
            onPointerLeave={() => setHoveredNode(null)}
            onClick={(e) => { e.stopPropagation(); onNodeClick?.(n); }}
            className="cursor-pointer"
          >
            {/* Outer glow ring — supply indicator */}
            <circle cx={pos.x} cy={pos.y} r={r + 5}
              fill="none" stroke={SUPPLY_COLORS[supplyLevel]}
              strokeWidth={2} opacity={isHovered ? 0.8 : 0.4}
              strokeDasharray={isIsolated ? "3,2" : undefined} />

            {/* Isolation pulse */}
            {isIsolated && (
              <circle cx={pos.x} cy={pos.y} r={r + 8}
                fill="none" stroke="hsl(0, 70%, 50%)" strokeWidth={1} opacity={0.3}>
                <animate attributeName="r" from={r + 5} to={r + 14} dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.4" to="0" dur="2s" repeatCount="indefinite" />
              </circle>
            )}

            {/* Background circle */}
            <circle cx={pos.x} cy={pos.y} r={r}
              fill={n.is_major ? "hsl(var(--card))" : "hsl(var(--muted))"}
              stroke={isIsolated ? "hsl(0, 60%, 50%)" : n.is_major ? "hsl(var(--primary))" : "hsl(var(--border))"}
              strokeWidth={n.is_major ? 2 : 1.2}
              opacity={isHovered ? 1 : 0.9} />

            {/* Minor→parent link indicator */}
            {isMinor && parent && (() => {
              const parentPos = nodePositions.get(parent);
              if (!parentPos) return null;
              return (
                <line x1={pos.x} y1={pos.y} x2={parentPos.x} y2={parentPos.y}
                  stroke="hsl(var(--primary))" strokeWidth={0.5} opacity={0.15}
                  strokeDasharray="2,3" />
              );
            })()}

            {/* Fortification indicator */}
            {n.fortification_level > 0 && (
              <circle cx={pos.x} cy={pos.y} r={r + 2}
                fill="none" stroke="hsl(var(--primary))" strokeWidth={0.8}
                strokeDasharray={`${n.fortification_level * 3},${8 - n.fortification_level}`}
                opacity={0.5} />
            )}

            {/* Icon */}
            <text x={pos.x} y={pos.y + 1} textAnchor="middle" dominantBaseline="middle"
              fontSize={n.is_major ? 12 : 9} style={{ pointerEvents: "none" }}>
              {icon}
            </text>

            {/* Name label */}
            {(isHovered || n.is_major) && (
              <g>
                <rect x={pos.x - n.name.length * 2.8} y={pos.y + r + 3}
                  width={n.name.length * 5.6} height={12} rx={3}
                  fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth={0.5}
                  opacity={0.9} />
                <text x={pos.x} y={pos.y + r + 11} textAnchor="middle"
                  fill="hsl(var(--foreground))" fontSize={8}
                  fontWeight={n.is_major ? "bold" : "normal"}
                  style={{ pointerEvents: "none" }}>
                  {n.name}
                </text>
              </g>
            )}

            {/* Garrison indicator */}
            {n.garrison_strength != null && n.garrison_strength > 0 && (
              <g>
                <circle cx={pos.x + r - 2} cy={pos.y - r + 2} r={4}
                  fill="hsl(var(--destructive))" stroke="hsl(var(--card))" strokeWidth={0.8} />
                <text x={pos.x + r - 2} y={pos.y - r + 3} textAnchor="middle"
                  dominantBaseline="middle" fontSize={5} fill="hsl(var(--destructive-foreground))"
                  style={{ pointerEvents: "none" }}>⚔</text>
              </g>
            )}

            {/* Supply level badge */}
            {sup && supplyLevel < 8 && (
              <g>
                <circle cx={pos.x - r + 2} cy={pos.y + r - 2} r={5}
                  fill={SUPPLY_COLORS[supplyLevel]} stroke="hsl(var(--card))" strokeWidth={0.8} />
                <text x={pos.x - r + 2} y={pos.y + r - 1} textAnchor="middle"
                  dominantBaseline="middle" fontSize={5} fill="white"
                  fontWeight="bold" style={{ pointerEvents: "none" }}>
                  {supplyLevel}
                </text>
              </g>
            )}

            {/* Tooltip on hover */}
            {isHovered && (
              <g style={{ pointerEvents: "none" }}>
                <rect x={pos.x + r + 8} y={pos.y - 50}
                  width={150} height={82} rx={6}
                  fill="hsl(var(--popover))" stroke="hsl(var(--border))" strokeWidth={1}
                  opacity={0.95}
                  filter="drop-shadow(0 2px 6px rgba(0,0,0,0.3))" />
                <text x={pos.x + r + 14} y={pos.y - 36}
                  fill="hsl(var(--foreground))" fontSize={8} fontWeight="bold">
                  {n.name}
                </text>
                <text x={pos.x + r + 14} y={pos.y - 25}
                  fill="hsl(var(--muted-foreground))" fontSize={7}>
                  {NODE_TYPE_LABELS[n.node_type] || n.node_type} · Pop: {n.population}
                </text>
                <text x={pos.x + r + 14} y={pos.y - 14}
                  fill="hsl(var(--muted-foreground))" fontSize={7}>
                  ⚔{n.strategic_value} 💰{n.economic_value} 🛡{n.defense_value}
                </text>
                {/* Flow outputs */}
                <text x={pos.x + r + 14} y={pos.y - 3} fontSize={7}>
                  <tspan fill={FLOW_COLORS.production}>⚒{n.production_output?.toFixed(1) ?? "?"}</tspan>
                  <tspan fill={FLOW_COLORS.wealth}> 💰{n.wealth_output?.toFixed(1) ?? "?"}</tspan>
                  <tspan fill={FLOW_COLORS.supply}> 🏛{n.capacity_score?.toFixed(1) ?? "?"}</tspan>
                </text>
                <text x={pos.x + r + 14} y={pos.y + 7}
                  fill={SUPPLY_COLORS[supplyLevel]} fontSize={7}>
                  📦 Supply: {supplyLevel}/10 {isIsolated ? "⚠ Izolován" : `(${sup?.hop_distance ?? "?"} skoků)`}
                </text>
                <text x={pos.x + r + 14} y={pos.y + 18}
                  fill="hsl(var(--muted-foreground))" fontSize={6}>
                  🏗 Fort:{n.fortification_level} Infra:{n.infrastructure_level}
                  {n.garrison_strength ? ` Posádka:${n.garrison_strength}` : ""}
                </text>
                {isMinor && parent && (
                  <text x={pos.x + r + 14} y={pos.y + 27}
                    fill="hsl(var(--muted-foreground))" fontSize={6}>
                    ↗ Parent: {nodes.find(nn => nn.id === parent)?.name || "?"}
                  </text>
                )}
              </g>
            )}
          </g>
        );
      })}

      {/* Flow legend + hex flow toggle */}
      <g transform="translate(20, -110)">
        {/* Toggle hex flows */}
        <g className="cursor-pointer" onClick={() => setShowHexFlows(p => !p)} style={{ pointerEvents: "auto" }}>
          <rect x={0} y={-14} width={90} height={16} rx={4}
            fill={showHexFlows ? "hsl(48, 90%, 60%)" : "hsl(var(--muted))"} opacity={0.8} />
          <text x={45} y={-3} textAnchor="middle" fontSize={7}
            fill={showHexFlows ? "hsl(var(--card))" : "hsl(var(--muted-foreground))"} fontWeight="bold">
            {showHexFlows ? "🗺 Hex flows ON" : "🗺 Hex flows OFF"}
          </text>
        </g>
        {(["production", "wealth", "supply", "faith"] as FlowType[]).map((ft, i) => {
          const labels: Record<FlowType, string> = {
            production: "⚒ Produkce", wealth: "💰 Bohatství", supply: "📦 Zásobování", faith: "⛪ Víra",
          };
          return (
            <g key={ft} transform={`translate(0, ${i * 14 + 8})`}>
              <circle cx={6} cy={0} r={4} fill={FLOW_COLORS[ft]} opacity={0.8} />
              <text x={14} y={3} fontSize={8} fill="hsl(var(--foreground))" opacity={0.7}>
                {labels[ft]}
              </text>
            </g>
          );
        })}
        {/* Bottleneck legend */}
        {showHexFlows && (
          <g transform={`translate(0, ${4 * 14 + 14})`}>
            <circle cx={6} cy={0} r={4} fill="none" stroke="hsl(0, 70%, 55%)" strokeWidth={1.2} strokeDasharray="2,1" />
            <text x={14} y={3} fontSize={8} fill="hsl(0, 70%, 55%)" opacity={0.7}>
              ⚠ Bottleneck
            </text>
          </g>
        )}
      </g>
    </g>
  );
});

StrategicMapOverlay.displayName = "StrategicMapOverlay";
export default StrategicMapOverlay;

