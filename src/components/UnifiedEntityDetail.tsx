import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { updateCity } from "@/hooks/useGameSession";
import { generateCityProfile } from "@/lib/ai";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, MapPin, Landmark, Star, Castle, Mountain, Swords, Globe,
  Sparkles, Loader2, ImageIcon, BookOpen, Calendar, ChevronRight,
  Link2, Crown, Shield, Flame, Scroll, Brain, Users, MessageSquare,
  Map as MapIcon,
} from "lucide-react";
import { toast } from "sonner";
import RichText from "@/components/RichText";
import CityRumorsPanel from "@/components/CityRumorsPanel";
import WorldMemoryPanel from "@/components/WorldMemoryPanel";
import EntityContributionsPanel from "@/components/EntityContributionsPanel";
import type { EntityIndex } from "@/hooks/useEntityIndex";
import AILoreButton from "@/components/AILoreButton";

const ENTITY_ICONS: Record<string, React.ReactNode> = {
  city: <MapPin className="h-4 w-4" />,
  wonder: <Landmark className="h-4 w-4" />,
  person: <Star className="h-4 w-4" />,
  event: <Swords className="h-4 w-4" />,
  province: <Castle className="h-4 w-4" />,
  region: <Mountain className="h-4 w-4" />,
};
const ENTITY_LABELS: Record<string, string> = {
  city: "Město", wonder: "Div", person: "Osobnost", event: "Událost",
  province: "Provincie", region: "Region",
};
const CITY_LEVELS = ["Osada", "Městečko", "Město", "Polis"];
const STATUSES = ["ok", "devastated", "besieged"];
const STATUS_LABELS: Record<string, string> = { ok: "V pořádku", devastated: "Zpustošeno", besieged: "Obléháno" };
const EVENT_TYPE_LABELS: Record<string, string> = {
  place_tile: "Položení dílku", found_settlement: "Založení osady", upgrade_city: "Upgrade města",
  raid: "Nájezd", repair: "Oprava území", battle: "Bitva", diplomacy: "Diplomacie",
  city_state_action: "Akce městského státu", trade: "Obchod", wonder: "Div světa",
};

interface Props {
  sessionId: string;
  entityType: string;
  entityId: string;
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
  epochStyle?: string;
  // Data passed from parent
  cities: any[];
  events: any[]; // game_events
  memories: any[];
  wonders: any[];
  players: any[];
  greatPersons: any[];
  entityIndex?: EntityIndex;
  // Navigation
  onBack: () => void;
  onEventClick?: (eventId: string) => void;
  onEntityClick?: (type: string, id: string) => void;
  onRefetch?: () => void;
}

interface WikiEntry {
  id: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string;
  summary: string | null;
  ai_description: string | null;
  image_url: string | null;
  image_prompt: string | null;
  tags: string[];
  references: any;
  updated_at: string;
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

const UnifiedEntityDetail = ({
  sessionId, entityType, entityId, currentPlayerName, currentTurn, myRole, epochStyle,
  cities, events, memories, wonders, players, greatPersons, entityIndex,
  onBack, onEventClick, onEntityClick, onRefetch,
}: Props) => {
  const [wiki, setWiki] = useState<WikiEntry | null>(null);
  const [images, setImages] = useState<EncImage[]>([]);
  const [worldEvents, setWorldEvents] = useState<any[]>([]);
  const [eventLinks, setEventLinks] = useState<any[]>([]);
  const [provinces, setProvinces] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [worldMemories, setWorldMemories] = useState<string[]>([]);
  const [generatingText, setGeneratingText] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingProfile, setGeneratingProfile] = useState(false);
  const [generatingMapIcon, setGeneratingMapIcon] = useState(false);
  const [mapIconUrl, setMapIconUrl] = useState<string | null>(null);
  const [introduction, setIntroduction] = useState<string | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const [bulletFacts, setBulletFacts] = useState<string[]>([]);
  const [flavorPrompt, setFlavorPrompt] = useState("");
  const [editingFlavor, setEditingFlavor] = useState(false);

  const isAdmin = myRole === "admin" || !myRole;

  // Find the entity data
  const city = entityType === "city" ? cities.find(c => c.id === entityId) : null;
  const wonder = entityType === "wonder" ? wonders.find(w => w.id === entityId) : null;
  const person = entityType === "person" ? greatPersons.find(p => p.id === entityId) : null;

  const entityName = city?.name || wonder?.name || person?.name || "";
  const entityOwner = city?.owner_player || wonder?.owner_player || person?.player_name || "";
  const isOwner = entityOwner === currentPlayerName || isAdmin;

  useEffect(() => {
    if (city) setFlavorPrompt(city.flavor_prompt || "");
  }, [city]);

  useEffect(() => {
    fetchEntityData();
  }, [sessionId, entityId, entityType]);

  const fetchEntityData = async () => {
    const [wikiRes, imagesRes, worldEventsRes, linksRes, provincesRes, regionsRes, memoriesRes] = await Promise.all([
      supabase.from("wiki_entries").select("*").eq("session_id", sessionId).eq("entity_type", entityType).eq("entity_id", entityId).limit(1).maybeSingle(),
      supabase.from("encyclopedia_images").select("*").eq("session_id", sessionId).eq("entity_type", entityType).eq("entity_id", entityId),
      supabase.from("world_events").select("*").eq("session_id", sessionId).eq("status", "published").order("date"),
      supabase.from("event_entity_links").select("*"),
      supabase.from("provinces").select("*").eq("session_id", sessionId),
      supabase.from("regions").select("*").eq("session_id", sessionId),
      supabase.from("world_memories").select("text").eq("session_id", sessionId).eq("approved", true),
    ]);

    // Use direct entity_id match; fallback to name match if not found
    let wikiMatch = wikiRes.data as WikiEntry | null;
    if (!wikiMatch && entityName) {
      const { data: fallback } = await supabase.from("wiki_entries").select("*")
        .eq("session_id", sessionId).eq("entity_type", entityType).eq("entity_name", entityName).maybeSingle();
      wikiMatch = fallback as WikiEntry | null;
      // Backfill entity_id if found by name
      if (wikiMatch && !wikiMatch.entity_id) {
        await supabase.from("wiki_entries").update({ entity_id: entityId }).eq("id", wikiMatch.id);
        wikiMatch.entity_id = entityId;
      }
    }
    setWiki(wikiMatch);

    if (imagesRes.data) setImages(imagesRes.data as EncImage[]);
    if (worldEventsRes.data) setWorldEvents(worldEventsRes.data);
    if (linksRes.data) setEventLinks(linksRes.data);
    if (provincesRes.data) setProvinces(provincesRes.data);
    if (regionsRes.data) setRegions(regionsRes.data);
    if (memoriesRes.data) setWorldMemories(memoriesRes.data.map((m: any) => m.text));

    // Fetch map icon for cities
    if (entityType === "city") {
      const { data: iconData } = await supabase.from("encyclopedia_images").select("image_url")
        .eq("session_id", sessionId).eq("entity_id", entityId).eq("entity_type", "city").eq("kind", "map_icon").limit(1);
      setMapIconUrl(iconData?.[0]?.image_url || null);
    }
  };

  const handleGenerateMapIcon = async () => {
    setGeneratingMapIcon(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-map-icon", {
        body: { session_id: sessionId, city_id: entityId },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      setMapIconUrl(data.map_icon_url);
      toast.success(`Mapový avatar vygenerován!`);
      onRefetch?.();
    } catch (e: any) {
      toast.error("Generování avataru selhalo: " + (e.message || "neznámá chyba"));
    } finally {
      setGeneratingMapIcon(false);
    }
  };

  // Entity-related world events
  const relatedWorldEvents = useMemo(() => {
    const linkedIds = eventLinks
      .filter(l => l.entity_type === entityType && l.entity_id === entityId)
      .map(l => l.event_id);
    const locationIds = entityType === "city"
      ? worldEvents.filter(e => e.location_id === entityId).map(e => e.id)
      : [];
    const allIds = new Set([...linkedIds, ...locationIds]);
    return worldEvents.filter(e => allIds.has(e.id));
  }, [worldEvents, eventLinks, entityType, entityId]);

  // City-specific game_events
  const cityGameEvents = useMemo(() => {
    if (entityType !== "city") return [];
    return events.filter(e => e.city_id === entityId || e.secondary_city_id === entityId);
  }, [events, entityType, entityId]);

  const confirmedCityEvents = cityGameEvents.filter(e => e.confirmed);

  // Child entities
  const childEntities = useMemo(() => {
    if (entityType === "region") {
      return provinces.filter(p => p.region_id === entityId).map(p => ({ type: "province" as const, id: p.id, name: p.name }));
    }
    if (entityType === "province") {
      return cities.filter(c => c.province_id === entityId).map(c => ({ type: "city" as const, id: c.id, name: c.name }));
    }
    return [];
  }, [entityType, entityId, provinces, cities]);

  // Event-linked entities
  const linkedEntities = useMemo(() => {
    if (entityType !== "event") return [];
    return eventLinks
      .filter(l => l.event_id === entityId)
      .map(l => {
        const c = cities.find(x => x.id === l.entity_id);
        const p = provinces.find(x => x.id === l.entity_id);
        const r = regions.find(x => x.id === l.entity_id);
        const w = wonders.find(x => x.id === l.entity_id);
        const gp = greatPersons.find(x => x.id === l.entity_id);
        const name = c?.name || p?.name || r?.name || w?.name || gp?.name || "?";
        return { type: l.entity_type, id: l.entity_id, name, linkType: l.link_type };
      });
  }, [entityType, entityId, eventLinks, cities, provinces, regions, wonders, greatPersons]);

  // City wonders
  const cityWonders = entityType === "city" ? wonders.filter(w => w.city_name === city?.name) : [];

  // ── Generate encyclopedia text
  const handleGenerateText = async () => {
    setGeneratingText(true);
    try {
      const context = city
        ? { level: city.level, province: city.province, tags: city.tags, status: city.status, founded_round: city.founded_round }
        : wonder
          ? { era: wonder.era, status: wonder.status, city: wonder.city_name, description: wonder.description }
          : person
            ? { personType: person.person_type, flavor: person.flavor_trait, alive: person.is_alive, bio: person.bio }
            : {};

      const { data, error } = await supabase.functions.invoke("encyclopedia-generate", {
        body: {
          entityType, entityName, context,
          relatedEvents: relatedWorldEvents.map(e => ({ title: e.title, date: e.date, summary: e.summary, description: e.description })),
          worldMemories,
          epochStyle: epochStyle || "kroniky",
        },
      });
      if (error) throw error;
      if (data.error) { toast.error(data.error); return; }

      if (wiki) {
        await supabase.from("wiki_entries").update({
          summary: data.summary,
          ai_description: data.description,
          image_prompt: data.imagePrompt,
          entity_id: entityId,
          updated_at: new Date().toISOString(),
        }).eq("id", wiki.id);
      } else {
        await supabase.from("wiki_entries").insert({
          session_id: sessionId,
          entity_type: entityType,
          entity_id: entityId,
          entity_name: entityName,
          owner_player: entityOwner,
          summary: data.summary,
          ai_description: data.description,
          image_prompt: data.imagePrompt,
        });
      }
      await fetchEntityData();
      toast.success(`📖 Článek „${entityName}" vygenerován!`);
    } catch (e) {
      console.error(e);
      toast.error("Generování článku selhalo");
    }
    setGeneratingText(false);
  };

  // ── Generate image (unified pipeline)
  const handleGenerateImage = async () => {
    setGeneratingImage(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-entity-media", {
        body: {
          sessionId, entityType, entityName, entityId,
          kind: "cover",
          imagePrompt: wiki?.image_prompt,
          createdBy: isAdmin ? "admin" : currentPlayerName,
        },
      });
      if (error) throw error;
      if (data.error) { toast.error(data.error); return; }

      await fetchEntityData();
      toast.success(`🖼️ Ilustrace vygenerována!`);
    } catch (e) {
      console.error(e);
      toast.error("Generování obrázku selhalo");
    }
    setGeneratingImage(false);
  };

  // ── City profile (Sága)
  const handleGenerateProfile = async (type: "intro" | "history" | "both") => {
    if (!city) return;
    setGeneratingProfile(true);
    try {
      const cityMems = memories.filter(m => m.approved && m.city_id === city.id).map(m => ({ text: m.text, category: m.category }));
      const provMems = city.province_id
        ? memories.filter(m => m.approved && m.province_id === city.province_id).map(m => ({ text: m.text, category: m.category }))
        : [];
      const result = await generateCityProfile({
        name: city.name, ownerName: city.owner_player, level: city.level,
        province: city.province || "", tags: city.tags || [],
        foundedRound: city.founded_round || 1, status: city.status || "ok",
        ownerFlavorPrompt: city.flavor_prompt || null,
      }, confirmedCityEvents, memories.filter(m => m.approved).map(m => m.text), cityMems, provMems);

      if (type === "intro" || type === "both") setIntroduction(result.introduction);
      if (type === "history" || type === "both") {
        setHistory(result.historyRetelling);
        setBulletFacts(result.bulletFacts || []);
      }
      toast.success("Profil města vygenerován");
    } catch {
      toast.error("Generování profilu selhalo");
    }
    setGeneratingProfile(false);
  };

  const handleSaveFlavor = async () => {
    if (!city) return;
    await supabase.from("cities").update({ flavor_prompt: flavorPrompt || null } as any).eq("id", city.id);
    setEditingFlavor(false);
    toast.success("Flavor prompt uložen");
    onRefetch?.();
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (!city) return;
    await supabase.from("cities").update({ status: newStatus } as any).eq("id", city.id);
    toast.success(`Status změněn na ${STATUS_LABELS[newStatus]}`);
    onRefetch?.();
  };

  // Find entity-specific context info
  const contextInfo = useMemo(() => {
    if (city) return { "Úroveň": city.level, "Provincie": city.province, "Založeno": `Rok ${city.founded_round}`, "Status": STATUS_LABELS[city.status || "ok"] };
    if (wonder) return { "Éra": wonder.era, "Status": wonder.status, "Město": wonder.city_name };
    if (person) return { "Typ": person.person_type, "Narozen": `Rok ${person.born_round}`, "Stav": person.is_alive ? "Žije" : `Zemřel (rok ${person.died_round})` };
    // Find province/region data
    const prov = entityType === "province" ? provinces.find(p => p.id === entityId) : null;
    const reg = entityType === "region" ? regions.find(r => r.id === entityId) : null;
    if (prov) return { "Vlastník": prov.owner_player };
    if (reg) return { "Vlastník": reg.owner_player || "Neutrální" };
    // Event
    const evt = entityType === "event" ? worldEvents.find(e => e.id === entityId) : null;
    if (evt) return { "Datum": evt.date || "Neznámé", "Kategorie": evt.event_category, "Status": evt.status };
    return {};
  }, [entityType, entityId, city, wonder, person, provinces, regions, worldEvents]);

  // Tab count for dynamic tabs
  const tabsConfig = useMemo(() => {
    const tabs: { value: string; label: string; count?: number }[] = [
      { value: "description", label: "📖 Popis" },
      { value: "events", label: `⚔️ Historie`, count: relatedWorldEvents.length + confirmedCityEvents.length },
      { value: "gallery", label: `🖼️ Galerie`, count: images.length + (wiki?.image_url ? 1 : 0) },
      { value: "related", label: "🔗 Propojení" },
      { value: "contributions", label: "✍️ Příspěvky" },
    ];
    if (entityType === "city") {
      tabs.splice(2, 0, { value: "rumors", label: "🗣️ Zvěsti" });
    }
    return tabs;
  }, [entityType, relatedWorldEvents.length, confirmedCityEvents.length, images.length, wiki?.image_url]);

  const primaryImage = wiki?.image_url || images.find(i => i.is_primary)?.image_url || images[0]?.image_url;

  // Breadcrumb data for city
  const cityProvince = city ? provinces.find(p => p.id === city.province_id) : null;
  const cityRegion = cityProvince ? regions.find(r => r.id === cityProvince.region_id) : null;

  return (
    <div className="space-y-6 pb-20">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={onBack} className="text-xs">
        <ArrowLeft className="h-3 w-3 mr-1" /> Zpět
      </Button>

      {/* ─── HERO HEADER (city with image) ─── */}
      {entityType === "city" && city ? (
        <div className="relative rounded-xl overflow-hidden border border-border">
          {/* Hero cover */}
          <div className="relative h-[200px] md:h-[280px]">
            {primaryImage ? (
              <img src={primaryImage} alt={entityName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/10 via-muted to-primary/5 flex items-center justify-center">
                <Castle className="h-16 w-16 text-muted-foreground/20" />
              </div>
            )}
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
            {/* Content overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6">
              {/* Breadcrumbs */}
              {(cityRegion || cityProvince) && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-2">
                  {cityRegion && (
                    <button className="hover:text-primary transition-colors" onClick={() => onEntityClick?.("region", cityRegion.id)}>
                      {cityRegion.name}
                    </button>
                  )}
                  {cityRegion && cityProvince && <ChevronRight className="h-3 w-3" />}
                  {cityProvince && (
                    <button className="hover:text-primary transition-colors" onClick={() => onEntityClick?.("province", cityProvince.id)}>
                      {cityProvince.name}
                    </button>
                  )}
                </div>
              )}
              <div className="flex items-center gap-3 mb-2">
                <h1 className="font-display font-bold text-2xl md:text-3xl">{entityName}</h1>
                <Badge variant="secondary" className="text-xs">{city.level}</Badge>
                {city.status && city.status !== "ok" && (
                  <Badge variant="destructive" className="flex items-center gap-1 text-xs">
                    {city.status === "devastated" ? <Flame className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                    {STATUS_LABELS[city.status]}
                  </Badge>
                )}
              </div>
              {/* Lore sentence */}
              {wiki?.summary && (
                <p className="text-sm text-muted-foreground italic max-w-lg">{wiki.summary}</p>
              )}
              {/* Quick stats */}
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                {[
                  { icon: "users" as const, label: "Populace", value: (city.population_total || 0).toLocaleString() },
                  { icon: "shield" as const, label: "Stabilita", value: city.city_stability, danger: city.city_stability < 40 },
                  { icon: "grain" as const, label: "Obilí", value: `${(city as any).last_turn_grain_prod || 0} - ${(city as any).last_turn_grain_cons || 0}` },
                  { icon: "flame" as const, label: "Zranitelnost", value: (city.vulnerability_score || 0).toFixed(0) },
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-background/70 backdrop-blur-sm border border-border/50 text-xs">
                    {s.icon === "users" ? <Users className={`h-3.5 w-3.5 text-primary`} /> :
                     s.icon === "shield" ? <Shield className={`h-3.5 w-3.5 ${s.danger ? "text-destructive" : "text-primary"}`} /> :
                     s.icon === "grain" ? <span className="text-sm">🌾</span> :
                     <Flame className={`h-3.5 w-3.5 text-primary`} />}
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className={`font-semibold ${s.danger ? "text-destructive" : ""}`}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Action buttons row */}
          {isOwner && (
            <div className="flex items-center gap-2 p-3 bg-card border-t border-border flex-wrap">
              <Button size="sm" variant="outline" onClick={handleGenerateText} disabled={generatingText}>
                {generatingText ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                {wiki?.ai_description ? "Přegenerovat" : "Generovat text"}
              </Button>
              <Button size="sm" variant="outline" onClick={handleGenerateImage} disabled={generatingImage}>
                {generatingImage ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ImageIcon className="h-3 w-3 mr-1" />}
              Ilustrace
              </Button>
              {/* Map avatar — owner + admin for cities */}
              {entityType === "city" && (
                <Button size="sm" variant="outline" onClick={handleGenerateMapIcon} disabled={generatingMapIcon} className="gap-1">
                  {generatingMapIcon ? <Loader2 className="h-3 w-3 animate-spin" /> : mapIconUrl ? <img src={mapIconUrl} alt="" className="h-4 w-4 rounded" style={{ imageRendering: "pixelated" }} /> : <MapIcon className="h-3 w-3" />}
                  {mapIconUrl ? "Přegen. avatar" : "Map avatar"}
                </Button>
              )}
              {/* Admin-only: level + status dropdowns */}
              {isAdmin && (
                <>
                  <Select value={city.level} onValueChange={v => { updateCity(city.id, { level: v }); onRefetch?.(); }}>
                    <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{CITY_LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={city.status || "ok"} onValueChange={handleUpdateStatus}>
                    <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}</SelectContent>
                  </Select>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ─── Standard header for non-city entities ─── */
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-32 h-32 rounded-lg overflow-hidden border border-border bg-muted/30">
            {primaryImage ? (
              <img src={primaryImage} alt={entityName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center flex-col gap-1">
                {ENTITY_ICONS[entityType]}
                <span className="text-[10px] text-muted-foreground">Bez ilustrace</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {ENTITY_ICONS[entityType]}
              <h1 className="font-display font-bold text-xl">{entityName}</h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant="outline" className="text-xs">{ENTITY_LABELS[entityType]}</Badge>
              {entityOwner && <Badge variant="secondary" className="text-xs">{entityOwner}</Badge>}
            </div>
            {wiki?.summary && (
              <p className="text-sm font-semibold text-primary mt-1">{wiki.summary}</p>
            )}
            {isOwner && (
              <div className="flex gap-2 mt-3 flex-wrap">
                <Button size="sm" variant="outline" onClick={handleGenerateText} disabled={generatingText}>
                  {generatingText ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                  {wiki?.ai_description ? "Přegenerovat" : "Generovat text"}
                </Button>
                <Button size="sm" variant="outline" onClick={handleGenerateImage} disabled={generatingImage}>
                  {generatingImage ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ImageIcon className="h-3 w-3 mr-1" />}
                  Ilustrace
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content tabs */}
      <Tabs defaultValue="description" className="w-full">
        <TabsList className="w-full justify-start bg-card border border-border h-auto p-1 gap-1 flex-wrap">
          {tabsConfig.map(t => (
            <TabsTrigger key={t.value} value={t.value} className="text-xs">
              {t.label}{t.count != null ? ` (${t.count})` : ""}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Description ── */}
        <TabsContent value="description" className="mt-4 space-y-4">
          {wiki?.ai_description ? (
            <RichText text={wiki.ai_description} onEventClick={onEventClick} className="text-sm leading-relaxed whitespace-pre-wrap" />
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm italic">Dosud nebyl sepsán žádný encyklopedický článek.</p>
              {isOwner && (
                <Button size="sm" className="mt-3" onClick={handleGenerateText} disabled={generatingText}>
                  <Sparkles className="h-3 w-3 mr-1" /> Vygenerovat
                </Button>
              )}
            </div>
          )}

          {/* City-specific: flavor prompt + AI profile */}
          {entityType === "city" && city && isOwner && (
            <>
              <div className="bg-card p-4 rounded-lg border border-border space-y-2">
                <h3 className="font-display font-semibold text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />Flavor prompt
                </h3>
                {editingFlavor ? (
                  <div className="space-y-2">
                    <Textarea value={flavorPrompt} onChange={e => setFlavorPrompt(e.target.value)} rows={3}
                      placeholder="Popište atmosféru města..." />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveFlavor}>Uložit</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingFlavor(false)}>Zrušit</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <p className="text-sm italic flex-1">{city.flavor_prompt || "Žádný flavor prompt."}</p>
                    <Button size="sm" variant="outline" onClick={() => setEditingFlavor(true)}>Upravit</Button>
                  </div>
                )}
              </div>
              <div className="bg-card p-4 rounded-lg border-2 border-primary/20 space-y-3">
                <h3 className="font-display font-semibold text-sm flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" />AI profil města
                </h3>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" onClick={() => handleGenerateProfile("intro")} disabled={generatingProfile}>
                    <BookOpen className="h-3 w-3 mr-1" />Představení
                  </Button>
                  <Button size="sm" onClick={() => handleGenerateProfile("history")} disabled={generatingProfile}>
                    <Scroll className="h-3 w-3 mr-1" />Městská sága
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleGenerateProfile("both")} disabled={generatingProfile}>
                    {generatingProfile ? "Generuji..." : "Obojí"}
                  </Button>
                </div>
                {introduction && (
                  <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-2">
                    <h4 className="font-display font-semibold text-sm">📜 Představení</h4>
                    <RichText text={introduction} onEventClick={onEventClick} className="text-sm leading-relaxed whitespace-pre-wrap" />
                  </div>
                )}
                {history && (
                  <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-2">
                    <h4 className="font-display font-semibold text-sm">📖 Městská sága</h4>
                    <RichText text={history} onEventClick={onEventClick} className="text-sm leading-relaxed whitespace-pre-wrap" />
                    {bulletFacts.length > 0 && (
                      <ul className="text-sm space-y-1 mt-2">
                        {bulletFacts.map((f, i) => <li key={i} className="flex items-start gap-1"><span>•</span><span>{f}</span></li>)}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Context info */}
          {Object.keys(contextInfo).length > 0 && (
            <div className="p-3 rounded border border-border bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Herní data</p>
              <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                {Object.entries(contextInfo).filter(([, v]) => v != null).map(([k, v]) => (
                  <div key={k}><span className="font-medium">{k}:</span> {String(v)}</div>
                ))}
              </div>
            </div>
          )}

          {/* City wonders */}
          {cityWonders.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-display font-semibold text-sm flex items-center gap-2">
                <Landmark className="h-4 w-4 text-primary" />Divy města ({cityWonders.length})
              </h3>
              {cityWonders.map(w => (
                <div key={w.id} className="p-3 rounded border border-border bg-muted/20 cursor-pointer hover:border-primary/40"
                  onClick={() => onEntityClick?.("wonder", w.id)}>
                  <div className="flex items-center gap-2">
                    <span className="font-display font-semibold text-sm">{w.name}</span>
                    <Badge variant="secondary" className="text-xs">{w.status}</Badge>
                  </div>
                  {w.description && <p className="text-xs text-muted-foreground mt-1">{w.description}</p>}
                </div>
              ))}
            </div>
          )}

          {/* City Memory */}
          {entityType === "city" && city && (
            <WorldMemoryPanel sessionId={sessionId} memories={memories} filterCityId={city.id} />
          )}
        </TabsContent>

        {/* ── Rumors (city only) ── */}
        {entityType === "city" && city && (
          <TabsContent value="rumors" className="mt-4">
            <CityRumorsPanel
              sessionId={sessionId}
              cityId={city.id}
              cityName={city.name}
              ownerPlayer={city.owner_player}
              currentTurn={currentTurn}
              events={events}
              memories={memories}
              epochStyle={epochStyle}
              entityIndex={entityIndex}
              onEventClick={onEventClick}
              onEntityClick={onEntityClick}
            />
          </TabsContent>
        )}

        {/* ── Events / History ── */}
        <TabsContent value="events" className="mt-4 space-y-4">
          {/* World Events */}
          {relatedWorldEvents.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Světové události</p>
              {relatedWorldEvents.map(evt => (
                <div key={evt.id} className="p-3 rounded border border-border hover:border-primary/40 cursor-pointer transition-colors flex items-start gap-3"
                  onClick={() => onEntityClick?.("event", evt.id)}>
                  <Calendar className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{evt.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{evt.summary || evt.description || "Bez popisu"}</p>
                  </div>
                  {evt.date && <Badge variant="secondary" className="text-xs shrink-0">{evt.date}</Badge>}
                </div>
              ))}
            </div>
          )}

          {/* City game events timeline */}
          {confirmedCityEvents.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Herní události ({confirmedCityEvents.length})</p>
              {(() => {
                const byTurn = confirmedCityEvents.reduce<Record<number, any[]>>((acc, e) => {
                  (acc[e.turn_number] = acc[e.turn_number] || []).push(e); return acc;
                }, {});
                return Object.keys(byTurn).map(Number).sort((a, b) => b - a).map(turn => (
                  <div key={turn} className="space-y-1">
                    <h4 className="font-display text-xs text-primary font-semibold">Rok {turn}</h4>
                    {byTurn[turn].map(evt => (
                      <div key={evt.id} className="p-2 rounded bg-muted/30 text-sm flex items-center gap-2">
                        <Badge variant="outline" className="text-xs shrink-0">
                          {EVENT_TYPE_LABELS[evt.event_type] || evt.event_type}
                        </Badge>
                        <span className="font-semibold text-xs">{evt.player}</span>
                        {evt.note && <span className="text-xs text-muted-foreground italic truncate">— {evt.note}</span>}
                      </div>
                    ))}
                  </div>
                ));
              })()}
            </div>
          )}

          {relatedWorldEvents.length === 0 && confirmedCityEvents.length === 0 && (
            <p className="text-sm text-muted-foreground italic text-center py-8">Žádné události nejsou spojeny s touto entitou.</p>
          )}
        </TabsContent>

        {/* ── Gallery ── */}
        <TabsContent value="gallery" className="mt-4">
          <div className="grid grid-cols-2 gap-3">
            {wiki?.image_url && (
              <div className="rounded-lg overflow-hidden border border-border">
                <img src={wiki.image_url} alt={entityName} className="w-full h-40 object-cover" />
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
                <Button size="sm" className="mt-3" onClick={handleGenerateImage} disabled={generatingImage}>
                  <ImageIcon className="h-3 w-3 mr-1" /> Vygenerovat
                </Button>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── Related / Links ── */}
        <TabsContent value="related" className="mt-4 space-y-4">
          {entityType === "event" && linkedEntities.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><Link2 className="h-3 w-3" /> Propojené entity</p>
              <div className="space-y-1.5">
                {linkedEntities.map(ent => (
                  <div key={`${ent.type}-${ent.id}`} className="flex items-center gap-2 p-2 rounded border border-border hover:border-primary/40 cursor-pointer"
                    onClick={() => onEntityClick?.(ent.type, ent.id)}>
                    {ENTITY_ICONS[ent.type]}
                    <span className="text-sm font-medium flex-1">{ent.name}</span>
                    <Badge variant="outline" className="text-xs">{ENTITY_LABELS[ent.type]}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {childEntities.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                {entityType === "region" ? "Provincie v regionu" : "Města v provincii"}
              </p>
              <div className="space-y-1.5">
                {childEntities.map(ent => (
                  <div key={ent.id} className="flex items-center gap-2 p-2 rounded border border-border hover:border-primary/40 cursor-pointer"
                    onClick={() => onEntityClick?.(ent.type, ent.id)}>
                    {ENTITY_ICONS[ent.type]}
                    <span className="text-sm font-medium flex-1">{ent.name}</span>
                    <Badge variant="outline" className="text-xs">{ENTITY_LABELS[ent.type]}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {linkedEntities.length === 0 && childEntities.length === 0 && (
            <p className="text-sm text-muted-foreground italic text-center py-4">Žádné propojené entity.</p>
          )}
        </TabsContent>

        {/* ── Contributions ── */}
        <TabsContent value="contributions" className="mt-4">
          <EntityContributionsPanel
            sessionId={sessionId}
            entityType={entityType}
            entityId={entityId}
            currentPlayerName={currentPlayerName}
            players={players}
            myRole={myRole}
            onEventClick={onEventClick}
          />
        </TabsContent>
      </Tabs>

      {wiki && (
        <p className="text-xs text-muted-foreground">
          Aktualizováno: {new Date(wiki.updated_at).toLocaleString("cs")}
        </p>
      )}
    </div>
  );
};

export default UnifiedEntityDetail;
