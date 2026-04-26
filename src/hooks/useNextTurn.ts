import { useState } from "react";
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

  const processNextTurn = async () => {
    if (processing) return;
    setProcessing(true);

    try {
      // commit-turn can take 60s+ due to world tick + chronicles + economy
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min timeout

      const { data, error } = await supabase.functions.invoke("commit-turn", {
        body: { sessionId, playerName },
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

      // Persist execution report (per-phase status + failures) for UI panel
      const phaseEntries = Object.entries(result?.results || {});
      const errorPhases = phaseEntries.filter(([, r]: any) => r?.error);
      const failureCount = phaseEntries.reduce(
        (s: number, [, r]: any) => s + (r?.failures?.length || 0),
        0,
      );
      saveCommitTurnReport({
        ts: Date.now(),
        turn: currentTurn,
        sessionId,
        ok: errorPhases.length === 0,
        results: result?.results || {},
        criticalMs: result?.criticalMs,
      });

      if (errorPhases.length > 0) {
        toast.error(
          `${errorPhases.length} fází selhalo: ${errorPhases.map(([k]) => k).join(", ")}`,
          { description: "Otevři 'Report posledního tahu' v přehledu říše.", duration: 8000 },
        );
      } else if (failureCount > 0) {
        toast.warning(
          `Tah dokončen s ${failureCount} dílčími chybami (AI frakce / ekonomika).`,
          { description: "Detaily v 'Report posledního tahu'.", duration: 6000 },
        );
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

      // Canonical loop step (per BETA_SCOPE.md): refresh-economy after commit-turn.
      // Non-fatal: turn is already committed server-side; refresh is downstream consolidation.
      try {
        const { error: refreshErr } = await supabase.functions.invoke("refresh-economy", {
          body: { session_id: sessionId },
        });
        if (refreshErr) {
          console.warn("refresh-economy non-fatal:", refreshErr.message);
          toast.warning("Ekonomika nebyla plně přepočtena, hra pokračuje.");
        }
      } catch (e) {
        console.warn("refresh-economy threw:", e);
      }

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

      toast.success(`Kolo ${currentTurn} uzavřeno. Pokračujeme rokem ${currentTurn + 1}.`);
    } catch (e) {
      console.error("commit-turn unexpected error:", e);
      toast.error("Neočekávaná chyba při uzavírání kola.");
    } finally {
      setProcessing(false);
      onComplete();
    }
  };

  return { processing, processNextTurn };
}
