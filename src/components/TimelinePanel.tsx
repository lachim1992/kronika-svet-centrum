import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Calendar, MapPin, Users, Tag, Search, Clock, HelpCircle, Swords, Landmark, Trophy,
  ScrollText, Flag, Shield, Building2, Sparkles, Star,
} from "lucide-react";

/* ── Significant event types we show (filter out noise like city_growth, chronicle_generation) ── */
const SIGNIFICANT_TYPES = new Set([
  "founding", "city_founded", "settlement_upgrade", "construction",
  "battle", "war", "rebellion", "cataclysm", "crisis",
  "alliance", "treaty", "diplomacy", "trade", "offer_peace",
  "divine", "legendary", "explore",
  "games_announced", "games_candidacy_open", "olympic_candidacy", "olympic_host_selected", "games_concluded",
  "national_team_selected", "school_formed", "local_festival",
  "sphaera_death", "sphaera_record", "sphaera_upset",
  "military", "source_import", "memory_link",
]);

const EVENT_ICONS: Record<string, typeof Calendar> = {
  battle: Swords, war: Swords, rebellion: Shield, crisis: Shield,
  founding: Landmark, city_founded: Landmark, settlement_upgrade: Building2,
  construction: Building2,
  alliance: Flag, treaty: Flag, diplomacy: Flag, trade: Flag, offer_peace: Flag,
  divine: Sparkles, legendary: Sparkles, cataclysm: Sparkles,
  games_announced: Trophy, games_candidacy_open: Trophy, olympic_candidacy: Trophy,
  olympic_host_selected: Trophy, games_concluded: Trophy, national_team_selected: Trophy,
  school_formed: Star, local_festival: Star,
  sphaera_death: Swords, sphaera_record: Trophy, sphaera_upset: Trophy,
};

const EVENT_LABELS: Record<string, string> = {
  founding: "Založení", city_founded: "Založení", settlement_upgrade: "Povýšení sídla",
  construction: "Stavba", battle: "Bitva", war: "Válka", rebellion: "Rebelie",
  crisis: "Krize", cataclysm: "Kataklyzma", divine: "Božské",
  alliance: "Aliance", treaty: "Smlouva", diplomacy: "Diplomacie",
  trade: "Obchod", offer_peace: "Mír", explore: "Průzkum",
  games_announced: "Olympiáda", games_candidacy_open: "Kandidatura", olympic_candidacy: "Kandidatura",
  olympic_host_selected: "Hostitel", games_concluded: "Závěr her",
  national_team_selected: "Národní tým", school_formed: "Škola",
  local_festival: "Slavnost", legendary: "Legenda",
  sphaera_death: "Úmrtí", sphaera_record: "Rekord", sphaera_upset: "Překvapení",
  military: "Vojenství", declaration: "Vyhlášení",
};

interface UnifiedEvent {
  id: string;
  title: string;
  summary: string | null;
  event_type: string;
  source: "game_event" | "world_event" | "declaration";
  turn_number: number | null;
  date_text: string | null; // for world_events with text dates
  tags: string[] | null;
  location: string | null;
  city_id: string | null;
  importance: string | null;
  player: string | null;
  created_at: string;
}

interface TimelinePanelProps {
  sessionId: string;
  onEventClick?: (eventId: string) => void;
}

const TimelinePanel = ({ sessionId, onEventClick }: TimelinePanelProps) => {
  const [events, setEvents] = useState<UnifiedEvent[]>([]);
  const [cities, setCities] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterLocation, setFilterLocation] = useState("");

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);

      const [chronicleRes, declarationsRes, cityRes] = await Promise.all([
        supabase.from("chronicle_source" as any).select("*").eq("session_id", sessionId) as any,
        supabase.from("declarations").select("*").eq("session_id", sessionId).eq("status", "published"),
        supabase.from("cities").select("id, name").eq("session_id", sessionId),
      ]);

      const unified: UnifiedEvent[] = [];

      // chronicle_source (game_events + world_events)
      (chronicleRes.data || []).forEach((row: any) => {
        const isWorldEvent = row.source_table === "world_event";
        const evtType = row.event_type || "other";

        // Filter to significant types (but always include world_events)
        if (!isWorldEvent && !SIGNIFICANT_TYPES.has(evtType)) return;

        unified.push({
          id: row.id,
          title: row.title || evtType,
          summary: row.summary || row.description || null,
          event_type: evtType,
          source: isWorldEvent ? "world_event" : "game_event",
          turn_number: row.turn_number ?? null,
          date_text: isWorldEvent ? extractDateFromTitle(row) : null,
          tags: row.tags || null,
          location: row.location || null,
          city_id: row.city_id || null,
          importance: row.importance || null,
          player: row.affected_player || null,
          created_at: row.created_at,
        });
      });

      // declarations
      (declarationsRes.data || []).forEach((d: any) => {
        unified.push({
          id: d.id,
          title: d.title || "Vyhlášení",
          summary: d.epic_text || d.original_text || null,
          event_type: "declaration",
          source: "declaration",
          turn_number: d.turn_number ?? null,
          date_text: null,
          tags: d.declaration_type ? [d.declaration_type] : null,
          location: null,
          city_id: null,
          importance: "high",
          player: d.player_name || null,
          created_at: d.created_at,
        });
      });

      setEvents(unified);

      const m: Record<string, string> = {};
      cityRes.data?.forEach((c: any) => { m[c.id] = c.name; });
      setCities(m);
      setLoading(false);
    };
    fetchAll();
  }, [sessionId]);

  // Unique filter values
  const allTypes = useMemo(() => {
    const s = new Set<string>();
    events.forEach(e => s.add(e.event_type));
    return Array.from(s).sort();
  }, [events]);

  const allLocations = useMemo(() => {
    const s = new Set<string>();
    events.forEach(e => {
      if (e.city_id && cities[e.city_id]) s.add(e.city_id);
      if (e.location) s.add(e.location);
    });
    return Array.from(s);
  }, [events, cities]);

  // Sort: world_events by parsed year, game_events by turn_number, then created_at
  const sorted = useMemo(() => {
    let filtered = events;

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(e =>
        e.title.toLowerCase().includes(q) || e.summary?.toLowerCase().includes(q)
      );
    }
    if (filterType) {
      filtered = filtered.filter(e => e.event_type === filterType);
    }
    if (filterLocation) {
      filtered = filtered.filter(e =>
        e.city_id === filterLocation || e.location === filterLocation
      );
    }

    return [...filtered].sort((a, b) => {
      const ya = getSortKey(a);
      const yb = getSortKey(b);
      return ya - yb;
    });
  }, [events, search, filterType, filterLocation]);

  const hasFilters = !!(search || filterType || filterLocation);

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
        <Input placeholder="Hledat události..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={filterType || "__all__"} onValueChange={v => setFilterType(v === "__all__" ? "" : v)}>
          <SelectTrigger className="h-8 w-auto min-w-[130px] text-xs">
            <Tag className="h-3 w-3 mr-1" />
            <SelectValue placeholder="Typ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Všechny typy</SelectItem>
            {allTypes.map(t => <SelectItem key={t} value={t}>{EVENT_LABELS[t] || t}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterLocation || "__all__"} onValueChange={v => setFilterLocation(v === "__all__" ? "" : v)}>
          <SelectTrigger className="h-8 w-auto min-w-[130px] text-xs">
            <MapPin className="h-3 w-3 mr-1" />
            <SelectValue placeholder="Místo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Všechna místa</SelectItem>
            {allLocations.map(id => (
              <SelectItem key={id} value={id}>{cities[id] || id}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => {
            setSearch(""); setFilterType(""); setFilterLocation("");
          }}>
            Resetovat
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{sorted.length} událostí</span>
        {hasFilters && <Badge variant="secondary" className="text-[10px]">filtrováno</Badge>}
      </div>

      {/* Timeline */}
      <ScrollArea className="max-h-[600px]">
        <div className="relative">
          {sorted.length > 0 && (
            <div className="absolute left-[18px] top-0 bottom-0 w-px bg-border" />
          )}

          {sorted.map(evt => (
            <TimelineNode key={`${evt.source}-${evt.id}`} evt={evt} cities={cities} onEventClick={onEventClick} />
          ))}

          {sorted.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6 italic">
              Žádné události neodpovídají filtrům.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

/* ── Helpers ── */

function extractDateFromTitle(row: any): string | null {
  // world_events have a `date` field like "Rok -15000 (před počátkem paměti)"
  if (row.title && /rok/i.test(row.title)) return null; // title IS the date basically
  return null;
}

function parseYearFromWorldEvent(evt: UnifiedEvent): number | null {
  // Try to extract year from title or summary
  const text = evt.title || "";
  const match = text.match(/Rok\s+(-?\d+)/i);
  if (match) return parseInt(match[1], 10);
  return null;
}

function getSortKey(evt: UnifiedEvent): number {
  if (evt.source === "world_event") {
    const y = parseYearFromWorldEvent(evt);
    if (y !== null) return y; // negative years for prehistory
    if (evt.turn_number !== null) return evt.turn_number * 100;
    return 999999; // undated at end
  }
  // game_events and declarations: sort by turn
  if (evt.turn_number !== null) return evt.turn_number * 100;
  return 999999;
}

function getDateDisplay(evt: UnifiedEvent): string {
  if (evt.source === "world_event") {
    const y = parseYearFromWorldEvent(evt);
    if (y !== null) return `Rok ${y}`;
    if (evt.turn_number !== null && evt.turn_number > 0) return `Kolo ${evt.turn_number}`;
    return "Prehistorie";
  }
  if (evt.turn_number !== null) return `Kolo ${evt.turn_number}`;
  return "—";
}

function TimelineNode({
  evt, cities, onEventClick,
}: {
  evt: UnifiedEvent; cities: Record<string, string>;
  onEventClick?: (id: string) => void;
}) {
  const Icon = EVENT_ICONS[evt.event_type] || ScrollText;
  const label = EVENT_LABELS[evt.event_type] || evt.event_type;
  const locationName = evt.city_id ? cities[evt.city_id] : evt.location;

  const isHighImportance = evt.importance === "high" || evt.source === "world_event" || evt.source === "declaration";

  return (
    <button
      onClick={() => onEventClick?.(evt.id)}
      className="relative flex gap-3 w-full text-left group mb-2 hover:bg-muted/30 rounded-lg p-2 transition-colors"
    >
      {/* Node dot */}
      <div className="relative z-10 mt-1 shrink-0">
        <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
          isHighImportance
            ? "border-primary bg-primary/20 group-hover:bg-primary/40"
            : "border-muted-foreground/50 bg-background group-hover:bg-muted"
        }`}>
          <Icon className="h-2.5 w-2.5 text-foreground/70" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="font-semibold text-sm">{evt.title}</h4>
          <Badge variant="outline" className="text-[10px] h-4">{label}</Badge>
        </div>

        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-0.5 font-medium text-foreground/70">
            <Calendar className="h-3 w-3" />{getDateDisplay(evt)}
          </span>
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
