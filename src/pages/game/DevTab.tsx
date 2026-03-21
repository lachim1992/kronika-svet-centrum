import { useState } from "react";
import DevModePanel from "@/components/DevModePanel";
import DevConsolePanel from "@/components/dev/DevConsolePanel";
import ProvinceGraphPanel from "@/components/dev/ProvinceGraphPanel";
import { Wrench, SkipForward, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
  citiesCount: number;
  eventsCount: number;
  wondersCount: number;
  memoriesCount: number;
  playersCount: number;
  onRefetch: () => void;
}

const DevTab = ({
  sessionId, currentPlayerName, currentTurn, myRole,
  citiesCount, eventsCount, wondersCount, memoriesCount, playersCount,
  onRefetch,
}: Props) => {
  const [advancing, setAdvancing] = useState(false);

  const handleNextTurn = async () => {
    setAdvancing(true);
    try {
      const nextTurn = currentTurn + 1;

      // 1. World Tick — physics (population, influence, tension, rebellion)
      try {
        const { error: tickErr } = await supabase.functions.invoke("world-tick", {
          body: { sessionId, turnNumber: currentTurn },
        });
        if (tickErr) {
          // HTTP 409 = already processed, continue gracefully
          if (/already processed|409/i.test(tickErr.message || "")) {
            console.info("world-tick already processed for this turn, continuing.");
          } else {
            console.warn("world-tick warning:", tickErr.message);
          }
        }
      } catch (e: any) {
        console.warn("world-tick error (non-fatal):", e.message);
      }

      // 2. Process-tick — housekeeping (action_queue, travel_orders)
      try {
        await supabase.functions.invoke("process-tick", { body: { sessionId } });
      } catch (e: any) {
        console.warn("process-tick warning:", e.message);
      }

      // 3. Advance turn (game_sessions.current_turn + reset flags)
      const { error: updateErr } = await supabase
        .from("game_sessions")
        .update({ current_turn: nextTurn, turn_closed_p1: false, turn_closed_p2: false })
        .eq("id", sessionId);
      if (updateErr) throw updateErr;

      await supabase
        .from("game_players")
        .update({ turn_closed: false })
        .eq("session_id", sessionId);

      // 4. Process-turn — economy for ALL players (production, consumption, famine, stockpiles)
      const { data: allPlayers } = await supabase.from("game_players")
        .select("player_name").eq("session_id", sessionId);
      for (const p of (allPlayers || [])) {
        const { error: ptErr } = await supabase.functions.invoke("process-turn", {
          body: { sessionId, playerName: p.player_name },
        });
        if (ptErr) console.warn(`process-turn for ${p.player_name}:`, ptErr.message);
      }

      toast.success(`Kolo posunuto na ${nextTurn}`);
      onRefetch();
    } catch (err: any) {
      toast.error("Chyba při posunu kola: " + (err.message || "Neznámá chyba"));
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-2 mb-2">
        <Wrench className="h-5 w-5 text-primary" />
        <h1 className="font-display text-lg font-bold">Dev Tools</h1>
        <span className="text-xs text-muted-foreground ml-auto">Kolo {currentTurn}</span>
        <Button
          size="sm"
          variant="default"
          onClick={handleNextTurn}
          disabled={advancing}
          className="gap-1.5"
        >
          {advancing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SkipForward className="h-3.5 w-3.5" />}
          Next Turn
        </Button>
      </div>
      <DevModePanel
        sessionId={sessionId}
        currentPlayerName={currentPlayerName}
        myRole={myRole}
        onRefetch={onRefetch}
        citiesCount={citiesCount}
        eventsCount={eventsCount}
        wondersCount={wondersCount}
        memoriesCount={memoriesCount}
        playersCount={playersCount}
      />
      <DevConsolePanel sessionId={sessionId} currentTurn={currentTurn} />
      <ProvinceGraphPanel sessionId={sessionId} />
    </div>
  );
};

export default DevTab;
