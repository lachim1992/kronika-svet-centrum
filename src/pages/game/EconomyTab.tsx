import { useState, useCallback, useMemo, Suspense, lazy } from "react";
import { useDevMode } from "@/hooks/useDevMode";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Skull,
  ArrowUpDown,
  BarChart3,
  Code,
  Loader2,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { Button } from "@/components/ui/button";
import { toast as sonnerToast } from "sonner";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { SETTLEMENT_LABELS } from "@/lib/economyConstants";
import { supabase } from "@/integrations/supabase/client";

import ProductionOverviewCard from "@/components/economy/ProductionOverviewCard";
import WorkforcePanel from "@/components/economy/WorkforcePanel";
import PopulationPanel from "@/components/economy/PopulationPanel";
import MarketsHub from "@/components/economy/MarketsHub";
import TreasuryHub from "@/components/economy/TreasuryHub";
import { getFiscalIncome } from "@/lib/economyFlow";

// Dev-only debug tab (lazy)
const EconomyDebugTab = lazy(() => import("@/components/economy/EconomyDebugTab"));

// Dev panels lazy-loaded (Sprint 1 Krok 6 — import gate)
const EconomyTabDevPanels = lazy(
  () => import("@/components/economy/EconomyTabDevPanels"),
);

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

const tabTrigger =
  "text-xs font-display rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm whitespace-nowrap px-3";

const EconomyTab = ({
  sessionId,
  currentPlayerName,
  currentTurn,
  cities,
  realm,
  myRole,
  onEntityClick,
  onRefetch,
  onTabChange,
}: Props) => {
  const { devMode } = useDevMode();
  const [citySortKey, setCitySortKey] = useState<CitySortKey>("population");
  const [citySortAsc, setCitySortAsc] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const myCities = useMemo(
    () => cities.filter(c => c.owner_player === currentPlayerName),
    [cities, currentPlayerName],
  );

  const totalWealth = realm?.total_wealth ?? 0; // fiskální stream součet
  const totalGdp = (realm as any)?.total_gdp ?? 0; // ekonomická aktivita (produkce + export)
  const totalCapacity = realm?.total_capacity ?? 0;
  // Sjednocený fiskální zdroj — stejná čísla jako HUD a TreasuryHub
  const fi = getFiscalIncome(realm);
  const mobRate = realm?.mobilization_rate || 0.1;
  const currentMob = Math.round(mobRate * 100);

  const alerts: { text: string; severity: "error" | "warning" }[] = [];
  const famineCities = myCities.filter(c => c.famine_turn);
  if (famineCities.length > 0)
    alerts.push({ text: `${famineCities.length} sídel trpí hladomorem!`, severity: "error" });
  if (currentMob > 20)
    alerts.push({ text: `Vysoká mobilizace (${currentMob}%)`, severity: "warning" });

  const sortedCities = useMemo(() => {
    const arr = [...myCities];
    arr.sort((a, b) => {
      let va: number | string = 0,
        vb: number | string = 0;
      switch (citySortKey) {
        case "name":
          va = a.name;
          vb = b.name;
          return citySortAsc
            ? String(va).localeCompare(String(vb))
            : String(vb).localeCompare(String(va));
        case "population":
          va = a.population_total || 0;
          vb = b.population_total || 0;
          break;
        case "settlement":
          va = a.settlement_level || "";
          vb = b.settlement_level || "";
          return citySortAsc
            ? String(va).localeCompare(String(vb))
            : String(vb).localeCompare(String(va));
        case "vulnerability":
          va = a.vulnerability_score || 0;
          vb = b.vulnerability_score || 0;
          break;
        case "balance":
          va = 0;
          vb = 0;
          break;
      }
      return citySortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return arr;
  }, [myCities, citySortKey, citySortAsc]);

  const handleCitySort = (key: CitySortKey) => {
    if (citySortKey === key) setCitySortAsc(!citySortAsc);
    else {
      setCitySortKey(key);
      setCitySortAsc(false);
    }
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
        sonnerToast.success(`Ekonomika přepočítána — 6 kroků, ${data.totalMs}ms`);
      } else {
        const failedStep = data?.steps?.find((s: any) => !s.ok);
        sonnerToast.warning(
          `Přepočet selhal ve kroku ${failedStep?.name || "neznámý"}. Stav nemusí být konzistentní.`,
        );
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
      className={`h-3 w-3 inline ml-0.5 cursor-pointer ${
        citySortKey === field ? "text-primary" : "text-muted-foreground/50"
      }`}
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
          <p className="text-xs text-muted-foreground">
            Rok {currentTurn} · {myCities.length} sídel
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto text-xs h-8 gap-1.5 border-border/50"
          onClick={handleRecompute}
          disabled={recomputing}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${recomputing ? "animate-spin" : ""}`} />
          {recomputing ? "Počítám…" : "Přepočítat"}
        </Button>
      </div>

      {/* ═══ ALERTS ═══ */}
      {alerts.length > 0 && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 space-y-1.5 animate-fade-in">
          {alerts.map((a, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 text-xs ${
                a.severity === "error" ? "text-destructive" : "text-foreground"
              }`}
            >
              {a.severity === "error" ? (
                <Skull className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              )}
              <span>{a.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* ═══ MACRO SUMMARY ROW ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in">
        {[
          {
            icon: "💰",
            label: "Bohatství",
            value: Math.round(realm?.gold_reserve ?? 0).toString(),
            // SSOT: hrubý příjem státu /kolo (sjednoceno s HUD a TreasuryHub)
            sub: `+${fi.totalIncome.toFixed(1)}/kolo`,
            tooltip: "Pokladnice. Sub: fiskální příjem (daně, cla, tržní výnos) plynoucí do státní pokladny.",
          },
          {
            icon: "📊",
            label: "GDP",
            value: Math.round(totalGdp).toString(),
            sub: "ekon. aktivita",
            tooltip: "Hrubá ekonomická aktivita: hodnota domácí produkce + objem exportu (basket_trade_flows). NE státní příjem.",
          },
          {
            icon: "🌾",
            label: "Zásoby",
            value: `${Math.round(realm?.grain_reserve ?? 0)}`,
            sub: `/${Math.round(realm?.granary_capacity ?? 0)}`,
            tooltip: "Obilní rezervy / kapacita sýpek.",
          },
          {
            icon: "🏛️",
            label: "Kapacita",
            value: totalCapacity.toFixed(1),
            sub: "celkem",
            tooltip: "Logistická kapacita říše (součet uzlů).",
          },
        ].map(s => (
          <div
            key={s.label}
            title={s.tooltip}
            className="rounded-xl border border-border/40 bg-card/50 p-4 space-y-1 hover:border-primary/30 transition-colors"
          >
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span>{s.icon}</span> {s.label}
            </div>
            <div className="text-2xl font-bold font-display text-primary tracking-tight">
              {s.value}
            </div>
            <div className="text-[10px] text-muted-foreground">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ═══ TABBED CONTENT — 4 root tabs ═══ */}
      <Tabs defaultValue="production" className="space-y-4">
        <ScrollArea className="w-full">
          <TabsList className="inline-flex w-auto min-w-full h-10 bg-muted/30 rounded-xl p-1 gap-1">
            <TabsTrigger value="production" className={tabTrigger}>
              🌾 Produkce
            </TabsTrigger>
            <TabsTrigger value="markets" className={tabTrigger}>
              🏪 Trhy & Obchod
            </TabsTrigger>
            <TabsTrigger value="treasury" className={tabTrigger}>
              🏛️ Pokladnice
            </TabsTrigger>
            <TabsTrigger value="cities" className={tabTrigger}>
              🏙️ Sídla
            </TabsTrigger>
            {devMode && (
              <TabsTrigger value="debug" className={tabTrigger}>
                🧪 Debug
              </TabsTrigger>
            )}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {/* ═══ PRODUCTION TAB ═══ */}
        <TabsContent value="production" className="space-y-5 animate-fade-in">
          {realm && <ProductionOverviewCard realm={realm} />}
          <WorkforcePanel cities={myCities} mobilizationRate={mobRate} />
          <PopulationPanel cities={myCities} realm={realm} />
        </TabsContent>

        {/* ═══ MARKETS TAB ═══ */}
        <TabsContent value="markets" className="space-y-5 animate-fade-in">
          <MarketsHub
            sessionId={sessionId}
            currentPlayerName={currentPlayerName}
            currentTurn={currentTurn}
            cities={cities}
            realm={realm}
            onRefetch={onRefetch}
          />
        </TabsContent>

        {/* ═══ TREASURY TAB ═══ */}
        <TabsContent value="treasury" className="space-y-5 animate-fade-in">
          <TreasuryHub
            sessionId={sessionId}
            currentPlayerName={currentPlayerName}
            realm={realm}
            onRefetch={onRefetch}
          />
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
                  <TableHead className="text-xs px-3">
                    Město <SortIcon field="name" />
                  </TableHead>
                  <TableHead className="text-xs px-3">
                    Úroveň <SortIcon field="settlement" />
                  </TableHead>
                  <TableHead className="text-xs px-3 text-right">
                    Pop. <SortIcon field="population" />
                  </TableHead>
                  <TableHead className="text-xs px-3 text-right">Stabilita</TableHead>
                  <TableHead className="text-xs px-3 text-center">Stav</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCities.map(c => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => onEntityClick?.("city", c.id)}
                  >
                    <TableCell className="text-sm px-3 font-semibold">
                      {c.name}
                      {c.famine_turn && <Skull className="h-3 w-3 inline ml-1 text-destructive" />}
                      {c.is_capital && <span className="text-[9px] ml-1 text-primary">★</span>}
                    </TableCell>
                    <TableCell className="text-xs px-3">
                      <Badge variant="secondary" className="text-[10px]">
                        {SETTLEMENT_LABELS[c.settlement_level] || c.settlement_level}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm px-3 text-right font-mono">
                      {(c.population_total || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm px-3 text-right">
                      <span
                        className={
                          (c.city_stability || 50) < 30
                            ? "text-destructive"
                            : (c.city_stability || 50) < 50
                            ? "text-amber-500"
                            : ""
                        }
                      >
                        {c.city_stability || 50}%
                      </span>
                    </TableCell>
                    <TableCell className="text-xs px-3 text-center">
                      {c.famine_turn ? (
                        <Badge variant="destructive" className="text-[9px]">
                          Hlad
                        </Badge>
                      ) : c.epidemic_active ? (
                        <Badge variant="destructive" className="text-[9px]">
                          Epidemie
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[9px]">
                          OK
                        </Badge>
                      )}
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

        {/* ═══ DEBUG TAB (dev-only) ═══ */}
        {devMode && (
          <TabsContent value="debug" className="space-y-5 animate-fade-in">
            <Suspense
              fallback={
                <div className="text-xs text-muted-foreground p-4 text-center">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                  Načítám debug…
                </div>
              }
            >
              <EconomyDebugTab
                sessionId={sessionId}
                currentPlayerName={currentPlayerName}
                currentTurn={currentTurn}
                cities={cities}
                realm={realm}
              />
            </Suspense>
          </TabsContent>
        )}
      </Tabs>

      {/* ═══ DEV PANELS (lazy, gated) ═══ */}
      {devMode && (
        <Suspense
          fallback={
            <div className="text-xs text-muted-foreground p-4 text-center">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
              Načítám dev panely…
            </div>
          }
        >
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDebug(!showDebug)}
            className="text-xs gap-1"
          >
            <Code className="h-3 w-3" />
            {showDebug ? "Skrýt" : "Debug"} realm_resources
          </Button>
          {showDebug && realm && (
            <pre className="mt-2 p-3 rounded-lg bg-muted/30 text-[10px] overflow-auto max-h-60 border border-border/30">
              {JSON.stringify(realm, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* v4.3 badge */}
      <div className="flex justify-center pt-2 pb-4">
        <Badge variant="outline" className="text-[9px] text-muted-foreground border-border/30">
          Ekonomika v4.3 — sjednocený fiskální totál, 6-krokový refresh chain
        </Badge>
      </div>
    </div>
  );
};

export default EconomyTab;
