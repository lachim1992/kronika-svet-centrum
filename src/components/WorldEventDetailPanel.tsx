import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Calendar, MapPin, Users, Tag, Link2, BookOpen, AlertTriangle,
  Scroll, Globe, Crown, Newspaper, Plus, X, Castle, Mountain, Sparkles, Loader2, ImageIcon,
} from "lucide-react";
import RichText from "./RichText";
import { toast } from "sonner";

interface WorldEvent {
  id: string;
  session_id: string;
  title: string;
  slug: string;
  date: string | null;
  date_precision: string;
  summary: string | null;
  description: string | null;
  location_id: string | null;
  participants: any[];
  tags: string[] | null;
  related_event_ids: string[] | null;
  references: any[] | null;
  created_at: string;
  updated_at: string;
}

interface MentionRecord {
  id: string;
  title: string;
  snippet: string;
  recordType: string;
  date: string;
}

const RECORD_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  chronicle: { label: "Kronika", icon: <Scroll className="h-3.5 w-3.5" /> },
  narrative: { label: "Narativ události", icon: <BookOpen className="h-3.5 w-3.5" /> },
  wiki: { label: "Wiki", icon: <Globe className="h-3.5 w-3.5" /> },
  world_history: { label: "Dějiny světa", icon: <Globe className="h-3.5 w-3.5" /> },
  player_chronicle: { label: "Kronika hráče", icon: <Crown className="h-3.5 w-3.5" /> },
  world_feed: { label: "World Feed", icon: <Newspaper className="h-3.5 w-3.5" /> },
};

interface EventEntityLink {
  id: string;
  event_id: string;
  entity_type: string;
  entity_id: string;
  link_type: string;
}

interface WorldEventDetailPanelProps {
  eventId: string | null;
  open: boolean;
  onClose: () => void;
  onEventClick?: (eventId: string) => void;
  isAdmin?: boolean;
  sessionId?: string;
}

const WorldEventDetailPanel = ({ eventId, open, onClose, onEventClick, isAdmin, sessionId }: WorldEventDetailPanelProps) => {
  const [event, setEvent] = useState<WorldEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [mentions, setMentions] = useState<MentionRecord[]>([]);
  const [relatedEvents, setRelatedEvents] = useState<WorldEvent[]>([]);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [entityLinks, setEntityLinks] = useState<EventEntityLink[]>([]);
  const [linkEntities, setLinkEntities] = useState<{ type: string; id: string; name: string }[]>([]);
  const [showLinkSearch, setShowLinkSearch] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkCandidates, setLinkCandidates] = useState<{ type: string; id: string; name: string }[]>([]);
  const [generatingText, setGeneratingText] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);

  useEffect(() => {
    if (!eventId || !open) return;
    fetchEvent(eventId);
  }, [eventId, open]);

  const fetchEvent = async (id: string) => {
    setLoading(true);
    setNotFound(false);
    setMentions([]);
    setRelatedEvents([]);
    setLocationName(null);
    setEntityLinks([]);
    setLinkEntities([]);

    const { data, error } = await supabase
      .from("world_events")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const evt = data as WorldEvent;
    setEvent(evt);

    // Parallel fetches: location, related events, reverse lookup
    const promises: Promise<void>[] = [];

    // Location name
    if (evt.location_id) {
      promises.push(
        (async () => {
          const { data: city } = await supabase.from("cities").select("name").eq("id", evt.location_id!).maybeSingle();
          if (city) setLocationName(city.name);
        })()
      );
    }

    // Related events
    if (evt.related_event_ids && evt.related_event_ids.length > 0) {
      promises.push(
        (async () => {
          const { data: rels } = await supabase.from("world_events").select("*").in("id", evt.related_event_ids!);
          if (rels) setRelatedEvents(rels as WorldEvent[]);
        })()
      );
    }

    // Reverse lookup: find all records that reference this event in their "references" JSONB
    const refPattern = `%${id}%`;
    const searchInlinePattern = `[[event:${id}|`;

    promises.push(
      (async () => {
        const results: MentionRecord[] = [];

        // Search chronicle_entries
        const { data: chrs } = await supabase.from("chronicle_entries").select("id, text, created_at")
          .or(`text.ilike.${searchInlinePattern}%`).limit(20);
        chrs?.forEach(c => results.push({
          id: c.id, title: `Kronika`, snippet: c.text.slice(0, 120),
          recordType: "chronicle", date: c.created_at,
        }));

        // Search event_narratives
        const { data: narrs } = await supabase.from("event_narratives").select("id, narrative_text, created_at")
          .ilike("narrative_text", `%${searchInlinePattern}%`).limit(20);
        narrs?.forEach(n => results.push({
          id: n.id, title: "Narativ", snippet: n.narrative_text.slice(0, 120),
          recordType: "narrative", date: n.created_at,
        }));

        // Search wiki_entries
        const { data: wikis } = await supabase.from("wiki_entries").select("id, entity_name, ai_description, created_at")
          .ilike("ai_description", `%${searchInlinePattern}%`).limit(20);
        wikis?.forEach(w => results.push({
          id: w.id, title: w.entity_name, snippet: (w.ai_description || "").slice(0, 120),
          recordType: "wiki", date: w.created_at,
        }));

        // Search world_history_chapters
        const { data: whs } = await supabase.from("world_history_chapters").select("id, chapter_title, chapter_text, created_at")
          .ilike("chapter_text", `%${searchInlinePattern}%`).limit(20);
        whs?.forEach(w => results.push({
          id: w.id, title: w.chapter_title, snippet: w.chapter_text.slice(0, 120),
          recordType: "world_history", date: w.created_at,
        }));

        // Search player_chronicle_chapters
        const { data: pcs } = await supabase.from("player_chronicle_chapters").select("id, chapter_title, chapter_text, created_at")
          .ilike("chapter_text", `%${searchInlinePattern}%`).limit(20);
        pcs?.forEach(p => results.push({
          id: p.id, title: p.chapter_title, snippet: p.chapter_text.slice(0, 120),
          recordType: "player_chronicle", date: p.created_at,
        }));

        // Search world_feed_items
        const { data: feeds } = await supabase.from("world_feed_items").select("id, content, created_at")
          .ilike("content", `%${searchInlinePattern}%`).limit(20);
        feeds?.forEach(f => results.push({
          id: f.id, title: "Feed", snippet: f.content.slice(0, 120),
          recordType: "world_feed", date: f.created_at,
        }));

        setMentions(results);
      })()
    );

    await Promise.all(promises);

    // Fetch entity links for this event
    const { data: links } = await supabase.from("event_entity_links").select("*").eq("event_id", id);
    if (links && links.length > 0) {
      setEntityLinks(links as EventEntityLink[]);
      // Resolve entity names
      const resolved: { type: string; id: string; name: string }[] = [];
      for (const link of links) {
        let name = link.entity_id;
        if (link.entity_type === "city") {
          const { data: c } = await supabase.from("cities").select("name").eq("id", link.entity_id).maybeSingle();
          if (c) name = c.name;
        } else if (link.entity_type === "province") {
          const { data: p } = await supabase.from("provinces").select("name").eq("id", link.entity_id).maybeSingle();
          if (p) name = p.name;
        } else if (link.entity_type === "region") {
          const { data: r } = await supabase.from("regions").select("name").eq("id", link.entity_id).maybeSingle();
          if (r) name = r.name;
        }
        resolved.push({ type: link.entity_type, id: link.entity_id, name });
      }
      setLinkEntities(resolved);
    }

    setLoading(false);
  };

  const handleRelatedClick = (id: string) => {
    if (onEventClick) onEventClick(id);
    else fetchEvent(id);
  };

  return (
    <Sheet open={open} onOpenChange={o => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg p-0">
        <ScrollArea className="h-full">
          <div className="p-6 space-y-5">
            <SheetHeader>
              <SheetTitle className="font-display flex items-center gap-2">
                <Scroll className="h-5 w-5 text-primary" />
                Detail události
              </SheetTitle>
            </SheetHeader>

            {loading && <p className="text-sm text-muted-foreground animate-pulse">Načítám...</p>}

            {notFound && (
              <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <div>
                  <p className="font-semibold text-sm">Událost nenalezena</p>
                  <p className="text-xs text-muted-foreground">ID: {eventId}</p>
                </div>
              </div>
            )}

            {event && !loading && (
              <>
                {/* Title + Date */}
                <div>
                  <h2 className="text-xl font-display font-bold">{event.title}</h2>
                  <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                    {event.date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {event.date}
                        {event.date_precision !== "exact" && (
                          <Badge variant="outline" className="text-[10px] h-4 ml-0.5">{event.date_precision}</Badge>
                        )}
                      </span>
                    )}
                    {locationName && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />{locationName}
                      </span>
                    )}
                    <span className="text-xs">slug: {event.slug}</span>
                  </div>
                </div>

                {/* Tags */}
                {event.tags && event.tags.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                    {event.tags.map(t => (
                      <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                    ))}
                  </div>
                )}

                {/* Summary */}
                {event.summary && (
                  <div className="bg-muted/30 p-3 rounded-lg border border-border">
                    <p className="text-sm font-semibold mb-1">Shrnutí</p>
                    <RichText text={event.summary} onEventClick={handleRelatedClick} className="text-sm leading-relaxed" />
                  </div>
                )}

                {/* Description */}
                {event.description && (
                  <div>
                    <p className="text-sm font-semibold mb-1">Popis</p>
                    <RichText
                      text={event.description}
                      onEventClick={handleRelatedClick}
                      className="text-sm leading-relaxed whitespace-pre-wrap"
                    />
                  </div>
                )}

                {/* Participants */}
                {Array.isArray(event.participants) && event.participants.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                      <Users className="h-3.5 w-3.5" /> Účastníci
                    </p>
                    <div className="flex gap-1.5 flex-wrap">
                      {event.participants.map((p: any, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {p.label || p.name || JSON.stringify(p)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Related Events */}
                {relatedEvents.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                        <Link2 className="h-3.5 w-3.5" /> Související události ({relatedEvents.length})
                      </p>
                      <div className="space-y-1.5">
                        {relatedEvents.map(re => (
                          <button
                            key={re.id}
                            onClick={() => handleRelatedClick(re.id)}
                            className="w-full text-left p-2 rounded border border-border hover:bg-muted/30 transition-colors"
                          >
                            <p className="text-sm font-semibold">{re.title}</p>
                            {re.date && <p className="text-xs text-muted-foreground">{re.date}</p>}
                            {re.summary && <p className="text-xs text-muted-foreground line-clamp-2">{re.summary}</p>}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Mentioned In (reverse lookup) */}
                <Separator />
                <div>
                  <p className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                    <BookOpen className="h-3.5 w-3.5" /> Zmíněno v ({mentions.length})
                  </p>
                  {mentions.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      Žádné záznamy zatím neodkazují na tuto událost.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {mentions.map(m => {
                        const info = RECORD_TYPE_LABELS[m.recordType] || { label: m.recordType, icon: <BookOpen className="h-3.5 w-3.5" /> };
                        return (
                          <div key={m.id} className="p-2 rounded border border-border bg-muted/10">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
                              {info.icon}
                              <span className="font-medium">{info.label}</span>
                              <span>•</span>
                              <span>{new Date(m.date).toLocaleDateString("cs-CZ")}</span>
                            </div>
                            <p className="text-xs font-semibold">{m.title}</p>
                            <p className="text-xs text-muted-foreground line-clamp-2">{m.snippet}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Linked Entities */}
                {linkEntities.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                        <Link2 className="h-3.5 w-3.5" /> Propojená místa ({linkEntities.length})
                      </p>
                      <div className="flex gap-1.5 flex-wrap">
                        {linkEntities.map(le => (
                          <Badge key={`${le.type}-${le.id}`} variant="secondary" className="text-xs">
                            {le.type === "city" ? <MapPin className="h-3 w-3 mr-1" /> : le.type === "province" ? <Castle className="h-3 w-3 mr-1" /> : <Mountain className="h-3 w-3 mr-1" />}
                            {le.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default WorldEventDetailPanel;
