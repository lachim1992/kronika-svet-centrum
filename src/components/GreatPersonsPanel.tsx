import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, Skull, Star, Sparkles, Loader2, ImageIcon, BookOpen } from "lucide-react";
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
  onEntityClick?: (type: string, id: string, name: string) => void;
}

const GreatPersonsPanel = ({ sessionId, currentPlayerName, greatPersons, cities, currentTurn, onRefetch, onEntityClick }: GreatPersonsPanelProps) => {
  const [name, setName] = useState("");
  const [personType, setPersonType] = useState("");
  const [cityId, setCityId] = useState("");
  const [flavor, setFlavor] = useState("");
  const [exceptionalPrompt, setExceptionalPrompt] = useState("");
  const [adding, setAdding] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [writingToHistoryId, setWritingToHistoryId] = useState<string | null>(null);

  const myCities = cities.filter(c => c.owner_player === currentPlayerName);

  const handleAdd = async () => {
    if (!name.trim() || !personType) { toast.error("Jméno a typ jsou povinné"); return; }
    setAdding(true);
    await supabase.from("great_persons").insert({
      session_id: sessionId, player_name: currentPlayerName, name: name.trim(),
      person_type: personType, city_id: cityId || null,
      flavor_trait: flavor.trim() || null, born_round: currentTurn,
      exceptional_prompt: exceptionalPrompt.trim() || null,
    } as any);
    toast.success(`${name} vstoupil/a do dějin!`);
    setName(""); setPersonType(""); setCityId(""); setFlavor(""); setExceptionalPrompt("");
    onRefetch?.();
    setAdding(false);
  };

  const handleKill = async (personId: string, personName: string) => {
    await supabase.from("great_persons").update({ is_alive: false, died_round: currentTurn }).eq("id", personId);
    toast.success(`${personName} padl/a v roce ${currentTurn}`);
    onRefetch?.();
  };

  const handleGeneratePortrait = async (person: any) => {
    setGeneratingId(person.id);
    try {
      const city = cities.find(c => c.id === person.city_id);
      const { data, error } = await supabase.functions.invoke("person-portrait", {
        body: {
          personId: person.id,
          personName: person.name,
          personType: person.person_type,
          flavorTrait: person.flavor_trait,
          exceptionalPrompt: person.exceptional_prompt,
          cityName: city?.name || null,
          playerName: person.player_name,
          sessionId,
        },
      });
      if (error) throw error;
      if (data.error) { toast.error(data.error); return; }
      toast.success(`🎨 Portrét a životopis ${person.name} vygenerován!`);
      onRefetch?.();
    } catch (e) {
      console.error(e);
      toast.error("Generování portrétu selhalo");
    }
    setGeneratingId(null);
  };

  const handleWriteToHistory = async (person: any) => {
    setWritingToHistoryId(person.id);
    try {
      // Upsert wiki_entries for this person
      const { error } = await supabase.from("wiki_entries").upsert({
        session_id: sessionId,
        entity_type: "person",
        entity_id: person.id,
        entity_name: person.name,
        owner_player: person.player_name,
        summary: person.bio || `${person.name} — ${person.person_type}`,
        ai_description: person.bio || null,
        image_url: person.image_url || null,
        image_prompt: person.image_prompt || null,
        tags: [person.person_type, person.flavor_trait].filter(Boolean),
      } as any, { onConflict: "session_id,entity_type,entity_id" });
      if (error) throw error;
      toast.success(`📜 ${person.name} zapsán/a do ChroWiki!`);
      // Navigate to ChroWiki if handler available
      if (onEntityClick) {
        onEntityClick("person", person.id, person.name);
      }
    } catch (e) {
      console.error(e);
      toast.error("Zápis do historie selhal");
    }
    setWritingToHistoryId(null);
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
          <Input placeholder="Přezdívka / rys (volitelné)" value={flavor} onChange={e => setFlavor(e.target.value)} />
        </div>
        <Textarea
          placeholder="Čím je osobnost výjimečná? Popište její charakter, schopnosti, legendy... (volitelné, ale výrazně zlepší AI generování)"
          value={exceptionalPrompt}
          onChange={e => setExceptionalPrompt(e.target.value)}
          className="min-h-[60px] text-sm"
        />
        <Button onClick={handleAdd} disabled={adding} className="w-full font-display">
          {adding ? "Zapisuji..." : "✨ Zapsat do dějin"}
        </Button>
      </div>

      {/* My persons */}
      <div className="space-y-3">
        <h3 className="font-display font-semibold text-sm">Vaše osobnosti ({myPersons.length})</h3>
        {myPersons.length === 0 && <p className="text-xs text-muted-foreground italic text-center py-4">Žádné velké osobnosti.</p>}
        {myPersons.map((p: any) => (
          <PersonCard
            key={p.id}
            person={p}
            cities={cities}
            isOwner={true}
            generatingId={generatingId}
            writingToHistoryId={writingToHistoryId}
            onKill={handleKill}
            onGeneratePortrait={handleGeneratePortrait}
            onWriteToHistory={handleWriteToHistory}
            onEntityClick={onEntityClick}
          />
        ))}
      </div>

      {/* Other players' persons */}
      {otherPersons.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display font-semibold text-sm">Osobnosti ostatních hráčů</h3>
          {otherPersons.map((p: any) => (
            <PersonCard
              key={p.id}
              person={p}
              cities={cities}
              isOwner={false}
              generatingId={generatingId}
              writingToHistoryId={writingToHistoryId}
              onKill={handleKill}
              onGeneratePortrait={handleGeneratePortrait}
              onWriteToHistory={handleWriteToHistory}
              onEntityClick={onEntityClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};

function PersonCard({ person, cities, isOwner, generatingId, writingToHistoryId, onKill, onGeneratePortrait, onWriteToHistory, onEntityClick }: {
  person: any; cities: City[]; isOwner: boolean; generatingId: string | null; writingToHistoryId: string | null;
  onKill: (id: string, name: string) => void;
  onGeneratePortrait: (person: any) => void;
  onWriteToHistory: (person: any) => void;
  onEntityClick?: (type: string, id: string, name: string) => void;
}) {
  const city = cities.find(c => c.id === person.city_id);
  const isGenerating = generatingId === person.id;
  const isWriting = writingToHistoryId === person.id;

  return (
    <div className={`manuscript-card p-4 ${!person.is_alive ? "opacity-60" : ""}`}>
      <div className="flex gap-4">
        {/* Portrait */}
        <div className="shrink-0 w-20 h-20 rounded-md overflow-hidden border border-border bg-muted/30">
          {person.image_url ? (
            <img src={person.image_url} alt={person.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="font-display font-bold text-sm">
              {person.name}
              {!person.is_alive && <Skull className="inline h-4 w-4 ml-1 text-muted-foreground" />}
              {!isOwner && <span className="text-muted-foreground font-normal text-xs ml-1">({person.player_name})</span>}
            </p>
            <div className="flex gap-1">
              {isOwner && person.is_alive && (
                <Button size="sm" variant="ghost" onClick={() => onKill(person.id, person.name)} title="Zaznamenat smrt">
                  <Skull className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="secondary" className="text-xs">{person.person_type}</Badge>
            {city && <span className="text-xs text-muted-foreground">📍 {city.name}</span>}
            {person.flavor_trait && <span className="text-xs italic text-muted-foreground">„{person.flavor_trait}"</span>}
            <span className="text-xs text-muted-foreground">
              Nar. rok {person.born_round}{person.died_round ? ` — † rok ${person.died_round}` : ""}
            </span>
          </div>

          {/* Exceptional prompt preview */}
          {person.exceptional_prompt && (
            <p className="text-xs text-muted-foreground/70 mt-1 italic">💡 {person.exceptional_prompt.slice(0, 120)}{person.exceptional_prompt.length > 120 ? "…" : ""}</p>
          )}

          {/* Bio */}
          {person.bio && (
            <p className="text-xs text-muted-foreground mt-2 italic leading-relaxed">{person.bio}</p>
          )}

          {/* Action buttons - owner only */}
          {isOwner && (
            <div className="flex flex-col gap-2 mt-3">
              <Button
                size="sm"
                variant="outline"
                className="text-xs font-display w-full"
                disabled={isGenerating}
                onClick={() => onGeneratePortrait(person)}
              >
                {isGenerating ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Generuji portrét...</>
                ) : (
                  <><Sparkles className="h-3 w-3 mr-1" />{person.image_url ? "Regenerovat portrét a životopis" : "Vygenerovat portrét a životopis"}</>
                )}
              </Button>
              <Button
                size="sm"
                variant="default"
                className="text-xs font-display w-full"
                disabled={isWriting}
                onClick={() => onWriteToHistory(person)}
              >
                {isWriting ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Zapisuji...</>
                ) : (
                  <><BookOpen className="h-3 w-3 mr-1" />Zapsat do historie</>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GreatPersonsPanel;
