/**
 * Dev-only diagnostic panel — Phase 1C.
 * Shows all owned nodes with computed capacity, current production order,
 * last solver status/reason, and last-turn recipe outputs from node_inventory.
 *
 * Read-only. Mounted inside GoodsProductionManager when useDevMode() is on.
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, FlaskConical, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { computeNodeProductionBudget, getBasketMeta } from "@/lib/goodsCatalog";

interface Props {
  sessionId: string;
  currentPlayerName: string;
}

interface NodeRow {
  id: string;
  name: string;
  city_id: string | null;
  node_subtype: string | null;
  production_role: string | null;
  capability_tags: string[] | null;
  upgrade_level: number | null;
  guild_level: number | null;
  production_output: number | null;
  controlled_by: string | null;
}

interface OrderRow {
  node_id: string;
  mode: string;
  target_basket_key: string;
  target_good_key: string | null;
  last_status: string | null;
  last_status_reason: string | null;
}

interface InvRow { node_id: string; good_key: string; quantity: number }

const statusBadge = (s: string | null) => {
  if (!s) return null;
  const variant: Record<string, string> = {
    auto: "border-muted-foreground/30 text-muted-foreground",
    prefer: "border-primary/40 text-primary",
    locked: "border-emerald-500/40 text-emerald-600",
    blocked: "border-destructive/50 text-destructive",
    prefer_no_match: "border-amber-500/50 text-amber-600",
  };
  return (
    <Badge variant="outline" className={`text-[9px] ${variant[s] || ""}`}>
      {s}
    </Badge>
  );
};

const OrdersCapacityPanel = ({ sessionId, currentPlayerName }: Props) => {
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [inv, setInv] = useState<InvRow[]>([]);
  const [cities, setCities] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    const [nRes, cRes] = await Promise.all([
      supabase
        .from("province_nodes")
        .select("id,name,city_id,node_subtype,production_role,capability_tags,upgrade_level,guild_level,production_output,controlled_by")
        .eq("session_id", sessionId)
        .eq("controlled_by", currentPlayerName)
        .limit(500),
      supabase
        .from("cities")
        .select("id,name")
        .eq("session_id", sessionId)
        .eq("owner_player", currentPlayerName)
        .limit(200),
    ]);
    const nrows = (nRes.data || []) as NodeRow[];
    setNodes(nrows);
    setCities(cRes.data || []);
    if (nrows.length > 0) {
      const ids = nrows.map(n => n.id);
      const [oRes, iRes] = await Promise.all([
        (supabase as any)
          .from("node_production_orders")
          .select("node_id,mode,target_basket_key,target_good_key,last_status,last_status_reason")
          .eq("session_id", sessionId)
          .in("node_id", ids),
        (supabase as any)
          .from("node_inventory")
          .select("node_id,good_key,quantity")
          .in("node_id", ids),
      ]);
      setOrders((oRes.data || []) as OrderRow[]);
      setInv((iRes.data || []) as InvRow[]);
    } else {
      setOrders([]); setInv([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [sessionId, currentPlayerName]);

  const cityName = useMemo(() => {
    const m = new Map(cities.map(c => [c.id, c.name]));
    return (id: string | null) => (id ? m.get(id) || "—" : "—");
  }, [cities]);

  const orderByNode = useMemo(() => {
    const m = new Map<string, OrderRow>();
    orders.forEach(o => m.set(o.node_id, o));
    return m;
  }, [orders]);

  const invByNode = useMemo(() => {
    const m = new Map<string, InvRow[]>();
    for (const i of inv) {
      const arr = m.get(i.node_id) || [];
      arr.push(i);
      m.set(i.node_id, arr);
    }
    return m;
  }, [inv]);

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const ordersCount = orders.length;
  const totalCap = nodes.reduce((s, n) => s + computeNodeProductionBudget(n), 0);

  return (
    <Card className="border-dashed border-amber-500/40 bg-amber-500/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-amber-600" />
            <span className="text-xs font-display font-semibold text-amber-700">
              Dev · Orders & Capacity
            </span>
            <Badge variant="outline" className="text-[9px]">
              {nodes.length} nodů · ⚡ {totalCap.toFixed(1)} slotů · 🪄 {ordersCount} orderů
            </Badge>
          </div>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={fetchAll}>
            <RefreshCw className="h-3 w-3 mr-1" /> Reload
          </Button>
        </div>

        {nodes.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">Žádné nody pod tvojí kontrolou.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[10px]">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border/40">
                  <th className="text-left p-1.5">Node</th>
                  <th className="text-left p-1.5">Město</th>
                  <th className="text-left p-1.5">Role</th>
                  <th className="text-right p-1.5">⚡ Cap</th>
                  <th className="text-left p-1.5">Order</th>
                  <th className="text-left p-1.5">Status</th>
                  <th className="text-left p-1.5">Reason</th>
                  <th className="text-left p-1.5">Last outputs</th>
                </tr>
              </thead>
              <tbody>
                {nodes
                  .sort((a, b) => {
                    const ao = orderByNode.has(a.id) ? 0 : 1;
                    const bo = orderByNode.has(b.id) ? 0 : 1;
                    if (ao !== bo) return ao - bo;
                    return computeNodeProductionBudget(b) - computeNodeProductionBudget(a);
                  })
                  .map(n => {
                    const cap = computeNodeProductionBudget(n);
                    const o = orderByNode.get(n.id);
                    const outputs = (invByNode.get(n.id) || [])
                      .sort((a, b) => b.quantity - a.quantity)
                      .slice(0, 3);
                    const meta = o ? getBasketMeta(o.target_basket_key) : null;
                    return (
                      <tr key={n.id} className="border-b border-border/20 hover:bg-muted/20">
                        <td className="p-1.5 font-mono truncate max-w-[140px]">{n.name}</td>
                        <td className="p-1.5 truncate max-w-[100px]">{cityName(n.city_id)}</td>
                        <td className="p-1.5 text-muted-foreground">{n.production_role || "—"}</td>
                        <td className="p-1.5 text-right font-mono">{cap}</td>
                        <td className="p-1.5">
                          {o ? (
                            <span className="inline-flex items-center gap-1">
                              <Badge variant="outline" className="text-[9px] border-primary/40 text-primary">
                                {o.mode}
                              </Badge>
                              <span>{meta?.icon} {o.target_basket_key}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic">—</span>
                          )}
                        </td>
                        <td className="p-1.5">{statusBadge(o?.last_status || null)}</td>
                        <td className="p-1.5 text-muted-foreground truncate max-w-[160px]" title={o?.last_status_reason || ""}>
                          {o?.last_status_reason || "—"}
                        </td>
                        <td className="p-1.5 text-muted-foreground">
                          {outputs.length === 0
                            ? "—"
                            : outputs.map(o2 => `${o2.good_key}:${Math.round(o2.quantity)}`).join(", ")}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[9px] text-muted-foreground italic">
          Capacity = role-base + 0.5·(upgrade−1) + 0.5·guild (max +1.5), × clamp(production_output/5, 0.5..1.5), clamp 1..6.
          Per-recipe share je v solveru capped na 2.0 slotu. Bez orderu solver běží legacy (share=1/recipe).
        </p>
      </CardContent>
    </Card>
  );
};

export default OrdersCapacityPanel;
