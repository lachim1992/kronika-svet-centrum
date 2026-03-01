import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Zap, Trophy, AlertTriangle } from "lucide-react";

interface Props {
  sessionId: string;
  festivalId: string;
}

interface FeedEntry {
  id: string;
  sequence_num: number;
  feed_type: string;
  text: string;
  roll_value: number | null;
  drama_level: number;
  created_at: string;
}

const DRAMA_COLORS: Record<number, string> = {
  1: "text-muted-foreground",
  2: "text-foreground",
  3: "text-primary",
  4: "text-yellow-400",
  5: "text-red-400",
};

const LiveGamesFeed = ({ sessionId, festivalId }: Props) => {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchEntries = useCallback(async () => {
    const { data } = await supabase.from("games_live_feed")
      .select("*")
      .eq("festival_id", festivalId)
      .order("sequence_num", { ascending: true });
    setEntries((data || []) as any);
    setLoading(false);
  }, [festivalId]);

  useEffect(() => {
    fetchEntries();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`live-feed-${festivalId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "games_live_feed",
        filter: `festival_id=eq.${festivalId}`,
      }, (payload) => {
        setEntries(prev => [...prev, payload.new as FeedEntry]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [festivalId, fetchEntries]);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  if (loading) return <p className="text-xs text-muted-foreground text-center p-4">Načítám feed…</p>;
  if (entries.length === 0) return <p className="text-xs text-muted-foreground text-center p-4">Průběh her zatím nebyl zaznamenán.</p>;

  return (
    <Card className="border-primary/20 bg-card/50">
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-sm flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Živý průběh her
          <Badge variant="outline" className="text-[8px] ml-auto">{entries.length} záznamů</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64" ref={scrollRef as any}>
          <div className="space-y-1.5 pr-3">
            {entries.map((entry, idx) => (
              <div key={entry.id} className="flex gap-2 items-start">
                <span className="text-[8px] font-mono text-muted-foreground w-5 shrink-0 pt-0.5">{entry.sequence_num}</span>
                <div className="flex-1">
                  {entry.feed_type === "discipline_start" && (
                    <div className="flex items-center gap-1 mt-1 mb-0.5">
                      <Trophy className="h-3 w-3 text-primary" />
                      <span className="text-[10px] font-display font-semibold text-primary">{entry.text}</span>
                    </div>
                  )}
                  {entry.feed_type === "incident" && (
                    <div className="flex items-center gap-1 p-1 rounded bg-red-500/10 border border-red-500/20">
                      <AlertTriangle className="h-3 w-3 text-red-400 shrink-0" />
                      <span className="text-[10px] text-red-400">{entry.text}</span>
                    </div>
                  )}
                  {entry.feed_type === "narration" && (
                    <p className={`text-[10px] leading-relaxed ${DRAMA_COLORS[entry.drama_level] || "text-foreground"}`}>
                      {entry.text}
                    </p>
                  )}
                  {entry.feed_type === "roll" && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-mono bg-muted/50 px-1.5 rounded">{entry.roll_value?.toFixed(1)}</span>
                      <span className="text-[10px] text-muted-foreground">{entry.text}</span>
                    </div>
                  )}
                  {entry.feed_type === "result" && (
                    <p className="text-[10px] font-display font-semibold text-yellow-400">🏅 {entry.text}</p>
                  )}
                  {entry.feed_type === "gladiator_death" && (
                    <p className="text-[10px] font-display font-semibold text-red-500">💀 {entry.text}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default LiveGamesFeed;
