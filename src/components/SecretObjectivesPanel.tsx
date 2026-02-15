import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, CheckCircle2, Sparkles, Scroll } from "lucide-react";
import { toast } from "sonner";

const DESTINY_OPTIONS = [
  "Postavte 3 divy světa",
  "Ovládněte 5 provincií",
  "Zničte hlavní město rivala",
  "Staňte se kulturní legendou — vlastněte nejvíce kronikářských zmínek",
  "Vybudujte obchodní imperium — nejvíce obchodních smluv",
  "Přežijte kolaps — přežijte světovou krizi bez ztráty města",
  "Vybudujte nejsilnější armádu ve hře",
  "Dosáhněte diplomatické hegemonie — ovlivněte všechny městské státy",
  "Zapište největší hrdinu do dějin",
  "Prohlaste náboženskou reformu a rozšiřte ji na 3 města",
];

interface SecretObjectivesPanelProps {
  sessionId: string;
  currentPlayerName: string;
  secretObjectives: any[];
  currentTurn: number;
  onRefetch?: () => void;
}

const SecretObjectivesPanel = ({ sessionId, currentPlayerName, secretObjectives, currentTurn, onRefetch }: SecretObjectivesPanelProps) => {
  const [drawing, setDrawing] = useState(false);
  const myObjective = secretObjectives.find((o: any) => o.player_name === currentPlayerName);
  const [revealed, setRevealed] = useState(false);

  const handleDraw = async () => {
    if (myObjective) { toast.error("Již máte osud!"); return; }
    setDrawing(true);
    const destiny = DESTINY_OPTIONS[Math.floor(Math.random() * DESTINY_OPTIONS.length)];
    await supabase.from("secret_objectives").insert({
      session_id: sessionId, player_name: currentPlayerName, objective_text: destiny,
    });
    toast.success("Osud byl vylosován!");
    onRefetch?.();
    setDrawing(false);
  };

  const handleFulfill = async () => {
    if (!myObjective) return;
    await supabase.from("secret_objectives").update({ fulfilled: true, fulfilled_round: currentTurn }).eq("id", myObjective.id);
    toast.success("Osud splněn! Legendární!");
    onRefetch?.();
  };

  const otherObjectives = secretObjectives.filter((o: any) => o.player_name !== currentPlayerName && o.fulfilled);

  return (
    <div className="space-y-6 px-4">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-decorative font-bold flex items-center justify-center gap-3">
          <Scroll className="h-7 w-7 text-royal-purple" />
          Osud a předurčení
        </h1>
        <p className="text-sm text-muted-foreground">Tajné cíle vaší civilizace</p>
      </div>

      <div className="manuscript-card p-5 space-y-4">
        {!myObjective ? (
          <div className="text-center space-y-4 py-6">
            <p className="text-sm text-muted-foreground">Ještě jste nevylosovali svůj osud...</p>
            <Button onClick={handleDraw} disabled={drawing} className="font-display">
              <Sparkles className="mr-2 h-4 w-4" />
              {drawing ? "Losuji..." : "🎴 Vylosovat osud"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-sm">Váš osud</h3>
              <Button size="sm" variant="ghost" onClick={() => setRevealed(!revealed)}>
                {revealed ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
            </div>

            {revealed ? (
              <div className="p-4 rounded-lg bg-muted/40 border border-border">
                <p className="text-sm font-display italic leading-relaxed">
                  „{myObjective.objective_text}"
                </p>
                {myObjective.fulfilled ? (
                  <Badge className="mt-3 bg-forest-green text-primary-foreground">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Splněno v roce {myObjective.fulfilled_round}
                  </Badge>
                ) : (
                  <Button size="sm" variant="outline" onClick={handleFulfill} className="mt-3 text-xs">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Označit jako splněné
                  </Button>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-muted/40 border border-border text-center">
                <p className="text-sm text-muted-foreground italic">🔮 Klikněte na oko pro odhalení osudu</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Revealed fulfilled objectives from others */}
      {otherObjectives.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display font-semibold text-sm">Splněné osudy ostatních</h3>
          {otherObjectives.map((o: any) => (
            <div key={o.id} className="manuscript-card p-3 space-y-1">
              <p className="font-display font-semibold text-sm">{o.player_name}</p>
              <p className="text-xs italic text-muted-foreground">„{o.objective_text}"</p>
              <Badge variant="secondary" className="text-xs">Splněno rok {o.fulfilled_round}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SecretObjectivesPanel;
