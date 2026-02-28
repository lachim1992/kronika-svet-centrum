import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const AVAILABLE_EMOJIS = ["⚔️", "👍", "😱", "🤔", "🔥", "💀"];

interface ReactionCount {
  emoji: string;
  count: number;
  myReaction: boolean;
}

interface Props {
  sessionId: string;
  targetType: "rumor" | "event";
  targetId: string;
  playerName: string;
}

const FeedReactions = ({ sessionId, targetType, targetId, playerName }: Props) => {
  const [reactions, setReactions] = useState<ReactionCount[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  const fetchReactions = useCallback(async () => {
    const { data } = await supabase
      .from("feed_reactions")
      .select("emoji, player_name")
      .eq("session_id", sessionId)
      .eq("target_type", targetType)
      .eq("target_id", targetId);

    if (data) {
      const map: Record<string, { count: number; myReaction: boolean }> = {};
      for (const r of data as { emoji: string; player_name: string }[]) {
        if (!map[r.emoji]) map[r.emoji] = { count: 0, myReaction: false };
        map[r.emoji].count++;
        if (r.player_name === playerName) map[r.emoji].myReaction = true;
      }
      setReactions(Object.entries(map).map(([emoji, v]) => ({ emoji, ...v })));
    }
  }, [sessionId, targetType, targetId, playerName]);

  useEffect(() => { fetchReactions(); }, [fetchReactions]);

  const toggleReaction = async (emoji: string) => {
    const existing = reactions.find(r => r.emoji === emoji && r.myReaction);
    if (existing) {
      await supabase
        .from("feed_reactions")
        .delete()
        .eq("session_id", sessionId)
        .eq("target_type", targetType)
        .eq("target_id", targetId)
        .eq("player_name", playerName)
        .eq("emoji", emoji);
    } else {
      await supabase.from("feed_reactions").insert({
        session_id: sessionId,
        target_type: targetType,
        target_id: targetId,
        player_name: playerName,
        emoji,
      } as any);
    }
    fetchReactions();
    setShowPicker(false);
  };

  return (
    <div className="flex items-center gap-1 flex-wrap mt-1">
      {reactions.map(r => (
        <button
          key={r.emoji}
          onClick={() => toggleReaction(r.emoji)}
          className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] border transition-colors ${
            r.myReaction
              ? "border-primary/40 bg-primary/15 text-foreground"
              : "border-border/40 bg-muted/20 text-muted-foreground hover:border-primary/30"
          }`}
        >
          <span>{r.emoji}</span>
          <span className="font-mono text-[9px]">{r.count}</span>
        </button>
      ))}
      <div className="relative">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="h-5 w-5 rounded-full border border-border/30 text-muted-foreground hover:text-foreground hover:border-primary/30 flex items-center justify-center text-[11px] transition-colors"
        >
          +
        </button>
        {showPicker && (
          <div className="absolute bottom-full left-0 mb-1 flex gap-0.5 rounded-lg border border-border bg-card p-1 shadow-lg z-20">
            {AVAILABLE_EMOJIS.map(e => (
              <button
                key={e}
                onClick={() => toggleReaction(e)}
                className="h-7 w-7 rounded hover:bg-muted flex items-center justify-center text-sm"
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FeedReactions;
