import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { MapPin, Route, Send, Clock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  currentPlayerName: string;
}

interface TravelOrder {
  id: string;
  entity_type: string;
  entity_id: string | null;
  from_province_id: string | null;
  to_province_id: string | null;
  departed_at: string;
  arrives_at: string;
  status: string;
}

interface TravelRoute {
  id: string;
  from_province_id: string;
  to_province_id: string;
  distance_minutes: number;
  terrain_modifier: number;
}

const TravelPanel = ({ sessionId, currentPlayerName }: Props) => {
  const [orders, setOrders] = useState<TravelOrder[]>([]);
  const [routes, setRoutes] = useState<TravelRoute[]>([]);
  const [provinces, setProvinces] = useState<any[]>([]);
  const [stacks, setStacks] = useState<any[]>([]);
  const [fromProv, setFromProv] = useState("");
  const [toProv, setToProv] = useState("");
  const [selectedStack, setSelectedStack] = useState("");
  const [sending, setSending] = useState(false);

  const fetchData = useCallback(async () => {
    const [ordRes, routeRes, provRes, stackRes] = await Promise.all([
      supabase.from("travel_orders").select("*").eq("session_id", sessionId).eq("player_name", currentPlayerName).order("created_at", { ascending: false }),
      supabase.from("travel_routes").select("*").eq("session_id", sessionId).eq("is_active", true),
      supabase.from("provinces").select("id, name").eq("session_id", sessionId),
      supabase.from("military_stacks").select("id, name").eq("session_id", sessionId).eq("player_name", currentPlayerName).eq("is_active", true),
    ]);
    setOrders((ordRes.data || []) as TravelOrder[]);
    setRoutes((routeRes.data || []) as TravelRoute[]);
    setProvinces(provRes.data || []);
    setStacks(stackRes.data || []);
  }, [sessionId, currentPlayerName]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getRouteDuration = () => {
    if (!fromProv || !toProv) return null;
    const route = routes.find(r =>
      (r.from_province_id === fromProv && r.to_province_id === toProv) ||
      (r.from_province_id === toProv && r.to_province_id === fromProv)
    );
    if (route) return Math.round(route.distance_minutes * route.terrain_modifier);
    // Default: estimate based on no route data
    return 120;
  };

  const handleSendArmy = async () => {
    if (!fromProv || !toProv || !selectedStack) return;
    setSending(true);
    const duration = getRouteDuration() || 120;
    const now = new Date();
    const arrives = new Date(now.getTime() + duration * 60 * 1000);

    await supabase.from("travel_orders").insert({
      session_id: sessionId,
      player_name: currentPlayerName,
      entity_type: "army",
      entity_id: selectedStack,
      from_province_id: fromProv,
      to_province_id: toProv,
      arrives_at: arrives.toISOString(),
    });

    // Update activity
    await supabase.from("player_activity").upsert({
      session_id: sessionId,
      player_name: currentPlayerName,
      last_action_at: now.toISOString(),
    }, { onConflict: "session_id,player_name" });

    toast.success(`Armáda vyslána — dorazí za ${Math.round(duration / 60)}h ${duration % 60}m`);
    setSelectedStack("");
    await fetchData();
    setSending(false);
  };

  const getProgress = (order: TravelOrder) => {
    if (order.status === "arrived") return 100;
    const start = new Date(order.departed_at).getTime();
    const end = new Date(order.arrives_at).getTime();
    const now = Date.now();
    if (now >= end) return 100;
    return Math.min(100, Math.round(((now - start) / (end - start)) * 100));
  };

  const activeOrders = orders.filter(o => o.status === "in_transit");
  const completedOrders = orders.filter(o => o.status === "arrived");
  const duration = getRouteDuration();
  const provName = (id: string) => provinces.find(p => p.id === id)?.name || "?";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Route className="h-5 w-5 text-primary" />
        <h3 className="font-display font-bold text-base">Cestování & přesuny</h3>
      </div>

      {/* New travel order */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Send className="h-4 w-4" /> Vyslat jednotku
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-xs text-muted-foreground">Z provincie</span>
              <Select value={fromProv} onValueChange={setFromProv}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Odkud" /></SelectTrigger>
                <SelectContent>
                  {provinces.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Do provincie</span>
              <Select value={toProv} onValueChange={setToProv}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Kam" /></SelectTrigger>
                <SelectContent>
                  {provinces.filter(p => p.id !== fromProv).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Select value={selectedStack} onValueChange={setSelectedStack}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Vyberte armádu..." /></SelectTrigger>
            <SelectContent>
              {stacks.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>

          {duration && fromProv && toProv && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded p-2">
              <Clock className="h-3 w-3" />
              <span>Odhadovaná doba: <strong>{Math.floor(duration / 60)}h {duration % 60}m</strong></span>
            </div>
          )}

          <Button size="sm" onClick={handleSendArmy} disabled={sending || !fromProv || !toProv || !selectedStack} className="w-full gap-1">
            <Send className="h-3 w-3" /> Vyslat
          </Button>
        </CardContent>
      </Card>

      {/* Active travels */}
      {activeOrders.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-display font-semibold text-muted-foreground">Na cestě ({activeOrders.length})</p>
          {activeOrders.map(o => {
            const progress = getProgress(o);
            const stack = stacks.find(s => s.id === o.entity_id);
            return (
              <Card key={o.id}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium">{stack?.name || o.entity_type}</span>
                    <span className="text-muted-foreground">
                      {provName(o.from_province_id || "")} → {provName(o.to_province_id || "")}
                    </span>
                  </div>
                  <Progress value={progress} className="h-1.5 mb-1" />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{progress}%</span>
                    <span>Příjezd: {new Date(o.arrives_at).toLocaleString("cs")}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {activeOrders.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">Žádné aktivní přesuny.</p>
      )}

      {/* Completed */}
      {completedOrders.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground font-display text-xs">
            Dokončené přesuny ({completedOrders.length})
          </summary>
          <div className="space-y-1 mt-1">
            {completedOrders.slice(0, 5).map(o => (
              <div key={o.id} className="flex items-center gap-2 text-xs text-muted-foreground py-1 px-2 bg-muted/30 rounded">
                <CheckCircle2 className="h-3 w-3 text-primary" />
                <span>{provName(o.from_province_id || "")} → {provName(o.to_province_id || "")}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

export default TravelPanel;
