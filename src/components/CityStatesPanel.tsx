import { useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { addCityState, updateCityState, addGameEvent } from "@/hooks/useGameSession";
import { generateCityStateActions } from "@/lib/ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, Zap, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";

type CityState = Tables<"city_states">;
type GameEvent = Tables<"game_events">;

const CS_TYPES = ["Obchodní", "Námořní", "Vojenský", "Průmyslový", "Náboženský"];
const MOOD_COLORS: Record<string, string> = {
  "Přátelský": "bg-green-100 text-green-800 border-green-200",
  "Neutrální": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Nepřátelský": "bg-red-100 text-red-800 border-red-200",
};

interface CityStatesPanelProps {
  sessionId: string;
  cityStates: CityState[];
  recentEvents: GameEvent[];
  player1Name: string;
  player2Name: string;
}

const CityStatesPanel = ({ sessionId, cityStates, recentEvents, player1Name, player2Name }: CityStatesPanelProps) => {
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("Obchodní");
  const [generating, setGenerating] = useState(false);
  const [pendingActions, setPendingActions] = useState<Array<{ cityStateName: string; action: string; type: string }>>([]);

  const handleAddCS = async () => {
    if (!newName.trim()) return;
    await addCityState(sessionId, newName.trim(), newType);
    setNewName("");
    toast.success("Městský stát přidán");
  };

  const handleGenerateActions = async () => {
    if (cityStates.length === 0) {
      toast.error("Přidejte alespoň jeden městský stát");
      return;
    }
    setGenerating(true);
    try {
      const result = await generateCityStateActions(cityStates, recentEvents.slice(-10));
      setPendingActions(result.actions || []);
      if (result.actions?.length) {
        toast.success(`Vygenerováno ${result.actions.length} akcí`);
      }
    } catch {
      toast.error("Generování akcí selhalo");
    }
    setGenerating(false);
  };

  const acceptAction = async (action: { cityStateName: string; action: string; type: string }) => {
    await addGameEvent(sessionId, "city_state_action", "NPC", action.cityStateName, action.action, 0);
    setPendingActions((prev) => prev.filter((a) => a !== action));
    toast.success("Akce přijata jako událost");
  };

  const changeMood = async (cs: CityState, mood: string) => {
    await updateCityState(cs.id, { mood });
  };

  const changeInfluence = async (cs: CityState, player: 1 | 2, delta: number) => {
    if (player === 1) {
      await updateCityState(cs.id, { influence_p1: cs.influence_p1 + delta });
    } else {
      await updateCityState(cs.id, { influence_p2: cs.influence_p2 + delta });
    }
  };

  return (
    <div className="space-y-6 p-6 parchment-bg min-h-screen">
      <h1 className="text-2xl font-display font-bold flex items-center gap-2">
        <Building2 className="h-6 w-6 text-primary" />
        Městské státy
      </h1>

      {/* Add new */}
      <div className="flex gap-2 flex-wrap items-end bg-card p-4 rounded-lg border border-border">
        <div className="flex-1 min-w-[200px]">
          <Input placeholder="Název městského státu" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-10" />
        </div>
        <Select value={newType} onValueChange={setNewType}>
          <SelectTrigger className="w-40 h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CS_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleAddCS} className="h-10">
          <Plus className="h-4 w-4 mr-1" /> Přidat
        </Button>
      </div>

      {/* City states list */}
      <div className="grid gap-4 md:grid-cols-2">
        {cityStates.map((cs) => (
          <div key={cs.id} className="p-4 rounded-lg border border-border bg-card shadow-parchment">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display font-semibold text-lg">{cs.name}</h3>
              <Badge variant="outline" className="text-xs">{cs.type}</Badge>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm text-muted-foreground">Nálada:</span>
              <Select value={cs.mood} onValueChange={(v) => changeMood(cs, v)}>
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Přátelský">Přátelský</SelectItem>
                  <SelectItem value="Neutrální">Neutrální</SelectItem>
                  <SelectItem value="Nepřátelský">Nepřátelský</SelectItem>
                </SelectContent>
              </Select>
              <Badge className={`text-xs ${MOOD_COLORS[cs.mood] || ""}`}>{cs.mood}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">{player1Name}:</span>
                <span className="font-semibold">{cs.influence_p1}</span>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => changeInfluence(cs, 1, 1)}>
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => changeInfluence(cs, 1, -1)}>
                  <ArrowDown className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">{player2Name}:</span>
                <span className="font-semibold">{cs.influence_p2}</span>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => changeInfluence(cs, 2, 1)}>
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => changeInfluence(cs, 2, -1)}>
                  <ArrowDown className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Generate actions */}
      <Button
        onClick={handleGenerateActions}
        disabled={generating || cityStates.length === 0}
        className="w-full h-12 font-display text-base"
        size="lg"
      >
        <Zap className="mr-2 h-5 w-5" />
        {generating ? "Generuji akce..." : "✅ Tah městských států"}
      </Button>

      {/* Pending actions */}
      {pendingActions.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display font-semibold">Navržené akce:</h3>
          {pendingActions.map((action, i) => (
            <div key={i} className="p-3 rounded-lg border border-primary/30 bg-card animate-fade-in">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-semibold">{action.cityStateName}</span>
                  <p className="text-sm mt-1">{action.action}</p>
                </div>
                <Button size="sm" onClick={() => acceptAction(action)}>Přijmout</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CityStatesPanel;
