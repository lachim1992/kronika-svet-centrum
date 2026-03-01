import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import GamesRevealPlayer from "./GamesRevealPlayer";
import OlympiadReport from "./OlympiadReport";

interface Props {
  revealScript: any[];
  festivalId: string;
  sessionId: string;
  onClose: () => void;
  startWithReport?: boolean;
}

type Phase = "reveal" | "report";

const GamesRevealOverlay = ({ revealScript, festivalId, sessionId, onClose, startWithReport }: Props) => {
  const hasReveal = revealScript.length > 0;
  const [phase, setPhase] = useState<Phase>(startWithReport || !hasReveal ? "report" : "reveal");

  const handleRevealComplete = () => {
    setPhase("report");
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-sm animate-fade-in">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/30">
        <h2 className="font-display text-sm text-foreground/80">
          {phase === "reveal" ? "🏟️ Živý přenos her" : "📰 Závěrečný report"}
        </h2>
        <Button variant="ghost" size="sm" onClick={onClose} className="text-foreground/60 hover:text-foreground">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          {phase === "reveal" && hasReveal && (
            <GamesRevealPlayer
              revealScript={revealScript}
              onComplete={handleRevealComplete}
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
