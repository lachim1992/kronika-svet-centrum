import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Compass, Loader2, Map, Users, Skull, Coins, Mountain, TreePine, Waves, Sun, Snowflake, Flame as FlameIcon } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  playerName: string;
  currentTurn: number;
  worldFoundation: any;
  regions: any[];
  expeditions: any[];
  onExploreComplete: (regionId?: string) => void;
}

const BIOME_OPTIONS = [
  { value: "any", label: "Kamkoliv", icon: <Compass className="h-3 w-3" /> },
  { value: "coast", label: "Pobřeží", icon: <Waves className="h-3 w-3" /> },
  { value: "mountains", label: "Hory", icon: <Mountain className="h-3 w-3" /> },
  { value: "forest", label: "Lesy", icon: <TreePine className="h-3 w-3" /> },
  { value: "desert", label: "Poušť", icon: <Sun className="h-3 w-3" /> },
  { value: "tundra", label: "Tundra", icon: <Snowflake className="h-3 w-3" /> },
  { value: "volcanic", label: "Vulkán", icon: <FlameIcon className="h-3 w-3" /> },
];

const RISK_LEVELS = [
  { value: "low", label: "Opatrná", cost: 10, successRate: 90, description: "Malé riziko, menší odměna" },
  { value: "medium", label: "Standardní", cost: 25, successRate: 70, description: "Vyvážený poměr rizika a odměny" },
  { value: "high", label: "Odvážná", cost: 50, successRate: 50, description: "Vysoké riziko, bohatý objev" },
];

const ExplorationPanel = ({ sessionId, playerName, currentTurn, worldFoundation, regions, expeditions, onExploreComplete }: Props) => {
  const [biome, setBiome] = useState("any");
  const [risk, setRisk] = useState("medium");
  const [exploring, setExploring] = useState(false);
  const [mode, setMode] = useState<"unknown" | "player" | null>(null);

  const activeExpeditions = expeditions.filter(e => e.status === "active" && e.player_name === playerName);
  const completedCount = expeditions.filter(e => e.status === "completed" && e.player_name === playerName).length;
  const selectedRisk = RISK_LEVELS.find(r => r.value === risk)!;

  // First expedition is free
  const isFirstExpedition = completedCount === 0;

  const handleExploreUnknown = async () => {
    setExploring(true);
    try {
      const { data, error } = await supabase.functions.invoke("explore-region", {
        body: {
          sessionId,
          playerName,
          currentTurn,
          worldFoundation,
          existingRegions: regions,
          biomePreference: biome === "any" ? undefined : biome,
          riskLevel: risk,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`🗺️ Objeveny nové země: ${data.region?.name || "Neznámý region"}!`);
      onExploreComplete(data.region?.id);
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("Rate limit")) {
        toast.error("Příliš mnoho výprav najednou. Počkejte chvíli.");
      } else {
        toast.error("Výprava selhala: " + (err.message || "Neznámá chyba"));
      }
    }
    setExploring(false);
  };

  if (!mode) {
    return (
      <div className="manuscript-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-illuminated" />
          <h3 className="font-display font-bold text-sm">Průzkumné výpravy</h3>
          {isFirstExpedition && (
            <Badge className="bg-primary/20 text-primary text-[9px] ml-auto">První výprava zdarma!</Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Vyšlete zvědy za hranice známého světa. Objevte nové regiony, města a postavy.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => setMode("unknown")}
            className="p-4 rounded-lg border border-border bg-card hover:border-primary/50 transition-all text-left group"
          >
            <div className="flex items-center gap-2 mb-2">
              <Map className="h-5 w-5 text-primary group-hover:scale-110 transition-transform" />
              <span className="font-display font-semibold text-sm">Výprava do neznáma</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Prozkoumejte neobjevené území. AI vygeneruje nový region s městy a NPC vládci.
            </p>
          </button>

          <button
            onClick={() => setMode("player")}
            className="p-4 rounded-lg border border-border bg-card hover:border-primary/50 transition-all text-left group"
          >
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-5 w-5 text-primary group-hover:scale-110 transition-transform" />
              <span className="font-display font-semibold text-sm">Zvědové k cizím provinciím</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Vyšlete zvědy k provinciím jiných hráčů. Odhalte jejich města a sílu.
            </p>
          </button>
        </div>

        {activeExpeditions.length > 0 && (
          <div className="border-t border-border pt-3">
            <p className="text-xs text-muted-foreground mb-2">
              🔄 Aktivní výpravy: {activeExpeditions.length}
            </p>
            {activeExpeditions.map(e => (
              <div key={e.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>{e.narrative?.slice(0, 50) || "Výprava probíhá…"}</span>
              </div>
            ))}
          </div>
        )}

        {completedCount > 0 && (
          <p className="text-[10px] text-muted-foreground text-right">
            Dokončených výprav: {completedCount}
          </p>
        )}
      </div>
    );
  }

  if (mode === "player") {
    // Player province scouting - discover existing player regions
    const otherPlayerRegions = regions.filter(r => r.owner_player && r.owner_player !== playerName && r.owner_player !== "NPC");
    
    return (
      <div className="manuscript-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-illuminated" />
          <h3 className="font-display font-bold text-sm">Zvědové k cizím provinciím</h3>
          <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={() => setMode(null)}>← Zpět</Button>
        </div>

        {otherPlayerRegions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6 italic">
            Žádné cizí regiony nejsou dosud známy. Nejdříve prozkoumejte neznámo.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Známé cizí regiony (částečné informace):</p>
            {otherPlayerRegions.map(r => (
              <div key={r.id} className="p-3 rounded-lg border border-border bg-card/50 flex items-center gap-3">
                <Mountain className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <span className="font-display text-sm">{r.name}</span>
                  <p className="text-[10px] text-muted-foreground">Vlastník: {r.owner_player}</p>
                </div>
                <Badge variant="outline" className="text-[9px]">Částečně známý</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Mode: unknown - configure and launch NPC exploration
  return (
    <div className="manuscript-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Map className="h-5 w-5 text-illuminated" />
        <h3 className="font-display font-bold text-sm">Výprava do neznáma</h3>
        <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={() => setMode(null)}>← Zpět</Button>
      </div>

      {/* Biome preference */}
      <div>
        <label className="text-xs font-display text-muted-foreground mb-1.5 block">Preference terénu</label>
        <div className="flex gap-1.5 flex-wrap">
          {BIOME_OPTIONS.map(b => (
            <Badge
              key={b.value}
              variant={biome === b.value ? "default" : "outline"}
              className="cursor-pointer text-xs gap-1 hover:bg-primary/10 transition-colors"
              onClick={() => setBiome(b.value)}
            >
              {b.icon}{b.label}
            </Badge>
          ))}
        </div>
      </div>

      {/* Risk level */}
      <div>
        <label className="text-xs font-display text-muted-foreground mb-1.5 block">Úroveň rizika</label>
        <div className="space-y-2">
          {RISK_LEVELS.map(r => (
            <label
              key={r.value}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                risk === r.value ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/20"
              }`}
              onClick={() => setRisk(r.value)}
            >
              <input type="radio" name="risk" value={r.value} checked={risk === r.value} onChange={() => setRisk(r.value)} className="sr-only" />
              <div className={`w-3 h-3 rounded-full border-2 ${risk === r.value ? "border-primary bg-primary" : "border-muted-foreground"}`} />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-display text-sm font-semibold">{r.label}</span>
                  {r.value === "high" && <Skull className="h-3 w-3 text-destructive" />}
                </div>
                <p className="text-[10px] text-muted-foreground">{r.description}</p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Coins className="h-3 w-3" />
                  <span>{isFirstExpedition ? "Zdarma" : `${r.cost} zlata`}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">Šance: {r.successRate}%</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Launch button */}
      <Button
        onClick={handleExploreUnknown}
        disabled={exploring}
        className="w-full font-display gap-2"
      >
        {exploring ? (
          <><Loader2 className="h-4 w-4 animate-spin" />Průzkum probíhá…</>
        ) : (
          <><Compass className="h-4 w-4" />🗺️ Vyslat výpravu</>
        )}
      </Button>
    </div>
  );
};

export default ExplorationPanel;
