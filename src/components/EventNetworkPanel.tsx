import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search, Scroll, MapPin, Calendar, Tag, Link2, Users, Eye, Swords, Landmark, Trophy, Flag, ScrollText,
} from "lucide-react";

interface UnifiedEvent {
  id: string;
  title: string;
  summary: string | null;
  event_type: string;
  source: string;
  turn_number: number | null;
  tags: string[] | null;
  location: string | null;
  city_id: string | null;
  player: string | null;
  created_at: string;
  caused_by_event_id?: string | null;
  reference?: any;
}

interface EventNetworkPanelProps {
  sessionId: string;
  onEventClick?: (eventId: string) => void;
}

const EVENT_ICONS: Record<string, typeof Calendar> = {
  battle: Swords, war: Swords, founding: Landmark, city_founded: Landmark,
  alliance: Flag, treaty: Flag, diplomacy: Flag,
  games_concluded: Trophy, olympic_host_selected: Trophy,
  declaration: ScrollText,
};

const EventNetworkPanel = ({ sessionId, onEventClick }: EventNetworkPanelProps) => {
  const [events, setEvents] = useState<UnifiedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [cities, setCities] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [chronicleRes, declarationsRes, cityRes] = await Promise.all([
        supabase.from("chronicle_source" as any).select("*").eq("session_id", sessionId) as any,
        supabase.from("declarations").select("*").eq("session_id", sessionId).eq("status", "published"),
        supabase.from("cities").select("id, name").eq("session_id", sessionId),
      ]);

      const unified: UnifiedEvent[] = [];

      (chronicleRes.data || []).forEach((row: any) => {
        unified.push({
          id: row.id,
          title: row.title || row.event_type || "?",
          summary: row.summary || null,
          event_type: row.event_type || "other",
          source: row.source_table || "game_event",
          turn_number: row.turn_number ?? null,
          tags: row.tags || null,
          location: row.location || null,
          city_id: row.city_id || null,
          player: row.affected_player || null,
          created_at: row.created_at,
          reference: row.reference,
        });
      });

      (declarationsRes.data || []).forEach((d: any) => {
        unified.push({
          id: d.id,
          title: d.title || "Vyhlášení",
          summary: d.epic_text || d.original_text || null,
          event_type: "declaration",
          source: "declaration",
          turn_number: d.turn_number ?? null,
          tags: d.declaration_type ? [d.declaration_type] : null,
          location: null,
          city_id: null,
          player: d.player_name || null,
          created_at: d.created_at,
        });
      });

      setEvents(unified);

      const cityMap: Record<string, string> = {};
      cityRes.data?.forEach((c: any) => { cityMap[c.id] = c.name; });
      setCities(cityMap);
      setLoading(false);
    };
    fetchData();
  }, [sessionId]);

  // Build adjacency for connections
  const connections = useMemo(() => {
    const edges: Array<{ from: string; to: string; type: string }> = [];
    const eventMap = new Map(events.map(e => [e.id, e]));
    const seen = new Set<string>();

    events.forEach(e => {
      // Shared location edges
      if (e.city_id) {
        events.forEach(other => {
          if (other.id !== e.id && other.city_id === e.city_id) {
            const key = [e.id, other.id].sort().join("-");
            if (!seen.has(key)) {
              seen.add(key);
              edges.push({ from: e.id, to: other.id, type: "location" });
            }
          }
        });
      }
      // Same turn edges
      if (e.turn_number !== null && e.turn_number > 0) {
        events.forEach(other => {
          if (other.id !== e.id && other.turn_number === e.turn_number) {
            const key = [e.id, other.id].sort().join("-");
            if (!seen.has(key)) {
              seen.add(key);
              edges.push({ from: e.id, to: other.id, type: "temporal" });
            }
          }
        });
      }
      // Same player edges (for significant events)
      if (e.player) {
        events.forEach(other => {
          if (other.id !== e.id && other.player === e.player && e.event_type !== other.event_type) {
            const key = [e.id, other.id].sort().join("-");
            if (!seen.has(key)) {
              seen.add(key);
              edges.push({ from: e.id, to: other.id, type: "actor" });
            }
          }
        });
      }
    });
    return edges;
  }, [events]);

  // Filter events
  const filtered = useMemo(() => {
    let result = events;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.tags?.some(t => t.toLowerCase().includes(q)) ||
        e.summary?.toLowerCase().includes(q)
      );
    }
    if (focusId) {
      const neighborIds = new Set<string>([focusId]);
      connections.forEach(c => {
        if (c.from === focusId) neighborIds.add(c.to);
        if (c.to === focusId) neighborIds.add(c.from);
      });
      result = result.filter(e => neighborIds.has(e.id));
    }
    return result;
  }, [events, search, focusId, connections]);

  const connectionCount = useMemo(() => {
    const counts: Record<string, number> = {};
    connections.forEach(c => {
      counts[c.from] = (counts[c.from] || 0) + 1;
      counts[c.to] = (counts[c.to] || 0) + 1;
    });
    return counts;
  }, [connections]);

  if (loading) {
    return <p className="text-sm text-muted-foreground animate-pulse py-4">Načítám síť událostí...</p>;
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-8">
        <Scroll className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Zatím nejsou žádné události v historii světa.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Hledat události..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        {focusId && (
          <Button variant="outline" size="sm" onClick={() => setFocusId(null)} className="h-9">
            Zobrazit vše
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{events.length} událostí</span>
        <span>{connections.length} vazeb</span>
        {focusId && <Badge variant="secondary" className="text-[10px]">Focus mode</Badge>}
      </div>

      <ScrollArea className="max-h-[500px]">
        <div className="grid gap-2">
          {filtered.map(evt => {
            const conns = connectionCount[evt.id] || 0;
            const isFocused = focusId === evt.id;
            const Icon = EVENT_ICONS[evt.event_type] || ScrollText;
            const locationName = evt.city_id ? cities[evt.city_id] : evt.location;

            const relatedInView = connections
              .filter(c => c.from === evt.id || c.to === evt.id)
              .map(c => c.from === evt.id ? c.to : c.from)
              .filter(id => filtered.some(f => f.id === id));

            return (
              <Card
                key={`${evt.source}-${evt.id}`}
                className={`transition-all cursor-pointer hover:shadow-md ${
                  isFocused ? "ring-2 ring-primary border-primary" : ""
                }`}
                onClick={() => onEventClick?.(evt.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <h4 className="font-semibold text-sm truncate">{evt.title}</h4>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                        {evt.turn_number !== null && (
                          <span className="flex items-center gap-0.5">
                            <Calendar className="h-3 w-3" />Kolo {evt.turn_number}
                          </span>
                        )}
                        {locationName && (
                          <span className="flex items-center gap-0.5">
                            <MapPin className="h-3 w-3" />{locationName}
                          </span>
                        )}
                        {evt.player && (
                          <span className="flex items-center gap-0.5">
                            <Users className="h-3 w-3" />{evt.player}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {conns > 0 && (
                        <Badge variant="outline" className="text-[10px] h-5 gap-0.5">
                          <Link2 className="h-2.5 w-2.5" />{conns}
                        </Badge>
                      )}
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6"
                        onClick={(e) => { e.stopPropagation(); setFocusId(isFocused ? null : evt.id); }}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {evt.summary && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{evt.summary}</p>
                  )}

                  {evt.tags && evt.tags.length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {evt.tags.slice(0, 4).map(t => (
                        <Badge key={t} variant="secondary" className="text-[10px] h-4">{t}</Badge>
                      ))}
                    </div>
                  )}

                  {relatedInView.length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {relatedInView.slice(0, 3).map(relId => {
                        const rel = events.find(e => e.id === relId);
                        const conn = connections.find(c =>
                          (c.from === evt.id && c.to === relId) || (c.to === evt.id && c.from === relId)
                        );
                        return rel ? (
                          <button
                            key={relId}
                            onClick={(e) => { e.stopPropagation(); onEventClick?.(relId); }}
                            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          >
                            <Link2 className="h-2.5 w-2.5" />
                            <span className="truncate max-w-[100px]">{rel.title}</span>
                            {conn?.type === "location" && <MapPin className="h-2 w-2 opacity-50" />}
                          </button>
                        ) : null;
                      })}
                      {relatedInView.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{relatedInView.length - 3}</span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};

export default EventNetworkPanel;
