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
import { RefreshCw, Loader2, MapPin, Route, Wheat, Factory, Coins, ArrowRight, Building2, Users, Shield } from "lucide-react";

interface ProvinceNode {
  id: string;
  session_id: string;
  hex_q: number;
  hex_r: number;
  node_type: string;
  node_role: string;
  node_score: number;
  city_id: string | null;
  parent_node_id: string | null;
  supply_level: number;
  is_active: boolean;
  label: string | null;
  owner_player: string | null;
}

interface ProvinceRoute {
  id: string;
  node_a: string;
  node_b: string;
  route_type: string;
  cost: number;
  is_blocked: boolean;
  path_dirty: boolean;
}

interface FlowPath {
  id: string;
  from_node_id: string;
  to_node_id: string;
  resource_type: string;
  volume: number;
  efficiency: number;
  route_id: string | null;
}

interface CityOnNode {
  id: string;
  name: string;
  population_total: number;
  owner_player: string;
  level: string;
  local_grain_reserve: number;
  last_turn_grain_prod: number;
  last_turn_wood_prod: number;
  last_turn_iron_prod: number;
  last_turn_stone_prod: number;
}

const NODE_COLORS: Record<string, { bg: string; border: string }> = {
  major: { bg: "#1e3a5f", border: "#3b82f6" },
  minor: { bg: "#1e3a2f", border: "#22c55e" },
  transit: { bg: "#3a2f1e", border: "#f59e0b" },
  resource: { bg: "#3a1e3a", border: "#a855f7" },
  fortress: { bg: "#5f1e1e", border: "#ef4444" },
  default: { bg: "#2a2a3a", border: "#6b7280" },
};

function getNodeColor(nodeType: string, nodeRole: string) {
  return NODE_COLORS[nodeRole] || NODE_COLORS[nodeType] || NODE_COLORS.default;
}

function ProvinceNodeComponent({ data }: NodeProps) {
  const node = data.node as ProvinceNode;
  const flowsIn = (data.flowsIn as FlowPath[]) || [];
  const flowsOut = (data.flowsOut as FlowPath[]) || [];
  const city = data.city as CityOnNode | null;
  const onSelect = data.onSelect as (id: string) => void;
  const colors = getNodeColor(node.node_type, node.node_role);
  const size = node.node_type === "major" || city ? "min-w-[180px]" : "min-w-[120px]";

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
      className={`rounded-lg border-2 px-3 py-2 ${size} shadow-lg cursor-pointer hover:scale-105 transition-transform`}
      style={{ background: colors.bg, borderColor: colors.border, color: "#f3f4f6" }}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted !w-2 !h-2" />
      <div className="font-bold text-[11px] leading-tight mb-0.5 font-mono flex items-center gap-1">
        {city ? <Building2 className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
        {city?.name || node.label || `Node ${node.hex_q},${node.hex_r}`}
      </div>
      <div className="flex flex-wrap gap-1 mb-1">
        <span className="text-[9px] px-1 rounded" style={{ background: "rgba(0,0,0,0.3)" }}>{node.node_type}</span>
        <span className="text-[9px] px-1 rounded" style={{ background: "rgba(0,0,0,0.3)" }}>{node.node_role}</span>
        {!node.is_active && <span className="text-[9px] px-1 rounded bg-destructive/50">inactive</span>}
      </div>
      {city && (
        <div className="text-[9px] opacity-80 flex gap-2">
          <span>👥 {city.population_total}</span>
          <span>🌾 {city.local_grain_reserve}</span>
        </div>
      )}
      <div className="text-[9px] opacity-60 mt-0.5">
        Score: {node.node_score} | Supply: {(node.supply_level * 100).toFixed(0)}%
      </div>
      {(flowsIn.length > 0 || flowsOut.length > 0) && (
        <div className="text-[9px] opacity-50 mt-0.5">
          ⬅ {flowsIn.length} flows | ➡ {flowsOut.length} flows
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-muted !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { provinceNode: ProvinceNodeComponent };

const RESOURCE_COLORS: Record<string, string> = {
  grain: "#22c55e",
  production: "#f59e0b",
  wealth: "#eab308",
  iron: "#6b7280",
  stone: "#a8a29e",
  wood: "#854d0e",
  default: "#6b7280",
};

interface Props {
  sessionId: string;
}

const NodeSystemPanel = ({ sessionId }: Props) => {
  const [nodes, setNodes] = useState<ProvinceNode[]>([]);
  const [routes, setRoutes] = useState<ProvinceRoute[]>([]);
  const [flows, setFlows] = useState<FlowPath[]>([]);
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
      supabase.from("cities").select("id,name,population_total,owner_player,level,local_grain_reserve,last_turn_grain_prod,last_turn_wood_prod,last_turn_iron_prod,last_turn_stone_prod,province_id").eq("session_id", sessionId),
    ]);
    setNodes((nodesRes.data || []) as ProvinceNode[]);
    setRoutes((routesRes.data || []) as ProvinceRoute[]);
    setFlows((flowsRes.data || []) as FlowPath[]);
    setCities((citiesRes.data || []) as CityOnNode[]);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSelect = useCallback((id: string) => {
    setSelectedNodeId(id);
    // Fetch buildings for the city on this node
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
    const inMap: Record<string, FlowPath[]> = {};
    const outMap: Record<string, FlowPath[]> = {};
    for (const f of flows) {
      (inMap[f.to_node_id] = inMap[f.to_node_id] || []).push(f);
      (outMap[f.from_node_id] = outMap[f.from_node_id] || []).push(f);
    }
    return { inMap, outMap };
  }, [flows]);

  const { graphNodes, graphEdges } = useMemo(() => {
    // Layout by hex coords with scaling
    const gNodes: Node[] = nodes.map(n => ({
      id: n.id,
      type: "provinceNode",
      position: { x: n.hex_q * 200, y: n.hex_r * 140 + (n.hex_q % 2 === 0 ? 0 : 70) },
      data: {
        node: n,
        city: cityByNodeId[n.id] || null,
        flowsIn: flowsByNode.inMap[n.id] || [],
        flowsOut: flowsByNode.outMap[n.id] || [],
        onSelect: handleSelect,
      },
    }));

    const gEdges: Edge[] = [];

    // Routes as structural edges
    for (const r of routes) {
      gEdges.push({
        id: `route-${r.id}`,
        source: r.node_a,
        target: r.node_b,
        style: {
          stroke: r.is_blocked ? "#ef4444" : r.path_dirty ? "#f59e0b" : "#4b5563",
          strokeWidth: r.is_blocked ? 1 : 2,
          strokeDasharray: r.is_blocked ? "5 5" : undefined,
        },
        label: r.route_type,
        labelStyle: { fontSize: 8, fill: "#9ca3af" },
      });
    }

    // Flow paths as colored edges
    for (const f of flows) {
      gEdges.push({
        id: `flow-${f.id}`,
        source: f.from_node_id,
        target: f.to_node_id,
        style: {
          stroke: RESOURCE_COLORS[f.resource_type] || RESOURCE_COLORS.default,
          strokeWidth: Math.max(1, Math.min(4, f.volume / 5)),
        },
        animated: true,
        label: `${f.resource_type} ${f.volume.toFixed(1)}`,
        labelStyle: { fontSize: 7, fill: RESOURCE_COLORS[f.resource_type] || "#9ca3af" },
      });
    }

    return { graphNodes: gNodes, graphEdges: gEdges };
  }, [nodes, routes, flows, cityByNodeId, flowsByNode, handleSelect]);

  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;
  const selectedCity = selectedNode ? cityByNodeId[selectedNode.id] : null;
  const selectedFlowsIn = selectedNodeId ? (flowsByNode.inMap[selectedNodeId] || []) : [];
  const selectedFlowsOut = selectedNodeId ? (flowsByNode.outMap[selectedNodeId] || []) : [];
  const neighborRoutes = selectedNodeId ? routes.filter(r => r.node_a === selectedNodeId || r.node_b === selectedNodeId) : [];
  const neighborNodeIds = new Set(neighborRoutes.map(r => r.node_a === selectedNodeId ? r.node_b : r.node_a));
  const neighborNodes = nodes.filter(n => neighborNodeIds.has(n.id));

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

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(NODE_COLORS).filter(([k]) => k !== "default").map(([key, c]) => (
          <Badge key={key} variant="outline" className="text-[10px] gap-1" style={{ borderColor: c.border, color: c.border }}>
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: c.border }} />
            {key}
          </Badge>
        ))}
        <Badge variant="outline" className="text-[10px] gap-1 border-destructive text-destructive">
          <span className="w-2 h-2 rounded-full inline-block bg-destructive" /> blocked
        </Badge>
        {Object.entries(RESOURCE_COLORS).filter(([k]) => k !== "default").map(([key, c]) => (
          <Badge key={key} variant="outline" className="text-[10px] gap-1" style={{ borderColor: c, color: c }}>
            ⟶ {key}
          </Badge>
        ))}
      </div>

      <div className="w-full h-[600px] border rounded-lg bg-background/50">
        <ReactFlow
          nodes={graphNodes}
          edges={graphEdges}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} />
          <Controls />
          <MiniMap
            nodeStrokeWidth={3}
            nodeColor={(n) => {
              const nd = nodes.find(nd => nd.id === n.id);
              if (!nd) return "#666";
              return getNodeColor(nd.node_type, nd.node_role).border;
            }}
          />
        </ReactFlow>
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selectedNode} onOpenChange={(open) => { if (!open) setSelectedNodeId(null); }}>
        <SheetContent className="w-[420px] sm:w-[520px] overflow-y-auto">
          {selectedNode && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 font-mono">
                  <MapPin className="h-4 w-4" style={{ color: getNodeColor(selectedNode.node_type, selectedNode.node_role).border }} />
                  {selectedCity?.name || selectedNode.label || `Node [${selectedNode.hex_q}, ${selectedNode.hex_r}]`}
                </SheetTitle>
                <SheetDescription>
                  {selectedNode.node_type} / {selectedNode.node_role} — Hex ({selectedNode.hex_q}, {selectedNode.hex_r})
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4">
                {/* Live DB Data */}
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">📊 Live Data</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Node Score", value: selectedNode.node_score },
                      { label: "Supply Level", value: `${(selectedNode.supply_level * 100).toFixed(0)}%` },
                      { label: "Active", value: selectedNode.is_active ? "✅" : "❌" },
                      { label: "Owner", value: selectedNode.owner_player || "—" },
                      { label: "Parent Node", value: selectedNode.parent_node_id ? selectedNode.parent_node_id.slice(0, 8) + "…" : "—" },
                    ].map(item => (
                      <div key={item.label} className="bg-card border rounded p-2">
                        <p className="text-[9px] text-muted-foreground">{item.label}</p>
                        <p className="text-sm font-bold font-mono">{item.value}</p>
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
                        { label: "🌾 Grain Reserve", value: selectedCity.local_grain_reserve },
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
                    <p className="text-[10px] text-muted-foreground font-medium mb-1 flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> Budovy ({buildings.length})
                    </p>
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

                {/* Flows In */}
                {selectedFlowsIn.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium mb-1">⬅ Příchozí toky ({selectedFlowsIn.length})</p>
                    {selectedFlowsIn.map(f => {
                      const fromNode = nodes.find(n => n.id === f.from_node_id);
                      return (
                        <div key={f.id} className="flex items-center gap-2 text-[10px] py-1 px-2 rounded hover:bg-muted/20 cursor-pointer"
                          onClick={() => handleSelect(f.from_node_id)}>
                          <span className="w-2 h-2 rounded-full" style={{ background: RESOURCE_COLORS[f.resource_type] || "#666" }} />
                          <span className="font-mono">{fromNode?.label || cityByNodeId[f.from_node_id]?.name || f.from_node_id.slice(0, 8)}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <Badge variant="outline" className="text-[8px]" style={{ borderColor: RESOURCE_COLORS[f.resource_type] }}>
                            {f.resource_type}: {f.volume.toFixed(1)}
                          </Badge>
                          <span className="ml-auto text-muted-foreground">{(f.efficiency * 100).toFixed(0)}% eff</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Flows Out */}
                {selectedFlowsOut.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium mb-1">➡ Odchozí toky ({selectedFlowsOut.length})</p>
                    {selectedFlowsOut.map(f => {
                      const toNode = nodes.find(n => n.id === f.to_node_id);
                      return (
                        <div key={f.id} className="flex items-center gap-2 text-[10px] py-1 px-2 rounded hover:bg-muted/20 cursor-pointer"
                          onClick={() => handleSelect(f.to_node_id)}>
                          <span className="w-2 h-2 rounded-full" style={{ background: RESOURCE_COLORS[f.resource_type] || "#666" }} />
                          <Badge variant="outline" className="text-[8px]" style={{ borderColor: RESOURCE_COLORS[f.resource_type] }}>
                            {f.resource_type}: {f.volume.toFixed(1)}
                          </Badge>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span className="font-mono">{toNode?.label || cityByNodeId[f.to_node_id]?.name || f.to_node_id.slice(0, 8)}</span>
                          <span className="ml-auto text-muted-foreground">{(f.efficiency * 100).toFixed(0)}% eff</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Neighbor nodes + routes */}
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium mb-1 flex items-center gap-1">
                    <Route className="h-3 w-3" /> Sousední uzly ({neighborNodes.length})
                  </p>
                  {neighborRoutes.map(r => {
                    const otherId = r.node_a === selectedNodeId ? r.node_b : r.node_a;
                    const other = nodes.find(n => n.id === otherId);
                    const otherCity = other ? cityByNodeId[other.id] : null;
                    return (
                      <div key={r.id} className="flex items-center gap-2 text-[10px] py-1 px-2 rounded hover:bg-muted/20 cursor-pointer"
                        onClick={() => handleSelect(otherId)}>
                        <MapPin className="h-3 w-3" style={{ color: other ? getNodeColor(other.node_type, other.node_role).border : "#666" }} />
                        <span className="font-mono">{otherCity?.name || other?.label || otherId.slice(0, 8)}</span>
                        <Badge variant="outline" className="text-[8px]">{r.route_type}</Badge>
                        <span className="text-muted-foreground">cost: {r.cost}</span>
                        {r.is_blocked && <Badge variant="destructive" className="text-[8px]">BLOCKED</Badge>}
                        {r.path_dirty && <Badge variant="outline" className="text-[8px] border-yellow-500 text-yellow-500">DIRTY</Badge>}
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
