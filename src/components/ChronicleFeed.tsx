import { useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { generateChronicle } from "@/lib/ai";
import { addChronicleEntry, addWorldMemory } from "@/hooks/useGameSession";
import { Button } from "@/components/ui/button";
import { BookOpen, Sparkles } from "lucide-react";
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
}

const EPOCH_LABELS: Record<string, string> = {
  myty: "Mýty",
  kroniky: "Kroniky",
  moderni: "Moderní zprávy",
};

const ChronicleFeed = ({ sessionId, events, memories, chronicles, epochStyle }: ChronicleFeedProps) => {
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    const confirmedEvents = events.filter((e) => e.confirmed);
    if (confirmedEvents.length === 0) {
      toast.error("Nejdříve potvrďte některé události");
      return;
    }

    setGenerating(true);
    try {
      const result = await generateChronicle(confirmedEvents, memories, epochStyle);
      if (result.chronicle) {
        await addChronicleEntry(sessionId, result.chronicle, epochStyle);
      }
      if (result.suggestedMemories?.length) {
        for (const mem of result.suggestedMemories) {
          await addWorldMemory(sessionId, mem, false);
        }
        toast.success(`Navrženo ${result.suggestedMemories.length} nových vzpomínek`);
      }
      toast.success("Kronika vygenerována!");
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

      <Button
        onClick={handleGenerate}
        disabled={generating}
        className="w-full h-11 font-display"
      >
        <Sparkles className="mr-2 h-4 w-4" />
        {generating ? "Generuji kroniku..." : "✅ Vygenerovat kroniku"}
      </Button>

      <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
        {chronicles.length === 0 && (
          <p className="text-muted-foreground text-center py-8 italic">
            Kronika je prázdná... potvrďte události a vygenerujte první zápis.
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
