import { useState } from "react";
import DevModePanel from "@/components/DevModePanel";
import { Wrench, SkipForward, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
  citiesCount: number;
  eventsCount: number;
  wondersCount: number;
  memoriesCount: number;
  playersCount: number;
  onRefetch: () => void;
}

const DevTab = ({
  sessionId, currentPlayerName, currentTurn, myRole,
  citiesCount, eventsCount, wondersCount, memoriesCount, playersCount,
  onRefetch,
}: Props) => {
  const [advancing, setAdvancing] = useState(false);
  const [recomputing, setRecomputing] = useState(false);

  const handleNextTurn = async () => {
    setAdvancing(true);
    try {
      const { data, error } = await supabase.functions.invoke("commit-turn", {
        body: { sessionId, playerName: currentPlayerName, skipNarrative: true },
      });

      if (error) {
        let msg = error.message || "Neznámá chyba";
        try {
          if (error.context && typeof error.context === "object" && "json" in error.context) {
            const body = await (error.context as Response).json();
            msg = body?.error || msg;
          }
        } catch { /* ignore */ }
        throw new Error(msg);
      }

      toast.success(`Kolo posunuto na ${currentTurn + 1}`);
      onRefetch();
    } catch (err: any) {
      toast.error("Chyba při posunu kola: " + (err.message || "Neznámá chyba"));
    } finally {
      setAdvancing(false);
    }
  };

  const handleRecomputeAll = async () => {
    setRecomputing(true);
    try {
      const { data, error } = await supabase.functions.invoke("recompute-all", {
        body: { sessionId, playerName: currentPlayerName },
      });

      if (error) {
        let msg = error.message || "Neznámá chyba";
        try {
          if (error.context && typeof error.context === "object" && "json" in error.context) {
            const body = await (error.context as Response).json();
            msg = body?.error || msg;
          }
        } catch { /* ignore */ }
        throw new Error(msg);
      }

      const steps = data?.steps || [];
      const failed = steps.filter((s: any) => !s.ok);
      const totalMs = data?.totalMs || 0;

      if (failed.length > 0) {
        toast.warning(`Recompute dokončen s ${failed.length} chybami (${totalMs}ms)`, {
          description: failed.map((s: any) => `${s.step}: ${s.detail?.slice(0, 80)}`).join("\n"),
        });
      } else {
        toast.success(`⚡ Recompute dokončen za ${totalMs}ms`, {
          description: steps.map((s: any) => `✅ ${s.step} (${s.durationMs}ms)`).join("\n"),
        });
      }

      // Surface trade solver basket diagnostics from compute-trade-flows step
      const tradeStep = steps.find((s: any) => s.step === "compute-trade-flows");
      if (tradeStep?.ok && tradeStep.detail) {
        try {
          const tradeData = JSON.parse(tradeStep.detail);
          const unmapped = tradeData.unmapped_count ?? 0;
          const legacy = tradeData.legacy_remap_count ?? 0;

          if (unmapped > 0) {
            toast.warning(`⚠️ ${unmapped} neznámých basket keys`, {
              description: `Legacy remap: ${legacy} | Zkontrolujte goods tabulku pro chybějící demand_basket.`,
            });
          } else if (legacy > 0) {
            toast.info(`🔄 ${legacy} legacy basket remapů aktivních`, {
              description: "Staré basket keys byly přemapovány na nový 12-basket model.",
            });
          }
        } catch { /* detail wasn't valid JSON, skip */ }
      }

      onRefetch();
    } catch (err: any) {
      toast.error("Recompute selhala: " + (err.message || "Neznámá chyba"));
    } finally {
      setRecomputing(false);
    }
  };

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-2 mb-2">
        <Wrench className="h-5 w-5 text-primary" />
        <h1 className="font-display text-lg font-bold">Dev Tools</h1>
        <span className="text-xs text-muted-foreground ml-auto">Kolo {currentTurn}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRecomputeAll}
          disabled={recomputing || advancing}
          className="gap-1.5"
        >
          {recomputing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          ⚡ Recompute All
        </Button>
        <Button
          size="sm"
          variant="default"
          onClick={handleNextTurn}
          disabled={advancing || recomputing}
          className="gap-1.5"
        >
          {advancing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SkipForward className="h-3.5 w-3.5" />}
          Next Turn
        </Button>
      </div>
      <DevModePanel
        sessionId={sessionId}
        currentPlayerName={currentPlayerName}
        currentTurn={currentTurn}
        myRole={myRole}
        onRefetch={onRefetch}
        citiesCount={citiesCount}
        eventsCount={eventsCount}
        wondersCount={wondersCount}
        memoriesCount={memoriesCount}
        playersCount={playersCount}
      />
    </div>
  );
};

export default DevTab;
