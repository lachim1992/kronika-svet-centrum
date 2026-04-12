import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { InfoTip } from "@/components/ui/info-tip";
import { Loader2 } from "lucide-react";
import { DEMAND_BASKETS } from "@/lib/goodsCatalog";

interface Props {
  sessionId: string;
  playerName: string;
}

interface MarketShareRow {
  basket_key: string;
  auto_production: number;
  bonus_production: number;
  effective_export: number;
  global_export: number;
  market_share: number;
  domestic_satisfaction: number;
  wealth_generated: number;
  turn_number: number;
  player_name: string;
}

const MarketSharePanel = ({ sessionId, playerName }: Props) => {
  const [shares, setShares] = useState<MarketShareRow[]>([]);
  const [allShares, setAllShares] = useState<MarketShareRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      // Get latest turn's market shares for all players
      const { data } = await supabase
        .from("market_shares")
        .select("*")
        .eq("session_id", sessionId)
        .order("turn_number", { ascending: false })
        .limit(200);

      const rows = (data || []) as MarketShareRow[];
      // Get the latest turn
      const maxTurn = rows.reduce((m, r) => Math.max(m, r.turn_number), 0);
      const latest = rows.filter(r => r.turn_number === maxTurn);
      
      setAllShares(latest);
      setShares(latest.filter(r => r.player_name === playerName));
      setLoading(false);
    };
    fetch();
  }, [sessionId, playerName]);

  const basketMeta = useMemo(() => {
    const map = new Map<string, { label: string; icon: string }>();
    for (const b of DEMAND_BASKETS) {
      map.set(b.key, { label: b.label, icon: b.icon });
    }
    return map;
  }, []);

  // Group all players' shares by basket for competitive view
  const competitiveData = useMemo(() => {
    const byBasket = new Map<string, { players: Array<{ name: string; share: number; wealth: number }>; totalExport: number }>();
    for (const row of allShares) {
      if (!byBasket.has(row.basket_key)) byBasket.set(row.basket_key, { players: [], totalExport: row.global_export });
      byBasket.get(row.basket_key)!.players.push({
        name: row.player_name,
        share: row.market_share,
        wealth: row.wealth_generated,
      });
    }
    // Sort players by share desc
    for (const [, data] of byBasket) {
      data.players.sort((a, b) => b.share - a.share);
    }
    return byBasket;
  }, [allShares]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (shares.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-2">
          <div className="text-lg">📊</div>
          <p className="text-sm font-semibold text-foreground">Tržní data nejsou k dispozici</p>
          <p className="text-xs text-muted-foreground">Klikněte na „Přepočítat ekonomiku" pro vygenerování dat o tržním podílu.</p>
        </CardContent>
      </Card>
    );
  }

  const totalWealth = shares.reduce((s, r) => s + r.wealth_generated, 0);

  const PLAYER_COLORS = ["bg-primary", "bg-amber-500", "bg-blue-500", "bg-emerald-500", "bg-purple-500"];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold font-display">Celkový wealth z tržního podílu</span>
            <span className="text-2xl font-bold font-mono text-primary">{totalWealth.toFixed(1)}</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Součet wealth generovaného exportní dominancí na globálním trhu.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            📊 Tržní podíl dle koše
            <InfoTip>Váš podíl na globálním exportním trhu. Více export = více wealth.</InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1 space-y-3">
          {shares
            .filter(s => s.market_share > 0 || s.auto_production > 0)
            .sort((a, b) => b.wealth_generated - a.wealth_generated)
            .map(s => {
              const meta = basketMeta.get(s.basket_key);
              const competitive = competitiveData.get(s.basket_key);
              const mySharePct = s.market_share * 100;

              return (
                <div key={s.basket_key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold flex items-center gap-1.5">
                      {meta?.icon} {meta?.label || s.basket_key}
                    </span>
                    <span className="font-mono text-[10px]">
                      {mySharePct.toFixed(1)}% podíl
                      <span className="ml-1.5 text-primary font-semibold">
                        💰{s.wealth_generated.toFixed(1)}
                      </span>
                    </span>
                  </div>

                  {/* Competitive bar */}
                  <div className="flex h-3 rounded-full overflow-hidden bg-muted/30">
                    {competitive?.players.map((p, i) => (
                      <div
                        key={p.name}
                        className={`${p.name === playerName ? "bg-primary" : PLAYER_COLORS[i % PLAYER_COLORS.length]} transition-all`}
                        style={{ width: `${Math.max(2, p.share * 100)}%` }}
                        title={`${p.name}: ${(p.share * 100).toFixed(1)}%`}
                      />
                    ))}
                  </div>

                  <div className="flex justify-between text-[9px] text-muted-foreground">
                    <span>Auto: {s.auto_production.toFixed(1)} | Bonus: {s.bonus_production.toFixed(1)}</span>
                    <span>Sat: {(s.domestic_satisfaction * 100).toFixed(0)}% | Export: {s.effective_export.toFixed(1)}</span>
                  </div>
                </div>
              );
            })}
        </CardContent>
      </Card>
    </div>
  );
};

export default MarketSharePanel;
