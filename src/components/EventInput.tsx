import { useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PenLine, AlertTriangle, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import EventExtractorReview, { type DetectedEvent } from "./EventExtractorReview";

type City = Tables<"cities">;
type GamePlayer = Tables<"game_players">;

const EVENT_TYPES = [
  { value: "place_tile", label: "Položení dílku" },
  { value: "found_settlement", label: "Založení osady" },
  { value: "upgrade_city", label: "Upgrade města" },
  { value: "raid", label: "Nájezd" },
  { value: "repair", label: "Oprava území" },
  { value: "battle", label: "Bitva" },
  { value: "diplomacy", label: "Diplomacie" },
  { value: "city_state_action", label: "Akce městského státu" },
  { value: "trade", label: "Obchod" },
  { value: "wonder", label: "Div světa" },
  { value: "declaration", label: "Vyhlášení" },
];

const TRUTH_STATES = [
  { value: "canon", label: "📜 Kanonické (pravda)" },
  { value: "rumor", label: "👂 Zvěst (nepotvrzené)" },
  { value: "propaganda", label: "📢 Propaganda (spin)" },
];

const IMPORTANCE_LEVELS = [
  { value: "normal", label: "Normální" },
  { value: "memorable", label: "📌 Důležitá" },
  { value: "legendary", label: "⭐ Legendární" },
];

const DUAL_CITY_EVENTS = ["battle", "trade", "diplomacy"];

interface EventInputProps {
  sessionId: string;
  players: GamePlayer[];
  cities: City[];
  currentTurn: number;
  turnClosed: boolean;
  onEventAdded?: () => void;
}

const EventInput = ({ sessionId, players, cities, currentTurn, turnClosed, onEventAdded }: EventInputProps) => {
  const [eventType, setEventType] = useState("");
  const [player, setPlayer] = useState("");
  const [cityId, setCityId] = useState("");
  const [secondaryCityId, setSecondaryCityId] = useState("");
  const [note, setNote] = useState("");
  const [truthState, setTruthState] = useState("canon");
  const [importance, setImportance] = useState("normal");
  const [loading, setLoading] = useState(false);

  // Event extraction state
  const [extracting, setExtracting] = useState(false);
  const [detectedEvents, setDetectedEvents] = useState<DetectedEvent[] | null>(null);
  const [savedEventId, setSavedEventId] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!eventType || !player) {
      toast.error("Vyberte typ události a hráče");
      return;
    }
    if (!cityId) {
      toast.error("Vyberte město pro tuto událost");
      return;
    }
    setLoading(true);

    const selectedCity = cities.find(c => c.id === cityId);
    const locationName = selectedCity?.name || "";

    const { data: inserted, error } = await supabase.from("game_events").insert({
      session_id: sessionId,
      event_type: eventType,
      player,
      location: locationName,
      note: note || null,
      turn_number: currentTurn,
      city_id: cityId,
      secondary_city_id: secondaryCityId || null,
      truth_state: truthState,
      importance,
    } as any).select("id").single();

    if (error) {
      console.error(error);
      toast.error("Chyba při zápisu události");
      setLoading(false);
      return;
    }

    // Log to immutable action log
    await supabase.from("world_action_log").insert({
      session_id: sessionId,
      player_name: player,
      turn_number: currentTurn,
      action_type: eventType === "battle" || eventType === "raid" ? "battle" :
        eventType === "diplomacy" ? "diplomacy" :
        eventType === "trade" ? "trade" :
        eventType === "upgrade_city" || eventType === "found_settlement" ? "build" :
        eventType === "declaration" ? "declaration" : "event",
      description: `${EVENT_TYPES.find(t => t.value === eventType)?.label || eventType} @ ${locationName}${note ? ` — "${note}"` : ""}`,
      metadata: { event_type: eventType, city: locationName, importance, truth_state: truthState },
    });

    toast.success(importance === "legendary" ? "⭐ Legendární událost zaznamenána!" : "Událost zaznamenána");
    setSavedEventId(inserted?.id || null);
    setLoading(false);

    // If there's note text, run event extraction
    if (note && note.length > 10) {
      await runExtraction(note);
    } else {
      resetForm();
      onEventAdded?.();
    }
  };

  const runExtraction = async (text: string) => {
    setExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-events", {
        body: { text, sessionId },
      });
      if (error) throw error;
      if (data?.detectedEvents?.length > 0) {
        setDetectedEvents(data.detectedEvents);
      } else {
        resetForm();
        onEventAdded?.();
      }
    } catch (e) {
      console.error("Extract events error:", e);
      // Don't block - just continue without extraction
      resetForm();
      onEventAdded?.();
    } finally {
      setExtracting(false);
    }
  };

  const handleExtractorConfirm = async (references: any[], updatedText: string) => {
    // Update the game_event note with inline links if changed
    if (savedEventId && updatedText !== note) {
      await supabase.from("game_events").update({ note: updatedText } as any).eq("id", savedEventId);
    }
    toast.success(`Propojeno ${references.length} událostí`);
    resetForm();
    onEventAdded?.();
  };

  const handleExtractorCancel = () => {
    setDetectedEvents(null);
    resetForm();
    onEventAdded?.();
  };

  const resetForm = () => {
    setEventType(""); setPlayer(""); setCityId(""); setSecondaryCityId("");
    setNote(""); setTruthState("canon"); setImportance("normal");
    setDetectedEvents(null); setSavedEventId(null);
  };

  if (turnClosed) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-display font-semibold flex items-center gap-2">
          <PenLine className="h-5 w-5 text-primary" />
          Rok {currentTurn}
        </h2>
        <p className="text-muted-foreground text-center py-8 italic">
          Vaše kolo je uzavřeno. Čekáme na ostatní hráče...
        </p>
      </div>
    );
  }

  // Show extraction review UI
  if (detectedEvents) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-display font-semibold flex items-center gap-2">
          <PenLine className="h-5 w-5 text-primary" />
          Rok {currentTurn} — Propojení událostí
        </h2>
        <EventExtractorReview
          sessionId={sessionId}
          detectedEvents={detectedEvents}
          sourceText={note}
          onConfirm={handleExtractorConfirm}
          onCancel={handleExtractorCancel}
        />
      </div>
    );
  }

  // Show extracting spinner
  if (extracting) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-display font-semibold flex items-center gap-2">
          <PenLine className="h-5 w-5 text-primary" />
          Rok {currentTurn}
        </h2>
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Analyzuji text na zmínky událostí...</span>
        </div>
      </div>
    );
  }

  const showSecondaryCity = DUAL_CITY_EVENTS.includes(eventType);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-semibold flex items-center gap-2">
        <PenLine className="h-5 w-5 text-primary" />
        Rok {currentTurn} — Zapsat událost
      </h2>

      {cities.length === 0 && (
        <div className="p-3 rounded-lg border border-yellow-500/50 bg-yellow-500/10 flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
          <span>Nejprve musíte založit město v záložce <strong>Města</strong>.</span>
        </div>
      )}

      <Select value={eventType} onValueChange={setEventType}>
        <SelectTrigger className="h-11"><SelectValue placeholder="Typ události..." /></SelectTrigger>
        <SelectContent>
          {EVENT_TYPES.map((et) => (
            <SelectItem key={et.value} value={et.value}>{et.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={player} onValueChange={setPlayer}>
        <SelectTrigger className="h-11"><SelectValue placeholder="Hráč..." /></SelectTrigger>
        <SelectContent>
          {players.map(p => (
            <SelectItem key={p.id} value={p.player_name}>{p.player_name}</SelectItem>
          ))}
          <SelectItem value="NPC">NPC</SelectItem>
        </SelectContent>
      </Select>

      <Select value={cityId || "__none__"} onValueChange={v => setCityId(v === "__none__" ? "" : v)}>
        <SelectTrigger className="h-11"><SelectValue placeholder="Město (povinné)..." /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— Vyberte město —</SelectItem>
          {cities.map(c => (
            <SelectItem key={c.id} value={c.id}>{c.name} ({c.owner_player})</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showSecondaryCity && (
        <Select value={secondaryCityId || "__none__"} onValueChange={v => setSecondaryCityId(v === "__none__" ? "" : v)}>
          <SelectTrigger className="h-11"><SelectValue placeholder="Druhé město (volitelné)..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— Žádné —</SelectItem>
            {cities.filter(c => c.id !== cityId).map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name} ({c.owner_player})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Select value={truthState} onValueChange={setTruthState}>
          <SelectTrigger className="h-11"><SelectValue placeholder="Stav pravdy..." /></SelectTrigger>
          <SelectContent>
            {TRUTH_STATES.map(ts => (
              <SelectItem key={ts.value} value={ts.value}>{ts.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={importance} onValueChange={setImportance}>
          <SelectTrigger className="h-11"><SelectValue placeholder="Důležitost..." /></SelectTrigger>
          <SelectContent>
            {IMPORTANCE_LEVELS.map(il => (
              <SelectItem key={il.value} value={il.value}>{il.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Textarea
        placeholder="Poznámka / flavor text (volitelné) — AI automaticky detekuje zmíněné události"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
      />

      <Button onClick={handleSubmit} disabled={loading || cities.length === 0} className="w-full h-12 font-display text-base">
        {loading ? "Zapisuji..." : importance === "legendary" ? "⭐ Zapsat legendární událost" : "✅ Zapsat událost"}
      </Button>
    </div>
  );
};

export default EventInput;
