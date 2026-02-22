import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { closeTurnForPlayer, advanceTurn } from "@/hooks/useGameSession";
import { runWorldTick } from "@/lib/ai";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, CheckCircle2, Clock, Play, Bot, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";

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
  const isAdmin = myRole === "admin" || !myRole;
  const currentPlayer = players.find(p => p.player_name === currentPlayerName);
  const myTurnClosed = currentPlayer?.turn_closed || false;
  const allClosed = players.length > 0 && players.every(p => p.turn_closed);
  const isAIMode = gameMode === "tb_single_ai";
  const [processingAI, setProcessingAI] = useState(false);

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

    // Log to action log
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

  const processAIFactions = async () => {
    // Fetch active AI factions for this session
    const { data: aiFactions } = await supabase.from("ai_factions")
      .select("faction_name")
      .eq("session_id", sessionId)
      .eq("is_active", true);

    if (!aiFactions || aiFactions.length === 0) return 0;

    let processed = 0;
    for (const faction of aiFactions) {
      try {
        await supabase.functions.invoke("ai-faction-turn", {
          body: { sessionId, factionName: faction.faction_name },
        });
        processed++;
      } catch (e) {
        console.error(`AI faction ${faction.faction_name} error:`, e);
      }
    }
    return processed;
  };

  const handleAdminCloseTurn = async () => {
    setProcessingAI(true);

    // ===== WORLD TICK: deterministic engine first =====
    try {
      const tickResult = await runWorldTick(sessionId, currentTurn);
      if (tickResult.ok) {
        const r = tickResult.results || {};
        const growthCount = r.settlement_growth?.length || 0;
        const tensionCrises = (r.tensions || []).filter((t: any) => t.crisis_triggered).length;
        toast.info(`⚙️ World Tick: ${growthCount} měst rostlo, ${tensionCrises} krizí.`);
      } else {
        console.warn("World tick warning:", tickResult.error);
      }
    } catch (e) {
      console.error("World tick error:", e);
    }

    // ===== PROCESS TURN: resource production & stockpiles for ALL players =====
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

    // Process AI factions (if AI mode)
    if (isAIMode) {
      try {
        const aiCount = await processAIFactions();
        if (aiCount > 0) toast.info(`${aiCount} AI frakcí provedlo svůj tah.`);
      } catch (e) {
        console.error("AI faction processing error:", e);
      }
    }

    // Create turn summary record
    await supabase.from("turn_summaries").insert({
      session_id: sessionId,
      turn_number: currentTurn,
      status: "closed",
      closed_at: new Date().toISOString(),
      closed_by: currentPlayerName,
    });

    // Log
    await supabase.from("world_action_log").insert({
      session_id: sessionId,
      player_name: currentPlayerName,
      turn_number: currentTurn,
      action_type: "other",
      description: `Admin uzavřel kolo ${currentTurn} a posunul hru do roku ${currentTurn + 1}`,
    });

    // Advance turn
    await advanceTurn(sessionId, currentTurn);

    // Compress history in background (AI mode only)
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

    setProcessingAI(false);
    toast.success(`Kolo ${currentTurn} uzavřeno. Pokračujeme rokem ${currentTurn + 1}.`);
    onRefetch();
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
        <Button onClick={async () => { await handleCloseTurn(); handleAdminCloseTurn(); }} 
          disabled={processingAI} className="w-full font-display">
          {processingAI ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />AI frakce hrají...</>
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

      {!isAIMode && allClosed && isAdmin && (
        <Button onClick={handleAdminCloseTurn} disabled={processingAI} className="w-full font-display">
          {processingAI ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />AI frakce hrají...</>
          ) : (
            <><Play className="mr-2 h-4 w-4" />Uzavřít kolo a pokračovat</>
          )}
        </Button>
      )}

      {!isAIMode && allClosed && !isAdmin && (
        <p className="text-xs text-muted-foreground italic text-center">
          Čekáme na Admina...
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
