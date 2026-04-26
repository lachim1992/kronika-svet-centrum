import { useState, useCallback, useMemo, Suspense, lazy } from "react";
import { useDevMode } from "@/hooks/useDevMode";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Users, Gauge,
  AlertTriangle, TrendingUp, TrendingDown, Minus,
  Skull, ArrowUpDown, BarChart3, ShieldAlert, Info, RefreshCw,
  ChevronDown, Code, Loader2, MessageSquare, Network, Zap
} from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { Button } from "@/components/ui/button";
import { toast as sonnerToast } from "sonner";
import { toast } from "@/hooks/use-toast";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  SETTLEMENT_LABELS,
  computeWorkforceBreakdown,
} from "@/lib/economyConstants";
import { supabase } from "@/integrations/supabase/client";
import TradePanel from "@/components/TradePanel";
import SupplyChainPanel from "@/components/SupplyChainPanel";
import PrestigeBreakdown from "@/components/economy/PrestigeBreakdown";
import StrategicResourcesDetail from "@/components/economy/StrategicResourcesDetail";
import FaithPanel from "@/components/economy/FaithPanel";
import PopulationPanel from "@/components/economy/PopulationPanel";
import MilitaryUpkeepPanel from "@/components/economy/MilitaryUpkeepPanel";
import FiscalSubTab from "@/components/economy/FiscalSubTab";
import DemandFulfillmentPanel from "@/components/economy/DemandFulfillmentPanel";
import MarketSharePanel from "@/components/economy/MarketSharePanel";
import NeutralNodeContributionPanel from "@/components/economy/NeutralNodeContributionPanel";
import MarketPerformancePanel from "@/components/economy/MarketPerformancePanel";

// Dev panels lazy-loaded (Sprint 1 Krok 6 — import gate)
const EconomyTabDevPanels = lazy(() => import("@/components/economy/EconomyTabDevPanels"));

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  cities: any[];
  /** Canonical realm_resources from useGameSession */
  realm: any;
  myRole?: string;
  onEntityClick?: (type: string, id: string) => void;
  onRefetch?: () => void;
  onTabChange?: (tab: string) => void;
}

type CitySortKey = "name" | "population" | "settlement" | "vulnerability" | "balance";

const EconomyTab = ({ sessionId, currentPlayerName, currentTurn, cities, realm, myRole, onEntityClick, onRefetch, onTabChange }: Props) => {
  const { devMode } = useDevMode();
  const [citySortKey, setCitySortKey] = useState<CitySortKey>("population");
  const [citySortAsc, setCitySortAsc] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const myCities = useMemo(() => cities.filter(c => c.owner_player === currentPlayerName), [cities, currentPlayerName]);

  const totalProduction = realm?.total_production ?? 0;
  const totalWealth = realm?.total_wealth ?? 0;
  const totalCapacity = realm?.total_capacity ?? 0;

  const mobRate = realm?.mobilization_rate || 0.1;
  const wf = computeWorkforceBreakdown(myCities, mobRate);
  const currentMob = Math.round(mobRate * 100);

  const alerts: { text: string; severity: "error" | "warning" }[] = [];
  const famineCities = myCities.filter(c => c.famine_turn);
  if (famineCities.length > 0) alerts.push({ text: `${famineCities.length} sídel trpí hladomorem!`, severity: "error" });
  if (currentMob > 20) alerts.push({ text: `Vysoká mobilizace (${currentMob}%)`, severity: "warning" });

  const sortedCities = useMemo(() => {
    const arr = [...myCities];
    arr.sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0;
      switch (citySortKey) {
        case "name": va = a.name; vb = b.name; return citySortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
        case "population": va = a.population_total || 0; vb = b.population_total || 0; break;
        case "settlement": va = a.settlement_level || ""; vb = b.settlement_level || ""; return citySortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
        case "vulnerability": va = a.vulnerability_score || 0; vb = b.vulnerability_score || 0; break;
        case "balance": va = 0; vb = 0; break;
      }
      return citySortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return arr;
  }, [myCities, citySortKey, citySortAsc]);

  const handleCitySort = (key: CitySortKey) => {
    if (citySortKey === key) setCitySortAsc(!citySortAsc);
    else { setCitySortKey(key); setCitySortAsc(false); }
  };

  const handleRecompute = useCallback(async () => {
    setRecomputing(true);
    try {
      const { data, error } = await supabase.functions.invoke("refresh-economy", {
        body: { session_id: sessionId },
      });
      if (error) {
        if (error.message?.includes("already_in_progress") || (error as any)?.status === 409) {
          sonnerToast.info("Přepočet již probíhá");
          return;
        }
        throw error;
      }
      if (data?.ok) {
        sonnerToast.success(`Ekonomika přepočítána — 4 kroky, ${data.totalMs}ms`);
      } else {
        const failedStep = data?.steps?.find((s: any) => !s.ok);
        sonnerToast.warning(`Přepočet selhal ve kroku ${failedStep?.name || "neznámý"}. Stav nemusí být konzistentní.`);
      }
      onRefetch?.();
    } catch (e: any) {
      sonnerToast.error(`Chyba přepočtu: ${e.message}`);
    } finally {
      setRecomputing(false);
    }
  }, [sessionId, onRefetch]);

  const SortIcon = ({ field }: { field: CitySortKey }) => (
    <ArrowUpDown
      className={`h-3 w-3 inline ml-0.5 cursor-pointer ${citySortKey === field ? "text-primary" : "text-muted-foreground/50"}`}
      onClick={() => handleCitySort(field)}
    />
  );

  return (
    <div className="space-y-5 pb-24 px-1">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center gap-3 pt-2">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <BarChart3 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-display font-bold tracking-tight">Ekonomika</h2>
          <p className="text-xs text-muted-foreground">Rok {currentTurn} · {myCities.length} sídel</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto text-xs h-8 gap-1.5 border-border/50" onClick={handleRecompute} disabled={recomputing}>
          <RefreshCw className={`h-3.5 w-3.5 ${recomputing ? "animate-spin" : ""}`} />
          {recomputing ? "Počítám…" : "Přepočítat"}
        </Button>
      </div>

      {/* ═══ ALERTS ═══ */}
      {alerts.length > 0 && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 space-y-1.5 animate-fade-in">
          {alerts.map((a, i) => (
            <div key={i} className={`flex items-center gap-2 text-xs ${a.severity === "error" ? "text-destructive" : "text-foreground"}`}>
              {a.severity === "error" ? <Skull className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
              <span>{a.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* ═══ MACRO SUMMARY ROW ═══ */}
      <div className="grid grid-cols-3 gap-3 animate-fade-in">
        {[
          { icon: "💰", label: "Bohatství", value: Math.round(realm?.gold_reserve ?? 0).toString(), sub: `+${totalWealth.toFixed(1)}/k` },
          { icon: "🌾", label: "Zásoby", value: `${Math.round(realm?.grain_reserve ?? 0)}`, sub: `/${Math.round(realm?.granary_capacity ?? 0)}` },
          { icon: "🏛️", label: "Kapacita", value: totalCapacity.toFixed(1), sub: "celkem" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border/40 bg-card/50 p-4 space-y-1 hover:border-primary/30 transition-colors">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span>{s.icon}</span> {s.label}
            </div>
            <div className="text-2xl font-bold font-display text-primary tracking-tight">{s.value}</div>
            <div className="text-[10px] text-muted-foreground">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ═══ TABBED CONTENT ═══ */}
      <Tabs defaultValue="overview" className="space-y-4">
        <ScrollArea className="w-full">
          <TabsList className="inline-flex w-auto min-w-full h-10 bg-muted/30 rounded-xl p-1 gap-1">
            <TabsTrigger value="overview" className="text-xs font-display rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm whitespace-nowrap px-3">
              📊 Přehled
            </TabsTrigger>
            <TabsTrigger value="markets" className="text-xs font-display rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm whitespace-nowrap px-3">
              📈 Trhy
            </TabsTrigger>
            <TabsTrigger value="supply" className="text-xs font-display rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm whitespace-nowrap px-3">
              🔗 Supply Chain
            </TabsTrigger>
            <TabsTrigger value="fiscal" className="text-xs font-display rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm whitespace-nowrap px-3">
              🏛️ Příjmy státu
            </TabsTrigger>
            <TabsTrigger value="cities" className="text-xs font-display rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm whitespace-nowrap px-3">
              🏙️ Sídla
            </TabsTrigger>
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {/* ═══ OVERVIEW TAB ═══ */}
        <TabsContent value="overview" className="space-y-5 animate-fade-in">
          {/* Workforce */}
          <TooltipProvider>
            <div className="rounded-xl border border-border/40 bg-card/50 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <h3 className="font-display font-semibold text-sm">Lidská síla</h3>
                <InfoTip side="right">Pracovní síla = celková populace − vojáci. Mobilizace nad 15% způsobuje penalizace produkce.</InfoTip>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: "Pracovní síla", value: wf.workforce, alert: false },
                  { label: "Vojáci", value: wf.mobilized, alert: false },
                  { label: "Mobilizace", value: `${currentMob}%`, alert: wf.isOverMob },
                ].map(w => (
                  <div key={w.label} className={`rounded-lg p-3 ${w.alert ? "bg-destructive/10 border border-destructive/20" : "bg-muted/30"}`}>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{w.label}</div>
                    <div className={`text-xl font-bold font-display ${w.alert ? "text-destructive" : ""}`}>{w.value}</div>
                  </div>
                ))}
              </div>
              {wf.isOverMob && (
                <div className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3" />
                  Překročena mobilizační hranice — produkce penalizována o {Math.round(wf.overMobPenalty * 100)}%
                </div>
              )}
            </div>
          </TooltipProvider>

          {/* Grain Reserve */}
          {realm && (
            <div className="rounded-xl border border-border/40 bg-card/50 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🌾</span>
                <h3 className="font-display font-semibold text-sm">Zásoby obilí</h3>
                <span className="ml-auto text-sm font-mono font-bold text-primary">
                  {Math.round(realm.grain_reserve || 0)} / {Math.round(realm.granary_capacity || 0)}
                </span>
              </div>
              <Progress value={Math.min(100, ((realm.grain_reserve || 0) / Math.max(1, realm.granary_capacity || 1)) * 100)} className="h-2.5" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Produkce: {realm.last_turn_grain_prod || 0}</span>
                <span>Spotřeba: {realm.last_turn_grain_cons || 0}</span>
                <span className={`font-semibold ${(realm.last_turn_grain_net || 0) >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                  Bilance: {(realm.last_turn_grain_net || 0) >= 0 ? "+" : ""}{realm.last_turn_grain_net || 0}
                </span>
              </div>
            </div>
          )}

          {/* Wealth Reserve */}
          {realm && (
            <div className="rounded-xl border border-border/40 bg-card/50 p-5 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">💰</span>
                <h3 className="font-display font-semibold text-sm">Pokladna</h3>
                <span className="ml-auto text-2xl font-mono font-bold text-primary">{Math.round(realm.gold_reserve || 0)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Tok ze sítě: +{totalWealth.toFixed(1)}/kolo · Produkční rezerva: {Math.round(realm.production_reserve || 0)}
              </div>
            </div>
          )}

          {realm && <PrestigeBreakdown realm={realm} />}
          {realm && <StrategicResourcesDetail realm={realm} />}
          {realm && <FaithPanel realm={realm} cities={myCities} />}
          <PopulationPanel cities={myCities} realm={realm} />
          {realm && <MilitaryUpkeepPanel realm={realm} />}
        </TabsContent>

        {/* ═══ MARKETS TAB ═══ */}
        <TabsContent value="markets" className="space-y-5 animate-fade-in">
          {realm && <MarketPerformancePanel realm={realm} />}
          <DemandFulfillmentPanel sessionId={sessionId} playerName={currentPlayerName} cities={cities} />
          <MarketSharePanel sessionId={sessionId} playerName={currentPlayerName} />
          <NeutralNodeContributionPanel sessionId={sessionId} playerName={currentPlayerName} />
          <TradePanel
            sessionId={sessionId}
            currentPlayerName={currentPlayerName}
            currentTurn={currentTurn}
            myCities={myCities}
            allCities={cities}
            realm={realm}
            onRefetch={onRefetch}
          />
        </TabsContent>

        {/* ═══ SUPPLY CHAIN TAB ═══ */}
        <TabsContent value="supply" className="space-y-5 animate-fade-in">
          <SupplyChainPanel sessionId={sessionId} playerName={currentPlayerName} currentTurn={currentTurn} />
        </TabsContent>

        {/* ═══ FISCAL TAB ═══ */}
        <TabsContent value="fiscal" className="space-y-5 animate-fade-in">
          {realm && (
            <FiscalSubTab realm={realm} sessionId={sessionId} playerName={currentPlayerName} onRefetch={onRefetch} />
          )}
        </TabsContent>

        {/* ═══ CITIES TAB ═══ */}
        <TabsContent value="cities" className="space-y-5 animate-fade-in">
          <div className="rounded-xl border border-border/40 bg-card/50 overflow-hidden">
            <div className="px-5 pt-4 pb-2">
              <h3 className="text-sm font-display font-semibold flex items-center gap-2">
                🏙️ Přehled sídel
                <InfoTip side="right">Ekonomické metriky čtené z realm_resources.</InfoTip>
              </h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs px-3">Město <SortIcon field="name" /></TableHead>
                  <TableHead className="text-xs px-3">Úroveň <SortIcon field="settlement" /></TableHead>
                  <TableHead className="text-xs px-3 text-right">Pop. <SortIcon field="population" /></TableHead>
                  <TableHead className="text-xs px-3 text-right">Stabilita</TableHead>
                  <TableHead className="text-xs px-3 text-center">Stav</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCities.map(c => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => onEntityClick?.("city", c.id)}>
                    <TableCell className="text-sm px-3 font-semibold">
                      {c.name}
                      {c.famine_turn && <Skull className="h-3 w-3 inline ml-1 text-destructive" />}
                      {c.is_capital && <span className="text-[9px] ml-1 text-primary">★</span>}
                    </TableCell>
                    <TableCell className="text-xs px-3">
                      <Badge variant="secondary" className="text-[10px]">{SETTLEMENT_LABELS[c.settlement_level] || c.settlement_level}</Badge>
                    </TableCell>
                    <TableCell className="text-sm px-3 text-right font-mono">{(c.population_total || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-sm px-3 text-right">
                      <span className={(c.city_stability || 50) < 30 ? "text-destructive" : (c.city_stability || 50) < 50 ? "text-amber-500" : ""}>
                        {c.city_stability || 50}%
                      </span>
                    </TableCell>
                    <TableCell className="text-xs px-3 text-center">
                      {c.famine_turn ? <Badge variant="destructive" className="text-[9px]">Hlad</Badge>
                        : c.epidemic_active ? <Badge variant="destructive" className="text-[9px]">Epidemie</Badge>
                        : <Badge variant="secondary" className="text-[9px]">OK</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs gap-1.5 border-border/40"
            onClick={() => onTabChange?.("council")}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Poradit se s rádci o ekonomice
          </Button>
        </TabsContent>
      </Tabs>

      {/* ═══ DEV PANELS (lazy, gated) ═══ */}
      {devMode && (
        <Suspense fallback={<div className="text-xs text-muted-foreground p-4 text-center"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Načítám dev panely…</div>}>
          <EconomyTabDevPanels
            sessionId={sessionId}
            currentPlayerName={currentPlayerName}
            cities={cities}
            realm={realm}
          />
        </Suspense>
      )}

      {/* ═══ ADMIN DEBUG ═══ */}
      {myRole === "admin" && (
        <div className="pt-2">
          <Button variant="ghost" size="sm" onClick={() => setShowDebug(!showDebug)} className="text-xs gap-1">
            <Code className="h-3 w-3" />{showDebug ? "Skrýt" : "Debug"} realm_resources
          </Button>
          {showDebug && realm && (
            <pre className="mt-2 p-3 rounded-lg bg-muted/30 text-[10px] overflow-auto max-h-60 border border-border/30">
              {JSON.stringify(realm, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* v4.2 badge */}
      <div className="flex justify-center pt-2 pb-4">
        <Badge variant="outline" className="text-[9px] text-muted-foreground border-border/30">
          Ekonomika v4.2 — sjednocený přepočet
        </Badge>
      </div>
    </div>
  );
};

export default EconomyTab;
