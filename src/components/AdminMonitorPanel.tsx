import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Monitor, TrendingUp, Swords, Users, AlertTriangle,
  Activity, Flame, Shield, Zap, RefreshCw
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  cities: any[];
  armies: any[];
  players: any[];
  resources: any[];
  events: any[];
  worldCrises: any[];
}

const AdminMonitorPanel = ({
  sessionId, cities, armies, players, resources, events, worldCrises,
}: Props) => {
  const [actionQueue, setActionQueue] = useState<any[]>([]);
  const [timePools, setTimePools] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    const [aqRes, tpRes] = await Promise.all([
      supabase.from("action_queue").select("*").eq("session_id", sessionId),
      supabase.from("time_pools").select("*").eq("session_id", sessionId),
    ]);
    setActionQueue(aqRes.data || []);
    setTimePools(tpRes.data || []);
  }, [sessionId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    toast.success("Data obnovena");
  };

  // Stats
  const totalPop = cities.reduce((s, c) => s + (c.population_total || 0), 0);
  const totalPower = armies.reduce((s, a) => s + (a.power || 0), 0);
  const famineCities = cities.filter(c => c.famine_turn);
  const activeActions = actionQueue.filter(a => a.status === "pending" || a.status === "in_progress");
  const recentEvents = events.filter(e => {
    const d = new Date(e.created_at);
    return Date.now() - d.getTime() < 24 * 60 * 60 * 1000;
  });

  // Instability score
  const instabilityScore = Math.min(100, Math.round(
    (famineCities.length * 15) +
    (worldCrises.length * 10) +
    (cities.filter(c => (c.city_stability || 70) < 40).length * 8)
  ));

  const playerSet = new Set(cities.map(c => c.owner_player));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Monitor className="h-5 w-5 text-primary" />
        <h3 className="font-display font-bold text-base">Admin Monitor</h3>
        <Button variant="ghost" size="icon" className="ml-auto h-7 w-7" onClick={handleRefresh}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {[
          { icon: Users, label: "Hráčů", value: playerSet.size, color: "text-primary" },
          { icon: Activity, label: "Populace", value: totalPop.toLocaleString(), color: "text-primary" },
          { icon: Swords, label: "Voj. síla", value: totalPower, color: "text-primary" },
          { icon: Flame, label: "Hladomory", value: famineCities.length, color: famineCities.length > 0 ? "text-destructive" : "text-primary" },
          { icon: Zap, label: "Aktivní akce", value: activeActions.length, color: "text-primary" },
          { icon: AlertTriangle, label: "Krize", value: worldCrises.length, color: worldCrises.length > 0 ? "text-destructive" : "text-primary" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-2 text-center">
              <s.icon className={`h-4 w-4 mx-auto mb-0.5 ${s.color}`} />
              <div className="text-lg font-bold font-display">{s.value}</div>
              <div className="text-[9px] text-muted-foreground">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Instability Meter */}
      <Card className={instabilityScore > 50 ? "border-destructive/50" : ""}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4" /> Politická nestabilita
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    instabilityScore > 70 ? "bg-destructive" :
                    instabilityScore > 40 ? "bg-yellow-500" : "bg-primary"
                  }`}
                  style={{ width: `${instabilityScore}%` }}
                />
              </div>
            </div>
            <Badge variant={instabilityScore > 50 ? "destructive" : "secondary"}>
              {instabilityScore}%
            </Badge>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            {instabilityScore > 70 ? "Kritická nestabilita — zvažte intervenci!" :
             instabilityScore > 40 ? "Zvýšené napětí ve světě." :
             "Svět je relativně stabilní."}
          </p>
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Poslední aktivita (24h)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground">Žádná aktivita za posledních 24 hodin.</p>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {recentEvents.slice(-10).reverse().map(e => (
                <div key={e.id} className="text-xs flex items-center gap-2 py-1 border-b border-border/30 last:border-0">
                  <Badge variant="outline" className="text-[9px] shrink-0">{e.event_type}</Badge>
                  <span className="text-muted-foreground truncate">{e.player}: {e.note || e.location || "—"}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminMonitorPanel;
