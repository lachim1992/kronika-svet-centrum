import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Newspaper, Sparkles, Filter } from "lucide-react";
import { toast } from "sonner";

interface WorldFeedItem {
  id: string;
  session_id: string;
  turn_number: number;
  feed_type: string;
  content: string;
  linked_event_id: string | null;
  linked_city: string | null;
  importance: string;
  created_at: string;
}

interface Props {
  sessionId: string;
  currentTurn: number;
  events: any[];
  cities: any[];
  memories: any[];
  players: any[];
  epochStyle: string;
  myRole: string;
  onRefetch: () => void;
}

const FEED_TYPE_LABELS: Record<string, { label: string; emoji: string }> = {
  gossip: { label: "Šeptanda", emoji: "👂" },
  trader_report: { label: "Zpráva obchodníka", emoji: "🏪" },
  war_rumor: { label: "Válečná zvěst", emoji: "⚔️" },
  cultural: { label: "Kulturní kuriozita", emoji: "🎭" },
  verified: { label: "Ověřená zpráva", emoji: "✅" },
};

const WorldFeedPanel = ({ sessionId, currentTurn, events, cities, memories, players, epochStyle, myRole, onRefetch }: Props) => {
  const isAdmin = myRole === "admin" || !myRole;
  const [feedItems, setFeedItems] = useState<WorldFeedItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [rangeMode, setRangeMode] = useState("last_turn");
  const [customFrom, setCustomFrom] = useState("1");
  const [customTo, setCustomTo] = useState(String(currentTurn));
  const [filterTurn, setFilterTurn] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  const fetchFeed = async () => {
    let query = supabase.from("world_feed_items").select("*").eq("session_id", sessionId).order("created_at", { ascending: false });
    if (filterTurn !== null) {
      query = query.eq("turn_number", filterTurn);
    }
    const { data } = await query;
    if (data) setFeedItems(data as WorldFeedItem[]);
    setLoaded(true);
  };

  if (!loaded) fetchFeed();

  const getTurnRange = (): { from: number; to: number } => {
    switch (rangeMode) {
      case "last_turn": return { from: currentTurn - 1, to: currentTurn - 1 };
      case "last_5": return { from: Math.max(1, currentTurn - 5), to: currentTurn - 1 };
      case "custom": return { from: parseInt(customFrom) || 1, to: parseInt(customTo) || currentTurn };
      default: return { from: currentTurn - 1, to: currentTurn - 1 };
    }
  };

  const handleGenerate = async () => {
    const range = getTurnRange();
    if (range.from > range.to || range.to >= currentTurn) {
      toast.error("Neplatný rozsah kol");
      return;
    }

    // Check for existing feed items in this range
    const { data: existing } = await supabase
      .from("world_feed_items")
      .select("turn_number")
      .eq("session_id", sessionId)
      .gte("turn_number", range.from)
      .lte("turn_number", range.to);

    const existingTurns = new Set((existing || []).map(e => e.turn_number));

    setGenerating(true);
    try {
      for (let turn = range.from; turn <= range.to; turn++) {
        if (existingTurns.has(turn)) continue; // Skip already generated

        const turnEvents = events.filter(e => e.turn_number === turn && e.confirmed);
        if (turnEvents.length === 0) continue;

        // Fetch leakable annotations
        const eventIds = turnEvents.map(e => e.id);
        const { data: annotations } = await supabase
          .from("event_annotations")
          .select("*")
          .in("event_id", eventIds)
          .eq("visibility", "leakable");

        // Fetch diplomacy messages for this session
        const { data: rooms } = await supabase
          .from("diplomacy_rooms")
          .select("id")
          .eq("session_id", sessionId);
        let dipMessages: any[] = [];
        if (rooms?.length) {
          const { data: msgs } = await supabase
            .from("diplomacy_messages")
            .select("*")
            .in("room_id", rooms.map(r => r.id));
          dipMessages = msgs || [];
        }

        const { data, error } = await supabase.functions.invoke("news-rumors", {
          body: {
            round: turn,
            confirmedEvents: turnEvents,
            leakableNotes: annotations || [],
            diplomacyMessages: dipMessages,
            epochStyle,
          },
        });

        if (error) {
          console.error(error);
          continue;
        }

        if (data?.rumors?.length) {
          for (const rumor of data.rumors) {
            await supabase.from("world_feed_items").insert({
              session_id: sessionId,
              turn_number: turn,
              feed_type: rumor.type === "verified" ? "verified" : rumor.type === "propaganda" ? "war_rumor" : "gossip",
              content: rumor.text,
              linked_city: rumor.cityReference || null,
              importance: "normal",
            });
          }
        }
      }

      toast.success("📰 Feed vygenerován!");
      fetchFeed();
      onRefetch();
    } catch (err) {
      console.error(err);
      toast.error("Generování feedu selhalo");
    }
    setGenerating(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-primary" />
          📰 World Feed
        </h3>
      </div>

      {/* Admin: Generate controls */}
      {isAdmin && (
        <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-3">
          <p className="text-xs font-display text-muted-foreground">Generovat zprávy a zvěsti</p>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={rangeMode} onValueChange={setRangeMode}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last_turn">Poslední kolo</SelectItem>
                <SelectItem value="last_5">Posledních 5 kol</SelectItem>
                <SelectItem value="custom">Vlastní rozsah</SelectItem>
              </SelectContent>
            </Select>

            {rangeMode === "custom" && (
              <>
                <Input
                  type="number" min={1} max={currentTurn}
                  value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  className="w-16 h-8 text-xs" placeholder="Od"
                />
                <span className="text-xs">–</span>
                <Input
                  type="number" min={1} max={currentTurn}
                  value={customTo} onChange={e => setCustomTo(e.target.value)}
                  className="w-16 h-8 text-xs" placeholder="Do"
                />
              </>
            )}

            <Button size="sm" onClick={handleGenerate} disabled={generating} className="h-8 text-xs">
              <Sparkles className="h-3 w-3 mr-1" />
              {generating ? "Generuji..." : "Generovat"}
            </Button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-3 w-3 text-muted-foreground" />
        <Select value={filterTurn === null ? "all" : String(filterTurn)} onValueChange={v => { setFilterTurn(v === "all" ? null : parseInt(v)); setLoaded(false); }}>
          <SelectTrigger className="w-32 h-7 text-xs">
            <SelectValue placeholder="Filtr kola" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všechna kola</SelectItem>
            {Array.from({ length: currentTurn - 1 }, (_, i) => i + 1).map(t => (
              <SelectItem key={t} value={String(t)}>Rok {t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Feed Items */}
      <div className="space-y-2 max-h-[50vh] overflow-y-auto">
        {feedItems.length === 0 && (
          <p className="text-sm text-muted-foreground italic text-center py-4">
            Žádné zprávy. {isAdmin ? "Generujte feed výše." : "Admin zatím nevygeneroval feed."}
          </p>
        )}
        {feedItems.map(item => {
          const typeInfo = FEED_TYPE_LABELS[item.feed_type] || { label: item.feed_type, emoji: "📰" };
          return (
            <div key={item.id} className="p-3 rounded-lg border border-border bg-card text-sm animate-fade-in">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs">{typeInfo.emoji}</span>
                <Badge variant={item.feed_type === "verified" ? "default" : item.feed_type === "war_rumor" ? "destructive" : "outline"} className="text-xs">
                  {typeInfo.label}
                </Badge>
                <span className="text-xs text-muted-foreground">Rok {item.turn_number}</span>
                {item.linked_city && (
                  <span className="text-xs text-muted-foreground">📍 {item.linked_city}</span>
                )}
                {item.importance !== "normal" && (
                  <Badge variant={item.importance === "legendary" ? "default" : "secondary"} className="text-xs">
                    {item.importance === "legendary" ? "⭐ Legendární" : "📌 Důležité"}
                  </Badge>
                )}
              </div>
              <p className="leading-relaxed">{item.content}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WorldFeedPanel;
