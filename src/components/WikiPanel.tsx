import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BookOpen, Sparkles, Loader2, ImageIcon, Search, MapPin, Landmark, Star, Castle,
  Swords, ArrowLeft, Globe, Plus, Link2, Calendar, Users, ChevronRight, Mountain,
} from "lucide-react";
import { toast } from "sonner";
import RichText from "@/components/RichText";

interface WikiPanelProps {
  sessionId: string;
  currentPlayerName: string;
  cities: any[];
  wonders: any[];
  greatPersons: any[];
  events: any[];
  myRole?: string;
  epochStyle?: string;
  onRefetch?: () => void;
  onEventClick?: (eventId: string) => void;
}

interface WikiEntry {
  id: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string;
  owner_player: string;
  summary: string | null;
  ai_description: string | null;
  image_url: string | null;
  image_prompt: string | null;
  tags: string[];
  references: any;
  updated_at: string;
}

interface EncyclopediaEntity {
  type: string;
  name: string;
  id: string;
  owner: string;
  context: any;
}

interface EventEntityLink {
  id: string;
  event_id: string;
  entity_type: string;
  entity_id: string;
  link_type: string;
}

interface EncImage {
  id: string;
  entity_type: string;
  entity_id: string;
  image_url: string;
  image_prompt: string | null;
  created_by: string;
  is_primary: boolean;
  created_at: string;
}

const ENTITY_ICONS: Record<string, React.ReactNode> = {
  city: <MapPin className="h-4 w-4" />,
  wonder: <Landmark className="h-4 w-4" />,
  person: <Star className="h-4 w-4" />,
  event: <Swords className="h-4 w-4" />,
  province: <Castle className="h-4 w-4" />,
  region: <Mountain className="h-4 w-4" />,
  neutral_node: <Globe className="h-4 w-4" />,
  annexed_node: <Castle className="h-4 w-4" />,
};

const ENTITY_LABELS: Record<string, string> = {
  city: "Město", wonder: "Div", person: "Osobnost", event: "Událost",
  province: "Provincie", region: "Region",
  neutral_node: "Neutrální uzel", annexed_node: "Anektovaný uzel",
};

const WikiPanel = ({
  sessionId, currentPlayerName, cities, wonders, greatPersons, events,
  myRole, epochStyle, onRefetch, onEventClick,
  codexEntityTarget, onClearEntityTarget, onEntityClick,
}: WikiPanelProps & { codexEntityTarget?: { type: string; id: string } | null; onClearEntityTarget?: () => void; onEntityClick?: (type: string, id: string) => void }) => {
  const [entries, setEntries] = useState<WikiEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<EncyclopediaEntity | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState<string | null>(null);
  const [provinces, setProvinces] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [worldEvents, setWorldEvents] = useState<any[]>([]);
  const [eventLinks, setEventLinks] = useState<EventEntityLink[]>([]);
  const [entityImages, setEntityImages] = useState<EncImage[]>([]);
  const [worldMemories, setWorldMemories] = useState<string[]>([]);
  const [nodes, setNodes] = useState<any[]>([]);

  const isAdmin = myRole === "admin" || myRole === "moderator" || !myRole;

  useEffect(() => {
    fetchAll();
  }, [sessionId]);



  const fetchAll = async () => {
    const [entriesRes, provincesRes, regionsRes, worldEventsRes, linksRes, imagesRes, memoriesRes, nodesRes] = await Promise.all([
      supabase.from("wiki_entries").select("*").eq("session_id", sessionId).order("entity_type").order("entity_name"),
      supabase.from("provinces").select("*").eq("session_id", sessionId),
      supabase.from("regions").select("*").eq("session_id", sessionId),
      supabase.from("world_events").select("*").eq("session_id", sessionId).order("date", { ascending: true }),
      supabase.from("event_entity_links").select("*"),
      supabase.from("encyclopedia_images").select("*").eq("session_id", sessionId),
      supabase.from("world_memories").select("text").eq("session_id", sessionId).eq("approved", true),
      supabase.from("province_nodes").select("id, name, culture_key, profile_key, population, autonomy_score, discovered, is_neutral, controlled_by, hex_q, hex_r").eq("session_id", sessionId).eq("discovered", true),
    ]);
    if (entriesRes.data) setEntries(entriesRes.data as WikiEntry[]);
    if (provincesRes.data) setProvinces(provincesRes.data);
    if (regionsRes.data) setRegions(regionsRes.data);
    if (worldEventsRes.data) setWorldEvents(worldEventsRes.data);
    if (linksRes.data) setEventLinks(linksRes.data as EventEntityLink[]);
    if (imagesRes.data) setEntityImages(imagesRes.data as EncImage[]);
    if (memoriesRes.data) setWorldMemories(memoriesRes.data.map((m: any) => m.text));
    if (nodesRes.data) setNodes(nodesRes.data);
  };

  // Build all encyclopedia entities
  const allEntities: EncyclopediaEntity[] = useMemo(() => [
    ...cities.map(c => ({ type: "city", name: c.name, id: c.id, owner: c.owner_player, context: { level: c.level, province: c.province, tags: c.tags, status: c.status, founded_round: c.founded_round } })),
    ...provinces.map(p => ({ type: "province", name: p.name, id: p.id, owner: p.owner_player, context: { region_id: p.region_id, capital_city_id: p.capital_city_id } })),
    ...regions.map(r => ({ type: "region", name: r.name, id: r.id, owner: r.owner_player || "", context: { description: r.description, tags: r.tags } })),
    ...wonders.map(w => ({ type: "wonder", name: w.name, id: w.id, owner: w.owner_player, context: { era: w.era, status: w.status, city: w.city_name, description: w.description } })),
    ...greatPersons.map(p => ({ type: "person", name: p.name, id: p.id, owner: p.player_name, context: { personType: p.person_type, flavor: p.flavor_trait, alive: p.is_alive, bio: p.bio } })),
    ...worldEvents.map(e => ({ type: "event", name: e.title, id: e.id, owner: e.created_by_type || "system", context: { date: e.date, summary: e.summary, description: e.description, tags: e.tags, status: e.status, participants: e.participants } })),
    ...nodes.map(n => ({
      type: n.controlled_by ? "annexed_node" : "neutral_node",
      name: n.name,
      id: n.id,
      owner: n.controlled_by || "",
      context: { culture: n.culture_key, profile: n.profile_key, population: n.population, autonomy: n.autonomy_score, hex: `${n.hex_q},${n.hex_r}` },
    })),
  ], [cities, provinces, regions, wonders, greatPersons, worldEvents, nodes]);

  // Handle codexEntityTarget to auto-open entity
  useEffect(() => {
    if (codexEntityTarget && allEntities.length > 0) {
      const target = allEntities.find(e => e.type === codexEntityTarget.type && e.id === codexEntityTarget.id);
      if (target) {
        setSelectedEntity(target);
        onClearEntityTarget?.();
      }
    }
  }, [codexEntityTarget, allEntities]);

  const filtered = allEntities.filter(e => {
    if (typeFilter && e.type !== typeFilter) return false;
    if (filter && !e.name.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const getWikiEntry = (type: string, id: string) =>
    entries.find(e => e.entity_type === type && (e.entity_id === id || e.entity_name === id));

  const getEntityEvents = (entityType: string, entityId: string) => {
    const linkedEventIds = eventLinks
      .filter(l => l.entity_type === entityType && l.entity_id === entityId)
      .map(l => l.event_id);
    // Also include events with location_id matching city
    const locationEvents = entityType === "city"
      ? worldEvents.filter(e => e.location_id === entityId).map(e => e.id)
      : [];
    const allIds = new Set([...linkedEventIds, ...locationEvents]);
    return worldEvents.filter(e => allIds.has(e.id));
  };

  const getEventEntities = (eventId: string) => {
    const links = eventLinks.filter(l => l.event_id === eventId);
    return links.map(l => {
      const entity = allEntities.find(e => e.type === l.entity_type && e.id === l.entity_id);
      return entity ? { ...entity, linkType: l.link_type } : null;
    }).filter(Boolean) as (EncyclopediaEntity & { linkType: string })[];
  };

  const getEntityImages = (entityType: string, entityId: string) =>
    entityImages.filter(i => i.entity_type === entityType && i.entity_id === entityId);

  // Generate encyclopedia text via wiki-orchestrator (Track B: single gateway)
  const handleGenerateText = async (entity: EncyclopediaEntity) => {
    const key = `text-${entity.id}`;
    setGeneratingId(key);
    try {
      const existing = getWikiEntry(entity.type, entity.id);
      const body = existing
        ? { action: "regenerate", entry_id: existing.id, fields: ["content"] }
        : {
            action: "ensure",
            session_id: sessionId,
            entity_type: entity.type,
            entity_id: entity.id,
            entity_name: entity.name,
            owner_player: entity.owner,
          };

      const { data, error } = await supabase.functions.invoke("wiki-orchestrator", { body });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }

      await fetchAll();
      toast.success(`📖 Článek „${entity.name}" vygenerován!`);
    } catch (e) {
      console.error(e);
      toast.error("Generování článku selhalo");
    }
    setGeneratingId(null);
  };

  // Generate encyclopedia image via wiki-orchestrator (Track B: single gateway).
  // For text-only entity types (law/chronicle/treaty/declaration) this is the only
  // way to obtain an image — explicit user action.
  const handleGenerateImage = async (entity: EncyclopediaEntity) => {
    const key = `img-${entity.id}`;
    setGeneratingImage(key);
    try {
      const existing = getWikiEntry(entity.type, entity.id);
      const body = existing
        ? { action: "regenerate", entry_id: existing.id, fields: ["image"] }
        : {
            action: "ensure",
            session_id: sessionId,
            entity_type: entity.type,
            entity_id: entity.id,
            entity_name: entity.name,
            owner_player: entity.owner,
          };

      const { data, error } = await supabase.functions.invoke("wiki-orchestrator", { body });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }

      await fetchAll();
      toast.success(`🖼️ Ilustrace „${entity.name}" vygenerována!`);
    } catch (e) {
      console.error(e);
      toast.error("Generování obrázku selhalo");
    }
    setGeneratingImage(null);
  };

  // Navigate to entity
  const openEntity = (entity: EncyclopediaEntity) => {
    // Delegate to parent unified navigation if available
    if (onEntityClick) {
      onEntityClick(entity.type, entity.id);
      return;
    }
    setSelectedEntity(entity);
  };

  const openEntityById = (entityType: string, entityId: string) => {
    const entity = allEntities.find(e => e.type === entityType && e.id === entityId);
    if (entity) setSelectedEntity(entity);
  };

  // ─── Detail View ───
  if (selectedEntity) {
    const wiki = getWikiEntry(selectedEntity.type, selectedEntity.id);
    const relatedEvents = getEntityEvents(selectedEntity.type, selectedEntity.id);
    const images = getEntityImages(selectedEntity.type, selectedEntity.id);
    const isOwner = selectedEntity.owner === currentPlayerName || isAdmin;
    const isTextGen = generatingId === `text-${selectedEntity.id}`;
    const isImgGen = generatingImage === `img-${selectedEntity.id}`;

    // For event detail: get linked entities
    const linkedEntities = selectedEntity.type === "event"
      ? getEventEntities(selectedEntity.id)
      : [];

    // For city/province: get child entities
    const childEntities = selectedEntity.type === "region"
      ? provinces.filter(p => p.region_id === selectedEntity.id).map(p => allEntities.find(e => e.type === "province" && e.id === p.id)).filter(Boolean) as EncyclopediaEntity[]
      : selectedEntity.type === "province"
        ? cities.filter(c => c.province_id === selectedEntity.id).map(c => allEntities.find(e => e.type === "city" && e.id === c.id)).filter(Boolean) as EncyclopediaEntity[]
        : [];

    return (
      <div className="space-y-6 px-4">
        {/* Back button */}
        <Button variant="ghost" size="sm" onClick={() => setSelectedEntity(null)} className="text-xs">
          <ArrowLeft className="h-3 w-3 mr-1" /> Zpět na seznam
        </Button>

        {/* Header */}
        <div className="flex items-start gap-4">
          {/* Primary image */}
          <div className="shrink-0 w-32 h-32 rounded-lg overflow-hidden border border-border bg-muted/30">
            {wiki?.image_url ? (
              <img src={wiki.image_url} alt={selectedEntity.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center flex-col gap-1">
                {ENTITY_ICONS[selectedEntity.type]}
                <span className="text-[10px] text-muted-foreground">Bez ilustrace</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {ENTITY_ICONS[selectedEntity.type]}
              <h1 className="font-display font-bold text-xl">{selectedEntity.name}</h1>
            </div>
            <Badge variant="outline" className="text-xs mb-2">
              {ENTITY_LABELS[selectedEntity.type]} — {selectedEntity.owner}
            </Badge>
            {wiki?.summary && (
              <p className="text-sm font-semibold text-primary mt-2">{wiki.summary}</p>
            )}
            {/* Action buttons */}
            {isOwner && (
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" onClick={() => handleGenerateText(selectedEntity)} disabled={isTextGen}>
                  {isTextGen ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                  {wiki?.ai_description ? "Přegenerovat text" : "Generovat text"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleGenerateImage(selectedEntity)} disabled={isImgGen}>
                  {isImgGen ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ImageIcon className="h-3 w-3 mr-1" />}
                  Generovat obrázek
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Content tabs */}
        <Tabs defaultValue="description" className="w-full">
          <TabsList className="grid w-full grid-cols-4 h-8">
            <TabsTrigger value="description" className="text-xs">📖 Popis</TabsTrigger>
            <TabsTrigger value="events" className="text-xs">⚔️ Historie ({relatedEvents.length})</TabsTrigger>
            <TabsTrigger value="gallery" className="text-xs">🖼️ Galerie ({images.length + (wiki?.image_url ? 1 : 0)})</TabsTrigger>
            <TabsTrigger value="related" className="text-xs">🔗 Propojení</TabsTrigger>
          </TabsList>

          {/* Description tab */}
          <TabsContent value="description" className="mt-4">
            {wiki?.ai_description ? (
              <RichText
                text={wiki.ai_description}
                onEventClick={onEventClick}
                className="text-sm leading-relaxed whitespace-pre-wrap"
              />
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm italic">Dosud nebyl sepsán žádný článek.</p>
                {isOwner && (
                  <Button size="sm" className="mt-3" onClick={() => handleGenerateText(selectedEntity)} disabled={isTextGen}>
                    <Sparkles className="h-3 w-3 mr-1" /> Vygenerovat článek
                  </Button>
                )}
              </div>
            )}
            {/* Context info */}
            {selectedEntity.context && (
              <div className="mt-4 p-3 rounded border border-border bg-muted/20">
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">Herní data</p>
                <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                  {Object.entries(selectedEntity.context).filter(([,v]) => v != null && v !== "").map(([k, v]) => (
                    <div key={k}><span className="font-medium">{k}:</span> {String(v)}</div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Events/History tab */}
          <TabsContent value="events" className="mt-4">
            {relatedEvents.length > 0 ? (
              <div className="space-y-2">
                {relatedEvents.map(evt => (
                  <div
                    key={evt.id}
                    className="p-3 rounded border border-border hover:border-primary/40 cursor-pointer transition-colors flex items-start gap-3"
                    onClick={() => {
                      const evtEntity = allEntities.find(e => e.type === "event" && e.id === evt.id);
                      if (evtEntity) openEntity(evtEntity);
                    }}
                  >
                    <div className="shrink-0 mt-0.5">
                      <Calendar className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{evt.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{evt.summary || evt.description || "Bez popisu"}</p>
                    </div>
                    {evt.date && <Badge variant="secondary" className="text-xs shrink-0">{evt.date}</Badge>}
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic text-center py-8">
                Žádné události nejsou spojeny s touto entitou.
              </p>
            )}
          </TabsContent>

          {/* Gallery tab */}
          <TabsContent value="gallery" className="mt-4">
            <div className="grid grid-cols-2 gap-3">
              {wiki?.image_url && (
                <div className="rounded-lg overflow-hidden border border-border">
                  <img src={wiki.image_url} alt={selectedEntity.name} className="w-full h-40 object-cover" />
                  <p className="text-[10px] text-muted-foreground p-1.5">Hlavní ilustrace</p>
                </div>
              )}
              {images.map(img => (
                <div key={img.id} className="rounded-lg overflow-hidden border border-border">
                  <img src={img.image_url} alt="" className="w-full h-40 object-cover" />
                  <p className="text-[10px] text-muted-foreground p-1.5">{img.created_by} • {new Date(img.created_at).toLocaleDateString("cs")}</p>
                </div>
              ))}
            </div>
            {!wiki?.image_url && images.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm italic">Žádné ilustrace.</p>
                {isOwner && (
                  <Button size="sm" className="mt-3" onClick={() => handleGenerateImage(selectedEntity)} disabled={isImgGen}>
                    <ImageIcon className="h-3 w-3 mr-1" /> Vygenerovat ilustraci
                  </Button>
                )}
              </div>
            )}
          </TabsContent>

          {/* Related/Links tab */}
          <TabsContent value="related" className="mt-4 space-y-4">
            {/* For events: show linked entities */}
            {selectedEntity.type === "event" && linkedEntities.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                  <Link2 className="h-3 w-3" /> Propojená místa a entity
                </p>
                <div className="space-y-1.5">
                  {linkedEntities.map(ent => (
                    <div
                      key={`${ent.type}-${ent.id}`}
                      className="flex items-center gap-2 p-2 rounded border border-border hover:border-primary/40 cursor-pointer transition-colors"
                      onClick={() => openEntity(ent)}
                    >
                      {ENTITY_ICONS[ent.type]}
                      <span className="text-sm font-medium flex-1">{ent.name}</span>
                      <Badge variant="outline" className="text-xs">{ENTITY_LABELS[ent.type]}</Badge>
                      <Badge variant="secondary" className="text-xs">{ent.linkType}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* For non-events: show event location link */}
            {selectedEntity.type === "event" && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Lokace
                </p>
                {(() => {
                  const evt = worldEvents.find(e => e.id === selectedEntity.id);
                  const locCity = evt?.location_id ? cities.find(c => c.id === evt.location_id) : null;
                  if (locCity) {
                    return (
                      <div
                        className="flex items-center gap-2 p-2 rounded border border-border hover:border-primary/40 cursor-pointer transition-colors"
                        onClick={() => openEntityById("city", locCity.id)}
                      >
                        <MapPin className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">{locCity.name}</span>
                        <Badge variant="outline" className="text-xs">Město</Badge>
                      </div>
                    );
                  }
                  return <p className="text-xs text-muted-foreground italic">Bez přiřazené lokace</p>;
                })()}
              </div>
            )}

            {/* Child entities */}
            {childEntities.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">
                  {selectedEntity.type === "region" ? "Provincie v regionu" : "Města v provincii"}
                </p>
                <div className="space-y-1.5">
                  {childEntities.map(ent => (
                    <div
                      key={ent.id}
                      className="flex items-center gap-2 p-2 rounded border border-border hover:border-primary/40 cursor-pointer transition-colors"
                      onClick={() => openEntity(ent)}
                    >
                      {ENTITY_ICONS[ent.type]}
                      <span className="text-sm font-medium flex-1">{ent.name}</span>
                      <Badge variant="outline" className="text-xs">{ENTITY_LABELS[ent.type]}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mentioned in (reverse lookup) */}
            {(() => {
              const mentionedIn = entries.filter(e =>
                e.ai_description?.includes(selectedEntity.name) && e.entity_name !== selectedEntity.name
              );
              if (mentionedIn.length === 0) return null;
              return (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Zmíněno v článcích</p>
                  <div className="space-y-1.5">
                    {mentionedIn.map(e => {
                      const ent = allEntities.find(a => a.type === e.entity_type && a.name === e.entity_name);
                      return (
                        <div
                          key={e.id}
                          className="flex items-center gap-2 p-2 rounded border border-border hover:border-primary/40 cursor-pointer transition-colors"
                          onClick={() => ent && openEntity(ent)}
                        >
                          {ENTITY_ICONS[e.entity_type]}
                          <span className="text-sm font-medium flex-1">{e.entity_name}</span>
                          <Badge variant="outline" className="text-xs">{ENTITY_LABELS[e.entity_type]}</Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {linkedEntities.length === 0 && childEntities.length === 0 && selectedEntity.type !== "event" && (
              <p className="text-sm text-muted-foreground italic text-center py-4">Žádné propojené entity.</p>
            )}
          </TabsContent>
        </Tabs>

        {wiki && (
          <p className="text-xs text-muted-foreground">
            Aktualizováno: {new Date(wiki.updated_at).toLocaleString("cs")}
          </p>
        )}
      </div>
    );
  }

  // ─── List View ───
  return (
    <div className="space-y-6 px-4">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-decorative font-bold flex items-center justify-center gap-3">
          <BookOpen className="h-7 w-7 text-illuminated" />
          Encyklopedie světa
        </h1>
        <p className="text-sm text-muted-foreground">
          Wiki všech entit — měst, provincií, regionů, divů, osobností a událostí
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Hledat..." value={filter} onChange={e => setFilter(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1 flex-wrap">
          <Button size="sm" variant={typeFilter === null ? "default" : "outline"} onClick={() => setTypeFilter(null)} className="text-xs">
            Vše ({allEntities.length})
          </Button>
          {Object.entries(ENTITY_LABELS).map(([key, label]) => {
            const count = allEntities.filter(e => e.type === key).length;
            if (count === 0) return null;
            return (
              <Button key={key} size="sm" variant={typeFilter === key ? "default" : "outline"} onClick={() => setTypeFilter(key)} className="text-xs">
                {ENTITY_ICONS[key]}<span className="ml-1">{label} ({count})</span>
              </Button>
            );
          })}
        </div>
      </div>

      {/* Entity grid */}
      <ScrollArea className="h-[650px]">
        <div className="space-y-2 pr-2">
          {filtered.map(entity => {
            const wiki = getWikiEntry(entity.type, entity.id);
            const isOwner = entity.owner === currentPlayerName || isAdmin;
            const key = `${entity.type}-${entity.id}`;
            const isGen = generatingId === `text-${entity.id}`;
            const eventCount = getEntityEvents(entity.type, entity.id).length;

            return (
              <div
                key={key}
                className="manuscript-card p-3 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => openEntity(entity)}
              >
                <div className="flex items-center gap-3">
                  <div className="shrink-0 w-12 h-12 rounded overflow-hidden border border-border bg-muted/30">
                    {wiki?.image_url ? (
                      <img src={wiki.image_url} alt={entity.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {ENTITY_ICONS[entity.type]}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-semibold text-sm truncate">{entity.name}</span>
                      <Badge variant="outline" className="text-xs shrink-0">{ENTITY_LABELS[entity.type]}</Badge>
                      {wiki && <Badge variant="secondary" className="text-xs shrink-0">📖</Badge>}
                      {eventCount > 0 && <Badge variant="secondary" className="text-xs shrink-0">⚔️ {eventCount}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {wiki?.summary || `${entity.owner} — dosud nezapsáno`}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-8 italic">Žádné entity nenalezeny</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default WikiPanel;
