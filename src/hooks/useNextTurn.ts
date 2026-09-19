import { useRef, useState } from "react";
import { getCommitTurnIssues } from "@/lib/commitTurnResult";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { saveCommitTurnReport } from "@/components/realm/TurnExecutionReport";

interface UseNextTurnOptions {
  sessionId: string;
  currentTurn: number;
  playerName: string;
  gameMode?: string;
  onComplete: () => void;
}

export function useNextTurn({ sessionId, currentTurn, playerName, gameMode, onComplete }: UseNextTurnOptions) {
  const [processing, setProcessing] = useState(false);
  const inFlight = useRef(false);

  const processNextTurn = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setProcessing(true);
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      // commit-turn can take 60s+ due to world tick + chronicles + economy
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 120_000); // 2 min timeout

      const { data, error } = await supabase.functions.invoke("commit-turn", {
        body: { sessionId, playerName, expectedTurn: currentTurn },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (error) {
        // Handle FunctionsHttpError
        let body: any = null;
        try {
          if (error.context && typeof error.context === "object" && "json" in error.context) {
            body = await (error.context as Response).json();
          }
        } catch { /* ignore */ }

        const msg = body?.error || error.message || "Neznámá chyba";
        console.error("commit-turn error:", msg);
        toast.error(`Chyba při uzavírání kola: ${msg}`);
        saveCommitTurnReport({
          ts: Date.now(),
          turn: currentTurn,
          sessionId,
          ok: false,
          topError: msg,
          results: body?.results || {},
          criticalMs: body?.criticalMs,
        });
        return;
      }

      const result = data;
      const issues = getCommitTurnIssues(result);

      // Persist execution report (per-phase status + failures) for UI panel
      saveCommitTurnReport({
        ts: Date.now(),
        turn: currentTurn,
        sessionId,
        ok: issues.length === 0,
        topError: issues.length > 0 ? issues.join("; ") : undefined,
        results: result?.results || {},
        criticalMs: result?.criticalMs,
      });

      if (issues.length > 0) {
        toast.error("Tah nebyl dokončen bez chyb.", {
          description: "Otevři report posledního tahu. Neopakuj tah naslepo.",
          duration: 8000,
        });
      }
      const growthCount = result?.results?.worldTick?.growthCount || 0;
      const eventsCount = result?.results?.worldTick?.emittedEventsCount || 0;

      if (growthCount > 0 || eventsCount > 0) {
        toast.info(`⚙️ World Tick: ${growthCount} měst rostlo, ${eventsCount} událostí.`);
      }

      if (result?.results?.aiFactions?.processed > 0) {
        toast.info(`${result.results.aiFactions.processed} AI frakcí provedlo svůj tah.`);
      }

      if (result?.results?.economy?.processed > 0) {
        toast.info("📦 Ekonomika všech hráčů zpracována.");
      }

      // commit-turn owns the complete refresh pipeline. A second client-side
      // refresh hid server failures and recalculated the same world again.

      // Background tasks are now scheduled asynchronously via EdgeRuntime.waitUntil
      // They will complete in the background — no need to wait for them
      if (result?.backgroundScheduled) {
        toast.info("📜 Kroniky a narativy se generují na pozadí…", { duration: 3000 });
      }

      // Legacy support for inline results (older runtime)
      if (result?.results?.worldChronicle?.ok) {
        toast.info("📜 Kronika světa automaticky vygenerována.");
      }
      if (result?.results?.playerChronicles?.generated > 0) {
        toast.info(`📖 ${result.results.playerChronicles.generated} hráčských kronik vygenerováno.`);
      }

      if (result?.results?.league?.roundsPlayed > 0) {
        const rp = result.results.league.roundsPlayed;
        const sc = result.results.league.seasonComplete;
        toast.info(`⚔️ Sphaera Liga: ${rp} kol odehráno.${sc ? " 🏆 Sezóna dokončena!" : ""}`);
      }

      if (issues.length === 0) {
        toast.success(`Kolo ${currentTurn} uzavřeno. Pokračujeme rokem ${result.newTurn ?? currentTurn + 1}.`);
      }
    } catch (e) {
      console.error("commit-turn unexpected error:", e);
      toast.error("Neočekávaná chyba při uzavírání kola.");
    } finally {
      clearTimeout(timeout);
      inFlight.current = false;
      setProcessing(false);
      onComplete();
    }
  };

  return { processing, processNextTurn };
}
