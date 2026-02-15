import { useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { generateChronicle } from "@/lib/ai";
import { addChronicleEntry, addWorldMemory, closeTurnForPlayer, advanceTurn } from "@/hooks/useGameSession";
import { Button } from "@/components/ui/button";
import { BookOpen, Sparkles, Lock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type GameEvent = Tables<"game_events">;
type WorldMemory = Tables<"world_memories">;
type ChronicleEntry = Tables<"chronicle_entries">;

interface ChronicleFeedProps {
  sessionId: string;
  events: GameEvent[];
  memories: WorldMemory[];
  chronicles: ChronicleEntry[];
  epochStyle: string;
  currentTurn: number;
  turnClosedP1: boolean;
  turnClosedP2: boolean;
  player1Name: string;
  player2Name: string;
  currentPlayerName: string;
  onRefetch?: () => void;
}

const EPOCH_LABELS: Record<string, string> = {
  myty: "Mýty",
  kroniky: "Kroniky",
  moderni: "Moderní zprávy",
};

const ChronicleFeed = ({
  sessionId, events, memories, chronicles, epochStyle,
  currentTurn, turnClosedP1, turnClosedP2,
  player1Name, player2Name, currentPlayerName, onRefetch,
}: ChronicleFeedProps) => {
  const [generating, setGenerating] = useState(false);

  const currentTurnEvents = events.filter((e) => e.turn_number === currentTurn);
  const isPlayer1 = currentPlayerName === player1Name;
  const myTurnClosed = isPlayer1 ? turnClosedP1 : turnClosedP2;
  const otherTurnClosed = isPlayer1 ? turnClosedP2 : turnClosedP1;
  const bothClosed = turnClosedP1 && turnClosedP2;

  const handleCloseTurn = async () => {
    const playerNumber = isPlayer1 ? 1 : 2;
    await closeTurnForPlayer(sessionId, playerNumber as 1 | 2);
    toast.success("Vaše kolo uzavřeno. Čekáme na druhého hráče.");
    onRefetch?.();
  };

  const handleGenerateAndAdvance = async () => {
    if (currentTurnEvents.length === 0) {
      toast.error("V tomto kole nejsou žádné události");
      return;
    }

    setGenerating(true);
    try {
      // Mark all current turn events as confirmed
      const result = await generateChronicle(currentTurnEvents, memories, epochStyle);
      if (result.chronicle) {
        await addChronicleEntry(sessionId, `📜 Rok ${currentTurn}\n\n${result.chronicle}`, epochStyle, currentTurn);
      }
      if (result.suggestedMemories?.length) {
        for (const mem of result.suggestedMemories) {
          await addWorldMemory(sessionId, mem, false);
        }
        toast.success(`Navrženo ${result.suggestedMemories.length} nových vzpomínek`);
      }
      // Advance to next turn
      await advanceTurn(sessionId, currentTurn);
      toast.success(`Kronika roku ${currentTurn} vygenerována! Pokračujeme rokem ${currentTurn + 1}.`);
      onRefetch?.();
    } catch {
      toast.error("Generování kroniky selhalo");
    }
    setGenerating(false);
  };

  const epochClass =
    epochStyle === "myty" ? "text-chronicle-myth" :
    epochStyle === "moderni" ? "text-chronicle-modern" : "text-chronicle-medieval";

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-semibold flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-primary" />
        Kronika světa
        <span className="text-sm font-body text-muted-foreground ml-2">
          ({EPOCH_LABELS[epochStyle] || epochStyle})
        </span>
      </h2>

      {/* Turn closure status */}
      <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-2">
        <p className="text-sm font-display font-semibold">Rok {currentTurn} — Uzavření kola</p>
        <div className="flex items-center gap-2 text-sm">
          {turnClosedP1 ? (
            <CheckCircle2 className="h-4 w-4 text-primary" />
          ) : (
            <Lock className="h-4 w-4 text-muted-foreground" />
          )}
          <span className={turnClosedP1 ? "text-primary" : "text-muted-foreground"}>
            {player1Name}: {turnClosedP1 ? "Uzavřeno" : "Čeká"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {turnClosedP2 ? (
            <CheckCircle2 className="h-4 w-4 text-primary" />
          ) : (
            <Lock className="h-4 w-4 text-muted-foreground" />
          )}
          <span className={turnClosedP2 ? "text-primary" : "text-muted-foreground"}>
            {player2Name}: {turnClosedP2 ? "Uzavřeno" : "Čeká"}
          </span>
        </div>

        {!myTurnClosed && (
          <Button
            onClick={handleCloseTurn}
            variant="outline"
            className="w-full h-10 font-display mt-2"
            disabled={currentTurnEvents.length === 0}
          >
            <Lock className="mr-2 h-4 w-4" />
            Uzavřít mé kolo
          </Button>
        )}

        {myTurnClosed && !otherTurnClosed && (
          <p className="text-xs text-muted-foreground italic text-center">
            Čekáme na {isPlayer1 ? player2Name : player1Name}...
          </p>
        )}

        {bothClosed && (
          <Button
            onClick={handleGenerateAndAdvance}
            disabled={generating}
            className="w-full h-11 font-display mt-2"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {generating ? "Generuji kroniku..." : `✅ Vygenerovat kroniku roku ${currentTurn}`}
          </Button>
        )}
      </div>

      {/* Chronicle archive */}
      <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-1">
        {chronicles.length === 0 && (
          <p className="text-muted-foreground text-center py-4 italic">
            Kronika je prázdná... uzavřete první kolo a vygenerujte první zápis.
          </p>
        )}
        {[...chronicles].reverse().map((entry) => (
          <div
            key={entry.id}
            className={`p-4 rounded-lg border border-border bg-card shadow-parchment animate-fade-in ${epochClass}`}
          >
            <div className="text-xs text-muted-foreground mb-2 font-display">
              {EPOCH_LABELS[entry.epoch_style] || entry.epoch_style} • {new Date(entry.created_at).toLocaleString("cs-CZ")}
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{entry.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChronicleFeed;
