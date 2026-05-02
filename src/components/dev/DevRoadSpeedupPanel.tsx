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
import { Loader2, FastForward, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  sessionId: string;
  onRefetch?: () => void;
}

const DevRoadSpeedupPanel = ({ sessionId, onRefetch }: Props) => {
  const [busy, setBusy] = useState(false);
  const [recomputing, setRecomputing] = useState(false);

  const completeAll = async () => {
    setBusy(true);
    try {
      const { data: routes, error } = await supabase
        .from("province_routes")
        .select("id, metadata, route_type, node_a, node_b")
        .eq("session_id", sessionId)
        .eq("construction_state", "under_construction");
      if (error) throw error;
      if (!routes || routes.length === 0) {
        toast.info("Žádné silnice ve výstavbě.");
        return;
      }

      let updated = 0;
      for (const r of routes) {
        const md = (r.metadata as any) || {};
        const total = Number(md.total_work || 0) || 1;
        const newMd = { ...md, progress: total, last_tick_turn: md.last_tick_turn ?? null, dev_completed: true };
        const { error: uErr } = await supabase
          .from("province_routes")
          .update({
            construction_state: "complete",
            control_state: "open",
            metadata: newMd,
            path_dirty: true,
          })
          .eq("id", r.id);
        if (!uErr) updated++;
      }

      toast.success(`✅ Dokončeno ${updated} silnic`, {
        description: "Spouštím přepočet hex toků…",
      });

      // Trigger hex flow recompute so RoadNetworkOverlay sees them.
      setRecomputing(true);
      const { error: flowErr } = await supabase.functions.invoke("compute-hex-flows", {
        body: { session_id: sessionId, force_all: true },
      });
      if (flowErr) {
        toast.warning("Recompute hex flows selhal: " + (flowErr.message || "unknown"));
      } else {
        toast.success("🌐 Hex toky přepočítány.");
      }
      onRefetch?.();
    } catch (e: any) {
      toast.error("Chyba: " + (e.message || "unknown"));
    } finally {
      setBusy(false);
      setRecomputing(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <FastForward className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-medium">Urychlit stavbu silnic</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Okamžitě dokončí všechny silnice, které jsou aktuálně ve výstavbě, a přepočítá hex toky.
        Užitečné pro simulaci toků bez čekání na kola.
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
        Dokončit všechny silnice & přepočítat toky
      </Button>
    </div>
  );
};

export default DevRoadSpeedupPanel;
