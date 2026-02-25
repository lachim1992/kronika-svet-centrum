import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDiscoveries } from "@/hooks/useDiscoveries";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, Globe, MapPin, Castle, Crown, Swords, Landmark, Calendar,
  Users, ChevronRight, ChevronDown, Mountain, Shield, Scroll, BookOpen,
  Compass, Flag, Sparkles, Loader2,
} from "lucide-react";
import ChroWikiDetailPanel from "@/components/chrowiki/ChroWikiDetailPanel";
import ChroWikiTreeNav from "@/components/chrowiki/ChroWikiTreeNav";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  currentPlayerName?: string;
  myRole?: string;
  currentTurn?: number;
  epochStyle?: string;
  memories?: any[];
  players?: any[];
  entityIndex?: any;
  onEntityClick?: (type: string, id: string) => void;
  wikiEntityTarget?: { type: string; id: string } | null;
  onClearWikiEntityTarget?: () => void;
}

const ENTITY_ICONS: Record<string, React.ReactNode> = {
  country: <Flag className="h-3.5 w-3.5" />,
  region: <Mountain className="h-3.5 w-3.5" />,
  province: <MapPin className="h-3.5 w-3.5" />,
  city: <Castle className="h-3.5 w-3.5" />,
  wonder: <Landmark className="h-3.5 w-3.5" />,
  person: <Crown className="h-3.5 w-3.5" />,
  battle: <Swords className="h-3.5 w-3.5" />,
  event: <Calendar className="h-3.5 w-3.5" />,
  discovery: <Compass className="h-3.5 w-3.5" />,
  building: <Landmark className="h-3.5 w-3.5" />,
};

const ChroWikiTab = ({ sessionId, currentPlayerName = "", myRole = "player", currentTurn, epochStyle, memories, players, entityIndex, onEntityClick, wikiEntityTarget, onClearWikiEntityTarget }: Props) => {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [playerFilter, setPlayerFilter] = useState("all");
  const [selectedEntity, setSelectedEntity] = useState<{ type: string; id: string; name: string } | null>(null);

  // Data states
  const [countries, setCountries] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [provinces, setProvinces] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [wonders, setWonders] = useState<any[]>([]);
  const [persons, setPersons] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [chronicles, setChronicles] = useState<any[]>([]);
  const [wikiEntries, setWikiEntries] = useState<any[]>([]);
  const [expeditions, setExpeditions] = useState<any[]>([]);
  const [declarations, setDeclarations] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const { isDiscovered, isAdmin } = useDiscoveries(sessionId, currentPlayerName, myRole || "player");

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    Promise.all([
      supabase.from("countries").select("*").eq("session_id", sessionId),
      supabase.from("regions").select("*").eq("session_id", sessionId),
      supabase.from("provinces").select("*").eq("session_id", sessionId),
      supabase.from("cities").select("*").eq("session_id", sessionId),
      supabase.from("wonders").select("*").eq("session_id", sessionId),
      supabase.from("great_persons").select("*").eq("session_id", sessionId),
      supabase.from("world_events").select("*").eq("session_id", sessionId).eq("status", "published").order("created_at", { ascending: false }).limit(300),
      supabase.from("chronicle_entries").select("*").eq("session_id", sessionId).order("created_at", { ascending: false }).limit(100),
      supabase.from("wiki_entries").select("*").eq("session_id", sessionId),
      supabase.from("expeditions").select("*").eq("session_id", sessionId),
      supabase.from("declarations").select("*").eq("session_id", sessionId).eq("status", "published"),
      supabase.from("city_buildings").select("*").eq("session_id", sessionId).eq("is_ai_generated", true),
    ]).then(([co, r, p, c, w, gp, ev, ch, wi, ex, decl, bld]) => {
      setCountries(co.data || []);
      setRegions(r.data || []);
      setProvinces(p.data || []);
      setCities(c.data || []);
      setWonders(w.data || []);
      setPersons(gp.data || []);
      setEvents(ev.data || []);
      setChronicles(ch.data || []);
      setWikiEntries(wi.data || []);
      setExpeditions(ex.data || []);
      setDeclarations(decl.data || []);
      setBuildings(bld.data || []);
      setLoading(false);
    });
  }, [sessionId]);

  // Handle incoming wiki entity target (e.g. from hex map city click)
  useEffect(() => {
    if (wikiEntityTarget && !loading) {
      // Find the entity name from loaded data
      let name = "";
      if (wikiEntityTarget.type === "city") {
        const city = cities.find(c => c.id === wikiEntityTarget.id);
        name = city?.name || "Město";
      } else if (wikiEntityTarget.type === "region") {
        const region = regions.find(r => r.id === wikiEntityTarget.id);
        name = region?.name || "Region";
      } else if (wikiEntityTarget.type === "province") {
        const prov = provinces.find(p => p.id === wikiEntityTarget.id);
        name = prov?.name || "Provincie";
      }
      setSelectedEntity({ type: wikiEntityTarget.type, id: wikiEntityTarget.id, name });
      onClearWikiEntityTarget?.();
    }
  }, [wikiEntityTarget, loading, cities, regions, provinces, onClearWikiEntityTarget]);

  const selectEntity = useCallback((type: string, id: string, name: string) => {
    setSelectedEntity({ type, id, name });
  }, []);

  const isEntityVisible = (type: string, id: string, ownerPlayer?: string) => {
    if (isAdmin) return true;
    if (ownerPlayer === currentPlayerName) return true;
    return isDiscovered(type, id);
  };

  const allPlayers = useMemo(() => {
    const players = new Set<string>();
    cities.filter(c => isEntityVisible("city", c.id, c.owner_player)).forEach(c => players.add(c.owner_player));
    regions.filter(r => isEntityVisible("region", r.id, r.owner_player)).forEach(r => r.owner_player && players.add(r.owner_player));
    persons.filter(p => isEntityVisible("person", p.id, p.player_name)).forEach(p => players.add(p.player_name));
    return Array.from(players).sort();
  }, [cities, regions, persons, isAdmin, isDiscovered]);

  // Search across all entities
  const searchResults = useMemo(() => {
    if (!search || search.length < 2) return null;
    const q = search.toLowerCase();
    const results: { type: string; id: string; name: string; sub?: string }[] = [];
    countries.filter(c => c.name.toLowerCase().includes(q) && isEntityVisible("country", c.id, c.ruler_player)).forEach(c => results.push({ type: "country", id: c.id, name: c.name }));
    regions.filter(r => (r.name.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q)) && isEntityVisible("region", r.id, r.owner_player)).forEach(r => results.push({ type: "region", id: r.id, name: r.name, sub: r.biome }));
    provinces.filter(p => p.name.toLowerCase().includes(q) && isEntityVisible("province", p.id, p.owner_player)).forEach(p => results.push({ type: "province", id: p.id, name: p.name }));
    cities.filter(c => c.name.toLowerCase().includes(q) && isEntityVisible("city", c.id, c.owner_player)).forEach(c => results.push({ type: "city", id: c.id, name: c.name, sub: c.level }));
    wonders.filter(w => w.name.toLowerCase().includes(q) && isEntityVisible("wonder", w.id, w.owner_player)).forEach(w => results.push({ type: "wonder", id: w.id, name: w.name, sub: w.era }));
    persons.filter(p => p.name.toLowerCase().includes(q) && isEntityVisible("person", p.id, p.player_name)).forEach(p => results.push({ type: "person", id: p.id, name: p.name, sub: p.person_type }));
    events.filter(e => e.title?.toLowerCase().includes(q) || e.description?.toLowerCase().includes(q)).forEach(e => results.push({ type: "event", id: e.id, name: e.title, sub: e.event_category }));
    buildings.filter(b => b.name?.toLowerCase().includes(q) && b.is_ai_generated).forEach(b => results.push({ type: "building", id: b.id, name: b.name, sub: b.category }));
    return results.slice(0, 30);
  }, [search, countries, regions, provinces, cities, wonders, persons, events, isAdmin, isDiscovered]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center animate-fade-in">
          <Scroll className="h-10 w-10 text-illuminated mx-auto mb-3 animate-pulse" />
          <p className="font-display text-sm text-muted-foreground">Otevírám svitky ChroWiki…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chrowiki-root">
      <div className="chrowiki-layout">
        {/* ═══ LEFT: TOC / Navigation ═══ */}
        <div className="chrowiki-toc">
          {/* Search + filters header */}
          <div className="p-3 space-y-2 border-b border-border sticky top-0 z-10" style={{ background: 'hsl(var(--secondary))' }}>
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-illuminated shrink-0" />
              <span className="font-decorative text-sm text-foreground tracking-wide">ChroWiki</span>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Hledat…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 bg-background/60 border-border font-body text-xs"
              />
            </div>
            <div className="flex gap-1.5">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-7 text-[10px] flex-1"><SelectValue placeholder="Typ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Vše</SelectItem>
                  <SelectItem value="country">Státy</SelectItem>
                  <SelectItem value="region">Regiony</SelectItem>
                  <SelectItem value="city">Města</SelectItem>
                  <SelectItem value="person">Osobnosti</SelectItem>
                  <SelectItem value="event">Události</SelectItem>
                </SelectContent>
              </Select>
              <Select value={playerFilter} onValueChange={setPlayerFilter}>
                <SelectTrigger className="h-7 text-[10px] flex-1"><SelectValue placeholder="Frakce" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Všechny</SelectItem>
                  {allPlayers.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Search results overlay */}
          {searchResults && searchResults.length > 0 ? (
            <div className="p-2 space-y-0.5">
              <p className="text-[10px] text-muted-foreground font-display px-2 py-1">
                Nalezeno {searchResults.length}
              </p>
              {searchResults.map(r => (
                <div key={`${r.type}-${r.id}`}
                  className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors text-xs"
                  onClick={() => { selectEntity(r.type, r.id, r.name); setSearch(""); }}
                >
                  <span className="text-illuminated">{ENTITY_ICONS[r.type] || <BookOpen className="h-3.5 w-3.5" />}</span>
                  <span className="font-display truncate">{r.name}</span>
                  {r.sub && <Badge variant="outline" className="text-[9px] ml-auto shrink-0">{r.sub}</Badge>}
                </div>
              ))}
            </div>
          ) : (
            /* Tree navigation */
            <ChroWikiTreeNav
              countries={countries}
              regions={regions}
              provinces={provinces}
              cities={cities}
              wonders={wonders}
              persons={persons}
              events={events}
              expeditions={expeditions}
              buildings={buildings}
              selectedEntity={selectedEntity}
              isEntityVisible={isEntityVisible}
              isAdmin={isAdmin}
              onSelectEntity={selectEntity}
            />
          )}
        </div>

        {/* ═══ RIGHT: Book Page (single scroll container) ═══ */}
        <div className="chrowiki-page">
          {selectedEntity ? (
            <ChroWikiDetailPanel
              sessionId={sessionId}
              entityType={selectedEntity.type}
              entityId={selectedEntity.id}
              entityName={selectedEntity.name}
              currentPlayerName={currentPlayerName}
              currentTurn={currentTurn}
              myRole={myRole}
              epochStyle={epochStyle}
              memories={memories}
              players={players}
              entityIndex={entityIndex}
              countries={countries}
              regions={regions}
              provinces={provinces}
              cities={cities}
              wonders={wonders}
              persons={persons}
              events={events}
              chronicles={chronicles}
              wikiEntries={wikiEntries}
              declarations={declarations}
              onEntityClick={(type, id, name) => selectEntity(type, id, name)}
              onRefreshWiki={async () => {
                const { data } = await supabase.from("wiki_entries").select("*").eq("session_id", sessionId);
                if (data) setWikiEntries(data);
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full min-h-[400px]">
              <div className="text-center max-w-sm animate-fade-in px-6">
                <Scroll className="h-12 w-12 text-illuminated mx-auto mb-4 opacity-50" />
                <h3 className="font-decorative text-base text-foreground mb-2">Vyberte záznam</h3>
                <p className="text-xs text-muted-foreground font-body leading-relaxed">
                  Prozkoumejte hierarchii světa v navigaci vlevo, nebo použijte vyhledávání k nalezení konkrétního záznamu v kronice.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChroWikiTab;
