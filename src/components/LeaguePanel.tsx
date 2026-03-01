import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trophy, Users, Calendar, Star, Target, Shield, Swords, Play, Loader2, ChevronLeft, Building2, Plus, Award, TrendingUp, Scroll, Skull, Flame } from "lucide-react";
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
  seasons_played: number; total_wins: number; total_draws: number; total_losses: number;
  total_goals_for: number; total_goals_against: number;
  league_tier: number;
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
  best_defense_team_id: string | null; league_tier: number;
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
  praetor: "PRT", guardian: "GRD", striker: "STR", carrier: "CAR", exactor: "EXA",
  // Legacy
  goalkeeper: "PRT", defender: "GRD", midfielder: "CAR", attacker: "STR",
};
const POS_FULL: Record<string, string> = {
  praetor: "Praetor", guardian: "Strážce", striker: "Útočník", carrier: "Nositel", exactor: "Exaktor",
  goalkeeper: "Praetor", defender: "Strážce", midfielder: "Nositel", attacker: "Útočník",
};
const POS_ORDER = ["praetor", "goalkeeper", "guardian", "defender", "carrier", "midfielder", "striker", "attacker", "exactor"];
const POS_ICONS: Record<string, string> = {
  praetor: "👑", guardian: "🛡️", striker: "⚔️", carrier: "🏉", exactor: "💀",
  goalkeeper: "👑", defender: "🛡️", midfielder: "🏉", attacker: "⚔️",
};

const EVENT_ICONS: Record<string, string> = {
  goal: "⚽", breakthrough: "🔥", assist: "🅰️", knockout: "💀", injury: "🏥",
  brutal_foul: "⚠️", crowd_riot: "🪨", crowd_chant: "📢",
};

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
  const [showRules, setShowRules] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: t }, { data: s }, { data: blds }, { data: cits }, { data: assocs }] = await Promise.all([
      supabase.from("league_teams").select("*").eq("session_id", sessionId).eq("is_active", true),
      supabase.from("league_seasons").select("*").eq("session_id", sessionId).order("season_number", { ascending: false }),
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

    const activeSeason = (s || []).find((ss: any) => ss.status === "active" && (ss.league_tier || 1) === 1)
      || (s || []).find((ss: any) => ss.status === "active")
      || (s && s.length > 0 ? s[0] : null);
    const activeSeasonId = activeSeason?.id;
    
    if (activeSeasonId) {
      const [{ data: st }, { data: m }, { data: pl }] = await Promise.all([
        supabase.from("league_standings").select("*").eq("season_id", activeSeasonId).order("points", { ascending: false }),
        supabase.from("league_matches").select("*").eq("season_id", activeSeasonId).order("round_number", { ascending: true }),
        supabase.from("league_players").select("*").in("team_id", (t || []).map((tt: any) => tt.id)).order("goals_scored", { ascending: false }),
      ]);
      const sortedSt = (st || []).sort((a: any, b: any) => {
        if (b.points !== a.points) return b.points - a.points;
        const diffA = a.goals_for - a.goals_against;
        const diffB = b.goals_for - b.goals_against;
        if (diffB !== diffA) return diffB - diffA;
        return b.goals_for - a.goals_for;
      });
      setStandings(sortedSt as any);
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
      toast.success(`⚔️ Kolo ${data.round} odehráno!`);
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
        session_id: sessionId, city_id: cityId, player_name: currentPlayerName,
        name: `Svaz Sphaery ${cityName}`, reputation: 10, scouting_level: 1,
        youth_development: 1, training_quality: 1, fan_base: 50, budget: 50, founded_turn: currentTurn,
      });
      if (error) throw error;
      toast.success("Svaz Sphaery založen!");
      await fetchData();
    } catch (e: any) { toast.error(e.message); } finally { setCreatingAssoc(false); }
  };

  const teamMap = new Map(teams.map(t => [t.id, t]));
  const activeSeason = seasons.find(s => s.status === "active" && (s.league_tier || 1) === 1) || seasons.find(s => s.status === "active") || seasons[0];
  const concludedSeasons = seasons.filter(s => s.status === "concluded");
  const playedMatches = matches.filter(m => m.status === "played").sort((a, b) => b.round_number - a.round_number);
  const upcomingMatches = matches.filter(m => m.status === "scheduled").sort((a, b) => a.round_number - b.round_number);
  const topScorers = [...players].filter(p => (p.goals_scored || 0) > 0).sort((a, b) => (b.goals_scored || 0) - (a.goals_scored || 0)).slice(0, 10);

  const stadiumByCityId = new Map(stadiums.map(s => [s.city_id, s]));
  const myAssociation = associations.find(a => a.player_name === currentPlayerName);
  const titleLeaderboard = [...teams].filter(t => (t.titles_won || 0) > 0).sort((a, b) => (b.titles_won || 0) - (a.titles_won || 0));
  const tier1Teams = teams.filter(t => (t.league_tier || 1) === 1);
  const tier2Teams = teams.filter(t => (t.league_tier || 1) === 2);
  const hasTier2 = tier2Teams.length > 0;

  if (loading) {
    return (
      <Card className="border-border bg-card/50">
        <CardContent className="p-8 text-center">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-xs text-muted-foreground mt-2">Načítám Sphaeru...</p>
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
            <ChevronLeft className="h-3 w-3" /> Zpět
          </Button>
          
          <Card className="border-primary/20 bg-card/50">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-2xl border-4 border-primary/20 shrink-0"
                style={{ backgroundColor: t.color_primary, color: t.color_secondary }}>⚔️</div>
              <div className="flex-1 min-w-0">
                <h3 className="font-display font-bold text-xl">{t.team_name}</h3>
                <p className="text-xs text-muted-foreground italic">{t.motto}</p>
                <div className="flex items-center gap-2 mt-2 text-xs flex-wrap">
                   <Badge variant="outline" className="gap-1"><Building2 className="h-3 w-3" /> {stadium ? stadium.name : "Bez arény"}</Badge>
                   <Badge variant="outline" className="gap-1">📍 {cityName || "?"}</Badge>
                   <Badge variant="outline" className="gap-1"><Users className="h-3 w-3" /> {t.fan_base} fans</Badge>
                   <Badge variant="outline" className="gap-1 text-muted-foreground">👤 {t.player_name}</Badge>
                   <Badge variant="outline" className="gap-1 text-muted-foreground">
                     {(t.league_tier || 1) === 1 ? "1. liga" : `${t.league_tier}. liga`}
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
                    {t.seasons_played} sezón · {t.total_wins || 0}V · {t.total_goals_for || 0} bodů
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/50 overflow-hidden">
            <CardHeader className="py-2 px-3 border-b border-border/50">
              <CardTitle className="text-xs font-display flex justify-between items-center">
                Sestava Sphaery
                <span className="text-[10px] font-normal text-muted-foreground">{teamPlayers.length} bojovníků</span>
              </CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                    <th className="px-2 py-1.5 text-left">Bojovník</th>
                    <th className="px-1 py-1.5 text-center">Role</th>
                    <th className="px-1 py-1.5 text-center">OVR</th>
                    <th className="px-1 py-1.5 text-center">Forma</th>
                    <th className="px-1 py-1.5 text-center">Kondice</th>
                    <th className="px-1 py-1.5 text-center">Zápasy</th>
                    <th className="px-1 py-1.5 text-center">Body</th>
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
                          {POS_ICONS[p.position] || "👤"}{" "}
                          {p.is_captain && <span className="text-yellow-400 mr-0.5" title="Praetor">©</span>}
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
        <div className="flex items-center gap-2 flex-wrap">
          <Skull className="h-5 w-5 text-primary" />
          <h3 className="font-display font-bold text-base">⚔️ SPHAERA</h3>
          {activeSeason && (
            <Badge variant="outline" className="text-[9px]">
              {(activeSeason.league_tier || 1) > 1 ? `${activeSeason.league_tier}. liga · ` : ""}
              {activeSeason.season_number}. sezóna — kolo {activeSeason.current_round}/{activeSeason.total_rounds}
            </Badge>
          )}
          <Badge variant="secondary" className="text-[9px]">
            {teams.length} týmů{hasTier2 ? ` (1.liga: ${tier1Teams.length}, 2.liga: ${tier2Teams.length})` : ""}
          </Badge>
        </div>
        
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" className="text-xs gap-1" onClick={() => setShowRules(true)} title="Pravidla Sphaery">
            <Scroll className="h-3.5 w-3.5" />
          </Button>
          {!myAssociation && (
            <Button size="sm" variant="outline" className="text-xs gap-1" onClick={handleCreateAssociation} disabled={creatingAssoc}>
              {creatingAssoc ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Založit Svaz
            </Button>
          )}
          {teams.length > 1 && (
             <Button size="sm" className="text-xs gap-1 shadow-lg shadow-primary/10" onClick={handlePlayRound} disabled={playingRound}>
               {playingRound ? <Loader2 className="h-3 w-3 animate-spin" /> : <Flame className="h-3 w-3" />}
               Odehrát kolo
             </Button>
          )}
        </div>
      </div>

      {/* Round result overlay */}
      {roundResult && (
        <Card className="border-red-500/30 bg-red-500/5 animate-in fade-in slide-in-from-top-4">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-display font-bold text-primary flex items-center gap-1">
                ⚔️ Výsledky {roundResult.round}. kola
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
                  {(m.knockouts || 0) > 0 && <span className="text-red-400 text-[9px]">💀{m.knockouts}</span>}
                  {m.crowdMood && <span className="text-[9px] text-muted-foreground">{m.crowdMood}</span>}
                </div>
              ))}
            </div>
            {roundResult.commentary && (
              <div className="bg-background/30 p-2 rounded border border-red-500/10">
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
            {roundResult.playoff && roundResult.playoff.matches?.length > 0 && (
              <div className="mt-2 space-y-1">
                <span className="text-xs font-display font-bold text-yellow-400 flex items-center gap-1">🏆 Playoff</span>
                {roundResult.playoff.matches.map((m: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-yellow-500/5 border border-yellow-500/20 p-1.5 rounded">
                    <Badge variant="outline" className="text-[8px] border-yellow-500/30 text-yellow-400">{m.playoffRound}</Badge>
                    <span className="flex-1 text-right truncate font-medium">{m.home}</span>
                    <span className="font-display font-bold min-w-[3rem] text-center bg-background/60 rounded px-1">
                      {m.homeScore} : {m.awayScore}
                    </span>
                    <span className="flex-1 truncate font-medium">{m.away}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {teams.length === 0 ? (
        <Card className="border-border bg-card/50">
          <CardContent className="p-8 text-center">
            <Skull className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-sm text-muted-foreground">Žádné týmy v lize Sphaery.</p>
            <p className="text-xs text-muted-foreground mt-1">Postav Arénu ve městě a založ tým.</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="table" className="space-y-3">
          <TabsList className="grid w-full grid-cols-6 bg-muted/20">
            <TabsTrigger value="table" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary"><Trophy className="h-3 w-3 mr-1" />Tabulka</TabsTrigger>
            <TabsTrigger value="matches" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary"><Calendar className="h-3 w-3 mr-1" />Zápasy</TabsTrigger>
            <TabsTrigger value="playoff" className="text-xs data-[state=active]:bg-yellow-500/20 data-[state=active]:text-yellow-400"><Award className="h-3 w-3 mr-1" />Pohár</TabsTrigger>
            <TabsTrigger value="scorers" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary"><Target className="h-3 w-3 mr-1" />Střelci</TabsTrigger>
            <TabsTrigger value="team" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary"><Users className="h-3 w-3 mr-1" />Týmy</TabsTrigger>
            <TabsTrigger value="assoc" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary"><Shield className="h-3 w-3 mr-1" />Svaz</TabsTrigger>
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
                        <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">Zatím žádná data.</td></tr>
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
                <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">Odehrané souboje</h4>
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
                <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">Nadcházející</h4>
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

          {/* ═══ PLAYOFF / POHÁR ═══ */}
          <TabsContent value="playoff" className="space-y-3">
            {(() => {
              const playoffSeason = activeSeason;
              const bracket: any[] = (playoffSeason as any)?.playoff_bracket || [];
              const playoffStatus = (playoffSeason as any)?.playoff_status || "none";
              const qfMatches = bracket.filter((m: any) => m.round === "quarterfinals");
              const sfMatches = bracket.filter((m: any) => m.round === "semifinals");
              const finalMatch = bracket.find((m: any) => m.round === "final");

              const getTeamName = (id: string) => teamMap.get(id)?.team_name || "?";
              const getTeamColor = (id: string) => teamMap.get(id)?.color_primary || "hsl(var(--muted))";

              const statusLabels: Record<string, string> = {
                none: "Základní část",
                quarterfinals: "⚔️ Čtvrtfinále",
                semifinals: "⚔️ Semifinále",
                final: "🏆 Finále",
                completed: "✅ Ukončeno",
              };

              const renderMatchBox = (m: any, showSeed?: boolean) => {
                const isPlayed = m.status === "played";
                const homeWon = isPlayed && m.home_score > m.away_score;
                const awayWon = isPlayed && m.away_score > m.home_score;
                return (
                  <div key={`${m.round}-${m.match_index}`} className="border border-border rounded bg-card/60 overflow-hidden text-[10px] min-w-[160px]">
                    <div className={`flex items-center gap-1.5 px-2 py-1.5 border-b border-border/50 ${homeWon ? "bg-green-500/10 font-bold" : isPlayed && !homeWon ? "opacity-50" : ""}`}>
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getTeamColor(m.home_team_id) }} />
                      <span className="flex-1 truncate">{showSeed && m.home_seed ? `[${m.home_seed}] ` : ""}{getTeamName(m.home_team_id)}</span>
                      <span className="font-mono font-bold min-w-[16px] text-right">{isPlayed ? m.home_score : "-"}</span>
                    </div>
                    <div className={`flex items-center gap-1.5 px-2 py-1.5 ${awayWon ? "bg-green-500/10 font-bold" : isPlayed && !awayWon ? "opacity-50" : ""}`}>
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getTeamColor(m.away_team_id) }} />
                      <span className="flex-1 truncate">{showSeed && m.away_seed ? `[${m.away_seed}] ` : ""}{getTeamName(m.away_team_id)}</span>
                      <span className="font-mono font-bold min-w-[16px] text-right">{isPlayed ? m.away_score : "-"}</span>
                    </div>
                  </div>
                );
              };

              if (playoffStatus === "none" && bracket.length === 0) {
                return (
                  <Card className="border-border bg-card/50">
                    <CardContent className="p-8 text-center">
                      <Award className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-40" />
                      <p className="text-sm text-muted-foreground">Playoff začne po skončení základní části.</p>
                      <p className="text-[10px] text-muted-foreground mt-1">Prvních 8 týmů postoupí do vyřazovacího pavouku.</p>
                    </CardContent>
                  </Card>
                );
              }

              return (
                <div className="space-y-3">
                  <Card className="border-yellow-500/20 bg-yellow-500/5">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-display font-bold text-sm flex items-center gap-2">
                          🏆 Pohár Sphaery
                          <Badge variant="outline" className="text-[9px] border-yellow-500/30 text-yellow-400">
                            {statusLabels[playoffStatus] || playoffStatus}
                          </Badge>
                        </h4>
                        {playoffStatus === "completed" && finalMatch?.winner_team_id && (
                          <Badge className="bg-yellow-500 text-black border-none text-xs gap-1">
                            🏆 {getTeamName(finalMatch.winner_team_id)}
                          </Badge>
                        )}
                      </div>

                      {/* Bracket visualization */}
                      <div className="flex items-start gap-4 overflow-x-auto pb-2">
                        {/* Quarterfinals */}
                        {qfMatches.length > 0 && (
                          <div className="space-y-1 shrink-0">
                            <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold text-center mb-1">Čtvrtfinále</div>
                            <div className="space-y-2">
                              {qfMatches.map(m => renderMatchBox(m, true))}
                            </div>
                          </div>
                        )}

                        {/* Connector */}
                        {qfMatches.length > 0 && sfMatches.length > 0 && (
                          <div className="flex items-center self-center text-muted-foreground/30 text-lg">→</div>
                        )}

                        {/* Semifinals */}
                        {sfMatches.length > 0 && (
                          <div className="space-y-1 shrink-0">
                            <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold text-center mb-1">Semifinále</div>
                            <div className="space-y-2 flex flex-col justify-center" style={{ minHeight: qfMatches.length > 0 ? "200px" : undefined }}>
                              {sfMatches.map(m => renderMatchBox(m))}
                            </div>
                          </div>
                        )}

                        {/* Connector */}
                        {sfMatches.length > 0 && finalMatch && (
                          <div className="flex items-center self-center text-muted-foreground/30 text-lg">→</div>
                        )}

                        {/* Final */}
                        {finalMatch && (
                          <div className="space-y-1 shrink-0">
                            <div className="text-[9px] uppercase tracking-wider text-yellow-400 font-semibold text-center mb-1">🏆 Finále</div>
                            <div className="flex flex-col justify-center" style={{ minHeight: sfMatches.length > 0 ? "200px" : undefined }}>
                              {renderMatchBox(finalMatch)}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Titles History Table */}
                  <Card className="border-border bg-card/50">
                    <CardHeader className="py-2 px-3 border-b border-border/50">
                      <CardTitle className="text-xs font-display flex items-center gap-1">
                        <Trophy className="h-3.5 w-3.5 text-yellow-500" /> Tabulka titulů
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground bg-muted/10">
                            <th className="p-2 text-left w-8">#</th>
                            <th className="p-2 text-left">Tým</th>
                            <th className="p-2 text-left text-[9px]">Hráč</th>
                            <th className="p-2 text-center w-12">🏆</th>
                            <th className="p-2 text-center w-12">Sezón</th>
                            <th className="p-2 text-center w-16">V/R/P</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...teams].sort((a, b) => (b.titles_won || 0) - (a.titles_won || 0)).map((t, i) => (
                            <tr key={t.id} className={`border-b border-border/50 hover:bg-accent/5 cursor-pointer ${t.player_name === currentPlayerName ? "bg-primary/5" : ""}`}
                              onClick={() => setSelectedTeam(t.id)}>
                              <td className="p-2 text-muted-foreground">
                                {(t.titles_won || 0) > 0 && i === 0 ? "🥇" : (t.titles_won || 0) > 0 && i === 1 ? "🥈" : (t.titles_won || 0) > 0 && i === 2 ? "🥉" : `${i+1}.`}
                              </td>
                              <td className="p-2">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color_primary }} />
                                  <span className="font-medium">{t.team_name}</span>
                                </div>
                              </td>
                              <td className="p-2 text-muted-foreground text-[9px] truncate max-w-[60px]">{t.player_name}</td>
                              <td className="p-2 text-center font-bold text-yellow-400">{t.titles_won || 0}</td>
                              <td className="p-2 text-center text-muted-foreground">{t.seasons_played || 0}</td>
                              <td className="p-2 text-center text-[9px] font-mono text-muted-foreground">{t.total_wins||0}/{t.total_draws||0}/{t.total_losses||0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                </div>
              );
            })()}
          </TabsContent>

          {/* ═══ SCORERS ═══ */}
          <TabsContent value="scorers">
            <Card className="border-border bg-card/50">
              <CardContent className="p-0">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground bg-muted/10">
                      <th className="p-2 text-left w-8">#</th>
                      <th className="p-2 text-left">Bojovník</th>
                      <th className="p-2 text-left">Tým</th>
                      <th className="p-2 text-center w-12">⚔️</th>
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
                          <td className="p-2 font-medium">{POS_ICONS[p.position] || ""} {p.name}</td>
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
            {titleLeaderboard.length > 0 && (
              <Card className="border-yellow-500/20 bg-yellow-500/5 mb-3">
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-xs font-display flex items-center gap-1">
                    <Trophy className="h-3.5 w-3.5 text-yellow-500" /> Síň slávy
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
                    className="cursor-pointer transition-all hover:border-primary/50 border-border bg-card/50"
                    onClick={() => setSelectedTeam(t.id)}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 border border-primary/20"
                        style={{ backgroundColor: t.color_primary, color: t.color_secondary }}>⚔️</div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xs truncate">{t.team_name}</div>
                        <div className="text-[9px] text-muted-foreground truncate">{city || "?"} · {t.player_name}</div>
                        <div className="text-[9px] text-muted-foreground truncate">{stadium ? `🏟 ${stadium.name}` : "Bez arény"}</div>
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
                Žádné svazy Sphaery. Založte svůj!
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
                            <p className="text-[10px] text-muted-foreground mt-0.5">{cityName} · {assoc.player_name}</p>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold text-primary">{assoc.reputation}</div>
                            <div className="text-[9px] text-muted-foreground">Prestiž</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-center">
                          {[["scouting_level", "Skauting"], ["youth_development", "Mládež"], ["training_quality", "Trénink"], ["budget", "Budget"]].map(([k, label]) => (
                            <div key={k} className="bg-muted/20 rounded p-1.5">
                              <div className="text-xs font-bold">{(assoc as any)[k]}</div>
                              <div className="text-[8px] text-muted-foreground">{label}</div>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-3">
                            <span className="text-muted-foreground"><Users className="h-3 w-3 inline mr-0.5" />{assoc.fan_base} fans</span>
                            <span className="text-muted-foreground">{assocTeams.length} týmů</span>
                          </div>
                          {totalTitles > 0 && (
                            <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30 text-[9px]">🏆 {totalTitles} titulů</Badge>
                          )}
                        </div>
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
                     {POS_ICONS[selectedPlayer.position] || "👤"}
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
                     {[["Síla", "strength"], ["Rychlost", "speed"], ["Výdrž", "stamina"]].map(([label, key]) => (
                       <div key={key} className="flex justify-between items-center p-1 border-b border-border/30">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-mono font-bold">{(selectedPlayer as any)[key]}</span>
                       </div>
                     ))}
                  </div>
                  <div className="space-y-1">
                     {[["Technika", "technique"], ["Brutalita", "aggression"], ["Vůdcovství", "leadership"]].map(([label, key]) => (
                       <div key={key} className="flex justify-between items-center p-1 border-b border-border/30">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-mono font-bold">{(selectedPlayer as any)[key]}</span>
                       </div>
                     ))}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 pt-2 border-t border-border">
                   {[["goals_scored", "Body", "text-foreground"], ["assists", "Asist.", "text-foreground"], ["matches_played", "Zápasy", "text-foreground"], ["yellow_cards", "Vyřazení", "text-red-400"]].map(([key, label, cls]) => (
                     <div key={key} className="text-center">
                        <div className={`text-lg font-bold ${cls}`}>{(selectedPlayer as any)[key] || 0}</div>
                        <div className="text-[8px] uppercase text-muted-foreground">{label}</div>
                     </div>
                   ))}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Sphaera Rules Modal */}
      <Dialog open={showRules} onOpenChange={setShowRules}>
        <DialogContent className="max-w-lg bg-card border-primary/20 max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              ⚔️ SPHAERA
              <span className="text-xs font-normal text-muted-foreground">„Míč je kulatý. Čest není."</span>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh] pr-3">
            <div className="space-y-4 text-xs leading-relaxed">
              <section>
                <h4 className="font-display font-bold text-sm text-primary mb-1">🏟 Základní koncept</h4>
                <p className="text-muted-foreground">
                  Dva týmy po 11 bojovnících soupeří s těžkou kovovou koulí – <strong>Sphaerou</strong> – na oválném hřišti obehnalém tribunou.
                  Cíl: dostat Sphaeru do nepřátelské Brány. Hráči se mohou fyzicky napadat a zranění jsou běžná.
                </p>
              </section>

              <section>
                <h4 className="font-display font-bold text-sm text-primary mb-1">🧱 Struktura týmu (11 bojovníků)</h4>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 bg-muted/20 p-1.5 rounded">
                    <span>👑</span><strong>1× Praetor</strong> <span className="text-muted-foreground">— Kapitán. Taktické bonusy, zvyšuje morálku.</span>
                  </div>
                  <div className="flex items-center gap-2 bg-muted/20 p-1.5 rounded">
                    <span>🛡️</span><strong>3× Strážce</strong> <span className="text-muted-foreground">— Obranní hráči. Vysoká síla a výdrž.</span>
                  </div>
                  <div className="flex items-center gap-2 bg-muted/20 p-1.5 rounded">
                    <span>⚔️</span><strong>4× Útočník</strong> <span className="text-muted-foreground">— Rychlost a obratnost. Skórují body.</span>
                  </div>
                  <div className="flex items-center gap-2 bg-muted/20 p-1.5 rounded">
                    <span>🏉</span><strong>2× Nositel</strong> <span className="text-muted-foreground">— Specialisté na manipulaci se Sphaerou.</span>
                  </div>
                  <div className="flex items-center gap-2 bg-muted/20 p-1.5 rounded">
                    <span>💀</span><strong>1× Exaktor</strong> <span className="text-muted-foreground">— Brutální hráč. Může fyzicky vyřadit soupeře.</span>
                  </div>
                </div>
              </section>

              <section>
                <h4 className="font-display font-bold text-sm text-primary mb-1">🎯 Bodování</h4>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-muted/20 p-2 rounded text-center">
                    <div className="text-lg font-bold">3</div>
                    <div className="text-[9px] text-muted-foreground">Gól (s přihrávkou)</div>
                  </div>
                  <div className="bg-muted/20 p-2 rounded text-center">
                    <div className="text-lg font-bold text-primary">5</div>
                    <div className="text-[9px] text-muted-foreground">Přímý průnik (sólo)</div>
                  </div>
                  <div className="bg-muted/20 p-2 rounded text-center">
                    <div className="text-lg font-bold text-red-400">+1</div>
                    <div className="text-[9px] text-muted-foreground">Vyřazení soupeře</div>
                  </div>
                </div>
              </section>

              <section>
                <h4 className="font-display font-bold text-sm text-primary mb-1">⚙️ Průběh zápasu</h4>
                <p className="text-muted-foreground">
                  Zápas probíhá ve <strong>3 třetinách</strong>, každá s 5–7 akcemi. V každé akci může dojít k útoku, brutálnímu střetu, 
                  vyřazení soupeře nebo skórování. Tým s více body na konci vítězí.
                </p>
              </section>

              <section>
                <h4 className="font-display font-bold text-sm text-primary mb-1">💀 Fyzický kontakt</h4>
                <p className="text-muted-foreground">
                  Sphaera je brutální sport. Při střetech může dojít ke sražení, lehkým i těžkým zraněním, dočasnému vyřazení
                  nebo vzácně trvalému poranění. Exaktor se specializuje na eliminaci protihráčů.
                </p>
              </section>

              <section>
                <h4 className="font-display font-bold text-sm text-primary mb-1">🎭 Publikum</h4>
                <p className="text-muted-foreground">
                  <strong>Crowd Meter</strong> sleduje náladu tribuny. Domácí dominance = bonus. Outsider vede = drama.
                  Stagnace = agresivní dav, který může házet předměty nebo vyvolat chaos.
                </p>
              </section>

              <section>
                <h4 className="font-display font-bold text-sm text-primary mb-1">🧠 Staty bojovníků</h4>
                <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                  {["Síla — fyzická zdatnost", "Rychlost — pohyb a reakce", "Technika — ovládání Sphaery", "Výdrž — odolnost a regenerace", "Brutalita — agresivita ve střetech", "Vůdcovství — taktický vliv"].map(s => (
                    <div key={s} className="bg-muted/10 p-1 rounded text-[10px]">{s}</div>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="font-display font-bold text-sm text-primary mb-1">🏆 Liga & Pohár</h4>
                <p className="text-muted-foreground">
                  Každé město s arénou = 1 tým. Liga běží sezónně, každý s každým 2×.
                  Výhra 3 body, remíza 1, prohra 0. Max 20 týmů v 1. lize, přebytek → 2. liga s postupem a sestupem.
                </p>
                <p className="text-muted-foreground mt-1">
                  <strong>Pohár:</strong> Po základní části prvních 8 týmů hraje vyřazovací pavouk.
                  Čtvrtfinále: 1. vs 8., 2. vs 7., 3. vs 6., 4. vs 5.
                  Vítěz finále získává titul Mistra Sphaery! 🏆
                </p>
              </section>

              <section>
                <h4 className="font-display font-bold text-sm text-primary mb-1">⭐ Dynamický vývoj</h4>
                <p className="text-muted-foreground">
                  Hráči stárnou, mladí rostou podle talentu, forma kolísá po zápasech, zranění omezují sestavu.
                  Nejlepší bojovníci se mohou stát legendami: „Ocelová zeď", „Kladivo severu", „Řezník arény".
                </p>
              </section>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeaguePanel;
