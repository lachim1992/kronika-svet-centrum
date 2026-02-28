import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Swords, Shield, BookOpen, Crown, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  onVictory?: () => void;
}

const STYLE_CONFIG: Record<string, { icon: typeof Trophy; label: string; color: string }> = {
  domination: { icon: Swords, label: "Dominance", color: "text-destructive" },
  survival: { icon: Shield, label: "Přežití", color: "text-accent" },
  story: { icon: BookOpen, label: "Příběh", color: "text-primary" },
};

const VictoryProgressPanel = ({ sessionId, currentPlayerName, currentTurn, onVictory }: Props) => {
  const [progress, setProgress] = useState<any>(null);
  const [victoryStyle, setVictoryStyle] = useState<string>("story");
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);

  const fetchProgress = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("check-victory", {
        body: { sessionId, playerName: currentPlayerName },
      });
      if (error) throw error;
      if (data?.progress) setProgress(data.progress);
      if (data?.victory_style) setVictoryStyle(data.victory_style);
      if (data?.won) onVictory?.();
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, [sessionId, currentPlayerName, onVictory]);

  useEffect(() => { fetchProgress(); }, [fetchProgress, currentTurn]);

  const handleEndStory = async () => {
    setEnding(true);
    try {
      await supabase.from("game_sessions").update({
        victory_status: "won",
        victory_winner: currentPlayerName,
        victory_data: { type: "story", ended_turn: currentTurn },
      } as any).eq("id", sessionId);

      await supabase.from("chronicle_entries").insert({
        session_id: sessionId,
        turn_from: currentTurn,
        turn_to: currentTurn,
        text: `**V roce ${currentTurn} uzavřel ${currentPlayerName} kapitolu dějin svého světa.** Příběh jeho říše se stává legendou předávanou z generace na generaci.`,
        source_type: "system",
      });

      toast.success("Hra ukončena!");
      onVictory?.();
    } catch {
      toast.error("Nepodařilo se ukončit hru");
    } finally {
      setEnding(false);
    }
  };

  if (loading) return null;
  if (!progress) return null;

  const config = STYLE_CONFIG[victoryStyle] || STYLE_CONFIG.story;
  const Icon = config.icon;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-display">
          <Trophy className="h-4 w-4 text-illuminated" />
          Cíl hry
          <Badge variant="outline" className={`text-xs ${config.color}`}>
            <Icon className="h-3 w-3 mr-1" />
            {config.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {victoryStyle === "domination" && progress.details && (
          <>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Dobytá hlavní města:</span>
              <span className="font-semibold text-foreground">{progress.current}/{progress.target}</span>
            </div>
            <Progress value={progress.pct} className="h-2" />
            <div className="space-y-1">
              {(progress.details as any[]).map((d: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {d.conquered ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className={d.conquered ? "line-through text-muted-foreground" : ""}>
                    {d.city}
                  </span>
                  <span className="text-[10px] text-muted-foreground">({d.faction})</span>
                </div>
              ))}
            </div>
          </>
        )}

        {victoryStyle === "survival" && (
          <>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Přežité krize:</span>
              <span className="font-semibold text-foreground">{progress.current}/3</span>
            </div>
            <Progress value={progress.pct} className="h-2" />
            {progress.details?.resolved?.length > 0 && (
              <div className="space-y-1">
                {progress.details.resolved.map((t: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            )}
            {progress.details?.active?.length > 0 && (
              <div className="space-y-1">
                {progress.details.active.map((t: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-illuminated">
                    <Shield className="h-3.5 w-3.5 animate-pulse" />
                    <span>Aktivní krize: {t}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {victoryStyle === "story" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Příběhový režim — hrajte jak dlouho chcete. Můžete hru ukončit kdykoli.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleEndStory}
              disabled={ending}
              className="w-full"
            >
              {ending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Crown className="h-3 w-3 mr-1" />}
              Ukončit příběh
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default VictoryProgressPanel;
