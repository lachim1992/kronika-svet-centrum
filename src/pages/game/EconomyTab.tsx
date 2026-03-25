import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  SETTLEMENT_LABELS,
  computeWorkforceBreakdown,
} from "@/lib/economyConstants";
import {
  MACRO_LAYER_ICONS, MACRO_LAYER_LABELS, MACRO_LAYER_DESCRIPTIONS,
  STRATEGIC_RESOURCE_LABELS, STRATEGIC_RESOURCE_ICONS, STRATEGIC_TIER_LABELS,
  getImportanceLabel, getImportanceColor,
  getIsolationSeverity, ISOLATION_PENALTY_LABELS,
  getStrategicTiers,
  type StrategicResource,
} from "@/lib/economyFlow";
import TradePanel from "@/components/TradePanel";
import SupplyChainPanel from "@/components/SupplyChainPanel";

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

type CitySortKey = "name" | "population" | "settlement" | "vulnerability" | "balance";

const EconomyTab = ({ sessionId, currentPlayerName, currentTurn, cities, resources, armies, myRole, onEntityClick, onRefetch, onTabChange }: Props) => {
  const [realm, setRealm] = useState<any>(null);
  const [nodeStats, setNodeStats] = useState<any[]>([]);
  const [citySortKey, setCitySortKey] = useState<CitySortKey>("population");
  const [citySortAsc, setCitySortAsc] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [cityNodeMap, setCityNodeMap] = useState<Map<string, any>>(new Map());

  const myCities = useMemo(() => cities.filter(c => c.owner_player === currentPlayerName), [cities, currentPlayerName]);

  const fetchData = useCallback(async () => {
    const [realmRes, nodesRes, cityNodesRes] = await Promise.all([
      supabase.from("realm_resources").select("*")
        .eq("session_id", sessionId).eq("player_name", currentPlayerName).maybeSingle(),
      supabase.from("province_nodes")
        .select("id, name, node_type, flow_role, is_major, controlled_by, production_output, wealth_output, capacity_score, importance_score, connectivity_score, isolation_penalty, strategic_resource_type, strategic_resource_tier, incoming_production, city_id")
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
    setNodeStats(nodesRes.data || []);
    // Build city→node map
    const map = new Map<string, any>();
    for (const n of (cityNodesRes.data || [])) {
      if (n.city_id) map.set(n.city_id, n);
    }
    setCityNodeMap(map);
  }, [sessionId, currentPlayerName]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Macro layer totals from realm
  const totalProduction = realm?.total_production ?? 0;
  const totalWealth = realm?.total_wealth ?? 0;
  const totalCapacity = realm?.total_capacity ?? 0;
  const totalImportance = realm?.total_importance ?? 0;
  const maxMacro = Math.max(totalProduction, totalWealth, totalCapacity, 1);

  // Strategic tiers
  const strategicTiers = [
    { key: "iron" as StrategicResource, tier: realm?.strategic_iron_tier ?? 0 },
    { key: "horses" as StrategicResource, tier: realm?.strategic_horses_tier ?? 0 },
    { key: "salt" as StrategicResource, tier: realm?.strategic_salt_tier ?? 0 },
    { key: "copper" as StrategicResource, tier: realm?.strategic_copper_tier ?? 0 },
    { key: "gold_deposit" as StrategicResource, tier: realm?.strategic_gold_tier ?? 0 },
  ].filter(s => s.tier > 0);

  // Node breakdown by role
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

  // Top nodes by importance
  const topNodes = useMemo(() =>
    [...nodeStats].sort((a, b) => (b.importance_score ?? 0) - (a.importance_score ?? 0)).slice(0, 5),
  [nodeStats]);

  // Isolated nodes
  const isolatedNodes = useMemo(() =>
    nodeStats.filter(n => (n.isolation_penalty ?? 0) > 0),
  [nodeStats]);

  // Per-city economy from node data
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

  // Workforce
  const mobRate = realm?.mobilization_rate || 0.1;
  const wf = computeWorkforceBreakdown(myCities, mobRate);

  // Alerts
  const alerts: { text: string; severity: "error" | "warning" }[] = [];
  const famineCities = myCities.filter(c => c.famine_turn);
  if (famineCities.length > 0) alerts.push({ text: `${famineCities.length} sídel trpí hladomorem!`, severity: "error" });
  if (isolatedNodes.length > 0) alerts.push({ text: `${isolatedNodes.length} uzlů je izolováno od hlavního města`, severity: "warning" });
  const currentMob = Math.round(mobRate * 100);
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

  const handleRecompute = useCallback(async () => {
    setRecomputing(true);
    try {
      // Run economy flow computation
      const { data, error } = await supabase.functions.invoke("compute-economy-flow", {
        body: { session_id: sessionId },
      });
      if (error) throw error;
      toast({ title: "Ekonomika přepočítána", description: `${data?.nodes_computed || 0} uzlů vyhodnoceno` });
      await fetchData();
      onRefetch?.();
    } catch (e: any) {
      toast({ title: "Chyba přepočtu", description: e.message, variant: "destructive" });
    } finally {
      setRecomputing(false);
    }
  }, [sessionId, fetchData, onRefetch]);

  const SortIcon = ({ field }: { field: CitySortKey }) => (
    <ArrowUpDown
      className={`h-3 w-3 inline ml-0.5 cursor-pointer ${citySortKey === field ? "text-primary" : "text-muted-foreground/50"}`}
      onClick={() => handleCitySort(field)}
    />
  );

  const ROLE_LABELS: Record<string, string> = {
    hub: "Centra",
    producer: "Producenti",
    regulator: "Regulátory",
    gateway: "Brány",
    neutral: "Neutrální",
  };

  return (
    <div className="space-y-6 pb-24 px-1">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <BarChart3 className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-display font-bold">Ekonomika</h2>
        <span className="text-sm text-muted-foreground ml-auto font-display">Rok {currentTurn}</span>
        <Button variant="outline" size="sm" className="ml-2 text-sm h-9" onClick={handleRecompute} disabled={recomputing}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${recomputing ? "animate-spin" : ""}`} />
          {recomputing ? "Počítám…" : "Přepočítat tok"}
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

      {/* ═══ TOP TIER: 3 Macro Layers ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(["production", "wealth", "capacity"] as const).map(layer => {
          const val = layer === "production" ? totalProduction : layer === "wealth" ? totalWealth : totalCapacity;
          const icon = MACRO_LAYER_ICONS[layer];
          const label = MACRO_LAYER_LABELS[layer];
          const desc = MACRO_LAYER_DESCRIPTIONS[layer];
          return (
            <div key={layer} className="game-card p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl">
                  {icon}
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg flex items-center gap-1">
                    {label}
                    <InfoTip side="right">
                      {layer === "production"
                        ? "Generováno: base dle typu uzlu (resource_node=8, village=6, city=4, port=5) × role multiplikátor × (1 − izolace). Rolníci zvyšují produkci. compute-economy-flow sčítá minor→major→hlavní město."
                        : layer === "wealth"
                        ? "Generováno: průchodem produkce přes trasy. Trade efficiency dle role uzlu (hub=1.0, gateway=0.8, regulator=0.6, producer=0.3). Měšťané zvyšují wealth. Obchodní dohody přidávají bonus."
                        : "Generováno: z urbanizační úrovně a infrastruktury uzlů (logistic_hub, trade_hub). Klerici přispívají ke kapacitě. Ovlivňuje maximální počet tras a staveb."}
                    </InfoTip>
                  </h3>
                  <span className="text-[10px] text-muted-foreground">{desc}</span>
                </div>
              </div>
              <div className="text-3xl font-bold font-display text-primary">{val.toFixed(1)}</div>
              <Progress value={Math.min(100, (val / maxMacro) * 100)} className="h-2" />
            </div>
          );
        })}
      </div>

      {/* ═══ IMPORTANCE + STRATEGIC RESOURCES ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Importance */}
        <div className="game-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            <h3 className="font-display font-semibold text-base">Celková důležitost</h3>
            <InfoTip side="right">Suma importance skóre všech kontrolovaných uzlů. Vyšší = silnější ekonomická pozice.</InfoTip>
          </div>
          <div className="text-3xl font-bold font-display">{totalImportance.toFixed(1)}</div>
          <div className="text-xs text-muted-foreground">{nodeStats.length} kontrolovaných uzlů</div>
        </div>

        {/* Strategic Resources */}
        <div className="game-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h3 className="font-display font-semibold text-base">Strategické suroviny</h3>
            <InfoTip side="right">Strategické suroviny neplodí tok — odemykají schopnosti (jednotky, budovy, technologie).</InfoTip>
          </div>
          {strategicTiers.length === 0 ? (
            <p className="text-xs text-muted-foreground">Žádné strategické suroviny. Kontrolujte uzly s doly, stájemi nebo solnými pánvemi.</p>
          ) : (
            <div className="space-y-2">
              {strategicTiers.map(s => (
                <div key={s.key} className="flex items-center gap-2 text-sm">
                  <span className="text-lg">{STRATEGIC_RESOURCE_ICONS[s.key]}</span>
                  <span className="font-semibold">{STRATEGIC_RESOURCE_LABELS[s.key]}</span>
                  <Badge variant="secondary" className="text-[9px] ml-auto">{STRATEGIC_TIER_LABELS[s.tier]}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ NODE BREAKDOWN BY ROLE ═══ */}
      <Collapsible>
        <div className="game-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h3 className="font-display font-semibold text-base">Tok dle typu uzlu</h3>
            <InfoTip side="right">Jak jednotlivé typy uzlů přispívají k celkové produkci, bohatství a kapacitě.</InfoTip>
            <CollapsibleTrigger asChild>
              <button className="ml-auto flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                <ChevronDown className="h-3 w-3" /> Rozbalit
              </button>
            </CollapsibleTrigger>
          </div>

          {/* Summary row */}
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
            {/* Top nodes */}
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

            {/* Isolated nodes */}
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

      {/* ═══ WORKFORCE ═══ */}
      <TooltipProvider>
        <div className="game-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h3 className="font-display font-semibold text-base">Lidská síla</h3>
            <InfoTip side="right">Pracovní síla = celková populace − vojáci. Vyšší mobilizace = méně pracovníků = penalizace produkce uzlů. Mobilizace nad 15% způsobuje progresivní penalty. Počítáno v compute-economy-flow z realm_resources.mobilization_rate × total population.</InfoTip>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-muted/40 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Pracovní síla</div>
              <div className="text-2xl font-bold font-display">{wf.workforce}</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Vojáci</div>
              <div className="text-2xl font-bold font-display">{wf.mobilized}</div>
            </div>
            <div className={`rounded-lg p-3 ${wf.isOverMob ? "bg-destructive/10" : "bg-muted/40"}`}>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Mobilizace</div>
              <div className={`text-2xl font-bold font-display ${wf.isOverMob ? "text-destructive" : ""}`}>{currentMob}%</div>
            </div>
          </div>
          {wf.isOverMob && (
            <div className="text-xs text-destructive flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3" />
              Překročena mobilizační hranice — produkce uzlů penalizována o {Math.round(wf.overMobPenalty * 100)}%
            </div>
          )}
        </div>
      </TooltipProvider>

      {/* ═══ GRAIN RESERVE ═══ */}
      {realm && (
        <div className="game-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🌾</span>
            <h3 className="font-display font-semibold text-base">Zásoby obilí</h3>
            <InfoTip side="right">Produkce obilí: rolníci × irrigation_level × ration_policy. Spotřeba: populace × 0.006/kolo. Bilance se ukládá do grain_reserve. Kapacita sýpky závisí na budovách (granary). Záporná bilance → hladomor po vyčerpání rezerv. Počítáno v process-turn.</InfoTip>
            <span className="ml-auto text-sm font-mono font-bold">
              {Math.round(realm.grain_reserve || 0)} / {Math.round(realm.granary_capacity || 0)}
            </span>
          </div>
          <Progress value={Math.min(100, ((realm.grain_reserve || 0) / Math.max(1, realm.granary_capacity || 1)) * 100)} className="h-3" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>⚒️ Produkce: {realm.last_turn_grain_prod || 0}</span>
            <span>🍽️ Spotřeba: {realm.last_turn_grain_cons || 0}</span>
            <span className={`font-semibold ${(realm.last_turn_grain_net || 0) >= 0 ? "text-emerald-500" : "text-destructive"}`}>
              Bilance: {(realm.last_turn_grain_net || 0) >= 0 ? "+" : ""}{realm.last_turn_grain_net || 0}
            </span>
          </div>
          {(realm.famine_city_count || 0) > 0 && (
            <div className="text-xs text-destructive flex items-center gap-1.5">
              <Skull className="h-3 w-3" />
              {realm.famine_city_count} měst trpí hladomorem — zásoby nestačí pokrýt deficit
            </div>
          )}
        </div>
      )}

      {/* ═══ WEALTH RESERVE ═══ */}
      {realm && (
        <div className="game-card p-5">
          <div className="flex items-center gap-2">
            <span className="text-xl">💰</span>
            <h3 className="font-display font-semibold text-base">Pokladna bohatství</h3>
            <InfoTip side="right">Přírůstek: wealth tok ze sítě uzlů + obchodní dohody + daně (tax_rate_percent z laws). Spotřeba: údržba armád, stavby, diplomatické akce.</InfoTip>
            <span className="ml-auto text-2xl font-mono font-bold text-primary">{Math.round(realm.gold_reserve || 0)}</span>
          </div>
        </div>
      )}

      {/* ═══ CITY TABLE ═══ */}
      <div className="game-card p-0 overflow-hidden">
        <div className="px-5 pt-4 pb-2">
          <h3 className="text-base font-display font-semibold flex items-center gap-2">
            Přehled sídel — síťová ekonomika
            <InfoTip side="right">Produkce města = (vlastní production_output + příchozí incoming_production × 0.5) × role multiplikátor. Poptávka = populace × 0.006. Bilance = produkce − poptávka. Wealth = wealth_output uzlu města. Izolace (⛓️) = izolační penalizace uzlu vůči hlavnímu městu, snižuje produkci. A* pathfinding hledá cestu nejmenšího odporu přes biomy.</InfoTip>
          </h3>
        </div>
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
            {sortedCities.map(c => {
              const econ = cityEconMap.get(c.id);
              const balance = econ?.balance ?? 0;
              const balanceColor = balance > 0 ? "text-emerald-500" : balance < 0 ? "text-destructive" : "";
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

      {/* ═══ SUPPLY CHAIN ═══ */}
      <SupplyChainPanel sessionId={sessionId} playerName={currentPlayerName} currentTurn={currentTurn} />

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
