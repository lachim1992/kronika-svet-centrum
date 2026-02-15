import { useState } from "react";
import { confirmEvent, addEventResponse } from "@/hooks/useGameSession";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, MessageSquare, Clock } from "lucide-react";
import { toast } from "sonner";

type GameEvent = Tables<"game_events">;
type EventResponse = Tables<"event_responses">;

const EVENT_LABELS: Record<string, string> = {
  place_tile: "Položení dílku",
  found_settlement: "Založení osady",
  upgrade_city: "Upgrade města",
  raid: "Nájezd",
  repair: "Oprava území",
  battle: "Bitva",
  diplomacy: "Diplomacie",
  city_state_action: "Akce městského státu",
};

interface EventTimelineProps {
  events: GameEvent[];
  responses: EventResponse[];
  currentPlayerName: string;
}

const EventTimeline = ({ events, responses, currentPlayerName }: EventTimelineProps) => {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const handleConfirm = async (eventId: string) => {
    await confirmEvent(eventId);
    toast.success("Událost potvrzena jako oficiální dějiny");
  };

  const handleReply = async (eventId: string) => {
    if (!replyText.trim()) return;
    await addEventResponse(eventId, currentPlayerName, replyText.trim());
    setReplyText("");
    setReplyingTo(null);
    toast.success("Odpověď přidána");
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-semibold flex items-center gap-2">
        <Clock className="h-5 w-5 text-primary" />
        Časová osa
      </h2>

      {events.length === 0 && (
        <p className="text-muted-foreground text-center py-8 italic">Zatím žádné události...</p>
      )}

      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        {events.map((event) => {
          const eventResponses = responses.filter((r) => r.event_id === event.id);
          return (
            <div
              key={event.id}
              className={`p-3 rounded-lg border animate-fade-in ${
                event.confirmed ? "bg-card border-primary/30" : "bg-muted/50 border-border"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={event.confirmed ? "default" : "secondary"} className="text-xs">
                      {EVENT_LABELS[event.event_type] || event.event_type}
                    </Badge>
                    <span className="text-sm font-semibold">{event.player}</span>
                    {event.location && (
                      <span className="text-xs text-muted-foreground">📍 {event.location}</span>
                    )}
                  </div>
                  {event.note && (
                    <p className="text-sm mt-1 italic text-muted-foreground">„{event.note}"</p>
                  )}
                </div>

                <div className="flex gap-1 shrink-0">
                  {!event.confirmed && (
                    <Button size="sm" variant="ghost" onClick={() => handleConfirm(event.id)} title="Potvrdit">
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setReplyingTo(replyingTo === event.id ? null : event.id)}
                  >
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {eventResponses.map((r) => (
                <div key={r.id} className="mt-2 pl-4 border-l-2 border-primary/20 text-sm">
                  <span className="font-semibold">{r.player}:</span> {r.note}
                </div>
              ))}

              {replyingTo === event.id && (
                <div className="mt-2 flex gap-2">
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

              {event.confirmed && (
                <div className="mt-1 text-xs text-primary font-display">✓ Oficiální dějiny</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default EventTimeline;
