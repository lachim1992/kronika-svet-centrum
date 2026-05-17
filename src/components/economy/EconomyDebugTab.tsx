// ============================================================================
// EconomyDebugTab — Dev-only forensic observability for the economy engine.
//
// Purpose: NOT a player-facing economy view. This is a rentgen of the engine:
// where goods are produced, what is demanded, what trade systems exist,
// what flows were generated, and how they propagated into realm_resources.
//
// Read-only (no mutations). May trigger existing `refresh-economy` only.
// Every section labels its source table + latest turn + row count.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, AlertTriangle, CheckCircle2, FlaskConical } from "lucide-react";
import { DEMAND_BASKETS } from "@/lib/goodsCatalog";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  cities: any[];
  realm: any;
}

const EXPECTED_CHAIN = [
  "compute-province-routes",
  "compute-hex-flows",
  "compute-trade-systems",
  "compute-trade-flows",
  "compute-basket-trade-flows",
  "compute-economy-flow",
];

interface Snapshot {
  realm: any | null;
  nodes: any[];
  routes: any[];
  tradeSystems: any[];
  ptsa: any[];
  nodeInventory: any[];
  cmb: any[];
  demand: any[];
  tradeFlows: any[];
  basketFlows: any[];
  tradeRoutes: any[];
  tradeOffers: any[];
  goods: any[];
  loadedAt: string;
}

const num = (v: any) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;
const fmt = (v: any, d = 1) => num(v).toFixed(d);
const SourceTag = ({ table, turn, rows }: { table: string; turn?: number | null; rows: number }) => (
  <div className="text-[10px] text-muted-foreground font-mono mt-2 pt-2 border-t border-border/30">
    Source: <span className="text-foreground">{table}</span>
    {turn !== undefined && turn !== null && <> · turn=<span className="text-foreground">{turn}</span></>}
    {" · "}rows=<span className="text-foreground">{rows}</span>
  </div>
);

const Warn = ({ ok, msg }: { ok: boolean; msg: string }) => (
  <div className={`flex items-start gap-2 text-xs py-1 ${ok ? "text-muted-foreground" : "text-destructive"}`}>
    {ok ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
    <span>{msg}</span>
  </div>
);

const EconomyDebugTab = ({ sessionId, currentPlayerName, currentTurn, cities, realm }: Props) => {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const playerNodeIds: string[] = [];
        // Fetch in parallel
        const [
          realmR, nodesR, routesR, tsR, ptsaR, cmbR, demR, tfR, btfR, trR, toR, gdR,
        ] = await Promise.all([
          supabase.from("realm_resources").select("*").eq("session_id", sessionId).eq("player_name", currentPlayerName).maybeSingle(),
          supabase.from("province_nodes").select("id,name,node_tier,node_subtype,production_role,flow_role,production_output,wealth_output,capacity_score,controlled_by,trade_system_id,flow_centrality,city_id").eq("session_id", sessionId),
          supabase.from("province_routes").select("id,session_id").eq("session_id", sessionId).limit(2000),
          supabase.from("trade_systems").select("*").eq("session_id", sessionId),
          supabase.from("player_trade_system_access").select("*").eq("session_id", sessionId),
          supabase.from("city_market_baskets").select("*").eq("session_id", sessionId).order("turn_number", { ascending: false }).limit(2000),
          supabase.from("demand_baskets").select("*").eq("session_id", sessionId).order("turn_number", { ascending: false }).limit(2000),
          supabase.from("trade_flows").select("*").eq("session_id", sessionId).limit(1000),
          supabase.from("basket_trade_flows").select("*").eq("session_id", sessionId).order("turn_number", { ascending: false }).limit(2000),
          supabase.from("trade_routes").select("*").eq("session_id", sessionId),
          supabase.from("trade_offers").select("*").eq("session_id", sessionId),
          supabase.from("goods").select("key,basket_key").limit(500),
        ]);

        const nodes = nodesR.data || [];
        const playerNodes = nodes.filter((n: any) => n.controlled_by === currentPlayerName);
        playerNodeIds.push(...playerNodes.map((n: any) => n.id));

        let nodeInventory: any[] = [];
        if (playerNodeIds.length > 0) {
          const inv = await supabase.from("node_inventory").select("*").in("node_id", playerNodeIds.slice(0, 500));
          nodeInventory = inv.data || [];
        }

        if (cancelled) return;
        setSnap({
          realm: realmR.data,
          nodes,
          routes: routesR.data || [],
          tradeSystems: tsR.data || [],
          ptsa: ptsaR.data || [],
          nodeInventory,
          cmb: cmbR.data || [],
          demand: demR.data || [],
          tradeFlows: tfR.data || [],
          basketFlows: btfR.data || [],
          tradeRoutes: trR.data || [],
          tradeOffers: toR.data || [],
          goods: gdR.data || [],
          loadedAt: new Date().toLocaleTimeString(),
        });
      } catch (e: any) {
        if (!cancelled) setErr(e.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, currentPlayerName]);

  const cityMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of cities) m.set(c.id, c);
    return m;
  }, [cities]);

  const nodeMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const n of (snap?.nodes || [])) m.set(n.id, n);
    return m;
  }, [snap?.nodes]);

  const goodToBasket = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of (snap?.goods || [])) if (g.basket_key) m.set(g.key, g.basket_key);
    return m;
  }, [snap?.goods]);

  // Latest turn per table
  const maxTurnCmb = useMemo(() => Math.max(0, ...(snap?.cmb || []).map((r: any) => r.turn_number || 0)), [snap?.cmb]);
  const maxTurnDemand = useMemo(() => Math.max(0, ...(snap?.demand || []).map((r: any) => r.turn_number || 0)), [snap?.demand]);
  const maxTurnBtf = useMemo(() => Math.max(0, ...(snap?.basketFlows || []).map((r: any) => r.turn_number || 0)), [snap?.basketFlows]);

  // Filter to latest turns
  const cmbLatest = useMemo(() => (snap?.cmb || []).filter((r: any) => r.turn_number === maxTurnCmb), [snap?.cmb, maxTurnCmb]);
  const myCmbLatest = useMemo(() => cmbLatest.filter((r: any) => r.player_name === currentPlayerName), [cmbLatest, currentPlayerName]);
  const btfLatest = useMemo(() => (snap?.basketFlows || []).filter((r: any) => r.turn_number === maxTurnBtf), [snap?.basketFlows, maxTurnBtf]);

  // ═══ Basket matrix for current player ═══
  const basketMatrix = useMemo(() => {
    const m = new Map<string, any>();
    for (const b of DEMAND_BASKETS) {
      m.set(b.key, { key: b.key, label: b.label, icon: b.icon, tier: b.tier,
        demand: 0, local_supply: 0, auto: 0, bonus: 0, unmet: 0, export_surplus: 0,
        market_access: 0, n: 0,
        import_vol: 0, export_vol: 0, import_value: 0, export_value: 0 });
    }
    for (const row of myCmbLatest) {
      const k = row.basket_key;
      if (!m.has(k)) m.set(k, { key: k, label: k, icon: "❓", tier: 0, demand: 0, local_supply: 0, auto: 0, bonus: 0, unmet: 0, export_surplus: 0, market_access: 0, n: 0, import_vol: 0, export_vol: 0, import_value: 0, export_value: 0 });
      const e = m.get(k);
      e.demand += num(row.local_demand);
      e.local_supply += num(row.local_supply);
      e.auto += num(row.auto_supply);
      e.bonus += num(row.bonus_supply);
      e.unmet += num(row.unmet_demand);
      e.export_surplus += num(row.export_surplus);
      e.market_access += num(row.market_access);
      e.n += 1;
    }
    for (const f of btfLatest) {
      const e = m.get(f.basket_key);
      if (!e) continue;
      if (f.target_player === currentPlayerName) {
        e.import_vol += num(f.volume);
        e.import_value += num(f.gross_value);
      }
      if (f.source_player === currentPlayerName) {
        e.export_vol += num(f.volume);
        e.export_value += num(f.gross_value);
      }
    }
    return Array.from(m.values()).sort((a, b) => a.tier - b.tier || a.label.localeCompare(b.label));
  }, [myCmbLatest, btfLatest, currentPlayerName]);

  // node_inventory aggregated by good and by basket
  const invByGood = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of (snap?.nodeInventory || [])) m.set(i.good_key, (m.get(i.good_key) || 0) + num(i.quantity));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [snap?.nodeInventory]);
  const invByBasket = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of (snap?.nodeInventory || [])) {
      const bk = goodToBasket.get(i.good_key) || "—";
      m.set(bk, (m.get(bk) || 0) + num(i.quantity));
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [snap?.nodeInventory, goodToBasket]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />Načítám debug snapshot…
      </div>
    );
  }
  if (err || !snap) {
    return <div className="text-destructive text-sm p-4">Debug error: {err}</div>;
  }

  // ═══ Health warnings ═══
  const orphanTfCitySrc = snap.tradeFlows.filter((f: any) => f.source_city_id && !cityMap.has(f.source_city_id)).length;
  const orphanTfCityTgt = snap.tradeFlows.filter((f: any) => f.target_city_id && !cityMap.has(f.target_city_id)).length;
  const orphanTfNodeSrc = snap.tradeFlows.filter((f: any) => f.source_node_id && !nodeMap.has(f.source_node_id)).length;
  const orphanTfNodeTgt = snap.tradeFlows.filter((f: any) => f.target_node_id && !nodeMap.has(f.target_node_id)).length;
  const orphanBtfSrc = btfLatest.filter((f: any) => !cityMap.has(f.source_city_id)).length;
  const orphanBtfTgt = btfLatest.filter((f: any) => !cityMap.has(f.target_city_id)).length;

  const myUnmetTotal = myCmbLatest.reduce((s: number, r: any) => s + num(r.unmet_demand), 0);
  const mySurplusTotal = myCmbLatest.reduce((s: number, r: any) => s + num(r.export_surplus), 0);
  const myBtfCount = btfLatest.filter((f: any) => f.source_player === currentPlayerName || f.target_player === currentPlayerName).length;
  const crossPlayerFlows = btfLatest.filter((f: any) => f.source_player !== f.target_player).length;

  const r = snap.realm || {};
  const hasExportFlows = btfLatest.some((f: any) => f.source_player === currentPlayerName);

  const bottleneckOf = (row: any): string => {
    if (row.demand <= 0) return "—";
    if (row.unmet <= 0.5) return "✓ satisfied";
    if (row.local_supply <= 0 && row.import_vol <= 0) return "no local + no import";
    if (row.local_supply <= 0) return "no local production";
    if (row.bonus <= 0 && row.auto <= 0) return "no recipe/node output";
    if (row.export_surplus <= 0 && row.import_vol <= 0) return "no surplus to export, no import flow";
    if (row.import_vol <= 0 && row.unmet > 0) return "no generated trade flow";
    return "partial fulfillment";
  };

  // ═══ Production aggregates ═══
  const myNodes = snap.nodes.filter((n: any) => n.controlled_by === currentPlayerName);
  const nodeProd = myNodes.reduce((s, n) => s + num(n.production_output), 0);
  const nodeWealth = myNodes.reduce((s, n) => s + num(n.wealth_output), 0);
  const nodeCap = myNodes.reduce((s, n) => s + num(n.capacity_score), 0);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Banner */}
      <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
        <FlaskConical className="h-5 w-5 text-amber-500 shrink-0" />
        <div className="flex-1">
          <div className="text-sm font-semibold">Ekonomický debug (Dev only)</div>
          <div className="text-[11px] text-muted-foreground">
            Forenzní snímek enginu. Není to hráčské UI. Loaded {snap.loadedAt}.
          </div>
        </div>
        <Badge variant="outline" className="text-[9px]">read-only</Badge>
      </div>

      {/* ═══ 1. HEALTH ═══ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">1 · Pipeline & Health</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="font-mono text-[11px] grid grid-cols-2 gap-x-4 gap-y-1">
            <div>session: <span className="text-foreground">{sessionId.slice(0, 8)}…</span></div>
            <div>player: <span className="text-foreground">{currentPlayerName}</span></div>
            <div>currentTurn (UI): <span className="text-foreground">{currentTurn}</span></div>
            <div>realm.last_processed_turn: <span className="text-foreground">{r.last_processed_turn ?? "—"}</span></div>
            <div>max(cmb.turn): <span className="text-foreground">{maxTurnCmb || "—"}</span></div>
            <div>max(demand.turn): <span className="text-foreground">{maxTurnDemand || "—"}</span></div>
            <div>max(btf.turn): <span className="text-foreground">{maxTurnBtf || "—"}</span></div>
            <div>realm.economy_version: <span className="text-foreground">{r.economy_version ?? "—"}</span></div>
          </div>

          <div>
            <div className="text-[10px] text-muted-foreground mb-1">Expected refresh-economy chain (6 steps):</div>
            <div className="flex flex-wrap gap-1">
              {EXPECTED_CHAIN.map((s, i) => (
                <Badge key={s} variant="secondary" className="text-[9px] font-mono">
                  {i + 1}. {s}
                </Badge>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-border/30 space-y-0.5">
            <Warn ok={maxTurnCmb === currentTurn} msg={`city_market_baskets latest turn (${maxTurnCmb}) ${maxTurnCmb === currentTurn ? "==" : "≠"} currentTurn (${currentTurn})`} />
            <Warn ok={maxTurnDemand === currentTurn} msg={`demand_baskets latest turn (${maxTurnDemand}) ${maxTurnDemand === currentTurn ? "==" : "≠"} currentTurn (${currentTurn})`} />
            <Warn ok={maxTurnBtf === currentTurn || snap.basketFlows.length === 0} msg={`basket_trade_flows latest turn (${maxTurnBtf}) vs currentTurn (${currentTurn})`} />
            <Warn ok={orphanTfCitySrc + orphanTfCityTgt === 0} msg={`trade_flows orphan city ids: src=${orphanTfCitySrc} tgt=${orphanTfCityTgt}`} />
            <Warn ok={orphanTfNodeSrc + orphanTfNodeTgt === 0} msg={`trade_flows orphan node ids: src=${orphanTfNodeSrc} tgt=${orphanTfNodeTgt}`} />
            <Warn ok={orphanBtfSrc + orphanBtfTgt === 0} msg={`basket_trade_flows orphan city ids: src=${orphanBtfSrc} tgt=${orphanBtfTgt}`} />
            <Warn ok={!(myUnmetTotal > 0 && mySurplusTotal > 0 && myBtfCount === 0)} msg={`My unmet=${fmt(myUnmetTotal)} & surplus=${fmt(mySurplusTotal)} but 0 basket flows touching me`} />
            <Warn ok={!(crossPlayerFlows > 0 && num(r.tax_transit) === 0)} msg={`cross-player flows=${crossPlayerFlows} but tax_transit=0`} />
            <Warn ok={!(hasExportFlows && num(r.commercial_capture) === 0)} msg={`export flows exist but commercial_capture=0`} />
            <Warn ok={!(snap.nodes.length > 0 && num(r.total_capacity) === 0)} msg={`province_nodes=${snap.nodes.length} but total_capacity=0`} />
          </div>
          <SourceTag table="aggregated from all tables below" turn={currentTurn} rows={0} />
        </CardContent>
      </Card>

      {/* ═══ 2. LEDGER ═══ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">2 · Realm Ledger (SSOT)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5 font-mono text-[11px]">
            {[
              ["total_gdp", r.total_gdp, "ekon. aktivita (produkce + export)"],
              ["total_production", r.total_production, "možná legacy node output"],
              ["goods_production_value", r.goods_production_value, "realizovaný tržní objem"],
              ["goods_supply_volume", r.goods_supply_volume, ""],
              ["goods_wealth_fiscal", r.goods_wealth_fiscal, "fiskální výnos z goods"],
              ["total_wealth", r.total_wealth, "fiskální stream (HUD)"],
              ["tax_market", r.tax_market, ""],
              ["tax_transit", r.tax_transit, "cross-player flows"],
              ["tax_extraction", r.tax_extraction, ""],
              ["commercial_capture", r.commercial_capture, "export capture"],
              ["commercial_retention", r.commercial_retention, ""],
              ["total_capacity", r.total_capacity, ""],
              ["gold_reserve", r.gold_reserve, ""],
              ["grain_reserve", r.grain_reserve, ""],
              ["wealth_domestic_market", r.wealth_domestic_market, ""],
              ["wealth_route_commerce", r.wealth_route_commerce, ""],
              ["last_turn_gdp_market", r.last_turn_gdp_market, ""],
              ["last_turn_gdp_transit", r.last_turn_gdp_transit, ""],
            ].map(([k, v, hint]: any) => (
              <div key={k} className="flex flex-col py-1 border-b border-border/20">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-foreground font-semibold">{typeof v === "number" ? fmt(v, 2) : String(v ?? "—")}</span>
                </div>
                {hint && <span className="text-[9px] text-muted-foreground/70">{hint}</span>}
              </div>
            ))}
          </div>
          <SourceTag table="realm_resources" turn={r.last_processed_turn} rows={r ? 1 : 0} />
        </CardContent>
      </Card>

      {/* ═══ 3. PRODUCTION ORIGIN ═══ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">3 · Production Origin</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* A. Node raw output */}
          <div>
            <div className="text-xs font-semibold mb-1">A · province_nodes raw output (controlled_by = {currentPlayerName})</div>
            <div className="font-mono text-[11px] mb-2">
              Σ production = <b>{fmt(nodeProd)}</b> · Σ wealth = <b>{fmt(nodeWealth)}</b> · Σ capacity = <b>{fmt(nodeCap)}</b> · nodes = <b>{myNodes.length}</b>
            </div>
            <div className="max-h-64 overflow-y-auto border border-border/30 rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] h-7">Name</TableHead>
                    <TableHead className="text-[10px] h-7">Tier</TableHead>
                    <TableHead className="text-[10px] h-7">Subtype</TableHead>
                    <TableHead className="text-[10px] h-7">Role</TableHead>
                    <TableHead className="text-[10px] h-7 text-right">Prod</TableHead>
                    <TableHead className="text-[10px] h-7 text-right">Wealth</TableHead>
                    <TableHead className="text-[10px] h-7 text-right">Cap</TableHead>
                    <TableHead className="text-[10px] h-7 text-right">Centr.</TableHead>
                    <TableHead className="text-[10px] h-7">TS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myNodes.slice(0, 100).map((n: any) => (
                    <TableRow key={n.id}>
                      <TableCell className="text-[11px] py-1">{n.name}</TableCell>
                      <TableCell className="text-[10px] py-1">{n.node_tier}</TableCell>
                      <TableCell className="text-[10px] py-1">{n.node_subtype || "—"}</TableCell>
                      <TableCell className="text-[10px] py-1">{n.production_role || n.flow_role || "—"}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{fmt(n.production_output)}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{fmt(n.wealth_output)}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{fmt(n.capacity_score)}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{fmt(n.flow_centrality, 2)}</TableCell>
                      <TableCell className="text-[9px] py-1 font-mono">{n.trade_system_id ? String(n.trade_system_id).slice(0, 6) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <SourceTag table="province_nodes" turn={null} rows={myNodes.length} />
          </div>

          {/* B. Node inventory */}
          <div>
            <div className="text-xs font-semibold mb-1">B · node_inventory (my nodes)</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">By good</div>
                <div className="max-h-48 overflow-y-auto font-mono text-[11px] border border-border/30 rounded p-2">
                  {invByGood.length === 0 ? <div className="text-muted-foreground">empty</div> :
                    invByGood.slice(0, 50).map(([g, q]) => (
                      <div key={g} className="flex justify-between"><span>{g}</span><span>{fmt(q)}</span></div>
                    ))
                  }
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">By basket</div>
                <div className="max-h-48 overflow-y-auto font-mono text-[11px] border border-border/30 rounded p-2">
                  {invByBasket.length === 0 ? <div className="text-muted-foreground">empty</div> :
                    invByBasket.map(([b, q]) => (
                      <div key={b} className="flex justify-between"><span>{b}</span><span>{fmt(q)}</span></div>
                    ))
                  }
                </div>
              </div>
            </div>
            <SourceTag table="node_inventory" turn={null} rows={snap.nodeInventory.length} />
          </div>

          {/* C. City auto-production */}
          <div>
            <div className="text-xs font-semibold mb-1">C · city_market_baskets (my cities, latest turn)</div>
            <div className="max-h-72 overflow-y-auto border border-border/30 rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] h-7">City</TableHead>
                    <TableHead className="text-[10px] h-7">Basket</TableHead>
                    <TableHead className="text-[10px] h-7 text-right">Auto</TableHead>
                    <TableHead className="text-[10px] h-7 text-right">Bonus</TableHead>
                    <TableHead className="text-[10px] h-7 text-right">Local</TableHead>
                    <TableHead className="text-[10px] h-7 text-right">Demand</TableHead>
                    <TableHead className="text-[10px] h-7 text-right">Unmet</TableHead>
                    <TableHead className="text-[10px] h-7 text-right">Surplus</TableHead>
                    <TableHead className="text-[10px] h-7 text-right">Sat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myCmbLatest.slice(0, 200).map((row: any) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-[10px] py-1">{cityMap.get(row.city_id)?.name || row.city_id.slice(0, 6)}</TableCell>
                      <TableCell className="text-[10px] py-1 font-mono">{row.basket_key}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{fmt(row.auto_supply)}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{fmt(row.bonus_supply)}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{fmt(row.local_supply)}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{fmt(row.local_demand)}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono text-destructive">{fmt(row.unmet_demand)}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono text-primary">{fmt(row.export_surplus)}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{(num(row.domestic_satisfaction) * 100).toFixed(0)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <SourceTag table="city_market_baskets" turn={maxTurnCmb} rows={myCmbLatest.length} />
          </div>
        </CardContent>
      </Card>

      {/* ═══ 4. BASKET MATRIX ═══ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">4 · Basket Matrix (my realm aggregate)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Basket</TableHead>
                  <TableHead className="text-[10px] text-right">Demand</TableHead>
                  <TableHead className="text-[10px] text-right">Local</TableHead>
                  <TableHead className="text-[10px] text-right">Auto</TableHead>
                  <TableHead className="text-[10px] text-right">Bonus</TableHead>
                  <TableHead className="text-[10px] text-right">Import</TableHead>
                  <TableHead className="text-[10px] text-right">Surplus</TableHead>
                  <TableHead className="text-[10px] text-right">Export</TableHead>
                  <TableHead className="text-[10px] text-right">Unmet</TableHead>
                  <TableHead className="text-[10px] text-right">Sat</TableHead>
                  <TableHead className="text-[10px]">Bottleneck</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {basketMatrix.map((b: any) => {
                  const sat = b.demand > 0 ? Math.max(0, Math.min(1, (b.demand - b.unmet) / b.demand)) : 1;
                  return (
                    <TableRow key={b.key}>
                      <TableCell className="text-[11px] py-1">{b.icon} {b.label} <span className="text-[9px] text-muted-foreground">T{b.tier}</span></TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{fmt(b.demand)}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{fmt(b.local_supply)}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{fmt(b.auto)}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{fmt(b.bonus)}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono text-primary">{fmt(b.import_vol)}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{fmt(b.export_surplus)}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono text-primary">{fmt(b.export_vol)}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono text-destructive">{fmt(b.unmet)}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{(sat * 100).toFixed(0)}%</TableCell>
                      <TableCell className="text-[10px] py-1">{bottleneckOf(b)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <SourceTag table="city_market_baskets + basket_trade_flows" turn={maxTurnCmb} rows={basketMatrix.length} />
        </CardContent>
      </Card>

      {/* ═══ 5. TRADE SYSTEMS (access graph) ═══ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">5 · Trade Systems (automatic access graph — NOT manual contracts)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-h-56 overflow-y-auto border border-border/30 rounded">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Key</TableHead>
                  <TableHead className="text-[10px] text-right">Nodes</TableHead>
                  <TableHead className="text-[10px] text-right">Routes</TableHead>
                  <TableHead className="text-[10px] text-right">Capacity</TableHead>
                  <TableHead className="text-[10px]">Members</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snap.tradeSystems.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-[10px] py-1 font-mono">{t.system_key}</TableCell>
                    <TableCell className="text-[10px] py-1 text-right">{t.node_count}</TableCell>
                    <TableCell className="text-[10px] py-1 text-right">{t.route_count}</TableCell>
                    <TableCell className="text-[10px] py-1 text-right">{fmt(t.total_capacity)}</TableCell>
                    <TableCell className="text-[10px] py-1">{(t.member_players || []).join(", ") || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <SourceTag table="trade_systems" turn={null} rows={snap.tradeSystems.length} />
          <div>
            <div className="text-xs font-semibold mt-2 mb-1">player_trade_system_access (mine)</div>
            <div className="max-h-40 overflow-y-auto border border-border/30 rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">System</TableHead>
                    <TableHead className="text-[10px]">Access</TableHead>
                    <TableHead className="text-[10px] text-right">Tariff</TableHead>
                    <TableHead className="text-[10px]">Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snap.ptsa.filter((p: any) => p.player_name === currentPlayerName).map((p: any) => (
                    <TableRow key={p.trade_system_id}>
                      <TableCell className="text-[10px] py-1 font-mono">{String(p.trade_system_id).slice(0, 8)}</TableCell>
                      <TableCell className="text-[10px] py-1">{p.access_level}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{fmt(p.tariff_factor, 2)}</TableCell>
                      <TableCell className="text-[10px] py-1">{p.access_source || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <SourceTag table="player_trade_system_access" turn={null} rows={snap.ptsa.filter((p: any) => p.player_name === currentPlayerName).length} />
          </div>
        </CardContent>
      </Card>

      {/* ═══ 6. FLOWS ═══ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">6 · Trade Flows</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-xs font-semibold mb-1">basket_trade_flows (latest turn = {maxTurnBtf})</div>
            <div className="max-h-72 overflow-y-auto border border-border/30 rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Basket</TableHead>
                    <TableHead className="text-[10px]">From</TableHead>
                    <TableHead className="text-[10px]">→ To</TableHead>
                    <TableHead className="text-[10px] text-right">Vol</TableHead>
                    <TableHead className="text-[10px] text-right">Price</TableHead>
                    <TableHead className="text-[10px] text-right">Gross</TableHead>
                    <TableHead className="text-[10px] text-right">Tariff</TableHead>
                    <TableHead className="text-[10px] text-right">Fisc</TableHead>
                    <TableHead className="text-[10px]">Acc</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {btfLatest.slice(0, 200).map((f: any) => (
                    <TableRow key={f.id}>
                      <TableCell className="text-[10px] py-1 font-mono">{f.basket_key}</TableCell>
                      <TableCell className="text-[10px] py-1">{cityMap.get(f.source_city_id)?.name || "❌"} <span className="text-muted-foreground">/{f.source_player}</span></TableCell>
                      <TableCell className="text-[10px] py-1">{cityMap.get(f.target_city_id)?.name || "❌"} <span className="text-muted-foreground">/{f.target_player}</span></TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{fmt(f.volume)}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{fmt(f.unit_price, 2)}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{fmt(f.gross_value)}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{fmt(f.tariff_factor, 2)}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono text-primary">{fmt(f.fiscal_capture)}</TableCell>
                      <TableCell className="text-[10px] py-1">L{f.access_level}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <SourceTag table="basket_trade_flows" turn={maxTurnBtf} rows={btfLatest.length} />
          </div>

          <div>
            <div className="text-xs font-semibold mb-1">trade_flows (per-good, all statuses)</div>
            <div className="max-h-72 overflow-y-auto border border-border/30 rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Good</TableHead>
                    <TableHead className="text-[10px]">From city</TableHead>
                    <TableHead className="text-[10px]">→ To city</TableHead>
                    <TableHead className="text-[10px]">From node</TableHead>
                    <TableHead className="text-[10px]">→ To node</TableHead>
                    <TableHead className="text-[10px] text-right">Vol</TableHead>
                    <TableHead className="text-[10px] text-right">Price</TableHead>
                    <TableHead className="text-[10px] text-right">Friction</TableHead>
                    <TableHead className="text-[10px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snap.tradeFlows.slice(0, 200).map((f: any) => (
                    <TableRow key={f.id}>
                      <TableCell className="text-[10px] py-1 font-mono">{f.good_key}</TableCell>
                      <TableCell className="text-[10px] py-1">{cityMap.get(f.source_city_id)?.name || (f.source_city_id ? "❌" : "—")}</TableCell>
                      <TableCell className="text-[10px] py-1">{cityMap.get(f.target_city_id)?.name || (f.target_city_id ? "❌" : "—")}</TableCell>
                      <TableCell className="text-[10px] py-1">{nodeMap.get(f.source_node_id)?.name || (f.source_node_id ? "❌" : "—")}</TableCell>
                      <TableCell className="text-[10px] py-1">{nodeMap.get(f.target_node_id)?.name || (f.target_node_id ? "❌" : "—")}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{fmt(f.volume_per_turn)}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{fmt(f.effective_price, 2)}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{fmt(f.friction_score, 2)}</TableCell>
                      <TableCell className="text-[10px] py-1">{f.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <SourceTag table="trade_flows" turn={null} rows={snap.tradeFlows.length} />
          </div>
        </CardContent>
      </Card>

      {/* ═══ 7. FISCAL TRANSFORM ═══ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">7 · Fiscal Transform Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-[11px] font-mono leading-relaxed bg-muted/30 rounded p-3 overflow-auto">
{`goods_supply_volume      ${fmt(r.goods_supply_volume)}
goods_production_value   ${fmt(r.goods_production_value)}   ← realized basket × price
    ├─ tax_market        ${fmt(r.tax_market)}
    ├─ tax_extraction    ${fmt(r.tax_extraction)}
    ├─ tax_transit       ${fmt(r.tax_transit)}   ${num(r.tax_transit) === 0 && crossPlayerFlows > 0 ? "⚠ cross-player flows exist" : ""}
    ├─ commercial_capture ${fmt(r.commercial_capture)}   ${num(r.commercial_capture) === 0 && hasExportFlows ? "⚠ my export flows exist" : ""}
    └─ commercial_retention ${fmt(r.commercial_retention)}
        ↓
goods_wealth_fiscal      ${fmt(r.goods_wealth_fiscal)}   ${num(r.goods_wealth_fiscal) > num(r.goods_production_value) ? "⚠ fiscal > production value" : ""}
total_wealth             ${fmt(r.total_wealth)}   (HUD topbar SSOT)
total_gdp                ${fmt(r.total_gdp)}   (activity, NOT income)`}
          </pre>
          <SourceTag table="realm_resources (fiscal columns)" turn={r.last_processed_turn} rows={1} />
        </CardContent>
      </Card>

      {/* ═══ 8. MANUAL DEALS ═══ */}
      <Card className="border-amber-500/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            8 · Manual Diplomatic Layer
            <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-600">L3 — NOT the automatic economy</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-xs font-semibold mb-1">trade_routes (active dohody)</div>
            <div className="max-h-48 overflow-y-auto border border-border/30 rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">From</TableHead>
                    <TableHead className="text-[10px]">→ To</TableHead>
                    <TableHead className="text-[10px]">Resource</TableHead>
                    <TableHead className="text-[10px] text-right">Amount</TableHead>
                    <TableHead className="text-[10px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snap.tradeRoutes.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-[10px] py-1">{r.from_player} / {cityMap.get(r.from_city_id)?.name}</TableCell>
                      <TableCell className="text-[10px] py-1">{r.to_player} / {cityMap.get(r.to_city_id)?.name}</TableCell>
                      <TableCell className="text-[10px] py-1 font-mono">{r.resource_type}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{r.amount_per_turn}</TableCell>
                      <TableCell className="text-[10px] py-1">{r.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <SourceTag table="trade_routes" turn={null} rows={snap.tradeRoutes.length} />
          </div>
          <div>
            <div className="text-xs font-semibold mb-1">trade_offers</div>
            <div className="max-h-40 overflow-y-auto border border-border/30 rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">From → To</TableHead>
                    <TableHead className="text-[10px]">Status</TableHead>
                    <TableHead className="text-[10px] text-right">Turn</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snap.tradeOffers.map((o: any) => (
                    <TableRow key={o.id}>
                      <TableCell className="text-[10px] py-1">{o.from_player} → {o.to_player}</TableCell>
                      <TableCell className="text-[10px] py-1">{o.status}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{o.turn_number}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <SourceTag table="trade_offers" turn={null} rows={snap.tradeOffers.length} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EconomyDebugTab;
