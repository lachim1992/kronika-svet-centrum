import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users, Gauge,
  AlertTriangle, TrendingUp, TrendingDown, Minus,
  Skull, ArrowUpDown, BarChart3, ShieldAlert, Info, RefreshCw,
  ChevronDown, Code, Loader2, MessageSquare
} from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from "@/components/ui/tooltip";
import { ensureRealmResources } from "@/lib/turnEngine";
import {
  RESOURCE_ICONS, RESOURCE_LABELS, SETTLEMENT_LABELS, SETTLEMENT_WEALTH,
  computeWealthIncome, computeArmyGoldUpkeep, computeWorkforceBreakdown,
} from "@/lib/economyConstants";
import { Wheat, Coins } from "lucide-react";
import TradePanel from "@/components/TradePanel";

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
  onTabChange?: (tab: string) => void;
}

type CitySortKey = "name" | "population" | "grain_prod" | "grain_cons" | "wood_prod" | "special" | "vulnerability";

const EconomyTab = ({ sessionId, currentPlayerName, currentTurn, cities, resources, armies, myRole, onEntityClick, onRefetch, onTabChange }: Props) => {
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
        .eq("session_id", sessionId).eq("player_name", currentPlayerName).maybeSingle(),
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
    // Use city-level data as source of truth for grain (without buffer)
    const cityGrainProd = myCities.reduce((s, c) => s + (c.last_turn_grain_prod || 0), 0);
    const grainBuffer = myCities.length <= 3 ? 10 : 0;
    const grainCons = myCities.reduce((s, c) => s + (c.last_turn_grain_cons || 0), 0);
    const totalIncome = cityGrainProd + grainBuffer;
    return { grainProd: cityGrainProd, grainBuffer, grainCons, grainNet: totalIncome - grainCons, totalIncome };
  }, [myCities]);

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

  // Wealth data — use shared computation from economyConstants
  const computedWealthIncome = computeWealthIncome(myCities);

  const wealthR = resMap["wealth"];
  const wealthUpkeep = wealthR?.upkeep || 0;
  const wealthIncome = computedWealthIncome > 0 ? computedWealthIncome : (wealthR?.income || 0);
  const wealthNet = wealthIncome - wealthUpkeep;
  const wealthStock = realm?.gold_reserve ?? wealthR?.stockpile ?? 0;

  // Wealth top sources breakdown — recompute from shared constants
  const tierTotal = myCities.filter(c => !c.status || c.status === "ok").reduce((s, c) => s + (SETTLEMENT_WEALTH[c.settlement_level] || 1), 0);
  const popTaxTotal = myCities.filter(c => !c.status || c.status === "ok").reduce((s, c) => s + Math.floor((c.population_total || 0) / 500), 0);
  const burgherTradeTotal = myCities.filter(c => !c.status || c.status === "ok").reduce((s, c) => s + Math.floor((c.population_burghers || 0) / 200), 0);
  const wealthSources: { label: string; value: number; type: "income" | "expense" }[] = [];
  if (tierTotal > 0) wealthSources.push({ label: "Daně sídel", value: tierTotal, type: "income" });
  if (popTaxTotal > 0) wealthSources.push({ label: "Daň z populace", value: popTaxTotal, type: "income" });
  if (burgherTradeTotal > 0) wealthSources.push({ label: "Obchod měšťanů", value: burgherTradeTotal, type: "income" });
  if (wealthUpkeep > 0) wealthSources.push({ label: "Výdaje správy & armády", value: wealthUpkeep, type: "expense" });
  const sportFundingPct = realm?.sport_funding_pct || 0;
  const sportFundingExpense = sportFundingPct > 0 ? Math.floor(wealthStock * sportFundingPct / 100) : 0;
  if (sportFundingExpense > 0) wealthSources.push({ label: `Sportovní financování (${sportFundingPct}%)`, value: sportFundingExpense, type: "expense" });

  // Alerts
  const alerts: { text: string; severity: "error" | "warning" }[] = [];
  const foodNet = totals.grainNet;
  if (foodNet < 0) alerts.push({ text: `Deficit obilí: ${foodNet}/kolo`, severity: "error" });
  const famineCities = myCities.filter(c => c.famine_turn);
  if (famineCities.length > 0) alerts.push({ text: `${famineCities.length} sídel trpí hladomorem!`, severity: "error" });
  const currentMob = realm ? Math.round((realm.mobilization_rate || 0.1) * 100) : 10;
  if (currentMob > 20) alerts.push({ text: `Vysoká mobilizace (${currentMob}%)`, severity: "warning" });

  // Workforce system — compute from new model
  const mobRate = realm?.mobilization_rate || 0.1;
  const wf = computeWorkforceBreakdown(myCities, mobRate);
  const computedPool = wf.effectiveActivePop;
  const availableManpower = computedPool - (realm?.manpower_committed || 0);
  const totalPeasants = myCities.reduce((s, c) => s + (c.population_peasants || 0), 0);

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
      const { data, error } = await supabase.functions.invoke("process-turn", {
        body: { sessionId, playerName: currentPlayerName },
      });
      if (error) throw error;
      const netGrain = data?.summary?.netGrain;
      toast({ title: "Ekonomika přepočítána", description: `Obilí netto = ${netGrain != null ? (netGrain >= 0 ? "+" : "") + netGrain : "?"}` });
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
    const upkeep = r?.upkeep || 0;
    if (rt === "food") {
      const totalGrainProd = myCities.reduce((s, c) => s + (c.last_turn_grain_prod || 0), 0);
      const totalGrainCons = myCities.reduce((s, c) => s + (c.last_turn_grain_cons || 0), 0);
      sources.push({ label: "Produkce sídel", value: totalGrainProd, type: "income" });
      if (myCities.length <= 3) sources.push({ label: "Bonus malé říše", value: 10, type: "income" });
      sources.push({ label: "Spotřeba populace", value: totalGrainCons, type: "expense" });
      const armyFood = upkeep > totalGrainCons ? upkeep - totalGrainCons : 0;
      if (armyFood > 0) {
        sources.push({ label: "Vojenská spotřeba", value: armyFood, type: "expense" });
      }
    } else if (rt === "wood") {
      const totalWood = myCities.reduce((s, c) => s + (c.last_turn_wood_prod || 0), 0);
      sources.push({ label: "Produkce sídel", value: totalWood, type: "income" });
      if (upkeep > 0) sources.push({ label: "Údržba budov", value: upkeep, type: "expense" });
    } else if (rt === "stone") {
      const totalStone = myCities.reduce((s, c) => s + (c.last_turn_stone_prod || 0), 0);
      sources.push({ label: "Produkce sídel", value: totalStone, type: "income" });
      if (upkeep > 0) sources.push({ label: "Stavební údržba", value: upkeep, type: "expense" });
    } else if (rt === "iron") {
      const totalIron = myCities.reduce((s, c) => s + (c.last_turn_iron_prod || 0), 0);
      sources.push({ label: "Železné doly", value: totalIron, type: "income" });
      if (upkeep > 0) sources.push({ label: "Vojenská údržba", value: upkeep, type: "expense" });
    } else {
      const income = r?.income || 0;
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
        <Collapsible>
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
                <TooltipProvider key={i}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex justify-between text-xs cursor-help">
                        <span className="text-muted-foreground flex items-center gap-1">
                          {src.label}
                          <Info className="h-2.5 w-2.5 text-muted-foreground/50" />
                        </span>
                        <span className={src.type === "income" ? "text-success font-semibold" : "text-destructive font-semibold"}>
                          {src.type === "income" ? "+" : "-"}{src.value}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-[240px] text-xs">
                      {src.label === "Daně sídel" && "Každé sídlo platí daň podle úrovně: Osada 1, Městečko 2, Město 4, Polis 6 zlata/kolo."}
                      {src.label === "Daň z populace" && "1 zlato za každých 500 obyvatel v říši. Čím víc lidí, tím víc příjmů."}
                      {src.label === "Obchod měšťanů" && "1 zlato za každých 200 měšťanů. Měšťané jsou obchodnická třída ve městech."}
                      {src.label === "Výdaje správy & armády" && "1 zlato za každých 100 vojáků v aktivních armádách."}
                      {src.label.startsWith("Sportovní financování") && `Podíl zlata investovaný do akademií a arén. Zvyšuje infrastrukturu, výživu a úroveň trenérů ve školách.`}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          )}

          {/* Expandable per-city wealth breakdown */}
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors pt-1">
              <ChevronDown className="h-3 w-3" />
              <span>Detailní rozpis po městech</span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-border/50 pt-3 space-y-3">
              {myCities.filter(c => !c.status || c.status === "ok").map(c => {
                const tierIncome = SETTLEMENT_WEALTH[c.settlement_level] || 1;
                const popTax = Math.floor((c.population_total || 0) / 500);
                const burgherTrade = Math.floor((c.population_burghers || 0) / 200);
                const cityTotal = tierIncome + popTax + burgherTrade;
                return (
                  <div key={c.id} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold cursor-pointer hover:text-primary" onClick={() => onEntityClick?.("city", c.id)}>
                      <span>{c.name}</span>
                      <span className="text-success">+{cityTotal}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[10px] text-muted-foreground pl-2">
                      <span>Daně: +{tierIncome}</span>
                      <span>Pop: +{popTax}</span>
                      <span>Obchod: +{burgherTrade}</span>
                    </div>
                  </div>
                );
              })}
              {wealthUpkeep > 0 && (
                <div className="flex justify-between text-xs border-t border-border/30 pt-2">
                  <span className="text-muted-foreground">Armádní upkeep</span>
                  <span className="text-destructive font-semibold">-{wealthUpkeep}</span>
                </div>
              )}
              <div className="flex justify-between text-xs font-bold border-t border-border pt-2">
                <span>Celkem netto</span>
                <span className={wealthNet < 0 ? "text-destructive" : "text-success"}>
                  {wealthNet >= 0 ? "+" : ""}{wealthNet}
                </span>
              </div>

              {/* Council link */}
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2 text-xs gap-1.5"
                onClick={() => onTabChange?.("council")}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Poradit se s rádci o ekonomice
              </Button>
            </div>
          </CollapsibleContent>
        </div>
        </Collapsible>

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
          <TooltipProvider>
          <div className="game-card p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-muted-foreground flex items-center gap-1.5 cursor-help">
                    <Users className="h-3.5 w-3.5 text-primary" /> Lidská síla
                    <Info className="h-2.5 w-2.5 text-muted-foreground/50" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[300px] text-xs space-y-1">
                  <p className="font-semibold">Systém pracovní síly</p>
                  <p>Aktivní populace = rolníci×1.0 + měšťané×0.7 + klerici×0.2, z toho {Math.round(wf.effectiveRatio * 100)}% je aktivní ({wf.effectiveActivePop}).</p>
                  <p>Při {Math.round(mobRate * 100)}% mobilizaci: {wf.mobilized} vojáků, {wf.workforce} pracovní síla.</p>
                  <p>Efektivita produkce: {Math.round(wf.workforceRatio * 100)}% (více mobilizace = méně surovin).</p>
                  <p className="text-muted-foreground italic">Upravitelné dekrety: active_pop_modifier, max_mobilization_modifier</p>
                </TooltipContent>
              </Tooltip>
              <span className="font-bold">{wf.workforce} prac. / {wf.mobilized} voj.</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-muted-foreground flex items-center gap-1.5 cursor-help">
                    <ShieldAlert className="h-3.5 w-3.5 text-primary" /> Stabilita
                    <Info className="h-2.5 w-2.5 text-muted-foreground/50" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[260px] text-xs">
                  Průměrná stabilita vašich sídel. Klesá při hladomoru, válkách a vysoké mobilizaci. Nízká stabilita zvyšuje riziko vzpour.
                </TooltipContent>
              </Tooltip>
              <span className={`font-bold ${(realm?.stability || 70) < 40 ? "text-destructive" : ""}`}>{realm?.stability || 70}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-muted-foreground flex items-center gap-1.5 cursor-help">
                    <Gauge className="h-3.5 w-3.5 text-primary" /> Mobilizace
                    <Info className="h-2.5 w-2.5 text-muted-foreground/50" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[260px] text-xs">
                  Procento rolníků odváděných do armády. Vyšší mobilizace = více vojáků, ale snížená produkce obilí (penalizace 0.5×) a pokles stability. Nastavuje se v ekonomickém popoveru na HUD liště.
                </TooltipContent>
              </Tooltip>
              <span className="font-bold">{currentMob}%</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-muted-foreground flex items-center gap-1.5 cursor-help">
                    <Wheat className="h-3.5 w-3.5 text-primary" /> Sýpky
                    <Info className="h-2.5 w-2.5 text-muted-foreground/50" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[260px] text-xs">
                  Celkové zásoby obilí v říši. Hladomor nastává až po úplném vyčerpání zásob při negativním netto příjmu. Kapacitu sýpek lze zvýšit vylepšením sídel.
                </TooltipContent>
              </Tooltip>
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
          </TooltipProvider>
        </div>
      </div>

      {/* ═══ RESOURCE TIER: Compact uniform cards ═══ */}
      <div>
        <h3 className="text-base font-display font-semibold flex items-center gap-2 mb-3">
          <Info className="h-4 w-4 text-primary" /> Suroviny
          <InfoTip side="right">Přehled všech surovin vaší říše. Produkce závisí na pracovní síle — vyšší mobilizace snižuje výnosy. Spotřeba obilí závisí na populaci.</InfoTip>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {compactResources.map(rt => {
            // For food/stone/iron: compute from city-level data, not player_resources (avoids buffer confusion)
            let income: number, upkeep: number, stockpile: number;
            if (rt === "food") {
              income = totals.totalIncome;
              upkeep = totals.grainCons;
              stockpile = grainReserve;
            } else if (rt === "stone") {
              income = myCities.reduce((s, c) => s + (c.last_turn_stone_prod || 0), 0);
              upkeep = 0;
              stockpile = resMap[rt]?.stockpile || 0;
            } else if (rt === "iron") {
              income = myCities.reduce((s, c) => s + (c.last_turn_iron_prod || 0), 0);
              upkeep = 0;
              stockpile = resMap[rt]?.stockpile || 0;
            } else {
              const r = resMap[rt];
              income = r?.income || 0;
              upkeep = r?.upkeep || 0;
              stockpile = r?.stockpile || 0;
            }
            const net = income - upkeep;
            const isDeficit = net < 0;
            const isFamine = rt === "food" && famineCities.length > 0;
            const sources = buildSources(rt);

            const resourceTips: Record<string, string> = {
              food: `Obilí živí vaši populaci. Produkce závisí na úrovni sídel a pracovní síle (efektivita ${Math.round(wf.workforceRatio * 100)}%). Spotřeba roste s počtem obyvatel: rolníci 0.005, měšťané 0.01, klerici 0.008 na osobu.`,
              wood: `Dřevo se těží ve všech sídlech. Produkce škálována pracovní silou (${Math.round(wf.workforceRatio * 100)}%). Slouží ke stavbám a vylepšením.`,
              stone: `Kámen je fixní surovina dle úrovně sídla (Osada: 2, Městečko: 3, Město: 4, Polis: 5). Škálováno pracovní silou (${Math.round(wf.workforceRatio * 100)}%).`,
              iron: `Železo produkují pouze sídla s železnými doly (25% šance při založení). Škálováno pracovní silou (${Math.round(wf.workforceRatio * 100)}%). Potřebné pro armádu.`,
            };

            return (
              <Collapsible key={rt}>
                <div className={`game-card p-4 space-y-2.5 ${isDeficit ? "border-destructive/30" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-primary">{RESOURCE_ICONS[rt]}</span>
                    <span className="font-display font-semibold text-sm">{RESOURCE_LABELS[rt]}</span>
                    <InfoTip side="bottom">{resourceTips[rt]}</InfoTip>
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
                          {sources.map((src, i) => {
                            const sourceTips: Record<string, string> = {
                              "Produkce sídel": "Součet základní produkce všech vašich sídel, škálováno aktuální pracovní silou.",
                              "Bonus malé říše": "Automatický bonus +10 obilí pro říše s 3 a méně městy. Kompenzuje počáteční nevýhodu.",
                              "Spotřeba populace": "Každý obyvatel spotřebovává obilí: rolníci 0.005, měšťané 0.01, klerici 0.008 na osobu/kolo.",
                              "Vojenská spotřeba": "1 jídlo za každých 500 vojáků v aktivních armádách.",
                              "Údržba budov": "Náklady na údržbu infrastruktury ve dřevě.",
                              "Stavební údržba": "Náklady na údržbu kamenných staveb.",
                              "Železné doly": "Produkce ze sídel s železnými doly. Pouze ~25% sídel má doly.",
                              "Vojenská údržba": "Spotřeba železa na údržbu armádního vybavení.",
                            };
                            return (
                              <div key={i} className="flex justify-between text-[11px]">
                                <span className="text-muted-foreground flex items-center gap-1">
                                  {src.label}
                                  {sourceTips[src.label] && <InfoTip side="left">{sourceTips[src.label]}</InfoTip>}
                                </span>
                                <span className={src.type === "income" ? "text-success" : "text-destructive"}>
                                  {src.type === "income" ? "+" : "-"}{src.value}
                                </span>
                              </div>
                            );
                          })}
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
              <InfoTip side="right">Každá aktivní armáda spotřebovává železo a zlato. 1 zlato / 100 vojáků, 1 jídlo / 500 vojáků.</InfoTip>
            </h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs px-3">Armáda</TableHead>
                <TableHead className="text-xs px-3">Typ</TableHead>
                <TableHead className="text-xs px-3 text-right">Železa/kolo <InfoTip>Množství železa spotřebovaného touto armádou za kolo.</InfoTip></TableHead>
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
            <InfoTip side="right">Sídla s nejvyšší produkcí obilí. Produkce závisí na úrovni sídla a pracovní síle.</InfoTip>
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
            <InfoTip side="right">Sídla s nejvyšší spotřebou obilí. Spotřeba roste s populací a podílem měšťanů/kleriků.</InfoTip>
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
          <h3 className="text-base font-display font-semibold flex items-center gap-2">
            Přehled sídel
            <InfoTip side="right">Detailní ekonomický rozpis všech vašich sídel. Kliknutím otevřete detail města.</InfoTip>
          </h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs px-3">Město <SortIcon field="name" /></TableHead>
              <TableHead className="text-xs px-3">Úroveň <InfoTip>Osada → Městečko → Město → Polis. Vyšší úroveň = více produkce a populace.</InfoTip></TableHead>
              <TableHead className="text-xs px-3 text-right">Pop <SortIcon field="population" /> <InfoTip>Celková populace sídla. Dělí se na rolníky, měšťany a kleriky.</InfoTip></TableHead>
              <TableHead className="text-xs px-3 text-right">🌾+ <SortIcon field="grain_prod" /> <InfoTip>Produkce obilí za kolo. Závisí na úrovni sídla a pracovní síle.</InfoTip></TableHead>
              <TableHead className="text-xs px-3 text-right">🌾- <SortIcon field="grain_cons" /> <InfoTip>Spotřeba obilí za kolo. Závisí na počtu a složení obyvatel.</InfoTip></TableHead>
              <TableHead className="text-xs px-3 text-right">🪵+ <SortIcon field="wood_prod" /> <InfoTip>Produkce dřeva. Škálováno pracovní silou.</InfoTip></TableHead>
              <TableHead className="text-xs px-3 text-right">⛏ <SortIcon field="special" /> <InfoTip>Produkce kamene. Fixní dle úrovně, škálováno pracovní silou.</InfoTip></TableHead>
              <TableHead className="text-xs px-3 text-right">⚒ Železo <InfoTip>Produkce železa. Pouze sídla s doly (~25% při založení).</InfoTip></TableHead>
              <TableHead className="text-xs px-3 text-right">Zranit. <SortIcon field="vulnerability" /> <InfoTip>Score zranitelnosti města. Vyšší = větší riziko hladomoru. Závisí na stabilitě, zásobách a úrovni.</InfoTip></TableHead>
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
                    {(c.last_turn_stone_prod || 0) > 0 ? `⛏ +${c.last_turn_stone_prod}` : "—"}
                  </TableCell>
                  <TableCell className="text-sm px-3 text-right">
                    {(c.last_turn_iron_prod || 0) > 0 ? `⚒ +${c.last_turn_iron_prod}` : "—"}
                  </TableCell>
                  <TableCell className="text-sm px-3 text-right">{(c.vulnerability_score || 0).toFixed(0)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* ═══ TRADE SYSTEM ═══ */}
      <TradePanel
        sessionId={sessionId}
        currentPlayerName={currentPlayerName}
        currentTurn={currentTurn}
        myCities={myCities}
        allCities={cities}
        realm={realm}
        onRefetch={onRefetch}
      />

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
