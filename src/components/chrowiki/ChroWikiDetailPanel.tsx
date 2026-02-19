import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BookOpen, Castle, Calendar, Crown, Flag, Landmark, Loader2, MapPin,
  Mountain, Scroll, Sparkles, Swords, Compass, Shield, Users, ChevronRight, AlertTriangle,
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

// Map entity types to their DB tables and name columns
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

interface Props {
  sessionId: string;
  entityType: string;
  entityId: string;
  entityName: string;
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
  sessionId, entityType, entityId, entityName,
  countries, regions, provinces, cities, wonders, persons, events, chronicles, wikiEntries, declarations,
  onEntityClick, onRefreshWiki,
}: Props) => {
  const [generating, setGenerating] = useState(false);
  const [dbEntity, setDbEntity] = useState<any>(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbError, setDbError] = useState(false);

  // Direct DB fetch — the primary source of truth
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

  // Find entity from in-memory as fallback
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

  // Use DB entity first, fallback to in-memory
  const entity = dbEntity || memoryEntity;

  // Find wiki entry
  const wiki = useMemo(() =>
    wikiEntries.find(w =>
      (w.entity_id === entityId && w.entity_type === entityType) ||
      (w.entity_name === entityName && w.entity_type === entityType)
    ),
    [wikiEntries, entityId, entityType, entityName]
  );

  // Key facts block
  const keyFacts = useMemo(() => {
    const facts: { label: string; value: string }[] = [];
    if (!entity) return facts;

    facts.push({ label: "Typ", value: ENTITY_LABELS[entityType] || entityType });

    if (entityType === "city") {
      facts.push({ label: "Úroveň", value: entity.level || "—" });
      facts.push({ label: "Založeno", value: `Rok ${entity.founded_round}` });
      facts.push({ label: "Vlastník", value: entity.owner_player });
      if (entity.status !== "ok") facts.push({ label: "Status", value: entity.status });
      if (entity.province) facts.push({ label: "Provincie", value: entity.province });
    } else if (entityType === "wonder") {
      facts.push({ label: "Éra", value: entity.era });
      facts.push({ label: "Status", value: entity.status });
      if (entity.city_name) facts.push({ label: "Město", value: entity.city_name });
      facts.push({ label: "Vlastník", value: entity.owner_player });
    } else if (entityType === "person") {
      facts.push({ label: "Profese", value: entity.person_type });
      facts.push({ label: "Narozen", value: `Rok ${entity.born_round}` });
      facts.push({ label: "Stav", value: entity.is_alive ? "Žije" : `Zemřel (rok ${entity.died_round})` });
      facts.push({ label: "Frakce", value: entity.player_name });
    } else if (entityType === "region") {
      if (entity.biome) facts.push({ label: "Biom", value: entity.biome });
      if (entity.owner_player) facts.push({ label: "Vlastník", value: entity.owner_player });
      if (entity.is_homeland) facts.push({ label: "Domovina", value: "Ano" });
    } else if (entityType === "province") {
      facts.push({ label: "Vlastník", value: entity.owner_player });
    } else if (entityType === "country") {
      if (entity.ruler_player) facts.push({ label: "Vládce", value: entity.ruler_player });
    } else if (entityType === "event") {
      if (entity.date) facts.push({ label: "Datum", value: entity.date });
      if (entity.event_category) facts.push({ label: "Kategorie", value: entity.event_category });
      if (entity.created_turn) facts.push({ label: "Kolo", value: String(entity.created_turn) });
      if (entity.affected_players?.length > 0)
        facts.push({ label: "Účastníci", value: entity.affected_players.join(", ") });
      if (entity.status) facts.push({ label: "Status", value: entity.status });
    }

    return facts;
  }, [entity, entityType]);

  // Related entities
  const relatedEntities = useMemo(() => {
    const related: { type: string; id: string; name: string; relation: string }[] = [];
    if (!entity) return related;

    if (entityType === "country") {
      regions.filter(r => r.country_id === entityId).forEach(r =>
        related.push({ type: "region", id: r.id, name: r.name, relation: "Region" }));
    } else if (entityType === "region") {
      const country = countries.find(c => c.id === entity?.country_id);
      if (country) related.push({ type: "country", id: country.id, name: country.name, relation: "Stát" });
      else if (entity?.country_id) related.push({ type: "country", id: entity.country_id, name: "⚠ Data neúplná", relation: "Stát" });
      provinces.filter(p => p.region_id === entityId).forEach(p =>
        related.push({ type: "province", id: p.id, name: p.name, relation: "Provincie" }));
    } else if (entityType === "province") {
      const region = regions.find(r => r.id === entity?.region_id);
      if (region) related.push({ type: "region", id: region.id, name: region.name, relation: "Region" });
      else if (entity?.region_id) related.push({ type: "region", id: entity.region_id, name: "⚠ Data neúplná", relation: "Region" });
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
    } else if (entityType === "event") {
      // Show location city if present
      if (entity?.location_id) {
        const locCity = cities.find(c => c.id === entity.location_id);
        if (locCity) related.push({ type: "city", id: locCity.id, name: locCity.name, relation: "Místo" });
        else related.push({ type: "city", id: entity.location_id, name: "⚠ Data neúplná", relation: "Místo" });
      }
    }

    return related;
  }, [entityType, entityId, entity, countries, regions, provinces, cities, wonders, persons]);

  // Chronicle excerpts mentioning this entity
  const chronicleExcerpts = useMemo(() => {
    const name = entityName.toLowerCase();
    return chronicles
      .filter(ch => ch.text?.toLowerCase().includes(name))
      .slice(0, 5);
  }, [chronicles, entityName]);

  // Related events (text match)
  const relatedEvents = useMemo(() => {
    if (entityType === "event") return [];
    const name = entityName.toLowerCase();
    return events
      .filter(e => e.title?.toLowerCase().includes(name) || e.description?.toLowerCase().includes(name))
      .slice(0, 10);
  }, [events, entityName, entityType]);

  // Description text
  const descriptionText = wiki?.ai_description || entity?.ai_description || entity?.description || entity?.bio || entity?.summary || null;
  const imageUrl = wiki?.image_url || entity?.image_url || entity?.ai_image_url || null;

  // Auto-generate wiki entry
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const context: any = {};
      if (entity) {
        if (entityType === "city") Object.assign(context, { level: entity.level, province: entity.province, tags: entity.tags, status: entity.status, founded_round: entity.founded_round });
        else if (entityType === "wonder") Object.assign(context, { era: entity.era, status: entity.status, city: entity.city_name, description: entity.description });
        else if (entityType === "person") Object.assign(context, { personType: entity.person_type, flavor: entity.flavor_trait, alive: entity.is_alive, bio: entity.bio });
        else if (entityType === "region") Object.assign(context, { biome: entity.biome, description: entity.description, is_homeland: entity.is_homeland });
        else if (entityType === "event") Object.assign(context, { date: entity.date, summary: entity.summary, description: entity.description, category: entity.event_category, participants: entity.participants, affected_players: entity.affected_players });
      }

      const { data, error } = await supabase.functions.invoke("wiki-generate", {
        body: { entityType, entityName, entityId, sessionId, ownerPlayer: entity?.owner_player || entity?.player_name || "", context },
      });
      if (error) throw error;

      if (data?.aiDescription) {
        const existing = wikiEntries.find(w => w.entity_id === entityId && w.entity_type === entityType);
        if (existing) {
          await supabase.from("wiki_entries").update({
            summary: data.summary,
            ai_description: data.aiDescription,
            image_url: data.imageUrl || existing.image_url,
            image_prompt: data.imagePrompt,
            updated_at: new Date().toISOString(),
          }).eq("id", existing.id);
        } else {
          await supabase.from("wiki_entries").upsert({
            session_id: sessionId,
            entity_type: entityType,
            entity_id: entityId,
            entity_name: entityName,
            owner_player: entity?.owner_player || entity?.player_name || "",
            summary: data.summary,
            ai_description: data.aiDescription,
            image_url: data.imageUrl,
            image_prompt: data.imagePrompt,
            updated_at: new Date().toISOString(),
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

  // Loading state
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

  // Entity not in DB at all
  if (!entity && !dbLoading) {
    return (
      <div className="manuscript-card flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center max-w-xs animate-fade-in">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-3 opacity-60" />
          <h3 className="font-display text-sm font-semibold text-foreground mb-1">Záznam nenalezen</h3>
          <p className="text-xs text-muted-foreground font-body">
            Entita s ID <code className="text-[10px] bg-muted px-1 rounded">{entityId.slice(0, 8)}…</code> nebyla nalezena v databázi.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-320px)]">
      <div className="manuscript-card overflow-hidden">
        {/* Hero Image */}
        {imageUrl && (
          <div className="relative h-48 w-full overflow-hidden">
            <img src={imageUrl} alt={entityName} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
          </div>
        )}

        {/* Header */}
        <div className={`p-5 ${imageUrl ? "-mt-12 relative z-10" : ""}`}>
          <div className="flex items-start gap-3 mb-4">
            <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-illuminated">
              {ENTITY_ICONS[entityType] || <BookOpen className="h-5 w-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-decorative text-xl text-foreground leading-tight">{entityName}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className="text-[10px] font-display">{ENTITY_LABELS[entityType] || entityType}</Badge>
                {entity?.owner_player && <Badge variant="secondary" className="text-[10px]">{entity.owner_player}</Badge>}
                {entity?.player_name && !entity?.owner_player && <Badge variant="secondary" className="text-[10px]">{entity.player_name}</Badge>}
              </div>
              {wiki?.summary && (
                <p className="text-sm font-display text-primary mt-2 italic">„{wiki.summary}"</p>
              )}
            </div>
          </div>

          {/* Key Facts */}
          {keyFacts.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-3 rounded-lg bg-muted/30 border border-border mb-5">
              {keyFacts.map((f, i) => (
                <div key={i} className="text-xs">
                  <span className="text-muted-foreground font-body">{f.label}: </span>
                  <span className="font-display font-semibold text-foreground">{f.value}</span>
                </div>
              ))}
            </div>
          )}

          <div className="scroll-divider my-4"><span className="text-[10px]">✦</span></div>

          {/* Description / Article */}
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
                <p className="text-xs text-muted-foreground italic font-body mb-3">
                  Tento záznam dosud nebyl sepsán kronikáři.
                </p>
                <Button size="sm" variant="outline" onClick={handleGenerate} disabled={generating}>
                  {generating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                  Zapsat do kroniky
                </Button>
              </div>
            )}
          </div>

          {/* Event-specific full content */}
          {entityType === "event" && entity && (
            <div className="mb-5">
              {entity.description && !descriptionText?.includes(entity.description) && (
                <div className="mb-3">
                  <h3 className="font-display text-sm font-semibold mb-2">Popis události</h3>
                  <RichText text={entity.description} className="text-sm font-body leading-relaxed" />
                </div>
              )}
              {entity.summary && entity.summary !== entity.description && !descriptionText?.includes(entity.summary) && (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-xs font-body italic">{entity.summary}</p>
                </div>
              )}
              {/* Participants JSON */}
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

          {/* Related Entities */}
          {relatedEntities.length > 0 && (
            <div className="mb-5">
              <h3 className="font-display text-sm font-semibold mb-2 flex items-center gap-2">
                <Users className="h-4 w-4 text-illuminated" /> Propojené záznamy
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

          {/* Related Events */}
          {relatedEvents.length > 0 && (
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

          {/* Chronicle Excerpts */}
          {chronicleExcerpts.length > 0 && (
            <div className="mb-5">
              <h3 className="font-display text-sm font-semibold mb-2 flex items-center gap-2">
                <Scroll className="h-4 w-4 text-illuminated" /> Zmínky v kronice
              </h3>
              <div className="space-y-2">
                {chronicleExcerpts.map(ch => (
                  <div key={ch.id} className="p-3 rounded-lg bg-muted/20 border-l-2 border-illuminated/30">
                    <p className="text-xs text-foreground font-body leading-relaxed line-clamp-4">{ch.text}</p>
                    {ch.turn_from && (
                      <span className="text-[10px] text-muted-foreground mt-1 block">Kola {ch.turn_from}–{ch.turn_to}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Generate button if wiki exists but might need refresh */}
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
