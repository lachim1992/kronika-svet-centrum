import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Users, Save, Loader2, RefreshCw, Swords, Crown, Coins, Wheat,
  Factory, Shield, Church, Zap, Package, Pickaxe, ChevronDown, ChevronUp,
} from "lucide-react";

interface Props {
  sessionId: string;
  onRefetch?: () => void;
}

// ── Realm resource field groups (Unified Economy v2)
const REALM_STOCKPILES = [
  { key: "production_reserve", label: "Produkce", icon: Factory },
  { key: "gold_reserve", label: "Bohatství", icon: Coins },
  { key: "grain_reserve", label: "Zásoby", icon: Wheat },
  { key: "faith", label: "Víra", icon: Church },
] as const;

const REALM_RATES = [
  { key: "mobilization_rate", label: "Mobilizace", step: 0.01 },
  { key: "sport_funding_pct", label: "Sport funding %", step: 0.01 },
  { key: "stability", label: "Stabilita", step: 1 },
  { key: "prestige", label: "Prestiž", step: 1 },
  { key: "cultural_prestige", label: "Kulturní prestiž", step: 1 },
  { key: "economic_prestige", label: "Ekon. prestiž", step: 1 },
  { key: "military_prestige", label: "Voj. prestiž", step: 1 },
  { key: "manpower_pool", label: "Manpower pool", step: 10 },
  { key: "manpower_committed", label: "Manpower committed", step: 10 },
  { key: "labor_reserve", label: "Labor reserve", step: 10 },
  { key: "logistic_capacity", label: "Logistická kapacita", step: 1 },
  { key: "granary_capacity", label: "Kapacita sýpky", step: 10 },
  { key: "total_production", label: "Celková produkce", step: 1 },
  { key: "total_wealth", label: "Celkové bohatství", step: 1 },
] as const;

const STACK_STANCES = ["defensive", "aggressive", "patrol", "siege", "escort", "march"];
const FORMATION_TYPES = ["line", "column", "wedge", "circle", "skirmish"];

const DevPlayerEditor = ({ sessionId, onRefetch }: Props) => {
  const [players, setPlayers] = useState<string[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Realm resources
  const [realm, setRealm] = useState<any>(null);

  // Player resources (per-resource rows)
  const [resources, setResources] = useState<any[]>([]);

  // Military stacks
  const [stacks, setStacks] = useState<any[]>([]);
  const [compositions, setCompositions] = useState<Record<string, any[]>>({});
  const [expandedStack, setExpandedStack] = useState<string | null>(null);

  // AI factions
  const [aiFactions, setAiFactions] = useState<any[]>([]);

  // ── Load players
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("game_players")
        .select("player_name")
        .eq("session_id", sessionId);
      const names = (data || []).map((p) => p.player_name);
      // Also add AI factions as pseudo-players
      const { data: factions } = await supabase
        .from("ai_factions")
        .select("faction_name")
        .eq("session_id", sessionId)
        .eq("is_active", true);
      const aiNames = (factions || []).map((f) => f.faction_name);
      const all = [...new Set([...names, ...aiNames])];
      setPlayers(all);
      if (all.length && !selectedPlayer) setSelectedPlayer(all[0]);
    };
    load();
  }, [sessionId]);

  // ── Load data for selected player
  const loadPlayerData = useCallback(async () => {
    if (!selectedPlayer) return;
    setLoading(true);
    try {
      const [realmRes, resourcesRes, stacksRes, factionsRes] = await Promise.all([
        supabase.from("realm_resources").select("*")
          .eq("session_id", sessionId).eq("player_name", selectedPlayer).maybeSingle(),
        supabase.from("player_resources").select("*")
          .eq("session_id", sessionId).eq("player_name", selectedPlayer),
        supabase.from("military_stacks").select("*")
          .eq("session_id", sessionId).eq("player_name", selectedPlayer).eq("is_active", true),
        supabase.from("ai_factions").select("*")
          .eq("session_id", sessionId).eq("faction_name", selectedPlayer),
      ]);
      setRealm(realmRes.data);
      setResources(resourcesRes.data || []);
      setStacks(stacksRes.data || []);
      setAiFactions(factionsRes.data || []);

      // Load compositions for all stacks
      const stackIds = (stacksRes.data || []).map((s: any) => s.id);
      if (stackIds.length) {
        const { data: comps } = await supabase.from("military_stack_composition")
          .select("*").in("stack_id", stackIds);
        const grouped: Record<string, any[]> = {};
        for (const c of comps || []) {
          if (!grouped[c.stack_id]) grouped[c.stack_id] = [];
          grouped[c.stack_id].push(c);
        }
        setCompositions(grouped);
      } else {
        setCompositions({});
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId, selectedPlayer]);

  useEffect(() => { loadPlayerData(); }, [loadPlayerData]);

  // ── Save realm resources
  const saveRealm = async () => {
    if (!realm?.id) return;
    setSaving(true);
    const { error } = await supabase.from("realm_resources").update(realm).eq("id", realm.id);
    setSaving(false);
    if (error) { toast.error("Chyba: " + error.message); return; }
    toast.success("Realm uložen");
    onRefetch?.();
  };

  // ── Save single player_resource row
  const saveResource = async (r: any) => {
    const { error } = await supabase.from("player_resources").update({
      stockpile: r.stockpile, income: r.income, upkeep: r.upkeep,
    }).eq("id", r.id);
    if (error) toast.error(error.message);
    else toast.success(`${r.resource_type} uloženo`);
  };

  // ── Save stack
  const saveStack = async (s: any) => {
    const { error } = await supabase.from("military_stacks").update({
      morale: s.morale, power: s.power, stance: s.stance,
      formation_type: s.formation_type, is_deployed: s.is_deployed,
    }).eq("id", s.id);
    if (error) toast.error(error.message);
    else toast.success(`${s.name} uložen`);
  };

  // ── Save composition unit
  const saveUnit = async (u: any) => {
    const { error } = await supabase.from("military_stack_composition").update({
      manpower: u.manpower, quality: u.quality, equipment_level: u.equipment_level,
    }).eq("id", u.id);
    if (error) toast.error(error.message);
    else toast.success(`${u.unit_type} uloženo`);
  };

  // ── Save AI faction
  const saveFaction = async (f: any) => {
    const { error } = await supabase.from("ai_factions").update({
      personality: f.personality, is_active: f.is_active,
      disposition: f.disposition, goals: f.goals, resources_snapshot: f.resources_snapshot,
    }).eq("id", f.id);
    if (error) toast.error(error.message);
    else toast.success(`AI frakce uložena`);
  };

  // ── Helpers
  const updateRealm = (key: string, val: number) =>
    setRealm((prev: any) => prev ? { ...prev, [key]: val } : prev);

  const updateResource = (idx: number, key: string, val: number) =>
    setResources((prev) => prev.map((r, i) => i === idx ? { ...r, [key]: val } : r));

  const updateStack = (idx: number, key: string, val: any) =>
    setStacks((prev) => prev.map((s, i) => i === idx ? { ...s, [key]: val } : s));

  const updateUnit = (stackId: string, unitIdx: number, key: string, val: any) =>
    setCompositions((prev) => ({
      ...prev,
      [stackId]: (prev[stackId] || []).map((u, i) => i === unitIdx ? { ...u, [key]: val } : u),
    }));

  const NumField = ({ label, value, onChange, step = 1, min }: {
    label: string; value: number; onChange: (v: number) => void; step?: number; min?: number;
  }) => (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
      <Input
        type="number"
        value={value ?? 0}
        step={step}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-7 text-xs w-24"
      />
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Users className="h-4 w-4 text-primary" />
        <h2 className="font-display font-bold text-sm">Player & AI Editor</h2>
        <Select value={selectedPlayer} onValueChange={setSelectedPlayer}>
          <SelectTrigger className="h-7 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {players.map((p) => (
              <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={loadPlayerData} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Reload
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Načítání…</div>
      ) : (
        <Tabs defaultValue="realm" className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-0.5">
            <TabsTrigger value="realm" className="text-xs gap-1 py-1.5">
              <Crown className="h-3 w-3" /> Realm
            </TabsTrigger>
            <TabsTrigger value="resources" className="text-xs gap-1 py-1.5">
              <Package className="h-3 w-3" /> Resources
            </TabsTrigger>
            <TabsTrigger value="military" className="text-xs gap-1 py-1.5">
              <Swords className="h-3 w-3" /> Armády
            </TabsTrigger>
            {aiFactions.length > 0 && (
              <TabsTrigger value="ai" className="text-xs gap-1 py-1.5">
                <Zap className="h-3 w-3" /> AI Frakce
              </TabsTrigger>
            )}
          </TabsList>

          {/* ═══ REALM TAB ═══ */}
          <TabsContent value="realm" className="mt-2">
            {!realm ? (
              <p className="text-xs text-muted-foreground">Žádný realm záznam pro {selectedPlayer}</p>
            ) : (
              <Card>
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Crown className="h-4 w-4 text-primary" />
                    Realm: {selectedPlayer}
                    <Button size="sm" className="ml-auto h-7 text-xs gap-1" onClick={saveRealm} disabled={saving}>
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      Uložit
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 space-y-3">
                  {/* Stockpiles */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Zásoby</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {REALM_STOCKPILES.map((f) => {
                        const Icon = f.icon;
                        return (
                          <div key={f.key} className="flex items-center gap-1.5">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-xs w-16 shrink-0">{f.label}</span>
                            <Input
                              type="number"
                              value={realm[f.key] ?? 0}
                              onChange={(e) => updateRealm(f.key, Number(e.target.value))}
                              className="h-7 text-xs w-20"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <Separator />
                  {/* Rates & modifiers */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Sazby & modifikátory</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {REALM_RATES.map((f) => (
                        <NumField
                          key={f.key}
                          label={f.label}
                          value={realm[f.key] ?? 0}
                          step={f.step}
                          onChange={(v) => updateRealm(f.key, v)}
                        />
                      ))}
                    </div>
                  </div>
                  <Separator />
                  {/* Strategic tiers */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Strategické suroviny (tier)</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {["iron", "horses", "salt", "copper", "gold"].map((res) => (
                        <NumField
                          key={res}
                          label={res.charAt(0).toUpperCase() + res.slice(1)}
                          value={realm[`strategic_${res}_tier`] ?? 0}
                          min={0}
                          onChange={(v) => updateRealm(`strategic_${res}_tier`, v)}
                        />
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ═══ RESOURCES TAB ═══ */}
          <TabsContent value="resources" className="mt-2">
            {resources.length === 0 ? (
              <p className="text-xs text-muted-foreground">Žádné resource záznamy</p>
            ) : (
              <div className="space-y-2">
                {resources.map((r, idx) => (
                  <Card key={r.id}>
                    <CardContent className="py-2 px-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">{r.resource_type}</Badge>
                        <NumField label="Zásoby" value={r.stockpile} onChange={(v) => updateResource(idx, "stockpile", v)} />
                        <NumField label="Příjem" value={r.income} onChange={(v) => updateResource(idx, "income", v)} />
                        <NumField label="Výdaje" value={r.upkeep} onChange={(v) => updateResource(idx, "upkeep", v)} />
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 ml-auto" onClick={() => saveResource(r)}>
                          <Save className="h-3 w-3" /> Uložit
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ═══ MILITARY TAB ═══ */}
          <TabsContent value="military" className="mt-2">
            {stacks.length === 0 ? (
              <p className="text-xs text-muted-foreground">Žádné aktivní armády</p>
            ) : (
              <ScrollArea className="max-h-[500px]">
                <div className="space-y-2">
                  {stacks.map((s, idx) => {
                    const expanded = expandedStack === s.id;
                    const units = compositions[s.id] || [];
                    const totalManpower = units.reduce((sum, u) => sum + (u.manpower || 0), 0);
                    return (
                      <Card key={s.id}>
                        <CardHeader className="py-2 px-3 cursor-pointer" onClick={() => setExpandedStack(expanded ? null : s.id)}>
                          <div className="flex items-center gap-2">
                            <Swords className="h-4 w-4 text-primary" />
                            <span className="text-sm font-semibold">{s.name}</span>
                            <Badge variant="outline" className="text-[10px]">{totalManpower} vojáků</Badge>
                            <span className="ml-auto text-xs text-muted-foreground">
                              Morale {s.morale} | Power {s.power}
                            </span>
                            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </div>
                        </CardHeader>
                        {expanded && (
                          <CardContent className="px-3 pb-3 space-y-3">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                              <NumField label="Morálka" value={s.morale} onChange={(v) => updateStack(idx, "morale", v)} />
                              <NumField label="Síla" value={s.power} onChange={(v) => updateStack(idx, "power", v)} />
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground w-28 shrink-0">Stance</span>
                                <Select value={s.stance || "defensive"} onValueChange={(v) => updateStack(idx, "stance", v)}>
                                  <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {STACK_STANCES.map((st) => (
                                      <SelectItem key={st} value={st} className="text-xs">{st}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground w-28 shrink-0">Formace</span>
                                <Select value={s.formation_type || "line"} onValueChange={(v) => updateStack(idx, "formation_type", v)}>
                                  <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {FORMATION_TYPES.map((ft) => (
                                      <SelectItem key={ft} value={ft} className="text-xs">{ft}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground w-28 shrink-0">Deployed</span>
                                <Switch checked={s.is_deployed} onCheckedChange={(v) => updateStack(idx, "is_deployed", v)} />
                              </div>
                            </div>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => saveStack(s)}>
                              <Save className="h-3 w-3" /> Uložit stack
                            </Button>

                            {/* Units */}
                            {units.length > 0 && (
                              <>
                                <Separator />
                                <p className="text-xs font-semibold text-muted-foreground">Jednotky</p>
                                <div className="space-y-1.5">
                                  {units.map((u, ui) => (
                                    <div key={u.id} className="flex items-center gap-2 flex-wrap bg-muted/30 rounded p-1.5">
                                      <Badge variant="secondary" className="text-[10px]">{u.unit_type}</Badge>
                                      <NumField label="Manpower" value={u.manpower} onChange={(v) => updateUnit(s.id, ui, "manpower", v)} />
                                      <NumField label="Kvalita" value={u.quality} step={0.1} onChange={(v) => updateUnit(s.id, ui, "quality", v)} />
                                      <NumField label="Výzbroj" value={u.equipment_level} onChange={(v) => updateUnit(s.id, ui, "equipment_level", v)} />
                                      <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={() => saveUnit(u)}>
                                        <Save className="h-2.5 w-2.5" /> Save
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          {/* ═══ AI FACTION TAB ═══ */}
          {aiFactions.length > 0 && (
            <TabsContent value="ai" className="mt-2">
              <div className="space-y-2">
                {aiFactions.map((f, idx) => (
                  <Card key={f.id}>
                    <CardHeader className="py-2 px-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Zap className="h-4 w-4 text-primary" />
                        {f.faction_name}
                        <Badge variant="outline" className="text-[10px]">{f.personality}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 pb-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-28 shrink-0">Personality</span>
                        <Input
                          value={f.personality || ""}
                          onChange={(e) => setAiFactions((prev) => prev.map((x, i) => i === idx ? { ...x, personality: e.target.value } : x))}
                          className="h-7 text-xs w-40"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-28 shrink-0">Aktivní</span>
                        <Switch
                          checked={f.is_active}
                          onCheckedChange={(v) => setAiFactions((prev) => prev.map((x, i) => i === idx ? { ...x, is_active: v } : x))}
                        />
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Disposition (JSON)</span>
                        <textarea
                          className="w-full text-xs font-mono bg-muted/50 border rounded p-1.5 mt-0.5 min-h-[60px]"
                          value={JSON.stringify(f.disposition, null, 2)}
                          onChange={(e) => {
                            try {
                              const parsed = JSON.parse(e.target.value);
                              setAiFactions((prev) => prev.map((x, i) => i === idx ? { ...x, disposition: parsed } : x));
                            } catch { /* ignore parse errors while typing */ }
                          }}
                        />
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Goals (JSON)</span>
                        <textarea
                          className="w-full text-xs font-mono bg-muted/50 border rounded p-1.5 mt-0.5 min-h-[60px]"
                          value={JSON.stringify(f.goals, null, 2)}
                          onChange={(e) => {
                            try {
                              const parsed = JSON.parse(e.target.value);
                              setAiFactions((prev) => prev.map((x, i) => i === idx ? { ...x, goals: parsed } : x));
                            } catch { /* ignore */ }
                          }}
                        />
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Resources Snapshot (JSON)</span>
                        <textarea
                          className="w-full text-xs font-mono bg-muted/50 border rounded p-1.5 mt-0.5 min-h-[60px]"
                          value={JSON.stringify(f.resources_snapshot, null, 2)}
                          onChange={(e) => {
                            try {
                              const parsed = JSON.parse(e.target.value);
                              setAiFactions((prev) => prev.map((x, i) => i === idx ? { ...x, resources_snapshot: parsed } : x));
                            } catch { /* ignore */ }
                          }}
                        />
                      </div>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => saveFaction(f)}>
                        <Save className="h-3 w-3" /> Uložit AI frakci
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
};

export default DevPlayerEditor;
