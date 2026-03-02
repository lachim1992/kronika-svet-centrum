import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skull, Loader2, BookOpen, Sparkles, ImageIcon } from "lucide-react";
import { toast } from "sonner";

interface DeadPlayer {
  id: string;
  name: string;
  position: string;
  goals_scored: number;
  matches_played: number;
  birth_turn: number;
  death_turn: number;
  death_cause: string;
  portrait_url: string | null;
  bio: string | null;
  team_id: string;
  team_name: string;
  city_name: string;
  owner_player: string;
  color_primary: string;
  // match detail
  match_id?: string;
  match_round?: number;
  match_opponent?: string;
  match_score?: string;
  death_minute?: number;
  killer_name?: string;
}

interface Props {
  sessionId: string;
  currentPlayerName: string;
  onEntityClick?: (type: string, id: string, name: string) => void;
}

const POS_FULL: Record<string, string> = {
  praetor: "Praetor", guardian: "Strážce", striker: "Útočník", carrier: "Nositel", exactor: "Exaktor",
  goalkeeper: "Praetor", defender: "Strážce", midfielder: "Nositel", attacker: "Útočník",
};

export default function InMemoriamTab({ sessionId, currentPlayerName, onEntityClick }: Props) {
  const [deadPlayers, setDeadPlayers] = useState<DeadPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [writingId, setWritingId] = useState<string | null>(null);

  const fetchDead = useCallback(async () => {
    setLoading(true);
    const { data: dead } = await supabase
      .from("league_players")
      .select("id, name, position, goals_scored, matches_played, birth_turn, death_turn, death_cause, portrait_url, bio, team_id")
      .eq("session_id", sessionId)
      .eq("is_dead", true)
      .order("death_turn", { ascending: false });

    if (!dead || dead.length === 0) { setDeadPlayers([]); setLoading(false); return; }

    const teamIds = [...new Set(dead.map(d => d.team_id))];
    const { data: teams } = await supabase
      .from("league_teams")
      .select("id, team_name, city_id, player_name, color_primary")
      .in("id", teamIds);
    const teamMap = new Map((teams || []).map(t => [t.id, t]));

    const cityIds = [...new Set((teams || []).map(t => t.city_id).filter(Boolean))];
    const { data: cities } = await supabase
      .from("cities")
      .select("id, name")
      .in("id", cityIds);
    const cityMap = new Map((cities || []).map(c => [c.id, c.name]));

    // Find matches where players died by checking match_events for death injuries
    const deathTurns = [...new Set(dead.map(d => d.death_turn).filter(Boolean))];
    const { data: matchesData } = await supabase
      .from("league_matches")
      .select("id, round_number, home_team_id, away_team_id, home_score, away_score, match_events, played_turn")
      .eq("session_id", sessionId)
      .eq("status", "played")
      .in("played_turn", deathTurns);

    const enriched: DeadPlayer[] = dead.map(d => {
      const team = teamMap.get(d.team_id);
      const cityName = team ? (cityMap.get(team.city_id) || "?") : "?";
      
      const result: DeadPlayer = {
        ...d,
        team_name: team?.team_name || "?",
        city_name: cityName,
        owner_player: team?.player_name || "?",
        color_primary: team?.color_primary || "#666",
      };

      // Find the match where this player died
      if (matchesData && d.death_turn) {
        for (const match of matchesData) {
          if (match.played_turn !== d.death_turn) continue;
          // Check if this player's team was in this match
          if (match.home_team_id !== d.team_id && match.away_team_id !== d.team_id) continue;
          
          const events = Array.isArray(match.match_events) ? match.match_events : [];
          const deathEvent = events.find((e: any) =>
            e.type === "injury" && e.is_death === true && e.player_id === d.id
          );
          
          if (deathEvent || match.home_team_id === d.team_id || match.away_team_id === d.team_id) {
            const opponentId = match.home_team_id === d.team_id ? match.away_team_id : match.home_team_id;
            const opponent = teamMap.get(opponentId);
            const isHome = match.home_team_id === d.team_id;
            result.match_id = match.id;
            result.match_round = match.round_number;
            result.match_opponent = opponent?.team_name || "?";
            result.match_score = isHome
              ? `${match.home_score}:${match.away_score}`
              : `${match.away_score}:${match.home_score}`;
            
            if (deathEvent) {
              result.death_minute = (deathEvent as any).minute;
              // Find who knocked them out
              const eventsArr = Array.isArray(match.match_events) ? match.match_events : [];
              const knockoutEvent = eventsArr.find((e: any) =>
                e.type === "knockout" && e.victim_id === d.id
              );
              if (knockoutEvent) result.killer_name = (knockoutEvent as any).player_name;
            }
            break;
          }
        }
      }
      return result;
    });

    setDeadPlayers(enriched);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => { fetchDead(); }, [fetchDead]);

  const handleGenerateStatue = async (player: DeadPlayer) => {
    setGeneratingId(player.id);
    try {
      const prompt = `A grand bronze memorial statue of "${player.name}", a fallen Sphaera ${POS_FULL[player.position] || player.position} warrior athlete, in a classical ancient arena setting. The statue depicts a heroic pose, muscular build, wearing arena combat gear. At the base of the statue is a bronze plaque. The statue stands in a memorial garden with torches burning eternally. Dramatic lighting, solemn atmosphere. Style: ancient Roman/Greek memorial monument. Ultra high resolution.`;

      const { data, error } = await supabase.functions.invoke("encyclopedia-image", {
        body: {
          entityType: "person",
          entityName: player.name,
          entityId: player.id,
          sessionId,
          imagePrompt: prompt,
          createdBy: currentPlayerName,
          description: `${player.name}, ${POS_FULL[player.position] || player.position} týmu ${player.team_name}. Padl v ${player.death_turn}. kole${player.match_opponent ? ` v zápase proti ${player.match_opponent}` : ""}. ${player.death_cause || ""}`,
        },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }

      // Update player portrait
      if (data?.imageUrl) {
        await supabase.from("league_players")
          .update({ portrait_url: data.imageUrl } as any)
          .eq("id", player.id);
      }

      toast.success(`🗿 Pamětní socha ${player.name} odhalena!`);
      await fetchDead();
    } catch (e) {
      console.error(e);
      toast.error("Generování sochy selhalo");
    }
    setGeneratingId(null);
  };

  const handleWriteToChroWiki = async (player: DeadPlayer) => {
    setWritingId(player.id);
    try {
      const summary = [
        `${player.name} — ${POS_FULL[player.position] || player.position} týmu ${player.team_name} z města ${player.city_name}.`,
        `Odehrál ${player.matches_played} zápasů, vstřelil ${player.goals_scored} gólů.`,
        player.match_opponent
          ? `Padl v ${player.death_turn}. kole v zápase proti ${player.match_opponent} (${player.match_score}).`
          : `Padl v ${player.death_turn}. kole.`,
        player.killer_name ? `Smrtelný úder zasadil ${player.killer_name}.` : "",
        player.death_minute ? `K tragédii došlo v ${player.death_minute}. minutě.` : "",
        player.death_cause || "",
      ].filter(Boolean).join(" ");

      const { error } = await supabase.from("wiki_entries").upsert({
        session_id: sessionId,
        entity_type: "person",
        entity_id: player.id,
        entity_name: player.name,
        owner_player: player.owner_player,
        summary,
        ai_description: summary,
        image_url: player.portrait_url || null,
        tags: ["Sphaera", POS_FULL[player.position] || player.position, "In Memoriam", player.team_name],
      } as any, { onConflict: "session_id,entity_type,entity_id" });

      if (error) throw error;
      toast.success(`📜 ${player.name} zapsán do ChroWiki!`);
      if (onEntityClick) onEntityClick("person", player.id, player.name);
    } catch (e) {
      console.error(e);
      toast.error("Zápis do ChroWiki selhal");
    }
    setWritingId(null);
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
      </div>
    );
  }

  if (deadPlayers.length === 0) {
    return (
      <Card className="border-border bg-card/50">
        <CardContent className="p-8 text-center">
          <Skull className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Aréna si zatím nevyžádala žádné oběti.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Smrt přichází s brutálními zápasy Sphaery.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="border-border bg-card/50 border-t-2 border-t-red-900/40">
        <CardHeader className="py-2 px-3 border-b border-border/50">
          <CardTitle className="text-xs font-display flex items-center gap-2">
            <Skull className="h-4 w-4 text-red-400" />
            In Memoriam — Padlí hrdinové Sphaery
            <Badge variant="secondary" className="text-[9px]">{deadPlayers.length} obětí</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[600px]">
            <div className="divide-y divide-border/30">
              {deadPlayers.map(p => {
                const isGenerating = generatingId === p.id;
                const isWriting = writingId === p.id;
                return (
                  <div key={p.id} className="p-3 hover:bg-accent/5 transition-colors">
                    <div className="flex gap-3">
                      {/* Portrait / Statue */}
                      <div className="shrink-0 w-16 h-20 rounded-md overflow-hidden border border-border bg-muted/20">
                        {p.portrait_url ? (
                          <img src={p.portrait_url} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Skull className="h-6 w-6 text-red-400/30" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-display font-bold text-sm">{p.name}</span>
                          <Skull className="h-3.5 w-3.5 text-red-400" />
                          <Badge variant="outline" className="text-[9px]">{POS_FULL[p.position] || p.position}</Badge>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color_primary }} />
                            {p.team_name}
                          </span>
                          <span>📍 {p.city_name}</span>
                          <span>({p.owner_player})</span>
                        </div>

                        <div className="text-[10px] text-muted-foreground space-y-0.5">
                          <div>⚔️ {p.matches_played} zápasů · ⚽ {p.goals_scored} gólů</div>
                          <div className="text-red-300/80">
                            † Kolo {p.death_turn}
                            {p.match_opponent && <> · vs {p.match_opponent} ({p.match_score})</>}
                            {p.death_minute && <> · {p.death_minute}. minuta</>}
                            {p.killer_name && <> · smrtelný úder: <span className="font-medium text-red-400">{p.killer_name}</span></>}
                          </div>
                          {p.death_cause && <div className="italic text-muted-foreground/60">{p.death_cause}</div>}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-[10px] h-7 gap-1"
                            disabled={isGenerating}
                            onClick={() => handleGenerateStatue(p)}
                          >
                            {isGenerating ? (
                              <><Loader2 className="h-3 w-3 animate-spin" />Teším sochu...</>
                            ) : (
                              <><Sparkles className="h-3 w-3" />{p.portrait_url ? "Nová socha" : "Odhalit sochu"}</>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            className="text-[10px] h-7 gap-1"
                            disabled={isWriting}
                            onClick={() => handleWriteToChroWiki(p)}
                          >
                            {isWriting ? (
                              <><Loader2 className="h-3 w-3 animate-spin" />Zapisuji...</>
                            ) : (
                              <><BookOpen className="h-3 w-3" />Do ChroWiki</>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
