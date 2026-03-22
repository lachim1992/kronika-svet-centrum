/**
 * SVG overlay layer for strategic nodes, routes, and supply indicators.
 * Rendered inside the WorldHexMap SVG <g> transform group.
 */
import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { NODE_TYPE_LABELS, ROUTE_TYPE_LABELS, CONTROL_STATE_LABELS } from "@/lib/strategicGraph";

/* ── Coordinate conversion (must match WorldHexMap) ── */
const HEX_SIZE = 38;
const SQRT3 = Math.sqrt(3);
function hexToPixel(q: number, r: number) {
  return { x: HEX_SIZE * (SQRT3 * q + (SQRT3 / 2) * r), y: HEX_SIZE * 1.5 * r };
}

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
  "hsl(0, 70%, 50%)",   // 0 – critical
  "hsl(15, 70%, 50%)",  // 1
  "hsl(30, 70%, 50%)",  // 2
  "hsl(45, 70%, 50%)",  // 3
  "hsl(60, 60%, 45%)",  // 4
  "hsl(80, 50%, 45%)",  // 5
  "hsl(100, 50%, 45%)", // 6
  "hsl(120, 50%, 45%)", // 7
  "hsl(130, 50%, 50%)", // 8
  "hsl(140, 55%, 50%)", // 9
  "hsl(150, 60%, 50%)", // 10 – fully supplied
];

interface StrategicNode {
  id: string; province_id: string; node_type: string; name: string;
  hex_q: number; hex_r: number; city_id: string | null;
  strategic_value: number; economic_value: number; defense_value: number;
  is_major: boolean; is_active: boolean; controlled_by: string | null;
  garrison_strength: number | null; fortification_level: number;
  infrastructure_level: number; population: number;
}
interface ProvinceRoute {
  id: string; node_a: string; node_b: string; route_type: string;
  capacity_value: number; control_state: string; upgrade_level: number;
}
interface SupplyState {
  node_id: string; connected_to_capital: boolean; supply_level: number;
  isolation_turns: number; hop_distance: number | null;
  production_modifier: number; stability_modifier: number; morale_modifier: number;
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
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [nodesRes, routesRes, supplyRes] = await Promise.all([
      supabase.from("province_nodes")
        .select("id, province_id, node_type, name, hex_q, hex_r, city_id, strategic_value, economic_value, defense_value, is_major, is_active, controlled_by, garrison_strength, fortification_level, infrastructure_level, population")
        .eq("session_id", sessionId),
      supabase.from("province_routes")
        .select("id, node_a, node_b, route_type, capacity_value, control_state, upgrade_level")
        .eq("session_id", sessionId),
      supabase.from("supply_chain_state")
        .select("node_id, connected_to_capital, supply_level, isolation_turns, hop_distance, production_modifier, stability_modifier, morale_modifier")
        .eq("session_id", sessionId)
        .order("turn_number", { ascending: false }),
    ]);
    if (nodesRes.data) setNodes(nodesRes.data as StrategicNode[]);
    if (routesRes.data) setRoutes(routesRes.data as ProvinceRoute[]);
    if (supplyRes.data) {
      const m = new Map<string, SupplyState>();
      // Ordered by turn_number desc, so first occurrence per node_id is latest
      for (const s of supplyRes.data as SupplyState[]) {
        if (!m.has(s.node_id)) m.set(s.node_id, s);
      }
      setSupply(m);
    }
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

  if (!visible || nodes.length === 0) return null;

  return (
    <g className="strategic-overlay" style={{ pointerEvents: "auto" }}>
      {/* Routes */}
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
            {/* Glow */}
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={stateColor} strokeWidth={width + 3} opacity={0.15}
              strokeLinecap="round" />
            {/* Main line */}
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={color} strokeWidth={width} opacity={0.7}
              strokeLinecap="round"
              strokeDasharray={isDamaged ? "4,4" : r.route_type === "river_route" || r.route_type === "river" ? "6,3" : undefined} />
            {/* Capacity dot at midpoint */}
            {r.capacity_value >= 5 && (
              <circle cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} r={3}
                fill={stateColor} opacity={0.6} />
            )}
          </g>
        );
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
                fill="none" stroke="hsl(0, 70%, 50%)" strokeWidth={1}
                opacity={0.3}>
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

            {/* Name label (on hover or for major nodes) */}
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
                  style={{ pointerEvents: "none" }}>
                  ⚔
                </text>
              </g>
            )}

            {/* Supply level badge (bottom-left) */}
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
                <rect x={pos.x + r + 8} y={pos.y - 40}
                  width={140} height={68} rx={6}
                  fill="hsl(var(--popover))" stroke="hsl(var(--border))" strokeWidth={1}
                  opacity={0.95}
                  filter="drop-shadow(0 2px 6px rgba(0,0,0,0.3))" />
                <text x={pos.x + r + 14} y={pos.y - 26}
                  fill="hsl(var(--foreground))" fontSize={8} fontWeight="bold">
                  {n.name}
                </text>
                <text x={pos.x + r + 14} y={pos.y - 15}
                  fill="hsl(var(--muted-foreground))" fontSize={7}>
                  {NODE_TYPE_LABELS[n.node_type] || n.node_type} · Pop: {n.population}
                </text>
                <text x={pos.x + r + 14} y={pos.y - 4}
                  fill="hsl(var(--muted-foreground))" fontSize={7}>
                  ⚔{n.strategic_value} 💰{n.economic_value} 🛡{n.defense_value}
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
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
});

StrategicMapOverlay.displayName = "StrategicMapOverlay";
export default StrategicMapOverlay;
