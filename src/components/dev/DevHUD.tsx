import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Activity, Clock, Hash, Bug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDevMode } from "@/hooks/useDevMode";

interface Props {
  sessionId: string;
  currentTurn: number;
  playerName: string;
}

interface TickInfo {
  lastTickAt: string | null;
  lastTickDuration: number | null;
  lastEventId: string | null;
  lastEventType: string | null;
  lastEventTurn: number | null;
}

interface RedFlag {
  label: string;
  detail: string;
}

const DevHUD = ({ sessionId, currentTurn, playerName }: Props) => {
  const { devMode } = useDevMode();
  const [tickInfo, setTickInfo] = useState<TickInfo>({
    lastTickAt: null, lastTickDuration: null,
    lastEventId: null, lastEventType: null, lastEventTurn: null,
  });
  const [redFlags, setRedFlags] = useState<RedFlag[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!devMode) return;
    const load = async () => {
      setLoading(true);
      try {
        // Last tick timestamp from cities
        const { data: tickCity } = await supabase
          .from("cities")
          .select("last_tick_at")
          .eq("session_id", sessionId)
          .not("last_tick_at", "is", null)
          .order("last_tick_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Last game event
        const { data: lastEvent } = await supabase
          .from("game_events")
          .select("id, event_type, turn_number, created_at")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        setTickInfo({
          lastTickAt: tickCity?.last_tick_at || null,
          lastTickDuration: null,
          lastEventId: lastEvent?.id?.slice(0, 8) || null,
          lastEventType: lastEvent?.event_type || null,
          lastEventTurn: lastEvent?.turn_number || null,
        });

        // Red flags: check population consistency
        const flags: RedFlag[] = [];

        // Check for cities with 0 population but active status
        const { data: zeroPop } = await supabase
          .from("cities")
          .select("id, name, population_total, status")
          .eq("session_id", sessionId)
          .eq("status", "active")
          .lte("population_total", 0);

        if (zeroPop && zeroPop.length > 0) {
          flags.push({
            label: "Zero-pop active cities",
            detail: zeroPop.map(c => c.name).join(", "),
          });
        }

        // Check for realm_resources without matching cities
        const { data: realm } = await supabase
          .from("realm_resources")
          .select("player_name, granary_capacity")
          .eq("session_id", sessionId);

        const { data: allCities } = await supabase
          .from("cities")
          .select("owner_player, local_granary_capacity")
          .eq("session_id", sessionId)
          .eq("status", "active");

        if (realm && allCities) {
          for (const r of realm) {
            const playerCities = allCities.filter(c => c.owner_player === r.player_name);
            const sumLocalCap = playerCities.reduce((s, c) => s + (c.local_granary_capacity || 500), 0);
            if (Math.abs(sumLocalCap - (r.granary_capacity || 0)) > 100) {
              flags.push({
                label: `Grain cap mismatch: ${r.player_name}`,
                detail: `realm=${r.granary_capacity}, sum(cities)=${sumLocalCap}`,
              });
            }
          }
        }

        setRedFlags(flags);
      } catch (e) {
        console.warn("DevHUD load error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [devMode, sessionId, currentTurn]);

  if (!devMode) return null;

  return (
    <div className="bg-card/90 border-b border-primary/20 px-4 py-1 flex items-center gap-2 text-[10px] font-mono overflow-x-auto scrollbar-hide">
      <Bug className="h-3 w-3 text-primary shrink-0" />
      <span className="text-muted-foreground">DEV</span>

      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-mono">
        {sessionId.slice(0, 8)}…
      </Badge>

      <span className="text-muted-foreground">T{currentTurn}</span>
      <span className="text-muted-foreground">P:{playerName}</span>

      {tickInfo.lastTickAt && (
        <span className="flex items-center gap-0.5 text-muted-foreground">
          <Clock className="h-2.5 w-2.5" />
          {new Date(tickInfo.lastTickAt).toLocaleTimeString()}
        </span>
      )}

      {tickInfo.lastEventId && (
        <span className="flex items-center gap-0.5 text-muted-foreground">
          <Hash className="h-2.5 w-2.5" />
          {tickInfo.lastEventId} ({tickInfo.lastEventType} T{tickInfo.lastEventTurn})
        </span>
      )}

      {redFlags.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-destructive/20 text-destructive border border-destructive/30 hover:bg-destructive/30 transition-colors">
              <AlertTriangle className="h-2.5 w-2.5" />
              <span>{redFlags.length} flags</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-3" align="start">
            <h4 className="font-semibold text-xs mb-2 text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Red Flags
            </h4>
            <div className="space-y-1.5">
              {redFlags.map((f, i) => (
                <div key={i} className="text-[10px] border-l-2 border-destructive/40 pl-2">
                  <div className="font-semibold">{f.label}</div>
                  <div className="text-muted-foreground">{f.detail}</div>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {redFlags.length === 0 && !loading && (
        <span className="flex items-center gap-0.5 text-primary/60">
          <Activity className="h-2.5 w-2.5" /> OK
        </span>
      )}
    </div>
  );
};

export default DevHUD;
