import { useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { addWorldMemory, approveMemory, deleteMemory } from "@/hooks/useGameSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain, Check, Trash2, Plus, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

type WorldMemory = Tables<"world_memories">;
type City = Tables<"cities">;

const MEMORY_CATEGORIES: Record<string, string> = {
  tradition: "Tradice",
  running_joke: "Vtip / meme",
  cultural_trait: "Kulturní rys",
  historical_scar: "Historická jizva",
  wonder_identity: "Identita divu",
  diplomatic_reputation: "Diplomatická pověst",
};

interface WorldMemoryPanelProps {
  sessionId: string;
  memories: WorldMemory[];
  cities?: City[];
  currentTurn?: number;
  filterCityId?: string;
}

const WorldMemoryPanel = ({ sessionId, memories, cities = [], currentTurn = 1, filterCityId }: WorldMemoryPanelProps) => {
  const [newMemory, setNewMemory] = useState("");
  const [selectedCityId, setSelectedCityId] = useState<string>("__none__");
  const [selectedCategory, setSelectedCategory] = useState<string>("tradition");

  const handleAdd = async () => {
    if (!newMemory.trim()) return;
    if (selectedCityId === "__none__") {
      toast.error("Vyberte město, ke kterému se vzpomínka vztahuje");
      return;
    }
    await addWorldMemory(
      sessionId,
      newMemory.trim(),
      true,
      selectedCityId === "__none__" ? undefined : selectedCityId,
      undefined,
      selectedCategory,
      currentTurn
    );
    setNewMemory("");
    toast.success("Vzpomínka přidána");
  };

  // Filter memories if filterCityId is set
  const displayMemories = filterCityId
    ? memories.filter(m => (m as any).city_id === filterCityId)
    : memories;

  const getCityName = (cityId: string | null) => {
    if (!cityId) return null;
    return cities.find(c => c.id === cityId)?.name || null;
  };

  return (
    <div className="space-y-3 p-4 rounded-lg border border-border bg-card">
      <h3 className="text-lg font-display font-semibold flex items-center gap-2">
        <Brain className="h-5 w-5 text-primary" />
        {filterCityId ? "Paměť města" : "Paměť světa"}
      </h3>

      {!filterCityId && (
        <>
          <p className="text-xs text-muted-foreground">
            Kde se tato tradice nebo událost vztahuje?
          </p>
          <div className="flex gap-2">
            <Select value={selectedCityId} onValueChange={setSelectedCityId}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <MapPin className="h-3 w-3 mr-1" />
                <SelectValue placeholder="Město..." />
              </SelectTrigger>
              <SelectContent>
                {cities.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MEMORY_CATEGORIES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Přidat nový fakt..."
              value={newMemory}
              onChange={(e) => setNewMemory(e.target.value)}
              className="h-9"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <Button size="sm" onClick={handleAdd}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {displayMemories.map((mem) => {
          const cityName = getCityName((mem as any).city_id);
          const category = (mem as any).category as string | undefined;
          return (
            <div
              key={mem.id}
              className={`flex items-start gap-2 p-2 rounded text-sm ${
                mem.approved ? "bg-muted" : "bg-muted/50 border border-dashed border-primary/30"
              }`}
            >
              <div className="flex-1 space-y-1">
                <span className="block">{mem.text}</span>
                <div className="flex gap-1 flex-wrap">
                  {cityName && (
                    <Badge variant="outline" className="text-[10px] h-4">
                      <MapPin className="h-2 w-2 mr-0.5" />{cityName}
                    </Badge>
                  )}
                  {category && MEMORY_CATEGORIES[category] && (
                    <Badge variant="secondary" className="text-[10px] h-4">
                      {MEMORY_CATEGORIES[category]}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                {!mem.approved && (
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => approveMemory(mem.id)}>
                    <Check className="h-3 w-3" />
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => deleteMemory(mem.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
        {displayMemories.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4 italic">
            Žádné vzpomínky zatím...
          </p>
        )}
      </div>
    </div>
  );
};

export default WorldMemoryPanel;
