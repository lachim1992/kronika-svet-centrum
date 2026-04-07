import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/info-tip";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Network, ChevronDown, ChevronRight, ArrowRight,
  TrendingUp, TrendingDown, AlertTriangle, Route,
} from "lucide-react";
import { MACRO_LAYER_ICONS } from "@/lib/economyFlow";

interface NodeData {
  id: string;
  name: string;
  node_type: string;
  flow_role: string;
  production_output: number;
  wealth_output: number;
  capacity_score: number;
  incoming_production: number;
  upkeep_supplies: number;
  upkeep_wealth: number;
  net_balance: number;
  isolation_penalty: number;
  capability_tags: string[];
  production_role: string;
}

interface RouteData {
  id: string;
  node_a: string;
  node_b: string;
  node_a_name: string;
  node_b_name: string;
  route_type: string;
  capacity_value: number;
  economic_relevance: number;
  upgrade_level: number;
  damage_level: number;
}

interface Props {
  sessionId: string;
  playerName: string;
  realm: any;
}

const ROLE_LABELS: Record<string, string> = {
  hub: "Centrum", producer: "Producent", regulator: "Regulátor",
  gateway: "Brána", neutral: "Neutrální",
};
const ROLE_COLORS: Record<string, string> = {
  hub: "text-primary", producer: "text-accent", regulator: "text-amber-500",
  gateway: "text-blue-400", neutral: "text-muted-foreground",
};
const ROUTE_TYPE_LABELS: Record<string, string> = {
  land_road: "Silnice", river_route: "Říční", sea_route: "Námořní",
  caravan_route: "Karavana", mountain_path: "Horská stezka",
};

const NodeFlowBreakdown = ({ sessionId, playerName, realm }: Props) => {
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [expandedNode, setExpandedNode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [nodesRes, routesRes] = await Promise.all([
      supabase
        .from("province_nodes")
        .select("id, name, node_type, flow_role, production_output, wealth_output, capacity_score, incoming_production, upkeep_supplies, upkeep_wealth, net_balance, isolation_penalty, capability_tags, production_role")
        .eq("session_id", sessionId)
        .eq("controlled_by", playerName),
      supabase.rpc("get_player_routes_with_names" as any, {
        p_session_id: sessionId,
        p_player_name: playerName,
      }),
    ]);
    setNodes((nodesRes.data || []) as any);
    // Fallback: if RPC doesn't exist, fetch routes manually
    if (routesRes.error || !routesRes.data) {
      const nodeIds = (nodesRes.data || []).map((n: any) => n.id);
      if (nodeIds.length > 0) {
        const { data: rawRoutes } = await supabase
          .from("province_routes")
          .select("id, node_a, node_b, route_type, capacity_value, economic_relevance, upgrade_level, damage_level")
          .eq("session_id", sessionId)
          .or(nodeIds.map((id: string) => `node_a.eq.${id},node_b.eq.${id}`).join(","));
        // Enrich with node names
        const nodeMap = new Map((nodesRes.data || []).map((n: any) => [n.id, n.name]));
        setRoutes((rawRoutes || []).map((r: any) => ({
          ...r,
          node_a_name: nodeMap.get(r.node_a) || "?",
          node_b_name: nodeMap.get(r.node_b) || "?",
          damage_level: r.damage_level ?? 0,
        })));
      }
    } else {
      setRoutes(routesRes.data as any);
    }
    setLoading(false);
  }, [sessionId, playerName]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Sort nodes: by net_balance descending (surplus first)
  const sortedNodes = useMemo(() =>
    [...nodes].sort((a, b) => (b.production_output ?? 0) - (a.production_output ?? 0)),
  [nodes]);

  // Node → connected routes
  const routesByNode = useMemo(() => {
    const map = new Map<string, RouteData[]>();
    for (const r of routes) {
      if (!map.has(r.node_a)) map.set(r.node_a, []);
      if (!map.has(r.node_b)) map.set(r.node_b, []);
      map.get(r.node_a)!.push(r);
      map.get(r.node_b)!.push(r);
    }
    return map;
  }, [routes]);

  // Aggregates
  const infraTotals = useMemo(() => {
    let prod = 0, wealth = 0, cap = 0, upkeepS = 0, upkeepW = 0;
    for (const n of nodes) {
      prod += n.production_output ?? 0;
      wealth += n.wealth_output ?? 0;
      cap += n.capacity_score ?? 0;
      upkeepS += n.upkeep_supplies ?? 0;
      upkeepW += n.upkeep_wealth ?? 0;
    }
    return { prod, wealth, cap, upkeepS, upkeepW };
  }, [nodes]);

  // Goods economy layer from realm
  const goodsProd = realm?.goods_production_value ?? 0;
  const goodsWealth = realm?.goods_wealth_fiscal ?? 0;
  const goodsSupply = realm?.goods_supply_volume ?? 0;
  const taxPop = realm?.tax_population ?? 0;
  const taxMarket = realm?.tax_market ?? 0;
  const taxTransit = realm?.tax_transit ?? 0;
  const taxExtraction = realm?.tax_extraction ?? 0;
  const capture = realm?.commercial_capture ?? 0;
  const retention = realm?.commercial_retention ?? 0;

  const hasGoodsData = goodsProd > 0 || goodsWealth > 0;

  if (loading) {
    return (
      <div className="game-card p-5">
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-primary animate-pulse" />
          <span className="text-sm text-muted-foreground">Načítám ekonomický rozpad…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="game-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Network className="h-5 w-5 text-primary" />
        <h3 className="font-display font-semibold text-base">Ekonomický rozpad</h3>
        <InfoTip side="right">Detailní rozpad produkce a bohatství z každého uzlu a trasy. Infrastruktura = výstup uzlů, Goods = simulace zboží.</InfoTip>
      </div>

      {/* ═══ DUAL LAYER SUMMARY ═══ */}
      <div className="grid grid-cols-2 gap-3">
        {/* Infrastructure layer */}
        <div className="bg-muted/30 rounded-lg p-3 space-y-1 border border-border/50">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            🏗️ Infrastruktura (uzly)
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold font-display text-primary">{infraTotals.prod.toFixed(1)}</span>
            <span className="text-[10px] text-muted-foreground">{MACRO_LAYER_ICONS.production} produkce</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold font-display">{infraTotals.wealth.toFixed(1)}</span>
            <span className="text-[10px] text-muted-foreground">{MACRO_LAYER_ICONS.wealth} bohatství</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold font-display">{infraTotals.cap.toFixed(1)}</span>
            <span className="text-[10px] text-muted-foreground">{MACRO_LAYER_ICONS.capacity} kapacita</span>
          </div>
          <div className="text-[10px] text-destructive/80 mt-1">
            Údržba: −{infraTotals.upkeepS.toFixed(0)} 🌾 / −{infraTotals.upkeepW.toFixed(0)} 💰
          </div>
        </div>

        {/* Goods layer */}
        <div className={`bg-muted/30 rounded-lg p-3 space-y-1 border ${hasGoodsData ? "border-accent/30" : "border-border/50 opacity-60"}`}>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            📦 Goods ekonomika (v4.1)
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold font-display text-accent">{goodsProd.toFixed(1)}</span>
            <span className="text-[10px] text-muted-foreground">{MACRO_LAYER_ICONS.production} produkce</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold font-display">{goodsWealth.toFixed(1)}</span>
            <span className="text-[10px] text-muted-foreground">{MACRO_LAYER_ICONS.wealth} fiskální</span>
          </div>
          {hasGoodsData && (
            <div className="text-[10px] text-muted-foreground mt-1 space-y-0.5">
              <div>Daně: pop {taxPop.toFixed(1)} | trh {taxMarket.toFixed(1)} | tranzit {taxTransit.toFixed(1)} | těžba {taxExtraction.toFixed(1)}</div>
              <div>Export capture: {capture.toFixed(1)} | Retence: {(retention * 100).toFixed(0)}%</div>
            </div>
          )}
          {!hasGoodsData && (
            <div className="text-[10px] text-muted-foreground/60 italic mt-1">Zatím bez dat — spusťte compute-trade-flows</div>
          )}
        </div>
      </div>

      {/* Combined totals */}
      <div className="bg-primary/5 rounded-lg p-3 border border-primary/20">
        <div className="text-[10px] uppercase tracking-wider text-primary font-semibold mb-1">Celkem (blended)</div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-lg font-bold font-display">{(infraTotals.prod + goodsProd).toFixed(1)}</div>
            <div className="text-[10px] text-muted-foreground">{MACRO_LAYER_ICONS.production} Produkce</div>
          </div>
          <div>
            <div className="text-lg font-bold font-display">{(infraTotals.wealth + goodsWealth).toFixed(1)}</div>
            <div className="text-[10px] text-muted-foreground">{MACRO_LAYER_ICONS.wealth} Bohatství</div>
          </div>
          <div>
            <div className="text-lg font-bold font-display">{infraTotals.cap.toFixed(1)}</div>
            <div className="text-[10px] text-muted-foreground">{MACRO_LAYER_ICONS.capacity} Kapacita</div>
          </div>
        </div>
      </div>

      {/* ═══ PER-NODE BREAKDOWN ═══ */}
      <div className="space-y-1">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rozpad dle uzlu ({nodes.length})</h4>
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_70px_60px_60px_70px] gap-1 text-[10px] text-muted-foreground font-semibold px-1 pb-1 border-b border-border/30">
          <div>Uzel</div>
          <div className="text-right">{MACRO_LAYER_ICONS.production} Produkce</div>
          <div className="text-right">{MACRO_LAYER_ICONS.wealth} Wealth</div>
          <div className="text-right">Údržba</div>
          <div className="text-right">Bilance</div>
        </div>

        {sortedNodes.map(node => {
          const nodeRoutes = routesByNode.get(node.id) || [];
          const isExpanded = expandedNode === node.id;
          const balance = node.net_balance ?? 0;
          const hasIsolation = (node.isolation_penalty ?? 0) > 0;

          return (
            <Collapsible key={node.id} open={isExpanded} onOpenChange={() => setExpandedNode(isExpanded ? null : node.id)}>
              <CollapsibleTrigger asChild>
                <button className="w-full grid grid-cols-[1fr_70px_60px_60px_70px] gap-1 text-xs px-1 py-1.5 hover:bg-muted/30 rounded transition-colors items-center">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                    <span className="truncate font-semibold">{node.name}</span>
                    <Badge variant="outline" className={`text-[8px] shrink-0 ${ROLE_COLORS[node.flow_role] || ""}`}>
                      {ROLE_LABELS[node.flow_role] || node.flow_role}
                    </Badge>
                    {hasIsolation && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
                  </div>
                  <div className="text-right font-bold">{(node.production_output ?? 0).toFixed(1)}</div>
                  <div className="text-right font-bold">{(node.wealth_output ?? 0).toFixed(1)}</div>
                  <div className="text-right text-destructive/70">
                    {((node.upkeep_supplies ?? 0) + (node.upkeep_wealth ?? 0)).toFixed(0)}
                  </div>
                  <div className={`text-right font-bold ${balance >= 0 ? "text-accent" : "text-destructive"}`}>
                    {balance >= 0 ? "+" : ""}{balance.toFixed(1)}
                  </div>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="ml-5 pl-3 border-l-2 border-primary/20 space-y-2 pb-2 text-[11px]">
                  {/* Node detail */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground">
                    <span>Vlastní produkce:</span>
                    <span className="font-semibold text-foreground">{(node.production_output ?? 0).toFixed(2)}</span>
                    <span>Příchozí z tras:</span>
                    <span className="font-semibold text-foreground">{(node.incoming_production ?? 0).toFixed(2)}</span>
                    <span>Wealth output:</span>
                    <span className="font-semibold text-foreground">{(node.wealth_output ?? 0).toFixed(2)}</span>
                    <span>Kapacita:</span>
                    <span className="font-semibold text-foreground">{(node.capacity_score ?? 0).toFixed(2)}</span>
                    <span>Údržba (🌾/💰):</span>
                    <span className="font-semibold text-destructive/80">{(node.upkeep_supplies ?? 0).toFixed(1)} / {(node.upkeep_wealth ?? 0).toFixed(1)}</span>
                    <span>Role:</span>
                    <span className="font-semibold">{node.production_role || "—"}</span>
                    {node.capability_tags?.length > 0 && (
                      <>
                        <span>Tags:</span>
                        <span className="font-semibold">{node.capability_tags.join(", ")}</span>
                      </>
                    )}
                    {hasIsolation && (
                      <>
                        <span>Izolace:</span>
                        <span className="font-semibold text-amber-500">−{Math.round((node.isolation_penalty ?? 0) * 100)}%</span>
                      </>
                    )}
                  </div>

                  {/* Connected routes */}
                  {nodeRoutes.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
                        <Route className="h-3 w-3" /> Napojené trasy ({nodeRoutes.length})
                      </div>
                      {nodeRoutes.map(r => {
                        const otherName = r.node_a === node.id ? r.node_b_name : r.node_a_name;
                        const isDamaged = (r.damage_level ?? 0) > 0;
                        return (
                          <div key={r.id} className="flex items-center gap-2 text-[10px] pl-2">
                            <ArrowRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                            <span className="truncate">{otherName}</span>
                            <Badge variant="outline" className="text-[8px] shrink-0">
                              {ROUTE_TYPE_LABELS[r.route_type] || r.route_type}
                            </Badge>
                            <span className="text-muted-foreground shrink-0">cap:{r.capacity_value}</span>
                            <span className="text-muted-foreground shrink-0">econ:{r.economic_relevance}</span>
                            {r.upgrade_level > 0 && (
                              <span className="text-primary shrink-0">Lv.{r.upgrade_level}</span>
                            )}
                            {isDamaged && (
                              <span className="text-destructive shrink-0">⚠️ dmg:{r.damage_level}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {nodeRoutes.length === 0 && (
                    <div className="text-[10px] text-amber-500/70 italic">⚠ Žádné napojené trasy — izolovaný uzel</div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
};

export default NodeFlowBreakdown;
