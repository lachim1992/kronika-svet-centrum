import { useState, useEffect, useCallback, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import {
  Landmark, Shield, Anchor, Store, Mountain, Wheat, Route,
  Swords, ArrowRight, Hammer, ChevronUp, Loader2, Lock, Unlock, AlertTriangle,
  Crosshair, Ban, Bomb, Eye, HardHat, X, Wrench,
} from "lucide-react";
import { toast } from "sonner";
import {
  moveStackRoute, buildRoute, upgradeRoute, fortifyNode,
  blockadeRoute, ambushRoute, siegeNode, disruptRoute,
  startProject, cancelProject,
  ROUTE_TYPE_LABELS, CONTROL_STATE_LABELS, NODE_TYPE_LABELS, STANCE_LABELS,
  PROJECT_TYPE_LABELS, PROJECT_COSTS,
} from "@/lib/strategicGraph";

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
  besieged_by: string | null;
  siege_turn_start: number | null;
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
  speed_value: number;
  safety_value: number;
  controlled_by: string | null;
  is_cross_province: boolean;
  damage_level: number;
  blocked_by: string[];
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
  damaged: "text-orange-400", embargoed: "text-purple-400",
};

const StrategicOverlay = memo(function StrategicOverlay({ sessionId, currentPlayerName, turnNumber }: Props) {
  const [nodes, setNodes] = useState<StrategicNode[]>([]);
  const [routes, setRoutes] = useState<ProvinceRoute[]>([]);
  const [stacks, setStacks] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedNode, setSelectedNode] = useState<StrategicNode | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<ProvinceRoute | null>(null);
  const [moveTarget, setMoveTarget] = useState("");
  const [moveStack, setMoveStack] = useState("");
  const [fortifyStack, setFortifyStack] = useState("");
  const [warfareStack, setWarfareStack] = useState("");
  const [newProjectType, setNewProjectType] = useState("");
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    const [nRes, rRes, sRes, pRes] = await Promise.all([
      supabase.from("province_nodes")
        .select("id, province_id, node_type, name, hex_q, hex_r, strategic_value, economic_value, defense_value, controlled_by, garrison_strength, is_major, population, fortification_level, infrastructure_level, parent_node_id, besieged_by, siege_turn_start")
        .eq("session_id", sessionId),
      supabase.from("province_routes")
        .select("id, node_a, node_b, route_type, capacity_value, control_state, upgrade_level, build_cost, speed_value, safety_value, controlled_by, is_cross_province, damage_level, blocked_by")
        .eq("session_id", sessionId),
      supabase.from("military_stacks")
        .select("id, name, current_node_id, travel_route_id, travel_progress, travel_target_node_id, player_name, power, stance")
        .eq("session_id", sessionId).eq("player_name", currentPlayerName).eq("is_active", true),
      supabase.from("node_projects")
        .select("*")
        .eq("session_id", sessionId).eq("initiated_by", currentPlayerName).eq("status", "active"),
    ]);
    setNodes((nRes.data || []) as StrategicNode[]);
    setRoutes((rRes.data || []) as ProvinceRoute[]);
    setStacks(sRes.data || []);
    setProjects(pRes.data || []);
  }, [sessionId, currentPlayerName]);
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

  const getRoutesForNode = (nodeId: string) =>
    routes.filter(r => r.node_a === nodeId || r.node_b === nodeId);

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

  const handleBlockade = async (routeId: string) => {
    if (!warfareStack) return;
    setBusy(true);
    const res = await blockadeRoute({ sessionId, turnNumber, playerName: currentPlayerName, stackId: warfareStack, routeId });
    if (res.ok) { toast.success("Cesta zablokována"); await loadData(); setSelectedRoute(null); }
    else toast.error(res.error || "Chyba");
    setBusy(false);
    setWarfareStack("");
  };

  const handleAmbush = async (routeId: string) => {
    if (!warfareStack) return;
    setBusy(true);
    const res = await ambushRoute({ sessionId, turnNumber, playerName: currentPlayerName, stackId: warfareStack, routeId });
    if (res.ok) { toast.success("Léčka nastražena"); await loadData(); setSelectedRoute(null); }
    else toast.error(res.error || "Chyba");
    setBusy(false);
    setWarfareStack("");
  };

  const handleSiege = async (nodeId: string) => {
    if (!warfareStack) return;
    setBusy(true);
    const res = await siegeNode({ sessionId, turnNumber, playerName: currentPlayerName, stackId: warfareStack, nodeId });
    if (res.ok) { toast.success("Obléhání zahájeno"); await loadData(); setSelectedNode(null); }
    else toast.error(res.error || "Chyba");
    setBusy(false);
    setWarfareStack("");
  };

  const handleDisrupt = async (routeId: string) => {
    setBusy(true);
    const res = await disruptRoute({ sessionId, turnNumber, playerName: currentPlayerName, routeId, stackId: warfareStack || undefined });
    if (res.ok) { toast.success("Cesta poškozena"); await loadData(); setSelectedRoute(null); }
    else toast.error(res.error || "Chyba");
    setBusy(false);
  };

  const handleUpgradeRoute = async (routeId: string) => {
    setBusy(true);
    const res = await upgradeRoute({ sessionId, turnNumber, playerName: currentPlayerName, routeId });
    if (res.ok) { toast.success("Trasa vylepšena"); await loadData(); }
    else toast.error(res.error || "Chyba");
    setBusy(false);
  };

  const handleStartProject = async (projectType: string, nodeId?: string, routeId?: string) => {
    setBusy(true);
    const res = await startProject({
      sessionId, turnNumber, playerName: currentPlayerName,
      projectType, nodeId, routeId,
    });
    if (res.ok) { toast.success("Projekt zahájen"); await loadData(); setNewProjectType(""); }
    else toast.error(res.error || "Chyba");
    setBusy(false);
  };

  const handleCancelProject = async (projectId: string) => {
    setBusy(true);
    const res = await cancelProject({ sessionId, turnNumber, playerName: currentPlayerName, projectId });
    if (res.ok) { toast.success("Projekt zrušen"); await loadData(); }
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
        <Badge variant="outline" className="text-[9px]">Spatial v1</Badge>
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

      {/* Besieged nodes */}
      {nodes.filter(n => n.besieged_by).length > 0 && (
        <Card>
          <CardHeader className="pb-1 pt-2 px-3">
            <CardTitle className="text-[11px] flex items-center gap-1.5 text-destructive">
              <Crosshair className="h-3.5 w-3.5" /> Obléhání
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-2 space-y-1">
            {nodes.filter(n => n.besieged_by).map(n => (
              <div key={n.id} className="flex items-center gap-2 text-[10px] bg-destructive/10 rounded p-1.5">
                <Shield className="h-3 w-3 text-destructive" />
                <span className="font-medium">{n.name}</span>
                <span className="text-muted-foreground">obléhá: {n.besieged_by}</span>
                <Badge variant="destructive" className="text-[7px] ml-auto">
                  Posádka: {n.garrison_strength}
                </Badge>
              </div>
            ))}
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
                    {garrison?.stance && garrison.stance !== "idle" && ` · ${STANCE_LABELS[garrison.stance] || garrison.stance}`}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Enemy nodes (clickable for siege) */}
      {contestedNodes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-display font-semibold text-muted-foreground">
            Nepřátelské uzly ({contestedNodes.length})
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {contestedNodes.slice(0, 6).map(n => (
              <button key={n.id} onClick={() => setSelectedNode(n)}
                className="flex items-center gap-1.5 p-1.5 rounded bg-destructive/10 hover:bg-destructive/20 transition text-left text-[10px]">
                <NodeIcon type={n.node_type} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{n.name}</p>
                  <p className="text-muted-foreground text-[8px]">
                    {n.controlled_by} · {NODE_TYPE_LABELS[n.node_type] || n.node_type}
                    {n.besieged_by && " · 🔥 obléháno"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

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
                  {r.control_state === "blocked" ? "🔒" : r.control_state === "damaged" ? "⚠" : r.control_state === "contested" ? "⚡" : "✓"}
                </span>
                {(r.damage_level || 0) > 0 && (
                  <Badge variant="destructive" className="text-[7px]">Dmg {r.damage_level}</Badge>
                )}
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
                  {selectedNode.besieged_by && (
                    <Badge variant="destructive" className="text-[8px]">Obléháno</Badge>
                  )}
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

      {/* Active Projects */}
      {projects.length > 0 && (
        <Card>
          <CardHeader className="pb-1 pt-2 px-3">
            <CardTitle className="text-[11px] flex items-center gap-1.5">
              <HardHat className="h-3.5 w-3.5 text-primary" /> Aktivní projekty ({projects.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-2 space-y-1.5">
            {projects.map((p: any) => {
              const progressPct = Math.round(((p.progress || 0) / (p.total_turns || 1)) * 100);
              const remaining = (p.total_turns || 1) - (p.progress || 0);
              return (
                <div key={p.id} className="bg-muted/40 rounded p-2 space-y-1">
                  <div className="flex items-center gap-2 text-[10px]">
                    <Wrench className="h-3 w-3 text-primary" />
                    <span className="font-medium flex-1">{p.name}</span>
                    <Badge variant="outline" className="text-[7px]">{remaining} kol</Badge>
                    <button onClick={() => handleCancelProject(p.id)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <Progress value={progressPct} className="h-1" />
                  <p className="text-[8px] text-muted-foreground">
                    {PROJECT_TYPE_LABELS[p.project_type] || p.project_type} · {progressPct}%
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Start New Project */}
      <Card>
        <CardHeader className="pb-1 pt-2 px-3">
          <CardTitle className="text-[11px] flex items-center gap-1.5">
            <HardHat className="h-3.5 w-3.5 text-accent-foreground" /> Nový projekt
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-2 space-y-2">
          <Select value={newProjectType} onValueChange={setNewProjectType}>
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Typ projektu" /></SelectTrigger>
            <SelectContent>
              {Object.entries(PROJECT_TYPE_LABELS).map(([key, label]) => {
                const cost = PROJECT_COSTS[key];
                return (
                  <SelectItem key={key} value={key}>
                    {label} ({cost?.turns}k · 💰{cost?.gold} 🪵{cost?.wood} 🪨{cost?.stone} ⛏{cost?.iron})
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {newProjectType && (
            <>
              {(newProjectType === "create_fort" || newProjectType === "create_port" || newProjectType === "expand_hub") && (
                <Select onValueChange={(nodeId) => handleStartProject(newProjectType, nodeId)}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Vyberte uzel" /></SelectTrigger>
                  <SelectContent>
                    {myNodes.map(n => (
                      <SelectItem key={n.id} value={n.id}>{n.name} ({NODE_TYPE_LABELS[n.node_type]})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {(newProjectType === "upgrade_route" || newProjectType === "repair_route") && (
                <Select onValueChange={(routeId) => handleStartProject(newProjectType, undefined, routeId)}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Vyberte trasu" /></SelectTrigger>
                  <SelectContent>
                    {routes.map(r => {
                      const na = nodes.find(n => n.id === r.node_a);
                      const nb = nodes.find(n => n.id === r.node_b);
                      return (
                        <SelectItem key={r.id} value={r.id}>
                          {na?.name} → {nb?.name} (L{r.upgrade_level}{r.damage_level ? ` · Dmg ${r.damage_level}` : ""})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
              {newProjectType === "build_route" && (
                <Button size="sm" className="w-full h-7 text-xs gap-1"
                  onClick={() => handleStartProject(newProjectType)} disabled={busy}>
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Hammer className="h-3 w-3" />}
                  Zahájit stavbu
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  <div className="bg-muted/40 rounded p-1.5 text-center">
                    <span className="text-muted-foreground block text-[8px]">Populace</span>
                    <span className="font-bold">{selectedNode.population}</span>
                  </div>
                  <div className="bg-muted/40 rounded p-1.5 text-center">
                    <span className="text-muted-foreground block text-[8px]">Opevnění</span>
                    <span className="font-bold">{selectedNode.fortification_level}</span>
                  </div>
                </div>

                <div className="text-xs">
                  <span className="text-muted-foreground">Kontrola: </span>
                  <span className="font-medium">{selectedNode.controlled_by || "Nikdo"}</span>
                  {selectedNode.garrison_strength > 0 && (
                    <span className="text-muted-foreground"> · Posádka: {selectedNode.garrison_strength}</span>
                  )}
                </div>

                {selectedNode.besieged_by && (
                  <div className="text-xs text-destructive flex items-center gap-1">
                    <Crosshair className="h-3 w-3" />
                    Obléháno od: {selectedNode.besieged_by}
                    {selectedNode.siege_turn_start && ` (od kola ${selectedNode.siege_turn_start})`}
                  </div>
                )}

                {/* MY NODE — movement & fortification */}
                {selectedNode.controlled_by === currentPlayerName && (
                  <>
                    <div className="border-t border-border pt-2 space-y-2">
                      <p className="text-[10px] font-semibold">Vyslat armádu po trase</p>
                      <Select value={moveStack} onValueChange={setMoveStack}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Vyberte armádu" /></SelectTrigger>
                        <SelectContent>
                          {stacksAtNodes.filter(s => s.current_node_id === selectedNode.id).map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name} (⚔{s.power}) {s.stance !== "idle" ? `[${STANCE_LABELS[s.stance] || s.stance}]` : ""}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={moveTarget} onValueChange={setMoveTarget}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Cílový uzel" /></SelectTrigger>
                        <SelectContent>
                          {getConnectedNodes(selectedNode.id).map(n => (
                            <SelectItem key={n.id} value={n.id}>
                              {n.name} ({NODE_TYPE_LABELS[n.node_type] || n.node_type})
                              {n.controlled_by && n.controlled_by !== currentPlayerName ? " ⚔" : ""}
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

                {/* ENEMY NODE — siege */}
                {selectedNode.controlled_by && selectedNode.controlled_by !== currentPlayerName && !selectedNode.besieged_by && (
                  <div className="border-t border-border pt-2 space-y-2">
                    <p className="text-[10px] font-semibold text-destructive flex items-center gap-1">
                      <Crosshair className="h-3 w-3" /> Obléhat uzel
                    </p>
                    <Select value={warfareStack} onValueChange={setWarfareStack}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Armáda pro obléhání" /></SelectTrigger>
                      <SelectContent>
                        {stacksAtNodes.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name} (⚔{s.power})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="destructive" className="w-full h-7 text-xs gap-1"
                      onClick={() => handleSiege(selectedNode.id)} disabled={busy || !warfareStack}>
                      <Crosshair className="h-3 w-3" /> Zahájit obléhání
                    </Button>
                  </div>
                )}

                {/* UNCONTROLLED — claim */}
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
            const isMyEndpoint = (na?.controlled_by === currentPlayerName) || (nb?.controlled_by === currentPlayerName);
            const myStacksAtEndpoints = stacksAtNodes.filter(s =>
              s.current_node_id === selectedRoute.node_a || s.current_node_id === selectedRoute.node_b
            );
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="text-sm flex items-center gap-2">
                    <Route className="h-4 w-4 text-primary" />
                    {na?.name || "?"} → {nb?.name || "?"}
                    {selectedRoute.control_state === "blocked" && (
                      <Badge variant="destructive" className="text-[8px]">Zablokováno</Badge>
                    )}
                    {selectedRoute.control_state === "damaged" && (
                      <Badge variant="outline" className="text-[8px] text-orange-400">Poškozeno</Badge>
                    )}
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

                  <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                    <div className="bg-muted/40 rounded p-1.5 text-center">
                      <span className="text-muted-foreground block text-[8px]">Rychlost</span>
                      <span className="font-bold">{selectedRoute.speed_value}</span>
                    </div>
                    <div className="bg-muted/40 rounded p-1.5 text-center">
                      <span className="text-muted-foreground block text-[8px]">Bezpečnost</span>
                      <span className="font-bold">{selectedRoute.safety_value}</span>
                    </div>
                    <div className="bg-muted/40 rounded p-1.5 text-center">
                      <span className="text-muted-foreground block text-[8px]">Poškození</span>
                      <span className={`font-bold ${(selectedRoute.damage_level || 0) > 0 ? "text-destructive" : ""}`}>
                        {selectedRoute.damage_level || 0}/10
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Stav:</span>
                    <span className={CONTROL_COLORS[selectedRoute.control_state] || ""}>
                      {CONTROL_STATE_LABELS[selectedRoute.control_state] || selectedRoute.control_state}
                    </span>
                    {selectedRoute.controlled_by && (
                      <span className="text-muted-foreground">· Kontroluje: {selectedRoute.controlled_by}</span>
                    )}
                  </div>

                  {(selectedRoute.blocked_by || []).length > 0 && (
                    <div className="text-xs text-destructive flex items-center gap-1">
                      <Ban className="h-3 w-3" />
                      Blokováno: {selectedRoute.blocked_by.join(", ")}
                    </div>
                  )}

                  {/* Upgrade */}
                  {isMyEndpoint && (
                    <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1"
                      onClick={() => handleUpgradeRoute(selectedRoute.id)} disabled={busy}>
                      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronUp className="h-3 w-3" />}
                      Vylepšit trasu
                    </Button>
                  )}

                  {/* Warfare actions */}
                  {isMyEndpoint && myStacksAtEndpoints.length > 0 && (
                    <div className="border-t border-border pt-2 space-y-2">
                      <p className="text-[10px] font-semibold text-destructive flex items-center gap-1">
                        <Swords className="h-3 w-3" /> Válečné akce
                      </p>
                      <Select value={warfareStack} onValueChange={setWarfareStack}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Armáda" /></SelectTrigger>
                        <SelectContent>
                          {myStacksAtEndpoints.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name} (⚔{s.power})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="grid grid-cols-2 gap-1.5">
                        <Button size="sm" variant="outline" className="h-7 text-[9px] gap-1"
                          onClick={() => handleBlockade(selectedRoute.id)} disabled={busy || !warfareStack}>
                          <Ban className="h-3 w-3" /> Blokáda
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-[9px] gap-1"
                          onClick={() => handleAmbush(selectedRoute.id)} disabled={busy || !warfareStack}>
                          <Eye className="h-3 w-3" /> Léčka
                        </Button>
                      </div>
                      <Button size="sm" variant="destructive" className="w-full h-7 text-[9px] gap-1"
                        onClick={() => handleDisrupt(selectedRoute.id)} disabled={busy}>
                        <Bomb className="h-3 w-3" /> Sabotáž cesty
                      </Button>
                    </div>
                  )}
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
