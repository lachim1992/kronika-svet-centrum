import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Timer, User, Castle, Swords } from "lucide-react";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  cities: any[];
}

interface TimePool {
  id: string;
  entity_type: string;
  entity_id: string;
  pool_name: string;
  total_minutes: number;
  used_minutes: number;
  resets_at: string | null;
}

const POOL_ICONS: Record<string, React.ElementType> = {
  personal: User,
  governance: Castle,
  military: Swords,
};

const POOL_LABELS: Record<string, string> = {
  personal: "Osobní",
  governance: "Vládnutí",
  military: "Vojenský",
};

const TimePoolPanel = ({ sessionId, currentPlayerName, cities }: Props) => {
  const [pools, setPools] = useState<TimePool[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPools = useCallback(async () => {
    const { data } = await supabase
      .from("time_pools")
      .select("*")
      .eq("session_id", sessionId);
    setPools((data || []) as TimePool[]);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => { fetchPools(); }, [fetchPools]);

  if (loading) return <p className="text-sm text-muted-foreground">Načítání...</p>;

  // Group by entity
  const playerPools = pools.filter(p => p.entity_type === "player");
  const cityPools = pools.filter(p => p.entity_type === "city");

  const renderPool = (pool: TimePool, label?: string) => {
    const Icon = POOL_ICONS[pool.pool_name] || Timer;
    const remaining = pool.total_minutes - pool.used_minutes;
    const pct = pool.total_minutes > 0 ? Math.round((remaining / pool.total_minutes) * 100) : 0;
    const hours = Math.floor(remaining / 60);
    const mins = remaining % 60;

    return (
      <div key={pool.id} className="flex items-center gap-3 py-2">
        <Icon className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-xs mb-0.5">
            <span className="font-medium">{label || POOL_LABELS[pool.pool_name] || pool.pool_name}</span>
            <span className="text-muted-foreground">{hours}h {mins}m / {Math.floor(pool.total_minutes / 60)}h</span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Timer className="h-5 w-5 text-primary" />
        <h3 className="font-display font-bold text-base">Časové fondy</h3>
      </div>

      {pools.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <Timer className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Časové fondy budou inicializovány při startu persistentního serveru.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Player pools */}
          {playerPools.length > 0 && (
            <Card>
              <CardContent className="p-3">
                <p className="text-xs font-display font-semibold text-muted-foreground mb-1">Hráč: {currentPlayerName}</p>
                {playerPools.map(p => renderPool(p))}
              </CardContent>
            </Card>
          )}

          {/* City pools */}
          {cityPools.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-display font-semibold text-muted-foreground">Městské fondy</p>
              {cityPools.map(p => {
                const city = cities.find(c => c.id === p.entity_id);
                return (
                  <Card key={p.id}>
                    <CardContent className="p-3">
                      {renderPool(p, city?.name || "Neznámé město")}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TimePoolPanel;
