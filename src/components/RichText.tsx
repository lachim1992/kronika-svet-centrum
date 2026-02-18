import { useState, useCallback, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { AlertTriangle, Calendar, MapPin, Tag, Link2 } from "lucide-react";

interface EntityRef {
  type: "event" | "city" | "character" | "faction";
  id: string;
  label: string;
  confidence?: number;
  source?: "ai" | "user" | "system";
}

interface WorldEvent {
  id: string;
  title: string;
  slug: string;
  date: string | null;
  date_precision: string;
  summary: string | null;
  description: string | null;
  location_id: string | null;
  participants: any;
  tags: string[] | null;
  related_event_ids: string[] | null;
}

interface RichTextProps {
  text: string;
  onEventClick?: (eventId: string) => void;
  sessionId?: string;
  className?: string;
}

// Parse [[event:uuid|Label]] or [[city:uuid|Label]] patterns
const REF_REGEX = /\[\[(event|city|character|faction):([^\]|]+)\|([^\]]+)\]\]/g;

type TextSegment =
  | { type: "text"; value: string }
  | { type: "ref"; refType: EntityRef["type"]; refId: string; label: string };

function parseText(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  const matches = text.matchAll(REF_REGEX);
  for (const match of matches) {
    if (match.index! > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, match.index!) });
    }
    segments.push({
      type: "ref",
      refType: match[1] as EntityRef["type"],
      refId: match[2],
      label: match[3],
    });
    lastIndex = match.index! + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }

  return segments;
}

const REF_COLORS: Record<string, string> = {
  event: "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20",
  city: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/20 dark:text-emerald-400",
  character: "bg-amber-500/10 text-amber-700 border-amber-500/30 hover:bg-amber-500/20 dark:text-amber-400",
  faction: "bg-violet-500/10 text-violet-700 border-violet-500/30 hover:bg-violet-500/20 dark:text-violet-400",
};

const REF_ICONS: Record<string, string> = {
  event: "📜",
  city: "🏛️",
  character: "👤",
  faction: "⚔️",
};

function EventRefBadge({
  refType,
  refId,
  label,
  sessionId,
  onEventClick,
}: {
  refType: EntityRef["type"];
  refId: string;
  label: string;
  sessionId?: string;
  onEventClick?: (eventId: string) => void;
}) {
  const [eventData, setEventData] = useState<WorldEvent | null | "loading" | "not_found">(null);

  const handleHover = useCallback(async () => {
    if (refType !== "event" || eventData) return;
    setEventData("loading");
    const { data, error } = await supabase
      .from("world_events")
      .select("*")
      .eq("id", refId)
      .maybeSingle();
    if (error || !data) {
      setEventData("not_found");
    } else {
      setEventData(data as WorldEvent);
    }
  }, [refId, refType, eventData]);

  const colorClass = REF_COLORS[refType] || REF_COLORS.event;
  const icon = REF_ICONS[refType] || "🔗";

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-xs font-medium cursor-pointer transition-colors ${colorClass}`}
          onClick={() => onEventClick?.(refId)}
          onMouseEnter={handleHover}
          type="button"
        >
          <span>{icon}</span>
          <span>{label}</span>
          <Link2 className="h-2.5 w-2.5 opacity-50" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 p-3" side="top" align="start">
        {eventData === "loading" && (
          <p className="text-xs text-muted-foreground animate-pulse">Načítám...</p>
        )}
        {eventData === "not_found" && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            <div>
              <p className="font-semibold">Událost nenalezena</p>
              <p className="text-muted-foreground">ID: {refId}</p>
            </div>
          </div>
        )}
        {eventData && typeof eventData === "object" && "id" in eventData && (
          <div className="space-y-1.5">
            <p className="font-display font-semibold text-sm">{eventData.title}</p>
            {eventData.date && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span>{eventData.date}</span>
                {eventData.date_precision !== "exact" && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1">{eventData.date_precision}</Badge>
                )}
              </div>
            )}
            {eventData.summary && (
              <p className="text-xs text-muted-foreground line-clamp-3">{eventData.summary}</p>
            )}
            {eventData.tags && eventData.tags.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <Tag className="h-3 w-3 text-muted-foreground" />
                {eventData.tags.slice(0, 4).map(t => (
                  <Badge key={t} variant="outline" className="text-[10px] h-4 px-1">{t}</Badge>
                ))}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground mt-1">Klikněte pro detail →</p>
          </div>
        )}
        {eventData === null && refType !== "event" && (
          <div className="text-xs text-muted-foreground">
            <p className="font-semibold">{icon} {label}</p>
            <p>Typ: {refType}</p>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

const RichText = ({ text, onEventClick, sessionId, className }: RichTextProps) => {
  const segments = parseText(text);

  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          // Preserve whitespace / newlines
          return <Fragment key={i}>{seg.value}</Fragment>;
        }
        return (
          <EventRefBadge
            key={i}
            refType={seg.refType}
            refId={seg.refId}
            label={seg.label}
            sessionId={sessionId}
            onEventClick={onEventClick}
          />
        );
      })}
    </span>
  );
};

export default RichText;
