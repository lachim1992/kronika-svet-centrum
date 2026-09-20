import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Users, RefreshCw, Sprout } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
}

interface Totals {
  cells: number;
  capacity: number;
  rural: number;
  mobile: number;
  lastTurn: number | null;
}

/**
 * PHASE B readout — deterministic rural population shadow projection.
 * Read-only diagnostics. This panel never mutates settlements, treasury,
 * trade or demand; the projection lives only in hex_population.
 */
const RuralPopulationShadowPanel = ({ sessionId }: Props) => {
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState<Totals | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const page = 1000;
      let cells = 0, capacity = 0, rural = 0, mobile = 0;
      let lastTurn: number | null = null;
      for (let from = 0; ; from += page) {
        const { data, error } = await supabase
          .from("hex_population")
          .select("carrying_capacity, rural_population, mobile_population, last_resolved_turn")
          .eq("session_id", sessionId)
          .range(from, from + page - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const row of data) {
          cells += 1;
          capacity += row.carrying_capacity ?? 0;
          rural += row.rural_population ?? 0;
          mobile += row.mobile_population ?? 0;
          lastTurn = Math.max(lastTurn ?? 0, row.last_resolved_turn ?? 0);
        }
        if (data.length < page) break;
      }
      setTotals({ cells, capacity, rural, mobile, lastTurn });
    } catch (e: any) {
      toast.error("Nepodařilo se načíst venkovskou populaci", { description: e.message });
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  const recompute = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("compute-rural-population", {
        body: { session_id: sessionId },
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error || "výpočet selhal");
      toast.success("Venkovská populace přepočítána", {
        description: `${data.rows} polí · ${Math.round(data.totals?.rural ?? 0).toLocaleString("cs-CZ")} lidí`,
      });
      await load();
    } catch (e: any) {
      toast.error("Přepočet selhal", { description: e.message });
    } finally {
      setRunning(false);
    }
  };

  const fmt = (n: number) => Math.round(n).toLocaleString("cs-CZ");
  const fill = totals && totals.capacity > 0 ? (totals.rural / totals.capacity) * 100 : 0;

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sprout className="h-4 w-4 text-primary" />
          Venkovská populace (stínový výpočet)
          <Badge variant="outline" className="ml-auto text-[10px]">Fáze B · bez vlivu na hru</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Deterministický odhad, kolik lidí uživí každé průchodné pole světa. Zatím jen informativní —
          neovlivňuje města, pokladnici, obchod ani poptávku.
        </p>

        {totals ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-border/60 p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Polí</div>
              <div className="text-sm font-semibold">{fmt(totals.cells)}</div>
            </div>
            <div className="rounded-md border border-border/60 p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Uživí</div>
              <div className="text-sm font-semibold">{fmt(totals.capacity)}</div>
            </div>
            <div className="rounded-md border border-border/60 p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Na venkově</div>
              <div className="text-sm font-semibold flex items-center gap-1">
                <Users className="h-3 w-3 text-muted-foreground" />
                {fmt(totals.rural)}
              </div>
            </div>
            <div className="rounded-md border border-border/60 p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Ochotní se odstěhovat</div>
              <div className="text-sm font-semibold">{fmt(totals.mobile)}</div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            {loading ? "Načítám…" : "Žádná data — spusť přepočet."}
          </div>
        )}

        {totals && totals.cells > 0 && (
          <div className="text-xs text-muted-foreground">
            Obsazenost venkova: <span className="font-medium text-foreground">{fill.toFixed(1)} %</span>
            {totals.lastTurn !== null && <> · naposledy přepočteno v kole {totals.lastTurn}</>}
          </div>
        )}

        <div className="flex gap-2">
          <Button size="sm" onClick={recompute} disabled={running || !sessionId}>
            {running ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-2 h-3 w-3" />}
            Přepočítat
          </Button>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            Načíst znovu
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default RuralPopulationShadowPanel;
