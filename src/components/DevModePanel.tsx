import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bug, Droplets, Play, Shield, Sprout, FlaskConical, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import HydrationSection from "@/components/dev/HydrationSection";
import SimulationSection from "@/components/dev/SimulationSection";
import WorldIntegritySection from "@/components/dev/WorldIntegritySection";
import SeedSection from "@/components/dev/SeedSection";

interface DevModePanelProps {
  sessionId: string;
  currentPlayerName: string;
  onRefetch?: () => void;
  citiesCount: number;
  eventsCount: number;
  wondersCount: number;
  memoriesCount: number;
  playersCount: number;
}

interface QAResult { name: string; pass: boolean; detail?: string; }

const DevModePanel = ({
  sessionId, currentPlayerName, onRefetch,
  citiesCount, eventsCount, wondersCount, memoriesCount, playersCount,
}: DevModePanelProps) => {
  const [qaResults, setQaResults] = useState<QAResult[]>([]);
  const [running, setRunning] = useState(false);

  const runQATest = async () => {
    setRunning(true);
    setQaResults([]);
    const results: QAResult[] = [];
    const check = (name: string, pass: boolean, detail?: string) => results.push({ name, pass, detail });

    try {
      const [
        { data: cities }, { data: events }, { data: wonders },
        { data: chronicles }, { data: mems }, { data: intel },
        { data: provs }, { data: cs }, { data: plrs },
        { data: dipMsgs }, { data: trades }, { data: councils },
        { data: whChapters }, { data: pcChapters }, { data: crises },
        { data: decls }, { data: gp }, { data: countries },
      ] = await Promise.all([
        supabase.from("cities").select("*").eq("session_id", sessionId),
        supabase.from("game_events").select("*").eq("session_id", sessionId),
        supabase.from("wonders").select("*").eq("session_id", sessionId),
        supabase.from("chronicle_entries").select("*").eq("session_id", sessionId),
        supabase.from("world_memories").select("*").eq("session_id", sessionId),
        supabase.from("intelligence_reports").select("*").eq("session_id", sessionId),
        supabase.from("provinces").select("*").eq("session_id", sessionId),
        supabase.from("city_states").select("*").eq("session_id", sessionId),
        supabase.from("game_players").select("*").eq("session_id", sessionId),
        supabase.from("diplomacy_messages").select("*", { count: "exact" }),
        supabase.from("trade_log").select("*").eq("session_id", sessionId),
        supabase.from("council_evaluations").select("*").eq("session_id", sessionId),
        supabase.from("world_history_chapters").select("*").eq("session_id", sessionId),
        supabase.from("player_chronicle_chapters").select("*").eq("session_id", sessionId),
        supabase.from("world_crises").select("*").eq("session_id", sessionId),
        supabase.from("declarations").select("*").eq("session_id", sessionId),
        supabase.from("great_persons").select("*").eq("session_id", sessionId),
        supabase.from("countries").select("*").eq("session_id", sessionId),
      ]);

      check("Hráči (1+)", (plrs?.length || 0) >= 1, `${plrs?.length}`);
      check("Města (1+)", (cities?.length || 0) >= 1, `${cities?.length}`);
      check("Provincie (1+)", (provs?.length || 0) >= 1, `${provs?.length}`);
      check("Události (1+)", (events?.length || 0) >= 1, `${events?.length}`);
      check("Stát existuje", (countries?.length || 0) >= 1, `${countries?.length}`);
      check("Divy (1+)", (wonders?.length || 0) >= 1, `${wonders?.length}`);
      check("Osobnosti (1+)", (gp?.length || 0) >= 1, `${gp?.length}`);
      check("Kroniky (1+)", (chronicles?.length || 0) >= 1, `${chronicles?.length}`);
      check("Paměti světa (1+)", (mems?.length || 0) >= 1, `${mems?.length}`);

      // Hierarchy integrity
      const regionsWithoutCountry = (provs || []).filter(p => !p.region_id).length;
      const citiesWithoutProvince = (cities || []).filter(c => !c.province_id).length;
      check("Provincie→Region vazby", regionsWithoutCountry === 0, `${regionsWithoutCountry} bez regionu`);
      check("Města→Provincie vazby", citiesWithoutProvince === 0, `${citiesWithoutProvince} bez provincie`);
      check("Žádný redirect", window.location.pathname.includes("/game/"), window.location.pathname);
    } catch (e: any) {
      check("QA Error", false, e?.message || "unknown");
    }

    setQaResults(results);
    const passed = results.filter(r => r.pass).length;
    toast[passed === results.length ? "success" : "warning"](`QA: ${passed}/${results.length}`);
    setRunning(false);
  };

  const passCount = qaResults.filter(r => r.pass).length;

  return (
    <div className="space-y-4">
      {/* Header + Stats */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-display font-bold flex items-center gap-2">
          <Bug className="h-5 w-5 text-primary" />
          Dev Mode
        </h1>
        <Badge variant="outline" className="font-mono text-xs">
          session: {sessionId.slice(0, 8)}…
        </Badge>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {[
          { label: "Města", count: citiesCount },
          { label: "Události", count: eventsCount },
          { label: "Divy", count: wondersCount },
          { label: "Paměti", count: memoriesCount },
          { label: "Hráči", count: playersCount },
        ].map(s => (
          <div key={s.label} className="bg-card border rounded-lg p-2 text-center">
            <p className="text-xl font-bold font-display">{s.count}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="hydration" className="w-full">
        <TabsList className="grid w-full grid-cols-5 h-auto">
          <TabsTrigger value="hydration" className="text-xs gap-1 py-2">
            <Droplets className="h-3 w-3" /> Hydratace
          </TabsTrigger>
          <TabsTrigger value="simulation" className="text-xs gap-1 py-2">
            <Play className="h-3 w-3" /> Simulace
          </TabsTrigger>
          <TabsTrigger value="integrity" className="text-xs gap-1 py-2">
            <Shield className="h-3 w-3" /> Integrita
          </TabsTrigger>
          <TabsTrigger value="seed" className="text-xs gap-1 py-2">
            <Sprout className="h-3 w-3" /> Seed
          </TabsTrigger>
          <TabsTrigger value="qa" className="text-xs gap-1 py-2">
            <FlaskConical className="h-3 w-3" /> QA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hydration" className="mt-3">
          <HydrationSection sessionId={sessionId} onRefetch={onRefetch} />
        </TabsContent>
        <TabsContent value="simulation" className="mt-3">
          <SimulationSection sessionId={sessionId} onRefetch={onRefetch} />
        </TabsContent>
        <TabsContent value="integrity" className="mt-3">
          <WorldIntegritySection sessionId={sessionId} onRefetch={onRefetch} />
        </TabsContent>
        <TabsContent value="seed" className="mt-3">
          <SeedSection sessionId={sessionId} onRefetch={onRefetch} />
        </TabsContent>
        <TabsContent value="qa" className="mt-3">
          <div className="bg-card border rounded-lg p-4 space-y-4">
            <h3 className="font-display font-semibold text-sm flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-primary" />
              QA Test
            </h3>
            <Button onClick={runQATest} disabled={running} className="w-full h-10 gap-2">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
              {running ? "Testuji..." : "🧪 Spustit QA test"}
            </Button>

            {qaResults.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">Výsledky</span>
                  <Badge variant={passCount === qaResults.length ? "default" : "destructive"}>
                    {passCount}/{qaResults.length}
                  </Badge>
                </div>
                {qaResults.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm py-1 border-b border-border last:border-0">
                    {r.pass ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0" /> : <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                    <span className="font-medium">{r.name}</span>
                    {r.detail && <span className="text-xs text-muted-foreground ml-auto">{r.detail}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DevModePanel;
