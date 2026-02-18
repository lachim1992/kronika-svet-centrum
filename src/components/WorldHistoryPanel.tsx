import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe, Sparkles, BookOpen } from "lucide-react";
import { toast } from "sonner";
import RichText from "@/components/RichText";

type GameEvent = Tables<"game_events">;
type WorldMemory = Tables<"world_memories">;

interface WorldHistoryChapter {
  id: string;
  session_id: string;
  chapter_title: string;
  chapter_text: string;
  from_turn: number;
  to_turn: number;
  epoch_style: string;
  created_at: string;
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
    // Find next period to generate
    const existingMaxTurn = chapters.length > 0 ? Math.max(...chapters.map(c => c.to_turn)) : 0;
    const fromTurn = existingMaxTurn + 1;
    const toTurn = Math.min(fromTurn + size - 1, currentTurn);

    if (fromTurn > currentTurn) {
      toast.info("Celá historie je již vygenerována");
      return;
    }

    const confirmedEvents = events.filter(
      e => e.confirmed && e.turn_number >= fromTurn && e.turn_number <= toTurn && (e as any).truth_state === "canon"
    );

    if (confirmedEvents.length === 0) {
      // Use all events in range if none confirmed
      const allEvents = events.filter(e => e.turn_number >= fromTurn && e.turn_number <= toTurn);
      if (allEvents.length === 0) {
        toast.error("Žádné události v tomto období");
        return;
      }
      confirmedEvents.push(...allEvents);
    }

    const approvedMemories = memories.filter(m => m.approved).map(m => m.text);

    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("world-history", {
        body: {
          events: confirmedEvents,
          worldMemories: approvedMemories,
          epochStyle,
          fromTurn,
          toTurn,
        },
      });

      if (error) throw error;

      await supabase.from("world_history_chapters").insert({
        session_id: sessionId,
        chapter_title: data.chapterTitle,
        chapter_text: data.chapterText,
        from_turn: fromTurn,
        to_turn: toTurn,
        epoch_style: epochStyle,
      });

      toast.success(`Kapitola „${data.chapterTitle}" vygenerována!`);
      await fetchChapters();
    } catch (e) {
      console.error(e);
      toast.error("Generování selhalo");
    }
    setGenerating(false);
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
          {hasMoreToGenerate && (
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

      {chapters.length === 0 ? (
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
                <Badge variant="secondary" className="text-xs">
                  Rok {ch.from_turn}–{ch.to_turn}
                </Badge>
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
