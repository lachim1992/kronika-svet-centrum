import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Trophy, Users, Shield, Swords, Target, TrendingUp, Award, Heart, Loader2, ChevronLeft, Building2, Flame, Zap, Eye, Plus, MapPin } from "lucide-react";
import { toast } from "sonner";

interface Team {
  id: string; city_id: string; player_name: string; team_name: string;
  motto: string | null; attack_rating: number; defense_rating: number;
  tactics_rating: number; discipline_rating: number; popularity: number;
  fan_base: number; titles_won: number; color_primary: string; color_secondary: string;
  seasons_played: number; total_wins: number; total_draws: number; total_losses: number;
  total_goals_for: number; total_goals_against: number; league_tier: number;
  training_focus?: string; tactical_preset?: string;
}

interface Player {
  id: string; team_id: string; name: string; position: string;
  strength: number; speed: number; technique: number; stamina: number;
  aggression: number; leadership: number; is_captain: boolean;
  goals_scored: number; assists: number; matches_played: number;
  overall_rating: number; form: number; condition: number;
  injury_turns: number; yellow_cards: number; is_dead?: boolean;
  injury_severity?: string;
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

interface Stadium {
  id: string; name: string; city_id: string;
}

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  myTeams: Team[];
  allPlayers: Player[];
  myAssociation: Association | null;
  standings: Standing[];
  cities: Map<string, string>;
  stadiums: Stadium[];
  onRefresh: () => void;
  onCreateAssociation: () => void;
  creatingAssoc: boolean;
}

const TRAINING_OPTIONS = [
  { value: "balanced", label: "Vyváženě", icon: "⚖️", desc: "Rovnoměrný rozvoj všech vlastností" },
  { value: "attack", label: "Útok", icon: "⚔️", desc: "+Útok, Rychlost. −Disciplína" },
  { value: "defense", label: "Obrana", icon: "🛡️", desc: "+Obrana, Výdrž. −Rychlost" },
  { value: "tactics", label: "Taktika", icon: "🧠", desc: "+Technika, Vůdcovství. −Brutalita" },
  { value: "discipline", label: "Disciplína", icon: "📏", desc: "+Disciplína, Výdrž. −Útok" },
];

const TACTICAL_OPTIONS = [
  { value: "balanced", label: "Vyváženě", icon: "⚖️", desc: "Standardní formace, žádné bonusy" },
  { value: "aggressive", label: "Agresivní", icon: "🔥", desc: "+Útok, +KO šance. −Obrana, +zranění" },
  { value: "defensive", label: "Defenzivní", icon: "🏰", desc: "+Obrana, méně bodů. Stabilní" },
  { value: "counter", label: "Protiútoky", icon: "⚡", desc: "+Průlomy (5b). Riskantní" },
];

const POS_ICONS: Record<string, string> = {
  praetor: "👑", guardian: "🛡️", striker: "⚔️", carrier: "🏉", exactor: "💀",
  goalkeeper: "👑", defender: "🛡️", midfielder: "🏉", attacker: "⚔️",
};

const POS_LABELS: Record<string, string> = {
  praetor: "Praetor", guardian: "Strážce", striker: "Útočník", carrier: "Nositel", exactor: "Exaktor",
  goalkeeper: "Praetor", defender: "Strážce", midfielder: "Nositel", attacker: "Útočník",
};

const FORM_COLORS: Record<string, string> = {
  W: "bg-green-500/80 text-green-50",
  D: "bg-yellow-500/80 text-yellow-50",
  L: "bg-red-500/80 text-red-50",
};

function ratingColor(r: number) {
  if (r >= 75) return "text-green-400";
  if (r >= 55) return "text-yellow-400";
  if (r >= 40) return "text-orange-400";
  return "text-red-400";
}

const MAX_TEAMS_PER_CITY = 3;

const MyTeamsPanel = ({
  sessionId, currentPlayerName, currentTurn, myTeams, allPlayers,
  myAssociation, standings, cities, stadiums, onRefresh, onCreateAssociation, creatingAssoc,
}: Props) => {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [savingTeam, setSavingTeam] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createCityId, setCreateCityId] = useState<string>("");
  const [createTeamName, setCreateTeamName] = useState("");
  const [createMotto, setCreateMotto] = useState("");
  const [createColorPrimary, setCreateColorPrimary] = useState("#8b0000");
  const [createColorSecondary, setCreateColorSecondary] = useState("#1a1a2e");
  const [creating, setCreating] = useState(false);

  const handleUpdateTeam = async (teamId: string, field: string, value: string) => {
    setSavingTeam(teamId);
    try {
      const { error } = await supabase.from("league_teams")
        .update({ [field]: value } as any)
        .eq("id", teamId);
      if (error) throw error;
      toast.success("Nastavení uloženo");
      onRefresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingTeam(null);
    }
  };

  const handleSetCaptain = async (teamId: string, playerId: string) => {
    try {
      await supabase.from("league_players").update({ is_captain: false } as any).eq("team_id", teamId);
      await supabase.from("league_players").update({ is_captain: true } as any).eq("id", playerId);
      toast.success("Kapitán jmenován!");
      onRefresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleUpgradeAssoc = async (field: string) => {
    if (!myAssociation) return;
    const cost = 20;
    if (myAssociation.budget < cost) { toast.error("Nedostatek rozpočtu"); return; }
    try {
      const { error } = await supabase.from("sports_associations").update({
        [field]: (myAssociation as any)[field] + 1,
        budget: myAssociation.budget - cost,
      } as any).eq("id", myAssociation.id);
      if (error) throw error;
      toast.success("Vylepšeno!");
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleCreateTeam = async () => {
    if (!createCityId || !createTeamName.trim()) {
      toast.error("Vyplň název týmu a vyber město");
      return;
    }
    if (!myAssociation) {
      toast.error("Pro založení týmu je potřeba svaz");
      return;
    }
    setCreating(true);
    try {
      // Stadium is optional — auto-assign if available
      const stadium = stadiums.find(s => s.city_id === createCityId);
      const { data, error } = await supabase.functions.invoke("create-league-team", {
        body: {
          sessionId, cityId: createCityId,
          buildingId: stadium?.id || null,
          teamName: createTeamName.trim(),
          colorPrimary: createColorPrimary,
          colorSecondary: createColorSecondary,
          motto: createMotto.trim() || null,
          playerName: currentPlayerName,
          associationId: myAssociation.id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Tým ${createTeamName} založen! 22 bojovníků připraveno.`);
      setShowCreateDialog(false);
      setCreateTeamName("");
      setCreateMotto("");
      onRefresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  // Count teams per city for cap display
  const teamsPerCity = new Map<string, number>();
  myTeams.forEach(t => teamsPerCity.set(t.city_id, (teamsPerCity.get(t.city_id) || 0) + 1));

  // Available cities for team creation (under cap)
  const availableCities = Array.from(cities.entries()).filter(([id]) => (teamsPerCity.get(id) || 0) < MAX_TEAMS_PER_CITY);

  if (myTeams.length === 0 && !myAssociation) {
    return (
      <Card className="border-border bg-card/50">
        <CardContent className="p-8 text-center space-y-3">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto opacity-50" />
          <h3 className="font-display font-bold text-lg">Žádné týmy ve tvé říši</h3>
          <p className="text-sm text-muted-foreground">Založ Svaz Sphaery a poté sežeň týmy ve svých městech.</p>
          <Button size="sm" variant="outline" onClick={onCreateAssociation} disabled={creatingAssoc}>
            {creatingAssoc ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Shield className="h-3 w-3 mr-1" />}
            Založit Svaz Sphaery
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Team detail view
  const selectedTeam = selectedTeamId ? myTeams.find(t => t.id === selectedTeamId) : null;
  if (selectedTeam) {
    const teamPlayers = allPlayers.filter(p => p.team_id === selectedTeam.id)
      .sort((a, b) => {
        const order = ["praetor", "goalkeeper", "guardian", "defender", "carrier", "midfielder", "striker", "attacker", "exactor"];
        return order.indexOf(a.position) - order.indexOf(b.position);
      });
    const alive = teamPlayers.filter(p => !p.is_dead);
    const injured = alive.filter(p => p.injury_turns > 0);
    const healthy = alive.filter(p => p.injury_turns <= 0);
    const avgOvr = alive.length > 0 ? Math.round(alive.reduce((s, p) => s + p.overall_rating, 0) / alive.length) : 0;
    const avgForm = alive.length > 0 ? Math.round(alive.reduce((s, p) => s + p.form, 0) / alive.length) : 0;
    const avgCond = alive.length > 0 ? Math.round(alive.reduce((s, p) => s + p.condition, 0) / alive.length) : 0;
    const standing = standings.find(s => s.team_id === selectedTeam.id);
    const cityName = cities.get(selectedTeam.city_id);

    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setSelectedTeamId(null)}>
          <ChevronLeft className="h-3 w-3" /> Zpět na přehled
        </Button>

        {/* Team header */}
        <Card className="border-primary/20 bg-card/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl border-4 border-primary/20 shrink-0"
              style={{ backgroundColor: selectedTeam.color_primary, color: selectedTeam.color_secondary }}>⚔️</div>
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-bold text-lg">{selectedTeam.team_name}</h3>
              <p className="text-[10px] text-muted-foreground italic">{selectedTeam.motto}</p>
              <div className="flex gap-1.5 mt-1 flex-wrap">
                <Badge variant="outline" className="text-[9px]">📍 {cityName}</Badge>
                <Badge variant="outline" className="text-[9px]">{selectedTeam.league_tier}. liga</Badge>
                {standing && <Badge variant="outline" className="text-[9px]">#{standing.position} · {standing.points}b</Badge>}
                {(selectedTeam.titles_won || 0) > 0 && <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30 text-[9px]">🏆 {selectedTeam.titles_won}×</Badge>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick stats */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Ø OVR", value: avgOvr, color: ratingColor(avgOvr) },
            { label: "Ø Forma", value: avgForm, color: avgForm >= 60 ? "text-green-400" : avgForm >= 40 ? "text-yellow-400" : "text-red-400" },
            { label: "Ø Kondice", value: `${avgCond}%`, color: avgCond >= 70 ? "text-green-400" : "text-yellow-400" },
            { label: "K dispozici", value: `${healthy.length}/${alive.length}`, color: healthy.length >= 11 ? "text-green-400" : "text-red-400" },
          ].map(s => (
            <Card key={s.label} className="border-border bg-card/50">
              <CardContent className="p-2 text-center">
                <div className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</div>
                <div className="text-[8px] text-muted-foreground uppercase">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="roster" className="space-y-2">
          <TabsList className="grid w-full grid-cols-3 bg-muted/20 h-8">
            <TabsTrigger value="roster" className="text-[10px]">Sestava</TabsTrigger>
            <TabsTrigger value="training" className="text-[10px]">Trénink</TabsTrigger>
            <TabsTrigger value="tactics" className="text-[10px]">Taktika</TabsTrigger>
          </TabsList>

          {/* Roster */}
          <TabsContent value="roster">
            <Card className="border-border bg-card/50 overflow-hidden">
              <ScrollArea className="h-[360px]">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-muted-foreground sticky top-0">
                      <th className="px-2 py-1.5 text-left">Bojovník</th>
                      <th className="px-1 py-1.5 text-center">Role</th>
                      <th className="px-1 py-1.5 text-center">OVR</th>
                      <th className="px-1 py-1.5 text-center">Forma</th>
                      <th className="px-1 py-1.5 text-center">Kond.</th>
                      <th className="px-1 py-1.5 text-center">Body</th>
                      <th className="px-1 py-1.5 text-center">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamPlayers.map(p => {
                      const isDead = p.is_dead;
                      const sevLabels: Record<string, string> = { light: "L", medium: "M", severe: "T", career_ending: "X" };
                      return (
                        <tr key={p.id} className={`border-b border-border/50 ${isDead ? "opacity-30 line-through" : p.injury_turns > 0 ? "bg-red-500/5" : ""}`}>
                          <td className="px-2 py-1.5 font-semibold">
                            {POS_ICONS[p.position] || "👤"}{" "}
                            {p.is_captain && <span className="text-yellow-400 mr-0.5">©</span>}
                            {p.name}
                            {isDead && <span className="ml-1">☠️</span>}
                            {!isDead && p.injury_turns > 0 && (
                              <span className="text-red-400 ml-1 text-[8px]">🏥{sevLabels[p.injury_severity || "light"]}({p.injury_turns})</span>
                            )}
                          </td>
                          <td className="px-1 py-1.5 text-center text-muted-foreground text-[8px]">{POS_LABELS[p.position]}</td>
                          <td className={`px-1 py-1.5 text-center font-bold font-mono ${ratingColor(p.overall_rating)}`}>{p.overall_rating}</td>
                          <td className="px-1 py-1.5 text-center">{isDead ? "—" : p.form}</td>
                          <td className="px-1 py-1.5 text-center">
                            {isDead ? "—" : (
                              <div className="w-8 h-1 bg-secondary rounded-full mx-auto overflow-hidden">
                                <div className={`h-full ${p.condition < 60 ? 'bg-destructive' : p.condition < 85 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${p.condition}%` }} />
                              </div>
                            )}
                          </td>
                          <td className="px-1 py-1.5 text-center font-bold">{p.goals_scored || 0}</td>
                          <td className="px-1 py-1.5 text-center">
                            {!isDead && !p.is_captain && (
                              <Button variant="ghost" size="sm" className="h-4 px-1 text-[8px]" onClick={() => handleSetCaptain(selectedTeam.id, p.id)}>
                                👑
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollArea>
            </Card>
          </TabsContent>

          {/* Training Focus */}
          <TabsContent value="training">
            <Card className="border-border bg-card/50">
              <CardHeader className="py-2 px-3 border-b border-border/50">
                <CardTitle className="text-xs font-display">Zaměření tréninku</CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                <p className="text-[10px] text-muted-foreground">Zvol, na co se tým soustředí mezi zápasy. Ovlivňuje vývoj hráčských statistik.</p>
                <div className="grid gap-2">
                  {TRAINING_OPTIONS.map(opt => (
                    <div key={opt.value}
                      className={`flex items-center gap-3 p-2.5 rounded border cursor-pointer transition-all ${
                        (selectedTeam.training_focus || "balanced") === opt.value
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/30"
                      }`}
                      onClick={() => handleUpdateTeam(selectedTeam.id, "training_focus", opt.value)}>
                      <span className="text-lg">{opt.icon}</span>
                      <div className="flex-1">
                        <div className="text-xs font-bold">{opt.label}</div>
                        <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
                      </div>
                      {(selectedTeam.training_focus || "balanced") === opt.value && (
                        <Badge className="bg-primary/20 text-primary border-primary/30 text-[8px]">Aktivní</Badge>
                      )}
                      {savingTeam === selectedTeam.id && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tactical Preset */}
          <TabsContent value="tactics">
            <Card className="border-border bg-card/50">
              <CardHeader className="py-2 px-3 border-b border-border/50">
                <CardTitle className="text-xs font-display">Taktický plán</CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                <p className="text-[10px] text-muted-foreground">Zvol taktický přístup pro nadcházející zápasy. Ovlivňuje průběh simulace.</p>
                <div className="grid gap-2">
                  {TACTICAL_OPTIONS.map(opt => (
                    <div key={opt.value}
                      className={`flex items-center gap-3 p-2.5 rounded border cursor-pointer transition-all ${
                        (selectedTeam.tactical_preset || "balanced") === opt.value
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/30"
                      }`}
                      onClick={() => handleUpdateTeam(selectedTeam.id, "tactical_preset", opt.value)}>
                      <span className="text-lg">{opt.icon}</span>
                      <div className="flex-1">
                        <div className="text-xs font-bold">{opt.label}</div>
                        <div className="text-[10px] text-muted-foreground">{opt.desc}</div>
                      </div>
                      {(selectedTeam.tactical_preset || "balanced") === opt.value && (
                        <Badge className="bg-primary/20 text-primary border-primary/30 text-[8px]">Aktivní</Badge>
                      )}
                    </div>
                  ))}
                </div>

                {/* Team ratings display */}
                <div className="grid grid-cols-4 gap-2 pt-3 border-t border-border/30">
                  {[
                    { label: "Útok", value: selectedTeam.attack_rating, icon: "⚔️" },
                    { label: "Obrana", value: selectedTeam.defense_rating, icon: "🛡️" },
                    { label: "Taktika", value: selectedTeam.tactics_rating, icon: "🧠" },
                    { label: "Disciplína", value: selectedTeam.discipline_rating, icon: "📏" },
                  ].map(s => (
                    <div key={s.label} className="text-center bg-muted/20 p-2 rounded">
                      <div className="text-xs">{s.icon}</div>
                      <div className={`text-sm font-bold font-mono ${ratingColor(s.value)}`}>{s.value}</div>
                      <div className="text-[7px] text-muted-foreground uppercase">{s.label}</div>
                    </div>
                  ))}
                </div>
                <p className="text-[9px] text-muted-foreground italic">Ratingy se automaticky přepočítávají z průměrných statistik hráčů podle pozic.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // ═══ OVERVIEW DASHBOARD ═══
  return (
    <div className="space-y-4">
      {/* Association */}
      {myAssociation ? (
        <Card className="border-primary/20 bg-card/50">
          <CardHeader className="py-2 px-3 border-b border-border/50">
            <CardTitle className="text-xs font-display flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Award className="h-4 w-4 text-primary" />
                {myAssociation.name}
              </span>
              <Badge variant="outline" className="text-[9px]">Prestiž: {myAssociation.reputation}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {([
                ["scouting_level", "Skauting", "🔍"],
                ["youth_development", "Mládež", "🌱"],
                ["training_quality", "Trénink", "💪"],
                ["budget", "Budget", "💰"],
              ] as const).map(([k, label, icon]) => (
                <div key={k} className="bg-muted/20 rounded p-2 text-center">
                  <div className="text-xs">{icon}</div>
                  <div className="text-sm font-bold">{(myAssociation as any)[k]}</div>
                  <div className="text-[7px] text-muted-foreground uppercase">{label}</div>
                  {k !== "budget" && (
                    <Button variant="ghost" size="sm" className="h-4 px-1 text-[8px] mt-1"
                      onClick={() => handleUpgradeAssoc(k)}
                      disabled={myAssociation.budget < 20}>
                      ↑ 20💰
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span><Users className="h-3 w-3 inline mr-0.5" />{myAssociation.fan_base} fans</span>
              <span>{myTeams.length} týmů</span>
              <span>{myTeams.reduce((s, t) => s + (t.titles_won || 0), 0)} titulů celkem</span>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed border-border bg-card/30">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-2">Nemáš Svaz Sphaery. Založením získáš bonusy pro své týmy.</p>
            <Button size="sm" variant="outline" onClick={onCreateAssociation} disabled={creatingAssoc}>
              {creatingAssoc ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Shield className="h-3 w-3 mr-1" />}
              Založit Svaz
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create Team Button */}
      {myAssociation && (
        <div className="flex items-center justify-between">
          <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">Moje týmy ({myTeams.length})</h4>
          <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => setShowCreateDialog(true)}
            disabled={availableCities.length === 0}>
            <Plus className="h-3 w-3" /> Sehnat tým
          </Button>
        </div>
      )}
      {!myAssociation && myTeams.length > 0 && (
        <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">Moje týmy ({myTeams.length})</h4>
      )}

      {/* My Teams Grid */}
      <div className="grid gap-3">
        {myTeams.map(t => {
          const teamPlayers = allPlayers.filter(p => p.team_id === t.id);
          const alive = teamPlayers.filter(p => !p.is_dead);
          const injured = alive.filter(p => p.injury_turns > 0);
          const avgOvr = alive.length > 0 ? Math.round(alive.reduce((s, p) => s + p.overall_rating, 0) / alive.length) : 0;
          const avgForm = alive.length > 0 ? Math.round(alive.reduce((s, p) => s + p.form, 0) / alive.length) : 0;
          const standing = standings.find(s => s.team_id === t.id);
          const cityName = cities.get(t.city_id);
          const totalGames = (t.total_wins || 0) + (t.total_draws || 0) + (t.total_losses || 0);
          const winRate = totalGames > 0 ? Math.round(((t.total_wins || 0) / totalGames) * 100) : 0;

          return (
            <Card key={t.id} className="border-border bg-card/50 cursor-pointer hover:border-primary/40 transition-all"
              onClick={() => setSelectedTeamId(t.id)}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border-2 border-primary/20"
                    style={{ backgroundColor: t.color_primary, color: t.color_secondary }}>⚔️</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-bold text-sm">{t.team_name}</span>
                      {(t.titles_won || 0) > 0 && <span className="text-yellow-400 text-[9px]">🏆{t.titles_won}</span>}
                    </div>
                    <div className="text-[9px] text-muted-foreground">{cityName} · {t.league_tier}. liga</div>
                  </div>
                  {standing && (
                    <div className="text-right">
                      <div className="text-lg font-bold font-mono">#{standing.position}</div>
                      <div className="text-[8px] text-muted-foreground">{standing.points}b</div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-5 gap-1.5 text-center">
                  <div className="bg-muted/20 rounded p-1">
                    <div className={`text-xs font-bold font-mono ${ratingColor(avgOvr)}`}>{avgOvr}</div>
                    <div className="text-[7px] text-muted-foreground">OVR</div>
                  </div>
                  <div className="bg-muted/20 rounded p-1">
                    <div className="text-xs font-bold font-mono">{avgForm}</div>
                    <div className="text-[7px] text-muted-foreground">Forma</div>
                  </div>
                  <div className="bg-muted/20 rounded p-1">
                    <div className="text-xs font-bold font-mono">{winRate}%</div>
                    <div className="text-[7px] text-muted-foreground">Win</div>
                  </div>
                  <div className="bg-muted/20 rounded p-1">
                    <div className={`text-xs font-bold font-mono ${injured.length > 0 ? "text-red-400" : "text-green-400"}`}>{alive.length - injured.length}/{alive.length}</div>
                    <div className="text-[7px] text-muted-foreground">Zdraví</div>
                  </div>
                  <div className="bg-muted/20 rounded p-1">
                    <div className="text-xs font-bold font-mono">{teamPlayers.filter(p => p.is_dead).length}</div>
                    <div className="text-[7px] text-muted-foreground">☠️</div>
                  </div>
                </div>

                {standing && (
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-muted-foreground">
                      {standing.wins}V {standing.draws}R {standing.losses}P · {standing.goals_for}:{standing.goals_against}
                    </span>
                    <div className="flex gap-0.5 ml-auto">
                      {(standing.form || "").split("").map((f, fi) => (
                        <span key={fi} className={`w-3 h-3 rounded-[2px] text-[6px] flex items-center justify-center font-bold ${FORM_COLORS[f] || "bg-muted"}`}>
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 text-[8px] text-muted-foreground pt-1 border-t border-border/30">
                  <span>🏋️ {TRAINING_OPTIONS.find(o => o.value === (t.training_focus || "balanced"))?.label || "Vyváženě"}</span>
                  <span>⚙️ {TACTICAL_OPTIONS.find(o => o.value === (t.tactical_preset || "balanced"))?.label || "Vyváženě"}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Cities overview: teams per city */}
      {myAssociation && (
        <Card className="border-border bg-card/50">
          <CardHeader className="py-2 px-3 border-b border-border/50">
            <CardTitle className="text-xs font-display flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> Týmy v městech
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-1">
            {Array.from(cities.entries()).map(([cityId, cityName]) => {
              const count = teamsPerCity.get(cityId) || 0;
              const cityTeams = myTeams.filter(t => t.city_id === cityId);
              return (
                <div key={cityId} className="flex items-center justify-between text-xs bg-muted/10 p-2 rounded">
                  <span className="font-medium">{cityName}</span>
                  <div className="flex items-center gap-2">
                    {cityTeams.map(t => (
                      <Badge key={t.id} variant="outline" className="text-[8px] cursor-pointer" onClick={() => setSelectedTeamId(t.id)}>
                        <div className="w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: t.color_primary }} />
                        {t.team_name}
                      </Badge>
                    ))}
                    <span className={`text-[9px] ${count >= MAX_TEAMS_PER_CITY ? "text-red-400" : "text-muted-foreground"}`}>
                      {count}/{MAX_TEAMS_PER_CITY}
                    </span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Create Team Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md bg-card border-primary/20">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" /> Sehnat tým pro Sphaeru
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium mb-1 block">Město</label>
              <Select value={createCityId} onValueChange={setCreateCityId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Vyber město..." />
                </SelectTrigger>
                <SelectContent>
                  {availableCities.map(([id, name]) => (
                    <SelectItem key={id} value={id} className="text-xs">
                      {name} ({teamsPerCity.get(id) || 0}/{MAX_TEAMS_PER_CITY})
                      {stadiums.find(s => s.city_id === id) ? " 🏟️" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[9px] text-muted-foreground mt-1">Max {MAX_TEAMS_PER_CITY} týmy na město. 🏟️ = stadion k dispozici.</p>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Název týmu</label>
              <Input value={createTeamName} onChange={e => setCreateTeamName(e.target.value)} placeholder="Gladiátoři Romanova" className="h-9 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Motto (volitelné)</label>
              <Input value={createMotto} onChange={e => setCreateMotto(e.target.value)} placeholder="Sphaera si žádá krev!" className="h-9 text-xs" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium mb-1 block">Primární barva</label>
                <input type="color" value={createColorPrimary} onChange={e => setCreateColorPrimary(e.target.value)} className="w-full h-8 rounded border border-border cursor-pointer" />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium mb-1 block">Sekundární</label>
                <input type="color" value={createColorSecondary} onChange={e => setCreateColorSecondary(e.target.value)} className="w-full h-8 rounded border border-border cursor-pointer" />
              </div>
            </div>
            <p className="text-[9px] text-muted-foreground">AI automaticky vygeneruje 22 bojovníků s unikátními statistikami založenými na úrovni a stabilitě města.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowCreateDialog(false)}>Zrušit</Button>
            <Button size="sm" onClick={handleCreateTeam} disabled={creating || !createCityId || !createTeamName.trim()}>
              {creating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Swords className="h-3 w-3 mr-1" />}
              Založit tým (22 hráčů)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MyTeamsPanel;
