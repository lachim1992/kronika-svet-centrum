import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skull, Flame, Heart, Users, AlertTriangle, Shield, Star } from "lucide-react";

interface Props {
  sessionId: string;
  currentPlayerName: string;
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

const GladiatorPanel = ({ sessionId, currentPlayerName }: Props) => {
  const [academies, setAcademies] = useState<GladiatorAcademy[]>([]);
  const [records, setRecords] = useState<GladiatorRecord[]>([]);
  const [studentNames, setStudentNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: acads }, { data: recs }, { data: studs }] = await Promise.all([
      supabase.from("academies")
        .select("id, name, profile_brutality, crowd_popularity, elite_favor, people_favor, revolt_risk, total_fatalities, is_gladiatorial")
        .eq("session_id", sessionId)
        .eq("player_name", currentPlayerName)
        .gt("profile_brutality", 20),
      supabase.from("gladiator_records")
        .select("*")
        .eq("session_id", sessionId),
      supabase.from("academy_students")
        .select("id, name, academy_id")
        .eq("session_id", sessionId)
        .eq("player_name", currentPlayerName),
    ]);

    setAcademies((acads || []) as any);
    setRecords((recs || []) as any);
    const nameMap = new Map<string, string>();
    for (const s of (studs || [])) nameMap.set(s.id, s.name);
    setStudentNames(nameMap);
    setLoading(false);
  }, [sessionId, currentPlayerName]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <p className="text-xs text-muted-foreground text-center p-4">Načítám…</p>;

  if (academies.length === 0) {
    return (
      <Card className="border-border bg-card/50">
        <CardContent className="p-8 text-center">
          <Skull className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-sm text-muted-foreground">Žádné gladiátorské arény.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Postavte arénu nebo zvyšte brutalitu existující školy nad 20 pro aktivaci gladiátorského systému.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Skull className="h-4 w-4 text-red-400" />
        <span className="font-display text-sm font-semibold">Gladiátorské arény</span>
      </div>

      {academies.map(acad => {
        const acadRecords = records.filter(r => r.academy_id === acad.id);
        const activeGladiators = acadRecords.filter(r => r.status === "active");
        const deadGladiators = acadRecords.filter(r => r.status === "dead");
        const icons = acadRecords.filter(r => r.is_icon);

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
              {/* Favor meters */}
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

              {/* Stats */}
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

              {/* Active gladiators */}
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

              {/* Dead hall */}
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
      })}
    </div>
  );
};



export default GladiatorPanel;
