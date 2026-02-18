import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Calendar, MapPin, Users, Tag, Search, Filter, Clock, HelpCircle, Scroll,
} from "lucide-react";

interface WorldEvent {
  id: string;
  title: string;
  slug: string;
  date: string | null;
  date_precision: string;
  summary: string | null;
  tags: string[] | null;
  location_id: string | null;
  participants: any[];
  created_at: string;
}

interface TimelinePanelProps {
  sessionId: string;
  onEventClick?: (eventId: string) => void;
}

const TimelinePanel = ({ sessionId, onEventClick }: TimelinePanelProps) => {
  const [events, setEvents] = useState<WorldEvent[]>([]);
  const [cities, setCities] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [filterParticipant, setFilterParticipant] = useState("");

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const [{ data: evts }, { data: cityData }] = await Promise.all([
        supabase.from("world_events").select("*").eq("session_id", sessionId),
        supabase.from("cities").select("id, name").eq("session_id", sessionId),
      ]);
      setEvents((evts || []) as WorldEvent[]);
      const m: Record<string, string> = {};
      cityData?.forEach(c => { m[c.id] = c.name; });
      setCities(m);
      setLoading(false);
    };
    fetch();
  }, [sessionId]);

  // Collect unique filter values
  const allTags = useMemo(() => {
    const s = new Set<string>();
    events.forEach(e => e.tags?.forEach(t => s.add(t)));
    return Array.from(s).sort();
  }, [events]);

  const allLocations = useMemo(() => {
    const s = new Set<string>();
    events.forEach(e => { if (e.location_id && cities[e.location_id]) s.add(e.location_id); });
    return Array.from(s);
  }, [events, cities]);

  const allParticipants = useMemo(() => {
    const s = new Set<string>();
    events.forEach(e => {
      if (Array.isArray(e.participants)) {
        e.participants.forEach((p: any) => {
          const label = p.label || p.name;
          if (label) s.add(label);
        });
      }
    });
    return Array.from(s).sort();
  }, [events]);

  // Filtered + sorted
  const { dated, undated } = useMemo(() => {
    let filtered = events;

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(e =>
        e.title.toLowerCase().includes(q) || e.summary?.toLowerCase().includes(q) || e.slug.toLowerCase().includes(q)
      );
    }
    if (filterTag) {
      filtered = filtered.filter(e => e.tags?.includes(filterTag));
    }
    if (filterLocation) {
      filtered = filtered.filter(e => e.location_id === filterLocation);
    }
    if (filterParticipant) {
      filtered = filtered.filter(e =>
        Array.isArray(e.participants) && e.participants.some((p: any) => (p.label || p.name) === filterParticipant)
      );
    }

    const dated = filtered.filter(e => e.date).sort((a, b) => (a.date! < b.date! ? -1 : 1));
    const undated = filtered.filter(e => !e.date).sort((a, b) => a.created_at < b.created_at ? -1 : 1);

    return { dated, undated };
  }, [events, search, filterTag, filterLocation, filterParticipant]);

  const hasFilters = !!(search || filterTag || filterLocation || filterParticipant);

  if (loading) {
    return <p className="text-sm text-muted-foreground animate-pulse py-4">Načítám časovou osu...</p>;
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-8">
        <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Zatím žádné události v historii světa.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Hledat události..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={filterTag || "__all__"} onValueChange={v => setFilterTag(v === "__all__" ? "" : v)}>
          <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs">
            <Tag className="h-3 w-3 mr-1" />
            <SelectValue placeholder="Tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Všechny tagy</SelectItem>
            {allTags.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterLocation || "__all__"} onValueChange={v => setFilterLocation(v === "__all__" ? "" : v)}>
          <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs">
            <MapPin className="h-3 w-3 mr-1" />
            <SelectValue placeholder="Místo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Všechna místa</SelectItem>
            {allLocations.map(id => <SelectItem key={id} value={id}>{cities[id]}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterParticipant || "__all__"} onValueChange={v => setFilterParticipant(v === "__all__" ? "" : v)}>
          <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs">
            <Users className="h-3 w-3 mr-1" />
            <SelectValue placeholder="Účastník" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Všichni účastníci</SelectItem>
            {allParticipants.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => {
            setSearch(""); setFilterTag(""); setFilterLocation(""); setFilterParticipant("");
          }}>
            Resetovat
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{dated.length + undated.length} událostí</span>
        {hasFilters && <Badge variant="secondary" className="text-[10px]">filtrováno</Badge>}
      </div>

      {/* Timeline */}
      <ScrollArea className="max-h-[600px]">
        <div className="relative">
          {/* Vertical line */}
          {dated.length > 0 && (
            <div className="absolute left-[18px] top-0 bottom-0 w-px bg-border" />
          )}

          {/* Dated events */}
          {dated.map((evt, i) => (
            <TimelineNode key={evt.id} evt={evt} cities={cities} onEventClick={onEventClick} />
          ))}

          {/* Undated section */}
          {undated.length > 0 && (
            <>
              {dated.length > 0 && <Separator className="my-4" />}
              <div className="flex items-center gap-2 mb-3 ml-1">
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Nedatované události ({undated.length})
                </span>
              </div>
              {undated.map(evt => (
                <TimelineNode key={evt.id} evt={evt} cities={cities} onEventClick={onEventClick} undated />
              ))}
            </>
          )}

          {dated.length === 0 && undated.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6 italic">
              Žádné události neodpovídají filtrům.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

function TimelineNode({
  evt, cities, onEventClick, undated,
}: {
  evt: WorldEvent; cities: Record<string, string>;
  onEventClick?: (id: string) => void; undated?: boolean;
}) {
  return (
    <button
      onClick={() => onEventClick?.(evt.id)}
      className="relative flex gap-3 w-full text-left group mb-3 hover:bg-muted/30 rounded-lg p-2 transition-colors"
    >
      {/* Node dot */}
      <div className="relative z-10 mt-1 shrink-0">
        <div className={`h-4 w-4 rounded-full border-2 transition-colors ${
          undated
            ? "border-muted-foreground bg-background"
            : "border-primary bg-primary/20 group-hover:bg-primary/40"
        }`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="font-semibold text-sm">{evt.title}</h4>
          {evt.date_precision !== "exact" && evt.date_precision !== "unknown" && (
            <Badge variant="outline" className="text-[10px] h-4">~{evt.date_precision}</Badge>
          )}
        </div>

        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
          {evt.date && (
            <span className="flex items-center gap-0.5 font-medium text-foreground/70">
              <Calendar className="h-3 w-3" />{evt.date}
            </span>
          )}
          {evt.location_id && cities[evt.location_id] && (
            <span className="flex items-center gap-0.5">
              <MapPin className="h-3 w-3" />{cities[evt.location_id]}
            </span>
          )}
          {Array.isArray(evt.participants) && evt.participants.length > 0 && (
            <span className="flex items-center gap-0.5">
              <Users className="h-3 w-3" />{evt.participants.length}
            </span>
          )}
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
      </div>
    </button>
  );
}

export default TimelinePanel;
