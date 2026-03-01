import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skull, Flame, Heart, Users, AlertTriangle, Shield, Star, Swords, Trophy, Calendar, Target, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  cities: any[];
}

interface GladiatorRecord {
  id: string;
  student_id: string;
  academy_id: string;
  fights: number;
  victories: number;
  kills: number;
  injuries: number;
  crowd_favor: number;
  is_icon: boolean;
  status: string;
  died_turn: number | null;
  cause_of_death: string | null;
}

interface GladiatorAcademy {
  id: string;
  name: string;
  profile_brutality: number;
  crowd_popularity: number;
  elite_favor: number;
  people_favor: number;
  revolt_risk: number;
  total_fatalities: number;
  is_gladiatorial: boolean;
}

interface StadiumBuilding {
  id: string;
  name: string;
  city_id: string;
  current_level: number;
  effects: any;
  building_tags: string[];
  is_arena: boolean;
}

interface LeagueTeam {
  id: string;
  city_id: string;
  team_name: string;
  motto: string | null;
  attack_rating: number;
  defense_rating: number;
  tactics_rating: number;
  color_primary: string;
  color_secondary: string;
  titles_won: number;
  fan_base: number;
}

interface LeaguePlayer {
  id: string;
  team_id: string;
  name: string;
  position: string;
  strength: number;
  speed: number;
  technique: number;
  stamina: number;
  is_captain: boolean;
  goals_scored: number;
  matches_played: number;
}

interface LeagueMatch {
  id: string;
  round_number: number;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  highlight_text: string | null;
}

const POS_LABELS: Record<string, string> = {
  goalkeeper: "Brankář", defender: "Obránce", midfielder: "Záložník", attacker: "Útočník",
};

const StadiumArenaPanel = ({ sessionId, currentPlayerName, currentTurn, cities }: Props) => {
  const [academies, setAcademies] = useState<GladiatorAcademy[]>([]);
  const [records, setRecords] = useState<GladiatorRecord[]>([]);
  const [studentNames, setStudentNames] = useState<Map<string, string>>(new Map());
  const [stadiums, setStadiums] = useState<StadiumBuilding[]>([]);
  const [teams, setTeams] = useState<LeagueTeam[]>([]);
  const [players, setPlayers] = useState<LeaguePlayer[]>([]);
  const [matches, setMatches] = useState<LeagueMatch[]>([]);
  const [allTeams, setAllTeams] = useState<LeagueTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamCity, setNewTeamCity] = useState("");
  const [newTeamBuilding, setNewTeamBuilding] = useState("");

  const myCities = cities.filter(c => c.owner_player === currentPlayerName);
  const myCityIds = myCities.map(c => c.id);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [{ data: acads }, { data: studs }, { data: blds }, { data: myTeams }, { data: allT }] = await Promise.all([
      supabase.from("academies")
        .select("id, name, profile_brutality, crowd_popularity, elite_favor, people_favor, revolt_risk, total_fatalities, is_gladiatorial")
        .eq("session_id", sessionId).eq("player_name", currentPlayerName).gt("profile_brutality", 20),
      supabase.from("academy_students")
        .select("id, name, academy_id")
        .eq("session_id", sessionId).eq("player_name", currentPlayerName),
      supabase.from("city_buildings")
        .select("id, name, city_id, current_level, effects, building_tags, is_arena")
        .eq("session_id", sessionId).eq("status", "completed")
        .in("city_id", myCityIds.length > 0 ? myCityIds : ["__none__"]),
      supabase.from("league_teams")
        .select("*").eq("session_id", sessionId).eq("player_name", currentPlayerName).eq("is_active", true),
      supabase.from("league_teams")
        .select("id, team_name, color_primary").eq("session_id", sessionId).eq("is_active", true),
    ]);

    setAcademies((acads || []) as any);
    const nameMap = new Map<string, string>();
    for (const s of (studs || [])) nameMap.set(s.id, s.name);
    setStudentNames(nameMap);

    // Filter stadiums: building_tags includes 'stadium' OR name contains stadium keywords
    const stadiumBuildings = (blds || []).filter((b: any) => {
      const tags = (b.building_tags as string[]) || [];
      const nameLC = (b.name || "").toLowerCase();
      return tags.includes("stadium") || nameLC.includes("stadion") || nameLC.includes("závodiště") || nameLC.includes("hippodrom");
    });
    setStadiums(stadiumBuildings as any);
    setTeams((myTeams || []) as any);
    setAllTeams((allT || []) as any);

    // Fetch gladiator records
    if (acads && acads.length > 0) {
      const { data: recs } = await supabase.from("gladiator_records")
        .select("*").eq("session_id", sessionId).in("academy_id", acads.map(a => a.id));
      setRecords((recs || []) as any);
    } else {
      setRecords([]);
    }

    // Fetch league players and recent matches for my teams
    if (myTeams && myTeams.length > 0) {
      const teamIds = myTeams.map((t: any) => t.id);
      const [{ data: pl }, { data: mt }] = await Promise.all([
        supabase.from("league_players").select("*").in("team_id", teamIds),
        supabase.from("league_matches").select("*").eq("session_id", sessionId)
          .eq("status", "played").order("round_number", { ascending: false }).limit(20),
      ]);
      setPlayers((pl || []) as any);
      // Filter matches involving my teams
      const myMatchSet = (mt || []).filter((m: any) => teamIds.includes(m.home_team_id) || teamIds.includes(m.away_team_id));
      setMatches(myMatchSet as any);
    } else {
      setPlayers([]);
      setMatches([]);
    }

    setLoading(false);
  }, [sessionId, currentPlayerName, myCityIds.join(",")]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreateTeam = async () => {
    if (!newTeamName.trim() || !newTeamCity) { toast.error("Zadej název týmu a vyber město"); return; }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-league-team", {
        body: {
          sessionId, cityId: newTeamCity, buildingId: newTeamBuilding || undefined,
          teamName: newTeamName.trim(), playerName: currentPlayerName,
        },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success(`⚽ Tým "${newTeamName.trim()}" založen s 11 hráči!`);
      setNewTeamName("");
      setNewTeamCity("");
      setNewTeamBuilding("");
      await fetchData();
    } catch (e: any) {
      toast.error(e.message || "Chyba při zakládání týmu");
    } finally {
      setCreating(false);
    }
  };

  const teamMap = new Map(allTeams.map(t => [t.id, t]));
  const teamCityIds = new Set(teams.map(t => t.city_id));
  const availableStadiumCities = stadiums.filter(s => !teamCityIds.has(s.city_id));

  if (loading) return <p className="text-xs text-muted-foreground text-center p-4">Načítám…</p>;

  const hasContent = academies.length > 0 || stadiums.length > 0 || teams.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Swords className="h-5 w-5 text-primary" />
        <h3 className="font-display font-bold text-base">Stadiony & Arény</h3>
      </div>

      {!hasContent ? (
        <Card className="border-border bg-card/50">
          <CardContent className="p-8 text-center">
            <Swords className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-sm text-muted-foreground">Žádné stadiony ani arény.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Postavte <strong>Stadion</strong> (pro ligu) nebo <strong>Arénu</strong> (pro gladiátory) ve svém městě.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue={teams.length > 0 ? "team" : stadiums.length > 0 ? "stadium" : "gladiators"} className="space-y-3">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="team" className="text-xs"><Users className="h-3 w-3 mr-1" />Tým</TabsTrigger>
            <TabsTrigger value="matches" className="text-xs"><Calendar className="h-3 w-3 mr-1" />Zápasy</TabsTrigger>
            <TabsTrigger value="stadium" className="text-xs"><Target className="h-3 w-3 mr-1" />Stadiony</TabsTrigger>
            <TabsTrigger value="gladiators" className="text-xs"><Skull className="h-3 w-3 mr-1" />Arény</TabsTrigger>
          </TabsList>

          {/* ═══ TEAM + ROSTER ═══ */}
          <TabsContent value="team" className="space-y-3">
            {teams.length > 0 ? teams.map(team => {
              const teamPlayers = players.filter(p => p.team_id === team.id);
              const cityName = myCities.find(c => c.id === team.city_id)?.name || "?";
              return (
                <Card key={team.id} className="border-primary/20 bg-card/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm"
                        style={{ backgroundColor: team.color_primary, color: team.color_secondary }}>⚽</div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="font-display text-sm">{team.team_name}</CardTitle>
                        <p className="text-[10px] text-muted-foreground">{cityName} · {team.motto}</p>
                      </div>
                      <div className="flex gap-2 text-[10px]">
                        <span>⚔️{team.attack_rating}</span>
                        <span>🛡️{team.defense_rating}</span>
                        <span>🏆{team.titles_won}</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-[10px] font-display font-semibold text-muted-foreground mb-1">
                      Soupiska ({teamPlayers.length} hráčů)
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      {teamPlayers.sort((a, b) => {
                        const order = ["goalkeeper", "defender", "midfielder", "attacker"];
                        return order.indexOf(a.position) - order.indexOf(b.position);
                      }).map(p => (
                        <div key={p.id} className="flex items-center justify-between text-[9px] p-1.5 rounded bg-muted/20 border border-border">
                          <div className="flex items-center gap-1">
                            {p.is_captain && <span className="text-yellow-400">©</span>}
                            <span className="font-semibold">{p.name}</span>
                            <Badge variant="outline" className="text-[7px] py-0">{POS_LABELS[p.position] || p.position}</Badge>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <span>💪{p.strength}</span>
                            <span>⚡{p.speed}</span>
                            <span>🎯{p.technique}</span>
                            {p.goals_scored > 0 && <span className="text-primary font-bold">⚽{p.goals_scored}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            }) : (
              <Card className="border-border bg-card/50">
                <CardContent className="p-6 text-center">
                  <p className="text-sm text-muted-foreground mb-3">Nemáte žádný ligový tým.</p>
                  {availableStadiumCities.length > 0 ? (
                    <p className="text-xs text-muted-foreground">Založte tým ve městě se stadionem.</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Postavte Stadion a pak můžete založit tým.</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Create team form */}
            {availableStadiumCities.length > 0 && (
              <Card className="border-dashed border-primary/30 bg-primary/5">
                <CardContent className="p-3 space-y-2">
                  <p className="text-xs font-display font-semibold">⚽ Založit nový tým</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Název týmu" value={newTeamName} onChange={e => setNewTeamName(e.target.value)}
                      className="text-xs h-8" />
                    <select className="rounded border border-border bg-background text-xs px-2 h-8"
                      value={newTeamCity} onChange={e => {
                        setNewTeamCity(e.target.value);
                        const stadium = availableStadiumCities.find(s => s.city_id === e.target.value);
                        setNewTeamBuilding(stadium?.id || "");
                      }}>
                      <option value="">Vyber město</option>
                      {availableStadiumCities.map(s => {
                        const city = myCities.find(c => c.id === s.city_id);
                        return <option key={s.city_id} value={s.city_id}>{city?.name || "?"} ({s.name})</option>;
                      })}
                    </select>
                  </div>
                  <Button size="sm" className="text-xs" onClick={handleCreateTeam} disabled={creating}>
                    {creating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    Založit tým (11 hráčů)
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ═══ MATCHES ═══ */}
          <TabsContent value="matches" className="space-y-3">
            {matches.length > 0 ? (
              <Card className="border-border bg-card/50">
                <CardContent className="p-2 space-y-1">
                  {matches.slice(0, 15).map(m => {
                    const home = teamMap.get(m.home_team_id);
                    const away = teamMap.get(m.away_team_id);
                    if (!home || !away) return null;
                    const isMyTeam = (id: string) => teams.some(t => t.id === id);
                    return (
                      <div key={m.id} className="flex items-center gap-2 p-2 rounded bg-accent/5 text-xs">
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
                    );
                  })}
                </CardContent>
              </Card>
            ) : (
              <Card className="border-border bg-card/50">
                <CardContent className="p-6 text-center">
                  <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="text-xs text-muted-foreground">Žádné odehrané zápasy.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ═══ STADIUMS ═══ */}
          <TabsContent value="stadium" className="space-y-3">
            {stadiums.length > 0 ? stadiums.map(s => {
              const city = myCities.find(c => c.id === s.city_id);
              const hasTeam = teams.some(t => t.city_id === s.city_id);
              const team = teams.find(t => t.city_id === s.city_id);
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
                    <div className="flex items-center gap-3 text-[9px] text-muted-foreground mt-1">
                      {hasTeam ? (
                        <span className="text-primary">⚽ {team?.team_name}</span>
                      ) : (
                        <span className="text-yellow-400">⚠ Bez týmu</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            }) : (
              <Card className="border-border bg-card/50">
                <CardContent className="p-6 text-center">
                  <Target className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="text-xs text-muted-foreground">Žádné stadiony. Postavte Stadion ve městě.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ═══ GLADIATORS (ARÉNY) ═══ */}
          <TabsContent value="gladiators" className="space-y-3">
            {academies.length > 0 ? academies.map(acad => {
              const acadRecords = records.filter(r => r.academy_id === acad.id);
              const activeGladiators = acadRecords.filter(r => r.status === "active");
              const deadGladiators = acadRecords.filter(r => r.status === "dead");

              return (
                <Card key={acad.id} className="border-red-500/20 bg-card/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="font-display text-sm flex items-center gap-2">
                      <Flame className="h-4 w-4 text-red-400" />
                      {acad.name}
                      {acad.is_gladiatorial && (
                        <Badge variant="outline" className="text-[7px] text-red-400 border-red-500/30">Gladiátorská</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="flex items-center justify-between text-[9px] mb-0.5">
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" />Lid</span>
                          <span>{acad.people_favor}</span>
                        </div>
                        <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full" style={{ width: `${acad.people_favor}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-[9px] mb-0.5">
                          <span className="flex items-center gap-1"><Shield className="h-3 w-3" />Elita</span>
                          <span>{acad.elite_favor}</span>
                        </div>
                        <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${acad.elite_favor}%` }} />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
                      <span>🩸 Brutalita: {acad.profile_brutality}</span>
                      <span>👥 Popularita: {acad.crowd_popularity}</span>
                      <span>💀 Úmrtí: {acad.total_fatalities}</span>
                      {acad.revolt_risk > 30 && (
                        <span className="text-red-400 flex items-center gap-0.5">
                          <AlertTriangle className="h-3 w-3" />Vzpoura: {acad.revolt_risk}%
                        </span>
                      )}
                    </div>

                    {activeGladiators.length > 0 && (
                      <div>
                        <p className="text-[10px] font-display font-semibold text-muted-foreground mb-1">
                          Aktivní gladiátoři ({activeGladiators.length})
                        </p>
                        <div className="space-y-1">
                          {activeGladiators.map(g => (
                            <div key={g.id} className="flex items-center justify-between text-[9px] p-1.5 rounded bg-muted/20 border border-border">
                              <div className="flex items-center gap-1">
                                {g.is_icon && <Star className="h-3 w-3 text-yellow-400" />}
                                <span className="font-semibold">{studentNames.get(g.student_id) || "?"}</span>
                              </div>
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <span>⚔ {g.fights}</span>
                                <span>🏆 {g.victories}</span>
                                <span>💀 {g.kills}</span>
                                <span className={g.crowd_favor > 70 ? "text-yellow-400" : ""}>
                                  <Heart className="h-2.5 w-2.5 inline" /> {g.crowd_favor}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {deadGladiators.length > 0 && (
                      <div>
                        <p className="text-[10px] font-display font-semibold text-red-400/70 mb-1">
                          Padlí ({deadGladiators.length})
                        </p>
                        {deadGladiators.slice(0, 3).map(g => (
                          <p key={g.id} className="text-[9px] text-muted-foreground">
                            💀 {studentNames.get(g.student_id) || "?"} — {g.cause_of_death || "Padl v aréně"} (Rok {g.died_turn})
                          </p>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            }) : (
              <Card className="border-border bg-card/50">
                <CardContent className="p-6 text-center">
                  <Skull className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="text-sm text-muted-foreground">Žádné gladiátorské arény.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Zvyšte brutalitu existující akademie nad 20 pro aktivaci gladiátorského systému.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default StadiumArenaPanel;
