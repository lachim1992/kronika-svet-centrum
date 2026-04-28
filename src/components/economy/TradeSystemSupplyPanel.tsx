// ============================================================================
// TradeSystemSupplyPanel — Dev-only monitoring panel for trade system flows.
//
// Shows per-basket supply/demand aggregated across active trade systems.
// Identifies imports/exports surplus and deficits per network.
//
// Source: trade_system_basket_supply (canonical 12 baskets).
// Populated by: compute-trade-flows Phase 4a-ter (R1 fix).
// ============================================================================

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingDown, TrendingUp, Minus } from "lucide-react";

interface Props {
  sessionId: string;
}

interface BasketAggregate {
  basket_key: string;
  total_supply: number;
  total_demand: number;
  systems: number;
  balance: number;
}

const BASKET_LABELS: Record<string, string> = {
  staple_food: "Základní jídlo",
  drinking_water: "Pitná voda",
  basic_clothing: "Oděv",
  fuel: "Palivo",
  tools: "Nástroje",
  construction: "Stavivo",
  metalwork: "Kovářské zboží",
  storage_logistics: "Sklady a logistika",
  admin_supplies: "Administrativa",
  feast: "Hostiny",
  luxury_clothing: "Luxusní oděv",
  prestige_goods: "Prestižní zboží",
};

const TradeSystemSupplyPanel = ({ sessionId }: Props) => {
  const [data, setData] = useState<BasketAggregate[]>([]);
  const [loading, setLoading] = useState(true);
  const [systemCount, setSystemCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data: rows, error } = await supabase
        .from("trade_system_basket_supply")
        .select("basket_key, total_supply, total_demand, trade_system_id")
        .eq("session_id", sessionId);
      if (cancelled) return;
      if (error || !rows) {
        setData([]);
        setLoading(false);
        return;
      }
      const agg = new Map<string, BasketAggregate>();
      const systems = new Set<string>();
      for (const r of rows) {
        systems.add(r.trade_system_id as string);
        const key = r.basket_key as string;
        const cur = agg.get(key) || { basket_key: key, total_supply: 0, total_demand: 0, systems: 0, balance: 0 };
        cur.total_supply += Number(r.total_supply || 0);
        cur.total_demand += Number(r.total_demand || 0);
        cur.systems += 1;
        agg.set(key, cur);
      }
      const arr = Array.from(agg.values()).map((a) => ({ ...a, balance: a.total_supply - a.total_demand }));
      arr.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
      setData(arr);
      setSystemCount(systems.size);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [sessionId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>🔄 Trade System Supply / Demand</span>
          <Badge variant="outline" className="font-mono text-xs">
            {systemCount} aktivních sítí
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Agregované toky 12 canonical baskets napříč všemi obchodními sítěmi (BFS clusters).
          Surplus = export potenciál, Deficit = import potřebný.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Žádná data — spusť `compute-trade-flows` přes Recompute All.
          </p>
        ) : (
          <div className="space-y-2">
            {data.map((row) => {
              const isSurplus = row.balance > 0.01;
              const isDeficit = row.balance < -0.01;
              const Icon = isSurplus ? TrendingUp : isDeficit ? TrendingDown : Minus;
              const color = isSurplus
                ? "text-green-600 dark:text-green-400"
                : isDeficit
                ? "text-red-600 dark:text-red-400"
                : "text-muted-foreground";
              const fillRatio = row.total_demand > 0
                ? Math.min(100, (row.total_supply / row.total_demand) * 100)
                : row.total_supply > 0 ? 100 : 0;
              return (
                <div
                  key={row.basket_key}
                  className="flex items-center justify-between gap-3 rounded border border-border bg-muted/30 p-2 text-sm"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Icon className={`h-4 w-4 shrink-0 ${color}`} />
                    <span className="font-medium truncate">
                      {BASKET_LABELS[row.basket_key] || row.basket_key}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-xs">
                    <span className="text-green-600/80 dark:text-green-400/80" title="Supply">
                      ▲ {row.total_supply.toFixed(1)}
                    </span>
                    <span className="text-red-600/80 dark:text-red-400/80" title="Demand">
                      ▼ {row.total_demand.toFixed(1)}
                    </span>
                    <span className={`font-bold w-16 text-right ${color}`}>
                      {row.balance >= 0 ? "+" : ""}{row.balance.toFixed(1)}
                    </span>
                    <Badge variant="secondary" className="font-mono text-[10px] w-12 justify-center">
                      {fillRatio.toFixed(0)}%
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TradeSystemSupplyPanel;
