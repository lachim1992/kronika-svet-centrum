import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Shield, Users, Coins, TrendingUp, Trophy, Loader2, Plus, Star, Swords, Eye, MapPin, Crown, Target, GraduationCap, School } from "lucide-react";
import { toast } from "sonner";
import CreateAssociationDialog from "./CreateAssociationDialog";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
}

interface Association {
  id: string;
  name: string;
  association_type: string;
  player_name: string;
  city_id: string;
  budget: number;
  reputation: number;
  scouting_level: number;
  training_quality: number;
  youth_development: number;
  fan_base: number;
  founded_turn: number;
  status: string;
  motto: string | null;
  description: string | null;
  color_primary: string | null;
  color_secondary: string | null;
  intake_cycle_turns: number;
  last_intake_turn: number;
}

interface Academy {
  id: string;
  name: string;
  city_id: string;
  player_name: string;
  association_id: string | null;
  reputation: number;
  infrastructure: number;
  trainer_level: number;
  nutrition: number;
  total_graduates: number;
  total_champions: number;
  total_fatalities: number;
  fan_base: number;
  profile_athletics: number;
  profile_combat: number;
  profile_culture: number;
  profile_strategy: number;
  profile_brutality: number;
  is_gladiatorial: boolean;
  color_primary: string | null;
  color_secondary: string | null;
  founded_turn: number;
  status: string;
  motto: string | null;
  training_philosophy: string | null;
}

interface Student {
  id: string;
  academy_id: string;
  name: string;
  strength: number;
  endurance: number;
  agility: number;
  tactics: number;
  charisma: number;
  specialty: string;
  traits: string[] | null;
  status: string;
  graduation_turn: number | null;
  portrait_url: string | null;
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
  seasons_played: number;
  total_wins: number;
  total_draws: number;
  total_losses: number;
  total_goals_for: number;
  total_goals_against: number;
  league_tier: number;
}

interface Player {
  id: string;
  team_id: string;
  name: string;
  position: string;
  overall_rating: number;
  goals_scored: number;
  assists: number;
  matches_played: number;
  form: number;
  condition: number;
  injury_turns: number;
  is_dead?: boolean;
  is_captain: boolean;
}

const TYPE_ICONS: Record<string, string> = {
  sphaera: "⚔️",
  olympic: "🏟️",
  gladiator: "💀",
};

const TYPE_LABELS: Record<string, string> = {
  sphaera: "Svaz Sphaery",
  olympic: "Olympijský výbor",
  gladiator: "Gladiátorská gilda",
};

const POS_LABELS: Record<string, string> = {
  praetor: "Praetor", guardian: "Strážce", striker: "Útočník", carrier: "Nositel", exactor: "Exaktor",
  goalkeeper: "Praetor", defender: "Strážce", midfielder: "Nositel", attacker: "Útočník",
};

function ratingColor(r: number) {
  if (r >= 75) return "text-green-400";
  if (r >= 55) return "text-yellow-400";
  if (r >= 40) return "text-orange-400";
  return "text-red-400";
}

const AssociationsPanel = ({ sessionId, currentPlayerName, currentTurn }: Props) => {
  const [associations, setAssociations] = useState<Association[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [cities, setCities] = useState<Map<string, string>>(new Map());
  const [allAcademies, setAllAcademies] = useState<Academy[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [creatingAcademy, setCreatingAcademy] = useState<string | null>(null);
  const [showCreateTeamDialog, setShowCreateTeamDialog] = useState(false);
  const [createTeamCityId, setCreateTeamCityId] = useState("");
  const [createTeamName, setCreateTeamName] = useState("");
  const [createTeamMotto, setCreateTeamMotto] = useState("");
  const [createTeamColorPrimary, setCreateTeamColorPrimary] = useState("#8b0000");
  const [createTeamColorSecondary, setCreateTeamColorSecondary] = useState("#1a1a2e");
  const [creatingTeam, setCreatingTeam] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: assocs }, { data: teams }, { data: players }, { data: cityData }, { data: acads }, { data: studs }] = await Promise.all([
      supabase.from("sports_associations").select("*").eq("session_id", sessionId),
      supabase.from("league_teams").select("*").eq("session_id", sessionId).eq("is_active", true),
      supabase.from("league_players").select("*").eq("session_id", sessionId),
      supabase.from("cities").select("id,name").eq("session_id", sessionId),
      supabase.from("academies").select("*").eq("session_id", sessionId),
      supabase.from("academy_students").select("*").eq("session_id", sessionId),
    ]);
    setAssociations((assocs || []) as any);
    setAllTeams((teams || []) as any);
    setAllPlayers((players || []) as any);
    setAllAcademies((acads || []) as any);
    setAllStudents((studs || []) as any);
    const m = new Map<string, string>();
    (cityData || []).forEach((c: any) => m.set(c.id, c.name));
    setCities(m);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const myAssociations = associations.filter(a => a.player_name === currentPlayerName);
  const myTeams = allTeams.filter(t => t.player_name === currentPlayerName);
  const otherAssociations = associations.filter(a => a.player_name !== currentPlayerName);

  const getAssocAcademies = (assocId: string, assocType: string) => {
    const isGlad = assocType === "gladiator";
    return allAcademies.filter(a =>
      a.player_name === currentPlayerName && (
        (a as any).association_id === assocId ||
        (!(a as any).association_id && a.is_gladiatorial === isGlad)
      )
    );
  };

  const handleCreateAcademy = async (assocId: string, assocType: string) => {
    setCreatingAcademy(assocId);
    try {
      const playerCities = Array.from(cities.entries());
      if (playerCities.length === 0) {
        toast.error("Potřebuješ alespoň jedno město");
        return;
      }
      const isGlad = assocType === "gladiator";
      const existingCityIds = new Set(allAcademies.filter(a => a.player_name === currentPlayerName && a.is_gladiatorial === isGlad).map(a => a.city_id));
      const availableCity = playerCities.find(([id]) => !existingCityIds.has(id));
      if (!availableCity) {
        toast.error("Všechna města již mají akademii tohoto typu");
        return;
      }
      const [cityId, cityName] = availableCity;
      const academyName = isGlad
        ? `Gladiátorská škola – ${cityName}`
        : `Sportovní akademie – ${cityName}`;
      const { error } = await supabase.from("academies").insert({
        session_id: sessionId,
        city_id: cityId,
        player_name: currentPlayerName,
        name: academyName,
        founded_turn: currentTurn,
        status: "active",
        infrastructure: 10,
        reputation: 10,
        is_gladiatorial: isGlad,
        association_id: assocId,
      } as any);
      if (error) throw error;
      toast.success(`${academyName} založena!`);
      await fetchData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreatingAcademy(null);
    }
  };

  const handleUpgrade = async (assocId: string, field: string) => {
    setUpgrading(`${assocId}-${field}`);
    try {
      const assoc = associations.find(a => a.id === assocId);
      if (!assoc) return;
      const currentLevel = (assoc as any)[field] || 1;
      const cost = currentLevel * 15;
      if (assoc.budget < cost) {
        toast.error(`Nedostatek rozpočtu! Potřeba: ${cost} zlatých`);
        return;
      }
      const { error } = await supabase.from("sports_associations").update({
        [field]: currentLevel + 1,
        budget: assoc.budget - cost,
      }).eq("id", assocId);
      if (error) throw error;
      toast.success(`${field === "scouting_level" ? "Skauting" : field === "training_quality" ? "Trénink" : "Mládež"} zvýšen na úroveň ${currentLevel + 1}!`);
      await fetchData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUpgrading(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const MAX_TEAMS_PER_CITY = 3;
  const teamsPerCity = new Map<string, number>();
  myTeams.forEach(t => teamsPerCity.set(t.city_id, (teamsPerCity.get(t.city_id) || 0) + 1));
  const availableCitiesForTeam = Array.from(cities.entries()).filter(([id]) => (teamsPerCity.get(id) || 0) < MAX_TEAMS_PER_CITY);

  const handleCreateTeam = async () => {
    if (!createTeamCityId || !createTeamName.trim()) {
      toast.error("Vyplň název týmu a vyber město");
      return;
    }
    const assoc = myAssociations[0];
    if (!assoc) {
      toast.error("Pro založení týmu je potřeba svaz");
      return;
    }
    setCreatingTeam(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-league-team", {
        body: {
          sessionId,
          cityId: createTeamCityId,
          buildingId: null,
          teamName: createTeamName.trim(),
          colorPrimary: createTeamColorPrimary,
          colorSecondary: createTeamColorSecondary,
          motto: createTeamMotto.trim() || null,
          playerName: currentPlayerName,
          associationId: assoc.id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Tým ${createTeamName} založen!`);
      setShowCreateTeamDialog(false);
      setCreateTeamName("");
      setCreateTeamMotto("");
      await fetchData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreatingTeam(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h2 className="font-display font-bold text-lg">Sportovní svazy</h2>
          <Badge variant="outline" className="text-[9px]">{associations.length} svazů</Badge>
        </div>
        <Button size="sm" onClick={() => setShowCreateDialog(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Založit svaz
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-3">
        <TabsList className="grid w-full grid-cols-6 bg-muted/20">
          <TabsTrigger value="overview" className="text-xs font-display"><Shield className="h-3 w-3 mr-1" />Přehled</TabsTrigger>
          <TabsTrigger value="teams" className="text-xs font-display"><Users className="h-3 w-3 mr-1" />Týmy</TabsTrigger>
          <TabsTrigger value="odchovanci" className="text-xs font-display"><GraduationCap className="h-3 w-3 mr-1" />Odchovanci</TabsTrigger>
          <TabsTrigger value="scouting" className="text-xs font-display"><Eye className="h-3 w-3 mr-1" />Skauting</TabsTrigger>
          <TabsTrigger value="finance" className="text-xs font-display"><Coins className="h-3 w-3 mr-1" />Finance</TabsTrigger>
          <TabsTrigger value="leaderboard" className="text-xs font-display"><Trophy className="h-3 w-3 mr-1" />Žebříčky</TabsTrigger>
        </TabsList>

        {/* ═══ OVERVIEW ═══ */}
        <TabsContent value="overview" className="space-y-3">
          {myAssociations.length === 0 ? (
            <Card className="border-border bg-card/50">
              <CardContent className="p-8 text-center space-y-3">
                <Shield className="h-12 w-12 text-muted-foreground mx-auto opacity-50" />
                <p className="text-sm text-muted-foreground">Nemáš žádný sportovní svaz.</p>
                <p className="text-xs text-muted-foreground">Založ svaz a začni budovat sportovní impérium!</p>
                <Button size="sm" variant="outline" onClick={() => setShowCreateDialog(true)} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Založit svaz
                </Button>
              </CardContent>
            </Card>
          ) : (
            myAssociations.map(assoc => {
              const assocTeams = myTeams.filter(t => true);
              const assocAcademies = getAssocAcademies(assoc.id, assoc.association_type);
              const teamPlayerCounts = assocTeams.map(t => allPlayers.filter(p => p.team_id === t.id && !p.is_dead).length);
              const totalPlayers = teamPlayerCounts.reduce((a, b) => a + b, 0);
              return (
                <Card key={assoc.id} className="border-primary/20 bg-card/50">
                  <CardContent className="p-4 space-y-4">
                    {/* Header */}
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl border-4 shrink-0"
                        style={{ backgroundColor: assoc.color_primary || "hsl(var(--primary))", borderColor: assoc.color_secondary || "hsl(var(--border))" }}>
                        {TYPE_ICONS[assoc.association_type] || "🏅"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-display font-bold text-base">{assoc.name}</h3>
                        {assoc.motto && <p className="text-[10px] text-muted-foreground italic">„{assoc.motto}"</p>}
                        <div className="flex gap-1.5 mt-1 flex-wrap">
                          <Badge variant="outline" className="text-[9px]">{TYPE_LABELS[assoc.association_type]}</Badge>
                          <Badge variant="outline" className="text-[9px]">📍 {cities.get(assoc.city_id) || "?"}</Badge>
                          <Badge variant="outline" className="text-[9px]">Založeno: kolo {assoc.founded_turn}</Badge>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xl font-bold font-mono text-primary">{assoc.budget}</div>
                        <div className="text-[9px] text-muted-foreground">zlatých</div>
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: "Reputace", value: assoc.reputation, max: 100, icon: "⭐" },
                        { label: "Fanoušci", value: assoc.fan_base, max: 500, icon: "👥" },
                        { label: "Týmů", value: assocTeams.length, max: 10, icon: "⚔️" },
                        { label: "Hráčů", value: totalPlayers, max: 100, icon: "🏃" },
                      ].map(s => (
                        <div key={s.label} className="bg-muted/20 rounded-lg p-2 text-center">
                          <div className="text-[10px] text-muted-foreground">{s.icon} {s.label}</div>
                          <div className="text-lg font-bold font-mono">{s.value}</div>
                          <Progress value={Math.min(100, (s.value / s.max) * 100)} className="h-1 mt-1" />
                        </div>
                      ))}
                    </div>

                    {/* Upgradeable Skills */}
                    <div className="space-y-2">
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Dovednosti svazu</div>
                      {[
                        { key: "scouting_level", label: "Skauting", value: assoc.scouting_level, icon: "🔍", desc: "Lepší vyhledávání talentů" },
                        { key: "training_quality", label: "Kvalita tréninku", value: assoc.training_quality, icon: "💪", desc: "Rychlejší rozvoj hráčů" },
                        { key: "youth_development", label: "Mládež", value: assoc.youth_development, icon: "🌱", desc: "Více odchovanců akademie" },
                      ].map(skill => {
                        const cost = skill.value * 15;
                        const canAfford = assoc.budget >= cost;
                        return (
                          <div key={skill.key} className="flex items-center gap-3 bg-muted/10 rounded-lg p-2">
                            <span className="text-lg">{skill.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold">{skill.label}</span>
                                <Badge variant="secondary" className="text-[8px] h-4">Lv.{skill.value}</Badge>
                              </div>
                              <div className="text-[9px] text-muted-foreground">{skill.desc}</div>
                              <Progress value={(skill.value / 10) * 100} className="h-1 mt-1" />
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-[9px] h-7 gap-1"
                              disabled={!canAfford || upgrading === `${assoc.id}-${skill.key}`}
                              onClick={() => handleUpgrade(assoc.id, skill.key)}
                            >
                              {upgrading === `${assoc.id}-${skill.key}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <TrendingUp className="h-3 w-3" />}
                              {cost}💰
                            </Button>
                          </div>
                        );
                      })}
                    </div>

                    {/* ─── ACADEMIES UNDER THIS ASSOCIATION ─── */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <School className="h-3 w-3" /> Akademie svazu ({assocAcademies.length})
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[9px] h-6 gap-1"
                          disabled={creatingAcademy === assoc.id}
                          onClick={() => handleCreateAcademy(assoc.id, assoc.association_type)}
                        >
                          {creatingAcademy === assoc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                          Nová akademie
                        </Button>
                      </div>

                      {assocAcademies.length === 0 ? (
                        <div className="text-center py-4 bg-muted/10 rounded-lg border border-border/50">
                          <School className="h-8 w-8 text-muted-foreground mx-auto opacity-40 mb-1" />
                          <p className="text-[10px] text-muted-foreground">Žádné akademie. Založte první!</p>
                        </div>
                      ) : (
                        assocAcademies.map(acad => {
                          const acadStudents = allStudents.filter(s => s.academy_id === acad.id);
                          const graduates = acadStudents.filter(s => s.status === "graduated" || s.status === "promoted");
                          const training = acadStudents.filter(s => s.status === "training");
                          return (
                            <div key={acad.id} className="rounded-lg border border-border bg-card/30 p-3 space-y-2">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: acad.color_primary || "hsl(var(--primary))" }} />
                                <span className="text-xs font-display font-bold">{acad.name}</span>
                                <Badge variant="outline" className="text-[7px] ml-auto">Rep: {acad.reputation}</Badge>
                                {acad.total_champions > 0 && <Badge variant="outline" className="text-[7px] border-yellow-500/40 text-yellow-400">🏆 {acad.total_champions}</Badge>}
                              </div>

                              <div className="flex items-center gap-3 text-[9px] text-muted-foreground flex-wrap">
                                <span>📍 {cities.get(acad.city_id) || "?"}</span>
                                <span>📊 Infra: {acad.infrastructure}</span>
                                <span>🎓 Trenér: {acad.trainer_level}</span>
                                <span>🍖 Výživa: {acad.nutrition}</span>
                                <span>👥 Trénuje: {training.length}</span>
                                <span>🎓 Abs: {graduates.length}</span>
                                {acad.total_fatalities > 0 && <span className="text-destructive">💀 {acad.total_fatalities}</span>}
                              </div>

                              {/* Profile bars compact */}
                              <div className="grid grid-cols-5 gap-1">
                                {[
                                  { key: "athletics", label: "ATL", val: acad.profile_athletics },
                                  { key: "combat", label: "BOJ", val: acad.profile_combat },
                                  { key: "culture", label: "KUL", val: acad.profile_culture },
                                  { key: "strategy", label: "STR", val: acad.profile_strategy },
                                  { key: "brutality", label: "BRT", val: acad.profile_brutality },
                                ].map(p => (
                                  <div key={p.key} className="text-center">
                                    <div className="text-[7px] text-muted-foreground">{p.label}</div>
                                    <Progress value={p.val} className="h-1" />
                                    <div className="text-[7px] font-mono">{p.val}</div>
                                  </div>
                                ))}
                              </div>

                              {/* Graduates pool for recruitment */}
                              {graduates.length > 0 && (
                                <div className="space-y-1">
                                  <div className="text-[8px] font-semibold text-muted-foreground uppercase">Absolventi – rekrutační pool</div>
                                  <ScrollArea className="max-h-24">
                                    <div className="space-y-0.5">
                                      {graduates.map(s => (
                                        <div key={s.id} className="flex items-center gap-1.5 text-[9px] p-1 rounded bg-muted/20">
                                          {s.portrait_url && <img src={s.portrait_url} alt="" className="w-5 h-5 rounded-full object-cover" />}
                                          <span className="font-semibold truncate">{s.name}</span>
                                          <Badge variant="outline" className="text-[6px] h-3">{s.specialty}</Badge>
                                          <span className="ml-auto font-mono text-[8px] text-muted-foreground">
                                            S{s.strength} V{s.endurance} O{s.agility} T{s.tactics} C{s.charisma}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </ScrollArea>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}

          {/* Other players' associations */}
          {otherAssociations.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Svazy ostatních hráčů</div>
              {otherAssociations.map(assoc => (
                <Card key={assoc.id} className="border-border bg-card/30">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0"
                      style={{ backgroundColor: assoc.color_primary || "hsl(var(--muted))" }}>
                      {TYPE_ICONS[assoc.association_type] || "🏅"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold">{assoc.name}</div>
                      <div className="text-[9px] text-muted-foreground">{assoc.player_name} · {cities.get(assoc.city_id) || "?"}</div>
                    </div>
                    <Badge variant="outline" className="text-[9px]">Rep: {assoc.reputation}</Badge>
                    <Badge variant="outline" className="text-[9px]">{assoc.budget}💰</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ═══ TEAMS ═══ */}
        <TabsContent value="teams" className="space-y-3">
          {myAssociations.length > 0 && (
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Moje týmy ({myTeams.length})</h4>
              <Button size="sm" variant="outline" className="text-xs gap-1"
                onClick={() => setShowCreateTeamDialog(true)}
                disabled={availableCitiesForTeam.length === 0}>
                <Plus className="h-3 w-3" /> Sehnat tým
              </Button>
            </div>
          )}
          {myTeams.length === 0 ? (
            <Card className="border-border bg-card/50">
              <CardContent className="p-8 text-center space-y-3">
                <Users className="h-10 w-10 text-muted-foreground mx-auto opacity-50" />
                <p className="text-sm text-muted-foreground">Žádné týmy.</p>
                {myAssociations.length > 0 ? (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowCreateTeamDialog(true)}>
                    <Plus className="h-3.5 w-3.5" /> Založit první tým
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">Nejdřív založ svaz, pak můžeš založit tým.</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-2">
              {myTeams.map(team => {
                const teamPlayers = allPlayers.filter(p => p.team_id === team.id && !p.is_dead);
                const avgOvr = teamPlayers.length > 0 ? Math.round(teamPlayers.reduce((s, p) => s + p.overall_rating, 0) / teamPlayers.length) : 0;
                const injured = teamPlayers.filter(p => p.injury_turns > 0).length;
                return (
                  <Card key={team.id} className="border-border bg-card/50 hover:border-primary/30 transition-colors">
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 shrink-0"
                        style={{ backgroundColor: team.color_primary, borderColor: team.color_secondary, color: team.color_secondary }}>
                        ⚔️
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-display font-bold">{team.team_name}</span>
                          {(team.titles_won || 0) > 0 && <span className="text-yellow-400 text-[9px]">🏆{team.titles_won}</span>}
                        </div>
                        <div className="flex gap-1.5 mt-0.5 flex-wrap">
                          <Badge variant="outline" className="text-[8px]">📍 {cities.get(team.city_id) || "?"}</Badge>
                          <Badge variant="outline" className="text-[8px]">{team.league_tier}. liga</Badge>
                          <Badge variant="outline" className="text-[8px]">{teamPlayers.length} hráčů</Badge>
                          {injured > 0 && <Badge variant="destructive" className="text-[8px]">{injured} zraněných</Badge>}
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-1 text-center shrink-0">
                        {[
                          { l: "ÚT", v: team.attack_rating },
                          { l: "OB", v: team.defense_rating },
                          { l: "TK", v: team.tactics_rating },
                          { l: "Ø", v: avgOvr },
                        ].map(s => (
                          <div key={s.l}>
                            <div className={`text-xs font-bold font-mono ${ratingColor(s.v)}`}>{s.v}</div>
                            <div className="text-[7px] text-muted-foreground">{s.l}</div>
                          </div>
                        ))}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[9px] font-mono text-muted-foreground">{team.total_wins}V {team.total_draws}R {team.total_losses}P</div>
                        <div className="text-[9px] text-muted-foreground">Skóre: {team.total_goals_for}:{team.total_goals_against}</div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══ SCOUTING ═══ */}
        <TabsContent value="scouting" className="space-y-3">
          <Card className="border-border bg-card/50">
            <CardHeader className="py-2 px-3 border-b border-border/50">
              <CardTitle className="text-xs font-display flex items-center gap-1">
                <Eye className="h-3.5 w-3.5 text-primary" /> Rekrutace & Skauting
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {myAssociations.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Nejdřív založ svaz pro přístup ke skautingu.</p>
              ) : (
                <>
                  <div className="text-xs text-muted-foreground">
                    Úroveň skautingu tvého svazu určuje kvalitu talentů, které můžeš objevit.
                    Investuj do skautingu na záložce Přehled.
                  </div>
                  {/* Top available players from all teams */}
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-3">Nejlepší volní hráči (absolventi akademií)</div>
                  <ScrollArea className="h-[300px]">
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="border-b border-border bg-muted/30 text-muted-foreground sticky top-0">
                          <th className="px-2 py-1.5 text-left">Jméno</th>
                          <th className="px-1 py-1.5 text-center">Pozice</th>
                          <th className="px-1 py-1.5 text-center">OVR</th>
                          <th className="px-1 py-1.5 text-center">Forma</th>
                          <th className="px-1 py-1.5 text-center">Body</th>
                          <th className="px-1 py-1.5 text-center">Tým</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allPlayers
                          .filter(p => !p.is_dead)
                          .sort((a, b) => b.overall_rating - a.overall_rating)
                          .slice(0, 30)
                          .map(p => {
                            const team = allTeams.find(t => t.id === p.team_id);
                            return (
                              <tr key={p.id} className="border-b border-border/30 hover:bg-accent/5">
                                <td className="px-2 py-1.5 font-medium">{p.is_captain ? "👑 " : ""}{p.name}</td>
                                <td className="px-1 py-1.5 text-center">{POS_LABELS[p.position] || p.position}</td>
                                <td className={`px-1 py-1.5 text-center font-bold ${ratingColor(p.overall_rating)}`}>{p.overall_rating}</td>
                                <td className="px-1 py-1.5 text-center">{p.form}</td>
                                <td className="px-1 py-1.5 text-center font-mono">{p.goals_scored}⚔ {p.assists}🅰</td>
                                <td className="px-1 py-1.5 text-center text-muted-foreground">{team?.team_name || "?"}</td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </ScrollArea>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ FINANCE ═══ */}
        <TabsContent value="finance" className="space-y-3">
          {myAssociations.length === 0 ? (
            <Card className="border-border bg-card/50">
              <CardContent className="p-8 text-center">
                <Coins className="h-10 w-10 text-muted-foreground mx-auto opacity-50" />
                <p className="text-sm text-muted-foreground mt-2">Založ svaz pro přehled financí.</p>
              </CardContent>
            </Card>
          ) : (
            myAssociations.map(assoc => {
              const assocTeams = myTeams;
              const playerCount = assocTeams.reduce((s, t) => s + allPlayers.filter(p => p.team_id === t.id && !p.is_dead).length, 0);
              const estSalaries = playerCount * 2;
              const estUpkeep = assocTeams.length * 5;
              const estIncome = Math.round(assoc.fan_base * 0.1 + assoc.reputation * 0.5);
              return (
                <Card key={assoc.id} className="border-border bg-card/50">
                  <CardHeader className="py-2 px-3 border-b border-border/50">
                    <CardTitle className="text-xs font-display flex items-center gap-2">
                      <Coins className="h-3.5 w-3.5 text-primary" /> Finance — {assoc.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    {/* Budget */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
                      <span className="text-xs font-semibold">Aktuální rozpočet</span>
                      <span className="text-2xl font-bold font-mono text-primary">{assoc.budget} 💰</span>
                    </div>

                    {/* Breakdown */}
                    <div className="space-y-2">
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Odhad za kolo</div>
                      <div className="grid gap-1.5">
                        {[
                          { label: "Příjmy z fanoušků & reputace", value: `+${estIncome}`, positive: true },
                          { label: `Platy hráčů (${playerCount}×2)`, value: `-${estSalaries}`, positive: false },
                          { label: `Údržba týmů (${assocTeams.length}×5)`, value: `-${estUpkeep}`, positive: false },
                        ].map(row => (
                          <div key={row.label} className="flex items-center justify-between text-xs bg-muted/10 rounded p-2">
                            <span className="text-muted-foreground">{row.label}</span>
                            <span className={`font-mono font-bold ${row.positive ? "text-green-400" : "text-red-400"}`}>{row.value}</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between text-xs font-bold bg-muted/20 rounded p-2 border-t border-border">
                          <span>Bilance</span>
                          <span className={`font-mono ${estIncome - estSalaries - estUpkeep >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {estIncome - estSalaries - estUpkeep >= 0 ? "+" : ""}{estIncome - estSalaries - estUpkeep}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Investment tips */}
                    <div className="text-[10px] text-muted-foreground bg-muted/10 rounded p-2 space-y-1">
                      <p>💡 <strong>Tip:</strong> Zvyš fanouškovskou základnu pro vyšší příjmy.</p>
                      <p>💡 Vyšší reputace = víc sponzorů a prestiže.</p>
                      <p>💡 Financování sportu v říšské pokladně (Economy tab) dodává rozpočet svazu.</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* ═══ LEADERBOARD ═══ */}
        <TabsContent value="leaderboard" className="space-y-3">
          {/* Top Teams */}
          <Card className="border-border bg-card/50">
            <CardHeader className="py-2 px-3 border-b border-border/50">
              <CardTitle className="text-xs font-display flex items-center gap-1">
                <Trophy className="h-3.5 w-3.5 text-yellow-500" /> Nejlepší týmy (tituly)
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
                    <th className="p-2 text-center w-16">V/R/P</th>
                    <th className="p-2 text-center w-16">Skóre</th>
                  </tr>
                </thead>
                <tbody>
                  {[...allTeams].sort((a, b) => (b.titles_won || 0) - (a.titles_won || 0) || (b.total_wins || 0) - (a.total_wins || 0)).slice(0, 15).map((t, i) => (
                    <tr key={t.id} className={`border-b border-border/50 hover:bg-accent/5 ${t.player_name === currentPlayerName ? "bg-primary/5" : ""}`}>
                      <td className="p-2 text-muted-foreground">
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color_primary }} />
                          <span className="font-medium">{t.team_name}</span>
                        </div>
                      </td>
                      <td className="p-2 text-[9px] text-muted-foreground truncate max-w-[60px]">{t.player_name}</td>
                      <td className="p-2 text-center font-bold text-yellow-400">{t.titles_won || 0}</td>
                      <td className="p-2 text-center text-[9px] font-mono text-muted-foreground">{t.total_wins||0}/{t.total_draws||0}/{t.total_losses||0}</td>
                      <td className="p-2 text-center text-[9px] font-mono text-muted-foreground">{t.total_goals_for||0}:{t.total_goals_against||0}</td>
                    </tr>
                  ))}
                  {allTeams.length === 0 && (
                    <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Žádné týmy.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Top Players */}
          <Card className="border-border bg-card/50">
            <CardHeader className="py-2 px-3 border-b border-border/50">
              <CardTitle className="text-xs font-display flex items-center gap-1">
                <Star className="h-3.5 w-3.5 text-primary" /> Nejlepší hráči (body)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground bg-muted/10">
                    <th className="p-2 text-left w-8">#</th>
                    <th className="p-2 text-left">Hráč</th>
                    <th className="p-2 text-center">OVR</th>
                    <th className="p-2 text-center">⚔️</th>
                    <th className="p-2 text-center">🅰</th>
                    <th className="p-2 text-center">Zápasy</th>
                    <th className="p-2 text-left text-[9px]">Tým</th>
                  </tr>
                </thead>
                <tbody>
                  {[...allPlayers]
                    .filter(p => !p.is_dead)
                    .sort((a, b) => (b.goals_scored || 0) - (a.goals_scored || 0))
                    .slice(0, 15)
                    .map((p, i) => {
                      const team = allTeams.find(t => t.id === p.team_id);
                      return (
                        <tr key={p.id} className="border-b border-border/50 hover:bg-accent/5">
                          <td className="p-2 text-muted-foreground">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}</td>
                          <td className="p-2 font-medium">{p.is_captain ? "👑 " : ""}{p.name}</td>
                          <td className={`p-2 text-center font-bold ${ratingColor(p.overall_rating)}`}>{p.overall_rating}</td>
                          <td className="p-2 text-center font-bold">{p.goals_scored || 0}</td>
                          <td className="p-2 text-center">{p.assists || 0}</td>
                          <td className="p-2 text-center text-muted-foreground">{p.matches_played || 0}</td>
                          <td className="p-2 text-[9px] text-muted-foreground truncate max-w-[60px]">{team?.team_name || "?"}</td>
                        </tr>
                      );
                    })}
                  {allPlayers.length === 0 && (
                    <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Žádní hráči.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Associations Ranking */}
          <Card className="border-border bg-card/50">
            <CardHeader className="py-2 px-3 border-b border-border/50">
              <CardTitle className="text-xs font-display flex items-center gap-1">
                <Shield className="h-3.5 w-3.5 text-primary" /> Žebříček svazů
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground bg-muted/10">
                    <th className="p-2 text-left w-8">#</th>
                    <th className="p-2 text-left">Svaz</th>
                    <th className="p-2 text-left text-[9px]">Hráč</th>
                    <th className="p-2 text-center">Rep</th>
                    <th className="p-2 text-center">Fans</th>
                    <th className="p-2 text-center">Budget</th>
                  </tr>
                </thead>
                <tbody>
                  {[...associations].sort((a, b) => b.reputation - a.reputation).map((a, i) => (
                    <tr key={a.id} className={`border-b border-border/50 hover:bg-accent/5 ${a.player_name === currentPlayerName ? "bg-primary/5" : ""}`}>
                      <td className="p-2 text-muted-foreground">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-1.5">
                          <span>{TYPE_ICONS[a.association_type]}</span>
                          <span className="font-medium">{a.name}</span>
                        </div>
                      </td>
                      <td className="p-2 text-[9px] text-muted-foreground">{a.player_name}</td>
                      <td className="p-2 text-center font-bold">{a.reputation}</td>
                      <td className="p-2 text-center text-muted-foreground">{a.fan_base}</td>
                      <td className="p-2 text-center font-mono">{a.budget}💰</td>
                    </tr>
                  ))}
                  {associations.length === 0 && (
                    <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Žádné svazy.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <CreateAssociationDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        sessionId={sessionId}
        currentPlayerName={currentPlayerName}
        currentTurn={currentTurn}
        cities={cities}
        onCreated={fetchData}
      />

      {/* Create Team Dialog */}
      <Dialog open={showCreateTeamDialog} onOpenChange={setShowCreateTeamDialog}>
        <DialogContent className="max-w-md bg-card border-primary/20">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" /> Založit tým
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium mb-1 block">Město</label>
              <Select value={createTeamCityId} onValueChange={setCreateTeamCityId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Vyber město..." />
                </SelectTrigger>
                <SelectContent>
                  {availableCitiesForTeam.map(([id, name]) => (
                    <SelectItem key={id} value={id} className="text-xs">
                      {name} ({teamsPerCity.get(id) || 0}/{MAX_TEAMS_PER_CITY})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[9px] text-muted-foreground mt-1">Max {MAX_TEAMS_PER_CITY} týmy na město.</p>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Název týmu</label>
              <Input value={createTeamName} onChange={e => setCreateTeamName(e.target.value)} placeholder="Gladiátoři Romanova" className="h-9 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Motto (volitelné)</label>
              <Input value={createTeamMotto} onChange={e => setCreateTeamMotto(e.target.value)} placeholder="Sphaera si žádá krev!" className="h-9 text-xs" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium mb-1 block">Primární barva</label>
                <input type="color" value={createTeamColorPrimary} onChange={e => setCreateTeamColorPrimary(e.target.value)} className="w-full h-8 rounded border border-border cursor-pointer" />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium mb-1 block">Sekundární</label>
                <input type="color" value={createTeamColorSecondary} onChange={e => setCreateTeamColorSecondary(e.target.value)} className="w-full h-8 rounded border border-border cursor-pointer" />
              </div>
            </div>
            <p className="text-[9px] text-muted-foreground">AI automaticky vygeneruje 22 bojovníků s unikátními statistikami.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowCreateTeamDialog(false)}>Zrušit</Button>
            <Button size="sm" onClick={handleCreateTeam} disabled={creatingTeam || !createTeamCityId || !createTeamName.trim()}>
              {creatingTeam ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Swords className="h-3 w-3 mr-1" />}
              Založit tým
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AssociationsPanel;
