import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, Skull, Star } from "lucide-react";
import { toast } from "sonner";

type City = Tables<"cities">;

const PERSON_TYPES = [
  { value: "Generál", label: "⚔️ Generál" },
  { value: "Kronikář", label: "📜 Kronikář" },
  { value: "Obchodní princ", label: "💰 Obchodní princ" },
  { value: "Prorok", label: "🔮 Prorok" },
  { value: "Architekt", label: "🏛️ Architekt divů" },
  { value: "Špion", label: "🗡️ Špion" },
  { value: "Admirál", label: "⚓ Admirál" },
];

interface GreatPersonsPanelProps {
  sessionId: string;
  currentPlayerName: string;
  greatPersons: any[];
  cities: City[];
  currentTurn: number;
  onRefetch?: () => void;
}

const GreatPersonsPanel = ({ sessionId, currentPlayerName, greatPersons, cities, currentTurn, onRefetch }: GreatPersonsPanelProps) => {
  const [name, setName] = useState("");
  const [personType, setPersonType] = useState("");
  const [cityId, setCityId] = useState("");
  const [flavor, setFlavor] = useState("");
  const [adding, setAdding] = useState(false);

  const myCities = cities.filter(c => c.owner_player === currentPlayerName);

  const handleAdd = async () => {
    if (!name.trim() || !personType) { toast.error("Jméno a typ jsou povinné"); return; }
    setAdding(true);
    await supabase.from("great_persons").insert({
      session_id: sessionId, player_name: currentPlayerName, name: name.trim(),
      person_type: personType, city_id: cityId || null,
      flavor_trait: flavor.trim() || null, born_round: currentTurn,
    });
    toast.success(`${name} vstoupil/a do dějin!`);
    setName(""); setPersonType(""); setCityId(""); setFlavor("");
    onRefetch?.();
    setAdding(false);
  };

  const handleKill = async (personId: string, personName: string) => {
    await supabase.from("great_persons").update({ is_alive: false, died_round: currentTurn }).eq("id", personId);
    toast.success(`${personName} padl/a v roce ${currentTurn}`);
    onRefetch?.();
  };

  const myPersons = greatPersons.filter((p: any) => p.player_name === currentPlayerName);
  const otherPersons = greatPersons.filter((p: any) => p.player_name !== currentPlayerName);

  return (
    <div className="space-y-6 px-4">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-decorative font-bold flex items-center justify-center gap-3">
          <Star className="h-7 w-7 text-illuminated" />
          Velké osobnosti
        </h1>
        <p className="text-sm text-muted-foreground">Legendární hrdinové a géniové vaší civilizace</p>
      </div>

      {/* Add new person */}
      <div className="manuscript-card p-5 space-y-3">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <Plus className="h-4 w-4" /> Nová osobnost
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input placeholder="Jméno (např. Generál Lada)" value={name} onChange={e => setName(e.target.value)} />
          <Select value={personType} onValueChange={setPersonType}>
            <SelectTrigger><SelectValue placeholder="Typ osobnosti..." /></SelectTrigger>
            <SelectContent>
              {PERSON_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={cityId || "__none__"} onValueChange={v => setCityId(v === "__none__" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Domovské město..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Bez města —</SelectItem>
              {myCities.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Rys / přezdívka (volitelné)" value={flavor} onChange={e => setFlavor(e.target.value)} />
        </div>
        <Button onClick={handleAdd} disabled={adding} className="w-full font-display">
          {adding ? "Zapisuji..." : "✨ Zapsat do dějin"}
        </Button>
      </div>

      {/* My persons */}
      <div className="space-y-3">
        <h3 className="font-display font-semibold text-sm">Vaše osobnosti ({myPersons.length})</h3>
        {myPersons.length === 0 && <p className="text-xs text-muted-foreground italic text-center py-4">Žádné velké osobnosti.</p>}
        {myPersons.map((p: any) => {
          const city = cities.find(c => c.id === p.city_id);
          return (
            <div key={p.id} className={`manuscript-card p-4 flex items-center gap-3 ${!p.is_alive ? "opacity-60" : ""}`}>
              <div className="flex-1">
                <p className="font-display font-bold text-sm">
                  {p.name}
                  {!p.is_alive && <Skull className="inline h-4 w-4 ml-1 text-muted-foreground" />}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant="secondary" className="text-xs">{p.person_type}</Badge>
                  {city && <span className="text-xs text-muted-foreground">📍 {city.name}</span>}
                  {p.flavor_trait && <span className="text-xs italic text-muted-foreground">„{p.flavor_trait}"</span>}
                  <span className="text-xs text-muted-foreground">
                    Nar. rok {p.born_round}{p.died_round ? ` — † rok ${p.died_round}` : ""}
                  </span>
                </div>
              </div>
              {p.is_alive && (
                <Button size="sm" variant="ghost" onClick={() => handleKill(p.id, p.name)} title="Zaznamenat smrt">
                  <Skull className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Other players' persons */}
      {otherPersons.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display font-semibold text-sm">Osobnosti ostatních hráčů</h3>
          {otherPersons.map((p: any) => {
            const city = cities.find(c => c.id === p.city_id);
            return (
              <div key={p.id} className={`manuscript-card p-3 ${!p.is_alive ? "opacity-60" : ""}`}>
                <p className="font-display font-semibold text-sm">
                  {p.name} <span className="text-muted-foreground font-normal text-xs">({p.player_name})</span>
                  {!p.is_alive && <Skull className="inline h-3 w-3 ml-1 text-muted-foreground" />}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant="outline" className="text-xs">{p.person_type}</Badge>
                  {city && <span className="text-xs text-muted-foreground">📍 {city.name}</span>}
                  {p.flavor_trait && <span className="text-xs italic text-muted-foreground">„{p.flavor_trait}"</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default GreatPersonsPanel;
