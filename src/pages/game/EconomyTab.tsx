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
  food: <Wheat className="h-4 w-4" />,
  wood: <Trees className="h-4 w-4" />,
  stone: <Mountain className="h-4 w-4" />,
  iron: <Anvil className="h-4 w-4" />,
  wealth: <Coins className="h-4 w-4" />,
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

  const resMap = useMemo(() => {
    const m: Record<string, any> = {};
    for (const r of resources.filter(r => r.player_name?.toLowerCase() === currentPlayerName.toLowerCase())) {
      m[r.resource_type] = r;
    }
    return m;
  }, [resources, currentPlayerName]);

  const totals = useMemo(() => {
    const foodR = resMap["food"];
    const grainProd = foodR?.income || 0;
    const grainCons = foodR?.upkeep || 0;
    const woodProd = resMap["wood"]?.income || 0;
    const stoneProd = resMap["stone"]?.income || 0;
    const ironProd = resMap["iron"]?.income || 0;
    return { grainProd, grainCons, grainNet: grainProd - grainCons, woodProd, stoneProd, ironProd };
  }, [resMap]);

  const topProducers = useMemo(() =>
    [...myCities].sort((a, b) => (b.last_turn_grain_prod || 0) - (a.last_turn_grain_prod || 0)).slice(0, 5),
  [myCities]);

  const topConsumers = useMemo(() =>
    [...myCities].sort((a, b) => (b.last_turn_grain_cons || 0) - (a.last_turn_grain_cons || 0)).slice(0, 5),
  [myCities]);

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

  const alerts: { text: string; severity: "error" | "warning" | "info" }[] = [];
  const foodNet = totals.grainNet;
  if (foodNet < 0) alerts.push({ text: `Deficit obilí: ${foodNet}/kolo. Hrozí hladomor!`, severity: "error" });
  if (foodNet < 0 && totals.grainProd > 0 && Math.abs(foodNet) > totals.grainProd * 0.2) alerts.push({ text: "Vážné riziko hladomoru — deficit přesahuje 20% produkce.", severity: "error" });
  if (realm && (resMap["food"]?.stockpile || 0) >= (realm.granary_capacity || 500) * 0.9) alerts.push({ text: "Sýpky téměř plné — nadprodukce se ztrácí.", severity: "warning" });
  if (realm && (realm.mobilization_rate || 0) > 0.2) alerts.push({ text: `Vysoká mobilizace (${Math.round((realm.mobilization_rate || 0) * 100)}%) — penalizace produkce obilí.`, severity: "warning" });
  const famineCities = myCities.filter(c => c.famine_turn);
  if (famineCities.length > 0) alerts.push({ text: `${famineCities.length} sídel trpí hladomorem!`, severity: "error" });

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
    <div className="space-y-6 pb-24 px-1">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <BarChart3 className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-display font-bold">Ekonomika</h2>
        <span className="text-sm text-muted-foreground ml-auto font-display">Rok {currentTurn}</span>
        <Button
          variant="outline"
          size="sm"
          className="ml-2 text-sm h-9"
          onClick={handleRecompute}
          disabled={recomputing}
        >
          <RefreshCw className={`h-4 w-4 mr-1.5 ${recomputing ? "animate-spin" : ""}`} />
          {recomputing ? "Počítám…" : "Přepočítat"}
        </Button>
      </div>

      {/* Production / Consumption / Balance — 3 dramatic blocks */}
      <div className="grid grid-cols-3 gap-4">
        <div className="game-card p-5 text-center">
          <TrendingUp className="h-5 w-5 mx-auto mb-2 text-success" />
          <div className="stat-label mb-1">Produkce</div>
          <div className="text-2xl md:text-3xl font-bold font-display text-success">{totals.grainProd}</div>
          <div className="stat-meta mt-1">obilí/kolo</div>
        </div>
        <div className="game-card p-5 text-center">
          <TrendingDown className="h-5 w-5 mx-auto mb-2 text-destructive" />
          <div className="stat-label mb-1">Spotřeba</div>
          <div className="text-2xl md:text-3xl font-bold font-display text-destructive">{totals.grainCons}</div>
          <div className="stat-meta mt-1">obilí/kolo</div>
        </div>
        <div className={`game-card p-5 text-center ${foodNet < 0 ? "border-destructive/40 bg-destructive/5" : "border-success/20"}`}>
          {foodNet >= 0 ? <TrendingUp className="h-5 w-5 mx-auto mb-2 text-success" /> : <AlertTriangle className="h-5 w-5 mx-auto mb-2 text-destructive" />}
          <div className="stat-label mb-1">Bilance</div>
          <div className={`text-2xl md:text-3xl font-bold font-display ${foodNet < 0 ? "text-destructive" : "text-success"}`}>
            {foodNet >= 0 ? "+" : ""}{foodNet}
          </div>
          <div className="stat-meta mt-1">netto/kolo</div>
          {/* Balance bar */}
          {totals.grainProd > 0 && (
            <div className="mt-3 h-2 rounded-full overflow-hidden bg-muted">
              <div
                className={`h-full rounded-full transition-all ${foodNet >= 0 ? "bg-success" : "bg-destructive"}`}
                style={{ width: `${Math.min(100, Math.abs(foodNet) / totals.grainProd * 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Per-Resource Breakdown Cards */}
      <div className="space-y-3">
        <h3 className="text-base font-display font-semibold flex items-center gap-2">
          <Info className="h-4 w-4 text-primary" /> Rozbor zdrojů
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(["food", "wood", "stone", "iron", "wealth"] as const).map(rt => {
            const r = resMap[rt];
            const income = r?.income || 0;
            const upkeep = r?.upkeep || 0;
            const stockpile = r?.stockpile || 0;
            const net = income - upkeep;
            const isDeficit = net < 0;
            const maxBar = Math.max(income, upkeep, 1);

            // Build explanation sources
            const sources: { label: string; value: number; type: "income" | "expense" }[] = [];
            if (rt === "food") {
              const totalGrainProd = myCities.reduce((s, c) => s + (c.last_turn_grain_prod || 0), 0);
              const totalGrainCons = myCities.reduce((s, c) => s + (c.last_turn_grain_cons || 0), 0);
              sources.push({ label: "Produkce sídel", value: totalGrainProd, type: "income" });
              if (myCities.length <= 3) sources.push({ label: "Bonus malé říše", value: 10, type: "income" });
              sources.push({ label: "Spotřeba populace", value: totalGrainCons, type: "expense" });
              if (realm && (realm.mobilization_rate || 0) > 0) {
                sources.push({ label: `Penalizace mobilizace (${Math.round((realm.mobilization_rate || 0) * 100)}%)`, value: Math.round(totalGrainProd * (realm.mobilization_rate || 0) * 0.5), type: "expense" });
              }
            } else if (rt === "wood") {
              const totalWood = myCities.reduce((s, c) => s + (c.last_turn_wood_prod || 0), 0);
              sources.push({ label: "Produkce sídel", value: totalWood, type: "income" });
              if (upkeep > 0) sources.push({ label: "Údržba budov", value: upkeep, type: "expense" });
            } else if (rt === "stone" || rt === "iron") {
              const totalSpec = myCities.filter(c => c.special_resource_type === rt.toUpperCase()).reduce((s, c) => s + (c.last_turn_special_prod || 0), 0);
              sources.push({ label: "Produkce dolů", value: totalSpec, type: "income" });
              if (upkeep > 0) sources.push({ label: "Vojenská údržba", value: upkeep, type: "expense" });
            } else {
              if (income > 0) sources.push({ label: "Obchod & daně", value: income, type: "income" });
              if (upkeep > 0) sources.push({ label: "Výdaje", value: upkeep, type: "expense" });
            }

            return (
              <div key={rt} className={`game-card p-5 space-y-3 ${isDeficit ? "border-destructive/30 bg-destructive/5" : ""}`}>
                {/* Resource header */}
                <div className="flex items-center gap-2">
                  <span className="text-primary">{RESOURCE_ICONS[rt]}</span>
                  <span className="font-display font-semibold text-base">{RESOURCE_LABELS[rt]}</span>
                  <Badge variant="outline" className="ml-auto text-[10px]">
                    Zásoba: {stockpile}
                  </Badge>
                </div>

                {/* Income / Expense / Net row */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="stat-label text-[10px]">Příjem</div>
                    <div className="text-lg font-bold font-display text-success">+{income}</div>
                  </div>
                  <div>
                    <div className="stat-label text-[10px]">Výdaje</div>
                    <div className="text-lg font-bold font-display text-destructive">-{upkeep}</div>
                  </div>
                  <div>
                    <div className="stat-label text-[10px]">Netto</div>
                    <div className={`text-lg font-bold font-display ${isDeficit ? "text-destructive" : "text-success"}`}>
                      {net >= 0 ? "+" : ""}{net}
                    </div>
                  </div>
                </div>

                {/* Net direction bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full overflow-hidden bg-muted flex">
                    <div className="bg-success transition-all rounded-l-full" style={{ width: `${(income / maxBar) * 50}%` }} />
                    <div className="bg-destructive transition-all rounded-r-full" style={{ width: `${(upkeep / maxBar) * 50}%` }} />
                  </div>
                  {net > 0 ? <TrendingUp className="h-3.5 w-3.5 text-success" /> : net < 0 ? <TrendingDown className="h-3.5 w-3.5 text-destructive" /> : <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>

                {/* Source explanation */}
                {sources.length > 0 && (
                  <div className="border-t border-border/50 pt-2 space-y-1">
                    {sources.map((src, i) => (
                      <div key={i} className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground">{src.label}</span>
                        <span className={src.type === "income" ? "text-success" : "text-destructive"}>
                          {src.type === "income" ? "+" : "-"}{src.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Manpower + Stability + Mobilization row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="game-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-primary" />
            <span className="stat-label">Lidská síla</span>
          </div>
          <div className="stat-number">
            {(realm?.manpower_pool || 0) - (realm?.manpower_committed || 0)}
          </div>
          <div className="stat-meta mt-1">
            z {realm?.manpower_pool || 0} · odvedeno {realm?.manpower_committed || 0}
          </div>
        </div>
        <div className="game-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            <span className="stat-label">Stabilita</span>
          </div>
          <div className={`stat-number ${(realm?.stability || 70) < 40 ? "text-destructive" : ""}`}>
            {realm?.stability || 70}
          </div>
        </div>
        <div className="game-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="h-4 w-4 text-primary" />
            <span className="stat-label">Mobilizace</span>
          </div>
          <div className="stat-number">{currentMob}%</div>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="game-card border-destructive/30 bg-destructive/5 p-5 space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className={`flex items-start gap-2.5 text-sm ${a.severity === "error" ? "text-destructive" : a.severity === "warning" ? "text-foreground" : "text-muted-foreground"}`}>
              {a.severity === "error" ? <Skull className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
              <span>{a.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Drivers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="game-card p-5">
          <h3 className="text-base font-display font-semibold flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-success" /> Top producenti (obilí)
          </h3>
          {topProducers.map(c => (
            <div key={c.id} className="flex justify-between text-sm py-1.5 cursor-pointer hover:text-primary border-b border-border/30 last:border-0" onClick={() => onEntityClick?.("city", c.id)}>
              <span>{c.name}</span>
              <span className="font-semibold text-success">+{c.last_turn_grain_prod || 0}</span>
            </div>
          ))}
        </div>
        <div className="game-card p-5">
          <h3 className="text-base font-display font-semibold flex items-center gap-2 mb-3">
            <TrendingDown className="h-4 w-4 text-destructive" /> Top spotřebitelé (obilí)
          </h3>
          {topConsumers.map(c => (
            <div key={c.id} className="flex justify-between text-sm py-1.5 cursor-pointer hover:text-primary border-b border-border/30 last:border-0" onClick={() => onEntityClick?.("city", c.id)}>
              <span>{c.name}</span>
              <span className="font-semibold text-destructive">-{c.last_turn_grain_cons || 0}</span>
            </div>
          ))}
        </div>
      </div>

      {/* City Breakdown Table */}
      <div className="game-card p-0 overflow-hidden">
        <div className="px-5 pt-4 pb-2">
          <h3 className="text-base font-display font-semibold">Přehled sídel</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs px-3">Město <SortIcon field="name" /></TableHead>
              <TableHead className="text-xs px-3">Úroveň</TableHead>
              <TableHead className="text-xs px-3 text-right">Pop <SortIcon field="population" /></TableHead>
              <TableHead className="text-xs px-3 text-right">🌾+ <SortIcon field="grain_prod" /></TableHead>
              <TableHead className="text-xs px-3 text-right">🌾- <SortIcon field="grain_cons" /></TableHead>
              <TableHead className="text-xs px-3 text-right">🪵+ <SortIcon field="wood_prod" /></TableHead>
              <TableHead className="text-xs px-3 text-right">Spec <SortIcon field="special" /></TableHead>
              <TableHead className="text-xs px-3 text-right">Zranit. <SortIcon field="vulnerability" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedCities.map(c => {
              const profile = profileMap[c.id];
              return (
                <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onEntityClick?.("city", c.id)}>
                  <TableCell className="text-sm px-3 font-semibold">
                    {c.name}
                    {c.famine_turn && <Skull className="h-3.5 w-3.5 inline ml-1.5 text-destructive" />}
                  </TableCell>
                  <TableCell className="text-xs px-3">
                    <Badge variant="secondary" className="text-[10px]">{SETTLEMENT_LABELS[c.settlement_level] || c.settlement_level}</Badge>
                  </TableCell>
                  <TableCell className="text-sm px-3 text-right">{(c.population_total || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-sm px-3 text-right text-success">{c.last_turn_grain_prod || 0}</TableCell>
                  <TableCell className="text-sm px-3 text-right text-destructive">{c.last_turn_grain_cons || 0}</TableCell>
                  <TableCell className="text-sm px-3 text-right">{c.last_turn_wood_prod || 0}</TableCell>
                  <TableCell className="text-sm px-3 text-right">
                    {profile?.special_resource_type !== "NONE" && profile?.special_resource_type
                      ? `${profile.special_resource_type === "STONE" ? "⛏" : "⚒"} +${c.last_turn_special_prod || 0}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm px-3 text-right">{(c.vulnerability_score || 0).toFixed(0)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobilization Simulator */}
      <div className="game-card p-5">
        <h3 className="text-base font-display font-semibold flex items-center gap-2 mb-4">
          <Gauge className="h-5 w-5 text-primary" /> Simulátor: Mobilizace
        </h3>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground w-24 font-display">Mobilizace</span>
            <div className="flex-1 relative">
              <Slider
                value={[previewMob]}
                onValueChange={(v) => setMobPreview(v[0])}
                max={30} min={0} step={1}
                className="flex-1"
              />
            </div>
            <span className="text-xl font-bold font-display w-16 text-right text-primary">{previewMob}%</span>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <div className="stat-label">Projekce obilí</div>
              <div className={`text-lg font-bold font-display mt-1 ${projectedGrainNet < 0 ? "text-destructive" : "text-success"}`}>
                {projectedGrainNet >= 0 ? "+" : ""}{projectedGrainNet}/kolo
              </div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <div className="stat-label">Produkce</div>
              <div className="text-lg font-bold font-display mt-1">{projectedGrainProd}</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <div className="stat-label">Lidská síla</div>
              <div className="text-lg font-bold font-display mt-1">
                {Math.round((myCities.reduce((s, c) => s + (c.population_total || 0), 0)) * previewMob / 100)}
              </div>
            </div>
          </div>

          {mobPreview !== null && mobPreview !== currentMob && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4" />
              <span>Toto je pouze náhled. Mobilizaci změníte v HUD baru nahoře.</span>
            </div>
          )}
        </div>
      </div>

      {/* Consumption Breakdown */}
      <div className="game-card p-5">
        <h3 className="text-base font-display font-semibold mb-3">Spotřeba obilí</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm py-1 border-b border-border/30">
            <span className="text-muted-foreground">Civilní (populace)</span>
            <span className="font-semibold">{totals.grainCons}</span>
          </div>
          <div className="flex justify-between text-sm py-1 border-b border-border/30">
            <span className="text-muted-foreground">Vojenská (mobilizace)</span>
            <span className="font-semibold text-muted-foreground">—</span>
          </div>
          <div className="flex justify-between text-sm py-1 border-b border-border/30">
            <span className="text-muted-foreground">Budovy (údržba)</span>
            <span className="font-semibold text-muted-foreground">—</span>
          </div>
          <div className="pt-2 flex justify-between text-sm font-semibold">
            <span>Celkem</span>
            <span className="text-primary">{totals.grainCons}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EconomyTab;
