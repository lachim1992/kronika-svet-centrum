import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import GamesRevealPlayer from "./GamesRevealPlayer";
import OlympiadReport from "./OlympiadReport";

interface Props {
  festivalId: string;
  sessionId: string;
  playerName: string;
  hostPlayer: string;
  onClose: () => void;
  startWithReport?: boolean;
}

type Phase = "reveal" | "report";

const GamesRevealOverlay = ({ festivalId, sessionId, playerName, hostPlayer, onClose, startWithReport }: Props) => {
  const [phase, setPhase] = useState<Phase>(startWithReport ? "report" : "reveal");
  const [disciplines, setDisciplines] = useState<any[]>([]);
  const isHost = playerName === hostPlayer;

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("games_disciplines").select("*").order("reveal_order");
      if (data) setDisciplines(data);
    };
    load();
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-md animate-fade-in">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-primary/20 bg-card/30 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary drop-shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
          <h2 className="font-display text-sm text-foreground/90">
            {phase === "reveal" ? "🏟️ Živý přenos her" : "📰 Závěrečný report"}
          </h2>
          {isHost && phase === "reveal" && (
            <span className="text-[8px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-display">ORGANIZÁTOR</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {phase === "reveal" && (
            <Button variant="ghost" size="sm" onClick={() => setPhase("report")} className="text-[10px] text-muted-foreground">
              Přeskočit na report →
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} className="text-foreground/60 hover:text-foreground">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="max-w-6xl mx-auto">
          {phase === "reveal" && (
            <GamesRevealPlayer
              festivalId={festivalId}
              sessionId={sessionId}
              disciplines={disciplines}
              isHost={isHost}
              onComplete={() => setPhase("report")}
            />
          )}
          {phase === "report" && (
            <OlympiadReport
              festivalId={festivalId}
              sessionId={sessionId}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default GamesRevealOverlay;
