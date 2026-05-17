// Dev panel: per-basket import trace for a player from basket_trade_flows.
// Read-only. Surfaces L2 solver decisions (which city imports what, from whom,
// at what tariff). Gated by useDevMode at the parent.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  sessionId: string;
  playerName: string;
  basketKey: string;
}

interface FlowRow {
  source_city_id: string;
  target_city_id: string;
  source_player: string;
  volume: number;
  unit_price: number;
  gross_value: number;
  tariff_factor: number;
  fiscal_capture: number;
  access_level: number;
}

const TradeFlowTrace = ({ sessionId, playerName, basketKey }: Props) => {
  const [imports, setImports] = useState<FlowRow[]>([]);
  const [exports, setExports] = useState<FlowRow[]>([]);
  const [cityNames, setCityNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [imp, exp] = await Promise.all([
        supabase.from("basket_trade_flows")
          .select("source_city_id,target_city_id,source_player,volume,unit_price,gross_value,tariff_factor,fiscal_capture,access_level,turn_number")
          .eq("session_id", sessionId)
          .eq("basket_key", basketKey)
          .eq("target_player", playerName)
          .order("gross_value", { ascending: false })
          .limit(20),
        supabase.from("basket_trade_flows")
          .select("source_city_id,target_city_id,source_player,volume,unit_price,gross_value,tariff_factor,fiscal_capture,access_level,turn_number")
          .eq("session_id", sessionId)
          .eq("basket_key", basketKey)
          .eq("source_player", playerName)
          .order("gross_value", { ascending: false })
          .limit(20),
      ]);

      const ids = new Set<string>();
      for (const r of (imp.data || []) as FlowRow[]) { ids.add(r.source_city_id); ids.add(r.target_city_id); }
      for (const r of (exp.data || []) as FlowRow[]) { ids.add(r.source_city_id); ids.add(r.target_city_id); }
      let names: Record<string, string> = {};
      if (ids.size > 0) {
        const { data: cities } = await supabase.from("cities").select("id,name").in("id", Array.from(ids));
        names = Object.fromEntries((cities || []).map((c: any) => [c.id, c.name]));
      }

      if (cancelled) return;
      setImports((imp.data || []) as FlowRow[]);
      setExports((exp.data || []) as FlowRow[]);
      setCityNames(names);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [sessionId, playerName, basketKey]);

  if (loading) return <div className="flex justify-center py-3"><Loader2 className="h-3 w-3 animate-spin" /></div>;

  if (imports.length === 0 && exports.length === 0) {
    return <div className="text-[10px] text-muted-foreground italic">Žádné toky basketu pro tuto frakci.</div>;
  }

  const renderRow = (r: FlowRow, dir: "in" | "out") => (
    <div className="flex items-center justify-between gap-2 text-[10px] font-mono py-0.5 border-b border-border/30 last:border-0">
      <span className="truncate">
        <Badge variant="outline" className="text-[8px] mr-1">L{r.access_level}</Badge>
        {dir === "in"
          ? <>{cityNames[r.source_city_id] || "?"} <span className="text-muted-foreground">({r.source_player})</span> → {cityNames[r.target_city_id] || "?"}</>
          : <>{cityNames[r.source_city_id] || "?"} → {cityNames[r.target_city_id] || "?"} <span className="text-muted-foreground">({r.source_player !== r.source_player ? r.source_player : ""})</span></>}
      </span>
      <span className="shrink-0 text-right">
        v={r.volume.toFixed(2)} · ${r.gross_value.toFixed(2)}
        {dir === "out" && <span className="text-primary"> · fisk={r.fiscal_capture.toFixed(2)}</span>}
        <span className="text-muted-foreground"> · t={r.tariff_factor.toFixed(2)}</span>
      </span>
    </div>
  );

  return (
    <div className="space-y-2 mt-1 p-2 rounded border border-amber-500/30 bg-amber-500/5">
      <div className="text-[9px] uppercase tracking-wide text-amber-500/80 font-semibold">L2 basket trace (dev)</div>
      {imports.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold mb-0.5">📥 Import ({imports.length})</div>
          {imports.map((r, i) => <div key={`i${i}`}>{renderRow(r, "in")}</div>)}
        </div>
      )}
      {exports.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold mb-0.5">📤 Export ({exports.length})</div>
          {exports.map((r, i) => <div key={`e${i}`}>{renderRow(r, "out")}</div>)}
        </div>
      )}
    </div>
  );
};

export default TradeFlowTrace;
