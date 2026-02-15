import { useState } from "react";
import { addGameEvent } from "@/hooks/useGameSession";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { PenLine, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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
  const [loading, setLoading] = useState(false);

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

    // Insert event with city_id
    const { error } = await supabase.from("game_events").insert({
      session_id: sessionId,
      event_type: eventType,
      player,
      location: locationName,
      note: note || null,
      turn_number: currentTurn,
      city_id: cityId,
      secondary_city_id: secondaryCityId || null,
    } as any);

    if (error) {
      console.error(error);
      toast.error("Chyba při zápisu události");
    } else {
      toast.success("Událost zaznamenána");
      onEventAdded?.();
    }

    setLoading(false);
    setEventType(""); setPlayer(""); setCityId(""); setSecondaryCityId(""); setNote("");
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
          <span>Nejprve musíte založit město v záložce <strong>Města</strong>, než budete moci zapisovat události.</span>
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

      <Textarea
        placeholder="Poznámka / flavor text (volitelné)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
      />

      <Button onClick={handleSubmit} disabled={loading || cities.length === 0} className="w-full h-12 font-display text-base">
        {loading ? "Zapisuji..." : "✅ Zapsat událost"}
      </Button>
    </div>
  );
};

export default EventInput;
