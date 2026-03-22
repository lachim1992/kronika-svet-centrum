import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Network, AlertTriangle, CheckCircle2, XCircle, ArrowRight,
  RefreshCw, TrendingDown, Shield, Wheat, Factory, Loader2
} from "lucide-react";
import { NODE_TYPE_LABELS, ROUTE_TYPE_LABELS, CONTROL_STATE_LABELS } from "@/lib/strategicGraph";

interface Props {
  sessionId: string;
  playerName: string;
  currentTurn?: number;
}

interface SupplyState {
  node_id: string;
  connected_to_capital: boolean;
  supply_level: number;
  hop_distance: number;
  isolation_turns: number;
  route_quality: number;
  production_modifier: number;
  stability_modifier: number;
  morale_modifier: number;
}

interface NodeInfo {
  id: string;
  name: string;
  node_type: string;
  controlled_by: string | null;
  production_output: number;
  wealth_output: number;
  is_major: boolean;
}

interface RouteInfo {
  id: string;
  node_a: string;
  node_b: string;
  route_type: string;
  capacity_value: number;
  control_state: string;
  path_dirty: boolean;
}

const SupplyChainPanel = ({ sessionId, playerName, currentTurn }: Props) => {
  const [supplyStates, setSupplyStates] = useState<SupplyState[]>([]);
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [routes, setRoutes] = useState<RouteInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [supplyRes, nodesRes, routesRes] = await Promise.all([
        supabase.from("supply_chain_state")
          .select("node_id, connected_to_capital, supply_level, hop_distance, isolation_turns, route_quality, production_modifier, stability_modifier, morale_modifier")
          .eq("session_id", sessionId)
          .eq("turn_number", currentTurn ?? 1),
        supabase.from("province_nodes")
          .select("id, name, node_type, controlled_by, production_output, wealth_output, is_major")
          .eq("session_id", sessionId)
          .eq("is_active", true),
        supabase.from("province_routes")
          .select("id, node_a, node_b, route_type, capacity_value, control_state, path_dirty")
          .eq("session_id", sessionId),
      ]);
      if (supplyRes.data) setSupplyStates(supplyRes.data as SupplyState[]);
      if (nodesRes.data) setNodes(nodesRes.data as NodeInfo[]);
      if (routesRes.data) setRoutes(routesRes.data as RouteInfo[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [sessionId, currentTurn]);

  const nodeMap = useMemo(() => {
    const m = new Map<string, NodeInfo>();
    nodes.forEach(n => m.set(n.id, n));
    return m;
  }, [nodes]);

  const supplyMap = useMemo(() => {
    const m = new Map<string, SupplyState>();
    supplyStates.forEach(s => m.set(s.node_id, s));
    return m;
  }, [supplyStates]);

  // Filter to player's nodes
  const myNodes = useMemo(() => nodes.filter(n => n.controlled_by === playerName), [nodes, playerName]);
  const myNodeIds = useMemo(() => new Set(myNodes.map(n => n.id)), [myNodes]);

  const mySupply = useMemo(() => supplyStates.filter(s => myNodeIds.has(s.node_id)), [supplyStates, myNodeIds]);

  const isolatedNodes = useMemo(() => mySupply.filter(s => !s.connected_to_capital || s.isolation_turns > 0), [mySupply]);
  const connectedNodes = useMemo(() => mySupply.filter(s => s.connected_to_capital && s.isolation_turns === 0), [mySupply]);

  const myRoutes = useMemo(() => routes.filter(r => myNodeIds.has(r.node_a) || myNodeIds.has(r.node_b)), [routes, myNodeIds]);
  const blockedRoutes = useMemo(() => myRoutes.filter(r => r.control_state === "blocked" || r.control_state === "damaged" || r.control_state === "embargoed"), [myRoutes]);
  const dirtyRoutes = useMemo(() => myRoutes.filter(r => r.path_dirty), [myRoutes]);

  // Aggregates
  const avgSupply = mySupply.length > 0 ? mySupply.reduce((s, x) => s + x.supply_level, 0) / mySupply.length : 0;
  const avgQuality = mySupply.length > 0 ? mySupply.reduce((s, x) => s + x.route_quality, 0) / mySupply.length : 0;
  const totalProd = myNodes.reduce((s, n) => s + (n.production_output || 0), 0);
  const totalWealth = myNodes.reduce((s, n) => s + (n.wealth_output || 0), 0);

  const supplyColor = (level: number) => {
    if (level >= 0.8) return "text-green-500";
    if (level >= 0.5) return "text-yellow-500";
    if (level >= 0.2) return "text-orange-500";
    return "text-destructive";
  };

  const nodeName = (id: string) => nodeMap.get(id)?.name || id.slice(0, 8);

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Network className="h-5 w-5 text-primary" />
            Zásobovací řetězec
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <SummaryCard icon={<CheckCircle2 className="h-4 w-4 text-green-500" />} label="Připojeno" value={`${connectedNodes.length}/${myNodes.length}`} />
          <SummaryCard icon={<AlertTriangle className="h-4 w-4 text-destructive" />} label="Izolováno" value={String(isolatedNodes.length)} highlight={isolatedNodes.length > 0} />
          <SummaryCard icon={<Factory className="h-4 w-4 text-primary" />} label="Produkce" value={`⚒️ ${totalProd.toFixed(0)}`} />
          <SummaryCard icon={<Shield className="h-4 w-4 text-primary" />} label="Bohatství" value={`💰 ${totalWealth.toFixed(0)}`} />
        </div>

        {/* Supply / Quality bars */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Průměrné zásobování</span>
            <span className={supplyColor(avgSupply)}>{(avgSupply * 100).toFixed(0)}%</span>
          </div>
          <Progress value={avgSupply * 100} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Kvalita tras</span>
            <span>{(avgQuality * 100).toFixed(0)}%</span>
          </div>
          <Progress value={avgQuality * 100} className="h-2" />
        </div>

        <Tabs defaultValue="isolated" className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="isolated" className="text-xs">
              Izolované {isolatedNodes.length > 0 && <Badge variant="destructive" className="ml-1 text-[10px] px-1">{isolatedNodes.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="routes" className="text-xs">
              Trasy {blockedRoutes.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px] px-1">{blockedRoutes.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="nodes" className="text-xs">Uzly</TabsTrigger>
          </TabsList>

          <TabsContent value="isolated">
            <ScrollArea className="h-48">
              {isolatedNodes.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">✅ Všechny uzly jsou zásobovány.</p>
              ) : (
                <div className="space-y-2">
                  {isolatedNodes.map(s => {
                    const node = nodeMap.get(s.node_id);
                    return (
                      <div key={s.node_id} className="flex items-center justify-between px-2 py-1.5 rounded-md bg-destructive/10 border border-destructive/20">
                        <div className="flex items-center gap-2 min-w-0">
                          <XCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{node?.name || s.node_id.slice(0, 8)}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {NODE_TYPE_LABELS[node?.node_type || ""] || node?.node_type} · izolace {s.isolation_turns} kol
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="text-right">
                            <p className="text-[10px] text-muted-foreground">Prod {(s.production_modifier * 100).toFixed(0)}%</p>
                            <p className="text-[10px] text-muted-foreground">Stab {(s.stability_modifier * 100).toFixed(0)}%</p>
                          </div>
                          <Badge variant="destructive" className="text-[10px]">{(s.supply_level * 100).toFixed(0)}%</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="routes">
            <ScrollArea className="h-48">
              {blockedRoutes.length === 0 && dirtyRoutes.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">✅ Všechny trasy jsou průchozí.</p>
              ) : (
                <div className="space-y-2">
                  {blockedRoutes.map(r => (
                    <div key={r.id} className="flex items-center justify-between px-2 py-1.5 rounded-md bg-muted/50 border border-border">
                      <div className="flex items-center gap-1.5 min-w-0 text-xs">
                        <TrendingDown className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
                        <span className="truncate">{nodeName(r.node_a)}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <span className="truncate">{nodeName(r.node_b)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Badge variant="outline" className="text-[10px]">{ROUTE_TYPE_LABELS[r.route_type] || r.route_type}</Badge>
                        <Badge variant="destructive" className="text-[10px]">{CONTROL_STATE_LABELS[r.control_state] || r.control_state}</Badge>
                      </div>
                    </div>
                  ))}
                  {dirtyRoutes.filter(r => !blockedRoutes.includes(r)).map(r => (
                    <div key={r.id} className="flex items-center justify-between px-2 py-1.5 rounded-md bg-yellow-500/5 border border-yellow-500/20">
                      <div className="flex items-center gap-1.5 min-w-0 text-xs">
                        <RefreshCw className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
                        <span className="truncate">{nodeName(r.node_a)}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <span className="truncate">{nodeName(r.node_b)}</span>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">Přepočet</Badge>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="nodes">
            <ScrollArea className="h-48">
              <div className="space-y-1">
                {myNodes.sort((a, b) => (b.production_output + b.wealth_output) - (a.production_output + a.wealth_output)).map(n => {
                  const supply = supplyMap.get(n.id);
                  return (
                    <div key={n.id} className="flex items-center justify-between px-2 py-1 rounded-md hover:bg-muted/30 text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {n.is_major ? <span className="text-primary">●</span> : <span className="text-muted-foreground">○</span>}
                        <span className="truncate font-medium">{n.name}</span>
                        <span className="text-muted-foreground text-[10px]">{NODE_TYPE_LABELS[n.node_type] || n.node_type}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-muted-foreground">⚒️{n.production_output.toFixed(0)}</span>
                        <span className="text-muted-foreground">💰{n.wealth_output.toFixed(0)}</span>
                        {supply && (
                          <span className={`font-mono ${supplyColor(supply.supply_level)}`}>
                            {(supply.supply_level * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

function SummaryCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-2 ${highlight ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"}`}>
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
      <p className="text-sm font-bold mt-0.5">{value}</p>
    </div>
  );
}

export default SupplyChainPanel;
