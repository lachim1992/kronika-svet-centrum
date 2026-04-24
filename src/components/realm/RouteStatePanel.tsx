import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Coins, Wrench, AlertTriangle, RefreshCw, Skull } from "lucide-react";
import { toast } from "sonner";

interface RouteRow {
  route_id: string;
  session_id: string;
  node_a: string;
  node_b: string;
  route_type: string | null;
  route_control_cache: string | null;
  lifecycle_state: string | null;
  maintenance_level: number | null;
  upkeep_cost: number | null;
  player_invested_gold: number | null;
  turns_unpaid: number | null;
}

interface Props {
  sessionId: string;
  playerName: string;
  currentTurn: number;
}

const lifecycleColor: Record<string, string> = {
  maintained: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  usable: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  degraded: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  blocked: "bg-red-500/20 text-red-300 border-red-500/40",
  planned: "bg-muted text-muted-foreground border-border",
  under_construction: "bg-violet-500/20 text-violet-300 border-violet-500/40",
};

const lifecycleLabel: Record<string, string> = {
  maintained: "Udržovaná",
  usable: "Použitelná",
  degraded: "Chátrající",
  blocked: "Zablokovaná",
  planned: "Plánovaná",
  under_construction: "Ve výstavbě",
};

export const RouteStatePanel = ({ sessionId, playerName, currentTurn }: Props) => {
  const [rows, setRows] = useState<RouteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("v_route_with_state" as any)
      .select("*")
      .eq("session_id", sessionId);
    if (error) {
      console.error(error);
      toast.error("Chyba při načítání tras");
    } else {
      setRows(((data ?? []) as unknown) as RouteRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const callCommand = async (routeId: string, command: string) => {
    setBusy(routeId);
    try {
      const { data, error } = await supabase.functions.invoke("manage-route", {
        body: { sessionId, routeId, command, playerName, turnNumber: currentTurn },
      });
      if (error || (data as any)?.error) {
        toast.error((data as any)?.error ?? error?.message ?? "Chyba");
      } else {
        toast.success(`OK — utraceno ${(data as any).gold_spent}g`);
        await load();
      }
    } finally {
      setBusy(null);
    }
  };

  const sorted = [...rows].sort((a, b) => {
    const order = ["blocked", "degraded", "usable", "maintained", "planned", "under_construction"];
    return order.indexOf(a.lifecycle_state ?? "usable") - order.indexOf(b.lifecycle_state ?? "usable");
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Wrench className="h-4 w-4" /> Stav obchodních tras
        </h3>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {sorted.length === 0 && (
        <p className="text-xs text-muted-foreground">Žádné trasy v tomto světě.</p>
      )}
      <div className="space-y-2 max-h-[420px] overflow-y-auto">
        {sorted.map((r) => {
          const lc = r.lifecycle_state ?? "usable";
          const m = r.maintenance_level ?? 0;
          const isBlocked = lc === "blocked";
          const isDegraded = lc === "degraded";
          return (
            <div key={r.route_id} className="border border-border rounded-md p-2.5 space-y-2 bg-card/40">
              <div className="flex items-center justify-between gap-2">
                <code className="text-[10px] text-muted-foreground">{r.route_id.slice(0, 8)}…</code>
                <Badge className={lifecycleColor[lc] ?? ""} variant="outline">
                  {lifecycleLabel[lc] ?? lc}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      m >= 80 ? "bg-emerald-500" : m >= 30 ? "bg-sky-500" : m >= 10 ? "bg-amber-500" : "bg-red-500"
                    }`}
                    style={{ width: `${m}%` }}
                  />
                </div>
                <span className="tabular-nums w-8 text-right">{m}</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><Coins className="h-3 w-3" /> {r.upkeep_cost ?? 0}g/tah</span>
                {(r.turns_unpaid ?? 0) > 0 && (
                  <span className="flex items-center gap-1 text-amber-400">
                    <AlertTriangle className="h-3 w-3" /> {r.turns_unpaid} tahů bez platby
                  </span>
                )}
              </div>
              <div className="flex gap-1.5 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs flex-1"
                  disabled={busy === r.route_id || isBlocked}
                  onClick={() => callCommand(r.route_id, "INVEST_MAINTENANCE")}
                >
                  +30% (50g)
                </Button>
                {isBlocked && (
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs flex-1"
                    disabled={busy === r.route_id}
                    onClick={() => callCommand(r.route_id, "RESTORE_ROUTE")}
                  >
                    Obnovit (200g)
                  </Button>
                )}
                {!isBlocked && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    disabled={busy === r.route_id}
                    onClick={() => callCommand(r.route_id, "ABANDON_ROUTE")}
                    title="Vzdát se trasy"
                  >
                    <Skull className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
