import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { advanceTurn } from "@/hooks/useGameSession";
import { runWorldTick } from "@/lib/ai";
import { toast } from "sonner";

interface UseNextTurnOptions {
  sessionId: string;
  currentTurn: number;
  playerName: string;
  gameMode?: string;
  onComplete: () => void;
}

export function useNextTurn({ sessionId, currentTurn, playerName, gameMode, onComplete }: UseNextTurnOptions) {
  const [processing, setProcessing] = useState(false);
  const isAIMode = gameMode === "tb_single_ai";

  const processNextTurn = async () => {
    if (processing) return;
    setProcessing(true);

    try {
      // 1. World Tick
      try {
        const tickResult = await runWorldTick(sessionId, currentTurn);
        if (tickResult.ok) {
          const r = tickResult.results || {};
          const growthCount = r.settlement_growth?.length || 0;
          const tensionCrises = (r.tensions || []).filter((t: any) => t.crisis_triggered).length;
          toast.info(`⚙️ World Tick: ${growthCount} měst rostlo, ${tensionCrises} krizí.`);
        }
      } catch (e) {
        console.error("World tick error:", e);
      }

      // 2. AI factions (if AI mode)
      if (isAIMode) {
        try {
          const { data: aiFactions } = await supabase.from("ai_factions")
            .select("faction_name")
            .eq("session_id", sessionId)
            .eq("is_active", true);
          let processed = 0;
          for (const faction of (aiFactions || [])) {
            try {
              await supabase.functions.invoke("ai-faction-turn", {
                body: { sessionId, factionName: faction.faction_name },
              });
              processed++;
            } catch (e) {
              console.error(`AI faction ${faction.faction_name} error:`, e);
            }
          }
          if (processed > 0) toast.info(`${processed} AI frakcí provedlo svůj tah.`);
        } catch (e) {
          console.error("AI faction processing error:", e);
        }
      }

      // 3. Turn summary record
      await supabase.from("turn_summaries").insert({
        session_id: sessionId,
        turn_number: currentTurn,
        status: "closed",
        closed_at: new Date().toISOString(),
        closed_by: playerName,
      });

      // 4. Action log
      await supabase.from("world_action_log").insert({
        session_id: sessionId,
        player_name: playerName,
        turn_number: currentTurn,
        action_type: "other",
        description: `Admin uzavřel kolo ${currentTurn} a posunul hru do roku ${currentTurn + 1}`,
      });

      // 5. Advance turn
      await advanceTurn(sessionId, currentTurn);

      // 6. Process turn for all players
      try {
        const { data: allPlayers } = await supabase.from("game_players")
          .select("player_name").eq("session_id", sessionId);
        for (const p of (allPlayers || [])) {
          const { error: ptErr } = await supabase.functions.invoke("process-turn", {
            body: { sessionId, playerName: p.player_name },
          });
          if (ptErr) console.warn(`process-turn for ${p.player_name}:`, ptErr.message);
        }
        toast.info("📦 Ekonomika všech hráčů zpracována.");
      } catch (e) {
        console.error("Process turn error:", e);
      }

      // 7. Compress history (AI mode only)
      if (isAIMode) {
        try {
          const { data: sess } = await supabase.from("game_sessions")
            .select("tier").eq("id", sessionId).single();
          await supabase.functions.invoke("ai-compress-history", {
            body: { sessionId, currentTurn: currentTurn + 1, tier: sess?.tier || "free" },
          });
        } catch (e) {
          console.error("History compression error:", e);
        }
      }

      toast.success(`Kolo ${currentTurn} uzavřeno. Pokračujeme rokem ${currentTurn + 1}.`);
    } finally {
      setProcessing(false);
      onComplete();
    }
  };

  return { processing, processNextTurn };
}
