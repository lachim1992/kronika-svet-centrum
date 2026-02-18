import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Link2, Plus, HelpCircle, Check, X, Loader2, Search, Scroll,
} from "lucide-react";
import { toast } from "sonner";

export interface DetectedEvent {
  mention: string;
  eventType: string;
  status: "linked" | "ambiguous" | "suggested";
  confidence: number;
  existingEventId?: string;
  linkedEvent?: { id: string; title: string; slug: string; date?: string };
  candidates?: string[];
  candidateDetails?: { id: string; title: string; slug: string; date?: string; summary?: string }[];
  suggestedTitle?: string;
  suggestedSlug?: string;
}

interface ReviewAction {
  index: number;
  action: "accept" | "reject" | "create" | "choose";
  chosenEventId?: string;
}

interface EventExtractorReviewProps {
  sessionId: string;
  detectedEvents: DetectedEvent[];
  sourceText: string;
  onConfirm: (references: any[], updatedText: string) => void;
  onCancel: () => void;
}

const STATUS_CONFIG = {
  linked: { label: "Propojeno", icon: Link2, color: "text-green-500" },
  suggested: { label: "Nová událost", icon: Plus, color: "text-blue-500" },
  ambiguous: { label: "Nejednoznačné", icon: HelpCircle, color: "text-yellow-500" },
};

const EventExtractorReview = ({
  sessionId, detectedEvents, sourceText, onConfirm, onCancel,
}: EventExtractorReviewProps) => {
  const [decisions, setDecisions] = useState<Record<number, ReviewAction>>({});
  const [saving, setSaving] = useState(false);

  const setDecision = (index: number, action: ReviewAction) => {
    setDecisions(prev => ({ ...prev, [index]: action }));
  };

  const handleConfirm = async () => {
    setSaving(true);
    const references: any[] = [];
    let updatedText = sourceText;

    for (let i = 0; i < detectedEvents.length; i++) {
      const evt = detectedEvents[i];
      const decision = decisions[i];

      if (decision?.action === "reject") continue;

      let eventId: string | null = null;
      let eventTitle = "";

      if (evt.status === "linked" && (!decision || decision.action === "accept")) {
        eventId = evt.existingEventId || null;
        eventTitle = evt.linkedEvent?.title || evt.mention;
      } else if (evt.status === "ambiguous" && decision?.action === "choose" && decision.chosenEventId) {
        eventId = decision.chosenEventId;
        const chosen = evt.candidateDetails?.find(c => c.id === eventId);
        eventTitle = chosen?.title || evt.mention;
      } else if (evt.status === "suggested" && (!decision || decision.action === "accept" || decision.action === "create")) {
        // Create new world_event
        const slug = evt.suggestedSlug || evt.suggestedTitle?.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || `event-${Date.now()}`;
        const { data: newEvent, error } = await supabase.from("world_events").insert({
          session_id: sessionId,
          title: evt.suggestedTitle || evt.mention,
          slug,
          tags: [evt.eventType],
        } as any).select("id, title").single();

        if (error) {
          console.error("Failed to create event:", error);
          toast.error(`Nepodařilo se vytvořit událost: ${evt.suggestedTitle}`);
          continue;
        }
        eventId = newEvent.id;
        eventTitle = newEvent.title;
        toast.success(`Vytvořena nová událost: ${eventTitle}`);
      }

      if (eventId) {
        references.push({
          type: "event",
          id: eventId,
          label: eventTitle,
          confidence: evt.confidence,
          source: "ai",
        });

        // Insert inline link into text
        const inlineLink = `[[event:${eventId}|${eventTitle}]]`;
        if (updatedText.includes(evt.mention)) {
          updatedText = updatedText.replace(evt.mention, inlineLink);
        }
      }
    }

    setSaving(false);
    onConfirm(references, updatedText);
  };

  if (detectedEvents.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center">
          <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">V textu nebyly nalezeny žádné události.</p>
          <Button variant="ghost" size="sm" onClick={onCancel} className="mt-2">Zavřít</Button>
        </CardContent>
      </Card>
    );
  }

  const linked = detectedEvents.filter(e => e.status === "linked");
  const suggested = detectedEvents.filter(e => e.status === "suggested");
  const ambiguous = detectedEvents.filter(e => e.status === "ambiguous");

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Scroll className="h-4 w-4 text-primary" />
          Detekované události v textu ({detectedEvents.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ScrollArea className="max-h-80">
          <div className="space-y-3">
            {/* Linked events */}
            {linked.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-green-600 mb-1.5 flex items-center gap-1">
                  <Link2 className="h-3 w-3" /> Propojeno s existujícími ({linked.length})
                </p>
                {linked.map((evt, idx) => {
                  const globalIdx = detectedEvents.indexOf(evt);
                  const rejected = decisions[globalIdx]?.action === "reject";
                  return (
                    <EventRow key={globalIdx} evt={evt} rejected={rejected}
                      onAccept={() => setDecision(globalIdx, { index: globalIdx, action: "accept" })}
                      onReject={() => setDecision(globalIdx, { index: globalIdx, action: "reject" })}
                    />
                  );
                })}
              </div>
            )}

            {/* Suggested events */}
            {suggested.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-blue-600 mb-1.5 flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Navrhované nové události ({suggested.length})
                </p>
                {suggested.map((evt) => {
                  const globalIdx = detectedEvents.indexOf(evt);
                  const rejected = decisions[globalIdx]?.action === "reject";
                  return (
                    <EventRow key={globalIdx} evt={evt} rejected={rejected}
                      onAccept={() => setDecision(globalIdx, { index: globalIdx, action: "create" })}
                      onReject={() => setDecision(globalIdx, { index: globalIdx, action: "reject" })}
                    />
                  );
                })}
              </div>
            )}

            {/* Ambiguous events */}
            {ambiguous.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-yellow-600 mb-1.5 flex items-center gap-1">
                  <HelpCircle className="h-3 w-3" /> Nejednoznačné ({ambiguous.length})
                </p>
                {ambiguous.map((evt) => {
                  const globalIdx = detectedEvents.indexOf(evt);
                  const rejected = decisions[globalIdx]?.action === "reject";
                  const chosen = decisions[globalIdx]?.chosenEventId;
                  return (
                    <div key={globalIdx} className="space-y-1.5">
                      <EventRow evt={evt} rejected={rejected}
                        onAccept={() => {}}
                        onReject={() => setDecision(globalIdx, { index: globalIdx, action: "reject" })}
                      />
                      {!rejected && evt.candidateDetails && (
                        <div className="ml-4 space-y-1">
                          {evt.candidateDetails.map(c => (
                            <button
                              key={c.id}
                              onClick={() => setDecision(globalIdx, { index: globalIdx, action: "choose", chosenEventId: c.id })}
                              className={`w-full text-left p-1.5 rounded text-xs border transition-colors ${
                                chosen === c.id
                                  ? "border-primary bg-primary/10"
                                  : "border-border hover:bg-muted/30"
                              }`}
                            >
                              <span className="font-medium">{c.title}</span>
                              {c.date && <span className="text-muted-foreground ml-1">({c.date})</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex gap-2 justify-end pt-2 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onCancel}>Zrušit</Button>
          <Button size="sm" onClick={handleConfirm} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
            Potvrdit propojení
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

function EventRow({
  evt, rejected, onAccept, onReject,
}: {
  evt: DetectedEvent; rejected: boolean;
  onAccept: () => void; onReject: () => void;
}) {
  const cfg = STATUS_CONFIG[evt.status];
  const Icon = cfg.icon;
  return (
    <div className={`flex items-center gap-2 p-2 rounded border text-sm transition-opacity ${
      rejected ? "opacity-40 border-muted" : "border-border"
    }`}>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${cfg.color}`} />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">
          {evt.status === "linked" ? evt.linkedEvent?.title : evt.suggestedTitle || evt.mention}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          „{evt.mention}" • {evt.eventType} • {Math.round(evt.confidence * 100)}%
        </p>
      </div>
      <div className="flex gap-1 shrink-0">
        {!rejected && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onAccept}>
            <Check className="h-3 w-3 text-green-500" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onReject}>
          <X className="h-3 w-3 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

export default EventExtractorReview;
