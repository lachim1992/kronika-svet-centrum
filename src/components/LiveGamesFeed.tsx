import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Zap, Trophy, AlertTriangle, MessageCircle, Send } from "lucide-react";

interface Props {
  sessionId: string;
  festivalId: string;
  currentPlayerName?: string;
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

interface ChatMessage {
  id: string;
  player_name: string;
  message: string;
  created_at: string;
}

const DRAMA_COLORS: Record<number, string> = {
  1: "text-muted-foreground",
  2: "text-foreground",
  3: "text-primary",
  4: "text-yellow-400",
  5: "text-red-400",
};

const PLAYER_COLORS = [
  "text-blue-400", "text-green-400", "text-purple-400", "text-orange-400",
  "text-pink-400", "text-cyan-400", "text-red-400", "text-yellow-400",
];

const LiveGamesFeed = ({ sessionId, festivalId, currentPlayerName }: Props) => {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [comments, setComments] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const playerColorMap = useRef(new Map<string, string>());

  const getPlayerColor = (name: string) => {
    if (!playerColorMap.current.has(name)) {
      playerColorMap.current.set(name, PLAYER_COLORS[playerColorMap.current.size % PLAYER_COLORS.length]);
    }
    return playerColorMap.current.get(name)!;
  };

  const fetchEntries = useCallback(async () => {
    const [{ data: feed }, { data: chat }] = await Promise.all([
      supabase.from("games_live_feed")
        .select("*").eq("festival_id", festivalId)
        .order("sequence_num", { ascending: true }),
      supabase.from("games_comments")
        .select("*").eq("festival_id", festivalId)
        .order("created_at", { ascending: true }),
    ]);
    setEntries((feed || []) as any);
    setComments((chat || []) as any);
    setLoading(false);
  }, [festivalId]);

  useEffect(() => {
    fetchEntries();

    const channel = supabase
      .channel(`live-feed-${festivalId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "games_live_feed",
        filter: `festival_id=eq.${festivalId}`,
      }, (payload) => {
        setEntries(prev => [...prev, payload.new as FeedEntry]);
      })
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "games_comments",
        filter: `festival_id=eq.${festivalId}`,
      }, (payload) => {
        setComments(prev => [...prev, payload.new as ChatMessage]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [festivalId, fetchEntries]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [entries.length]);

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [comments.length]);

  const handleSend = async () => {
    if (!newMessage.trim() || !currentPlayerName || sending) return;
    setSending(true);
    await supabase.from("games_comments").insert({
      session_id: sessionId,
      festival_id: festivalId,
      player_name: currentPlayerName,
      message: newMessage.trim(),
    });
    setNewMessage("");
    setSending(false);
  };

  if (loading) return <p className="text-xs text-muted-foreground text-center p-4">Načítám feed…</p>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
      {/* Live Feed - 3 columns */}
      <Card className="border-primary/20 bg-card/50 md:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Živý průběh her
            <Badge variant="outline" className="text-[8px] ml-auto">{entries.length} záznamů</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Průběh her zatím nebyl zaznamenán.</p>
          ) : (
            <ScrollArea className="h-72" ref={scrollRef as any}>
              <div className="space-y-1.5 pr-3">
                {entries.map((entry) => (
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
                        <div className="flex items-center gap-1 p-1 rounded bg-destructive/10 border border-destructive/20">
                          <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
                          <span className="text-[10px] text-destructive">{entry.text}</span>
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
                        <p className="text-[10px] font-display font-semibold text-destructive">💀 {entry.text}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Chat - 2 columns */}
      <Card className="border-border bg-card/50 md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
            Tribuna
            <Badge variant="outline" className="text-[8px] ml-auto">{comments.length}</Badge>
            <Button variant="ghost" size="sm" className="ml-1 h-5 w-5 p-0" onClick={() => setShowChat(!showChat)}>
              <MessageCircle className="h-3 w-3" />
            </Button>
          </CardTitle>
        </CardHeader>
        {showChat && (
          <CardContent className="space-y-2">
            <ScrollArea className="h-56" ref={chatScrollRef as any}>
              <div className="space-y-1.5 pr-2">
                {comments.length === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center py-4">Tribuna je zatím tichá…</p>
                )}
                {comments.map((msg) => (
                  <div key={msg.id} className="flex gap-1.5 items-start">
                    <span className={`text-[9px] font-bold shrink-0 ${getPlayerColor(msg.player_name)}`}>
                      {msg.player_name}:
                    </span>
                    <span className="text-[10px] text-foreground/90 leading-snug">{msg.message}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
            {currentPlayerName && (
              <div className="flex gap-1.5">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Komentuj hry…"
                  className="h-7 text-xs bg-background/50"
                  maxLength={200}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 shrink-0"
                  onClick={handleSend}
                  disabled={sending || !newMessage.trim()}
                >
                  <Send className="h-3 w-3" />
                </Button>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
};

export default LiveGamesFeed;
