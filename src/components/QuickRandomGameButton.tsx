import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dice5, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface Props {
  userId: string;
  defaultPlayerName: string;
  /** Called when world is fully created. */
  onCreated: (sessionId: string) => void;
  /** Called when no prior world exists — parent should open WorldSetupWizard. */
  onNeedsWizard: () => void;
}

const STEPS = [
  "Probouzím prastaré ozvěny…",
  "Lovable AI tká novou premisu…",
  "Volám 1–2 rivalské frakce…",
  "Kopíruji terén z minulého světa…",
  "Skládám geografii a hranice…",
  "Zapisuji první kroniku…",
];

export default function QuickRandomGameButton({ userId, defaultPlayerName, onCreated, onNeedsWizard }: Props) {
  const [open, setOpen] = useState(false);
  const [playerName, setPlayerName] = useState(defaultPlayerName);
  const [generating, setGenerating] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  const handleStart = async () => {
    if (!playerName.trim()) {
      toast.error("Zadejte své jméno");
      return;
    }
    setGenerating(true);
    setStepIdx(0);
    const tick = setInterval(() => {
      setStepIdx((s) => Math.min(s + 1, STEPS.length - 1));
    }, 4500);

    try {
      const { data, error } = await supabase.functions.invoke("quick-random-game", {
        body: { playerName: playerName.trim(), userId },
      });
      clearInterval(tick);
      if (error) throw new Error(error.message);
      if (data?.needsWizard) {
        toast.info("Žádný předchozí svět — otevírám detailní setup.");
        onNeedsWizard();
        return;
      }
      if (!data?.ok || !data?.sessionId) {
        throw new Error(data?.error || "Generování selhalo");
      }
      localStorage.setItem("ch_lastGameId", data.sessionId);
      localStorage.setItem("ch_playerName", playerName.trim());
      toast.success(`Svět "${data.worldName ?? "připraven"}" vytvořen!`);
      onCreated(data.sessionId);
    } catch (e: any) {
      clearInterval(tick);
      console.error("[quick-random-game] failed:", e);
      toast.error("Nepodařilo se: " + (e?.message ?? "neznámá chyba").substring(0, 120));
    } finally {
      setGenerating(false);
      setStepIdx(0);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full p-5 rounded-lg border-2 border-dashed border-secondary/40 hover:border-secondary/70 bg-secondary/5 hover:bg-secondary/10 transition-all group"
      >
        <div className="flex items-center justify-center gap-3">
          <div className="h-10 w-10 rounded-full bg-secondary/15 flex items-center justify-center group-hover:bg-secondary/25 transition-colors">
            <Dice5 className="h-5 w-5 text-secondary-foreground" />
          </div>
          <div className="text-left">
            <p className="font-display font-bold text-lg text-foreground">Random hra (1–2 AI)</p>
            <p className="text-sm text-muted-foreground">
              AI vygeneruje svět · terén z poslední hry · ihned hratelné
            </p>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="bg-card p-5 rounded-lg border-2 border-secondary/30 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-secondary-foreground" />
        <h3 className="font-display font-semibold">Random hra</h3>
      </div>

      {generating ? (
        <div className="space-y-3 py-4">
          <div className="flex items-center gap-3 text-secondary-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="font-display">{STEPS[stepIdx]}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Trvá typicky 20–60 sekund. Neopouštějte stránku.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <label className="text-sm font-medium">Vaše jméno / civilizace</label>
            <Input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Např. Kronikář"
            />
            <p className="text-xs text-muted-foreground">
              Vše ostatní (premisa, vládce, frakce, mapa) doplní AI a kopie posledního světa.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} className="flex-1">
              Zrušit
            </Button>
            <Button onClick={handleStart} className="flex-1 font-display">
              <Dice5 className="mr-2 h-4 w-4" />
              Vygenerovat & hrát
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
