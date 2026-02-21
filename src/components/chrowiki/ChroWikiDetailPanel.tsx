import { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  BookOpen, Castle, Calendar, Crown, Flag, Landmark, Loader2, MapPin,
  Mountain, Scroll, Sparkles, Swords, Compass, Shield, Users, ChevronRight, AlertTriangle,
  Eye, EyeOff, Pencil, Save, X, History, Zap, Wheat, Coins, Heart,
  ChevronDown, ChevronUp, FileText,
} from "lucide-react";
import { toast } from "sonner";
import RichText from "@/components/RichText";

const ENTITY_ICONS: Record<string, React.ReactNode> = {
  country: <Flag className="h-5 w-5" />,
  region: <Mountain className="h-5 w-5" />,
  province: <MapPin className="h-5 w-5" />,
  city: <Castle className="h-5 w-5" />,
  wonder: <Landmark className="h-5 w-5" />,
  person: <Crown className="h-5 w-5" />,
  event: <Calendar className="h-5 w-5" />,
  battle: <Swords className="h-5 w-5" />,
  expedition: <Compass className="h-5 w-5" />,
};

const ENTITY_LABELS: Record<string, string> = {
  country: "Stát", region: "Region", province: "Provincie", city: "Město",
  wonder: "Div světa", person: "Osobnost", event: "Událost", battle: "Bitva",
  expedition: "Objev",
};

const SIGIL_TYPES = new Set(["country", "region", "province", "city"]);

const TABLE_MAP: Record<string, { table: string; nameCol: string }> = {
  country: { table: "countries", nameCol: "name" },
  region: { table: "regions", nameCol: "name" },
  province: { table: "provinces", nameCol: "name" },
  city: { table: "cities", nameCol: "name" },
  wonder: { table: "wonders", nameCol: "name" },
  person: { table: "great_persons", nameCol: "name" },
  event: { table: "world_events", nameCol: "title" },
  expedition: { table: "expeditions", nameCol: "narrative" },
};

const CHRONICLE_CATEGORIES = [
  { value: "all", label: "Vše" },
  { value: "war", label: "Válka" },
  { value: "economy", label: "Ekonomika" },
  { value: "diplomacy", label: "Diplomacie" },
  { value: "disaster", label: "Katastrofa" },
  { value: "founding", label: "Založení" },
];

interface Props {
  sessionId: string;
  entityType: string;
  entityId: string;
  entityName: string;
  currentPlayerName?: string;
  countries: any[];
  regions: any[];
  provinces: any[];
  cities: any[];
  wonders: any[];
  persons: any[];
  events: any[];
  chronicles: any[];
  wikiEntries: any[];
  declarations: any[];
  onEntityClick: (type: string, id: string, name: string) => void;
  onRefreshWiki: () => Promise<void>;
}

const ChroWikiDetailPanel = ({
  sessionId, entityType, entityId, entityName, currentPlayerName,
  countries, regions, provinces, cities, wonders, persons, events, chronicles, wikiEntries, declarations,
  onEntityClick, onRefreshWiki,
}: Props) => {
  const [generating, setGenerating] = useState(false);
  const [dbEntity, setDbEntity] = useState<any>(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbError, setDbError] = useState(false);
  const [readingMode, setReadingMode] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Saga state
  const [sagaVersions, setSagaVersions] = useState<any[]>([]);
  const [selectedSagaVersion, setSelectedSagaVersion] = useState<string>("latest");
  const [editingSaga, setEditingSaga] = useState(false);
  const [sagaDraft, setSagaDraft] = useState("");
  const [savingSaga, setSavingSaga] = useState(false);
  const [generatingSaga, setGeneratingSaga] = useState(false);

  // Chronicle mentions state
  const [chroniclePage, setChroniclePage] = useState(0);
  const [chronicleCatFilter, setChronicleCatFilter] = useState("all");
  const [chronicleExpanded, setChronicleExpanded] = useState(false);

  // Entity links
  const [entityLinks, setEntityLinks] = useState<any[]>([]);

  // Direct DB fetch
  useEffect(() => {
    if (!entityId || !entityType) return;
    const mapping = TABLE_MAP[entityType];
    if (!mapping) { setDbEntity(null); return; }
    setDbLoading(true);
    setDbError(false);
    (supabase.from(mapping.table as any).select("*").eq("id", entityId).maybeSingle() as any)
      .then(({ data, error }: any) => {
        if (error) { console.error("DB fetch error:", error); setDbError(true); }
        setDbEntity(data || null);
        setDbLoading(false);
      });
  }, [entityId, entityType]);

  // Fetch saga versions + entity links
  useEffect(() => {
    if (!entityId || !sessionId) return;
    Promise.all([
      supabase.from("saga_versions").select("*")
        .eq("session_id", sessionId).eq("entity_type", entityType).eq("entity_id", entityId)
        .order("version", { ascending: false }),
      supabase.from("entity_links").select("*")
        .eq("session_id", sessionId)
        .or(`and(from_entity_type.eq.${entityType},from_entity_id.eq.${entityId}),and(to_entity_type.eq.${entityType},to_entity_id.eq.${entityId})`),
    ]).then(([sagaRes, linksRes]) => {
      setSagaVersions(sagaRes.data || []);
      setEntityLinks(linksRes.data || []);
    });
  }, [entityId, entityType, sessionId]);

  // Reset state on entity change
  useEffect(() => {
    setSelectedSagaVersion("latest");
    setEditingSaga(false);
    setChroniclePage(0);
    setChronicleCatFilter("all");
    setChronicleExpanded(false);
    setReadingMode(false);
  }, [entityId]);

  const memoryEntity = useMemo(() => {
    switch (entityType) {
      case "country": return countries.find(c => c.id === entityId);
      case "region": return regions.find(r => r.id === entityId);
      case "province": return provinces.find(p => p.id === entityId);
      case "city": return cities.find(c => c.id === entityId);
      case "wonder": return wonders.find(w => w.id === entityId);
      case "person": return persons.find(p => p.id === entityId);
      case "event": return events.find(e => e.id === entityId);
      default: return null;
    }
  }, [entityType, entityId, countries, regions, provinces, cities, wonders, persons, events]);

  const entity = dbEntity || memoryEntity;

  const wiki = useMemo(() =>
    wikiEntries.find(w =>
      (w.entity_id === entityId && w.entity_type === entityType) ||
      (w.entity_name === entityName && w.entity_type === entityType)
    ),
    [wikiEntries, entityId, entityType, entityName]
  );

  const isOwner = entity?.owner_player === currentPlayerName || entity?.player_name === currentPlayerName;
  const descriptionText = wiki?.ai_description || entity?.ai_description || entity?.description || entity?.bio || entity?.summary || null;
  const imageUrl = wiki?.image_url || entity?.image_url || entity?.ai_image_url || null;

  // Current saga text
  const currentSaga = useMemo(() => {
    if (sagaVersions.length === 0) return null;
    if (selectedSagaVersion === "latest") return sagaVersions[0];
    return sagaVersions.find(v => String(v.version) === selectedSagaVersion) || sagaVersions[0];
  }, [sagaVersions, selectedSagaVersion]);

  // ── Key facts (entity-type conditional) ──
  const keyFacts = useMemo(() => {
    const facts: { label: string; value: string; icon?: React.ReactNode }[] = [];
    if (!entity) return facts;
    facts.push({ label: "Typ", value: ENTITY_LABELS[entityType] || entityType });

    if (entityType === "city") {
      facts.push({ label: "Úroveň", value: entity.settlement_level || entity.level || "—" });
      facts.push({ label: "Založeno", value: `Rok ${entity.founded_round}` });
      facts.push({ label: "Vlastník", value: entity.owner_player });
      if (entity.population_total) facts.push({ label: "Populace", value: String(entity.population_total), icon: <Users className="h-3 w-3" /> });
      if (entity.city_stability != null) facts.push({ label: "Stabilita", value: String(entity.city_stability), icon: <Shield className="h-3 w-3" /> });
      if (entity.last_turn_grain_prod != null) facts.push({ label: "Obilí", value: `+${entity.last_turn_grain_prod} / -${entity.last_turn_grain_cons}`, icon: <Wheat className="h-3 w-3" /> });
      if (entity.province) facts.push({ label: "Provincie", value: entity.province });
    } else if (entityType === "country") {
      if (entity.ruler_player) facts.push({ label: "Vládce", value: entity.ruler_player, icon: <Crown className="h-3 w-3" /> });
    } else if (entityType === "region") {
      if (entity.biome) facts.push({ label: "Biom", value: entity.biome });
      if (entity.owner_player) facts.push({ label: "Vlastník", value: entity.owner_player });
      if (entity.is_homeland) facts.push({ label: "Domovina", value: "Ano" });
    } else if (entityType === "province") {
      facts.push({ label: "Vlastník", value: entity.owner_player });
      const provCities = cities.filter(c => c.province_id === entityId);
      if (provCities.length > 0) facts.push({ label: "Sídla", value: String(provCities.length), icon: <Castle className="h-3 w-3" /> });
    } else if (entityType === "wonder") {
      facts.push({ label: "Éra", value: entity.era });
      facts.push({ label: "Status", value: entity.status });
      if (entity.city_name) facts.push({ label: "Město", value: entity.city_name });
      facts.push({ label: "Vlastník", value: entity.owner_player });
    } else if (entityType === "person") {
      facts.push({ label: "Profese", value: entity.person_type, icon: <Crown className="h-3 w-3" /> });
      facts.push({ label: "Narozen", value: `Rok ${entity.born_round}` });
      facts.push({ label: "Stav", value: entity.is_alive ? "Žije" : `Zemřel (rok ${entity.died_round})`, icon: <Heart className="h-3 w-3" /> });
      facts.push({ label: "Frakce", value: entity.player_name });
      if (entity.flavor_trait) facts.push({ label: "Rys", value: entity.flavor_trait });
    } else if (entityType === "event") {
      if (entity.date) facts.push({ label: "Datum", value: entity.date });
      if (entity.event_category) facts.push({ label: "Kategorie", value: entity.event_category });
      if (entity.created_turn) facts.push({ label: "Kolo", value: String(entity.created_turn) });
    }
    return facts;
  }, [entity, entityType, entityId, cities]);

  // ── Related entities ──
  const relatedEntities = useMemo(() => {
    const related: { type: string; id: string; name: string; relation: string }[] = [];
    if (!entity) return related;
    if (entityType === "country") {
      regions.filter(r => r.country_id === entityId).forEach(r =>
        related.push({ type: "region", id: r.id, name: r.name, relation: "Region" }));
    } else if (entityType === "region") {
      const country = countries.find(c => c.id === entity?.country_id);
      if (country) related.push({ type: "country", id: country.id, name: country.name, relation: "Stát" });
      provinces.filter(p => p.region_id === entityId).forEach(p =>
        related.push({ type: "province", id: p.id, name: p.name, relation: "Provincie" }));
    } else if (entityType === "province") {
      const region = regions.find(r => r.id === entity?.region_id);
      if (region) related.push({ type: "region", id: region.id, name: region.name, relation: "Region" });
      cities.filter(c => c.province_id === entityId).forEach(c =>
        related.push({ type: "city", id: c.id, name: c.name, relation: "Město" }));
    } else if (entityType === "city") {
      const province = provinces.find(p => p.id === entity?.province_id);
      if (province) related.push({ type: "province", id: province.id, name: province.name, relation: "Provincie" });
      wonders.filter(w => w.city_name === entity?.name).forEach(w =>
        related.push({ type: "wonder", id: w.id, name: w.name, relation: "Div" }));
      persons.filter(p => p.city_id === entityId).forEach(p =>
        related.push({ type: "person", id: p.id, name: p.name, relation: "Osobnost" }));
    } else if (entityType === "wonder") {
      const city = cities.find(c => c.name === entity?.city_name);
      if (city) related.push({ type: "city", id: city.id, name: city.name, relation: "Město" });
    } else if (entityType === "person") {
      const city = cities.find(c => c.id === entity?.city_id);
      if (city) related.push({ type: "city", id: city.id, name: city.name, relation: "Sídlo" });
    }
    return related;
  }, [entityType, entityId, entity, countries, regions, provinces, cities, wonders, persons]);

  // ── Chronicle excerpts with filtering ──
  const chronicleExcerpts = useMemo(() => {
    const name = entityName.toLowerCase();
    let filtered = chronicles.filter(ch => ch.text?.toLowerCase().includes(name));
    if (chronicleCatFilter !== "all") {
      filtered = filtered.filter(ch => ch.epoch_style?.toLowerCase().includes(chronicleCatFilter));
    }
    return filtered;
  }, [chronicles, entityName, chronicleCatFilter]);

  const pagedChronicles = useMemo(() => {
    const perPage = chronicleExpanded ? 20 : 5;
    return chronicleExcerpts.slice(0, (chroniclePage + 1) * perPage);
  }, [chronicleExcerpts, chroniclePage, chronicleExpanded]);

  // ── Related events ──
  const relatedEvents = useMemo(() => {
    if (entityType === "event") return [];
    const name = entityName.toLowerCase();
    return events.filter(e => e.title?.toLowerCase().includes(name) || e.description?.toLowerCase().includes(name)).slice(0, 10);
  }, [events, entityName, entityType]);

  // ── Handlers ──
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const context: any = {};
      if (entity) {
        if (entityType === "city") Object.assign(context, { level: entity.level, province: entity.province, tags: entity.tags, status: entity.status, founded_round: entity.founded_round, population: entity.population_total });
        else if (entityType === "wonder") Object.assign(context, { era: entity.era, status: entity.status, city: entity.city_name, description: entity.description });
        else if (entityType === "person") Object.assign(context, { personType: entity.person_type, flavor: entity.flavor_trait, alive: entity.is_alive, bio: entity.bio });
        else if (entityType === "region") Object.assign(context, { biome: entity.biome, description: entity.description, is_homeland: entity.is_homeland });
        else if (entityType === "event") Object.assign(context, { date: entity.date, summary: entity.summary, description: entity.description, category: entity.event_category });
      }

      const { data, error } = await supabase.functions.invoke("wiki-generate", {
        body: { entityType, entityName, entityId, sessionId, ownerPlayer: entity?.owner_player || entity?.player_name || "", context },
      });
      if (error) throw error;

      if (data?.aiDescription) {
        const existing = wikiEntries.find(w => w.entity_id === entityId && w.entity_type === entityType);
        if (existing) {
          await supabase.from("wiki_entries").update({
            summary: data.summary, ai_description: data.aiDescription,
            image_url: data.imageUrl || existing.image_url, image_prompt: data.imagePrompt,
            updated_at: new Date().toISOString(),
          }).eq("id", existing.id);
        } else {
          await supabase.from("wiki_entries").upsert({
            session_id: sessionId, entity_type: entityType, entity_id: entityId, entity_name: entityName,
            owner_player: entity?.owner_player || entity?.player_name || "",
            summary: data.summary, ai_description: data.aiDescription,
            image_url: data.imageUrl, image_prompt: data.imagePrompt, updated_at: new Date().toISOString(),
          });
        }
      }
      await onRefreshWiki();
      toast.success(`📜 Záznam „${entityName}" vytvořen!`);
    } catch (e) {
      console.error(e);
      toast.error("Generování záznamu selhalo");
    }
    setGenerating(false);
  };

  const handleSaveSaga = async () => {
    if (!sagaDraft.trim()) return;
    setSavingSaga(true);
    try {
      const nextVersion = (sagaVersions[0]?.version || 0) + 1;
      const { error } = await supabase.from("saga_versions").insert({
        session_id: sessionId, entity_type: entityType, entity_id: entityId,
        version: nextVersion, saga_text: sagaDraft.trim(),
        author_player: currentPlayerName || "unknown", source_turn: 0,
        is_ai_generated: false,
      });
      if (error) throw error;
      setSagaVersions(prev => [{ version: nextVersion, saga_text: sagaDraft.trim(), author_player: currentPlayerName, created_at: new Date().toISOString(), is_ai_generated: false }, ...prev]);
      setEditingSaga(false);
      setSagaDraft("");
      toast.success("Sága uložena!");
    } catch (e: any) {
      toast.error("Chyba: " + e.message);
    }
    setSavingSaga(false);
  };

  const handleRegenerateSaga = async () => {
    setGeneratingSaga(true);
    try {
      // Gather last 10 chronicle mentions
      const mentions = chronicleExcerpts.slice(0, 10).map(c => c.text).join("\n---\n");
      const { data, error } = await supabase.functions.invoke("wiki-generate", {
        body: {
          entityType, entityName, entityId, sessionId,
          ownerPlayer: entity?.owner_player || entity?.player_name || "",
          context: { sagaRegeneration: true, chronicleMentions: mentions, existingSaga: currentSaga?.saga_text || "" },
        },
      });
      if (error) throw error;
      const sagaText = data?.aiDescription || data?.summary || "Sága se nepodařila vygenerovat.";
      const nextVersion = (sagaVersions[0]?.version || 0) + 1;
      await supabase.from("saga_versions").insert({
        session_id: sessionId, entity_type: entityType, entity_id: entityId,
        version: nextVersion, saga_text: sagaText,
        author_player: "AI", source_turn: 0, is_ai_generated: true,
      });
      setSagaVersions(prev => [{ version: nextVersion, saga_text: sagaText, author_player: "AI", created_at: new Date().toISOString(), is_ai_generated: true }, ...prev]);
      toast.success("AI sága vygenerována!");
    } catch (e: any) {
      toast.error("Chyba: " + e.message);
    }
    setGeneratingSaga(false);
  };

  // ── Loading / Error states ──
  if (dbLoading) {
    return (
      <div className="manuscript-card flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center animate-fade-in">
          <Loader2 className="h-8 w-8 text-illuminated mx-auto mb-3 animate-spin" />
          <p className="font-display text-sm text-muted-foreground">Načítám záznam…</p>
        </div>
      </div>
    );
  }

  if (!entity && !dbLoading) {
    return (
      <div className="manuscript-card flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center max-w-xs animate-fade-in">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-3 opacity-60" />
          <h3 className="font-display text-sm font-semibold text-foreground mb-1">Záznam nenalezen</h3>
          <p className="text-xs text-muted-foreground font-body">
            Entita s ID <code className="text-[10px] bg-muted px-1 rounded">{entityId.slice(0, 8)}…</code> nebyla nalezena.
          </p>
        </div>
      </div>
    );
  }

  const showSigil = SIGIL_TYPES.has(entityType);

  return (
    <ScrollArea className="h-[calc(100vh-320px)]">
      <div className="manuscript-card overflow-hidden">
        {/* ═══ A) COVER IMAGE (21:9, clickable lightbox) ═══ */}
        {imageUrl ? (
          <div
            className="relative w-full overflow-hidden cursor-pointer group"
            style={{ aspectRatio: "21/9" }}
            onClick={() => setLightboxOpen(true)}
          >
            <img src={imageUrl} alt={entityName} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
            <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Badge variant="secondary" className="text-[9px] backdrop-blur-sm bg-background/60">
                <Eye className="h-2.5 w-2.5 mr-1" /> Zvětšit
              </Badge>
            </div>
          </div>
        ) : (
          <div className="relative w-full bg-gradient-to-br from-primary/5 via-muted/30 to-primary/10 flex items-center justify-center" style={{ aspectRatio: "21/9" }}>
            <div className="text-center opacity-40">
              {ENTITY_ICONS[entityType] || <BookOpen className="h-12 w-12" />}
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
          </div>
        )}

        {/* Lightbox modal */}
        <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none">
            {imageUrl && (
              <img src={imageUrl} alt={entityName} className="w-full h-full object-contain max-h-[90vh]" />
            )}
          </DialogContent>
        </Dialog>

        {/* ═══ B) SIGIL AVATAR + C) HEADER ═══ */}
        <div className={`relative px-5 pb-4 ${imageUrl ? "-mt-10 z-10" : "pt-5"}`}>
          <div className="flex items-end gap-4">
            {/* Sigil circle */}
            {showSigil && (
              <div className="shrink-0 -mt-8 relative">
                <div className="w-16 h-16 rounded-full border-2 border-primary/60 shadow-lg bg-card flex items-center justify-center overflow-hidden ring-2 ring-primary/20 ring-offset-2 ring-offset-card">
                  {imageUrl ? (
                    <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-primary">{ENTITY_ICONS[entityType]}</span>
                  )}
                </div>
              </div>
            )}

            <div className="flex-1 min-w-0 pt-2">
              {/* Title */}
              <h1 className="font-decorative text-xl md:text-2xl text-foreground leading-tight">{entityName}</h1>
              {/* Motto / summary */}
              {wiki?.summary && (
                <p className="text-sm font-display text-primary mt-1 italic leading-snug">„{wiki.summary}"</p>
              )}
              {/* Quick chips */}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <Badge variant="outline" className="text-[10px] font-display">{ENTITY_LABELS[entityType] || entityType}</Badge>
                {entity?.owner_player && <Badge variant="secondary" className="text-[10px]">{entity.owner_player}</Badge>}
                {entity?.player_name && !entity?.owner_player && <Badge variant="secondary" className="text-[10px]">{entity.player_name}</Badge>}
                {entity?.tags?.map((t: string) => (
                  <Badge key={t} variant="outline" className="text-[9px] text-muted-foreground">{t}</Badge>
                ))}
              </div>
            </div>

            {/* Reading mode toggle */}
            <Button variant="ghost" size="sm" onClick={() => setReadingMode(!readingMode)} className="shrink-0 text-xs">
              {readingMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        <div className="px-5 pb-5">
          {/* ═══ D) PROFILE SNAPSHOT (hidden in reading mode) ═══ */}
          {!readingMode && keyFacts.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-3 rounded-lg bg-muted/30 border border-border mb-5">
              {keyFacts.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  {f.icon && <span className="text-primary shrink-0">{f.icon}</span>}
                  <span className="text-muted-foreground font-body">{f.label}:</span>
                  <span className="font-display font-semibold text-foreground truncate">{f.value}</span>
                </div>
              ))}
            </div>
          )}

          <div className="scroll-divider my-4"><span className="text-[10px]">✦</span></div>

          {/* ═══ Encyclopedia entry ═══ */}
          <div className="mb-5">
            <h3 className="font-display text-sm font-semibold mb-2 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-illuminated" /> Encyklopedický záznam
            </h3>
            {descriptionText ? (
              <div className="prose-chronicle text-sm leading-relaxed text-foreground font-body space-y-2">
                <RichText text={descriptionText} className="whitespace-pre-wrap" />
              </div>
            ) : (
              <div className="text-center py-6 bg-muted/20 rounded-lg border border-dashed border-border">
                <Scroll className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                <p className="text-xs text-muted-foreground italic font-body mb-3">Tento záznam dosud nebyl sepsán kronikáři.</p>
                <Button size="sm" variant="outline" onClick={handleGenerate} disabled={generating}>
                  {generating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                  Zapsat do kroniky
                </Button>
              </div>
            )}
          </div>

          {/* ═══ E) SAGA SECTION (versioned, editable) ═══ */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-display text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-illuminated" /> Sága
              </h3>
              {sagaVersions.length > 1 && (
                <Select value={selectedSagaVersion} onValueChange={setSelectedSagaVersion}>
                  <SelectTrigger className="h-6 w-28 text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="latest" className="text-xs">Nejnovější</SelectItem>
                    {sagaVersions.map(v => (
                      <SelectItem key={v.version} value={String(v.version)} className="text-xs">
                        v{v.version} {v.is_ai_generated ? "🤖" : "✍"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="ml-auto flex items-center gap-1">
                {isOwner && !editingSaga && (
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => { setEditingSaga(true); setSagaDraft(currentSaga?.saga_text || ""); }}>
                    <Pencil className="h-3 w-3 mr-1" /> Upravit
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={handleRegenerateSaga} disabled={generatingSaga}>
                  {generatingSaga ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                  AI sága
                </Button>
              </div>
            </div>

            {editingSaga ? (
              <div className="space-y-2">
                <Textarea value={sagaDraft} onChange={e => setSagaDraft(e.target.value)} rows={8} className="text-sm font-body" placeholder="Napište příběh tohoto místa…" />
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setEditingSaga(false)}><X className="h-3 w-3 mr-1" /> Zrušit</Button>
                  <Button size="sm" onClick={handleSaveSaga} disabled={savingSaga}>
                    {savingSaga ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                    Uložit (nová verze)
                  </Button>
                </div>
              </div>
            ) : currentSaga ? (
              <div className="prose-chronicle text-sm leading-relaxed text-foreground font-body p-3 rounded-lg bg-muted/15 border-l-2 border-primary/30">
                <RichText text={currentSaga.saga_text} className="whitespace-pre-wrap" />
                <div className="mt-2 text-[10px] text-muted-foreground flex items-center gap-2">
                  <History className="h-3 w-3" />
                  v{currentSaga.version} · {currentSaga.is_ai_generated ? "🤖 AI" : `✍ ${currentSaga.author_player}`}
                  {currentSaga.created_at && ` · ${new Date(currentSaga.created_at).toLocaleDateString("cs")}`}
                </div>
              </div>
            ) : (
              <div className="text-center py-4 bg-muted/10 rounded-lg border border-dashed border-border">
                <p className="text-xs text-muted-foreground italic font-body">Sága dosud nebyla napsána.</p>
              </div>
            )}
          </div>

          {/* ═══ Entity-type specific sections (hidden in reading mode) ═══ */}
          {!readingMode && entityType === "event" && entity && (
            <div className="mb-5">
              {entity.description && !descriptionText?.includes(entity.description) && (
                <div className="mb-3">
                  <h3 className="font-display text-sm font-semibold mb-2">Popis události</h3>
                  <RichText text={entity.description} className="text-sm font-body leading-relaxed" />
                </div>
              )}
              {entity.participants && Array.isArray(entity.participants) && entity.participants.length > 0 && (
                <div className="mt-3">
                  <h3 className="font-display text-sm font-semibold mb-2 flex items-center gap-2">
                    <Users className="h-4 w-4 text-illuminated" /> Účastníci
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {entity.participants.map((p: any, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {typeof p === "string" ? p : p.name || JSON.stringify(p)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* City-specific: garrison, economy summary */}
          {!readingMode && entityType === "city" && entity && (
            <div className="mb-5 grid grid-cols-2 gap-2">
              {entity.vulnerability_score != null && (
                <div className="p-2 rounded bg-muted/20 border border-border/50 text-center">
                  <div className="text-[10px] text-muted-foreground">Zranitelnost</div>
                  <div className={`text-sm font-bold font-display ${entity.vulnerability_score > 50 ? "text-destructive" : "text-foreground"}`}>{entity.vulnerability_score.toFixed(0)}</div>
                </div>
              )}
              {entity.famine_turn && (
                <div className="p-2 rounded bg-destructive/10 border border-destructive/30 text-center">
                  <div className="text-[10px] text-destructive font-semibold">⚠ Hladomor</div>
                  <div className="text-sm font-bold font-display text-destructive">Deficit {entity.famine_severity}</div>
                </div>
              )}
            </div>
          )}

          {/* Person-specific: traits */}
          {!readingMode && entityType === "person" && entity?.flavor_trait && (
            <div className="mb-5">
              <h3 className="font-display text-sm font-semibold mb-2 flex items-center gap-2">
                <Zap className="h-4 w-4 text-illuminated" /> Osobnostní rysy
              </h3>
              <Badge variant="outline" className="text-xs">{entity.flavor_trait}</Badge>
            </div>
          )}

          {/* ═══ G) RELATED ENTITIES (Living Links) ═══ */}
          {!readingMode && relatedEntities.length > 0 && (
            <div className="mb-5">
              <h3 className="font-display text-sm font-semibold mb-2 flex items-center gap-2">
                <Users className="h-4 w-4 text-illuminated" /> Vazby a propojení
              </h3>
              <div className="space-y-1">
                {relatedEntities.map((rel, i) => (
                  <div key={i}
                    className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => onEntityClick(rel.type, rel.id, rel.name)}
                  >
                    <span className="text-illuminated">{ENTITY_ICONS[rel.type]}</span>
                    <span className="font-display text-xs truncate">{rel.name}</span>
                    <Badge variant="outline" className="text-[9px] ml-auto">{rel.relation}</Badge>
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ Related Events ═══ */}
          {!readingMode && relatedEvents.length > 0 && (
            <div className="mb-5">
              <h3 className="font-display text-sm font-semibold mb-2 flex items-center gap-2">
                <Swords className="h-4 w-4 text-illuminated" /> Klíčové události
              </h3>
              <div className="space-y-1.5">
                {relatedEvents.map(evt => (
                  <div key={evt.id}
                    className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => onEntityClick("event", evt.id, evt.title)}
                  >
                    <Calendar className="h-3.5 w-3.5 text-illuminated shrink-0" />
                    <span className="font-display text-xs truncate">{evt.title}</span>
                    {evt.event_category && <Badge variant="outline" className="text-[9px] ml-auto">{evt.event_category}</Badge>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ F) CHRONICLE MENTIONS (improved) ═══ */}
          {chronicleExcerpts.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h3 className="font-display text-sm font-semibold flex items-center gap-2">
                  <Scroll className="h-4 w-4 text-illuminated" /> Kronikářské zmínky
                  <Badge variant="secondary" className="text-[9px]">{chronicleExcerpts.length}</Badge>
                </h3>
                <Select value={chronicleCatFilter} onValueChange={setChronicleCatFilter}>
                  <SelectTrigger className="h-6 w-24 text-[10px] ml-auto">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHRONICLE_CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value} className="text-xs">{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setChronicleExpanded(!chronicleExpanded)}>
                  {chronicleExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>
              </div>
              <div className="space-y-2">
                {pagedChronicles.map(ch => (
                  <div key={ch.id} className="p-3 rounded-lg bg-muted/20 border-l-2 border-illuminated/30 hover:bg-muted/30 transition-colors">
                    <p className="text-xs text-foreground font-body leading-relaxed line-clamp-4">{ch.text}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      {ch.turn_from && (
                        <span className="text-[10px] text-muted-foreground">Kola {ch.turn_from}–{ch.turn_to}</span>
                      )}
                      <Badge variant="outline" className="text-[9px]">{ch.epoch_style}</Badge>
                    </div>
                  </div>
                ))}
              </div>
              {chronicleExcerpts.length > pagedChronicles.length && (
                <Button variant="ghost" size="sm" className="w-full mt-2 text-xs" onClick={() => setChroniclePage(p => p + 1)}>
                  Zobrazit další…
                </Button>
              )}
            </div>
          )}

          {/* Generate / Regenerate button */}
          {descriptionText && (
            <div className="text-right">
              <Button size="sm" variant="ghost" onClick={handleGenerate} disabled={generating} className="text-xs text-muted-foreground">
                {generating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                Přegenerovat záznam
              </Button>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
};

export default ChroWikiDetailPanel;
