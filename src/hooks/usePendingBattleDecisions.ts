import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PendingBattleDecision {
  id: string;
  session_id: string;
  player_name: string;
  action_data: any;
  created_turn: number;
}

/**
 * Sdílený hook pro načítání pending post-battle decisions napříč panely.
 * Realtime: nové decisions přichází okamžitě.
 */
export function usePendingBattleDecisions(sessionId: string, playerName: string) {
  const [decisions, setDecisions] = useState<PendingBattleDecision[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionId || !playerName) return;
    setLoading(true);
    const { data } = await supabase
      .from("action_queue")
      .select("*")
      .eq("session_id", sessionId)
      .eq("player_name", playerName)
      .eq("action_type", "post_battle_decision")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    setDecisions((data as any) || []);
    setLoading(false);
  }, [sessionId, playerName]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: push notifications when AI battle resolves
  useEffect(() => {
    if (!sessionId || !playerName) return;
    const channel = supabase
      .channel(`pending-decisions-${sessionId}-${playerName}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "action_queue",
        filter: `session_id=eq.${sessionId}`,
      }, (payload: any) => {
        const row = payload.new || payload.old;
        if (row?.player_name === playerName && row?.action_type === "post_battle_decision") {
          refresh();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId, playerName, refresh]);

  return { decisions, loading, refresh };
}
