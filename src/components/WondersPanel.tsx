import { useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Landmark, Plus, Sparkles, Crown, Skull, Hammer, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { addGameEvent, addWorldMemory } from "@/hooks/useGameSession";

type Wonder = Tables<"wonders">;
type City = Tables<"cities">;
type GamePlayer = Tables<"game_players">;
type WorldMemory = Tables<"world_memories">;

const ERAS = ["Ancient", "Classical", "Medieval", "Industrial"];
const ERA_LABELS: Record<string, string> = {
  Ancient: "Starověk", Classical: "Antika", Medieval: "Středověk", Industrial: "Průmysl",
};
const STATUS_LABELS: Record<string, string> = {
  planned: "Plánováno", "under construction": "Ve výstavbě", completed: "Dokončeno", destroyed: "Zničeno",
};
const STATUS_ICONS: Record<string, React.ReactNode> = {
  planned: <Hammer className="h-3 w-3" />,
  "under construction": <Hammer className="h-3 w-3" />,
  completed: <Crown className="h-3 w-3" />,
  destroyed: <Skull className="h-3 w-3" />,
};

interface WondersPanelProps {
  sessionId: string;
  wonders: Wonder[];
  cities: City[];
  players: GamePlayer[];
  memories: WorldMemory[];
  currentPlayerName: string;
  currentTurn: number;
  onRefetch?: () => void;
}

const WondersPanel = ({ sessionId, wonders, cities, players, memories, currentPlayerName, currentTurn, onRefetch }: WondersPanelProps) => {
  const [mode, setMode] = useState<"list" | "create" | "ai">("list");
  const [name, setName] = useState("");
  const [cityName, setCityName] = useState("");
  const [era, setEra] = useState("Ancient");
  const [description, setDescription] = useState("");
  const [bonus, setBonus] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  const handleManualCreate = async () => {
    if (!name.trim()) { toast.error("Zadejte název divu"); return; }
    const { error } = await supabase.from("wonders").insert({
      session_id: sessionId,
      owner_player: currentPlayerName,
      name: name.trim(),
      city_name: cityName || null,
      era,
      status: "planned",
      description: description || null,
      bonus: bonus || null,
    });
    if (error) { console.error(error); toast.error("Chyba při vytváření"); return; }
    setName(""); setCityName(""); setDescription(""); setBonus("");
    setMode("list");
    toast.success("Div světa naplánován");
    onRefetch?.();
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) { toast.error("Zadejte popis divu"); return; }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("wonder", {
        body: { prompt: aiPrompt, city: cityName, era, worldFacts: memories.filter(m => m.approved).map(m => m.text) },
      });
      if (error) throw error;

      const { error: insertErr } = await supabase.from("wonders").insert({
        session_id: sessionId,
        owner_player: currentPlayerName,
        name: data.wonderName,
        city_name: cityName || null,
        era,
        status: "planned",
        description: data.description,
        bonus: data.bonusEffect || null,
        memory_fact: data.memoryFact || null,
        image_prompt: data.imagePrompt || null,
      });
      if (insertErr) throw insertErr;

      if (data.memoryFact) {
        await addWorldMemory(sessionId, data.memoryFact, false);
      }

      setAiPrompt(""); setCityName("");
      setMode("list");
      toast.success(`✨ Div "${data.wonderName}" navržen!`);
      onRefetch?.();
    } catch (e) {
      console.error(e);
      toast.error("Generování divu selhalo");
    }
    setGenerating(false);
  };

  const updateStatus = async (wonder: Wonder, newStatus: string) => {
    const { error } = await supabase.from("wonders").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", wonder.id);
    if (error) { console.error(error); return; }

    // Auto-create events for completion/destruction
    if (newStatus === "completed") {
      await addGameEvent(sessionId, "wonder", wonder.owner_player, wonder.city_name || "", `Div světa "${wonder.name}" byl dokončen!`, currentTurn);
      if (wonder.memory_fact) {
        await addWorldMemory(sessionId, wonder.memory_fact, true);
      }
      toast.success(`🏛️ "${wonder.name}" dokončen!`);
    } else if (newStatus === "destroyed") {
      await addGameEvent(sessionId, "wonder", "NPC", wonder.city_name || "", `Div světa "${wonder.name}" byl zpustošen! Kronikáři plakali.`, currentTurn);
      toast.error(`💀 "${wonder.name}" zničen!`);
    }
    onRefetch?.();
  };

  const playerNames = players.map(p => p.player_name);
  const completedWonders = wonders.filter(w => w.status === "completed");

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <Landmark className="h-6 w-6 text-primary" />
          Divy světa
          {completedWonders.length > 0 && (
            <Badge variant="secondary" className="font-display text-xs">{completedWonders.length} dokončených</Badge>
          )}
        </h1>
        <div className="flex gap-2">
          <Button size="sm" variant={mode === "create" ? "default" : "outline"} onClick={() => setMode(mode === "create" ? "list" : "create")}>
            <Plus className="h-3 w-3 mr-1" />Ručně
          </Button>
          <Button size="sm" variant={mode === "ai" ? "default" : "outline"} onClick={() => setMode(mode === "ai" ? "list" : "ai")}>
            <Sparkles className="h-3 w-3 mr-1" />AI Návrh
          </Button>
        </div>
      </div>

      {/* Manual Create */}
      {mode === "create" && (
        <div className="bg-card p-4 rounded-lg border border-border shadow-parchment space-y-3">
          <h3 className="font-display font-semibold text-sm">Nový div světa</h3>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Název divu" value={name} onChange={e => setName(e.target.value)} className="h-9" />
            <Select value={cityName} onValueChange={setCityName}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Město..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">— Žádné —</SelectItem>
                {cities.map(c => <SelectItem key={c.id} value={c.name}>{c.name} ({c.owner_player})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Select value={era} onValueChange={setEra}>
            <SelectTrigger className="h-9 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{ERAS.map(e => <SelectItem key={e} value={e}>{ERA_LABELS[e]}</SelectItem>)}</SelectContent>
          </Select>
          <Textarea placeholder="Popis divu (volitelné)" value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          <Input placeholder="Herní bonus (volitelné)" value={bonus} onChange={e => setBonus(e.target.value)} className="h-9" />
          <Button onClick={handleManualCreate} className="font-display"><Plus className="h-3 w-3 mr-1" />Naplánovat</Button>
        </div>
      )}

      {/* AI Create */}
      {mode === "ai" && (
        <div className="bg-card p-4 rounded-lg border-2 border-primary/30 shadow-parchment space-y-3">
          <h3 className="font-display font-semibold text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Navrhnout nový div světa
          </h3>
          <Textarea
            placeholder="Popište svůj div světa česky, např.: Růžový mramorový chrám Petry, který září při západu slunce..."
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            rows={3}
          />
          <div className="flex gap-2">
            <Select value={cityName} onValueChange={setCityName}>
              <SelectTrigger className="h-9 text-xs flex-1"><SelectValue placeholder="Město..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">— Žádné —</SelectItem>
                {cities.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={era} onValueChange={setEra}>
              <SelectTrigger className="h-9 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{ERAS.map(e => <SelectItem key={e} value={e}>{ERA_LABELS[e]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={handleAiGenerate} disabled={generating} className="w-full font-display">
            <Sparkles className="h-4 w-4 mr-2" />
            {generating ? "Kronikář tvoří div..." : "✨ Navrhnout div světa"}
          </Button>
        </div>
      )}

      {/* Wonders Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {wonders.length === 0 && mode === "list" && (
          <p className="text-muted-foreground text-center py-8 italic col-span-2">
            Žádné divy světa... naplánujte první legendární stavbu!
          </p>
        )}
        {wonders.map(w => (
          <WonderCard
            key={w.id}
            wonder={w}
            isOwner={w.owner_player === currentPlayerName}
            onStatusChange={updateStatus}
          />
        ))}
      </div>
    </div>
  );
};

function WonderCard({ wonder, isOwner, onStatusChange }: { wonder: Wonder; isOwner: boolean; onStatusChange: (w: Wonder, status: string) => void }) {
  const statusFlow: Record<string, string[]> = {
    planned: ["under construction"],
    "under construction": ["completed"],
    completed: ["destroyed"],
    destroyed: [],
  };
  const nextStatuses = statusFlow[wonder.status] || [];

  return (
    <div className={`rounded-lg border-2 shadow-parchment overflow-hidden ${
      wonder.status === "completed" ? "border-primary/50 bg-card" :
      wonder.status === "destroyed" ? "border-destructive/30 bg-card opacity-75" :
      "border-border bg-card"
    }`}>
      {/* Image placeholder */}
      <div className="h-32 bg-muted/50 flex items-center justify-center border-b border-border relative">
        <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
        <div className="absolute top-2 right-2">
          <Badge variant={wonder.status === "completed" ? "default" : "secondary"} className="text-xs font-display">
            {STATUS_ICONS[wonder.status]}
            <span className="ml-1">{STATUS_LABELS[wonder.status]}</span>
          </Badge>
        </div>
        <div className="absolute top-2 left-2">
          <Badge variant="outline" className="text-xs bg-card/80">{ERA_LABELS[wonder.era] || wonder.era}</Badge>
        </div>
      </div>

      <div className="p-4 space-y-2">
        <h3 className="font-display font-bold text-lg">{wonder.name}</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{wonder.owner_player}</span>
          {wonder.city_name && <span>📍 {wonder.city_name}</span>}
        </div>
        {wonder.description && (
          <p className="text-sm leading-relaxed italic text-muted-foreground">{wonder.description}</p>
        )}
        {wonder.bonus && (
          <p className="text-xs font-semibold text-primary">⚡ {wonder.bonus}</p>
        )}
        {isOwner && nextStatuses.length > 0 && (
          <div className="flex gap-2 pt-2">
            {nextStatuses.map(ns => (
              <Button key={ns} size="sm" variant="outline" className="text-xs font-display" onClick={() => onStatusChange(wonder, ns)}>
                {STATUS_ICONS[ns]}
                <span className="ml-1">{STATUS_LABELS[ns]}</span>
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default WondersPanel;
