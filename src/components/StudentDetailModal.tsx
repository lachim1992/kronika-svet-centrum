import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Medal, Trophy, Star, BookOpen, Swords, User } from "lucide-react";

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

interface MedalRecord {
  discipline_name: string;
  discipline_emoji: string;
  festival_name: string;
  festival_turn: number;
  medal: string;
  rank: number;
  total_score: number;
}

const StudentDetailModal = ({
  open, onOpenChange, student, sessionId, academyName, onNavigateToWiki
}: StudentDetailModalProps) => {
  const [medals, setMedals] = useState<MedalRecord[]>([]);
  const [wikiEntry, setWikiEntry] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [totalGames, setTotalGames] = useState(0);

  useEffect(() => {
    if (!open || !student) return;
    setLoading(true);

    const fetchData = async () => {
      // Find all participant records for this student
      const { data: participations } = await supabase
        .from("games_participants")
        .select("id, festival_id, athlete_name, total_medals, is_legend, great_person_id")
        .eq("session_id", sessionId)
        .eq("student_id", student.id);

      setTotalGames(participations?.length || 0);

      if (participations && participations.length > 0) {
        const partIds = participations.map(p => p.id);
        
        // Fetch results with medals
        const { data: results } = await supabase
          .from("games_results")
          .select("participant_id, discipline_id, medal, rank, total_score, festival_id")
          .in("participant_id", partIds)
          .not("medal", "is", null);

        // Fetch discipline names
        const { data: disciplines } = await supabase
          .from("games_disciplines")
          .select("id, name, icon_emoji");

        // Fetch festival info
        const festivalIds = [...new Set((results || []).map(r => r.festival_id))];
        const { data: festivals } = await supabase
          .from("games_festivals")
          .select("id, name, concluded_turn")
          .in("id", festivalIds.length > 0 ? festivalIds : ["__none__"]);

        const discMap = new Map((disciplines || []).map(d => [d.id, d]));
        const festMap = new Map((festivals || []).map(f => [f.id, f]));

        const medalRecords: MedalRecord[] = (results || []).map(r => {
          const disc = discMap.get(r.discipline_id);
          const fest = festMap.get(r.festival_id);
          return {
            discipline_name: disc?.name || "?",
            discipline_emoji: disc?.icon_emoji || "🏅",
            festival_name: fest?.name || "?",
            festival_turn: fest?.concluded_turn || 0,
            medal: r.medal || "",
            rank: r.rank,
            total_score: r.total_score,
          };
        });
        medalRecords.sort((a, b) => a.festival_turn - b.festival_turn);
        setMedals(medalRecords);
      } else {
        setMedals([]);
      }

      // Fetch wiki entry
      const { data: wiki } = await supabase
        .from("wiki_entries")
        .select("id, entity_name, summary, image_url, body_md, ai_description")
        .eq("session_id", sessionId)
        .eq("entity_type", "person")
        .eq("entity_name", student.name)
        .maybeSingle();
      setWikiEntry(wiki);
      setLoading(false);
    };

    fetchData();
  }, [open, student, sessionId]);

  if (!student) return null;

  const portraitUrl = student.portrait_url || wikiEntry?.image_url;
  const bio = student.bio || wikiEntry?.ai_description || wikiEntry?.summary;
  const goldCount = medals.filter(m => m.medal === "gold").length;
  const silverCount = medals.filter(m => m.medal === "silver").length;
  const bronzeCount = medals.filter(m => m.medal === "bronze").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            {student.name}
            <Badge variant="outline" className="text-[8px] ml-auto">{student.specialty}</Badge>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Portrait */}
            {portraitUrl ? (
              <div className="relative rounded-lg overflow-hidden border border-border">
                <img
                  src={portraitUrl}
                  alt={student.name}
                  className="w-full h-48 object-cover"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background/90 to-transparent p-3">
                  <p className="text-xs font-display font-semibold">{student.name}</p>
                  <p className="text-[9px] text-muted-foreground">{academyName}</p>
                </div>
              </div>
            ) : (
              <div className="h-32 rounded-lg border border-dashed border-border flex flex-col items-center justify-center bg-muted/20">
                <User className="h-8 w-8 text-muted-foreground/50 mb-1" />
                <p className="text-[9px] text-muted-foreground">Portrét bude vygenerován po první účasti na hrách</p>
              </div>
            )}

            {/* Bio */}
            {bio && (
              <div className="text-xs text-muted-foreground bg-muted/20 p-3 rounded border border-border italic">
                {bio}
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-5 gap-1">
              {[
                { label: "Síla", value: student.strength, key: "S" },
                { label: "Výdrž", value: student.endurance, key: "V" },
                { label: "Obrat.", value: student.agility, key: "O" },
                { label: "Takt.", value: student.tactics, key: "T" },
                { label: "Char.", value: student.charisma, key: "C" },
              ].map(stat => (
                <div key={stat.key} className="text-center p-1.5 rounded bg-muted/30 border border-border">
                  <p className={`text-sm font-mono font-bold ${stat.value >= 70 ? "text-green-400" : stat.value >= 50 ? "text-foreground" : "text-red-400"}`}>
                    {stat.value}
                  </p>
                  <p className="text-[8px] text-muted-foreground">{stat.label}</p>
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

            {/* Games Summary */}
            <div className="border-t border-border pt-3">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-display font-semibold">Účast na hrách</span>
                <span className="text-[9px] text-muted-foreground ml-auto">{totalGames} her</span>
              </div>

              {medals.length > 0 ? (
                <>
                  {/* Medal summary */}
                  <div className="flex items-center gap-3 mb-2 text-xs">
                    {goldCount > 0 && <span className="flex items-center gap-0.5">🥇 {goldCount}</span>}
                    {silverCount > 0 && <span className="flex items-center gap-0.5">🥈 {silverCount}</span>}
                    {bronzeCount > 0 && <span className="flex items-center gap-0.5">🥉 {bronzeCount}</span>}
                    {goldCount >= 2 && (
                      <Badge variant="outline" className="text-[7px] border-yellow-500/50 text-yellow-400">
                        <Star className="h-2.5 w-2.5 mr-0.5" />Legenda
                      </Badge>
                    )}
                  </div>

                  {/* Medal table */}
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {medals.map((m, i) => (
                      <div key={i} className="flex items-center justify-between text-[9px] p-1.5 rounded bg-muted/20 border border-border">
                        <span className="flex items-center gap-1">
                          <span>{m.discipline_emoji}</span>
                          <span className="font-semibold">{m.discipline_name}</span>
                        </span>
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <span>{m.festival_name}</span>
                          <span>
                            {m.medal === "gold" ? "🥇" : m.medal === "silver" ? "🥈" : "🥉"}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : totalGames > 0 ? (
                <p className="text-[9px] text-muted-foreground">Účastnil se her, ale nezískal medaili.</p>
              ) : (
                <p className="text-[9px] text-muted-foreground">Zatím se nezúčastnil žádných her.</p>
              )}
            </div>

            {/* Info row */}
            <div className="flex items-center gap-2 text-[9px] text-muted-foreground border-t border-border pt-2">
              <span>Trénink od roku {student.training_started_turn}</span>
              {student.graduation_turn && <span>| Absolvent roku {student.graduation_turn}</span>}
              <span>| {student.status}</span>
            </div>

            {/* Wiki link */}
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
        )}
      </DialogContent>
    </Dialog>
  );
};

export default StudentDetailModal;
