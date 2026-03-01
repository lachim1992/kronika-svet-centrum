import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, TrendingUp, Medal, Crown } from "lucide-react";

interface Props {
  sessionId: string;
  currentPlayerName: string;
}

interface RankedAcademy {
  id: string;
  name: string;
  player_name: string;
  reputation: number;
  total_graduates: number;
  total_champions: number;
  total_fatalities: number;
  profile_athletics: number;
  profile_combat: number;
  profile_culture: number;
  profile_strategy: number;
  profile_brutality: number;
  color_primary: string;
  is_gladiatorial: boolean;
  // Computed
  score: number;
  victories: number;
  medalCount: number;
}

const SchoolRankings = ({ sessionId, currentPlayerName }: Props) => {
  const [rankings, setRankings] = useState<RankedAcademy[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRankings = useCallback(async () => {
    setLoading(true);

    // Get all academies in session
    const { data: academies } = await supabase.from("academies")
      .select("*").eq("session_id", sessionId).eq("status", "active");

    if (!academies || academies.length === 0) {
      setRankings([]);
      setLoading(false);
      return;
    }

    // Get all graduated students and their participant links
    const { data: students } = await supabase.from("academy_students")
      .select("id, academy_id, status")
      .eq("session_id", sessionId);

    // Get medal results for participants
    const { data: results } = await supabase.from("games_results")
      .select("participant_id, medal")
      .eq("session_id", sessionId)
      .not("medal", "is", null);

    // Get participants to link students → medals
    const { data: participants } = await supabase.from("games_participants")
      .select("id, athlete_name, player_name")
      .eq("session_id", sessionId);

    // Build medal count per academy
    const academyMedals = new Map<string, { gold: number; silver: number; bronze: number }>();
    const academyVictories = new Map<string, number>();

    // Map student_id → academy_id
    const studentAcademyMap = new Map<string, string>();
    for (const s of (students || [])) {
      studentAcademyMap.set(s.id, s.academy_id);
    }

    // Map participant_id → student_id (via games_participants.student_id)
    // We need student_id on participants - fetch it
    const { data: partsWithStudent } = await supabase.from("games_participants")
      .select("id, student_id")
      .eq("session_id", sessionId)
      .not("student_id", "is", null);

    const participantToStudent = new Map<string, string>();
    for (const p of (partsWithStudent || [])) {
      if (p.student_id) participantToStudent.set(p.id, p.student_id);
    }

    // Link results → participant → student → academy to count medals
    for (const r of (results || [])) {
      const studentId = participantToStudent.get(r.participant_id);
      if (!studentId) continue;
      const academyId = studentAcademyMap.get(studentId);
      if (!academyId) continue;

      if (!academyMedals.has(academyId)) {
        academyMedals.set(academyId, { gold: 0, silver: 0, bronze: 0 });
      }
      const m = academyMedals.get(academyId)!;
      if (r.medal === "gold") m.gold++;
      else if (r.medal === "silver") m.silver++;
      else if (r.medal === "bronze") m.bronze++;
    }

    // Count graduates per academy
    for (const acad of academies) {
      const gradCount = (students || []).filter(s => s.academy_id === acad.id && (s.status === "graduated" || s.status === "promoted")).length;
      academyVictories.set(acad.id, gradCount);
    }

    // Score calculation — unified with server (academy-tick) formula
    const ranked: RankedAcademy[] = (academies as any[]).map(acad => {
      const victories = academyVictories.get(acad.id) || 0;
      const medals = academyMedals.get(acad.id) || { gold: 0, silver: 0, bronze: 0 };
      const medalCount = medals.gold * 3 + medals.silver * 2 + medals.bronze;
      // Non-gladiatorial schools suffer fatality penalty
      const fatalityPenalty = acad.is_gladiatorial ? 0 : (acad.total_fatalities || 0) * 10;

      const score =
        acad.reputation * 3 +
        acad.total_champions * 50 +
        acad.total_graduates * 5 +
        medals.gold * 30 +
        medals.silver * 15 +
        medals.bronze * 5 +
        (acad.fan_base || 0) * 0.5 +
        (acad.crowd_popularity || 0) * 0.3 +
        (acad.infrastructure + acad.trainer_level + acad.nutrition) * 0.5 -
        acad.corruption * 2 -
        fatalityPenalty;

      return {
        ...acad,
        score: Math.round(score),
        victories,
        medalCount,
      };
    }).sort((a, b) => b.score - a.score);

    setRankings(ranked);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => { fetchRankings(); }, [fetchRankings]);

  if (loading) return <p className="text-xs text-muted-foreground text-center p-4">Načítám…</p>;
  if (rankings.length === 0) return <p className="text-xs text-muted-foreground text-center p-4">Žádné akademie v herním světě.</p>;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <span className="font-display text-sm font-semibold">Celosvětový žebříček akademií</span>
      </div>

      {rankings.map((acad, idx) => {
        const isOwn = acad.player_name === currentPlayerName;
        const rankIcon = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`;

        return (
          <Card
            key={acad.id}
            className={`border-border bg-card/50 ${isOwn ? "ring-1 ring-primary/40" : ""}`}
          >
            <CardContent className="p-3 flex items-center gap-3">
              <span className="text-lg font-bold font-mono w-8 text-center">{rankIcon}</span>

              <div className="w-4 h-4 rounded-full shrink-0" style={{ background: acad.color_primary }} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-display text-xs font-semibold truncate">{acad.name}</span>
                  {acad.is_gladiatorial && <Badge variant="outline" className="text-[7px] text-red-400 border-red-500/30">⚔ Gladiátorská</Badge>}
                  {acad.total_champions > 0 && (
                    <Badge variant="outline" className="text-[7px] text-yellow-400 border-yellow-500/30">
                      <Crown className="h-2.5 w-2.5 mr-0.5" />{acad.total_champions}
                    </Badge>
                  )}
                </div>
                <p className="text-[9px] text-muted-foreground">{acad.player_name} | Rep: {acad.reputation} | Abs: {acad.total_graduates}</p>
              </div>

              <div className="text-right shrink-0">
                <span className="font-mono text-sm font-bold text-primary">{acad.score}</span>
                <p className="text-[8px] text-muted-foreground">bodů</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default SchoolRankings;
