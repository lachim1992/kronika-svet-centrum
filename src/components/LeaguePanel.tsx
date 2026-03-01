import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Trophy, Users, Calendar, Star, Target, Shield, Swords, Play, Loader2, ChevronLeft, Building2, Plus, Award, TrendingUp } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
}

interface Team {
  id: string; city_id: string; player_name: string; team_name: string;
  motto: string | null; attack_rating: number; defense_rating: number;
  tactics_rating: number; discipline_rating: number; popularity: number;
  fan_base: number; titles_won: number; color_primary: string; color_secondary: string;
  seasons_played: number; total_wins: number; total_goals_for: number; total_goals_against: number;
}

interface Association {
  id: string; name: string; player_name: string; scouting_level: number; youth_development: number;
  training_quality: number; fan_base: number; reputation: number; city_id: string; budget: number;
}

interface Standing {
  id: string; team_id: string; played: number; wins: number; draws: number;
  losses: number; goals_for: number; goals_against: number; points: number;
  form: string; position: number;
}

interface Match {
  id: string; round_number: number; turn_number: number;
  home_team_id: string; away_team_id: string;
  home_score: number | null; away_score: number | null;
  status: string; match_events: any[]; highlight_text: string | null;
  attendance: number; played_turn: number | null;
}

interface Season {
  id: string; season_number: number; status: string; started_turn: number;
  ended_turn: number | null; total_rounds: number; current_round: number;
  champion_team_id: string | null; top_scorer_player_id: string | null;
  best_defense_team_id: string | null;
}

interface Player {
  id: string; team_id: string; name: string; position: string;
  strength: number; speed: number; technique: number; stamina: number;
  aggression: number; leadership: number; is_captain: boolean;
  goals_scored: number; assists: number; matches_played: number;
  overall_rating: number; form: number; condition: number;
  injury_turns: number; yellow_cards: number; red_cards: number;
}

interface Stadium {
  id: string; name: string; city_id: string; current_level: number;
}

const FORM_COLORS: Record<string, string> = {
  W: "bg-green-500/80 text-green-50",
  D: "bg-yellow-500/80 text-yellow-50",
  L: "bg-red-500/80 text-red-50",
};

const POS_LABELS: Record<string, string> = {
  goalkeeper: "GK", defender: "DEF", midfielder: "MID", attacker: "ATK",
};
const POS_FULL: Record<string, string> = {
  goalkeeper: "Brankář", defender: "Obránce", midfielder: "Záložník", attacker: "Útočník",
};
const POS_ORDER = ["goalkeeper", "defender", "midfielder", "attacker"];

function ratingColor(r: number) {
  if (r >= 75) return "text-green-400";
  if (r >= 55) return "text-yellow-400";
  if (r >= 40) return "text-orange-400";
  return "text-red-400";
}

function formLabel(f: number) {
  if (f >= 70) return { text: "🔥 Skvělá", cls: "text-green-400" };
  if (f >= 50) return { text: "✓ Dobrá", cls: "text-yellow-400" };
  if (f >= 30) return { text: "↓ Slabá", cls: "text-orange-400" };
  return { text: "💀 Špatná", cls: "text-red-400" };
}

const LeaguePanel = ({ sessionId, currentPlayerName, currentTurn }: Props) => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [stadiums, setStadiums] = useState<Stadium[]>([]);
  const [associations, setAssociations] = useState<Association[]>([]);
  const [cities, setCities] = useState<Map<string, string>>(new Map());
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [playingRound, setPlayingRound] = useState(false);
  const [creatingAssoc, setCreatingAssoc] = useState(false);
  const [roundResult, setRoundResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: t }, { data: s }, { data: seas }, { data: blds }, { data: cits }, { data: assocs }] = await Promise.all([
      supabase.from("league_teams").select("*").eq("session_id", sessionId).eq("is_active", true),
      supabase.from("league_seasons").select("*").eq("session_id", sessionId).order("season_number", { ascending: false }),
      supabase.from("league_seasons").select("id").eq("session_id", sessionId).eq("status", "active").maybeSingle(),
      supabase.from("city_buildings").select("id, name, city_id, current_level").eq("session_id", sessionId).eq("status", "completed").contains("building_tags", ["stadium"]),
      supabase.from("cities").select("id, name").eq("session_id", sessionId),
      supabase.from("sports_associations").select("*").eq("session_id", sessionId),
    ]);
    setTeams((t || []) as any);
    setSeasons((s || []) as any);
    setStadiums((blds || []) as any);
    setAssociations((assocs || []) as any);
    const cityMap = new Map<string, string>();
    for (const c of (cits || [])) cityMap.set(c.id, c.name);
    setCities(cityMap);

    const activeSeasonId = seas?.id || (s && s.length > 0 ? s[0].id : null);
    if (activeSeasonId) {
      const [{ data: st }, { data: m }, { data: pl }] = await Promise.all([
        supabase.from("league_standings").select("*").eq("season_id", activeSeasonId).order("position", { ascending: true }),
        supabase.from("league_matches").select("*").eq("season_id", activeSeasonId).order("round_number", { ascending: true }),
        supabase.from("league_players").select("*").in("team_id", (t || []).map((tt: any) => tt.id)).order("goals_scored", { ascending: false }),
      ]);
      setStandings((st || []) as any);
      setMatches((m || []) as any);
      setPlayers((pl || []) as any);
    }
    setLoading(false);
  }, [sessionId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handlePlayRound = async () => {
    setPlayingRound(true);
    setRoundResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("league-play-round", {
        body: { session_id: sessionId, player_name: currentPlayerName },
      });
      if (error) throw error;
      if (data?.error && !data?.seasonComplete) { toast.error(data.error); return; }
      if (data?.seasonComplete && data?.error) { toast.info(data.error); return; }
      setRoundResult(data);
      toast.success(`⚽ Kolo ${data.round} odehráno!`);
      await fetchData();
    } catch (e: any) { toast.error(e.message); } finally { setPlayingRound(false); }
  };

  const handleCreateAssociation = async () => {
    if (cities.size === 0) { toast.error("Potřebuješ město."); return; }
    setCreatingAssoc(true);
    try {
      const myTeams = teams.filter(t => t.player_name === currentPlayerName);
      const cityId = myTeams.length > 0 ? myTeams[0].city_id : Array.from(cities.keys())[0];
      const cityName = cities.get(cityId) || "?";
      const { error } = await supabase.from("sports_associations").insert({
        session_id: sessionId,
        city_id: cityId,
        player_name: currentPlayerName,
        name: `Sportovní svaz ${cityName}`,
        reputation: 10,
        scouting_level: 1,
        youth_development: 1,
        training_quality: 1,
        fan_base: 50,
        budget: 50,
        founded_turn: currentTurn,
      });
      if (error) throw error;
      toast.success("Asociace založena!");
      await fetchData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreatingAssoc(false);
    }
  };

  const teamMap = new Map(teams.map(t => [t.id, t]));
  const activeSeason = seasons.find(s => s.status === "active") || seasons[0];
  const concludedSeasons = seasons.filter(s => s.status === "concluded");
  const playedMatches = matches.filter(m => m.status === "played").sort((a, b) => b.round_number - a.round_number);
  const upcomingMatches = matches.filter(m => m.status === "scheduled").sort((a, b) => a.round_number - b.round_number);
  const topScorers = [...players].filter(p => (p.goals_scored || 0) > 0).sort((a, b) => (b.goals_scored || 0) - (a.goals_scored || 0)).slice(0, 10);

  const stadiumByCityId = new Map(stadiums.map(s => [s.city_id, s]));
  
  const myAssociation = associations.find(a => a.player_name === currentPlayerName);

  // Title leaderboard
  const titleLeaderboard = [...teams].filter(t => (t.titles_won || 0) > 0).sort((a, b) => (b.titles_won || 0) - (a.titles_won || 0));

  if (loading) {
    return (
      <Card className="border-border bg-card/50">
        <CardContent className="p-8 text-center">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-xs text-muted-foreground mt-2">Načítám ligu...</p>
        </CardContent>
      </Card>
    );
  }

  // Team detail view
  if (selectedTeam) {
    const t = teamMap.get(selectedTeam);
    if (t) {
      const teamPlayers = players.filter(p => p.team_id === t.id)
        .sort((a, b) => POS_ORDER.indexOf(a.position) - POS_ORDER.indexOf(b.position));
      const stadium = stadiumByCityId.get(t.city_id);
      const cityName = cities.get(t.city_id);

      return (
        <div className="space-y-3">
          <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setSelectedTeam(null)}>
            <ChevronLeft className="h-3 w-3" /> Zpět na přehled
          </Button>
          
          <Card className="border-primary/20 bg-card/50">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-2xl border-4 border-primary/20 shrink-0"
                style={{ backgroundColor: t.color_primary, color: t.color_secondary }}>⚽</div>
              <div className="flex-1 min-w-0">
                <h3 className="font-display font-bold text-xl">{t.team_name}</h3>
                <p className="text-xs text-muted-foreground italic">{t.motto}</p>
                <div className="flex items-center gap-2 mt-2 text-xs flex-wrap">
                   <Badge variant="outline" className="gap-1">
                     <Building2 className="h-3 w-3" /> {stadium ? stadium.name : "Bez stadionu"}
                   </Badge>
                   <Badge variant="outline" className="gap-1">📍 {cityName || "?"}</Badge>
                   <Badge variant="outline" className="gap-1">
                     <Users className="h-3 w-3" /> {t.fan_base} fans
                   </Badge>
                   <Badge variant="outline" className="gap-1 text-muted-foreground">
                     👤 {t.player_name}
                   </Badge>
                   {(t.titles_won || 0) > 0 && (
                     <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30 gap-1">🏆 {t.titles_won}×</Badge>
                   )}
                </div>
              </div>
              <div className="text-right space-y-1">
                <div className="text-xs font-mono">Útok <span className="font-bold">{t.attack_rating}</span></div>
                <div className="text-xs font-mono">Obrana <span className="font-bold">{t.defense_rating}</span></div>
                <div className="text-xs font-mono">Taktika <span className="font-bold">{t.tactics_rating}</span></div>
                {(t.seasons_played || 0) > 0 && (
                  <div className="text-[9px] text-muted-foreground mt-2">
                    {t.seasons_played} sezón · {t.total_wins || 0}V · {t.total_goals_for || 0} gólů
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Roster */}
          <Card className="border-border bg-card/50 overflow-hidden">
            <CardHeader className="py-2 px-3 border-b border-border/50">
              <CardTitle className="text-xs font-display flex justify-between items-center">
                Soupiska týmu
                <span className="text-[10px] font-normal text-muted-foreground">{teamPlayers.length} hráčů</span>
              </CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                    <th className="px-2 py-1.5 text-left">Hráč</th>
                    <th className="px-1 py-1.5 text-center">Pozice</th>
                    <th className="px-1 py-1.5 text-center">OVR</th>
                    <th className="px-1 py-1.5 text-center">Forma</th>
                    <th className="px-1 py-1.5 text-center">Kondice</th>
                    <th className="px-1 py-1.5 text-center">Zápasy</th>
                    <th className="px-1 py-1.5 text-center">Góly</th>
                    <th className="px-1 py-1.5 text-center">Asist.</th>
                  </tr>
                </thead>
                <tbody>
                  {teamPlayers.map(p => {
                    const fl = formLabel(p.form);
                    return (
                      <tr key={p.id} 
                        className="border-b border-border/50 hover:bg-primary/5 cursor-pointer transition-colors"
                        onClick={() => setSelectedPlayer(p)}>
                        <td className="px-2 py-1.5 font-semibold">
                          {p.is_captain && <span className="text-yellow-400 mr-1" title="Kapitán">©</span>}
                          {p.name}
                          {p.injury_turns > 0 && <span className="text-red-400 ml-1" title="Zraněn">🏥</span>}
                        </td>
                        <td className="px-1 py-1.5 text-center text-muted-foreground">{POS_LABELS[p.position]}</td>
                        <td className={`px-1 py-1.5 text-center font-bold font-mono ${ratingColor(p.overall_rating)}`}>{p.overall_rating}</td>
                        <td className={`px-1 py-1.5 text-center ${fl.cls}`}>{p.form}</td>
                        <td className="px-1 py-1.5 text-center">
                          <div className="w-12 h-1.5 bg-secondary rounded-full mx-auto overflow-hidden">
                            <div className={`h-full ${p.condition < 60 ? 'bg-red-500' : p.condition < 85 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${p.condition}%` }} />
                          </div>
                        </td>
                        <td className="px-1 py-1.5 text-center">{p.matches_played}</td>
                        <td className="px-1 py-1.5 text-center font-bold">{p.goals_scored || 0}</td>
                        <td className="px-1 py-1.5 text-center">{p.assists || 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      );
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Swords className="h-5 w-5 text-primary" />
          <h3 className="font-display font-bold text-base">Sphaera Liga</h3>
          {activeSeason && (
            <Badge variant="outline" className="text-[9px]">
              {activeSeason.season_number}. sezóna — kolo {activeSeason.current_round}/{activeSeason.total_rounds}
            </Badge>
          )}
        </div>
        
        <div className="flex gap-2">
          {!myAssociation && (
            <Button size="sm" variant="outline" className="text-xs gap-1" onClick={handleCreateAssociation} disabled={creatingAssoc}>
              {creatingAssoc ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Založit Asociaci
            </Button>
          )}
          {teams.length > 1 && (
             <Button size="sm" className="text-xs gap-1 shadow-lg shadow-primary/10" onClick={handlePlayRound} disabled={playingRound}>
               {playingRound ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
               Odehrát ligové kolo
             </Button>
          )}
        </div>
      </div>

      {/* Round result overlay */}
      {roundResult && (
        <Card className="border-primary/30 bg-primary/5 animate-in fade-in slide-in-from-top-4">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-display font-bold text-primary flex items-center gap-1">
                📢 Výsledky {roundResult.round}. kola
              </span>
              <Button variant="ghost" size="sm" className="text-[9px] h-5 w-5 p-0" onClick={() => setRoundResult(null)}>✕</Button>
            </div>
            <div className="grid gap-1">
              {roundResult.matches?.map((m: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-background/40 p-1.5 rounded">
                  <span className="flex-1 text-right truncate font-medium">{m.home}</span>
                  <span className="font-display font-bold min-w-[3rem] text-center bg-background/60 rounded px-1">
                    {m.homeScore} : {m.awayScore}
                  </span>
                  <span className="flex-1 truncate font-medium">{m.away}</span>
                </div>
              ))}
            </div>
            {roundResult.commentary && (
              <div className="bg-background/30 p-2 rounded border border-primary/10">
                <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                  "{roundResult.commentary}"
                </p>
              </div>
            )}
            {roundResult.seasonComplete && (
              <div className="text-center py-1">
                 <Badge className="bg-yellow-500 text-black hover:bg-yellow-400 border-none">🏆 Sezóna ukončena! 🏆</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {teams.length === 0 ? (
        <Card className="border-border bg-card/50">
          <CardContent className="p-8 text-center">
            <Swords className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-sm text-muted-foreground">Žádné týmy v lize.</p>
            <p className="text-xs text-muted-foreground mt-1">Postav Arénu nebo Stadion ve městě.</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="table" className="space-y-3">
          <TabsList className="grid w-full grid-cols-5 bg-muted/20">
            <TabsTrigger value="table" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary"><Trophy className="h-3 w-3 mr-1" />Tabulka</TabsTrigger>
            <TabsTrigger value="matches" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary"><Calendar className="h-3 w-3 mr-1" />Zápasy</TabsTrigger>
            <TabsTrigger value="scorers" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary"><Target className="h-3 w-3 mr-1" />Střelci</TabsTrigger>
            <TabsTrigger value="team" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary"><Users className="h-3 w-3 mr-1" />Týmy</TabsTrigger>
            <TabsTrigger value="assoc" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary"><Award className="h-3 w-3 mr-1" />Asociace</TabsTrigger>
          </TabsList>

          {/* ═══ STANDINGS ═══ */}
          <TabsContent value="table">
            <Card className="border-border bg-card/50">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground bg-muted/10">
                        <th className="p-2 text-left w-8">#</th>
                        <th className="p-2 text-left">Tým</th>
                        <th className="p-2 text-left text-[9px]">Hráč</th>
                        <th className="p-2 text-center w-8">Z</th>
                        <th className="p-2 text-center w-8">V</th>
                        <th className="p-2 text-center w-8">R</th>
                        <th className="p-2 text-center w-8">P</th>
                        <th className="p-2 text-center w-16">Skóre</th>
                        <th className="p-2 text-center w-8 font-bold">B</th>
                        <th className="p-2 text-center w-16">Forma</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.length > 0 ? standings.map((st, i) => {
                        const team = teamMap.get(st.team_id);
                        if (!team) return null;
                        const isMyTeam = team.player_name === currentPlayerName;
                        return (
                          <tr key={st.id}
                            className={`border-b border-border/50 hover:bg-accent/10 cursor-pointer transition-colors ${isMyTeam ? "bg-primary/5" : ""} ${i === 0 ? "font-medium" : ""}`}
                            onClick={() => setSelectedTeam(team.id)}
                          >
                            <td className="p-2">
                              {i === 0 ? <span className="text-yellow-400">🏆</span> : 
                               i < 3 ? <span className="text-muted-foreground font-bold">{i + 1}.</span> : 
                               <span className="text-muted-foreground">{i + 1}.</span>}
                            </td>
                            <td className="p-2">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: team.color_primary }} />
                                <span className={isMyTeam ? "text-primary font-medium" : ""}>{team.team_name}</span>
                                {(team.titles_won || 0) > 0 && <span className="text-yellow-400 text-[9px]">🏆{team.titles_won}</span>}
                              </div>
                            </td>
                            <td className="p-2 text-[9px] text-muted-foreground truncate max-w-[60px]">{team.player_name}</td>
                            <td className="p-2 text-center text-muted-foreground">{st.played}</td>
                            <td className="p-2 text-center text-green-400/80">{st.wins}</td>
                            <td className="p-2 text-center text-yellow-400/80">{st.draws}</td>
                            <td className="p-2 text-center text-red-400/80">{st.losses}</td>
                            <td className="p-2 text-center tracking-tighter">{st.goals_for}:{st.goals_against}</td>
                            <td className="p-2 text-center font-bold text-sm">{st.points}</td>
                            <td className="p-2 text-center">
                              <div className="flex gap-0.5 justify-center">
                                {(st.form || "").split("").map((f, fi) => (
                                  <span key={fi} className={`w-3.5 h-3.5 rounded-[2px] text-[7px] flex items-center justify-center font-bold ${FORM_COLORS[f] || "bg-muted text-muted-foreground"}`}>
                                    {f}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        );
                      }) : (
                        <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">Zatím žádná data v tabulce.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══ MATCHES ═══ */}
          <TabsContent value="matches" className="space-y-3">
             {playedMatches.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">Odehrané</h4>
                <Card className="border-border bg-card/50">
                  <CardContent className="p-0 divide-y divide-border/30">
                    {playedMatches.slice(0, 10).map(m => {
                      const home = teamMap.get(m.home_team_id);
                      const away = teamMap.get(m.away_team_id);
                      if (!home || !away) return null;
                      return (
                        <div key={m.id} className="p-2 hover:bg-accent/5 transition-colors flex items-center gap-2 text-xs">
                          <Badge variant="secondary" className="text-[9px] h-4 px-1 rounded-[2px] w-8 justify-center">K{m.round_number}</Badge>
                          <span className={`flex-1 text-right truncate ${(m.home_score ?? 0) > (m.away_score ?? 0) ? "font-bold text-foreground" : "text-muted-foreground"}`}>{home.team_name}</span>
                          <span className="font-mono font-bold bg-muted/30 px-1.5 py-0.5 rounded text-center min-w-[32px]">{m.home_score}:{m.away_score}</span>
                          <span className={`flex-1 truncate ${(m.away_score ?? 0) > (m.home_score ?? 0) ? "font-bold text-foreground" : "text-muted-foreground"}`}>{away.team_name}</span>
                          {m.attendance > 0 && <span className="text-[9px] text-muted-foreground">👥{m.attendance}</span>}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>
             )}
             {upcomingMatches.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">Program</h4>
                <Card className="border-border bg-card/50">
                  <CardContent className="p-0 divide-y divide-border/30">
                    {upcomingMatches.slice(0, 10).map(m => {
                      const home = teamMap.get(m.home_team_id);
                      const away = teamMap.get(m.away_team_id);
                      if (!home || !away) return null;
                      return (
                        <div key={m.id} className="p-2 hover:bg-accent/5 transition-colors flex items-center gap-2 text-xs">
                          <Badge variant="outline" className="text-[9px] h-4 px-1 rounded-[2px] w-8 justify-center text-muted-foreground">K{m.round_number}</Badge>
                          <span className="flex-1 text-right truncate text-muted-foreground">{home.team_name}</span>
                          <span className="text-muted-foreground text-[10px] px-1">-:-</span>
                          <span className="flex-1 truncate text-muted-foreground">{away.team_name}</span>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>
             )}
             {matches.length === 0 && (
                <div className="p-8 text-center text-muted-foreground bg-card/30 rounded border border-dashed border-border">
                   Žádné zápasy v rozpisu.
                </div>
             )}
          </TabsContent>

          {/* ═══ SCORERS ═══ */}
          <TabsContent value="scorers">
            <Card className="border-border bg-card/50">
              <CardContent className="p-0">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground bg-muted/10">
                      <th className="p-2 text-left w-8">#</th>
                      <th className="p-2 text-left">Hráč</th>
                      <th className="p-2 text-left">Tým</th>
                      <th className="p-2 text-center w-12">⚽</th>
                      <th className="p-2 text-center w-12">🅰️</th>
                      <th className="p-2 text-center w-12">Záp.</th>
                      <th className="p-2 text-center w-12">Ø</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topScorers.length > 0 ? topScorers.map((p, i) => {
                      const team = teamMap.get(p.team_id);
                      const avg = p.matches_played > 0 ? ((p.goals_scored || 0) / p.matches_played).toFixed(2) : "0";
                      return (
                        <tr key={p.id} className="border-b border-border/50 hover:bg-accent/5 cursor-pointer" onClick={() => setSelectedPlayer(p)}>
                          <td className="p-2 font-mono text-muted-foreground">
                            {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}
                          </td>
                          <td className="p-2 font-medium">{p.name}</td>
                          <td className="p-2 text-muted-foreground flex items-center gap-1">
                            {team && <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: team.color_primary }} />}
                            {team?.team_name || "?"}
                          </td>
                          <td className="p-2 text-center font-bold text-lg">{p.goals_scored || 0}</td>
                          <td className="p-2 text-center">{p.assists || 0}</td>
                          <td className="p-2 text-center text-muted-foreground">{p.matches_played}</td>
                          <td className="p-2 text-center text-muted-foreground font-mono">{avg}</td>
                        </tr>
                      );
                    }) : (
                       <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Žádní střelci.</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══ TEAMS LIST ═══ */}
          <TabsContent value="team" className="space-y-2">
            {/* Title Leaderboard */}
            {titleLeaderboard.length > 0 && (
              <Card className="border-yellow-500/20 bg-yellow-500/5 mb-3">
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-xs font-display flex items-center gap-1">
                    <Trophy className="h-3.5 w-3.5 text-yellow-500" /> Síň slávy — tituly
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-2">
                  <div className="flex flex-wrap gap-2">
                    {titleLeaderboard.map(t => (
                      <Badge key={t.id} className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 gap-1 cursor-pointer hover:bg-yellow-500/20"
                        onClick={() => setSelectedTeam(t.id)}>
                        🏆 {t.titles_won}× {t.team_name}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Season History */}
            {concludedSeasons.length > 0 && (
              <Card className="border-border bg-card/50 mb-3">
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-xs font-display">📜 Historie sezón</CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-2 space-y-1">
                  {concludedSeasons.map(s => {
                    const champ = s.champion_team_id ? teamMap.get(s.champion_team_id) : null;
                    return (
                      <div key={s.id} className="flex items-center justify-between text-xs bg-muted/10 p-1.5 rounded">
                        <span className="font-medium">{s.season_number}. sezóna</span>
                        <span className="text-muted-foreground">Tah {s.started_turn}–{s.ended_turn}</span>
                        {champ ? (
                          <Badge variant="outline" className="text-[9px] gap-1 text-yellow-400 border-yellow-500/30">
                            🏆 {champ.team_name}
                          </Badge>
                        ) : <span className="text-muted-foreground text-[9px]">—</span>}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-2 gap-2">
              {teams.map(t => {
                const stadium = stadiumByCityId.get(t.city_id);
                const city = cities.get(t.city_id);
                return (
                  <Card key={t.id} 
                    className={`cursor-pointer transition-all hover:border-primary/50 border-border bg-card/50`}
                    onClick={() => setSelectedTeam(t.id)}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 border border-primary/20"
                        style={{ backgroundColor: t.color_primary, color: t.color_secondary }}>⚽</div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xs truncate">{t.team_name}</div>
                        <div className="text-[9px] text-muted-foreground truncate">{city || "?"} · {t.player_name}</div>
                        <div className="text-[9px] text-muted-foreground truncate">{stadium ? `🏟 ${stadium.name}` : "Bez stadionu"}</div>
                      </div>
                      {(t.titles_won || 0) > 0 && (
                        <span className="text-yellow-400 text-xs">🏆{t.titles_won}</span>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* ═══ ASSOCIATIONS ═══ */}
          <TabsContent value="assoc" className="space-y-3">
            {associations.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground bg-card/30 rounded border border-dashed border-border">
                Žádné asociace. Založte si svou sportovní asociaci!
              </div>
            ) : (
              <div className="space-y-2">
                {associations.map(assoc => {
                  const cityName = cities.get(assoc.city_id);
                  const assocTeams = teams.filter(t => t.player_name === assoc.player_name);
                  const totalTitles = assocTeams.reduce((sum, t) => sum + (t.titles_won || 0), 0);
                  const isMyAssoc = assoc.player_name === currentPlayerName;
                  return (
                    <Card key={assoc.id} className={`border-border bg-card/50 ${isMyAssoc ? "border-primary/30" : ""}`}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-display font-bold text-sm flex items-center gap-2">
                              <Award className="h-4 w-4 text-primary" />
                              {assoc.name}
                              {isMyAssoc && <Badge variant="outline" className="text-[9px]">Moje</Badge>}
                            </h4>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {cityName} · {assoc.player_name}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold text-primary">{assoc.reputation}</div>
                            <div className="text-[9px] text-muted-foreground">Prestiž</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-2 text-center">
                          <div className="bg-muted/20 rounded p-1.5">
                            <div className="text-xs font-bold">{assoc.scouting_level}</div>
                            <div className="text-[8px] text-muted-foreground">Skauting</div>
                          </div>
                          <div className="bg-muted/20 rounded p-1.5">
                            <div className="text-xs font-bold">{assoc.youth_development}</div>
                            <div className="text-[8px] text-muted-foreground">Mládež</div>
                          </div>
                          <div className="bg-muted/20 rounded p-1.5">
                            <div className="text-xs font-bold">{assoc.training_quality}</div>
                            <div className="text-[8px] text-muted-foreground">Trénink</div>
                          </div>
                          <div className="bg-muted/20 rounded p-1.5">
                            <div className="text-xs font-bold">{assoc.budget}</div>
                            <div className="text-[8px] text-muted-foreground">Budget</div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-3">
                            <span className="text-muted-foreground"><Users className="h-3 w-3 inline mr-0.5" />{assoc.fan_base} fans</span>
                            <span className="text-muted-foreground">{assocTeams.length} týmů</span>
                          </div>
                          {totalTitles > 0 && (
                            <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30 text-[9px]">
                              🏆 {totalTitles} titulů
                            </Badge>
                          )}
                        </div>

                        {/* Teams under this association */}
                        {assocTeams.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1 border-t border-border/30">
                            {assocTeams.map(t => (
                              <Badge key={t.id} variant="outline" className="text-[9px] gap-1 cursor-pointer hover:bg-primary/5"
                                onClick={() => setSelectedTeam(t.id)}>
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color_primary }} />
                                {t.team_name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Player Detail Modal */}
      <Dialog open={!!selectedPlayer} onOpenChange={open => !open && setSelectedPlayer(null)}>
        <DialogContent className="max-w-md bg-card border-primary/20">
          {selectedPlayer && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-lg mr-1">
                     {POS_LABELS[selectedPlayer.position] === "GK" ? "🧤" : "👤"}
                  </div>
                  <div className="flex flex-col">
                     <span>{selectedPlayer.name}</span>
                     <span className="text-[10px] font-normal text-muted-foreground uppercase tracking-widest">
                       {POS_FULL[selectedPlayer.position]} · {teamMap.get(selectedPlayer.team_id)?.team_name}
                     </span>
                  </div>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-muted/30 p-2 rounded text-center border border-border/50">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Overall</div>
                    <div className={`text-2xl font-black font-mono ${ratingColor(selectedPlayer.overall_rating)}`}>{selectedPlayer.overall_rating}</div>
                  </div>
                  <div className="bg-muted/30 p-2 rounded text-center border border-border/50">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Forma</div>
                    <div className={`text-xl font-bold ${formLabel(selectedPlayer.form).cls}`}>{selectedPlayer.form}</div>
                    <div className="text-[8px] opacity-70">{formLabel(selectedPlayer.form).text}</div>
                  </div>
                  <div className="bg-muted/30 p-2 rounded text-center border border-border/50">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Kondice</div>
                    <div className="text-xl font-bold">{selectedPlayer.condition}%</div>
                    <Progress value={selectedPlayer.condition} className="h-1.5 mt-1" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="space-y-1">
                     <div className="flex justify-between items-center p-1 border-b border-border/30">
                        <span className="text-muted-foreground">Síla</span>
                        <span className="font-mono font-bold">{selectedPlayer.strength}</span>
                     </div>
                     <div className="flex justify-between items-center p-1 border-b border-border/30">
                        <span className="text-muted-foreground">Rychlost</span>
                        <span className="font-mono font-bold">{selectedPlayer.speed}</span>
                     </div>
                     <div className="flex justify-between items-center p-1 border-b border-border/30">
                        <span className="text-muted-foreground">Výdrž</span>
                        <span className="font-mono font-bold">{selectedPlayer.stamina}</span>
                     </div>
                  </div>
                  <div className="space-y-1">
                     <div className="flex justify-between items-center p-1 border-b border-border/30">
                        <span className="text-muted-foreground">Technika</span>
                        <span className="font-mono font-bold">{selectedPlayer.technique}</span>
                     </div>
                     <div className="flex justify-between items-center p-1 border-b border-border/30">
                        <span className="text-muted-foreground">Agresivita</span>
                        <span className="font-mono font-bold">{selectedPlayer.aggression}</span>
                     </div>
                     <div className="flex justify-between items-center p-1 border-b border-border/30">
                        <span className="text-muted-foreground">Vůdcovství</span>
                        <span className="font-mono font-bold">{selectedPlayer.leadership}</span>
                     </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 pt-2 border-t border-border">
                   <div className="text-center">
                      <div className="text-lg font-bold">{selectedPlayer.goals_scored || 0}</div>
                      <div className="text-[8px] uppercase text-muted-foreground">Góly</div>
                   </div>
                   <div className="text-center">
                      <div className="text-lg font-bold">{selectedPlayer.assists || 0}</div>
                      <div className="text-[8px] uppercase text-muted-foreground">Asist.</div>
                   </div>
                   <div className="text-center">
                      <div className="text-lg font-bold">{selectedPlayer.matches_played}</div>
                      <div className="text-[8px] uppercase text-muted-foreground">Zápasy</div>
                   </div>
                   <div className="text-center">
                      <div className="text-lg font-bold text-yellow-500">{selectedPlayer.yellow_cards}</div>
                      <div className="text-[8px] uppercase text-muted-foreground">Karty</div>
                   </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeaguePanel;
