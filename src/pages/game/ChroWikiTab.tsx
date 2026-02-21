import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDiscoveries } from "@/hooks/useDiscoveries";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Search, Globe, MapPin, Castle, Crown, Swords, Landmark, Calendar,
  Users, ChevronRight, ChevronDown, Mountain, Shield, Scroll, BookOpen,
  Compass, Flag, Sparkles, Loader2,
} from "lucide-react";
import ChroWikiDetailPanel from "@/components/chrowiki/ChroWikiDetailPanel";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  currentPlayerName?: string;
  myRole?: string;
  onEntityClick?: (type: string, id: string) => void;
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
};

const ChroWikiTab = ({ sessionId, currentPlayerName = "", myRole = "player", onEntityClick }: Props) => {
  const [search, setSearch] = useState("");
  const [eraFilter, setEraFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [playerFilter, setPlayerFilter] = useState("all");

  // Selected entity for detail panel
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
  const [loading, setLoading] = useState(true);

  const { isDiscovered, isAdmin } = useDiscoveries(sessionId, currentPlayerName, myRole || "player");
  // Collapsible state for tree nodes
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

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
    ]).then(([co, r, p, c, w, gp, ev, ch, wi, ex, decl]) => {
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
      setLoading(false);
    });
  }, [sessionId]);

  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const selectEntity = useCallback((type: string, id: string, name: string) => {
    setSelectedEntity({ type, id, name });
  }, []);

  // Filter helper for non-admin fog-of-war
  const isEntityVisible = (type: string, id: string, ownerPlayer?: string) => {
    if (isAdmin) return true;
    if (ownerPlayer === currentPlayerName) return true;
    return isDiscovered(type, id);
  };

  // Get unique players for filter
  const allPlayers = useMemo(() => {
    const players = new Set<string>();
    cities.filter(c => isEntityVisible("city", c.id, c.owner_player)).forEach(c => players.add(c.owner_player));
    regions.filter(r => isEntityVisible("region", r.id, r.owner_player)).forEach(r => r.owner_player && players.add(r.owner_player));
    persons.filter(p => isEntityVisible("person", p.id, p.player_name)).forEach(p => players.add(p.player_name));
    return Array.from(players).sort();
  }, [cities, regions, persons, isAdmin, isDiscovered]);

  // Battles (events with battle-related categories)
  const battles = useMemo(() =>
    events.filter(e => ["battle", "war", "conflict", "siege"].includes(e.event_category?.toLowerCase() || "")),
    [events]
  );

  // Discoveries
  const discoveries = useMemo(() =>
    expeditions.filter(e => e.status === "resolved"),
    [expeditions]
  );

  // Search across all entities (filtered by visibility)
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

    return results.slice(0, 30);
  }, [search, countries, regions, provinces, cities, wonders, persons, events, isAdmin, isDiscovered]);

  // ── Tree Node Component ──
  const TreeNode = ({ id, label, icon, type, entityId, children, count, indent = 0 }: {
    id: string; label: string; icon: React.ReactNode; type?: string; entityId?: string;
    children?: React.ReactNode; count?: number; indent?: number;
  }) => {
    const isExpanded = expandedNodes.has(id);
    const hasChildren = !!children;
    const isSelected = selectedEntity?.id === entityId && selectedEntity?.type === type;

    return (
      <div>
        <div
          className={`flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer transition-all text-sm group
            ${isSelected ? "bg-primary/15 text-primary font-semibold" : "hover:bg-muted/60 text-foreground"}
          `}
          style={{ paddingLeft: `${indent * 16 + 8}px` }}
          onClick={() => {
            if (type && entityId) selectEntity(type, entityId, label);
            if (hasChildren) toggleNode(id);
          }}
        >
          {hasChildren ? (
            <span className="shrink-0 text-muted-foreground">
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </span>
          ) : (
            <span className="w-3" />
          )}
          <span className="shrink-0 text-illuminated">{icon}</span>
          <span className="truncate font-display text-xs">{label}</span>
          {count !== undefined && count > 0 && (
            <span className="ml-auto text-[10px] text-muted-foreground font-body">{count}</span>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div className="animate-accordion-down">{children}</div>
        )}
      </div>
    );
  };

  // ── Build hierarchical tree ──
  const renderWorldTree = () => {
    const visibleCountries = countries.filter(c => isEntityVisible("country", c.id, c.ruler_player));
    const visibleRegions = regions.filter(r => isEntityVisible("region", r.id, r.owner_player));
    const visibleProvinces = provinces.filter(p => isEntityVisible("province", p.id, p.owner_player));
    const visibleCities = cities.filter(c => isEntityVisible("city", c.id, c.owner_player));
    const visiblePersons = persons.filter(p => isEntityVisible("person", p.id, p.player_name));
    const visibleWonders = wonders.filter(w => isEntityVisible("wonder", w.id, w.owner_player));

    const regionsForCountry = (countryId: string) => visibleRegions.filter(r => r.country_id === countryId);
    const provincesForRegion = (regionId: string) => visibleProvinces.filter(p => p.region_id === regionId);
    const citiesForProvince = (provinceId: string) => visibleCities.filter(c => c.province_id === provinceId);
    const wondersForCity = (cityName: string) => visibleWonders.filter(w => w.city_name === cityName);
    const orphanRegions = visibleRegions.filter(r => !r.country_id);
    const orphanProvinces = visibleProvinces.filter(p => !p.region_id);

      return (
      <div className="space-y-0.5">
        {/* Countries */}
        {visibleCountries.map(country => (
          <TreeNode key={country.id} id={`country-${country.id}`} label={country.name}
            icon={<Flag className="h-3.5 w-3.5" />} type="country" entityId={country.id}
            count={regionsForCountry(country.id).length} indent={0}>
            {regionsForCountry(country.id).map(region => (
              <TreeNode key={region.id} id={`region-${region.id}`} label={region.name}
                icon={<Mountain className="h-3.5 w-3.5" />} type="region" entityId={region.id}
                count={provincesForRegion(region.id).length} indent={1}>
                {provincesForRegion(region.id).map(prov => (
                  <TreeNode key={prov.id} id={`prov-${prov.id}`} label={prov.name}
                    icon={<MapPin className="h-3.5 w-3.5" />} type="province" entityId={prov.id}
                    count={citiesForProvince(prov.id).length} indent={2}>
                    {citiesForProvince(prov.id).map(city => (
                      <TreeNode key={city.id} id={`city-${city.id}`} label={city.name}
                        icon={<Castle className="h-3.5 w-3.5" />} type="city" entityId={city.id} indent={3}>
                        {wondersForCity(city.name).map(w => (
                          <TreeNode key={w.id} id={`w-${w.id}`} label={w.name}
                            icon={<Landmark className="h-3.5 w-3.5" />} type="wonder" entityId={w.id} indent={4} />
                        ))}
                      </TreeNode>
                    ))}
                  </TreeNode>
                ))}
              </TreeNode>
            ))}
          </TreeNode>
        ))}

        {/* Orphan regions (no country) */}
        {orphanRegions.length > 0 && (
          <TreeNode id="orphan-regions" label="Nezařazené regiony"
            icon={<Globe className="h-3.5 w-3.5" />} count={orphanRegions.length} indent={0}>
            {orphanRegions.map(region => (
              <TreeNode key={region.id} id={`region-${region.id}`} label={region.name}
                icon={<Mountain className="h-3.5 w-3.5" />} type="region" entityId={region.id}
                count={provincesForRegion(region.id).length} indent={1}>
                {provincesForRegion(region.id).map(prov => (
                  <TreeNode key={prov.id} id={`prov-${prov.id}`} label={prov.name}
                    icon={<MapPin className="h-3.5 w-3.5" />} type="province" entityId={prov.id}
                    count={citiesForProvince(prov.id).length} indent={2}>
                    {citiesForProvince(prov.id).map(city => (
                      <TreeNode key={city.id} id={`city-${city.id}`} label={city.name}
                        icon={<Castle className="h-3.5 w-3.5" />} type="city" entityId={city.id} indent={3} />
                    ))}
                  </TreeNode>
                ))}
              </TreeNode>
            ))}
          </TreeNode>
        )}

        {/* Orphan provinces */}
        {orphanProvinces.length > 0 && (
          <TreeNode id="orphan-provinces" label="Nezařazené provincie"
            icon={<MapPin className="h-3.5 w-3.5" />} count={orphanProvinces.length} indent={0}>
            {orphanProvinces.map(prov => (
              <TreeNode key={prov.id} id={`prov-${prov.id}`} label={prov.name}
                icon={<MapPin className="h-3.5 w-3.5" />} type="province" entityId={prov.id} indent={1} />
            ))}
          </TreeNode>
        )}

        {/* ── Category sections ── */}
        <div className="scroll-divider my-3">
          <span className="text-[10px]">✦ Kategorie ✦</span>
        </div>

        {/* Personalities */}
        <TreeNode id="cat-persons" label="Osobnosti" icon={<Crown className="h-3.5 w-3.5" />}
          count={visiblePersons.length} indent={0}>
          {visiblePersons.map(p => (
            <TreeNode key={p.id} id={`person-${p.id}`} label={p.name}
              icon={<Crown className="h-3.5 w-3.5" />} type="person" entityId={p.id} indent={1} />
          ))}
        </TreeNode>

        {/* Battles */}
        {battles.length > 0 && (
          <TreeNode id="cat-battles" label="Bitvy" icon={<Swords className="h-3.5 w-3.5" />}
            count={battles.length} indent={0}>
            {battles.map(b => (
              <TreeNode key={b.id} id={`battle-${b.id}`} label={b.title}
                icon={<Swords className="h-3.5 w-3.5" />} type="event" entityId={b.id} indent={1} />
            ))}
          </TreeNode>
        )}

        {/* Wonders */}
        <TreeNode id="cat-wonders" label="Divy světa" icon={<Landmark className="h-3.5 w-3.5" />}
          count={visibleWonders.length} indent={0}>
          {visibleWonders.map(w => (
            <TreeNode key={w.id} id={`wonder-${w.id}`} label={w.name}
              icon={<Landmark className="h-3.5 w-3.5" />} type="wonder" entityId={w.id} indent={1} />
          ))}
        </TreeNode>

        {/* Events */}
        <TreeNode id="cat-events" label="Události" icon={<Calendar className="h-3.5 w-3.5" />}
          count={events.length} indent={0}>
          {events.slice(0, 50).map(e => (
            <TreeNode key={e.id} id={`event-${e.id}`} label={e.title}
              icon={<Calendar className="h-3.5 w-3.5" />} type="event" entityId={e.id} indent={1} />
          ))}
        </TreeNode>

        {/* Discoveries */}
        {discoveries.length > 0 && (
          <TreeNode id="cat-discoveries" label="Objevy" icon={<Compass className="h-3.5 w-3.5" />}
            count={discoveries.length} indent={0}>
            {discoveries.map(d => (
              <TreeNode key={d.id} id={`disc-${d.id}`} label={d.narrative?.slice(0, 40) || "Výprava"}
                icon={<Compass className="h-3.5 w-3.5" />} type="expedition" entityId={d.id} indent={1} />
            ))}
          </TreeNode>
        )}
      </div>
    );
  };

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
    <div className="pb-20">
      {/* Header */}
      <div className="manuscript-card p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <BookOpen className="h-6 w-6 text-illuminated" />
          <div>
            <h2 className="font-decorative text-lg text-foreground tracking-wide">ChroWiki</h2>
            <p className="text-[11px] text-muted-foreground font-body">Encyklopedie světa • Kronika říší a národů</p>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Hledat v encyklopedii…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-background/60 border-border font-body text-sm"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Typ entity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Vše</SelectItem>
              <SelectItem value="country">Státy</SelectItem>
              <SelectItem value="region">Regiony</SelectItem>
              <SelectItem value="province">Provincie</SelectItem>
              <SelectItem value="city">Města</SelectItem>
              <SelectItem value="wonder">Divy</SelectItem>
              <SelectItem value="person">Osobnosti</SelectItem>
              <SelectItem value="event">Události</SelectItem>
            </SelectContent>
          </Select>
          <Select value={playerFilter} onValueChange={setPlayerFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Frakce" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Všechny</SelectItem>
              {allPlayers.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Search Results Overlay */}
      {searchResults && searchResults.length > 0 && (
        <div className="manuscript-card p-3 mb-4 space-y-1">
          <p className="text-xs text-muted-foreground font-display mb-2">
            Nalezeno {searchResults.length} záznamů
          </p>
          {searchResults.map(r => (
            <div key={`${r.type}-${r.id}`}
              className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
              onClick={() => { selectEntity(r.type, r.id, r.name); setSearch(""); }}
            >
              <span className="text-illuminated">{ENTITY_ICONS[r.type] || <BookOpen className="h-3.5 w-3.5" />}</span>
              <span className="font-display text-xs truncate">{r.name}</span>
              {r.sub && <Badge variant="outline" className="text-[9px] ml-auto shrink-0">{r.sub}</Badge>}
            </div>
          ))}
        </div>
      )}

      {/* Two-panel layout */}
      <div className="flex gap-4" style={{ height: 'calc(100vh - 260px)', minHeight: '500px' }}>
        {/* LEFT: Navigation Tree */}
        <div className="w-[280px] shrink-0 manuscript-card overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-border">
            <p className="font-display text-xs text-muted-foreground tracking-wider uppercase">Navigace</p>
          </div>
          <ScrollArea className="flex-1 p-2">
            {renderWorldTree()}
          </ScrollArea>
        </div>

        {/* RIGHT: Detail Panel */}
        <div className="flex-1 min-w-0">
          {selectedEntity ? (
            <ChroWikiDetailPanel
              sessionId={sessionId}
              entityType={selectedEntity.type}
              entityId={selectedEntity.id}
              entityName={selectedEntity.name}
              currentPlayerName={currentPlayerName}
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
            <div className="manuscript-card flex items-center justify-center h-full min-h-[400px]">
              <div className="text-center max-w-sm animate-fade-in">
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
