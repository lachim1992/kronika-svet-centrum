import { useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { addWorldMemory, approveMemory, deleteMemory } from "@/hooks/useGameSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brain, Check, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

type WorldMemory = Tables<"world_memories">;

interface WorldMemoryPanelProps {
  sessionId: string;
  memories: WorldMemory[];
}

const WorldMemoryPanel = ({ sessionId, memories }: WorldMemoryPanelProps) => {
  const [newMemory, setNewMemory] = useState("");

  const handleAdd = async () => {
    if (!newMemory.trim()) return;
    await addWorldMemory(sessionId, newMemory.trim(), true);
    setNewMemory("");
    toast.success("Vzpomínka přidána");
  };

  return (
    <div className="space-y-3 p-4 rounded-lg border border-border bg-card">
      <h3 className="text-lg font-display font-semibold flex items-center gap-2">
        <Brain className="h-5 w-5 text-primary" />
        Paměť světa
      </h3>

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

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {memories.map((mem) => (
          <div
            key={mem.id}
            className={`flex items-start gap-2 p-2 rounded text-sm ${
              mem.approved ? "bg-muted" : "bg-muted/50 border border-dashed border-primary/30"
            }`}
          >
            <span className="flex-1">{mem.text}</span>
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
        ))}
        {memories.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4 italic">
            Žádné vzpomínky zatím...
          </p>
        )}
      </div>
    </div>
  );
};

export default WorldMemoryPanel;
