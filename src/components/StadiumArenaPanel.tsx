import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Skull, Flame, Heart, Users, AlertTriangle, Shield, Star, Swords, Trophy, Calendar, Target, Loader2, Play, ChevronLeft, Zap, TrendingUp, Building2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  cities: any[];
}

interface LeaguePlayer {
  id: string; team_id: string; name: string; position: string;
  strength: number; speed: number; technique: number; stamina: number;
  aggression: number; leadership: number; is_captain: boolean;
  overall_rating: number; form: number; condition: number; injury_turns: number;
  goals: number; assists: number; matches_played: number;
  yellow_cards: number; red_cards: number; season_rating_avg: number;
  goals_scored: number; portrait_url: string | null; bio: string | null;
}

interface LeagueTeam {
  id: string; city_id: string; team_name: string; motto: string | null;
  attack_rating: number; defense_rating: number; tactics_rating: number;
  color_primary: string; color_secondary: string; titles_won: number; fan_base: number;
  player_name: string;
}

interface LeagueMatch {
  id: string; round_number: number; home_team_id: string; away_team_id: string;
  home_score: number | null; away_score: number | null; status: string;
  highlight_text: string | null; match_events: any;
}

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

const StadiumArenaPanel = ({ sessionId, currentPlayerName, currentTurn, cities }: Props) => {
  const [teams, setTeams] = useState<LeagueTeam[]>([]);
  const [allTeams, setAllTeams] = useState<LeagueTeam[]>([]);
  const [players, setPlayers] = useState<LeaguePlayer[]>([]);
  const [matches, setMatches] = useState<LeagueMatch[]>([]);
  const [stadiums, setStadiums] = useState<any[]>([]);
  const [academies, setAcademies] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [studentNames, setStudentNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [playingRound, setPlayingRound] = useState(false);
  const [roundResult, setRoundResult] = useState<any>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<LeaguePlayer | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<LeagueTeam | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamCity, setNewTeamCity] = useState("");
  const [newTeamBuilding, setNewTeamBuilding] = useState("");

  const myCities = cities.filter(c => c.owner_player === currentPlayerName);
  const myCityIds = myCities.map(c => c.id);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: blds }, { data: myTeams }, { data: allT }, { data: acads }, { data: studs }] = await Promise.all([
      supabase.from("city_buildings").select("id, name, city_id, current_level, effects, building_tags, is_arena")
        .eq("session_id", sessionId).eq("status", "completed").in("city_id", myCityIds.length > 0 ? myCityIds : ["__none__"]),
      supabase.from("league_teams").select("*").eq("session_id", sessionId).eq("player_name", currentPlayerName).eq("is_active", true),
      supabase.from("league_teams").select("id, team_name, color_primary, color_secondary, player_name, city_id, attack_rating, defense_rating, titles_won, fan_base").eq("session_id", sessionId).eq("is_active", true),
      supabase.from("academies").select("id, name, profile_brutality, crowd_popularity, elite_favor, people_favor, revolt_risk, total_fatalities, is_gladiatorial")
        .eq("session_id", sessionId).eq("player_name", currentPlayerName).gt("profile_brutality", 20),
      supabase.from("academy_students").select("id, name, academy_id").eq("session_id", sessionId).eq("player_name", currentPlayerName),
    ]);

    const stadiumBuildings = (blds || []).filter((b: any) => {
      const tags = (b.building_tags as string[]) || [];
      return tags.includes("stadium") || (b.name || "").toLowerCase().includes("stadion");
    });
    setStadiums(stadiumBuildings);
    setTeams((myTeams || []) as any);
    setAllTeams((allT || []) as any);
    setAcademies((acads || []) as any);
    const nameMap = new Map<string, string>();
    for (const s of (studs || [])) nameMap.set(s.id, s.name);
    setStudentNames(nameMap);

    if (acads && acads.length > 0) {
      const { data: recs } = await supabase.from("gladiator_records").select("*").eq("session_id", sessionId).in("academy_id", acads.map((a: any) => a.id));
      setRecords((recs || []) as any);
    }

    if (myTeams && myTeams.length > 0) {
      const teamIds = myTeams.map((t: any) => t.id);
      const [{ data: pl }, { data: mt }] = await Promise.all([
        supabase.from("league_players").select("*").in("team_id", teamIds),
        supabase.from("league_matches").select("*").eq("session_id", sessionId).order("round_number", { ascending: false }).limit(50),
      ]);
      setPlayers((pl || []) as any);
      setMatches((mt || []) as any);
    } else {
      setPlayers([]);
      setMatches([]);
    }
    setLoading(false);
  }, [sessionId, currentPlayerName, myCityIds.join(",")]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreateTeam = async () => {
    if (!newTeamName.trim() || !newTeamCity) { toast.error("Zadej název a město"); return; }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-league-team", {
        body: { sessionId, cityId: newTeamCity, buildingId: newTeamBuilding || undefined, teamName: newTeamName.trim(), playerName: currentPlayerName },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success(`⚽ Tým "${newTeamName.trim()}" založen!`);
      setNewTeamName(""); setNewTeamCity(""); setNewTeamBuilding("");
      await fetchData();
    } catch (e: any) { toast.error(e.message); } finally { setCreating(false); }
  };

  const handlePlayRound = async () => {
    setPlayingRound(true);
    setRoundResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("league-play-round", {
        body: { session_id: sessionId, player_name: currentPlayerName },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      setRoundResult(data);
      toast.success(`⚽ Kolo ${data.round} odehráno!`);
      await fetchData();
    } catch (e: any) { toast.error(e.message); } finally { setPlayingRound(false); }
  };

  const teamMap = new Map(allTeams.map(t => [t.id, t]));
  const teamCityIds = new Set(teams.map(t => t.city_id));
  const availableStadiumCities = stadiums.filter((s: any) => !teamCityIds.has(s.city_id));

  if (loading) return <p className="text-xs text-muted-foreground text-center p-4">Načítám…</p>;

  // If a team is selected, show FM-style roster
  if (selectedTeam) {
    const teamPlayers = players.filter(p => p.team_id === selectedTeam.id)
      .sort((a, b) => POS_ORDER.indexOf(a.position) - POS_ORDER.indexOf(b.position));
    const cityName = myCities.find(c => c.id === selectedTeam.city_id)?.name || "?";

    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setSelectedTeam(null)}>
          <ChevronLeft className="h-3 w-3" /> Zpět
        </Button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 border-primary/30"
            style={{ backgroundColor: selectedTeam.color_primary, color: selectedTeam.color_secondary }}>⚽</div>
          <div>
            <h3 className="font-display font-bold text-base">{selectedTeam.team_name}</h3>
            <p className="text-[10px] text-muted-foreground">{cityName} · {selectedTeam.motto}</p>
          </div>
          <div className="ml-auto flex gap-2 text-xs">
            <Badge variant="outline">⚔️ {selectedTeam.attack_rating}</Badge>
            <Badge variant="outline">🛡️ {selectedTeam.defense_rating}</Badge>
            <Badge variant="outline">🏆 {selectedTeam.titles_won}</Badge>
          </div>
        </div>

        {/* Roster table */}
        <Card className="border-border bg-card/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                  <th className="px-2 py-1.5 text-left">Hráč</th>
                  <th className="px-1 py-1.5 text-center">POS</th>
                  <th className="px-1 py-1.5 text-center">OVR</th>
                  <th className="px-1 py-1.5 text-center">Forma</th>
                  <th className="px-1 py-1.5 text-center">Kond.</th>
                  <th className="px-1 py-1.5 text-center">⚽</th>
                  <th className="px-1 py-1.5 text-center">🅰️</th>
                  <th className="px-1 py-1.5 text-center">🏟️</th>
                  <th className="px-1 py-1.5 text-center">🟨</th>
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
                        {p.is_captain && <span className="text-yellow-400 mr-0.5">©</span>}
                        {p.name}
                        {p.injury_turns > 0 && <span className="text-red-400 ml-1">🏥</span>}
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <Badge variant="outline" className="text-[7px] py-0">{POS_LABELS[p.position]}</Badge>
                      </td>
                      <td className={`px-1 py-1.5 text-center font-bold font-mono ${ratingColor(p.overall_rating)}`}>
                        {p.overall_rating}
                      </td>
                      <td className={`px-1 py-1.5 text-center ${fl.cls}`}>{p.form}</td>
                      <td className="px-1 py-1.5 text-center">
                        <span className={p.condition < 50 ? "text-red-400" : p.condition < 75 ? "text-yellow-400" : "text-green-400"}>
                          {p.condition}%
                        </span>
                      </td>
                      <td className="px-1 py-1.5 text-center font-mono">{p.goals || 0}</td>
                      <td className="px-1 py-1.5 text-center font-mono">{p.assists || 0}</td>
                      <td className="px-1 py-1.5 text-center font-mono">{p.matches_played || 0}</td>
                      <td className="px-1 py-1.5 text-center font-mono">{p.yellow_cards || 0}</td>
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

  const hasContent = academies.length > 0 || stadiums.length > 0 || teams.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Swords className="h-5 w-5 text-primary" />
          <h3 className="font-display font-bold text-base">Stadiony & Arény</h3>
        </div>
        {teams.length > 0 && (
          <Button size="sm" className="text-xs gap-1" onClick={handlePlayRound} disabled={playingRound}>
            {playingRound ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            Odehrát kolo
          </Button>
        )}
      </div>

      {/* Round result overlay */}
      {roundResult && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-display font-bold">📢 Výsledky {roundResult.round}. kola</span>
              <Button variant="ghost" size="sm" className="text-[9px] h-5" onClick={() => setRoundResult(null)}>✕</Button>
            </div>
            {roundResult.matches?.map((m: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="flex-1 text-right truncate">{m.home}</span>
                <span className="font-display font-bold min-w-[3rem] text-center">{m.homeScore} : {m.awayScore}</span>
                <span className="flex-1 truncate">{m.away}</span>
              </div>
            ))}
            {roundResult.commentary && (
              <p className="text-[10px] text-muted-foreground italic border-t border-border pt-2 mt-2">{roundResult.commentary}</p>
            )}
            {roundResult.seasonComplete && (
              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">🏆 Sezóna skončila!</Badge>
            )}
          </CardContent>
        </Card>
      )}

      {!hasContent ? (
        <Card className="border-border bg-card/50">
          <CardContent className="p-8 text-center">
            <Swords className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-sm text-muted-foreground">Žádné stadiony ani arény.</p>
            <p className="text-xs text-muted-foreground mt-1">Postavte <strong>Stadion</strong> nebo <strong>Arénu</strong>.</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue={teams.length > 0 ? "team" : "stadium"} className="space-y-3">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="team" className="text-xs"><Users className="h-3 w-3 mr-1" />Týmy</TabsTrigger>
            <TabsTrigger value="matches" className="text-xs"><Calendar className="h-3 w-3 mr-1" />Zápasy</TabsTrigger>
            <TabsTrigger value="stadium" className="text-xs"><Target className="h-3 w-3 mr-1" />Stadiony</TabsTrigger>
            <TabsTrigger value="gladiators" className="text-xs"><Skull className="h-3 w-3 mr-1" />Arény</TabsTrigger>
          </TabsList>

          {/* ═══ TEAMS ═══ */}
          <TabsContent value="team" className="space-y-3">
            {teams.length > 0 ? teams.map(team => {
              const teamPlayers = players.filter(p => p.team_id === team.id);
              const cityName = myCities.find(c => c.id === team.city_id)?.name || "?";
              const avgRating = teamPlayers.length > 0 ? Math.round(teamPlayers.reduce((s, p) => s + p.overall_rating, 0) / teamPlayers.length) : 0;
              return (
                <Card key={team.id} className="border-primary/20 bg-card/50 cursor-pointer hover:border-primary/40 transition-colors"
                  onClick={() => setSelectedTeam(team)}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border border-primary/20"
                        style={{ backgroundColor: team.color_primary, color: team.color_secondary }}>⚽</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-display text-sm font-bold truncate">{team.team_name}</p>
                        <p className="text-[10px] text-muted-foreground">{cityName} · {teamPlayers.length} hráčů</p>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 text-[10px]">
                        <div className="flex gap-2">
                          <span>⚔️{team.attack_rating}</span>
                          <span>🛡️{team.defense_rating}</span>
                        </div>
                        <span className={`font-mono font-bold ${ratingColor(avgRating)}`}>OVR {avgRating}</span>
                      </div>
                    </div>
                    {/* Mini roster preview */}
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {teamPlayers.sort((a, b) => POS_ORDER.indexOf(a.position) - POS_ORDER.indexOf(b.position)).slice(0, 11).map(p => (
                        <Badge key={p.id} variant="outline" className={`text-[7px] py-0 gap-0.5 ${p.is_captain ? "border-yellow-500/50" : ""}`}>
                          {p.is_captain && "©"}{POS_LABELS[p.position]}
                          <span className={`font-mono ${ratingColor(p.overall_rating)}`}>{p.overall_rating}</span>
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            }) : (
              <Card className="border-border bg-card/50">
                <CardContent className="p-6 text-center">
                  <p className="text-sm text-muted-foreground mb-3">Nemáte žádný ligový tým.</p>
                </CardContent>
              </Card>
            )}

            {/* Create team */}
            {availableStadiumCities.length > 0 && (
              <Card className="border-dashed border-primary/30 bg-primary/5">
                <CardContent className="p-3 space-y-2">
                  <p className="text-xs font-display font-semibold">⚽ Založit nový tým</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Název týmu" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} className="text-xs h-8" />
                    <select className="rounded border border-border bg-background text-xs px-2 h-8"
                      value={newTeamCity} onChange={e => {
                        setNewTeamCity(e.target.value);
                        const stadium = availableStadiumCities.find((s: any) => s.city_id === e.target.value);
                        setNewTeamBuilding(stadium?.id || "");
                      }}>
                      <option value="">Vyber město</option>
                      {availableStadiumCities.map((s: any) => {
                        const city = myCities.find(c => c.id === s.city_id);
                        return <option key={s.city_id} value={s.city_id}>{city?.name || "?"} ({s.name})</option>;
                      })}
                    </select>
                  </div>
                  <Button size="sm" className="text-xs" onClick={handleCreateTeam} disabled={creating}>
                    {creating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}Založit tým
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ═══ MATCHES ═══ */}
          <TabsContent value="matches" className="space-y-3">
            {matches.filter(m => m.status === "played").length > 0 ? (
              <Card className="border-border bg-card/50">
                <CardContent className="p-2 space-y-1">
                  {matches.filter(m => m.status === "played").slice(0, 20).map(m => {
                    const home = teamMap.get(m.home_team_id);
                    const away = teamMap.get(m.away_team_id);
                    if (!home || !away) return null;
                    const isMyTeam = (id: string) => teams.some(t => t.id === id);
                    return (
                      <div key={m.id} className="p-2 rounded bg-accent/5 border border-border/30">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground text-[9px] w-6">K{m.round_number}</span>
                          <span className={`flex-1 text-right truncate ${isMyTeam(m.home_team_id) ? "text-primary font-bold" : ""}`}>
                            {home.team_name}
                          </span>
                          <span className="font-display font-bold text-sm min-w-[3rem] text-center">
                            {m.home_score ?? "?"} : {m.away_score ?? "?"}
                          </span>
                          <span className={`flex-1 truncate ${isMyTeam(m.away_team_id) ? "text-primary font-bold" : ""}`}>
                            {away.team_name}
                          </span>
                        </div>
                        {m.highlight_text && (
                          <p className="text-[9px] text-muted-foreground mt-1 italic">{m.highlight_text}</p>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ) : (
              <Card className="border-border bg-card/50">
                <CardContent className="p-6 text-center">
                  <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="text-xs text-muted-foreground">Žádné odehrané zápasy.</p>
                  {teams.length > 0 && (
                    <Button size="sm" className="mt-3 text-xs gap-1" onClick={handlePlayRound} disabled={playingRound}>
                      <Play className="h-3 w-3" /> Odehrát první kolo
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ═══ STADIUMS ═══ */}
          <TabsContent value="stadium" className="space-y-3">
            {stadiums.length > 0 ? stadiums.map((s: any) => {
              const city = myCities.find(c => c.id === s.city_id);
              const cityTeams = teams.filter(t => t.city_id === s.city_id);
              return (
                <Card key={s.id} className="border-border bg-card/50">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-primary" />
                        <span className="font-display text-sm font-semibold">{s.name}</span>
                        <Badge variant="outline" className="text-[8px]">Úroveň {s.current_level}</Badge>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{city?.name || "?"}</span>
                    </div>
                    {cityTeams.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {cityTeams.map(t => (
                          <Badge key={t.id} variant="secondary" className="text-[8px] gap-1">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color_primary }} />
                            {t.team_name}
                          </Badge>
                        ))}
                      </div>
                    ) : <span className="text-[9px] text-yellow-400">⚠ Bez týmu</span>}
                  </CardContent>
                </Card>
              );
            }) : (
              <Card className="border-border bg-card/50">
                <CardContent className="p-6 text-center">
                  <p className="text-xs text-muted-foreground">Žádné stadiony. Postavte Stadion.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ═══ GLADIATORS ═══ */}
          <TabsContent value="gladiators" className="space-y-3">
            {academies.length > 0 ? academies.map((acad: any) => {
              const acadRecords = records.filter((r: any) => r.academy_id === acad.id);
              const active = acadRecords.filter((r: any) => r.status === "active");
              const dead = acadRecords.filter((r: any) => r.status === "dead");
              return (
                <Card key={acad.id} className="border-red-500/20 bg-card/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="font-display text-sm flex items-center gap-2">
                      <Flame className="h-4 w-4 text-red-400" />{acad.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex gap-3 text-[9px] text-muted-foreground">
                      <span>🩸 Brutalita: {acad.profile_brutality}</span>
                      <span>👥 {acad.crowd_popularity}</span>
                      <span>💀 {acad.total_fatalities}</span>
                    </div>
                    {active.length > 0 && active.map((g: any) => (
                      <div key={g.id} className="flex items-center justify-between text-[9px] p-1.5 rounded bg-muted/20 border border-border">
                        <span className="font-semibold">{g.is_icon && <Star className="h-3 w-3 inline text-yellow-400 mr-0.5" />}{studentNames.get(g.student_id) || "?"}</span>
                        <span className="text-muted-foreground">⚔{g.fights} 🏆{g.victories} 💀{g.kills}</span>
                      </div>
                    ))}
                    {dead.length > 0 && dead.slice(0, 3).map((g: any) => (
                      <p key={g.id} className="text-[9px] text-red-400/60">💀 {studentNames.get(g.student_id) || "?"} — {g.cause_of_death || "Padl"}</p>
                    ))}
                  </CardContent>
                </Card>
              );
            }) : (
              <Card className="border-border bg-card/50">
                <CardContent className="p-6 text-center">
                  <Skull className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="text-xs text-muted-foreground">Žádné gladiátorské arény.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Player detail dialog */}
      <Dialog open={!!selectedPlayer} onOpenChange={open => !open && setSelectedPlayer(null)}>
        <DialogContent className="max-w-md">
          {selectedPlayer && <PlayerDetail player={selectedPlayer} teamName={teams.find(t => t.id === selectedPlayer.team_id)?.team_name || "?"} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

function PlayerDetail({ player, teamName }: { player: LeaguePlayer; teamName: string }) {
  const fl = formLabel(player.form);
  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-display flex items-center gap-2">
          {player.is_captain && <span className="text-yellow-400">©</span>}
          {player.name}
          <Badge variant="outline" className="text-[8px]">{POS_FULL[player.position]}</Badge>
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">{teamName}</p>

        {/* Overall + Form + Condition */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">Overall</p>
            <p className={`text-2xl font-bold font-mono ${ratingColor(player.overall_rating)}`}>{player.overall_rating}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">Forma</p>
            <p className={`text-lg font-bold ${fl.cls}`}>{player.form}</p>
            <p className={`text-[9px] ${fl.cls}`}>{fl.text}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground">Kondice</p>
            <Progress value={player.condition} className="h-2 mt-1" />
            <p className="text-[10px] font-mono mt-0.5">{player.condition}%</p>
          </div>
        </div>

        {player.injury_turns > 0 && (
          <Badge variant="destructive" className="text-xs">🏥 Zraněn — {player.injury_turns} kol</Badge>
        )}

        {/* Stats radar */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          {[
            { label: "Síla", value: player.strength, icon: "💪" },
            { label: "Rychlost", value: player.speed, icon: "⚡" },
            { label: "Technika", value: player.technique, icon: "🎯" },
            { label: "Výdrž", value: player.stamina, icon: "🫁" },
            { label: "Agresivita", value: player.aggression, icon: "🔥" },
            { label: "Vůdcovství", value: player.leadership, icon: "👑" },
          ].map(stat => (
            <div key={stat.label} className="flex items-center justify-between p-1.5 rounded bg-muted/20 border border-border">
              <span className="text-muted-foreground">{stat.icon} {stat.label}</span>
              <span className={`font-mono font-bold ${ratingColor(stat.value)}`}>{stat.value}</span>
            </div>
          ))}
        </div>

        {/* Season stats */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-lg font-bold font-mono">{player.goals || 0}</p>
            <p className="text-[9px] text-muted-foreground">Góly</p>
          </div>
          <div>
            <p className="text-lg font-bold font-mono">{player.assists || 0}</p>
            <p className="text-[9px] text-muted-foreground">Asistence</p>
          </div>
          <div>
            <p className="text-lg font-bold font-mono">{player.matches_played || 0}</p>
            <p className="text-[9px] text-muted-foreground">Zápasy</p>
          </div>
          <div>
            <p className="text-lg font-bold font-mono text-yellow-400">{player.yellow_cards || 0}</p>
            <p className="text-[9px] text-muted-foreground">🟨 Karty</p>
          </div>
        </div>
      </div>
    </>
  );
}

export default StadiumArenaPanel;
