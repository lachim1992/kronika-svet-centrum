import { useState, useEffect } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { addChronicleEntry, addWorldMemory, closeTurnForPlayer, advanceTurn } from "@/hooks/useGameSession";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Sparkles, Lock, CheckCircle2, ChevronLeft, ChevronRight, Newspaper, Globe } from "lucide-react";
import { toast } from "sonner";

type GameEvent = Tables<"game_events">;
type WorldMemory = Tables<"world_memories">;
type ChronicleEntry = Tables<"chronicle_entries">;
type GamePlayer = Tables<"game_players">;
type City = Tables<"cities">;

interface ChronicleFeedProps {
  sessionId: string;
  events: GameEvent[];
  memories: WorldMemory[];
  chronicles: ChronicleEntry[];
  epochStyle: string;
  currentTurn: number;
  players: GamePlayer[];
  currentPlayerName: string;
  entityTraits?: any[];
  cities?: City[];
  onRefetch?: () => void;
}

const EPOCH_LABELS: Record<string, string> = {
  myty: "Mýty",
  kroniky: "Kroniky",
  moderni: "Moderní zprávy",
};

const ChronicleFeed = ({
  sessionId, events, memories, chronicles, epochStyle,
  currentTurn, players, currentPlayerName, entityTraits, cities = [], onRefetch,
}: ChronicleFeedProps) => {
  const [generating, setGenerating] = useState(false);
  const [generatingRumors, setGeneratingRumors] = useState(false);
  const [viewingRound, setViewingRound] = useState<number | null>(null);
  const [rumors, setRumors] = useState<any[]>([]);

  const currentPlayer = players.find(p => p.player_name === currentPlayerName);
  const myTurnClosed = currentPlayer?.turn_closed || false;
  const allClosed = players.length > 0 && players.every(p => p.turn_closed);

  // Fetch intelligence reports (rumors) for current session
  useEffect(() => {
    const fetchRumors = async () => {
      const { data } = await supabase
        .from("intelligence_reports")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_round", { ascending: false });
      if (data) setRumors(data);
    };
    fetchRumors();
  }, [sessionId, chronicles.length]);

  // Active display round
  const displayRound = viewingRound ?? currentTurn;
  const displayEvents = events.filter(e => e.turn_number === displayRound);

  // Find chronicle entries for displayed round
  const roundChronicles = chronicles.filter(c =>
    c.text.includes(`Rok ${displayRound}`) || c.text.includes(`rok ${displayRound}`)
  );
  const roundRumors = rumors.filter(r => (r as any).created_round === displayRound);
  const hasChronicleForRound = roundChronicles.length > 0;

  const handleCloseTurn = async () => {
    if (!currentPlayer) return;
    await closeTurnForPlayer(sessionId, currentPlayer.player_number);
    toast.success("Vaše kolo uzavřeno. Čekáme na ostatní hráče.");
    onRefetch?.();
  };

  const handleGenerateAndAdvance = async () => {
    const roundEvents = events.filter(e => e.turn_number === currentTurn);
    if (roundEvents.length === 0) {
      toast.error("V tomto kole nejsou žádné události");
      return;
    }

    setGenerating(true);
    try {
      // 1. Fetch all annotations for this round's events
      const eventIds = roundEvents.map(e => e.id);
      const { data: annotationsData } = await supabase
        .from("event_annotations")
        .select("*")
        .in("event_id", eventIds);

      const annotationsWithType = (annotationsData || []).map(a => {
        const evt = roundEvents.find(e => e.id === a.event_id);
        return { ...a, event_type: evt?.event_type || "unknown" };
      });

      // 2. Gather approved world memories
      const approvedMemories = memories
        .filter(m => m.approved)
        .map(m => ({ text: m.text, category: (m as any).category }));

      // 3. Call the new world-chronicle-round endpoint
      const { data, error } = await supabase.functions.invoke("world-chronicle-round", {
        body: {
          round: currentTurn,
          confirmedEvents: roundEvents,
          annotations: annotationsWithType.filter(a => a.visibility !== "private"),
          worldMemories: approvedMemories,
          epochStyle,
        },
      });

      if (error) throw error;

      // 4. Store chronicle entry
      if (data.chronicleText) {
        await addChronicleEntry(sessionId, `📜 Rok ${currentTurn}\n\n${data.chronicleText}`, epochStyle, currentTurn);
      }

      // 5. Store suggested memories
      if (data.newSuggestedMemories?.length) {
        for (const mem of data.newSuggestedMemories) {
          await addWorldMemory(sessionId, mem, false);
        }
        toast.success(`Navrženo ${data.newSuggestedMemories.length} nových vzpomínek`);
      }

      // 6. Generate rumors/news for this round
      try {
        setGeneratingRumors(true);
        const leakableAnnotations = (annotationsData || []).filter(a => a.visibility === "leakable");

        const { data: rumorsData } = await supabase.functions.invoke("news-rumors", {
          body: {
            round: currentTurn,
            confirmedEvents: roundEvents,
            leakableNotes: leakableAnnotations,
            diplomacyMessages: [],
            epochStyle,
          },
        });

        if (rumorsData?.rumors?.length) {
          for (const rumor of rumorsData.rumors) {
            await supabase.from("intelligence_reports").insert({
              session_id: sessionId,
              report_text: rumor.text,
              source_type: rumor.type === "verified" ? "confirmed_report" : rumor.type === "propaganda" ? "propaganda" : "merchant_gossip",
              target_entity: rumor.cityReference || "world",
              visible_to: "all",
              created_round: currentTurn,
              secrecy_level: rumor.type === "verified" ? "confirmed" : "uncertain",
              is_rumor_public: true,
            });
          }
          toast.success(`📰 ${rumorsData.rumors.length} zvěstí zaznamenáno`);
        }
        setGeneratingRumors(false);
      } catch {
        setGeneratingRumors(false);
      }

      // 7. Check for world crisis
      try {
        const { data: crisisData } = await supabase.functions.invoke("world-crisis", {
          body: {
            gameState: {
              currentTurn, playerCount: players.length,
              cityCount: cities.length, events: roundEvents.slice(-10),
            }
          }
        });
        if (crisisData?.crisis) {
          await supabase.from("world_crises").insert({
            session_id: sessionId,
            crisis_type: crisisData.crisis.crisis_type,
            title: crisisData.crisis.title,
            description: crisisData.crisis.description,
            affected_cities: crisisData.crisis.affected_cities,
            trigger_round: currentTurn,
          } as any);
          toast.warning(`⚠️ Světová krize: ${crisisData.crisis.title}`);
        }
      } catch { /* optional */ }

      // 8. Advance turn
      await advanceTurn(sessionId, currentTurn);
      toast.success(`Kronika roku ${currentTurn} zapsána! Pokračujeme rokem ${currentTurn + 1}.`);
      onRefetch?.();
    } catch (err) {
      console.error(err);
      toast.error("Generování kroniky selhalo");
    }
    setGenerating(false);
  };

  const epochClass =
    epochStyle === "myty" ? "text-chronicle-myth" :
    epochStyle === "moderni" ? "text-chronicle-modern" : "text-chronicle-medieval";

  // Calculate available rounds
  const allRounds = Array.from({ length: currentTurn }, (_, i) => i + 1);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-display font-semibold flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          🌍 Kronika světa
          <span className="text-sm font-body text-muted-foreground ml-2">
            ({EPOCH_LABELS[epochStyle] || epochStyle})
          </span>
        </h2>
      </div>

      {/* Round Navigation */}
      <div className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted/20">
        <Button
          variant="ghost" size="icon" className="h-7 w-7"
          disabled={displayRound <= 1}
          onClick={() => setViewingRound(Math.max(1, displayRound - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex gap-1 flex-wrap flex-1 justify-center">
          {allRounds.map(r => {
            const hasChr = chronicles.some(c => c.text.includes(`Rok ${r}`));
            return (
              <Button
                key={r}
                variant={r === displayRound ? "default" : hasChr ? "secondary" : "ghost"}
                size="sm"
                className={`h-7 w-7 p-0 text-xs ${!hasChr && r !== displayRound ? "opacity-40" : ""}`}
                onClick={() => setViewingRound(r)}
              >
                {r}
              </Button>
            );
          })}
        </div>

        <Button
          variant="ghost" size="icon" className="h-7 w-7"
          disabled={displayRound >= currentTurn}
          onClick={() => setViewingRound(Math.min(currentTurn, displayRound + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Latest Chronicle Entry (Hero) */}
      {displayRound === currentTurn && !hasChronicleForRound && (
        <>
          {/* Turn closure */}
          <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-2">
            <p className="text-sm font-display font-semibold">Rok {currentTurn} — Uzavření kola</p>
            {players.map(p => (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                {p.turn_closed ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : (
                  <Lock className="h-4 w-4 text-muted-foreground" />
                )}
                <span className={p.turn_closed ? "text-primary" : "text-muted-foreground"}>
                  {p.player_name}: {p.turn_closed ? "Uzavřeno" : "Čeká"}
                </span>
              </div>
            ))}

            <div className="text-xs text-muted-foreground">
              {displayEvents.length} událostí v tomto kole
            </div>

            {!myTurnClosed && (
              <Button
                onClick={handleCloseTurn}
                variant="outline"
                className="w-full h-10 font-display mt-2"
                disabled={displayEvents.length === 0}
                type="button"
              >
                <Lock className="mr-2 h-4 w-4" />
                Uzavřít mé kolo
              </Button>
            )}

            {myTurnClosed && !allClosed && (
              <p className="text-xs text-muted-foreground italic text-center">
                Čekáme na ostatní hráče...
              </p>
            )}

            {allClosed && (
              <Button
                onClick={handleGenerateAndAdvance}
                disabled={generating}
                className="w-full h-11 font-display mt-2"
                type="button"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {generating ? "Generuji kroniku + zprávy..." : `✅ Zapsat kroniku roku ${currentTurn}`}
              </Button>
            )}
          </div>
        </>
      )}

      {/* Chronicle Entry for Displayed Round */}
      {hasChronicleForRound && (
        <div className="space-y-3">
          {roundChronicles.map((entry) => (
            <div
              key={entry.id}
              className={`p-5 rounded-lg border-2 border-primary/30 bg-card shadow-parchment animate-fade-in ${epochClass}`}
            >
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="h-5 w-5 text-primary" />
                <span className="font-display font-semibold">Kronika roku {displayRound}</span>
                <Badge variant="secondary" className="text-xs ml-auto">
                  {EPOCH_LABELS[entry.epoch_style] || entry.epoch_style}
                </Badge>
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{entry.text}</p>
              <div className="text-xs text-muted-foreground mt-3">
                {new Date(entry.created_at).toLocaleString("cs-CZ")}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No chronicle for past round */}
      {!hasChronicleForRound && displayRound < currentTurn && (
        <div className="text-center py-6">
          <p className="text-muted-foreground italic text-sm">
            Rok {displayRound} nemá záznam v kronice.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {displayEvents.length} událostí v tomto kole
          </p>
        </div>
      )}

      {/* Rumors / News for the round */}
      {roundRumors.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-display font-semibold text-sm flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-primary" />
            📰 Zvěsti a zprávy roku {displayRound}
          </h3>
          <div className="space-y-2">
            {roundRumors.map((r: any) => (
              <div key={r.id} className="p-3 rounded-lg border border-border bg-muted/20 text-sm">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={
                    r.source_type === "confirmed_report" ? "default" :
                    r.source_type === "propaganda" ? "destructive" : "outline"
                  } className="text-xs">
                    {r.source_type === "confirmed_report" ? "✅ Ověřeno" :
                     r.source_type === "propaganda" ? "📢 Propaganda" : "👂 Zvěst"}
                  </Badge>
                  {r.target_entity && r.target_entity !== "world" && (
                    <span className="text-xs text-muted-foreground">📍 {r.target_entity}</span>
                  )}
                </div>
                <p className="leading-relaxed">{r.report_text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full Chronicle Archive */}
      {chronicles.length > 0 && displayRound === currentTurn && (
        <details className="mt-4">
          <summary className="cursor-pointer font-display text-sm text-muted-foreground hover:text-foreground flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            📚 Celé dějiny ({chronicles.length} zápisů)
          </summary>
          <div className="space-y-3 mt-3 max-h-[50vh] overflow-y-auto pr-1">
            {[...chronicles].reverse().map((entry) => (
              <div
                key={entry.id}
                className={`p-4 rounded-lg border border-border bg-card shadow-parchment animate-fade-in ${epochClass}`}
              >
                <div className="text-xs text-muted-foreground mb-2 font-display">
                  {EPOCH_LABELS[entry.epoch_style] || entry.epoch_style} • {new Date(entry.created_at).toLocaleString("cs-CZ")}
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{entry.text}</p>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Empty state */}
      {chronicles.length === 0 && displayRound === currentTurn && displayEvents.length === 0 && (
        <p className="text-muted-foreground text-center py-4 italic">
          Kronika je prázdná... zadejte události a uzavřete kolo.
        </p>
      )}
    </div>
  );
};

export default ChronicleFeed;
