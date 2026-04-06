/**
 * HexDevTools — Collapsible dev tool sections for the hex detail sheet on the map.
 * Sections: Resource Deposits, Node Editor, Inventory & Demand, Trade Routes, Quick Actions.
 */
import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Loader2, ChevronDown, Trash2, Save, Plus, RefreshCw, Route } from "lucide-react";
import { toast } from "sonner";
import { NODE_CAPABILITY_MAP, CAPABILITY_TAGS } from "@/lib/goodsCatalog";
import { createRoute as createRouteUtil, getRouteDefaults } from "@/lib/routeDefaults";

interface NodeOnHex {
  id: string; name: string; hex_q: number; hex_r: number; node_tier: string;
  node_type: string; node_subtype: string | null; controlled_by: string | null;
  upgrade_level: number; max_upgrade_level: number; parent_node_id: string | null;
  strategic_resource_type: string | null;
  production_output?: number; wealth_output?: number;
  capability_tags?: string[]; guild_level?: number; flow_role?: string;
  spawned_strategic_resource?: string | null; city_id?: string | null;
  net_balance?: number;
}

interface Props {
  sessionId: string;
  hexId: string;
  hexQ: number;
  hexR: number;
  hexNodes: NodeOnHex[];
  onRefresh: () => void;
  onRouteRefresh: () => void;
}

const RESOURCE_TYPES = [
  "wheat", "iron", "stone", "timber", "game", "fish",
  "salt", "copper", "gold", "marble", "herbs", "resin",
];
const RESOURCE_ICONS: Record<string, string> = {
  wheat: "🌾", iron: "⛏️", stone: "🪨", timber: "🪵", game: "🦌", fish: "🐟",
  salt: "🧂", copper: "🟤", gold: "✨", marble: "🏛️", herbs: "🌿", resin: "🫠",
};

const FLOW_ROLES = ["neutral", "regulator", "gateway", "producer", "hub"];
const ROUTE_TYPES = ["land_road", "river_route", "sea_lane", "caravan_route"];
const ROUTE_LABELS: Record<string, string> = {
  land_road: "🛤️ Pozemní", river_route: "🚣 Říční", sea_lane: "⛵ Námořní", caravan_route: "🐪 Karavana",
};

const DevSection = ({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors">
        <span className="text-sm">{icon}</span>
        <span className="text-[11px] font-display font-semibold flex-1 text-left">{title}</span>
        <Badge className="text-[8px] h-4 bg-yellow-500/20 text-yellow-400 border-yellow-500/30">DEV</Badge>
        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 space-y-2">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
};

// ─── 1. Resource Deposits ───
const ResourceDepositsSection = ({ sessionId, hexId }: { sessionId: string; hexId: string }) => {
  const [deposits, setDeposits] = useState<Array<{ type: string; quality: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addType, setAddType] = useState("wheat");
  const [addQuality, setAddQuality] = useState([3]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("province_hexes").select("resource_deposits").eq("id", hexId).single();
      if (data?.resource_deposits && Array.isArray(data.resource_deposits)) {
        setDeposits((data.resource_deposits as any[]).map((d: any) => ({ type: d.type || d.resource_type || "", quality: d.quality || 1 })));
      }
      setLoading(false);
    })();
  }, [hexId]);

  const save = async (newDeposits: Array<{ type: string; quality: number }>) => {
    setSaving(true);
    const { error } = await supabase.from("province_hexes").update({ resource_deposits: newDeposits } as any).eq("id", hexId);
    if (error) toast.error("Uložení selhalo: " + error.message);
    else { setDeposits(newDeposits); toast.success("Suroviny uloženy"); }
    setSaving(false);
  };

  const addResource = () => {
    const newDeps = [...deposits, { type: addType, quality: addQuality[0] }];
    save(newDeps);
  };

  const removeResource = (idx: number) => {
    const newDeps = deposits.filter((_, i) => i !== idx);
    save(newDeps);
  };

  if (loading) return <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Načítám…</div>;

  return (
    <div className="space-y-2">
      {deposits.length > 0 ? (
        <div className="space-y-1">
          {deposits.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] p-1.5 rounded border border-border bg-card">
              <span>{RESOURCE_ICONS[d.type] || "📦"}</span>
              <span className="font-display font-semibold flex-1">{d.type}</span>
              <span className="text-muted-foreground">Q:{d.quality}</span>
              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => removeResource(i)} disabled={saving}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground text-center">Žádné suroviny</p>
      )}
      <div className="flex items-center gap-1.5">
        <Select value={addType} onValueChange={setAddType}>
          <SelectTrigger className="h-7 text-[10px] flex-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {RESOURCE_TYPES.map(r => <SelectItem key={r} value={r} className="text-[10px]">{RESOURCE_ICONS[r]} {r}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1 w-20">
          <span className="text-[9px] text-muted-foreground">Q:</span>
          <Slider value={addQuality} onValueChange={setAddQuality} min={1} max={5} step={1} className="flex-1" />
          <span className="text-[9px] font-mono w-3">{addQuality[0]}</span>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={addResource} disabled={saving}>
          <Plus className="h-3 w-3" /> Přidat
        </Button>
      </div>
    </div>
  );
};

// ─── 2. Inline Node Editor ───
const InlineNodeEditor = ({ node, sessionId, onRefresh }: { node: NodeOnHex; sessionId: string; onRefresh: () => void }) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState(node.name);
  const [editSubtype, setEditSubtype] = useState(node.node_subtype || "");
  const [editTier, setEditTier] = useState(node.node_tier);
  const [editFlowRole, setEditFlowRole] = useState(node.flow_role || "neutral");
  const [editGuild, setEditGuild] = useState([node.guild_level || 0]);
  const [editCapTags, setEditCapTags] = useState<string[]>(node.capability_tags || []);
  const [editResource, setEditResource] = useState(node.spawned_strategic_resource || "");
  const [deleting, setDeleting] = useState(false);

  const subtypeKeys = Object.keys(NODE_CAPABILITY_MAP);

  const handleSubtypeChange = (val: string) => {
    setEditSubtype(val);
    const mapping = NODE_CAPABILITY_MAP[val];
    if (mapping) setEditCapTags(mapping.tags);
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("province_nodes").update({
      name: editName,
      node_subtype: editSubtype || null,
      node_tier: editTier,
      flow_role: editFlowRole,
      guild_level: editGuild[0],
      capability_tags: editCapTags,
      spawned_strategic_resource: editResource || null,
    } as any).eq("id", node.id);
    if (error) toast.error("Uložení selhalo: " + error.message);
    else { toast.success("Uzel uložen"); onRefresh(); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Smazat uzel "${node.name}"?`)) return;
    setDeleting(true);
    try {
      await supabase.from("flow_paths").delete().or(`source_node.eq.${node.id},target_node.eq.${node.id}`);
      await supabase.from("province_routes").delete().or(`node_a.eq.${node.id},node_b.eq.${node.id}`);
      const { error } = await supabase.from("province_nodes").delete().eq("id", node.id);
      if (error) throw error;
      toast.success(`Uzel "${node.name}" smazán`);
      onRefresh();
    } catch (e: any) { toast.error("Smazání selhalo: " + e.message); }
    finally { setDeleting(false); }
  };

  const tierIcon = node.node_tier === "major" ? "🏙️" : node.node_tier === "minor" ? "🏘️" : "🌾";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 w-full p-1.5 rounded border border-border bg-card hover:bg-muted/50 transition-colors text-[10px]">
        <span>{tierIcon}</span>
        <span className="font-display font-semibold flex-1 text-left truncate">{node.name}</span>
        <Badge variant="outline" className="text-[8px] h-4">{node.node_tier}</Badge>
        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1.5 pl-2 space-y-1.5">
        {/* Name */}
        <div className="flex gap-1">
          <input className="flex-1 h-6 px-1.5 text-[10px] rounded border border-border bg-background" value={editName} onChange={e => setEditName(e.target.value)} />
        </div>
        {/* Subtype */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground w-14">Subtyp:</span>
          <Select value={editSubtype} onValueChange={handleSubtypeChange}>
            <SelectTrigger className="h-6 text-[10px] flex-1"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent className="max-h-48">
              {subtypeKeys.map(k => <SelectItem key={k} value={k} className="text-[10px]">{k} ({NODE_CAPABILITY_MAP[k].role})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {/* Tier */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground w-14">Tier:</span>
          <Select value={editTier} onValueChange={setEditTier}>
            <SelectTrigger className="h-6 text-[10px] flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="major" className="text-[10px]">Major</SelectItem>
              <SelectItem value="minor" className="text-[10px]">Minor</SelectItem>
              <SelectItem value="micro" className="text-[10px]">Micro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/* Flow role */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground w-14">Role:</span>
          <Select value={editFlowRole} onValueChange={setEditFlowRole}>
            <SelectTrigger className="h-6 text-[10px] flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FLOW_ROLES.map(r => <SelectItem key={r} value={r} className="text-[10px]">{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {/* Guild level */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground w-14">Cech:</span>
          <Slider value={editGuild} onValueChange={setEditGuild} min={0} max={5} step={1} className="flex-1" />
          <span className="text-[9px] font-mono w-3">{editGuild[0]}</span>
        </div>
        {/* Strategic resource */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground w-14">Strat.:</span>
          <input className="flex-1 h-6 px-1.5 text-[10px] rounded border border-border bg-background" value={editResource} onChange={e => setEditResource(e.target.value)} placeholder="—" />
        </div>
        {/* Capability tags */}
        <div>
          <span className="text-[9px] text-muted-foreground">Tags:</span>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {Object.keys(CAPABILITY_TAGS).map(tag => (
              <label key={tag} className={`flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded border cursor-pointer transition-colors ${editCapTags.includes(tag) ? "bg-primary/20 border-primary/40 text-primary" : "border-border text-muted-foreground"}`}>
                <input type="checkbox" className="hidden" checked={editCapTags.includes(tag)}
                  onChange={e => setEditCapTags(e.target.checked ? [...editCapTags, tag] : editCapTags.filter(t => t !== tag))} />
                {CAPABILITY_TAGS[tag].icon} {CAPABILITY_TAGS[tag].label}
              </label>
            ))}
          </div>
        </div>
        {/* Buttons */}
        <div className="flex gap-1">
          <Button size="sm" className="flex-1 h-6 text-[10px] gap-1" disabled={saving} onClick={handleSave}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Uložit
          </Button>
          <Button size="sm" variant="destructive" className="h-6 text-[10px] gap-1" disabled={deleting} onClick={handleDelete}>
            {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

// ─── 3. Inventory & Demand ───
const InventoryDemandSection = ({ hexNodes, sessionId }: { hexNodes: NodeOnHex[]; sessionId: string }) => {
  const [inventory, setInventory] = useState<any[]>([]);
  const [demand, setDemand] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (hexNodes.length === 0) return;
    (async () => {
      setLoading(true);
      const nodeIds = hexNodes.map(n => n.id);
      const cityIds = hexNodes.filter(n => n.city_id).map(n => n.city_id!);

      const [invRes, demRes] = await Promise.all([
        supabase.from("node_inventory").select("*").in("node_id", nodeIds).limit(100),
        cityIds.length > 0
          ? supabase.from("demand_baskets").select("*").in("city_id", cityIds).limit(100)
          : Promise.resolve({ data: [] }),
      ]);
      setInventory(invRes.data || []);
      setDemand((demRes as any).data || []);
      setLoading(false);
    })();
  }, [hexNodes, sessionId]);

  if (loading) return <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Načítám…</div>;

  return (
    <div className="space-y-2">
      {inventory.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[9px] text-muted-foreground font-semibold">📦 Zásoby uzlů</p>
          {inventory.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] p-1 rounded border border-border bg-card">
              <span className="font-semibold">{item.good_key}</span>
              <span className="text-muted-foreground">qty: {item.quantity?.toFixed(1)}</span>
              <span className="text-muted-foreground">Q: {item.quality?.toFixed(1)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground text-center">Žádné zásoby</p>
      )}

      {demand.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] text-muted-foreground font-semibold">📊 Poptávka města</p>
          {demand.map((d, i) => (
            <div key={i} className="space-y-0.5 p-1 rounded border border-border bg-card">
              <div className="flex items-center gap-2 text-[10px]">
                <span className="font-semibold">{d.basket_key}</span>
                <span className="text-muted-foreground ml-auto">{Math.round((d.satisfaction || 0) * 100)}%</span>
              </div>
              <Progress value={(d.satisfaction || 0) * 100} className="h-1.5" />
            </div>
          ))}
        </div>
      )}
      {inventory.length === 0 && demand.length === 0 && (
        <p className="text-[10px] text-muted-foreground text-center italic">Žádná data inventáře ani poptávky</p>
      )}
    </div>
  );
};

// ─── 4. Trade Route Creator (integrated with shared utility) ───
const TradeRouteSection = ({ sessionId, hexNodes, onRouteRefresh }: { sessionId: string; hexNodes: NodeOnHex[]; onRouteRefresh: () => void }) => {
  const [allNodes, setAllNodes] = useState<Array<{ id: string; name: string; node_tier: string }>>([]);
  const [nodeA, setNodeA] = useState(hexNodes[0]?.id || "");
  const [nodeB, setNodeB] = useState("");
  const [routeType, setRouteType] = useState("land_road");
  const [creating, setCreating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Advanced overrides
  const defaults = getRouteDefaults(routeType);
  const [capacity, setCapacity] = useState([defaults.capacity]);
  const [speed, setSpeed] = useState([defaults.speed]);
  const [safety, setSafety] = useState([defaults.safety]);
  const [economic, setEconomic] = useState([defaults.economic]);
  const [military, setMilitary] = useState([defaults.military]);
  const [controlState, setControlState] = useState("open");

  // Reset defaults when route type changes
  useEffect(() => {
    const d = getRouteDefaults(routeType);
    setCapacity([d.capacity]); setSpeed([d.speed]); setSafety([d.safety]);
    setEconomic([d.economic]); setMilitary([d.military]);
  }, [routeType]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("province_nodes")
        .select("id, name, node_tier")
        .eq("session_id", sessionId)
        .eq("is_active", true)
        .in("node_tier", ["major", "minor"])
        .limit(200);
      setAllNodes(data || []);
    })();
  }, [sessionId]);

  const handleCreate = async () => {
    setCreating(true);
    await createRouteUtil({
      sessionId, nodeA, nodeB, routeType,
      capacity: capacity[0], speedValue: speed[0], safetyValue: safety[0],
      economicRelevance: economic[0], militaryRelevance: military[0],
      controlState,
    });
    setCreating(false);
    onRouteRefresh();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <span className="text-[9px] text-muted-foreground w-6">A:</span>
        <Select value={nodeA} onValueChange={setNodeA}>
          <SelectTrigger className="h-7 text-[10px] flex-1"><SelectValue placeholder="Uzel A" /></SelectTrigger>
          <SelectContent className="max-h-48">
            {hexNodes.map(n => <SelectItem key={n.id} value={n.id} className="text-[10px]">{n.name} (hex)</SelectItem>)}
            {allNodes.filter(n => !hexNodes.some(h => h.id === n.id)).map(n => (
              <SelectItem key={n.id} value={n.id} className="text-[10px]">{n.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[9px] text-muted-foreground w-6">B:</span>
        <Select value={nodeB} onValueChange={setNodeB}>
          <SelectTrigger className="h-7 text-[10px] flex-1"><SelectValue placeholder="Cílový uzel" /></SelectTrigger>
          <SelectContent className="max-h-48">
            {allNodes.filter(n => n.id !== nodeA).map(n => (
              <SelectItem key={n.id} value={n.id} className="text-[10px]">{n.name} ({n.node_tier})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[9px] text-muted-foreground w-6">Typ:</span>
        <Select value={routeType} onValueChange={setRouteType}>
          <SelectTrigger className="h-7 text-[10px] flex-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ROUTE_TYPES.map(r => <SelectItem key={r} value={r} className="text-[10px]">{ROUTE_LABELS[r]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Advanced toggle */}
      <button onClick={() => setShowAdvanced(!showAdvanced)}
        className="text-[9px] text-primary/70 hover:text-primary underline">
        {showAdvanced ? "▲ Skrýt parametry" : "▼ Rozšířené parametry"}
      </button>

      {showAdvanced && (
        <div className="space-y-1.5 p-1.5 rounded bg-muted/20 border border-border/30">
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-muted-foreground w-14">Stav:</span>
            <Select value={controlState} onValueChange={setControlState}>
              <SelectTrigger className="h-6 text-[9px] flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["open", "contested", "blocked", "damaged", "embargoed"].map(s => (
                  <SelectItem key={s} value={s} className="text-[9px]">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-muted-foreground w-14">Kapacita:</span>
            <Slider value={capacity} max={30} step={1} className="flex-1" onValueChange={setCapacity} />
            <span className="text-[9px] w-6 text-right">{capacity[0]}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-muted-foreground w-14">Rychlost:</span>
            <Slider value={speed} max={5} step={0.1} className="flex-1" onValueChange={setSpeed} />
            <span className="text-[9px] w-6 text-right">{speed[0].toFixed(1)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-muted-foreground w-14">Bezpečn.:</span>
            <Slider value={safety} max={3} step={0.1} className="flex-1" onValueChange={setSafety} />
            <span className="text-[9px] w-6 text-right">{safety[0].toFixed(1)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-muted-foreground w-14">Ekon.:</span>
            <Slider value={economic} max={2} step={0.1} className="flex-1" onValueChange={setEconomic} />
            <span className="text-[9px] w-6 text-right">{economic[0].toFixed(1)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-muted-foreground w-14">Vojen.:</span>
            <Slider value={military} max={2} step={0.1} className="flex-1" onValueChange={setMilitary} />
            <span className="text-[9px] w-6 text-right">{military[0].toFixed(1)}</span>
          </div>
        </div>
      )}

      <div className="flex gap-1">
        <Button size="sm" className="flex-1 h-7 text-[10px] gap-1" disabled={creating || !nodeA || !nodeB} onClick={handleCreate}>
          {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Route className="h-3 w-3" />}
          Vytvořit trasu
        </Button>
      </div>
    </div>
  );
};

// ─── 5. Quick Actions ───
const QuickActionsSection = ({ sessionId, onRouteRefresh }: { sessionId: string; onRouteRefresh: () => void }) => {
  const [running, setRunning] = useState<string | null>(null);

  const run = async (fn: string, label: string) => {
    setRunning(fn);
    try {
      const { error } = await supabase.functions.invoke(fn, { body: { session_id: sessionId } });
      if (error) throw error;
      toast.success(`${label} hotovo`);
      onRouteRefresh();
    } catch (e: any) { toast.error(`Chyba: ${e.message}`); }
    finally { setRunning(null); }
  };

  return (
    <div className="flex flex-wrap gap-1">
      <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 flex-1" disabled={!!running}
        onClick={() => run("backfill-economy-tags", "Hydratace tagů")}>
        {running === "backfill-economy-tags" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        Hydratace
      </Button>
      <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 flex-1" disabled={!!running}
        onClick={() => run("compute-hex-flows", "Hex toky")}>
        {running === "compute-hex-flows" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        Hex toky
      </Button>
      <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 flex-1" disabled={!!running}
        onClick={() => run("compute-province-graph", "Province graf")}>
        {running === "compute-province-graph" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        Prov. graf
      </Button>
      <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 flex-1" disabled={!!running}
        onClick={() => run("compute-trade-flows", "Trade flows")}>
        {running === "compute-trade-flows" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        Trade flows
      </Button>
    </div>
  );
};

// ─── Main Export ───
const HexDevTools = ({ sessionId, hexId, hexQ, hexR, hexNodes, onRefresh, onRouteRefresh }: Props) => {
  return (
    <div className="space-y-2 pt-2 border-t border-primary/20">
      <p className="text-[9px] text-primary/60 font-display font-bold uppercase tracking-wider">Developer Tools</p>

      <DevSection title="Suroviny hexu" icon="⛏️">
        <ResourceDepositsSection sessionId={sessionId} hexId={hexId} />
      </DevSection>

      <DevSection title="Node Editor" icon="🔧">
        {hexNodes.length > 0 ? (
          <div className="space-y-1.5">
            {hexNodes.map(n => (
              <InlineNodeEditor key={n.id} node={n} sessionId={sessionId} onRefresh={onRefresh} />
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground text-center">Žádné uzly na tomto hexu</p>
        )}
      </DevSection>

      <DevSection title="Inventory & Poptávka" icon="📦">
        <InventoryDemandSection hexNodes={hexNodes} sessionId={sessionId} />
      </DevSection>

      <DevSection title="Obchodní trasa" icon="🛤️">
        <TradeRouteSection sessionId={sessionId} hexNodes={hexNodes} onRouteRefresh={onRouteRefresh} />
      </DevSection>

      <DevSection title="Quick Actions" icon="⚡">
        <QuickActionsSection sessionId={sessionId} onRouteRefresh={onRouteRefresh} />
      </DevSection>
    </div>
  );
};

export default HexDevTools;
