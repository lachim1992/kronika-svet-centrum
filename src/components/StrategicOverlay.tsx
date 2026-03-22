import { useState, useEffect, useCallback, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Landmark, Shield, Anchor, Store, Mountain, Wheat, Route,
  Swords, ArrowRight, Hammer, ChevronUp, Loader2, Lock, Unlock, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { moveStackRoute, buildRoute, upgradeRoute, fortifyNode, ROUTE_TYPE_LABELS, CONTROL_STATE_LABELS, NODE_TYPE_LABELS } from "@/lib/strategicGraph";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  turnNumber: number;
}

interface StrategicNode {
  id: string;
  province_id: string;
  node_type: string;
  name: string;
  hex_q: number;
  hex_r: number;
  strategic_value: number;
  economic_value: number;
  defense_value: number;
  controlled_by: string | null;
  garrison_strength: number;
  is_major: boolean;
  population: number;
  fortification_level: number;
  infrastructure_level: number;
  parent_node_id: string | null;
}

interface ProvinceRoute {
  id: string;
  node_a: string;
  node_b: string;
  route_type: string;
  capacity_value: number;
  control_state: string;
  upgrade_level: number;
  build_cost: number;
}

const NODE_ICONS: Record<string, typeof Landmark> = {
  primary_city: Landmark, secondary_city: Landmark, fortress: Shield,
  port: Anchor, trade_hub: Store, pass: Mountain, resource_node: Wheat,
};

const NODE_COLORS: Record<string, string> = {
  primary_city: "text-yellow-400", secondary_city: "text-yellow-300",
  fortress: "text-red-400", port: "text-blue-400",
  trade_hub: "text-emerald-400", pass: "text-stone-400", resource_node: "text-amber-400",
};

const CONTROL_COLORS: Record<string, string> = {
  open: "text-emerald-400", contested: "text-yellow-400", blocked: "text-red-400",
};

const StrategicOverlay = memo(function StrategicOverlay({ sessionId, currentPlayerName, turnNumber }: Props) {
  const [nodes, setNodes] = useState<StrategicNode[]>([]);
  const [routes, setRoutes] = useState<ProvinceRoute[]>([]);
  const [stacks, setStacks] = useState<any[]>([]);
  const [selectedNode, setSelectedNode] = useState<StrategicNode | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<ProvinceRoute | null>(null);
  const [moveTarget, setMoveTarget] = useState("");
  const [moveStack, setMoveStack] = useState("");
  const [fortifyStack, setFortifyStack] = useState("");
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    const [nRes, rRes, sRes] = await Promise.all([
      supabase.from("province_nodes")
        .select("id, province_id, node_type, name, hex_q, hex_r, strategic_value, economic_value, defense_value, controlled_by, garrison_strength")
        .eq("session_id", sessionId),
      supabase.from("province_routes")
        .select("id, node_a, node_b, route_type, capacity_value, control_state, upgrade_level, build_cost")
        .eq("session_id", sessionId),
      supabase.from("military_stacks")
        .select("id, name, current_node_id, travel_route_id, travel_progress, travel_target_node_id, player_name, power")
        .eq("session_id", sessionId).eq("player_name", currentPlayerName).eq("is_active", true),
    ]);
    setNodes((nRes.data || []) as StrategicNode[]);
    setRoutes((rRes.data || []) as ProvinceRoute[]);
    setStacks(sRes.data || []);
  }, [sessionId, currentPlayerName]);

  useEffect(() => { loadData(); }, [loadData]);

  const myNodes = nodes.filter(n => n.controlled_by === currentPlayerName);
  const contestedNodes = nodes.filter(n => n.controlled_by && n.controlled_by !== currentPlayerName);
  const uncontrolledNodes = nodes.filter(n => !n.controlled_by);
  const stacksAtNodes = stacks.filter(s => s.current_node_id && !s.travel_route_id);
  const stacksInTransit = stacks.filter(s => s.travel_route_id);

  const getConnectedNodes = (nodeId: string) => {
    const connected: string[] = [];
    for (const r of routes) {
      if (r.control_state === "blocked") continue;
      if (r.node_a === nodeId) connected.push(r.node_b);
      if (r.node_b === nodeId) connected.push(r.node_a);
    }
    return connected.map(id => nodes.find(n => n.id === id)).filter(Boolean) as StrategicNode[];
  };

  const handleMoveRoute = async () => {
    if (!moveStack || !moveTarget || !selectedNode) return;
    setBusy(true);
    const stack = stacks.find(s => s.id === moveStack);
    const res = await moveStackRoute({
      sessionId, turnNumber, playerName: currentPlayerName,
      stackId: moveStack, stackName: stack?.name, targetNodeId: moveTarget,
    });
    if (res.ok) { toast.success("Armáda vyslána po strategické trase"); await loadData(); }
    else toast.error(res.error || "Chyba");
    setBusy(false);
    setMoveStack(""); setMoveTarget("");
  };

  const handleFortify = async () => {
    if (!selectedNode || !fortifyStack) return;
    setBusy(true);
    const res = await fortifyNode({
      sessionId, turnNumber, playerName: currentPlayerName,
      nodeId: selectedNode.id, stackId: fortifyStack,
    });
    if (res.ok) { toast.success("Uzel opevněn"); await loadData(); }
    else toast.error(res.error || "Chyba");
    setBusy(false);
    setFortifyStack("");
  };

  const handleUpgradeRoute = async (routeId: string) => {
    setBusy(true);
    const res = await upgradeRoute({ sessionId, turnNumber, playerName: currentPlayerName, routeId });
    if (res.ok) { toast.success("Trasa vylepšena"); await loadData(); }
    else toast.error(res.error || "Chyba");
    setBusy(false);
  };

  const NodeIcon = ({ type }: { type: string }) => {
    const Icon = NODE_ICONS[type] || Landmark;
    return <Icon className={`h-3.5 w-3.5 ${NODE_COLORS[type] || "text-muted-foreground"}`} />;
  };

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center gap-2 flex-wrap">
        <Route className="h-5 w-5 text-primary" />
        <h3 className="font-display font-bold text-sm">Strategická mapa</h3>
        <Badge variant="outline" className="text-[9px]">Phase 4</Badge>
        <div className="flex gap-1.5 ml-auto">
          <Badge variant="secondary" className="text-[9px]">{myNodes.length} ovládaných</Badge>
          <Badge variant="outline" className="text-[9px]">{routes.length} tras</Badge>
          <Badge variant="outline" className="text-[9px]">{stacksInTransit.length} na cestě</Badge>
        </div>
      </div>

      {/* Armies in transit */}
      {stacksInTransit.length > 0 && (
        <Card>
          <CardHeader className="pb-1 pt-2 px-3">
            <CardTitle className="text-[11px] flex items-center gap-1.5">
              <ArrowRight className="h-3.5 w-3.5 text-primary" /> Na pochodu
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-2 space-y-1">
            {stacksInTransit.map(s => {
              const targetNode = nodes.find(n => n.id === s.travel_target_node_id);
              const progress = Math.round((s.travel_progress || 0) * 100);
              return (
                <div key={s.id} className="flex items-center gap-2 text-[10px] bg-muted/40 rounded p-1.5">
                  <Swords className="h-3 w-3 text-primary" />
                  <span className="font-medium">{s.name}</span>
                  <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                  <span className="text-muted-foreground">{targetNode?.name || "?"}</span>
                  <Badge variant="outline" className="text-[7px] ml-auto">{progress}%</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* My controlled nodes */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-display font-semibold text-muted-foreground">
          Vaše uzly ({myNodes.length})
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {myNodes.map(n => {
            const garrison = stacks.find(s => s.current_node_id === n.id && !s.travel_route_id);
            return (
              <button key={n.id} onClick={() => setSelectedNode(n)}
                className="flex items-center gap-1.5 p-1.5 rounded bg-muted/40 hover:bg-muted/60 transition text-left text-[10px]">
                <NodeIcon type={n.node_type} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{n.name}</p>
                  <p className="text-muted-foreground text-[8px]">
                    {NODE_TYPE_LABELS[n.node_type] || n.node_type}
                    {garrison && ` · ⚔${garrison.power || 0}`}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Routes summary */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-display font-semibold text-muted-foreground">
          Strategické trasy ({routes.length})
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {routes.slice(0, 8).map(r => {
            const na = nodes.find(n => n.id === r.node_a);
            const nb = nodes.find(n => n.id === r.node_b);
            const isMyRoute = (na?.controlled_by === currentPlayerName) || (nb?.controlled_by === currentPlayerName);
            return (
              <button key={r.id} onClick={() => setSelectedRoute(r)}
                className={`flex items-center gap-1.5 p-1.5 rounded text-[9px] transition text-left ${isMyRoute ? "bg-muted/40 hover:bg-muted/60" : "bg-muted/20 hover:bg-muted/40"}`}>
                <Route className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                <span className="truncate">{na?.name || "?"} → {nb?.name || "?"}</span>
                <span className={`text-[7px] ml-auto ${CONTROL_COLORS[r.control_state] || ""}`}>
                  {r.control_state === "blocked" ? "🔒" : r.control_state === "contested" ? "⚠" : "✓"}
                </span>
                <Badge variant="outline" className="text-[7px]">L{r.upgrade_level}</Badge>
              </button>
            );
          })}
        </div>
        {routes.length > 8 && (
          <p className="text-[8px] text-muted-foreground text-center">…a dalších {routes.length - 8} tras</p>
        )}
      </div>

      {/* Node detail sheet */}
      <Sheet open={!!selectedNode} onOpenChange={() => setSelectedNode(null)}>
        <SheetContent side="right" className="w-80 sm:w-96">
          {selectedNode && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-sm">
                  <NodeIcon type={selectedNode.node_type} />
                  {selectedNode.name}
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-3 mt-4">
                <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                  {[
                    { l: "Strategická", v: selectedNode.strategic_value },
                    { l: "Ekonomická", v: selectedNode.economic_value },
                    { l: "Obranná", v: selectedNode.defense_value },
                  ].map(s => (
                    <div key={s.l} className="bg-muted/40 rounded p-1.5 text-center">
                      <span className="text-muted-foreground block text-[8px]">{s.l}</span>
                      <span className="font-bold">{s.v}</span>
                    </div>
                  ))}
                </div>

                <div className="text-xs">
                  <span className="text-muted-foreground">Kontrola: </span>
                  <span className="font-medium">{selectedNode.controlled_by || "Nikdo"}</span>
                  {selectedNode.garrison_strength > 0 && (
                    <span className="text-muted-foreground"> · Posádka: {selectedNode.garrison_strength}</span>
                  )}
                </div>

                {/* Connected nodes for movement */}
                {selectedNode.controlled_by === currentPlayerName && (
                  <>
                    <div className="border-t border-border pt-2 space-y-2">
                      <p className="text-[10px] font-semibold">Vyslat armádu po trase</p>
                      <Select value={moveStack} onValueChange={setMoveStack}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Vyberte armádu" /></SelectTrigger>
                        <SelectContent>
                          {stacksAtNodes.filter(s => s.current_node_id === selectedNode.id).map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name} (⚔{s.power})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={moveTarget} onValueChange={setMoveTarget}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Cílový uzel" /></SelectTrigger>
                        <SelectContent>
                          {getConnectedNodes(selectedNode.id).map(n => (
                            <SelectItem key={n.id} value={n.id}>
                              {n.name} ({NODE_TYPE_LABELS[n.node_type] || n.node_type})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" className="w-full h-7 text-xs gap-1" onClick={handleMoveRoute}
                        disabled={busy || !moveStack || !moveTarget}>
                        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                        Vyslat po trase
                      </Button>
                    </div>

                    <div className="border-t border-border pt-2 space-y-2">
                      <p className="text-[10px] font-semibold">Opevnit uzel</p>
                      <Select value={fortifyStack} onValueChange={setFortifyStack}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Armáda pro posádku" /></SelectTrigger>
                        <SelectContent>
                          {stacks.filter(s => !s.travel_route_id).map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name} (⚔{s.power})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1" onClick={handleFortify}
                        disabled={busy || !fortifyStack}>
                        <Shield className="h-3 w-3" /> Opevnit
                      </Button>
                    </div>
                  </>
                )}

                {!selectedNode.controlled_by && (
                  <Button size="sm" className="w-full h-7 text-xs gap-1"
                    onClick={async () => {
                      setBusy(true);
                      const res = await fortifyNode({ sessionId, turnNumber, playerName: currentPlayerName, nodeId: selectedNode.id });
                      if (res.ok) { toast.success("Uzel obsazen"); await loadData(); setSelectedNode(null); }
                      else toast.error(res.error || "Chyba");
                      setBusy(false);
                    }} disabled={busy}>
                    <Unlock className="h-3 w-3" /> Obsadit uzel
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Route detail sheet */}
      <Sheet open={!!selectedRoute} onOpenChange={() => setSelectedRoute(null)}>
        <SheetContent side="right" className="w-80 sm:w-96">
          {selectedRoute && (() => {
            const na = nodes.find(n => n.id === selectedRoute.node_a);
            const nb = nodes.find(n => n.id === selectedRoute.node_b);
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="text-sm flex items-center gap-2">
                    <Route className="h-4 w-4 text-primary" />
                    {na?.name || "?"} → {nb?.name || "?"}
                  </SheetTitle>
                </SheetHeader>
                <div className="space-y-3 mt-4">
                  <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                    <div className="bg-muted/40 rounded p-1.5 text-center">
                      <span className="text-muted-foreground block text-[8px]">Typ</span>
                      <span className="font-bold">{ROUTE_TYPE_LABELS[selectedRoute.route_type] || selectedRoute.route_type}</span>
                    </div>
                    <div className="bg-muted/40 rounded p-1.5 text-center">
                      <span className="text-muted-foreground block text-[8px]">Kapacita</span>
                      <span className="font-bold">{selectedRoute.capacity_value}</span>
                    </div>
                    <div className="bg-muted/40 rounded p-1.5 text-center">
                      <span className="text-muted-foreground block text-[8px]">Úroveň</span>
                      <span className="font-bold">{selectedRoute.upgrade_level}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Stav:</span>
                    <span className={CONTROL_COLORS[selectedRoute.control_state] || ""}>
                      {CONTROL_STATE_LABELS[selectedRoute.control_state] || selectedRoute.control_state}
                    </span>
                  </div>
                  <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1"
                    onClick={() => handleUpgradeRoute(selectedRoute.id)} disabled={busy}>
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronUp className="h-3 w-3" />}
                    Vylepšit trasu
                  </Button>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
});

export default StrategicOverlay;
