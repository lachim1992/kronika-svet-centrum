import { useState, useCallback, Fragment, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Calendar, Tag, Link2 } from "lucide-react";
import type { EntityIndex, EntityEntry } from "@/hooks/useEntityIndex";

/* ───── Types ───── */

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

type EntityType = "event" | "city" | "character" | "faction" | "province" | "region" | "wonder" | "person";

export interface RichTextProps {
  text: string;
  onEventClick?: (eventId: string) => void;
  onEntityClick?: (type: string, id: string) => void;
  sessionId?: string;
  entityIndex?: EntityIndex;
  className?: string;
}

/* ───── Explicit ref parsing [[type:id|Label]] ───── */

const REF_REGEX = /\[\[(event|city|character|faction|province|region|wonder|person):([^\]|]+)\|([^\]]+)\]\]/g;

type TextSegment =
  | { type: "text"; value: string }
  | { type: "ref"; refType: EntityType; refId: string; label: string };

function parseExplicitRefs(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  const matches = text.matchAll(REF_REGEX);
  for (const match of matches) {
    if (match.index! > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, match.index!) });
    }
    segments.push({
      type: "ref",
      refType: match[1] as EntityType,
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

/* ───── Auto-detect entity mentions from index ───── */

function autoDetectEntities(text: string, index: EntityIndex): TextSegment[] {
  if (!index.ready || index.entries.length === 0) {
    return [{ type: "text", value: text }];
  }

  // Build a combined regex for all entity names (longest first, already sorted)
  // Only include names with 3+ chars to avoid false positives
  const validEntries = index.entries.filter(e => e.label.length >= 3);
  if (validEntries.length === 0) return [{ type: "text", value: text }];

  const escaped = validEntries.map(e => e.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");

  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    const matchedText = match[1];
    const entry = index.byName.get(matchedText.toLowerCase());
    if (entry) {
      segments.push({
        type: "ref",
        refType: entry.type as EntityType,
        refId: entry.id,
        label: matchedText,
      });
    } else {
      segments.push({ type: "text", value: matchedText });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }

  return segments;
}

/* ───── Combined parse: explicit refs first, then auto-detect on remaining text ───── */

function parseText(text: string, entityIndex?: EntityIndex): TextSegment[] {
  // First pass: explicit [[type:id|Label]] refs
  const explicitSegments = parseExplicitRefs(text);

  if (!entityIndex?.ready) return explicitSegments;

  // Second pass: auto-detect on text-only segments
  const result: TextSegment[] = [];
  for (const seg of explicitSegments) {
    if (seg.type === "ref") {
      result.push(seg);
    } else {
      const detected = autoDetectEntities(seg.value, entityIndex);
      result.push(...detected);
    }
  }
  return result;
}

/* ───── Style maps ───── */

const REF_COLORS: Record<string, string> = {
  event: "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20",
  city: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/20 dark:text-emerald-400",
  character: "bg-amber-500/10 text-amber-700 border-amber-500/30 hover:bg-amber-500/20 dark:text-amber-400",
  person: "bg-amber-500/10 text-amber-700 border-amber-500/30 hover:bg-amber-500/20 dark:text-amber-400",
  faction: "bg-violet-500/10 text-violet-700 border-violet-500/30 hover:bg-violet-500/20 dark:text-violet-400",
  province: "bg-teal-500/10 text-teal-700 border-teal-500/30 hover:bg-teal-500/20 dark:text-teal-400",
  region: "bg-sky-500/10 text-sky-700 border-sky-500/30 hover:bg-sky-500/20 dark:text-sky-400",
  wonder: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30 hover:bg-yellow-500/20 dark:text-yellow-400",
};

const REF_ICONS: Record<string, string> = {
  event: "📜",
  city: "🏛️",
  character: "👤",
  person: "👤",
  faction: "⚔️",
  province: "🗺️",
  region: "🌍",
  wonder: "🏛️",
};

const TYPE_LABELS: Record<string, string> = {
  event: "Událost",
  city: "Město",
  character: "Postava",
  person: "Osobnost",
  faction: "Frakce",
  province: "Provincie",
  region: "Region",
  wonder: "Div světa",
};

/* ───── Entity Badge with Hover ───── */

function EntityRefBadge({
  refType,
  refId,
  label,
  onEventClick,
  onEntityClick,
}: {
  refType: EntityType;
  refId: string;
  label: string;
  onEventClick?: (eventId: string) => void;
  onEntityClick?: (type: string, id: string) => void;
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

  const handleClick = () => {
    if (refType === "event") {
      onEventClick?.(refId);
    }
    onEntityClick?.(refType, refId);
  };

  const colorClass = REF_COLORS[refType] || REF_COLORS.event;
  const icon = REF_ICONS[refType] || "🔗";

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-xs font-medium cursor-pointer transition-colors ${colorClass}`}
          onClick={handleClick}
          onMouseEnter={handleHover}
          type="button"
        >
          <span>{icon}</span>
          <span>{label}</span>
          <Link2 className="h-2.5 w-2.5 opacity-50" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 p-3" side="top" align="start">
        {/* Event hover with full data */}
        {refType === "event" && eventData === "loading" && (
          <p className="text-xs text-muted-foreground animate-pulse">Načítám...</p>
        )}
        {refType === "event" && eventData === "not_found" && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            <div>
              <p className="font-semibold">Událost nenalezena</p>
              <p className="text-muted-foreground">ID: {refId}</p>
            </div>
          </div>
        )}
        {refType === "event" && eventData && typeof eventData === "object" && "id" in eventData && (
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
        {/* Non-event hover: simple preview */}
        {refType !== "event" && (
          <div className="text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">{icon} {label}</p>
            <p>{TYPE_LABELS[refType] || refType}</p>
            <p className="text-[10px] mt-1">Klikněte pro otevření v Kodexu →</p>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

/* ───── Main RichText Component ───── */

const RichText = ({ text, onEventClick, onEntityClick, sessionId, entityIndex, className }: RichTextProps) => {
  const segments = useMemo(() => parseText(text, entityIndex), [text, entityIndex]);

  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return <Fragment key={i}>{seg.value}</Fragment>;
        }
        return (
          <EntityRefBadge
            key={`${seg.refId}-${i}`}
            refType={seg.refType}
            refId={seg.refId}
            label={seg.label}
            onEventClick={onEventClick}
            onEntityClick={onEntityClick}
          />
        );
      })}
    </span>
  );
};

export default RichText;
