import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Trophy, Swords, Shield, BookOpen, Crown, Star, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Props {
  sessionId: string;
  open: boolean;
  onClose: () => void;
}

const STYLE_ICONS: Record<string, typeof Trophy> = {
  domination: Swords,
  survival: Shield,
  story: BookOpen,
};

const VictoryScreen = ({ sessionId, open, onClose }: Props) => {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: session } = await supabase
        .from("game_sessions")
        .select("victory_status, victory_winner, victory_data, current_turn")
        .eq("id", sessionId)
        .single();

      if (session?.victory_status === "won") {
        setData({
          winner: session.victory_winner,
          turn: session.current_turn,
          ...((session.victory_data as any) || {}),
        });
      }
    })();
  }, [open, sessionId]);

  if (!open || !data) return null;

  const style = data.victory_style || data.type || "story";
  const Icon = STYLE_ICONS[style] || Trophy;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="max-w-lg w-full mx-4 text-center space-y-6 animate-scale-in">
        {/* Crown glow effect */}
        <div className="relative inline-block">
          <div className="absolute inset-0 blur-3xl bg-illuminated/30 rounded-full scale-150" />
          <Crown className="relative h-20 w-20 text-illuminated mx-auto drop-shadow-[0_0_30px_hsl(var(--illuminated)/0.5)]" />
        </div>

        <h1 className="font-display text-4xl font-bold text-illuminated tracking-wider uppercase">
          Vítězství!
        </h1>

        <div className="flex items-center justify-center gap-2 text-foreground/80">
          <Icon className="h-5 w-5" />
          <span className="text-lg font-display">
            {style === "domination" && "Dominance — Svět je tvůj"}
            {style === "survival" && "Přežití — Neporazitelný"}
            {style === "story" && "Příběh — Legenda zaznamenána"}
          </span>
        </div>

        <div className="manuscript-card p-6 text-left space-y-3 bg-card/90 backdrop-blur-md">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Star className="h-4 w-4 text-illuminated" />
            <span>Vítěz: <strong className="text-foreground">{data.winner}</strong></span>
          </div>
          <div className="text-sm text-muted-foreground">
            Rok ukončení: <strong className="text-foreground">{data.turn || data.ended_turn}</strong>
          </div>

          {style === "domination" && data.progress?.details && (
            <div className="border-t border-border pt-3 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dobytá hlavní města</p>
              {(data.progress.details as any[]).map((d: any, i: number) => (
                <div key={i} className="text-sm">⚔️ {d.city} ({d.faction})</div>
              ))}
            </div>
          )}

          {style === "survival" && data.crises_list && (
            <div className="border-t border-border pt-3 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Přežité krize</p>
              {(data.crises_list as string[]).map((c: string, i: number) => (
                <div key={i} className="text-sm">🛡️ {c}</div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={onClose}>
            Pokračovat v prohlížení
          </Button>
          <Button onClick={() => navigate("/games")} className="gap-1">
            Moje hry <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default VictoryScreen;
