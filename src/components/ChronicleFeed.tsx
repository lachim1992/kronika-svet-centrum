import { useState, useEffect } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { addWorldMemory } from "@/hooks/useGameSession";
import { supabase } from "@/integrations/supabase/client";
import { dispatchCommand } from "@/lib/commands";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Sparkles, ChevronLeft, ChevronRight, Globe, Pencil, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import RichText from "@/components/RichText";

type GameEvent = Tables<"game_events">;
type WorldMemory = Tables<"world_memories">;
type ChronicleEntry = Tables<"chronicle_entries">;
type GamePlayer = Tables<"game_players">;
type City = Tables<"cities">;

const SOURCE_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  system: { label: "⚙️ Systém", variant: "outline" },
  founding: { label: "🏗️ Založení", variant: "secondary" },
  chronicle_zero: { label: "⚡ Prolog", variant: "secondary" },
  chronicle: { label: "📜 Kronika", variant: "default" },
};

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
  myRole?: string;
  onEventClick?: (eventId: string) => void;
  onEntityClick?: (type: string, id: string) => void;
  entityIndex?: any;
}

const EPOCH_LABELS: Record<string, string> = {
  myty: "Mýty",
  kroniky: "Kroniky",
  moderni: "Moderní zprávy",
};

const ChronicleFeed = ({
  sessionId, events, memories, chronicles, epochStyle,
  currentTurn, players, currentPlayerName, entityTraits, cities = [], onRefetch, myRole, onEventClick,
  onEntityClick, entityIndex,
}: ChronicleFeedProps) => {
  const isAdmin = myRole === "admin" || myRole === "moderator" || !myRole;
  const [generating, setGenerating] = useState(false);
  const [viewingRound, setViewingRound] = useState<number | null>(null);
  const [rangeMode, setRangeMode] = useState("last_turn");
  const [customFrom, setCustomFrom] = useState("1");
  const [customTo, setCustomTo] = useState(String(currentTurn));
  const [editingEntry, setEditingEntry] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [rewriting, setRewriting] = useState<string | null>(null);

  const displayRound = viewingRound ?? currentTurn;
  const displayEvents = events.filter(e => e.turn_number === displayRound);

  // Check if Chronicle Zero exists
  const hasChronicleZero = chronicles.some(c => {
    const cf = c as any;
    return cf.source_type === "chronicle_zero" || cf.source_type === "founding" ||
      (cf.turn_from != null && cf.turn_from < 1 && cf.turn_to != null && cf.turn_to <= 0);
  });

  // Match chronicles by turn_from/turn_to or text (no filtering — unified stream)
  const roundChronicles = chronicles.filter(c => {
    const cf = c as any;
    // Round 0 = show chronicle_zero / founding entries
    if (displayRound === 0) {
      return cf.source_type === "chronicle_zero" || cf.source_type === "founding" ||
        (cf.turn_from != null && cf.turn_from < 1 && cf.turn_to != null && cf.turn_to <= 0);
    }
    if (cf.turn_from != null && cf.turn_to != null) {
      return displayRound >= cf.turn_from && displayRound <= cf.turn_to;
    }
    return c.text.includes(`Rok ${displayRound}`) || c.text.includes(`rok ${displayRound}`);
  });
  const hasChronicleForRound = roundChronicles.length > 0;

  const getGenerationRange = (): { from: number; to: number } => {
    switch (rangeMode) {
      case "last_turn": return { from: currentTurn, to: currentTurn };
      case "last_5": return { from: Math.max(1, currentTurn - 4), to: currentTurn };
      case "full_year": return { from: 1, to: currentTurn };
      case "custom": return { from: parseInt(customFrom) || 1, to: parseInt(customTo) || currentTurn };
      default: return { from: currentTurn, to: currentTurn };
    }
  };

  // Find turns that already have chronicles
  const getExistingTurns = (): Set<number> => {
    const set = new Set<number>();
    chronicles.forEach(c => {
      const cf = c as any;
      if (cf.turn_from && cf.turn_to) {
        for (let i = cf.turn_from; i <= cf.turn_to; i++) set.add(i);
      } else {
        // Parse from text
        const match = c.text.match(/Rok (\d+)/);
        if (match) set.add(parseInt(match[1]));
      }
    });
    return set;
  };

  const handleGenerate = async () => {
    const range = getGenerationRange();
    const existingTurns = getExistingTurns();

    // Filter out already generated turns
    const turnsToGenerate: number[] = [];
    for (let t = range.from; t <= range.to; t++) {
      if (!existingTurns.has(t)) turnsToGenerate.push(t);
    }

    if (turnsToGenerate.length === 0) {
      toast.info("Všechna kola v tomto rozsahu již mají kroniku.");
      return;
    }

    setGenerating(true);
    try {
      for (const turn of turnsToGenerate) {
        const roundEvents = events.filter(e => e.turn_number === turn);

        // Fetch additional context for this turn from the database
        const eventIds = roundEvents.map(e => e.id);
        const [
          { data: annotationsData },
          { data: responsesData },
          { data: feedCommentsData },
          { data: battlesData },
          { data: declarationsData },
          { data: buildingsData },
          { data: rumorsData },
        ] = await Promise.all([
          eventIds.length > 0
            ? supabase.from("event_annotations").select("*").in("event_id", eventIds)
            : Promise.resolve({ data: [] }),
          eventIds.length > 0
            ? supabase.from("event_responses").select("*").in("event_id", eventIds)
            : Promise.resolve({ data: [] }),
          eventIds.length > 0
            ? supabase.from("feed_comments").select("*").eq("session_id", sessionId).eq("target_type", "event").in("target_id", eventIds)
            : Promise.resolve({ data: [] }),
          supabase.from("battles").select("*").eq("session_id", sessionId).eq("turn_number", turn),
          supabase.from("declarations").select("*").eq("session_id", sessionId).eq("turn_number", turn).eq("status", "published"),
          supabase.from("city_buildings").select("*").eq("session_id", sessionId).eq("completed_turn", turn),
          supabase.from("city_rumors").select("*").eq("session_id", sessionId).eq("turn_number", turn).eq("is_draft", false),
        ]);

        const annotationsWithType = (annotationsData || []).map((a: any) => {
          const evt = roundEvents.find(e => e.id === a.event_id);
          return { ...a, event_type: evt?.event_type || "unknown" };
        });

        // Merge event_responses + feed_comments into player reactions
        const playerReactions = [
          ...(responsesData || []).map((r: any) => ({
            player: r.player,
            text: r.note,
            event_id: r.event_id,
            event_type: roundEvents.find(e => e.id === r.event_id)?.event_type || "unknown",
          })),
          ...(feedCommentsData || []).map((c: any) => ({
            player: c.player_name,
            text: c.comment_text,
            event_id: c.target_id,
            event_type: roundEvents.find(e => e.id === c.target_id)?.event_type || "unknown",
          })),
        ];

        const approvedMemories = memories
          .filter(m => m.approved)
          .map(m => ({ text: m.text, category: (m as any).category }));

        // Skip only if absolutely nothing happened this turn
        const hasAnyContent = roundEvents.length > 0 || (battlesData || []).length > 0 ||
          (declarationsData || []).length > 0 || (buildingsData || []).length > 0 || (rumorsData || []).length > 0;
        if (!hasAnyContent && approvedMemories.length === 0) {
          console.log(`Skipping turn ${turn}: no content at all`);
          continue;
        }

        const { data, error } = await supabase.functions.invoke("world-chronicle-round", {
          body: {
            sessionId,
            round: turn,
            confirmedEvents: roundEvents,
            annotations: annotationsWithType.filter((a: any) => a.visibility !== "private"),
            worldMemories: approvedMemories,
            battles: battlesData || [],
            declarations: declarationsData || [],
            completedBuildings: buildingsData || [],
            rumors: rumorsData || [],
            playerReactions,
            epochStyle,
          },
        });
        if (error) throw error;

        if (data.chronicleText) {
          const chronicleText = `📜 Rok ${turn}\n\n${data.chronicleText}`;
          await dispatchCommand({
            sessionId,
            actor: { name: currentPlayerName, type: "system" },
            commandType: "GENERATE_CHRONICLE",
            commandPayload: { chronicleText, chronicleTurn: turn, epochStyle },
          });
        }

        if (data.newSuggestedMemories?.length) {
          for (const mem of data.newSuggestedMemories) {
            await addWorldMemory(sessionId, mem, false);
          }
        }

        // Log action
        await supabase.from("world_action_log").insert({
          session_id: sessionId,
          player_name: currentPlayerName,
          turn_number: turn,
          action_type: "other",
          description: `Admin vygeneroval kroniku pro rok ${turn}`,
        });
      }

      toast.success(`Kronika vygenerována pro ${turnsToGenerate.length} kol!`);
      onRefetch?.();
    } catch (err) {
      console.error(err);
      toast.error("Generování kroniky selhalo");
    }
    setGenerating(false);
  };

  const handleDelete = async (entryId: string) => {
    const { error } = await supabase.from("chronicle_entries").delete().eq("id", entryId);
    if (error) {
      toast.error("Smazání selhalo");
    } else {
      toast.success("Záznam smazán");
      onRefetch?.();
    }
  };

  const handleSaveEdit = async (entryId: string) => {
    const { error } = await supabase.from("chronicle_entries").update({ text: editText }).eq("id", entryId);
    if (error) {
      toast.error("Uložení selhalo");
    } else {
      toast.success("Upraveno");
      setEditingEntry(null);
      onRefetch?.();
    }
  };

  const handleRewrite = async (entryId: string, turn: number) => {
    setRewriting(entryId);
    try {
      const roundEvents = events.filter(e => e.turn_number === turn);
      const eventIds = roundEvents.map(e => e.id);
      const approvedMemories = memories.filter(m => m.approved).map(m => ({ text: m.text, category: (m as any).category }));

      const [{ data: responsesData }, { data: feedCommentsData }] = await Promise.all([
        supabase.from("event_responses").select("*").in("event_id", eventIds),
        supabase.from("feed_comments").select("*").eq("session_id", sessionId).eq("target_type", "event").in("target_id", eventIds),
      ]);

      const playerReactions = [
        ...(responsesData || []).map((r: any) => ({ player: r.player, text: r.note, event_id: r.event_id })),
        ...(feedCommentsData || []).map((c: any) => ({ player: c.player_name, text: c.comment_text, event_id: c.target_id })),
      ];

      const { data, error } = await supabase.functions.invoke("world-chronicle-round", {
        body: {
          sessionId,
          round: turn,
          confirmedEvents: roundEvents,
          annotations: [],
          worldMemories: approvedMemories,
          playerReactions,
          epochStyle,
        },
      });

      if (error) throw error;

      if (data.chronicleText) {
        await supabase.from("chronicle_entries").update({
          text: `📜 Rok ${turn}\n\n${data.chronicleText}`,
        }).eq("id", entryId);
        toast.success("Kronika přepsána AI");
        onRefetch?.();
      }
    } catch {
      toast.error("Přepis selhal");
    }
    setRewriting(null);
  };

  const epochClass =
    epochStyle === "myty" ? "text-chronicle-myth" :
    epochStyle === "moderni" ? "text-chronicle-modern" : "text-chronicle-medieval";

  const allRounds = hasChronicleZero
    ? [0, ...Array.from({ length: currentTurn }, (_, i) => i + 1)]
    : Array.from({ length: currentTurn }, (_, i) => i + 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-display font-semibold flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          🌍 Kronika světa
          <span className="text-sm font-body text-muted-foreground ml-2">
            ({EPOCH_LABELS[epochStyle] || epochStyle})
          </span>
        </h2>
      </div>

      {/* Admin: Generate Chronicle with Range */}
      {isAdmin && (
        <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-3">
          <p className="text-xs font-display text-muted-foreground">Generovat kroniku (Admin)</p>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={rangeMode} onValueChange={setRangeMode}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="last_turn">Poslední kolo</SelectItem>
                <SelectItem value="last_5">Posledních 5 kol</SelectItem>
                <SelectItem value="full_year">Celý rok</SelectItem>
                <SelectItem value="custom">Vlastní rozsah</SelectItem>
              </SelectContent>
            </Select>

            {rangeMode === "custom" && (
              <>
                <Input type="number" min={1} max={currentTurn} value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)} className="w-16 h-8 text-xs" placeholder="Od" />
                <span className="text-xs">–</span>
                <Input type="number" min={1} max={currentTurn} value={customTo}
                  onChange={e => setCustomTo(e.target.value)} className="w-16 h-8 text-xs" placeholder="Do" />
              </>
            )}

            <Button size="sm" onClick={handleGenerate} disabled={generating} className="h-8 text-xs">
              <Sparkles className="h-3 w-3 mr-1" />
              {generating ? "Generuji..." : "Generovat kroniku"}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Již vygenerovaná kola budou přeskočena.
          </p>
        </div>
      )}


      {/* Round Navigation */}
      <div className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted/20">
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={displayRound <= (hasChronicleZero ? 0 : 1)}
          onClick={() => setViewingRound(Math.max(hasChronicleZero ? 0 : 1, displayRound - 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex gap-1 flex-wrap flex-1 justify-center">
          {allRounds.map(r => {
            const hasChr = chronicles.some(c => {
              const cf = c as any;
              if (r === 0) return cf.source_type === "chronicle_zero" || cf.source_type === "founding" ||
                (cf.turn_from != null && cf.turn_from < 1 && cf.turn_to != null && cf.turn_to <= 0);
              if (cf.turn_from && cf.turn_to) return r >= cf.turn_from && r <= cf.turn_to;
              return c.text.includes(`Rok ${r}`);
            });
            return (
              <Button key={r} variant={r === displayRound ? "default" : hasChr ? "secondary" : "ghost"}
                size="sm" className={`h-7 ${r === 0 ? "px-2" : "w-7 p-0"} text-xs ${!hasChr && r !== displayRound ? "opacity-40" : ""}`}
                onClick={() => setViewingRound(r)}>{r === 0 ? "⚡0" : r}</Button>
            );
          })}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={displayRound >= currentTurn}
          onClick={() => setViewingRound(Math.min(currentTurn, displayRound + 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Chronicle Entry for Displayed Round */}
      {hasChronicleForRound && (
        <div className="space-y-3">
          {roundChronicles.map((entry) => {
            const turnMatch = entry.text.match(/Rok (\d+)/);
            const entryTurn = turnMatch ? parseInt(turnMatch[1]) : displayRound;

            return (
              <div key={entry.id}
                className={`p-5 rounded-lg border-2 border-primary/30 bg-card shadow-parchment animate-fade-in ${epochClass}`}>
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="h-5 w-5 text-primary" />
                  <span className="font-display font-semibold">
                    {displayRound === 0 ? "⚡ Prahistorie — Kronika Prvních Věků" : `Kronika roku ${displayRound}`}
                  </span>
                  {(() => {
                    const st = (entry as any).source_type;
                    const badgeInfo = SOURCE_BADGE[st];
                    return badgeInfo ? (
                      <Badge variant={badgeInfo.variant} className="text-xs ml-auto">{badgeInfo.label}</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs ml-auto">
                        {EPOCH_LABELS[entry.epoch_style] || entry.epoch_style}
                      </Badge>
                    );
                  })()}
                </div>

                {editingEntry === entry.id ? (
                  <div className="space-y-2">
                    <Textarea value={editText} onChange={e => setEditText(e.target.value)} rows={8} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleSaveEdit(entry.id)}>Uložit</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingEntry(null)}>Zrušit</Button>
                    </div>
                  </div>
                ) : (
                  <RichText text={entry.text} onEventClick={onEventClick} onEntityClick={onEntityClick} entityIndex={entityIndex} className="text-sm leading-relaxed whitespace-pre-wrap" />
                )}

                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString("cs-CZ")}
                  </span>
                  {isAdmin && editingEntry !== entry.id && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 text-xs"
                        onClick={() => { setEditingEntry(entry.id); setEditText(entry.text); }}>
                        <Pencil className="h-3 w-3 mr-1" /> Upravit
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs"
                        disabled={rewriting === entry.id}
                        onClick={() => handleRewrite(entry.id, entryTurn)}>
                        <RefreshCw className={`h-3 w-3 mr-1 ${rewriting === entry.id ? "animate-spin" : ""}`} />
                        Přepsat AI
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive"
                        onClick={() => handleDelete(entry.id)}>
                        <Trash2 className="h-3 w-3 mr-1" /> Smazat
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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
          {isAdmin && (
            <Button size="sm" variant="outline" className="mt-2 text-xs"
              onClick={() => { setRangeMode("custom"); setCustomFrom(String(displayRound)); setCustomTo(String(displayRound)); }}>
              Generovat pro tento rok
            </Button>
          )}
        </div>
      )}

      {/* Current turn - allow draft generation */}
      {displayRound === currentTurn && !hasChronicleForRound && (
        <div className="text-center py-6">
          <p className="text-muted-foreground italic text-sm">
            Rok {currentTurn} probíhá...
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {displayEvents.length} událostí zatím
          </p>
          {isAdmin && displayEvents.length > 0 && (
            <Button size="sm" variant="outline" className="mt-3 text-xs"
              onClick={() => { setRangeMode("custom"); setCustomFrom(String(currentTurn)); setCustomTo(String(currentTurn)); handleGenerate(); }}
              disabled={generating}>
              <Sparkles className="h-3 w-3 mr-1" />
              {generating ? "Generuji draft..." : "Generovat draft kroniku"}
            </Button>
          )}
        </div>
      )}

      {/* Full Archive */}
      {chronicles.length > 0 && displayRound === currentTurn && (
        <details className="mt-4">
          <summary className="cursor-pointer font-display text-sm text-muted-foreground hover:text-foreground flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            📚 Celé dějiny ({chronicles.length} zápisů)
          </summary>
          <div className="space-y-3 mt-3 max-h-[50vh] overflow-y-auto pr-1">
            {[...chronicles].reverse().map((entry) => (
              <div key={entry.id} className={`p-4 rounded-lg border border-border bg-card shadow-parchment ${epochClass}`}>
                <div className="text-xs text-muted-foreground mb-2 font-display">
                  {EPOCH_LABELS[entry.epoch_style] || entry.epoch_style} • {new Date(entry.created_at).toLocaleString("cs-CZ")}
                </div>
                <RichText text={entry.text} onEventClick={onEventClick} onEntityClick={onEntityClick} entityIndex={entityIndex} className="text-sm leading-relaxed whitespace-pre-wrap" />
              </div>
            ))}
          </div>
        </details>
      )}

      {chronicles.length === 0 && displayRound === currentTurn && displayEvents.length === 0 && (
        <p className="text-muted-foreground text-center py-4 italic">
          Kronika je prázdná... zadejte události.
        </p>
      )}
    </div>
  );
};

export default ChronicleFeed;
