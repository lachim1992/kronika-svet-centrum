import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Loader2, Play, Trash2, BookOpen } from "lucide-react";
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
  cityId?: string;
  cityName?: string;
}

const EVENT_TEMPLATES: Record<string, (city: string) => string> = {
  famine: (c) => `Hladomor zasáhl ${c}. Obyvatelé hladoví.`,
  growth: (c) => `${c} zažívá období prosperity a růstu.`,
  trade: (c) => `${c} navázalo nové obchodní spojení.`,
  construction: (c) => `V ${c} byla dokončena nová stavba.`,
  festival: (c) => `${c} slaví velký festival.`,
  dispute: (c) => `Spor mezi měšťany v ${c}.`,
  discovery: (c) => `Průzkumníci z ${c} učinili objev.`,
  military: (c) => `Vojenská hrozba na hranicích ${c}.`,
  crisis: (c) => `Nízká stabilita vedla k nepokojům v ${c}.`,
  plague: (c) => `Morová epidemie vypukla v ${c}.`,
  harvest: (c) => `Rekordní úroda v okolí ${c}.`,
};

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const LocalSimulationSection = ({ sessionId, currentPlayerName, onRefetch }: Props) => {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<SimEvent[] | null>(null);
  const [progressPct, setProgressPct] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  const YEARS = 10;

  const runSimulation = async () => {
    setRunning(true);
    setResults(null);
    setProgressPct(0);

    try {
      // Check for overlapping simulation
      const { data: sessionData } = await supabase.from("game_sessions").select("current_turn").eq("id", sessionId).single();
      const startYear = sessionData?.current_turn || 1;
      const endYear = startYear + YEARS - 1;

      const { data: overlap } = await supabase.from("simulation_log")
        .select("id")
        .eq("session_id", sessionId)
        .eq("triggered_by", currentPlayerName)
        .gte("year_end", startYear)
        .lte("year_start", endYear)
        .limit(1);

      if (overlap && overlap.length > 0) {
        toast.error("Simulace pro toto období již proběhla.");
        setRunning(false);
        return;
      }

      // Fetch player data
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

      const grainNet = realm?.last_turn_grain_net ?? 0;
      const simEvents: SimEvent[] = [];

      // Generate events per year
      for (let yearOffset = 0; yearOffset < YEARS; yearOffset++) {
        const year = startYear + yearOffset;
        setStatusText(`Simuluji rok ${year}…`);
        setProgressPct(Math.round(((yearOffset + 1) / YEARS) * 100));

        const eventsThisYear: SimEvent[] = [];

        // Economic events
        if (grainNet < 0 && yearOffset % 3 === 0) {
          const city = pick(myCities);
          eventsThisYear.push({ year, type: "famine", description: EVENT_TEMPLATES.famine(city.name), cityId: city.id, cityName: city.name });
        }
        if (grainNet > 20 && yearOffset % 4 === 0) {
          const city = pick(myCities);
          eventsThisYear.push({ year, type: "growth", description: EVENT_TEMPLATES.growth(city.name), cityId: city.id, cityName: city.name });
        }

        // City events (1-3 per year)
        const numCityEvents = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < numCityEvents; i++) {
          const city = pick(myCities);
          const types = ["trade", "construction", "festival", "dispute", "discovery", "harvest"];
          const type = pick(types);
          eventsThisYear.push({
            year, type,
            description: (EVENT_TEMPLATES[type] || EVENT_TEMPLATES.trade)(city.name),
            cityId: city.id, cityName: city.name,
          });
        }

        // Military event
        if (yearOffset === 4 || yearOffset === 8) {
          const city = pick(myCities);
          eventsThisYear.push({ year, type: "military", description: EVENT_TEMPLATES.military(city.name), cityId: city.id, cityName: city.name });
        }

        // Crisis
        const stability = realm?.stability ?? 70;
        if (stability < 40 && yearOffset === 5) {
          const city = pick(myCities);
          eventsThisYear.push({ year, type: "crisis", description: EVENT_TEMPLATES.crisis(city.name), cityId: city.id, cityName: city.name });
        }

        // Persist events to DB
        if (eventsThisYear.length > 0) {
          const rows = eventsThisYear.map(ev => ({
            session_id: sessionId,
            event_type: ev.type,
            player: currentPlayerName,
            turn_number: year,
            city_id: ev.cityId || null,
            location: ev.cityName || null,
            note: ev.description,
            confirmed: true,
            truth_state: "canon" as const,
          }));
          await supabase.from("game_events").insert(rows);
        }

        // Advance turn
        await supabase.from("game_sessions").update({ current_turn: year + 1 }).eq("id", sessionId);

        simEvents.push(...eventsThisYear);
      }

      // Log simulation
      await supabase.from("simulation_log").insert({
        session_id: sessionId,
        year_start: startYear,
        year_end: endYear,
        scope: "player",
        triggered_by: currentPlayerName,
        events_generated: simEvents.length,
      });

      setResults(simEvents);
      toast.success(`Uplynulo ${YEARS} let. ${simEvents.length} událostí zapsáno.`);
      onRefetch?.();
    } catch (err: any) {
      toast.error("Simulace selhala: " + (err.message || "Neznámá chyba"));
    }
    setRunning(false);
    setStatusText("");
    setProgressPct(0);
  };

  const regenerateChronicle = async () => {
    if (!results || results.length === 0) return;
    setRegenerating(true);
    try {
      const minYear = Math.min(...results.map(e => e.year));
      const maxYear = Math.max(...results.map(e => e.year));

      // Group events by year for summary
      const byYear: Record<number, SimEvent[]> = {};
      for (const ev of results) {
        (byYear[ev.year] = byYear[ev.year] || []).push(ev);
      }

      const summaryParts: string[] = [];
      for (let y = minYear; y <= maxYear; y++) {
        const yEvents = byYear[y];
        if (!yEvents?.length) continue;
        const descriptions = yEvents.map(e => e.description).join(" ");
        summaryParts.push(`Rok ${y}: ${descriptions}`);
      }

      await supabase.from("player_chronicle_chapters").insert({
        session_id: sessionId,
        player_name: currentPlayerName,
        chapter_title: `Kronika let ${minYear}–${maxYear}`,
        chapter_text: summaryParts.join("\n\n"),
        from_turn: minYear,
        to_turn: maxYear,
        epoch_style: "kroniky",
      });

      toast.success("Kronika aktualizována!");
    } catch (err: any) {
      toast.error("Regenerace kroniky selhala");
    }
    setRegenerating(false);
  };

  const typeIcons: Record<string, string> = {
    famine: "🔥", growth: "📈", trade: "🤝", construction: "🏗️",
    festival: "🎉", dispute: "⚔️", discovery: "🔍", military: "🛡️",
    crisis: "💀", plague: "☠️", harvest: "🌾",
  };

  const typeColors: Record<string, string> = {
    famine: "text-destructive", growth: "text-green-500", military: "text-blue-500",
    crisis: "text-destructive", trade: "text-primary", construction: "text-primary",
    plague: "text-destructive", harvest: "text-green-500",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display font-semibold text-sm">Simulace vývoje mé říše (10 let)</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Posune čas o 10 let. Události budou trvale zapsány.
          </p>
        </div>
        <Button onClick={runSimulation} disabled={running} size="sm" className="font-display gap-1.5">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {running ? "Simuluji…" : "Simulovat 10 let"}
        </Button>
      </div>

      {/* Progress */}
      {running && (
        <div className="space-y-2">
          <Progress value={progressPct} className="h-2" />
          <p className="text-xs text-muted-foreground text-center">{statusText}</p>
        </div>
      )}

      {results && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-xs">{results.length} událostí za 10 let</Badge>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={regenerateChronicle} disabled={regenerating}>
                <BookOpen className="h-3 w-3" />
                {regenerating ? "Generuji…" : "Zapsat kroniku"}
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setResults(null)}>
                <Trash2 className="h-3 w-3" />Skrýt
              </Button>
            </div>
          </div>
          <ScrollArea className="max-h-80">
            <div className="space-y-1.5">
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
          </ScrollArea>
          <p className="text-[10px] text-muted-foreground italic text-center">
            ✅ Události byly trvale zapsány do databáze.
          </p>
        </div>
      )}
    </div>
  );
};

export default LocalSimulationSection;
