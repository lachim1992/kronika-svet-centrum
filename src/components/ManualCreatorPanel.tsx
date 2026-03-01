import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Scroll, Globe, Building2, Swords, Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  onRefetch: () => void;
}

const PERSON_TYPES = [
  { value: "General", label: "⚔️ Generál" },
  { value: "Scholar", label: "📚 Učenec" },
  { value: "Prophet", label: "🙏 Prorok" },
  { value: "Merchant", label: "💰 Obchodník" },
  { value: "Hero", label: "🏆 Hrdina" },
  { value: "Artist", label: "🎨 Umělec" },
  { value: "Spy", label: "🕵️ Špión" },
  { value: "Advisor", label: "👑 Rádce" },
];

const WORLD_EVENT_CATEGORIES = [
  { value: "natural_disaster", label: "🌋 Přírodní katastrofa" },
  { value: "plague", label: "☠️ Epidemie" },
  { value: "miracle", label: "✨ Zázrak" },
  { value: "discovery", label: "🔍 Objev" },
  { value: "cultural", label: "🎭 Kulturní událost" },
  { value: "economic", label: "📊 Ekonomická krize" },
  { value: "religious", label: "🙏 Náboženská událost" },
  { value: "founding", label: "🏛️ Založení" },
  { value: "custom", label: "📝 Vlastní" },
];

const ManualCreatorPanel = ({ sessionId, currentPlayerName, currentTurn, onRefetch }: Props) => {
  const [loading, setLoading] = useState(false);

  // Person form
  const [personName, setPersonName] = useState("");
  const [personType, setPersonType] = useState("General");
  const [personBio, setPersonBio] = useState("");
  const [personTrait, setPersonTrait] = useState("");

  // World event form
  const [eventTitle, setEventTitle] = useState("");
  const [eventDesc, setEventDesc] = useState("");
  const [eventCategory, setEventCategory] = useState("custom");

  // Chronicle form
  const [chronicleText, setChronicleText] = useState("");

  const handleCreatePerson = async () => {
    if (!personName.trim()) { toast.error("Zadejte jméno osoby"); return; }
    setLoading(true);
    try {
      const { data: gp, error } = await supabase.from("great_persons").insert({
        session_id: sessionId,
        name: personName.trim(),
        player_name: currentPlayerName,
        person_type: personType,
        flavor_trait: personTrait.trim() || null,
        bio: personBio.trim() || null,
        born_round: currentTurn,
        is_alive: true,
      }).select("id").single();

      if (error) throw error;

      // Auto-create wiki entry
      if (gp?.id) {
        await supabase.from("wiki_entries").insert({
          session_id: sessionId,
          entity_type: "person",
          entity_id: gp.id,
          entity_name: personName.trim(),
          owner_player: currentPlayerName,
          summary: personBio.trim() || `${personName} — ${personType}`,
        });
      }

      toast.success(`Osoba "${personName}" vytvořena!`);
      setPersonName(""); setPersonBio(""); setPersonTrait("");
      onRefetch();
    } catch (e: any) {
      toast.error("Chyba: " + (e.message || "Neznámá"));
    }
    setLoading(false);
  };

  const handleCreateWorldEvent = async () => {
    if (!eventTitle.trim() || !eventDesc.trim()) { toast.error("Vyplňte název a popis"); return; }
    setLoading(true);
    try {
      const slug = `manual-${eventTitle.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40)}-${currentTurn}`;
      const { error } = await supabase.from("world_events").insert({
        session_id: sessionId,
        title: eventTitle.trim(),
        slug,
        description: eventDesc.trim(),
        event_category: eventCategory,
        status: "published",
        created_turn: currentTurn,
        created_by_type: "player",
        affected_players: [currentPlayerName],
        participants: [{ type: "player", name: currentPlayerName }],
      } as any);

      if (error) throw error;

      // Auto-create game_event + chronicle
      await supabase.from("game_events").insert({
        session_id: sessionId,
        event_type: "world_event",
        player: currentPlayerName,
        note: `${eventTitle}: ${eventDesc.slice(0, 200)}`,
        turn_number: currentTurn,
        confirmed: true,
        truth_state: "canon",
        importance: "memorable",
      });

      toast.success(`Světová událost "${eventTitle}" vytvořena!`);
      setEventTitle(""); setEventDesc("");
      onRefetch();
    } catch (e: any) {
      toast.error("Chyba: " + (e.message || "Neznámá"));
    }
    setLoading(false);
  };

  const handleCreateChronicle = async () => {
    if (!chronicleText.trim()) { toast.error("Vyplňte text kroniky"); return; }
    setLoading(true);
    try {
      const { error } = await supabase.from("chronicle_entries").insert({
        session_id: sessionId,
        text: chronicleText.trim(),
        source_type: "player",
        turn_from: currentTurn,
        turn_to: currentTurn,
        epoch_style: "kroniky",
      });

      if (error) throw error;

      toast.success("Zápis kroniky přidán!");
      setChronicleText("");
      onRefetch();
    } catch (e: any) {
      toast.error("Chyba: " + (e.message || "Neznámá"));
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Plus className="h-5 w-5 text-primary" />
        <h3 className="font-display font-semibold text-base">Ruční tvorba</h3>
        <Badge variant="secondary" className="text-[10px]">Manual Mode</Badge>
      </div>

      <Tabs defaultValue="person" className="w-full">
        <TabsList className="w-full justify-start bg-card border border-border h-auto p-1 gap-1 flex-wrap">
          <TabsTrigger value="person" className="font-display text-xs gap-1">
            <User className="h-3 w-3" />Osoba
          </TabsTrigger>
          <TabsTrigger value="world_event" className="font-display text-xs gap-1">
            <Globe className="h-3 w-3" />Světová událost
          </TabsTrigger>
          <TabsTrigger value="chronicle" className="font-display text-xs gap-1">
            <Scroll className="h-3 w-3" />Kronika
          </TabsTrigger>
        </TabsList>

        {/* ═══ PERSON CREATOR ═══ */}
        <TabsContent value="person" className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">Vytvořte důležitou osobu — generála, učence, proroka, hrdinu...</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Jméno</Label>
              <Input value={personName} onChange={e => setPersonName(e.target.value)} placeholder="např. Valerius Temný" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Typ</Label>
              <Select value={personType} onValueChange={setPersonType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERSON_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Charakteristický rys</Label>
            <Input value={personTrait} onChange={e => setPersonTrait(e.target.value)} placeholder="např. Železná vůle, Mistr strategie..." />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Životopis</Label>
            <Textarea value={personBio} onChange={e => setPersonBio(e.target.value)} placeholder="Příběh této osoby..." rows={3} />
          </div>
          <Button onClick={handleCreatePerson} disabled={loading || !personName.trim()} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Vytvořit osobu
          </Button>
        </TabsContent>

        {/* ═══ WORLD EVENT CREATOR ═══ */}
        <TabsContent value="world_event" className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">Vytvořte globální událost — přírodní katastrofu, objev, zázrak, epidemii...</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Název</Label>
              <Input value={eventTitle} onChange={e => setEventTitle(e.target.value)} placeholder="např. Velký potop" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kategorie</Label>
              <Select value={eventCategory} onValueChange={setEventCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WORLD_EVENT_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Popis události</Label>
            <Textarea value={eventDesc} onChange={e => setEventDesc(e.target.value)} placeholder="Co se stalo, jaké to má důsledky..." rows={4} />
          </div>
          <Button onClick={handleCreateWorldEvent} disabled={loading || !eventTitle.trim() || !eventDesc.trim()} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Globe className="h-4 w-4 mr-2" />}
            Vytvořit událost
          </Button>
        </TabsContent>

        {/* ═══ CHRONICLE WRITER ═══ */}
        <TabsContent value="chronicle" className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">Zapište vlastní kronikářský záznam — narativní text, který bude součástí dějin světa.</p>
          <div className="space-y-1">
            <Label className="text-xs">Text kroniky</Label>
            <Textarea
              value={chronicleText}
              onChange={e => setChronicleText(e.target.value)}
              placeholder="V roce pádu Starého města se na obzoru objevil podivný komet. Lid šeptal o konci věků, ale moudrá královna Thessala je uklidnila slovy..."
              rows={6}
            />
            <p className="text-[10px] text-muted-foreground">{chronicleText.length}/2000 · Rok: {currentTurn}</p>
          </div>
          <Button onClick={handleCreateChronicle} disabled={loading || !chronicleText.trim()} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Scroll className="h-4 w-4 mr-2" />}
            Zapsat do kroniky
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ManualCreatorPanel;
