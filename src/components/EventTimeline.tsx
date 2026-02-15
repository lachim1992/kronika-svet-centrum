import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { addEventResponse } from "@/hooks/useGameSession";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Clock, Sparkles, FileText } from "lucide-react";
import { toast } from "sonner";
import EventDetailModal from "@/components/EventDetailModal";

type GameEvent = Tables<"game_events">;
type EventResponse = Tables<"event_responses">;
type City = Tables<"cities">;
type WorldMemory = Tables<"world_memories">;

const EVENT_LABELS: Record<string, string> = {
  place_tile: "Položení dílku",
  found_settlement: "Založení osady",
  upgrade_city: "Upgrade města",
  raid: "Nájezd",
  repair: "Oprava území",
  battle: "Bitva",
  diplomacy: "Diplomacie",
  city_state_action: "Akce městského státu",
  trade: "Obchod",
  wonder: "Div světa",
  declaration: "Vyhlášení",
};

const TRUTH_LABELS: Record<string, { label: string; variant: "secondary" | "outline" | "destructive" }> = {
  canon: { label: "📜 Kanonické", variant: "secondary" },
  rumor: { label: "👂 Zvěst", variant: "outline" },
  propaganda: { label: "📢 Propaganda", variant: "destructive" },
};

interface EventTimelineProps {
  events: GameEvent[];
  responses: EventResponse[];
  currentPlayerName: string;
  currentTurn: number;
  cities?: City[];
  memories?: WorldMemory[];
  epochStyle?: string;
}

const EventTimeline = ({ events, responses, currentPlayerName, currentTurn, cities = [], memories = [], epochStyle = "kroniky" }: EventTimelineProps) => {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<GameEvent | null>(null);
  const [narrativeFlags, setNarrativeFlags] = useState<Record<string, boolean>>({});
  const [annotationCounts, setAnnotationCounts] = useState<Record<string, number>>({});

  const currentTurnEvents = events.filter((e) => e.turn_number === currentTurn);

  // Fetch narrative/annotation indicators for current turn events
  useEffect(() => {
    const fetchIndicators = async () => {
      const eventIds = currentTurnEvents.map(e => e.id);
      if (eventIds.length === 0) return;

      const [narRes, annRes] = await Promise.all([
        supabase.from("event_narratives").select("event_id").in("event_id", eventIds),
        supabase.from("event_annotations").select("event_id").in("event_id", eventIds),
      ]);

      const narFlags: Record<string, boolean> = {};
      narRes.data?.forEach(n => { narFlags[n.event_id] = true; });
      setNarrativeFlags(narFlags);

      const annCounts: Record<string, number> = {};
      annRes.data?.forEach(a => {
        annCounts[a.event_id] = (annCounts[a.event_id] || 0) + 1;
      });
      setAnnotationCounts(annCounts);
    };
    fetchIndicators();
  }, [currentTurnEvents.length, currentTurn]);

  const handleReply = async (eventId: string) => {
    if (!replyText.trim()) return;
    await addEventResponse(eventId, currentPlayerName, replyText.trim());
    setReplyText("");
    setReplyingTo(null);
    toast.success("Odpověď přidána");
  };

  return (
    <>
      <div className="space-y-4">
        <h2 className="text-xl font-display font-semibold flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          Události roku {currentTurn}
        </h2>

        {currentTurnEvents.length === 0 && (
          <p className="text-muted-foreground text-center py-8 italic">Zatím žádné události v tomto kole...</p>
        )}

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {currentTurnEvents.map((event) => {
            const eventResponses = responses.filter((r) => r.event_id === event.id);
            const hasNarrative = narrativeFlags[event.id];
            const noteCount = annotationCounts[event.id] || 0;

            return (
              <div
                key={event.id}
                className="p-3 rounded-lg border animate-fade-in bg-card border-border cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all"
                onClick={() => setSelectedEvent(event)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs">
                        {EVENT_LABELS[event.event_type] || event.event_type}
                      </Badge>
                      {(() => {
                        const ts = (event as any).truth_state || "canon";
                        const info = TRUTH_LABELS[ts];
                        return info && ts !== "canon" ? (
                          <Badge variant={info.variant} className="text-xs">{info.label}</Badge>
                        ) : null;
                      })()}
                      <span className="text-sm font-semibold">{event.player}</span>
                      {event.location && (
                        <span className="text-xs text-muted-foreground">📍 {event.location}</span>
                      )}
                      {/* G) Icons for narrative and notes */}
                      {hasNarrative && (
                        <span className="flex items-center" aria-label="Má AI narativ">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                        </span>
                      )}
                      {noteCount > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground" aria-label={`${noteCount} poznámek`}>
                          <FileText className="h-3.5 w-3.5" />{noteCount}
                        </span>
                      )}
                    </div>
                    {event.note && (
                      <p className="text-sm mt-1 italic text-muted-foreground">„{event.note}"</p>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); setReplyingTo(replyingTo === event.id ? null : event.id); }}
                  >
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                </div>

                {eventResponses.map((r) => (
                  <div key={r.id} className="mt-2 pl-4 border-l-2 border-primary/20 text-sm">
                    <span className="font-semibold">{r.player}:</span> {r.note}
                  </div>
                ))}

                {replyingTo === event.id && (
                  <div className="mt-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <Input
                      placeholder="Vaše odpověď..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      className="h-8 text-sm"
                      onKeyDown={(e) => e.key === "Enter" && handleReply(event.id)}
                    />
                    <Button size="sm" onClick={() => handleReply(event.id)}>
                      Odeslat
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <EventDetailModal
        event={selectedEvent}
        open={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        cities={cities}
        memories={memories}
        currentPlayerName={currentPlayerName}
        epochStyle={epochStyle}
      />
    </>
  );
};

export default EventTimeline;
