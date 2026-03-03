import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, RefreshCw, MessageSquare, Send } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";

interface FeedItem {
  id: string;
  category: string;
  headline: string;
  body: string;
  importance: number;
  icon: string;
  team_name: string | null;
  player_name_ref: string | null;
  city_name: string | null;
  ai_comment: string | null;
  ai_comment_author: string | null;
  round_number: number;
  turn_number: number;
  created_at: string;
}

interface Comment {
  id: string;
  player_name: string;
  comment_text: string;
  created_at: string;
}

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  death: "border-l-red-500 bg-red-500/5",
  injury: "border-l-orange-500 bg-orange-500/5",
  match_result: "border-l-primary/50",
  top_scorer: "border-l-yellow-500 bg-yellow-500/5",
  form_streak: "border-l-green-500 bg-green-500/5",
  standings: "border-l-blue-500 bg-blue-500/5",
  training: "border-l-purple-500 bg-purple-500/5",
  association: "border-l-cyan-500",
  season_progress: "border-l-amber-500",
};

const CATEGORY_LABELS: Record<string, string> = {
  death: "Zpráva o úmrtí",
  injury: "Zranění",
  match_result: "Výsledek zápasu",
  top_scorer: "Střelci",
  form_streak: "Forma",
  standings: "Tabulka",
  training: "Trénink",
  association: "Svaz",
  season_progress: "Sezóna",
};

// Inline comment component for each feed item
const FeedItemComments = ({ sessionId, itemId, playerName, currentTurn }: {
  sessionId: string; itemId: string; playerName: string; currentTurn: number;
}) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchComments = useCallback(async () => {
    const { data } = await supabase
      .from("feed_comments")
      .select("id, player_name, comment_text, created_at")
      .eq("session_id", sessionId)
      .eq("target_type", "sphaera_feed")
      .eq("target_id", itemId)
      .order("created_at", { ascending: true })
      .limit(50);
    if (data) setComments(data as Comment[]);
  }, [sessionId, itemId]);

  useEffect(() => {
    if (open) fetchComments();
  }, [open, fetchComments]);

  useEffect(() => {
    if (!open) return;
    const channel = supabase
      .channel(`sphaera-comments-${itemId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "feed_comments",
        filter: `target_id=eq.${itemId}`,
      }, (payload) => {
        setComments(prev => [...prev, payload.new as Comment]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [itemId, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");
    await supabase.from("feed_comments").insert({
      session_id: sessionId,
      target_type: "sphaera_feed",
      target_id: itemId,
      player_name: playerName,
      comment_text: text,
      turn_number: currentTurn,
    } as any);
    setSending(false);
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mt-1.5">
          <MessageSquare className="h-3 w-3" />
          <span>{comments.length > 0 ? `${comments.length} komentářů` : "Komentovat"}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-primary/15">
          {comments.map(c => (
            <div key={c.id} className="text-xs">
              <span className="font-display font-bold text-primary/80">{c.player_name}</span>
              <span className="text-muted-foreground ml-1.5">{c.comment_text}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 mt-1">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send()}
              placeholder="Napsat komentář..."
              className="flex-1 bg-muted/30 border border-border/50 rounded px-2 py-1 text-[11px] placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
              maxLength={300}
            />
            <button
              onClick={send}
              disabled={!input.trim() || sending}
              className="h-6 w-6 rounded bg-primary/20 text-primary hover:bg-primary/30 flex items-center justify-center disabled:opacity-30"
            >
              <Send className="h-3 w-3" />
            </button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const SphaeraFeedTab = ({ sessionId, currentPlayerName, currentTurn }: Props) => {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("sphaera_feed_items")
      .select("*")
      .eq("session_id", sessionId)
      .order("importance", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);
    setItems((data || []) as any);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("sphaera-feed-generate", {
        body: { session_id: sessionId, turn_number: currentTurn },
      });
      if (error) throw error;
      toast.success(`📰 Vygenerováno ${data.itemsGenerated} zpráv`);
      await fetchFeed();
    } catch (e: any) {
      toast.error(e.message || "Chyba generování feedu");
    } finally {
      setGenerating(false);
    }
  };

  // Group items by round
  const groupedByRound = items.reduce((acc, item) => {
    const key = item.round_number || 0;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<number, FeedItem[]>);

  const sortedRounds = Object.keys(groupedByRound).map(Number).sort((a, b) => b - a);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-display font-bold flex items-center gap-1.5">
          📰 Sphaera News Feed
        </h4>
        <Button size="sm" variant="outline" className="text-xs gap-1" onClick={handleGenerate} disabled={generating}>
          {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Generovat zprávy
        </Button>
      </div>

      {items.length === 0 ? (
        <Card className="border-border bg-card/50">
          <CardContent className="p-8 text-center">
            <p className="text-sm text-muted-foreground">Žádné zprávy. Odehraj kolo a vygeneruj feed.</p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[600px]">
          <div className="space-y-4 pr-2">
            {sortedRounds.map(round => (
              <div key={round} className="space-y-2">
                {round > 0 && (
                  <div className="flex items-center gap-2 py-1">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[10px] text-muted-foreground font-display font-semibold uppercase tracking-wider">Kolo {round}</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
                {groupedByRound[round].map(item => (
                  <Card
                    key={item.id}
                    className={`border-l-4 border-border bg-card/50 transition-all hover:bg-card/80 ${CATEGORY_COLORS[item.category] || ""}`}
                  >
                    <CardContent className="p-3 space-y-1.5">
                      <div className="flex items-start gap-2">
                        <span className="text-lg shrink-0">{item.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[8px] px-1 h-4 shrink-0">
                              {CATEGORY_LABELS[item.category] || item.category}
                            </Badge>
                            {item.city_name && (
                              <span className="text-[9px] text-muted-foreground">📍 {item.city_name}</span>
                            )}
                            {item.importance >= 4 && (
                              <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[8px] px-1 h-4">BREAKING</Badge>
                            )}
                          </div>
                          <h5 className="text-xs font-display font-bold mt-1 leading-snug">{item.headline}</h5>
                          <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{item.body}</p>

                          {/* AI Comment */}
                          {item.ai_comment && (
                            <div className="mt-2 bg-primary/5 border border-primary/10 rounded p-2">
                              <div className="text-[9px] text-primary/60 font-display font-semibold mb-0.5">
                                💬 {item.ai_comment_author || "Kronikář"}
                              </div>
                              <p className="text-[11px] text-foreground/70 italic leading-relaxed">{item.ai_comment}</p>
                            </div>
                          )}

                          {/* Comments */}
                          <FeedItemComments
                            sessionId={sessionId}
                            itemId={item.id}
                            playerName={currentPlayerName}
                            currentTurn={currentTurn}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default SphaeraFeedTab;
