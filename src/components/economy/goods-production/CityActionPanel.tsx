import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Hammer, Boxes, Truck, Lock, Wand2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getBuildingTemplatesForBasket, getBasketMeta, computeNodeProductionBudget } from "@/lib/goodsCatalog";

interface Props {
  sessionId: string;
  cityId: string;
  cityName: string;
  basketKey: string;
  templates: any[];
  onNavigateToCities: (cityId: string, templateId: string, basketKey: string) => void;
}

interface NodeRow {
  id: string;
  name: string;
  node_subtype: string | null;
  production_role: string | null;
  capability_tags: string[] | null;
  trade_system_id: string | null;
  city_id: string | null;
  controlled_by: string | null;
  upgrade_level: number | null;
  guild_level: number | null;
  production_output: number | null;
}

const CityActionPanel = ({ sessionId, cityId, cityName, basketKey, templates, onNavigateToCities }: Props) => {
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [inv, setInv] = useState<any[]>([]);
  const [access, setAccess] = useState<any[]>([]);
  const [tradeSurplus, setTradeSurplus] = useState<any[]>([]);
  const [orders, setOrders] = useState<Record<string, { mode: string; basket: string; status: string | null; reason: string | null }>>({});
  const [busyNode, setBusyNode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOrders = async (nodeIds: string[]) => {
    if (nodeIds.length === 0) return;
    const { data } = await (supabase as any)
      .from("node_production_orders")
      .select("node_id, mode, target_basket_key, last_status, last_status_reason")
      .eq("session_id", sessionId)
      .in("node_id", nodeIds);
    const map: any = {};
    for (const o of data || []) {
      map[o.node_id] = { mode: o.mode, basket: o.target_basket_key, status: o.last_status, reason: o.last_status_reason };
    }
    setOrders(map);
  };

  const setOrder = async (nodeId: string, mode: "auto" | "prefer" | "lock") => {
    setBusyNode(nodeId);
    try {
      const { data, error } = await supabase.functions.invoke("set-node-production-order", {
        body: { session_id: sessionId, node_id: nodeId, target_basket_key: basketKey, mode },
      });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.error || error?.message || "Set order failed");
      } else {
        toast.success(mode === "auto" ? "Order vyčištěn" : `Order: ${mode} → ${basketKey}`);
        await loadOrders([nodeId]);
      }
    } finally {
      setBusyNode(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [nRes, aRes, sRes] = await Promise.all([
        supabase
          .from("province_nodes")
          .select("id,name,node_subtype,production_role,capability_tags,trade_system_id,city_id,controlled_by")
          .eq("session_id", sessionId)
          .eq("city_id", cityId),
        supabase
          .from("player_trade_system_access")
          .select("trade_system_id,access_level,tariff_factor")
          .eq("session_id", sessionId),
        // G1: basket_trade_flows optional
        (supabase
          .from("basket_trade_flows" as any)
          .select("source_city_id,volume,trade_system_id,basket_key")
          .eq("session_id", sessionId)
          .eq("basket_key", basketKey)
          .limit(20) as any)
          .then((r: any) => r, () => ({ data: [], error: null })),
      ]);
      if (cancelled) return;
      const nodeRows = ((nRes.data as any[]) || []) as NodeRow[];
      setNodes(nodeRows);
      setAccess(aRes.data || []);
      setTradeSurplus(((sRes as any).data || []) as any[]);
      // Fetch inventory for these nodes (best effort)
      if (nodeRows.length > 0) {
        const invRes: any = await (supabase as any)
          .from("node_inventory")
          .select("node_id,good_key,quantity")
          .eq("session_id", sessionId)
          .in("node_id", nodeRows.map(n => n.id));
        if (!cancelled) setInv(invRes?.data || []);
        if (!cancelled) await loadOrders(nodeRows.map(n => n.id));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [sessionId, cityId, basketKey]);

  const buildingMatches = useMemo(
    () => getBuildingTemplatesForBasket(templates, basketKey).slice(0, 6),
    [templates, basketKey],
  );

  const meta = getBasketMeta(basketKey);

  const accessibleSystems = access.filter((a: any) => a.access_level && a.access_level !== "none");
  const surplusSources = tradeSurplus.filter((f: any) =>
    accessibleSystems.some((a: any) => a.trade_system_id === f.trade_system_id),
  );

  return (
    <div className="space-y-3 p-3 rounded-lg border border-border/40 bg-muted/20">
      <div className="text-xs font-display font-semibold flex items-center gap-1.5">
        🏛️ {cityName} — {meta.icon} {meta.label}
      </div>

      {/* A) Recommended buildings */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Hammer className="h-3 w-3" /> A) Doporučené budovy
        </div>
        {buildingMatches.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic px-2">
            Žádná šablona nemá basket_outputs pro tento koš.
          </p>
        ) : (
          <div className="space-y-1">
            {buildingMatches.map(t => {
              const bo = (t.effects as any)?.basket_outputs || {};
              const v = Number(bo[basketKey]) || 0;
              return (
                <div key={t.id} className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-card/60">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs">🏗️</span>
                    <span className="text-xs font-semibold truncate">{t.name}</span>
                    <Badge variant="outline" className="text-[8px] border-emerald-500/40 text-emerald-600">
                      🛒 +{v}/Lvl
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="default"
                    className="h-6 text-[10px] px-2 shrink-0"
                    onClick={() => onNavigateToCities(cityId, t.id, basketKey)}
                  >
                    Postavit
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* B) Candidate nodes (read-only) */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Boxes className="h-3 w-3" /> B) Kandidátní nody
        </div>
        {loading ? (
          <p className="text-[10px] text-muted-foreground px-2">Načítám…</p>
        ) : nodes.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic px-2">
            Žádné připojené nody.
          </p>
        ) : (
          <div className="space-y-1">
            {nodes.slice(0, 6).map(n => {
              const tags = (n.capability_tags || []).slice(0, 3).join(", ");
              const myInv = inv.filter(i => i.node_id === n.id).slice(0, 2);
              const o = orders[n.id];
              const isThisBasket = o?.basket === basketKey;
              const busy = busyNode === n.id;
              return (
                <div key={n.id} className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-card/60">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate flex items-center gap-1.5">
                      ⚙️ {n.name}
                      {o && isThisBasket && (
                        <Badge variant="outline" className="text-[8px] border-primary/40 text-primary">
                          {o.mode}{o.status === "blocked" ? " · ⛔" : o.status === "prefer_no_match" ? " · ⚠" : ""}
                        </Badge>
                      )}
                      {o && !isThisBasket && (
                        <Badge variant="outline" className="text-[8px] border-muted-foreground/40 text-muted-foreground">
                          {o.mode}→{o.basket}
                        </Badge>
                      )}
                    </div>
                    <div className="text-[9px] text-muted-foreground truncate">
                      {n.node_subtype} · {n.production_role || "—"} · {tags || "—"}
                      {myInv.length > 0 && ` · 📦 ${myInv.map(i => `${i.good_key}:${Math.round(i.quantity)}`).join(", ")}`}
                      {o?.reason && isThisBasket && ` · ${o.reason}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      size="sm" variant={isThisBasket && o?.mode === "prefer" ? "default" : "outline"}
                      className="h-6 text-[10px] px-1.5" disabled={busy}
                      onClick={() => setOrder(n.id, "prefer")}
                      title={`Prefer ${basketKey} (weight ×3)`}
                    >
                      <Wand2 className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm" variant={isThisBasket && o?.mode === "lock" ? "default" : "outline"}
                      className="h-6 text-[10px] px-1.5" disabled={busy}
                      onClick={() => setOrder(n.id, "lock")}
                      title={`Lock to ${basketKey} only`}
                    >
                      <Lock className="h-3 w-3" />
                    </Button>
                    {o && (
                      <Button
                        size="sm" variant="ghost"
                        className="h-6 text-[10px] px-1.5" disabled={busy}
                        onClick={() => setOrder(n.id, "auto")}
                        title="Reset to auto"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* C) Trade / import */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Truck className="h-3 w-3" /> C) Obchodní přístup
        </div>
        {accessibleSystems.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic px-2">
            Bez přístupu k obchodnímu systému — postav cestu nebo uzavři dohodu.
          </p>
        ) : surplusSources.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic px-2">
            Máš přístup k {accessibleSystems.length} systémům, ale žádný nemá zaznamenaný surplus pro tento koš.
          </p>
        ) : (
          <p className="text-[10px] text-muted-foreground px-2">
            {surplusSources.length} dostupných zdrojů surplusu (objem {surplusSources.reduce((s, f) => s + (Number(f.volume) || 0), 0).toFixed(1)}).
          </p>
        )}
      </div>
    </div>
  );
};

export default CityActionPanel;
