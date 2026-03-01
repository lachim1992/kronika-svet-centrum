import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trophy, Star, BookOpen, User, Eye, Swords, AlertTriangle, MessageSquare } from "lucide-react";

interface StudentDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: {
    id: string;
    name: string;
    academy_id: string;
    strength: number;
    endurance: number;
    agility: number;
    tactics: number;
    charisma: number;
    specialty: string;
    traits: string[];
    status: string;
    graduation_turn: number | null;
    training_started_turn: number;
    portrait_url?: string | null;
    bio?: string | null;
  } | null;
  sessionId: string;
  academyName?: string;
  onNavigateToWiki?: (entityName: string) => void;
}

interface ResultRecord {
  discipline_name: string;
  discipline_emoji: string;
  festival_name: string;
  festival_turn: number;
  medal: string | null;
  rank: number | null;
  total_score: number;
}

interface IntrigueRecord {
  action_type: string;
  description: string | null;
  success: boolean | null;
  discovered: boolean;
  player_name: string;
  festival_name: string;
  gold_spent: number;
}

interface IncidentRecord {
  incident_type: string;
  description: string;
  severity: string;
  festival_name: string;
  turn_number: number;
}

interface FeedMention {
  text: string;
  feed_type: string;
  drama_level: number;
  festival_name: string;
}

interface Participation {
  id: string;
  festival_id: string;
  festival_name: string;
  total_medals: number;
  is_legend: boolean;
  form: string;
  crowd_popularity: number;
  great_person_id: string | null;
}

const INTRIGUE_LABELS: Record<string, { label: string; emoji: string }> = {
  sabotage: { label: "Sabotáž", emoji: "🗡️" },
  sponsor: { label: "Sponzorství", emoji: "💰" },
  bribe: { label: "Úplatek", emoji: "🤝" },
  intimidate: { label: "Zastrašování", emoji: "😈" },
};

const INCIDENT_LABELS: Record<string, { label: string; emoji: string }> = {
  injury: { label: "Zranění", emoji: "🩹" },
  bribery: { label: "Úplatkářství", emoji: "💸" },
  riot: { label: "Nepokoje", emoji: "🔥" },
  protest: { label: "Protest", emoji: "📢" },
};

const StudentDetailModal = ({
  open, onOpenChange, student, sessionId, academyName, onNavigateToWiki
}: StudentDetailModalProps) => {
  const [results, setResults] = useState<ResultRecord[]>([]);
  const [intrigues, setIntrigues] = useState<IntrigueRecord[]>([]);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [feedMentions, setFeedMentions] = useState<FeedMention[]>([]);
  const [participations, setParticipations] = useState<Participation[]>([]);
  const [wikiEntry, setWikiEntry] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !student) return;
    setLoading(true);

    const fetchData = async () => {
      // 1. Find all participant records
      const { data: parts } = await supabase
        .from("games_participants")
        .select("id, festival_id, athlete_name, total_medals, is_legend, great_person_id, form, crowd_popularity")
        .eq("session_id", sessionId)
        .eq("student_id", student.id);

      if (!parts || parts.length === 0) {
        setParticipations([]);
        setResults([]);
        setIntrigues([]);
        setIncidents([]);
        setFeedMentions([]);
        // Still fetch wiki
        const { data: wiki } = await supabase.from("wiki_entries")
          .select("id, entity_name, summary, image_url, body_md, ai_description")
          .eq("session_id", sessionId).eq("entity_type", "person").eq("entity_name", student.name).maybeSingle();
        setWikiEntry(wiki);
        setLoading(false);
        return;
      }

      const partIds = parts.map(p => p.id);
      const festivalIds = [...new Set(parts.map(p => p.festival_id))];

      // Fetch all related data in parallel
      const [
        { data: allResults },
        { data: disciplines },
        { data: festivals },
        { data: allIntrigues },
        { data: allIncidents },
        { data: allFeed },
        { data: wiki },
      ] = await Promise.all([
        supabase.from("games_results")
          .select("participant_id, discipline_id, medal, rank, total_score, festival_id")
          .in("participant_id", partIds),
        supabase.from("games_disciplines").select("id, name, icon_emoji"),
        supabase.from("games_festivals").select("id, name, concluded_turn").in("id", festivalIds),
        supabase.from("games_intrigues")
          .select("action_type, description, success, discovered, player_name, festival_id, gold_spent")
          .in("target_participant_id", partIds),
        supabase.from("games_incidents")
          .select("incident_type, description, severity, festival_id, turn_number")
          .in("target_participant_id", partIds),
        supabase.from("games_live_feed")
          .select("text, feed_type, drama_level, festival_id, participant_id")
          .in("participant_id", partIds)
          .order("sequence_num", { ascending: true })
          .limit(30),
        supabase.from("wiki_entries")
          .select("id, entity_name, summary, image_url, body_md, ai_description")
          .eq("session_id", sessionId).eq("entity_type", "person").eq("entity_name", student.name).maybeSingle(),
      ]);

      const discMap = new Map((disciplines || []).map(d => [d.id, d]));
      const festMap = new Map((festivals || []).map(f => [f.id, f]));

      // Participations
      setParticipations(parts.map(p => ({
        ...p,
        festival_name: festMap.get(p.festival_id)?.name || "?",
      })) as Participation[]);

      // Results (ALL, not just medals)
      const resultRecords: ResultRecord[] = (allResults || []).map(r => {
        const disc = discMap.get(r.discipline_id);
        const fest = festMap.get(r.festival_id);
        return {
          discipline_name: disc?.name || "?",
          discipline_emoji: disc?.icon_emoji || "🏅",
          festival_name: fest?.name || "?",
          festival_turn: fest?.concluded_turn || 0,
          medal: r.medal,
          rank: r.rank,
          total_score: r.total_score,
        };
      });
      resultRecords.sort((a, b) => a.festival_turn - b.festival_turn);
      setResults(resultRecords);

      // Intrigues
      setIntrigues((allIntrigues || []).map(ig => ({
        ...ig,
        festival_name: festMap.get(ig.festival_id)?.name || "?",
      })));

      // Incidents
      setIncidents((allIncidents || []).map(inc => ({
        ...inc,
        festival_name: festMap.get(inc.festival_id)?.name || "?",
      })));

      // Feed mentions
      setFeedMentions((allFeed || []).map(f => ({
        ...f,
        festival_name: festMap.get(f.festival_id)?.name || "?",
      })));

      setWikiEntry(wiki);
      setLoading(false);
    };

    fetchData();
  }, [open, student, sessionId]);

  if (!student) return null;

  const portraitUrl = student.portrait_url || wikiEntry?.image_url;
  const bio = student.bio || wikiEntry?.ai_description || wikiEntry?.summary;
  const goldCount = results.filter(r => r.medal === "gold").length;
  const silverCount = results.filter(r => r.medal === "silver").length;
  const bronzeCount = results.filter(r => r.medal === "bronze").length;
  const totalGames = participations.length;
  const latestForm = participations.length > 0 ? participations[participations.length - 1].form : null;
  const maxPopularity = participations.length > 0 ? Math.max(...participations.map(p => p.crowd_popularity)) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            {student.name}
            <Badge variant="outline" className="text-[8px]">{student.specialty}</Badge>
            {goldCount >= 2 && (
              <Badge variant="outline" className="text-[7px] border-yellow-500/50 text-yellow-400">
                <Star className="h-2.5 w-2.5 mr-0.5" />Legenda
              </Badge>
            )}
            {latestForm && latestForm !== "normal" && (
              <Badge variant="outline" className={`text-[7px] ${
                latestForm === "peak" ? "border-green-500/50 text-green-400" :
                latestForm === "injured" ? "border-red-500/50 text-red-400" :
                latestForm === "dead" ? "border-red-700/50 text-red-600" :
                "border-yellow-500/50 text-yellow-400"
              }`}>
                {latestForm === "peak" ? "🔥 Vrchol" : latestForm === "injured" ? "🩹 Zraněn" : latestForm === "dead" ? "💀 Padl" : `⚡ ${latestForm}`}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 p-2">
            <Skeleton className="h-40 w-full rounded-lg" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <ScrollArea className="flex-1 pr-2">
            <div className="space-y-4 p-1">
              {/* Portrait + Bio */}
              <div className="flex gap-3">
                {portraitUrl ? (
                  <img src={portraitUrl} alt={student.name} className="w-24 h-24 rounded-lg object-cover border border-border shrink-0" />
                ) : (
                  <div className="w-24 h-24 rounded-lg border border-dashed border-border flex items-center justify-center bg-muted/20 shrink-0">
                    <User className="h-6 w-6 text-muted-foreground/50" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {bio && <p className="text-[10px] text-muted-foreground italic mb-1.5 line-clamp-4">{bio}</p>}
                  <div className="flex flex-wrap gap-1">
                    <span className="text-[9px] text-muted-foreground">Akademie: {academyName}</span>
                    <span className="text-[9px] text-muted-foreground">| Rok {student.training_started_turn}–{student.graduation_turn || "?"}</span>
                    {maxPopularity > 0 && <span className="text-[9px] text-muted-foreground">| 👥 Popularita: {maxPopularity}</span>}
                  </div>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-5 gap-1">
                {[
                  { label: "Síla", value: student.strength },
                  { label: "Výdrž", value: student.endurance },
                  { label: "Obrat.", value: student.agility },
                  { label: "Takt.", value: student.tactics },
                  { label: "Char.", value: student.charisma },
                ].map(stat => (
                  <div key={stat.label} className="text-center p-1 rounded bg-muted/30 border border-border">
                    <p className={`text-xs font-mono font-bold ${stat.value >= 70 ? "text-green-400" : stat.value >= 50 ? "text-foreground" : "text-red-400"}`}>
                      {stat.value}
                    </p>
                    <p className="text-[7px] text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Traits */}
              {student.traits && student.traits.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {student.traits.map(t => (
                    <Badge key={t} variant="outline" className="text-[8px]">{t}</Badge>
                  ))}
                </div>
              )}

              {/* Tabs: Results / Intrigues / Chronicle */}
              <Tabs defaultValue="results" className="space-y-2">
                <TabsList className="grid w-full grid-cols-4 h-7">
                  <TabsTrigger value="results" className="text-[9px] px-1">
                    <Trophy className="h-3 w-3 mr-0.5" />{results.length}
                  </TabsTrigger>
                  <TabsTrigger value="intrigues" className="text-[9px] px-1">
                    <Eye className="h-3 w-3 mr-0.5" />{intrigues.length}
                  </TabsTrigger>
                  <TabsTrigger value="incidents" className="text-[9px] px-1">
                    <AlertTriangle className="h-3 w-3 mr-0.5" />{incidents.length}
                  </TabsTrigger>
                  <TabsTrigger value="feed" className="text-[9px] px-1">
                    <MessageSquare className="h-3 w-3 mr-0.5" />{feedMentions.length}
                  </TabsTrigger>
                </TabsList>

                {/* ── RESULTS TAB ── */}
                <TabsContent value="results" className="space-y-2 mt-0">
                  {/* Medal summary */}
                  {(goldCount + silverCount + bronzeCount > 0) && (
                    <div className="flex items-center gap-3 text-xs p-2 rounded bg-muted/20 border border-border">
                      {goldCount > 0 && <span>🥇 {goldCount}</span>}
                      {silverCount > 0 && <span>🥈 {silverCount}</span>}
                      {bronzeCount > 0 && <span>🥉 {bronzeCount}</span>}
                      <span className="text-muted-foreground ml-auto text-[9px]">{totalGames} her</span>
                    </div>
                  )}

                  {results.length > 0 ? (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {results.map((r, i) => (
                        <div key={i} className="flex items-center justify-between text-[9px] p-1.5 rounded bg-muted/20 border border-border">
                          <span className="flex items-center gap-1">
                            <span>{r.discipline_emoji}</span>
                            <span className="font-semibold">{r.discipline_name}</span>
                          </span>
                          <span className="flex items-center gap-2 text-muted-foreground">
                            <span className="truncate max-w-[80px]">{r.festival_name}</span>
                            <span className="font-mono">#{r.rank}</span>
                            <span className="font-mono text-[8px]">({r.total_score.toFixed(1)})</span>
                            {r.medal && <span>{r.medal === "gold" ? "🥇" : r.medal === "silver" ? "🥈" : "🥉"}</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[9px] text-muted-foreground text-center p-4">
                      {totalGames > 0 ? "Žádné zaznamenané výsledky." : "Zatím se nezúčastnil žádných her."}
                    </p>
                  )}

                  {/* Participations summary */}
                  {participations.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[9px] font-display font-semibold text-muted-foreground">Účast na hrách</p>
                      {participations.map(p => (
                        <div key={p.id} className="flex items-center justify-between text-[9px] p-1 rounded bg-muted/10">
                          <span>{p.festival_name}</span>
                          <div className="flex items-center gap-1.5">
                            {p.total_medals > 0 && <span>🏅 {p.total_medals}</span>}
                            {p.is_legend && <Star className="h-2.5 w-2.5 text-yellow-400" />}
                            <Badge variant="outline" className={`text-[7px] ${
                              p.form === "peak" ? "border-green-500/30 text-green-400" :
                              p.form === "injured" ? "border-red-500/30 text-red-400" :
                              p.form === "dead" ? "border-red-700/30 text-red-600" :
                              ""
                            }`}>{p.form}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* ── INTRIGUES TAB ── */}
                <TabsContent value="intrigues" className="space-y-1 mt-0">
                  {intrigues.length > 0 ? (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {intrigues.map((ig, i) => {
                        const label = INTRIGUE_LABELS[ig.action_type] || { label: ig.action_type, emoji: "❓" };
                        return (
                          <div key={i} className="p-2 rounded bg-muted/20 border border-border">
                            <div className="flex items-center justify-between text-[9px] mb-0.5">
                              <span className="flex items-center gap-1 font-semibold">
                                <span>{label.emoji}</span>
                                {label.label}
                              </span>
                              <div className="flex items-center gap-1">
                                <Badge variant="outline" className={`text-[7px] ${ig.success ? "border-green-500/30 text-green-400" : ig.success === false ? "border-red-500/30 text-red-400" : ""}`}>
                                  {ig.success ? "Úspěch" : ig.success === false ? "Neúspěch" : "?"}
                                </Badge>
                                {ig.discovered && <Badge variant="outline" className="text-[7px] border-yellow-500/30 text-yellow-400">Odhaleno</Badge>}
                              </div>
                            </div>
                            <p className="text-[9px] text-muted-foreground">{ig.description || "Tajná akce"}</p>
                            <p className="text-[8px] text-muted-foreground mt-0.5">
                              Iniciátor: {ig.player_name} | {ig.festival_name} | 💰 {ig.gold_spent}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[9px] text-muted-foreground text-center p-4">Žádné intriky proti tomuto atletovi.</p>
                  )}
                </TabsContent>

                {/* ── INCIDENTS TAB ── */}
                <TabsContent value="incidents" className="space-y-1 mt-0">
                  {incidents.length > 0 ? (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {incidents.map((inc, i) => {
                        const label = INCIDENT_LABELS[inc.incident_type] || { label: inc.incident_type, emoji: "⚠️" };
                        return (
                          <div key={i} className="p-2 rounded bg-muted/20 border border-border">
                            <div className="flex items-center justify-between text-[9px]">
                              <span className="flex items-center gap-1 font-semibold">
                                <span>{label.emoji}</span>
                                {label.label}
                              </span>
                              <Badge variant="outline" className={`text-[7px] ${inc.severity === "major" ? "border-red-500/30 text-red-400" : ""}`}>
                                {inc.severity}
                              </Badge>
                            </div>
                            <p className="text-[9px] text-muted-foreground mt-0.5">{inc.description}</p>
                            <p className="text-[8px] text-muted-foreground">{inc.festival_name} | Rok {inc.turn_number}</p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[9px] text-muted-foreground text-center p-4">Žádné incidenty.</p>
                  )}
                </TabsContent>

                {/* ── FEED / CHRONICLE TAB ── */}
                <TabsContent value="feed" className="space-y-1 mt-0">
                  {feedMentions.length > 0 ? (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {feedMentions.map((f, i) => (
                        <div key={i} className={`p-1.5 rounded border border-border text-[9px] ${
                          f.drama_level >= 4 ? "bg-primary/5 border-primary/20" : "bg-muted/20"
                        }`}>
                          <p className="text-muted-foreground">{f.text}</p>
                          <p className="text-[8px] text-muted-foreground/60 mt-0.5">
                            {f.festival_name} | {f.feed_type} | Drama: {"⭐".repeat(Math.min(f.drama_level, 5))}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[9px] text-muted-foreground text-center p-4">Žádné zmínky v kronice her.</p>
                  )}
                </TabsContent>
              </Tabs>

              {/* Footer: Info + Wiki link */}
              <div className="flex items-center gap-2 text-[9px] text-muted-foreground border-t border-border pt-2">
                <span>Trénink: rok {student.training_started_turn}</span>
                {student.graduation_turn && <span>| Absolvent: rok {student.graduation_turn}</span>}
                <span>| {student.status}</span>
              </div>

              {wikiEntry && onNavigateToWiki && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-[10px] h-8"
                  onClick={() => { onNavigateToWiki(student.name); onOpenChange(false); }}
                >
                  <BookOpen className="h-3 w-3 mr-1" />
                  Otevřít v ChroWiki
                </Button>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default StudentDetailModal;
