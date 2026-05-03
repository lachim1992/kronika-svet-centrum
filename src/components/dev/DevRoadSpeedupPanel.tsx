/**
 * DevRoadSpeedupPanel — DEV ONLY
 *
 * Forces all `under_construction` province routes in the session to complete
 * immediately so flow simulations can be triggered without waiting for turns.
 *
 * Sets metadata.progress = total_work and construction_state = 'complete'
 * for every active under-construction route, then triggers a hex-flow
 * recompute so RoadNetworkOverlay picks up the new paths.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, FastForward, Sparkles, Brain, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  sessionId: string;
  onRefetch?: () => void;
}

const DevRoadSpeedupPanel = ({ sessionId, onRefetch }: Props) => {
  const [busy, setBusy] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);

  const completeAll = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("dev-complete-roads", {
        body: { session_id: sessionId },
      });
      if (error) throw error;
      const updated = (data as any)?.updated ?? 0;
      if (updated === 0) {
        toast.info("Žádné silnice ve výstavbě.");
        return;
      }
      toast.success(`✅ Dokončeno ${updated} silnic`, {
        description: "Spouštím přepočet ekonomiky…",
      });

      setRecomputing(true);
      const { error: refErr } = await supabase.functions.invoke("refresh-economy", {
        body: { session_id: sessionId },
      });
      if (refErr) {
        toast.warning("Refresh-economy selhal: " + (refErr.message || "unknown"));
      } else {
        toast.success("🌐 Ekonomika přepočítána.");
      }
      onRefetch?.();
    } catch (e: any) {
      toast.error("Chyba: " + (e.message || "unknown"));
    } finally {
      setBusy(false);
      setRecomputing(false);
    }
  };

  const runAllAITurns = async () => {
    setAiBusy(true);
    try {
      const { data: factions, error } = await supabase
        .from("ai_factions")
        .select("faction_name")
        .eq("session_id", sessionId)
        .eq("is_active", true);
      if (error) throw error;
      if (!factions || factions.length === 0) {
        toast.info("Žádné aktivní AI frakce.");
        return;
      }
      const settled = await Promise.allSettled(
        factions.map((f: any) =>
          supabase.functions.invoke("ai-faction-turn", {
            body: { sessionId, factionName: f.faction_name },
          }),
        ),
      );
      const ok = settled.filter((s) => s.status === "fulfilled" && !(s.value as any).error).length;
      toast.success(`🤖 AI tah: ${ok}/${factions.length} frakcí dokončeno`);
      onRefetch?.();
    } catch (e: any) {
      toast.error("AI tah selhal: " + (e.message || "unknown"));
    } finally {
      setAiBusy(false);
    }
  };

  const refreshEconomy = async () => {
    setRefreshBusy(true);
    try {
      const { error } = await supabase.functions.invoke("refresh-economy", {
        body: { session_id: sessionId },
      });
      if (error) throw error;
      toast.success("🔄 Ekonomika přepočítána.");
      onRefetch?.();
    } catch (e: any) {
      toast.error("Refresh selhal: " + (e.message || "unknown"));
    } finally {
      setRefreshBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FastForward className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-medium">Urychlit stavbu silnic</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Okamžitě dokončí všechny silnice ve výstavbě a přepočítá ekonomiku.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={completeAll}
          disabled={busy || recomputing}
          className="gap-1.5 w-full"
        >
          {busy || recomputing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Dokončit všechny silnice & přepočítat
        </Button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Spustit AI tah pro všechny frakce</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={runAllAITurns}
          disabled={aiBusy}
          className="gap-1.5 w-full"
        >
          {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
          Run AI Turn for All Factions
        </Button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-medium">Manuální refresh ekonomiky</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={refreshEconomy}
          disabled={refreshBusy}
          className="gap-1.5 w-full"
        >
          {refreshBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh Economy
        </Button>
      </div>
    </div>
  );
};

export default DevRoadSpeedupPanel;
