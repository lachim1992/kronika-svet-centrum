import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import CityManagement from "@/components/CityManagement";
import OnboardingChecklist from "@/components/OnboardingChecklist";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Crown, Castle, Swords, Users, Wheat, Flame,
  MapPin, Eye, ArrowUpDown, Skull, BarChart3,
  Trees, Mountain, Anvil, Plus, Cpu, Network,
  AlertTriangle, TrendingUp, TrendingDown, Minus,
  RefreshCw, ChevronDown, Code, Loader2, MessageSquare, Zap,
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
import { toast as hookToast } from "@/hooks/use-toast";
import { useDevMode } from "@/hooks/useDevMode";
import ExplainDrawer from "@/components/dev/ExplainDrawer";
import RealmLawsDecrees from "@/components/realm/RealmLawsDecrees";
import { ensureRealmResources } from "@/lib/turnEngine";
import {
  SETTLEMENT_LABELS as ECON_SETTLEMENT_LABELS,
  computeWorkforceBreakdown,
} from "@/lib/economyConstants";
import {
  MACRO_LAYER_ICONS, MACRO_LAYER_LABELS, MACRO_LAYER_DESCRIPTIONS,
  STRATEGIC_RESOURCE_LABELS, STRATEGIC_RESOURCE_ICONS, STRATEGIC_TIER_LABELS,
  getImportanceLabel, getImportanceColor,
  getIsolationSeverity, ISOLATION_PENALTY_LABELS,
  getStrategicTiers,
  computeTotalPrestige, getPrestigeTier, PRESTIGE_TIER_LABELS, PRESTIGE_META, PRESTIGE_COMPONENTS,
  type StrategicResource,
} from "@/lib/economyFlow";
import TradePanel from "@/components/TradePanel";
import SupplyChainPanel from "@/components/SupplyChainPanel";
import EconomyDependencyMap from "@/components/economy/EconomyDependencyMap";
import PrestigeBreakdown from "@/components/economy/PrestigeBreakdown";
import StrategicResourcesDetail from "@/components/economy/StrategicResourcesDetail";
import FaithPanel from "@/components/economy/FaithPanel";
import PopulationPanel from "@/components/economy/PopulationPanel";
import CapacityPanel from "@/components/economy/CapacityPanel";
import MilitaryUpkeepPanel from "@/components/economy/MilitaryUpkeepPanel";
import FormulasReferencePanel from "@/components/economy/FormulasReferencePanel";

const SETTLEMENT_LABELS: Record<string, string> = {
  HAMLET: "Osada", TOWNSHIP: "Městečko", CITY: "Město", POLIS: "Polis",
};

type SortKey = "population" | "stability" | "vulnerability" | "settlement";
const SORT_LABELS: Record<SortKey, string> = {
  population: "Populace", stability: "Stabilita", vulnerability: "Zranitelnost", settlement: "Úroveň",
};
const SETTLEMENT_ORDER: Record<string, number> = { POLIS: 4, CITY: 3, TOWNSHIP: 2, HAMLET: 1 };

interface Props {
  sessionId: string;
  session: any;
  events: any[];
  memories: any[];
  players: any[];
  cities: any[];
  resources: any[];
  armies: any[];
  wonders: any[];
  chronicles: any[];
  worldCrises: any[];
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
  entityIndex?: EntityIndex;
  onEventClick?: (eventId: string) => void;
  onEntityClick?: (type: string, id: string) => void;
  onRefetch?: () => void;
  onFoundCity?: () => void;
  onTabChange?: (tab: string) => void;
}

type CitySortKey = "name" | "population" | "settlement" | "vulnerability" | "balance";

const HomeTab = ({
  sessionId, session, cities, players, resources, armies, currentPlayerName, currentTurn, myRole,
  onEntityClick, onRefetch, onFoundCity, onTabChange,
}: Props) => {
  const isMultiplayer = session?.game_mode === "tb_multi";
  const [realm, setRealm] = useState<any>(null);
  const [stacks, setStacks] = useState<any[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("population");
  const [managingCityId, setManagingCityId] = useState<string | null>(null);
  const [hasProvince, setHasProvince] = useState<boolean | null>(null);
  const [provinces, setProvinces] = useState<any[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [activeWars, setActiveWars] = useState<any[]>([]);
  const [explainTarget, setExplainTarget] = useState<{ metric: "population" | "grain_cap"; cityId: string } | null>(null);
  const { devMode } = useDevMode();

  // Economy state
  const [nodeStats, setNodeStats] = useState<any[]>([]);
  const [cityNodeMap, setCityNodeMap] = useState<Map<string, any>>(new Map());
  const [recomputing, setRecomputing] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [citySortKey, setCitySortKey] = useState<CitySortKey>("population");
  const [citySortAsc, setCitySortAsc] = useState(false);

  const myCities = useMemo(() => cities.filter(c => c.owner_player === currentPlayerName), [cities, currentPlayerName]);
  const capital = useMemo(() => myCities.find(c => c.is_capital) || myCities[0], [myCities]);

  const fetchData = useCallback(async () => {
    const [realmRes, stacksRes, provRes, nodesRes, cityNodesRes] = await Promise.all([
      supabase.from("realm_resources").select("*")
        .eq("session_id", sessionId).eq("player_name", currentPlayerName).maybeSingle(),
      supabase.from("military_stacks").select("power")
        .eq("session_id", sessionId).eq("player_name", currentPlayerName).eq("is_active", true),
      supabase.from("provinces").select("id, name, owner_player")
        .eq("session_id", sessionId).eq("owner_player", currentPlayerName),
      supabase.from("province_nodes")
        .select("id, name, node_type, flow_role, is_major, controlled_by, production_output, wealth_output, capacity_score, importance_score, connectivity_score, isolation_penalty, strategic_resource_type, strategic_resource_tier, incoming_production, city_id, upkeep_supplies, upkeep_wealth, net_balance")
        .eq("session_id", sessionId).eq("controlled_by", currentPlayerName),
      supabase.from("province_nodes")
        .select("id, city_id, production_output, incoming_production, flow_role, isolation_penalty, wealth_output")
        .eq("session_id", sessionId).not("city_id", "is", null),
    ]);

    if (realmRes.data) {
      setRealm(realmRes.data);
    } else {
      const r = await ensureRealmResources(sessionId, currentPlayerName);
      setRealm(r);
    }
    setStacks(stacksRes.data || []);
    const provs = provRes.data || [];
    setProvinces(provs);
    const playerHasProvince = provs.length > 0;
    setHasProvince(playerHasProvince);
    if (!playerHasProvince && myRole !== "admin" && myCities.length === 0) {
      setShowOnboarding(true);
    }
    setNodeStats(nodesRes.data || []);
    const map = new Map<string, any>();
    for (const n of (cityNodesRes.data || [])) {
      if (n.city_id) map.set(n.city_id, n);
    }
    setCityNodeMap(map);
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

  // Economy computations
  const totalProduction = realm?.total_production ?? 0;
  const totalWealth = realm?.total_wealth ?? 0;
  const totalCapacity = realm?.total_capacity ?? 0;
  const totalImportance = realm?.total_importance ?? 0;
  const maxMacro = Math.max(totalProduction, totalWealth, totalCapacity, 1);
  const strategicTiers = getStrategicTiers(realm);

  const nodesByRole = useMemo(() => {
    const roles: Record<string, { count: number; production: number; wealth: number; capacity: number }> = {};
    for (const n of nodeStats) {
      const role = n.flow_role || "neutral";
      if (!roles[role]) roles[role] = { count: 0, production: 0, wealth: 0, capacity: 0 };
      roles[role].count++;
      roles[role].production += n.production_output ?? 0;
      roles[role].wealth += n.wealth_output ?? 0;
      roles[role].capacity += n.capacity_score ?? 0;
    }
    return roles;
  }, [nodeStats]);

  const topNodes = useMemo(() =>
    [...nodeStats].sort((a, b) => (b.importance_score ?? 0) - (a.importance_score ?? 0)).slice(0, 5),
  [nodeStats]);

  const isolatedNodes = useMemo(() =>
    nodeStats.filter(n => (n.isolation_penalty ?? 0) > 0),
  [nodeStats]);

  const FLOW_ROLE_MULT: Record<string, number> = { hub: 0.8, gateway: 0.9, regulator: 0.7, producer: 1.2, neutral: 1.0 };
  const cityEconMap = useMemo(() => {
    const map = new Map<string, { production: number; demand: number; balance: number; isolation: number; wealthOutput: number }>();
    for (const city of myCities) {
      const node = cityNodeMap.get(city.id);
      const pop = city.population_total || 0;
      const demand = Math.max(1, Math.round(pop * 0.006));
      let production = 0;
      let isolation = 0;
      let wealthOutput = 0;
      if (node) {
        production = (node.production_output || 0) + (node.incoming_production || 0) * 0.5;
        production *= FLOW_ROLE_MULT[node.flow_role] || 1.0;
        isolation = node.isolation_penalty || 0;
        wealthOutput = node.wealth_output || 0;
      }
      map.set(city.id, { production: Math.round(production * 10) / 10, demand, balance: Math.round((production - demand) * 10) / 10, isolation: Math.round(isolation * 100), wealthOutput: Math.round(wealthOutput * 10) / 10 });
    }
    return map;
  }, [myCities, cityNodeMap]);

  const mobRate = realm?.mobilization_rate || 0.1;
  const wf = computeWorkforceBreakdown(myCities, mobRate);
  const currentMob = Math.round(mobRate * 100);

  const totalPop = myCities.reduce((s, c) => s + (c.population_total || 0), 0);
  const totalPower = stacks.reduce((s, st) => s + (st.power || 0), 0);
  const famineCities = myCities.filter(c => c.famine_turn);

  // Node counts by tier
  const microNodes = nodeStats.filter(n => n.node_type === "micro");
  const minorNodes = nodeStats.filter(n => n.node_type === "minor");
  const majorNodes = nodeStats.filter(n => n.is_major || n.node_type === "major");
  const deficitNodes = nodeStats.filter(n => (n.net_balance ?? 0) < 0);
  const surplusNodes = nodeStats.filter(n => (n.net_balance ?? 0) > 0);

  // Alerts
  const alerts: { text: string; severity: "error" | "warning" }[] = [];
  if (famineCities.length > 0) alerts.push({ text: `${famineCities.length} sídel trpí hladomorem!`, severity: "error" });
  if (isolatedNodes.length > 0) alerts.push({ text: `${isolatedNodes.length} uzlů je izolováno od hlavního města`, severity: "warning" });
  if (currentMob > 20) alerts.push({ text: `Vysoká mobilizace (${currentMob}%)`, severity: "warning" });
  if (deficitNodes.length > 0) alerts.push({ text: `${deficitNodes.length} uzlů v deficitu — dotováno z hlavního města`, severity: "warning" });

  const handleRecompute = useCallback(async () => {
    setRecomputing(true);
    try {
      const { data, error } = await supabase.functions.invoke("compute-economy-flow", {
        body: { session_id: sessionId },
      });
      if (error) throw error;
      hookToast({ title: "Ekonomika přepočítána", description: `${data?.nodes_computed || 0} uzlů vyhodnoceno` });
      await fetchData();
      onRefetch?.();
    } catch (e: any) {
      hookToast({ title: "Chyba přepočtu", description: e.message, variant: "destructive" });
    } finally {
      setRecomputing(false);
    }
  }, [sessionId, fetchData, onRefetch]);

  // City table sorting
  const sortedCitiesTable = useMemo(() => {
    const arr = [...myCities];
    arr.sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0;
      switch (citySortKey) {
        case "name": va = a.name; vb = b.name; return citySortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
        case "population": va = a.population_total || 0; vb = b.population_total || 0; break;
        case "settlement": va = a.settlement_level || ""; vb = b.settlement_level || ""; return citySortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
        case "vulnerability": va = a.vulnerability_score || 0; vb = b.vulnerability_score || 0; break;
        case "balance": va = cityEconMap.get(a.id)?.balance || 0; vb = cityEconMap.get(b.id)?.balance || 0; break;
      }
      return citySortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return arr;
  }, [myCities, citySortKey, citySortAsc, cityEconMap]);

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

  const ROLE_LABELS: Record<string, string> = {
    hub: "Centra", producer: "Producenti", regulator: "Regulátory", gateway: "Brány", neutral: "Neutrální",
  };

  // City list sort (for card view)
  const sorted = [...myCities].sort((a, b) => {
    switch (sortKey) {
      case "population": return (b.population_total || 0) - (a.population_total || 0);
      case "stability": return (a.city_stability || 70) - (b.city_stability || 70);
      case "vulnerability": return (b.vulnerability_score || 0) - (a.vulnerability_score || 0);
      case "settlement": return (SETTLEMENT_ORDER[b.settlement_level] || 1) - (SETTLEMENT_ORDER[a.settlement_level] || 1);
      default: return 0;
    }
  });

  // Show onboarding wizard for new players
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

  // City Management inline view
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

      {/* ═══ ALERTS ═══ */}
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

      {/* Active Wars Banner */}
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

      {/* ═══ SECTION 1: CAPITAL + PROVINCE + NODES ═══ */}
      <div className="game-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Castle className="h-5 w-5 text-primary" />
          <h3 className="font-display font-semibold text-base">Hlavní město & provincie</h3>
        </div>

        {capital ? (
          <div className="space-y-3">
            {/* Capital info */}
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

            {/* Province summary */}
            {provinces.length > 0 && (
              <div className="text-xs text-muted-foreground">
                {provinces.length} {provinces.length === 1 ? "provincie" : "provincií"}: {provinces.map(p => p.name).join(", ")}
              </div>
            )}

            {/* Node overview */}
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              <div className="bg-muted/40 rounded-lg p-2 sm:p-3 text-center">
                <div className="text-[8px] sm:text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5 sm:mb-1">Uzlů</div>
                <div className="text-lg sm:text-2xl font-bold font-display">{nodeStats.length}</div>
              </div>
              <div className="bg-muted/40 rounded-lg p-2 sm:p-3 text-center">
                <div className="text-[8px] sm:text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5 sm:mb-1">Major</div>
                <div className="text-lg sm:text-2xl font-bold font-display">{majorNodes.length}</div>
              </div>
              <div className="bg-muted/40 rounded-lg p-2 sm:p-3 text-center">
                <div className="text-[8px] sm:text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5 sm:mb-1">Minor</div>
                <div className="text-lg sm:text-2xl font-bold font-display">{minorNodes.length}</div>
              </div>
              <div className="bg-muted/40 rounded-lg p-2 sm:p-3 text-center">
                <div className="text-[8px] sm:text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5 sm:mb-1">Micro</div>
                <div className="text-lg sm:text-2xl font-bold font-display">{microNodes.length}</div>
              </div>
            </div>

            {/* Deficit/surplus summary */}
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1 text-accent">
                <TrendingUp className="h-3 w-3" />
                {surplusNodes.length} uzlů v přebytku
              </span>
              <span className="flex items-center gap-1 text-destructive">
                <TrendingDown className="h-3 w-3" />
                {deficitNodes.length} uzlů v deficitu
              </span>
              {isolatedNodes.length > 0 && (
                <span className="flex items-center gap-1 text-amber-500">
                  <AlertTriangle className="h-3 w-3" />
                  {isolatedNodes.length} izolovaných
                </span>
              )}
            </div>
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

      {/* ═══ SECTION 2: NODE FLOW BREAKDOWN ═══ */}
      <Collapsible>
        <div className="game-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            <h3 className="font-display font-semibold text-base">Tok dle typu uzlu</h3>
            <InfoTip side="right">Jak jednotlivé typy uzlů přispívají k celkové produkci, bohatství a kapacitě.</InfoTip>
            <CollapsibleTrigger asChild>
              <button className="ml-auto flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                <ChevronDown className="h-3 w-3" /> Rozbalit
              </button>
            </CollapsibleTrigger>
          </div>

          <div className="grid grid-cols-4 gap-2 text-xs">
            <div className="font-semibold text-muted-foreground">Role</div>
            <div className="text-center font-semibold text-muted-foreground">{MACRO_LAYER_ICONS.production} Produkce</div>
            <div className="text-center font-semibold text-muted-foreground">{MACRO_LAYER_ICONS.wealth} Bohatství</div>
            <div className="text-center font-semibold text-muted-foreground">{MACRO_LAYER_ICONS.capacity} Kapacita</div>
          </div>
          {Object.entries(nodesByRole).map(([role, data]) => (
            <div key={role} className="grid grid-cols-4 gap-2 text-xs border-t border-border/30 pt-1">
              <div className="font-semibold">{ROLE_LABELS[role] || role} <span className="text-muted-foreground">({data.count})</span></div>
              <div className="text-center font-bold">{data.production.toFixed(1)}</div>
              <div className="text-center font-bold">{data.wealth.toFixed(1)}</div>
              <div className="text-center font-bold">{data.capacity.toFixed(1)}</div>
            </div>
          ))}

          <CollapsibleContent>
            <div className="border-t border-border pt-3 mt-3 space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground">Top 5 uzlů dle důležitosti</h4>
              {topNodes.map(n => {
                const impLabel = getImportanceLabel(n.importance_score ?? 0);
                const impColor = getImportanceColor(n.importance_score ?? 0);
                return (
                  <div key={n.id} className="flex items-center justify-between text-xs border-b border-border/20 pb-1">
                    <span className="font-semibold">{n.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{MACRO_LAYER_ICONS.production}{(n.production_output ?? 0).toFixed(1)}</span>
                      <span className="text-muted-foreground">{MACRO_LAYER_ICONS.wealth}{(n.wealth_output ?? 0).toFixed(1)}</span>
                      <Badge className={`text-[8px] ${impColor}`}>{impLabel} ({(n.importance_score ?? 0).toFixed(1)})</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
            {isolatedNodes.length > 0 && (
              <div className="border-t border-border pt-3 mt-3 space-y-2">
                <h4 className="text-xs font-semibold text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Izolované uzly ({isolatedNodes.length})
                </h4>
                {isolatedNodes.map(n => {
                  const sev = getIsolationSeverity(n.isolation_penalty ?? 0);
                  return (
                    <div key={n.id} className="flex items-center justify-between text-xs">
                      <span>{n.name}</span>
                      <span className="text-destructive">{ISOLATION_PENALTY_LABELS[sev]} (-{Math.round((n.isolation_penalty ?? 0) * 100)}%)</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* ═══ SECTION 3: MACRO ECONOMY ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {(["production", "wealth", "capacity"] as const).map(layer => {
          const val = layer === "production" ? totalProduction : layer === "wealth" ? totalWealth : totalCapacity;
          const icon = MACRO_LAYER_ICONS[layer];
          const label = MACRO_LAYER_LABELS[layer];
          const desc = MACRO_LAYER_DESCRIPTIONS[layer];
          return (
            <div key={layer} className="game-card p-3 sm:p-5 space-y-2 sm:space-y-3">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-primary/10 flex items-center justify-center text-base sm:text-xl">{icon}</div>
                <div className="min-w-0">
                  <h3 className="font-display font-bold text-sm sm:text-lg truncate">{label}</h3>
                  <span className="text-[10px] text-muted-foreground hidden sm:block">{desc}</span>
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-bold font-display text-primary">{val.toFixed(1)}</div>
              <Progress value={Math.min(100, (val / maxMacro) * 100)} className="h-1.5 sm:h-2" />
            </div>
          );
        })}
      </div>

      {/* ═══ IMPORTANCE ═══ */}
      <div className="game-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-primary" />
          <h3 className="font-display font-semibold text-base">Celková důležitost</h3>
          <InfoTip side="right">Suma importance skóre všech kontrolovaných uzlů.</InfoTip>
          <span className="ml-auto text-2xl font-mono font-bold text-primary">{totalImportance.toFixed(1)}</span>
        </div>
        <div className="text-xs text-muted-foreground">{nodeStats.length} kontrolovaných uzlů</div>
      </div>

      {/* ═══ WORKFORCE ═══ */}
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

      {/* ═══ GRAIN RESERVE ═══ */}
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

      {/* ═══ WEALTH RESERVE ═══ */}
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

      {/* ═══ FAITH ═══ */}
      {realm && <FaithPanel realm={realm} cities={myCities} />}

      {/* ═══ CAPACITY ═══ */}
      {realm && <CapacityPanel realm={realm} cities={myCities} nodeStats={nodeStats} />}

      {/* ═══ POPULATION & DEMOGRAPHICS ═══ */}
      <PopulationPanel cities={myCities} realm={realm} />

      {/* ═══ MILITARY UPKEEP ═══ */}
      {realm && <MilitaryUpkeepPanel armies={armies} realm={realm} />}

      {/* ═══ PRESTIGE ═══ */}
      {realm && <PrestigeBreakdown realm={realm} />}

      {/* ═══ STRATEGIC RESOURCES DETAIL ═══ */}
      {realm && <StrategicResourcesDetail realm={realm} />}

      {/* ═══ LAWS & DECREES ═══ */}
      <RealmLawsDecrees sessionId={sessionId} currentPlayerName={currentPlayerName} currentTurn={currentTurn} />

      {/* Onboarding Checklist */}
      <OnboardingChecklist
        sessionId={sessionId}
        currentPlayerName={currentPlayerName}
        currentTurn={currentTurn}
        cities={myCities}
        armies={stacks}
        onTabChange={(tab) => {/* handled by parent */}}
        onDismiss={() => {}}
      />

      {/* ═══ CITY TABLE (desktop) / CITY CARDS (mobile) ═══ */}
      <div className="game-card p-0 overflow-hidden">
        <div className="px-3 sm:px-5 pt-3 sm:pt-4 pb-2">
          <h3 className="text-sm sm:text-base font-display font-semibold flex items-center gap-2">
            Přehled sídel
            <InfoTip side="right">Produkce města = (vlastní production_output + příchozí incoming_production × 0.5) × role multiplikátor. Poptávka = populace × 0.006. Bilance = produkce − poptávka.</InfoTip>
          </h3>
        </div>

        {/* Mobile: card list */}
        <div className="sm:hidden divide-y divide-border">
          {sortedCitiesTable.map(c => {
            const econ = cityEconMap.get(c.id);
            const balance = econ?.balance ?? 0;
            const balanceColor = balance > 0 ? "text-accent" : balance < 0 ? "text-destructive" : "text-muted-foreground";
            return (
              <div key={c.id} className="px-3 py-2.5 active:bg-muted/50" onClick={() => onEntityClick?.("city", c.id)}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold flex items-center gap-1">
                    {c.name}
                    {c.is_capital && <span className="text-[9px] text-primary">★</span>}
                    {c.famine_turn && <Skull className="h-3 w-3 text-destructive" />}
                  </span>
                  <Badge variant="secondary" className="text-[9px]">{SETTLEMENT_LABELS[c.settlement_level] || c.settlement_level}</Badge>
                </div>
                <div className="grid grid-cols-4 gap-1 text-[10px]">
                  <div>
                    <span className="text-muted-foreground">Pop </span>
                    <span className="font-semibold">{(c.population_total || 0).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">⚒️ </span>
                    <span className="font-mono font-semibold">{econ?.production?.toFixed(1) ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">💰 </span>
                    <span className="font-mono font-semibold">{econ?.wealthOutput?.toFixed(1) ?? "—"}</span>
                  </div>
                  <div className={`font-mono font-semibold ${balanceColor}`}>
                    {balance > 0 ? "+" : ""}{balance.toFixed(1)}
                    {(econ?.isolation ?? 0) > 0 && <span className="text-destructive ml-0.5">⛓️</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop: full table */}
        <div className="hidden sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs px-3">Město <SortIcon field="name" /></TableHead>
                <TableHead className="text-xs px-3">Úroveň <SortIcon field="settlement" /></TableHead>
                <TableHead className="text-xs px-3 text-right">Pop. <SortIcon field="population" /></TableHead>
                <TableHead className="text-xs px-3 text-right">⚒️ Prod.</TableHead>
                <TableHead className="text-xs px-3 text-right">💰 Wealth</TableHead>
                <TableHead className="text-xs px-3 text-right">Bilance <SortIcon field="balance" /></TableHead>
                <TableHead className="text-xs px-3 text-right">Stabilita</TableHead>
                <TableHead className="text-xs px-3 text-center">Stav</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedCitiesTable.map(c => {
                const econ = cityEconMap.get(c.id);
                const balance = econ?.balance ?? 0;
                const balanceColor = balance > 0 ? "text-accent" : balance < 0 ? "text-destructive" : "";
                return (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onEntityClick?.("city", c.id)}>
                    <TableCell className="text-sm px-3 font-semibold">
                      {c.name}
                      {c.famine_turn && <Skull className="h-3.5 w-3.5 inline ml-1.5 text-destructive" />}
                      {c.is_capital && <span className="text-[9px] ml-1 text-primary">★</span>}
                      {(econ?.isolation ?? 0) > 0 && (
                        <span className="text-[9px] ml-1 text-destructive">⛓️-{econ!.isolation}%</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs px-3">
                      <Badge variant="secondary" className="text-[10px]">{SETTLEMENT_LABELS[c.settlement_level] || c.settlement_level}</Badge>
                    </TableCell>
                    <TableCell className="text-sm px-3 text-right">{(c.population_total || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-sm px-3 text-right font-mono">{econ?.production?.toFixed(1) ?? "—"}</TableCell>
                    <TableCell className="text-sm px-3 text-right font-mono">{econ?.wealthOutput?.toFixed(1) ?? "—"}</TableCell>
                    <TableCell className={`text-sm px-3 text-right font-mono font-semibold ${balanceColor}`}>
                      {balance > 0 ? "+" : ""}{balance.toFixed(1)}
                    </TableCell>
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
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ═══ DEPENDENCY MAP ═══ */}
      <EconomyDependencyMap realm={realm} cities={myCities} armies={armies} />

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

      {/* ═══ SUPPLY CHAIN ═══ */}
      <SupplyChainPanel sessionId={sessionId} playerName={currentPlayerName} currentTurn={currentTurn} />

      {/* ═══ FORMULAS REFERENCE ═══ */}
      <FormulasReferencePanel />

      {/* ═══ COUNCIL LINK ═══ */}
      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs gap-1.5"
        onClick={() => onTabChange?.("council")}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Poradit se s rádci o ekonomice
      </Button>

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
