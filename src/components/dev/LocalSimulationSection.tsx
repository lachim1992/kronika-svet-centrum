import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  onRefetch?: () => void;
}

interface SimEvent {
  year: number;
  type: string;
  description: string;
}

const LocalSimulationSection = ({ sessionId, currentPlayerName, onRefetch }: Props) => {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<SimEvent[] | null>(null);

  const runSimulation = async () => {
    setRunning(true);
    setResults(null);
    try {
      // Fetch player's current cities & resources for local sim
      const [citiesRes, realmRes] = await Promise.all([
        supabase.from("cities").select("*").eq("session_id", sessionId).eq("owner_player", currentPlayerName),
        supabase.from("realm_resources").select("*").eq("session_id", sessionId).eq("player_name", currentPlayerName).maybeSingle(),
      ]);

      const myCities = citiesRes.data || [];
      const realm = realmRes.data;

      if (myCities.length === 0) {
        toast.error("Nemáte žádná města k simulaci");
        setRunning(false);
        return;
      }

      // Generate deterministic local simulation (no server write)
      const simEvents: SimEvent[] = [];
      const totalPop = myCities.reduce((s, c) => s + (c.population_total || 0), 0);
      const grainNet = realm?.last_turn_grain_net ?? 0;

      for (let year = 1; year <= 10; year++) {
        const growthRate = grainNet >= 0 ? 0.03 : -0.02;
        const projectedPop = Math.round(totalPop * Math.pow(1 + growthRate, year));

        // Economic events
        if (grainNet < 0 && year % 3 === 0) {
          simEvents.push({ year, type: "famine", description: `Hladomor zasáhl říši. Populace klesla na ~${projectedPop.toLocaleString()}.` });
        }
        if (grainNet > 20 && year % 4 === 0) {
          simEvents.push({ year, type: "growth", description: `Období prosperity. Populace vzrostla na ~${projectedPop.toLocaleString()}.` });
        }

        // City events
        if (year % 2 === 0 && myCities.length > 0) {
          const randomCity = myCities[Math.floor(Math.random() * myCities.length)];
          const eventTypes = ["trade", "construction", "festival", "dispute", "discovery"];
          const eventType = eventTypes[year % eventTypes.length];
          const descriptions: Record<string, string> = {
            trade: `${randomCity.name} navázalo nové obchodní spojení.`,
            construction: `V ${randomCity.name} byla dokončena nová stavba.`,
            festival: `${randomCity.name} slaví velký festival.`,
            dispute: `Spor mezi měšťany v ${randomCity.name}.`,
            discovery: `Průzkumníci z ${randomCity.name} učinili objev.`,
          };
          simEvents.push({ year, type: eventType, description: descriptions[eventType] });
        }

        // Military events
        if (year === 5 || year === 8) {
          simEvents.push({ year, type: "military", description: `Vojenská hrozba na hranicích říše. Armáda mobilizována.` });
        }

        // Stability
        const stability = realm?.stability ?? 70;
        if (stability < 40 && year === 6) {
          simEvents.push({ year, type: "crisis", description: `Nízká stabilita vedla k nepokojům v říši.` });
        }
      }

      setResults(simEvents);
      toast.success("Lokální simulace dokončena (10 let)", { description: "Žádná data nebyla zapsána do hry." });
    } catch (err: any) {
      toast.error("Simulace selhala: " + (err.message || "Neznámá chyba"));
    }
    setRunning(false);
  };

  const typeIcons: Record<string, string> = {
    famine: "🔥", growth: "📈", trade: "🤝", construction: "🏗️",
    festival: "🎉", dispute: "⚔️", discovery: "🔍", military: "🛡️", crisis: "💀",
  };

  const typeColors: Record<string, string> = {
    famine: "text-destructive", growth: "text-success", military: "text-info",
    crisis: "text-destructive", trade: "text-primary", construction: "text-primary",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display font-semibold text-sm">Lokální simulace (10 let)</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Simuluje vývoj vašich měst. Neovlivňuje ostatní hráče ani globální stav.
          </p>
        </div>
        <Button onClick={runSimulation} disabled={running} size="sm" className="font-display gap-1.5">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {running ? "Simuluji…" : "Spustit"}
        </Button>
      </div>

      {results && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-xs">{results.length} událostí za 10 let</Badge>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setResults(null)}>
              <Trash2 className="h-3 w-3" />Smazat
            </Button>
          </div>
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {results.map((ev, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-card border border-border">
                <span className="text-sm">{typeIcons[ev.type] || "📌"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">Rok {ev.year}</Badge>
                    <span className={`text-[10px] font-semibold ${typeColors[ev.type] || ""}`}>{ev.type}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{ev.description}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground italic text-center">
            ⚠️ Toto je lokální náhled. Žádná data nebyla zapsána do databáze.
          </p>
        </div>
      )}
    </div>
  );
};

export default LocalSimulationSection;
