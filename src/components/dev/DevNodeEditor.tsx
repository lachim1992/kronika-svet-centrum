import { useState, useEffect, useCallback, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Settings2, MapPin, Save, Loader2, RefreshCw, Zap, ChevronDown, ChevronUp,
  Network, Factory, Coins, Wheat, Shield, Church, Activity, Edit3, Calculator,
  Sliders, Building2, Info, Package,
} from "lucide-react";
import {
  BASE_PRODUCTION, ROLE_TRADE_EFFICIENCY, MACRO_LAYER_ICONS,
} from "@/lib/economyFlow";
import {
  ACTIVE_POP_WEIGHTS, DEFAULT_ACTIVE_POP_RATIO, DEFAULT_MAX_MOBILIZATION,
  SETTLEMENT_WEALTH, computeWorkforceBreakdown,
} from "@/lib/economyConstants";
import {
  NODE_CAPABILITY_MAP, CAPABILITY_TAGS, DEMAND_BASKETS,
  GUILD_PROGRESSION, TRADE_IDEOLOGIES,
  type ProductionRole,
} from "@/lib/goodsCatalog";
import {
  computeNodeProduction, MINOR_NODE_TYPES, MICRO_NODE_TYPES, MAJOR_NODE_TYPES,
  NODE_TIER_LABELS, type NodeTier,
} from "@/lib/nodeTypes";

interface Props {
  sessionId: string;
  onRefetch?: () => void;
}

// ── Unified node type list: major types + all subtypes from NODE_CAPABILITY_MAP
const ALL_SUBTYPES = Object.keys(NODE_CAPABILITY_MAP);
const MAJOR_DB_TYPES = ["primary_city", "secondary_city", "fortress", "port", "trade_hub",
  "resource_node", "village_cluster", "religious_center", "logistic_hub"];
const UNIFIED_NODE_TYPES = [...new Set([...MAJOR_DB_TYPES, ...ALL_SUBTYPES])];

const NODE_TIERS: NodeTier[] = ["major", "minor", "micro"];
const FLOW_ROLES = ["neutral", "regulator", "gateway", "producer", "hub"];

type FullNode = {
  id: string; name: string; label: string | null; hex_q: number; hex_r: number;
  node_type: string; node_class: string; flow_role: string;
  node_subtype: string | null; node_tier: string | null;
  capability_tags: string[] | null; guild_level: number;
  specialization_scores: any; city_id: string | null;
  spawned_strategic_resource: string | null;
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
  upgrade_level: number;
  biome: string | null;
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

// ── Computed badge
const ComputedBadge = () => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="text-[7px] h-3.5 bg-muted/50 text-muted-foreground border-dashed cursor-help">
          v4.1
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-[200px] text-xs">
        Tato hodnota je přepisována enginem z node_subtype + capability_tags.
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

// ── Editable field groups for node editor
const NODE_FIELD_GROUPS = [
  {
    label: "Identita & Klasifikace", icon: MapPin,
    fields: [
      { key: "name", label: "Název", type: "text" },
      { key: "label", label: "Label (zobrazovaný)", type: "text" },
      { key: "node_type", label: "Typ (legacy)", type: "select", options: UNIFIED_NODE_TYPES },
      { key: "node_subtype", label: "Subtyp (v4.1)", type: "select", options: ALL_SUBTYPES },
      { key: "node_tier", label: "Tier", type: "select", options: NODE_TIERS as string[] },
      { key: "node_class", label: "Třída (legacy)", type: "select", options: ["major", "minor", "transit"] },
      { key: "flow_role", label: "Flow role", type: "select", options: FLOW_ROLES },
      { key: "is_major", label: "Major node", type: "bool" },
      { key: "is_active", label: "Aktivní", type: "bool" },
      { key: "city_id", label: "City ID (vazba)", type: "text", readonly: true },
    ],
  },
  {
    label: "Goods & Cechy (v4.1)", icon: Package,
    fields: [
      { key: "guild_level", label: "Guild level (0–5)", type: "number" },
      { key: "spawned_strategic_resource", label: "Spawned surovina", type: "text" },
    ],
  },
  {
    label: "Produkce & Ekonomika", icon: Factory,
    fields: [
      { key: "production_output", label: "Produkce ⚒️", type: "number", computed: true },
      { key: "wealth_output", label: "Bohatství 💰", type: "number", computed: true },
      { key: "food_value", label: "Jídlo 🌾", type: "number", computed: true },
      { key: "faith_output", label: "Víra ⛪", type: "number", computed: true },
      { key: "trade_efficiency", label: "Trade efektivita", type: "number", step: 0.1, computed: true },
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
      { key: "upgrade_level", label: "Upgrade level", type: "number" },
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
      { key: "strategic_resource_type", label: "Strat. surovina (legacy)", type: "text" },
      { key: "strategic_resource_tier", label: "Tier suroviny (legacy)", type: "number" },
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
  const [nodeInventory, setNodeInventory] = useState<any[]>([]);

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

  // Fetch inventory when node selected
  useEffect(() => {
    if (!selectedNodeId) { setNodeInventory([]); return; }
    supabase.from("node_inventory")
      .select("good_key, quantity, quality")
      .eq("node_id", selectedNodeId)
      .then(({ data }) => setNodeInventory(data || []));
  }, [selectedNodeId]);

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

  const updateNodeField = (key: string, value: any) => {
    setEditedNode(prev => {
      const next = { ...prev, [key]: value };
      // Auto-sync capability_tags when subtype changes
      if (key === "node_subtype" && value && NODE_CAPABILITY_MAP[value]) {
        next.capability_tags = NODE_CAPABILITY_MAP[value].tags;
      }
      return next;
    });
  };

  const updateCityField = (key: string, value: any) => {
    setEditedCity(prev => ({ ...prev, [key]: value }));
  };

  const toggleCapabilityTag = (tag: string) => {
    setEditedNode(prev => {
      const current = prev.capability_tags || [];
      const next = current.includes(tag)
        ? current.filter(t => t !== tag)
        : [...current, tag];
      return { ...prev, capability_tags: next };
    });
  };

  const saveNode = async () => {
    if (!selectedNodeId) return;
    setSaving(true);
    try {
      const { id, biome, ...patch } = editedNode as any;
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

  const nodeRoutes = selectedNodeId
    ? routes.filter(r => r.node_a === selectedNodeId || r.node_b === selectedNodeId)
    : [];

  const nodeChildren = selectedNodeId
    ? nodes.filter(n => n.parent_node_id === selectedNodeId)
    : [];

  // v4.1 live production preview
  const liveProduction = useMemo(() => {
    if (!selectedNode) return null;
    const tier = (editedNode.node_tier || selectedNode.node_tier || "minor") as NodeTier;
    const subtype = editedNode.node_subtype || selectedNode.node_subtype || selectedNode.node_type;
    const upgrade = (editedNode as any).upgrade_level ?? (selectedNode as any).upgrade_level ?? 1;
    const biome = (selectedNode as any).biome || "";
    return computeNodeProduction(tier, subtype, upgrade, biome);
  }, [selectedNode, editedNode]);

  // Subtype role info
  const subtypeInfo = useMemo(() => {
    const st = (editedNode.node_subtype || selectedNode?.node_subtype) as string | undefined;
    if (!st || !NODE_CAPABILITY_MAP[st]) return null;
    return NODE_CAPABILITY_MAP[st];
  }, [editedNode.node_subtype, selectedNode?.node_subtype]);

  // ── Render a field editor
  const renderField = (
    field: { key: string; label: string; type: string; options?: string[]; step?: number; computed?: boolean; readonly?: boolean },
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
          <span className="text-xs text-muted-foreground w-32 shrink-0 flex items-center gap-1">
            {field.label}
            {field.computed && <ComputedBadge />}
          </span>
          <Select value={String(value || "")} onValueChange={v => onChange(field.key, v)} disabled={field.readonly}>
            <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {field.options.map(o => (
                <SelectItem key={o} value={o} className="text-xs">
                  {NODE_CAPABILITY_MAP[o] ? `${o} (${NODE_CAPABILITY_MAP[o].role})` : o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }
    if (field.type === "number") {
      return (
        <div key={field.key} className="flex items-center gap-2 py-1">
          <span className={`text-xs w-32 shrink-0 flex items-center gap-1 ${field.computed ? "text-muted-foreground/60" : "text-muted-foreground"}`}>
            {field.label}
            {field.computed && <ComputedBadge />}
          </span>
          <Input
            type="number"
            step={field.step || 1}
            value={value ?? 0}
            onChange={e => onChange(field.key, parseFloat(e.target.value) || 0)}
            className={`h-7 text-xs flex-1 ${field.computed ? "opacity-60" : ""}`}
          />
        </div>
      );
    }
    // text
    return (
      <div key={field.key} className="flex items-center gap-2 py-1">
        <span className="text-xs text-muted-foreground w-32 shrink-0">{field.label}</span>
        <Input
          value={value ?? ""}
          onChange={e => onChange(field.key, e.target.value || null)}
          className="h-7 text-xs flex-1"
          readOnly={field.readonly}
        />
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Settings2 className="h-5 w-5 text-primary" />
        <h2 className="font-display text-sm font-bold">Node & Economy Editor</h2>
        <Badge variant="outline" className="text-[8px]">v4.1</Badge>
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
                          {n.node_tier || (n.is_major ? "M" : "m")}
                        </Badge>
                        {n.node_subtype && (
                          <Badge variant="secondary" className="text-[7px] h-3.5 shrink-0">
                            {n.node_subtype}
                          </Badge>
                        )}
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
                    {subtypeInfo && (
                      <Badge variant="secondary" className="text-[8px]">
                        {subtypeInfo.role}
                      </Badge>
                    )}
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
                                {/* Capability tags multi-select in Identity group */}
                                {group.label === "Identita & Klasifikace" && (
                                  <div className="py-2 border-t border-border/30 mt-1">
                                    <p className="text-xs font-medium mb-1.5">Capability tags</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {Object.entries(CAPABILITY_TAGS).map(([tag, def]) => {
                                        const checked = (editedNode.capability_tags || []).includes(tag);
                                        return (
                                          <label key={tag} className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${
                                            checked ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted/20 border-border/30 text-muted-foreground"
                                          }`}>
                                            <Checkbox
                                              checked={checked}
                                              onCheckedChange={() => toggleCapabilityTag(tag)}
                                              className="h-3 w-3"
                                            />
                                            <span>{def.icon} {tag}</span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                                {/* Specialization scores JSON in Goods group */}
                                {group.label === "Goods & Cechy (v4.1)" && (
                                  <div className="py-2 border-t border-border/30 mt-1 space-y-2">
                                    <p className="text-xs font-medium">Specialization scores</p>
                                    <textarea
                                      className="w-full h-20 text-[10px] font-mono bg-muted/20 rounded p-2 border border-border/30"
                                      value={JSON.stringify(editedNode.specialization_scores || {}, null, 2)}
                                      onChange={e => {
                                        try {
                                          const val = JSON.parse(e.target.value);
                                          updateNodeField("specialization_scores", val);
                                        } catch {}
                                      }}
                                    />
                                    {/* Node inventory readonly */}
                                    {nodeInventory.length > 0 && (
                                      <div>
                                        <p className="text-xs font-medium mb-1">📦 Node Inventory (readonly)</p>
                                        <div className="grid grid-cols-3 gap-1">
                                          {nodeInventory.map((inv, i) => (
                                            <div key={i} className="text-[10px] bg-muted/20 rounded px-1.5 py-0.5 flex justify-between">
                                              <span>{inv.good_key}</span>
                                              <span className="font-mono">{inv.quantity} (Q{inv.quality})</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {/* v4.1 production preview in Production group */}
                                {group.label === "Produkce & Ekonomika" && liveProduction && (
                                  <div className="py-2 border-t border-primary/20 mt-1 bg-primary/5 rounded px-2">
                                    <p className="text-[10px] font-medium mb-1 flex items-center gap-1">
                                      <Info className="h-3 w-3" /> v4.1 computed preview (subtype: {editedNode.node_subtype || selectedNode.node_subtype || "—"})
                                    </p>
                                    <div className="grid grid-cols-4 gap-2 text-[10px]">
                                      <div>⚒️ {liveProduction.production}</div>
                                      <div>🌾 {liveProduction.supplies}</div>
                                      <div>💰 {liveProduction.wealth}</div>
                                      <div>⛪ {liveProduction.faith}</div>
                                    </div>
                                  </div>
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
                              <Badge variant="outline" className="text-[7px] h-3.5">{ch.node_subtype || ch.node_type}</Badge>
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
          {/* Legacy constants */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sliders className="h-4 w-4 text-primary" /> BASE_PRODUCTION (legacy)
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

          {/* v4.1 Capability Tags */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" /> CAPABILITY_TAGS (v4.1)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(CAPABILITY_TAGS).map(([key, def]) => (
                  <div key={key} className="flex items-center gap-1.5 py-1 border-b border-border/30">
                    <span className="text-sm">{def.icon}</span>
                    <span className="text-xs font-mono">{key}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{def.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* v4.1 NODE_CAPABILITY_MAP */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Network className="h-4 w-4 text-primary" /> NODE_CAPABILITY_MAP (v4.1)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
                {Object.entries(NODE_CAPABILITY_MAP).map(([subtype, def]) => (
                  <div key={subtype} className="flex items-center gap-1.5 py-1 border-b border-border/30">
                    <Badge variant="outline" className="text-[8px] h-4 w-14 justify-center">{def.role}</Badge>
                    <span className="text-xs font-mono">{subtype}</span>
                    <div className="flex gap-0.5 ml-auto">
                      {def.tags.map(t => (
                        <span key={t} className="text-[8px] bg-muted/40 px-1 rounded">{CAPABILITY_TAGS[t]?.icon || "?"}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* v4.1 Demand Baskets */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Wheat className="h-4 w-4 text-primary" /> DEMAND_BASKETS (v4.1)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {DEMAND_BASKETS.map(b => (
                  <div key={b.key} className="flex items-center gap-2 py-1 border-b border-border/30">
                    <span className="text-sm">{b.icon}</span>
                    <span className="text-xs font-mono w-28">{b.key}</span>
                    <Badge variant="outline" className="text-[8px]">T{b.tier}</Badge>
                    <span className="text-[10px] text-muted-foreground ml-auto">{b.description}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Legacy constants */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Coins className="h-4 w-4 text-primary" /> ROLE_TRADE_EFFICIENCY & Workforce
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
                {Object.entries(ROLE_TRADE_EFFICIENCY).map(([role, eff]) => (
                  <div key={role} className="flex items-center justify-between py-1 border-b border-border/30">
                    <span className="text-xs font-mono">{role}</span>
                    <Badge variant="secondary" className="text-xs font-mono">{eff}</Badge>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {Object.entries(ACTIVE_POP_WEIGHTS).map(([layer, w]) => (
                  <div key={layer} className="flex items-center justify-between py-1 border-b border-border/30">
                    <span className="text-xs">Váha: <span className="font-mono">{layer}</span></span>
                    <Badge variant="secondary" className="text-xs font-mono">{w}</Badge>
                  </div>
                ))}
                <div className="flex items-center justify-between py-1 border-b border-border/30">
                  <span className="text-xs">Max mobilizace</span>
                  <Badge variant="secondary" className="text-xs font-mono">{DEFAULT_MAX_MOBILIZATION}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Guild progression */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                ⚜️ Guild Progression (v4.1)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {GUILD_PROGRESSION.map(g => (
                  <div key={g.level} className="flex items-center gap-2 py-1 border-b border-border/30 text-[10px]">
                    <Badge variant="outline" className="text-[8px]">Lv{g.level}</Badge>
                    <span>Q+{g.qualityBoost}</span>
                    <span>Fame:{(g.famousGoodChance * 100).toFixed(0)}%</span>
                    <span>Export:{(g.exportReach * 100).toFixed(0)}%</span>
                    <span className="ml-auto text-muted-foreground">{g.politicalWeight}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <p className="text-[10px] text-muted-foreground italic">
            ℹ️ Konstanty z goodsCatalog.ts, nodeTypes.ts, economyFlow.ts, economyConstants.ts. Legacy hodnoty jsou přepisovány v4.1 enginem.
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
              {/* v4.1 Production formula */}
              <div className="border-2 border-primary/30 rounded-lg p-3 bg-primary/5">
                <p className="text-xs font-bold mb-1">⚒️ Produkce uzlu (v4.1)</p>
                <code className="text-[10px] text-muted-foreground block">
                  production = BASE[node_subtype] × biomeMult × (1 + (upgrade-1) × upgradeBonus)
                </code>
                <code className="text-[10px] text-muted-foreground block mt-1">
                  biomeMult = biome ∈ preferredBiomes ? 1.0 : 0.6
                </code>
                <Separator className="my-2" />
                <p className="text-[10px] text-muted-foreground">
                  v4.1: produkce je odvozena z node_subtype (klíč do MINOR/MICRO_NODE_TYPES), nikoliv z přímého production_output.
                  Legacy pole production_output/wealth_output jsou přepisována enginem.
                </p>
              </div>

              <div className="border rounded-lg p-3 bg-muted/20">
                <p className="text-xs font-bold mb-1">🏭 Goods Chain (v4.1)</p>
                <code className="text-[10px] text-muted-foreground block">
                  source → raw_good → processing_node → processed_good → urban_node → final_good
                </code>
                <code className="text-[10px] text-muted-foreground block mt-1">
                  capability_tags → matchuje recipe.required_capability
                </code>
                <Separator className="my-2" />
                <p className="text-[10px] text-muted-foreground">
                  Recepty se nevážou na subtypy budov, ale na schopnosti uzlu (capability_tags).
                  Uzel s tagem "baking" může péct chléb bez ohledu na svůj subtype.
                </p>
              </div>

              <div className="border rounded-lg p-3 bg-muted/20">
                <p className="text-xs font-bold mb-1">⚜️ Guild Quality (v4.1)</p>
                <code className="text-[10px] text-muted-foreground block">
                  quality = base_quality + GUILD_PROGRESSION[guild_level].qualityBoost
                </code>
                <code className="text-[10px] text-muted-foreground block mt-1">
                  famous_chance = GUILD_PROGRESSION[guild_level].famousGoodChance
                </code>
              </div>

              <div className="border rounded-lg p-3 bg-muted/20">
                <p className="text-xs font-bold mb-1">📊 Demand Satisfaction (v4.1)</p>
                <code className="text-[10px] text-muted-foreground block">
                  basket_satisfaction = supply_volume / demand_volume (per basket)
                </code>
                <code className="text-[10px] text-muted-foreground block mt-1">
                  demand = Σ(pop_class × socialWeight[class]) per basket
                </code>
              </div>

              <div className="border rounded-lg p-3 bg-muted/20">
                <p className="text-xs font-bold mb-1">💰 Wealth (v4.1 fiscal)</p>
                <code className="text-[10px] text-muted-foreground block">
                  wealth = pop_tax + market_tax + transit_toll + extraction + commercial_capture
                </code>
                <code className="text-[10px] text-muted-foreground block mt-1">
                  trade_ideology modifikuje: merchantFlowMult, tariffBase, guildPower
                </code>
              </div>

              <div className="border rounded-lg p-3 bg-muted/20">
                <p className="text-xs font-bold mb-1">👷 Workforce (legacy)</p>
                <code className="text-[10px] text-muted-foreground block">
                  active_pop = (peasants×1.0 + burghers×0.7 + clerics×0.2) × {DEFAULT_ACTIVE_POP_RATIO}
                </code>
                <code className="text-[10px] text-muted-foreground block mt-1">
                  workforce = active_pop × (1 - mobilization_rate)
                </code>
              </div>

              {/* Live breakdown for selected node */}
              {selectedNode && liveProduction && (
                <div className="border-2 border-primary/30 rounded-lg p-3">
                  <p className="text-xs font-bold mb-2">📊 Live breakdown: {selectedNode.name}</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                    <div className="col-span-2 mb-1">
                      <p className="text-[9px] text-muted-foreground">
                        subtype: {selectedNode.node_subtype || "—"} | tier: {selectedNode.node_tier || "—"} | 
                        guild: {selectedNode.guild_level || 0} | tags: [{(selectedNode.capability_tags || []).join(", ")}]
                      </p>
                    </div>
                    <div className="flex justify-between">
                      <span>v4.1 computed ⚒️</span>
                      <span className="font-mono text-primary">{liveProduction.production}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>DB production_output</span>
                      <span className="font-mono">{selectedNode.production_output}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>v4.1 computed 🌾</span>
                      <span className="font-mono text-primary">{liveProduction.supplies}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>DB food_value</span>
                      <span className="font-mono">{selectedNode.food_value}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>v4.1 computed 💰</span>
                      <span className="font-mono text-primary">{liveProduction.wealth}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>DB wealth_output</span>
                      <span className="font-mono">{selectedNode.wealth_output}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>v4.1 computed ⛪</span>
                      <span className="font-mono text-primary">{liveProduction.faith}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>DB faith_output</span>
                      <span className="font-mono">{selectedNode.faith_output}</span>
                    </div>
                    <div className="flex justify-between col-span-2 border-t border-border/30 pt-1 mt-1">
                      <span>Trade efficiency (role: {selectedNode.flow_role})</span>
                      <span className="font-mono">{selectedNode.trade_efficiency} (base: {ROLE_TRADE_EFFICIENCY[selectedNode.flow_role] ?? "?"})</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Connectivity</span>
                      <span className="font-mono">{selectedNode.connectivity_score}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Isolation</span>
                      <span className="font-mono">{selectedNode.isolation_penalty}</span>
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
