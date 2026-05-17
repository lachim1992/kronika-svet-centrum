// Player-facing trade balance: aggregates basket_trade_flows for this player
// into imports (incoming volume + value), exports (outgoing volume + value)
// and resulting fiscal income (sum of fiscal_capture on exports).
// Always visible — no dev gate. Numbers are direct sums from the L2 solver.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { DEMAND_BASKETS, resolveBasketKey } from "@/lib/goodsCatalog";

interface Props {
  sessionId: string;
  playerName: string;
}

interface Row {
  basket_key: string;
  source_player: string;
  target_player: string;
  volume: number;
  gross_value: number;
  fiscal_capture: number;
  turn_number: number;
}

const TradeBalanceSummary = ({ sessionId, playerName }: Props) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("basket_trade_flows")
        .select("basket_key,source_player,target_player,volume,gross_value,fiscal_capture,turn_number")
        .eq("session_id", sessionId)
        .or(`source_player.eq.${playerName},target_player.eq.${playerName}`)
        .order("turn_number", { ascending: false })
        .limit(1000);
      if (cancelled) return;
      const all = (data || []) as Row[];
      const maxTurn = all.reduce((m, r) => Math.max(m, r.turn_number), 0);
      setRows(all.filter(r => r.turn_number === maxTurn));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [sessionId, playerName]);

  const basketMeta = useMemo(() => {
    const m = new Map<string, { label: string; icon: string }>();
    for (const b of DEMAND_BASKETS) m.set(b.key, { label: b.label, icon: b.icon });
    return m;
  }, []);

  const { imports, exports, totals, partners } = useMemo(() => {
    const imp = new Map<string, { volume: number; value: number }>();
    const exp = new Map<string, { volume: number; value: number; fiscal: number }>();
    const partnerSet = new Set<string>();
    let totImpV = 0, totImpVal = 0, totExpV = 0, totExpVal = 0, totFiscal = 0;
    for (const r of rows) {
      const key = resolveBasketKey(r.basket_key);
      if (r.target_player === playerName) {
        const cur = imp.get(key) || { volume: 0, value: 0 };
        cur.volume += r.volume; cur.value += r.gross_value;
        imp.set(key, cur);
        totImpV += r.volume; totImpVal += r.gross_value;
        partnerSet.add(r.source_player);
      }
      if (r.source_player === playerName) {
        const cur = exp.get(key) || { volume: 0, value: 0, fiscal: 0 };
        cur.volume += r.volume; cur.value += r.gross_value; cur.fiscal += r.fiscal_capture;
        exp.set(key, cur);
        totExpV += r.volume; totExpVal += r.gross_value; totFiscal += r.fiscal_capture;
        partnerSet.add(r.target_player);
      }
    }
    const sortByVal = (a: [string, { value: number }], b: [string, { value: number }]) => b[1].value - a[1].value;
    return {
      imports: Array.from(imp.entries()).sort(sortByVal),
      exports: Array.from(exp.entries()).sort(sortByVal),
      totals: { impVolume: totImpV, impValue: totImpVal, expVolume: totExpV, expValue: totExpVal, fiscal: totFiscal },
      partners: partnerSet.size,
    };
  }, [rows, playerName]);

  if (loading) {
    return <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>;
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-center text-xs text-muted-foreground">
          Žádné mezistátní obchody v tomto kole. Postavte cesty nebo otevřete přístup do obchodních systémů.
        </CardContent>
      </Card>
    );
  }

  const netBalance = totals.expValue - totals.impValue;

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          🔁 Bilance zahraničního obchodu
          <InfoTip>Souhrn všech mezistátních toků basketů v aktuálním kole. Fiskální příjem = co z exportu plyne do pokladny.</InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1 space-y-3">
        {/* Topline */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border/40 bg-card/40 p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">📥 Import</div>
            <div className="text-lg font-bold font-mono">{totals.impValue.toFixed(1)}</div>
            <div className="text-[10px] text-muted-foreground">{totals.impVolume.toFixed(1)} jedn.</div>
          </div>
          <div className="rounded-lg border border-border/40 bg-card/40 p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">📤 Export</div>
            <div className="text-lg font-bold font-mono">{totals.expValue.toFixed(1)}</div>
            <div className="text-[10px] text-muted-foreground">{totals.expVolume.toFixed(1)} jedn.</div>
          </div>
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-primary/80">💰 Fiskální příjem</div>
            <div className="text-lg font-bold font-mono text-primary">{totals.fiscal.toFixed(2)}</div>
            <div className="text-[10px] text-muted-foreground">z {partners} partnerů</div>
          </div>
        </div>

        {/* Net balance */}
        <div className="flex items-center justify-between text-xs px-1">
          <span className="text-muted-foreground">Čistá obchodní bilance (export − import)</span>
          <span className={`font-mono font-bold ${netBalance >= 0 ? "text-primary" : "text-destructive"}`}>
            {netBalance >= 0 ? "+" : ""}{netBalance.toFixed(2)}
          </span>
        </div>

        {/* Two columns: imports / exports per basket */}
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">📥 Co dovážíte</div>
            {imports.length === 0 ? (
              <div className="text-[10px] text-muted-foreground italic">Nic se nedováží.</div>
            ) : (
              <div className="space-y-1">
                {imports.map(([key, d]) => {
                  const meta = basketMeta.get(key);
                  return (
                    <div key={key} className="flex items-center justify-between text-[11px]">
                      <span className="truncate">{meta?.icon} {meta?.label || key}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {d.volume.toFixed(1)} · <span className="text-foreground">${d.value.toFixed(1)}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">📤 Co vyvážíte</div>
            {exports.length === 0 ? (
              <div className="text-[10px] text-muted-foreground italic">Nic se nevyváží.</div>
            ) : (
              <div className="space-y-1">
                {exports.map(([key, d]) => {
                  const meta = basketMeta.get(key);
                  return (
                    <div key={key} className="flex items-center justify-between text-[11px]">
                      <span className="truncate">{meta?.icon} {meta?.label || key}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {d.volume.toFixed(1)} · <span className="text-foreground">${d.value.toFixed(1)}</span>
                        <span className="text-primary"> · 💰{d.fiscal.toFixed(2)}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TradeBalanceSummary;
