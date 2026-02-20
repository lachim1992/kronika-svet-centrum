import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureRealmResources, recruitStack, migrateLegacyMilitary, FORMATION_PRESETS, UNIT_TYPE_LABELS } from "@/lib/turnEngine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Wheat, Swords, Users, Castle, AlertTriangle, Loader2, Play, Shield,
  Plus, Gauge, BarChart3, Skull, Heart, Crown, Building2
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
  cities: any[];
  onRefetch: () => void;
}

const RealmDashboard = ({ sessionId, currentPlayerName, currentTurn, myRole, cities, onRefetch }: Props) => {
  const [realm, setRealm] = useState<any>(null);
  const [infra, setInfra] = useState<any>(null);
  const [stacks, setStacks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [recruitName, setRecruitName] = useState("");
  const [recruitPreset, setRecruitPreset] = useState("militia");
  const [recruiting, setRecruiting] = useState(false);

  const myCities = cities.filter(c => c.owner_player === currentPlayerName);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [realmRes, infraRes, stacksRes] = await Promise.all([
      supabase.from("realm_resources").select("*").eq("session_id", sessionId).eq("player_name", currentPlayerName).maybeSingle(),
      supabase.from("realm_infrastructure").select("*").eq("session_id", sessionId).eq("player_name", currentPlayerName).maybeSingle(),
      supabase.from("military_stacks").select("*, military_stack_composition(*)").eq("session_id", sessionId).eq("player_name", currentPlayerName).order("created_at", { ascending: false }),
    ]);

    if (realmRes.data) setRealm(realmRes.data);
    else {
      const r = await ensureRealmResources(sessionId, currentPlayerName);
      setRealm(r);
    }
    setInfra(infraRes.data);
    setStacks(stacksRes.data || []);
    setLoading(false);
  }, [sessionId, currentPlayerName]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleProcessTurn = async () => {
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-turn", {
        body: { sessionId, playerName: currentPlayerName },
      });
      if (error) throw error;
      if (data?.skipped) {
        toast.info(`Kolo ${currentTurn} již bylo zpracováno`);
      } else {
        toast.success(`Kolo ${currentTurn} zpracováno`, {
          description: `Obilí: ${data?.summary?.netGrain >= 0 ? "+" : ""}${data?.summary?.netGrain}, Zásoby: ${data?.summary?.grainReserve}/${data?.summary?.granaryCapacity}`,
        });
      }
      await fetchData();
      onRefetch();
    } catch (e: any) {
      toast.error("Chyba zpracování kola", { description: e.message });
    } finally {
      setProcessing(false);
    }
  };

  const handleMobilizationChange = async (val: number[]) => {
    if (!realm) return;
    const rate = val[0] / 100;
    await supabase.from("realm_resources").update({ mobilization_rate: rate }).eq("id", realm.id);
    setRealm({ ...realm, mobilization_rate: rate });
  };

  const handleRecruit = async () => {
    if (!recruitName.trim()) { toast.error("Zadejte název"); return; }
    setRecruiting(true);
    try {
      await recruitStack(sessionId, currentPlayerName, recruitName.trim(), recruitPreset);
      toast.success("Armáda zřízena");
      setRecruitName("");
      await fetchData();
      onRefetch();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRecruiting(false);
    }
  };

  const handleMigrateLegacy = async () => {
    const res = await migrateLegacyMilitary(sessionId);
    toast.success(`Migrace dokončena: ${res.migrated} jednotek`);
    await fetchData();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const famineCities = myCities.filter(c => c.famine_turn);
  const totalPop = myCities.reduce((s, c) => s + (c.population_total || 0), 0);
  const availableManpower = (realm?.manpower_pool || 0) - (realm?.manpower_committed || 0);
  const activeStacks = stacks.filter(s => s.is_active);
  const totalPower = activeStacks.reduce((s, st) => s + (st.power || 0), 0);

  return (
    <div className="space-y-4">
      {/* Process Turn Button */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-display font-bold flex items-center gap-2">
          <Crown className="h-5 w-5 text-illuminated" />
          Ekonomika & Vojsko
        </h2>
        <Button onClick={handleProcessTurn} disabled={processing} size="sm" className="font-display">
          {processing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
          Zpracovat kolo
        </Button>
      </div>

      {/* Famine Alerts */}
      {famineCities.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Skull className="h-4 w-4 text-destructive" />
              <span className="text-sm font-display font-semibold text-destructive">Hladomor!</span>
            </div>
            {famineCities.map(c => (
              <div key={c.id} className="text-xs text-destructive">
                {c.name} — deficit {c.famine_severity}, stabilita {c.city_stability}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="economy" className="w-full">
        <TabsList className="w-full justify-start bg-card border border-border h-auto p-1 gap-1">
          <TabsTrigger value="economy" className="text-xs gap-1"><Wheat className="h-3 w-3" />Ekonomika</TabsTrigger>
          <TabsTrigger value="population" className="text-xs gap-1"><Users className="h-3 w-3" />Populace</TabsTrigger>
          <TabsTrigger value="military" className="text-xs gap-1"><Swords className="h-3 w-3" />Vojsko</TabsTrigger>
          <TabsTrigger value="cities" className="text-xs gap-1"><Castle className="h-3 w-3" />Města</TabsTrigger>
        </TabsList>

        {/* Economy Tab */}
        <TabsContent value="economy" className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardHeader className="p-3 pb-1"><CardTitle className="text-xs flex items-center gap-1"><Wheat className="h-3 w-3" />Obilí</CardTitle></CardHeader>
              <CardContent className="p-3 pt-1">
                <div className="text-xl font-bold">{realm?.grain_reserve || 0} <span className="text-xs font-normal text-muted-foreground">/ {realm?.granary_capacity || 500}</span></div>
                <div className="w-full bg-muted rounded-full h-2 mt-1">
                  <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${Math.min(100, ((realm?.grain_reserve || 0) / Math.max(1, realm?.granary_capacity || 500)) * 100)}%` }} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="p-3 pb-1"><CardTitle className="text-xs flex items-center gap-1"><Building2 className="h-3 w-3" />Zlato</CardTitle></CardHeader>
              <CardContent className="p-3 pt-1">
                <div className="text-xl font-bold">{realm?.gold_reserve || 0}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="p-3 pb-1"><CardTitle className="text-xs">Mobilizace ({Math.round((realm?.mobilization_rate || 0.1) * 100)}%)</CardTitle></CardHeader>
            <CardContent className="p-3 pt-2">
              <Slider
                value={[Math.round((realm?.mobilization_rate || 0.1) * 100)]}
                onValueCommit={handleMobilizationChange}
                max={30} min={0} step={1}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>0% — Mír</span>
                <span>30% — Totální mobilizace</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                <div><span className="text-muted-foreground">Muži k dispozici:</span> <span className="font-bold">{availableManpower}</span></div>
                <div><span className="text-muted-foreground">Odvedení:</span> <span className="font-bold">{realm?.manpower_committed || 0}</span></div>
                <div><span className="text-muted-foreground">Logistika:</span> <span className="font-bold">{realm?.logistic_capacity || 0}</span></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-3 pb-1"><CardTitle className="text-xs">Suroviny</CardTitle></CardHeader>
            <CardContent className="p-3 pt-1">
              <div className="grid grid-cols-3 gap-2 text-xs">
                {[
                  { label: "Dřevo", val: realm?.wood_reserve },
                  { label: "Kámen", val: realm?.stone_reserve },
                  { label: "Železo", val: realm?.iron_reserve },
                  { label: "Koně", val: realm?.horses_reserve },
                  { label: "Vědomosti", val: realm?.knowledge },
                  { label: "Prestiž", val: realm?.prestige },
                ].map(r => (
                  <div key={r.label} className="flex justify-between">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className="font-bold">{r.val || 0}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Population Tab */}
        <TabsContent value="population" className="mt-3 space-y-3">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-display font-semibold">Celková populace</span>
                <span className="text-xl font-bold">{totalPop.toLocaleString()}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Stabilita říše: <Badge variant={realm?.stability >= 50 ? "default" : "destructive"} className="text-xs">{realm?.stability || 70}</Badge>
              </div>
            </CardContent>
          </Card>

          {myCities.map(city => (
            <Card key={city.id} className={city.famine_turn ? "border-destructive/50" : ""}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-display font-semibold text-sm">{city.name}</span>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px]">{city.settlement_level || "HAMLET"}</Badge>
                    {city.famine_turn && <Badge variant="destructive" className="text-[10px]">Hladomor</Badge>}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mb-1">Populace: {(city.population_total || 0).toLocaleString()}</div>
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  <div className="flex items-center gap-1"><Users className="h-3 w-3 text-primary" />Sedláci: {city.population_peasants || 0}</div>
                  <div className="flex items-center gap-1"><Building2 className="h-3 w-3 text-accent-foreground" />Měšťané: {city.population_burghers || 0}</div>
                  <div className="flex items-center gap-1"><Heart className="h-3 w-3 text-muted-foreground" />Klérus: {city.population_clerics || 0}</div>
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px]">
                  <span>Stabilita: <strong>{city.city_stability || 70}</strong></span>
                  <span>Sýpka: <strong>{city.local_grain_reserve || 0}/{city.local_granary_capacity || 0}</strong></span>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Military Tab */}
        <TabsContent value="military" className="mt-3 space-y-3">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-display font-semibold">Celková síla</span>
                <span className="text-xl font-bold">{totalPower}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {activeStacks.length} aktivních jednotek • Muži: {realm?.manpower_committed || 0}/{realm?.manpower_pool || 0}
              </div>
            </CardContent>
          </Card>

          {/* Recruit */}
          <Card>
            <CardHeader className="p-3 pb-1"><CardTitle className="text-xs">Verbovat novou jednotku</CardTitle></CardHeader>
            <CardContent className="p-3 pt-2 space-y-2">
              <div className="flex gap-2">
                <Input placeholder="Název" value={recruitName} onChange={e => setRecruitName(e.target.value)} className="h-8 flex-1" />
                <Select value={recruitPreset} onValueChange={setRecruitPreset}>
                  <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(FORMATION_PRESETS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-[10px] text-muted-foreground">
                {FORMATION_PRESETS[recruitPreset]?.composition.map(c => 
                  `${c.manpower} ${UNIT_TYPE_LABELS[c.unit_type] || c.unit_type}`
                ).join(" + ")}
              </div>
              <Button onClick={handleRecruit} disabled={recruiting} size="sm" className="font-display">
                {recruiting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                Verbovat
              </Button>
            </CardContent>
          </Card>

          {/* Legacy migration */}
          {myRole === "admin" && (
            <Button variant="outline" size="sm" onClick={handleMigrateLegacy} className="text-xs">
              Migrovat starý vojenský systém
            </Button>
          )}

          {/* Stacks list */}
          {stacks.map(stack => (
            <Card key={stack.id} className={!stack.is_active ? "opacity-60" : ""}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-display font-semibold text-sm">{stack.name}</span>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px]">{stack.formation_type}</Badge>
                    <Badge variant={stack.is_active ? "default" : "secondary"} className="text-[10px]">
                      {stack.is_active ? "Aktivní" : "Rozpuštěná"}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span>Síla: <strong>{stack.power || 0}</strong></span>
                  <span>Morálka: <strong>{stack.morale}</strong></span>
                </div>
                {stack.military_stack_composition?.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {stack.military_stack_composition.map((c: any) => (
                      <div key={c.id} className="text-[10px] flex items-center gap-2">
                        <Shield className="h-3 w-3 text-muted-foreground" />
                        <span>{UNIT_TYPE_LABELS[c.unit_type] || c.unit_type}</span>
                        <span className="font-semibold">{c.manpower} mužů</span>
                        <span className="text-muted-foreground">kvalita {c.quality}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Cities overview tab */}
        <TabsContent value="cities" className="mt-3 space-y-3">
          <div className="text-xs text-muted-foreground mb-2">
            3 nejzranitelnější města (cíle hladu):
          </div>
          {[...myCities]
            .sort((a, b) => (b.vulnerability_score || 0) - (a.vulnerability_score || 0))
            .slice(0, 3)
            .map(city => (
              <Card key={city.id} className="border-l-2 border-l-amber-500/50">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-display font-semibold text-sm">{city.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      Zranitelnost: {(city.vulnerability_score || 0).toFixed(1)}
                    </Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Stabilita {city.city_stability} • Sýpka {city.local_grain_reserve}/{city.local_granary_capacity} • {city.settlement_level}
                  </div>
                </CardContent>
              </Card>
            ))}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RealmDashboard;
