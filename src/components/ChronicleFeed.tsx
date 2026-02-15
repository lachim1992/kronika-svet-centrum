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
type GamePlayer = Tables<"game_players">;

type City = Tables<"cities">;

interface ChronicleFeedProps {
  sessionId: string;
  events: GameEvent[];
  memories: WorldMemory[];
  chronicles: ChronicleEntry[];
  epochStyle: string;
  currentTurn: number;
  players: GamePlayer[];
  currentPlayerName: string;
  entityTraits?: any[];
  cities?: City[];
  onRefetch?: () => void;
}

const EPOCH_LABELS: Record<string, string> = {
  myty: "Mýty",
  kroniky: "Kroniky",
  moderni: "Moderní zprávy",
};

const ChronicleFeed = ({
  sessionId, events, memories, chronicles, epochStyle,
  currentTurn, players, currentPlayerName, entityTraits, cities = [], onRefetch,
}: ChronicleFeedProps) => {
  const [generating, setGenerating] = useState(false);

  const currentTurnEvents = events.filter((e) => e.turn_number === currentTurn);
  const currentPlayer = players.find(p => p.player_name === currentPlayerName);
  const myTurnClosed = currentPlayer?.turn_closed || false;
  const allClosed = players.length > 0 && players.every(p => p.turn_closed);

  const handleCloseTurn = async () => {
    if (!currentPlayer) return;
    await closeTurnForPlayer(sessionId, currentPlayer.player_number);
    toast.success("Vaše kolo uzavřeno. Čekáme na ostatní hráče.");
    onRefetch?.();
  };

  const handleGenerateAndAdvance = async () => {
    if (currentTurnEvents.length === 0) {
      toast.error("V tomto kole nejsou žádné události");
      return;
    }

    setGenerating(true);
    try {
      // Gather city memories for cities involved in this turn's events
      const involvedCityIds = new Set(
        currentTurnEvents.map(e => (e as any).city_id).filter(Boolean)
      );
      const cityMemories = memories
        .filter(m => m.approved && (m as any).city_id && involvedCityIds.has((m as any).city_id))
        .map(m => ({
          text: m.text,
          category: (m as any).category,
          cityName: cities.find(c => c.id === (m as any).city_id)?.name || "?",
        }));

      const result = await generateChronicle(currentTurnEvents, memories, epochStyle, entityTraits, cityMemories);
      if (result.chronicle) {
        await addChronicleEntry(sessionId, `📜 Rok ${currentTurn}\n\n${result.chronicle}`, epochStyle, currentTurn);
      }
      if (result.suggestedMemories?.length) {
        for (const mem of result.suggestedMemories) {
          await addWorldMemory(sessionId, mem, false);
        }
        toast.success(`Navrženo ${result.suggestedMemories.length} nových vzpomínek`);
      }
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
        {players.map(p => (
          <div key={p.id} className="flex items-center gap-2 text-sm">
            {p.turn_closed ? (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            ) : (
              <Lock className="h-4 w-4 text-muted-foreground" />
            )}
            <span className={p.turn_closed ? "text-primary" : "text-muted-foreground"}>
              {p.player_name}: {p.turn_closed ? "Uzavřeno" : "Čeká"}
            </span>
          </div>
        ))}

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

        {myTurnClosed && !allClosed && (
          <p className="text-xs text-muted-foreground italic text-center">
            Čekáme na ostatní hráče...
          </p>
        )}

        {allClosed && (
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
