import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import CityManagement from "@/components/CityManagement";
import OnboardingChecklist from "@/components/OnboardingChecklist";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Crown, Castle, Swords, Users, Wheat,
  MapPin, ArrowUpDown, Skull, BarChart3,
  AlertTriangle, TrendingUp, TrendingDown, Minus,
  RefreshCw, ChevronDown, Code, Loader2, MessageSquare,
  Shield, Info
} from "lucide-react";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { InfoTip } from "@/components/ui/info-tip";
import type { EntityIndex } from "@/hooks/useEntityIndex";
import ProvinceOnboardingWizard from "@/components/ProvinceOnboardingWizard";
import { toast } from "sonner";

import { useDevMode } from "@/hooks/useDevMode";
import ExplainDrawer from "@/components/dev/ExplainDrawer";
import RealmLawsDecrees from "@/components/realm/RealmLawsDecrees";
import { ensureRealmResources } from "@/lib/turnEngine";
import {
  SETTLEMENT_LABELS as ECON_SETTLEMENT_LABELS,
  computeWorkforceBreakdown,
} from "@/lib/economyConstants";
import FaithPanel from "@/components/economy/FaithPanel";
import PopulationPanel from "@/components/economy/PopulationPanel";
import MilitaryUpkeepPanel from "@/components/economy/MilitaryUpkeepPanel";
import PrestigeBreakdown from "@/components/economy/PrestigeBreakdown";
import StrategicResourcesDetail from "@/components/economy/StrategicResourcesDetail";
import MobileRealmDashboard from "@/components/realm/MobileRealmDashboard";

const SETTLEMENT_LABELS: Record<string, string> = {
  HAMLET: "Osada", TOWNSHIP: "Městečko", CITY: "Město", POLIS: "Polis",
};

interface Props {
  sessionId: string;
  session: any;
  events: any[];
  memories: any[];
  players: any[];
  cities: any[];
  wonders: any[];
  chronicles: any[];
  worldCrises: any[];
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
  realm?: any;
  entityIndex?: EntityIndex;
  onEventClick?: (eventId: string) => void;
  onEntityClick?: (type: string, id: string) => void;
  onRefetch?: () => void;
  onFoundCity?: () => void;
  onTabChange?: (tab: string) => void;
}

type CitySortKey = "name" | "population" | "settlement" | "vulnerability";

const HomeTab = ({
  sessionId, session, cities, players, currentPlayerName, currentTurn, myRole,
  realm: realmProp, onEntityClick, onRefetch, onFoundCity, onTabChange,
}: Props) => {
  const isMobile = useIsMobile();
  const isMultiplayer = session?.game_mode === "tb_multi";
  const [localRealm, setLocalRealm] = useState<any>(null);
  const realm = realmProp ?? localRealm;
  const [stacks, setStacks] = useState<any[]>([]);
  const [managingCityId, setManagingCityId] = useState<string | null>(null);
  const [hasProvince, setHasProvince] = useState<boolean | null>(null);
  const [provinces, setProvinces] = useState<any[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [activeWars, setActiveWars] = useState<any[]>([]);
  const [explainTarget, setExplainTarget] = useState<{ metric: "population" | "grain_cap"; cityId: string } | null>(null);
  const { devMode } = useDevMode();
  const [recomputing, setRecomputing] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [citySortKey, setCitySortKey] = useState<CitySortKey>("population");
  const [citySortAsc, setCitySortAsc] = useState(false);

  const myCities = useMemo(() => cities.filter(c => c.owner_player === currentPlayerName), [cities, currentPlayerName]);
  const capital = useMemo(() => myCities.find(c => c.is_capital) || myCities[0], [myCities]);

  // Sprint 1 Krok 5: No province_nodes queries. Reads canonical shared data only.
  const fetchData = useCallback(async () => {
    const [realmRes, stacksRes, provRes] = await Promise.all([
      supabase.from("realm_resources").select("*")
        .eq("session_id", sessionId).eq("player_name", currentPlayerName).maybeSingle(),
      supabase.from("military_stacks").select("power")
        .eq("session_id", sessionId).eq("player_name", currentPlayerName).eq("is_active", true),
      supabase.from("provinces").select("id, name, owner_player")
        .eq("session_id", sessionId).eq("owner_player", currentPlayerName),
    ]);

    if (realmRes.data) {
      setLocalRealm(realmRes.data);
    } else {
      const r = await ensureRealmResources(sessionId, currentPlayerName);
      setLocalRealm(r);
    }
    setStacks(stacksRes.data || []);
    const provs = provRes.data || [];
    setProvinces(provs);
    const playerHasProvince = provs.length > 0;
    setHasProvince(playerHasProvince);
    if (!playerHasProvince && myRole !== "admin" && myCities.length === 0) {
      setShowOnboarding(true);
    }
  }, [sessionId, currentPlayerName, myRole, myCities.length]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const fetchWars = async () => {
      const { data } = await supabase.from("war_declarations")
        .select("*")
        .eq("session_id", sessionId)
        .in("status", ["active", "peace_offered"]);
      setActiveWars((data || []).filter((w: any) =>
        w.declaring_player === currentPlayerName || w.target_player === currentPlayerName
      ));
    };
    fetchWars();
  }, [sessionId, currentPlayerName, currentTurn]);

  const totalProduction = realm?.total_production ?? 0;
  const totalWealth = realm?.total_wealth ?? 0;
  const totalCapacity = realm?.total_capacity ?? 0;

  const mobRate = realm?.mobilization_rate || 0.1;
  const wf = computeWorkforceBreakdown(myCities, mobRate);
  const currentMob = Math.round(mobRate * 100);

  const totalPop = myCities.reduce((s, c) => s + (c.population_total || 0), 0);
  const totalPower = stacks.reduce((s, st) => s + (st.power || 0), 0);
  const famineCities = myCities.filter(c => c.famine_turn);

  const alerts: { text: string; severity: "error" | "warning" }[] = [];
  if (famineCities.length > 0) alerts.push({ text: `${famineCities.length} sídel trpí hladomorem!`, severity: "error" });
  if (currentMob > 20) alerts.push({ text: `Vysoká mobilizace (${currentMob}%)`, severity: "warning" });

  const handleRecompute = useCallback(async () => {
    setRecomputing(true);
    try {
      const { data, error } = await supabase.functions.invoke("refresh-economy", {
        body: { session_id: sessionId },
      });
      if (error) {
        if (error.message?.includes("already_in_progress") || (error as any)?.status === 409) {
          toast.info("Přepočet již probíhá");
          return;
        }
        throw error;
      }
      if (data?.ok) {
        toast.success(`Ekonomika přepočítána — 4 kroky, ${data.totalMs}ms`);
      } else {
        const failedStep = data?.steps?.find((s: any) => !s.ok);
        toast.warning(`Přepočet selhal ve kroku ${failedStep?.name || "neznámý"}.`);
      }
      await fetchData();
      onRefetch?.();
    } catch (e: any) {
      toast.error(`Chyba přepočtu: ${e.message}`);
    } finally {
      setRecomputing(false);
    }
  }, [sessionId, fetchData, onRefetch]);

  const sortedCitiesTable = useMemo(() => {
    const arr = [...myCities];
    arr.sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0;
      switch (citySortKey) {
        case "name": va = a.name; vb = b.name; return citySortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
        case "population": va = a.population_total || 0; vb = b.population_total || 0; break;
        case "settlement": va = a.settlement_level || ""; vb = b.settlement_level || ""; return citySortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
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

  const SortIcon = ({ field }: { field: CitySortKey }) => (
    <ArrowUpDown
      className={`h-3 w-3 inline ml-0.5 cursor-pointer ${citySortKey === field ? "text-primary" : "text-muted-foreground/50"}`}
      onClick={() => handleCitySort(field)}
    />
  );

  if (showOnboarding && hasProvince === false && myRole !== "admin") {
    return (
      <div className="space-y-6 pb-24 px-1">
        <div className="flex items-center gap-3 pt-2">
          <Crown className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-display font-bold">Vítejte ve světě!</h2>
          <span className="text-sm text-muted-foreground ml-auto font-display">Rok {currentTurn}</span>
        </div>
        <ProvinceOnboardingWizard
          sessionId={sessionId}
          currentPlayerName={currentPlayerName}
          currentTurn={currentTurn}
          myRole={myRole}
          onComplete={() => { setShowOnboarding(false); fetchData(); onRefetch?.(); }}
        />
      </div>
    );
  }

  if (managingCityId) {
    return (
      <div className="pb-24 px-1">
        <CityManagement
          sessionId={sessionId}
          cityId={managingCityId}
          currentPlayerName={currentPlayerName}
          currentTurn={currentTurn}
          onBack={() => { setManagingCityId(null); onRefetch?.(); }}
          onRefetch={onRefetch}
        />
      </div>
    );
  }

  if (isMobile) {
    return (
      <MobileRealmDashboard
        realm={realm}
        myCities={myCities}
        capital={capital}
        provinces={provinces}
        nodeStats={[]}
        stacks={stacks}
        activeWars={activeWars}
        famineCities={famineCities}
        isolatedNodes={[]}
        deficitNodes={[]}
        surplusNodes={[]}
        currentTurn={currentTurn}
        currentPlayerName={currentPlayerName}
        recomputing={recomputing}
        onRecompute={handleRecompute}
        onCityClick={onEntityClick}
        onTabChange={onTabChange}
        onFoundCity={onFoundCity}
      />
    );
  }

  return (
    <div className="space-y-6 pb-24 px-1">
      {/* Header */}
      <div className="flex items-center gap-2 sm:gap-3 pt-2 flex-wrap">
        <Crown className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
        <h2 className="text-lg sm:text-xl font-display font-bold">Moje říše</h2>
        <span className="text-xs sm:text-sm text-muted-foreground font-display">Rok {currentTurn}</span>
        <Button variant="outline" size="sm" className="ml-auto text-[10px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3" onClick={handleRecompute} disabled={recomputing}>
          <RefreshCw className={`h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 ${recomputing ? "animate-spin" : ""}`} />
          {recomputing ? "…" : "Přepočítat"}
        </Button>
      </div>

      {/* Alerts */}
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

      {/* Active Wars */}
      {activeWars.length > 0 && (
        <div className="game-card border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Swords className="h-5 w-5 text-destructive" />
            <span className="font-display font-bold text-destructive">Aktivní konflikty!</span>
          </div>
          <div className="space-y-1">
            {activeWars.map((w: any) => {
              const opponent = w.declaring_player === currentPlayerName ? w.target_player : w.declaring_player;
              const turns = currentTurn - (w.declared_turn || 0);
              return (
                <div key={w.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    <Swords className="h-3.5 w-3.5 text-destructive" />
                    <span className="font-semibold">{opponent}</span>
                    {w.status === "peace_offered" && (
                      <Badge variant="outline" className="text-[10px] ml-1">🕊️ Mírová nabídka</Badge>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">{turns} kol</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Capital & Province */}
      <div className="game-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Castle className="h-5 w-5 text-primary" />
          <h3 className="font-display font-semibold text-base">Hlavní město & provincie</h3>
        </div>

        {capital ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-display font-bold text-lg flex items-center gap-2">
                  {capital.name}
                  <Badge variant="secondary" className="text-[10px]">{SETTLEMENT_LABELS[capital.settlement_level] || capital.settlement_level}</Badge>
                  {capital.is_capital && <span className="text-primary text-xs">★ Hlavní město</span>}
                </h4>
                {capital.province && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3.5 w-3.5" />{capital.province}
                  </p>
                )}
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold font-display">{(capital.population_total || 0).toLocaleString()}</div>
                <div className="text-[10px] text-muted-foreground">obyvatel</div>
              </div>
            </div>
            {provinces.length > 0 && (
              <div className="text-xs text-muted-foreground">
                {provinces.length} {provinces.length === 1 ? "provincie" : "provincií"}: {provinces.map(p => p.name).join(", ")}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-6">
            <Castle className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground mb-3">Zatím neovládáte žádná sídla.</p>
            {myRole === "admin" ? (
              <Button size="sm" className="font-display" onClick={() => onFoundCity?.()}>Založit první město</Button>
            ) : (
              <Button size="sm" className="font-display" onClick={() => setShowOnboarding(true)}>Založit provincii a osadu</Button>
            )}
          </div>
        )}
      </div>

      {/* Workforce */}
      <div className="game-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h3 className="font-display font-semibold text-base">Lidská síla</h3>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
          <div className="bg-muted/40 rounded-lg p-2 sm:p-3">
            <div className="text-[8px] sm:text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5 sm:mb-1">Pracovní síla</div>
            <div className="text-lg sm:text-2xl font-bold font-display">{wf.workforce}</div>
          </div>
          <div className="bg-muted/40 rounded-lg p-2 sm:p-3">
            <div className="text-[8px] sm:text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5 sm:mb-1">Vojáci</div>
            <div className="text-lg sm:text-2xl font-bold font-display">{wf.mobilized}</div>
          </div>
          <div className={`rounded-lg p-2 sm:p-3 ${wf.isOverMob ? "bg-destructive/10" : "bg-muted/40"}`}>
            <div className="text-[8px] sm:text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5 sm:mb-1">Mobilizace</div>
            <div className={`text-lg sm:text-2xl font-bold font-display ${wf.isOverMob ? "text-destructive" : ""}`}>{currentMob}%</div>
          </div>
        </div>
        {wf.isOverMob && (
          <div className="text-xs text-destructive flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" />
            Překročena mobilizační hranice — produkce uzlů penalizována o {Math.round(wf.overMobPenalty * 100)}%
          </div>
        )}
      </div>

      {/* Grain Reserve */}
      {realm && (
        <div className="game-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🌾</span>
            <h3 className="font-display font-semibold text-base">Zásoby obilí</h3>
            <span className="ml-auto text-sm font-mono font-bold">
              {Math.round(realm.grain_reserve || 0)} / {Math.round(realm.granary_capacity || 0)}
            </span>
          </div>
          <Progress value={Math.min(100, ((realm.grain_reserve || 0) / Math.max(1, realm.granary_capacity || 1)) * 100)} className="h-3" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>⚒️ Produkce: {realm.last_turn_grain_prod || 0}</span>
            <span>🍽️ Spotřeba: {realm.last_turn_grain_cons || 0}</span>
            <span className={`font-semibold ${(realm.last_turn_grain_net || 0) >= 0 ? "text-accent" : "text-destructive"}`}>
              Bilance: {(realm.last_turn_grain_net || 0) >= 0 ? "+" : ""}{realm.last_turn_grain_net || 0}
            </span>
          </div>
          {(realm.famine_city_count || 0) > 0 && (
            <div className="text-xs text-destructive flex items-center gap-1.5">
              <Skull className="h-3 w-3" />
              {realm.famine_city_count} měst trpí hladomorem
            </div>
          )}
        </div>
      )}

      {/* Wealth Reserve */}
      {realm && (
        <div className="game-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">💰</span>
            <h3 className="font-display font-semibold text-base">Pokladna bohatství</h3>
            <span className="ml-auto text-2xl font-mono font-bold text-primary">{Math.round(realm.gold_reserve || 0)}</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>⚒️ Tok ze sítě: +{totalWealth.toFixed(1)}/kolo</span>
            <span>⚒️ Produkční rezerva: {Math.round(realm.production_reserve || 0)}</span>
          </div>
        </div>
      )}

      {/* Signal Cards */}
      {realm && <FaithPanel realm={realm} cities={myCities} />}
      <PopulationPanel cities={myCities} realm={realm} />
      {realm && <MilitaryUpkeepPanel realm={realm} />}
      {realm && <PrestigeBreakdown realm={realm} />}
      {realm && <StrategicResourcesDetail realm={realm} />}

      {/* Laws & Decrees */}
      <RealmLawsDecrees sessionId={sessionId} currentPlayerName={currentPlayerName} currentTurn={currentTurn} />

      {/* Onboarding Checklist */}
      <OnboardingChecklist
        sessionId={sessionId}
        currentPlayerName={currentPlayerName}
        currentTurn={currentTurn}
        cities={myCities}
        armies={stacks}
        onTabChange={() => {}}
        onDismiss={() => {}}
      />

      {/* City Table */}
      <div className="game-card p-0 overflow-hidden">
        <div className="px-3 sm:px-5 pt-3 sm:pt-4 pb-2">
          <h3 className="text-sm sm:text-base font-display font-semibold">Přehled sídel</h3>
        </div>

        {/* Mobile: card list */}
        <div className="sm:hidden divide-y divide-border">
          {sortedCitiesTable.map(c => (
            <div key={c.id} className="px-3 py-2.5 active:bg-muted/50" onClick={() => onEntityClick?.("city", c.id)}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold flex items-center gap-1">
                  {c.name}
                  {c.is_capital && <span className="text-[9px] text-primary">★</span>}
                  {c.famine_turn && <Skull className="h-3 w-3 text-destructive" />}
                </span>
                <Badge variant="secondary" className="text-[9px]">{SETTLEMENT_LABELS[c.settlement_level] || c.settlement_level}</Badge>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[10px]">
                <div>
                  <span className="text-muted-foreground">Pop </span>
                  <span className="font-semibold">{(c.population_total || 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Stab </span>
                  <span className="font-semibold">{c.city_stability || 50}%</span>
                </div>
                <div>
                  {c.famine_turn ? <Badge variant="destructive" className="text-[8px]">Hlad</Badge>
                    : <Badge variant="secondary" className="text-[8px]">OK</Badge>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: full table */}
        <div className="hidden sm:block">
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
              {sortedCitiesTable.map(c => (
                <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onEntityClick?.("city", c.id)}>
                  <TableCell className="text-sm px-3 font-semibold">
                    {c.name}
                    {c.famine_turn && <Skull className="h-3.5 w-3.5 inline ml-1.5 text-destructive" />}
                    {c.is_capital && <span className="text-[9px] ml-1 text-primary">★</span>}
                  </TableCell>
                  <TableCell className="text-xs px-3">
                    <Badge variant="secondary" className="text-[10px]">{SETTLEMENT_LABELS[c.settlement_level] || c.settlement_level}</Badge>
                  </TableCell>
                  <TableCell className="text-sm px-3 text-right">{(c.population_total || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-sm px-3 text-right">
                    <span className={(c.city_stability || 50) < 30 ? "text-destructive" : (c.city_stability || 50) < 50 ? "text-amber-500" : ""}>
                      {c.city_stability || 50}%
                    </span>
                  </TableCell>
                  <TableCell className="text-xs px-3 text-center">
                    {c.famine_turn ? <Badge variant="destructive" className="text-[9px]">Hladomor</Badge>
                      : c.epidemic_active ? <Badge variant="destructive" className="text-[9px]">Epidemie</Badge>
                      : <Badge variant="secondary" className="text-[9px]">OK</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Council Link */}
      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs gap-1.5"
        onClick={() => onTabChange?.("council")}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Poradit se s rádci o ekonomice
      </Button>

      {/* Admin Debug */}
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

      {explainTarget && (
        <ExplainDrawer
          open={!!explainTarget}
          onClose={() => setExplainTarget(null)}
          metric={explainTarget.metric}
          cityId={explainTarget.cityId}
          sessionId={sessionId}
        />
      )}
    </div>
  );
};

export default HomeTab;
