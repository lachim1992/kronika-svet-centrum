import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Wheat, Trees, Mountain, Anvil, Coins, Users, Gauge,
  AlertTriangle, TrendingUp, TrendingDown, Minus,
  Skull, ArrowUpDown, BarChart3, ShieldAlert, Info, RefreshCw,
  ChevronDown, Code, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ensureRealmResources } from "@/lib/turnEngine";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  cities: any[];
  resources: any[];
  armies: any[];
  myRole?: string;
  onEntityClick?: (type: string, id: string) => void;
  onRefetch?: () => void;
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

const EconomyTab = ({ sessionId, currentPlayerName, currentTurn, cities, resources, armies, myRole, onEntityClick, onRefetch }: Props) => {
  const [realm, setRealm] = useState<any>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [citySortKey, setCitySortKey] = useState<CitySortKey>("grain_prod");
  const [citySortAsc, setCitySortAsc] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const myCities = useMemo(() => cities.filter(c => c.owner_player === currentPlayerName), [cities, currentPlayerName]);

  const fetchData = useCallback(async () => {
    const [realmRes, profilesRes] = await Promise.all([
      supabase.from("realm_resources").select("*")
        .eq("session_id", sessionId).ilike("player_name", currentPlayerName).maybeSingle(),
      supabase.from("settlement_resource_profiles").select("*")
        .in("city_id", myCities.map(c => c.id)),
    ]);
    if (realmRes.data) {
      setRealm(realmRes.data);
    } else {
      const r = await ensureRealmResources(sessionId, currentPlayerName);
      setRealm(r);
    }
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
    return { grainProd, grainCons, grainNet: grainProd - grainCons };
  }, [resMap]);

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

  // Wealth data
  const wealthR = resMap["wealth"];
  const wealthIncome = wealthR?.income || 0;
  const wealthUpkeep = wealthR?.upkeep || 0;
  const wealthNet = wealthIncome - wealthUpkeep;
  const wealthStock = wealthR?.stockpile || realm?.gold_reserve || 0;

  // Wealth top sources breakdown
  const wealthSources: { label: string; value: number; type: "income" | "expense" }[] = [];
  // Tier base
  const SETTLEMENT_WEALTH: Record<string, number> = { HAMLET: 1, TOWNSHIP: 2, CITY: 4, POLIS: 6 };
  const tierTotal = myCities.filter(c => !c.status || c.status === "ok").reduce((s, c) => s + (SETTLEMENT_WEALTH[c.settlement_level] || 1), 0);
  const popTaxTotal = myCities.filter(c => !c.status || c.status === "ok").reduce((s, c) => s + Math.floor((c.population_total || 0) / 500), 0);
  const burgherTradeTotal = myCities.filter(c => !c.status || c.status === "ok").reduce((s, c) => s + Math.floor((c.population_burghers || 0) / 200), 0);
  if (tierTotal > 0) wealthSources.push({ label: "Daně sídel", value: tierTotal, type: "income" });
  if (popTaxTotal > 0) wealthSources.push({ label: "Daň z populace", value: popTaxTotal, type: "income" });
  if (burgherTradeTotal > 0) wealthSources.push({ label: "Obchod měšťanů", value: burgherTradeTotal, type: "income" });
  if (wealthUpkeep > 0) wealthSources.push({ label: "Výdaje správy & armády", value: wealthUpkeep, type: "expense" });

  // Alerts
  const alerts: { text: string; severity: "error" | "warning" }[] = [];
  const foodNet = totals.grainNet;
  if (foodNet < 0) alerts.push({ text: `Deficit obilí: ${foodNet}/kolo`, severity: "error" });
  const famineCities = myCities.filter(c => c.famine_turn);
  if (famineCities.length > 0) alerts.push({ text: `${famineCities.length} sídel trpí hladomorem!`, severity: "error" });
  const currentMob = realm ? Math.round((realm.mobilization_rate || 0.1) * 100) : 10;
  if (currentMob > 20) alerts.push({ text: `Vysoká mobilizace (${currentMob}%)`, severity: "warning" });

  // Mobilization
  const availableManpower = (realm?.manpower_pool || 0) - (realm?.manpower_committed || 0);

  // Granary
  const grainReserve = realm?.grain_reserve ?? resMap["food"]?.stockpile ?? 0;
  const granaryCapacity = realm?.granary_capacity || 500;
  const granaryPct = Math.min(100, (grainReserve / Math.max(1, granaryCapacity)) * 100);

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
      toast({ title: "Ekonomika přepočítána", description: `Obilí netto = ${data.capped_net?.grain ?? data.net_food}` });
      await fetchData();
      onRefetch?.();
    } catch (e: any) {
      toast({ title: "Chyba přepočtu", description: e.message, variant: "destructive" });
    } finally {
      setRecomputing(false);
    }
  }, [sessionId, currentPlayerName, fetchData, onRefetch]);


  // Build sources for a resource type
  const buildSources = (rt: string) => {
    const sources: { label: string; value: number; type: "income" | "expense" }[] = [];
    const r = resMap[rt];
    const income = r?.income || 0;
    const upkeep = r?.upkeep || 0;
    if (rt === "food") {
      const totalGrainProd = myCities.reduce((s, c) => s + (c.last_turn_grain_prod || 0), 0);
      const totalGrainCons = myCities.reduce((s, c) => s + (c.last_turn_grain_cons || 0), 0);
      sources.push({ label: "Produkce sídel", value: totalGrainProd, type: "income" });
      if (myCities.length <= 3) sources.push({ label: "Bonus malé říše", value: 10, type: "income" });
      sources.push({ label: "Spotřeba populace", value: totalGrainCons, type: "expense" });
      if (upkeep > totalGrainCons) {
        sources.push({ label: "Vojenská spotřeba", value: upkeep - totalGrainCons, type: "expense" });
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
    return sources;
  };

  const compactResources = ["food", "wood", "stone", "iron"] as const;

  // Data freshness check
  const realmUpdatedAt = realm?.updated_at;
  const isStale = realmUpdatedAt && (Date.now() - new Date(realmUpdatedAt).getTime()) > 1000 * 60 * 60 * 2;

  return (
    <div className="space-y-6 pb-24 px-1">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <BarChart3 className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-display font-bold">Ekonomika</h2>
        <span className="text-sm text-muted-foreground ml-auto font-display">Rok {currentTurn}</span>
        <Button variant="outline" size="sm" className="ml-2 text-sm h-9" onClick={handleRecompute} disabled={recomputing}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${recomputing ? "animate-spin" : ""}`} />
          {recomputing ? "Počítám…" : "Přepočítat"}
        </Button>
      </div>

      {/* Data freshness diagnostic */}
      {isStale && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 border border-border">
          <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
          <span>Data mohou být zastaralá (poslední aktualizace: {realmUpdatedAt ? new Date(realmUpdatedAt).toLocaleString("cs") : "nikdy"}). Klikněte na „Přepočítat" nebo spusťte další kolo.</span>
        </div>
      )}

      {/* ═══ TOP TIER: Wealth + Alerts + Realm Stats ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Wealth main card — spans 2 cols */}
        <div className="game-card p-5 md:col-span-2 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Coins className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg">Bohatství</h3>
              <span className="text-xs text-muted-foreground">Finanční přehled říše</span>
            </div>
            <Badge variant="outline" className="ml-auto text-sm px-3 py-1 font-display font-bold">
              {wealthStock} zlata
            </Badge>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-muted/40 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Příjem</div>
              <div className="text-2xl font-bold font-display text-success">+{wealthIncome}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">/kolo</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Výdaje</div>
              <div className="text-2xl font-bold font-display text-destructive">-{wealthUpkeep}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">/kolo</div>
            </div>
            <div className={`rounded-lg p-3 ${wealthNet < 0 ? "bg-destructive/10" : "bg-success/10"}`}>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Netto</div>
              <div className={`text-2xl font-bold font-display ${wealthNet < 0 ? "text-destructive" : "text-success"}`}>
                {wealthNet >= 0 ? "+" : ""}{wealthNet}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">/kolo</div>
            </div>
          </div>

          {wealthSources.length > 0 && (
            <div className="border-t border-border/50 pt-3 space-y-1">
              {wealthSources.map((src, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{src.label}</span>
                  <span className={src.type === "income" ? "text-success font-semibold" : "text-destructive font-semibold"}>
                    {src.type === "income" ? "+" : "-"}{src.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column: Alerts + Realm stats */}
        <div className="space-y-4">
          {/* Famine alerts */}
          {famineCities.length > 0 && (
            <div className="game-card border-destructive/30 bg-destructive/5 p-4 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Skull className="h-4 w-4 text-destructive" />
                <span className="text-sm font-display font-semibold text-destructive">Hladomor!</span>
              </div>
              {famineCities.map(c => (
                <div key={c.id} className="text-xs text-destructive">
                  {c.name} — deficit {c.famine_severity}, stabilita {c.city_stability}
                </div>
              ))}
            </div>
          )}

          {/* General alerts */}
          {alerts.length > 0 && (
            <div className="game-card border-destructive/30 bg-destructive/5 p-4 space-y-2">
              {alerts.map((a, i) => (
                <div key={i} className={`flex items-start gap-2 text-xs ${a.severity === "error" ? "text-destructive" : "text-foreground"}`}>
                  {a.severity === "error" ? <Skull className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                  <span>{a.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Quick realm stats */}
          <div className="game-card p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-primary" /> Lidská síla</span>
              <span className="font-bold">{availableManpower} / {realm?.manpower_pool || 0}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5"><ShieldAlert className="h-3.5 w-3.5 text-primary" /> Stabilita</span>
              <span className={`font-bold ${(realm?.stability || 70) < 40 ? "text-destructive" : ""}`}>{realm?.stability || 70}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5 text-primary" /> Mobilizace</span>
              <span className="font-bold">{currentMob}%</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5"><Wheat className="h-3.5 w-3.5 text-primary" /> Sýpky</span>
              <span className="font-bold">{grainReserve} / {granaryCapacity}</span>
            </div>
            {/* Granary bar */}
            <div className="w-full bg-muted rounded-full h-1.5">
              <div
                className={`rounded-full h-1.5 transition-all ${granaryPct < 20 ? "bg-destructive" : granaryPct < 50 ? "bg-yellow-500" : "bg-primary"}`}
                style={{ width: `${granaryPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ═══ RESOURCE TIER: Compact uniform cards ═══ */}
      <div>
        <h3 className="text-base font-display font-semibold flex items-center gap-2 mb-3">
          <Info className="h-4 w-4 text-primary" /> Suroviny
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {compactResources.map(rt => {
            const r = resMap[rt];
            const income = r?.income || 0;
            const upkeep = r?.upkeep || 0;
            const stockpile = r?.stockpile || 0;
            const net = income - upkeep;
            const isDeficit = net < 0;
            const isFamine = rt === "food" && famineCities.length > 0;
            const sources = buildSources(rt);

            return (
              <Collapsible key={rt}>
                <div className={`game-card p-4 space-y-2.5 ${isDeficit ? "border-destructive/30" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-primary">{RESOURCE_ICONS[rt]}</span>
                    <span className="font-display font-semibold text-sm">{RESOURCE_LABELS[rt]}</span>
                    {isFamine && (
                      <Badge variant="destructive" className="text-[9px] px-1.5 py-0 ml-1">⚠ Hladomor</Badge>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      Zásoba: <span className="font-bold text-foreground">{stockpile}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className={`text-xl font-bold font-display ${isDeficit ? "text-destructive" : "text-success"}`}>
                      {net >= 0 ? "+" : ""}{net}
                    </div>
                    <span className="text-[10px] text-muted-foreground">/kolo</span>
                    {net > 0 ? <TrendingUp className="h-3.5 w-3.5 text-success ml-auto" /> : net < 0 ? <TrendingDown className="h-3.5 w-3.5 text-destructive ml-auto" /> : <Minus className="h-3.5 w-3.5 text-muted-foreground ml-auto" />}
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-muted-foreground">Příjem: <span className="text-success font-semibold">+{income}</span></span>
                    <span className="text-muted-foreground">Výdaje: <span className="text-destructive font-semibold">-{upkeep}</span></span>
                  </div>

                  {sources.length > 0 && (
                    <>
                      <CollapsibleTrigger asChild>
                        <button className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors pt-1">
                          <ChevronDown className="h-3 w-3" />
                          <span>Detail zdrojů</span>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-t border-border/50 pt-2 mt-1 space-y-1">
                          {sources.map((src, i) => (
                            <div key={i} className="flex justify-between text-[11px]">
                              <span className="text-muted-foreground">{src.label}</span>
                              <span className={src.type === "income" ? "text-success" : "text-destructive"}>
                                {src.type === "income" ? "+" : "-"}{src.value}
                              </span>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </>
                  )}
                </div>
              </Collapsible>
            );
          })}
        </div>
      </div>

      {/* ═══ ARMY COSTS TABLE ═══ */}
      {armies.length > 0 && (
        <div className="game-card p-0 overflow-hidden">
          <div className="px-5 pt-4 pb-2">
            <h3 className="text-base font-display font-semibold flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" /> Náklady na armádu
            </h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs px-3">Armáda</TableHead>
                <TableHead className="text-xs px-3">Typ</TableHead>
                <TableHead className="text-xs px-3 text-right">Železa/kolo</TableHead>
                <TableHead className="text-xs px-3 text-right">Stav</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {armies.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="text-sm px-3 font-semibold">{a.army_name}</TableCell>
                  <TableCell className="text-xs px-3">{a.army_type}</TableCell>
                  <TableCell className="text-sm px-3 text-right">{a.iron_cost}</TableCell>
                  <TableCell className="text-xs px-3 text-right">
                    <Badge variant={a.status === "Aktivní" ? "default" : "secondary"} className="text-[10px]">{a.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ═══ DRIVERS: Top producers / consumers ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="game-card p-5">
          <h3 className="text-sm font-display font-semibold flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-success" /> Top producenti (obilí)
          </h3>
          {[...myCities].sort((a, b) => (b.last_turn_grain_prod || 0) - (a.last_turn_grain_prod || 0)).slice(0, 5).map(c => (
            <div key={c.id} className="flex justify-between text-sm py-1.5 cursor-pointer hover:text-primary border-b border-border/30 last:border-0" onClick={() => onEntityClick?.("city", c.id)}>
              <span>{c.name}</span>
              <span className="font-semibold text-success">+{c.last_turn_grain_prod || 0}</span>
            </div>
          ))}
        </div>
        <div className="game-card p-5">
          <h3 className="text-sm font-display font-semibold flex items-center gap-2 mb-3">
            <TrendingDown className="h-4 w-4 text-destructive" /> Top spotřebitelé (obilí)
          </h3>
          {[...myCities].sort((a, b) => (b.last_turn_grain_cons || 0) - (a.last_turn_grain_cons || 0)).slice(0, 5).map(c => (
            <div key={c.id} className="flex justify-between text-sm py-1.5 cursor-pointer hover:text-primary border-b border-border/30 last:border-0" onClick={() => onEntityClick?.("city", c.id)}>
              <span>{c.name}</span>
              <span className="font-semibold text-destructive">-{c.last_turn_grain_cons || 0}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ CITY TABLE ═══ */}
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

      {/* ═══ ADMIN DEBUG ═══ */}
      {myRole === "admin" && (
        <div>
          <Button variant="ghost" size="sm" onClick={() => setShowDebug(!showDebug)} className="text-xs gap-1">
            <Code className="h-3 w-3" />{showDebug ? "Skrýt" : "Debug"} realm_resources
          </Button>
          {showDebug && realm && (
            <pre className="mt-2 p-3 rounded bg-muted text-[10px] overflow-auto max-h-60 border border-border">
              {JSON.stringify(realm, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

export default EconomyTab;
