/**
 * TradeNetworkOverlay — standalone SVG overlay visualizing trade routes
 * in strategic-network style (solid/dashed lines, node icons, flow particles).
 * Includes click-to-detail panel with trade flow data, node endpoints, inline editing.
 */
import { useState, useEffect, useCallback, useMemo, memo, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { X, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
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

/* ── Visual constants ── */
const TRADE_ROUTE_COLORS: Record<string, string> = {
  land_road:     "hsl(45, 65%, 55%)",
  river_route:   "hsl(200, 70%, 55%)",
  sea_lane:      "hsl(210, 80%, 55%)",
  caravan_route: "hsl(35, 75%, 50%)",
};
const TRADE_ROUTE_DASH: Record<string, string | undefined> = {
  river_route: "6,3",
  sea_lane: "8,4",
  caravan_route: "4,4",
};
const FLOW_COLORS: Record<string, string> = {
  production: "hsl(25, 85%, 55%)",
  supply:     "hsl(140, 60%, 45%)",
  wealth:     "hsl(48, 90%, 60%)",
  trade:      "hsl(45, 90%, 60%)",
};
const FLOW_LABELS: Record<string, string> = {
  production: "⚒️ Produkce",
  supply:     "🌾 Zásoby",
  wealth:     "💰 Bohatství",
  trade:      "🔄 Obchod",
};
const NODE_ICONS: Record<string, string> = {
  primary_city: "🏛", secondary_city: "🏘", fortress: "🏰", port: "⚓",
  trade_hub: "🏪", resource_node: "⛏", village_cluster: "🏡",
  religious_center: "⛪", logistic_hub: "📦",
};
const CONTROL_COLORS: Record<string, string> = {
  open: "hsl(120, 50%, 55%)", contested: "hsl(45, 80%, 55%)",
  blocked: "hsl(0, 70%, 50%)", damaged: "hsl(30, 60%, 45%)",
  embargoed: "hsl(270, 50%, 50%)",
};
const CONTROL_STATES = ["open", "contested", "blocked", "damaged", "embargoed"];

interface RouteData {
  id: string; node_a: string; node_b: string; route_type: string;
  control_state: string; capacity_value: number; upgrade_level: number;
  speed_value: number; safety_value: number; economic_relevance: number;
  military_relevance: number; hex_path_cost: number | null;
  hex_path_length: number | null; is_cross_province: boolean; vulnerability_score: number;
}
interface FlowPathData {
  route_id: string | null; node_a: string; node_b: string;
  flow_type: string; hex_path: Array<{ q: number; r: number }>; total_cost: number;
  bottleneck_hex: any; bottleneck_cost: number | null; path_length: number;
}
interface NodeInfo {
  id: string; hex_q: number; hex_r: number; name: string; node_type: string;
  node_tier: string | null; flow_role: string; controlled_by: string | null;
  production_output: number; wealth_output: number; food_value: number;
  incoming_production: number; cumulative_trade_flow: number;
  capability_tags: string[] | null; guild_level: number | null;
}
interface InventoryItem { good_key: string; quantity: number; quality: number; }
interface DemandItem { basket_key: string; quantity_needed: number; quantity_fulfilled: number; satisfaction_score: number; }

interface Props {
  sessionId: string; offsetX: number; offsetY: number; visible: boolean;
  refreshKey?: number;
}

const TradeNetworkOverlay = memo(({ sessionId, offsetX, offsetY, visible, refreshKey }: Props) => {
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [flowPaths, setFlowPaths] = useState<FlowPathData[]>([]);
  const [nodeMap, setNodeMap] = useState<Map<string, NodeInfo>>(new Map());
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  // Detail panel extras
  const [nodeInventory, setNodeInventory] = useState<Map<string, InventoryItem[]>>(new Map());
  const [demandBaskets, setDemandBaskets] = useState<DemandItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Partial<RouteData>>({});
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    const [routesRes, flowRes, nodesRes] = await Promise.all([
      supabase.from("province_routes")
        .select("id, node_a, node_b, route_type, control_state, capacity_value, upgrade_level, speed_value, safety_value, economic_relevance, military_relevance, hex_path_cost, hex_path_length, is_cross_province, vulnerability_score")
        .eq("session_id", sessionId).eq("is_active", true) as any,
      supabase.from("flow_paths")
        .select("route_id, node_a, node_b, flow_type, hex_path, total_cost, bottleneck_hex, bottleneck_cost, path_length")
        .eq("session_id", sessionId) as any,
      supabase.from("province_nodes")
        .select("id, hex_q, hex_r, name, node_type, node_tier, flow_role, controlled_by, production_output, wealth_output, food_value, incoming_production, cumulative_trade_flow, capability_tags, guild_level")
        .eq("session_id", sessionId).eq("is_active", true) as any,
    ]);
    if (routesRes.data) setRoutes(routesRes.data as RouteData[]);
    if (flowRes.data) setFlowPaths(flowRes.data as FlowPathData[]);
    if (nodesRes.data) {
      const m = new Map<string, NodeInfo>();
      for (const n of nodesRes.data as NodeInfo[]) m.set(n.id, n);
      setNodeMap(m);
    }
  }, [sessionId]);

  useEffect(() => { if (visible) loadData(); }, [visible, loadData, refreshKey]);

  // When a route is selected, fetch inventory for its endpoints
  useEffect(() => {
    if (!selectedRouteId) return;
    const route = routes.find(r => r.id === selectedRouteId);
    if (!route) return;
    const nodeIds = [route.node_a, route.node_b];
    (async () => {
      const { data } = await supabase.from("node_inventory")
        .select("node_id, good_key, quantity, quality")
        .in("node_id", nodeIds);
      if (data) {
        const m = new Map<string, InventoryItem[]>();
        for (const item of data as any[]) {
          const arr = m.get(item.node_id) || [];
          arr.push(item);
          m.set(item.node_id, arr);
        }
        setNodeInventory(m);
      }
      // Demand baskets for city nodes
      const nA = nodeMap.get(route.node_a);
      const nB = nodeMap.get(route.node_b);
      const cityId = (nA as any)?.city_id || (nB as any)?.city_id;
      if (cityId) {
        const { data: dData } = await supabase.from("demand_baskets")
          .select("basket_key, quantity_needed, quantity_fulfilled, satisfaction_score")
          .eq("city_id", cityId).limit(20);
        setDemandBaskets((dData || []) as DemandItem[]);
      } else {
        setDemandBaskets([]);
      }
    })();
  }, [selectedRouteId, routes, nodeMap]);

  // Route hex path map
  const routeHexPaths = useMemo(() => {
    const m = new Map<string, FlowPathData>();
    for (const fp of flowPaths) {
      if (fp.route_id && fp.hex_path && (fp.hex_path as any[]).length >= 2 && !m.has(fp.route_id)) {
        m.set(fp.route_id, fp);
      }
    }
    return m;
  }, [flowPaths]);

  // Flow types per route
  const routeFlowTypes = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const fp of flowPaths) {
      if (!fp.route_id) continue;
      const arr = m.get(fp.route_id) || [];
      if (!arr.includes(fp.flow_type)) arr.push(fp.flow_type);
      m.set(fp.route_id, arr);
    }
    return m;
  }, [flowPaths]);

  const handleClick = useCallback((routeId: string, evt: React.MouseEvent) => {
    evt.stopPropagation();
    if (selectedRouteId === routeId) {
      setSelectedRouteId(null); setPanelPos(null); setEditing(false);
    } else {
      setSelectedRouteId(routeId);
      setPanelPos({ x: evt.clientX, y: evt.clientY });
      setEditing(false);
    }
  }, [selectedRouteId]);

  const handleClose = useCallback(() => {
    setSelectedRouteId(null); setPanelPos(null); setEditing(false);
  }, []);

  const startEditing = useCallback((route: RouteData) => {
    setEditValues({
      capacity_value: route.capacity_value,
      speed_value: route.speed_value,
      safety_value: route.safety_value,
      economic_relevance: route.economic_relevance,
      military_relevance: route.military_relevance,
      control_state: route.control_state,
      upgrade_level: route.upgrade_level,
    });
    setEditing(true);
  }, []);

  const saveEdits = useCallback(async () => {
    if (!selectedRouteId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("province_routes")
        .update(editValues as any)
        .eq("id", selectedRouteId);
      if (error) throw error;
      toast.success("Trasa aktualizována");
      loadData();
      setEditing(false);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }, [selectedRouteId, editValues, loadData]);

  if (!visible || routes.length === 0) return null;

  const activeRoute = selectedRouteId ? routes.find(r => r.id === selectedRouteId) : null;
  const nodeA = activeRoute ? nodeMap.get(activeRoute.node_a) : null;
  const nodeB = activeRoute ? nodeMap.get(activeRoute.node_b) : null;

  const clampedPos = panelPos ? {
    x: Math.min(panelPos.x + 16, window.innerWidth - 400),
    y: Math.max(10, Math.min(panelPos.y - 10, window.innerHeight - 600)),
  } : null;

  return (
    <>
      <g className="trade-network-overlay">
        {/* Trade hub nodes */}
        {Array.from(nodeMap.values()).filter(n =>
          n.cumulative_trade_flow > 0 || n.node_type === "trade_hub" || n.node_type === "port"
        ).map(node => {
          const pos = hexToPixel(node.hex_q, node.hex_r);
          const x = pos.x + offsetX;
          const y = pos.y + offsetY;
          const r = node.node_tier === "major" ? 12 : 8;
          const tradeVol = node.cumulative_trade_flow || 0;
          const glowR = r + Math.min(6, tradeVol / 10);
          return (
            <g key={`tn-${node.id}`} style={{ pointerEvents: "none" }}>
              {tradeVol > 0 && (
                <circle cx={x} cy={y} r={glowR} fill="hsl(48, 90%, 60%)" fillOpacity={0.15} />
              )}
              <circle cx={x} cy={y} r={r}
                fill="hsl(var(--card))" fillOpacity={0.85}
                stroke={tradeVol > 5 ? "hsl(48, 90%, 60%)" : "hsl(var(--border))"}
                strokeWidth={tradeVol > 5 ? 2 : 1} />
              <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle"
                fontSize={r > 10 ? 12 : 9} style={{ pointerEvents: "none" }}>
                {NODE_ICONS[node.node_type] || "📍"}
              </text>
              {tradeVol > 0 && (
                <text x={x} y={y + r + 8} textAnchor="middle" fontSize="7"
                  fill="hsl(48, 90%, 60%)" fontWeight="bold" style={{ pointerEvents: "none" }}>
                  💰{tradeVol.toFixed(0)}
                </text>
              )}
            </g>
          );
        })}

        {/* Route lines */}
        {routes.map(route => {
          if (route.control_state === "blocked") return null;
          const isSelected = route.id === selectedRouteId;
          const color = TRADE_ROUTE_COLORS[route.route_type] || "hsl(45, 50%, 50%)";
          const dash = TRADE_ROUTE_DASH[route.route_type];
          const baseWidth = 1.5 + route.upgrade_level * 0.4 + (route.capacity_value > 8 ? 0.6 : 0);
          const width = isSelected ? baseWidth + 3 : baseWidth;
          const opacity = isSelected ? 1 : (route.control_state === "damaged" ? 0.35 : 0.65);

          const fp = routeHexPaths.get(route.id);
          if (!fp || !fp.hex_path || (fp.hex_path as any[]).length < 2) {
            // Fallback: direct line
            const nA = nodeMap.get(route.node_a);
            const nB = nodeMap.get(route.node_b);
            if (!nA || !nB) return null;
            const pA = hexToPixel(nA.hex_q, nA.hex_r);
            const pB = hexToPixel(nB.hex_q, nB.hex_r);
            return (
              <g key={route.id}>
                <line x1={pA.x + offsetX} y1={pA.y + offsetY} x2={pB.x + offsetX} y2={pB.y + offsetY}
                  stroke="transparent" strokeWidth={16} style={{ cursor: "pointer", pointerEvents: "stroke" }}
                  onClick={e => handleClick(route.id, e)} />
                <line x1={pA.x + offsetX} y1={pA.y + offsetY} x2={pB.x + offsetX} y2={pB.y + offsetY}
                  stroke={color} strokeWidth={width} strokeOpacity={opacity}
                  strokeDasharray={dash} strokeLinecap="round" style={{ pointerEvents: "none" }} />
              </g>
            );
          }

          const hexPath = fp.hex_path as Array<{ q: number; r: number }>;
          const points = hexPath.map(h => {
            const p = hexToPixel(h.q, h.r);
            return `${p.x + offsetX},${p.y + offsetY}`;
          }).join(" ");

          const flowTypes = routeFlowTypes.get(route.id) || [];

          return (
            <g key={route.id}>
              {/* Hit area */}
              <polyline points={points} fill="none" stroke="transparent" strokeWidth={16}
                strokeLinecap="round" strokeLinejoin="round"
                style={{ pointerEvents: "stroke", cursor: "pointer" }}
                onClick={e => handleClick(route.id, e)} />
              {/* Glow */}
              {isSelected && (
                <polyline points={points} fill="none" stroke={color}
                  strokeWidth={width + 5} strokeOpacity={0.25}
                  strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: "none" }} />
              )}
              {/* Control state indicator */}
              {route.control_state !== "open" && (
                <polyline points={points} fill="none"
                  stroke={CONTROL_COLORS[route.control_state] || "hsl(0,0%,50%)"}
                  strokeWidth={width + 2} strokeOpacity={0.2}
                  strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: "none" }} />
              )}
              {/* Main line */}
              <polyline points={points} fill="none"
                stroke={isSelected ? "hsl(48, 100%, 70%)" : color}
                strokeWidth={width} strokeOpacity={opacity}
                strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray={isSelected ? undefined : dash}
                style={{ pointerEvents: "none", transition: "stroke-width 0.15s" }} />
              {/* Flow type dots along path */}
              {flowTypes.map((ft, fi) => {
                const dotColor = FLOW_COLORS[ft] || "hsl(0,0%,70%)";
                const spread = flowTypes.length > 1 ? 4 : 0;
                const angle = (fi / flowTypes.length) * Math.PI * 2;
                return hexPath.slice(1, -1).map((h, hi) => {
                  const p = hexToPixel(h.q, h.r);
                  return (
                    <circle key={`fd-${route.id}-${ft}-${hi}`}
                      cx={p.x + offsetX + spread * Math.cos(angle)}
                      cy={p.y + offsetY + spread * Math.sin(angle)}
                      r={3} fill={dotColor} fillOpacity={0.85}
                      style={{ pointerEvents: "none" }} />
                  );
                });
              })}
            </g>
          );
        })}
      </g>

      {/* Detail panel via portal */}
      {selectedRouteId && activeRoute && clampedPos && createPortal(
        <div style={{ position: "fixed", left: clampedPos.x, top: clampedPos.y, zIndex: 9999, maxWidth: 380 }}
          onClick={e => e.stopPropagation()}>
          <div className="bg-card/95 backdrop-blur-md border border-border rounded-lg shadow-xl p-3 text-xs space-y-2 max-h-[80vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-sm text-foreground">
                🔄 {ROUTE_TYPE_LABELS[activeRoute.route_type] || activeRoute.route_type}
              </span>
              <div className="flex items-center gap-1">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                  activeRoute.control_state === "open" ? "bg-emerald-500/20 text-emerald-400" :
                  activeRoute.control_state === "damaged" ? "bg-amber-500/20 text-amber-400" :
                  activeRoute.control_state === "contested" ? "bg-red-500/20 text-red-400" :
                  activeRoute.control_state === "embargoed" ? "bg-purple-500/20 text-purple-400" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {CONTROL_STATE_LABELS[activeRoute.control_state] || activeRoute.control_state}
                </span>
                <button onClick={handleClose} className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Node endpoints */}
            {[{ node: nodeA, label: "Start" }, { node: nodeB, label: "Cíl" }].map(({ node, label }) => (
              node && (
                <div key={label} className="bg-muted/30 rounded px-2 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">{label}:</span>
                    <span className="font-medium text-foreground">{node.name}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-0.5">
                    <span>{NODE_TYPE_LABELS[node.node_type] || node.node_type} · {FLOW_ROLE_LABELS[node.flow_role] || node.flow_role}</span>
                    <span>{node.controlled_by || "Neutrální"}</span>
                  </div>
                  <div className="flex gap-2 text-[10px] mt-0.5">
                    <span>⚒️{node.production_output?.toFixed(0)}</span>
                    <span>🌾{node.food_value?.toFixed(0)}</span>
                    <span>💰{node.wealth_output?.toFixed(0)}</span>
                    <span>📥{node.incoming_production?.toFixed(0)}</span>
                    <span>💹{node.cumulative_trade_flow?.toFixed(0)}</span>
                  </div>
                  {node.capability_tags && node.capability_tags.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 mt-1">
                      {node.capability_tags.map(t => (
                        <span key={t} className="px-1 py-0 rounded bg-primary/10 text-primary text-[8px]">{t}</span>
                      ))}
                    </div>
                  )}
                  {node.guild_level != null && node.guild_level > 0 && (
                    <span className="text-[9px] text-amber-400">🏅 Cech Lv.{node.guild_level}</span>
                  )}
                  {/* Node inventory */}
                  {nodeInventory.get(node.id) && (
                    <div className="mt-1 border-t border-border/30 pt-1">
                      <span className="text-[9px] text-muted-foreground font-semibold">📦 Inventář:</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {nodeInventory.get(node.id)!.slice(0, 8).map((inv, i) => (
                          <span key={i} className="text-[9px] bg-muted/50 rounded px-1">
                            {inv.good_key}: {inv.quantity.toFixed(0)} (Q{inv.quality})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            ))}

            {/* Stats — editable or read-only */}
            <div className="border-t border-border/50 pt-1.5">
              {!editing ? (
                <>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <Stat label="Kapacita" value={activeRoute.capacity_value} />
                    <Stat label="Úroveň" value={`Lv.${activeRoute.upgrade_level}`} />
                    <Stat label="Rychlost" value={activeRoute.speed_value.toFixed(1)} />
                    <Stat label="Bezpečnost" value={activeRoute.safety_value.toFixed(1)} />
                    <Stat label="Ekon. význam" value={activeRoute.economic_relevance.toFixed(1)} />
                    <Stat label="Voj. význam" value={activeRoute.military_relevance.toFixed(1)} />
                    {activeRoute.hex_path_length != null && <Stat label="Délka" value={`${activeRoute.hex_path_length} hexů`} />}
                    {activeRoute.hex_path_cost != null && <Stat label="Cena cesty" value={activeRoute.hex_path_cost.toFixed(1)} />}
                  </div>
                  {activeRoute.is_cross_province && (
                    <span className="text-amber-400 text-[10px]">⚡ Meziprovinční trasa</span>
                  )}
                  {activeRoute.vulnerability_score > 0 && (
                    <span className="text-red-400 text-[10px] block">⚠ Zranitelnost: {activeRoute.vulnerability_score.toFixed(1)}</span>
                  )}
                  <Button size="sm" variant="outline" className="h-6 text-[9px] mt-1 w-full" onClick={() => startEditing(activeRoute)}>
                    ✏️ Editovat parametry
                  </Button>
                </>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-muted-foreground w-16">Stav:</span>
                    <Select value={editValues.control_state || "open"} onValueChange={v => setEditValues(p => ({ ...p, control_state: v }))}>
                      <SelectTrigger className="h-6 text-[10px] flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CONTROL_STATES.map(s => (
                          <SelectItem key={s} value={s} className="text-[10px]">{CONTROL_STATE_LABELS[s] || s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <SliderRow label="Kapacita" value={editValues.capacity_value || 5} max={30}
                    onChange={v => setEditValues(p => ({ ...p, capacity_value: v }))} />
                  <SliderRow label="Rychlost" value={editValues.speed_value || 1} max={5} step={0.1}
                    onChange={v => setEditValues(p => ({ ...p, speed_value: v }))} />
                  <SliderRow label="Bezpečnost" value={editValues.safety_value || 1} max={3} step={0.1}
                    onChange={v => setEditValues(p => ({ ...p, safety_value: v }))} />
                  <SliderRow label="Ekon." value={editValues.economic_relevance || 0.5} max={2} step={0.1}
                    onChange={v => setEditValues(p => ({ ...p, economic_relevance: v }))} />
                  <SliderRow label="Vojen." value={editValues.military_relevance || 0.3} max={2} step={0.1}
                    onChange={v => setEditValues(p => ({ ...p, military_relevance: v }))} />
                  <SliderRow label="Upgrade" value={editValues.upgrade_level || 0} max={5} step={1}
                    onChange={v => setEditValues(p => ({ ...p, upgrade_level: v }))} />
                  <div className="flex gap-1">
                    <Button size="sm" className="flex-1 h-6 text-[9px] gap-1" disabled={saving} onClick={saveEdits}>
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Uložit
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 text-[9px]" onClick={() => setEditing(false)}>Zrušit</Button>
                  </div>
                </div>
              )}
            </div>

            {/* Trade flow data */}
            {(() => {
              const flows = flowPaths.filter(fp => fp.route_id === selectedRouteId);
              if (flows.length === 0) return (
                <div className="border-t border-border/50 pt-1.5">
                  <span className="text-muted-foreground text-[10px]">Žádné aktivní toky — přepočítejte cesty</span>
                </div>
              );

              // Derive flow analytics
              const tierRank = (t: string | null | undefined) => t === "major" ? 3 : t === "minor" ? 2 : 1;
              const rA = tierRank(nodeA?.node_tier);
              const rB = tierRank(nodeB?.node_tier);
              const prodSource = rA <= rB ? nodeA : nodeB;
              const prodTarget = rA <= rB ? nodeB : nodeA;
              const prodFlow = prodSource?.incoming_production ?? prodSource?.production_output ?? 0;
              const supplyFlow = prodSource?.food_value ?? 0;
              const wealthFlow = (rA <= rB ? nodeB : nodeA)?.wealth_output ?? 0;
              const totalFlow = prodFlow + supplyFlow + wealthFlow;
              const tier = totalFlow >= 60 ? "critical" : totalFlow >= 30 ? "high" : totalFlow >= 10 ? "medium" : "low";
              const tierLabel: Record<string, string> = { critical: "Klíčová", high: "Důležitá", medium: "Střední", low: "Okrajová" };
              const tierColor: Record<string, string> = { critical: "text-red-400", high: "text-amber-400", medium: "text-blue-400", low: "text-muted-foreground" };

              return (
                <div className="border-t border-border/50 pt-1.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground font-semibold text-[10px] uppercase tracking-wider">Obchodní tok</span>
                    <span className={`text-[10px] font-bold ${tierColor[tier]}`}>{tierLabel[tier]}</span>
                  </div>
                  {/* Direction flows */}
                  <div className="text-[10px] space-y-0.5">
                    <div className="flex items-center gap-1">
                      <span>⚒️</span>
                      <span className="text-muted-foreground truncate">{prodSource?.name}</span>
                      <span className="text-amber-400">→</span>
                      <span className="text-muted-foreground truncate">{prodTarget?.name}</span>
                      <span className="ml-auto font-semibold">{prodFlow.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>🌾</span>
                      <span className="text-muted-foreground truncate">{prodSource?.name}</span>
                      <span className="text-emerald-400">→</span>
                      <span className="text-muted-foreground truncate">{prodTarget?.name}</span>
                      <span className="ml-auto font-semibold">{supplyFlow.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>💰</span>
                      <span className="text-muted-foreground truncate">{prodTarget?.name}</span>
                      <span className="text-yellow-400">→</span>
                      <span className="text-muted-foreground truncate">{prodSource?.name}</span>
                      <span className="ml-auto font-semibold">{wealthFlow.toFixed(1)}</span>
                    </div>
                  </div>
                  {/* Flow bar */}
                  <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-black/20">
                    {prodFlow > 0 && <div className="h-full rounded-full" style={{ width: `${(prodFlow / (totalFlow || 1)) * 100}%`, backgroundColor: "hsl(25, 85%, 55%)" }} />}
                    {supplyFlow > 0 && <div className="h-full rounded-full" style={{ width: `${(supplyFlow / (totalFlow || 1)) * 100}%`, backgroundColor: "hsl(140, 60%, 45%)" }} />}
                    {wealthFlow > 0 && <div className="h-full rounded-full" style={{ width: `${(wealthFlow / (totalFlow || 1)) * 100}%`, backgroundColor: "hsl(48, 90%, 60%)" }} />}
                  </div>
                  {/* Individual flow paths */}
                  {flows.map((f, i) => (
                    <div key={i} className="flex items-center gap-1 text-[10px]">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: FLOW_COLORS[f.flow_type] || "hsl(0,0%,70%)" }} />
                      <span>{FLOW_LABELS[f.flow_type] || f.flow_type}</span>
                      <span className="ml-auto text-muted-foreground">{f.path_length} hexů · ∑{f.total_cost.toFixed(1)}</span>
                    </div>
                  ))}
                  {flows.some(f => f.bottleneck_cost != null && f.bottleneck_cost > 0) && (
                    <div className="text-amber-400 text-[10px]">
                      ⚠ Úzká hrdla detekována
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Demand baskets */}
            {demandBaskets.length > 0 && (
              <div className="border-t border-border/50 pt-1.5 space-y-1">
                <span className="text-muted-foreground font-semibold text-[10px] uppercase tracking-wider">🧺 Poptávka města</span>
                {demandBaskets.map((d, i) => (
                  <div key={i} className="flex items-center gap-1 text-[10px]">
                    <span className="text-foreground truncate flex-1">{d.basket_key}</span>
                    <span className="text-muted-foreground">{d.quantity_fulfilled}/{d.quantity_needed}</span>
                    <div className="w-12 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{
                        width: `${Math.min(100, d.satisfaction_score * 100)}%`,
                        backgroundColor: d.satisfaction_score > 0.7 ? "hsl(120,50%,50%)" : d.satisfaction_score > 0.4 ? "hsl(45,70%,50%)" : "hsl(0,60%,50%)",
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
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

function SliderRow({ label, value, max, step, onChange }: {
  label: string; value: number; max: number; step?: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[9px] text-muted-foreground w-12">{label}:</span>
      <Slider value={[value]} max={max} step={step || 1} className="flex-1"
        onValueChange={([v]) => onChange(v)} />
      <span className="text-[9px] text-foreground w-8 text-right">{typeof value === "number" && value % 1 !== 0 ? value.toFixed(1) : value}</span>
    </div>
  );
}

TradeNetworkOverlay.displayName = "TradeNetworkOverlay";
export default TradeNetworkOverlay;
