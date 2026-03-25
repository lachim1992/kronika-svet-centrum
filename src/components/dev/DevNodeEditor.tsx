import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Settings2, MapPin, Save, Loader2, RefreshCw, Zap, ChevronDown, ChevronUp,
  Network, Factory, Coins, Wheat, Shield, Church, Activity, Edit3, Calculator,
  Sliders, Building2,
} from "lucide-react";
import {
  BASE_PRODUCTION, ROLE_TRADE_EFFICIENCY, MACRO_LAYER_ICONS,
} from "@/lib/economyFlow";
import {
  ACTIVE_POP_WEIGHTS, DEFAULT_ACTIVE_POP_RATIO, DEFAULT_MAX_MOBILIZATION,
  SETTLEMENT_WEALTH, computeWorkforceBreakdown,
} from "@/lib/economyConstants";

interface Props {
  sessionId: string;
  onRefetch?: () => void;
}

// ── Types
const NODE_TYPES = [
  "primary_city", "secondary_city", "fortress", "port", "trade_hub",
  "resource_node", "village_cluster", "religious_center", "logistic_hub",
];
const NODE_CLASSES = ["major", "minor", "transit"];
const FLOW_ROLES = ["neutral", "regulator", "gateway", "producer", "hub"];

type FullNode = {
  id: string; name: string; hex_q: number; hex_r: number;
  node_type: string; node_class: string; flow_role: string;
  is_major: boolean; is_active: boolean; population: number;
  node_score: number; production_output: number; wealth_output: number;
  food_value: number; faith_output: number; trade_efficiency: number;
  connectivity_score: number; isolation_penalty: number;
  strategic_value: number; economic_value: number; capacity_score: number;
  urbanization_score: number; cumulative_trade_flow: number;
  fortification_level: number; collapse_severity: number;
  infrastructure_level: number; hinterland_level: number;
  development_level: number; growth_rate: number; stability_factor: number;
  supply_relevance: number; toll_rate: number; importance_score: number;
  incoming_production: number; throughput_military: number;
  route_access_factor: number; sacred_influence: number;
  faith_pressure: number; defense_value: number; mobility_relevance: number;
  parent_node_id: string | null; province_id: string; controlled_by: string | null;
  strategic_resource_type: string | null; strategic_resource_tier: number;
};

type CityLever = {
  id: string; name: string; owner_player: string; population_total: number;
  population_peasants: number; population_burghers: number; population_clerics: number;
  birth_rate: number; death_rate: number; city_stability: number;
  ration_policy: string; irrigation_level: number; settlement_level: string;
  legitimacy: number; influence_score: number; development_level: number;
  labor_allocation: any; market_level: number; temple_level: number;
  housing_capacity: number; local_grain_reserve: number;
};

// ── Editable field groups for node editor
const NODE_FIELD_GROUPS = [
  {
    label: "Identita & Klasifikace", icon: MapPin,
    fields: [
      { key: "name", label: "Název", type: "text" },
      { key: "node_type", label: "Typ", type: "select", options: NODE_TYPES },
      { key: "node_class", label: "Třída", type: "select", options: NODE_CLASSES },
      { key: "flow_role", label: "Flow role", type: "select", options: FLOW_ROLES },
      { key: "is_major", label: "Major node", type: "bool" },
      { key: "is_active", label: "Aktivní", type: "bool" },
    ],
  },
  {
    label: "Produkce & Ekonomika", icon: Factory,
    fields: [
      { key: "production_output", label: "Produkce ⚒️", type: "number" },
      { key: "wealth_output", label: "Bohatství 💰", type: "number" },
      { key: "food_value", label: "Jídlo 🌾", type: "number" },
      { key: "faith_output", label: "Víra ⛪", type: "number" },
      { key: "trade_efficiency", label: "Trade efektivita", type: "number", step: 0.1 },
      { key: "toll_rate", label: "Clo (toll)", type: "number", step: 0.01 },
      { key: "cumulative_trade_flow", label: "Kumulativní trade flow", type: "number" },
      { key: "incoming_production", label: "Příchozí produkce", type: "number" },
    ],
  },
  {
    label: "Populace & Růst", icon: Activity,
    fields: [
      { key: "population", label: "Populace", type: "number" },
      { key: "growth_rate", label: "Tempo růstu", type: "number", step: 0.01 },
      { key: "urbanization_score", label: "Urbanizace", type: "number" },
      { key: "development_level", label: "Rozvoj", type: "number" },
      { key: "hinterland_level", label: "Zázemí", type: "number" },
    ],
  },
  {
    label: "Strategická hodnota", icon: Shield,
    fields: [
      { key: "node_score", label: "Node score", type: "number" },
      { key: "strategic_value", label: "Strategická hodnota", type: "number" },
      { key: "economic_value", label: "Ekonomická hodnota", type: "number" },
      { key: "importance_score", label: "Důležitost", type: "number" },
      { key: "capacity_score", label: "Kapacita", type: "number" },
      { key: "defense_value", label: "Obrana", type: "number" },
      { key: "fortification_level", label: "Opevnění", type: "number" },
    ],
  },
  {
    label: "Konektivita & Síť", icon: Network,
    fields: [
      { key: "connectivity_score", label: "Konektivita", type: "number" },
      { key: "isolation_penalty", label: "Izolace (penalta)", type: "number", step: 0.01 },
      { key: "supply_relevance", label: "Zásobovací relevance", type: "number" },
      { key: "route_access_factor", label: "Přístup k cestám", type: "number", step: 0.1 },
      { key: "throughput_military", label: "Vojenský průtok", type: "number" },
      { key: "mobility_relevance", label: "Mobilita", type: "number" },
      { key: "collapse_severity", label: "Kolaps", type: "number" },
      { key: "stability_factor", label: "Stabilita", type: "number", step: 0.01 },
    ],
  },
  {
    label: "Religionistika & Zdroje", icon: Church,
    fields: [
      { key: "sacred_influence", label: "Posvátný vliv", type: "number" },
      { key: "faith_pressure", label: "Tlak víry", type: "number" },
      { key: "infrastructure_level", label: "Infrastruktura", type: "number" },
      { key: "strategic_resource_type", label: "Strat. surovina", type: "text" },
      { key: "strategic_resource_tier", label: "Tier suroviny", type: "number" },
    ],
  },
  {
    label: "Hierarchie", icon: Network,
    fields: [
      { key: "parent_node_id", label: "Parent node ID", type: "text" },
      { key: "controlled_by", label: "Kontroluje", type: "text" },
    ],
  },
];

// ── City field groups
const CITY_FIELD_GROUPS = [
  {
    label: "Populace", icon: Activity,
    fields: [
      { key: "population_total", label: "Celkem", type: "number" },
      { key: "population_peasants", label: "Rolníci", type: "number" },
      { key: "population_burghers", label: "Měšťané", type: "number" },
      { key: "population_clerics", label: "Klerici", type: "number" },
    ],
  },
  {
    label: "Demografie", icon: Activity,
    fields: [
      { key: "birth_rate", label: "Porodnost", type: "number", step: 0.001 },
      { key: "death_rate", label: "Úmrtnost", type: "number", step: 0.001 },
      { key: "housing_capacity", label: "Kapacita bydlení", type: "number" },
    ],
  },
  {
    label: "Ekonomika", icon: Coins,
    fields: [
      { key: "settlement_level", label: "Úroveň osady", type: "select", options: ["HAMLET", "TOWNSHIP", "CITY", "POLIS"] },
      { key: "market_level", label: "Úroveň trhu", type: "number" },
      { key: "irrigation_level", label: "Závlahy", type: "number" },
      { key: "local_grain_reserve", label: "Zásoby obilí", type: "number" },
      { key: "ration_policy", label: "Přídělový režim", type: "select", options: ["generous", "normal", "strict", "famine"] },
    ],
  },
  {
    label: "Stabilita & Vliv", icon: Shield,
    fields: [
      { key: "city_stability", label: "Stabilita", type: "number", step: 0.1 },
      { key: "legitimacy", label: "Legitimita", type: "number" },
      { key: "influence_score", label: "Vliv", type: "number" },
      { key: "development_level", label: "Rozvoj", type: "number" },
      { key: "temple_level", label: "Úroveň chrámu", type: "number" },
    ],
  },
];

// ═══════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════

const DevNodeEditor = ({ sessionId, onRefetch }: Props) => {
  const [nodes, setNodes] = useState<FullNode[]>([]);
  const [cities, setCities] = useState<CityLever[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [editedNode, setEditedNode] = useState<Partial<FullNode>>({});
  const [editedCity, setEditedCity] = useState<Partial<CityLever>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [routes, setRoutes] = useState<any[]>([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [nodesRes, citiesRes, routesRes] = await Promise.all([
      supabase.from("province_nodes")
        .select("*")
        .eq("session_id", sessionId)
        .order("is_major", { ascending: false })
        .order("name")
        .limit(200),
      supabase.from("cities")
        .select("id,name,owner_player,population_total,population_peasants,population_burghers,population_clerics,birth_rate,death_rate,city_stability,ration_policy,irrigation_level,settlement_level,legitimacy,influence_score,development_level,labor_allocation,market_level,temple_level,housing_capacity,local_grain_reserve")
        .eq("session_id", sessionId)
        .order("name"),
      supabase.from("province_routes")
        .select("id,node_a,node_b,route_type,speed_value,capacity_value,safety_value,economic_relevance,military_relevance,control_state,upgrade_level,vulnerability_score,damage_level")
        .eq("session_id", sessionId),
    ]);
    setNodes((nodesRes.data || []) as FullNode[]);
    setCities((citiesRes.data || []) as CityLever[]);
    setRoutes(routesRes.data || []);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Select a node for editing
  const selectNode = (id: string) => {
    const n = nodes.find(n => n.id === id);
    if (!n) return;
    setSelectedNodeId(id);
    setEditedNode({ ...n });
  };

  const selectCity = (id: string) => {
    const c = cities.find(c => c.id === id);
    if (!c) return;
    setSelectedCityId(id);
    setEditedCity({ ...c });
  };

  // ── Update edited field
  const updateNodeField = (key: string, value: any) => {
    setEditedNode(prev => ({ ...prev, [key]: value }));
  };

  const updateCityField = (key: string, value: any) => {
    setEditedCity(prev => ({ ...prev, [key]: value }));
  };

  // ── Save node
  const saveNode = async () => {
    if (!selectedNodeId) return;
    setSaving(true);
    try {
      const { id, ...patch } = editedNode as any;
      // Sync is_major with node_class
      if (patch.node_class === "major") patch.is_major = true;
      else if (patch.node_class === "minor" || patch.node_class === "transit") patch.is_major = false;
      
      const { error } = await supabase.from("province_nodes").update(patch).eq("id", selectedNodeId);
      if (error) throw error;
      toast.success("Uzel uložen");
      fetchAll();
      onRefetch?.();
    } catch (err: any) {
      toast.error("Chyba: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Save city
  const saveCity = async () => {
    if (!selectedCityId) return;
    setSaving(true);
    try {
      const { id, ...patch } = editedCity as any;
      const { error } = await supabase.from("cities").update(patch).eq("id", selectedCityId);
      if (error) throw error;
      toast.success("Město uloženo");
      fetchAll();
      onRefetch?.();
    } catch (err: any) {
      toast.error("Chyba: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev => ({ ...prev, [label]: !prev[label] }));
  };

  // ── Recompute flows
  const handleRecompute = async () => {
    toast.info("Přepočítávám toky…");
    const { error } = await supabase.functions.invoke("compute-hex-flows", {
      body: { session_id: sessionId },
    });
    if (error) toast.error(error.message);
    else { toast.success("Toky přepočteny"); fetchAll(); onRefetch?.(); }
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const selectedCity = cities.find(c => c.id === selectedCityId);

  // ── Node's connected routes
  const nodeRoutes = selectedNodeId
    ? routes.filter(r => r.node_a === selectedNodeId || r.node_b === selectedNodeId)
    : [];

  // ── Node's children
  const nodeChildren = selectedNodeId
    ? nodes.filter(n => n.parent_node_id === selectedNodeId)
    : [];

  // ── Render a field editor
  const renderField = (
    field: { key: string; label: string; type: string; options?: string[]; step?: number },
    value: any,
    onChange: (key: string, val: any) => void,
  ) => {
    if (field.type === "bool") {
      return (
        <div key={field.key} className="flex items-center justify-between py-1">
          <span className="text-xs text-muted-foreground">{field.label}</span>
          <Switch checked={!!value} onCheckedChange={v => onChange(field.key, v)} />
        </div>
      );
    }
    if (field.type === "select" && field.options) {
      return (
        <div key={field.key} className="flex items-center gap-2 py-1">
          <span className="text-xs text-muted-foreground w-28 shrink-0">{field.label}</span>
          <Select value={String(value || "")} onValueChange={v => onChange(field.key, v)}>
            <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {field.options.map(o => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      );
    }
    if (field.type === "number") {
      return (
        <div key={field.key} className="flex items-center gap-2 py-1">
          <span className="text-xs text-muted-foreground w-28 shrink-0">{field.label}</span>
          <Input
            type="number"
            step={field.step || 1}
            value={value ?? 0}
            onChange={e => onChange(field.key, parseFloat(e.target.value) || 0)}
            className="h-7 text-xs flex-1"
          />
        </div>
      );
    }
    return (
      <div key={field.key} className="flex items-center gap-2 py-1">
        <span className="text-xs text-muted-foreground w-28 shrink-0">{field.label}</span>
        <Input
          value={value ?? ""}
          onChange={e => onChange(field.key, e.target.value || null)}
          className="h-7 text-xs flex-1"
        />
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Settings2 className="h-5 w-5 text-primary" />
        <h2 className="font-display text-sm font-bold">Node & Economy Editor</h2>
        <Button size="sm" variant="outline" onClick={fetchAll} className="ml-auto gap-1 text-xs h-7">
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
        <Button size="sm" variant="outline" onClick={handleRecompute} className="gap-1 text-xs h-7">
          <Zap className="h-3 w-3" /> Recompute
        </Button>
      </div>

      <Tabs defaultValue="node-editor" className="w-full">
        <TabsList className="flex flex-wrap w-full h-auto gap-0.5">
          <TabsTrigger value="node-editor" className="text-xs gap-1 py-1.5">
            <Edit3 className="h-3 w-3" /> Node Editor
          </TabsTrigger>
          <TabsTrigger value="city-levers" className="text-xs gap-1 py-1.5">
            <Building2 className="h-3 w-3" /> Per-City Páky
          </TabsTrigger>
          <TabsTrigger value="global-constants" className="text-xs gap-1 py-1.5">
            <Sliders className="h-3 w-3" /> Globální konstanty
          </TabsTrigger>
          <TabsTrigger value="formulas" className="text-xs gap-1 py-1.5">
            <Calculator className="h-3 w-3" /> Vzorce (live)
          </TabsTrigger>
        </TabsList>

        {/* ═══ TAB: Node Editor ═══ */}
        <TabsContent value="node-editor" className="mt-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-3">
            {/* Node list */}
            <Card>
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-xs">Uzly ({nodes.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="space-y-0.5 p-2">
                    {loading ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                    ) : nodes.map(n => (
                      <button
                        key={n.id}
                        onClick={() => selectNode(n.id)}
                        className={`w-full text-left flex items-center gap-1.5 text-xs py-1.5 px-2 rounded transition-colors ${
                          selectedNodeId === n.id ? "bg-primary/10 text-primary" : "hover:bg-muted/40"
                        }`}
                      >
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate font-medium">{n.name || "—"}</span>
                        <Badge variant="outline" className="text-[7px] h-3.5 shrink-0 ml-auto">
                          {n.is_major ? "M" : "m"}
                        </Badge>
                        <Badge variant="outline" className="text-[7px] h-3.5 shrink-0">
                          {n.flow_role}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Node detail editor */}
            <div className="space-y-2">
              {selectedNode ? (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-bold truncate">{(editedNode as any).name || selectedNode.name}</h3>
                    <Badge variant="outline" className="text-[8px]">[{selectedNode.hex_q},{selectedNode.hex_r}]</Badge>
                    <Button size="sm" onClick={saveNode} disabled={saving} className="ml-auto gap-1 text-xs h-7">
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      Uložit
                    </Button>
                  </div>

                  <ScrollArea className="h-[460px]">
                    <div className="space-y-1 pr-3">
                      {NODE_FIELD_GROUPS.map(group => {
                        const expanded = expandedGroups[group.label] !== false;
                        const Icon = group.icon;
                        return (
                          <div key={group.label} className="border rounded-lg overflow-hidden">
                            <button
                              onClick={() => toggleGroup(group.label)}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-muted/30 hover:bg-muted/50 transition-colors"
                            >
                              <Icon className="h-3 w-3 text-primary" />
                              {group.label}
                              {expanded ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
                            </button>
                            {expanded && (
                              <div className="px-3 py-1">
                                {group.fields.map(f =>
                                  renderField(f, (editedNode as any)[f.key], updateNodeField)
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Connected routes */}
                      {nodeRoutes.length > 0 && (
                        <div className="border rounded-lg p-3 mt-2">
                          <p className="text-xs font-medium mb-1">Propojené cesty ({nodeRoutes.length})</p>
                          {nodeRoutes.map(r => {
                            const otherNodeId = r.node_a === selectedNodeId ? r.node_b : r.node_a;
                            const otherNode = nodes.find(n => n.id === otherNodeId);
                            return (
                              <div key={r.id} className="flex items-center gap-1.5 text-[10px] py-0.5">
                                <span className="text-muted-foreground">→</span>
                                <span className="font-mono">{otherNode?.name || "?"}</span>
                                <Badge variant="outline" className="text-[7px] h-3.5">{r.route_type}</Badge>
                                <span className="text-muted-foreground ml-auto">cap:{r.capacity_value} spd:{r.speed_value}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Children nodes */}
                      {nodeChildren.length > 0 && (
                        <div className="border rounded-lg p-3 mt-1">
                          <p className="text-xs font-medium mb-1">Podřízené uzly ({nodeChildren.length})</p>
                          {nodeChildren.map(ch => (
                            <button
                              key={ch.id}
                              onClick={() => selectNode(ch.id)}
                              className="flex items-center gap-1.5 text-[10px] py-0.5 hover:text-primary w-full text-left"
                            >
                              <span className="text-muted-foreground">└</span>
                              <span className="font-mono">{ch.name}</span>
                              <Badge variant="outline" className="text-[7px] h-3.5">{ch.node_type}</Badge>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-xs text-muted-foreground">
                  ← Vyber uzel ze seznamu
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ═══ TAB: Per-City Levers ═══ */}
        <TabsContent value="city-levers" className="mt-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-3">
            <Card>
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-xs">Města ({cities.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  <div className="space-y-0.5 p-2">
                    {cities.map(c => (
                      <button
                        key={c.id}
                        onClick={() => selectCity(c.id)}
                        className={`w-full text-left flex items-center gap-1.5 text-xs py-1.5 px-2 rounded transition-colors ${
                          selectedCityId === c.id ? "bg-primary/10 text-primary" : "hover:bg-muted/40"
                        }`}
                      >
                        <Building2 className="h-3 w-3 shrink-0" />
                        <span className="truncate font-medium">{c.name}</span>
                        <span className="text-[9px] text-muted-foreground ml-auto">{c.population_total}</span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <div className="space-y-2">
              {selectedCity ? (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-bold">{selectedCity.name}</h3>
                    <Badge variant="outline" className="text-[8px]">{selectedCity.settlement_level}</Badge>
                    <Button size="sm" onClick={saveCity} disabled={saving} className="ml-auto gap-1 text-xs h-7">
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      Uložit
                    </Button>
                  </div>
                  <ScrollArea className="h-[460px]">
                    <div className="space-y-1 pr-3">
                      {CITY_FIELD_GROUPS.map(group => {
                        const expanded = expandedGroups["city_" + group.label] !== false;
                        const Icon = group.icon;
                        return (
                          <div key={group.label} className="border rounded-lg overflow-hidden">
                            <button
                              onClick={() => toggleGroup("city_" + group.label)}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-muted/30 hover:bg-muted/50 transition-colors"
                            >
                              <Icon className="h-3 w-3 text-primary" />
                              {group.label}
                              {expanded ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
                            </button>
                            {expanded && (
                              <div className="px-3 py-1">
                                {group.fields.map(f =>
                                  renderField(f as any, (editedCity as any)[f.key], updateCityField)
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-xs text-muted-foreground">
                  ← Vyber město ze seznamu
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ═══ TAB: Global Constants ═══ */}
        <TabsContent value="global-constants" className="mt-3 space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sliders className="h-4 w-4 text-primary" /> Produkce podle typu uzlu (BASE_PRODUCTION)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
                {Object.entries(BASE_PRODUCTION).map(([type, val]) => (
                  <div key={type} className="flex items-center justify-between py-1 border-b border-border/30">
                    <span className="text-xs font-mono">{type}</span>
                    <Badge variant="secondary" className="text-xs font-mono">{val}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Coins className="h-4 w-4 text-primary" /> Trade efektivita podle role (ROLE_TRADE_EFFICIENCY)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
                {Object.entries(ROLE_TRADE_EFFICIENCY).map(([role, eff]) => (
                  <div key={role} className="flex items-center justify-between py-1 border-b border-border/30">
                    <span className="text-xs font-mono">{role}</span>
                    <Badge variant="secondary" className="text-xs font-mono">{eff}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" /> Workforce systém
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {Object.entries(ACTIVE_POP_WEIGHTS).map(([layer, w]) => (
                  <div key={layer} className="flex items-center justify-between py-1 border-b border-border/30">
                    <span className="text-xs">Váha: <span className="font-mono">{layer}</span></span>
                    <Badge variant="secondary" className="text-xs font-mono">{w}</Badge>
                  </div>
                ))}
                <div className="flex items-center justify-between py-1 border-b border-border/30">
                  <span className="text-xs">Aktivní pop ratio</span>
                  <Badge variant="secondary" className="text-xs font-mono">{DEFAULT_ACTIVE_POP_RATIO}</Badge>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-border/30">
                  <span className="text-xs">Max mobilizace</span>
                  <Badge variant="secondary" className="text-xs font-mono">{DEFAULT_MAX_MOBILIZATION}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Coins className="h-4 w-4 text-primary" /> Wealth podle settlement tier
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {Object.entries(SETTLEMENT_WEALTH).map(([tier, val]) => (
                  <div key={tier} className="flex items-center justify-between py-1 border-b border-border/30">
                    <span className="text-xs font-mono">{tier}</span>
                    <Badge variant="secondary" className="text-xs font-mono">{val}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <p className="text-[10px] text-muted-foreground italic">
            ℹ️ Globální konstanty jsou definované v kódu (economyFlow.ts, economyConstants.ts). Pro změnu je třeba upravit zdrojový kód.
            Per-node overrides můžeš nastavit přímo v Node Editoru.
          </p>
        </TabsContent>

        {/* ═══ TAB: Formulas (live) ═══ */}
        <TabsContent value="formulas" className="mt-3 space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calculator className="h-4 w-4 text-primary" /> Výpočetní vzorce — Live hodnoty
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Production formula */}
              <div className="border rounded-lg p-3 bg-muted/20">
                <p className="text-xs font-bold mb-1">⚒️ Produkce uzlu</p>
                <code className="text-[10px] text-muted-foreground block">
                  production_output = BASE_PRODUCTION[node_type] × (1 + hinterland_level × 0.1) × stability_factor
                </code>
                <Separator className="my-2" />
                <p className="text-[10px] text-muted-foreground">
                  Základní hodnota je určena typem uzlu. Zázemí (hinterland) a stabilita ji škálují.
                  Minor uzly posílají produkci do parent_node_id (major).
                </p>
              </div>

              <div className="border rounded-lg p-3 bg-muted/20">
                <p className="text-xs font-bold mb-1">💰 Wealth (obchodní tok)</p>
                <code className="text-[10px] text-muted-foreground block">
                  wealth = Σ(incoming_production × ROLE_TRADE_EFFICIENCY[flow_role]) × (1 - toll_rate)
                </code>
                <Separator className="my-2" />
                <p className="text-[10px] text-muted-foreground">
                  Bohatství vzniká průchodem produkce přes uzly. Hub = 1.0×, Gateway = 0.8×, Regulator = 0.6×.
                  Clo (toll_rate) snižuje procházející tok ale generuje příjem kontrolujícímu hráči.
                </p>
              </div>

              <div className="border rounded-lg p-3 bg-muted/20">
                <p className="text-xs font-bold mb-1">🌾 Spotřeba obilí</p>
                <code className="text-[10px] text-muted-foreground block">
                  grain_consumption = population_total × 0.006 × ration_modifier
                </code>
                <code className="text-[10px] text-muted-foreground block mt-1">
                  ration_modifier: generous=1.3 | normal=1.0 | strict=0.7 | famine=0.4
                </code>
                <Separator className="my-2" />
                <p className="text-[10px] text-muted-foreground">
                  Každý obyvatel spotřebuje 0.006 obilí/kolo. Přídělový režim modifikuje spotřebu.
                  Přebytek plní local_grain_reserve, deficit spouští hladomor.
                </p>
              </div>

              <div className="border rounded-lg p-3 bg-muted/20">
                <p className="text-xs font-bold mb-1">👷 Workforce</p>
                <code className="text-[10px] text-muted-foreground block">
                  active_pop = (peasants×1.0 + burghers×0.7 + clerics×0.2) × {DEFAULT_ACTIVE_POP_RATIO}
                </code>
                <code className="text-[10px] text-muted-foreground block mt-1">
                  workforce = active_pop × (1 - mobilization_rate)
                </code>
                <code className="text-[10px] text-muted-foreground block mt-1">
                  over_mob_penalty = max(0, mob_rate - {DEFAULT_MAX_MOBILIZATION}) × 2
                </code>
              </div>

              <div className="border rounded-lg p-3 bg-muted/20">
                <p className="text-xs font-bold mb-1">🔗 Izolace uzlu</p>
                <code className="text-[10px] text-muted-foreground block">
                  isolation = 1 - min(1, connectivity_score / max_expected_connectivity)
                </code>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Izolované uzly trpí penaltou na produkci a obchod. Stavba cest/mostů snižuje izolaci.
                </p>
              </div>

              <div className="border rounded-lg p-3 bg-muted/20">
                <p className="text-xs font-bold mb-1">🏛️ Wealth z města</p>
                <code className="text-[10px] text-muted-foreground block">
                  city_wealth = SETTLEMENT_WEALTH[level] + ⌊pop/500⌋ + ⌊burghers/200⌋
                </code>
              </div>

              <div className="border rounded-lg p-3 bg-muted/20">
                <p className="text-xs font-bold mb-1">🗡️ Vojenská údržba</p>
                <code className="text-[10px] text-muted-foreground block">
                  gold_upkeep = ⌈total_manpower / 100⌉
                </code>
                <code className="text-[10px] text-muted-foreground block mt-1">
                  food_upkeep = ⌈total_manpower / 500⌉
                </code>
              </div>

              {/* Live breakdown for selected node */}
              {selectedNode && (
                <div className="border-2 border-primary/30 rounded-lg p-3">
                  <p className="text-xs font-bold mb-2">📊 Live breakdown: {selectedNode.name}</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                    <div className="flex justify-between">
                      <span>Base production ({selectedNode.node_type})</span>
                      <span className="font-mono">{BASE_PRODUCTION[selectedNode.node_type] ?? "?"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Actual production_output</span>
                      <span className="font-mono font-bold">{selectedNode.production_output}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Trade efficiency (role: {selectedNode.flow_role})</span>
                      <span className="font-mono">{ROLE_TRADE_EFFICIENCY[selectedNode.flow_role] ?? "?"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Actual trade_efficiency</span>
                      <span className="font-mono font-bold">{selectedNode.trade_efficiency}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Wealth output</span>
                      <span className="font-mono font-bold">{selectedNode.wealth_output}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Food value</span>
                      <span className="font-mono font-bold">{selectedNode.food_value}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Isolation penalty</span>
                      <span className="font-mono">{selectedNode.isolation_penalty}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Connectivity</span>
                      <span className="font-mono">{selectedNode.connectivity_score}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Incoming production</span>
                      <span className="font-mono">{selectedNode.incoming_production}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cumulative trade flow</span>
                      <span className="font-mono">{selectedNode.cumulative_trade_flow}</span>
                    </div>
                    <div className="flex justify-between col-span-2 border-t border-border/30 pt-1 mt-1">
                      <span className="font-medium">Δ Produkce vs Base</span>
                      <span className="font-mono font-bold">
                        {selectedNode.production_output - (BASE_PRODUCTION[selectedNode.node_type] ?? 0) >= 0 ? "+" : ""}
                        {selectedNode.production_output - (BASE_PRODUCTION[selectedNode.node_type] ?? 0)}
                      </span>
                    </div>
                    <div className="flex justify-between col-span-2">
                      <span className="font-medium">Δ Trade eff. vs Role default</span>
                      <span className="font-mono font-bold">
                        {(selectedNode.trade_efficiency - (ROLE_TRADE_EFFICIENCY[selectedNode.flow_role] ?? 0)).toFixed(2) as any >= 0 ? "+" : ""}
                        {(selectedNode.trade_efficiency - (ROLE_TRADE_EFFICIENCY[selectedNode.flow_role] ?? 0)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DevNodeEditor;
