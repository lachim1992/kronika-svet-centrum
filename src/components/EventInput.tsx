import { useState } from "react";
import { addGameEvent } from "@/hooks/useGameSession";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PenLine } from "lucide-react";
import { toast } from "sonner";

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
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!eventType || !player) {
      toast.error("Vyberte typ události a hráče");
      return;
    }
    setLoading(true);
    await addGameEvent(sessionId, eventType, player, location, note, currentTurn);
    setLoading(false);
    setEventType(""); setPlayer(""); setLocation(""); setNote("");
    toast.success("Událost zaznamenána");
    onEventAdded?.();
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

  // Build location options from cities
  const cityNames = cities.map(c => c.name);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-semibold flex items-center gap-2">
        <PenLine className="h-5 w-5 text-primary" />
        Rok {currentTurn} — Zapsat událost
      </h2>

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

      <Select value={location || "__none__"} onValueChange={(v) => setLocation(v === "__none__" ? "" : v)}>
        <SelectTrigger className="h-11"><SelectValue placeholder="Místo (volitelné)..." /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— Žádné —</SelectItem>
          {cityNames.map(cn => (
            <SelectItem key={cn} value={cn}>{cn}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Textarea
        placeholder="Poznámka / flavor text (volitelné)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
      />

      <Button onClick={handleSubmit} disabled={loading} className="w-full h-12 font-display text-base">
        {loading ? "Zapisuji..." : "✅ Zapsat událost"}
      </Button>
    </div>
  );
};

export default EventInput;
