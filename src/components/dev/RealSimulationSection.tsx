import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Loader2, Play, Square, AlertTriangle, Zap } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  onRefetch?: () => void;
}

const YEAR_PRESETS = [1, 2, 3, 5, 10, 20];

const RealSimulationSection = ({ sessionId, currentPlayerName, onRefetch }: Props) => {
  const [years, setYears] = useState(5);
  const [customYears, setCustomYears] = useState("");
  const [skipNarrative, setSkipNarrative] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [summary, setSummary] = useState<{ turns: number; errors: number; elapsed: number } | null>(null);
  const abortRef = useRef(false);

  const addLog = (msg: string) =>
    setLog(prev => [...prev.slice(-300), `[${new Date().toLocaleTimeString("cs")}] ${msg}`]);

  const effectiveYears = customYears ? parseInt(customYears) || years : years;

  const runSimulation = async () => {
    abortRef.current = false;
    setSimulating(true);
    setLog([]);
    setSummary(null);
    setProgressPct(0);

    const startTime = Date.now();
    let completedTurns = 0;
    let errorCount = 0;

    addLog(`🚀 Skutečná simulace: ${effectiveYears} tahů přes commit-turn`);
    addLog(`⚙️ Narativní generování: ${skipNarrative ? "PŘESKOČENO (rychlý režim)" : "ZAPNUTO"}`);

    try {
      // Get current session state
      const { data: session } = await supabase
        .from("game_sessions")
        .select("current_turn")
        .eq("id", sessionId)
        .single();

      if (!session) {
        addLog("❌ Session nenalezena");
        setSimulating(false);
        return;
      }

      const startTurn = session.current_turn;
      addLog(`📍 Start: kolo ${startTurn}, cíl: kolo ${startTurn + effectiveYears}`);

      for (let i = 0; i < effectiveYears; i++) {
        if (abortRef.current) {
          addLog("⏹️ Simulace zastavena uživatelem");
          break;
        }

        const currentTurn = startTurn + i;
        setProgressText(`Kolo ${currentTurn} → ${currentTurn + 1} (${i + 1}/${effectiveYears})`);
        setProgressPct(Math.round(((i + 1) / effectiveYears) * 100));

        try {
          // Call commit-turn — this runs the FULL engine pipeline
          const { data, error } = await supabase.functions.invoke("commit-turn", {
            body: {
              sessionId,
              playerName: currentPlayerName,
              skipNarrative: skipNarrative,
            },
          });

          if (error) {
            // 409 = already processed, skip gracefully
            if (/409|already/i.test(error.message || "")) {
              addLog(`⚠️ Kolo ${currentTurn}: již zpracováno, pokračuji`);
            } else {
              addLog(`⚠️ Kolo ${currentTurn}: ${error.message}`);
              errorCount++;
            }
          } else {
            const info = data || {};
            const parts: string[] = [`✅ Kolo ${currentTurn + 1}`];
            if (info.economyResults) {
              const econ = info.economyResults;
              const playerCount = Object.keys(econ).length;
              parts.push(`(${playerCount} hráčů zpracováno)`);
            }
            if (info.physicsResults) {
              parts.push(`fyzika OK`);
            }
            addLog(parts.join(" "));
          }

          completedTurns++;
        } catch (e: any) {
          addLog(`❌ Kolo ${currentTurn}: ${e.message || "neznámá chyba"}`);
          errorCount++;

          // If too many errors, abort
          if (errorCount >= 3) {
            addLog("🛑 Příliš mnoho chyb, zastavuji simulaci");
            break;
          }
        }

        // Small delay to avoid hammering the server
        await new Promise(r => setTimeout(r, 500));
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      setSummary({ turns: completedTurns, errors: errorCount, elapsed: parseFloat(elapsed) });
      addLog(`✅ HOTOVO: ${completedTurns} tahů za ${elapsed}s, ${errorCount} chyb`);
      toast.success(`Simulace dokončena: ${completedTurns} tahů za ${elapsed}s`);
      onRefetch?.();
    } catch (e: any) {
      addLog(`❌ Fatální chyba: ${e.message}`);
      toast.error("Simulace selhala");
    }

    setSimulating(false);
    setProgressText("");
    setProgressPct(0);
  };

  const stopSimulation = () => {
    abortRef.current = true;
    addLog("⏹️ Zastavuji po dokončení aktuálního tahu…");
  };

  return (
    <div className="bg-card border-2 border-primary/30 rounded-lg p-4 space-y-4">
      <h3 className="font-display font-semibold text-sm flex items-center gap-2">
        <Zap className="h-4 w-4 text-primary" />
        Skutečná simulace tahů
        <Badge variant="outline" className="text-[10px] ml-auto">commit-turn loop</Badge>
      </h3>

      <p className="text-xs text-muted-foreground">
        Volá <code className="text-primary">commit-turn</code> v cyklu — běží plná ekonomika, fyzika, AI frakce, bitvy.
        Každý tah je reálný jako by ho hráč odklikl.
      </p>

      {/* Year presets */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Počet tahů</Label>
        <div className="flex flex-wrap gap-1">
          {YEAR_PRESETS.map(y => (
            <Button key={y} size="sm" variant={years === y && !customYears ? "default" : "outline"}
              className="h-8 text-xs" onClick={() => { setYears(y); setCustomYears(""); }}
              disabled={simulating}>
              {y}
            </Button>
          ))}
          <Input
            type="number" min={1} max={100} placeholder="Vlastní"
            value={customYears} onChange={e => setCustomYears(e.target.value)}
            className="w-20 h-8 text-xs text-center" disabled={simulating}
          />
        </div>
      </div>

      {/* Options */}
      <div className="flex items-center gap-3 p-2 rounded border bg-muted/20">
        <Zap className="h-4 w-4 text-accent shrink-0" />
        <Label htmlFor="skip-narrative" className="text-xs flex-1 cursor-pointer">
          Přeskočit narativní generování (kroniky, wiki) — výrazně rychlejší
        </Label>
        <Switch id="skip-narrative" checked={skipNarrative} onCheckedChange={setSkipNarrative} disabled={simulating} />
      </div>

      {/* Warning */}
      <div className="flex items-center gap-2 p-2 rounded border border-destructive/30 bg-destructive/5 text-xs text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Toto reálně posune svět o {effectiveYears} tahů. Nelze vrátit zpět.
      </div>

      {/* Progress */}
      {simulating && (
        <div className="space-y-2">
          <Progress value={progressPct} className="h-2" />
          <p className="text-xs text-muted-foreground text-center">{progressText}</p>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-2">
        <Button onClick={runSimulation} disabled={simulating} className="flex-1 h-12 font-display text-base gap-2">
          {simulating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
          {simulating ? `Simuluji… ${progressText}` : `Spustit simulaci (${effectiveYears} tahů)`}
        </Button>
        {simulating && (
          <Button variant="destructive" onClick={stopSimulation} className="h-12 px-4">
            <Square className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Summary */}
      {summary && (
        <div className="p-3 bg-muted/30 rounded border space-y-2">
          <h4 className="font-display font-semibold text-sm">📊 Výsledek</h4>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {[
              ["Odehráno tahů", summary.turns],
              ["Chyb", summary.errors],
              ["Čas (s)", summary.elapsed],
            ].map(([label, val]) => (
              <div key={label as string} className="text-center p-2 rounded bg-card border">
                <p className="text-lg font-bold font-display">{val}</p>
                <p className="text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Log */}
      {log.length > 0 && (
        <ScrollArea className="h-48 border rounded p-2 bg-muted/30">
          <div className="font-mono text-[11px] space-y-0.5">
            {log.map((line, i) => (
              <p key={i} className={line.includes("❌") ? "text-destructive" : line.includes("⚠️") ? "text-yellow-500" : "text-muted-foreground"}>{line}</p>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default RealSimulationSection;
