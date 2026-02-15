import { useState } from "react";
import { addGameEvent } from "@/hooks/useGameSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PenLine } from "lucide-react";
import { toast } from "sonner";

const EVENT_TYPES = [
  { value: "place_tile", label: "Položení dílku" },
  { value: "found_settlement", label: "Založení osady" },
  { value: "upgrade_city", label: "Upgrade města" },
  { value: "raid", label: "Nájezd" },
  { value: "repair", label: "Oprava území" },
  { value: "battle", label: "Bitva" },
  { value: "diplomacy", label: "Diplomacie" },
  { value: "city_state_action", label: "Akce městského státu" },
];

interface EventInputProps {
  sessionId: string;
  player1Name: string;
  player2Name: string;
  currentTurn: number;
  turnClosed: boolean;
}

const EventInput = ({ sessionId, player1Name, player2Name, currentTurn, turnClosed }: EventInputProps) => {
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
    setEventType("");
    setPlayer("");
    setLocation("");
    setNote("");
    toast.success("Událost zaznamenána");
  };

  if (turnClosed) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-display font-semibold flex items-center gap-2">
          <PenLine className="h-5 w-5 text-primary" />
          Rok {currentTurn}
        </h2>
        <p className="text-muted-foreground text-center py-8 italic">
          Čekáme na uzavření kola oběma hráči...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-semibold flex items-center gap-2">
        <PenLine className="h-5 w-5 text-primary" />
        Rok {currentTurn} — Zapsat událost
      </h2>

      <Select value={eventType} onValueChange={setEventType}>
        <SelectTrigger className="h-11">
          <SelectValue placeholder="Typ události..." />
        </SelectTrigger>
        <SelectContent>
          {EVENT_TYPES.map((et) => (
            <SelectItem key={et.value} value={et.value}>{et.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={player} onValueChange={setPlayer}>
        <SelectTrigger className="h-11">
          <SelectValue placeholder="Hráč..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={player1Name}>{player1Name}</SelectItem>
          <SelectItem value={player2Name}>{player2Name}</SelectItem>
          <SelectItem value="NPC">NPC</SelectItem>
        </SelectContent>
      </Select>

      <Input
        placeholder="Místo / provincie (volitelné)"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        className="h-11"
      />

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
