import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, Eye, ChevronDown, ChevronUp, Shield, Coins, Users, Skull, HelpCircle, Globe, MapPin, Map, Scroll, Swords, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import FeedComments from "@/components/feed/FeedComments";
import FeedReactions from "@/components/feed/FeedReactions";
import type { EntityIndex } from "@/hooks/useEntityIndex";

interface Props {
  sessionId: string;
  currentTurn: number;
  currentPlayerName: string;
  players?: string[];
  entityIndex?: EntityIndex;
  onEventClick?: (eventId: string) => void;
  onEntityClick?: (type: string, id: string) => void;
}

interface Rumor {
  id: string;
  turn_number: number;
  category: string;
  scope: string;
  confidence: number;
  bias: string;
  tone: string;
  short_text: string;
  expanded_text: string | null;
  entity_refs: {
    event_ids?: string[];
    city_ids?: string[];
    battle_ids?: string[];
    wiki_ids?: string[];
    person_ids?: string[];
  };
  is_reminder: boolean;
  reminder_of_turn: number | null;
  created_at: string;
}

interface CanonEvent {
  id: string;
  turn_number: number;
  player: string;
  event_type: string;
  note: string | null;
  location: string | null;
  importance: string;
  created_at: string;
}

// Unified feed item
interface FeedItem {
  id: string;
  type: "rumor" | "event";
  turn_number: number;
  created_at: string;
  player?: string;
  data: Rumor | CanonEvent;
}

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  war: { label: "Válka", icon: Skull, color: "text-destructive" },
  politics: { label: "Politika", icon: Shield, color: "text-royal-purple" },
  economy: { label: "Ekonomika", icon: Coins, color: "text-illuminated" },
  society: { label: "Společnost", icon: Users, color: "text-forest-green" },
  mystery: { label: "Záhada", icon: HelpCircle, color: "text-primary" },
};

const SCOPE_META: Record<string, { label: string; icon: React.ElementType }> = {
  local: { label: "Místní", icon: MapPin },
  regional: { label: "Regionální", icon: Map },
  world: { label: "Světová", icon: Globe },
};

const TONE_LABELS: Record<string, string> = {
  ominous: "🌑 Zlověstné", hopeful: "🌅 Nadějné", cynical: "😏 Cynické",
  urgent: "⚡ Naléhavé", nostalgic: "📜 Nostalgické", fearful: "😨 Strach",
  proud: "🦁 Hrdost", neutral: "📰 Zpráva",
};

const BIAS_LABELS: Record<string, string> = {
  propaganda: "Dvorní propaganda", merchant: "Kupecké řeči",
  peasant: "Selská šuškanda", spy: "Špehovo hlášení",
  noble: "Šlechtický dvůr", clergy: "Klérus",
};

const PLAYER_COLORS = ["text-amber-400", "text-cyan-400", "text-emerald-400", "text-rose-400", "text-violet-400", "text-orange-400"];

const SeptandaFeed = ({ sessionId, currentTurn, currentPlayerName, players = [], entityIndex, onEventClick, onEntityClick }: Props) => {
  const [rumors, setRumors] = useState<Rumor[]>([]);
  const [events, setEvents] = useState<CanonEvent[]>([]);
  const [eventResponses, setEventResponses] = useState<Record<string, { player: string; note: string }[]>>({});
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [playerFilter, setPlayerFilter] = useState<string>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [chronicling, setChronicling] = useState<string | null>(null);

  // Build player color map
  const allPlayers = [...new Set([...players, ...events.map(e => e.player)])];
  const playerColorMap: Record<string, string> = {};
  allPlayers.forEach((p, i) => { playerColorMap[p] = PLAYER_COLORS[i % PLAYER_COLORS.length]; });

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Fetch rumors
    let rumorQuery = supabase
      .from("rumors")
      .select("*")
      .eq("session_id", sessionId)
      .order("turn_number", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (categoryFilter !== "all") rumorQuery = rumorQuery.eq("category", categoryFilter);
    if (scopeFilter !== "all") rumorQuery = rumorQuery.eq("scope", scopeFilter);

    // Fetch canonical events
    let eventQuery = supabase
      .from("game_events")
      .select("id, turn_number, player, event_type, note, location, importance, created_at")
      .eq("session_id", sessionId)
      .eq("truth_state", "canon")
      .order("turn_number", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (playerFilter !== "all") {
      eventQuery = eventQuery.eq("player", playerFilter);
    }

    const [rumorsRes, eventsRes] = await Promise.all([rumorQuery, eventQuery]);
    const fetchedEvents = (eventsRes.data as CanonEvent[]) || [];
    setRumors((rumorsRes.data as Rumor[]) || []);
    setEvents(fetchedEvents);

    // Fetch event_responses for displayed events
    if (fetchedEvents.length > 0) {
      const eventIds = fetchedEvents.map(e => e.id);
      const { data: respData } = await supabase
        .from("event_responses")
        .select("event_id, player, note")
        .in("event_id", eventIds);
      const grouped: Record<string, { player: string; note: string }[]> = {};
      for (const r of (respData || []) as { event_id: string; player: string; note: string }[]) {
        (grouped[r.event_id] = grouped[r.event_id] || []).push({ player: r.player, note: r.note });
      }
      setEventResponses(grouped);
    } else {
      setEventResponses({});
    }

    setLoading(false);
  }, [sessionId, categoryFilter, scopeFilter, playerFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Build unified feed
  const feedItems: FeedItem[] = [
    ...rumors.map(r => ({
      id: r.id, type: "rumor" as const, turn_number: r.turn_number,
      created_at: r.created_at, data: r,
    })),
    ...events
      .filter(e => playerFilter === "all" || e.player === playerFilter)
      .map(e => ({
        id: e.id, type: "event" as const, turn_number: e.turn_number,
        created_at: e.created_at, player: e.player, data: e,
      })),
  ];

  // Group by turn
  const turnGroups = feedItems.reduce<Record<number, FeedItem[]>>((acc, item) => {
    (acc[item.turn_number] = acc[item.turn_number] || []).push(item);
    return acc;
  }, {});
  const sortedTurns = Object.keys(turnGroups).map(Number).sort((a, b) => b - a);
  // Sort items within each turn by created_at desc
  for (const turn of sortedTurns) {
    turnGroups[turn].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  const handleRefClick = (refs: Rumor["entity_refs"]) => {
    if (refs.event_ids?.length && onEventClick) { onEventClick(refs.event_ids[0]); return; }
    if (refs.city_ids?.length && onEntityClick) { onEntityClick("city", refs.city_ids[0]); return; }
    if (refs.wiki_ids?.length && onEntityClick) { onEntityClick("wiki", refs.wiki_ids[0]); return; }
    if (refs.person_ids?.length && onEntityClick) { onEntityClick("person", refs.person_ids[0]); return; }
  };

  const getRefCount = (refs: Rumor["entity_refs"]) =>
    (refs.event_ids?.length || 0) + (refs.city_ids?.length || 0) +
    (refs.battle_ids?.length || 0) + (refs.wiki_ids?.length || 0) + (refs.person_ids?.length || 0);

  const renderRumorItem = (rumor: Rumor) => {
    const cat = CATEGORY_META[rumor.category] || CATEGORY_META.society;
    const scope = SCOPE_META[rumor.scope] || SCOPE_META.local;
    const CatIcon = cat.icon;
    const ScopeIcon = scope.icon;
    const isExpanded = expandedIds.has(rumor.id);
    const refCount = getRefCount(rumor.entity_refs);

    return (
      <div className={`p-3 rounded-lg border transition-colors ${
        rumor.is_reminder
          ? "bg-muted/30 border-border/30 italic"
          : "bg-card border-border/50 hover:border-primary/30"
      }`}>
        <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-muted/50 font-display">🗣️ Zvěst</Badge>
          <CatIcon className={`h-3 w-3 ${cat.color}`} />
          <Badge variant="outline" className="text-[9px] font-display px-1.5 py-0">{cat.label}</Badge>
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 gap-0.5">
            <ScopeIcon className="h-2.5 w-2.5" />{scope.label}
          </Badge>
          {rumor.is_reminder && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground">
              📜 Připomínka (rok {rumor.reminder_of_turn})
            </Badge>
          )}
          <span className="ml-auto text-[9px] text-muted-foreground italic">
            {BIAS_LABELS[rumor.bias] || rumor.bias}
          </span>
        </div>

        <p className="text-sm leading-relaxed">{rumor.short_text}</p>

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-[9px] text-muted-foreground">{TONE_LABELS[rumor.tone] || rumor.tone}</span>
          <div className="flex items-center gap-1">
            <Eye className="h-2.5 w-2.5 text-muted-foreground" />
            <div className="w-12 h-1 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${rumor.confidence}%` }} />
            </div>
            <span className="text-[9px] text-muted-foreground">{rumor.confidence}%</span>
          </div>
          {refCount > 0 && (
            <Button size="sm" variant="ghost" className="text-[10px] h-5 px-1.5 ml-auto"
              onClick={() => handleRefClick(rumor.entity_refs)}>
              Zobrazit zdroj →
            </Button>
          )}
        </div>

        {rumor.expanded_text && (
          <Collapsible open={isExpanded} onOpenChange={() => toggleExpand(rumor.id)}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="text-[10px] h-5 px-1 mt-1 gap-0.5">
                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {isExpanded ? "Skrýt" : "Více"}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed pl-2 border-l-2 border-primary/20">
                {rumor.expanded_text}
              </p>
            </CollapsibleContent>
          </Collapsible>
        )}

        <FeedReactions sessionId={sessionId} targetType="rumor" targetId={rumor.id} playerName={currentPlayerName} />
        <FeedComments sessionId={sessionId} targetType="rumor" targetId={rumor.id}
          playerName={currentPlayerName} currentTurn={currentTurn} playerColors={playerColorMap} />
      </div>
    );
  };

  const renderEventItem = (event: CanonEvent) => {
    const pColor = playerColorMap[event.player] || "text-foreground";
    const importanceBg = event.importance === "critical" ? "border-destructive/40" :
      event.importance === "major" ? "border-illuminated/40" : "border-border/50";

    return (
      <div className={`p-3 rounded-lg border transition-colors bg-card hover:border-primary/30 ${importanceBg}`}>
        <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-primary/10 font-display border-primary/30">
            <Swords className="h-2.5 w-2.5 mr-0.5" />Událost
          </Badge>
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{event.event_type}</Badge>
          <span className={`text-[10px] font-display font-bold ${pColor}`}>{event.player}</span>
          {event.location && (
            <span className="text-[9px] text-muted-foreground ml-auto">📍 {event.location}</span>
          )}
        </div>

        <p className="text-sm leading-relaxed">{event.note || `${event.event_type} — ${event.player}`}</p>

        {/* Existing event_responses (from Events tab) */}
        {eventResponses[event.id]?.length > 0 && (
          <div className="mt-2 space-y-1 pl-2 border-l-2 border-primary/15">
            {eventResponses[event.id].map((r, i) => (
              <div key={i} className="text-xs">
                <span className={`font-display font-bold ${playerColorMap[r.player] || "text-foreground"}`}>
                  {r.player}
                </span>
                <span className="text-muted-foreground ml-1.5">{r.note}</span>
              </div>
            ))}
          </div>
        )}

        {event.importance !== "normal" && (
          <Badge variant={event.importance === "critical" ? "destructive" : "default"} className="text-[9px] mt-1">
            {event.importance === "critical" ? "⚠️ Kritické" : "📌 Důležité"}
          </Badge>
        )}

        <div className="flex items-center gap-2 mt-1.5">
          {onEventClick && (
            <Button size="sm" variant="ghost" className="text-[10px] h-5 px-1.5"
              onClick={() => onEventClick(event.id)}>
              Detail →
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-[10px] h-5 px-1.5 gap-0.5"
            disabled={chronicling === event.id}
            onClick={async () => {
              setChronicling(event.id);
              try {
                // Fetch all data for this turn to generate chronicle
                const { data: turnEvents } = await supabase
                  .from("game_events")
                  .select("*")
                  .eq("session_id", sessionId)
                  .eq("turn_number", event.turn_number)
                  .eq("truth_state", "canon");

                const eventIds = (turnEvents || []).map((e: any) => e.id);
                const [{ data: respData }, { data: commData }] = await Promise.all([
                  supabase.from("event_responses").select("*").in("event_id", eventIds),
                  supabase.from("feed_comments").select("*").eq("session_id", sessionId).eq("target_type", "event").in("target_id", eventIds),
                ]);

                const playerReactions = [
                  ...(respData || []).map((r: any) => ({ player: r.player, text: r.note, event_id: r.event_id })),
                  ...(commData || []).map((c: any) => ({ player: c.player_name, text: c.comment_text, event_id: c.target_id })),
                ];

                const { data, error } = await supabase.functions.invoke("world-chronicle-round", {
                  body: {
                    sessionId,
                    round: event.turn_number,
                    confirmedEvents: turnEvents || [],
                    annotations: [],
                    worldMemories: [],
                    playerReactions,
                  },
                });

                if (error) throw error;
                if (data?.chronicleText) {
                  await supabase.from("chronicle_entries").insert({
                    session_id: sessionId,
                    text: `📜 Rok ${event.turn_number}\n\n${data.chronicleText}`,
                    source_type: "chronicle",
                    turn_from: event.turn_number,
                    turn_to: event.turn_number,
                  });
                  toast.success(`Kronika roku ${event.turn_number} vygenerována!`);
                }
              } catch (err) {
                toast.error("Generování kroniky selhalo");
                console.error(err);
              }
              setChronicling(null);
            }}
          >
            {chronicling === event.id ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <BookOpen className="h-3 w-3" />
            )}
            Zapsat do kroniky
          </Button>
        </div>

        <FeedReactions sessionId={sessionId} targetType="event" targetId={event.id} playerName={currentPlayerName} />
        <FeedComments sessionId={sessionId} targetType="event" targetId={event.id}
          playerName={currentPlayerName} currentTurn={currentTurn} playerColors={playerColorMap} />
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Kategorie" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všechny kategorie</SelectItem>
            {Object.entries(CATEGORY_META).map(([key, meta]) => (
              <SelectItem key={key} value={key}>{meta.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={scopeFilter} onValueChange={setScopeFilter}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Rozsah" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všechny rozsahy</SelectItem>
            {Object.entries(SCOPE_META).map(([key, meta]) => (
              <SelectItem key={key} value={key}>{meta.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={playerFilter} onValueChange={setPlayerFilter}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Hráč" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všichni hráči</SelectItem>
            {allPlayers.filter(p => p && p.trim() !== "").map(p => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button size="sm" variant="ghost" onClick={fetchData} disabled={loading} className="ml-auto">
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : feedItems.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-12 text-center">
          Žádné zvěsti ani události. Pokračuj ve hře — šeptanda se začne šířit po dalším kole.
        </p>
      ) : (
        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-6">
            {sortedTurns.map(turn => (
              <div key={turn}>
                <div className="flex items-center gap-2 mb-2 sticky top-0 z-10 bg-background/90 backdrop-blur-sm py-1">
                  <span className="text-xs font-display font-bold text-primary tracking-wider uppercase">
                    Rok {turn}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] text-muted-foreground">{turnGroups[turn].length} záznamů</span>
                </div>
                <div className="space-y-2">
                  {turnGroups[turn].map(item => (
                    <div key={item.id}>
                      {item.type === "rumor"
                        ? renderRumorItem(item.data as Rumor)
                        : renderEventItem(item.data as CanonEvent)
                      }
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default SeptandaFeed;
