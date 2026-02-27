import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe, Sparkles, BookOpen } from "lucide-react";
import { toast } from "sonner";
import RichText from "@/components/RichText";
import EventExtractorReview, { type DetectedEvent } from "@/components/EventExtractorReview";

type GameEvent = Tables<"game_events">;
type WorldMemory = Tables<"world_memories">;
type WorldEvent = Tables<"world_events">;

interface WorldHistoryChapter {
  id: string;
  session_id: string;
  chapter_title: string;
  chapter_text: string;
  from_turn: number;
  to_turn: number;
  epoch_style: string;
  created_at: string;
  references?: any;
}

interface AiEventMentioned {
  title: string;
  eventId?: string;
  confidence: number;
  create?: boolean;
  dateGuess?: string;
  locationGuess?: string;
  summary?: string;
  participants?: string[];
  tags?: string[];
}

interface WorldHistoryPanelProps {
  sessionId: string;
  events: GameEvent[];
  memories: WorldMemory[];
  epochStyle: string;
  currentTurn: number;
  onEventClick?: (eventId: string) => void;
}

const WorldHistoryPanel = ({ sessionId, events, memories, epochStyle, currentTurn, onEventClick }: WorldHistoryPanelProps) => {
  const [chapters, setChapters] = useState<WorldHistoryChapter[]>([]);
  const [generating, setGenerating] = useState(false);
  const [periodSize, setPeriodSize] = useState("10");
  const [pendingReview, setPendingReview] = useState<{
    chapterTitle: string;
    chapterText: string;
    eventsMentioned: AiEventMentioned[];
    fromTurn: number;
    toTurn: number;
  } | null>(null);

  useEffect(() => {
    fetchChapters();
  }, [sessionId]);

  const fetchChapters = async () => {
    const { data } = await supabase
      .from("world_history_chapters")
      .select("*")
      .eq("session_id", sessionId)
      .order("from_turn", { ascending: true });
    if (data) setChapters(data as WorldHistoryChapter[]);
  };

  const handleGenerate = async () => {
    const size = parseInt(periodSize);
    const existingMaxTurn = chapters.length > 0 ? Math.max(...chapters.map(c => c.to_turn)) : 0;
    const fromTurn = existingMaxTurn + 1;
    const toTurn = Math.min(fromTurn + size - 1, currentTurn);

    if (fromTurn > currentTurn) {
      toast.info("Celá historie je již vygenerována");
      return;
    }

    let confirmedEvents = events.filter(
      e => e.confirmed && e.turn_number >= fromTurn && e.turn_number <= toTurn && e.truth_state === "canon"
    );
    if (confirmedEvents.length === 0) {
      const allEvents = events.filter(e => e.turn_number >= fromTurn && e.turn_number <= toTurn);
      if (allEvents.length === 0) {
        toast.error("Žádné události v tomto období");
        return;
      }
      confirmedEvents = allEvents;
    }

    const approvedMemories = memories.filter(m => m.approved).map(m => m.text);

    // Fetch existing world_events to pass for deduplication
    const { data: existingWorldEvents } = await supabase
      .from("world_events")
      .select("id, title, date, summary")
      .eq("session_id", sessionId);

    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("world-history", {
        body: {
          sessionId,
          events: confirmedEvents,
          worldMemories: approvedMemories,
          epochStyle,
          fromTurn,
          toTurn,
          existingWorldEvents: existingWorldEvents || [],
        },
      });

      if (error) throw error;

      const eventsMentioned: AiEventMentioned[] = data.eventsMentioned || [];

      if (eventsMentioned.length > 0) {
        setPendingReview({
          chapterTitle: data.chapterTitle,
          chapterText: data.chapterText,
          eventsMentioned,
          fromTurn,
          toTurn,
        });
      } else {
        // No events detected, save directly
        await saveChapter(data.chapterTitle, data.chapterText, fromTurn, toTurn, []);
      }
    } catch (e) {
      console.error(e);
      toast.error("Generování selhalo");
    }
    setGenerating(false);
  };

  const saveChapter = async (title: string, text: string, fromTurn: number, toTurn: number, references: any[]) => {
    await supabase.from("world_history_chapters").insert({
      session_id: sessionId,
      chapter_title: title,
      chapter_text: text,
      from_turn: fromTurn,
      to_turn: toTurn,
      epoch_style: epochStyle,
      references: references,
    });
    toast.success(`Kapitola „${title}" vygenerována!`);
    await fetchChapters();
  };

  const handleReviewConfirm = async (references: any[], updatedText: string) => {
    if (!pendingReview) return;
    await saveChapter(pendingReview.chapterTitle, updatedText, pendingReview.fromTurn, pendingReview.toTurn, references);
    setPendingReview(null);
  };

  const handleReviewCancel = async () => {
    if (!pendingReview) return;
    // Save without event linking
    await saveChapter(pendingReview.chapterTitle, pendingReview.chapterText, pendingReview.fromTurn, pendingReview.toTurn, []);
    setPendingReview(null);
  };

  // Convert AI eventsMentioned to DetectedEvent format for the review component
  const convertToDetectedEvents = (aiEvents: AiEventMentioned[]): DetectedEvent[] => {
    return aiEvents.map(evt => {
      if (evt.eventId && !evt.create) {
        return {
          mention: evt.title,
          eventType: evt.tags?.[0] || "event",
          status: "linked" as const,
          confidence: evt.confidence,
          existingEventId: evt.eventId,
          linkedEvent: { id: evt.eventId, title: evt.title, slug: evt.title.toLowerCase().replace(/\s+/g, "-") },
        };
      }
      return {
        mention: evt.title,
        eventType: evt.tags?.[0] || "event",
        status: "suggested" as const,
        confidence: evt.confidence,
        suggestedTitle: evt.title,
        suggestedSlug: evt.title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
      };
    });
  };

  const coveredMaxTurn = chapters.length > 0 ? Math.max(...chapters.map(c => c.to_turn)) : 0;
  const hasMoreToGenerate = coveredMaxTurn < currentTurn;

  return (
    <div className="space-y-6 px-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-display font-semibold flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          🌍 Dějiny světa
        </h2>
        <div className="flex items-center gap-2">
          <Select value={periodSize} onValueChange={setPeriodSize}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5 let</SelectItem>
              <SelectItem value="10">10 let</SelectItem>
              <SelectItem value="20">20 let</SelectItem>
            </SelectContent>
          </Select>
          {hasMoreToGenerate && !pendingReview && (
            <Button size="sm" onClick={handleGenerate} disabled={generating}>
              <Sparkles className={`h-3 w-3 mr-1 ${generating ? "animate-pulse" : ""}`} />
              {generating ? "Generuji..." : `Generovat další kapitolu (rok ${coveredMaxTurn + 1}+)`}
            </Button>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Objektivní, neutrální dějiny světa. Oficiální kanonický záznam kampaně viditelný všem hráčům.
      </p>

      {/* Event review panel */}
      {pendingReview && (
        <div className="space-y-4">
          <div className="manuscript-card p-5 border-primary/40">
            <h3 className="font-display font-semibold text-lg mb-2">{pendingReview.chapterTitle}</h3>
            <RichText text={pendingReview.chapterText} onEventClick={onEventClick} className="text-sm leading-relaxed whitespace-pre-wrap mb-4" />
            <Badge variant="secondary" className="text-xs">Rok {pendingReview.fromTurn}–{pendingReview.toTurn} • Čeká na schválení událostí</Badge>
          </div>
          <EventExtractorReview
            sessionId={sessionId}
            detectedEvents={convertToDetectedEvents(pendingReview.eventsMentioned)}
            sourceText={pendingReview.chapterText}
            onConfirm={handleReviewConfirm}
            onCancel={handleReviewCancel}
          />
        </div>
      )}

      {chapters.length === 0 && !pendingReview ? (
        <div className="text-center py-12">
          <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-muted-foreground italic">Dějiny světa dosud nebyly sepsány...</p>
          <Button className="mt-4" onClick={handleGenerate} disabled={generating}>
            <Sparkles className="h-4 w-4 mr-2" /> Sepsat první kapitolu
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {chapters.map((ch) => (
            <div key={ch.id} className="manuscript-card p-5 animate-fade-in">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-semibold text-lg">{ch.chapter_title}</h3>
                <div className="flex items-center gap-2">
                  {ch.references && Array.isArray(ch.references) && (ch.references as any[]).length > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {(ch.references as any[]).length} událostí
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-xs">
                    Rok {ch.from_turn}–{ch.to_turn}
                  </Badge>
                </div>
              </div>
              <RichText text={ch.chapter_text} onEventClick={onEventClick} className="text-sm leading-relaxed whitespace-pre-wrap" />
              <div className="text-xs text-muted-foreground mt-3">
                Styl: {ch.epoch_style} • {new Date(ch.created_at).toLocaleString("cs-CZ")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorldHistoryPanel;
