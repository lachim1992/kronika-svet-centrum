import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, Send } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Comment {
  id: string;
  player_name: string;
  comment_text: string;
  created_at: string;
}

interface Props {
  sessionId: string;
  targetType: "rumor" | "event";
  targetId: string;
  playerName: string;
  currentTurn: number;
  playerColors: Record<string, string>;
}

const FeedComments = ({ sessionId, targetType, targetId, playerName, currentTurn, playerColors }: Props) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchComments = useCallback(async () => {
    const { data } = await supabase
      .from("feed_comments")
      .select("id, player_name, comment_text, created_at")
      .eq("session_id", sessionId)
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .order("created_at", { ascending: true })
      .limit(50);
    if (data) setComments(data as Comment[]);
  }, [sessionId, targetType, targetId]);

  useEffect(() => {
    if (open) fetchComments();
  }, [open, fetchComments]);

  useEffect(() => {
    if (!open) return;
    const channel = supabase
      .channel(`comments-${targetId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "feed_comments",
        filter: `target_id=eq.${targetId}`,
      }, (payload) => {
        setComments(prev => [...prev, payload.new as Comment]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [targetId, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");
    await supabase.from("feed_comments").insert({
      session_id: sessionId,
      target_type: targetType,
      target_id: targetId,
      player_name: playerName,
      comment_text: text,
      turn_number: currentTurn,
    } as any);
    setSending(false);
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mt-1">
          <MessageSquare className="h-3 w-3" />
          <span>{comments.length > 0 ? `${comments.length} komentářů` : "Komentovat"}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-primary/15">
          {comments.map(c => (
            <div key={c.id} className="text-xs">
              <span className={`font-display font-bold ${playerColors[c.player_name] || "text-foreground"}`}>
                {c.player_name}
              </span>
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

export default FeedComments;
