import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Trophy, Users, CheckCircle, Flag } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  festivalId: string;
  playerName: string;
  onComplete: () => void;
}

interface QualResult {
  rank: number;
  student_id: string;
  student_name: string;
  academy_name: string;
  specialty: string;
  traits: string[];
  strength: number;
  endurance: number;
  agility: number;
  tactics: number;
  charisma: number;
  portrait_url: string | null;
  bio: string | null;
  totalScore: number;
  disciplines: { discipline_key: string; discipline_name: string; score: number }[];
}

function StatPill({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? "text-green-400" : value >= 50 ? "text-foreground" : "text-red-400";
  return (
    <span className={`text-[8px] font-mono ${color} bg-muted/50 px-1 rounded`}>
      {label}{value}
    </span>
  );
}

const NationalQualificationPanel = ({ sessionId, festivalId, playerName, onComplete }: Props) => {
  const [results, setResults] = useState<QualResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [simulating, setSimulating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [simulated, setSimulated] = useState(false);
  const [alreadyNominated, setAlreadyNominated] = useState(false);

  const handleSimulate = useCallback(async () => {
    setSimulating(true);
    try {
      const { data, error } = await supabase.functions.invoke("games-qualify", {
        body: { session_id: sessionId, player_name: playerName, festival_id: festivalId, action: "simulate" },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }

      if (data?.already_simulated) {
        toast.info("Kvalifikace již proběhla, načítám výsledky.");
      }

      setResults(data?.results || []);
      setSimulated(true);
    } catch (e: any) {
      toast.error(e.message || "Chyba při kvalifikaci");
    } finally {
      setSimulating(false);
    }
  }, [sessionId, festivalId, playerName]);

  const handleToggleSelect = (studentId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else if (next.size < 3) {
        next.add(studentId);
      } else {
        toast.error("Maximálně 3 zástupci!");
      }
      return next;
    });
  };

  const handleSubmitSelection = async () => {
    if (selected.size === 0) { toast.error("Vyberte alespoň jednoho atleta"); return; }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("games-qualify", {
        body: {
          session_id: sessionId, player_name: playerName, festival_id: festivalId,
          action: "select", selected_student_ids: Array.from(selected),
        },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success(`🏅 Nominováno ${data.count} atletů na Velké hry!`);
      setAlreadyNominated(true);
      onComplete();
    } catch (e: any) {
      toast.error(e.message || "Chyba");
    } finally {
      setSubmitting(false);
    }
  };

  if (alreadyNominated) {
    return (
      <Card className="border-green-500/30 bg-green-500/5">
        <CardContent className="p-6 text-center">
          <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-2" />
          <p className="text-sm font-display font-semibold">Nominace odeslána!</p>
          <p className="text-xs text-muted-foreground mt-1">Vaši atleti byli úspěšně nominováni na Velké hry.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-card/50">
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-sm flex items-center gap-2">
          <Flag className="h-4 w-4 text-primary" />
          Národní kvalifikace
        </CardTitle>
        <p className="text-[10px] text-muted-foreground">
          Spusťte kvalifikaci — vaši absolventi se utkají v soutěžích. Z výsledků vyberte max. 3 zástupce pro Velké hry.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!simulated ? (
          <Button onClick={handleSimulate} disabled={simulating} className="w-full font-display gap-2">
            {simulating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            {simulating ? "Probíhá kvalifikace..." : "Spustit národní kvalifikaci"}
          </Button>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs font-display font-semibold">
                Výsledky kvalifikace ({results.length} atletů)
              </p>
              <Badge variant="outline" className="text-[9px]">
                Vybráno: {selected.size}/3
              </Badge>
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {results.map((r) => {
                const isSelected = selected.has(r.student_id);
                return (
                  <Card
                    key={r.student_id}
                    className={`cursor-pointer transition-all ${isSelected ? "ring-2 ring-primary border-primary/50 bg-primary/5" : "border-border bg-card/50 hover:bg-card/70"}`}
                    onClick={() => handleToggleSelect(r.student_id)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        {/* Portrait */}
                        {r.portrait_url ? (
                          <img
                            src={r.portrait_url}
                            alt={r.student_name}
                            className="w-12 h-12 rounded-full object-cover border border-border shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-muted/30 border border-border shrink-0 flex items-center justify-center">
                            <Users className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-mono text-sm font-bold text-muted-foreground">#{r.rank}</span>
                            <span className="font-display text-xs font-semibold truncate">{r.student_name}</span>
                            <Badge variant="outline" className="text-[7px]">{r.specialty}</Badge>
                            {isSelected && (
                              <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                            )}
                          </div>

                          <p className="text-[9px] text-muted-foreground">{r.academy_name}</p>
                          {r.bio && <p className="text-[9px] text-muted-foreground mt-0.5 italic">{r.bio}</p>}

                          <div className="flex gap-0.5 mt-1">
                            <StatPill label="S" value={r.strength} />
                            <StatPill label="V" value={r.endurance} />
                            <StatPill label="O" value={r.agility} />
                            <StatPill label="T" value={r.tactics} />
                            <StatPill label="C" value={r.charisma} />
                          </div>

                          {r.traits.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {r.traits.map((t, i) => (
                                <Badge key={i} variant="outline" className="text-[7px]">{t}</Badge>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <span className="font-mono text-sm font-bold text-primary">{r.totalScore.toFixed(1)}</span>
                          <p className="text-[8px] text-muted-foreground">celkem</p>
                        </div>
                      </div>

                      {/* Discipline breakdown */}
                      {r.disciplines && r.disciplines.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap gap-1">
                          {r.disciplines.map((d, i) => (
                            <span key={i} className="text-[8px] font-mono text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">
                              {d.discipline_key}: {d.score.toFixed(1)}
                            </span>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Button
              onClick={handleSubmitSelection}
              disabled={submitting || selected.size === 0}
              className="w-full font-display gap-2"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
              Nominovat {selected.size} atletů na Velké hry
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default NationalQualificationPanel;
