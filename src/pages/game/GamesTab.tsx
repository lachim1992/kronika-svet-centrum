import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Trophy, Sword, BookOpen, Theater, Target, Flame, Star, Crown, AlertTriangle, Coins, School, Skull, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import AcademyPanel from "@/components/AcademyPanel";
import SchoolRankings from "@/components/SchoolRankings";
import LiveGamesFeed from "@/components/LiveGamesFeed";
import GladiatorPanel from "@/components/GladiatorPanel";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  myRole: string;
  cities: any[];
  onRefetch: () => void;
}

interface Festival {
  id: string;
  festival_type: string;
  name: string;
  host_city_id: string;
  host_player: string;
  status: string;
  announced_turn: number;
  finals_turn: number | null;
  concluded_turn: number | null;
  is_global: boolean;
  prestige_pool: number;
  total_investment_gold: number;
}

interface Participant {
  id: string;
  festival_id: string;
  athlete_name: string;
  player_name: string;
  strength: number;
  endurance: number;
  agility: number;
  tactics: number;
  charisma: number;
  traits: string[];
  form: string;
  total_medals: number;
  is_legend: boolean;
  city_id: string;
}

interface Result {
  id: string;
  festival_id: string;
  discipline_id: string;
  participant_id: string;
  total_score: number;
  rank: number;
  medal: string | null;
}

interface Discipline {
  id: string;
  key: string;
  name: string;
  category: string;
  icon_emoji: string;
  prestige_weight: number;
}

interface Incident {
  id: string;
  festival_id: string;
  incident_type: string;
  severity: string;
  description: string;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  physical: <Sword className="h-3.5 w-3.5" />,
  intellectual: <BookOpen className="h-3.5 w-3.5" />,
  cultural: <Theater className="h-3.5 w-3.5" />,
  strategic: <Target className="h-3.5 w-3.5" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  physical: "bg-red-500/15 text-red-400 border-red-500/30",
  intellectual: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  cultural: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  strategic: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

const FESTIVAL_TYPE_LABELS: Record<string, string> = {
  olympic: "Olympijské hry",
  local_gladiator: "Gladiátorské hry",
  local_harvest: "Slavnosti sklizně",
  local_tournament: "Rytířský turnaj",
  local_academic: "Akademická soutěž",
  local_religious: "Náboženský festival",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  announced: { label: "Vyhlášeno", color: "bg-blue-500/15 text-blue-400" },
  nomination: { label: "Nominace", color: "bg-yellow-500/15 text-yellow-400" },
  qualifying: { label: "Kvalifikace", color: "bg-orange-500/15 text-orange-400" },
  finals: { label: "Finále", color: "bg-red-500/15 text-red-400" },
  concluded: { label: "Ukončeno", color: "bg-green-500/15 text-green-400" },
  cancelled: { label: "Zrušeno", color: "bg-muted text-muted-foreground" },
};

const GamesTab = ({ sessionId, currentPlayerName, currentTurn, myRole, cities, onRefetch }: Props) => {
  const [festivals, setFestivals] = useState<Festival[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [announcing, setAnnouncing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [festivalType, setFestivalType] = useState("local_gladiator");
  const [selectedCityId, setSelectedCityId] = useState("");
  const [selectedFestival, setSelectedFestival] = useState<string | null>(null);

  const isAdmin = myRole === "admin";
  const myCities = cities.filter(c => c.owner_player === currentPlayerName);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: f }, { data: d }] = await Promise.all([
      supabase.from("games_festivals").select("*").eq("session_id", sessionId).order("announced_turn", { ascending: false }),
      supabase.from("games_disciplines").select("*"),
    ]);
    setFestivals((f || []) as any);
    setDisciplines((d || []) as any);

    // Load participants and results for all festivals
    if (f && f.length > 0) {
      const festIds = f.map(ff => ff.id);
      const [{ data: p }, { data: r }, { data: inc }] = await Promise.all([
        supabase.from("games_participants").select("*").in("festival_id", festIds),
        supabase.from("games_results").select("*").in("festival_id", festIds),
        supabase.from("games_incidents").select("*").in("festival_id", festIds),
      ]);
      setParticipants((p || []) as any);
      setResults((r || []) as any);
      setIncidents((inc || []) as any);
    }
    setLoading(false);
  }, [sessionId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAnnounceOlympics = async () => {
    setAnnouncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("games-announce", {
        body: { session_id: sessionId, player_name: currentPlayerName, type: "olympic", turn_number: currentTurn },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success(`🏟️ ${data.festival?.name || "Velké hry"} byly vyhlášeny!`);
      await fetchData();
      onRefetch();
    } catch (e: any) {
      toast.error(e.message || "Chyba při vyhlášení her");
    } finally {
      setAnnouncing(false);
    }
  };

  const handleLocalFestival = async () => {
    if (!selectedCityId) { toast.error("Vyber město"); return; }
    setAnnouncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("games-announce", {
        body: { session_id: sessionId, player_name: currentPlayerName, type: festivalType, city_id: selectedCityId, turn_number: currentTurn },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success(`🎭 ${data.festival?.name || "Festival"} uspořádán!`);
      await fetchData();
      onRefetch();
    } catch (e: any) {
      toast.error(e.message || "Chyba");
    } finally {
      setAnnouncing(false);
    }
  };

  const handleResolve = async (festivalId: string) => {
    setResolving(true);
    try {
      const { data, error } = await supabase.functions.invoke("games-resolve", {
        body: { session_id: sessionId, festival_id: festivalId, turn_number: currentTurn },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success(`🏅 Hry vyhodnoceny! ${data.legends?.length || 0} legend vzniklo.`);
      await fetchData();
      onRefetch();
    } catch (e: any) {
      toast.error(e.message || "Chyba");
    } finally {
      setResolving(false);
    }
  };

  const activeFestival = festivals.find(f => f.status !== "concluded" && f.status !== "cancelled");
  const concludedFestivals = festivals.filter(f => f.status === "concluded");

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="h-5 w-5 text-primary" />
        <h2 className="font-display font-bold text-lg">Hry & Festivaly</h2>
        <Badge variant="outline" className="text-[9px] ml-auto">{festivals.length} her celkem</Badge>
      </div>

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6">
          <TabsTrigger value="active" className="font-display text-xs">
            <Flame className="h-3.5 w-3.5 mr-1" />Aktivní
          </TabsTrigger>
          <TabsTrigger value="academy" className="font-display text-xs">
            <School className="h-3.5 w-3.5 mr-1" />Akademie
          </TabsTrigger>
          <TabsTrigger value="rankings" className="font-display text-xs">
            <TrendingUp className="h-3.5 w-3.5 mr-1" />Žebříček
          </TabsTrigger>
          <TabsTrigger value="gladiators" className="font-display text-xs">
            <Skull className="h-3.5 w-3.5 mr-1" />Aréna
          </TabsTrigger>
          <TabsTrigger value="create" className="font-display text-xs">
            <Star className="h-3.5 w-3.5 mr-1" />Vyhlásit
          </TabsTrigger>
          <TabsTrigger value="history" className="font-display text-xs">
            <BookOpen className="h-3.5 w-3.5 mr-1" />Archiv
          </TabsTrigger>
        </TabsList>

        {/* ─── ACTIVE GAMES ─── */}
        <TabsContent value="active" className="space-y-4">
          {activeFestival ? (
            <FestivalDetail
              festival={activeFestival}
              participants={participants.filter(p => p.festival_id === activeFestival.id)}
              results={results.filter(r => r.festival_id === activeFestival.id)}
              disciplines={disciplines}
              incidents={incidents.filter(i => i.festival_id === activeFestival.id)}
              currentPlayerName={currentPlayerName}
              isAdmin={isAdmin}
              resolving={resolving}
              onResolve={() => handleResolve(activeFestival.id)}
              currentTurn={currentTurn}
            />
          ) : (
            <Card className="border-border bg-card/50">
              <CardContent className="p-8 text-center">
                <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-sm text-muted-foreground">Žádné aktivní hry.</p>
                <p className="text-xs text-muted-foreground mt-1">Vyhlaste Olympijské hry nebo uspořádejte lokální festival.</p>
              </CardContent>
            </Card>
          )}
          {/* Live Feed for active festival */}
          {activeFestival && (
            <LiveGamesFeed sessionId={sessionId} festivalId={activeFestival.id} />
          )}
        </TabsContent>

        {/* ─── ACADEMY ─── */}
        <TabsContent value="academy">
          <AcademyPanel sessionId={sessionId} currentPlayerName={currentPlayerName} currentTurn={currentTurn} />
        </TabsContent>

        {/* ─── RANKINGS ─── */}
        <TabsContent value="rankings">
          <SchoolRankings sessionId={sessionId} currentPlayerName={currentPlayerName} />
        </TabsContent>

        {/* ─── GLADIATORS ─── */}
        <TabsContent value="gladiators">
          <GladiatorPanel sessionId={sessionId} currentPlayerName={currentPlayerName} />
        </TabsContent>

        {/* ─── CREATE GAMES ─── */}
        <TabsContent value="create" className="space-y-4">
          {/* Olympic Games */}
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-sm flex items-center gap-2">
                <Crown className="h-4 w-4 text-primary" />
                Velké olympijské hry
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Globální událost jednou za 20 kol. Hostitelské město je vybráno automaticky podle kulturního vlivu.
                Všechny říše nominují sportovce do 10 disciplín.
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-[9px]">8+ disciplín</Badge>
                <Badge variant="outline" className="text-[9px]">Automatičtí sportovci</Badge>
                <Badge variant="outline" className="text-[9px]">Intriky povoleny</Badge>
              </div>
              <Button
                onClick={handleAnnounceOlympics}
                disabled={announcing || !!activeFestival}
                className="w-full font-display gap-2"
                variant={activeFestival ? "outline" : "default"}
              >
                {announcing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
                {activeFestival ? "Hry již probíhají" : "Vyhlásit Olympijské hry"}
              </Button>
            </CardContent>
          </Card>

          {/* Local Festival */}
          <Card className="border-border bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-sm flex items-center gap-2">
                <Theater className="h-4 w-4 text-accent-foreground" />
                Lokální festival
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Uspořádejte festival ve vašem městě. Zvyšuje stabilitu a morálku za cenu zlata.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <Select value={festivalType} onValueChange={setFestivalType}>
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local_gladiator">⚔️ Gladiátorské hry</SelectItem>
                    <SelectItem value="local_harvest">🌾 Slavnosti sklizně</SelectItem>
                    <SelectItem value="local_tournament">🏇 Rytířský turnaj</SelectItem>
                    <SelectItem value="local_academic">📚 Akademická soutěž</SelectItem>
                    <SelectItem value="local_religious">⛪ Náboženský festival</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={selectedCityId} onValueChange={setSelectedCityId}>
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue placeholder="Město..." />
                  </SelectTrigger>
                  <SelectContent>
                    {myCities.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Coins className="h-3 w-3" />
                Cena: 10-30 zlata | Stabilita: +3 až +15 | Morálka: +5 až +15
              </div>

              <Button
                onClick={handleLocalFestival}
                disabled={announcing || !selectedCityId}
                variant="outline"
                className="w-full font-display gap-2 text-xs"
              >
                {announcing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
                Uspořádat festival
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── HISTORY ─── */}
        <TabsContent value="history" className="space-y-3">
          {concludedFestivals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center p-8">Žádné ukončené hry v historii.</p>
          ) : (
            concludedFestivals.map(f => (
              <Card key={f.id} className="border-border bg-card/50 cursor-pointer hover:bg-card/70 transition-colors"
                onClick={() => setSelectedFestival(selectedFestival === f.id ? null : f.id)}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {f.is_global ? <Trophy className="h-4 w-4 text-primary" /> : <Theater className="h-4 w-4 text-muted-foreground" />}
                      <span className="font-display text-sm font-semibold">{f.name}</span>
                    </div>
                    <Badge className={STATUS_LABELS[f.status]?.color || ""} variant="outline">
                      {STATUS_LABELS[f.status]?.label || f.status}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Rok {f.announced_turn}{f.concluded_turn ? ` – ${f.concluded_turn}` : ""} | Hostitel: {f.host_player}
                  </p>

                  {selectedFestival === f.id && (
                    <div className="mt-3 space-y-2">
                      <MedalTable
                        participants={participants.filter(p => p.festival_id === f.id)}
                        results={results.filter(r => r.festival_id === f.id)}
                        disciplines={disciplines}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

/* ─── Festival Detail Component ─── */
function FestivalDetail({
  festival, participants, results, disciplines, incidents,
  currentPlayerName, isAdmin, resolving, onResolve, currentTurn,
}: {
  festival: Festival;
  participants: Participant[];
  results: Result[];
  disciplines: Discipline[];
  incidents: Incident[];
  currentPlayerName: string;
  isAdmin: boolean;
  resolving: boolean;
  onResolve: () => void;
  currentTurn: number;
}) {
  const canResolve = (isAdmin || festival.host_player === currentPlayerName) &&
    festival.status !== "concluded" && participants.length >= 2;
  const isResolved = results.length > 0;

  return (
    <Card className="border-primary/30 bg-card/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            {festival.name}
          </CardTitle>
          <Badge className={STATUS_LABELS[festival.status]?.color || ""} variant="outline">
            {STATUS_LABELS[festival.status]?.label || festival.status}
          </Badge>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Hostitel: {festival.host_player} | Vyhlášeno: Rok {festival.announced_turn}
          {festival.finals_turn && ` | Finále: Rok ${festival.finals_turn}`}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Participants */}
        <div>
          <p className="text-xs font-display font-semibold mb-2">Sportovci ({participants.length})</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {participants.map(p => (
              <div key={p.id} className="p-2 rounded border border-border bg-card flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="font-display text-xs font-semibold truncate">{p.athlete_name}</span>
                    {p.is_legend && <Star className="h-3 w-3 text-yellow-400" />}
                  </div>
                  <p className="text-[9px] text-muted-foreground truncate">{p.player_name}</p>
                </div>
                <div className="flex gap-0.5">
                  <StatPill label="S" value={p.strength} />
                  <StatPill label="V" value={p.endurance} />
                  <StatPill label="O" value={p.agility} />
                  <StatPill label="T" value={p.tactics} />
                  <StatPill label="C" value={p.charisma} />
                </div>
                {p.total_medals > 0 && (
                  <Badge variant="outline" className="text-[8px] bg-yellow-500/10 text-yellow-400">
                    🏅{p.total_medals}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Results */}
        {isResolved && (
          <MedalTable participants={participants} results={results} disciplines={disciplines} />
        )}

        {/* Incidents */}
        {incidents.length > 0 && (
          <div>
            <p className="text-xs font-display font-semibold mb-1 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-orange-400" /> Incidenty
            </p>
            {incidents.map(inc => (
              <div key={inc.id} className="p-2 rounded border border-orange-500/20 bg-orange-500/5 text-xs mb-1">
                <Badge variant="outline" className="text-[8px] mr-1">{inc.severity}</Badge>
                {inc.description}
              </div>
            ))}
          </div>
        )}

        {/* Resolve button */}
        {canResolve && !isResolved && (
          <Button onClick={onResolve} disabled={resolving} className="w-full font-display gap-2">
            {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
            Vyhodnotit hry
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Medal Table ─── */
function MedalTable({ participants, results, disciplines }: {
  participants: Participant[];
  results: Result[];
  disciplines: Discipline[];
}) {
  const discMap = new Map(disciplines.map(d => [d.id, d]));
  const partMap = new Map(participants.map(p => [p.id, p]));

  // Group results by discipline
  const byDisc = new Map<string, Result[]>();
  for (const r of results) {
    const list = byDisc.get(r.discipline_id) || [];
    list.push(r);
    byDisc.set(r.discipline_id, list);
  }

  return (
    <div>
      <p className="text-xs font-display font-semibold mb-2">Výsledky</p>
      <div className="space-y-2">
        {Array.from(byDisc.entries()).map(([discId, discResults]) => {
          const disc = discMap.get(discId);
          if (!disc) return null;
          const sorted = [...discResults].sort((a, b) => (a.rank || 99) - (b.rank || 99));
          return (
            <div key={discId} className="p-2 rounded border border-border bg-card/50">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-sm">{disc.icon_emoji}</span>
                <span className="font-display text-xs font-semibold">{disc.name}</span>
                <Badge variant="outline" className={`text-[8px] ${CATEGORY_COLORS[disc.category] || ""}`}>
                  {disc.category}
                </Badge>
              </div>
              <div className="space-y-0.5">
                {sorted.slice(0, 3).map(r => {
                  const p = partMap.get(r.participant_id);
                  const medalEmoji = r.medal === "gold" ? "🥇" : r.medal === "silver" ? "🥈" : r.medal === "bronze" ? "🥉" : "";
                  return (
                    <div key={r.id} className="flex items-center justify-between text-[10px]">
                      <span>
                        {medalEmoji} {p?.athlete_name || "?"}{" "}
                        <span className="text-muted-foreground">({p?.player_name})</span>
                      </span>
                      <span className="text-muted-foreground font-mono">{r.total_score.toFixed(1)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Stat Pill ─── */
function StatPill({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? "text-green-400" : value >= 50 ? "text-foreground" : "text-red-400";
  return (
    <span className={`text-[8px] font-mono ${color} bg-muted/50 px-1 rounded`}>
      {label}{value}
    </span>
  );
}

export default GamesTab;
