import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Wheat, Trees, Mountain, Anvil, Coins, Users, Gauge,
  AlertTriangle, TrendingUp, TrendingDown, Minus, Castle,
  Skull, ArrowUpDown, BarChart3, ShieldAlert, Info, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  cities: any[];
  resources: any[];
  armies: any[];
  onEntityClick?: (type: string, id: string) => void;
}

const RESOURCE_ICONS: Record<string, React.ReactNode> = {
  food: <Wheat className="h-3.5 w-3.5" />,
  wood: <Trees className="h-3.5 w-3.5" />,
  stone: <Mountain className="h-3.5 w-3.5" />,
  iron: <Anvil className="h-3.5 w-3.5" />,
  wealth: <Coins className="h-3.5 w-3.5" />,
};

const RESOURCE_LABELS: Record<string, string> = {
  food: "Obilí", wood: "Dřevo", stone: "Kámen", iron: "Železo", wealth: "Bohatství",
};

const SETTLEMENT_LABELS: Record<string, string> = {
  HAMLET: "Osada", TOWNSHIP: "Městečko", CITY: "Město", POLIS: "Polis",
};

type CitySortKey = "name" | "population" | "grain_prod" | "grain_cons" | "wood_prod" | "special" | "vulnerability";

const EconomyTab = ({ sessionId, currentPlayerName, currentTurn, cities, resources, armies, onEntityClick }: Props) => {
  const [realm, setRealm] = useState<any>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [citySortKey, setCitySortKey] = useState<CitySortKey>("grain_prod");
  const [citySortAsc, setCitySortAsc] = useState(false);
  const [mobPreview, setMobPreview] = useState<number | null>(null);
  const [recomputing, setRecomputing] = useState(false);

  const myCities = useMemo(() => cities.filter(c => c.owner_player === currentPlayerName), [cities, currentPlayerName]);

  const fetchData = useCallback(async () => {
    const [realmRes, profilesRes] = await Promise.all([
      supabase.from("realm_resources").select("*")
        .eq("session_id", sessionId).ilike("player_name", currentPlayerName).maybeSingle(),
      supabase.from("settlement_resource_profiles").select("*")
        .in("city_id", myCities.map(c => c.id)),
    ]);
    if (realmRes.data) setRealm(realmRes.data);
    setProfiles(profilesRes.data || []);
  }, [sessionId, currentPlayerName, myCities]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const profileMap = useMemo(() => {
    const m: Record<string, any> = {};
    for (const p of profiles) m[p.city_id] = p;
    return m;
  }, [profiles]);

  // Player resources map
  const resMap = useMemo(() => {
    const m: Record<string, any> = {};
    for (const r of resources.filter(r => r.player_name?.toLowerCase() === currentPlayerName.toLowerCase())) {
      m[r.resource_type] = r;
    }
    return m;
  }, [resources, currentPlayerName]);

  // Derive totals from player_resources (canonical source)
  const totals = useMemo(() => {
    const foodR = resMap["food"];
    const grainProd = foodR?.income || 0;
    const grainCons = foodR?.upkeep || 0;
    const woodProd = resMap["wood"]?.income || 0;
    const stoneProd = resMap["stone"]?.income || 0;
    const ironProd = resMap["iron"]?.income || 0;
    return { grainProd, grainCons, grainNet: grainProd - grainCons, woodProd, stoneProd, ironProd };
  }, [resMap]);

  // Drivers: top producing and consuming cities
  const topProducers = useMemo(() =>
    [...myCities].sort((a, b) => (b.last_turn_grain_prod || 0) - (a.last_turn_grain_prod || 0)).slice(0, 5),
  [myCities]);

  const topConsumers = useMemo(() =>
    [...myCities].sort((a, b) => (b.last_turn_grain_cons || 0) - (a.last_turn_grain_cons || 0)).slice(0, 5),
  [myCities]);

  // City table sorting
  const sortedCities = useMemo(() => {
    const arr = [...myCities];
    arr.sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0;
      switch (citySortKey) {
        case "name": va = a.name; vb = b.name; return citySortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
        case "population": va = a.population_total || 0; vb = b.population_total || 0; break;
        case "grain_prod": va = a.last_turn_grain_prod || 0; vb = b.last_turn_grain_prod || 0; break;
        case "grain_cons": va = a.last_turn_grain_cons || 0; vb = b.last_turn_grain_cons || 0; break;
        case "wood_prod": va = a.last_turn_wood_prod || 0; vb = b.last_turn_wood_prod || 0; break;
        case "special": va = a.last_turn_special_prod || 0; vb = b.last_turn_special_prod || 0; break;
        case "vulnerability": va = a.vulnerability_score || 0; vb = b.vulnerability_score || 0; break;
      }
      return citySortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return arr;
  }, [myCities, citySortKey, citySortAsc]);

  const handleCitySort = (key: CitySortKey) => {
    if (citySortKey === key) setCitySortAsc(!citySortAsc);
    else { setCitySortKey(key); setCitySortAsc(false); }
  };

  // Alerts
  const alerts: { text: string; severity: "error" | "warning" | "info" }[] = [];
  const foodNet = totals.grainNet;
  if (foodNet < 0) alerts.push({ text: `Deficit obilí: ${foodNet}/kolo. Hrozí hladomor!`, severity: "error" });
  if (foodNet < 0 && totals.grainProd > 0 && Math.abs(foodNet) > totals.grainProd * 0.2) alerts.push({ text: "Vážné riziko hladomoru — deficit přesahuje 20% produkce.", severity: "error" });
  if (realm && (resMap["food"]?.stockpile || 0) >= (realm.granary_capacity || 500) * 0.9) alerts.push({ text: "Sýpky téměř plné — nadprodukce se ztrácí.", severity: "warning" });
  if (realm && (realm.mobilization_rate || 0) > 0.2) alerts.push({ text: `Vysoká mobilizace (${Math.round((realm.mobilization_rate || 0) * 100)}%) — penalizace produkce obilí.`, severity: "warning" });
  const famineCities = myCities.filter(c => c.famine_turn);
  if (famineCities.length > 0) alerts.push({ text: `${famineCities.length} sídel trpí hladomorem!`, severity: "error" });

  // Mobilization preview
  const currentMob = realm ? Math.round((realm.mobilization_rate || 0.1) * 100) : 10;
  const previewMob = mobPreview ?? currentMob;
  const baseGrain = myCities.reduce((s, c) => s + (profileMap[c.id]?.base_grain || 0), 0);
  const earlyBuffer = myCities.length <= 3 ? 10 : 0;
  const projectedGrainProd = Math.round(baseGrain * (1 - previewMob / 100 * 0.5)) + earlyBuffer;
  const projectedGrainNet = projectedGrainProd - totals.grainCons;

  const SortIcon = ({ field }: { field: CitySortKey }) => (
    <ArrowUpDown
      className={`h-3 w-3 inline ml-0.5 cursor-pointer ${citySortKey === field ? "text-primary" : "text-muted-foreground/50"}`}
      onClick={() => handleCitySort(field)}
    />
  );

  const handleRecompute = useCallback(async () => {
    setRecomputing(true);
    try {
      const { data, error } = await supabase.functions.invoke("economy-recompute", {
        body: { session_id: sessionId, player_name: currentPlayerName },
      });
      if (error) throw error;
      toast({ title: "Ekonomika přepočítána", description: `Obilí netto = ${data.net_food}` });
      await fetchData();
    } catch (e: any) {
      toast({ title: "Chyba přepočtu", description: e.message, variant: "destructive" });
    } finally {
      setRecomputing(false);
    }
  }, [sessionId, currentPlayerName, fetchData]);

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-2 py-1">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-display font-bold">Ekonomika</h2>
        <span className="text-xs text-muted-foreground ml-auto font-display">Rok {currentTurn}</span>
        <Button
          variant="outline"
          size="sm"
          className="ml-2 text-xs"
          onClick={handleRecompute}
          disabled={recomputing}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${recomputing ? "animate-spin" : ""}`} />
          {recomputing ? "Počítám…" : "Přepočítat"}
        </Button>
      </div>

      {/* A1: Top Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {(["food", "wood", "stone", "iron", "wealth"] as const).map(rt => {
          const r = resMap[rt];
          const income = r?.income || 0;
          const upkeep = r?.upkeep || 0;
          const stockpile = r?.stockpile || 0;
          const net = income - upkeep;
          const isDeficit = rt === "food" && foodNet < 0;
          return (
            <Card key={rt} className={`${isDeficit ? "border-destructive/50 bg-destructive/5" : ""}`}>
              <CardContent className="p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  {RESOURCE_ICONS[rt]}
                  <span className="text-xs font-display font-semibold">{RESOURCE_LABELS[rt]}</span>
                </div>
                <div className="text-lg font-bold font-display">{stockpile}</div>
                <div className="flex items-center gap-1 text-[10px]">
                  {net > 0 ? <TrendingUp className="h-3 w-3 text-accent" /> : net < 0 ? <TrendingDown className="h-3 w-3 text-destructive" /> : <Minus className="h-3 w-3 text-muted-foreground" />}
                  <span className={net < 0 ? "text-destructive font-semibold" : "text-muted-foreground"}>
                    {net >= 0 ? "+" : ""}{net}/kolo
                  </span>
                </div>
                {rt === "food" && realm && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Produkce {totals.grainProd} · Spotřeba {totals.grainCons}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Manpower + Stability + Mobilization row */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Users className="h-3.5 w-3.5" />
              <span className="text-xs font-display font-semibold">Lidská síla</span>
            </div>
            <div className="text-lg font-bold font-display">
              {(realm?.manpower_pool || 0) - (realm?.manpower_committed || 0)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              z {realm?.manpower_pool || 0} · odvedeno {realm?.manpower_committed || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <ShieldAlert className="h-3.5 w-3.5" />
              <span className="text-xs font-display font-semibold">Stabilita</span>
            </div>
            <div className={`text-lg font-bold font-display ${(realm?.stability || 70) < 40 ? "text-destructive" : ""}`}>
              {realm?.stability || 70}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Gauge className="h-3.5 w-3.5" />
              <span className="text-xs font-display font-semibold">Mobilizace</span>
            </div>
            <div className="text-lg font-bold font-display">{currentMob}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <Card className="border-destructive/30">
          <CardContent className="p-3 space-y-1.5">
            {alerts.map((a, i) => (
              <div key={i} className={`flex items-start gap-2 text-xs ${a.severity === "error" ? "text-destructive" : a.severity === "warning" ? "text-foreground" : "text-muted-foreground"}`}>
                {a.severity === "error" ? <Skull className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                <span>{a.text}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* A2: Drivers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-sm font-display flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-accent" /> Top producenti (obilí)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1">
            {topProducers.map(c => (
              <div key={c.id} className="flex justify-between text-xs py-0.5 cursor-pointer hover:text-primary" onClick={() => onEntityClick?.("city", c.id)}>
                <span>{c.name}</span>
                <span className="font-semibold">+{c.last_turn_grain_prod || 0}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-sm font-display flex items-center gap-1.5">
              <TrendingDown className="h-4 w-4 text-destructive" /> Top spotřebitelé (obilí)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1">
            {topConsumers.map(c => (
              <div key={c.id} className="flex justify-between text-xs py-0.5 cursor-pointer hover:text-primary" onClick={() => onEntityClick?.("city", c.id)}>
                <span>{c.name}</span>
                <span className="font-semibold">-{c.last_turn_grain_cons || 0}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* A3: City Breakdown Table */}
      <Card>
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-sm font-display">Přehled sídel</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] px-2">Město <SortIcon field="name" /></TableHead>
                <TableHead className="text-[10px] px-2">Úroveň</TableHead>
                <TableHead className="text-[10px] px-2 text-right">Pop <SortIcon field="population" /></TableHead>
                <TableHead className="text-[10px] px-2 text-right">🌾+ <SortIcon field="grain_prod" /></TableHead>
                <TableHead className="text-[10px] px-2 text-right">🌾- <SortIcon field="grain_cons" /></TableHead>
                <TableHead className="text-[10px] px-2 text-right">🪵+ <SortIcon field="wood_prod" /></TableHead>
                <TableHead className="text-[10px] px-2 text-right">Spec <SortIcon field="special" /></TableHead>
                <TableHead className="text-[10px] px-2 text-right">Zranit. <SortIcon field="vulnerability" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedCities.map(c => {
                const profile = profileMap[c.id];
                return (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onEntityClick?.("city", c.id)}>
                    <TableCell className="text-xs px-2 font-semibold">
                      {c.name}
                      {c.famine_turn && <Skull className="h-3 w-3 inline ml-1 text-destructive" />}
                    </TableCell>
                    <TableCell className="text-[10px] px-2">
                      <Badge variant="secondary" className="text-[9px]">{SETTLEMENT_LABELS[c.settlement_level] || c.settlement_level}</Badge>
                    </TableCell>
                    <TableCell className="text-xs px-2 text-right">{(c.population_total || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-xs px-2 text-right">{c.last_turn_grain_prod || 0}</TableCell>
                    <TableCell className="text-xs px-2 text-right">{c.last_turn_grain_cons || 0}</TableCell>
                    <TableCell className="text-xs px-2 text-right">{c.last_turn_wood_prod || 0}</TableCell>
                    <TableCell className="text-xs px-2 text-right">
                      {profile?.special_resource_type !== "NONE" && profile?.special_resource_type
                        ? `${profile.special_resource_type === "STONE" ? "⛏" : "⚒"} +${c.last_turn_special_prod || 0}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs px-2 text-right">{(c.vulnerability_score || 0).toFixed(0)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* A5: What-if: Mobilization Preview */}
      <Card>
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-sm font-display flex items-center gap-1.5">
            <Gauge className="h-4 w-4" /> Simulátor: Mobilizace
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-2 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-16">Mobilizace</span>
            <Slider
              value={[previewMob]}
              onValueChange={(v) => setMobPreview(v[0])}
              max={30} min={0} step={1}
              className="flex-1"
            />
            <span className="text-sm font-bold font-display w-12 text-right">{previewMob}%</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-muted/50 rounded p-2 text-center">
              <div className="text-muted-foreground text-[10px]">Projekce obilí</div>
              <div className={`font-bold ${projectedGrainNet < 0 ? "text-destructive" : ""}`}>
                {projectedGrainNet >= 0 ? "+" : ""}{projectedGrainNet}/kolo
              </div>
            </div>
            <div className="bg-muted/50 rounded p-2 text-center">
              <div className="text-muted-foreground text-[10px]">Produkce</div>
              <div className="font-bold">{projectedGrainProd}</div>
            </div>
            <div className="bg-muted/50 rounded p-2 text-center">
              <div className="text-muted-foreground text-[10px]">Lidská síla</div>
              <div className="font-bold">
                {Math.round((myCities.reduce((s, c) => s + (c.population_total || 0), 0)) * previewMob / 100)}
              </div>
            </div>
          </div>

          {mobPreview !== null && mobPreview !== currentMob && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Info className="h-3 w-3" />
              <span>Toto je pouze náhled. Mobilizaci změníte v HUD baru nahoře.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* A4: Consumption Breakdown */}
      <Card>
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-sm font-display">Spotřeba obilí</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Civilní (populace)</span>
            <span className="font-semibold">{totals.grainCons}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Vojenská (mobilizace)</span>
            <span className="font-semibold text-muted-foreground">—</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Budovy (údržba)</span>
            <span className="font-semibold text-muted-foreground">—</span>
          </div>
          <div className="border-t border-border pt-1 flex justify-between text-xs font-semibold">
            <span>Celkem</span>
            <span>{totals.grainCons}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EconomyTab;
