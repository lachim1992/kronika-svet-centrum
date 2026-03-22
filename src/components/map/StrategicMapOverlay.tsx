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

  // Group particles by route for path defs
  const flowPaths = useMemo(() => {
    const pathMap = new Map<string, { fromX: number; fromY: number; toX: number; toY: number }>();
    for (const p of flowParticles) {
      const key = `${p.routeId}-${p.flowType}`;
      if (!pathMap.has(key)) {
        pathMap.set(key, { fromX: p.fromX, fromY: p.fromY, toX: p.toX, toY: p.toY });
      }
    }
    return pathMap;
  }, [flowParticles]);

  if (!visible || nodes.length === 0) return null;

  return (
    <g className="strategic-overlay" style={{ pointerEvents: "auto" }}>
      {/* Flow path defs */}
      <defs>
        {Array.from(flowPaths.entries()).map(([key, fp]) => (
          <path key={`path-${key}`} id={`flow-${key}`}
            d={`M${fp.fromX},${fp.fromY} L${fp.toX},${fp.toY}`}
            fill="none" />
        ))}
      </defs>

      {/* Routes (lines) */}
      {routes.map(r => {
        const a = nodePositions.get(r.node_a);
        const b = nodePositions.get(r.node_b);
        if (!a || !b) return null;
        const color = ROUTE_COLORS[r.route_type] || "hsl(var(--muted-foreground))";
        const stateColor = CONTROL_STROKE[r.control_state] || color;
        const isDamaged = r.control_state === "damaged" || r.control_state === "blocked";
        const width = 1.5 + r.upgrade_level * 0.5 + (r.capacity_value > 5 ? 1 : 0);
        return (
          <g key={r.id}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={stateColor} strokeWidth={width + 3} opacity={0.12}
              strokeLinecap="round" />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={color} strokeWidth={width} opacity={0.6}
              strokeLinecap="round"
              strokeDasharray={isDamaged ? "4,4" : r.route_type === "river_route" || r.route_type === "river" ? "6,3" : undefined} />
            {r.capacity_value >= 5 && (
              <circle cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} r={3}
                fill={stateColor} opacity={0.5} />
            )}
          </g>
        );
      })}

      {/* Flow particles — 4 distinct flow types */}
      {flowParticles.map((fp, idx) => {
        const key = `${fp.routeId}-${fp.flowType}`;
        const color = FLOW_COLORS[fp.flowType];
        const sizes = FLOW_PARTICLE_SIZES[fp.flowType];
        // Offset perpendicular to route so different flows don't overlap
        const offsetMap: Record<FlowType, number> = { production: -3, wealth: -1, supply: 1, faith: 3 };
        const perpOffset = offsetMap[fp.flowType];
        const dx = fp.toX - fp.fromX;
        const dy = fp.toY - fp.fromY;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len * perpOffset;
        const ny = dx / len * perpOffset;

        return Array.from({ length: fp.intensity }, (_, i) => {
          const dur = `${3.5 + i * 0.8}s`;
          const delay = `${i * 1.0 + idx * 0.15}s`;
          const pathKey = `flow-${key}`;
          return (
            <g key={`particle-${key}-${i}`} transform={`translate(${nx},${ny})`}>
              <circle r={sizes.r} fill={color} opacity={0.75}>
                <animateMotion dur={dur} begin={delay} repeatCount="indefinite">
                  <mpath xlinkHref={`#${pathKey}`} />
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

      {/* Flow legend (bottom-left of overlay) */}
      <g transform="translate(20, -80)">
        {(["production", "wealth", "supply", "faith"] as FlowType[]).map((ft, i) => {
          const labels: Record<FlowType, string> = {
            production: "⚒ Produkce", wealth: "💰 Bohatství", supply: "📦 Zásobování", faith: "⛪ Víra",
          };
          return (
            <g key={ft} transform={`translate(0, ${i * 14})`}>
              <circle cx={6} cy={0} r={4} fill={FLOW_COLORS[ft]} opacity={0.8} />
              <text x={14} y={3} fontSize={8} fill="hsl(var(--foreground))" opacity={0.7}>
                {labels[ft]}
              </text>
            </g>
          );
        })}
      </g>
    </g>
  );
});

StrategicMapOverlay.displayName = "StrategicMapOverlay";
export default StrategicMapOverlay;
