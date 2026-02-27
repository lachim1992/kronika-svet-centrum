import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { closeTurnForPlayer } from "@/hooks/useGameSession";
import { isElevatedRole } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, CheckCircle2, Clock, Play, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useNextTurn } from "@/hooks/useNextTurn";

interface Props {
  sessionId: string;
  currentTurn: number;
  players: any[];
  currentPlayerName: string;
  myRole: string;
  gameMode?: string;
  onRefetch: () => void;
}

const TurnProgressionPanel = ({ sessionId, currentTurn, players, currentPlayerName, myRole, gameMode, onRefetch }: Props) => {
  const isAdmin = isElevatedRole(myRole) || !myRole;
  const currentPlayer = players.find(p => p.player_name === currentPlayerName);
  const myTurnClosed = currentPlayer?.turn_closed || false;
  const allClosed = players.length > 0 && players.every(p => p.turn_closed);
  const isAIMode = gameMode === "tb_single_ai";

  const { processing, processNextTurn } = useNextTurn({
    sessionId,
    currentTurn,
    playerName: currentPlayerName,
    gameMode,
    onComplete: onRefetch,
  });

  const [turnSummaries, setTurnSummaries] = useState<any[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("turn_summaries")
        .select("*")
        .eq("session_id", sessionId)
        .order("turn_number", { ascending: false })
        .limit(10);
      if (data) setTurnSummaries(data);
    };
    fetch();
  }, [sessionId, currentTurn]);

  const handleCloseTurn = async () => {
    if (!currentPlayer) return;
    await closeTurnForPlayer(sessionId, currentPlayer.player_number);
    await supabase.from("world_action_log").insert({
      session_id: sessionId,
      player_name: currentPlayerName,
      turn_number: currentTurn,
      action_type: "other",
      description: `${currentPlayerName} uzavřel kolo ${currentTurn}`,
    });
    toast.success("Kolo uzavřeno.");
    onRefetch();
  };

  const handleAIModeTurn = async () => {
    await handleCloseTurn();
    processNextTurn();
  };

  const turnStatus = allClosed ? "waiting" : "active";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          Kolo {currentTurn}
        </h3>
        <Badge variant={turnStatus === "active" ? "default" : "secondary"} className="text-xs">
          {turnStatus === "active" ? "🟢 Aktivní" : "⏳ Čeká na Admina"}
        </Badge>
      </div>

      {/* Player status */}
      <div className="space-y-1">
        {players.map(p => (
          <div key={p.id} className="flex items-center gap-2 text-sm p-2 rounded border border-border bg-card">
            {p.turn_closed ? (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            ) : (
              <Lock className="h-4 w-4 text-muted-foreground" />
            )}
            <span className={p.turn_closed ? "text-primary font-medium" : "text-muted-foreground"}>
              {p.player_name}
            </span>
            <Badge variant={p.turn_closed ? "default" : "outline"} className="text-xs ml-auto">
              {p.turn_closed ? "Hotovo" : "Čeká"}
            </Badge>
          </div>
        ))}
      </div>

      {/* Actions */}
      {isAIMode && !myTurnClosed && (
        <Button onClick={handleAIModeTurn} disabled={processing} className="w-full font-display">
          {processing ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Zpracovávám tah...</>
          ) : (
            <><Play className="mr-2 h-4 w-4" />Ukončit kolo</>
          )}
        </Button>
      )}

      {!isAIMode && !myTurnClosed && (
        <Button onClick={handleCloseTurn} variant="outline" className="w-full font-display">
          <Lock className="mr-2 h-4 w-4" />
          Uzavřít mé kolo
        </Button>
      )}

      {!isAIMode && myTurnClosed && !allClosed && (
        <p className="text-xs text-muted-foreground italic text-center">
          Čekáme na ostatní hráče...
        </p>
      )}

      {!isAIMode && allClosed && (
        <p className="text-xs text-primary italic text-center flex items-center justify-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Všichni uzavřeli — zpracovávám další kolo…
        </p>
      )}

      {/* Recent turn summaries */}
      {turnSummaries.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            📋 Historie kol ({turnSummaries.length})
          </summary>
          <div className="mt-2 space-y-1">
            {turnSummaries.map(ts => (
              <div key={ts.id} className="text-xs p-2 rounded border border-border bg-muted/20">
                <span className="font-medium">Rok {ts.turn_number}</span>
                <span className="text-muted-foreground ml-2">
                  Uzavřel: {ts.closed_by} • {new Date(ts.closed_at || ts.created_at).toLocaleString("cs-CZ")}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

export default TurnProgressionPanel;
