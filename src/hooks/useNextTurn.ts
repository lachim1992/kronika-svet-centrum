import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
        return;
      }

      const result = data;
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
