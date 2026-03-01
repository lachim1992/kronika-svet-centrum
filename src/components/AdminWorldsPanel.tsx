import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Globe, Users, Scroll, MapPin, Landmark, Clock, Activity, TrendingUp, Coins } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface WorldStats {
  session_id: string;
  room_code: string;
  current_turn: number;
  current_era: string;
  game_mode: string;
  created_at: string;
  world_name: string | null;
  players_count: number;
  cities_count: number;
  events_count: number;
  wonders_count: number;
  wiki_count: number;
  population_total: number;
  last_activity: string | null;
}

const AdminWorldsPanel = () => {
  const navigate = useNavigate();
  const [worlds, setWorlds] = useState<WorldStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllWorlds = async () => {
      // Get ALL game sessions
      const { data: sessions } = await supabase
        .from("game_sessions")
        .select("id, room_code, current_turn, current_era, game_mode, created_at")
        .order("created_at", { ascending: false });

      if (!sessions || sessions.length === 0) {
        setLoading(false);
        return;
      }

      const sessionIds = sessions.map(s => s.id);

      // Fetch world names, player counts, cities, events, wonders, wiki in parallel
      const [
        { data: wfData },
        { data: memberships },
        { data: citiesData },
        { data: eventsData },
        { data: wondersData },
        { data: wikiData },
      ] = await Promise.all([
        supabase.from("world_foundations").select("session_id, world_name").in("session_id", sessionIds),
        supabase.from("game_memberships").select("session_id, joined_at").in("session_id", sessionIds),
        supabase.from("cities").select("session_id, population_total").in("session_id", sessionIds),
        supabase.from("game_events").select("session_id").in("session_id", sessionIds),
        supabase.from("wonders").select("session_id").in("session_id", sessionIds),
        supabase.from("wiki_entries").select("session_id").in("session_id", sessionIds),
      ]);

      const wfMap = new Map((wfData || []).map(w => [w.session_id, w.world_name]));
      
      const countBy = (arr: any[] | null, key: string) => {
        const map = new Map<string, number>();
        for (const item of (arr || [])) {
          map.set(item[key], (map.get(item[key]) || 0) + 1);
        }
        return map;
      };

      const playerCounts = countBy(memberships, "session_id");
      const cityCounts = countBy(citiesData, "session_id");
      const eventCounts = countBy(eventsData, "session_id");
      const wonderCounts = countBy(wondersData, "session_id");
      const wikiCounts = countBy(wikiData, "session_id");

      // Population totals
      const popMap = new Map<string, number>();
      for (const c of (citiesData || [])) {
        popMap.set(c.session_id, (popMap.get(c.session_id) || 0) + (c.population_total || 0));
      }

      // Last activity (latest membership join)
      const lastActivityMap = new Map<string, string>();
      for (const m of (memberships || [])) {
        const current = lastActivityMap.get(m.session_id);
        if (!current || m.joined_at > current) {
          lastActivityMap.set(m.session_id, m.joined_at);
        }
      }

      const result: WorldStats[] = sessions.map(s => ({
        session_id: s.id,
        room_code: s.room_code,
        current_turn: s.current_turn,
        current_era: s.current_era,
        game_mode: s.game_mode,
        created_at: s.created_at,
        world_name: wfMap.get(s.id) || null,
        players_count: playerCounts.get(s.id) || 0,
        cities_count: cityCounts.get(s.id) || 0,
        events_count: eventCounts.get(s.id) || 0,
        wonders_count: wonderCounts.get(s.id) || 0,
        wiki_count: wikiCounts.get(s.id) || 0,
        population_total: popMap.get(s.id) || 0,
        last_activity: lastActivityMap.get(s.id) || null,
      }));

      setWorlds(result);
      setLoading(false);
    };

    fetchAllWorlds();
  }, []);

  // Separate into "my worlds" (from current user memberships) and "other worlds"
  const [mySessionIds, setMySessionIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchMyMemberships = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("game_memberships").select("session_id").eq("user_id", user.id);
      if (data) setMySessionIds(new Set(data.map(d => d.session_id)));
    };
    fetchMyMemberships();
  }, []);

  const myWorlds = worlds.filter(w => mySessionIds.has(w.session_id));
  const otherWorlds = worlds.filter(w => !mySessionIds.has(w.session_id));

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Globe className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-display font-bold">Dev přehled světů</h2>
        <Badge variant="outline" className="text-[9px] ml-auto">{worlds.length} celkem</Badge>
      </div>

      {/* My Worlds */}
      {myWorlds.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Scroll className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-display text-muted-foreground uppercase tracking-wider">Moje světy ({myWorlds.length})</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="grid grid-cols-1 gap-2">
            {myWorlds.map(w => (
              <WorldStatCard key={w.session_id} world={w} onNavigate={() => navigate(`/game/${w.session_id}`)} />
            ))}
          </div>
        </div>
      )}

      {/* Other Worlds */}
      {otherWorlds.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-display text-muted-foreground uppercase tracking-wider">Ostatní světy ({otherWorlds.length})</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <ScrollArea className="max-h-[600px]">
            <div className="grid grid-cols-1 gap-2 pr-2">
              {otherWorlds.map(w => (
                <WorldStatCard key={w.session_id} world={w} onNavigate={() => navigate(`/game/${w.session_id}`)} />
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {worlds.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-6">Žádné světy nenalezeny.</p>
      )}
    </section>
  );
};

const WorldStatCard = ({ world, onNavigate }: { world: WorldStats; onNavigate: () => void }) => {
  const daysSinceCreated = Math.floor((Date.now() - new Date(world.created_at).getTime()) / 86400000);
  const isActive = daysSinceCreated < 7;

  return (
    <button
      onClick={onNavigate}
      className="w-full text-left bg-card p-3 rounded-md border border-border hover:border-primary/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold text-sm truncate">
            {world.world_name || `Svět ${world.room_code}`}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Kód: {world.room_code} · Rok {world.current_turn} · {world.game_mode || "legacy"}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isActive && <Badge className="text-[8px] bg-green-500/15 text-green-400 border-green-500/30">Aktivní</Badge>}
          <Badge variant="outline" className="text-[8px]">{daysSinceCreated}d</Badge>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5 text-[9px]">
        <StatChip icon={Users} label="Hráči" value={world.players_count} />
        <StatChip icon={MapPin} label="Města" value={world.cities_count} />
        <StatChip icon={Activity} label="Události" value={world.events_count} />
        <StatChip icon={Landmark} label="Divy" value={world.wonders_count} />
        <StatChip icon={Scroll} label="Wiki" value={world.wiki_count} />
        <StatChip icon={TrendingUp} label="Populace" value={world.population_total} />
        <StatChip icon={Clock} label="Kolo" value={world.current_turn} />
        <StatChip icon={Coins} label="Éra" value={world.current_era || "?"} isText />
      </div>
    </button>
  );
};

const StatChip = ({ icon: Icon, label, value, isText }: { icon: any; label: string; value: number | string; isText?: boolean }) => (
  <div className="flex items-center gap-1 bg-muted/30 rounded px-1.5 py-0.5">
    <Icon className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
    <span className="text-muted-foreground">{label}:</span>
    <span className="font-mono font-semibold">{isText ? value : typeof value === "number" ? value.toLocaleString() : value}</span>
  </div>
);

export default AdminWorldsPanel;
