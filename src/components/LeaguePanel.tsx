import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Users, Calendar, Star, Target, Shield, Swords } from "lucide-react";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
}

interface Team {
  id: string;
  city_id: string;
  player_name: string;
  team_name: string;
  motto: string | null;
  attack_rating: number;
  defense_rating: number;
  tactics_rating: number;
  discipline_rating: number;
  popularity: number;
  fan_base: number;
  titles_won: number;
  color_primary: string;
  color_secondary: string;
}

interface Standing {
  id: string;
  team_id: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  points: number;
  form: string;
  position: number;
}

interface Match {
  id: string;
  round_number: number;
  turn_number: number;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  match_events: any[];
  highlight_text: string | null;
  attendance: number;
  played_turn: number | null;
}

interface Season {
  id: string;
  season_number: number;
  status: string;
  started_turn: number;
  ended_turn: number | null;
  total_rounds: number;
  current_round: number;
  champion_team_id: string | null;
}

interface Player {
  id: string;
  team_id: string;
  name: string;
  position: string;
  strength: number;
  speed: number;
  technique: number;
  stamina: number;
  aggression: number;
  leadership: number;
  is_captain: boolean;
  goals_scored: number;
  assists: number;
  matches_played: number;
}

const FORM_COLORS: Record<string, string> = {
  W: "bg-green-500/80 text-green-50",
  D: "bg-yellow-500/80 text-yellow-50",
  L: "bg-red-500/80 text-red-50",
};

const POS_LABELS: Record<string, string> = {
  goalkeeper: "Brankář",
  defender: "Obránce",
  midfielder: "Záložník",
  attacker: "Útočník",
};

const LeaguePanel = ({ sessionId, currentPlayerName, currentTurn }: Props) => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: t }, { data: s }, { data: seas }] = await Promise.all([
      supabase.from("league_teams").select("*").eq("session_id", sessionId).eq("is_active", true),
      supabase.from("league_seasons").select("*").eq("session_id", sessionId).order("season_number", { ascending: false }),
      supabase.from("league_seasons").select("id").eq("session_id", sessionId).eq("status", "active").maybeSingle(),
    ]);
    setTeams((t || []) as any);
    setSeasons((s || []) as any);

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

  const teamMap = new Map(teams.map(t => [t.id, t]));
  const activeSeason = seasons.find(s => s.status === "active") || seasons[0];
  const playedMatches = matches.filter(m => m.status === "played").sort((a, b) => b.round_number - a.round_number);
  const upcomingMatches = matches.filter(m => m.status === "scheduled").sort((a, b) => a.round_number - b.round_number);
  const myTeam = teams.find(t => t.player_name === currentPlayerName);

  // Top scorers
  const topScorers = [...players].filter(p => p.goals_scored > 0).sort((a, b) => b.goals_scored - a.goals_scored).slice(0, 10);

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

  if (teams.length === 0) {
    return (
      <Card className="border-border bg-card/50">
        <CardContent className="p-8 text-center">
          <Swords className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-sm text-muted-foreground">Žádné týmy v lize.</p>
          <p className="text-xs text-muted-foreground mt-1">Postav Arénu (stadion) ve městě a tým vznikne automaticky.</p>
        </CardContent>
      </Card>
    );
  }

  const selectedTeamData = selectedTeam ? teamMap.get(selectedTeam) : null;
  const selectedTeamPlayers = selectedTeam ? players.filter(p => p.team_id === selectedTeam) : [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Swords className="h-5 w-5 text-primary" />
        <h3 className="font-display font-bold text-base">Sphaera Liga</h3>
        {activeSeason && (
          <Badge variant="outline" className="text-[9px] ml-auto">
            {activeSeason.season_number}. sezóna — kolo {activeSeason.current_round}/{activeSeason.total_rounds}
          </Badge>
        )}
      </div>

      {/* My team highlight */}
      {myTeam && (
        <Card className="border-primary/30 bg-primary/5 cursor-pointer" onClick={() => setSelectedTeam(myTeam.id)}>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ backgroundColor: myTeam.color_primary, color: myTeam.color_secondary }}>
              ⚽
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display font-bold text-sm truncate">{myTeam.team_name}</p>
              <p className="text-[10px] text-muted-foreground">{myTeam.motto}</p>
            </div>
            <div className="flex gap-2 text-[10px]">
              <span title="Útok">⚔️ {myTeam.attack_rating}</span>
              <span title="Obrana">🛡️ {myTeam.defense_rating}</span>
              <span title="Taktika">🧠 {myTeam.tactics_rating}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="table" className="space-y-3">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="table" className="text-xs"><Trophy className="h-3 w-3 mr-1" />Tabulka</TabsTrigger>
          <TabsTrigger value="matches" className="text-xs"><Calendar className="h-3 w-3 mr-1" />Zápasy</TabsTrigger>
          <TabsTrigger value="scorers" className="text-xs"><Target className="h-3 w-3 mr-1" />Střelci</TabsTrigger>
          <TabsTrigger value="team" className="text-xs"><Users className="h-3 w-3 mr-1" />Týmy</TabsTrigger>
        </TabsList>

        {/* ═══ STANDINGS TABLE ═══ */}
        <TabsContent value="table">
          <Card className="border-border bg-card/50">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="p-2 text-left">#</th>
                      <th className="p-2 text-left">Tým</th>
                      <th className="p-2 text-center">Z</th>
                      <th className="p-2 text-center">V</th>
                      <th className="p-2 text-center">R</th>
                      <th className="p-2 text-center">P</th>
                      <th className="p-2 text-center">Skóre</th>
                      <th className="p-2 text-center font-bold">B</th>
                      <th className="p-2 text-center">Forma</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((st, i) => {
                      const team = teamMap.get(st.team_id);
                      if (!team) return null;
                      const isMyTeam = team.player_name === currentPlayerName;
                      return (
                        <tr key={st.id}
                          className={`border-b border-border/50 hover:bg-accent/10 cursor-pointer transition-colors ${isMyTeam ? "bg-primary/5" : ""} ${i === 0 ? "font-semibold" : ""}`}
                          onClick={() => setSelectedTeam(team.id)}
                        >
                          <td className="p-2">
                            {i === 0 && <span className="text-yellow-400">🏆</span>}
                            {i > 0 && <span className="text-muted-foreground">{st.position || i + 1}</span>}
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1.5">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color_primary }} />
                              <span className={isMyTeam ? "text-primary" : ""}>{team.team_name}</span>
                            </div>
                          </td>
                          <td className="p-2 text-center">{st.played}</td>
                          <td className="p-2 text-center text-green-400">{st.wins}</td>
                          <td className="p-2 text-center text-yellow-400">{st.draws}</td>
                          <td className="p-2 text-center text-red-400">{st.losses}</td>
                          <td className="p-2 text-center">{st.goals_for}:{st.goals_against}</td>
                          <td className="p-2 text-center font-bold">{st.points}</td>
                          <td className="p-2 text-center">
                            <div className="flex gap-0.5 justify-center">
                              {(st.form || "").split("").map((f, fi) => (
                                <span key={fi} className={`w-4 h-4 rounded text-[8px] flex items-center justify-center ${FORM_COLORS[f] || ""}`}>
                                  {f}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ MATCHES ═══ */}
        <TabsContent value="matches" className="space-y-3">
          {playedMatches.length > 0 && (
            <Card className="border-border bg-card/50">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs font-display">Odehrané zápasy</CardTitle>
              </CardHeader>
              <CardContent className="p-2 space-y-1">
                {playedMatches.slice(0, 15).map(m => {
                  const home = teamMap.get(m.home_team_id);
                  const away = teamMap.get(m.away_team_id);
                  if (!home || !away) return null;
                  const isMyMatch = home.player_name === currentPlayerName || away.player_name === currentPlayerName;
                  return (
                    <div key={m.id} className={`flex items-center gap-2 p-2 rounded text-xs ${isMyMatch ? "bg-primary/5 border border-primary/20" : "bg-accent/5"}`}>
                      <span className="text-muted-foreground text-[9px] w-6">K{m.round_number}</span>
                      <span className={`flex-1 text-right truncate ${(m.home_score ?? 0) > (m.away_score ?? 0) ? "font-bold" : ""}`}>
                        {home.team_name}
                      </span>
                      <span className="font-display font-bold text-sm min-w-[3rem] text-center">
                        {m.home_score} : {m.away_score}
                      </span>
                      <span className={`flex-1 truncate ${(m.away_score ?? 0) > (m.home_score ?? 0) ? "font-bold" : ""}`}>
                        {away.team_name}
                      </span>
                      {m.highlight_text && (
                        <span className="text-[9px] text-muted-foreground truncate max-w-[120px]">{m.highlight_text}</span>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {upcomingMatches.length > 0 && (
            <Card className="border-border bg-card/50">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs font-display">Nadcházející zápasy</CardTitle>
              </CardHeader>
              <CardContent className="p-2 space-y-1">
                {upcomingMatches.slice(0, 10).map(m => {
                  const home = teamMap.get(m.home_team_id);
                  const away = teamMap.get(m.away_team_id);
                  if (!home || !away) return null;
                  return (
                    <div key={m.id} className="flex items-center gap-2 p-2 rounded bg-accent/5 text-xs">
                      <span className="text-muted-foreground text-[9px] w-6">K{m.round_number}</span>
                      <span className="flex-1 text-right truncate">{home.team_name}</span>
                      <span className="text-muted-foreground text-[9px] min-w-[3rem] text-center">
                        tah {m.turn_number}
                      </span>
                      <span className="flex-1 truncate">{away.team_name}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══ TOP SCORERS ═══ */}
        <TabsContent value="scorers">
          <Card className="border-border bg-card/50">
            <CardContent className="p-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="p-2 text-left">#</th>
                    <th className="p-2 text-left">Hráč</th>
                    <th className="p-2 text-left">Tým</th>
                    <th className="p-2 text-center">Góly</th>
                    <th className="p-2 text-center">Zápasy</th>
                  </tr>
                </thead>
                <tbody>
                  {topScorers.map((p, i) => {
                    const team = teamMap.get(p.team_id);
                    return (
                      <tr key={p.id} className="border-b border-border/50">
                        <td className="p-2">{i === 0 ? "⚽" : i + 1}</td>
                        <td className="p-2 font-medium">
                          {p.is_captain && <span className="text-yellow-400 mr-1">©</span>}
                          {p.name}
                        </td>
                        <td className="p-2 text-muted-foreground">{team?.team_name || "?"}</td>
                        <td className="p-2 text-center font-bold">{p.goals_scored}</td>
                        <td className="p-2 text-center">{p.matches_played}</td>
                      </tr>
                    );
                  })}
                  {topScorers.length === 0 && (
                    <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Žádné góly v této sezóně.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TEAM DETAIL ═══ */}
        <TabsContent value="team" className="space-y-3">
          {/* Team selector */}
          <div className="flex flex-wrap gap-1.5">
            {teams.map(t => (
              <button key={t.id}
                className={`px-2 py-1 rounded text-[10px] border transition-colors ${selectedTeam === t.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-card/50 text-muted-foreground hover:bg-accent/10"}`}
                onClick={() => setSelectedTeam(t.id)}
              >
                <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: t.color_primary }} />
                {t.team_name}
              </button>
            ))}
          </div>

          {selectedTeamData && (
            <Card className="border-border bg-card/50">
              <CardHeader className="pb-2 pt-3 px-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold"
                    style={{ backgroundColor: selectedTeamData.color_primary, color: selectedTeamData.color_secondary }}>
                    ⚽
                  </div>
                  <div>
                    <CardTitle className="text-sm font-display">{selectedTeamData.team_name}</CardTitle>
                    <p className="text-[10px] text-muted-foreground">{selectedTeamData.motto}</p>
                  </div>
                  <div className="ml-auto flex gap-2 text-[10px]">
                    <Badge variant="outline">⚔️ {selectedTeamData.attack_rating}</Badge>
                    <Badge variant="outline">🛡️ {selectedTeamData.defense_rating}</Badge>
                    <Badge variant="outline">🧠 {selectedTeamData.tactics_rating}</Badge>
                    <Badge variant="outline">💪 {selectedTeamData.discipline_rating}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="p-1.5 text-left">Jméno</th>
                      <th className="p-1.5 text-left">Pozice</th>
                      <th className="p-1.5 text-center">SIL</th>
                      <th className="p-1.5 text-center">RYC</th>
                      <th className="p-1.5 text-center">TEC</th>
                      <th className="p-1.5 text-center">VYD</th>
                      <th className="p-1.5 text-center">⚽</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTeamPlayers.sort((a, b) => {
                      const order = ["goalkeeper", "defender", "midfielder", "attacker"];
                      return order.indexOf(a.position) - order.indexOf(b.position);
                    }).map(p => (
                      <tr key={p.id} className="border-b border-border/30 hover:bg-accent/5">
                        <td className="p-1.5">
                          {p.is_captain && <span className="text-yellow-400 mr-1">©</span>}
                          {p.name}
                        </td>
                        <td className="p-1.5 text-muted-foreground">{POS_LABELS[p.position] || p.position}</td>
                        <td className="p-1.5 text-center">{p.strength}</td>
                        <td className="p-1.5 text-center">{p.speed}</td>
                        <td className="p-1.5 text-center">{p.technique}</td>
                        <td className="p-1.5 text-center">{p.stamina}</td>
                        <td className="p-1.5 text-center font-bold">{p.goals_scored || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Past seasons */}
      {seasons.filter(s => s.status === "concluded").length > 0 && (
        <Card className="border-border bg-card/50">
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-xs font-display">Historie sezón</CardTitle>
          </CardHeader>
          <CardContent className="p-2 space-y-1">
            {seasons.filter(s => s.status === "concluded").map(s => {
              const champ = s.champion_team_id ? teamMap.get(s.champion_team_id) : null;
              return (
                <div key={s.id} className="flex items-center gap-2 p-2 rounded bg-accent/5 text-xs">
                  <Trophy className="h-3.5 w-3.5 text-yellow-400" />
                  <span className="font-medium">{s.season_number}. sezóna</span>
                  <span className="text-muted-foreground">tah {s.started_turn}–{s.ended_turn}</span>
                  {champ && <Badge className="ml-auto text-[9px]">{champ.team_name}</Badge>}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default LeaguePanel;
