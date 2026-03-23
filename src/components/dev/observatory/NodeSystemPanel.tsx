import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ReactFlow, Background, Controls, MiniMap,
  Node, Edge, Position, Handle, NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RefreshCw, MapPin, Route, ArrowRight, Building2 } from "lucide-react";

// Use DB types directly
type PNode = {
  id: string; session_id: string; hex_q: number; hex_r: number;
  node_type: string; node_class: string; flow_role: string;
  node_score: number; city_id: string | null; parent_node_id: string | null;
  is_active: boolean; is_major: boolean; name: string;
  controlled_by: string | null; population: number;
  production_output: number; wealth_output: number; food_value: number;
  trade_efficiency: number; connectivity_score: number;
  supply_relevance: number; isolation_penalty: number;
  strategic_value: number; economic_value: number;
  urbanization_score: number; cumulative_trade_flow: number;
  fortification_level: number; garrison_strength: number | null;
  besieged_by: string | null; collapse_severity: number;
};

type PRoute = {
  id: string; node_a: string; node_b: string; route_type: string;
  path_dirty: boolean | null; control_state: string;
  blocked_by: string[] | null; damage_level: number | null;
  speed_value: number; safety_value: number; capacity_value: number;
  economic_relevance: number; military_relevance: number;
  hex_path_cost: number | null;
};

type FPath = {
  id: string; node_a: string; node_b: string; flow_type: string;
  total_cost: number; path_length: number; is_dirty: boolean;
  bottleneck_cost: number | null; route_id: string | null;
};

type CityOnNode = {
  id: string; name: string; population_total: number; owner_player: string;
  level: string; local_grain_reserve: number;
  last_turn_grain_prod: number; last_turn_wood_prod: number;
  last_turn_iron_prod: number; last_turn_stone_prod: number;
};

const NODE_COLORS: Record<string, { bg: string; border: string }> = {
  major: { bg: "#1e3a5f", border: "#3b82f6" },
  minor: { bg: "#1e3a2f", border: "#22c55e" },
  transit: { bg: "#3a2f1e", border: "#f59e0b" },
  resource: { bg: "#3a1e3a", border: "#a855f7" },
  fortress: { bg: "#5f1e1e", border: "#ef4444" },
  hub: { bg: "#1e3a5f", border: "#06b6d4" },
  gateway: { bg: "#3a2f1e", border: "#f97316" },
  regulator: { bg: "#2a1e3a", border: "#8b5cf6" },
  default: { bg: "#2a2a3a", border: "#6b7280" },
};

function getNodeColor(nodeType: string, flowRole: string) {
  return NODE_COLORS[flowRole] || NODE_COLORS[nodeType] || NODE_COLORS.default;
}

function ProvinceNodeComponent({ data }: NodeProps) {
  const node = data.node as PNode;
  const flowsIn = (data.flowsIn as FPath[]) || [];
  const flowsOut = (data.flowsOut as FPath[]) || [];
  const city = data.city as CityOnNode | null;
  const onSelect = data.onSelect as (id: string) => void;
  const colors = getNodeColor(node.node_type, node.flow_role);
  const size = node.is_major || city ? "min-w-[180px]" : "min-w-[120px]";

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
      className={`rounded-lg border-2 px-3 py-2 ${size} shadow-lg cursor-pointer hover:scale-105 transition-transform`}
      style={{ background: colors.bg, borderColor: colors.border, color: "#f3f4f6" }}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted !w-2 !h-2" />
      <div className="font-bold text-[11px] leading-tight mb-0.5 font-mono flex items-center gap-1">
        {city ? <Building2 className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
        {city?.name || node.name || `[${node.hex_q},${node.hex_r}]`}
      </div>
      <div className="flex flex-wrap gap-1 mb-1">
        <span className="text-[9px] px-1 rounded" style={{ background: "rgba(0,0,0,0.3)" }}>{node.node_type}</span>
        <span className="text-[9px] px-1 rounded" style={{ background: "rgba(0,0,0,0.3)" }}>{node.flow_role}</span>
        {node.besieged_by && <span className="text-[9px] px-1 rounded bg-destructive/50">⚔️ siege</span>}
      </div>
      {city && (
        <div className="text-[9px] opacity-80 flex gap-2">
          <span>👥 {city.population_total}</span>
          <span>🌾 {city.local_grain_reserve}</span>
        </div>
      )}
      <div className="text-[9px] opacity-60 mt-0.5">
        Score: {node.node_score} | Pop: {node.population}
      </div>
      {(flowsIn.length > 0 || flowsOut.length > 0) && (
        <div className="text-[9px] opacity-50 mt-0.5">
          ⬅ {flowsIn.length} | ➡ {flowsOut.length} flows
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-muted !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { provinceNode: ProvinceNodeComponent };

const FLOW_COLORS: Record<string, string> = {
  production: "#f59e0b", trade: "#eab308", supply: "#22c55e",
  military: "#ef4444", faith: "#8b5cf6", default: "#6b7280",
};

interface Props { sessionId: string; }

const NodeSystemPanel = ({ sessionId }: Props) => {
  const [nodes, setNodes] = useState<PNode[]>([]);
  const [routes, setRoutes] = useState<PRoute[]>([]);
  const [flows, setFlows] = useState<FPath[]>([]);
  const [cities, setCities] = useState<CityOnNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [buildings, setBuildings] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [nodesRes, routesRes, flowsRes, citiesRes] = await Promise.all([
      supabase.from("province_nodes").select("*").eq("session_id", sessionId),
      supabase.from("province_routes").select("*").eq("session_id", sessionId),
      supabase.from("flow_paths").select("*").eq("session_id", sessionId),
      supabase.from("cities").select("id,name,population_total,owner_player,level,local_grain_reserve,last_turn_grain_prod,last_turn_wood_prod,last_turn_iron_prod,last_turn_stone_prod").eq("session_id", sessionId),
    ]);
    setNodes((nodesRes.data || []) as unknown as PNode[]);
    setRoutes((routesRes.data || []) as unknown as PRoute[]);
    setFlows((flowsRes.data || []) as unknown as FPath[]);
    setCities((citiesRes.data || []) as unknown as CityOnNode[]);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSelect = useCallback((id: string) => {
    setSelectedNodeId(id);
    const node = nodes.find(n => n.id === id);
    if (node?.city_id) {
      supabase.from("city_buildings").select("id,name,category,status,current_level,effects").eq("city_id", node.city_id).then(r => setBuildings(r.data || []));
    } else {
      setBuildings([]);
    }
  }, [nodes]);

  const cityByNodeId = useMemo(() => {
    const map: Record<string, CityOnNode> = {};
    for (const node of nodes) {
      if (node.city_id) {
        const city = cities.find(c => c.id === node.city_id);
        if (city) map[node.id] = city;
      }
    }
    return map;
  }, [nodes, cities]);

  const flowsByNode = useMemo(() => {
    const inMap: Record<string, FPath[]> = {};
    const outMap: Record<string, FPath[]> = {};
    for (const f of flows) {
      // flow_paths uses node_a → node_b
      (outMap[f.node_a] = outMap[f.node_a] || []).push(f);
      (inMap[f.node_b] = inMap[f.node_b] || []).push(f);
    }
    return { inMap, outMap };
  }, [flows]);

  const { graphNodes, graphEdges } = useMemo(() => {
    const gNodes: Node[] = nodes.map(n => ({
      id: n.id,
      type: "provinceNode",
      position: { x: n.hex_q * 200, y: n.hex_r * 140 + (n.hex_q % 2 === 0 ? 0 : 70) },
      data: {
        node: n, city: cityByNodeId[n.id] || null,
        flowsIn: flowsByNode.inMap[n.id] || [],
        flowsOut: flowsByNode.outMap[n.id] || [],
        onSelect: handleSelect,
      },
    }));

    const gEdges: Edge[] = [];
    for (const r of routes) {
      const isBlocked = (r.blocked_by?.length ?? 0) > 0;
      gEdges.push({
        id: `route-${r.id}`, source: r.node_a, target: r.node_b,
        style: {
          stroke: isBlocked ? "#ef4444" : r.path_dirty ? "#f59e0b" : "#4b5563",
          strokeWidth: isBlocked ? 1 : 2,
          strokeDasharray: isBlocked ? "5 5" : undefined,
        },
        label: r.route_type,
        labelStyle: { fontSize: 8, fill: "#9ca3af" },
      });
    }
    for (const f of flows) {
      gEdges.push({
        id: `flow-${f.id}`, source: f.node_a, target: f.node_b,
        style: {
          stroke: FLOW_COLORS[f.flow_type] || FLOW_COLORS.default,
          strokeWidth: Math.max(1, Math.min(4, f.path_length / 3)),
        },
        animated: true,
        label: `${f.flow_type} len:${f.path_length}`,
        labelStyle: { fontSize: 7, fill: FLOW_COLORS[f.flow_type] || "#9ca3af" },
      });
    }
    return { graphNodes: gNodes, graphEdges: gEdges };
  }, [nodes, routes, flows, cityByNodeId, flowsByNode, handleSelect]);

  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;
  const selectedCity = selectedNode ? cityByNodeId[selectedNode.id] : null;
  const selectedFlowsIn = selectedNodeId ? (flowsByNode.inMap[selectedNodeId] || []) : [];
  const selectedFlowsOut = selectedNodeId ? (flowsByNode.outMap[selectedNodeId] || []) : [];
  const neighborRoutes = selectedNodeId ? routes.filter(r => r.node_a === selectedNodeId || r.node_b === selectedNodeId) : [];

  if (loading) return <Skeleton className="h-[500px] w-full rounded-lg" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Live Node System — {nodes.length} uzlů, {routes.length} cest, {flows.length} toků, {cities.length} měst
        </p>
        <Button size="sm" variant="outline" onClick={fetchData} className="gap-1 text-xs">
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(NODE_COLORS).filter(([k]) => k !== "default").map(([key, c]) => (
          <Badge key={key} variant="outline" className="text-[10px] gap-1" style={{ borderColor: c.border, color: c.border }}>
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: c.border }} /> {key}
          </Badge>
        ))}
      </div>

      <div className="w-full h-[600px] border rounded-lg bg-background/50">
        <ReactFlow nodes={graphNodes} edges={graphEdges} nodeTypes={nodeTypes} fitView minZoom={0.1} maxZoom={2} proOptions={{ hideAttribution: true }}>
          <Background gap={20} size={1} />
          <Controls />
          <MiniMap nodeStrokeWidth={3} nodeColor={(n) => {
            const nd = nodes.find(nd => nd.id === n.id);
            return nd ? getNodeColor(nd.node_type, nd.flow_role).border : "#666";
          }} />
        </ReactFlow>
      </div>

      <Sheet open={!!selectedNode} onOpenChange={(open) => { if (!open) setSelectedNodeId(null); }}>
        <SheetContent className="w-[420px] sm:w-[520px] overflow-y-auto">
          {selectedNode && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 font-mono">
                  <MapPin className="h-4 w-4" style={{ color: getNodeColor(selectedNode.node_type, selectedNode.flow_role).border }} />
                  {selectedCity?.name || selectedNode.name || `[${selectedNode.hex_q}, ${selectedNode.hex_r}]`}
                </SheetTitle>
                <SheetDescription>
                  {selectedNode.node_type} / {selectedNode.flow_role} / {selectedNode.node_class} — Hex ({selectedNode.hex_q}, {selectedNode.hex_r})
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4">
                {/* Live DB Data */}
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">📊 Live Data</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Score", value: selectedNode.node_score },
                      { label: "Population", value: selectedNode.population },
                      { label: "Production", value: selectedNode.production_output.toFixed(1) },
                      { label: "Wealth", value: selectedNode.wealth_output.toFixed(1) },
                      { label: "Food", value: selectedNode.food_value.toFixed(1) },
                      { label: "Trade Eff.", value: `${(selectedNode.trade_efficiency * 100).toFixed(0)}%` },
                      { label: "Connectivity", value: selectedNode.connectivity_score.toFixed(1) },
                      { label: "Strategic", value: selectedNode.strategic_value.toFixed(1) },
                      { label: "Economic", value: selectedNode.economic_value.toFixed(1) },
                      { label: "Urbanization", value: selectedNode.urbanization_score.toFixed(1) },
                      { label: "Isolation ⚠️", value: selectedNode.isolation_penalty.toFixed(2) },
                      { label: "Collapse", value: selectedNode.collapse_severity.toFixed(2) },
                      { label: "Fortification", value: selectedNode.fortification_level },
                      { label: "Garrison", value: selectedNode.garrison_strength ?? "—" },
                      { label: "Owner", value: selectedNode.controlled_by || "—" },
                    ].map(item => (
                      <div key={item.label} className="bg-card border rounded p-1.5 text-center">
                        <p className="text-[9px] text-muted-foreground">{item.label}</p>
                        <p className="text-xs font-bold font-mono">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* City economic breakdown */}
                {selectedCity && (
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium mb-1 flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> Město: {selectedCity.name}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "👥 Populace", value: selectedCity.population_total },
                        { label: "🌾 Grain Res.", value: selectedCity.local_grain_reserve },
                        { label: "🌾 Grain Prod", value: selectedCity.last_turn_grain_prod },
                        { label: "🪵 Wood", value: selectedCity.last_turn_wood_prod },
                        { label: "⛏️ Iron", value: selectedCity.last_turn_iron_prod },
                        { label: "🪨 Stone", value: selectedCity.last_turn_stone_prod },
                        { label: "📊 Level", value: selectedCity.level },
                      ].map(item => (
                        <div key={item.label} className="bg-card border rounded p-1.5 text-center">
                          <p className="text-[9px] text-muted-foreground">{item.label}</p>
                          <p className="text-xs font-bold font-mono">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Buildings */}
                {buildings.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium mb-1">🏛️ Budovy ({buildings.length})</p>
                    <ScrollArea className="h-[150px] border rounded-lg">
                      <div className="p-1 space-y-1">
                        {buildings.map((b: any) => (
                          <div key={b.id} className="flex items-center gap-2 text-[10px] py-1 px-2 rounded hover:bg-muted/20">
                            <span className="font-mono font-medium">{b.name}</span>
                            <Badge variant="outline" className="text-[8px] h-3.5">{b.category}</Badge>
                            <Badge variant="outline" className="text-[8px] h-3.5">{b.status}</Badge>
                            <span className="ml-auto text-muted-foreground">Lv.{b.current_level}</span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                {/* Flows */}
                {selectedFlowsIn.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium mb-1">⬅ Příchozí toky ({selectedFlowsIn.length})</p>
                    {selectedFlowsIn.map(f => {
                      const fromNode = nodes.find(n => n.id === f.node_a);
                      return (
                        <div key={f.id} className="flex items-center gap-2 text-[10px] py-1 px-2 rounded hover:bg-muted/20 cursor-pointer"
                          onClick={() => handleSelect(f.node_a)}>
                          <span className="w-2 h-2 rounded-full" style={{ background: FLOW_COLORS[f.flow_type] || "#666" }} />
                          <span className="font-mono">{fromNode?.name || cityByNodeId[f.node_a]?.name || f.node_a.slice(0, 8)}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <Badge variant="outline" className="text-[8px]">{f.flow_type}</Badge>
                          <span className="ml-auto text-muted-foreground">cost: {f.total_cost.toFixed(1)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {selectedFlowsOut.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium mb-1">➡ Odchozí toky ({selectedFlowsOut.length})</p>
                    {selectedFlowsOut.map(f => {
                      const toNode = nodes.find(n => n.id === f.node_b);
                      return (
                        <div key={f.id} className="flex items-center gap-2 text-[10px] py-1 px-2 rounded hover:bg-muted/20 cursor-pointer"
                          onClick={() => handleSelect(f.node_b)}>
                          <Badge variant="outline" className="text-[8px]">{f.flow_type}</Badge>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span className="font-mono">{toNode?.name || cityByNodeId[f.node_b]?.name || f.node_b.slice(0, 8)}</span>
                          <span className="ml-auto text-muted-foreground">cost: {f.total_cost.toFixed(1)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Neighbor routes */}
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium mb-1 flex items-center gap-1">
                    <Route className="h-3 w-3" /> Sousední cesty ({neighborRoutes.length})
                  </p>
                  {neighborRoutes.map(r => {
                    const otherId = r.node_a === selectedNodeId ? r.node_b : r.node_a;
                    const other = nodes.find(n => n.id === otherId);
                    const isBlocked = (r.blocked_by?.length ?? 0) > 0;
                    return (
                      <div key={r.id} className="flex items-center gap-2 text-[10px] py-1 px-2 rounded hover:bg-muted/20 cursor-pointer"
                        onClick={() => handleSelect(otherId)}>
                        <MapPin className="h-3 w-3" style={{ color: other ? getNodeColor(other.node_type, other.flow_role).border : "#666" }} />
                        <span className="font-mono">{other?.name || otherId.slice(0, 8)}</span>
                        <Badge variant="outline" className="text-[8px]">{r.route_type}</Badge>
                        <span className="text-muted-foreground">spd:{r.speed_value} cap:{r.capacity_value}</span>
                        {isBlocked && <Badge variant="destructive" className="text-[8px]">BLOCKED</Badge>}
                        {r.path_dirty && <Badge variant="outline" className="text-[8px] border-yellow-500 text-yellow-500">DIRTY</Badge>}
                        {(r.damage_level ?? 0) > 0 && <Badge variant="outline" className="text-[8px] border-destructive text-destructive">DMG:{r.damage_level}</Badge>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default NodeSystemPanel;
