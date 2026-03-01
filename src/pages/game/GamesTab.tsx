import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Trophy, Sword, BookOpen, Theater, Target, Flame, Star, Crown, AlertTriangle, Coins, School, Skull, TrendingUp, MapPin, Gavel, Medal } from "lucide-react";
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
  host_city_id: string | null;
  host_player: string | null;
  status: string;
  announced_turn: number;
  finals_turn: number | null;
  concluded_turn: number | null;
  candidacy_deadline_turn: number | null;
  is_global: boolean;
  prestige_pool: number;
  total_investment_gold: number;
  host_selection_method: string;
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

interface Bid {
  id: string;
  festival_id: string;
  player_name: string;
  city_id: string;
  gold_invested: number;
  pitch_text: string;
  cultural_score: number;
  logistics_score: number;
  total_bid_score: number;
  is_winner: boolean;
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
  candidacy: { label: "Kandidatura", color: "bg-indigo-500/15 text-indigo-400" },
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
  const [bids, setBids] = useState<Bid[]>([]);
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

    if (f && f.length > 0) {
      const festIds = f.map(ff => ff.id);
      const [{ data: p }, { data: r }, { data: inc }, { data: b }] = await Promise.all([
        supabase.from("games_participants").select("*").in("festival_id", festIds),
        supabase.from("games_results").select("*").in("festival_id", festIds),
        supabase.from("games_incidents").select("*").in("festival_id", festIds),
        supabase.from("games_bids").select("*").in("festival_id", festIds).order("total_bid_score", { ascending: false }),
      ]);
      setParticipants((p || []) as any);
      setResults((r || []) as any);
      setIncidents((inc || []) as any);
      setBids((b || []) as any);
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
      toast.success(`🏟️ Kandidatura na Velké hry otevřena!`);
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

  const activeFestival = festivals.find(f => !["concluded", "cancelled"].includes(f.status));
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
        <TabsList className="grid w-full grid-cols-4 sm:grid-cols-7">
          <TabsTrigger value="active" className="font-display text-xs">
            <Flame className="h-3.5 w-3.5 mr-1" />Aktivní
          </TabsTrigger>
          <TabsTrigger value="medals" className="font-display text-xs">
            <Medal className="h-3.5 w-3.5 mr-1" />Medaile
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
            activeFestival.status === "candidacy" ? (
              <CandidacyPhase
                festival={activeFestival}
                bids={bids.filter(b => b.festival_id === activeFestival.id)}
                myCities={myCities}
                currentPlayerName={currentPlayerName}
                sessionId={sessionId}
                currentTurn={currentTurn}
                isAdmin={isAdmin}
                onRefetch={fetchData}
                onRefetchParent={onRefetch}
              />
            ) : (
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
            )
          ) : (
            <Card className="border-border bg-card/50">
              <CardContent className="p-8 text-center">
                <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-sm text-muted-foreground">Žádné aktivní hry.</p>
                <p className="text-xs text-muted-foreground mt-1">Vyhlaste Olympijské hry nebo uspořádejte lokální festival.</p>
              </CardContent>
            </Card>
          )}
          {activeFestival && activeFestival.status !== "candidacy" && (
            <LiveGamesFeed sessionId={sessionId} festivalId={activeFestival.id} />
          )}
        </TabsContent>

        {/* ─── GLOBAL MEDAL TALLY ─── */}
        <TabsContent value="medals">
          <GlobalMedalTally
            sessionId={sessionId}
            festivals={concludedFestivals}
            participants={participants}
            results={results}
            disciplines={disciplines}
          />
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
                Globální událost jednou za 20 kol. Otevře se fáze <strong>kandidatury</strong> — města soutěží o pořadatelství investicemi a prestiží.
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-[9px]">Kandidatura měst</Badge>
                <Badge variant="outline" className="text-[9px]">Lobbying</Badge>
                <Badge variant="outline" className="text-[9px]">Legacy bonus</Badge>
              </div>
              <Button
                onClick={handleAnnounceOlympics}
                disabled={announcing || !!activeFestival}
                className="w-full font-display gap-2"
                variant={activeFestival ? "outline" : "default"}
              >
                {announcing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
                {activeFestival ? "Hry již probíhají" : "Vyhlásit kandidaturu na Velké hry"}
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
                    <div className="mt-3 space-y-3">
                      {(f as any).description && (
                        <div className="prose prose-xs prose-invert max-w-none text-[11px] leading-relaxed whitespace-pre-wrap border-l-2 border-primary/30 pl-3">
                          {(f as any).description}
                        </div>
                      )}
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

/* ─── Candidacy Phase Component ─── */
function CandidacyPhase({
  festival, bids, myCities, currentPlayerName, sessionId, currentTurn, isAdmin, onRefetch, onRefetchParent,
}: {
  festival: Festival;
  bids: Bid[];
  myCities: any[];
  currentPlayerName: string;
  sessionId: string;
  currentTurn: number;
  isAdmin: boolean;
  onRefetch: () => void;
  onRefetchParent: () => void;
}) {
  const [bidCityId, setBidCityId] = useState("");
  const [bidGold, setBidGold] = useState(10);
  const [bidPitch, setBidPitch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectingHost, setSelectingHost] = useState(false);

  const myBid = bids.find(b => b.player_name === currentPlayerName);
  const deadlinePassed = currentTurn > (festival.candidacy_deadline_turn || Infinity);

  const handleSubmitBid = async () => {
    if (!bidCityId) { toast.error("Vyber město pro kandidaturu"); return; }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("games-bid", {
        body: { session_id: sessionId, player_name: currentPlayerName, festival_id: festival.id, city_id: bidCityId, gold_invested: bidGold, pitch_text: bidPitch },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success(`🏛️ Kandidatura podána! Skóre: ${data.scores?.total?.toFixed(1)}`);
      await onRefetch();
    } catch (e: any) {
      toast.error(e.message || "Chyba");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectHost = async () => {
    setSelectingHost(true);
    try {
      const { data, error } = await supabase.functions.invoke("games-select-host", {
        body: { session_id: sessionId, festival_id: festival.id, turn_number: currentTurn },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success(`🏟️ ${data.host?.city} zvoleno hostitelem!`);
      await onRefetch();
      onRefetchParent();
    } catch (e: any) {
      toast.error(e.message || "Chyba");
    } finally {
      setSelectingHost(false);
    }
  };

  return (
    <Card className="border-indigo-500/30 bg-indigo-500/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <Gavel className="h-4 w-4 text-indigo-400" />
            {festival.name} — Kandidatura
          </CardTitle>
          <Badge className="bg-indigo-500/15 text-indigo-400" variant="outline">
            Uzávěrka: rok {festival.candidacy_deadline_turn}
          </Badge>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Města soupeří o pořadatelství. Investujte zlato, budujte prestiž.
          {deadlinePassed && " Uzávěrka uplynula — čas na výběr hostitele!"}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Existing bids */}
        {bids.length > 0 && (
          <div>
            <p className="text-xs font-display font-semibold mb-2">Kandidáti ({bids.length})</p>
            <div className="space-y-1.5">
              {bids.map((b, idx) => {
                const city = myCities.find(c => c.id === b.city_id);
                return (
                  <div key={b.id} className={`p-2 rounded border ${idx === 0 ? "border-primary/30 bg-primary/5" : "border-border bg-card/50"} flex items-center gap-2`}>
                    <span className="font-display text-xs font-bold text-muted-foreground w-5">{idx + 1}.</span>
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-xs font-semibold truncate">{b.pitch_text}</p>
                      <p className="text-[9px] text-muted-foreground">{b.player_name} | Investice: {b.gold_invested} 💰</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-xs font-bold text-primary">{b.total_bid_score.toFixed(1)}</p>
                      <p className="text-[8px] text-muted-foreground">skóre</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Submit bid form */}
        {!myBid && !deadlinePassed && (
          <div className="border border-border rounded p-3 space-y-2 bg-card/50">
            <p className="text-xs font-display font-semibold flex items-center gap-1">
              <Crown className="h-3.5 w-3.5 text-primary" /> Podat kandidaturu
            </p>
            <Select value={bidCityId} onValueChange={setBidCityId}>
              <SelectTrigger className="text-xs h-8">
                <SelectValue placeholder="Vyberte město..." />
              </SelectTrigger>
              <SelectContent>
                {myCities.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} (vliv: {c.influence_score}, úr.: {c.development_level})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] text-muted-foreground">Investice (zlato)</label>
                <Input type="number" min={0} max={100} value={bidGold}
                  onChange={e => setBidGold(Number(e.target.value))} className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-[9px] text-muted-foreground">Heslo kandidatury</label>
                <Input value={bidPitch} onChange={e => setBidPitch(e.target.value)}
                  placeholder="Naše město je připraveno..." className="h-8 text-xs" />
              </div>
            </div>
            <Button onClick={handleSubmitBid} disabled={submitting || !bidCityId} className="w-full font-display gap-2 text-xs">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />}
              Podat kandidaturu
            </Button>
          </div>
        )}

        {myBid && (
          <p className="text-xs text-green-400 text-center">✓ Vaše kandidatura podána (skóre: {myBid.total_bid_score.toFixed(1)})</p>
        )}

        {/* Select host button (admin or deadline passed) */}
        {(isAdmin || deadlinePassed) && bids.length > 0 && (
          <Button onClick={handleSelectHost} disabled={selectingHost} variant="default" className="w-full font-display gap-2">
            {selectingHost ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
            Vybrat hostitele a zahájit nominace
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

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

        {isResolved && (
          <MedalTable participants={participants} results={results} disciplines={disciplines} />
        )}

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

/* ─── Global Medal Tally ─── */
function GlobalMedalTally({ sessionId, festivals, participants, results, disciplines }: {
  sessionId: string;
  festivals: Festival[];
  participants: Participant[];
  results: Result[];
  disciplines: Discipline[];
}) {
  // Aggregate medals per empire across ALL concluded festivals
  const empireTally: Record<string, { gold: number; silver: number; bronze: number; hosted: number; legends: number; participations: number }> = {};

  for (const p of participants) {
    if (!empireTally[p.player_name]) {
      empireTally[p.player_name] = { gold: 0, silver: 0, bronze: 0, hosted: 0, legends: 0, participations: 0 };
    }
    empireTally[p.player_name].participations++;
    if (p.is_legend) empireTally[p.player_name].legends++;
  }

  for (const r of results) {
    const p = participants.find(pp => pp.id === r.participant_id);
    if (!p) continue;
    if (!empireTally[p.player_name]) {
      empireTally[p.player_name] = { gold: 0, silver: 0, bronze: 0, hosted: 0, legends: 0, participations: 0 };
    }
    if (r.medal === "gold") empireTally[p.player_name].gold++;
    if (r.medal === "silver") empireTally[p.player_name].silver++;
    if (r.medal === "bronze") empireTally[p.player_name].bronze++;
  }

  // Count hostings
  for (const f of festivals) {
    if (f.host_player && empireTally[f.host_player]) {
      empireTally[f.host_player].hosted++;
    }
  }

  const sorted = Object.entries(empireTally).sort((a, b) => {
    const aScore = a[1].gold * 100 + a[1].silver * 10 + a[1].bronze;
    const bScore = b[1].gold * 100 + b[1].silver * 10 + b[1].bronze;
    return bScore - aScore;
  });

  // Find rivalries: top 2 empires with smallest gap
  const rivalryPairs: string[] = [];
  if (sorted.length >= 2) {
    const [first, second] = sorted;
    const gap = (first[1].gold * 100 + first[1].silver * 10 + first[1].bronze) -
                (second[1].gold * 100 + second[1].silver * 10 + second[1].bronze);
    if (gap < 200) {
      rivalryPairs.push(`${first[0]} vs ${second[0]}`);
    }
  }

  if (sorted.length === 0) {
    return (
      <Card className="border-border bg-card/50">
        <CardContent className="p-8 text-center">
          <Medal className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-sm text-muted-foreground">Žádné medailové záznamy.</p>
          <p className="text-xs text-muted-foreground mt-1">Uspořádejte Velké hry pro zahájení soutěže říší.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Empire Medal Table */}
      <Card className="border-primary/20 bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            Medailová tabulka říší
          </CardTitle>
          <p className="text-[10px] text-muted-foreground">
            Celkem {festivals.length} olympiád | {results.filter(r => r.medal).length} medailí
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <div className="grid grid-cols-[auto_1fr_repeat(5,_40px)] gap-1 text-[9px] text-muted-foreground font-display pb-1 border-b border-border">
              <span className="w-5">#</span>
              <span>Říše</span>
              <span className="text-center">🥇</span>
              <span className="text-center">🥈</span>
              <span className="text-center">🥉</span>
              <span className="text-center">🏟️</span>
              <span className="text-center">⭐</span>
            </div>
            {sorted.map(([name, t], idx) => (
              <div key={name} className={`grid grid-cols-[auto_1fr_repeat(5,_40px)] gap-1 text-xs items-center py-1 ${idx === 0 ? "bg-primary/5 rounded" : ""}`}>
                <span className="font-display text-muted-foreground w-5 text-center font-bold">{idx + 1}</span>
                <span className="font-display font-semibold truncate">{name}</span>
                <span className="text-center font-mono font-bold text-yellow-400">{t.gold}</span>
                <span className="text-center font-mono text-muted-foreground">{t.silver}</span>
                <span className="text-center font-mono text-muted-foreground">{t.bronze}</span>
                <span className="text-center font-mono text-muted-foreground">{t.hosted}</span>
                <span className="text-center font-mono text-muted-foreground">{t.legends}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Rivalries */}
      {rivalryPairs.length > 0 && (
        <Card className="border-orange-500/20 bg-orange-500/5">
          <CardContent className="p-3">
            <p className="text-xs font-display font-semibold flex items-center gap-1">
              <Sword className="h-3.5 w-3.5 text-orange-400" />
              Rivalita
            </p>
            {rivalryPairs.map(r => (
              <p key={r} className="text-[10px] text-muted-foreground mt-1">
                ⚔️ {r} — těsný souboj o dominanci ve Velkých hrách!
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Hosting history */}
      <Card className="border-border bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            Historie pořadatelství
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {festivals.map(f => (
              <div key={f.id} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-muted-foreground">Rok {f.announced_turn}</span>
                  <span className="font-display font-semibold">{f.name}</span>
                </div>
                <Badge variant="outline" className="text-[8px]">{f.host_player}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
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
