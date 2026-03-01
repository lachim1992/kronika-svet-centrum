import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trophy, Medal, Star, Skull, Newspaper, Loader2, BookOpen, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface Props {
  festivalId: string;
  sessionId: string;
  onClose: () => void;
}

interface FestivalData {
  name: string;
  host_player: string | null;
  announced_turn: number;
  concluded_turn: number | null;
  description: string | null;
  newspaper_report: string | null;
  best_athlete_id: string | null;
  most_popular_id: string | null;
}

const OlympiadReport = ({ festivalId, sessionId, onClose }: Props) => {
  const [festival, setFestival] = useState<FestivalData | null>(null);
  const [empireMedals, setEmpireMedals] = useState<Record<string, { gold: number; silver: number; bronze: number }>>({});
  const [disciplineResults, setDisciplineResults] = useState<any[]>([]);
  const [legends, setLegends] = useState<any[]>([]);
  const [dead, setDead] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReport();
  }, [festivalId]);

  const loadReport = async () => {
    setLoading(true);
    const [{ data: fest }, { data: parts }, { data: results }, { data: discs }] = await Promise.all([
      supabase.from("games_festivals").select("name, host_player, announced_turn, concluded_turn, description, newspaper_report, best_athlete_id, most_popular_id").eq("id", festivalId).single(),
      supabase.from("games_participants").select("*").eq("festival_id", festivalId),
      supabase.from("games_results").select("*").eq("festival_id", festivalId),
      supabase.from("games_disciplines").select("*"),
    ]);

    if (fest) setFestival(fest as any);

    // Build empire medal tally
    const empMedals: Record<string, { gold: number; silver: number; bronze: number }> = {};
    for (const r of (results || [])) {
      if (!r.medal) continue;
      const p = (parts || []).find((pp: any) => pp.id === r.participant_id);
      if (!p) continue;
      if (!empMedals[p.player_name]) empMedals[p.player_name] = { gold: 0, silver: 0, bronze: 0 };
      if (r.medal === "gold") empMedals[p.player_name].gold++;
      if (r.medal === "silver") empMedals[p.player_name].silver++;
      if (r.medal === "bronze") empMedals[p.player_name].bronze++;
    }
    setEmpireMedals(empMedals);

    // Build per-discipline results
    const discMap = new Map((discs || []).map((d: any) => [d.id, d]));
    const byDisc = new Map<string, any[]>();
    for (const r of (results || [])) {
      const list = byDisc.get(r.discipline_id) || [];
      list.push(r);
      byDisc.set(r.discipline_id, list);
    }
    const discResults: any[] = [];
    for (const [discId, discRes] of byDisc) {
      const disc = discMap.get(discId);
      if (!disc) continue;
      const sorted = [...discRes].sort((a: any, b: any) => (a.rank || 99) - (b.rank || 99));
      const top3 = sorted.slice(0, 3).map((r: any) => {
        const p = (parts || []).find((pp: any) => pp.id === r.participant_id);
        return { ...r, athlete_name: p?.athlete_name, player_name: p?.player_name };
      });
      discResults.push({ disc, top3 });
    }
    setDisciplineResults(discResults);

    setLegends((parts || []).filter((p: any) => p.is_legend));
    setDead((parts || []).filter((p: any) => p.form === "dead"));

    // Auto-generate newspaper if missing
    if (fest && !(fest as any).newspaper_report) {
      generateNewspaper();
    }

    setLoading(false);
  };

  const generateNewspaper = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("games-newspaper", {
        body: { session_id: sessionId, festival_id: festivalId },
      });
      if (error) throw error;
      if (data?.article) {
        setFestival(prev => prev ? { ...prev, newspaper_report: data.article } : prev);
      }
    } catch (e) {
      console.error("Newspaper generation failed:", e);
    }
    setGenerating(false);
  };

  const sortedEmpires = Object.entries(empireMedals)
    .sort((a, b) => (b[1].gold * 100 + b[1].silver * 10 + b[1].bronze) - (a[1].gold * 100 + a[1].silver * 10 + a[1].bronze));

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="text-center space-y-2">
        <Trophy className="h-12 w-12 text-primary mx-auto drop-shadow-[0_0_20px_hsl(var(--primary)/0.4)]" />
        <h1 className="font-display text-2xl font-bold text-foreground">
          {festival?.name || "Velké hry"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Rok {festival?.announced_turn}–{festival?.concluded_turn} • Hostitel: {festival?.host_player}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Medal Table */}
        <Card className="border-primary/20 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-sm flex items-center gap-1.5">
              <Medal className="h-4 w-4 text-yellow-400" /> Medailová tabulka říší
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {sortedEmpires.map(([name, m], idx) => (
                <div key={name} className={`flex items-center justify-between text-xs py-1.5 px-2 rounded ${idx === 0 ? "bg-primary/10 border border-primary/20" : "bg-muted/30"}`}>
                  <span className="font-display font-semibold">{idx === 0 ? "👑" : `${idx + 1}.`} {name}</span>
                  <span className="font-mono">{m.gold}🥇 {m.silver}🥈 {m.bronze}🥉</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Discipline Results */}
        <Card className="border-border bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-sm flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-primary" /> Výsledky disciplín
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="space-y-2 pr-2">
                {disciplineResults.map(({ disc, top3 }) => (
                  <div key={disc.id} className="p-2 rounded border border-border/50 bg-card/50">
                    <p className="text-[10px] font-display font-semibold mb-1">
                      {disc.icon_emoji} {disc.name}
                    </p>
                    {top3.map((r: any, i: number) => (
                      <div key={r.id} className="flex justify-between text-[9px]">
                        <span>{r.medal === "gold" ? "🥇" : r.medal === "silver" ? "🥈" : "🥉"} {r.athlete_name} ({r.player_name})</span>
                        <span className="font-mono text-muted-foreground">{r.total_score?.toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Legends + Dead */}
      {(legends.length > 0 || dead.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {legends.map(l => (
            <Badge key={l.id} className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
              <Star className="h-3 w-3 mr-1" /> {l.athlete_name} ({l.player_name})
            </Badge>
          ))}
          {dead.map(d => (
            <Badge key={d.id} className="bg-red-500/10 text-red-400 border-red-500/30">
              <Skull className="h-3 w-3 mr-1" /> {d.athlete_name}
            </Badge>
          ))}
        </div>
      )}

      {/* Newspaper Article */}
      <Card className="border-primary/20 bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-sm flex items-center gap-1.5">
            <Newspaper className="h-4 w-4 text-primary" /> Novinový report
          </CardTitle>
        </CardHeader>
        <CardContent>
          {generating ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Generuji novinový report…
            </div>
          ) : festival?.newspaper_report ? (
            <div className="prose-chronicle text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
              {festival.newspaper_report}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-xs text-muted-foreground mb-2">Report ještě nebyl vygenerován.</p>
              <Button size="sm" onClick={generateNewspaper}>
                <Newspaper className="h-3.5 w-3.5 mr-1" /> Generovat report
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-center gap-3">
        <Button variant="outline" onClick={onClose}>
          Zavřít
        </Button>
      </div>
    </div>
  );
};

export default OlympiadReport;
