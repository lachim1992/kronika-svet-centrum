import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Plus, Trash2, MapPin, Route, RefreshCw, Loader2, Zap, Link2 } from "lucide-react";
import {
  type NodeTier, NODE_TIER_LABELS,
  MINOR_NODE_TYPES, MICRO_NODE_TYPES,
  computeNodeProduction, totalProduction, rollStrategicResource,
} from "@/lib/nodeTypes";

interface Props {
  sessionId: string;
  onRefetch?: () => void;
}

const NODE_TYPES = [
  "primary_city", "secondary_city", "fortress", "port", "trade_hub",
  "resource_node", "village_cluster", "religious_center", "logistic_hub",
];

const NODE_CLASSES = ["major", "minor", "transit"];

const FLOW_ROLES = ["neutral", "regulator", "gateway", "producer", "hub"];

const ROUTE_TYPES = ["land_road", "river_route", "sea_lane", "caravan_route"];

type SpawnedNode = {
  id: string; name: string; hex_q: number; hex_r: number;
  node_type: string; flow_role: string; is_major: boolean;
  node_tier?: string; node_subtype?: string;
};

const DevNodeSpawner = ({ sessionId, onRefetch }: Props) => {
  // ── Spawn Node form
  const [name, setName] = useState("Dev Node");
  const [hexQ, setHexQ] = useState(0);
  const [hexR, setHexR] = useState(0);
  const [nodeType, setNodeType] = useState("trade_hub");
  const [nodeClass, setNodeClass] = useState("minor");
  const [flowRole, setFlowRole] = useState("neutral");
  const [population, setPopulation] = useState(100);
  const [nodeScore, setNodeScore] = useState(30);
  const [spawning, setSpawning] = useState(false);
  const [nodeTier, setNodeTier] = useState<NodeTier>("minor");
  const [nodeSubtype, setNodeSubtype] = useState("");

  // ── Existing nodes
  const [existingNodes, setExistingNodes] = useState<SpawnedNode[]>([]);
  const [loading, setLoading] = useState(false);

  // ── Route linking
  const [routeNodeA, setRouteNodeA] = useState("");
  const [routeNodeB, setRouteNodeB] = useState("");
  const [routeType, setRouteType] = useState("land_road");
  const [linkingRoute, setLinkingRoute] = useState(false);

  // ── Provinces for assignment
  const [provinces, setProvinces] = useState<{ id: string; name: string }[]>([]);
  const [selectedProvince, setSelectedProvince] = useState("");

  const fetchNodes = useCallback(async () => {
    setLoading(true);
    const [nodesRes, provRes] = await Promise.all([
      supabase.from("province_nodes")
        .select("id, name, hex_q, hex_r, node_type, flow_role, is_major, node_tier, node_subtype")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("provinces")
        .select("id, name")
        .eq("session_id", sessionId),
    ]);
    setExistingNodes((nodesRes.data || []) as SpawnedNode[]);
    setProvinces(provRes.data || []);
    if (provRes.data?.length && !selectedProvince) {
      setSelectedProvince(provRes.data[0].id);
    }
    setLoading(false);
  }, [sessionId, selectedProvince]);

  useEffect(() => { fetchNodes(); }, [fetchNodes]);

  const handleSpawn = async () => {
    setSpawning(true);
    try {
      const isMajor = nodeClass === "major";
      const prod = (nodeTier === "minor" || nodeTier === "micro") && nodeSubtype
        ? computeNodeProduction(nodeTier, nodeSubtype, 1, "plains")
        : null;

      let spawnedResource: string | null = null;
      if (nodeTier === "micro" && nodeSubtype) {
        const microDef = MICRO_NODE_TYPES.find(t => t.key === nodeSubtype);
        if (microDef) spawnedResource = rollStrategicResource(microDef);
      }

      const { data, error } = await supabase.from("province_nodes").insert({
        session_id: sessionId,
        name,
        hex_q: hexQ,
        hex_r: hexR,
        node_type: nodeType,
        node_class: nodeClass,
        node_tier: nodeTier,
        node_subtype: nodeSubtype || null,
        flow_role: flowRole,
        is_major: isMajor,
        is_active: true,
        population,
        node_score: nodeScore,
        province_id: selectedProvince || null,
        production_output: prod ? prod.production : (isMajor ? 5 : 1),
        wealth_output: prod ? (prod.wealth || 0) : (flowRole === "hub" ? 3 : 0),
        food_value: prod ? (prod.supplies || 0) : (nodeType === "resource_node" ? 4 : 1),
        faith_output: prod ? (prod.faith || 0) : 0,
        production_base: prod ? totalProduction(prod) : 0,
        resource_output: prod || {},
        upgrade_level: 1,
        biome_at_build: "plains",
        strategic_resource_type: spawnedResource,
        spawned_strategic_resource: spawnedResource,
        trade_efficiency: flowRole === "hub" ? 1.0 : flowRole === "gateway" ? 0.8 : 0.5,
        connectivity_score: 0,
        supply_relevance: 1,
        isolation_penalty: 0,
        strategic_value: nodeScore * 0.5,
        economic_value: nodeScore * 0.3,
        urbanization_score: 0,
        cumulative_trade_flow: 0,
        fortification_level: nodeType === "fortress" ? 2 : 0,
        collapse_severity: 0,
        controlled_by: null,
      } as any).select("id, name").single();

      if (error) throw error;
      toast.success(`Uzel "${name}" vytvořen na [${hexQ}, ${hexR}]`);
      fetchNodes();
      onRefetch?.();
    } catch (err: any) {
      toast.error("Chyba: " + (err.message || "Neznámá"));
    } finally {
      setSpawning(false);
    }
  };

  const handleDelete = async (nodeId: string) => {
    // Delete related routes first, then the node
    await supabase.from("province_routes")
      .delete()
      .eq("session_id", sessionId)
      .or(`node_a.eq.${nodeId},node_b.eq.${nodeId}`);
    await supabase.from("flow_paths")
      .delete()
      .eq("session_id", sessionId)
      .or(`node_a.eq.${nodeId},node_b.eq.${nodeId}`);
    const { error } = await supabase.from("province_nodes").delete().eq("id", nodeId);
    if (error) {
      toast.error("Nelze smazat: " + error.message);
    } else {
      toast.success("Uzel smazán");
      fetchNodes();
      onRefetch?.();
    }
  };

  const handleLinkRoute = async () => {
    if (!routeNodeA || !routeNodeB || routeNodeA === routeNodeB) {
      toast.error("Vyber dva různé uzly");
      return;
    }
    setLinkingRoute(true);
    try {
      const { error } = await supabase.from("province_routes").insert({
        session_id: sessionId,
        node_a: routeNodeA,
        node_b: routeNodeB,
        route_type: routeType,
        control_state: "open",
        speed_value: 1,
        safety_value: 1,
        capacity_value: 5,
        economic_relevance: 0.5,
        military_relevance: 0.3,
        path_dirty: true,
      });
      if (error) throw error;
      toast.success("Cesta vytvořena");
      fetchNodes();
      onRefetch?.();
    } catch (err: any) {
      toast.error("Chyba: " + err.message);
    } finally {
      setLinkingRoute(false);
    }
  };

  const handleRecomputeFlows = async () => {
    toast.info("Spouštím přepočet toků…");
    const { error } = await supabase.functions.invoke("compute-hex-flows", {
      body: { session_id: sessionId },
    });
    if (error) {
      toast.error("Chyba: " + error.message);
    } else {
      toast.success("Toky přepočteny");
      fetchNodes();
      onRefetch?.();
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Spawn Node */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" /> Spawn Node
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Název" value={name} onChange={e => setName(e.target.value)} className="text-xs h-8" />
            <Select value={selectedProvince} onValueChange={setSelectedProvince}>
              <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Provincie" /></SelectTrigger>
              <SelectContent>
                {provinces.map(p => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="text-[9px] text-muted-foreground">Hex Q</label>
              <Input type="number" value={hexQ} onChange={e => setHexQ(+e.target.value)} className="text-xs h-8" />
            </div>
            <div>
              <label className="text-[9px] text-muted-foreground">Hex R</label>
              <Input type="number" value={hexR} onChange={e => setHexR(+e.target.value)} className="text-xs h-8" />
            </div>
            <div>
              <label className="text-[9px] text-muted-foreground">Populace</label>
              <Input type="number" value={population} onChange={e => setPopulation(+e.target.value)} className="text-xs h-8" />
            </div>
            <div>
              <label className="text-[9px] text-muted-foreground">Score</label>
              <Input type="number" value={nodeScore} onChange={e => setNodeScore(+e.target.value)} className="text-xs h-8" />
            </div>
          </div>

          {/* Tier & Subtype selectors */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] text-muted-foreground">Node Tier</label>
              <Select value={nodeTier} onValueChange={(v) => { setNodeTier(v as NodeTier); setNodeSubtype(""); }}>
                <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="major" className="text-xs">Major</SelectItem>
                  <SelectItem value="minor" className="text-xs">Minor (osada)</SelectItem>
                  <SelectItem value="micro" className="text-xs">Micro (zázemí)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[9px] text-muted-foreground">Subtype</label>
              <Select value={nodeSubtype} onValueChange={setNodeSubtype}>
                <SelectTrigger className="text-xs h-8"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {(nodeTier === "minor" ? MINOR_NODE_TYPES : MICRO_NODE_TYPES).map(t => (
                    <SelectItem key={t.key} value={t.key} className="text-xs">{t.icon} {t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Select value={nodeType} onValueChange={setNodeType}>
              <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {NODE_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={nodeClass} onValueChange={setNodeClass}>
              <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {NODE_CLASSES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={flowRole} onValueChange={setFlowRole}>
              <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FLOW_ROLES.map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Button size="sm" onClick={handleSpawn} disabled={spawning} className="w-full gap-1.5 text-xs">
            {spawning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
            Vytvořit uzel
          </Button>
        </CardContent>
      </Card>

      {/* ── Link Route */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" /> Propojit uzly cestou
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <Select value={routeNodeA} onValueChange={setRouteNodeA}>
              <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Uzel A" /></SelectTrigger>
              <SelectContent>
                {existingNodes.map(n => (
                  <SelectItem key={n.id} value={n.id} className="text-xs">
                    {n.name || `[${n.hex_q},${n.hex_r}]`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={routeNodeB} onValueChange={setRouteNodeB}>
              <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Uzel B" /></SelectTrigger>
              <SelectContent>
                {existingNodes.map(n => (
                  <SelectItem key={n.id} value={n.id} className="text-xs">
                    {n.name || `[${n.hex_q},${n.hex_r}]`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={routeType} onValueChange={setRouteType}>
              <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROUTE_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" variant="secondary" onClick={handleLinkRoute} disabled={linkingRoute} className="w-full gap-1.5 text-xs">
            {linkingRoute ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Route className="h-3.5 w-3.5" />}
            Vytvořit cestu
          </Button>
        </CardContent>
      </Card>

      {/* ── Actions */}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={handleRecomputeFlows} className="gap-1.5 text-xs flex-1">
          <Zap className="h-3.5 w-3.5" /> Přepočítat toky
        </Button>
        <Button size="sm" variant="outline" onClick={fetchNodes} className="gap-1.5 text-xs">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* ── Existing Nodes list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Uzly v session ({existingNodes.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <ScrollArea className="h-[250px]">
              <div className="space-y-1">
                {existingNodes.map(n => {
                  const subDef = n.node_tier === "minor"
                    ? MINOR_NODE_TYPES.find(t => t.key === n.node_subtype)
                    : MICRO_NODE_TYPES.find(t => t.key === n.node_subtype);
                  return (
                    <div key={n.id} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded hover:bg-muted/30 group">
                      <span className="shrink-0">{subDef?.icon || "📍"}</span>
                      <span className="font-mono font-medium truncate">{n.name || "—"}</span>
                      {n.node_tier && <Badge variant="outline" className="text-[8px] h-4 shrink-0">{n.node_tier}</Badge>}
                      <Badge variant="outline" className="text-[8px] h-4 shrink-0">{n.node_type}</Badge>
                      <Badge variant="outline" className="text-[8px] h-4 shrink-0">{n.flow_role}</Badge>
                      <span className="text-[9px] text-muted-foreground ml-auto shrink-0">[{n.hex_q},{n.hex_r}]</span>
                      <Button
                        size="icon" variant="ghost"
                        className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                        onClick={() => handleDelete(n.id)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
                {existingNodes.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">Žádné uzly</p>
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DevNodeSpawner;
